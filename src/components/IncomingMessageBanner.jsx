/**
 * IncomingMessageBanner
 *
 * Shown at the top of the Orders page when new WhatsApp messages have arrived
 * via the whatsapp-web.js auto-ingestion path (Path B).
 *
 * Each card shows:
 *  - Sender name + phone
 *  - Raw message (truncated)
 *  - "Open Order" → populates the New Order form with this message
 *  - "Dismiss" → marks as dismissed
 */

import { X, MessageSquare } from 'lucide-react'
import { api } from '../api/client'
import useStore from '../store/useStore'

export default function IncomingMessageBanner({ onOpen }) {
  const messages          = useStore(s => s.incomingMessages)
  const dismissMsg        = useStore(s => s.dismissIncomingMessage)

  const pending = messages.filter(m => m.status === 'pending')
  if (!pending.length) return null

  async function handleDismiss(msg) {
    dismissMsg(msg.id)
    try { await api.post(`/api/whatsapp/dismiss/${msg.id}`, {}) } catch { /* non-fatal */ }
  }

  async function handleOpen(msg) {
    onOpen(msg)   // parent populates the form
    try { await api.post(`/api/whatsapp/convert/${msg.id}`, {}) } catch { /* non-fatal */ }
    dismissMsg(msg.id)
  }

  return (
    <div className="space-y-2">
      <p className="section-label flex items-center gap-1.5">
        <MessageSquare size={12} className="text-emerald-500" />
        {pending.length} new WhatsApp order{pending.length > 1 ? 's' : ''}
      </p>

      {pending.map(msg => (
        <div
          key={msg.id}
          className="card border-emerald-100 bg-emerald-50/40 space-y-2.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-900">
                {msg.from_name || msg.from_phone}
              </p>
              {msg.from_name && (
                <p className="text-xs text-zinc-400">+91 {msg.from_phone}</p>
              )}
              <p className="text-xs text-zinc-600 mt-1.5 line-clamp-2 leading-relaxed">
                {msg.message}
              </p>
            </div>
            <button
              onClick={() => handleDismiss(msg)}
              className="text-zinc-300 hover:text-zinc-500 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          <button
            onClick={() => handleOpen(msg)}
            className="w-full text-center text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 py-2 rounded-lg transition-colors"
          >
            Open as New Order →
          </button>
        </div>
      ))}
    </div>
  )
}
