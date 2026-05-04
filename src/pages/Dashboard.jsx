import { LogOut, Pencil, Phone, Store, MessageSquare } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import WASetup from '../components/WASetup'

/**
 * Aaj = profile / settings.
 *
 * Stats grid, Jaldi Actions, recent orders all moved to Order Book and Khaata —
 * no need to repeat them here. This screen is just: who am I, my shop, WhatsApp
 * setup, sign out.
 */
export default function Dashboard() {
  const shopName       = useStore(s => s.shopName)
  const ownerPhone     = useStore(s => s.ownerPhone)
  const logout         = useStore(s => s.logout)
  const updateShopName = useStore(s => s.updateShopName)
  const toast          = useToast()

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

      {/* Compact green header — just identity, no stats */}
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

      {/* Body */}
      <div className="px-4 mt-5 max-w-lg mx-auto space-y-5">

        {/* WhatsApp Setup */}
        <div className="space-y-2">
          <p className="section-label px-1 flex items-center gap-1.5">
            <MessageSquare size={11} /> WhatsApp
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
