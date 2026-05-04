import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// Infer category from product name when not provided
function inferCategory(name) {
  const n = name.toLowerCase()
  if (/milk|dahi|curd|paneer|butter|ghee|cheese|cream|lassi|chaas/.test(n))      return 'Dairy'
  if (/biscuit|cookie|parle|oreo|marie|britannia|glucose|hide.*seek/.test(n))    return 'Biscuits'
  if (/chips|namkeen|lays|kurkure|snack|bhujia|wafer|popcorn|murukku/.test(n))   return 'Snacks'
  if (/maggi|noodle|pasta|vermicelli|yippee|top.*ramen/.test(n))                 return 'Noodles'
  if (/tea|chai|coffee|juice|drink|water|soda|cola|pepsi|coke|sprite|thums|limca|frooti|maaza|appy|red bull|monster|sting/.test(n)) return 'Beverages'
  if (/atta|flour|rice|dal|pulses|sugar|salt|oil|ghee|maida|besan|poha|sooji|rava|chana|rajma|masoor|moong|urad/.test(n)) return 'Staples'
  if (/soap|detergent|shampoo|surf|rin|tide|vim|phenyl|harpic|toilet|broom|mop|brush|dettol|sanitizer|handwash/.test(n)) return 'Household'
  return 'Other'
}

// GET /api/products
router.get('/', async (req, res) => {
  const { data, error } = await db.from('products')
    .select('*')
    .eq('shop_id', req.userId)
    .order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/products
router.post('/', async (req, res) => {
  const { name, price, unit, category, inStock, aliases } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  // Auto-infer category from name if not provided
  const resolvedCategory = category && category !== 'Other' ? category : inferCategory(name)
  const { data, error } = await db.from('products')
    .insert({ shop_id: req.userId, name, price: price ?? 0, unit: unit ?? 'packet', category: resolvedCategory, in_stock: inStock ?? true, aliases: aliases ?? [] })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  const { name, price, unit, category, inStock, aliases } = req.body
  const patch = {}
  if (name !== undefined) patch.name = name
  if (price !== undefined) patch.price = price
  if (unit !== undefined) patch.unit = unit
  if (category !== undefined) patch.category = category
  if (inStock !== undefined) patch.in_stock = inStock
  if (aliases !== undefined) patch.aliases = aliases

  const { data, error } = await db.from('products')
    .update(patch)
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  const { error } = await db.from('products')
    .delete()
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
