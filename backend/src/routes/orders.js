import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/orders?date=2026-05-03
router.get('/', async (req, res) => {
  let query = db.from('orders')
    .select('*, order_items(*)')
    .eq('shop_id', req.userId)
    .order('created_at', { ascending: false })

  if (req.query.date) {
    const start = new Date(req.query.date)
    const end = new Date(req.query.date)
    end.setDate(end.getDate() + 1)
    query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // Reshape: attach items array and map snake_case → camelCase for frontend
  const orders = data.map(o => ({
    id: o.id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    status: o.status,
    total: Number(o.total),
    rawMessage: o.raw_message,
    createdAt: o.created_at,
    items: (o.order_items || []).map(i => ({
      id: i.id,
      productId: i.product_id,
      productName: i.product_name,
      qty: Number(i.qty),
      unit: i.unit,
      price: Number(i.price),
    }))
  }))
  res.json(orders)
})

// POST /api/orders
router.post('/', async (req, res) => {
  const { customerName, customerPhone, status, total, rawMessage, items } = req.body
  if (!customerName) return res.status(400).json({ error: 'customerName is required' })

  const { data: order, error: orderErr } = await db.from('orders')
    .insert({
      shop_id: req.userId,
      customer_name: customerName,
      customer_phone: customerPhone ?? '',
      status: status ?? 'pending',
      total: total ?? 0,
      raw_message: rawMessage ?? '',
    })
    .select()
    .single()
  if (orderErr) return res.status(500).json({ error: orderErr.message })

  if (items?.length) {
    const rows = items.map(i => ({
      order_id: order.id,
      product_id: i.productId ?? null,
      product_name: i.productName,
      qty: i.qty,
      unit: i.unit ?? 'pc',
      price: i.price ?? 0,
    }))
    const { error: itemErr } = await db.from('order_items').insert(rows)
    if (itemErr) return res.status(500).json({ error: itemErr.message })
  }

  res.status(201).json({ ...order, items: items ?? [] })
})

// PUT /api/orders/:id  (status update)
router.put('/:id', async (req, res) => {
  const { status } = req.body
  const { data, error } = await db.from('orders')
    .update({ status })
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/orders/:id
router.delete('/:id', async (req, res) => {
  const { error } = await db.from('orders')
    .delete()
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
