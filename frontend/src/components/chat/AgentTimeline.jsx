import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  BarChart3, Brain, ChartColumn, Check, ChevronDown, CloudSun, Globe, History, IndianRupee, Layers, Lightbulb, PawPrint, PenLine, Save, Search,
  Sprout, Stethoscope, Timer, UserCog, Wheat, Wrench, X,
} from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { useVerboseSteps } from '../../lib/prefs'
import { parseOutput, Result } from '../Results'
import { UI_TYPES } from './UIBlocks'

const SIMPLE_STEP = {
  predict_pasture_biomass: 'checkingGrass',
  diagnose_plant_disease: 'checkingLeaf',
  recommend_crop: 'checkingCrop',
  predict_crop_yield: 'checkingYield',
  describe_soil_profile: 'checkingSoil',
  assess_livestock_health: 'checkingAnimal',
  estimate_grazing_days: 'checkingGrazing',
  get_mandi_prices: 'checkingPrices',
  get_weather: 'checkingWeather',
  web_search: 'lookingUp',
  remember_fact: 'remembering',
  recall_memories: 'checkingFarm',
  search_past_conversations: 'checkingChats',
  update_farm_profile: 'updatingFarm',
}

// `label` and `active` are translation keys. `args` builds the short glimpse.
export const TOOL_INFO = {
  predict_pasture_biomass: { icon: Sprout, label: 'toolPasture', active: 'toolPastureOn', args: (a, t) => [a.target, t('yourPhoto')].filter(Boolean).join(' · ') },
  diagnose_plant_disease: { icon: Stethoscope, label: 'toolLeaf', active: 'toolLeafOn', args: (a, t) => a.crop || t('yourPhoto') },
  recommend_crop: { icon: Wheat, label: 'toolCrop', active: 'toolCropOn', args: (a) => [`N${a.nitrogen}`, `P${a.phosphorus}`, `K${a.potassium}`, a.ph != null && `pH ${a.ph}`].filter(Boolean).join(' ') },
  predict_crop_yield: { icon: ChartColumn, label: 'toolYield', active: 'toolYieldOn', args: (a) => [a.crop, a.season, a.district, a.year].filter(Boolean).join(' · ') },
  describe_soil_profile: { icon: Layers, label: 'toolSoil', active: 'toolSoilOn', args: (a) => [`pH ${a.ph}`, a.n != null && `N ${a.n}`].filter(Boolean).join(' · ') },
  assess_livestock_health: { icon: PawPrint, label: 'toolAnimal', active: 'toolAnimalOn', args: (a) => [a.species, a.body_temperature != null && `${a.body_temperature}°C`].filter(Boolean).join(' · ') },
  estimate_grazing_days: { icon: Timer, label: 'toolGrazing', active: 'toolGrazingOn', args: (a) => [a.num_animals != null && `${a.num_animals}`, a.paddock_area_ha != null && `${a.paddock_area_ha} ha`].filter(Boolean).join(' · ') },
  get_mandi_prices: { icon: IndianRupee, label: 'toolMandi', active: 'toolMandiOn', args: (a) => [a.commodity, a.district, a.state].filter(Boolean).join(', ') },
  get_weather: { icon: CloudSun, label: 'toolWeather', active: 'toolWeatherOn', args: (a, t) => a.location || t('yourFarm') },
  web_search: { icon: Globe, label: 'toolSearch', active: 'toolSearchOn', args: (a) => a.query ? `“${a.query}”` : '' },
  remember_fact: { icon: Save, label: 'toolSave', active: 'toolSaveOn', args: (a) => a.fact || '' },
  recall_memories: { icon: Brain, label: 'toolRecall', active: 'toolRecallOn', args: (a) => a.query || '' },
  search_past_conversations: { icon: History, label: 'toolHistory', active: 'toolHistoryOn', args: (a) => a.query || '' },
  update_farm_profile: { icon: UserCog, label: 'toolProfile', active: 'toolProfileOn', args: (a) => [a.field, a.value].filter(Boolean).join(': ') },
}

function Elapsed({ from, to }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (to) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [to])
  if (!from) return null
  return <span className="tabular-nums text-[11px] text-muted">{(((to || now) - from) / 1000).toFixed(1)}s</span>
}

function StepIcon({ icon: Icon, state, kind = 'tool' }) {
  const tile = kind === 'thought'
    ? 'bg-sand text-sand-ink ring-1 ring-sand-ink/10'
    : state === 'error'
      ? 'bg-danger-soft text-danger ring-1 ring-danger/15'
      : state === 'active'
        ? 'bg-gold-soft text-gold ring-2 ring-gold/25'
        : 'bg-white text-brand ring-1 ring-brand/15 shadow-sm'
  const pip = state === 'done' ? 'bg-brand' : state === 'error' ? 'bg-danger' : null
  return (
    <span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-xl ${tile}`}>
      {state === 'active' && <span className="absolute inset-0 animate-ping rounded-xl bg-gold/20" />}
      <Icon size={15} />
      {pip && kind !== 'thought' && (
        <span className={`absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded-full text-white ring-2 ring-white ${pip}`}>
          {state === 'done' ? <Check size={8} strokeWidth={3.5} /> : <X size={8} strokeWidth={3} />}
        </span>
      )}
    </span>
  )
}

function countPhrase(t, n, one, many) {
  return `${n} ${t(n === 1 ? one : many)}`
}

function listOf(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data?.web_results)) return data.web_results
  if (Array.isArray(data?.prices)) return data.prices
  return null
}

// One short glimpse for the closed row. The full result stays inside the dropdown.
function glimpseOf(step, t) {
  const data = step.output == null ? null : parseOutput(step.output)
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) return { failed: true, text: t('couldNotFinish') }
  if (step.name === 'get_weather' && data?.current?.temperature_2m != null) return { text: `${Math.round(data.current.temperature_2m)}°C` }
  if (step.name === 'predict_pasture_biomass' && data?.prediction != null) return { text: `${data.label || data.target || 'Biomass'} ${Number(data.prediction).toFixed(1)} g` }
  if (step.name === 'diagnose_plant_disease' && data?.disease && !data.healthy) return { text: data.disease }
  if (step.name === 'get_mandi_prices' && data && !data.prices && data.web_results) return { text: t('fromWeb') }
  const counted = {
    web_search: ['oneSource', 'manySources'],
    recall_memories: ['oneMemory', 'manyMemories'],
    search_past_conversations: ['oneChat', 'manyChats'],
    get_mandi_prices: ['oneMarket', 'manyMarkets'],
  }[step.name]
  const list = listOf(data)
  if (counted && list) return { text: list.length ? countPhrase(t, list.length, counted[0], counted[1]) : t('nothingFound') }
  return { text: '' }
}

function Row({ icon, state, label, detail, right, children, onClick, focusId, kind = 'tool' }) {
  const wash = state === 'active' ? 'bg-gold-soft/80' : state === 'error' ? 'bg-danger-soft/60' : 'hover:bg-surface-2/70'
  const head = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold leading-tight ${state === 'active' ? 'text-shimmer' : state === 'error' ? 'text-danger' : 'text-ink'}`}>{label}</span>
        {detail && <span className="mt-0.5 block truncate text-xs leading-snug text-muted">{detail}</span>}
      </span>
      {right && <span className="flex shrink-0 items-center gap-1 pt-0.5">{right}</span>}
    </>
  )
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} data-focus-id={focusId || undefined}
      className={`relative flex items-start gap-3 rounded-2xl px-1.5 py-1.5 transition ${wash}`}>
      <StepIcon icon={icon} state={state} kind={kind} />
      <div className="min-w-0 flex-1 pt-0.5 text-sm">
        {onClick ? (
          <button type="button" onClick={onClick} className="flex w-full items-start gap-2 text-left">{head}</button>
        ) : (
          <div className="flex items-start gap-2">{head}</div>
        )}
        {children}
      </div>
    </motion.div>
  )
}

/** Closed row shows a short glimpse. The chevron opens the rest, uncut. */
function StepBlock({ icon, state, label, glimpse, extra, right, focusId, kind }) {
  const [open, setOpen] = useState(false)
  return (
    <Row icon={icon} state={state} label={label} detail={glimpse} focusId={focusId} kind={kind}
      onClick={extra ? () => setOpen((v) => !v) : undefined}
      right={(
        <span className="flex items-center gap-1">
          {right}
          {extra ? (
            <span className={`grid size-5 place-items-center rounded-full bg-surface-2 text-muted transition ${open ? 'rotate-180' : ''}`}>
              <ChevronDown size={12} />
            </span>
          ) : null}
        </span>
      )}>
      {open && extra}
    </Row>
  )
}

function FullText({ children }) {
  return <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{children}</p>
}

// What the agent is writing right now, if it is in the middle of a ```ui visual.
const VISUAL_LABEL = {
  chart: 'visualChart', calculator: 'visualCalc', schedule: 'visualSchedule', compare: 'visualCompare',
  checklist: 'visualChecklist', steps: 'visualSteps', gauge: 'visualGauge',
}

export function visualInProgress(content) {
  const chunks = content.split('```')
  if (chunks.length % 2 === 1) return null
  const inside = chunks.at(-1) || ''
  const lang = (inside.match(/^[a-zA-Z]*/)?.[0] || '').toLowerCase()
  if (lang && !['ui', 'json', 'jsonc', 'javascript', 'js'].includes(lang)) return null
  const type = inside.match(/"type"\s*:\s*"(\w+)"/)?.[1]
  if (lang === 'ui' || (type && UI_TYPES.has(type))) return VISUAL_LABEL[type] || 'visualGeneric'
  return null
}

function firstLine(text) {
  return (text || '').trim().split('\n').find(Boolean) || ''
}

/** Detailed steps: every row is a short glimpse. The dropdown holds the rest. */
function Steps({ message }) {
  const { t } = useI18n()
  const streaming = message.status === 'streaming'
  const lastIndex = message.steps.length - 1
  const visual = streaming && visualInProgress(message.content)
  return (
    <div className="rounded-[22px] border border-line/80 bg-gradient-to-b from-white to-surface-2/40 p-1.5 shadow-sm">
      <div className="relative space-y-0.5">
      <div className="pointer-events-none absolute bottom-4 left-[22px] top-4 w-px bg-gradient-to-b from-brand/35 via-line to-transparent" />
        {message.steps.map((step, i) => {
          if (step.type === 'context') {
            const n = step.count ?? step.memories?.length ?? 0
            const glimpse = [
              n > 0 && countPhrase(t, n, 'oneMemory', 'manyMemories'),
              step.recentThreads > 0 && countPhrase(t, step.recentThreads, 'oneChat', 'manyChats'),
            ].filter(Boolean).join(' · ')
            const memories = step.memories || []
            return (
              <StepBlock key={i} icon={Sprout} state={step.status} kind="tool"
                label={t(step.status === 'active' ? 'stepFarmActive' : 'stepFarm')} glimpse={glimpse}
                extra={memories.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {memories.map((m) => <span key={m.id} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-muted">{m.text}</span>)}
                  </div>
                ) : null} />
            )
          }
          if (step.type === 'thinking' || step.type === 'note') {
            const text = (step.content || '').trim()
            const active = step.type === 'thinking' && streaming && i === lastIndex
            return (
              <StepBlock key={i} icon={step.type === 'note' ? Lightbulb : Brain} kind="thought" state={active ? 'active' : 'done'}
                label={t(step.type === 'note' ? 'stepPlan' : active ? 'thinkingNow' : 'thoughtDone')}
                glimpse={firstLine(text)}
                extra={text ? <FullText>{text}</FullText> : null} />
            )
          }
          const info = TOOL_INFO[step.name] || { icon: Wrench, label: step.name, active: 'working', args: () => '' }
          const running = step.output == null
          const result = running ? null : glimpseOf(step, t)
          let argText = ''
          try { argText = info.args(step.args || {}, t) } catch { /* unexpected args */ }
          const data = running ? null : parseOutput(step.output)
          const extra = data != null ? (
            <div className="mb-1 mt-1 rounded-2xl border border-line bg-surface p-3">
              <Result kind={step.name} data={data} />
            </div>
          ) : (argText ? <FullText>{argText}</FullText> : null)
          return (
            <StepBlock key={step.id || i} focusId={step.id} icon={info.icon}
              state={running ? 'active' : result?.failed ? 'error' : 'done'}
              label={t(running ? info.active : info.label)}
              glimpse={[argText, result?.text].filter(Boolean).join(' · ')}
              extra={extra}
              right={<Elapsed from={step.startedAt} to={step.endedAt} />} />
          )
        })}
        {streaming && !message.content && message.steps.at(-1)?.type === 'tool' && message.steps.at(-1).output != null && (
          <Row icon={Search} state="active" label={t('stepTogether')} />
        )}
        {streaming && message.content && <Row icon={visual ? BarChart3 : PenLine} state="active" label={t(visual || 'stepWriting')} />}
      </div>
    </div>
  )
}

const SHOW_RESULT = new Set(['predict_pasture_biomass', 'diagnose_plant_disease', 'recommend_crop', 'predict_crop_yield', 'describe_soil_profile', 'assess_livestock_health', 'estimate_grazing_days', 'get_mandi_prices', 'get_weather'])

function ResultCards({ message }) {
  const tools = message.steps.filter((s) => s.type === 'tool' && s.output != null)
  return tools.map((s) => {
    const data = parseOutput(s.output)
    const shown = SHOW_RESULT.has(s.name) && s.name !== 'get_weather' && !(data && typeof data === 'object' && data.error)
    if (!shown) return <span key={s.id} data-focus-id={s.id} />
    return (
      <div key={s.id} data-focus-id={s.id} className="rounded-3xl bg-surface p-3.5 shadow-sm">
        <Result kind={s.name} data={data} />
      </div>
    )
  })
}

function simpleKey(message) {
  if (visualInProgress(message.content)) return 'makingVisual'
  if (message.content) return 'writingAnswer'
  const tool = [...message.steps].reverse().find((s) => s.type === 'tool')
  if (tool) return SIMPLE_STEP[tool.name] || 'working'
  if (message.steps.some((s) => s.type === 'context')) return 'checkingFarm'
  return 'working'
}

/** One plain line while the answer is being prepared. No memories, arguments or timers. */
function SimpleTimeline({ message }) {
  const { t } = useI18n()
  const streaming = message.status === 'streaming'
  const hasCards = message.steps.some((s) => s.type === 'tool' && SHOW_RESULT.has(s.name) && s.output != null && s.name !== 'get_weather')
  if (!streaming && !hasCards) return null
  if (streaming && !message.content && !message.steps.length) return null
  return (
    <div className="mb-3 space-y-2">
      {streaming && (
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-semibold">
          <Sprout size={15} className="text-brand" />
          <span className="text-shimmer">{t(simpleKey(message))}</span>
        </div>
      )}
      {hasCards && <ResultCards message={message} />}
    </div>
  )
}

/** Live view of what the agent is doing; collapses to a summary pill when the answer is done. */
export default function AgentTimeline({ message }) {
  const { t } = useI18n()
  const streaming = message.status === 'streaming'
  const [verbose] = useVerboseSteps()
  const [expanded, setExpanded] = useState(false)
  const tools = message.steps.filter((s) => s.type === 'tool')
  const seconds = message.timing?.total_ms ? message.timing.total_ms / 1000 : null

  if (!verbose) return <SimpleTimeline message={message} />
  if (!message.steps.length) return null
  const open = streaming || expanded
  return (
    <div className="mb-3 space-y-2">
      {open ? (
        <div>
          {!streaming && (
            <button onClick={() => setExpanded(false)} className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
              <ChevronDown size={13} className="rotate-180" /> {t('stepHide')}
            </button>
          )}
          <Steps message={message} />
        </div>
      ) : (
        <button onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted shadow-sm transition hover:border-brand hover:text-ink">
          <Sprout size={13} className="text-brand" />
          {seconds != null && <span>{t('worked')} {seconds.toFixed(1)}s</span>}
          {tools.length > 0 && <span>· {countPhrase(t, tools.length, 'oneStep', 'manySteps')}</span>}
          <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}
