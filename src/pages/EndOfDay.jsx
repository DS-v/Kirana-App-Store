import { useState } from 'react'
import { Sun, Share2, ShoppingBag, AlertTriangle, Users, Package, TrendingUp, Clock, XCircle } from 'lucide-react'
import useStore from '../store/useStore'
import WAButton from '../components/WAButton'
import { sendEndOfDaySummary } from '../utils/whatsapp'
import { format } from 'date-fns'

const STATUS_COLOR = {
  delivered: 'status-delivered',
  confirmed: 'status-confirmed',
  packed:    'status-packed',
  credit:    'status-credit',
  cancelled: 'status-cancelled',
  pending:   'status-pending',
}

export default function EndOfDay() {
  const orders    = useStore(s => s.orders)
  const products  = useStore(s => s.products)
  const customers = useStore(s => s.customers)
  const shopName  = useStore(s => s.shopName)
  const ownerPhone = useStore(s => s.ownerPhone)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const dayOrders = orders.filter(o => format(new Date(o.createdAt), 'yyyy-MM-dd') === selectedDate)

  const totalOrders  = dayOrders.length
  const fulfilled    = dayOrders.filter(o => ['confirmed', 'packed', 'delivered'].includes(o.status)).length
  const missed       = dayOrders.filter(o => o.status === 'cancelled').length
  const pending      = dayOrders.filter(o => o.status === 'pending').length
  const creditOrders = dayOrders.filter(o => o.status === 'credit')
  const creditTotal  = creditOrders.reduce((s, o) => s + (o.total || 0), 0)
  const collected    = dayOrders
    .filter(o => ['confirmed', 'packed', 'delivered'].includes(o.status))
    .reduce((s, o) => s + (o.total || 0), 0)
  const oosItems  = products.filter(p => !p.inStock)
  const totalDue  = customers.reduce((s, c) => s + (c.udhaar || 0), 0)
  const debtors   = customers.filter(c => c.udhaar > 0)

  const summary = {
    date: format(new Date(selectedDate), 'd MMM yyyy'),
    totalOrders, fulfilled, missed, collected, credit: creditTotal,
    stockAlerts: oosItems.map(p => p.name),
  }

  const waLink = sendEndOfDaySummary(ownerPhone, summary)

  const summaryText = `📊 *End of Day – ${summary.date}*
🏪 ${shopName}

📦 Orders: ${totalOrders}
✅ Fulfilled: ${fulfilled}
⏳ Pending: ${pending}
❌ Missed/Cancelled: ${missed}
💵 Collected: ₹${collected}
📋 Credit issued: ₹${creditTotal}
💰 Total Udhaar due: ₹${totalDue}
${oosItems.length ? `\n⚠️ Out of Stock (${oosItems.length}): ${oosItems.map(p => p.name).join(', ')}` : ''}

_Powered by Kirana Smart Orders_`

  return (
    <div className="pb-32 min-h-full animate-fade-in">

      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-4 pt-10 pb-8"
        style={{ background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 55%, #fbbf24 100%)' }}
      >
        <div className="absolute -top-8 -right-8 w-44 h-44 rounded-full opacity-[0.12] bg-white" />
        <div className="absolute bottom-2 -left-6 w-32 h-32 rounded-full opacity-[0.08] bg-white" />

        <div className="relative max-w-lg mx-auto flex items-start justify-between">
          <div>
            <p className="text-amber-200 text-xs font-bold uppercase tracking-[0.12em]">
              {format(new Date(selectedDate), 'EEEE, d MMM yyyy')}
            </p>
            <h1 className="text-white text-2xl font-extrabold mt-1 tracking-tight">Day Summary</h1>
            <p className="text-amber-100/80 text-xs mt-1 font-medium">
              {totalOrders === 0 ? 'No orders recorded' : `${totalOrders} order${totalOrders !== 1 ? 's' : ''} · ₹${collected.toLocaleString('en-IN')} collected`}
            </p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <Sun size={20} className="text-white" />
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-5">

      {/* Date picker */}
      <div className="space-y-1.5">
        <label className="field-label">Report Date</label>
        <input
          type="date"
          className="input-field"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          max={format(new Date(), 'yyyy-MM-dd')}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<ShoppingBag size={17} />}  label="Total Orders"   value={totalOrders}                                    sub="for the day"              color="emerald" />
        <StatCard icon={<TrendingUp size={17} />}    label="Collected"      value={`₹${collected.toLocaleString('en-IN')}`}        sub="cash received"            color="sky" />
        <StatCard icon={<Package size={17} />}       label="Fulfilled"      value={fulfilled}                                      sub="orders"                   color="violet" />
        <StatCard icon={<Users size={17} />}         label="Credit Issued"  value={`₹${creditTotal.toLocaleString('en-IN')}`}      sub={`${creditOrders.length} orders`} color="orange" />
        <StatCard icon={<Clock size={17} />}         label="Pending"        value={pending}                                        sub="orders"                   color="amber" />
        <StatCard icon={<XCircle size={17} />}       label="Cancelled"      value={missed}                                         sub="orders"                   color="zinc" />
      </div>

      {/* Udhaar overview */}
      {debtors.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
              <Users size={14} className="text-orange-500" />
            </div>
            <p className="font-bold text-zinc-900 text-sm">Udhaar Overview</p>
            <span className="ml-auto font-bold text-orange-500">₹{totalDue}</span>
          </div>
          <div className="divide-y divide-zinc-50">
            {debtors.slice(0, 4).map(c => (
              <div key={c.id} className="flex justify-between text-sm py-2">
                <span className="text-zinc-600">{c.name}</span>
                <span className="font-semibold text-zinc-900">₹{c.udhaar}</span>
              </div>
            ))}
            {debtors.length > 4 && (
              <p className="text-xs text-zinc-400 pt-2">+{debtors.length - 4} more customers</p>
            )}
          </div>
        </div>
      )}

      {/* Out of stock */}
      {oosItems.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={14} className="text-red-500" />
            </div>
            <p className="font-bold text-zinc-900 text-sm">Out of Stock</p>
            <span className="ml-auto text-xs font-semibold text-red-500">{oosItems.length} items</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {oosItems.map(p => (
              <span key={p.id} className="px-2.5 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-xs font-medium">{p.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Order breakdown */}
      {dayOrders.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-50">
            <ShoppingBag size={15} className="text-zinc-400" />
            <p className="font-bold text-zinc-900 text-sm">Order Breakdown</p>
          </div>
          <div className="divide-y divide-zinc-50">
            {dayOrders.map(o => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 truncate">{o.customerName}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{o.items?.length} items</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-bold text-zinc-900">₹{o.total}</span>
                  <span className={STATUS_COLOR[o.status] || 'badge bg-zinc-100 text-zinc-500'}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary preview */}
      <div className="card space-y-2.5">
        <p className="section-label px-0.5">Summary Preview</p>
        <pre className="text-xs text-zinc-600 whitespace-pre-wrap font-mono leading-relaxed bg-zinc-50 rounded-2xl px-4 py-3.5">{summaryText}</pre>
      </div>

      {/* Actions */}
      <div className="space-y-2.5">
        <WAButton href={waLink} label="Send Summary via WhatsApp" size="md" block />
        <button
          onClick={() => {
            navigator.clipboard?.writeText(summaryText)
              .then(() => alert('Copied to clipboard!'))
              .catch(() => alert('Copy: ' + summaryText))
          }}
          className="btn-secondary flex items-center justify-center gap-2"
        >
          <Share2 size={17} /> Copy Summary
        </button>
      </div>

      </div>{/* end page content */}
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }) {
  const colors = {
    emerald: 'text-emerald-600 bg-emerald-500/10',
    sky:     'text-sky-600 bg-sky-500/10',
    violet:  'text-violet-600 bg-violet-500/10',
    orange:  'text-orange-600 bg-orange-500/10',
    amber:   'text-amber-600 bg-amber-500/10',
    zinc:    'text-zinc-400 bg-zinc-500/10',
  }
  const iconCls = colors[color] || colors.zinc

  return (
    <div className="card-elevated text-left animate-fade-up">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconCls}`}>
        {icon}
      </div>
      <p className="text-xl font-extrabold text-zinc-900 tracking-tight tabular-nums leading-none">{value}</p>
      <p className="text-[10px] font-bold text-zinc-400 mt-1.5 uppercase tracking-[0.08em]">{label}</p>
      <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">{sub}</p>
    </div>
  )
}
