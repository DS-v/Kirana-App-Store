// Backfill / refresh product embeddings for the current shop.
//   POST /api/embeddings/backfill   embed every product without an embedding
//
// Idempotent. Safe to call after any catalog import.

import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { embedBatch } from '../embeddings.js'

const router = Router()
router.use(requireAuth)

const BATCH = 50   // Gemini supports up to 100; keep some headroom

router.post('/backfill', async (req, res) => {
  try {
    const { data: pending, error } = await db.from('products')
      .select('id, name, aliases, category')
      .eq('shop_id', req.userId)
      .is('embedding', null)
      .order('name')
      .range(0, 49999)
    if (error) return res.status(500).json({ error: error.message })

    if (!pending?.length) return res.json({ embedded: 0, total: 0 })

    let done = 0
    for (let i = 0; i < pending.length; i += BATCH) {
      const slice = pending.slice(i, i + BATCH)
      const texts = slice.map(p => buildEmbeddingText(p))
      const vecs  = await embedBatch(texts)

      // Bulk upsert one at a time — Supabase doesn't have a clean way
      // to do mass upserts on subset of columns
      for (let j = 0; j < slice.length; j++) {
        const { error: e } = await db.from('products')
          .update({ embedding: vecs[j] })
          .eq('id', slice[j].id)
        if (!e) done++
      }
    }
    res.json({ embedded: done, total: pending.length })
  } catch (e) {
    console.error('[embeddings/backfill]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Single-product embedding refresh (called after add / edit)
router.post('/product/:id', async (req, res) => {
  try {
    const { data: p, error } = await db.from('products')
      .select('id, name, aliases, category')
      .eq('id', req.params.id)
      .eq('shop_id', req.userId)
      .single()
    if (error || !p) return res.status(404).json({ error: 'not found' })

    const [vec] = await embedBatch([buildEmbeddingText(p)])
    await db.from('products').update({ embedding: vec }).eq('id', p.id)
    res.json({ ok: true })
  } catch (e) {
    console.error('[embeddings/product]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Compose the text we embed for a product. Including aliases captures the
// Hindi/Hinglish variants so 'magi' matches 'Maggi'.
function buildEmbeddingText(p) {
  const parts = [p.name]
  if (p.aliases?.length) parts.push(...p.aliases)
  if (p.category)        parts.push(p.category)
  return parts.join(' · ')
}

export default router
