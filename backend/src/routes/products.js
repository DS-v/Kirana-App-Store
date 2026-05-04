import { Router } from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// Infer broad category from product name. We collapsed to 4 buckets:
// Khaana (food + drinks + groceries), Snacks, Ghar (household), Other.
function inferCategory(name) {
  const n = name.toLowerCase()
  if (/chips|namkeen|lays|kurkure|snack|bhujia|wafer|popcorn|murukku|biscuit|cookie|parle|oreo|marie|britannia|glucose|hide.*seek|maggi|noodle|pasta|vermicelli|yippee|top.*ramen|chocolate|kitkat|dairy.*milk|munch|5.*star/.test(n)) return 'Snacks'
  if (/soap|detergent|shampoo|surf|rin|tide|vim|phenyl|harpic|toilet|broom|mop|brush|dettol|sanitizer|handwash|tissue|napkin|bulb|battery|matchbox|incense|agarbatti|candle|colgate|toothpaste|toothbrush/.test(n)) return 'Ghar'
  if (/milk|dahi|curd|paneer|butter|ghee|cheese|cream|lassi|chaas|tea|chai|coffee|juice|drink|water|soda|cola|pepsi|coke|sprite|thums|limca|frooti|maaza|appy|red.?bull|monster|sting|atta|flour|rice|dal|pulses|sugar|salt|oil|maida|besan|poha|sooji|rava|chana|rajma|masoor|moong|urad|honey|jam|sauce|ketchup|pickle|achar|masala|spice/.test(n)) return 'Khaana'
  return 'Other'
}

// GET /api/products
// NOTE: Supabase REST silently caps at 1000 rows by default. We override with
// .range(0, 99999) to support large catalogs (kirana shopkeepers regularly
// have 1k–5k SKUs after a paste/PDF import). If you ever exceed ~10k SKUs on
// one shop, switch to true pagination (?cursor= or ?page=).
router.get('/', async (req, res) => {
  const { data, error } = await db.from('products')
    .select('*')
    .eq('shop_id', req.userId)
    .order('name')
    .range(0, 99999)
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
