import { useState } from 'react'
import { Sun, ExternalLink, Download, Share2, TrendingUp, ShoppingBag, AlertTriangle, Users } from 'lucide-react'
import useStore from '../store/useStore'
import { sendEndOfDaySummary } from '../utils/whatsapp'
import { format } from 'date-fns'

export default function EndOfDay() {
  const orders = useStore(s => s.orders)
  const products = useStore(s => s.products)
  const customers = useStore(s => s.customers)
  const shopName = useStore(s => s.shopName)
  const ownerPhone = useStore(s => s.ownerPhone)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const dayOrders = orders.filter(o => {
    const d = new Date(o.createdAt)
    return format(d, 'yyyy-MM-dd') === selectedDate
  })

  const totalOrders = dayOrders.length
  const fulfilled = dayOrders.filter(o => ['confirmed', 'packed', 'delivered'].includes(o.status)).length
  const missed = dayOrders.filter(o => o.status === 'cancelled').length
  const pending = dayOrders.filter(o => o.status === 'pending').length
  const creditOrders = dayOrders.filter(o => o.status === 'credit')
  const creditTotal = creditOrders.reduce((s, o) => s + (o.total || 0), 0)
  const collected = dayOrders
    .filter(o => ['confirmed', 'packed', 'delivered'].includes(o.status))
    .reduce((s, o) => s + (o.total || 0), 0)
  const oosItems = products.filter(p => !p.inStock)
  const totalDue = customers.reduce((s, c) => s + (c.udhaar || 0), 0)

  const summary = {
    date: format(new Date(selectedDate), 'd MMM yyyy'),
    totalOrders,
    fulfilled,
    missed,
    collected,
    credit: creditTotal,
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
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">End of Day</h1>
          <p className="text-sm text-gray-500">{shopName}</p>
        </div>
        <div className="bg-amber-100 rounded-2xl p-2.5">
          <Sun size={24} className="text-amber-500" />
        </div>
      </div>

      {/* Date selector */}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Report Date</label>
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
        <SummaryCard label="Total Orders" value={totalOrders} sub="today" icon="📦" color="bg-blue-50" />
        <SummaryCard label="Fulfilled" value={fulfilled} sub="orders" icon="✅" color="bg-green-50" />
        <SummaryCard label="Collected" value={`₹${collected}`} sub="cash" icon="💵" color="bg-emerald-50" />
        <SummaryCard label="Credit Issued" value={`₹${creditTotal}`} sub={`${creditOrders.length} orders`} icon="📋" color="bg-orange-50" />
        <SummaryCard label="Pending" value={pending} sub="orders" icon="⏳" color="bg-yellow-50" />
        <SummaryCard label="Cancelled" value={missed} sub="orders" icon="❌" color="bg-red-50" />
      </div>

      {/* Udhaar summary */}
      <div className="card bg-orange-50 border-orange-200">
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-orange-500" />
          <p className="font-bold text-orange-800">Udhaar Overview</p>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-orange-700">Total customers with dues</span>
            <span className="font-bold text-orange-800">{customers.filter(c => c.udhaar > 0).length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-orange-700">Total amount due</span>
            <span className="font-bold text-orange-800">₹{totalDue}</span>
          </div>
          {customers.filter(c => c.udhaar > 0).slice(0, 3).map(c => (
            <div key={c.id} className="flex justify-between text-sm">
              <span className="text-orange-600">{c.name}</span>
              <span className="font-semibold text-orange-700">₹{c.udhaar}</span>
            </div>
          ))}
          {customers.filter(c => c.udhaar > 0).length > 3 && (
            <p className="text-xs text-orange-500">+{customers.filter(c => c.udhaar > 0).length - 3} more</p>
          )}
        </div>
      </div>

      {/* Out of stock */}
      {oosItems.length > 0 && (
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-red-500" />
            <p className="font-bold text-red-800">Out of Stock ({oosItems.length})</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {oosItems.map(p => (
              <span key={p.id} className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">{p.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Order breakdown */}
      {dayOrders.length > 0 && (
        <div className="card">
          <p className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <ShoppingBag size={18} className="text-green-600" /> Order Breakdown
          </p>
          <div className="space-y-2">
            {dayOrders.map(o => (
              <div key={o.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-medium text-gray-800">{o.customerName}</span>
                  <span className="text-gray-400 ml-2">{o.items?.length} items</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">₹{o.total}</span>
                  <span className={`badge text-xs ${o.status === 'delivered' ? 'bg-green-100 text-green-700' :
                    o.status === 'credit' ? 'bg-orange-100 text-orange-700' :
                    o.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                    'bg-blue-100 text-blue-700'}`}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary text preview */}
      <div className="card bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 mb-2">Summary Preview</p>
        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{summaryText}</pre>
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className="btn-primary flex items-center justify-center gap-2"
        >
          <ExternalLink size={18} /> Send Summary via WhatsApp
        </a>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(summaryText)
              .then(() => alert('Summary copied to clipboard!'))
              .catch(() => alert('Copy: ' + summaryText))
          }}
          className="btn-secondary flex items-center justify-center gap-2"
        >
          <Share2 size={18} /> Copy Summary
        </button>
      </div>

      <div className="h-2" />
    </div>
  )
}

function SummaryCard({ label, value, sub, icon, color }) {
  return (
    <div className={`card ${color} text-left`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  )
}
