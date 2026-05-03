import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Mic, Check, X, Package, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import VoiceButton from '../components/VoiceButton'
import { parseCatalogCommand } from '../utils/speech'

const CATEGORIES = ['All', 'Staples', 'Dairy', 'Biscuits', 'Snacks', 'Noodles', 'Beverages', 'Household', 'Other']

export default function Catalog() {
  const products = useStore(s => s.products)
  const addProduct = useStore(s => s.addProduct)
  const updateProduct = useStore(s => s.updateProduct)
  const deleteProduct = useStore(s => s.deleteProduct)
  const toggleStock = useStore(s => s.toggleStock)
  const toast = useToast()
  const [params] = useSearchParams()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [showAdd, setShowAdd] = useState(params.get('add') === '1')
  const [editId, setEditId] = useState(null)
  const [voiceText, setVoiceText] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  // Add form state
  const [form, setForm] = useState({ name: '', price: '', unit: 'packet', category: 'Other', inStock: true })

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.aliases || []).some(a => a.toLowerCase().includes(search.toLowerCase()))
    const matchCat = category === 'All' || p.category === category
    return matchSearch && matchCat
  })

  const editingProduct = editId ? products.find(p => p.id === editId) : null

  useEffect(() => {
    if (editingProduct) {
      setForm({
        name: editingProduct.name,
        price: String(editingProduct.price),
        unit: editingProduct.unit || 'packet',
        category: editingProduct.category || 'Other',
        inStock: editingProduct.inStock,
      })
    }
  }, [editId])

  async function handleVoiceResult(text) {
    setVoiceText(text)
    const cmd = parseCatalogCommand(text)
    if (cmd.action === 'add') {
      setForm(f => ({ ...f, name: cmd.name || '', price: String(cmd.price || ''), inStock: cmd.inStock }))
      setShowAdd(true)
      toast('Voice command recognised – review and save', 'info')
    } else if (cmd.action === 'setOOS' || cmd.action === 'setStock') {
      const match = products.find(p =>
        p.name.toLowerCase().includes(cmd.name) ||
        (p.aliases || []).some(a => a.toLowerCase().includes(cmd.name))
      )
      if (match) {
        try {
          await updateProduct(match.id, { inStock: cmd.inStock })
          toast(`${match.name} marked ${cmd.inStock ? 'In Stock' : 'Out of Stock'}`, 'success')
        } catch (e) { toast(e.message, 'error') }
      } else {
        toast('Product not found – try searching manually', 'error')
      }
    } else if (cmd.action === 'search') {
      setSearch(cmd.name)
    } else {
      setForm(f => ({ ...f, name: text }))
      setShowAdd(true)
    }
  }

  async function saveProduct() {
    if (!form.name.trim()) return toast('Enter product name', 'error')
    const price = parseFloat(form.price)
    if (isNaN(price)) return toast('Enter a valid price', 'error')
    try {
      if (editId) {
        await updateProduct(editId, { ...form, price })
        toast('Product updated', 'success')
        setEditId(null)
      } else {
        await addProduct({ ...form, price, aliases: [] })
        toast(`${form.name} added to catalog`, 'success')
        setShowAdd(false)
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
        catch { /* skip failures */ }
      }
    }
    toast(`${added} products added from paste`, 'success')
    setPasteText('')
    setShowPaste(false)
  }

  async function handleDelete(p) {
    if (!window.confirm(`Delete "${p.name}"?`)) return
    try {
      await deleteProduct(p.id)
      toast(`${p.name} deleted`, 'info')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="px-4 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Catalog</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPaste(!showPaste)}
            className="text-sm bg-gray-100 text-gray-600 px-3 py-2 rounded-xl font-medium active:scale-95 transition-transform"
          >
            Paste
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setEditId(null) }}
            className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-xl font-medium text-sm active:scale-95 transition-transform"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {/* Paste import */}
      {showPaste && (
        <div className="card space-y-3">
          <p className="font-semibold text-gray-800">Paste product list from WhatsApp</p>
          <p className="text-sm text-gray-500">One item per line, e.g. "Parle-G 10 rs"</p>
          <textarea
            className="input-field h-28 resize-none"
            placeholder={"Parle-G 10\nMaggi 14\nMilk 28"}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={handlePasteParse} className="btn-primary py-3 text-base">Import</button>
            <button onClick={() => setShowPaste(false)} className="btn-secondary py-3 text-base">Cancel</button>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {(showAdd || editId) && (
        <div className="card space-y-3 border-green-200">
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-900">{editId ? 'Edit Product' : 'Add Product'}</p>
            <button onClick={() => { setShowAdd(false); setEditId(null) }}><X size={20} className="text-gray-400" /></button>
          </div>

          {/* Voice for name */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Product Name *</label>
              <input className="input-field" placeholder="e.g. Parle-G" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Price (₹) *</label>
              <input className="input-field" type="number" inputMode="numeric" placeholder="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Unit</label>
              <select className="input-field" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {['packet', 'kg', 'g', 'litre', 'ml', 'pc', 'dozen', 'box', 'bar'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.slice(1).map(cat => (
                <button
                  key={cat}
                  onClick={() => setForm(f => ({ ...f, category: cat }))}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${form.category === cat ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setForm(f => ({ ...f, inStock: !f.inStock }))}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${form.inStock ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
            >
              {form.inStock ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              {form.inStock ? 'In Stock' : 'Out of Stock'}
            </button>
          </div>

          <button onClick={saveProduct} className="btn-primary py-3">
            {editId ? 'Save Changes' : 'Add to Catalog'}
          </button>
        </div>
      )}

      {/* Voice command area */}
      <div className="card flex flex-col items-center py-5 gap-3">
        <p className="text-sm font-semibold text-gray-600">Voice Command</p>
        <VoiceButton onResult={handleVoiceResult} size="md" label="Speak to add or update" />
        <p className="text-xs text-gray-400 text-center">Try: "Add Maggi 14 rupees" or "Mark Parle-G out of stock"</p>
        {voiceText && <p className="text-sm text-gray-700 italic">"{voiceText}"</p>}
      </div>

      {/* Search & filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field pl-10"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${category === cat ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No products found</p>
          </div>
        )}
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
    </div>
  )
}

function ProductRow({ product, onEdit, onDelete, onToggle }) {
  return (
    <div className={`card flex items-center gap-3 ${!product.inStock ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold text-gray-900 truncate min-w-0">{product.name}</p>
          {!product.inStock && <span className="badge bg-red-100 text-red-600 flex-shrink-0">OOS</span>}
        </div>
        <p className="text-sm text-gray-500">₹{product.price} / {product.unit} · {product.category}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onToggle()}
          className="w-10 h-10 flex items-center justify-center rounded-xl"
          title={product.inStock ? 'Mark OOS' : 'Mark In Stock'}
        >
          {product.inStock ? <ToggleRight size={24} className="text-green-500" /> : <ToggleLeft size={24} className="text-gray-400" />}
        </button>
        <button onClick={onEdit} className="w-10 h-10 flex items-center justify-center rounded-xl text-blue-500"><Edit2 size={18} /></button>
        <button onClick={onDelete} className="w-10 h-10 flex items-center justify-center rounded-xl text-red-400"><Trash2 size={18} /></button>
      </div>
    </div>
  )
}
