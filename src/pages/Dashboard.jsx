import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, Pencil, Phone, Store, MessageSquare, AlertTriangle, Users, ChevronRight, Wifi, WifiOff,
} from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import WASetup from '../components/WASetup'
import { api } from '../api/client'

/**
 * Profile = shop identity, status, and at-a-glance "things needing attention"
 * (Bakaya Customers + Khatam Saamaan). Order Book / Khaata / Saamaan handle
 * the operational flows; Profile is where the shopkeeper checks-in on the
 * shop itself.
 */
export default function Dashboard() {
  const shopName       = useStore(s => s.shopName)
  const ownerPhone     = useStore(s => s.ownerPhone)
  const customers      = useStore(s => s.customers)
  const products       = useStore(s => s.products)
  const logout         = useStore(s => s.logout)
  const updateShopName = useStore(s => s.updateShopName)
  const toast          = useToast()
  const nav            = useNavigate()

  const [waConnected, setWaConnected] = useState(null)   // null = unknown / loading

  // Probe WA status quietly; don't block render if backend unavailable.
  useEffect(() => {
    let cancelled = false
    api.get('/api/whatsapp/status')
      .then(s => { if (!cancelled) setWaConnected(!!s?.connected) })
      .catch(() => { if (!cancelled) setWaConnected(false) })
    return () => { cancelled = true }
  }, [])

  const debtors    = customers.filter(c => (c.udhaar || 0) > 0)
                              .sort((a,b) => (b.udhaar||0) - (a.udhaar||0))
  const totalDue   = debtors.reduce((s,c) => s + (c.udhaar || 0), 0)
  const oosItems   = products.filter(p => !p.inStock)

  function handleEditShopName() {
    const next = window.prompt('Shop ka naam edit karein', shopName || '')
    if (next == null) return
    const trimmed = next.trim()
    if (!trimmed) return toast('Naam khali nahi rakh sakte', 'error')
    if (trimmed === shopName) return
    updateShopName(trimmed)
    toast('Shop ka naam update ho gaya', 'success')
  }

  return (
    <div className="pb-32 min-h-full animate-fade-in">

      {/* Hero: identity */}
      <div
        className="relative overflow-hidden px-4 pt-12 pb-8"
        style={{ background: 'linear-gradient(135deg, #047857 0%, #059669 55%, #10b981 100%)' }}
      >
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-[0.12] bg-white" />
        <div className="absolute bottom-4 -left-8 w-36 h-36 rounded-full opacity-[0.08] bg-white" />

        <div className="relative max-w-lg mx-auto flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4 ring-2 ring-white/30">
            <Store size={28} className="text-white" />
          </div>
          <button
            onClick={handleEditShopName}
            className="group flex items-center gap-2 px-3 py-1 rounded-lg active:bg-white/10 transition-colors"
            title="Naam edit karein"
          >
            <h1 className="text-white text-2xl font-extrabold tracking-tight leading-tight">
              {shopName || 'My Store'}
            </h1>
            <Pencil size={14} className="text-emerald-100/70 group-hover:text-white transition-colors" />
          </button>
          {ownerPhone && (
            <p className="text-emerald-100/80 text-xs font-medium mt-1 flex items-center gap-1.5">
              <Phone size={11} /> +91 {ownerPhone}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 mt-5 max-w-lg mx-auto space-y-5">

        {/* Status row — quick glance health of the shop */}
        <div className="grid grid-cols-2 gap-3">
          <StatusCard
            icon={waConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            label="WhatsApp"
            value={waConnected === null ? '…' : waConnected ? 'Logged in' : 'Logged out'}
            tone={waConnected ? 'emerald' : waConnected === false ? 'amber' : 'zinc'}
          />
          <StatusCard
            icon={<Phone size={14} />}
            label="Phone"
            value={ownerPhone ? `+91 ${ownerPhone}` : 'Not set'}
            tone={ownerPhone ? 'sky' : 'zinc'}
          />
        </div>

        {/* Bakaya Customers — moved here from Orders Summary */}
        {debtors.length > 0 && (
          <div className="card space-y-3">
            <button
              onClick={() => nav('/customers')}
              className="w-full flex items-center gap-2 text-left active:opacity-70"
            >
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <Users size={14} className="text-orange-500" />
              </div>
              <p className="font-bold text-zinc-900 text-sm flex-1">Bakaya Customers</p>
              <span className="font-bold text-orange-500">₹{totalDue.toLocaleString('en-IN')}</span>
              <ChevronRight size={14} className="text-zinc-300" />
            </button>
            <div className="divide-y divide-zinc-50">
              {debtors.slice(0, 5).map(c => (
                <div key={c.id} className="flex justify-between text-sm py-2">
                  <span className="text-zinc-600 truncate pr-2">{c.name}</span>
                  <span className="font-semibold text-zinc-900 flex-shrink-0">₹{c.udhaar}</span>
                </div>
              ))}
              {debtors.length > 5 && (
                <button
                  onClick={() => nav('/customers')}
                  className="w-full text-xs text-zinc-400 pt-2 text-left hover:text-zinc-600"
                >
                  +{debtors.length - 5} aur · Khaata me dekhein
                </button>
              )}
            </div>
          </div>
        )}

        {/* Khatam Saamaan — moved here from Orders Summary */}
        {oosItems.length > 0 && (
          <div className="card space-y-3">
            <button
              onClick={() => nav('/catalog')}
              className="w-full flex items-center gap-2 text-left active:opacity-70"
            >
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle size={14} className="text-red-500" />
              </div>
              <p className="font-bold text-zinc-900 text-sm flex-1">Khatam Saamaan</p>
              <span className="text-xs font-bold text-red-500">{oosItems.length} item</span>
              <ChevronRight size={14} className="text-zinc-300" />
            </button>
            <div className="flex flex-wrap gap-1.5">
              {oosItems.slice(0, 12).map(p => (
                <span key={p.id} className="px-2.5 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-xs font-medium">{p.name}</span>
              ))}
              {oosItems.length > 12 && (
                <span className="px-2.5 py-1 text-xs text-zinc-400">+{oosItems.length - 12} aur</span>
              )}
            </div>
          </div>
        )}

        {/* WhatsApp setup card (full UI for QR scan / disconnect) */}
        <div className="space-y-2">
          <p className="section-label px-1 flex items-center gap-1.5">
            <MessageSquare size={11} /> WhatsApp Setup
          </p>
          <WASetup />
        </div>

        {/* Account / Logout */}
        <div className="space-y-2">
          <p className="section-label px-1">Account</p>
          <div className="card p-0 overflow-hidden divide-y divide-zinc-50/80">
            <button
              onClick={handleEditShopName}
              className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-zinc-50 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Pencil size={14} className="text-emerald-600" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">Shop ka naam edit karein</p>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">{shopName || '—'}</p>
              </div>
            </button>

            <button
              onClick={logout}
              className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-zinc-50 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <LogOut size={14} className="text-red-500" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">Logout</p>
                <p className="text-xs text-zinc-400 mt-0.5">Account se sign out</p>
              </div>
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-zinc-300 font-medium pt-2">
          Kirana Smart Orders
        </p>
      </div>
    </div>
  )
}

// ── Status card (small) ─────────────────────────────────────────────────────
function StatusCard({ icon, label, value, tone = 'zinc' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50   text-amber-600',
    sky:     'bg-sky-50     text-sky-600',
    zinc:    'bg-zinc-100   text-zinc-500',
  }
  return (
    <div className="card-elevated">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${tones[tone]}`}>
        {icon}
      </div>
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-extrabold text-zinc-900 mt-0.5 truncate">{value}</p>
    </div>
  )
}
