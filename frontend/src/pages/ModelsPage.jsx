import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { ChartColumn, FlaskConical, ImagePlus, Layers, MessageSquareText, Play, Sprout, Trash2 } from 'lucide-react'
import { AuthImage, Spinner } from '../components/common'
import { flashFocus } from '../lib/focus'
import { ModeBadge, Result } from '../components/Results'
import { downscaleImage, useApi } from '../lib/api'
import { useI18n } from '../lib/i18n'

const ICONS = { biomass: Sprout, yield: ChartColumn, soil: Layers }

function defaults(model) {
  return Object.fromEntries(model.fields.filter((f) => f.type !== 'image').map((f) => [f.name, f.default ?? '']))
}

function optionValue(option) {
  return typeof option === 'string' ? option : option.value
}

function optionLabel(option, t) {
  const id = optionValue(option)
  const key = `opt_${String(id).replaceAll(' ', '_')}`
  if (t(key) !== key) return t(key)
  return typeof option === 'string' ? option.replaceAll('_', ' ') : option.label
}

function helpText(field, t) {
  const key = `help_${field.name}`
  const translated = t(key)
  return translated === key ? (field.help || '') : translated
}

function dependencies(field) {
  if (!field.depends_on) return []
  return Array.isArray(field.depends_on) ? field.depends_on : [field.depends_on]
}

function visibleOptions(field, values) {
  const options = field.options || []
  const deps = dependencies(field)
  if (!deps.length) return options
  if (deps.some((name) => !values?.[name])) return []
  const key = deps.map((name) => values[name]).join('|')
  return options.filter((option) => typeof option !== 'object' || !option.when || option.when === key)
}

function chooseLabel(field, values, t) {
  const missing = dependencies(field).find((name) => !values?.[name])
  if (missing === 'state') return t('chooseStateFirst')
  if (missing === 'district') return t('chooseDistrictFirst')
  if (missing === 'crop') return t('chooseCropFirst')
  return t('choose')
}

function Field({ field, value, onChange, image, onImage, values }) {
  const { t } = useI18n()
  const fileRef = useRef(null)
  const label = t(`field_${field.name}`) === `field_${field.name}` ? field.label : t(`field_${field.name}`)
  if (field.type === 'image') {
    return (
      <div className="sm:col-span-2">
        <label className="text-sm font-semibold">{label}</label>
        <button type="button" onClick={() => fileRef.current.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onImage(e.dataTransfer.files[0]) }}
          className={`relative mt-1.5 flex h-60 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-muted transition hover:border-brand ${image ? 'border-transparent' : 'border-line bg-surface-2/50'}`}>
          {image ? <img src={image.preview} alt="" className="absolute inset-0 size-full object-cover" /> : <><ImagePlus size={30} /><span className="text-sm">{t('dropPhoto')}</span></>}
          {image?.uploading && <div className="absolute inset-0 grid place-items-center bg-white/60"><Spinner /></div>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onImage(e.target.files[0])} />
        {helpText(field, t) && <p className="mt-1 text-xs text-muted">{helpText(field, t)}</p>}
      </div>
    )
  }
  if (field.type === 'select') {
    const options = visibleOptions(field, values)
    const blocked = dependencies(field).some((name) => !values?.[name])
    const useMenu = field.widget === 'menu' || options.length > 12
    return (
      <div className={field.wide ? 'sm:col-span-2' : undefined}>
        <label className="text-sm font-semibold">{label}</label>
        {blocked ? (
          <p className="mt-1.5 text-sm text-muted">{chooseLabel(field, values, t)}</p>
        ) : useMenu ? (
          <select value={value || ''} onChange={(e) => onChange(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-brand">
            <option value="">{chooseLabel(field, values, t)}</option>
            {options.map((option) => {
              const optionId = optionValue(option)
              return <option key={optionId} value={optionId}>{optionLabel(option, t)}</option>
            })}
          </select>
        ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {options.map((option) => {
            const optionId = optionValue(option)
            return (
              <button key={optionId} type="button" onClick={() => onChange(optionId)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${value === optionId ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand'} ${typeof option === 'string' ? 'capitalize' : ''}`}>
                {optionLabel(option, t)}
              </button>
            )
          })}
        </div>
        )}
        {helpText(field, t) && <p className="mt-1 text-xs text-muted">{helpText(field, t)}</p>}
      </div>
    )
  }
  if (field.type === 'multiselect') {
    return (
      <div className="sm:col-span-2">
        <label className="text-sm font-semibold">{label}</label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {field.options.map((o) => {
            const on = value.includes(o)
            return (
              <button key={o} type="button" onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
                className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${on ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand'}`}>
                {o.replaceAll('_', ' ')}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  const pct = field.max != null && value !== '' ? ((value - (field.min ?? 0)) / (field.max - (field.min ?? 0))) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold">{label}</label>
        <span className="text-xs text-muted">{field.unit}</span>
      </div>
      <input type="number" value={value} min={field.min} max={field.max} step={field.step ?? 1}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-brand" />
      {field.max != null && (
        <input type="range" min={field.min} max={field.max} step={field.step ?? 1} value={value || 0}
          onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--c-brand)]" style={{ '--p': `${pct}%` }} />
      )}
    </div>
  )
}

function resultChip(model, result, image) {
  const preview = result.units?.includes('tonne') && result.prediction != null
    ? `${Number(result.prediction).toFixed(2)} t/ha`
    : result.cluster != null
    ? result.label
    : result.prediction != null
    ? `${Number(result.prediction).toFixed(1)} g`
    : result.risk_level
      ? `${result.risk_level} risk`
      : result.recommendations?.[0]?.crop || model.name
  return {
    type: 'tool_run',
    id: result.run_id,
    title: result.label || model.name,
    preview,
    image_id: image?.id || null,
    focus_id: result.run_id,
  }
}

function formatWhen(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function ModelPanel({ model, onRan }) {
  const api = useApi()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [values, setValues] = useState(() => defaults(model))
  const [image, setImage] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  async function onImage(file) {
    if (!file) return
    const local = { preview: URL.createObjectURL(file), name: file.name, uploading: true }
    setImage(local)
    setResult(null)
    try {
      const [saved] = await api.upload([await downscaleImage(file)])
      setImage({ ...local, ...saved, uploading: false })
    } catch (err) {
      setImage(null)
      setError(err.message)
    }
  }

  async function run(e) {
    e.preventDefault()
    setRunning(true); setError(''); setResult(null)
    try {
      const inputs = model.input_type === 'image' ? { ...values, image: image?.id } : values
      const outcome = await api.runModel(model.id, inputs)
      setResult(outcome)
      onRan?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  function discuss() {
    if (!result?.run_id) return
    navigate('/app/chat', { state: { prompt: t('explainResult'), context: [resultChip(model, result, image)] } })
  }

  const imageOk = model.input_type !== 'image' || (image?.id && !image.uploading)
  const fieldsOk = model.fields.every((field) => !field.required || field.type === 'image' || (values[field.name] !== '' && values[field.name] != null))
  const canRun = imageOk && fieldsOk
  return (
    <motion.div key={model.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
      <form onSubmit={run} className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="grid gap-5 sm:grid-cols-2">
          {model.fields.map((f) => (
            <Field key={f.name} field={f} value={values[f.name]} values={values} image={image} onImage={onImage}
              onChange={(v) => setValues((p) => {
                const next = { ...p, [f.name]: v }
                if (f.name === 'state') { next.district = ''; next.crop = ''; next.season = '' }
                if (f.name === 'district') { next.crop = ''; next.season = '' }
                if (f.name === 'crop') next.season = ''
                return next
              })} />
          ))}
        </div>
        <button disabled={!canRun || running}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand-strong disabled:opacity-50">
          {running ? <Spinner /> : <Play size={17} />} {t('checkNow')}
        </button>
      </form>
      <div className="min-h-64 rounded-3xl border border-line bg-surface p-5 shadow-sm">
        {error && <div className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</div>}
        {result ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Result kind={model.id} data={result} />
            <button onClick={discuss} disabled={!result.run_id}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-2.5 font-semibold transition hover:border-brand hover:text-brand disabled:opacity-50">
              <MessageSquareText size={17} /> {t('askMeaning')}
            </button>
          </motion.div>
        ) : !error && (
          <div className="grid h-56 place-items-center text-center text-sm text-muted">
            <div><FlaskConical className="mx-auto mb-2 opacity-50" />{t('resultsHere')}</div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function ModelsPage() {
  const api = useApi()
  const { t } = useI18n()
  const [params] = useSearchParams()
  const focusRun = params.get('run')
  const [models, setModels] = useState([])
  const [runs, setRuns] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [openRun, setOpenRun] = useState(focusRun)
  const [seenFocus, setSeenFocus] = useState(focusRun)
  const [followedRun, setFollowedRun] = useState(null)
  if (focusRun !== seenFocus) {
    setSeenFocus(focusRun)
    setOpenRun(focusRun)
  }
  const focused = runs.find((run) => run.id === focusRun)
  if (focused && focusRun !== followedRun) {
    setFollowedRun(focusRun)
    if (focused.tool !== selected) setSelected(focused.tool)
  }

  function loadRuns() {
    api.runs().then(setRuns).catch(() => {})
  }

  useEffect(() => {
    api.models().then((m) => {
      setModels(m)
      setSelected((current) => current || m[0]?.id)
    }).catch((e) => setError(e.message))
    loadRuns()
  }, [api]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusRun || !runs.length) return undefined
    const timer = setTimeout(() => flashFocus(focusRun), 80)
    return () => clearTimeout(timer)
  }, [focusRun, runs])

  const model = models.find((m) => m.id === selected)
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-8 sm:pt-10">
        <h1 className="font-display text-3xl font-bold tracking-tight text-brand-strong sm:text-4xl">{t('farmTools')}</h1>
        <p className="mt-1 text-muted">{t('toolsHelp')}</p>
        {error && <div className="mt-4 rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {models.map((m) => {
            const Icon = ICONS[m.id] || FlaskConical
            const active = m.id === selected
            return (
              <button key={m.id} onClick={() => setSelected(m.id)}
                className={`rounded-3xl border-2 bg-surface p-4 text-left transition ${active ? 'border-brand shadow-lg shadow-brand/10' : 'border-line hover:border-brand/40'}`}>
                <div className="flex items-center justify-between">
                  <span className={`grid size-10 place-items-center rounded-2xl ${active ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}><Icon size={20} /></span>
                  <ModeBadge mode={m.status === 'connected' ? 'live' : 'mock'} />
                </div>
                <div className="mt-3 font-bold">{m.name}</div>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{m.description}</p>
              </button>
            )
          })}
        </div>
        <div className="mt-6">{model && <ModelPanel key={model.id} model={model} onRan={loadRuns} />}</div>
        {model && <ToolHistory model={model} runs={runs.filter((run) => run.tool === model.id)} openRun={openRun} setOpenRun={setOpenRun} onChanged={loadRuns} />}
      </div>
    </div>
  )
}

function ToolHistory({ model, runs, openRun, setOpenRun, onChanged }) {
  const api = useApi()
  const { t } = useI18n()
  const navigate = useNavigate()
  const Icon = ICONS[model.id] || FlaskConical
  const [error, setError] = useState('')

  async function remove(run) {
    if (!window.confirm(t('deleteRunConfirm'))) return
    setError('')
    try {
      await api.deleteRun(run.id)
      if (openRun === run.id) setOpenRun(null)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function clear() {
    if (!window.confirm(t('clearRunsConfirm'))) return
    setError('')
    try {
      await api.clearRuns(model.id)
      setOpenRun(null)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-brand-strong">{t('recentChecks')}</h2>
        {runs.length > 0 && (
          <button type="button" onClick={clear} className="text-sm font-semibold text-danger hover:underline">{t('clearHistory')}</button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{t('noChecks')}</p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-4 grid gap-3">
        {runs.map((run) => {
          const open = openRun === run.id
          return (
            <article key={run.id} data-focus-id={run.id} className="rounded-3xl border border-line bg-surface shadow-sm">
              <div className="flex items-center">
              <button type="button" onClick={() => setOpenRun(open ? null : run.id)}
                className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
                {run.image_id
                  ? <AuthImage fileId={run.image_id} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
                  : <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon size={22} /></span>}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-bold">{run.title}</span>
                    {run.thread_id && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-brand uppercase">{t('fromChat')}</span>}
                  </span>
                  <span className="block truncate text-sm text-muted">{run.summary}</span>
                  <span className="mt-0.5 block text-xs text-muted">{formatWhen(run.created_at)}</span>
                </span>
              </button>
              <button type="button" title={t('deleteRun')} aria-label={t('deleteRun')} onClick={() => remove(run)}
                className="mr-3 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
                <Trash2 size={16} />
              </button>
              </div>
                  {open && (
                    <div className="space-y-3 border-t border-line px-4 py-4">
                      <Result kind={run.tool} data={run.result} />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => navigate('/app/chat', {
                          state: {
                            prompt: t('explainResult'),
                            context: [{
                              type: 'tool_run', id: run.id, thread_id: run.thread_id, title: run.title,
                              preview: run.summary, image_id: run.image_id,
                              focus_id: run.thread_id ? run.message_id : run.id,
                            }],
                          },
                        })}
                          className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-sm font-semibold transition hover:border-brand hover:text-brand">
                          <MessageSquareText size={16} /> {t('askMeaning')}
                        </button>
                        {run.thread_id && (
                          <button type="button" onClick={() => navigate(`/app/chat/${run.thread_id}`, { state: { focus: run.message_id || run.id } })}
                            className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-sm font-semibold transition hover:border-brand hover:text-brand">
                            {t('viewInChat')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
