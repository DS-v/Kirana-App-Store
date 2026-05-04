// Single source of truth for order status — Hinglish labels, colors, ordering,
// and the linear "advance to next status" graph used by swipe-to-advance.

export const STATUSES = ['pending', 'confirmed', 'packed', 'delivered', 'credit', 'cancelled']

export const STATUS_LABEL = {
  pending:   'Bakaya',     // pending  → "remaining / to-do"
  confirmed: 'Tayyar',     // ready / confirmed
  packed:    'Pack',
  delivered: 'De diya',    // "given/delivered"
  credit:    'Udhaar',     // credit
  cancelled: 'Cancel',
}

// Tailwind classes used as `badge ${STATUS_BADGE[status]}`
export const STATUS_BADGE = {
  pending:   'bg-amber-50  text-amber-600',
  confirmed: 'bg-emerald-50 text-emerald-600',
  packed:    'bg-sky-50    text-sky-600',
  delivered: 'bg-violet-50 text-violet-600',
  credit:    'bg-orange-50 text-orange-600',
  cancelled: 'bg-zinc-100  text-zinc-500',
}

// Existing CSS pill classes from index.css
export const STATUS_COLOR = {
  pending:   'status-pending',
  confirmed: 'status-confirmed',
  packed:    'status-packed',
  delivered: 'status-delivered',
  credit:    'status-credit',
  cancelled: 'status-cancelled',
}

export const STATUS_DOT = {
  pending:   'bg-amber-400',
  confirmed: 'bg-emerald-400',
  packed:    'bg-sky-400',
  delivered: 'bg-violet-400',
  credit:    'bg-orange-400',
  cancelled: 'bg-zinc-300',
}

// "Next" status used by swipe-right on an order card. Linear happy path:
// pending → confirmed → packed → delivered. Terminal statuses stay put.
export const NEXT_STATUS = {
  pending:   'confirmed',
  confirmed: 'packed',
  packed:    'delivered',
  delivered: null,
  credit:    null,
  cancelled: null,
}

export function nextStatusOf(status) {
  return NEXT_STATUS[status] ?? null
}

// Friendly Hinglish toast for status transitions
export function statusAdvanceToast(from, to) {
  const map = {
    'pending->confirmed': 'Order tayyar',
    'confirmed->packed':  'Pack ho gaya',
    'packed->delivered':  'De diya ✓',
  }
  return map[`${from}->${to}`] || `${STATUS_LABEL[to]}`
}
