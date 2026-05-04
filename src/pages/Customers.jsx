import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, X, Phone, BookOpen, MessageCircle } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import { sendUdhaarReminder, sendUdhaarThankYou, waLink } from '../utils/whatsapp'

// Khaata = customers + udhaar combined.
// Sort: Sabse Bada (largest) / Sabse Purana (oldest) / Naya (recent) / A–Z
// Filter: only show customers with udhaar by default (the most common need).
const SORTS = [
  { id: 'big',    label: 'Sabse Bada',   tip: 'Highest udhaar first' },
  { id: 'old',    label: 'Sabse Purana', tip: 'Oldest customer first' },
  { id: 'recent', label: 'Naya',         tip: 'Recently added first' },
  { id: 'az',     label: 'A–Z',          tip: 'By name' },
]

// Color tier for udhaar amount + recency
function tierFor(udhaar, daysOld) {
  if (!udhaar || udhaar <= 0) return 'clear'
  if (udhaar >= 1000 || daysOld >= 30) return 'red'
  if (udhaar >=  500 || daysOld >= 15) return 'amber'
  return 'green'
}

const TIER = {
  clear: { dot: 'bg-emerald-400',  text: 'text-emerald-600',  bg: 'bg-emerald-50' },
  green: { dot: 'bg-emerald-400',  text: 'text-emerald-600',  bg: 'bg-emerald-50' },
  amber: { dot: 'bg-amber-400',    text: 'text-amber-600',    bg: 'bg-amber-50'   },
  red:   { dot: 'bg-red-500',      text: 'text-red-600',      bg: 'bg-red-50'     },
}

export default function Customers() {
  const customers   = useStore(s => s.customers)
  const orders      = useStore(s => s.orders)
  const addCustomer = useStore(s => s.addCustomer)
  const addUdhaar   = useStore(s => s.addUdhaar)
  const clearUdhaar = useStore(s => s.clearUdhaar)
  const toast       = useToast()
  const [params]    = useSearchParams()

  const [search, setSearch]     = useState('')
  const [sort, setSort]         = useState('big')
  const [onlyUdhaar, setOnlyUdhaar] = useState(true)
  const [showAdd, setShowAdd]   = useState(params.get('add') === '1')
  const [openId, setOpenId]     = useState(null)
  const [form, setForm]         = useState({ name: '', phone: '', notes: '' })
  const [paidAmt, setPaidAmt]   = useState({})

  const totalDue = customers.reduce((s, c) => s + (c.udhaar || 0), 0)
  const dueCount = customers.filter(c => (c.udhaar || 0) > 0).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = customers.filter(c => {
      if (onlyUdhaar && (c.udhaar || 0) <= 0) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
    })
    const ordersByCust = (cust) => orders.filter(o =>
      (o.customerPhone && o.customerPhone === cust.phone) ||
      o.customerName?.toLowerCase() === cust.name.toLowerCase()
    )
    const lastOrderDate = (cust) => {
      const co = ordersByCust(cust)
      return co.length ? Math.max(...co.map(o => new Date(o.createdAt).getTime())) : 0
    }
    switch (sort) {
      case 'big':    return list.sort((a,b) => (b.udhaar||0) - (a.udhaar||0))
      case 'old':    return list.sort((a,b) => lastOrderDate(a) - lastOrderDate(b))
      case 'recent': return list.sort((a,b) => lastOrderDate(b) - lastOrderDate(a))
      case 'az':     return list.sort((a,b) => a.name.localeCompare(b.name))
      default:       return list
    }
  }, [customers, orders, search, onlyUdhaar, sort])

  function daysSince(ts) {
    if (!ts) return null
    return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24))
  }
  function lastOrderTs(cust) {
    const co = orders.filter(o =>
      (o.customerPhone && o.customerPhone === cust.phone) ||
      o.customerName?.toLowerCase() === cust.name.toLowerCase()
    )
    return co.length ? Math.max(...co.map(o => new Date(o.createdAt).getTime())) : 0
  }

  async function addNewCustomer() {
    if (!form.name.trim()) return toast('Naam daalein', 'error')
    if (form.phone && form.phone.replace(/\D/g, '').length < 10) return toast('Sahi number daalein', 'error')
    try {
      await addCustomer({ ...form }); toast(`${form.name} jud gaya`, 'success')
      setForm({ name: '', phone: '', notes: '' }); setShowAdd(false)
    } catch (e) { toast(e.message, 'error') }
  }

  function yaadDilao(cust) {
    if (!cust.phone) return toast('Phone number nahi hai', 'error')
    if (!(cust.udhaar > 0)) return
    window.open(sendUdhaarReminder(cust.phone, cust.name, cust.udhaar), '_blank')
  }

  async function paisaAaya(cust, fullPayment = false) {
    const amt = fullPayment ? cust.udhaar : parseFloat(paidAmt[cust.id] || '')
    if (!amt || amt <= 0) return toast('Amount daalein', 'error')
    if (amt > cust.udhaar) return toast('Amount udhaar se zyada hai', 'error')
    try {
      await clearUdhaar(cust.id, amt)
      if (cust.phone) window.open(sendUdhaarThankYou(cust.phone, cust.name, amt), '_blank')
      setPaidAmt(p => ({ ...p, [cust.id]: '' }))
      toast(`₹${amt} mil gaya — dhanyawaad bheja`, 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  async function moreUdhaar(cust) {
    const raw = paidAmt[cust.id]
    const amt = parseFloat(raw || '')
    if (!amt || amt <= 0) return toast('Amount daalein', 'error')
    try {
      await addUdhaar(cust.id, amt)
      setPaidAmt(p => ({ ...p, [cust.id]: '' }))
      toast(`₹${amt} udhaar add ho gaya`, 'info')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="pb-32 min-h-full animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#f5f5f0]/95 backdrop-blur-md border-b border-zinc-100/80"
           style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
        <div className="px-4 py-3.5 flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">Khaata</h1>
            {totalDue > 0 ? (
              <p className="text-[11px] font-bold text-orange-500 mt-0.5">
                ₹{totalDue.toLocaleString('en-IN')} bakaya · {dueCount} customer
              </p>
            ) : (
              <p className="text-[11px] font-bold text-emerald-500 mt-0.5">Hisaab saaf ✓</p>
            )}
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="btn-primary py-2 px-4 text-sm w-auto flex items-center gap-1.5"
          >
            <Plus size={15} /> Naya
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">

      {/* Total bakaya hero — only if there's any */}
      {totalDue > 0 && (
        <div
          className="rounded-2xl p-4 text-white"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
        >
          <p className="text-xs font-semibold text-orange-100/90 uppercase tracking-wider">Total Bakaya</p>
          <p className="text-3xl font-extrabold tracking-tight mt-0.5">
            ₹{totalDue.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-orange-100/90 mt-1">
            {dueCount} customer ka udhaar pending hai
          </p>
        </div>
      )}

      {/* Add customer form */}
      {showAdd && (
        <div className="card-elevated space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="font-bold text-zinc-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <BookOpen size={14} className="text-orange-500" />
              </span>
              Naya Customer
            </p>
            <button onClick={() => setShowAdd(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">Naam *</label>
            <input className="input-field" placeholder="Ramesh Sharma" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">WhatsApp Number</label>
            <div className="flex gap-2">
              <div className="flex items-center justify-center bg-zinc-50 border border-zinc-200 rounded-xl px-3 text-zinc-500 text-sm font-semibold w-16 flex-shrink-0">
                +91
              </div>
              <input
                className="input-field flex-1"
                type="tel" inputMode="numeric" placeholder="9876543210" maxLength={10}
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">Notes</label>
            <input className="input-field" placeholder="Roz subah aata hai…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <button onClick={addNewCustomer} className="btn-primary py-3 text-sm">Save Customer</button>
        </div>
      )}

      {/* Filter pill — only-udhaar toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setOnlyUdhaar(!onlyUdhaar)}
          className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
            onlyUdhaar ? 'bg-orange-500 text-white' : 'bg-white border border-zinc-200 text-zinc-500'
          }`}
        >
          {onlyUdhaar ? 'Sirf Udhaar Wale ▾' : 'Sab Customer ▾'}
        </button>
      </div>

      {/* Sort chips */}
      <div className="seg-bar">
        {SORTS.map(s => (
          <button
            key={s.id}
            onClick={() => setSort(s.id)}
            className={`seg-item ${sort === s.id ? 'seg-item-active' : ''}`}
            title={s.tip}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input className="input-field pl-10 text-sm" placeholder="Naam ya number se dhoondein…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <BookOpen size={28} strokeWidth={1.4} className="text-zinc-300" />
          </div>
          <p className="text-sm font-semibold text-zinc-400">
            {onlyUdhaar ? 'Kisi ka udhaar nahi hai 🎉' : 'Koi customer nahi hai abhi'}
          </p>
          <p className="text-xs text-zinc-300">
            {onlyUdhaar ? 'Sab customer dekhne ke liye filter hatao' : 'Naya pe tap karke pehla add karein'}
          </p>
        </div>
      )}

      {/* Customer list */}
      <div className="space-y-2.5">
        {filtered.map(cust => {
          const udhaar = cust.udhaar || 0
          const lastTs = lastOrderTs(cust)
          const days = daysSince(lastTs)
          const tier = tierFor(udhaar, days || 0)
          const T = TIER[tier]
          const open = openId === cust.id
          const initials = cust.name.split(/\s+/).slice(0,2).map(s => s[0]).join('').toUpperCase()

          return (
            <div key={cust.id} className="card p-0 overflow-hidden animate-fade-up">
              {/* Compact row — tap to open detail */}
              <button
                onClick={() => setOpenId(open ? null : cust.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold ${T.bg} ${T.text}`}>
                  {initials || cust.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{cust.name}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {cust.phone ? `+91 ${cust.phone}` : 'Phone nahi'}
                    {days != null && lastTs > 0 && (
                      <> · {days === 0 ? 'Aaj' : `${days} din pehle`}</>
                    )}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {udhaar > 0 ? (
                    <>
                      <p className={`text-base font-extrabold ${T.text}`}>₹{udhaar.toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-zinc-400 font-semibold">bakaya</p>
                    </>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-500">Hisaab Saaf ✓</p>
                  )}
                </div>
              </button>

              {/* Inline actions when open */}
              {open && (
                <div className="px-4 pb-4 space-y-3 border-t border-zinc-50 bg-zinc-50/40">
                  <div className="flex items-center gap-2 pt-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      className="input-field flex-1 py-2 text-sm"
                      placeholder="Amount ₹"
                      value={paidAmt[cust.id] || ''}
                      onChange={e => setPaidAmt(p => ({ ...p, [cust.id]: e.target.value }))}
                    />
                    {udhaar > 0 && (
                      <button
                        onClick={() => paisaAaya(cust, false)}
                        className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold whitespace-nowrap active:scale-95 transition-transform"
                      >
                        Paisa Aaya
                      </button>
                    )}
                    <button
                      onClick={() => moreUdhaar(cust)}
                      className="px-3 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold whitespace-nowrap active:scale-95 transition-transform"
                    >
                      + Udhaar
                    </button>
                  </div>

                  <div className="flex gap-2">
                    {udhaar > 0 && cust.phone && (
                      <button
                        onClick={() => yaadDilao(cust)}
                        className="flex-1 py-2.5 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                      >
                        <MessageCircle size={13} /> Yaad Dilao
                      </button>
                    )}
                    {udhaar > 0 && (
                      <button
                        onClick={() => paisaAaya(cust, true)}
                        className="flex-1 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                      >
                        Pura ₹{udhaar} aaya
                      </button>
                    )}
                    {cust.phone && udhaar <= 0 && (
                      <a
                        href={waLink(cust.phone, `Namaste ${cust.name} ji! 🙏`)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                      >
                        <Phone size={13} /> WhatsApp
                      </a>
                    )}
                  </div>

                  {cust.notes && (
                    <p className="text-xs text-zinc-500 italic bg-white rounded-lg px-3 py-2">
                      {cust.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      </div>{/* end page content */}
    </div>
  )
}
