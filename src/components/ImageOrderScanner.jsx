/**
 * ImageOrderScanner
 *
 * Drop-in panel for the Orders "New Order" form.
 * Lets the shopkeeper upload or photograph an order image
 * (handwritten slip, WhatsApp screenshot, printed list),
 * runs OCR, then calls onTextReady(extractedText) so the
 * parent can feed it into parseOrderMessage().
 *
 * Props
 *  onTextReady(text)  — called with the raw OCR string
 *  onError(msg)       — called when OCR fails
 */

import { useState, useRef } from 'react'
import { Camera, ImageIcon, X, RefreshCw, Languages } from 'lucide-react'
// ocr is loaded lazily inside processFile() so the ~500 kB Tesseract chunk
// is only downloaded when the shopkeeper actually uses the scanner.
async function getOCR() {
  return import('../utils/ocr')
}

const PHASES = {
  IDLE:       'idle',
  PROCESSING: 'processing',
  PREVIEW:    'preview',   // OCR done — showing text for review before parsing
  ERROR:      'error',
}

export default function ImageOrderScanner({ onTextReady, onError }) {
  const [phase, setPhase]         = useState(PHASES.IDLE)
  const [imgSrc, setImgSrc]       = useState(null)    // data-URL for preview
  const [ocrPct, setOcrPct]       = useState(0)
  const [rawText, setRawText]     = useState('')       // editable OCR result
  const [useHindi, setUseHindi]   = useState(false)   // toggle Hindi+Eng model
  const [errMsg, setErrMsg]       = useState('')
  const fileRef  = useRef(null)
  const cameraRef = useRef(null)

  function reset() {
    setPhase(PHASES.IDLE)
    setImgSrc(null)
    setOcrPct(0)
    setRawText('')
    setErrMsg('')
  }

  async function processFile(file) {
    if (!file) return
    // Show thumbnail immediately
    const reader = new FileReader()
    reader.onload = e => setImgSrc(e.target.result)
    reader.readAsDataURL(file)

    setPhase(PHASES.PROCESSING)
    setOcrPct(0)

    try {
      const lang = useHindi ? 'hin+eng' : 'eng'
      const { runOCR, looksLikeOrderText } = await getOCR()
      const text = await runOCR(file, {
        lang,
        onProgress: pct => setOcrPct(pct),
      })

      if (!looksLikeOrderText(text)) {
        // OCR ran but result looks like noise — still show it so user can edit
        setRawText(text)
        setPhase(PHASES.PREVIEW)
        onError?.('Low-quality scan — please review the extracted text before parsing.')
        return
      }

      setRawText(text)
      setPhase(PHASES.PREVIEW)
    } catch (e) {
      setErrMsg(e.message || 'OCR failed')
      setPhase(PHASES.ERROR)
      onError?.(e.message)
    }
  }

  function handleParseClick() {
    if (rawText.trim()) onTextReady(rawText)
    reset()
  }

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (phase === PHASES.IDLE) {
    return (
      <div className="border border-dashed border-zinc-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
            <ImageIcon size={13} className="text-zinc-400" />
            Scan order image
          </p>
          {/* Hindi toggle */}
          <button
            onClick={() => setUseHindi(h => !h)}
            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors ${
              useHindi ? 'bg-orange-50 text-orange-600' : 'bg-zinc-100 text-zinc-500'
            }`}
            title="Enable Hindi (Devanagari) OCR — adds ~10 MB download"
          >
            <Languages size={10} />
            {useHindi ? 'Hindi+Eng' : 'English'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Camera capture — opens rear camera on mobile */}
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

          {/* File picker — screenshots, saved images */}
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
          Works with WhatsApp screenshots, handwritten slips &amp; printed lists
        </p>
      </div>
    )
  }

  // ── PROCESSING ────────────────────────────────────────────────────────────
  if (phase === PHASES.PROCESSING) {
    return (
      <div className="border border-zinc-100 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          {imgSrc && (
            <img src={imgSrc} alt="scan" className="w-14 h-14 object-cover rounded-lg flex-shrink-0 border border-zinc-100" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-zinc-800">Reading image…</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              {useHindi ? 'Downloading Hindi OCR data (~10 MB first time)' : 'Extracting text'}
            </p>
          </div>
          <RefreshCw size={16} className="text-emerald-500 animate-spin flex-shrink-0" />
        </div>

        {/* Progress bar */}
        <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-200"
            style={{ width: `${ocrPct}%` }}
          />
        </div>
        <p className="text-[10px] text-zinc-400 text-right">{ocrPct}%</p>
      </div>
    )
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (phase === PHASES.ERROR) {
    return (
      <div className="border border-red-100 bg-red-50/40 rounded-xl p-4 space-y-3">
        {imgSrc && (
          <img src={imgSrc} alt="scan" className="w-16 h-16 object-cover rounded-lg border border-red-100" />
        )}
        <p className="text-xs font-semibold text-red-700">OCR failed</p>
        <p className="text-xs text-red-600">{errMsg}</p>
        <button onClick={reset} className="text-xs font-semibold text-zinc-600 bg-zinc-100 px-3 py-2 rounded-lg w-full">
          Try again
        </button>
      </div>
    )
  }

  // ── PREVIEW (OCR done — editable text) ───────────────────────────────────
  return (
    <div className="border border-emerald-100 bg-emerald-50/30 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        {imgSrc && (
          <img src={imgSrc} alt="scan" className="w-14 h-14 object-cover rounded-lg flex-shrink-0 border border-zinc-100" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-800">Text extracted — review &amp; parse</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Edit if OCR made mistakes, then tap Parse</p>
        </div>
        <button onClick={reset} className="text-zinc-300 hover:text-zinc-500 transition-colors flex-shrink-0">
          <X size={15} />
        </button>
      </div>

      <textarea
        className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-xs text-zinc-800 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
        rows={5}
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        spellCheck={false}
      />

      <div className="flex gap-2">
        <button
          onClick={handleParseClick}
          className="flex-1 bg-emerald-500 text-white text-xs font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
        >
          Parse Order →
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
