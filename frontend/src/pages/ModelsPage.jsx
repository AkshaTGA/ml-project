import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { FlaskConical, ImagePlus, MessageSquareText, PawPrint, Play, Sprout, Wheat } from 'lucide-react'
import { Spinner } from '../components/common'
import { ModeBadge, Result } from '../components/Results'
import { downscaleImage, useApi } from '../lib/api'
import { useI18n } from '../lib/i18n'

const ICONS = { biomass: Sprout, crop: Wheat, livestock: PawPrint }

function defaults(model) {
  return Object.fromEntries(model.fields.filter((f) => f.type !== 'image').map((f) => [f.name, f.default ?? '']))
}

function Field({ field, value, onChange, image, onImage }) {
  const fileRef = useRef(null)
  if (field.type === 'image') {
    return (
      <div className="sm:col-span-2">
        <label className="text-sm font-semibold">{field.label}</label>
        <button type="button" onClick={() => fileRef.current.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onImage(e.dataTransfer.files[0]) }}
          className={`relative mt-1.5 flex h-60 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-muted transition hover:border-brand ${image ? 'border-transparent' : 'border-line bg-surface-2/50'}`}>
          {image ? <img src={image.preview} alt="" className="absolute inset-0 size-full object-cover" /> : <><ImagePlus size={30} /><span className="text-sm">Click or drop a photo</span></>}
          {image?.uploading && <div className="absolute inset-0 grid place-items-center bg-white/60"><Spinner /></div>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onImage(e.target.files[0])} />
        {field.help && <p className="mt-1 text-xs text-muted">{field.help}</p>}
      </div>
    )
  }
  if (field.type === 'select') {
    return (
      <div>
        <label className="text-sm font-semibold">{field.label}</label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {field.options.map((o) => (
            <button key={o} type="button" onClick={() => onChange(o)}
              className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${value === o ? 'border-brand bg-brand text-white' : 'border-line hover:border-brand'}`}>{o}</button>
          ))}
        </div>
      </div>
    )
  }
  if (field.type === 'multiselect') {
    return (
      <div className="sm:col-span-2">
        <label className="text-sm font-semibold">{field.label}</label>
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
        <label className="text-sm font-semibold">{field.label}</label>
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

function ModelPanel({ model }) {
  const api = useApi()
  const navigate = useNavigate()
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
      setResult(await api.runModel(model.id, model.input_type === 'image' ? { image: image?.id } : values))
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  function discuss() {
    const inputs = model.input_type === 'image' ? 'the attached photo' : `inputs ${JSON.stringify(values)}`
    navigate('/app/chat', {
      state: { prompt: `I ran the ${model.name} on ${inputs}.\nResult: ${JSON.stringify(result)}\n\nPlease explain this in simple words and tell me what I should do.` },
    })
  }

  const canRun = model.input_type !== 'image' || (image?.id && !image.uploading)
  return (
    <motion.div key={model.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
      <form onSubmit={run} className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="grid gap-5 sm:grid-cols-2">
          {model.fields.map((f) => (
            <Field key={f.name} field={f} value={values[f.name]} image={image} onImage={onImage}
              onChange={(v) => setValues((p) => ({ ...p, [f.name]: v }))} />
          ))}
        </div>
        <button disabled={!canRun || running}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand-strong disabled:opacity-50">
          {running ? <Spinner /> : <Play size={17} />} Check now
        </button>
      </form>
      <div className="min-h-64 rounded-3xl border border-line bg-surface p-5 shadow-sm">
        {error && <div className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</div>}
        {result ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Result kind={model.id} data={result} />
            <button onClick={discuss} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-2.5 font-semibold transition hover:border-brand hover:text-brand">
              <MessageSquareText size={17} /> Ask what this means
            </button>
          </motion.div>
        ) : !error && (
          <div className="grid h-56 place-items-center text-center text-sm text-muted">
            <div><FlaskConical className="mx-auto mb-2 opacity-50" />Results will appear here.</div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function ModelsPage() {
  const api = useApi()
  const { t } = useI18n()
  const [models, setModels] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.models().then((m) => { setModels(m); setSelected(m[0]?.id) }).catch((e) => setError(e.message))
  }, [api])

  const model = models.find((m) => m.id === selected)
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-8 sm:pt-10">
        <h1 className="font-display text-3xl font-bold tracking-tight text-brand-strong sm:text-4xl">{t('farmTools')}</h1>
        <p className="mt-1 text-muted">{t('toolsHelp')}</p>
        {error && <div className="mt-4 rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</div>}
        <div className="mt-6 grid gap-3 md:grid-cols-3">
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
        <div className="mt-6">{model && <ModelPanel key={model.id} model={model} />}</div>
      </div>
    </div>
  )
}
