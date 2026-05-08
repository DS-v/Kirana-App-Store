import { useNavigate } from 'react-router-dom'
import {
  LogOut, Pencil, Phone, Store, MessageSquare, AlertTriangle, Users, ChevronRight, CreditCard,
} from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import WASetup from '../components/WASetup'

/**
 * Profile = shop identity, status, and at-a-glance "things needing attention".
 * WhatsApp lives in exactly one place (the WASetup card) — its connected /
 * disconnected state is shown there, not duplicated as a status tile.
 */
export default function Dashboard() {
  const shopName         = useStore(s => s.shopName)
  const ownerPhone       = useStore(s => s.ownerPhone)
  const upiId            = useStore(s => s.upiId)
  const customers        = useStore(s => s.customers)
  const products         = useStore(s => s.products)
  const logout           = useStore(s => s.logout)
  const updateShopName   = useStore(s => s.updateShopName)
  const updateOwnerPhone = useStore(s => s.updateOwnerPhone)
  const updateShopUpi    = useStore(s => s.updateShopUpi)
  const toast            = useToast()
  const nav              = useNavigate()

  const debtors  = customers.filter(c => (c.udhaar || 0) > 0)
                            .sort((a,b) => (b.udhaar||0) - (a.udhaar||0))
  const totalDue = debtors.reduce((s,c) => s + (c.udhaar || 0), 0)
  // Dedupe by name (case-insensitive) — the catalog can legitimately contain
  // duplicates from past imports, but the at-a-glance "Khatam Saamaan" tile
  // should show each item once.
  const oosItems = (() => {
    const seen = new Set()
    return products.filter(p => {
      if (p.inStock) return false
      const key = (p.name || '').trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  function handleEditShopName() {
    const next = window.prompt('Shop ka naam edit karein', shopName || '')
    if (next == null) return
    const trimmed = next.trim()
    if (!trimmed) return toast('Naam khali nahi rakh sakte', 'error')
    if (trimmed === shopName) return
    updateShopName(trimmed)
    toast('Shop ka naam update ho gaya', 'success')
  }

  function handleEditPhone() {
    const next = window.prompt('Owner phone number (10 digits)', ownerPhone || '')
    if (next == null) return
    const digits = next.replace(/\D/g, '')
    if (digits && digits.length !== 10) return toast('10-digit number daalein', 'error')
    if (digits === ownerPhone) return
    updateOwnerPhone(digits)
    toast(digits ? 'Phone update ho gaya' : 'Phone hata diya', 'success')
  }

  function handleEditUpi() {
    const next = window.prompt(
      'UPI ID daalein (e.g. yourname@oksbi). WhatsApp messages me add ho jaayega taaki customer direct pay kar sake.',
      upiId || '',
    )
    if (next == null) return
    const trimmed = next.trim()
    // Basic VPA shape: <handle>@<bank>. Allow empty to clear.
    if (trimmed && !/^[\w.\-]{2,}@[a-z]{2,}$/i.test(trimmed)) {
      return toast('Galat UPI ID. Format: name@bank (jaise rahul@oksbi)', 'error')
    }
    if (trimmed === upiId) return
    updateShopUpi(trimmed)
      .then(() => toast(trimmed ? 'UPI ID save ho gaya' : 'UPI ID hata diya', 'success'))
      .catch(e => toast(e.message || 'Save failed', 'error'))
  }

  return (
    <div className="pb-32 min-h-full animate-fade-in">

      {/* Hero: identity — emerald with jaali pattern overlay */}
      <div className="hero-emerald px-4 pt-14 pb-10">
        <div className="relative max-w-lg mx-auto flex flex-col items-center text-center">
          <div
            className="w-[72px] h-[72px] rounded-[20px] bg-white/15 backdrop-blur-md flex items-center justify-center mb-4 ring-2 ring-white/30"
            style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.22)' }}
          >
            <Store size={32} className="text-white" />
          </div>
          <button
            onClick={handleEditShopName}
            className="group flex items-center gap-2 px-3 py-1 rounded-xl active:bg-white/10 transition-colors"
            title="Naam edit karein"
          >
            <h1 className="text-white text-2xl font-extrabold tracking-tight leading-tight">
              {shopName || 'My Store'}
            </h1>
            <Pencil size={14} className="text-kirana-100/70 group-hover:text-white transition-colors" />
          </button>
          <button
            onClick={handleEditPhone}
            className="group flex items-center gap-1.5 mt-1 px-3 py-1 rounded-xl active:bg-white/10 transition-colors"
            title="Phone edit karein"
          >
            <Phone size={11} className="text-kirana-100/80" />
            <span className="text-kirana-100/90 text-xs font-medium">
              {ownerPhone ? `+91 ${ownerPhone}` : 'Phone add karein'}
            </span>
            <Pencil size={11} className="text-kirana-100/60 group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      <div className="px-4 mt-5 max-w-lg mx-auto space-y-5">

        {/* Bakaya Customers — tap → Khaata with udhaar filter on */}
        {debtors.length > 0 && (
          <button
            onClick={() => nav('/customers?udhaar=1')}
            className="card w-full text-left space-y-3 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-saffron-50 flex items-center justify-center">
                <Users size={14} className="text-saffron-500" />
              </div>
              <p className="font-bold text-ink-700 text-sm flex-1">Bakaya Customers</p>
              <span className="font-bold text-saffron-500">₹{totalDue.toLocaleString('en-IN')}</span>
              <ChevronRight size={14} className="text-ink-300" />
            </div>
            <div className="divide-y divide-cream-100">
              {debtors.slice(0, 5).map(c => (
                <div key={c.id} className="flex justify-between text-sm py-2">
                  <span className="text-ink-600 truncate pr-2">{c.name}</span>
                  <span className="font-semibold text-ink-700 flex-shrink-0">₹{c.udhaar}</span>
                </div>
              ))}
              {debtors.length > 5 && (
                <p className="text-xs text-ink-400 pt-2">+{debtors.length - 5} aur · Khaata me dekhein</p>
              )}
            </div>
          </button>
        )}

        {/* Khatam Saamaan — tap → Saamaan filtered to OOS */}
        {oosItems.length > 0 && (
          <button
            onClick={() => nav('/catalog?stock=oos')}
            className="card w-full text-left space-y-3 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle size={14} className="text-red-500" />
              </div>
              <p className="font-bold text-ink-700 text-sm flex-1">Khatam Saamaan</p>
              <span className="text-xs font-bold text-red-500">{oosItems.length} item</span>
              <ChevronRight size={14} className="text-ink-300" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {oosItems.slice(0, 12).map(p => (
                <span key={p.id} className="px-2.5 py-1 bg-cream-100 text-ink-600 rounded-xl text-xs font-medium">{p.name}</span>
              ))}
              {oosItems.length > 12 && (
                <span className="px-2.5 py-1 text-xs text-ink-400">+{oosItems.length - 12} aur</span>
              )}
            </div>
          </button>
        )}

        {/* WhatsApp — single source of truth: connected state lives here.
            WASetup renders <section label + card> together so when the
            backend can't run WhatsApp at all, the entire section disappears
            instead of leaving an orphan "WHATSAPP" header above nothing. */}
        <WASetup />


        {/* Account / Logout */}
        <div className="space-y-2">
          <p className="section-label px-1">Account</p>
          <div className="card p-0 overflow-hidden divide-y divide-cream-100/80">
            <button
              onClick={handleEditShopName}
              className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-cream-50 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-kirana-50 flex items-center justify-center flex-shrink-0">
                <Pencil size={14} className="text-kirana-600" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink-700">Shop ka naam</p>
                <p className="text-xs text-ink-400 mt-0.5 truncate">{shopName || '—'}</p>
              </div>
              <Pencil size={13} className="text-ink-300" />
            </button>

            <button
              onClick={handleEditPhone}
              className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-cream-50 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                <Phone size={14} className="text-sky-600" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink-700">Owner Phone</p>
                <p className="text-xs text-ink-400 mt-0.5">
                  {ownerPhone ? `+91 ${ownerPhone}` : 'Add karein'}
                </p>
              </div>
              <Pencil size={13} className="text-ink-300" />
            </button>

            <button
              onClick={handleEditUpi}
              className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-cream-50 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                <CreditCard size={14} className="text-violet-600" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink-700">UPI ID</p>
                <p className="text-xs text-ink-400 mt-0.5 truncate">
                  {upiId
                    ? <>{upiId} <span className="text-ink-300">· WhatsApp me auto-add hoga</span></>
                    : 'Add karein — customers ko WhatsApp pe direct pay link milega'}
                </p>
              </div>
              <Pencil size={13} className="text-ink-300" />
            </button>

            <button
              onClick={logout}
              className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-cream-50 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <LogOut size={14} className="text-red-500" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink-700">Logout</p>
                <p className="text-xs text-ink-400 mt-0.5">Account se sign out</p>
              </div>
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-ink-300 font-medium pt-2">
          Kirana Smart Orders
        </p>
      </div>
    </div>
  )
}
