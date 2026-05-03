import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import shopRoutes      from './routes/shops.js'
import productRoutes   from './routes/products.js'
import customerRoutes  from './routes/customers.js'
import orderRoutes     from './routes/orders.js'
import whatsappRoutes  from './routes/whatsapp.js'
import llmRoutes       from './routes/llm.js'

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/shops',     shopRoutes)
app.use('/api/products',  productRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/orders',    orderRoutes)
app.use('/api/whatsapp',  whatsappRoutes)
app.use('/api/llm',      llmRoutes)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Kirana API running on port ${PORT}`))
