import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Package, Users, TrendingUp, AlertTriangle, LogOut, ChevronRight, Zap, Pencil } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import WASetup from '../components/WASetup'
import { format } from 'date-fns'

const STATUS_DOT = {
  confirmed: 'bg-emerald-400',
  pending:   'bg-amber-400',
  packed:    'bg-sky-400',
  delivered: 'bg-violet-400',
  credit:    'bg-orange-400',
  cancelled: 'bg-zinc-300',
}

export default function Dashboard() {
  const shopName       = useStore(s => s.shopName)
  const orders         = useStore(s => s.orders)
  const products       = useStore(s => s.products)
  const customers      = useStore(s => s.customers)
  const logout         = useStore(s => s.logout)
  const updateShopName = useStore(s => s.updateShopName)
  const toast          = useToast()
  const nav = useNavigate()

  function handleEditShopName() {
    const next = window.prompt('Edit shop name', shopName || '')
    if (next == null) return
    const trimmed = next.trim()
    if (!trimmed) return toast('Shop name cannot be empty', 'error')
    if (trimmed === shopName) return
    updateShopName(trimmed)
    toast('Shop name updated', 'success')
  }

  const today       = new Date().toDateString()
  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today)
  const pending     = todayOrders.filter(o => o.status === 'pending' || o.status === 'confirmed')
  const revenue     = todayOrders
    .filter(o => o.status !== 'cancelled' && o.status !== 'credit')
    .reduce((s, o) => s + (o.total || 0), 0)
  const creditDue   = customers.reduce((s, c) => s + (c.udhaar || 0), 0)
  const oosCount    = products.filter(p => !p.inStock).length
  const creditCount = customers.filter(c => c.udhaar > 0).length

  return (
    <div className="pb-32 min-h-full animate-fade-in">

      {/* ── Hero header ────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-4 pt-12 pb-6"
        style={{ background: 'linear-gradient(135deg, #047857 0%, #059669 55%, #10b981 100%)' }}
      >
        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-[0.12] bg-white" />
        <div className="absolute bottom-4 -left-8 w-36 h-36 rounded-full opacity-[0.08] bg-white" />
        <div className="absolute top-1/2 right-8 w-20 h-20 rounded-full opacity-[0.07] bg-white" />

        <div className="relative max-w-lg mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-emerald-200 text-xs font-bold uppercase tracking-[0.12em]">
                {format(new Date(), 'EEEE, d MMM yyyy')}
              </p>
              <button
                onClick={handleEditShopName}
                className="group flex items-center gap-2 text-left"
                title="Tap to edit shop name"
              >
                <h1 className="text-white text-2xl font-extrabold mt-1 tracking-tight leading-tight">
                  {shopName || 'My Store'}
                </h1>
                <Pencil size={14} className="text-emerald-200/60 group-hover:text-emerald-100 transition-colors mt-1" />
              </button>
              <p className="text-emerald-200/80 text-xs mt-1 font-medium">
                {todayOrders.length === 0
                  ? 'Aaj abhi koi order nahi'
                  : `${todayOrders.length} order aaj`}
              </p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-100 bg-white/15 hover:bg-white/25 active:bg-white/10 px-3 py-2 rounded-xl transition-colors backdrop-blur-sm"
            >
              <LogOut size={12} /> Logout
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<ShoppingBag size={17} />}
            label="Aaj ke Order"
            value={todayOrders.length}
            sub={pending.length > 0 ? `${pending.length} bakaya` : '✓ sab clear'}
            gradient="from-emerald-500 to-emerald-600"
            iconBg="bg-emerald-500/10 text-emerald-600"
            onClick={() => nav('/orders')}
          />
          <StatCard
            icon={<TrendingUp size={17} />}
            label="Aaj ki Kamaai"
            value={`₹${revenue.toLocaleString('en-IN')}`}
            sub="aaj milaa"
            gradient="from-sky-500 to-sky-600"
            iconBg="bg-sky-500/10 text-sky-600"
          />
          <StatCard
            icon={<Users size={17} />}
            label="Total Bakaya"
            value={`₹${creditDue.toLocaleString('en-IN')}`}
            sub={creditCount > 0 ? `${creditCount} customer ka udhaar` : 'kisi ka nahi'}
            gradient="from-orange-500 to-orange-600"
            iconBg="bg-orange-500/10 text-orange-600"
            onClick={() => nav('/customers')}
          />
          <StatCard
            icon={<Package size={17} />}
            label="Khatam"
            value={oosCount}
            sub={oosCount === 0 ? '✓ sab stock me' : `${oosCount} item khatam`}
            gradient={oosCount > 0 ? 'from-red-500 to-rose-500' : 'from-zinc-400 to-zinc-500'}
            iconBg={oosCount > 0 ? 'bg-red-500/10 text-red-600' : 'bg-zinc-500/10 text-zinc-500'}
            onClick={() => nav('/catalog')}
            alert={oosCount > 0}
          />
        </div>
      </div>

      {/* ── Rest of content ─────────────────────────────────────────────── */}
      <div className="px-4 mt-5 max-w-lg mx-auto space-y-5">

        {/* OOS Alert banner */}
        {oosCount > 0 && (
          <button
            onClick={() => nav('/catalog')}
            className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200/60 rounded-2xl px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
            style={{ boxShadow: '0 2px 8px rgba(245,158,11,0.12)' }}
          >
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={16} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">{oosCount} saamaan khatam</p>
              <p className="text-xs text-amber-600 mt-0.5">Restock karne ke liye tap karein</p>
            </div>
            <ChevronRight size={15} className="text-amber-400" />
          </button>
        )}

        {/* Quick Actions */}
        <div className="space-y-2">
          <p className="section-label px-1">Jaldi Actions</p>
          <div className="card p-0 overflow-hidden divide-y divide-zinc-50/80">
            {[
              { emoji: '💬', label: 'Naya Order',    sub: 'Voice, image ya WhatsApp paste',  path: '/orders?new=1',   color: 'bg-emerald-50' },
              { emoji: '📦', label: 'Naya Saamaan',  sub: 'Voice, photo ya likhein',         path: '/catalog?add=1',  color: 'bg-sky-50' },
              { emoji: '📋', label: 'Udhaar Khaata', sub: 'Bakaya dekhein, Yaad Dilao',      path: '/customers',      color: 'bg-orange-50' },
            ].map(({ emoji, label, sub, path, color }) => (
              <button
                key={path}
                onClick={() => nav(path)}
                className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-zinc-50 transition-colors"
              >
                <span className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-xl flex-shrink-0`}>
                  {emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-900">{label}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
                </div>
                <ChevronRight size={14} className="text-zinc-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* WhatsApp Setup */}
        <div className="space-y-2">
          <p className="section-label px-1">WhatsApp Integration</p>
          <WASetup />
        </div>

        {/* Recent Orders */}
        {todayOrders.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="section-label">Aaj ke Orders</p>
              <button
                onClick={() => nav('/orders')}
                className="text-xs text-emerald-600 font-bold flex items-center gap-1 hover:text-emerald-700 transition-colors"
              >
                Sab dekhein <ChevronRight size={12} />
              </button>
            </div>
            <div className="card p-0 overflow-hidden divide-y divide-zinc-50/80">
              {todayOrders.slice(0, 5).map(order => (
                <button
                  key={order.id}
                  onClick={() => nav('/orders')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-zinc-50 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[order.status] || 'bg-zinc-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate">{order.customerName || 'Customer'}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {order.items?.length || 0} items · <span className="capitalize">{order.status}</span>
                    </p>
                  </div>
                  <p className="text-sm font-bold text-zinc-900 tabular-nums">₹{(order.total || 0).toLocaleString('en-IN')}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {todayOrders.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Zap size={28} className="text-zinc-300" />
            </div>
            <p className="text-sm font-semibold text-zinc-400">Aaj abhi koi order nahi</p>
            <p className="text-xs text-zinc-300 max-w-[200px]">Naya Order pe tap karein shuruaat ke liye</p>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, iconBg, onClick, alert }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="card-elevated text-left w-full active:scale-[0.97] transition-transform disabled:cursor-default animate-fade-up"
    >
      {/* Icon square */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
        {icon}
      </div>
      {/* Value */}
      <p className="text-xl font-extrabold text-zinc-900 tracking-tight tabular-nums leading-none">
        {value}
      </p>
      {/* Label */}
      <p className="text-[10px] font-bold text-zinc-400 mt-1.5 uppercase tracking-[0.08em]">{label}</p>
      {/* Sub */}
      <p className={`text-[11px] mt-0.5 font-medium ${alert ? 'text-red-500' : 'text-zinc-400'}`}>{sub}</p>
    </button>
  )
}
