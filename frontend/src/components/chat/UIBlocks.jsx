// Generative UI: the agent writes ```ui fenced JSON blocks in its answer and they render here
// as interactive components. The block catalogue (and its JSON shapes) is described to the
// model in backend/app/agent.py (UI_PROMPT); keep the two in sync.
import { Component, createContext, lazy, memo, Suspense, useContext, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  AlertTriangle, BarChart3, Calculator, Check, CheckCircle2, CircleHelp, ExternalLink, Info, Lightbulb, ListChecks, Star,
  TrendingDown, TrendingUp, XCircle,
} from 'lucide-react'
import { evaluate } from './formula'
import { useI18n } from '../../lib/i18n'

const ChartBlock = lazy(() => import('./ChartBlock'))

const card = 'my-3 rounded-3xl border border-line bg-surface p-4 shadow-sm'

function Title({ icon: Icon, children }) {
  if (!children) return null
  return <div className="mb-3 flex items-center gap-2 text-sm font-bold">{Icon && <Icon size={16} className="text-brand" />}{children}</div>
}

const TONES = {
  success: { box: 'border-brand/30 bg-brand-soft/60', icon: CheckCircle2, ink: 'text-brand-strong' },
  info: { box: 'border-sky/30 bg-sky-soft', icon: Info, ink: 'text-sky' },
  warning: { box: 'border-gold/40 bg-gold-soft', icon: AlertTriangle, ink: 'text-gold' },
  danger: { box: 'border-danger/30 bg-danger-soft', icon: XCircle, ink: 'text-danger' },
  tip: { box: 'border-line bg-surface-2', icon: Lightbulb, ink: 'text-gold' },
}

// ---------- Blocks ----------

function Chart({ spec }) {
  return (
    <div className={card}>
      <Title icon={BarChart3}>{spec.title}</Title>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <ChartBlock spec={spec} />
      </Suspense>
      {spec.note && <p className="mt-2 text-xs text-muted">{spec.note}</p>}
    </div>
  )
}

function Stats({ spec }) {
  return (
    <div className="my-3">
      <Title>{spec.title}</Title>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        {(spec.items || []).map((s, i) => {
          const tone = TONES[s.tone] || null
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`rounded-2xl border p-3 ${tone ? tone.box : 'border-line bg-surface'}`}>
              <div className="text-xs text-muted">{s.label}</div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums">{s.value}</span>
                {s.unit && <span className="text-sm text-muted">{s.unit}</span>}
                {s.trend === 'up' && <TrendingUp size={15} className="ml-auto text-brand" />}
                {s.trend === 'down' && <TrendingDown size={15} className="ml-auto text-danger" />}
              </div>
              {s.hint && <div className="mt-0.5 text-xs text-muted">{s.hint}</div>}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function Steps({ spec }) {
  return (
    <div className={card}>
      <Title icon={ListChecks}>{spec.title}</Title>
      <ol className="relative space-y-4">
        <div className="absolute bottom-2 left-[15px] top-2 w-px bg-line" />
        {(spec.items || []).map((step, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="relative flex gap-3">
            <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{step.title}</span>
                {step.when && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold">{step.when}</span>}
              </div>
              {step.detail && <p className="mt-0.5 text-sm text-muted">{step.detail}</p>}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}

function Schedule({ spec }) {
  return (
    <div className={card}>
      <Title icon={ListChecks}>{spec.title}</Title>
      <div className="space-y-2">
        {(spec.items || []).map((item, i) => {
          const date = item.date ? new Date(item.date) : null
          const valid = date && !isNaN(date)
          return (
            <div key={i} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5">
              <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-surface py-1.5 text-center shadow-sm">
                {valid ? (
                  <>
                    <span className="text-[10px] font-bold uppercase text-danger">{date.toLocaleDateString(undefined, { month: 'short' })}</span>
                    <span className="text-lg font-bold leading-none">{date.getDate()}</span>
                  </>
                ) : <span className="px-1 text-xs font-bold leading-tight">{item.day || item.date || `#${i + 1}`}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{item.task}</div>
                {item.detail && <div className="text-xs text-muted">{item.detail}</div>}
              </div>
              {item.tag && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-strong">{item.tag}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function storageKey(spec) {
  return 'agriassist.check.' + [spec.title, ...(spec.items || [])].join('|').slice(0, 200)
}

function Checklist({ spec }) {
  const key = storageKey(spec)
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
  })
  const items = spec.items || []
  function toggle(i) {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i]
    setDone(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }
  const pct = items.length ? Math.round((done.length / items.length) * 100) : 0
  return (
    <div className={card}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Title icon={ListChecks}>{spec.title || 'Checklist'}</Title>
        <span className="mb-3 text-xs font-semibold text-muted">{done.length}/{items.length}</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => {
          const on = done.includes(i)
          return (
            <li key={i}>
              <button onClick={() => toggle(i)} className="flex w-full items-start gap-3 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition ${on ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
                <span className={on ? 'text-muted line-through' : ''}>{item}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Compare({ spec }) {
  const options = spec.options || []
  return (
    <div className="my-3">
      <Title>{spec.title}</Title>
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        {options.map((o, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className={`relative rounded-3xl border-2 p-4 ${o.best ? 'border-brand bg-brand-soft/40' : 'border-line bg-surface'}`}>
            {o.best && (
              <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                <Star size={11} fill="currentColor" /> {o.badge || 'Best choice'}
              </span>
            )}
            <div className="font-bold">{o.name}</div>
            {o.cost && <div className="mt-0.5 text-sm font-semibold text-gold">{o.cost}</div>}
            {o.metrics && (
              <dl className="mt-2 space-y-0.5 text-xs">
                {Object.entries(o.metrics).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
                ))}
              </dl>
            )}
            {o.pros?.length > 0 && <ul className="mt-2 space-y-0.5 text-[13px]">{o.pros.map((p) => <li key={p} className="flex items-start gap-1.5"><Check size={14} className="mt-0.5 shrink-0 text-brand" />{p}</li>)}</ul>}
            {o.cons?.length > 0 && <ul className="mt-1 space-y-0.5 text-[13px]">{o.cons.map((c) => <li key={c} className="flex items-start gap-1.5"><XCircle size={14} className="mt-0.5 shrink-0 text-danger" />{c}</li>)}</ul>}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function Callout({ spec }) {
  const tone = TONES[spec.tone] || TONES.info
  const Icon = tone.icon
  return (
    <div className={`my-3 flex gap-3 rounded-2xl border p-3.5 ${tone.box}`}>
      <Icon size={20} className={`mt-0.5 shrink-0 ${tone.ink}`} />
      <div className="min-w-0 text-sm">
        {spec.title && <div className={`font-bold ${tone.ink}`}>{spec.title}</div>}
        {spec.text && <div className="mt-0.5 text-ink/85">{spec.text}</div>}
      </div>
    </div>
  )
}

function Tips({ spec }) {
  return (
    <div className="my-3">
      <Title icon={Lightbulb}>{spec.title}</Title>
      <div className="grid gap-2 sm:grid-cols-2">
        {(spec.items || []).map((tip, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
            <Lightbulb size={18} className="mt-0.5 shrink-0 text-gold" />
            <div className="min-w-0 text-sm"><div className="font-semibold">{tip.title}</div>{tip.text && <div className="text-muted">{tip.text}</div>}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalculatorBlock({ spec }) {
  const inputs = spec.inputs || []
  const [values, setValues] = useState(() => Object.fromEntries(inputs.map((f) => [f.key, f.default ?? f.min ?? 0])))
  const results = useMemo(() => (spec.outputs || []).map((o) => {
    try {
      const v = evaluate(o.formula, values)
      if (!Number.isFinite(v)) return { ...o, text: '—' }
      return { ...o, text: v.toLocaleString('en-IN', { maximumFractionDigits: o.decimals ?? 1 }) }
    } catch {
      return { ...o, text: '—' }
    }
  }), [spec.outputs, values])

  return (
    <div className={card}>
      <Title icon={Calculator}>{spec.title || 'Calculator'}</Title>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          {inputs.map((f) => (
            <label key={f.key} className="block">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">{f.label}</span>
                <span className="text-muted"><input type="number" value={values[f.key]} step={f.step ?? 1}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-20 rounded-lg border border-line bg-bg px-2 py-0.5 text-right text-ink outline-none focus:border-brand" /> {f.unit}</span>
              </div>
              {f.max != null && (
                <input type="range" min={f.min ?? 0} max={f.max} step={f.step ?? 1} value={Number(values[f.key]) || 0}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))}
                  className="mt-1.5 w-full accent-[var(--c-brand)]" />
              )}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`rounded-2xl p-3 ${i === 0 ? 'bg-brand text-white' : 'bg-surface-2'}`}>
              <div className={`text-xs ${i === 0 ? 'text-white/80' : 'text-muted'}`}>{r.label}</div>
              <div className="text-2xl font-bold tabular-nums">{r.text} <span className="text-sm font-medium">{r.unit}</span></div>
            </div>
          ))}
        </div>
      </div>
      {spec.note && <p className="mt-3 text-xs text-muted">{spec.note}</p>}
    </div>
  )
}

const GAUGE_TONE = { good: 'var(--c-brand)', ok: 'var(--c-gold)', bad: 'var(--c-danger)', info: 'var(--c-sky)' }

function Gauge({ spec }) {
  const min = spec.min ?? 0
  const max = spec.max ?? 100
  const value = Math.min(max, Math.max(min, Number(spec.value) || 0))
  const frac = (value - min) / (max - min || 1)
  const zones = spec.zones?.length ? spec.zones : [{ to: max, tone: 'good' }]
  const zone = zones.find((z) => value <= z.to) || zones.at(-1)
  const arc = (from, to) => {
    const a0 = Math.PI * (1 - from)
    const a1 = Math.PI * (1 - to)
    const p = (a) => [60 + 48 * Math.cos(a), 60 - 48 * Math.sin(a)]
    const [x0, y0] = p(a0)
    const [x1, y1] = p(a1)
    return `M ${x0} ${y0} A 48 48 0 0 1 ${x1} ${y1}`
  }
  let start = 0
  return (
    <div className={`${card} flex items-center gap-4`}>
      <svg viewBox="0 0 120 70" className="w-40 shrink-0">
        {zones.map((z, i) => {
          const end = (Math.min(z.to, max) - min) / (max - min || 1)
          const d = arc(start, end)
          start = end
          return <path key={i} d={d} stroke={GAUGE_TONE[z.tone] || GAUGE_TONE.info} strokeWidth="10" fill="none" opacity="0.25" />
        })}
        <motion.path d={arc(0, Math.max(frac, 0.001))} stroke={GAUGE_TONE[zone?.tone] || GAUGE_TONE.good} strokeWidth="10"
          fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
        <text x="60" y="58" textAnchor="middle" className="fill-[var(--c-ink)] text-[16px] font-bold">{spec.value}</text>
      </svg>
      <div className="min-w-0">
        <div className="text-sm font-bold">{spec.label || spec.title}</div>
        {spec.unit && <div className="text-xs text-muted">{spec.unit} · range {min}–{max}</div>}
        {zone?.label && <div className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: GAUGE_TONE[zone.tone] || GAUGE_TONE.good }}>{zone.label}</div>}
        {spec.note && <p className="mt-1 text-xs text-muted">{spec.note}</p>}
      </div>
    </div>
  )
}

function linkText(children) {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(linkText).join('')
  return linkText(children.props?.children)
}

function linkParts(href, children) {
  const text = linkText(children).trim()
  let host = ''
  let pathName = ''
  try {
    const url = new URL(href)
    host = url.hostname.replace(/^www\./, '')
    pathName = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
  } catch { /* keep the raw address */ }
  const bare = !text || text === href || /^https?:\/\//i.test(text)
  const fromFile = pathName
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_.+%]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  return { title: bare ? (fromFile || host || text || href) : text, host }
}

/** A short titled link. Used for bare URLs in answers and for the links block. */
export function SourceLink({ href, children }) {
  const { title, host } = linkParts(href, children)
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="source-card my-1.5 flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 no-underline shadow-sm transition hover:border-brand">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><ExternalLink size={15} /></span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        {host && <span className="block truncate text-xs text-muted">{host}</span>}
      </span>
    </a>
  )
}

function Links({ spec }) {
  const items = (spec.items || []).filter((item) => item?.url)
  return (
    <div className="my-3">
      <Title icon={ExternalLink}>{spec.title || 'Sources'}</Title>
      <div className="space-y-2">
        {items.map((item) => <SourceLink key={item.url} href={item.url}>{item.title || item.url}</SourceLink>)}
      </div>
    </div>
  )
}

function Choices({ spec, onAsk, interactive }) {
  const [picked, setPicked] = useState(null)
  return (
    <div className="my-3 rounded-3xl border border-brand/30 bg-brand-soft/30 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold"><CircleHelp size={16} className="text-brand" />{spec.question}</div>
      <div className="flex flex-wrap gap-2">
        {(spec.options || []).map((o) => (
          <button key={o} disabled={!interactive || picked != null} onClick={() => { setPicked(o); onAsk?.(o) }}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${picked === o ? 'border-brand bg-brand text-white' : 'border-line bg-surface hover:border-brand disabled:opacity-60'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

const BLOCKS = {
  chart: Chart, stats: Stats, steps: Steps, schedule: Schedule, checklist: Checklist, compare: Compare,
  callout: Callout, tips: Tips, calculator: CalculatorBlock, gauge: Gauge, choices: Choices, links: Links,
}

export const UI_TYPES = new Set(Object.keys(BLOCKS))

/** A finished UI spec, or null when the text is not one of the known blocks. */
export function parseUISpec(source) {
  try {
    const data = JSON.parse(String(source || '').trim())
    const items = Array.isArray(data) ? data : [data]
    if (items.length && items.every((item) => item && typeof item.type === 'string' && UI_TYPES.has(item.type))) return data
  } catch { /* half-written or ordinary JSON */ }
  return null
}

/** Models sometimes open the fence with ```json. Those blocks are the same visuals. */
export function promoteUIFences(text) {
  if (!text || !text.includes('```')) return text || ''
  return text.replace(/```[ \t]*([a-zA-Z]*)[ \t]*\n?([\s\S]*?)```/g, (match, lang, body) => {
    const name = String(lang || '').toLowerCase()
    if (name === 'ui') return match
    if (name && !['json', 'jsonc', 'javascript', 'js'].includes(name)) return match
    return parseUISpec(body) ? `\`\`\`ui\n${body.trim()}\n\`\`\`` : match
  })
}

function VisualFallback() {
  const { t } = useI18n()
  return <p className="my-2 text-xs text-muted">({t('visualFailed')})</p>
}

class BlockBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <VisualFallback /> : this.props.children
  }
}

/** What the blocks of one message need from it: { streaming, onAsk, interactive }. */
export const UIContext = createContext({ streaming: false, onAsk: null, interactive: false })

function parse(source) {
  return parseUISpec(source)
}

/**
 * Renders one ```ui block. While the answer is still streaming, half-written JSON shows a placeholder.
 * Memoised on the source text, so new words elsewhere in the chat never re-render (or re-animate) a finished visual.
 */
export const UIBlock = memo(function UIBlock({ source }) {
  const { t } = useI18n()
  const { streaming, onAsk, interactive } = useContext(UIContext)
  const spec = useMemo(() => parse(source), [source])
  if (!spec) {
    return streaming
      ? <div className="my-3 flex h-24 items-center justify-center rounded-3xl border border-dashed border-line text-sm text-muted"><span className="text-shimmer font-semibold">{t('preparingVisual')}</span></div>
      : null
  }
  const specs = Array.isArray(spec) ? spec : [spec]
  return specs.map((s, i) => {
    const Block = BLOCKS[s?.type]
    if (!Block) return null
    return <BlockBoundary key={i}><Block spec={s} onAsk={onAsk} interactive={interactive} /></BlockBoundary>
  })
})

/** Answer text without visual blocks, including ones the model fenced as json. */
export const stripUIBlocks = (text) => promoteUIFences(text).replace(/```ui[\s\S]*?(```|$)/g, '').replace(/\n{3,}/g, '\n\n').trim()
