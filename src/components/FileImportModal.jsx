/**
 * FileImportModal
 *
 * Bulk catalog import — AI-powered for all unstructured formats.
 *
 * Format strategy
 * ───────────────
 * Excel / CSV  — SheetJS column detection (structure is explicit)
 * PDF / DOCX / TXT — extract raw text → /api/llm/parse-catalog (semantic AI)
 * Images       — compress → /api/llm/parse-catalog (vision AI, no OCR step)
 *
 * Flow: drop/pick → extracting → AI parsing → preview table → import → done
 */

import { useState, useRef, useCallback } from 'react'
import { X, Upload, CheckCircle, AlertCircle, Loader2, Trash2, Sparkles } from 'lucide-react'
import { extractFileContent, parseExcel, CATEGORIES, IMAGE_EXTS } from '../utils/fileImport'
import supabase from '../lib/supabase'

const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const UNITS   = ['packet', 'kg', 'g', 'litre', 'ml', 'pc', 'dozen', 'box', 'bar', 'bottle']

function extOf(name) { return name?.split('.').pop().toLowerCase() ?? '' }
function isImage(name) { return IMAGE_EXTS.includes(extOf(name)) }
function isExcel(name) { return ['xlsx','xls','csv','ods'].includes(extOf(name)) }

// ── DropZone ──────────────────────────────────────────────────────────────────

function DropZone({ onFile }) {
  const inputRef        = useRef(null)
  const [drag, setDrag] = useState(false)

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
        drag ? 'border-violet-400 bg-violet-50' : 'border-zinc-200 hover:border-violet-300 hover:bg-zinc-50'
      }`}
    >
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center">
        <Upload size={22} className="text-zinc-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-700">Drop a file or tap to browse</p>
        <p className="text-xs text-zinc-400 mt-1">Excel · PDF · Word · Text · Image (JPG, PNG…)</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls,.csv,.ods,.pdf,.docx,.txt,.tsv,.jpg,.jpeg,.png,.webp,.bmp,.gif,.tiff,.tif"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}

// ── PreviewTable ──────────────────────────────────────────────────────────────

function PreviewTable({ rows, onChange, onToggle, onToggleAll }) {
  const allSelected = rows.every(r => r.selected)
  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="px-4 py-2 text-left w-8">
              <input type="checkbox" checked={allSelected} onChange={() => onToggleAll(!allSelected)} className="rounded" />
            </th>
            <th className="px-2 py-2 text-left font-semibold text-zinc-500 min-w-[140px]">Name</th>
            <th className="px-2 py-2 text-left font-semibold text-zinc-500 w-20">Price ₹</th>
            <th className="px-2 py-2 text-left font-semibold text-zinc-500 w-24">Unit</th>
            <th className="px-2 py-2 text-left font-semibold text-zinc-500 w-28">Category</th>
            <th className="px-2 py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-zinc-50 ${row.selected ? '' : 'opacity-40'}`}>
              <td className="px-4 py-1.5">
                <input type="checkbox" checked={row.selected} onChange={() => onToggle(i)} className="rounded" />
              </td>
              <td className="px-2 py-1.5">
                <input
                  className="w-full border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                  value={row.name} onChange={e => onChange(i, 'name', e.target.value)}
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  className="w-full border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                  value={row.price} onChange={e => onChange(i, 'price', parseFloat(e.target.value) || 0)}
                />
              </td>
              <td className="px-2 py-1.5">
                <select
                  className="w-full border border-zinc-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                  value={row.unit} onChange={e => onChange(i, 'unit', e.target.value)}
                >
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td className="px-2 py-1.5">
                <select
                  className="w-full border border-zinc-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                  value={row.category} onChange={e => onChange(i, 'category', e.target.value)}
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </td>
              <td className="px-2 py-1.5">
                <button onClick={() => onChange(i, '_delete', true)} className="text-zinc-300 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function FileImportModal({ onClose, addProduct }) {
  const [phase, setPhase]         = useState('upload')   // upload | extracting | parsing | preview | importing | done
  const [fileName, setFileName]   = useState('')
  const [imgPreview, setImgPreview] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [aiSource, setAiSource]   = useState('')
  const [rows, setRows]           = useState([])
  const [errMsg, setErrMsg]       = useState('')
  const [progress, setProgress]   = useState({ done: 0, total: 0 })

  async function callCatalogAI({ text, imageBase64, mimeType }) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const resp = await fetch(`${BACKEND}/api/llm/parse-catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, imageBase64, mimeType }),
      signal: AbortSignal.timeout(30_000),   // catalog can be large — 30 s
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error || `AI error ${resp.status}`)
    }
    return resp.json()
  }

  async function handleFile(file) {
    setFileName(file.name)
    setErrMsg('')
    setImgPreview(null)

    try {
      // ── Step 1: extract content ─────────────────────────────────────────────
      setPhase('extracting')
      setStatusMsg(isImage(file.name) ? 'Compressing image…' : 'Reading file…')

      const extracted = await extractFileContent(file)

      // ── Step 2a: Excel → products directly, no AI ───────────────────────────
      if (extracted.type === 'products') {
        if (!extracted.data.length) throw new Error('No products found in this spreadsheet.')
        setRows(extracted.data.map(p => ({ ...p, selected: true })))
        setPhase('preview')
        return
      }

      // ── Step 2b: image — show thumbnail ────────────────────────────────────
      if (extracted.type === 'image') {
        setImgPreview(extracted.data.dataUrl)
      }

      // ── Step 3: AI parsing ──────────────────────────────────────────────────
      setPhase('parsing')
      setStatusMsg(
        extracted.type === 'image'
          ? 'AI reading image…'
          : 'AI extracting products…'
      )

      const payload = extracted.type === 'image'
        ? { imageBase64: extracted.data.imageBase64, mimeType: extracted.data.mimeType }
        : { text: extracted.data }

      const { products, source } = await callCatalogAI(payload)
      setAiSource(source)

      if (!products?.length) throw new Error('AI could not extract any products. Check the file content.')

      setRows(products.map(p => ({ ...p, selected: true })))
      setPhase('preview')

    } catch (e) {
      setErrMsg(e.message)
      setPhase('upload')
    }
  }

  function changeRow(i, key, value) {
    if (key === '_delete') { setRows(r => r.filter((_, idx) => idx !== i)); return }
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: value } : row))
  }
  function toggleRow(i)   { setRows(r => r.map((row, idx) => idx === i ? { ...row, selected: !row.selected } : row)) }
  function toggleAll(val) { setRows(r => r.map(row => ({ ...row, selected: val }))) }

  async function runImport() {
    const toImport = rows.filter(r => r.selected && r.name.trim())
    if (!toImport.length) return
    setProgress({ done: 0, total: toImport.length })
    setPhase('importing')
    let done = 0
    for (const row of toImport) {
      try {
        await addProduct({ name: row.name.trim(), price: row.price, unit: row.unit, category: row.category, inStock: true, aliases: [] })
      } catch { /* skip duplicates silently */ }
      setProgress({ done: ++done, total: toImport.length })
    }
    setPhase('done')
  }

  const selectedCount  = rows.filter(r => r.selected).length
  const isParsingPhase = phase === 'extracting' || phase === 'parsing'

  // ── Format badges ─────────────────────────────────────────────────────────

  const formats = [
    { icon: '📊', label: 'Excel / CSV',        desc: '.xlsx  .xls  .csv',   badge: null },
    { icon: '📄', label: 'PDF price list',      desc: 'Text-based PDFs',     badge: 'AI' },
    { icon: '📝', label: 'Word document',        desc: '.docx  (not .doc)',   badge: 'AI' },
    { icon: '📃', label: 'Plain text',           desc: '.txt  one item per line', badge: 'AI' },
    { icon: '🖼️', label: 'Photo / Screenshot',  desc: 'JPG  PNG  WebP',      badge: 'Vision AI' },
    { icon: '📱', label: 'WhatsApp screenshot', desc: 'Printed price lists',  badge: 'Vision AI' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-100 flex-shrink-0">
          <div>
            <p className="font-bold text-zinc-900 text-sm">Import Products</p>
            {fileName && <p className="text-xs text-zinc-400 mt-0.5">📁 {fileName}</p>}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* ── Upload ── */}
          {phase === 'upload' && (
            <>
              <DropZone onFile={handleFile} />

              {errMsg && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                  <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{errMsg}</p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Supported formats</p>
                <div className="grid grid-cols-2 gap-2">
                  {formats.map(f => (
                    <div key={f.label} className="flex items-center gap-2.5 bg-zinc-50 rounded-xl px-3 py-2.5">
                      <span className="text-xl">{f.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-zinc-700">{f.label}</p>
                          {f.badge && (
                            <span className="text-[9px] font-bold bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <Sparkles size={8} /> {f.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-violet-800 flex items-center gap-1.5">
                  <Sparkles size={12} /> AI understands your files
                </p>
                <ul className="text-xs text-violet-700 space-y-0.5 list-disc list-inside">
                  <li>Reads handwriting, abbreviations, and brand shortcuts</li>
                  <li>Separates size suffixes (500g, 1kg) from prices automatically</li>
                  <li>Skips headers, totals, GST lines, serial numbers</li>
                  <li>Assigns category and unit intelligently</li>
                </ul>
              </div>
            </>
          )}

          {/* ── Extracting / Parsing ── */}
          {isParsingPhase && (
            <div className="flex flex-col items-center py-10 gap-5">
              {imgPreview ? (
                <img src={imgPreview} alt="scan" className="w-32 h-32 object-cover rounded-2xl border border-zinc-100 shadow-sm" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center">
                  <Sparkles size={28} className="text-violet-400" />
                </div>
              )}
              <div className="text-center space-y-1">
                <p className="font-semibold text-zinc-800 text-sm flex items-center gap-2 justify-center">
                  <Loader2 size={15} className="animate-spin text-violet-500" />
                  {statusMsg}
                </p>
                <p className="text-xs text-zinc-400">{fileName}</p>
                {phase === 'parsing' && (
                  <p className="text-[10px] text-violet-500 font-medium">
                    AI reading content &amp; matching categories…
                  </p>
                )}
              </div>
              {/* Indeterminate bar */}
              <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                <div className="h-1.5 bg-violet-400 rounded-full w-1/2 animate-[pulse_1.5s_ease-in-out_infinite]" />
              </div>
            </div>
          )}

          {/* ── Preview ── */}
          {phase === 'preview' && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-xs font-semibold text-zinc-700">
                    {rows.length} products · {selectedCount} selected
                  </p>
                  {aiSource && (
                    <p className="text-[10px] text-violet-500 flex items-center gap-1 mt-0.5">
                      <Sparkles size={9} /> extracted by {aiSource}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setPhase('upload'); setRows([]); setFileName(''); setAiSource('') }}
                  className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-1.5 rounded-lg"
                >
                  Change file
                </button>
              </div>

              <PreviewTable rows={rows} onChange={changeRow} onToggle={toggleRow} onToggleAll={toggleAll} />
            </>
          )}

          {/* ── Importing ── */}
          {phase === 'importing' && (
            <div className="flex flex-col items-center py-16 gap-4">
              <Loader2 size={32} className="text-emerald-500 animate-spin" />
              <p className="font-semibold text-zinc-800 text-sm">
                Importing {progress.done} / {progress.total}…
              </p>
              <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {phase === 'done' && (
            <div className="flex flex-col items-center py-16 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle size={28} className="text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="font-bold text-zinc-900">Import complete!</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {progress.total} product{progress.total !== 1 ? 's' : ''} added to catalog
                </p>
              </div>
              <button onClick={onClose} className="btn-primary py-2.5 text-sm" style={{ maxWidth: 200 }}>
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer — preview only */}
        {phase === 'preview' && (
          <div className="px-4 py-3 border-t border-zinc-100 flex-shrink-0 flex gap-2">
            <button onClick={onClose} className="btn-secondary py-2.5 text-sm" style={{ flex: '0 0 auto', width: 80 }}>
              Cancel
            </button>
            <button
              onClick={runImport}
              disabled={selectedCount === 0}
              className="btn-primary py-2.5 text-sm flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Import {selectedCount} product{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
