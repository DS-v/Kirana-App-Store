import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, X, Package, Edit2, Trash2, Upload, Mic, MoreVertical } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import VoiceButton from '../components/VoiceButton'
import FileImportModal from '../components/FileImportModal'
import BottomSheet from '../components/BottomSheet'
import { parseCatalogCommand } from '../utils/speech'
import { CATEGORIES as CAT_LIST, parsePastedCatalog, parseProductLine, guessCategory, guessUnit } from '../utils/fileImport'
import { aiParseCatalog } from '../api/client'

// Tab list (with All prepended)
const CATEGORIES = ['All', ...CAT_LIST]

const SORTS = [
  { id: 'az',         label: 'A → Z' },
  { id: 'za',         label: 'Z → A' },
  { id: 'priceAsc',   label: 'Sasta → Mehnga' },
  { id: 'priceDesc',  label: 'Mehnga → Sasta' },
]

const STOCK_FILTERS = [
  { id: 'all',     label: 'Sab' },
  { id: 'inStock', label: 'Stock me' },
  { id: 'oos',     label: 'Khatam' },
]

const UNITS = ['packet', 'kg', 'g', 'litre', 'ml', 'pc', 'dozen', 'box', 'bar']

export default function Catalog() {
  const products      = useStore(s => s.products)
  const addProduct    = useStore(s => s.addProduct)
  const updateProduct = useStore(s => s.updateProduct)
  const deleteProduct = useStore(s => s.deleteProduct)
  const toggleStock   = useStore(s => s.toggleStock)
  const toast         = useToast()
  const [params]      = useSearchParams()

  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort]         = useState('az')
  // /catalog?stock=oos pre-selects the Khatam filter (deep-link from Profile)
  const [stockFilter, setStockFilter] = useState(
    params.get('stock') === 'oos' ? 'oos' :
    params.get('stock') === 'inStock' ? 'inStock' : 'all'
  )
  const [showAdd, setShowAdd]     = useState(params.get('add') === '1')
  const [editId, setEditId]       = useState(null)
  const [showPaste, setShowPaste] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState([])
  const [pasteSource, setPasteSource] = useState('quick')   // 'quick' | 'ai' | 'ai-loading'
  const [form, setForm] = useState({ name: '', price: '', unit: 'packet', category: 'Other', inStock: true })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = products.filter(p => {
      if (category !== 'All' && p.category !== category) return false
      if (stockFilter === 'inStock' && !p.inStock) return false
      if (stockFilter === 'oos'     &&  p.inStock) return false
      if (q) {
        const hit = p.name.toLowerCase().includes(q) ||
                    (p.aliases || []).some(a => a.toLowerCase().includes(q))
        if (!hit) return false
      }
      return true
    })
    switch (sort) {
      case 'az':        list.sort((a,b) => a.name.localeCompare(b.name)); break
      case 'za':        list.sort((a,b) => b.name.localeCompare(a.name)); break
      case 'priceAsc':  list.sort((a,b) => (a.price||0) - (b.price||0));   break
      case 'priceDesc': list.sort((a,b) => (b.price||0) - (a.price||0));   break
    }
    return list
  }, [products, search, category, sort, stockFilter])

  const inStockCount = products.filter(p => p.inStock).length
  const oosCount     = products.length - inStockCount

  useEffect(() => {
    const ep = editId ? products.find(p => p.id === editId) : null
    if (ep) setForm({ name: ep.name, price: String(ep.price), unit: ep.unit || 'packet', category: ep.category || 'Other', inStock: ep.inStock })
  }, [editId, products])

  // Two-stage paste preview:
  //  1. Instant regex parse (200ms debounce) — never blocks the UI
  //  2. LLM upgrade (1 s debounce) — replaces preview with smarter results
  useEffect(() => {
    if (!showPaste || !pasteText.trim()) {
      setPastePreview([]); setPasteSource('quick'); return
    }

    let cancelled = false
    const quickId = setTimeout(() => {
      if (cancelled) return
      const rows = parsePastedCatalog(pasteText)
      setPastePreview(rows)
      setPasteSource('quick')
    }, 200)

    const aiId = setTimeout(async () => {
      if (cancelled) return
      setPasteSource('ai-loading')
      const aiRows = await aiParseCatalog(pasteText)
      if (cancelled) return
      if (aiRows && aiRows.length) {
        setPastePreview(aiRows)
        setPasteSource('ai')
      } else {
        // LLM failed/unavailable — keep the regex preview
        setPasteSource('quick')
      }
    }, 1000)

    return () => { cancelled = true; clearTimeout(quickId); clearTimeout(aiId) }
  }, [pasteText, showPaste])

  // Apply a parsed row to the form (used by both LLM and regex fallback).
  function applyInferredToForm(row, { stockOverride } = {}) {
    if (!row) return
    setForm(f => ({
      ...f,
      name:     row.name || f.name,
      price:    row.price != null ? String(row.price) : f.price,
      unit:     row.unit || f.unit,
      category: row.category || f.category,
      inStock:  stockOverride !== undefined ? stockOverride : (row.inStock ?? f.inStock),
    }))
  }

  async function handleVoiceResult(text) {
    const cmd = parseCatalogCommand(text)

    // OOS / restock commands run instantly — no LLM round-trip needed.
    if (cmd.action === 'setOOS' || cmd.action === 'setStock') {
      const match = products.find(p =>
        p.name.toLowerCase().includes(cmd.name) || (p.aliases || []).some(a => a.toLowerCase().includes(cmd.name))
      )
      if (match) {
        try { await updateProduct(match.id, { inStock: cmd.inStock }); toast(`${match.name} ${cmd.inStock ? 'stock me' : 'khatam'}`, 'success') }
        catch (e) { toast(e.message, 'error') }
      } else { toast('Saamaan nahi mila', 'error') }
      return
    }

    // Add / unknown → strip command verbs, then ask the LLM. Regex parser is
    // the offline-fast fallback if the network is down.
    const cleaned = text.replace(/^\s*(add|new|naya|daalo|dalo|create|likho|likh)\s+/i, '').trim()
    const stockOverride = cmd.inStock !== undefined ? cmd.inStock : true

    setShowAdd(true)
    // Show what we have from regex while LLM thinks
    const fast = parseProductLine(cleaned)
    if (fast) applyInferredToForm(fast, { stockOverride })
    else applyInferredToForm({ name: cleaned, category: guessCategory(cleaned), unit: guessUnit(text) }, { stockOverride })
    toast(`Recognised: ${fast?.name || cleaned}`, 'info')

    // Upgrade with LLM
    const aiRows = await aiParseCatalog(cleaned)
    if (aiRows && aiRows.length) {
      applyInferredToForm(aiRows[0], { stockOverride })
      toast('AI ne aur acche se samjha ✦', 'success')
    }
  }

  async function saveProduct() {
    if (!form.name.trim()) return toast('Naam daalein', 'error')
    const price = parseFloat(form.price)
    if (isNaN(price)) return toast('Sahi price daalein', 'error')
    try {
      if (editId) {
        await updateProduct(editId, { ...form, price }); toast('Update ho gaya', 'success'); setEditId(null)
      } else {
        await addProduct({ ...form, price, aliases: [] }); toast(`${form.name} jud gaya`, 'success'); setShowAdd(false)
      }
      setForm({ name: '', price: '', unit: 'packet', category: 'Other', inStock: true })
    } catch (e) { toast(e.message, 'error') }
  }

  async function importPaste() {
    if (!pastePreview.length) return toast('Kuch parse nahi hua', 'error')
    let added = 0
    for (const row of pastePreview) {
      try {
        await addProduct({ ...row, aliases: [] })
        added++
      } catch { /* skip dup/invalid */ }
    }
    toast(`${added} saamaan jud gaya`, 'success')
    setPasteText(''); setPastePreview([]); setShowPaste(false)
  }

  async function handleDelete(p) {
    if (!window.confirm(`"${p.name}" delete karein?`)) return
    try { await deleteProduct(p.id); toast(`${p.name} hata diya`, 'info') }
    catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="pb-32 min-h-full animate-fade-in">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#f5f5f0]/95 backdrop-blur-md border-b border-zinc-100/80"
           style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
        <div className="px-4 py-3.5 max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">Saamaan</h1>
              <p className="text-[11px] font-bold text-zinc-400 mt-0.5">
                {inStockCount} stock me · {oosCount > 0 && <span className="text-red-500">{oosCount} khatam</span>}
              </p>
            </div>
            <div className="flex gap-1.5 items-center">
              {/* Compact voice button — same action class as "Naya" */}
              <CompactVoiceButton onResult={handleVoiceResult} />
              <button
                onClick={() => setShowPaste(!showPaste)}
                className="text-xs bg-white border border-zinc-200 text-zinc-600 px-3 py-2 rounded-xl font-semibold active:scale-95 transition-transform"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              >
                Paste
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1 text-xs bg-white border border-zinc-200 text-zinc-600 px-2.5 py-2 rounded-xl font-semibold active:scale-95 transition-transform"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              >
                <Upload size={13} /> Import
              </button>
              <button
                onClick={() => { setShowAdd(!showAdd); setEditId(null) }}
                className="btn-primary py-2 px-3 text-xs w-auto flex items-center gap-1"
              >
                <Plus size={14} /> Naya
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">

        {/* Paste box with live preview */}
        {showPaste && (
          <div className="card-elevated space-y-3 animate-slide-up">
            <div className="flex items-center justify-between">
              <p className="font-bold text-zinc-900 text-sm">WhatsApp / list paste karein</p>
              <button onClick={() => setShowPaste(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100">
                <X size={15} />
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Ek line per item · "Parle-G 10" · "Amul Milk 500ml 28" · "Surf Excel 200g @ ₹45"
            </p>
            <textarea
              className="input-field h-28 resize-none text-sm font-mono"
              placeholder={"Parle-G 10\nMaggi Noodles 14\nAmul Milk 500ml 28"}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
            />
            {(pastePreview.length > 0 || pasteSource === 'ai-loading') && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase">
                    Preview ({pastePreview.length} items)
                  </p>
                  <PasteSourceBadge source={pasteSource} />
                </div>
                <div className="bg-zinc-50 rounded-xl p-2 max-h-40 overflow-y-auto no-scrollbar space-y-1">
                  {pastePreview.slice(0, 8).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-white rounded-lg">
                      <span className="font-semibold text-zinc-800 truncate">{r.name}</span>
                      <span className="flex gap-2 items-center text-zinc-500 flex-shrink-0">
                        <span className="text-[10px] uppercase">{r.category}</span>
                        <span className="text-[10px] text-zinc-400">{r.unit}</span>
                        <span className="font-bold text-zinc-900">₹{r.price}</span>
                      </span>
                    </div>
                  ))}
                  {pastePreview.length > 8 && (
                    <p className="text-[10px] text-zinc-400 text-center pt-1">+{pastePreview.length - 8} aur</p>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={importPaste} disabled={!pastePreview.length}
                className="btn-primary py-2.5 text-sm disabled:opacity-40">
                {pastePreview.length} item add karein
              </button>
              <button onClick={() => { setShowPaste(false); setPasteText('') }}
                className="btn-secondary py-2.5 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Add / Edit form is now a bottom sheet — reachable from any scroll position */}
        <BottomSheet
          open={showAdd || !!editId}
          onClose={() => { setShowAdd(false); setEditId(null) }}
          title={editId ? 'Edit Saamaan' : 'Naya Saamaan'}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">Naam *</label>
              <input className="input-field" placeholder="e.g. Parle-G" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500">Price (₹) *</label>
                <input className="input-field" type="number" inputMode="numeric" placeholder="0"
                  value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500">Unit</label>
                <select className="input-field" value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-500">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {CAT_LIST.map(cat => (
                  <button key={cat} onClick={() => setForm(f => ({ ...f, category: cat }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      form.category === cat ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-600'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => setForm(f => ({ ...f, inStock: !f.inStock }))}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                form.inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
              }`}>
              <span className={`w-3 h-3 rounded-full ${form.inStock ? 'bg-emerald-500' : 'bg-red-400'}`} />
              {form.inStock ? 'Stock me' : 'Khatam'}
            </button>

            <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-1">
              <button onClick={saveProduct} className="btn-primary py-3 text-sm flex-1">
                {editId ? 'Save changes' : 'Catalog me add karein'}
              </button>
              {editId && (
                <button
                  onClick={async () => {
                    const ep = products.find(p => p.id === editId)
                    if (!ep) return
                    if (!window.confirm(`"${ep.name}" delete karein?`)) return
                    try {
                      await deleteProduct(ep.id)
                      toast(`${ep.name} hata diya`, 'info')
                      setEditId(null)
                      setForm({ name: '', price: '', unit: 'packet', category: 'Other', inStock: true })
                    } catch (e) { toast(e.message, 'error') }
                  }}
                  className="px-4 py-3 bg-red-50 text-red-600 rounded-2xl text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-transform"
                  title="Delete saamaan"
                >
                  <Trash2 size={15} /> Delete
                </button>
              )}
            </div>
          </div>
        </BottomSheet>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input className="input-field pl-10 text-sm" placeholder="Saamaan dhoondein…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Category tab bar */}
        <div className="seg-bar">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`seg-item ${category === cat ? 'seg-item-active' : ''}`}>
              {cat === 'All' ? 'Sab' : cat}
            </button>
          ))}
        </div>

        {/* Sort + stock filter row */}
        <div className="flex items-center gap-2">
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="flex-1 input-field py-2 text-xs font-semibold">
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={stockFilter} onChange={e => setStockFilter(e.target.value)}
            className="flex-1 input-field py-2 text-xs font-semibold">
            {STOCK_FILTERS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* File import modal */}
        {showImport && (
          <FileImportModal addProduct={addProduct} onClose={() => setShowImport(false)} />
        )}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Package size={28} strokeWidth={1.4} className="text-zinc-300" />
            </div>
            <p className="text-sm font-semibold text-zinc-400">Koi saamaan nahi mila</p>
            <p className="text-xs text-zinc-300">Filter hatao ya naya add karein</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map(p => (
              <ProductTile
                key={p.id}
                product={p}
                onEdit={() => { setEditId(p.id); setShowAdd(false) }}
                onDelete={() => handleDelete(p)}
                onToggle={async () => {
                  try { await toggleStock(p.id) } catch (e) { toast(e.message, 'error') }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Compact voice button (icon-only, same height as Naya) ───────────────────
function CompactVoiceButton({ onResult }) {
  return <VoiceButton onResult={onResult} size="xs" compact label="Bolo aur add karein" />
}

// Tiny source pill for the paste preview
function PasteSourceBadge({ source }) {
  if (source === 'ai-loading') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
        <span className="w-2.5 h-2.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        AI parsing…
      </span>
    )
  }
  if (source === 'ai') {
    return <span className="text-[10px] font-bold text-emerald-600">✦ AI parsed</span>
  }
  return <span className="text-[10px] font-bold text-zinc-400">Quick parsed</span>
}

// ── Minimal product tile ─────────────────────────────────────────────────────
// name + price up top, big stock toggle pill at bottom, ⋮ menu top-right
// (also opens via long-press anywhere on the tile).
function ProductTile({ product, onEdit, onDelete, onToggle }) {
  const longPressTimer = useRef(null)
  const [showMenu, setShowMenu] = useState(false)

  function handlePressStart() {
    longPressTimer.current = setTimeout(() => setShowMenu(true), 500)
  }
  function handlePressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  return (
    <div
      className={`relative card p-3 flex flex-col justify-between gap-3 min-h-[112px] ${
        !product.inStock ? 'opacity-65' : ''
      }`}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
    >
      {/* Kebab menu — always visible, the obvious way to delete */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowMenu(s => !s) }}
        className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"
        title="Edit / Delete"
      >
        <MoreVertical size={15} />
      </button>

      <div className="cursor-pointer pr-6" onClick={onEdit}>
        <p className="font-bold text-zinc-900 text-[13px] leading-snug line-clamp-2">{product.name}</p>
        <p className="text-base font-extrabold text-zinc-900 tabular-nums mt-1">
          ₹{product.price}
          <span className="text-[10px] text-zinc-400 font-medium ml-1">/ {product.unit}</span>
        </p>
      </div>

      {/* Big stock toggle row — clear, tappable, the primary action on the tile */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
          product.inStock
            ? 'bg-emerald-50 text-emerald-700 active:bg-emerald-100'
            : 'bg-red-50 text-red-600 active:bg-red-100'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${product.inStock ? 'bg-emerald-500' : 'bg-red-400'}`} />
        {product.inStock ? 'Stock me' : 'Khatam'}
      </button>

      {/* Action menu (kebab tap or long-press) */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="absolute top-8 right-2 z-40 bg-white rounded-xl py-1.5 min-w-[130px]"
               style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)' }}>
            <button
              onClick={() => { setShowMenu(false); onEdit() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <Edit2 size={13} /> Edit
            </button>
            <button
              onClick={() => { setShowMenu(false); onDelete() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
