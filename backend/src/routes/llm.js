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
  return `You are an expert kirana (Indian grocery store) assistant. A customer sent an order in Hindi, English, or Hinglish. Understand its full meaning and match every item to the shop's catalog.

SEMANTIC MATCHING RULES:
- Match by MEANING, not just spelling. "amul wala doodh" → Amul Milk product.
- Understand brand shortcuts: "lal wala" (red one), "chhota/bada wala" (small/large size), "50 wala" (₹50 pack), "family pack" → find the best catalog match.
- Resolve vague references: "woh biscuit" / "voh waali" → pick the most likely catalog item.
- Hindi/Hinglish numbers: ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10, gyarah=11, barah=12, aadha=0.5, paav=0.25.
- Devanagari numbers: एक=1, दो=2, तीन=3, चार=4, पाँच=5, छह=6, सात=7, आठ=8, नौ=9, दस=10.
- Quantity words: "thoda/thodi"=1, "zyada"=2, "bahut/kaafi"=3, "do-teen"=2.
- Units: किलो/kilo=kg, ग्राम/gram/gm=g, लीटर/ltr/litre=litre, पैकेट/pkt/packet=packet, बोतल/botal=bottle, पीस/pc/pcs=pc.
- If multiple catalog items match (e.g. "biscuit" when 3 biscuits exist), pick the most generic/popular one.
- If an item genuinely has no catalog match, add to unrecognised — never invent products.
- Ignore greetings, signatures, dates, and irrelevant lines.

CATALOG (JSON):
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
- category: ONE of exactly: Staples, Dairy, Biscuits, Snacks, Noodles, Beverages, Household, Other

RULES:
- Understand semantics: "P-G" = Parle-G, "Mggi" = Maggi, "A milk" = Amul Milk.
- Size suffixes (500g, 1kg, 200ml) are PART of the product name, NOT prices.
- Price is a standalone number at line-end or after ₹/Rs/MRP.
- SKIP: serial numbers (S.No, Sr), headings (Item, Price, Unit), totals, grand total, GST, CGST, SGST, invoice number, date, address, phone numbers, signatures.
- If a line has no identifiable product name, skip it entirely.
- Never include row numbers or index numbers in the name.
- Category guide:
  Staples: atta, flour, rice, dal, salt, sugar, oil, ghee, maida, besan, rava, poha
  Dairy: milk, curd, butter, paneer, cheese, cream, amul, dahi, lassi
  Biscuits: biscuit, parle-g, marie, bourbon, oreo, cookie, cracker, digestive
  Noodles: maggi, noodles, pasta, yippee, top ramen
  Snacks: chips, lays, kurkure, namkeen, bhujia, popcorn, mixture, peanuts
  Beverages: tea, coffee, juice, cold drink, pepsi, coke, sprite, chai, horlicks, boost, bournvita
  Household: soap, detergent, surf, vim, phenyl, rin, ariel, harpic, dettol, sanitizer, lizol

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
- category: ONE of: Staples, Dairy, Biscuits, Snacks, Noodles, Beverages, Household, Other

RULES:
- Size like "500g" or "1kg" is part of the product name, NOT the price.
- SKIP: serial numbers, column headers, totals, GST lines, dates, addresses.
- Category guide:
  Staples: atta, flour, rice, dal, salt, sugar, oil, ghee
  Dairy: milk, curd, butter, paneer, amul, dahi
  Biscuits: biscuit, parle-g, marie, oreo, cookie
  Noodles: maggi, noodles, pasta, yippee
  Snacks: chips, lays, kurkure, namkeen, bhujia
  Beverages: tea, coffee, juice, pepsi, coke, horlicks, bournvita
  Household: soap, detergent, surf, vim, dettol, harpic

Reply with ONLY valid JSON — no markdown:
{ "products": [ { "name": "...", "price": 0, "unit": "packet", "category": "Other" } ] }`
}

// ── Catalog: validate response ────────────────────────────────────────────────

const VALID_UNITS = ['kg','g','litre','ml','packet','pc','box','dozen','bar','bottle']
const VALID_CATS  = ['Staples','Dairy','Biscuits','Snacks','Noodles','Beverages','Household','Other']

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
