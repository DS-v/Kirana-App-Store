/**
 * llm.js — AI-powered order parsing (text + image)
 *
 * POST /api/llm/parse-order   — text message → structured items
 * POST /api/llm/parse-image   — image (base64) → structured items (vision)
 *
 * Chain for text:  Groq llama-3.1-8b-instant → Gemini 2.0 Flash Lite → 503
 * Chain for image: Groq llama-4-scout (vision) → Gemini 2.0 Flash Lite → 503
 *
 * Both endpoints do TRUE semantic matching — the model understands intent,
 * brand associations, Hindi/Hinglish/Devanagari, vague references, and
 * size/variant hints rather than relying on string similarity.
 */

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// ── Shared catalog builder ─────────────────────────────────────────────────────

function slimCatalog(catalog) {
  return catalog.map(p => ({
    id:   p.id,
    name: p.name,
    ...(p.aliases?.length ? { aliases: p.aliases } : {}),
    ...(p.unit ? { unit: p.unit } : {}),
  }))
}

// ── Text order prompt ──────────────────────────────────────────────────────────

function buildTextPrompt(message, catalog) {
  return `You parse a kirana customer's order (Hindi / English / Hinglish) against the shop's catalog. Be CONSERVATIVE: when in doubt, mark UNRECOGNISED. A wrong match is worse than no match.

═══ HARD RULES — DO NOT VIOLATE ═══

1. ONE LINE → ONE OUTPUT.
   Each line in the customer message produces AT MOST ONE entry, in EITHER \`items\` OR \`unrecognised\` — never both, never duplicated.

2. NO FORCED / FUZZY MATCHES.
   Match ONLY when the catalog product is unambiguously the same thing the customer asked for. If the catalog has nothing close, mark UNRECOGNISED. Do not pick a product just because it shares letters.

3. CATEGORY / TYPE MUST ALIGN.
   Reject any match where the customer's item and the catalog product are different KINDS:
     milk ≠ basundi / lassi / dahi / yogurt / cream
     soap ≠ cream / lotion / shampoo
     cooking oil ≠ hair oil
     biscuit ≠ chocolate / chips
     turmeric (haldi) ≠ hair oil
     coriander (dhaniya) ≠ juice
     egg ≠ band-aid / bandage
     atta / flour ≠ ready meal

4. SIZE SUFFIX vs QUANTITY.
   A number IMMEDIATELY followed by a weight/volume unit (g, gm, kg, ml, L, litre) attached to a product name is the SIZE / variant — it is part of the product, NOT the qty.
   Examples:
     "200g vim bar"           → qty=1   (size 200g is part of the product variant)
     "vim bar 200g 2"         → qty=2
     "Dettol soap 75g 2"      → qty=2
     "garam masala 50g"       → qty=1
     "haldi 100g"             → qty=1
     "5 anda"                 → qty=5   (no unit — 5 is qty)
     "do bottle thums up"     → qty=2
     "1 kg aata"              → qty=1   (one packet of 1kg atta)
     "2 kg chawal"            → qty=2   (two packets of 1kg, OR 2 of whatever size catalog has)

5. NEVER INVENT IDs.
   \`productId\` MUST be a real id from the supplied catalog. If unsure, omit the item from \`items\` and put the original line in \`unrecognised\`.

6. SKIP CHATTER.
   Greetings, addresses, signatures, payment promises ("paisa kal de dunga"), delivery instructions, dates, phone numbers — drop these silently. They are NOT items.

═══ NEGATIVE EXAMPLES — THESE ARE WRONG ═══

  "P-G 2 packet"        → Britannia Pure Magic     ❌ different brand
  "5 anda"              → Band-Aid Flexible        ❌ egg ≠ bandage
  "haldi powder ek pao" → L'Oreal Hair Oil         ❌ turmeric ≠ hair oil
  "dhaniya patta"       → B Natural Litchi Juice   ❌ coriander ≠ fruit juice
  "amul dudh 2 litre"   → Amul Basundi             ❌ milk ≠ basundi
  "Dettol soap 75g"     → Dettol Antiseptic Cream  ❌ soap ≠ cream
  "200g vim bar"        → Vim Bar qty=200          ❌ size mistaken for qty
  "garam masala 50g"    → product qty=50           ❌ size mistaken for qty

In all the above, the correct answer is either an EXACT match or UNRECOGNISED.

═══ HINDI / HINGLISH VOCABULARY ═══

Numbers:    ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10, gyarah=11, barah=12
Fractions:  aadha/aadhi=0.5, paav/pao/pau=0.25 (so "ek pao" = quarter = 250g, NOT 1 packet)
Devanagari: एक=1 दो=2 तीन=3 चार=4 पाँच=5 छह=6 सात=7 आठ=8 नौ=9 दस=10
Units:      किलो/kilo=kg, ग्राम/gram/gm=g, लीटर/ltr=litre, पैकेट/pkt=packet, बोतल/botal=bottle, पीस/pc=pc

Common Hindi product words (translate first, then look up):
  dudh/doodh/दूध      = milk         |  anda/ande/अंडा   = egg
  namak/नमक           = salt         |  cheeni/चीनी       = sugar
  chai/चाय            = tea          |  aata/atta/आटा    = wheat flour
  chawal/चावल         = rice         |  dal/दाल           = lentils
  haldi/हल्दी          = turmeric     |  mirchi/mirch      = chilli
  dhaniya/धनिया       = coriander    |  jeera/जीरा        = cumin
  sabun/साबुन         = soap         |  tel/तेल            = oil
  paani/पानी          = water        |  biscuit/biskut    = biscuit
  garam masala        = (literal)    |  ghee              = (literal)

Brand abbreviations / nicknames:
  "magi" / "mggi"      → Maggi
  "P-G" / "PG"         → Parle-G  — but only match if catalog actually contains Parle-G. Do NOT match Britannia Pure Magic, Britannia Pure Gold, etc.
  "A milk" / "amul"    → Amul
  "lal wala" / "red one" → match by colour only when catalog has a clear red variant; otherwise UNRECOGNISED.

═══ DEFAULTS ═══

- Quantity defaults to 1 when not specified.
- "thoda/thodi" with no number → quantity is unclear; if the product is otherwise clear, qty=1; else UNRECOGNISED.
- Fractional Hindi quantities ("aadha", "pao") describe SIZE, not qty. Treat them as a size preference, never as qty<1.
  Example: "ek pao haldi" wants 250g of turmeric — match the catalog haldi/turmeric variant closest to 250g, with qty=1. If no haldi in catalog at all, UNRECOGNISED.

═══ SIZE-VARIANT PREFERENCE ═══

When the customer specifies a size and the catalog has multiple variants of the same product:
- Prefer the variant with the matching size.
- If no exact size match, pick the closest size with qty=1.
- Don't multiply qty to compensate (e.g., "200g vim bar" is NOT 2× of a 100g pack).

═══ WORKED EXAMPLE ═══

Catalog (sample):
[
  { "id": "p1", "name": "Maggi Noodles 70g", "unit": "packet" },
  { "id": "p2", "name": "Tata Salt 1kg",     "unit": "kg" },
  { "id": "p3", "name": "Amul Milk 500ml",   "unit": "packet" },
  { "id": "p4", "name": "Vim Bar 200g",      "unit": "bar" }
]

Customer: """
Namaste, bhej dena -
magi 3
namak 1 kg
amul dudh 1
200g vim bar
2 anda
"""

Correct output:
{
  "items": [
    { "productId": "p1", "productName": "Maggi Noodles 70g", "qty": 3, "unit": "packet" },
    { "productId": "p2", "productName": "Tata Salt 1kg",     "qty": 1, "unit": "kg" },
    { "productId": "p3", "productName": "Amul Milk 500ml",   "qty": 1, "unit": "packet" },
    { "productId": "p4", "productName": "Vim Bar 200g",      "qty": 1, "unit": "bar" }
  ],
  "unrecognised": [
    { "originalLine": "2 anda", "qty": 2 }
  ]
}

Note: "200g vim bar" → qty=1 (NOT 200). "2 anda" → unrecognised because no egg in catalog (NOT a wrong product).

CATALOG (JSON, real product IDs only):
${JSON.stringify(slimCatalog(catalog))}

CUSTOMER MESSAGE:
"""
${message}
"""

Reply with ONLY valid JSON — no markdown, no explanation:
{
  "items": [
    { "productId": "<catalog id>", "productName": "<catalog name>", "qty": <number>, "unit": "<unit string or null>" }
  ],
  "unrecognised": [
    { "originalLine": "<text that has no catalog match>", "qty": <number> }
  ]
}`
}

// ── Vision / image prompt ──────────────────────────────────────────────────────

function buildVisionPrompt(catalog) {
  return `You are an expert kirana (Indian grocery store) assistant with perfect OCR ability. This image shows a customer's order — it may be a handwritten slip, a WhatsApp screenshot, or a printed list, in Hindi, English, or Hinglish.

YOUR TASKS:
1. READ every piece of text visible in the image (act as an OCR engine).
2. UNDERSTAND the full intent of each line — not just surface text.
3. MATCH each item to the shop's catalog using semantic understanding:
   - Brand names, Hindi names, abbreviations, and nicknames all count.
   - "M" or "Mggi" → Maggi Noodles; "P-G" or "PG" → Parle-G; "A milk" → Amul Milk.
   - Handwritten shorthand: "2M 3PG" = 2 Maggi, 3 Parle-G.
   - "lal wala tel" = red-labelled oil (match by category + color hint).
   - "50 ka biscuit" = biscuit at ~₹50 price point → find closest catalog match.
4. Extract quantity (default 1), unit if written.
5. If something is genuinely unreadable or has no catalog match → unrecognised.

SEMANTIC MATCHING RULES:
- Hindi/Hinglish numbers: ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10.
- Devanagari: एक=1, दो=2, तीन=3, चार=4, पाँच=5, छह=6, सात=7, आठ=8, नौ=9, दस=10.
- Units: किलो=kg, ग्राम=g, लीटर=litre, पैकेट=packet, बोतल=bottle.
- Never invent products not in the catalog.

CATALOG (JSON):
${JSON.stringify(slimCatalog(catalog))}

Reply with ONLY valid JSON — no markdown, no explanation:
{
  "items": [
    { "productId": "<catalog id>", "productName": "<catalog name>", "qty": <number>, "unit": "<unit or null>" }
  ],
  "unrecognised": [
    { "originalLine": "<unmatched text from image>", "qty": <number> }
  ]
}`
}

// ── Groq — text ───────────────────────────────────────────────────────────────

async function callGroq(message, catalog) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: buildTextPrompt(message, catalog) }],
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return JSON.parse(data.choices[0].message.content)
}

// ── Groq — vision ─────────────────────────────────────────────────────────────

async function callGroqVision(imageBase64, mimeType, catalog, promptOverride) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')

  const prompt = promptOverride ?? buildVisionPrompt(catalog)
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // llama-4-scout: Groq's free-tier vision model (17B MoE, fast, multilingual)
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: prompt },
        ],
      }],
      temperature: 0,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) throw new Error(`Groq vision error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return JSON.parse(data.choices[0].message.content)
}

// ── Gemini — text ─────────────────────────────────────────────────────────────

async function callGemini(message, catalog) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildTextPrompt(message, catalog) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' },
      }),
    }
  )

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim())
}

// ── Gemini — vision ───────────────────────────────────────────────────────────

async function callGeminiVision(imageBase64, mimeType, catalog, promptOverride) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  const prompt = promptOverride ?? buildVisionPrompt(catalog)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }),
    }
  )

  if (!res.ok) throw new Error(`Gemini vision error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim())
}

// ── Response validator ─────────────────────────────────────────────────────────

function validate(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('LLM returned non-object')
  const items = (Array.isArray(obj.items) ? obj.items : [])
    .map(it => ({
      productId:   String(it.productId   || ''),
      productName: String(it.productName || ''),
      qty:         Number(it.qty)  || 1,
      unit:        it.unit ? String(it.unit) : null,
    }))
    .filter(it => it.productId && it.productName)

  const unrecognised = (Array.isArray(obj.unrecognised) ? obj.unrecognised : [])
    .map(u => ({ originalLine: String(u.originalLine || ''), qty: Number(u.qty) || 1 }))
    .filter(u => u.originalLine)

  return { items, unrecognised }
}

// ── Route: text order parsing ──────────────────────────────────────────────────

router.post('/parse-order', async (req, res) => {
  const { message, catalog = [] } = req.body
  if (!message || typeof message !== 'string')
    return res.status(400).json({ error: 'message is required' })

  try {
    return res.json({ ...validate(await callGroq(message, catalog)), source: 'groq' })
  } catch (e) { console.warn('[LLM] Groq text failed:', e.message) }

  try {
    return res.json({ ...validate(await callGemini(message, catalog)), source: 'gemini' })
  } catch (e) { console.warn('[LLM] Gemini text failed:', e.message) }

  return res.status(503).json({ error: 'LLM unavailable' })
})

// ── Catalog extraction prompt (text) ──────────────────────────────────────────

function buildCatalogTextPrompt(text) {
  return `You are an expert Indian grocery (kirana) inventory manager. Extract every product from the content below — it may be a price list, invoice, WhatsApp catalog screenshot, or typed list.

For each product identify:
- name: Full product name including brand and size variant (e.g. "Amul Butter 100g", "Parle-G Biscuit 200g")
- price: Selling price / MRP as a plain number (0 if absent)
- unit: ONE of exactly: kg, g, litre, ml, packet, pc, box, dozen, bar, bottle
- category: ONE of exactly: Khaana, Snacks, Ghar, Other

RULES:
- Understand semantics: "P-G" = Parle-G, "Mggi" = Maggi, "A milk" = Amul Milk.
- Size suffixes (500g, 1kg, 200ml) are PART of the product name, NOT prices.
- Price is a standalone number at line-end or after ₹/Rs/MRP.
- SKIP: serial numbers (S.No, Sr), headings (Item, Price, Unit), totals, grand total, GST, CGST, SGST, invoice number, date, address, phone numbers, signatures.
- If a line has no identifiable product name, skip it entirely.
- Never include row numbers or index numbers in the name.
- Category guide:
  Khaana: groceries / food / drinks — atta, flour, rice, dal, salt, sugar, oil, ghee, milk, curd, butter, paneer, cheese, dahi, tea, coffee, juice, cold drink, pepsi, coke, sprite, chai, horlicks, boost, bournvita, masala, spice, sauce, jam, honey
  Snacks: chips, lays, kurkure, namkeen, bhujia, popcorn, mixture, peanuts, biscuit, parle-g, marie, oreo, cookie, cracker, maggi, noodles, pasta, yippee, chocolate, kitkat, dairy milk
  Ghar: household / personal care — soap, detergent, surf, vim, phenyl, rin, harpic, dettol, sanitizer, shampoo, toothpaste, brush, candle, agarbatti
  Other: anything that does not clearly fit

CONTENT:
"""
${text}
"""

Reply with ONLY valid JSON — no markdown, no explanation:
{ "products": [ { "name": "...", "price": 0, "unit": "packet", "category": "Other" } ] }`
}

// ── Catalog extraction prompt (vision) ────────────────────────────────────────

function buildCatalogVisionPrompt() {
  return `You are an expert Indian grocery (kirana) inventory manager with perfect OCR ability. This image shows a product catalog, price list, or inventory sheet — it may be handwritten, printed, or a WhatsApp screenshot.

YOUR TASKS:
1. READ all visible text in the image (act as OCR).
2. EXTRACT every product entry with its price, unit, and category.
3. UNDERSTAND abbreviations and brand shortcuts: "P-G" = Parle-G, "Mggi" = Maggi, "A Milk" = Amul Milk, "Surf" = Surf Excel.

For each product:
- name: Full name including brand and size (e.g. "Amul Butter 100g")
- price: Selling price as a number (0 if not readable)
- unit: ONE of: kg, g, litre, ml, packet, pc, box, dozen, bar, bottle
- category: ONE of: Khaana, Snacks, Ghar, Other

RULES:
- Size like "500g" or "1kg" is part of the product name, NOT the price.
- SKIP: serial numbers, column headers, totals, GST lines, dates, addresses.
- Category guide:
  Khaana: groceries / food / drinks — atta, flour, rice, dal, salt, sugar, oil, ghee, milk, curd, butter, paneer, dahi, tea, coffee, juice, pepsi, coke, horlicks, bournvita, masala
  Snacks: chips, lays, kurkure, namkeen, bhujia, biscuit, parle-g, marie, oreo, cookie, maggi, noodles, pasta, yippee, chocolate
  Ghar: household / personal care — soap, detergent, surf, vim, dettol, harpic, shampoo, toothpaste
  Other: anything else

Reply with ONLY valid JSON — no markdown:
{ "products": [ { "name": "...", "price": 0, "unit": "packet", "category": "Other" } ] }`
}

// ── Catalog: validate response ────────────────────────────────────────────────

const VALID_UNITS = ['kg','g','litre','ml','packet','pc','box','dozen','bar','bottle']
const VALID_CATS  = ['Khaana','Snacks','Ghar','Other']

function validateCatalog(obj) {
  if (!obj || !Array.isArray(obj.products)) throw new Error('LLM returned unexpected shape')
  return obj.products
    .map(p => ({
      name:     String(p.name     || '').trim(),
      price:    Math.max(0, Number(p.price) || 0),
      unit:     VALID_UNITS.includes(p.unit) ? p.unit : 'packet',
      category: VALID_CATS.includes(p.category) ? p.category : 'Other',
    }))
    .filter(p => p.name.length >= 2)
}

// ── Route: catalog extraction from text ───────────────────────────────────────

router.post('/parse-catalog', async (req, res) => {
  const { text, imageBase64, mimeType = 'image/jpeg' } = req.body

  if (!text && !imageBase64)
    return res.status(400).json({ error: 'text or imageBase64 is required' })

  // ── Image path ─────────────────────────────────────────────────────────────
  if (imageBase64) {
    try {
      const raw = await callGroqVision(imageBase64, mimeType, null, buildCatalogVisionPrompt())
      return res.json({ products: validateCatalog(raw), source: 'groq-vision' })
    } catch (e) { console.warn('[LLM] Groq catalog vision failed:', e.message) }

    try {
      const raw = await callGeminiVision(imageBase64, mimeType, null, buildCatalogVisionPrompt())
      return res.json({ products: validateCatalog(raw), source: 'gemini-vision' })
    } catch (e) { console.warn('[LLM] Gemini catalog vision failed:', e.message) }

    return res.status(503).json({ error: 'Vision LLM unavailable' })
  }

  // ── Text path ──────────────────────────────────────────────────────────────
  const prompt = buildCatalogTextPrompt(text)

  try {
    const key = process.env.GROQ_API_KEY
    if (!key) throw new Error('GROQ_API_KEY not set')
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0, max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    })
    if (!r.ok) throw new Error(`Groq ${r.status}`)
    const d = await r.json()
    return res.json({ products: validateCatalog(JSON.parse(d.choices[0].message.content)), source: 'groq' })
  } catch (e) { console.warn('[LLM] Groq catalog text failed:', e.message) }

  try {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY not set')
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
        }),
      }
    )
    if (!r.ok) throw new Error(`Gemini ${r.status}`)
    const d   = await r.json()
    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return res.json({ products: validateCatalog(JSON.parse(raw.replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim())), source: 'gemini' })
  } catch (e) { console.warn('[LLM] Gemini catalog text failed:', e.message) }

  return res.status(503).json({ error: 'LLM unavailable' })
})

// ── Route: image / vision order parsing ───────────────────────────────────────

router.post('/parse-image', async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg', catalog = [] } = req.body
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' })

  try {
    return res.json({ ...validate(await callGroqVision(imageBase64, mimeType, catalog)), source: 'groq-vision' })
  } catch (e) { console.warn('[LLM] Groq vision failed:', e.message) }

  try {
    return res.json({ ...validate(await callGeminiVision(imageBase64, mimeType, catalog)), source: 'gemini-vision' })
  } catch (e) { console.warn('[LLM] Gemini vision failed:', e.message) }

  return res.status(503).json({ error: 'Vision LLM unavailable' })
})

export default router
