import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/shops — return the current user's shop
router.get('/', async (req, res) => {
  const { data, error } = await db.from('shops').select('*').eq('id', req.userId).single()
  if (error) return res.status(404).json({ error: 'Shop not found' })
  res.json(data)
})

// POST /api/shops — create or update shop (upsert on every login)
router.post('/', async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const phone = req.user.phone || ''

  const { data, error } = await db.from('shops')
    .upsert({ id: req.userId, name, phone }, { onConflict: 'id' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Seed default products for brand-new shops
  const { count } = await db.from('products').select('id', { count: 'exact', head: true }).eq('shop_id', req.userId)
  if (count === 0) {
    await db.from('products').insert(defaultProducts(req.userId))
  }

  res.json(data)
})

function defaultProducts(shopId) {
  return [
    { shop_id: shopId, name: 'Parle-G', aliases: ['parleg', 'parle g biscuit'], price: 10, unit: 'packet', category: 'Snacks', in_stock: true },
    { shop_id: shopId, name: 'Maggi Noodles', aliases: ['maggi', 'noodles'], price: 14, unit: 'packet', category: 'Snacks', in_stock: true },
    { shop_id: shopId, name: 'Amul Milk 500ml', aliases: ['milk', 'amul', 'dudh'], price: 28, unit: 'packet', category: 'Khaana', in_stock: true },
    { shop_id: shopId, name: 'Tata Salt 1kg', aliases: ['salt', 'namak'], price: 22, unit: 'kg', category: 'Khaana', in_stock: true },
    { shop_id: shopId, name: 'Surf Excel 200g', aliases: ['surf', 'detergent'], price: 45, unit: 'packet', category: 'Ghar', in_stock: true },
    { shop_id: shopId, name: "Lay's Classic", aliases: ['lays', 'chips'], price: 20, unit: 'packet', category: 'Snacks', in_stock: true },
    { shop_id: shopId, name: 'Tata Tea Premium', aliases: ['chai', 'tea'], price: 160, unit: '250g', category: 'Khaana', in_stock: true },
    { shop_id: shopId, name: 'Rin Bar', aliases: ['rin', 'soap bar'], price: 12, unit: 'bar', category: 'Ghar', in_stock: false },
  ]
}

export default router
