import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion } from 'motion/react'
import { Check, Copy, FileText, GitBranch, Pause, Pencil, RefreshCw, RotateCcw, Sparkles, Sprout, Volume2 } from 'lucide-react'
import { AuthImage, Spinner } from '../common'
import { useI18n } from '../../lib/i18n'
import { useVerboseSteps } from '../../lib/prefs'
import AgentTimeline from './AgentTimeline'
import { stripUIBlocks, UIBlock, UIContext } from './UIBlocks'

export function Attachment({ file, onRemove, pending, large }) {
  if (file.kind === 'image') {
    return (
      <div className={`relative overflow-hidden rounded-2xl border border-line bg-surface ${large ? 'h-36 w-48' : 'size-16'}`}>
        <AuthImage fileId={file.id} src={file.preview} className="size-full object-cover" />
        {pending && <div className="absolute inset-0 grid place-items-center bg-white/60"><Spinner /></div>}
        {onRemove && <button onClick={onRemove} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-xs text-white" aria-label="Remove">×</button>}
      </div>
    )
  }
  return (
    <div className="relative flex max-w-56 items-center gap-2 rounded-2xl border border-line bg-surface py-2 pl-3 pr-7 text-sm">
      <FileText size={16} className="shrink-0 text-brand" /><span className="truncate">{file.name}</span>
      {pending && <Spinner size={14} />}
      {onRemove && <button onClick={onRemove} className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-xs text-white" aria-label="Remove">×</button>}
    </div>
  )
}

function ActionButton({ title, onClick, disabled, children }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className="rounded-lg p-1.5 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40">
      {children}
    </button>
  )
}

function Actions({ message, onSpeak, speaking, isLast, busy, onRegenerate, onRewind, onBranch }) {
  const [copied, setCopied] = useState(false)
  const [verbose] = useVerboseSteps()
  const { t } = useI18n()
  return (
    <div className="mt-2 flex items-center gap-1 text-muted opacity-70 transition group-hover:opacity-100">
      <button title="Copy" className="rounded-lg p-1.5 hover:bg-surface-2 hover:text-ink" onClick={() => {
        navigator.clipboard.writeText(stripUIBlocks(message.content))
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
      <button title="Read aloud" className={`rounded-lg p-1.5 hover:bg-surface-2 hover:text-ink ${speaking ? 'text-brand' : ''}`} onClick={onSpeak}>
        {speaking === 'loading' ? <Spinner size={15} /> : speaking ? <Pause size={15} /> : <Volume2 size={15} />}
      </button>
      {onRegenerate && isLast && <ActionButton title={t('regenerate')} onClick={onRegenerate} disabled={busy}><RefreshCw size={15} /></ActionButton>}
      {onRewind && !isLast && <ActionButton title={t('rewindHere')} onClick={onRewind} disabled={busy}><RotateCcw size={15} /></ActionButton>}
      {onBranch && <ActionButton title={t('branchHere')} onClick={onBranch} disabled={busy}><GitBranch size={15} /></ActionButton>}
      {verbose && message.timing?.first_token_ms != null && (
        <span className="ml-1 text-[11px]">first word in {(message.timing.first_token_ms / 1000).toFixed(1)}s</span>
      )}
    </div>
  )
}

function UserMessage({ message, busy, onEditResend, onRewind }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)

  function submit() {
    if (!draft.trim() && !message.attachments?.length) return
    setEditing(false)
    onEditResend(draft)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group ml-auto flex max-w-[85%] flex-col items-end gap-2">
      {message.attachments?.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">{message.attachments.map((f) => <Attachment key={f.id || f.name} file={f} large />)}</div>
      )}
      {editing ? (
        <div className="w-[min(36rem,80vw)] rounded-3xl border border-brand bg-surface p-3 shadow-lg">
          <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
              if (e.key === 'Escape') { setEditing(false); setDraft(message.content) }
            }}
            className="block w-full resize-none bg-transparent px-1 text-base outline-none [field-sizing:content]" />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setDraft(message.content) }} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-surface-2">{t('cancel')}</button>
            <button onClick={submit} disabled={busy} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{t('saveSend')}</button>
          </div>
        </div>
      ) : message.content && (
        <div className="whitespace-pre-wrap rounded-3xl rounded-br-md bg-brand px-4 py-3 text-base text-white shadow-sm [overflow-wrap:anywhere]">
          {message.voice && <span className="mr-1.5 opacity-75">🎙️</span>}{message.content}
        </div>
      )}
      {!editing && (onEditResend || onRewind) && (
        <div className="flex gap-0.5 text-muted opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-70">
          {onEditResend && <ActionButton title={t('editResend')} onClick={() => setEditing(true)} disabled={busy}><Pencil size={14} /></ActionButton>}
          {onRewind && <ActionButton title={t('rewindBefore')} onClick={onRewind} disabled={busy}><RotateCcw size={14} /></ActionButton>}
        </div>
      )}
    </motion.div>
  )
}

export default function Message({ message, isLast, onSuggestion, onSpeak, speaking, busy, onEditResend, onRewind, onRegenerate, onBranch }) {
  if (message.role === 'user') {
    return <UserMessage message={message} busy={busy} onEditResend={onEditResend} onRewind={onRewind} />
  }

  const streaming = message.status === 'streaming'
  const waiting = streaming && !message.content && !message.steps.length
  return <AssistantMessage {...{ message, isLast, onSuggestion, onSpeak, speaking, busy, onRewind, onRegenerate, onBranch, streaming, waiting }} />
}

// ```ui blocks in the answer become interactive components (charts, plans, calculators, ...).
// Defined once: if these functions changed between renders, React would remount every visual on each streamed word.
const MARKDOWN = {
  a: (p) => <a {...p} target="_blank" rel="noreferrer" />,
  pre({ node, children, ...props }) {
    const code = node?.children?.[0]
    if (code?.tagName === 'code' && (code.properties?.className || []).includes('language-ui')) {
      return <UIBlock source={(code.children || []).map((c) => c.value || '').join('')} />
    }
    return <pre {...props}>{children}</pre>
  },
}

function AssistantMessage({ message, isLast, onSuggestion, onSpeak, speaking, busy, onRewind, onRegenerate, onBranch, streaming, waiting }) {
  const interactive = isLast && !busy
  const blocks = useMemo(() => ({ streaming, onAsk: onSuggestion, interactive }), [streaming, onSuggestion, interactive])
  // Only re-parse the markdown when this message's text changes, not when another message streams.
  const body = useMemo(() => <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>{message.content}</ReactMarkdown>,
    [message.content])

  return (
    <div className="group flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-strong text-white shadow-md shadow-brand/30">
        <Sprout size={16} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <AgentTimeline message={message} />
        {waiting && <div className="flex gap-1 py-2">{[0, 1, 2].map((i) => <span key={i} className="typing-dot size-2 rounded-full bg-muted" />)}</div>}
        {message.content && (
          <div className="prose-agri text-base">
            <UIContext.Provider value={blocks}>{body}</UIContext.Provider>
            {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand align-middle" />}
          </div>
        )}
        {message.error && <div className="mt-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{message.error}</div>}
        {!streaming && (message.content || message.error) && (
          <Actions message={message} onSpeak={onSpeak} speaking={speaking} isLast={isLast} busy={busy}
            onRegenerate={onRegenerate} onRewind={onRewind} onBranch={onBranch} />
        )}
        {isLast && message.suggestions?.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 flex flex-wrap gap-2">
            {message.suggestions.map((s) => (
              <button key={s} onClick={() => onSuggestion(s)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm transition hover:border-brand hover:bg-brand-soft">
                <Sparkles size={13} className="text-gold" /> {s}
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
