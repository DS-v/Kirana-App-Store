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
import db from '../db.js'
import { embed } from '../embeddings.js'
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
  return `You parse a kirana customer order against the shop's catalog. Be CONSERVATIVE — when in doubt, mark UNRECOGNISED. Wrong matches and hallucinations are unacceptable.

═══ ABSOLUTE RULES ═══

R0  NO HALLUCINATION. Output entries (items + unrecognised) MUST trace 1-to-1 back to a literal line in the customer message. NEVER add a product the message did not mention, even if it is a typical kirana basket item like sugar, salt, oil, milk, chilli, rice. The output mirrors the input, nothing else.

R1  ONE LINE → ONE OUTPUT. Each customer line produces AT MOST ONE entry, in EITHER \`items\` OR \`unrecognised\` — never both, never duplicated across the two lists.

R2  CONSERVATIVE MATCH. Match ONLY when the catalog product is the same kind of thing the customer wrote. Otherwise UNRECOGNISED.

R3  CATEGORY WALL. FOOD (anda/egg, dudh/milk, atta, dal, namak, cheeni, masala, vegetables, fruits, paneer, ghee, dahi, lassi, ice cream, biscuit, chocolate, chips) NEVER matches NON-FOOD (Band-Aid, soap, shampoo, cream, hair oil, detergent, dishwash, toothpaste, agarbatti, candle, batteries, stationery). Even if names share letters or sizes match.

R4  SIZE vs QTY.  Number+unit (g, gm, kg, ml, L, litre) attached to a product name = size, NOT qty.
       "200g vim bar"     → qty=1
       "garam masala 50g" → qty=1
       "Dettol soap 75g 2"→ qty=2
       "5 anda"           → qty=5 (no unit)
       "do bottle thums"  → qty=2
       "1 kg aata"        → qty=1

R5  REAL IDS ONLY.  productId MUST be an id from the catalog below.

R6  SKIP CHATTER. Greetings, signatures, addresses, payment promises, delivery instructions, dates, phone numbers — do not output anything for these.

═══ HINDI VOCAB (translate first, then look up) ═══

Numbers: ek=1 do=2 teen=3 char=4 paanch=5 chhe=6 saat=7 aath=8 nau=9 das=10
Sizes:   aadha=0.5 (size hint, qty stays 1) · paav/pao=0.25 (size hint, qty stays 1)
Devanagari numbers: एक=1 दो=2 तीन=3 चार=4 पाँच=5 छह=6 सात=7 आठ=8 नौ=9 दस=10

Words → English equivalents:
  dudh/doodh/दूध=milk · anda/अंडा=egg · namak/नमक=salt · cheeni/चीनी=sugar
  chai/चाय=tea · aata/atta/आटा=wheat flour · chawal/चावल=rice · dal/दाल=lentils
  haldi/हल्दी=turmeric · mirch/mirchi=chilli · dhaniya/धनिया=coriander · jeera=cumin
  sabun/साबुन=soap · tel/तेल=cooking oil · paani=water · ghee=ghee · biscuit=biscuit

Brand abbreviations:
  P-G/PG/parleg → Parle-G  (NEVER Britannia Pure Magic / Pure Gold)
  magi/mggi → Maggi
  A milk/amul → Amul (plain milk variant; NEVER Basundi/Lassi/Dahi/Butter/Ghee/Paneer)

═══ FORBIDDEN MATCHES (real failures from prod) ═══

  P-G            → Britannia Pure Magic     ❌ wrong brand → if no Parle-G, UNRECOGNISED
  5 anda         → Band-Aid Flexible        ❌ food ≠ medical → UNRECOGNISED
  egg 6          → Band-Aid 10pc            ❌ food ≠ medical → UNRECOGNISED
  haldi          → L'Oreal Hair Oil         ❌ spice ≠ hair oil → match Turmeric Powder if any
  dhaniya patta  → B Natural Litchi Juice   ❌ herb ≠ juice → if no coriander, UNRECOGNISED
  amul dudh      → Amul Basundi/Lassi/Dahi  ❌ plain milk ≠ flavoured dairy
  Dettol soap    → Dettol Antiseptic Cream  ❌ soap ≠ cream
  200g vim bar   → Vim qty=200              ❌ size as qty (qty must be 1)
  namak 1 kg     → Salt + Atta + Sugar      ❌ ONE line = ONE match
  tomato 1 kg    → Captain Cook Salt 1kg    ❌ tomato ≠ salt → UNRECOGNISED
  any line       → product not in message   ❌ NEVER hallucinate

═══ POSITIVE EXAMPLES (DO match these) ═══

  haldi / haldi powder / ek pao haldi / हल्दी
      → "Turmeric" or "Haldi" product, qty=1

  ek kg aata / 1 kg atta / आटा
      → any "Atta" product (Aashirvaad / Shakti / Nature Fresh), qty=1
        Pick the closest size (1kg variant if available)

  garam masala / garam masala 50g
      → any "Garam Masala" product, qty=1 (the 50g is size, not qty)

  do bottle thums up / thums up 2
      → any "Thums Up" product, qty=2

CATALOG (real product IDs only):
${JSON.stringify(catalog)}

CUSTOMER MESSAGE:
"""
${message}
"""

Reply with ONLY valid JSON, no markdown, no explanation.
Each entry MUST trace back to a literal line in the customer message.
{
  "items": [{ "productId": "<id>", "productName": "<name>", "qty": <number>, "unit": "<unit or null>" }],
  "unrecognised": [{ "originalLine": "<exact text from message>", "qty": <number> }]
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

// ── Deterministic post-processors ─────────────────────────────────────────────
// The LLM gets us 95-97 % of the way there; these passes handle the long tail
// without prompt fiddling. Order matters — each builds on the previous.

// Lines we never want as items or unrecognised — pure chatter.
const CHATTER_RE = /^(hi|hello|namaste|namaskar|namaste 🙏|🙏|thanks|thank.*you|dhanyawaad|dhanyawad|regards|sharma ji|see you|bye|kal|abhi|baad|delivery|deliver|please|pls|paisa|payment|kal de.*g[au]|cash|upi)/i
const PHONE_RE   = /^[+\s\d\-]{8,}$/
const DATE_RE    = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/

function isNotChatter(line) {
  if (!line) return false
  const trimmed = line.trim()
  if (trimmed.length < 2) return false
  if (CHATTER_RE.test(trimmed)) return false
  if (PHONE_RE.test(trimmed))   return false
  if (DATE_RE.test(trimmed))    return false
  // Lines that are JUST a greeting/closing emoji
  if (/^[🙏👍🙂😊🤝]+$/.test(trimmed)) return false
  return true
}

// Tokenise, keep alpha tokens >2 chars. Catches words across hi/eng/Devanagari.
function tokensOf(s) {
  return (s || '').toLowerCase()
    .normalize('NFKD')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 2)
}

function fuzzyOverlap(a, b) {
  const A = new Set(tokensOf(a))
  const B = new Set(tokensOf(b))
  for (const t of A) if (B.has(t)) return true
  return false
}

// Build a lookup so we can check aliases for an item (handles Hinglish:
// magi→Maggi, aata→atta, namak→Salt, dudh→Milk, etc).
function indexCatalog(catalog) {
  const idx = new Map()
  for (const p of catalog || []) {
    const text = [p.name, ...(p.aliases || [])].join(' ')
    idx.set(p.id, text)
  }
  return idx
}

// 1. Phantom-killer: items whose product name+aliases share NO meaningful
//    token with any non-chatter input line are hallucinations. We use aliases
//    so "Maggi Noodles" (alias: magi) survives input "magi 3".
function dropPhantoms(parsed, message, catalogIdx) {
  const lines = message.split('\n').filter(isNotChatter)
  parsed.items = parsed.items.filter(it => {
    const haystack = catalogIdx.get(it.productId) || it.productName
    return lines.some(line => fuzzyOverlap(haystack, line))
  })
  return parsed
}

// 2. Deduplicate across lists: an unrecognised line that shares a meaningful
//    token with a successfully-matched product name is almost always the same
//    physical line counted twice (LLM emitted both). Drop the unrecognised side.
function dedupAcrossLists(parsed) {
  parsed.unrecognised = parsed.unrecognised.filter(u =>
    !parsed.items.some(it => fuzzyOverlap(it.productName, u.originalLine))
  )
  return parsed
}

// 3. Food / non-food guard. If the customer line is clearly food and the
//    matched product is clearly non-food (or vice versa), drop the match and
//    re-route the line into unrecognised. Catches the egg→Band-Aid family.
const FOOD_WORDS = /\b(anda|egg|dudh|doodh|milk|atta|aata|flour|dal|namak|salt|cheeni|chini|sugar|chai|tea|chawal|rice|haldi|turmeric|mirch|chilli|dhaniya|jeera|cumin|garam.?masala|masala|ghee|paneer|dahi|curd|lassi|biscuit|chocolate|chips|maggi|noodles|bread|paav|pav|tomato|onion|aloo|potato|chicken|fish|fruit|fruits|sabzi|vegetable|paani|water|juice|coke|pepsi|thums|sprite|fanta|cola|sauce|jam|honey|achar|pickle)\b/i
const NONFOOD_WORDS = /\b(band.?aid|bandage|crocin|antiseptic|cream|lotion|shampoo|soap|sabun|hair.?oil|toothpaste|toothbrush|detergent|surf|vim|dishwash|phenyl|harpic|toilet|sanitizer|tissue|battery|matchbox|agarbatti|candle|incense|wipes)\b/i

function classify(text) {
  const t = (text || '').toLowerCase()
  if (FOOD_WORDS.test(t))    return 'food'
  if (NONFOOD_WORDS.test(t)) return 'nonfood'
  return 'unknown'
}

function foodCategoryGuard(parsed, message, catalogIdx) {
  const lines = message.split('\n').filter(isNotChatter)
  parsed.items = parsed.items.filter(it => {
    const haystack = catalogIdx.get(it.productId) || it.productName
    const productClass = classify(haystack)
    if (productClass === 'unknown') return true
    // Find the source line by token overlap (using aliases too).
    const sourceLine = lines.find(line => fuzzyOverlap(haystack, line))
    // If no source line is identifiable but the line set has ANY food line and
    // the product is non-food (or vice versa), still apply guard via classify.
    const checkLines = sourceLine ? [sourceLine] : lines
    for (const line of checkLines) {
      const lineClass = classify(line)
      if (lineClass !== 'unknown' && lineClass !== productClass &&
          (sourceLine || classify(haystack) === 'nonfood')) {
        return false
      }
    }
    return true
  })
  return parsed
}

// 4. Line-coverage: every non-chatter input line must end up SOMEWHERE
//    (items or unrecognised). Recovers lines the LLM silently skipped.
function ensureLineCoverage(parsed, message, catalogIdx) {
  const lines = message.split('\n').filter(isNotChatter)
  const accountedFor = new Set()

  for (const it of parsed.items) {
    const haystack = catalogIdx.get(it.productId) || it.productName
    const sourceLine = lines.find(line =>
      !accountedFor.has(line) && fuzzyOverlap(haystack, line)
    )
    if (sourceLine) {
      accountedFor.add(sourceLine)
      it.sourceLine = sourceLine.trim()  // surface to UI for "from: …" caption
    }
  }
  for (const u of parsed.unrecognised) {
    const sourceLine = lines.find(line =>
      !accountedFor.has(line) &&
      (line.trim() === u.originalLine.trim() || fuzzyOverlap(line, u.originalLine))
    )
    if (sourceLine) accountedFor.add(sourceLine)
  }

  for (const line of lines) {
    if (!accountedFor.has(line)) {
      const trimmed = line.trim()
      const qtyMatch = trimmed.match(/(\d+(?:\.\d+)?)/)
      parsed.unrecognised.push({
        originalLine: trimmed,
        qty: qtyMatch ? parseFloat(qtyMatch[1]) : 1,
      })
      accountedFor.add(line)
    }
  }
  return parsed
}

function postProcess(parsed, message, catalog = []) {
  const catalogIdx = indexCatalog(catalog)
  parsed = foodCategoryGuard(parsed, message, catalogIdx)
  parsed = dropPhantoms(parsed, message, catalogIdx)
  parsed = dedupAcrossLists(parsed)
  parsed = ensureLineCoverage(parsed, message, catalogIdx)
  return parsed
}

// ── Route: text order parsing ──────────────────────────────────────────────────

// Active-learning fast-path. Looks up each input line in
// parser_corrections; lines with a hit skip the LLM entirely and use the
// remembered product directly.
function normalizeForLookup(s) {
  return (s || '').toString().normalize('NFKD').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function extractQty(line) {
  const m = line.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 1
}

async function applyCorrections(message, shopId, catalog) {
  const lines = message.split('\n')
  const inputLines = lines.map(l => l.trim()).filter(isNotChatter)
  if (!inputLines.length || !shopId) return { items: [], residualLines: lines }

  const { data, error } = await db.from('parser_corrections')
    .select('raw_line, product_id')
    .eq('shop_id', shopId)
    .limit(5000)
  if (error || !data?.length) return { items: [], residualLines: lines }

  const lookup = new Map(data.map(c => [c.raw_line, c.product_id]))
  const productById = new Map(catalog.map(p => [p.id, p]))

  const items = []
  const residualLines = []
  const usedIds = []

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!isNotChatter(trimmed)) { residualLines.push(raw); continue }
    const key = normalizeForLookup(trimmed)
    const productId = lookup.get(key)
    const product = productId && productById.get(productId)
    if (product) {
      items.push({
        productId:  product.id,
        productName: product.name,
        qty:        extractQty(trimmed),
        unit:       product.unit || null,
        sourceLine: trimmed,
      })
      usedIds.push(product.id)
    } else {
      residualLines.push(raw)
    }
  }

  // Touch last_used + bump hits for the corrections we used
  if (usedIds.length) {
    db.rpc('touch_corrections', { p_shop: shopId, p_ids: usedIds })
      .then(() => {}).catch(() => {})  // fire-and-forget
  }

  return { items, residualLines }
}

// Vector pre-filter: replace the full catalog with only the top-k products
// most semantically similar to the customer's message. Drops prompt size
// from O(catalog) to O(15) regardless of how big the shop is. If pgvector
// isn't populated yet, returns the full catalog unchanged.
async function vectorPreFilter(message, shopId, fullCatalog, topK = 30) {
  if (!fullCatalog.length) return fullCatalog
  try {
    const queryVec = await embed(message.slice(0, 2000))   // cap input
    const { data, error } = await db.rpc('match_products', {
      p_shop:      shopId,
      p_embedding: queryVec,
      p_top_k:     topK,
    })
    if (error || !data?.length) return fullCatalog
    // The RPC returns a subset of fields; reshape to match catalog shape
    return data.map(p => ({
      id:      p.id,
      name:    p.name,
      unit:    p.unit,
      aliases: p.aliases || [],
    }))
  } catch (e) {
    console.warn('[LLM] vector pre-filter unavailable, using full catalog:', e.message)
    return fullCatalog
  }
}

router.post('/parse-order', async (req, res) => {
  const { message, catalog = [] } = req.body
  if (!message || typeof message !== 'string')
    return res.status(400).json({ error: 'message is required' })

  // 1. Active-learning fast-path. Lines with remembered corrections never
  //    hit the LLM. Saves latency + tokens on every repeat order.
  let preItems = []
  let llmInput = message
  try {
    const { items: preMatched, residualLines } = await applyCorrections(message, req.userId, catalog)
    preItems = preMatched
    if (preMatched.length) {
      llmInput = residualLines.join('\n').trim()
    }
  } catch (e) { console.warn('[LLM] correction lookup failed:', e.message) }

  // 2. Vector pre-filter. Send only the top-30 semantically-similar products
  //    to the LLM rather than the full 1000+. Big precision + latency win.
  const focusCatalog = await vectorPreFilter(llmInput, req.userId, catalog, 30)

  // If everything resolved from corrections, short-circuit.
  if (preItems.length && !llmInput.trim()) {
    return res.json({
      items: preItems,
      unrecognised: [],
      source: 'corrections',
      preMatched: preItems.length,
    })
  }

  function mergeAndPostProcess(llmResult) {
    const merged = {
      items:        [...preItems, ...llmResult.items],
      unrecognised: llmResult.unrecognised,
    }
    return postProcess(merged, message, catalog)
  }

  try {
    return res.json({
      ...mergeAndPostProcess(validate(await callGroq(llmInput, focusCatalog))),
      source: 'groq',
      preMatched: preItems.length,
    })
  } catch (e) { console.warn('[LLM] Groq text failed:', e.message) }

  try {
    return res.json({
      ...mergeAndPostProcess(validate(await callGemini(llmInput, focusCatalog))),
      source: 'gemini',
      preMatched: preItems.length,
    })
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
