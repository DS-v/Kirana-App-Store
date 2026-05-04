// Single source of truth for order status.
//
// Effective UI statuses (4): bakaya · delivered · credit · cancelled
// We DROP the intermediate "confirmed" and "packed" workflow steps — kirana
// shopkeepers don't need that granularity. Anything still pending in the DB
// (pending/confirmed/packed) is shown as "Bakaya" in the UI.
//
// On disk we keep the existing CHECK constraint values; we just normalize for
// display + bucket old confirmed/packed into 'pending' on writes.

// What the user actually sees / can pick.
export const STATUSES = ['pending', 'delivered', 'credit', 'cancelled']

// Hinglish display labels.
export const STATUS_LABEL = {
  pending:   'Bakaya',     // anything in-progress
  delivered: 'De diya',    // done
  credit:    'Udhaar',     // sold on credit
  cancelled: 'Cancel',
  // Legacy DB values still showing up — bucket into Bakaya:
  confirmed: 'Bakaya',
  packed:    'Bakaya',
}

// Normalize legacy DB statuses → display bucket.
export function bucketStatus(status) {
  if (status === 'confirmed' || status === 'packed') return 'pending'
  return status
}

// Tailwind classes used inline (e.g. <span className={STATUS_BADGE[s]}>).
export const STATUS_BADGE = {
  pending:   'bg-amber-50  text-amber-600',
  delivered: 'bg-emerald-50 text-emerald-600',
  credit:    'bg-orange-50 text-orange-600',
  cancelled: 'bg-zinc-100  text-zinc-500',
  confirmed: 'bg-amber-50  text-amber-600',
  packed:    'bg-amber-50  text-amber-600',
}

export const STATUS_DOT = {
  pending:   'bg-amber-400',
  delivered: 'bg-emerald-400',
  credit:    'bg-orange-400',
  cancelled: 'bg-zinc-300',
  confirmed: 'bg-amber-400',
  packed:    'bg-amber-400',
}

// Existing CSS pill classes from index.css
export const STATUS_COLOR = {
  pending:   'status-pending',
  delivered: 'status-delivered',
  credit:    'status-credit',
  cancelled: 'status-cancelled',
  confirmed: 'status-pending',
  packed:    'status-pending',
}

// Right-swipe advances Bakaya straight to De diya. No intermediate steps.
export const NEXT_STATUS = {
  pending:   'delivered',
  confirmed: 'delivered',
  packed:    'delivered',
  delivered: null,
  credit:    null,
  cancelled: null,
}

export function nextStatusOf(status) {
  return NEXT_STATUS[status] ?? null
}

export function statusAdvanceToast(from, to) {
  if (to === 'delivered') return 'De diya ✓'
  if (to === 'credit')    return 'Udhaar mein dala'
  if (to === 'cancelled') return 'Cancel ho gaya'
  return STATUS_LABEL[to] || ''
}
