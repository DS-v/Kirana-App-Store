import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Users, Phone, ExternalLink, X, ChevronDown, ChevronUp, IndianRupee } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import { sendUdhaarReminder, sendUdhaarThankYou, waLink } from '../utils/whatsapp'

export default function Customers() {
  const customers = useStore(s => s.customers)
  const orders = useStore(s => s.orders)
  const addCustomer = useStore(s => s.addCustomer)
  const addUdhaar = useStore(s => s.addUdhaar)
  const clearUdhaar = useStore(s => s.clearUdhaar)
  const toast = useToast()
  const [params] = useSearchParams()

  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(params.get('add') === '1')
  const [expandedId, setExpandedId] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', notes: '' })
  const [udhaarInput, setUdhaarInput] = useState({}) // id -> amount string

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  )

  const totalDue = customers.reduce((s, c) => s + (c.udhaar || 0), 0)

  async function addNewCustomer() {
    if (!form.name.trim()) return toast('Enter customer name', 'error')
    if (form.phone && form.phone.replace(/\D/g, '').length < 10)
      return toast('Enter a valid 10-digit number', 'error')
    try {
      await addCustomer({ ...form })
      toast(`${form.name} added`, 'success')
      setForm({ name: '', phone: '', notes: '' })
      setShowAdd(false)
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
      o.customerPhone === cust.phone ||
      o.customerName?.toLowerCase() === cust.name.toLowerCase()
    ).slice(0, 5)
  }

  return (
    <div className="px-4 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          {totalDue > 0 && <p className="text-sm text-orange-600 font-medium">₹{totalDue} total udhaar due</p>}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-xl font-medium text-sm active:scale-95 transition-transform"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {/* Add customer form */}
      {showAdd && (
        <div className="card space-y-3 border-green-200">
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-900">New Customer</p>
            <button onClick={() => setShowAdd(false)}><X size={20} className="text-gray-400" /></button>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Name *</label>
            <input className="input-field" placeholder="Ramesh Sharma" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">WhatsApp Number</label>
            <div className="flex gap-2">
              <div className="input-field w-14 text-center font-medium text-gray-600 flex items-center justify-center text-sm">+91</div>
              <input className="input-field flex-1" type="tel" inputMode="numeric" placeholder="9876543210" maxLength={10}
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
            <input className="input-field" placeholder="Regular, delivers at 9am, etc." value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button onClick={addNewCustomer} className="btn-primary py-3">Save Customer</button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input-field pl-10" placeholder="Search by name or number…" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Customers list */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No customers yet</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(cust => {
          const expanded = expandedId === cust.id
          const custOrders = customerOrders(cust)
          return (
            <div key={cust.id} className="card space-y-3">
              {/* Customer header */}
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-700 font-bold text-lg">{cust.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{cust.name}</p>
                  {cust.phone && (
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Phone size={12} /> +91 {cust.phone}
                    </p>
                  )}
                  {cust.notes && <p className="text-xs text-gray-400 truncate">{cust.notes}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {cust.udhaar > 0 ? (
                    <p className="font-bold text-orange-600">₹{cust.udhaar} due</p>
                  ) : (
                    <p className="text-sm text-green-600 font-medium">✓ Clear</p>
                  )}
                </div>
              </div>

              {/* Udhaar management */}
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 py-2"
                  type="number"
                  inputMode="numeric"
                  placeholder="Amount ₹"
                  value={udhaarInput[cust.id] || ''}
                  onChange={e => setUdhaarInput(u => ({ ...u, [cust.id]: e.target.value }))}
                />
                <button
                  onClick={() => handleAddUdhaar(cust)}
                  className="px-3 py-2 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
                >
                  + Udhaar
                </button>
                {cust.udhaar > 0 && (
                  <button
                    onClick={() => handleClearUdhaar(cust)}
                    className="px-3 py-2 bg-green-100 text-green-700 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
                  >
                    Paid ✓
                  </button>
                )}
              </div>

              {/* WhatsApp actions */}
              {cust.phone && (
                <div className="flex gap-2">
                  {cust.udhaar > 0 && (
                    <a
                      href={sendUdhaarReminder(cust.phone, cust.name, cust.udhaar)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 text-center text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 py-2 rounded-xl flex items-center justify-center gap-1"
                    >
                      <ExternalLink size={12} /> Send Reminder
                    </a>
                  )}
                  <a
                    href={waLink(cust.phone, `Namaste ${cust.name} ji! 🙏`)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-center text-xs font-semibold text-green-700 bg-green-50 border border-green-200 py-2 rounded-xl flex items-center justify-center gap-1"
                  >
                    <ExternalLink size={12} /> WhatsApp
                  </a>
                </div>
              )}

              {/* Order history toggle */}
              {custOrders.length > 0 && (
                <>
                  <button
                    onClick={() => setExpandedId(expanded ? null : cust.id)}
                    className="w-full flex items-center justify-between text-sm text-gray-500 pt-2 border-t border-gray-100"
                  >
                    <span>{custOrders.length} recent order{custOrders.length > 1 ? 's' : ''}</span>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {expanded && (
                    <div className="space-y-2">
                      {custOrders.map(o => (
                        <div key={o.id} className="flex justify-between text-sm bg-gray-50 rounded-xl px-3 py-2">
                          <div>
                            <span className="font-medium text-gray-800">{o.items?.length} items</span>
                            <span className="text-gray-400 ml-2">{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">₹{o.total}</span>
                            <span className={`badge ${o.status === 'credit' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                              {o.status}
                            </span>
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
    </div>
  )
}
