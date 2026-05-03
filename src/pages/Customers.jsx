import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Users, Phone, X, ChevronDown, ChevronUp } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import WAButton from '../components/WAButton'
import { sendUdhaarReminder, sendUdhaarThankYou, waLink } from '../utils/whatsapp'

export default function Customers() {
  const customers   = useStore(s => s.customers)
  const orders      = useStore(s => s.orders)
  const addCustomer = useStore(s => s.addCustomer)
  const addUdhaar   = useStore(s => s.addUdhaar)
  const clearUdhaar = useStore(s => s.clearUdhaar)
  const toast       = useToast()
  const [params]    = useSearchParams()

  const [search, setSearch]     = useState('')
  const [showAdd, setShowAdd]   = useState(params.get('add') === '1')
  const [expandedId, setExpandedId] = useState(null)
  const [form, setForm]         = useState({ name: '', phone: '', notes: '' })
  const [udhaarInput, setUdhaarInput] = useState({})

  const filtered  = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )
  const totalDue  = customers.reduce((s, c) => s + (c.udhaar || 0), 0)

  async function addNewCustomer() {
    if (!form.name.trim()) return toast('Enter customer name', 'error')
    if (form.phone && form.phone.replace(/\D/g, '').length < 10) return toast('Enter a valid number', 'error')
    try {
      await addCustomer({ ...form }); toast(`${form.name} added`, 'success')
      setForm({ name: '', phone: '', notes: '' }); setShowAdd(false)
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleAddUdhaar(cust) {
    const amt = parseFloat(udhaarInput[cust.id] || '')
    if (!amt || amt <= 0) return toast('Enter a valid amount', 'error')
    try {
      await addUdhaar(cust.id, amt)
      setUdhaarInput(u => ({ ...u, [cust.id]: '' }))
      toast(`₹${amt} added to ${cust.name}'s udhaar`, 'info')
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleClearUdhaar(cust) {
    const amt = parseFloat(udhaarInput[cust.id] || '') || cust.udhaar
    if (!amt || amt <= 0) return toast('No udhaar to clear', 'error')
    try {
      await clearUdhaar(cust.id, amt)
      if (cust.phone) window.open(sendUdhaarThankYou(cust.phone, cust.name, amt), '_blank')
      setUdhaarInput(u => ({ ...u, [cust.id]: '' }))
      toast(`Payment recorded for ${cust.name}`, 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  function customerOrders(cust) {
    return orders.filter(o =>
      o.customerPhone === cust.phone || o.customerName?.toLowerCase() === cust.name.toLowerCase()
    ).slice(0, 5)
  }

  return (
    <div className="pb-32 min-h-full animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#f5f5f0]/95 backdrop-blur-md border-b border-zinc-100/80"
           style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
        <div className="px-4 py-3.5 flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">Customers</h1>
            {totalDue > 0 && (
              <p className="text-[11px] font-bold text-orange-500 mt-0.5">₹{totalDue.toLocaleString('en-IN')} udhaar due</p>
            )}
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="btn-primary py-2 px-4 text-sm w-auto flex items-center gap-1.5"
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">

      {/* Add customer form */}
      {showAdd && (
        <div className="card-elevated space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="font-bold text-zinc-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <Users size={14} className="text-orange-500" />
              </span>
              New Customer
            </p>
            <button onClick={() => setShowAdd(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">Name *</label>
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
            <input className="input-field" placeholder="Regular, delivers at 9am…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <button onClick={addNewCustomer} className="btn-primary py-3 text-sm">Save Customer</button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input className="input-field pl-10 text-sm" placeholder="Search by name or number…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users size={28} strokeWidth={1.4} className="text-zinc-300" />
          </div>
          <p className="text-sm font-semibold text-zinc-400">No customers yet</p>
          <p className="text-xs text-zinc-300">Add your regulars to track udhaar</p>
        </div>
      )}

      {/* Customers list */}
      <div className="space-y-3">
        {filtered.map(cust => {
          const expanded  = expandedId === cust.id
          const custOrders = customerOrders(cust)
          const hasUdhaar = (cust.udhaar || 0) > 0

          return (
            <div key={cust.id} className="card space-y-3 animate-fade-up">
              {/* Customer header */}
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${hasUdhaar ? 'bg-orange-100' : 'bg-zinc-100'}`}>
                  <span className={`font-bold text-base ${hasUdhaar ? 'text-orange-600' : 'text-zinc-600'}`}>{cust.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm">{cust.name}</p>
                  {cust.phone && (
                    <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                      <Phone size={11} /> +91 {cust.phone}
                    </p>
                  )}
                  {cust.notes && <p className="text-xs text-zinc-400 truncate mt-0.5">{cust.notes}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {cust.udhaar > 0 ? (
                    <p className="text-sm font-bold text-orange-500">₹{cust.udhaar} due</p>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-500">✓ Clear</p>
                  )}
                </div>
              </div>

              {/* Udhaar controls */}
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 py-2 text-sm"
                  type="number" inputMode="numeric" placeholder="Amount ₹"
                  value={udhaarInput[cust.id] || ''}
                  onChange={e => setUdhaarInput(u => ({ ...u, [cust.id]: e.target.value }))}
                />
                <button
                  onClick={() => handleAddUdhaar(cust)}
                  className="px-3 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold active:scale-95 transition-transform whitespace-nowrap"
                >
                  + Udhaar
                </button>
                {cust.udhaar > 0 && (
                  <button
                    onClick={() => handleClearUdhaar(cust)}
                    className="px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold active:scale-95 transition-transform whitespace-nowrap"
                  >
                    Paid ✓
                  </button>
                )}
              </div>

              {/* WhatsApp actions */}
              {cust.phone && (
                <div className="flex gap-2">
                  {cust.udhaar > 0 && (
                    <WAButton
                      href={sendUdhaarReminder(cust.phone, cust.name, cust.udhaar)}
                      label="Send Reminder"
                      className="flex-1 !text-orange-600 !bg-orange-50 hover:!bg-orange-100"
                    />
                  )}
                  <WAButton
                    href={waLink(cust.phone, `Namaste ${cust.name} ji! 🙏`)}
                    label="WhatsApp"
                    className="flex-1"
                  />
                </div>
              )}

              {/* Order history */}
              {custOrders.length > 0 && (
                <>
                  <button
                    onClick={() => setExpandedId(expanded ? null : cust.id)}
                    className="w-full flex items-center justify-between text-xs text-zinc-400 font-semibold pt-2 border-t border-zinc-50"
                  >
                    <span>{custOrders.length} recent order{custOrders.length > 1 ? 's' : ''}</span>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expanded && (
                    <div className="space-y-1.5">
                      {custOrders.map(o => (
                        <div key={o.id} className="flex justify-between text-xs bg-zinc-50 rounded-lg px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-700">{o.items?.length} items</span>
                            <span className="text-zinc-400">{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-800">₹{o.total}</span>
                            <span className={`badge ${o.status === 'credit' ? 'status-credit' : 'status-confirmed'}`}>{o.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      </div>{/* end page content */}
    </div>
  )
}
