import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Package, Users, TrendingUp, AlertTriangle, LogOut } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import { format } from 'date-fns'

const STATUS_COLORS = {
  confirmed: 'bg-green-500',
  pending: 'bg-yellow-400',
  packed: 'bg-blue-500',
  delivered: 'bg-purple-500',
  credit: 'bg-orange-400',
  cancelled: 'bg-red-400',
}

export default function Dashboard() {
  const shopName = useStore(s => s.shopName)
  const orders = useStore(s => s.orders)
  const products = useStore(s => s.products)
  const customers = useStore(s => s.customers)
  const logout = useStore(s => s.logout)
  const toast = useToast()
  const nav = useNavigate()

  const today = new Date().toDateString()
  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today)
  const pendingOrders = todayOrders.filter(o => o.status === 'pending' || o.status === 'confirmed')
  const totalRevenue = todayOrders
    .filter(o => o.status !== 'cancelled' && o.status !== 'credit')
    .reduce((sum, o) => sum + (o.total || 0), 0)
  const creditDue = customers.reduce((sum, c) => sum + (c.udhaar || 0), 0)
  const oosCount = products.filter(p => !p.inStock).length

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, d MMM')}</p>
          <h1 className="text-2xl font-bold text-gray-900">{shopName}</h1>
        </div>
        <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-100 px-3 py-2 rounded-xl active:scale-95 transition-transform">
          <LogOut size={15} /> Out
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<ShoppingBag size={20} className="text-green-600" />}
          label="Today's Orders"
          value={todayOrders.length}
          sub={`${pendingOrders.length} pending`}
          bg="bg-green-50"
          onClick={() => nav('/orders')}
        />
        <StatCard
          icon={<TrendingUp size={20} className="text-blue-600" />}
          label="Revenue Today"
          value={`₹${totalRevenue}`}
          sub="collected"
          bg="bg-blue-50"
        />
        <StatCard
          icon={<Users size={20} className="text-orange-500" />}
          label="Udhaar Due"
          value={`₹${creditDue}`}
          sub={`${customers.filter(c => c.udhaar > 0).length} customers`}
          bg="bg-orange-50"
          onClick={() => nav('/customers')}
        />
        <StatCard
          icon={<Package size={20} className="text-red-500" />}
          label="Out of Stock"
          value={oosCount}
          sub="items"
          bg="bg-red-50"
          onClick={() => nav('/catalog')}
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-base font-bold text-gray-700 mb-3">Quick Actions</h2>
        <div className="space-y-2.5">
          <QuickAction
            label="New Order from WhatsApp"
            sub="Paste a customer's message"
            emoji="💬"
            bg="bg-green-600"
            onClick={() => nav('/orders?new=1')}
          />
          <QuickAction
            label="Add Product to Catalog"
            sub="Voice, photo, or type"
            emoji="📦"
            bg="bg-blue-600"
            onClick={() => nav('/catalog?add=1')}
          />
          <QuickAction
            label="Record Credit / Udhaar"
            sub="Track a customer's dues"
            emoji="📋"
            bg="bg-orange-500"
            onClick={() => nav('/customers?add=1')}
          />
        </div>
      </div>

      {/* Recent Orders */}
      {todayOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-700">Today's Orders</h2>
            <button onClick={() => nav('/orders')} className="text-sm text-green-600 font-medium">See all</button>
          </div>
          <div className="space-y-2">
            {todayOrders.slice(0, 5).map(order => (
              <OrderRow key={order.id} order={order} onClick={() => nav('/orders')} />
            ))}
          </div>
        </div>
      )}

      {/* OOS Alert */}
      {oosCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">{oosCount} items out of stock</p>
            <p className="text-sm text-amber-600">Tap to update your catalog</p>
          </div>
          <button onClick={() => nav('/catalog')} className="ml-auto text-sm font-semibold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg">
            View
          </button>
        </div>
      )}

      <div className="h-2" />
    </div>
  )
}

function StatCard({ icon, label, value, sub, bg, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`card ${bg} text-left w-full active:scale-95 transition-transform ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-gray-500 font-medium">{label}</span></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </button>
  )
}

function QuickAction({ label, sub, emoji, bg, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 ${bg} text-white rounded-2xl px-5 py-4 active:scale-95 transition-transform shadow-sm`}
    >
      <span className="text-3xl">{emoji}</span>
      <div className="text-left">
        <p className="font-bold text-base">{label}</p>
        <p className="text-sm opacity-80">{sub}</p>
      </div>
    </button>
  )
}

function OrderRow({ order, onClick }) {
  const dot = STATUS_COLORS[order.status] || 'bg-gray-400'
  return (
    <button onClick={onClick} className="card w-full flex items-center gap-3 active:scale-95 transition-transform">
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
      <div className="flex-1 text-left min-w-0">
        <p className="font-semibold text-gray-900 truncate">{order.customerName || 'Customer'}</p>
        <p className="text-sm text-gray-500">{order.items?.length || 0} items</p>
      </div>
      <div className="text-right">
        <p className="font-bold text-gray-900">₹{order.total || 0}</p>
        <p className="text-xs text-gray-400 capitalize">{order.status}</p>
      </div>
    </button>
  )
}
