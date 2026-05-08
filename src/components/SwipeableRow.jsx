import { useRef, useState } from 'react'

/**
 * Touch-driven swipeable row.
 *
 *   <SwipeableRow
 *     onSwipeRight={() => advanceStatus()}
 *     onSwipeLeft={() => markUdhaar()}
 *     rightAction={{ label: 'Tayyar', color: 'emerald' }}
 *     leftAction={{  label: 'Udhaar', color: 'orange' }}
 *   >
 *     ...row content...
 *   </SwipeableRow>
 *
 * - Drag right → reveals the right-action color + label, releases past
 *   threshold = fires onSwipeRight.
 * - Drag left  → mirrors with onSwipeLeft.
 * - Below threshold the row springs back. The handler also commits
 *   on a fast flick (velocity check).
 *
 * Designed for mobile (touch). Desktop falls back to children clicks.
 */
const COLORS = {
  emerald: 'bg-kirana-500',
  orange:  'bg-saffron-500',
  red:     'bg-red-500',
  sky:     'bg-sky-500',
  violet:  'bg-violet-500',
}

const THRESHOLD = 80   // px drag to commit
const FLICK_V   = 0.5  // px/ms — fast flick fires even short of threshold

export default function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightAction,
  leftAction,
  disabled = false,
  className = '',
}) {
  const [dx, setDx] = useState(0)
  const [committing, setCommitting] = useState(false)
  const startX = useRef(0)
  const startT = useRef(0)
  const lastX  = useRef(0)
  const lastT  = useRef(0)
  const dragging = useRef(false)

  function onTouchStart(e) {
    if (disabled) return
    dragging.current = true
    startX.current = e.touches[0].clientX
    startT.current = Date.now()
    lastX.current  = startX.current
    lastT.current  = startT.current
  }

  function onTouchMove(e) {
    if (!dragging.current || disabled) return
    const x = e.touches[0].clientX
    let delta = x - startX.current
    // Constrain swipe to enabled directions only
    if (delta > 0 && !onSwipeRight) delta = 0
    if (delta < 0 && !onSwipeLeft)  delta = 0
    setDx(delta)
    lastX.current = x
    lastT.current = Date.now()
  }

  function onTouchEnd() {
    if (!dragging.current || disabled) return
    dragging.current = false
    const elapsed = Math.max(1, lastT.current - startT.current)
    const velocity = Math.abs(dx) / elapsed   // px/ms
    const past = Math.abs(dx) > THRESHOLD || velocity > FLICK_V

    if (past && dx > 0 && onSwipeRight) {
      setCommitting(true)
      setDx(window.innerWidth)
      setTimeout(() => { onSwipeRight(); setDx(0); setCommitting(false) }, 180)
    } else if (past && dx < 0 && onSwipeLeft) {
      setCommitting(true)
      setDx(-window.innerWidth)
      setTimeout(() => { onSwipeLeft(); setDx(0); setCommitting(false) }, 180)
    } else {
      setDx(0)
    }
  }

  const showingRight = dx > 0
  const showingLeft  = dx < 0
  const action = showingRight ? rightAction : showingLeft ? leftAction : null
  const bg = action ? COLORS[action.color] || 'bg-ink-400' : ''

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Underlay action layer */}
      {action && (
        <div className={`absolute inset-0 flex items-center ${bg} ${showingRight ? 'justify-start pl-6' : 'justify-end pr-6'}`}>
          <span className="text-white text-sm font-bold tracking-wide">
            {action.label}
          </span>
        </div>
      )}
      {/* Foreground row, translated */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging.current ? 'none' : 'transform 200ms ease-out',
        }}
        className={`bg-white relative ${committing ? 'pointer-events-none' : ''}`}
      >
        {children}
      </div>
    </div>
  )
}
