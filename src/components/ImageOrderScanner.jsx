/**
 * ImageOrderScanner
 *
 * Lets the shopkeeper photograph or upload an order image.
 * The image is sent directly to a vision LLM (Groq llama-4-scout → Gemini 2.0),
 * which performs OCR + semantic product matching in one step — no Tesseract,
 * no rule-based parsing, no intermediate text editing.
 *
 * Props
 *   onItemsReady({ items, unrecognised, source })
 *       Called with AI-matched order items ready to drop into the order form.
 *   onError(msg)  — called when the vision API fails completely
 */

import { useState, useRef } from 'react'
import { Camera, ImageIcon, X, Sparkles, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import useStore from '../store/useStore'
import supabase from '../lib/supabase'

const PHASES = {
  IDLE:       'idle',
  PROCESSING: 'processing',   // compressing + sending to vision API
  RESULT:     'result',       // items returned, showing preview
  ERROR:      'error',
}

const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Compress image to max 1024px / JPEG 85% before sending — keeps payload small
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1024
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)

      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Canvas compression failed'))
        const reader = new FileReader()
        reader.onload = e => {
          // e.target.result is "data:image/jpeg;base64,<data>"
          const [header, b64] = e.target.result.split(',')
          const mimeType = header.match(/:(.*?);/)[1]
          resolve({ imageBase64: b64, mimeType, dataUrl: e.target.result })
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

export default function ImageOrderScanner({ onItemsReady, onError }) {
  const products = useStore(s => s.products)

  const [phase, setPhase]         = useState(PHASES.IDLE)
  const [imgSrc, setImgSrc]       = useState(null)
  const [aiItems, setAiItems]     = useState([])
  const [aiUnrec, setAiUnrec]     = useState([])
  const [aiSource, setAiSource]   = useState('')
  const [errMsg, setErrMsg]       = useState('')

  const fileRef   = useRef(null)
  const cameraRef = useRef(null)

  function reset() {
    setPhase(PHASES.IDLE)
    setImgSrc(null)
    setAiItems([])
    setAiUnrec([])
    setAiSource('')
    setErrMsg('')
    // Reset file inputs so the same file can be re-selected
    if (fileRef.current)   fileRef.current.value   = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  async function processFile(file) {
    if (!file) return
    setPhase(PHASES.PROCESSING)

    // Show thumbnail immediately while compression runs
    const previewUrl = URL.createObjectURL(file)
    setImgSrc(previewUrl)

    try {
      // 1 — compress
      const { imageBase64, mimeType } = await compressImage(file)

      // 2 — get auth token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not signed in')

      // 3 — build slim catalog (id + name + aliases + unit only)
      const catalog = products.map(p => ({
        id:    p.id,
        name:  p.name,
        unit:  p.unit,
        ...(p.aliases?.length ? { aliases: p.aliases } : {}),
      }))

      // 4 — call vision LLM
      const resp = await fetch(`${BACKEND}/api/llm/parse-image`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ imageBase64, mimeType, catalog }),
        signal: AbortSignal.timeout(20_000),   // vision is slower than text
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error || `Vision API error ${resp.status}`)
      }

      const { items, unrecognised, source } = await resp.json()

      // 5 — enrich with price / inStock from local catalog
      const enriched = items.map(it => {
        const p = products.find(p => p.id === it.productId)
        return { ...it, price: p?.price ?? 0, inStock: p?.inStock ?? true, unit: it.unit ?? p?.unit ?? 'pc' }
      })

      setAiItems(enriched)
      setAiUnrec(unrecognised)
      setAiSource(source)
      setPhase(PHASES.RESULT)

    } catch (e) {
      URL.revokeObjectURL(previewUrl)
      setErrMsg(e.message || 'Vision AI failed')
      setPhase(PHASES.ERROR)
      onError?.(e.message)
    }
  }

  function handleUseItems() {
    onItemsReady({ items: aiItems, unrecognised: aiUnrec, source: aiSource })
    reset()
  }

  // ── IDLE ─────────────────────────────────────────────────────────────────────
  if (phase === PHASES.IDLE) {
    return (
      <div className="border border-dashed border-zinc-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-violet-400" />
          <p className="text-xs font-semibold text-zinc-700">Scan order image with AI</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col items-center gap-2 py-4 bg-zinc-50 rounded-xl cursor-pointer active:scale-95 transition-transform hover:bg-zinc-100">
            <Camera size={20} className="text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-600">Take Photo</span>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => processFile(e.target.files?.[0])}
            />
          </label>

          <label className="flex flex-col items-center gap-2 py-4 bg-zinc-50 rounded-xl cursor-pointer active:scale-95 transition-transform hover:bg-zinc-100">
            <ImageIcon size={20} className="text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-600">Upload Image</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              className="hidden"
              onChange={e => processFile(e.target.files?.[0])}
            />
          </label>
        </div>

        <p className="text-[10px] text-zinc-400 text-center">
          AI reads handwriting, abbreviations & Hindi — no OCR step needed
        </p>
      </div>
    )
  }

  // ── PROCESSING ───────────────────────────────────────────────────────────────
  if (phase === PHASES.PROCESSING) {
    return (
      <div className="border border-violet-100 bg-violet-50/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          {imgSrc && (
            <img src={imgSrc} alt="scan" className="w-14 h-14 object-cover rounded-lg flex-shrink-0 border border-zinc-100" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
              <Sparkles size={12} className="text-violet-500" />
              AI reading image…
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              Recognising text, matching products to your catalog
            </p>
          </div>
          <RefreshCw size={16} className="text-violet-500 animate-spin flex-shrink-0" />
        </div>

        {/* Indeterminate progress bar */}
        <div className="w-full bg-zinc-100 rounded-full h-1 overflow-hidden">
          <div className="h-1 bg-violet-400 rounded-full animate-[pulse_1.5s_ease-in-out_infinite] w-2/3" />
        </div>
      </div>
    )
  }

  // ── ERROR ────────────────────────────────────────────────────────────────────
  if (phase === PHASES.ERROR) {
    return (
      <div className="border border-red-100 bg-red-50/40 rounded-xl p-4 space-y-3">
        {imgSrc && (
          <img src={imgSrc} alt="scan" className="w-16 h-16 object-cover rounded-lg border border-red-100" />
        )}
        <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
          <AlertTriangle size={13} /> Vision AI failed
        </p>
        <p className="text-xs text-red-600">{errMsg}</p>
        <button onClick={reset} className="text-xs font-semibold text-zinc-600 bg-zinc-100 px-3 py-2 rounded-lg w-full">
          Try again
        </button>
      </div>
    )
  }

  // ── RESULT (AI matched items preview) ────────────────────────────────────────
  return (
    <div className="border border-violet-100 bg-violet-50/20 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        {imgSrc && (
          <img src={imgSrc} alt="scan" className="w-14 h-14 object-cover rounded-lg flex-shrink-0 border border-zinc-100" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-violet-500" />
            AI matched {aiItems.length} item{aiItems.length !== 1 ? 's' : ''}
          </p>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            via {aiSource} · {aiUnrec.length > 0 ? `${aiUnrec.length} unmatched` : 'all matched'}
          </p>
        </div>
        <button onClick={reset} className="text-zinc-300 hover:text-zinc-500 flex-shrink-0">
          <X size={15} />
        </button>
      </div>

      {/* Matched items */}
      {aiItems.length > 0 && (
        <div className="space-y-1.5">
          {aiItems.map((it, i) => (
            <div key={i} className="flex items-center justify-between bg-white border border-zinc-100 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-800 truncate">{it.productName}</p>
                <p className="text-[10px] text-zinc-400">{it.qty} {it.unit} · ₹{(it.price * it.qty).toFixed(0)}</p>
              </div>
              {!it.inStock && (
                <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded ml-2">OOS</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Unrecognised lines */}
      {aiUnrec.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Not in catalog</p>
          {aiUnrec.map((u, i) => (
            <div key={i} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">{u.originalLine}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleUseItems}
          disabled={aiItems.length === 0}
          className="flex-1 bg-violet-500 text-white text-xs font-semibold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
        >
          Use These Items →
        </button>
        <button
          onClick={reset}
          className="bg-zinc-100 text-zinc-600 text-xs font-semibold px-4 py-2.5 rounded-xl active:scale-95 transition-transform"
        >
          Discard
        </button>
      </div>
    </div>
  )
}
