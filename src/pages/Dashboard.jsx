import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Package, Users, TrendingUp, AlertTriangle, LogOut, ChevronRight } from 'lucide-react'
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
  const shopName  = useStore(s => s.shopName)
  const orders    = useStore(s => s.orders)
  const products  = useStore(s => s.products)
  const customers = useStore(s => s.customers)
  const logout    = useStore(s => s.logout)
  const nav = useNavigate()

  const today        = new Date().toDateString()
  const todayOrders  = orders.filter(o => new Date(o.createdAt).toDateString() === today)
  const pending      = todayOrders.filter(o => o.status === 'pending' || o.status === 'confirmed')
  const revenue      = todayOrders
    .filter(o => o.status !== 'cancelled' && o.status !== 'credit')
    .reduce((s, o) => s + (o.total || 0), 0)
  const creditDue    = customers.reduce((s, c) => s + (c.udhaar || 0), 0)
  const oosCount     = products.filter(p => !p.inStock).length
  const creditCount  = customers.filter(c => c.udhaar > 0).length

  return (
    <div className="px-4 pt-6 pb-28 space-y-6 max-w-lg mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            {format(new Date(), 'EEEE, d MMM')}
          </p>
          <h1 className="text-2xl font-bold text-zinc-900 mt-0.5 tracking-tight">{shopName}</h1>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-zinc-400 font-semibold bg-zinc-100 px-3 py-2 rounded-xl active:scale-95 transition-transform hover:bg-zinc-200"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<ShoppingBag size={18} />}
          label="Today's Orders"
          value={todayOrders.length}
          sub={pending.length > 0 ? `${pending.length} pending` : 'all clear'}
          color="emerald"
          onClick={() => nav('/orders')}
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Revenue"
          value={`₹${revenue}`}
          sub="collected today"
          color="sky"
        />
        <StatCard
          icon={<Users size={18} />}
          label="Udhaar Due"
          value={`₹${creditDue}`}
          sub={creditCount > 0 ? `${creditCount} customers` : 'nobody owes'}
          color="orange"
          onClick={() => nav('/customers')}
        />
        <StatCard
          icon={<Package size={18} />}
          label="Out of Stock"
          value={oosCount}
          sub={oosCount === 0 ? 'fully stocked' : 'items low'}
          color={oosCount > 0 ? 'red' : 'zinc'}
          onClick={() => nav('/catalog')}
        />
      </div>

      {/* ── Quick Actions ── */}
      <div className="space-y-2">
        <p className="section-label">Quick Actions</p>
        <div className="card divide-y divide-zinc-50 p-0 overflow-hidden">
          {[
            { emoji: '💬', label: 'New WhatsApp Order', sub: 'Paste a customer message', path: '/orders?new=1' },
            { emoji: '📦', label: 'Add to Catalog', sub: 'Voice, photo or type', path: '/catalog?add=1' },
            { emoji: '📋', label: 'Record Udhaar', sub: "Track a customer's credit", path: '/customers?add=1' },
          ].map(({ emoji, label, sub, path }) => (
            <button
              key={path}
              onClick={() => nav(path)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-zinc-50 transition-colors"
            >
              <span className="text-xl w-8 text-center flex-shrink-0">{emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-800">{label}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
              </div>
              <ChevronRight size={15} className="text-zinc-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ── WhatsApp Auto-Ingestion Setup ── */}
      <div className="space-y-2">
        <p className="section-label">WhatsApp Integration</p>
        <WASetup />
      </div>

      {/* ── OOS Alert ── */}
      {oosCount > 0 && (
        <button
          onClick={() => nav('/catalog')}
          className="w-full flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
        >
          <AlertTriangle size={17} className="text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">{oosCount} items out of stock</p>
            <p className="text-xs text-amber-500 mt-0.5">Tap to update catalog</p>
          </div>
          <ChevronRight size={15} className="text-amber-300" />
        </button>
      )}

      {/* ── Recent Orders ── */}
      {todayOrders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="section-label">Today's Orders</p>
            <button onClick={() => nav('/orders')} className="text-xs text-emerald-600 font-semibold">See all</button>
          </div>
          <div className="card p-0 overflow-hidden divide-y divide-zinc-50">
            {todayOrders.slice(0, 5).map(order => (
              <button
                key={order.id}
                onClick={() => nav('/orders')}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-zinc-50 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[order.status] || 'bg-zinc-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 truncate">{order.customerName || 'Customer'}</p>
                  <p className="text-xs text-zinc-400">{order.items?.length || 0} items · <span className="capitalize">{order.status}</span></p>
                </div>
                <p className="text-sm font-bold text-zinc-900">₹{order.total || 0}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}

function StatCard({ icon, label, value, sub, color, onClick }) {
  const colors = {
    emerald: 'text-emerald-500 bg-emerald-50',
    sky:     'text-sky-500 bg-sky-50',
    orange:  'text-orange-500 bg-orange-50',
    red:     'text-red-500 bg-red-50',
    zinc:    'text-zinc-400 bg-zinc-100',
  }
  const iconCls = colors[color] || colors.zinc

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="card text-left w-full active:scale-[0.97] transition-transform disabled:cursor-default"
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${iconCls}`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-zinc-900 tracking-tight">{value}</p>
      <p className="text-[11px] font-semibold text-zinc-400 mt-0.5 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
    </button>
  )
}
