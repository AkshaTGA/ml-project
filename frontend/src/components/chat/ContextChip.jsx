import { CornerUpLeft, FlaskConical, X } from 'lucide-react'
import { AuthImage } from '../common'
import { useI18n } from '../../lib/i18n'

// A saved check or an earlier message, shown as a small card instead of pasted text.
export default function ContextChip({ item, onOpen, onRemove }) {
  const { t } = useI18n()
  return (
    <div className="flex max-w-md overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-sm">
      <button type="button" onClick={() => onOpen?.(item)}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left transition hover:bg-brand-soft/70">
        {item.image_id ? (
          <AuthImage fileId={item.image_id} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            {item.type === 'message' ? <CornerUpLeft size={16} /> : <FlaskConical size={16} />}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold">{item.title}</span>
          <span className="block truncate text-xs text-muted">{item.preview}</span>
        </span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t('removeItem')}
          className="grid w-8 shrink-0 place-items-center text-muted hover:text-ink">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
