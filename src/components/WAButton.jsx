import { ExternalLink } from 'lucide-react'

/**
 * A WhatsApp deep-link button.
 *
 * Props:
 *  href      – wa.me URL (from whatsapp.js helpers)
 *  label     – button text
 *  size      – 'sm' | 'md' (default 'sm')
 *  block     – full-width (default false)
 *  className – extra classes
 */
export default function WAButton({ href, label = 'Send via WhatsApp', size = 'sm', block = false, className = '' }) {
  if (!href) return null

  const base =
    'inline-flex items-center justify-center gap-1.5 font-semibold ' +
    'text-emerald-700 bg-emerald-50 rounded-xl transition-colors ' +
    'hover:bg-emerald-100 active:scale-95 active:transition-transform'

  const sizes = {
    sm: 'text-xs px-3 py-2',
    md: 'text-sm px-4 py-2.5',
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${base} ${sizes[size] ?? sizes.sm} ${block ? 'w-full' : ''} ${className}`}
    >
      <ExternalLink size={size === 'md' ? 14 : 11} />
      {label}
    </a>
  )
}
