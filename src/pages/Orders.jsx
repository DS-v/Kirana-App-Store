import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, MessageSquare, Check, X, AlertCircle, ShoppingBag, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import { parseOrderMessage, orderTotal } from '../utils/orderParser'
import { sendOrderConfirmation, sendOutOfStockNotice, waLink } from '../utils/whatsapp'

const STATUSES = ['pending', 'confirmed', 'packed', 'delivered', 'credit', 'cancelled']
const STATUS_LABEL = {
  pending: 'Pending', confirmed: 'Confirmed', packed: 'Packed',
  delivered: 'Delivered', credit: 'Credit/Udhaar', cancelled: 'Cancelled'
}
const STATUS_COLOR = {
  pending: 'status-pending', confirmed: 'status-confirmed', packed: 'status-packed',
  delivered: 'status-delivered', credit: 'status-credit', cancelled: 'status-cancelled'
}

export default function Orders() {
  const products = useStore(s => s.products)
  const customers = useStore(s => s.customers)
  const orders = useStore(s => s.orders)
  const addOrder = useStore(s => s.addOrder)
  const updateOrder = useStore(s => s.updateOrder)
  const deleteOrder = useStore(s => s.deleteOrder)
  const addUdhaar = useStore(s => s.addUdhaar)
  const toast = useToast()
  const [params] = useSearchParams()

  const [showNew, setShowNew] = useState(params.get('new') === '1')
  const [pasteMsg, setPasteMsg] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [parsedItems, setParsedItems] = useState([])
  const [unrecognised, setUnrecognised] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')

  function handleParse() {
    if (!pasteMsg.trim()) return toast('Paste a WhatsApp message first', 'error')
    const { items, unrecognised: unk } = parseOrderMessage(pasteMsg, products)
    setParsedItems(items)
    setUnrecognised(unk)
    if (items.length === 0 && unk.length === 0) toast('Could not parse any items – check the message', 'error')
    else toast(`${items.length} items parsed${unk.length ? `, ${unk.length} unrecognised` : ''}`, items.length ? 'success' : 'info')
  }

  function updateItem(idx, patch) {
    setParsedItems(items => items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  function removeItem(idx) {
    setParsedItems(items => items.filter((_, i) => i !== idx))
  }

  async function confirmOrder(status = 'confirmed') {
    if (!customerName.trim()) return toast('Enter customer name', 'error')
    if (parsedItems.length === 0) return toast('No items in order', 'error')
    const total = orderTotal(parsedItems)
    try {
      await addOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: parsedItems,
        status,
        total,
        rawMessage: pasteMsg,
      })
      if (status === 'credit') {
        const cust = customers.find(c => c.phone === customerPhone.trim())
        if (cust) await addUdhaar(cust.id, total)
      }
      toast('Order saved!', 'success')
      if (customerPhone && status === 'confirmed') {
        window.open(sendOrderConfirmation(customerPhone, customerName, parsedItems, total), '_blank')
      }
      setPasteMsg(''); setCustomerName(''); setCustomerPhone(''); setParsedItems([]); setUnrecognised([])
      setShowNew(false)
    } catch (e) { toast(e.message, 'error') }
  }

  const filtered = orders.filter(o => filterStatus === 'all' || o.status === filterStatus)
  const today = new Date().toDateString()
  const todayOrders = filtered.filter(o => new Date(o.createdAt).toDateString() === today)
  const olderOrders = filtered.filter(o => new Date(o.createdAt).toDateString() !== today)

  return (
    <div className="px-4 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-xl font-medium text-sm active:scale-95 transition-transform"
        >
          <Plus size={16} /> New
        </button>
      </div>

      {/* New order form */}
      {showNew && (
        <div className="card space-y-4 border-green-200">
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-900 flex items-center gap-2"><MessageSquare size={18} /> New Order</p>
            <button onClick={() => setShowNew(false)}><X size={20} className="text-gray-400" /></button>
          </div>

          {/* Customer info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Customer Name *</label>
              <input className="input-field" placeholder="Ramesh ji" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">WhatsApp Number</label>
              <input className="input-field" type="tel" inputMode="numeric" placeholder="9876543210" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
          </div>

          {/* Paste area */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Paste WhatsApp Order Message</label>
            <textarea
              className="input-field h-28 resize-none"
              placeholder={"Parle-G 2 packet\nMaggi 3\nAmul milk 1 litre"}
              value={pasteMsg}
              onChange={e => { setPasteMsg(e.target.value); setParsedItems([]); setUnrecognised([]) }}
            />
          </div>
          <button onClick={handleParse} className="btn-secondary py-3">
            Parse Order
          </button>

          {/* Parsed items */}
          {parsedItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">Parsed Items:</p>
              {parsedItems.map((item, idx) => (
                <div key={idx} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${item.inStock ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{item.productName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center"
                        value={item.qty}
                        onChange={e => updateItem(idx, { qty: parseFloat(e.target.value) || 1 })}
                      />
                      <span className="text-xs text-gray-500">{item.unit}</span>
                      <span className="text-xs font-semibold text-gray-700">₹{(item.price * item.qty).toFixed(0)}</span>
                      {!item.inStock && <span className="badge bg-red-100 text-red-600">OOS</span>}
                    </div>
                  </div>
                  <button onClick={() => removeItem(idx)} className="text-red-400 p-1"><X size={16} /></button>
                </div>
              ))}

              {/* Unrecognised */}
              {unrecognised.map((u, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-yellow-50 rounded-xl px-3 py-2.5">
                  <AlertCircle size={16} className="text-yellow-500 flex-shrink-0" />
                  <p className="text-sm text-gray-700 flex-1">"{u.originalLine}" — not found in catalog</p>
                </div>
              ))}

              <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="font-bold text-gray-900 text-lg">₹{orderTotal(parsedItems).toFixed(0)}</span>
              </div>

              {/* OOS warning */}
              {parsedItems.some(i => !i.inStock) && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-2 items-start">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Some items are out of stock</p>
                    {customerPhone && (
                      <a
                        href={sendOutOfStockNotice(customerPhone, customerName, parsedItems.filter(i => !i.inStock))}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-red-600 underline flex items-center gap-1 mt-1"
                      >
                        <ExternalLink size={12} /> Notify customer on WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => confirmOrder('confirmed')} className="btn-primary py-3 text-base flex items-center justify-center gap-2">
                  <Check size={18} /> Confirm
                </button>
                <button onClick={() => confirmOrder('credit')} className="btn-secondary py-3 text-base">
                  Credit/Udhaar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filterStatus === s ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No orders yet</p>
          <p className="text-sm">Tap New to add your first order</p>
        </div>
      )}

      {todayOrders.length > 0 && (
        <OrderGroup label="Today" orders={todayOrders} expandedId={expandedId} setExpandedId={setExpandedId}
          updateOrder={updateOrder} deleteOrder={deleteOrder} toast={toast} />
      )}
      {olderOrders.length > 0 && (
        <OrderGroup label="Earlier" orders={olderOrders} expandedId={expandedId} setExpandedId={setExpandedId}
          updateOrder={updateOrder} deleteOrder={deleteOrder} toast={toast} />
      )}
    </div>
  )
}

function OrderGroup({ label, orders, expandedId, setExpandedId, updateOrder, deleteOrder, toast }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      {orders.map(order => (
        <OrderCard
          key={order.id}
          order={order}
          expanded={expandedId === order.id}
          onExpand={() => setExpandedId(expandedId === order.id ? null : order.id)}
          updateOrder={updateOrder}
          deleteOrder={() => deleteOrder(order.id)}
          toast={toast}
        />
      ))}
    </div>
  )
}

function OrderCard({ order, expanded, onExpand, updateOrder, deleteOrder, toast }) {
  const [showStatusPicker, setShowStatusPicker] = useState(false)

  function changeStatus(status) {
    updateOrder(order.id, { status })
    setShowStatusPicker(false)
    toast(`Order marked as ${STATUS_LABEL[status]}`, 'success')
  }

  const date = new Date(order.createdAt)
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <div className="card space-y-2">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900">{order.customerName}</p>
          <p className="text-xs text-gray-400">{dateStr} · {timeStr} · {order.items?.length || 0} items</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="font-bold text-gray-900">₹{order.total || 0}</p>
          <button onClick={() => setShowStatusPicker(!showStatusPicker)}>
            <span className={STATUS_COLOR[order.status]}>{STATUS_LABEL[order.status]}</span>
          </button>
        </div>
      </div>

      {/* Status picker */}
      {showStatusPicker && (
        <div className="grid grid-cols-3 gap-1.5">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${order.status === s ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {/* Expand/collapse */}
      <button onClick={onExpand} className="w-full flex items-center justify-between text-sm text-gray-500 pt-1 border-t border-gray-100">
        <span>{expanded ? 'Hide items' : 'View items'}</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* Items */}
      {expanded && (
        <div className="space-y-1.5">
          {order.items?.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-700">{item.productName} × {item.qty} {item.unit}</span>
              <span className="font-medium text-gray-900">₹{(item.price * item.qty).toFixed(0)}</span>
            </div>
          ))}
          {/* WhatsApp actions */}
          {order.customerPhone && (
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <a
                href={sendOrderConfirmation(order.customerPhone, order.customerName, order.items || [], order.total)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center text-xs font-semibold text-green-700 bg-green-50 border border-green-200 py-2 rounded-lg"
              >
                📱 Send Confirmation
              </a>
              <button
                onClick={() => { if (window.confirm('Delete this order?')) deleteOrder() }}
                className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
