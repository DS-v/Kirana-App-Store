/**
 * FileImportModal
 *
 * Accepts: .xlsx / .xls / .csv / .pdf / .docx / .txt / images (jpg, png, webp…)
 *
 * Flow:
 *  1. Drop zone or file picker
 *  2. Parsing spinner — for images, shows OCR progress bar
 *  3. Editable preview table — name, price, unit, category; checkbox per row
 *  4. "Import X selected" → addProduct for each checked row
 *  5. Done screen with summary
 */

import { useState, useRef, useCallback } from 'react'
import { X, Upload, CheckCircle, AlertCircle, Loader2, Trash2, Languages } from 'lucide-react'
import { parseFile, CATEGORIES, IMAGE_EXTS } from '../utils/fileImport'

const UNITS = ['packet', 'kg', 'g', 'litre', 'ml', 'pc', 'dozen', 'box', 'bar']

const EXT_ICON = {
  xlsx: '📊', xls: '📊', csv: '📊', ods: '📊',
  pdf:  '📄',
  docx: '📝', doc: '📝',
  txt:  '📃', tsv: '📃',
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️', bmp: '🖼️', tiff: '🖼️', tif: '🖼️', gif: '🖼️',
}

function extOf(name) { return name?.split('.').pop().toLowerCase() ?? '' }
function isImage(name) { return IMAGE_EXTS.includes(extOf(name)) }

// ── Sub-components ────────────────────────────────────────────────────────────

function DropZone({ onFile }) {
  const inputRef    = useRef(null)
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
        drag ? 'border-emerald-400 bg-emerald-50' : 'border-zinc-200 hover:border-emerald-300 hover:bg-zinc-50'
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

function PreviewTable({ rows, onChange, onToggle, onToggleAll }) {
  const allSelected = rows.every(r => r.selected)

  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="px-4 py-2 text-left w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(!allSelected)}
                className="rounded"
              />
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
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={() => onToggle(i)}
                  className="rounded"
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  className="w-full border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  value={row.name}
                  onChange={e => onChange(i, 'name', e.target.value)}
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  className="w-full border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  value={row.price}
                  onChange={e => onChange(i, 'price', parseFloat(e.target.value) || 0)}
                />
              </td>
              <td className="px-2 py-1.5">
                <select
                  className="w-full border border-zinc-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                  value={row.unit}
                  onChange={e => onChange(i, 'unit', e.target.value)}
                >
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td className="px-2 py-1.5">
                <select
                  className="w-full border border-zinc-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                  value={row.category}
                  onChange={e => onChange(i, 'category', e.target.value)}
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </td>
              <td className="px-2 py-1.5">
                <button
                  onClick={() => onChange(i, '_delete', true)}
                  className="text-zinc-300 hover:text-red-400 transition-colors"
                >
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
  const [phase, setPhase]       = useState('upload')   // upload | parsing | preview | importing | done
  const [fileName, setFileName] = useState('')
  const [imgPreview, setImgPreview] = useState(null)   // data-URL for image thumbnail
  const [ocrPct, setOcrPct]     = useState(0)          // 0-100 during OCR
  const [useHindi, setUseHindi] = useState(false)
  const [rows, setRows]         = useState([])
  const [errMsg, setErrMsg]     = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  async function handleFile(file) {
    setFileName(file.name)
    setPhase('parsing')
    setErrMsg('')
    setOcrPct(0)
    setImgPreview(null)

    // Show image thumbnail immediately
    if (isImage(file.name)) {
      const reader = new FileReader()
      reader.onload = e => setImgPreview(e.target.result)
      reader.readAsDataURL(file)
    }

    try {
      const lang = useHindi ? 'hin+eng' : 'eng'
      const parsed = await parseFile(file, {
        lang,
        onProgress: pct => setOcrPct(pct),
      })
      if (!parsed.length) {
        setErrMsg('No products could be parsed from this file. Check the format and try again.')
        setPhase('upload')
        return
      }
      setRows(parsed.map(p => ({ ...p, selected: true })))
      setPhase('preview')
    } catch (e) {
      setErrMsg(e.message)
      setPhase('upload')
    }
  }

  function changeRow(i, key, value) {
    if (key === '_delete') {
      setRows(r => r.filter((_, idx) => idx !== i))
      return
    }
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: value } : row))
  }

  function toggleRow(i)        { setRows(r => r.map((row, idx) => idx === i ? { ...row, selected: !row.selected } : row)) }
  function toggleAll(val)      { setRows(r => r.map(row => ({ ...row, selected: val }))) }

  async function runImport() {
    const toImport = rows.filter(r => r.selected && r.name.trim())
    if (!toImport.length) return

    setProgress({ done: 0, total: toImport.length })
    setPhase('importing')

    let done = 0
    for (const row of toImport) {
      try {
        await addProduct({
          name:     row.name.trim(),
          price:    row.price,
          unit:     row.unit,
          category: row.category,
          inStock:  true,
          aliases:  [],
        })
      } catch { /* skip duplicates / errors silently */ }
      done++
      setProgress({ done, total: toImport.length })
    }

    setPhase('done')
  }

  const selectedCount = rows.filter(r => r.selected).length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-100 flex-shrink-0">
          <div>
            <p className="font-bold text-zinc-900 text-sm">Import Products</p>
            {fileName && <p className="text-xs text-zinc-400 mt-0.5">{EXT_ICON[extOf(fileName)] ?? '📁'} {fileName}</p>}
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
                  {[
                    { icon: '📊', label: 'Excel / CSV', desc: '.xlsx  .xls  .csv' },
                    { icon: '📄', label: 'PDF price list', desc: 'Text-based PDFs' },
                    { icon: '📝', label: 'Word document', desc: '.docx  (not .doc)' },
                    { icon: '📃', label: 'Plain text', desc: '.txt  one item per line' },
                    { icon: '🖼️', label: 'Photo / Screenshot', desc: 'JPG  PNG  WebP — OCR' },
                    { icon: '📱', label: 'WhatsApp screenshot', desc: 'Printed text — fast scan' },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-2.5 bg-zinc-50 rounded-xl px-3 py-2.5">
                      <span className="text-xl">{f.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-zinc-700">{f.label}</p>
                        <p className="text-[10px] text-zinc-400">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hindi OCR toggle */}
              <div className="flex items-center justify-between bg-zinc-50 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                    <Languages size={13} /> Hindi OCR (Devanagari)
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Enable for handwritten Hindi price lists (~10 MB extra)</p>
                </div>
                <button
                  onClick={() => setUseHindi(h => !h)}
                  className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${useHindi ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${useHindi ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-amber-800">Tips for best results</p>
                <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                  <li>Excel: use columns named "Product", "Price", "Unit"</li>
                  <li>PDF/Text: one product per line, price as a number</li>
                  <li>Images: good lighting, flat surface, clear text</li>
                  <li>Example: "Parle-G  10" or "Amul Milk 500ml  28"</li>
                </ul>
              </div>
            </>
          )}

          {/* ── Parsing ── */}
          {phase === 'parsing' && (
            <div className="flex flex-col items-center py-10 gap-4">
              {imgPreview ? (
                <img src={imgPreview} alt="scan" className="w-32 h-32 object-cover rounded-2xl border border-zinc-100 shadow-sm" />
              ) : (
                <Loader2 size={32} className="text-emerald-500 animate-spin" />
              )}
              <div className="text-center">
                <p className="font-semibold text-zinc-800 text-sm">
                  {imgPreview ? 'Reading image with OCR…' : 'Reading file…'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">{fileName}</p>
                {imgPreview && useHindi && (
                  <p className="text-[10px] text-zinc-400 mt-1">Downloading Hindi model (~10 MB on first use)</p>
                )}
              </div>
              {imgPreview && (
                <div className="w-full space-y-1">
                  <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${ocrPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-400 text-right">{ocrPct}%</p>
                </div>
              )}
            </div>
          )}

          {/* ── Preview ── */}
          {phase === 'preview' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-500">
                  {rows.length} products found · {selectedCount} selected
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPhase('upload'); setRows([]); setFileName('') }}
                    className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-1.5 rounded-lg"
                  >
                    Change file
                  </button>
                </div>
              </div>

              <PreviewTable
                rows={rows}
                onChange={changeRow}
                onToggle={toggleRow}
                onToggleAll={toggleAll}
              />
            </>
          )}

          {/* ── Importing ── */}
          {phase === 'importing' && (
            <div className="flex flex-col items-center py-16 gap-4">
              <Loader2 size={32} className="text-emerald-500 animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-zinc-800 text-sm">
                  Importing {progress.done} / {progress.total}…
                </p>
              </div>
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

        {/* Footer — only shown in preview */}
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
