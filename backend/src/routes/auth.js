import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '../db.js'

const router = Router()

const sign = (shopId, phone) =>
  jwt.sign({ shopId, phone }, process.env.JWT_SECRET, { expiresIn: '30d' })

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { shopName, phone, pin } = req.body
  if (!shopName || !phone || !pin) return res.status(400).json({ error: 'shopName, phone, and pin are required' })
  if (pin.length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits' })

  const pinHash = await bcrypt.hash(pin, 10)

  // Upsert shop by phone (allow re-registration to reset PIN)
  const { data: existing } = await db.from('shops').select('id').eq('phone', phone).single()

  let shopId
  if (existing) {
    const { error } = await db.from('shops').update({ name: shopName, pin_hash: pinHash }).eq('id', existing.id)
    if (error) return res.status(500).json({ error: error.message })
    shopId = existing.id
  } else {
    const { data, error } = await db.from('shops').insert({ name: shopName, phone, pin_hash: pinHash }).select('id').single()
    if (error) return res.status(500).json({ error: error.message })
    shopId = data.id

    // Seed default products for new shops
    await db.from('products').insert(defaultProducts(shopId))
  }

  res.json({ token: sign(shopId, phone), shopId, shopName })
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { phone, pin } = req.body
  if (!phone || !pin) return res.status(400).json({ error: 'phone and pin are required' })

  const { data: shop, error } = await db.from('shops').select('id, name, pin_hash').eq('phone', phone).single()
  if (error || !shop) return res.status(401).json({ error: 'Shop not found' })

  const ok = await bcrypt.compare(pin, shop.pin_hash)
  if (!ok) return res.status(401).json({ error: 'Wrong PIN' })

  res.json({ token: sign(shop.id, phone), shopId: shop.id, shopName: shop.name })
})

function defaultProducts(shopId) {
  return [
    { shop_id: shopId, name: 'Parle-G', aliases: ['parleg', 'parle g biscuit'], price: 10, unit: 'packet', category: 'Snacks', in_stock: true },
    { shop_id: shopId, name: 'Maggi Noodles', aliases: ['maggi', 'noodles'], price: 14, unit: 'packet', category: 'Snacks', in_stock: true },
    { shop_id: shopId, name: 'Amul Milk 500ml', aliases: ['milk', 'amul', 'dudh'], price: 28, unit: 'packet', category: 'Khaana', in_stock: true },
    { shop_id: shopId, name: 'Tata Salt 1kg', aliases: ['salt', 'namak', 'tata namak'], price: 22, unit: 'kg', category: 'Khaana', in_stock: true },
    { shop_id: shopId, name: 'Surf Excel 200g', aliases: ['surf', 'detergent'], price: 45, unit: 'packet', category: 'Ghar', in_stock: true },
    { shop_id: shopId, name: "Lay's Classic", aliases: ['lays', 'chips'], price: 20, unit: 'packet', category: 'Snacks', in_stock: true },
    { shop_id: shopId, name: 'Tata Tea Premium', aliases: ['chai', 'tea', 'tata tea'], price: 160, unit: '250g', category: 'Khaana', in_stock: true },
    { shop_id: shopId, name: 'Rin Bar', aliases: ['rin', 'soap bar'], price: 12, unit: 'bar', category: 'Ghar', in_stock: false },
  ]
}

export default router
