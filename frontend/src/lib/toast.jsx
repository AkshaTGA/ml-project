import { createContext, useCallback, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useI18n } from './i18n'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const { t: tr } = useI18n()
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])

  const toast = useCallback((t) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev.slice(-3), { id, ...t }])
    setTimeout(() => dismiss(id), t.duration || 6000)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-xl shadow-black/10">
              {t.icon && <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{t.icon}</div>}
              <div className="min-w-0 flex-1 text-sm">
                {t.title && <div className="font-semibold">{t.title}</div>}
                {t.message && <div className="mt-0.5 text-muted">{t.message}</div>}
              </div>
              {t.action && (
                <button className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-brand hover:bg-brand-soft"
                  onClick={() => { t.action.onClick(); dismiss(t.id) }}>{t.action.label}</button>
              )}
              <button className="shrink-0 text-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label={tr('dismiss')}><X size={16} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
