import { useState, useEffect } from 'react'
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
    <div className="px-4 pt-6 pb-28 space-y-5 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Catalog</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPaste(!showPaste)}
            className="text-sm bg-zinc-100 text-zinc-600 px-3 py-2 rounded-xl font-semibold active:scale-95 transition-transform"
          >
            Paste
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 text-sm bg-zinc-100 text-zinc-600 px-3 py-2 rounded-xl font-semibold active:scale-95 transition-transform"
          >
            <Upload size={14} /> Import
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setEditId(null) }}
            className="flex items-center gap-1.5 bg-emerald-500 text-white px-3.5 py-2 rounded-xl font-semibold text-sm active:scale-95 transition-transform shadow-sm shadow-emerald-100"
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Paste import */}
      {showPaste && (
        <div className="card space-y-3">
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
        <div className="card space-y-4 border-emerald-100">
          <div className="flex items-center justify-between">
            <p className="font-bold text-zinc-900 text-sm">{editId ? 'Edit Product' : 'Add Product'}</p>
            <button onClick={() => { setShowAdd(false); setEditId(null) }} className="text-zinc-400 hover:text-zinc-600 transition-colors">
              <X size={18} />
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
      <div className="card flex flex-col items-center py-5 gap-3 border-dashed">
        <VoiceButton onResult={handleVoiceResult} size="md" label="Speak to add or update" />
        <p className="text-xs text-zinc-400 text-center">Try: "Add Maggi 14 rupees" or "Mark Parle-G out of stock"</p>
        {voiceText && <p className="text-xs text-zinc-500 italic bg-zinc-50 px-3 py-2 rounded-lg">"{voiceText}"</p>}
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

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-zinc-300">
          <Package size={36} strokeWidth={1.2} className="mb-3" />
          <p className="font-semibold text-zinc-400">No products found</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden divide-y divide-zinc-50">
          {filtered.map(p => (
            <ProductRow
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
    </div>
  )
}

function ProductRow({ product, onEdit, onDelete, onToggle }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 ${!product.inStock ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-zinc-800 text-sm truncate">{product.name}</p>
          {!product.inStock && <span className="badge bg-red-50 text-red-500 flex-shrink-0">OOS</span>}
        </div>
        <p className="text-xs text-zinc-400 mt-0.5">₹{product.price} / {product.unit} · {product.category}</p>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button onClick={onToggle} className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-emerald-500 transition-colors">
          {product.inStock ? <ToggleRight size={22} className="text-emerald-500" /> : <ToggleLeft size={22} />}
        </button>
        <button onClick={onEdit} className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-sky-500 transition-colors">
          <Edit2 size={15} />
        </button>
        <button onClick={onDelete} className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-500 transition-colors">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
