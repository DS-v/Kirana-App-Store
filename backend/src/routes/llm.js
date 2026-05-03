/**
 * llm.js — LLM-powered order parsing endpoint
 *
 * POST /api/llm/parse-order
 * Body: { message: string, catalog: Array<{id, name, aliases, unit, price}> }
 * Returns: { items, unrecognised, source }
 *
 * Chain: Groq (llama-3.3-70b) → Gemini 1.5 Flash → 400 (let client fall back to rule-based)
 *
 * The catalog is sent as a compact JSON array (name + id only) so it fits comfortably
 * in the 8k context window of the smaller models.
 * The LLM is asked to return ONLY valid JSON — no markdown fences, no explanation.
 */

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildPrompt(message, catalog) {
  // Send only id + name + aliases to keep token count low
  const slim = catalog.map(p => ({
    id: p.id,
    name: p.name,
    ...(p.aliases?.length ? { aliases: p.aliases } : {}),
  }))

  return `You are a kirana (Indian grocery) order parser. The shopkeeper receives orders in Hindi, English, or Hinglish (a mix). Your job is to extract the list of items from the customer's message and match each item to the shop's catalog.

CATALOG (JSON):
${JSON.stringify(slim)}

CUSTOMER MESSAGE:
"""
${message}
"""

OUTPUT RULES:
- Reply ONLY with a JSON object. No markdown, no explanation.
- Schema: { "items": [...], "unrecognised": [...] }
- Each matched item: { "productId": "<catalog id>", "productName": "<catalog name>", "qty": <number>, "unit": "<unit string or null>" }
- Each unrecognised line: { "originalLine": "<raw text>", "qty": <number> }
- qty defaults to 1 if not stated.
- Match flexibly: "do maggi" = qty 2, product Maggi; "ek kilo atta" = qty 1, unit kg, product Atta.
- If a product cannot be found in the catalog at all, add it to unrecognised.
- Do NOT invent products not in the catalog.`
}

// ── Groq caller ────────────────────────────────────────────────────────────────

async function callGroq(message, catalog) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // llama-3.1-8b-instant: free tier, 20k TPM (3× higher than 70B), ~300 ms p50
      // Fully capable for short structured extraction tasks like order parsing
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: buildPrompt(message, catalog) }],
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const raw  = data.choices?.[0]?.message?.content
  return JSON.parse(raw)
}

// ── Gemini caller ──────────────────────────────────────────────────────────────

async function callGemini(message, catalog) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  const prompt = buildPrompt(message, catalog)
  // gemini-2.0-flash-lite: cheapest Gemini model, free tier, excellent Hindi
  const url    = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text
  // Gemini sometimes wraps in ```json ... ``` despite responseMimeType
  const clean = raw?.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
  return JSON.parse(clean)
}

// ── Response validator ─────────────────────────────────────────────────────────

function validateResult(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('LLM returned non-object')
  const items        = Array.isArray(obj.items)        ? obj.items        : []
  const unrecognised = Array.isArray(obj.unrecognised) ? obj.unrecognised : []

  // Coerce each item to expected shape
  const safeItems = items.map(it => ({
    productId:    String(it.productId   || ''),
    productName:  String(it.productName || ''),
    qty:          Number(it.qty)  || 1,
    unit:         it.unit ? String(it.unit) : null,
  })).filter(it => it.productId && it.productName)

  const safeUnrecognised = unrecognised.map(u => ({
    originalLine: String(u.originalLine || ''),
    qty:          Number(u.qty) || 1,
  })).filter(u => u.originalLine)

  return { items: safeItems, unrecognised: safeUnrecognised }
}

// ── Route ──────────────────────────────────────────────────────────────────────

router.post('/parse-order', async (req, res) => {
  const { message, catalog = [] } = req.body

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }
  if (!Array.isArray(catalog)) {
    return res.status(400).json({ error: 'catalog must be an array' })
  }

  // Attempt Groq first
  try {
    const raw    = await callGroq(message, catalog)
    const result = validateResult(raw)
    return res.json({ ...result, source: 'groq' })
  } catch (groqErr) {
    console.warn('[LLM] Groq failed:', groqErr.message)
  }

  // Fall back to Gemini
  try {
    const raw    = await callGemini(message, catalog)
    const result = validateResult(raw)
    return res.json({ ...result, source: 'gemini' })
  } catch (geminiErr) {
    console.warn('[LLM] Gemini failed:', geminiErr.message)
  }

  // Both LLMs failed — return 503 so the client falls back to rule-based parser
  return res.status(503).json({ error: 'LLM unavailable — use rule-based fallback' })
})

export default router
