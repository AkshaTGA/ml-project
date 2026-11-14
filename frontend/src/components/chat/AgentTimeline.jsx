import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  BarChart3, Brain, Check, ChevronDown, CloudSun, Globe, History, IndianRupee, Lightbulb, PawPrint, PenLine, Save, Search,
  Sprout, Stethoscope, Timer, UserCog, Wheat, Wrench, X,
} from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { useVerboseSteps } from '../../lib/prefs'
import { parseOutput, Result } from '../Results'

const SIMPLE_STEP = {
  predict_pasture_biomass: 'checkingGrass',
  diagnose_plant_disease: 'checkingLeaf',
  recommend_crop: 'checkingCrop',
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
  predict_pasture_biomass: { icon: Sprout, label: 'toolPasture', active: 'toolPastureOn', args: (_a, t) => t('yourPhoto') },
  diagnose_plant_disease: { icon: Stethoscope, label: 'toolLeaf', active: 'toolLeafOn', args: (a, t) => a.crop || t('yourPhoto') },
  recommend_crop: { icon: Wheat, label: 'toolCrop', active: 'toolCropOn', args: (a) => [`N${a.nitrogen}`, `P${a.phosphorus}`, `K${a.potassium}`, a.ph != null && `pH ${a.ph}`].filter(Boolean).join(' ') },
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

function StepIcon({ icon: Icon, state }) {
  const tone = state === 'error' ? 'bg-danger-soft text-danger' : state === 'done' ? 'bg-brand-soft text-brand' : 'bg-gold-soft text-gold'
  return (
    <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full ${tone}`}>
      {state === 'active' && <span className="absolute inset-0 animate-ping rounded-full bg-gold/30" />}
      {state === 'done' ? <Check size={14} strokeWidth={3} /> : state === 'error' ? <X size={14} /> : <Icon size={14} />}
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

function Row({ icon, state, label, detail, right, children, onClick }) {
  const head = (
    <>
      <span className={`shrink-0 font-semibold ${state === 'active' ? 'text-shimmer' : ''}`}>{label}</span>
      {detail && <span className="min-w-0 flex-1 truncate text-xs text-muted">{detail}</span>}
      {right && <span className="ml-auto shrink-0">{right}</span>}
    </>
  )
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <StepIcon icon={icon} state={state} />
      <div className="min-w-0 flex-1 py-1 text-sm">
        {onClick ? (
          <button type="button" onClick={onClick} className="flex w-full items-center gap-2 text-left">{head}</button>
        ) : (
          <div className="flex items-center gap-2">{head}</div>
        )}
        {children}
      </div>
    </motion.div>
  )
}

/** Closed row shows a short glimpse. The chevron opens the rest, uncut. */
function StepBlock({ icon, state, label, glimpse, extra, right }) {
  const [open, setOpen] = useState(false)
  return (
    <Row icon={icon} state={state} label={label} detail={glimpse}
      onClick={extra ? () => setOpen((v) => !v) : undefined}
      right={(
        <span className="flex items-center gap-1.5">
          {right}
          {extra ? <ChevronDown size={14} className={`text-muted transition ${open ? 'rotate-180' : ''}`} /> : null}
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
  const open = (content.match(/```ui/g) || []).length
  const fences = (content.match(/```/g) || []).length
  if (!open || fences % 2 === 0) return null
  const type = content.slice(content.lastIndexOf('```ui')).match(/"type"\s*:\s*"(\w+)"/)?.[1]
  return VISUAL_LABEL[type] || 'visualGeneric'
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
    <div className="relative">
      <div className="absolute bottom-3 left-[13px] top-3 w-px bg-line" />
      <div className="space-y-0.5">
        {message.steps.map((step, i) => {
          if (step.type === 'context') {
            const n = step.count ?? step.memories?.length ?? 0
            const glimpse = [
              n > 0 && countPhrase(t, n, 'oneMemory', 'manyMemories'),
              step.recentThreads > 0 && countPhrase(t, step.recentThreads, 'oneChat', 'manyChats'),
            ].filter(Boolean).join(' · ')
            const memories = step.memories || []
            return (
              <StepBlock key={i} icon={Brain} state={step.status}
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
              <StepBlock key={i} icon={step.type === 'note' ? Lightbulb : Brain} state={active ? 'active' : 'done'}
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
            <StepBlock key={step.id || i} icon={info.icon}
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

const SHOW_RESULT = new Set(['predict_pasture_biomass', 'diagnose_plant_disease', 'recommend_crop', 'assess_livestock_health', 'estimate_grazing_days', 'get_mandi_prices', 'get_weather'])

function ResultCards({ message }) {
  const tools = message.steps.filter((s) => s.type === 'tool')
  return tools.filter((s) => SHOW_RESULT.has(s.name) && s.output != null && s.name !== 'get_weather').map((s) => {
    const data = parseOutput(s.output)
    if (data && typeof data === 'object' && data.error) return null
    return (
      <div key={s.id} className="rounded-3xl bg-surface p-3.5 shadow-sm">
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
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-sm transition hover:border-brand hover:text-ink">
          <Sprout size={13} className="text-brand" />
          {seconds != null && <span>{t('worked')} {seconds.toFixed(1)}s</span>}
          {tools.length > 0 && <span>· {countPhrase(t, tools.length, 'oneStep', 'manySteps')}</span>}
          <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}
