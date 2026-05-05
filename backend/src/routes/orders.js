import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/orders?date=2026-05-03
router.get('/', async (req, res) => {
  // Page in 1000-row chunks — Supabase silently caps single .range() calls.
  const PAGE = 1000
  const dateStart = req.query.date ? new Date(req.query.date) : null
  const dateEnd   = req.query.date ? new Date(new Date(req.query.date).setDate(dateStart.getDate() + 1)) : null

  const all = []
  let error = null
  for (let from = 0; ; from += PAGE) {
    let q = db.from('orders')
      .select('*, order_items(*)')
      .eq('shop_id', req.userId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (dateStart) q = q.gte('created_at', dateStart.toISOString()).lt('created_at', dateEnd.toISOString())
    const { data: chunk, error: chunkErr } = await q
    if (chunkErr) { error = chunkErr; break }
    if (!chunk?.length) break
    all.push(...chunk)
    if (chunk.length < PAGE || all.length > 50000) break
  }

  const data = all
  if (error) return res.status(500).json({ error: error.message })

  // Reshape: attach items array and map snake_case → camelCase for frontend
  const orders = data.map(o => ({
    id: o.id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    status: o.status,
    total: Number(o.total),
    paidCash:   Number(o.paid_cash   ?? 0),
    paidUpi:    Number(o.paid_upi    ?? 0),
    paidUdhaar: Number(o.paid_udhaar ?? 0),
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
  const {
    customerName, customerPhone, status, total, rawMessage, items,
    paidCash = 0, paidUpi = 0, paidUdhaar = 0,
  } = req.body
  if (!customerName) return res.status(400).json({ error: 'customerName is required' })

  const { data: order, error: orderErr } = await db.from('orders')
    .insert({
      shop_id: req.userId,
      customer_name: customerName,
      customer_phone: customerPhone ?? '',
      status: status ?? 'pending',
      total: total ?? 0,
      raw_message: rawMessage ?? '',
      paid_cash:    Number(paidCash)   || 0,
      paid_upi:     Number(paidUpi)    || 0,
      paid_udhaar:  Number(paidUdhaar) || 0,
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

  // Return the saved order in the same camelCase shape GET /api/orders uses,
  // so the frontend can append it to its in-memory list directly without a
  // refetch. (Previously POST returned raw snake_case rows, so the just-saved
  // order showed up in the list with no customerName / total / etc. until
  // the next fetchOrders.)
  res.status(201).json({
    id:            order.id,
    customerName:  order.customer_name,
    customerPhone: order.customer_phone,
    status:        order.status,
    total:         Number(order.total),
    paidCash:      Number(order.paid_cash   ?? 0),
    paidUpi:       Number(order.paid_upi    ?? 0),
    paidUdhaar:    Number(order.paid_udhaar ?? 0),
    rawMessage:    order.raw_message,
    createdAt:     order.created_at,
    items:         (items ?? []).map(i => ({
      productId:   i.productId ?? null,
      productName: i.productName,
      qty:         Number(i.qty),
      unit:        i.unit ?? 'pc',
      price:       Number(i.price ?? 0),
    })),
  })
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
