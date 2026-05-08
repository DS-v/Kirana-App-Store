import { useState, useMemo } from 'react'
import { Search, X, ArrowLeftRight } from 'lucide-react'
import BottomSheet from './BottomSheet'

/**
 * <ItemSwap> — drawer that lets the shopkeeper replace an AI-matched cart
 * item with a different catalog product (or with a one-off custom item).
 *
 * Triggered by tapping a cart item. Pre-fills the search box with the
 * original line text so the most likely candidates surface first.
 *
 * Props:
 *   open        : boolean
 *   onClose     : () => void
 *   originalLine: the text the LLM matched from (e.g. "biscuit 1 packet")
 *   currentItem : the cart item being replaced (productId, productName, …)
 *   products    : full catalog
 *   onSwap      : (newItem) => void   replaces the cart item
 *   onOneOff    : ({name, price, qty}) => void   adds as one-off line
 */

// Same token approach the backend uses, so candidate ranking matches.
function tokens(s) {
  return (s || '').toLowerCase()
    .normalize('NFKD')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 2)
}

function tokenOverlap(a, b) {
  const A = new Set(tokens(a))
  let n = 0
  for (const t of tokens(b)) if (A.has(t)) n++
  return n
}

function rankCandidates(products, query, currentId) {
  const q = (query || '').trim()
  if (!q) return products.slice(0, 30)
  return products
    .map(p => {
      const haystack = [p.name, ...(p.aliases || [])].join(' ')
      const overlap = tokenOverlap(haystack, q)
      const subStr  = haystack.toLowerCase().includes(q.toLowerCase()) ? 2 : 0
      return { p, score: overlap * 3 + subStr }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .map(({ p }) => p)
    .slice(0, 30)
}

export default function ItemSwap({
  open, onClose, originalLine, currentItem, products, onSwap, onOneOff,
}) {
  const [query, setQuery]       = useState(originalLine || currentItem?.productName || '')
  const [oneOffPrice, setPrice] = useState('')
  const [oneOffQty, setQty]     = useState(currentItem?.qty || 1)

  const candidates = useMemo(
    () => rankCandidates(products || [], query, currentItem?.productId),
    [products, query, currentItem?.productId]
  )

  function handlePick(p) {
    onSwap({
      productId:   p.id,
      productName: p.name,
      qty:         currentItem?.qty || 1,
      unit:        p.unit || currentItem?.unit || 'pc',
      price:       p.price ?? 0,
      inStock:     p.inStock ?? true,
      sourceLine:  originalLine,
    })
  }

  function handleOneOff() {
    const price = parseFloat(oneOffPrice)
    if (!query.trim() || !(price > 0)) return
    onOneOff({
      productName: query.trim(),
      qty:         oneOffQty || 1,
      price,
      unit:        currentItem?.unit || 'pc',
      inStock:     true,
      productId:   null,
      sourceLine:  originalLine,
    })
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Saamaan badlein" maxHeight="80vh">
      <div className="space-y-3">
        {originalLine && (
          <div className="text-[11px] text-ink-400 px-1">
            <span className="font-bold">Original:</span> "{originalLine}"
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input-field pl-10 text-sm"
            placeholder="Search saamaan…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-400"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {candidates.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-ink-400 uppercase px-1">
              Matches
            </p>
            <div className="space-y-1 max-h-72 overflow-y-auto no-scrollbar -mx-1 px-1">
              {candidates.map(p => {
                const isCurrent = currentItem?.productId === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePick(p)}
                    disabled={isCurrent}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      isCurrent
                        ? 'bg-kirana-50 text-kirana-700 ring-1 ring-kirana-200'
                        : 'bg-white border border-ink-100 active:bg-cream-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-700 truncate">{p.name}</p>
                      <p className="text-[11px] text-ink-400 mt-0.5">
                        {p.category} · ₹{p.price} / {p.unit}
                        {!p.inStock && <span className="ml-2 text-red-500 font-bold">Khatam</span>}
                      </p>
                    </div>
                    {isCurrent
                      ? <span className="text-[10px] font-bold text-kirana-700">Abhi yahi hai</span>
                      : <ArrowLeftRight size={14} className="text-ink-300" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* One-off escape hatch — for items that aren't in catalog AND won't be added permanently */}
        <div className="border-t border-ink-100 pt-3 space-y-2">
          <p className="text-[10px] font-bold text-ink-400 uppercase px-1">
            Sirf is order ke liye
          </p>
          <div className="grid grid-cols-[1fr_70px_60px] gap-2">
            <input
              className="input-field py-2 text-sm"
              placeholder="Product naam"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <input
              type="number" inputMode="numeric"
              className="input-field py-2 text-sm"
              placeholder="₹ price"
              value={oneOffPrice}
              onChange={e => setPrice(e.target.value)}
            />
            <input
              type="number" inputMode="numeric"
              className="input-field py-2 text-sm text-center"
              placeholder="Qty"
              value={oneOffQty}
              onChange={e => setQty(parseFloat(e.target.value) || 1)}
            />
          </div>
          <button
            onClick={handleOneOff}
            disabled={!query.trim() || !(parseFloat(oneOffPrice) > 0)}
            className="w-full py-2.5 bg-kirana-50 text-kirana-700 rounded-xl text-xs font-bold disabled:opacity-40 active:scale-95 transition-transform"
          >
            One-off ke roop me daalein
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
