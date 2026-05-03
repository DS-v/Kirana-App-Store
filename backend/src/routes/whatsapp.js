/**
 * WhatsApp integration endpoints.
 *
 * GET  /api/whatsapp/status       — connection status (connected, hasQR)
 * GET  /api/whatsapp/qr           — QR code as PNG data-URL (scan with phone)
 * POST /api/whatsapp/setup        — initialise WA client for this shop
 * POST /api/whatsapp/dismiss/:id  — mark incoming message as dismissed
 * POST /api/whatsapp/convert/:id  — mark incoming message as converted to order
 */

import { Router } from 'express'
import { getStatus, getQRDataURL, initWhatsApp } from '../whatsapp/client.js'
import supabase from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/whatsapp/status
router.get('/status', (_req, res) => {
  res.json(getStatus())
})

// GET /api/whatsapp/qr  — base64 PNG data-URL
router.get('/qr', async (_req, res) => {
  const dataUrl = await getQRDataURL()
  if (!dataUrl) return res.status(404).json({ error: 'No QR available — already connected or not initialised' })
  res.json({ qr: dataUrl })
})

// POST /api/whatsapp/setup  — called by frontend when shopkeeper enables auto-ingestion
router.post('/setup', (req, res) => {
  const shopId = req.userId   // Supabase auth UUID (same as shop_id in DB)
  initWhatsApp(shopId)
  res.json({ ok: true, message: 'WhatsApp client initialising — poll /api/whatsapp/status for updates' })
})

// POST /api/whatsapp/dismiss/:id
router.post('/dismiss/:id', async (req, res) => {
  const { error } = await supabase
    .from('incoming_whatsapp')
    .update({ status: 'dismissed' })
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// POST /api/whatsapp/convert/:id  — call when creating an order from a WA message
router.post('/convert/:id', async (req, res) => {
  const { error } = await supabase
    .from('incoming_whatsapp')
    .update({ status: 'converted', parsed_items: req.body.parsedItems ?? [] })
    .eq('id', req.params.id)
    .eq('shop_id', req.userId)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router
