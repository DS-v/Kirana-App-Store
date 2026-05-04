import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * Mobile-friendly bottom sheet. Renders a full-width pinned sheet that slides
 * up from the bottom; tapping the backdrop closes it. Keeps the body locked
 * while open. Children scroll independently.
 *
 *   <BottomSheet open={x} onClose={fn} title="…" maxHeight="85vh">
 *     ...content...
 *   </BottomSheet>
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = '85vh',
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in"
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl flex flex-col animate-slide-up"
        style={{
          maxHeight,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.18), 0 -2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {/* Drag handle */}
        <div className="flex flex-col items-center pt-2 pb-1 flex-shrink-0">
          <span className="w-10 h-1 rounded-full bg-zinc-200" />
        </div>

        {/* Header */}
        {(title || onClose) && (
          <div className="flex items-center justify-between px-4 pt-1 pb-2 border-b border-zinc-50 flex-shrink-0">
            <p className="font-bold text-zinc-900 text-base flex-1 truncate">{title}</p>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}
