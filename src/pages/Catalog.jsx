import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, X, Package, Edit2, Trash2, ToggleLeft, ToggleRight, Upload } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import VoiceButton from '../components/VoiceButton'
import FileImportModal from '../components/FileImportModal'
import { parseCatalogCommand } from '../utils/speech'

const CATEGORIES = ['All', 'Staples', 'Dairy', 'Biscuits', 'Snacks', 'Noodles', 'Beverages', 'Household', 'Other']

export default function Catalog() {
  const products      = useStore(s => s.products)
  const addProduct    = useStore(s => s.addProduct)
  const updateProduct = useStore(s => s.updateProduct)
  const deleteProduct = useStore(s => s.deleteProduct)
  const toggleStock   = useStore(s => s.toggleStock)
  const toast         = useToast()
  const [params]      = useSearchParams()

  const [search, setSearch]   = useState('')
  const [category, setCategory] = useState('All')
  const [showAdd, setShowAdd]     = useState(params.get('add') === '1')
  const [editId, setEditId]       = useState(null)
  const [voiceText, setVoiceText] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [form, setForm] = useState({ name: '', price: '', unit: 'packet', category: 'Other', inStock: true })

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.aliases || []).some(a => a.toLowerCase().includes(search.toLowerCase()))
    const matchCat = category === 'All' || p.category === category
    return matchSearch && matchCat
  })

  useEffect(() => {
    const ep = editId ? products.find(p => p.id === editId) : null
    if (ep) setForm({ name: ep.name, price: String(ep.price), unit: ep.unit || 'packet', category: ep.category || 'Other', inStock: ep.inStock })
  }, [editId])

  async function handleVoiceResult(text) {
    setVoiceText(text)
    const cmd = parseCatalogCommand(text)
    if (cmd.action === 'add') {
      setForm(f => ({ ...f, name: cmd.name || '', price: String(cmd.price || ''), inStock: cmd.inStock }))
      setShowAdd(true)
      toast('Voice recognised — review and save', 'info')
    } else if (cmd.action === 'setOOS' || cmd.action === 'setStock') {
      const match = products.find(p =>
        p.name.toLowerCase().includes(cmd.name) || (p.aliases || []).some(a => a.toLowerCase().includes(cmd.name))
      )
      if (match) {
        try { await updateProduct(match.id, { inStock: cmd.inStock }); toast(`${match.name} updated`, 'success') }
        catch (e) { toast(e.message, 'error') }
      } else { toast('Product not found', 'error') }
    } else {
      setForm(f => ({ ...f, name: text })); setShowAdd(true)
    }
  }

  async function saveProduct() {
    if (!form.name.trim()) return toast('Enter product name', 'error')
    const price = parseFloat(form.price)
    if (isNaN(price)) return toast('Enter a valid price', 'error')
    try {
      if (editId) {
        await updateProduct(editId, { ...form, price }); toast('Product updated', 'success'); setEditId(null)
      } else {
        await addProduct({ ...form, price, aliases: [] }); toast(`${form.name} added`, 'success'); setShowAdd(false)
      }
      setForm({ name: '', price: '', unit: 'packet', category: 'Other', inStock: true })
    } catch (e) { toast(e.message, 'error') }
  }

  async function handlePasteParse() {
    if (!pasteText.trim()) return
    const lines = pasteText.split(/\n|,|;/).map(l => l.trim()).filter(Boolean)
    let added = 0
    for (const line of lines) {
      const priceMatch = line.match(/(\d+)/)
      const price = priceMatch ? parseInt(priceMatch[1]) : 0
      const name = line.replace(/\d+\s*(rs|₹|rupees?)?/gi, '').trim()
      if (name.length > 1) {
        try { await addProduct({ name, price, unit: 'packet', category: 'Other', inStock: true, aliases: [] }); added++ }
        catch { /* skip */ }
      }
    }
    toast(`${added} products added`, 'success'); setPasteText(''); setShowPaste(false)
  }

  async function handleDelete(p) {
    if (!window.confirm(`Delete "${p.name}"?`)) return
    try { await deleteProduct(p.id); toast(`${p.name} deleted`, 'info') }
    catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="pb-32 min-h-full animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#f5f5f0]/95 backdrop-blur-md border-b border-zinc-100/80"
           style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
        <div className="px-4 py-3.5 flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">Saamaan</h1>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowPaste(!showPaste)}
              className="text-xs bg-white border border-zinc-200 text-zinc-600 px-3 py-2 rounded-xl font-semibold active:scale-95 transition-transform"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              Paste
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1 text-xs bg-white border border-zinc-200 text-zinc-600 px-3 py-2 rounded-xl font-semibold active:scale-95 transition-transform"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              <Upload size={13} /> Import
            </button>
            <button
              onClick={() => { setShowAdd(!showAdd); setEditId(null) }}
              className="btn-primary py-2 px-3.5 text-xs w-auto flex items-center gap-1"
            >
              <Plus size={14} /> Naya
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">

      {/* Paste import */}
      {showPaste && (
        <div className="card-elevated space-y-3 animate-slide-up">
          <p className="font-semibold text-zinc-800 text-sm">Paste from WhatsApp</p>
          <p className="text-xs text-zinc-400">One item per line, e.g. "Parle-G 10"</p>
          <textarea
            className="input-field h-24 resize-none text-sm"
            placeholder={"Parle-G 10\nMaggi 14\nMilk 28"}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={handlePasteParse} className="btn-primary py-2.5 text-sm">Import</button>
            <button onClick={() => setShowPaste(false)} className="btn-secondary py-2.5 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {(showAdd || editId) && (
        <div className="card-elevated space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="font-bold text-zinc-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center">
                <Package size={14} className="text-sky-600" />
              </span>
              {editId ? 'Edit Product' : 'Add Product'}
            </p>
            <button onClick={() => { setShowAdd(false); setEditId(null) }} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">Product Name *</label>
            <input className="input-field" placeholder="e.g. Parle-G" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">Price (₹) *</label>
              <input className="input-field" type="number" inputMode="numeric" placeholder="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">Unit</label>
              <select className="input-field" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {['packet', 'kg', 'g', 'litre', 'ml', 'pc', 'dozen', 'box', 'bar'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-500">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.slice(1).map(cat => (
                <button
                  key={cat}
                  onClick={() => setForm(f => ({ ...f, category: cat }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    form.category === cat ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setForm(f => ({ ...f, inStock: !f.inStock }))}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              form.inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {form.inStock ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {form.inStock ? 'In Stock' : 'Out of Stock'}
          </button>

          <button onClick={saveProduct} className="btn-primary py-3 text-sm">
            {editId ? 'Save Changes' : 'Add to Catalog'}
          </button>
        </div>
      )}

      {/* Voice */}
      <div className="card flex flex-col items-center py-6 gap-3"
           style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)' }}>
        <VoiceButton onResult={handleVoiceResult} size="md" label="Speak to add or update" />
        <div className="text-center">
          <p className="text-xs font-semibold text-emerald-700">Voice commands</p>
          <p className="text-xs text-zinc-400 mt-0.5">"Add Maggi 14 rupees" · "Mark Parle-G out of stock"</p>
        </div>
        {voiceText && <p className="text-xs text-zinc-600 italic bg-white/70 px-3 py-2 rounded-xl w-full text-center">"{voiceText}"</p>}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input className="input-field pl-10 text-sm" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Category tab bar */}
      <div className="seg-bar">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)} className={`seg-item ${category === cat ? 'seg-item-active' : ''}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* File import modal */}
      {showImport && (
        <FileImportModal
          addProduct={addProduct}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Package size={28} strokeWidth={1.4} className="text-zinc-300" />
          </div>
          <p className="text-sm font-semibold text-zinc-400">Koi saamaan nahi mila</p>
          <p className="text-xs text-zinc-300">Upar Add pe tap karke pehla item daalein</p>
          <p className="text-[11px] text-zinc-300 mt-3">💡 Tile pe stock dot tap karke turant in/out toggle karein</p>
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
                try { await toggleStock(p.id) }
                catch (e) { toast(e.message, 'error') }
              }}
            />
          ))}
        </div>
      )}

      </div>{/* end page content */}
    </div>
  )
}

// Tile-style product card. Tap stock dot → instant toggle. Tap card → edit.
// Long-press → quick action menu (delete).
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
      className={`relative card p-3 flex flex-col justify-between gap-2 min-h-[110px] transition-opacity ${
        !product.inStock ? 'opacity-60' : ''
      }`}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
    >
      {/* Stock dot — top right, tap to toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className={`absolute top-2.5 right-2.5 w-3.5 h-3.5 rounded-full transition-colors ${
          product.inStock ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-red-400 ring-4 ring-red-100'
        }`}
        title={product.inStock ? 'Stock me — tap to mark Khatam' : 'Khatam — tap to mark Stock me'}
      />

      <div className="pr-6 cursor-pointer" onClick={onEdit}>
        <p className="font-bold text-zinc-900 text-sm leading-tight line-clamp-2">{product.name}</p>
        <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mt-1">{product.category}</p>
      </div>

      <div className="flex items-end justify-between">
        <p className="text-base font-extrabold text-zinc-900 tabular-nums">
          ₹{product.price}
          <span className="text-[10px] text-zinc-400 font-medium ml-1">/ {product.unit}</span>
        </p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          product.inStock ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
        }`}>
          {product.inStock ? 'Stock me' : 'Khatam'}
        </span>
      </div>

      {/* Long-press menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="absolute top-2 right-2 z-40 bg-white rounded-xl py-1.5 min-w-[120px]"
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
