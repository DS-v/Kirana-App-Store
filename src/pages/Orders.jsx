import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, MessageSquare, Check, X, AlertCircle, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import WAButton from '../components/WAButton'
import VoiceButton from '../components/VoiceButton'
import IncomingMessageBanner from '../components/IncomingMessageBanner'
import ImageOrderScanner from '../components/ImageOrderScanner'
import { parseOrderMessage, orderTotal } from '../utils/orderParser'
import {
  sendOrderAcknowledgement,
  sendOrderConfirmation,
  sendOrderPacked,
  sendOrderDelivered,
  sendOutOfStockNotice,
} from '../utils/whatsapp'

const STATUSES = ['pending', 'confirmed', 'packed', 'delivered', 'credit', 'cancelled']
const STATUS_LABEL = {
  pending: 'Pending', confirmed: 'Confirmed', packed: 'Packed',
  delivered: 'Delivered', credit: 'Credit', cancelled: 'Cancelled',
}
const STATUS_COLOR = {
  pending: 'status-pending', confirmed: 'status-confirmed', packed: 'status-packed',
  delivered: 'status-delivered', credit: 'status-credit', cancelled: 'status-cancelled',
}
const STATUS_DOT = {
  confirmed: 'bg-emerald-400', pending: 'bg-amber-400', packed: 'bg-sky-400',
  delivered: 'bg-violet-400', credit: 'bg-orange-400', cancelled: 'bg-zinc-300',
}

// Statuses that trigger a customer notification prompt
const NOTIFY_ON_STATUS = {
  packed:    (order) => sendOrderPacked(order.customerPhone, order.customerName),
  delivered: (order) => sendOrderDelivered(order.customerPhone, order.customerName, order.total),
}
const NOTIFY_LABEL = {
  packed:    'Notify customer – order packed',
  delivered: 'Notify customer – order delivered',
}

export default function Orders() {
  const products    = useStore(s => s.products)
  const customers   = useStore(s => s.customers)
  const orders      = useStore(s => s.orders)
  const addOrder    = useStore(s => s.addOrder)
  const updateOrder = useStore(s => s.updateOrder)
  const deleteOrder = useStore(s => s.deleteOrder)
  const addUdhaar   = useStore(s => s.addUdhaar)
  const toast       = useToast()
  const [params]    = useSearchParams()

  const [showNew, setShowNew]             = useState(params.get('new') === '1')
  const [pasteMsg, setPasteMsg]           = useState('')
  const [voiceInterim, setVoiceInterim]   = useState('')
  const [customerName, setCustomerName]   = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [parsedItems, setParsedItems]     = useState([])
  const [unrecognised, setUnrecognised]   = useState([])
  const [expandedId, setExpandedId]       = useState(null)
  const [filterStatus, setFilterStatus]   = useState('all')
  const [aiParsing, setAiParsing]         = useState(false)   // LLM request in-flight

  // ── Parser helpers ─────────────────────────────────────────────────────────

  // Merge LLM items with local catalog data (price, inStock, unit)
  function enrichItems(llmItems) {
    return llmItems.map(it => {
      const p = products.find(p => p.id === it.productId)
      return {
        ...it,
        price:   p?.price   ?? 0,
        inStock: p?.inStock ?? true,
        unit:    it.unit    ?? p?.unit ?? 'pc',
      }
    })
  }

  // Rule-based fallback — always available, zero latency
  function runRuleBased(text) {
    const { items, unrecognised: unk } = parseOrderMessage(text, products)
    setParsedItems(items)
    setUnrecognised(unk)
    return { items, unrecognised: unk }
  }

  // Primary path: LLM → rule-based fallback
  async function runParser(text) {
    if (!text.trim()) return toast('Nothing to parse', 'error')

    // Build slim catalog for LLM (no prices/stock sent to server)
    const catalog = products.map(p => ({
      id: p.id, name: p.name, unit: p.unit,
      ...(p.aliases?.length ? { aliases: p.aliases } : {}),
    }))

    const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:3001'

    setAiParsing(true)
    try {
      const resp = await fetch(`${BACKEND}/api/llm/parse-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, catalog }),
        signal: AbortSignal.timeout(8000),   // 8 s — Groq p50 is ~500 ms
      })

      if (resp.ok) {
        const { items: llmItems, unrecognised: llmUnk } = await resp.json()
        const enriched = enrichItems(llmItems)
        setParsedItems(enriched)
        setUnrecognised(llmUnk)
        const msg = `${enriched.length} item${enriched.length !== 1 ? 's' : ''} parsed (AI)${llmUnk.length ? `, ${llmUnk.length} unrecognised` : ''}`
        toast(msg, enriched.length ? 'success' : 'info')
        return
      }
    } catch (_) {
      // network error, timeout, or LLM 503 → fall through to rule-based
    } finally {
      setAiParsing(false)
    }

    // Rule-based fallback
    const { items, unrecognised: unk } = runRuleBased(text)
    if (!items.length && !unk.length) toast('Could not parse any items', 'error')
    else toast(`${items.length} item${items.length !== 1 ? 's' : ''} parsed${unk.length ? `, ${unk.length} unrecognised` : ''}`, items.length ? 'success' : 'info')
  }

  // Path A: PWA Share Target — WhatsApp shares text directly to /orders?text=…
  const sharedText = params.get('text')
  useEffect(() => {
    if (!sharedText) return
    const decoded = decodeURIComponent(sharedText)
    setPasteMsg(decoded)
    setShowNew(true)
    runParser(decoded)
  }, [sharedText])   // eslint-disable-line react-hooks/exhaustive-deps

  // Voice order: transcript feeds directly into the parser
  function handleVoiceResult(transcript) {
    setVoiceInterim('')
    setPasteMsg(transcript)
    runParser(transcript)
  }

  // Image OCR: extracted text → parser (same path as voice/paste)
  function handleImageText(text) {
    setPasteMsg(text)
    setShowNew(true)
    runParser(text)
  }

  function handleParse() { runParser(pasteMsg) }

  function updateItem(idx, patch) {
    setParsedItems(items => items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  async function confirmOrder(status = 'confirmed') {
    if (!customerName.trim()) return toast('Enter customer name', 'error')
    if (!parsedItems.length) return toast('No items in order', 'error')
    const total = orderTotal(parsedItems)
    try {
      await addOrder({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), items: parsedItems, status, total, rawMessage: pasteMsg })
      if (status === 'credit') {
        const cust = customers.find(c => c.phone === customerPhone.trim())
        if (cust) await addUdhaar(cust.id, total)
      }
      toast('Order saved!', 'success')
      if (customerPhone && status === 'confirmed')
        window.open(sendOrderConfirmation(customerPhone, customerName, parsedItems, total), '_blank')
      setPasteMsg(''); setCustomerName(''); setCustomerPhone(''); setParsedItems([]); setUnrecognised([])
      setShowNew(false)
    } catch (e) { toast(e.message, 'error') }
  }

  const filtered    = orders.filter(o => filterStatus === 'all' || o.status === filterStatus)
  const today       = new Date().toDateString()
  const todayOrders = filtered.filter(o => new Date(o.createdAt).toDateString() === today)
  const olderOrders = filtered.filter(o => new Date(o.createdAt).toDateString() !== today)

  // Path B: incoming message from whatsapp-web.js → pre-fill form
  function handleIncomingOpen(msg) {
    setCustomerPhone(msg.from_phone || '')
    setCustomerName(msg.from_name || '')
    setPasteMsg(msg.message)
    setShowNew(true)
    runParser(msg.message)
  }

  // WhatsApp acknowledgement link — shown as soon as items are parsed
  const ackLink = customerPhone && parsedItems.length
    ? sendOrderAcknowledgement(customerPhone, customerName || 'Customer', parsedItems.length)
    : null

  // OOS notice link
  const oosLink = customerPhone && parsedItems.some(i => !i.inStock)
    ? sendOutOfStockNotice(customerPhone, customerName || 'Customer', parsedItems.filter(i => !i.inStock))
    : null

  return (
    <div className="px-4 pt-6 pb-28 space-y-5 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Orders</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1.5 bg-emerald-500 text-white px-3.5 py-2 rounded-xl font-semibold text-sm active:scale-95 transition-transform shadow-sm shadow-emerald-100"
        >
          <Plus size={15} /> New
        </button>
      </div>

      {/* Path B: auto-ingested WhatsApp messages — tap to open as order */}
      <IncomingMessageBanner onOpen={handleIncomingOpen} />

      {/* New order panel */}
      {showNew && (
        <div className="card space-y-4 border-emerald-100">
          <div className="flex items-center justify-between">
            <p className="font-bold text-zinc-900 flex items-center gap-2 text-sm">
              <MessageSquare size={16} className="text-emerald-500" /> New Order
            </p>
            <button onClick={() => setShowNew(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">Customer Name *</label>
              <input className="input-field" placeholder="Ramesh ji" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">WhatsApp No.</label>
              <input className="input-field" type="tel" inputMode="numeric" placeholder="9876543210" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
          </div>

          {/* Voice input — speak the order directly */}
          <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3">
            <VoiceButton
              onResult={handleVoiceResult}
              onInterim={t => setVoiceInterim(t)}
              size="sm"
              label="Speak order"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-700">Speak the order</p>
              {voiceInterim
                ? <p className="text-xs text-emerald-600 italic truncate mt-0.5">{voiceInterim}…</p>
                : <p className="text-xs text-zinc-400 mt-0.5">
                    Hold mic · say "do Maggi, ek kg aata, teen Parle-G"
                  </p>
              }
            </div>
          </div>

          {/* Image scan */}
          <ImageOrderScanner
            onTextReady={handleImageText}
            onError={msg => toast(msg, 'info')}
          />

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-zinc-100" />
            <span className="text-xs font-semibold text-zinc-400">or paste text</span>
            <div className="flex-1 h-px bg-zinc-100" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">Paste WhatsApp Message</label>
            <textarea
              className="input-field h-24 resize-none text-sm"
              placeholder={"Parle-G 2 packet\nMaggi 3\nAmul milk 1 litre"}
              value={pasteMsg}
              onChange={e => { setPasteMsg(e.target.value); setParsedItems([]); setUnrecognised([]) }}
            />
          </div>

          <button
            onClick={handleParse}
            disabled={aiParsing}
            className="btn-secondary py-2.5 text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {aiParsing ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-400 border-t-emerald-500 animate-spin" />
                AI parsing…
              </>
            ) : 'Parse Order ✦'}
          </button>

          {parsedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Parsed Items</p>
                {/* Acknowledgement — send as soon as items are parsed */}
                {ackLink && (
                  <WAButton href={ackLink} label="Acknowledge receipt" />
                )}
              </div>

              {parsedItems.map((item, idx) => (
                <div key={idx} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${item.inStock ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-800 text-sm truncate">{item.productName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        className="w-12 border border-zinc-200 rounded-lg px-2 py-1 text-sm text-center bg-white"
                        value={item.qty}
                        onChange={e => updateItem(idx, { qty: parseFloat(e.target.value) || 1 })}
                      />
                      <span className="text-xs text-zinc-400">{item.unit}</span>
                      <span className="text-xs font-bold text-zinc-700">₹{(item.price * item.qty).toFixed(0)}</span>
                      {!item.inStock && <span className="badge bg-red-100 text-red-600">OOS</span>}
                    </div>
                  </div>
                  <button onClick={() => setParsedItems(p => p.filter((_, i) => i !== idx))} className="text-zinc-300 hover:text-red-400 transition-colors">
                    <X size={15} />
                  </button>
                </div>
              ))}

              {unrecognised.map((u, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-amber-50 rounded-xl px-3 py-2.5">
                  <AlertCircle size={15} className="text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-zinc-600">"{u.originalLine}" — not in catalog</p>
                </div>
              ))}

              <div className="flex justify-between items-center bg-zinc-50 rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-zinc-600">Total</span>
                <span className="text-lg font-bold text-zinc-900">₹{orderTotal(parsedItems).toFixed(0)}</span>
              </div>

              {/* OOS notice */}
              {oosLink && (
                <WAButton href={oosLink} label="Notify customer about OOS items" block size="md" className="border border-red-100 !text-red-600 !bg-red-50 hover:!bg-red-100" />
              )}

              {/* Confirm / Credit */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => confirmOrder('confirmed')} className="btn-primary py-3 text-sm flex items-center justify-center gap-1.5">
                  <Check size={15} /> Confirm
                </button>
                <button onClick={() => confirmOrder('credit')} className="btn-secondary py-3 text-sm">
                  Credit / Udhaar
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 text-center">
                Confirming will open WhatsApp to send the customer a receipt
              </p>
            </div>
          )}
        </div>
      )}

      {/* Filter tab bar */}
      <div className="seg-bar">
        {['all', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`seg-item ${filterStatus === s ? 'seg-item-active' : ''}`}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-16 text-zinc-300">
          <ShoppingBag size={36} strokeWidth={1.2} className="mb-3" />
          <p className="font-semibold text-zinc-400">No orders yet</p>
          <p className="text-sm text-zinc-300 mt-1">Tap New to add your first order</p>
        </div>
      )}

      <div className="space-y-4">
        {todayOrders.length > 0 && (
          <OrderGroup label="Today" orders={todayOrders} expandedId={expandedId}
            setExpandedId={setExpandedId} updateOrder={updateOrder} deleteOrder={deleteOrder} toast={toast} />
        )}
        {olderOrders.length > 0 && (
          <OrderGroup label="Earlier" orders={olderOrders} expandedId={expandedId}
            setExpandedId={setExpandedId} updateOrder={updateOrder} deleteOrder={deleteOrder} toast={toast} />
        )}
      </div>
    </div>
  )
}

function OrderGroup({ label, orders, expandedId, setExpandedId, updateOrder, deleteOrder, toast }) {
  return (
    <div className="space-y-1.5">
      <p className="section-label">{label}</p>
      <div className="card p-0 overflow-hidden divide-y divide-zinc-50">
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
    </div>
  )
}

function OrderCard({ order, expanded, onExpand, updateOrder, deleteOrder, toast }) {
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [notifyLink, setNotifyLink]             = useState(null)
  const [notifyLabel, setNotifyLabel]           = useState('')

  function changeStatus(status) {
    updateOrder(order.id, { status })
    setShowStatusPicker(false)
    toast(`Marked as ${STATUS_LABEL[status]}`, 'success')

    // Offer customer notification for packed / delivered
    if (order.customerPhone && NOTIFY_ON_STATUS[status]) {
      setNotifyLink(NOTIFY_ON_STATUS[status](order))
      setNotifyLabel(NOTIFY_LABEL[status])
    } else {
      setNotifyLink(null)
    }
  }

  const time = new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="px-4 py-3.5 space-y-3">
      {/* Row */}
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${STATUS_DOT[order.status] || 'bg-zinc-300'}`} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900 text-sm">{order.customerName}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{time} · {order.items?.length || 0} items</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-zinc-900 text-sm">₹{order.total || 0}</p>
          <button onClick={() => { setShowStatusPicker(!showStatusPicker); setNotifyLink(null) }} className="mt-1">
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
              className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                order.status === s ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {/* Notification prompt — appears after status change to packed / delivered */}
      {notifyLink && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
          <WAButton href={notifyLink} label={notifyLabel} size="sm" />
          <button onClick={() => setNotifyLink(null)} className="ml-auto text-zinc-300 hover:text-zinc-500 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={onExpand}
        className="w-full flex items-center justify-between text-xs text-zinc-400 font-medium pt-1 border-t border-zinc-50"
      >
        <span>{expanded ? 'Hide items' : `View ${order.items?.length || 0} items`}</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-1.5">
          {order.items?.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-zinc-600">{item.productName} × {item.qty} {item.unit}</span>
              <span className="font-semibold text-zinc-800">₹{(item.price * item.qty).toFixed(0)}</span>
            </div>
          ))}

          <div className="flex gap-2 pt-2 border-t border-zinc-50 flex-wrap">
            {order.customerPhone && (
              <WAButton
                href={sendOrderConfirmation(order.customerPhone, order.customerName, order.items || [], order.total)}
                label="Resend receipt"
                size="sm"
                className="flex-1"
              />
            )}
            {order.customerPhone && order.status === 'packed' && (
              <WAButton
                href={sendOrderPacked(order.customerPhone, order.customerName)}
                label="Order packed ✓"
                size="sm"
                className="flex-1"
              />
            )}
            {order.customerPhone && order.status === 'delivered' && (
              <WAButton
                href={sendOrderDelivered(order.customerPhone, order.customerName, order.total)}
                label="Delivered ✓"
                size="sm"
                className="flex-1"
              />
            )}
            <button
              onClick={() => { if (window.confirm('Delete this order?')) deleteOrder() }}
              className="text-xs font-semibold text-red-500 bg-red-50 px-3 py-2 rounded-lg"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
