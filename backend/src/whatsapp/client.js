/**
 * WhatsApp Web client singleton (Path B — auto-ingestion).
 *
 * How it works:
 *  1. Call initWhatsApp(shopId) once on server start.
 *  2. whatsapp-web.js connects to WhatsApp Web via Puppeteer.
 *  3. On first run it emits a 'qr' event — the QR is converted to a data-URL
 *     and served at GET /api/whatsapp/qr for the shopkeeper to scan with their phone.
 *  4. Once connected, every incoming 1-to-1 message is stored in the
 *     `incoming_whatsapp` Supabase table.
 *  5. The frontend subscribes to that table via Supabase Realtime and shows
 *     a notification banner — shopkeeper taps it to open the pre-populated order form.
 *
 * Session is persisted in ./.wa-session (LocalAuth strategy), so the shopkeeper
 * only needs to scan the QR once per machine.
 */

import pkg from 'whatsapp-web.js'
const { Client, LocalAuth } = pkg
import qrcode from 'qrcode'
import supabase from '../db.js'

// ── state ─────────────────────────────────────────────────────────────────────
let _client       = null
let _qrRaw        = null   // raw QR string (for conversion to data-URL on demand)
let _ready        = false
let _shopId       = null
let _initStartTs  = 0      // when initWhatsApp was last called — used to detect
                           // stuck launches in getStatus()
let _initError    = null   // last fatal error message, surfaced to the frontend

// ── public API ────────────────────────────────────────────────────────────────
export function getStatus() {
  // If init kicked off >75 s ago and we still don't have a QR or a ready
  // connection, treat it as stuck. Without this, the frontend spinner would
  // wait forever — common when Chromium itself failed to launch (snap
  // wrapper, missing libs, sandbox issue) and never emitted any event.
  let stuck = null
  if (_client && !_ready && !_qrRaw && _initStartTs && (Date.now() - _initStartTs) > 75_000) {
    stuck = `WhatsApp client did not produce a QR after 75s — Chromium likely failed to launch. Check backend logs for the launch error.`
  }
  return {
    connected: _ready,
    hasQR:     !!_qrRaw && !_ready,
    shopId:    _shopId,
    error:     _initError || stuck || null,
  }
}

export async function getQRDataURL() {
  if (!_qrRaw) return null
  return qrcode.toDataURL(_qrRaw)
}

/**
 * Initialise the WhatsApp client for a given shopId.
 * Safe to call multiple times — only initialises once.
 */
export function initWhatsApp(shopId) {
  if (_client) return   // already running
  _shopId      = shopId
  _initStartTs = Date.now()
  _initError   = null

  // Optional override — for local dev / debugging when you want to point at
  // a specific Chrome binary. Production leaves this unset and Puppeteer
  // uses its own bundled Chrome (real binary, not Ubuntu Noble's snap
  // wrapper which won't run in containers).
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined

  _client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wa-session' }),
    puppeteer: {
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    },
  })

  _client.on('qr', qr => {
    _qrRaw = qr
    _ready = false
    console.log('[WA] QR ready — open GET /api/whatsapp/qr in your browser to scan')
  })

  _client.on('ready', () => {
    _qrRaw = null
    _ready = true
    console.log('[WA] Connected and ready!')
  })

  _client.on('auth_failure', msg => {
    console.error('[WA] Auth failure:', msg)
    _ready = false
  })

  _client.on('disconnected', reason => {
    console.warn('[WA] Disconnected:', reason)
    _ready = false
    _client = null
    // Auto-reconnect after 10 s
    setTimeout(() => initWhatsApp(_shopId), 10_000)
  })

  _client.on('message', async msg => {
    // Skip group chats and broadcast/status messages
    if (msg.isGroupMsg || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return
    // Skip empty messages (stickers, media with no caption, etc.)
    if (!msg.body?.trim()) return

    const rawPhone   = msg.from.replace('@c.us', '')
    // Strip leading country code 91 to get a 10-digit Indian number
    const fromPhone  = rawPhone.replace(/^91/, '').slice(-10)
    let   fromName   = fromPhone

    try {
      const contact = await msg.getContact()
      fromName = contact.pushname || contact.name || fromPhone
    } catch { /* non-fatal */ }

    console.log(`[WA] Message from ${fromName} (${fromPhone}): "${msg.body.substring(0, 60)}"`)

    const { error } = await supabase.from('incoming_whatsapp').insert({
      shop_id:      _shopId,
      from_phone:   fromPhone,
      from_name:    fromName,
      message:      msg.body,
      parsed_items: [],
      status:       'pending',
    })

    if (error) console.error('[WA] Failed to store message:', error.message)
  })

  // initialize() returns a Promise that rejects when Puppeteer fails to
  // launch Chrome (snap wrapper, missing libs, sandbox failure). Catching
  // it here lets us record the message instead of silently never emitting
  // a 'qr' event — which is what was producing the stuck "Starting…" spinner.
  _client.initialize().catch(err => {
    _initError = `WhatsApp init failed: ${err?.message || String(err)}`
    console.error('[WA] initialize() rejected:', err)
    // Tear down so a retry triggers a fresh launch.
    try { _client?.destroy?.() } catch {}
    _client = null
    _qrRaw  = null
    _ready  = false
  })
  console.log('[WA] Client initialising — this may take ~30 s on first run…')
}
