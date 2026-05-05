/**
 * WASetup — WhatsApp auto-ingestion setup card.
 *
 * States:
 *  idle        → "Enable Auto-Ingestion" button
 *  loading     → spinner while client initialises
 *  qr          → QR code image (shopkeeper scans with phone)
 *  connected   → green "Connected" badge
 *  error       → error message with retry
 */

import { useState, useEffect, useRef } from 'react'
import { Wifi, WifiOff, RefreshCw, CheckCircle, MessageSquare } from 'lucide-react'
import { api } from '../api/client'

// Wrapper that re-creates the "WHATSAPP" section label that used to live in
// Dashboard. Owning the label here means the entire section disappears
// cleanly when WhatsApp isn't available on this backend.
function Section({ children }) {
  return (
    <div className="space-y-2">
      <p className="section-label px-1 flex items-center gap-1.5">
        <MessageSquare size={11} /> WhatsApp
      </p>
      {children}
    </div>
  )
}

const POLL_INTERVAL = 3000   // poll status every 3 s while waiting for QR scan

// Backend returns this exact message when whatsapp-web.js failed to load
// (Railway's container doesn't ship headless Chromium). We don't want to
// nag the shopkeeper with "WhatsApp setup failed" — just hide the section.
const UNAVAILABLE_MSG = 'WhatsApp integration not available on this server'

export default function WASetup() {
  const [phase, setPhase]   = useState('idle')   // idle | loading | qr | connected | error | unavailable
  const [qrSrc, setQrSrc]   = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const timerRef            = useRef(null)

  useEffect(() => {
    // Check on mount whether WhatsApp is supported AND already connected.
    api.get('/api/whatsapp/status')
      .then(s => { if (s?.connected) setPhase('connected') })
      .catch(e => {
        if (e?.message?.includes(UNAVAILABLE_MSG)) setPhase('unavailable')
        // any other error: stay idle so the user can still try
      })

    return () => clearInterval(timerRef.current)
  }, [])

  async function startSetup() {
    setPhase('loading')
    try {
      await api.post('/api/whatsapp/setup', {})
    } catch (e) {
      // 503 with this exact message = backend can't run WhatsApp at all,
      // so collapse the section instead of showing a scary red error.
      if (e?.message?.includes(UNAVAILABLE_MSG)) {
        setPhase('unavailable')
        return
      }
      setErrMsg(e.message)
      setPhase('error')
      return
    }

    // Poll until QR appears, connection establishes, or backend reports an
    // init error. Without the error branch the spinner would run forever
    // when Chromium fails to launch (snap wrapper, missing libs, etc.).
    timerRef.current = setInterval(async () => {
      try {
        const status = await api.get('/api/whatsapp/status')
        if (status?.error) {
          clearInterval(timerRef.current)
          setErrMsg(status.error)
          setPhase('error')
          return
        }
        if (status?.connected) {
          clearInterval(timerRef.current)
          setPhase('connected')
          setQrSrc(null)
          return
        }
        if (status?.hasQR) {
          const { qr } = await api.get('/api/whatsapp/qr')
          setQrSrc(qr)
          setPhase('qr')
        }
      } catch { /* keep polling */ }
    }, POLL_INTERVAL)
  }

  // WhatsApp module isn't running on this backend — render nothing so the
  // shopkeeper isn't presented with a feature they can't use. The Profile
  // page handles the empty render gracefully.
  if (phase === 'unavailable') return null

  if (phase === 'connected') {
    return (
      <Section>
      <div className="card flex items-center gap-3 border-emerald-100 bg-emerald-50/40">
        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <Wifi size={16} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-900">WhatsApp Connected</p>
          <p className="text-xs text-zinc-400 mt-0.5">Orders are being ingested automatically</p>
        </div>
        <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
      </div>
      </Section>
    )
  }

  if (phase === 'qr') {
    return (
      <Section>
      <div className="card space-y-3 border-emerald-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Wifi size={14} className="text-emerald-500" />
          </div>
          <p className="font-bold text-zinc-900 text-sm">Scan to Connect WhatsApp</p>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Open WhatsApp on your phone → Linked Devices → Link a Device → scan this code.
          Once scanned, all incoming messages will be ingested automatically.
        </p>
        {qrSrc && (
          <img
            src={qrSrc}
            alt="WhatsApp QR code"
            className="w-48 h-48 mx-auto rounded-xl border border-zinc-100"
          />
        )}
        <p className="text-[11px] text-zinc-400 text-center animate-pulse">
          Waiting for scan…
        </p>
      </div>
      </Section>
    )
  }

  if (phase === 'loading') {
    return (
      <Section>
      <div className="card flex items-center gap-3 border-zinc-100">
        <RefreshCw size={18} className="text-emerald-500 animate-spin flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-zinc-900">Starting WhatsApp…</p>
          <p className="text-xs text-zinc-400 mt-0.5">QR code will appear in a moment</p>
        </div>
      </div>
      </Section>
    )
  }

  if (phase === 'error') {
    return (
      <Section>
      <div className="card space-y-2 border-red-100 bg-red-50/30">
        <div className="flex items-center gap-2">
          <WifiOff size={16} className="text-red-400" />
          <p className="text-sm font-bold text-zinc-800">WhatsApp setup failed</p>
        </div>
        <p className="text-xs text-zinc-500">{errMsg || 'Make sure the backend is running'}</p>
        <button onClick={startSetup} className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg w-full">
          Retry
        </button>
      </div>
      </Section>
    )
  }

  // idle
  return (
    <Section>
    <div className="card space-y-3 border-dashed">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
          <WifiOff size={14} className="text-zinc-400" />
        </div>
        <p className="font-bold text-zinc-900 text-sm">Auto-Ingest WhatsApp Orders</p>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">
        Link your WhatsApp once. Every incoming message will appear instantly in Orders — no copy-paste needed.
      </p>
      <button onClick={startSetup} className="btn-primary py-2.5 text-sm">
        Enable Auto-Ingestion
      </button>
    </div>
    </Section>
  )
}
