import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  // Override Supabase REST default 1000-row cap (.range covers up to 100k rows).
  const { data, error } = await db.from('customers')
    .select('*')
    .eq('shop_id', req.userId)
    .order('name')
    .range(0, 99999)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { name, phone, notes } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const { data, error } = await db.from('customers')
    .insert({ shop_id: req.userId, name, phone: phone ?? '', notes: notes ?? '', udhaar: 0 })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/:id', async (req, res) => {
  const { name, phone, notes, udhaar } = req.body
  const patch = {}
  if (name !== undefined) patch.name = name
  if (phone !== undefined) patch.phone = phone
  if (notes !== undefined) patch.notes = notes
  if (udhaar !== undefined) patch.udhaar = udhaar

  const { data, error } = await db.from('customers')
    .update(patch)
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// PATCH /api/customers/:id/udhaar  — atomic increment/decrement
router.patch('/:id/udhaar', async (req, res) => {
  const { delta } = req.body   // positive = add debt, negative = payment
  if (delta === undefined) return res.status(400).json({ error: 'delta is required' })

  const { data: cust, error: fetchErr } = await db.from('customers')
    .select('udhaar')
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
    .single()
  if (fetchErr) return res.status(500).json({ error: fetchErr.message })

  const newUdhaar = Math.max(0, (cust.udhaar ?? 0) + delta)
  const { data, error } = await db.from('customers')
    .update({ udhaar: newUdhaar })
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await db.from('customers')
    .delete()
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
