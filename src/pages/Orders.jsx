import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, MessageSquare, Check, X, AlertCircle, ShoppingBag, ChevronDown, ChevronUp, BarChart2, List, TrendingUp, Clock, XCircle, Share2, Users, Package, AlertTriangle, Minus, Search, Sparkles, ClipboardPaste, ChevronRight } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'
import WAButton from '../components/WAButton'
import VoiceButton from '../components/VoiceButton'
import IncomingMessageBanner from '../components/IncomingMessageBanner'
import ImageOrderScanner from '../components/ImageOrderScanner'
import { parseOrderMessage, orderTotal } from '../utils/orderParser'
import { isSpeechSupported, createRecognition } from '../utils/speech'
import { STATUSES, STATUS_LABEL, STATUS_BADGE, STATUS_COLOR, STATUS_DOT, nextStatusOf, statusAdvanceToast } from '../utils/orderStatus'
import SwipeableRow from '../components/SwipeableRow'
import BottomSheet from '../components/BottomSheet'
import ItemSwap from '../components/ItemSwap'
import { guessCategory, guessUnit } from '../utils/fileImport'
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
  const addProduct  = useStore(s => s.addProduct)
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
  const [sendWaReceipt, setSendWaReceipt] = useState(true)    // opt-in WA receipt on save
  const [swapTarget, setSwapTarget]       = useState(null)    // {idx, item} when ItemSwap is open
  // Single "Paid" amount; status + payment-split derived on save.
  // - paid >= total → status 'delivered', cash full, udhaar 0
  // - 0 < paid < total → status 'pending', cash = paid, udhaar = total - paid
  // - paid == 0 (or empty) → status 'pending', everything on udhaar
  const [paid, setPaid]                   = useState('')
  const [pasteOpen, setPasteOpen]         = useState(false)   // toggles paste textarea
  // 2-step wizard: 'items' (add products via AI / manual search) →
  // 'review' (customer + payment + save). Closing the sheet resets to
  // 'items' so the next open starts fresh.
  const [step, setStep]                   = useState('items')
  const parseDebounceRef                  = useRef(null)
  const lastParsedRef                     = useRef('')        // last text we auto-parsed

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

  // Auto-parse on paste — 800ms debounce after the last keystroke. Skips if
  // text is short (< 4 chars) or unchanged since last parse.
  useEffect(() => {
    if (!showNew) return
    if (!pasteMsg || pasteMsg.trim().length < 4) return
    if (pasteMsg === lastParsedRef.current) return
    if (parseDebounceRef.current) clearTimeout(parseDebounceRef.current)
    parseDebounceRef.current = setTimeout(() => {
      lastParsedRef.current = pasteMsg
      runParser(pasteMsg)
    }, 800)
    return () => clearTimeout(parseDebounceRef.current)
  }, [pasteMsg, showNew])

  function updateItem(idx, patch) {
    setParsedItems(items => items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  async function confirmOrder() {
    if (!customerName.trim()) return toast('Naam daalein', 'error')
    if (!parsedItems.length)  return toast('Cart khaali hai', 'error')

    const total = orderTotal(parsedItems)
    // Single Paid input — derive split + status:
    //   • paid blank or 0  → fully on udhaar, status 'pending'
    //   • 0 < paid < total → cash = paid, udhaar = remainder, status 'pending'
    //   • paid >= total    → cash = total, udhaar 0, status 'delivered'
    const paidAmt = Math.max(0, parseFloat(paid) || 0)
    if (paidAmt > total + 0.01) {
      return toast(`Paid ₹${paidAmt.toFixed(0)} is more than total ₹${total.toFixed(0)}`, 'error')
    }
    const cash   = paidAmt
    const upi    = 0
    const udhaar = Math.max(0, total - paidAmt)
    const status = udhaar < 0.01 ? 'delivered' : 'pending'

    try {
      await addOrder({
        customerName:  customerName.trim(),
        customerPhone: customerPhone.trim(),
        items:         parsedItems,
        status,
        total,
        rawMessage:    pasteMsg,
        paidCash:      cash,
        paidUpi:       upi,
        paidUdhaar:    udhaar,
      })
      // If any udhaar remains, accumulate on the customer's ledger.
      if (udhaar > 0) {
        const cust = customers.find(c => c.phone === customerPhone.trim())
        if (cust) await addUdhaar(cust.id, udhaar)
      }
      toast('Order saved!', 'success')
      if (sendWaReceipt && customerPhone && status === 'delivered') {
        window.open(sendOrderConfirmation(customerPhone, customerName, parsedItems, total), '_blank')
      }
      // Reset
      setPasteMsg(''); setCustomerName(''); setCustomerPhone(''); setParsedItems([]); setUnrecognised([])
      setCustSearch(''); setPaid(''); setPasteOpen(false); setStep('items')
      setShowNew(false)
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
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 ${
                  view === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400'
                }`}
                style={{ minHeight: 36 }}
              >
                <List size={13} /> List
              </button>
              <button
                onClick={() => setView('summary')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 ${
                  view === 'summary' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400'
                }`}
                style={{ minHeight: 36 }}
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

          {/* Text summary preview — what gets shared via WhatsApp / copied */}
          {sumTotal > 0 && (
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <p className="section-label">{PERIOD_LABEL[period]} ka Hisaab</p>
                <span className="text-[10px] text-zinc-400 font-semibold">share-ready</span>
              </div>
              <pre className="text-xs text-zinc-700 whitespace-pre-wrap font-mono leading-relaxed bg-zinc-50 rounded-2xl px-4 py-3.5">{summaryText}</pre>
              <p className="text-[10px] text-zinc-400 px-1">
                Bakaya customers aur khatam saamaan ki list Profile tab pe milegi.
              </p>
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

      {/* New order — bottom sheet so it opens over the list at any scroll pos */}
      <BottomSheet
        open={showNew}
        onClose={() => { setShowNew(false); setStep('items') }}
        title="Naya Order"
        maxHeight="92vh"
      >
        {(() => {
          const total     = orderTotal(parsedItems)
          const paidNum   = Math.max(0, parseFloat(paid) || 0)
          const remaining = Math.max(0, total - paidNum)
          const overpaid  = paidNum > total + 0.01
          const itemCount = parsedItems.length
          const canContinue = itemCount > 0
          // Customer is "selected" when name has been picked from the list OR
          // typed but not in the list (treated as a new customer with no phone).
          const customerSelected = !!customerName.trim()

          return (
        <div className="space-y-3">
          {/* ── Step indicator ──────────────────────────────────────── */}
          <div className="flex items-center gap-2.5 -mt-1">
            <StepDot
              num="1" label="Saamaan"
              done={step === 'review'} active={step === 'items'}
              clickable
              onClick={() => setStep('items')}
            />
            <div className={`flex-1 h-px transition-colors ${step === 'review' ? 'bg-emerald-300' : 'bg-cream-200'}`} />
            <StepDot
              num="2" label="Customer"
              active={step === 'review'}
              clickable={canContinue}
              onClick={() => canContinue && setStep('review')}
            />
          </div>

          {step === 'items' && (
            <>
              {/* ── 1. Compact AI input ──────────────────────────────── */}
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1">
                  <Sparkles size={11} className="text-emerald-500" /> AI se add karein
                </p>

                <div className="grid grid-cols-3 gap-1.5 bg-cream-100 rounded-2xl p-1.5">
                  <CompactVoiceTile
                    onResult={handleVoiceResult}
                    onInterim={t => setVoiceInterim(t)}
                  />
                  <ImageOrderScanner
                    compact
                    onItemsReady={handleImageItems}
                    onError={msg => toast(msg, 'info')}
                  />
                  <button
                    onClick={() => setPasteOpen(o => !o)}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-colors border ${
                      pasteOpen
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white text-zinc-700 border-cream-200 active:bg-cream-50'
                    }`}
                  >
                    <ClipboardPaste size={16} />
                    <span className="text-[10px] font-bold mt-1 leading-none">Paste</span>
                  </button>
                </div>

                {voiceInterim && (
                  <div className="mt-1.5 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-700 italic">
                    {voiceInterim}…
                  </div>
                )}

                {pasteOpen && (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      className="input-field h-24 resize-none text-sm"
                      placeholder={"Parle-G 2 packet\nMaggi 3\nAmul milk 1 litre"}
                      value={pasteMsg}
                      onChange={e => { setPasteMsg(e.target.value); setParsedItems([]); setUnrecognised([]) }}
                      autoFocus
                    />
                    {pasteMsg.trim().length >= 4 && (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 px-1">
                        {aiParsing ? (
                          <>
                            <span className="w-3 h-3 rounded-full border-2 border-zinc-300 border-t-emerald-500 animate-spin" />
                            <span className="text-emerald-600">AI parsing…</span>
                          </>
                        ) : (
                          <>
                            <span className="text-emerald-500">✦</span>
                            <span>Auto-parses jab tum likhna band karte ho</span>
                            <button onClick={handleParse} className="ml-auto text-emerald-600 underline">
                              Parse abhi
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {aiParsing && !pasteOpen && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-emerald-600 px-1">
                    <span className="w-3 h-3 rounded-full border-2 border-zinc-300 border-t-emerald-500 animate-spin" />
                    AI parsing…
                  </div>
                )}
              </div>

              {/* ── 2. Cart container — search-and-add INSIDE ─────────── */}
              <div className="card p-0 overflow-hidden">
                <div className="px-3 pt-3 pb-2 border-b border-cream-100">
                  <ProductSearchAdd
                    products={products}
                    onAdd={(p) => {
                      setParsedItems(items => {
                        const existing = items.findIndex(it => it.productId === p.id)
                        if (existing >= 0) {
                          return items.map((it, i) => i === existing ? { ...it, qty: (it.qty || 1) + 1 } : it)
                        }
                        return [...items, {
                          productId:   p.id,
                          productName: p.name,
                          qty:         1,
                          unit:        p.unit || 'pc',
                          price:       p.price ?? 0,
                          inStock:     p.inStock ?? true,
                        }]
                      })
                    }}
                  />
                </div>

                {parsedItems.length === 0 && unrecognised.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-zinc-400 leading-relaxed">
                    Cart khaali hai.<br/>
                    Saamaan dhoondhke add karein <span className="text-zinc-300">↑</span>
                    {' '}ya AI se add karein <span className="text-zinc-300">↑</span>
                  </div>
                ) : (
                  <>
                    {ackLink && (
                      <div className="px-3 pt-2.5">
                        <WAButton href={ackLink} label="Acknowledge receipt" />
                      </div>
                    )}

                    <div className="divide-y divide-cream-50">
                      {parsedItems.map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2.5 px-3 py-2.5 ${item.inStock ? '' : 'bg-red-50/40'}`}
                        >
                          <button
                            onClick={() => setSwapTarget({ idx, item })}
                            className="flex-1 min-w-0 text-left active:opacity-70"
                            title="Tap to swap this item"
                          >
                            <p className="font-semibold text-zinc-800 text-sm truncate">{item.productName}</p>
                            <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                              ₹{item.price} / {item.unit}
                              {item.sourceLine && <> · from: "{item.sourceLine}"</>}
                              {!item.inStock && <span className="ml-1 text-red-500 font-bold">OOS</span>}
                            </p>
                          </button>

                          <div className="flex items-center bg-white border border-cream-200 rounded-lg overflow-hidden flex-shrink-0">
                            <button
                              onClick={() => updateItem(idx, { qty: Math.max(1, (item.qty || 1) - 1) })}
                              className="w-7 h-7 flex items-center justify-center text-zinc-500 active:bg-cream-100"
                              aria-label="Kam karein"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="min-w-[24px] text-center text-sm font-bold text-zinc-800 tabular-nums">
                              {item.qty}
                            </span>
                            <button
                              onClick={() => updateItem(idx, { qty: (item.qty || 1) + 1 })}
                              className="w-7 h-7 flex items-center justify-center text-zinc-500 active:bg-cream-100"
                              aria-label="Zyada karein"
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          <span className="text-xs font-bold text-zinc-700 tabular-nums w-12 text-right flex-shrink-0">
                            ₹{(item.price * item.qty).toFixed(0)}
                          </span>

                          <button
                            onClick={() => setParsedItems(p => p.filter((_, i) => i !== idx))}
                            className="text-zinc-300 active:text-red-400 flex-shrink-0"
                            aria-label="Remove item"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}

                      {unrecognised.map((u, idx) => (
                        <div key={idx} className="px-3 py-2.5">
                          <UnrecognisedItem
                            item={u}
                            onAddToCatalog={async (name, price) => {
                              try {
                                const product = await addProduct({
                                  name,
                                  price: Number(price) || 0,
                                  unit:  guessUnit(name) || 'pc',
                                  category: guessCategory(name) || 'Other',
                                  inStock: true,
                                })
                                setParsedItems(p => [...p, {
                                  productId:   product.id,
                                  productName: product.name,
                                  qty:         u.qty || 1,
                                  unit:        product.unit,
                                  price:       product.price,
                                  inStock:     true,
                                  sourceLine:  u.originalLine,
                                }])
                                setUnrecognised(curr => curr.filter((_, i) => i !== idx))
                                try {
                                  const { api } = await import('../api/client.js')
                                  api.post('/api/corrections', {
                                    rawLine:   u.originalLine,
                                    productId: product.id,
                                  }).catch(() => {})
                                } catch {}
                                toast(`${product.name} catalog me jud gaya`, 'success')
                              } catch (e) { toast(e.message, 'error') }
                            }}
                            onAddOneOff={(name, price, qty) => {
                              setParsedItems(p => [...p, {
                                productId:   null,
                                productName: name,
                                qty:         qty || 1,
                                unit:        guessUnit(name) || 'pc',
                                price,
                                inStock:     true,
                              }])
                              setUnrecognised(curr => curr.filter((_, i) => i !== idx))
                            }}
                            onSkip={() => setUnrecognised(curr => curr.filter((_, i) => i !== idx))}
                          />
                        </div>
                      ))}
                    </div>

                    {parsedItems.length > 0 && (
                      <div className="px-4 py-2.5 bg-cream-50 border-t border-cream-100 flex justify-between items-center">
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{itemCount} item · Total</span>
                        <span className="text-lg font-extrabold text-zinc-900 tabular-nums">₹{total.toFixed(0)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {oosLink && (
                <WAButton href={oosLink} label="Notify customer about OOS items" block size="md" className="border border-red-100 !text-red-600 !bg-red-50 active:!bg-red-100" />
              )}

              {/* ── Sticky "Aage Badho" — only enabled when cart has items ── */}
              <div className="sticky bottom-0 -mx-4 -mb-4 px-4 pb-4 pt-2 bg-white border-t border-cream-100">
                <button
                  onClick={() => canContinue && setStep('review')}
                  disabled={!canContinue}
                  className="btn-primary py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  Aage Badho — Customer aur Payment
                  {canContinue && <ChevronRight size={16} />}
                </button>
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              {/* ── Compact cart summary chip with edit-back ─────────── */}
              <button
                onClick={() => setStep('items')}
                className="card w-full text-left flex items-center gap-3 active:bg-cream-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <ShoppingBag size={16} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-900">{itemCount} item · ₹{total.toFixed(0)}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                    {parsedItems.slice(0, 3).map(i => i.productName).join(', ')}
                    {itemCount > 3 && ` +${itemCount - 3} aur`}
                  </p>
                </div>
                <span className="text-[11px] font-bold text-emerald-600">Edit ↑</span>
              </button>

              {/* ── Customer ─────────────────────────────────────────── */}
              <div className="space-y-2">
                <RecentCustomerChips
                  orders={orders}
                  customers={customers}
                  current={customerPhone || customerName}
                  onPick={c => {
                    setCustomerName(c.name)
                    setCustomerPhone(c.phone || '')
                    setCustSearch(c.name)
                    setShowCustDrop(false)
                  }}
                />
                <CustomerSelectOnly
                  customers={customers}
                  name={customerName}
                  phone={customerPhone}
                  search={custSearch}
                  showDrop={showCustDrop}
                  onSearchChange={val => {
                    setCustSearch(val)
                    setCustomerName(val)
                    // Clear phone — re-derived only when user picks from the list.
                    setCustomerPhone('')
                    setShowCustDrop(true)
                  }}
                  onSelect={c => {
                    setCustomerName(c.name)
                    setCustomerPhone(c.phone || '')
                    setCustSearch(c.name)
                    setShowCustDrop(false)
                  }}
                  onBlur={() => setTimeout(() => setShowCustDrop(false), 150)}
                  onFocus={() => setShowCustDrop(true)}
                />
              </div>

              {/* ── Payment ──────────────────────────────────────────── */}
              <div className="card space-y-2.5">
                <div>
                  <label className="field-label">Paisa diya</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">₹</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      className="input-field pl-8 pr-20 text-base font-bold tabular-nums"
                      placeholder={total.toFixed(0)}
                      value={paid}
                      onChange={e => setPaid(e.target.value)}
                    />
                    <button
                      onClick={() => setPaid(total.toFixed(0))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 text-xs font-extrabold px-2 py-1 rounded-md active:bg-emerald-50"
                    >
                      PURA
                    </button>
                  </div>
                </div>

                <div className={`flex items-center justify-between text-sm rounded-xl px-3 py-2 ${
                  overpaid
                    ? 'bg-red-50 border border-red-100'
                    : remaining > 0
                      ? 'bg-amber-50/60'
                      : 'bg-emerald-50/60'
                }`}>
                  <span className="font-semibold text-zinc-600">
                    {overpaid ? 'Zyada paise diye' : remaining > 0 ? 'Bakaya (udhaar pe jaayega)' : 'Pura paid hua'}
                  </span>
                  <span className={`font-extrabold tabular-nums ${
                    overpaid
                      ? 'text-red-600'
                      : remaining > 0
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                  }`}>
                    {overpaid
                      ? `−₹${(paidNum - total).toFixed(0)}`
                      : `₹${remaining.toFixed(0)}`}
                  </span>
                </div>

                {customerPhone && (
                  <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer select-none px-1 pt-0.5">
                    <input
                      type="checkbox"
                      checked={sendWaReceipt}
                      onChange={e => setSendWaReceipt(e.target.checked)}
                      className="rounded"
                    />
                    WhatsApp receipt bhejo (+91 {customerPhone})
                  </label>
                )}
              </div>

              {/* ── Sticky save row ──────────────────────────────────── */}
              <div className="sticky bottom-0 -mx-4 -mb-4 px-4 pb-4 pt-2 bg-white border-t border-cream-100 flex gap-2">
                <button
                  onClick={() => setStep('items')}
                  className="px-4 py-3.5 rounded-2xl text-sm font-bold text-zinc-500 active:bg-cream-100 active:scale-[0.98] transition-transform"
                >
                  ← Back
                </button>
                <button
                  onClick={confirmOrder}
                  disabled={overpaid || !customerSelected}
                  className="btn-primary flex-1 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check size={16} />
                  Save Order — ₹{total.toFixed(0)}
                  {remaining > 0 && !overpaid && (
                    <span className="text-amber-100 font-bold ml-0.5">· ₹{remaining.toFixed(0)} udhaar</span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
          )
        })()}
      </BottomSheet>

      {/* Tap-to-swap drawer — replaces an AI-matched cart item with a
          different catalog product (or a one-off custom line). */}
      <ItemSwap
        open={!!swapTarget}
        onClose={() => setSwapTarget(null)}
        originalLine={swapTarget?.item.sourceLine || swapTarget?.item.productName}
        currentItem={swapTarget?.item}
        products={products}
        onSwap={newItem => {
          setParsedItems(p => p.map((it, i) => i === swapTarget.idx ? newItem : it))
          // Record the correction so future parses skip the LLM for this line.
          if (swapTarget?.item?.sourceLine && newItem.productId) {
            import('../api/client.js').then(({ api }) =>
              api.post('/api/corrections', {
                rawLine:   swapTarget.item.sourceLine,
                productId: newItem.productId,
              }).catch(() => {/* non-fatal */}))
          }
          setSwapTarget(null)
          toast(`Swapped to ${newItem.productName}`, 'success')
        }}
        onOneOff={newItem => {
          setParsedItems(p => p.map((it, i) => i === swapTarget.idx ? newItem : it))
          setSwapTarget(null)
          toast('One-off item daala', 'info')
        }}
      />

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

// ── Unrecognised line-item recovery ─────────────────────────────────────────
// Shown when the parser couldn't match a pasted/voice line to any catalog
// product. Three exits: add to catalog (persists), add one-off (just this
// order), or skip. Inline so the shopkeeper never has to leave the order.
function UnrecognisedItem({ item, onAddToCatalog, onAddOneOff, onSkip }) {
  const [open, setOpen]   = useState(false)
  const [name, setName]   = useState(item.productName || item.originalLine || '')
  const [price, setPrice] = useState('')
  const [qty, setQty]     = useState(item.qty || 1)

  const numPrice = parseFloat(price) || 0
  const valid    = name.trim().length > 0 && numPrice > 0

  return (
    <div className="bg-amber-50 rounded-xl p-3 space-y-2 animate-fade-up">
      <div className="flex items-center gap-2">
        <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
        <p className="text-xs font-semibold text-zinc-700 flex-1 truncate">
          "{item.originalLine || item.productName}" — catalog me nahi hai
        </p>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="text-[11px] font-bold text-emerald-600 px-2 py-1 rounded-lg hover:bg-emerald-50"
          >
            Fix karein
          </button>
        )}
        <button
          onClick={onSkip}
          className="text-[11px] font-bold text-zinc-400 px-2 py-1 rounded-lg hover:bg-zinc-100"
          title="Hata do"
        >
          Skip
        </button>
      </div>

      {open && (
        <>
          <div className="grid grid-cols-[1fr_70px_60px] gap-2">
            <input
              className="input-field py-1.5 text-sm"
              placeholder="Product naam"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              type="number"
              inputMode="numeric"
              className="input-field py-1.5 text-sm"
              placeholder="₹ price"
              value={price}
              onChange={e => setPrice(e.target.value)}
              autoFocus
            />
            <input
              type="number"
              inputMode="numeric"
              className="input-field py-1.5 text-sm text-center"
              placeholder="Qty"
              value={qty}
              onChange={e => setQty(parseFloat(e.target.value) || 1)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => valid && onAddToCatalog(name.trim(), numPrice, qty)}
              disabled={!valid}
              className="py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold disabled:opacity-40 active:scale-95 transition-transform"
            >
              Catalog me add karein
            </button>
            <button
              onClick={() => valid && onAddOneOff(name.trim(), numPrice, qty)}
              disabled={!valid}
              className="py-2 bg-white border border-zinc-200 text-zinc-600 rounded-xl text-xs font-bold disabled:opacity-40 active:scale-95 transition-transform"
              title="Sirf is order ke liye, catalog me save nahi hoga"
            >
              Sirf is order ke liye
            </button>
          </div>
        </>
      )}
    </div>
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

// Compact ₹ input cell for the payment split row at the bottom of Naya
// Order. Empty = no contribution; the save handler defaults to "all cash"
// when every cell is blank.
// CompactVoiceTile — fits in the 3-column AI input grid alongside the photo
// and paste tiles. Same hold-to-record UX as VoiceButton, just shaped like
// a tile. Returns null if the browser doesn't support speech recognition,
// which keeps the grid layout sensible for desktop Chrome / Safari fallback.
function CompactVoiceTile({ onResult, onInterim }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)

  if (!isSpeechSupported()) {
    return (
      <div className="flex flex-col items-center justify-center py-2.5 rounded-xl bg-zinc-50 text-zinc-300 border border-cream-200 cursor-not-allowed">
        <X size={16} />
        <span className="text-[10px] font-bold mt-1 leading-none">Voice ✕</span>
      </div>
    )
  }

  function start() {
    const rec = createRecognition()
    if (!rec) return
    recRef.current = rec
    rec.onstart = () => setListening(true)
    rec.onend   = () => { setListening(false); onInterim?.('') }
    rec.onerror = () => { setListening(false); onInterim?.('') }
    rec.onresult = (e) => {
      const results = Array.from(e.results)
      const interimText = results.map(r => r[0].transcript).join(' ')
      onInterim?.(interimText)
      const final = results.find(r => r.isFinal)
      if (final) {
        onResult?.(final[0].transcript.trim())
        onInterim?.('')
      }
    }
    rec.start()
  }
  function stop() {
    recRef.current?.stop()
    setListening(false)
    onInterim?.('')
  }

  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      title={listening ? 'Sun raha hoon…' : 'Hold to speak'}
      className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-colors border select-none ${
        listening
          ? 'bg-red-500 text-white border-red-500 voice-active'
          : 'bg-white text-zinc-700 border-cream-200 active:bg-cream-50'
      }`}
    >
      {/* Inline mic glyph — keeps the import small. */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10a7 7 0 0 1-14 0" />
        <line x1="12" y1="17" x2="12" y2="22" />
        <line x1="8"  y1="22" x2="16" y2="22" />
      </svg>
      <span className="text-[10px] font-bold mt-1 leading-none">
        {listening ? 'Sun raha…' : 'Speak'}
      </span>
    </button>
  )
}

// Search the catalog and add one item at a time to the cart. Autocomplete
// ranks by token overlap + substring — same approach as ItemSwap.
function ProductSearchAdd({ products, onAdd }) {
  const [q, setQ]       = useState('')
  const [open, setOpen] = useState(false)

  const matches = (() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    const ranked = products
      .map(p => {
        const hay = (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase()
        const sub = hay.includes(term) ? 2 : 0
        const tok = term.split(/\s+/).filter(Boolean).reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)
        return { p, score: sub * 3 + tok }
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
      .slice(0, 8)
      .map(({ p }) => p)
    return ranked
  })()

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">
        Saamaan add karein
      </p>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          className="input-field pl-10 text-sm"
          placeholder="Naam likhke ek-ek karke add karein…"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {q && (
          <button
            onMouseDown={e => { e.preventDefault(); setQ(''); setOpen(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500"
          >
            <X size={14} />
          </button>
        )}

        {open && matches.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl overflow-hidden z-30"
               style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)' }}>
            {matches.map(p => (
              <button
                key={p.id}
                onMouseDown={e => { e.preventDefault(); onAdd(p); setQ(''); setOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 active:bg-zinc-100 transition-colors border-b border-zinc-50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{p.name}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    ₹{p.price} / {p.unit}
                    {!p.inStock && <span className="ml-2 text-red-500 font-bold">Khatam</span>}
                  </p>
                </div>
                <Plus size={14} className="text-emerald-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Top 5 customers by last-order date, surfaced as one-tap chips so the
// shopkeeper rarely has to type for repeat customers.
function RecentCustomerChips({ orders, customers, current, onPick }) {
  const top = (() => {
    const seen = new Map()
    for (const o of orders.slice(0, 50)) {
      const key = (o.customerPhone || o.customerName || '').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      const c = customers.find(c =>
        (o.customerPhone && c.phone === o.customerPhone) ||
        c.name?.toLowerCase() === o.customerName?.toLowerCase()
      ) || { name: o.customerName, phone: o.customerPhone || '' }
      seen.set(key, c)
      if (seen.size >= 5) break
    }
    return [...seen.values()]
  })()

  if (!top.length) return null

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">
        Recent
      </p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {top.map((c, i) => {
          const active = current && (c.phone === current || c.name === current)
          return (
            <button
              key={c.phone || c.name || i}
              onClick={() => onPick(c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                active
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white border border-zinc-200 text-zinc-600 active:bg-zinc-50'
              }`}
            >
              {c.name || c.phone}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// StepDot — small numbered circle in the 2-step wizard's progress header.
// `done` = completed earlier step (filled, with checkmark)
// `active` = current step (filled, highlighted)
// neither = upcoming step (outlined, muted)
function StepDot({ num, label, active, done, clickable, onClick }) {
  const stateClass = done
    ? 'bg-emerald-500 text-white border-emerald-500'
    : active
      ? 'bg-emerald-500 text-white border-emerald-500 ring-4 ring-emerald-100'
      : 'bg-white text-zinc-400 border-cream-200'
  return (
    <button
      type="button"
      onClick={clickable && onClick ? onClick : undefined}
      disabled={!clickable}
      className={`flex items-center gap-2 px-1 py-0.5 rounded-lg ${clickable ? 'active:bg-cream-50' : 'cursor-default'}`}
    >
      <span className={`w-6 h-6 rounded-full border-2 text-[11px] font-extrabold flex items-center justify-center transition-colors ${stateClass}`}>
        {done ? '✓' : num}
      </span>
      <span className={`text-[11px] font-bold uppercase tracking-wider ${active ? 'text-zinc-900' : done ? 'text-emerald-700' : 'text-zinc-400'}`}>
        {label}
      </span>
    </button>
  )
}

// CustomerSelectOnly — same dropdown UX as CustomerPicker but WITHOUT the
// separate phone input. The phone is read-only context: shown as a chip
// when the selected name matches an existing customer record. New names
// (typed but not in the customer list) are saved with no phone — the
// shopkeeper can add it later from the Khaata page.
function CustomerSelectOnly({ customers, name, phone, search, showDrop, onSearchChange, onSelect, onBlur, onFocus }) {
  const matches = search.trim().length > 0
    ? customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search)
      ).slice(0, 6)
    : customers.slice(0, 6)   // show 6 recents when focused empty

  const selected = customers.find(c => c.name === name)
  const isNew    = !!name.trim() && !selected

  return (
    <div className="space-y-1.5">
      <label className="field-label">Customer *</label>
      <div className="relative">
        <input
          className="input-field pr-8"
          placeholder="Naam dhoondein ya naya likhein…"
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
        {showDrop && matches.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl overflow-hidden z-30"
               style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)' }}>
            {matches.map(c => (
              <button
                key={c.id}
                onMouseDown={e => { e.preventDefault(); onSelect(c) }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-cream-50 active:bg-cream-100 border-b border-cream-50 last:border-0"
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${(c.udhaar||0) > 0 ? 'bg-orange-100 text-orange-600' : 'bg-zinc-100 text-zinc-600'}`}>
                  {c.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{c.name}</p>
                  {c.phone && <p className="text-xs text-zinc-400">+91 {c.phone}</p>}
                </div>
                {(c.udhaar||0) > 0 && (
                  <span className="text-xs font-bold text-orange-500 flex-shrink-0">₹{c.udhaar} due</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected-customer chip OR "Naya customer" chip */}
      {selected && (
        <p className="text-[11px] text-zinc-500 px-1">
          {phone
            ? <>Phone: <span className="font-semibold text-zinc-700">+91 {phone}</span></>
            : <span className="text-zinc-400 italic">Phone nahi hai — Khaata se add kar sakte hain</span>}
        </p>
      )}
      {isNew && (
        <p className="text-[11px] text-emerald-600 font-semibold px-1">
          ✦ Naya customer — phone baad mein add kar sakte hain
        </p>
      )}
    </div>
  )
}

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
