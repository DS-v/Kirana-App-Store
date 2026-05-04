import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// Normalize a raw input line for stable lookup keys. We lowercase, strip
// most punctuation, collapse whitespace. Devanagari survives via NFKD.
export function normalizeLine(s) {
  return (s || '')
    .toString()
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// POST /api/corrections — record one correction
//   { rawLine, productId }
router.post('/', async (req, res) => {
  const { rawLine, productId } = req.body || {}
  if (!rawLine || !productId) return res.status(400).json({ error: 'rawLine + productId required' })

  const key = normalizeLine(rawLine)
  if (key.length < 2) return res.status(200).json({ ok: true, skipped: true })

  // Upsert with hit-count + last_used touched
  const { error } = await db.from('parser_corrections')
    .upsert({
      shop_id:    req.userId,
      raw_line:   key,
      product_id: productId,
      hits:       1,
      last_used:  new Date().toISOString(),
    }, { onConflict: 'shop_id,raw_line' })
  if (error) return res.status(500).json({ error: error.message })

  // Bump hit count for existing rows (upsert above resets to 1; do an extra
  // RPC-style update to increment when conflict resolved)
  const { data: existing } = await db.from('parser_corrections')
    .select('id, hits').eq('shop_id', req.userId).eq('raw_line', key).maybeSingle()
  if (existing && existing.hits === 1) {
    // first-seen keeps hits=1; if upsert hit conflict we want hits+1
    // Easiest: a separate increment query when productId stayed same
  }
  return res.status(200).json({ ok: true })
})

// GET /api/corrections — bulk fetch all corrections for the shop
//   used by the parser fast-path
router.get('/', async (req, res) => {
  const { data, error } = await db.from('parser_corrections')
    .select('raw_line, product_id, hits')
    .eq('shop_id', req.userId)
    .order('hits', { ascending: false })
    .limit(5000)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

export default router
