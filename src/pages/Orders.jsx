import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, MessageSquare, Check, X, AlertCircle, ShoppingBag, ChevronDown, ChevronUp, BarChart2, List, TrendingUp, Clock, XCircle, Share2, Users, Package, AlertTriangle } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import WAButton from '../components/WAButton'
import VoiceButton from '../components/VoiceButton'
import IncomingMessageBanner from '../components/IncomingMessageBanner'
import ImageOrderScanner from '../components/ImageOrderScanner'
import { parseOrderMessage, orderTotal } from '../utils/orderParser'
import { STATUSES, STATUS_LABEL, STATUS_BADGE, STATUS_COLOR, STATUS_DOT, nextStatusOf, statusAdvanceToast } from '../utils/orderStatus'
import SwipeableRow from '../components/SwipeableRow'
import supabase from '../lib/supabase'
import { format, startOfWeek, startOfMonth } from 'date-fns'
import {
  sendOrderAcknowledgement,
  sendOrderConfirmation,
  sendOrderPacked,
  sendOrderDelivered,
  sendOutOfStockNotice,
  sendEndOfDaySummary,
} from '../utils/whatsapp'

// Status labels/colors moved to ../utils/orderStatus.js (single source of truth)

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
  const shopName    = useStore(s => s.shopName)
  const ownerPhone  = useStore(s => s.ownerPhone)
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
  const [view, setView]                   = useState('list')  // 'list' | 'summary'
  const [period, setPeriod]               = useState('day')   // 'day' | 'week' | 'month'
  const [custSearch, setCustSearch]       = useState('')      // customer picker search text
  const [showCustDrop, setShowCustDrop]   = useState(false)   // dropdown open?

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
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    setAiParsing(true)
    try {
      const resp = await fetch(`${BACKEND}/api/llm/parse-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, catalog }),
        signal: AbortSignal.timeout(8000),
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

  // Image: AI vision already matched items — drop them straight into the form
  function handleImageItems({ items, unrecognised: unk, source }) {
    setParsedItems(items)
    setUnrecognised(unk)
    setShowNew(true)
    const msg = `${items.length} item${items.length !== 1 ? 's' : ''} matched (${source})${unk.length ? `, ${unk.length} unrecognised` : ''}`
    toast(msg, items.length ? 'success' : 'info')
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
      setCustSearch(''); setShowNew(false)
    } catch (e) { toast(e.message, 'error') }
  }

  // Bucket legacy confirmed/packed into 'pending' for filtering UX
  const filtered    = orders.filter(o => {
    if (filterStatus === 'all') return true
    if (filterStatus === 'pending') return ['pending','confirmed','packed'].includes(o.status)
    return o.status === filterStatus
  })
  const today       = new Date().toDateString()
  const todayOrders = filtered.filter(o => new Date(o.createdAt).toDateString() === today)
  const olderOrders = filtered.filter(o => new Date(o.createdAt).toDateString() !== today)

  // ── Summary calculations ───────────────────────────────────────────────────
  const now = new Date()
  const periodStart = period === 'day'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : period === 'week'
      ? startOfWeek(now, { weekStartsOn: 1 })
      : startOfMonth(now)
  const periodOrders = orders.filter(o => new Date(o.createdAt) >= periodStart)

  const sumTotal     = periodOrders.length
  const sumDelivered = periodOrders.filter(o => o.status === 'delivered').length
  const sumCancelled = periodOrders.filter(o => o.status === 'cancelled').length
  const sumCredit    = periodOrders.filter(o => o.status === 'credit').reduce((s,o) => s + (o.total||0), 0)
  const sumCollected = periodOrders
    .filter(o => o.status === 'delivered')
    .reduce((s,o) => s + (o.total||0), 0)
  const totalUdhaar  = customers.reduce((s,c) => s + (c.udhaar||0), 0)
  const debtors      = customers.filter(c => c.udhaar > 0)
  const oosItems     = products.filter(p => !p.inStock)

  const PERIOD_LABEL = { day: 'Aaj', week: 'Is Hafte', month: 'Is Mahine' }
  const summaryText = `📊 *${PERIOD_LABEL[period]} ka Hisaab*\n🏪 ${shopName || 'My Store'}\n\n📦 Total Orders: ${sumTotal}\n✅ De diya: ${sumDelivered}\n💵 Kamaai: ₹${sumCollected.toLocaleString('en-IN')}\n📋 Udhaar: ₹${sumCredit.toLocaleString('en-IN')}\n💰 Total Bakaya: ₹${totalUdhaar.toLocaleString('en-IN')}${oosItems.length ? `\n⚠️ Khatam: ${oosItems.map(p=>p.name).join(', ')}` : ''}\n\n_Kirana Smart Orders_`

  // Path B: incoming message from whatsapp-web.js → pre-fill form
  function handleIncomingOpen(msg) {
    setCustomerPhone(msg.from_phone || '')
    setCustomerName(msg.from_name || '')
    setCustSearch(msg.from_name || '')
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
    <div className="pb-32 min-h-full animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#f5f5f0]/95 backdrop-blur-md border-b border-zinc-100/80"
           style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
        <div className="px-4 py-3.5 flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">Order Book</h1>
          <div className="flex items-center gap-2">
            {/* List / Summary toggle */}
            <div className="flex items-center bg-zinc-100 rounded-xl p-1 gap-0.5">
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  view === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400'
                }`}
              >
                <List size={13} /> List
              </button>
              <button
                onClick={() => setView('summary')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  view === 'summary' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400'
                }`}
              >
                <BarChart2 size={13} /> Summary
              </button>
            </div>
            <button
              onClick={() => { setShowNew(!showNew); if (view === 'summary') setView('list') }}
              className="btn-primary py-2 px-3.5 text-sm w-auto flex items-center gap-1.5"
            >
              <Plus size={15} /> Naya Order
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">

      {/* ── SUMMARY VIEW ──────────────────────────────────────────────────── */}
      {view === 'summary' && (
        <div className="space-y-4 animate-fade-in">
          {/* Period selector */}
          <div className="seg-bar">
            {[['day','Aaj'],['week','Hafta'],['month','Mahina']].map(([val,label]) => (
              <button key={val} onClick={() => setPeriod(val)}
                className={`seg-item ${period === val ? 'seg-item-active' : ''}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Stats grid — only the 4 things a shopkeeper actually checks */}
          <div className="grid grid-cols-2 gap-3">
            <SumCard icon={<ShoppingBag size={17}/>} label="Total Orders" value={sumTotal}                                   sub={`${sumDelivered} de diya`}                              color="emerald" />
            <SumCard icon={<TrendingUp size={17}/>}  label="Kamaai"       value={`₹${sumCollected.toLocaleString('en-IN')}`} sub="cash + UPI"                                              color="sky" />
            <SumCard icon={<Users size={17}/>}       label="Udhaar"       value={`₹${sumCredit.toLocaleString('en-IN')}`}    sub={`${periodOrders.filter(o=>o.status==='credit').length} orders`} color="orange" />
            <SumCard icon={<XCircle size={17}/>}     label="Cancel"       value={sumCancelled}                               sub="orders"                                                  color="zinc" />
          </div>

          {/* Top bakaya customers */}
          {debtors.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Users size={14} className="text-orange-500" />
                </div>
                <p className="font-bold text-zinc-900 text-sm flex-1">Bakaya Customers</p>
                <span className="font-bold text-orange-500">₹{totalUdhaar.toLocaleString('en-IN')}</span>
              </div>
              <div className="divide-y divide-zinc-50">
                {debtors.sort((a,b)=>(b.udhaar||0)-(a.udhaar||0)).slice(0,5).map(c => (
                  <div key={c.id} className="flex justify-between text-sm py-2">
                    <span className="text-zinc-600 truncate pr-2">{c.name}</span>
                    <span className="font-semibold text-zinc-900 flex-shrink-0">₹{c.udhaar}</span>
                  </div>
                ))}
                {debtors.length > 5 && (
                  <p className="text-xs text-zinc-400 pt-2">+{debtors.length - 5} aur</p>
                )}
              </div>
            </div>
          )}

          {/* Khatam items */}
          {oosItems.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
                <p className="font-bold text-zinc-900 text-sm flex-1">Khatam Saamaan</p>
                <span className="text-xs font-bold text-red-500">{oosItems.length}</span>
              </div>
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

          {/* Share buttons */}
          <div className="space-y-2">
            <WAButton
              href={sendEndOfDaySummary(ownerPhone, { date: PERIOD_LABEL[period], totalOrders: sumTotal, fulfilled: sumDelivered, missed: sumCancelled, collected: sumCollected, credit: sumCredit, stockAlerts: oosItems.map(p=>p.name) })}
              label={`${PERIOD_LABEL[period]} ka Hisaab share karein`}
              size="md"
              block
            />
            <button
              onClick={() => navigator.clipboard?.writeText(summaryText).then(() => alert('Copied!')).catch(() => {})}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Share2 size={16} /> Copy karein
            </button>
          </div>

          {sumTotal === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><BarChart2 size={28} className="text-zinc-300" /></div>
              <p className="text-sm font-semibold text-zinc-400">{PERIOD_LABEL[period]} koi order nahi</p>
            </div>
          )}
        </div>
      )}

      {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
      {view === 'list' && <>

      {/* Path B: auto-ingested WhatsApp messages — tap to open as order */}
      <IncomingMessageBanner onOpen={handleIncomingOpen} />

      {/* New order panel */}
      {showNew && (
        <div className="card-elevated space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="font-bold text-zinc-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <MessageSquare size={14} className="text-emerald-600" />
              </span>
              Naya Order
            </p>
            <button onClick={() => setShowNew(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* ── Customer picker ─────────────────────────────────────────── */}
          <CustomerPicker
            customers={customers}
            name={customerName}
            phone={customerPhone}
            search={custSearch}
            showDrop={showCustDrop}
            onSearchChange={val => {
              setCustSearch(val)
              setCustomerName(val)
              setCustomerPhone('')
              setShowCustDrop(true)
            }}
            onSelect={c => {
              setCustomerName(c.name)
              setCustomerPhone(c.phone || '')
              setCustSearch(c.name)
              setShowCustDrop(false)
            }}
            onPhoneChange={val => setCustomerPhone(val)}
            onBlur={() => setTimeout(() => setShowCustDrop(false), 150)}
            onFocus={() => setShowCustDrop(true)}
          />

          {/* Voice input — speak the order directly */}
          <div className="flex items-center gap-3 bg-zinc-50 rounded-2xl px-4 py-3">
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
            onItemsReady={handleImageItems}
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
        <div className="empty-state">
          <div className="empty-state-icon">
            <ShoppingBag size={28} strokeWidth={1.4} className="text-zinc-300" />
          </div>
          <p className="text-sm font-semibold text-zinc-400">Koi order nahi hai abhi</p>
          <p className="text-xs text-zinc-300">Naya Order pe tap karke pehla order add karein</p>
          <p className="text-[11px] text-zinc-300 mt-3">💡 Order card ko right swipe karein status badhaane ke liye</p>
        </div>
      )}

      <div className="space-y-4">
        {todayOrders.length > 0 && (
          <OrderGroup label="Aaj" orders={todayOrders} expandedId={expandedId}
            setExpandedId={setExpandedId} updateOrder={updateOrder} deleteOrder={deleteOrder} toast={toast} />
        )}
        {olderOrders.length > 0 && (
          <OrderGroup label="Pichhle" orders={olderOrders} expandedId={expandedId}
            setExpandedId={setExpandedId} updateOrder={updateOrder} deleteOrder={deleteOrder} toast={toast} />
        )}
      </div>

      </>}{/* end list view */}

      </div>{/* end page content */}
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

// Color of the "next status" pill shown under the swipe-right hint
const NEXT_STATUS_COLOR = {
  delivered: 'emerald',
}

function OrderCard({ order, expanded, onExpand, updateOrder, deleteOrder, toast }) {
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [notifyLink, setNotifyLink]             = useState(null)
  const [notifyLabel, setNotifyLabel]           = useState('')

  function changeStatus(status) {
    updateOrder(order.id, { status })
    setShowStatusPicker(false)
    toast(statusAdvanceToast(order.status, status) || `Status: ${STATUS_LABEL[status]}`, 'success')

    // Offer customer notification for packed / delivered
    if (order.customerPhone && NOTIFY_ON_STATUS[status]) {
      setNotifyLink(NOTIFY_ON_STATUS[status](order))
      setNotifyLabel(NOTIFY_LABEL[status])
    } else {
      setNotifyLink(null)
    }
  }

  const time = new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const next = nextStatusOf(order.status)
  const canSwipeUdhaar = order.status !== 'credit' && order.status !== 'cancelled' && order.status !== 'delivered'

  return (
    <SwipeableRow
      onSwipeRight={next ? () => changeStatus(next) : undefined}
      onSwipeLeft={canSwipeUdhaar ? () => changeStatus('credit') : undefined}
      rightAction={next ? { label: `→ ${STATUS_LABEL[next]}`, color: NEXT_STATUS_COLOR[next] || 'emerald' } : null}
      leftAction={canSwipeUdhaar ? { label: 'Udhaar', color: 'orange' } : null}
    >
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
    </SwipeableRow>
  )
}

// ── Summary stat card ──────────────────────────────────────────────────────────

function SumCard({ icon, label, value, sub, color }) {
  const colors = {
    emerald: 'text-emerald-600 bg-emerald-500/10',
    sky:     'text-sky-600 bg-sky-500/10',
    violet:  'text-violet-600 bg-violet-500/10',
    orange:  'text-orange-600 bg-orange-500/10',
    amber:   'text-amber-600 bg-amber-500/10',
    zinc:    'text-zinc-400 bg-zinc-500/10',
  }
  return (
    <div className="card-elevated text-left animate-fade-up">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colors[color] || colors.zinc}`}>
        {icon}
      </div>
      <p className="text-xl font-extrabold text-zinc-900 tracking-tight tabular-nums leading-none">{value}</p>
      <p className="text-[10px] font-bold text-zinc-400 mt-1.5 uppercase tracking-[0.08em]">{label}</p>
      <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">{sub}</p>
    </div>
  )
}

// ── Customer picker ────────────────────────────────────────────────────────────

function CustomerPicker({ customers, name, phone, search, showDrop, onSearchChange, onSelect, onPhoneChange, onBlur, onFocus }) {
  const matches = search.trim().length > 0
    ? customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search)
      ).slice(0, 6)
    : customers.slice(0, 6)   // show 6 recents when field is focused empty

  const selected = customers.find(c => c.name === name)

  return (
    <div className="space-y-3">
      {/* Search field */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-500">Customer *</label>
        <div className="relative">
          <input
            className="input-field pr-8"
            placeholder="Search by name or number…"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            autoComplete="off"
          />
          {search && (
            <button
              onMouseDown={e => { e.preventDefault(); onSearchChange('') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500"
            >
              <X size={14} />
            </button>
          )}
          {/* Dropdown */}
          {showDrop && matches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl overflow-hidden z-30"
                 style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)' }}>
              {matches.map(c => (
                <button
                  key={c.id}
                  onMouseDown={e => { e.preventDefault(); onSelect(c) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition-colors border-b border-zinc-50 last:border-0"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${(c.udhaar||0) > 0 ? 'bg-orange-100 text-orange-600' : 'bg-zinc-100 text-zinc-600'}`}>
                    {c.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{c.name}</p>
                    {c.phone && <p className="text-xs text-zinc-400">{c.phone}</p>}
                  </div>
                  {(c.udhaar||0) > 0 && (
                    <span className="text-xs font-bold text-orange-500 flex-shrink-0">₹{c.udhaar} due</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Phone — show once customer is typed/selected */}
      {(selected || name.trim()) && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500">WhatsApp No.</label>
          <input
            className="input-field"
            type="tel"
            inputMode="numeric"
            placeholder="9876543210"
            value={phone}
            onChange={e => onPhoneChange(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
