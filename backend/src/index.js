import 'dotenv/config'
import express from 'express'
import cors from 'cors'

// ── env validation — fail fast with a clear message ───────────────────────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error(`[startup] FATAL — missing env vars: ${missing.join(', ')}`)
  console.error('[startup] Go to Railway backend service → Variables and add them.')
  process.exit(1)
}

import shopRoutes      from './routes/shops.js'
import productRoutes   from './routes/products.js'
import customerRoutes  from './routes/customers.js'
import orderRoutes     from './routes/orders.js'
import llmRoutes       from './routes/llm.js'

const app = express()

// ── CORS ──────────────────────────────────────────────────────────────────────
// We use Bearer tokens (not cookies), so credentials:false works with wildcard.
// Set FRONTEND_URL in Railway if you want to restrict to a specific origin.
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: false,
}))
app.use(express.json())

// ── health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// ── core routes ───────────────────────────────────────────────────────────────
app.use('/api/shops',     shopRoutes)
app.use('/api/products',  productRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/orders',    orderRoutes)
app.use('/api/llm',       llmRoutes)

// ── WhatsApp routes (optional — requires whatsapp-web.js + Chromium) ──────────
// Loaded dynamically so a missing/broken puppeteer install doesn't crash the server.
try {
  const { default: whatsappRoutes } = await import('./routes/whatsapp.js')
  app.use('/api/whatsapp', whatsappRoutes)
  console.log('[startup] WhatsApp routes loaded')
} catch (err) {
  console.warn('[startup] WhatsApp routes skipped:', err.message)
  app.use('/api/whatsapp', (_req, res) =>
    res.status(503).json({ error: 'WhatsApp integration not available on this server' })
  )
}

// ── global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Kirana API running on port ${PORT}`))
