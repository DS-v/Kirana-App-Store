import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((msg, type = 'info', duration = 3000) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const icons = {
    success: <CheckCircle size={18} className="text-green-600" />,
    error:   <AlertCircle size={18} className="text-red-500" />,
    info:    <Info size={18} className="text-blue-500" />,
  }
  const bg = {
    success: 'bg-green-50 border-green-200',
    error:   'bg-red-50 border-red-200',
    info:    'bg-white border-cream-200',
  }

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-md max-w-sm w-full pointer-events-auto ${bg[t.type]}`}
          >
            {icons[t.type]}
            <span className="flex-1 text-sm font-medium text-ink-700">{t.msg}</span>
            <button onClick={() => dismiss(t.id)} className="text-ink-400"><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
