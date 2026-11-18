// Visual renderers for model and tool outputs, shared by the chat timeline and the Models page.
import { Component, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, ExternalLink, FlaskConical, Leaf, ShieldCheck } from 'lucide-react'
import { useApi } from '../lib/api'
import { WEATHER } from '../pages/Dashboard'

const BIOMASS = [
  ['Dry_Green_g', 'Green', 'bg-brand'], ['Dry_Clover_g', 'Clover', 'bg-[#8bc34a]'], ['Dry_Dead_g', 'Dead', 'bg-earth'],
  ['GDM_g', 'Green dry matter', 'bg-[#4f9a3a]'], ['Dry_Total_g', 'Total', 'bg-brand-strong'],
]

export function ModeBadge({ mode }) {
  return mode === 'mock'
    ? <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-gold uppercase">mock</span>
    : <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-brand uppercase">live</span>
}

function Bars({ rows, max, unit = '', digits = 1, stacked = false }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.label} className={`grid items-center gap-x-3 gap-y-1 text-[13px] ${stacked ? 'grid-cols-[1fr_auto]' : 'grid-cols-[minmax(80px,28%)_1fr_auto]'}`}>
          <span className={`truncate capitalize ${stacked ? 'col-span-2 whitespace-normal' : ''}`}>{r.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div className={`h-full rounded-full ${r.color || 'bg-brand'}`} initial={{ width: 0 }}
              animate={{ width: `${(r.value / top) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.06, ease: 'easeOut' }} />
          </div>
          <span className="min-w-14 text-right tabular-nums text-muted">{r.value.toFixed(digits)}{unit}</span>
        </div>
      ))}
    </div>
  )
}

const Head = ({ title, mode }) => (
  <div className="mb-3 flex items-center justify-between gap-2"><b className="text-sm">{title}</b>{mode !== undefined && <ModeBadge mode={mode} />}</div>
)
const Note = ({ children }) => children ? <p className="mt-3 text-xs text-muted">{children}</p> : null

const GREEN_FEATURES = [
  ['exg_mean', 'ExG mean'],
  ['exg_std', 'ExG std'],
  ['exg_top10', 'ExG top 10%'],
  ['gndvi_mean', 'GNDVI'],
]

function GradcamImage({ fileId, alt }) {
  const api = useApi()
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!fileId) return undefined
    let url = ''
    let live = true
    api.fileBlob(fileId).then((blob) => {
      url = URL.createObjectURL(blob)
      if (live) setSrc(url)
    }).catch(() => { if (live) setFailed(true) })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [api, fileId])
  if (failed) return <p className="mt-3 text-xs text-danger">Could not load the Grad-CAM image.</p>
  if (!src) return <div className="mt-3 h-48 animate-pulse rounded-2xl bg-surface-2" />
  return <img src={src} alt={alt} className="mt-3 w-full rounded-2xl border border-line object-cover" />
}

function BiomassResult({ data }) {
  const predictions = data.predictions || (data.target != null && data.prediction != null ? { [data.target]: data.prediction } : null)
  if (!predictions || !Object.keys(predictions).length) return <Raw data={data} />
  const keys = Object.keys(predictions)
  const single = keys.length === 1
  const label = data.label || BIOMASS.find(([key]) => key === keys[0])?.[1] || keys[0]
  return (
    <div>
      <Head title={single ? label : 'Dry biomass (g per quadrat)'} mode={data.mode} />
      {single ? (
        <>
          <div className="text-4xl font-bold tabular-nums">
            {Number(predictions[keys[0]]).toFixed(2)}
            <span className="ml-1 text-base font-semibold text-muted">g</span>
          </div>
          <p className="text-xs text-muted">{data.units || 'grams of dry matter per sample quadrat'}</p>
          {data.gradcam_file_id && <GradcamImage key={data.gradcam_file_id} fileId={data.gradcam_file_id} alt={`Grad-CAM overlay for ${label}`} />}
          {data.gradcam_summary && <p className="mt-2 text-xs text-muted">{data.gradcam_summary}</p>}
        </>
      ) : (
        <Bars rows={BIOMASS.filter(([key]) => predictions[key] != null).map(([key, name, color]) => ({ label: name, value: predictions[key], color }))} unit=" g" />
      )}
      {data.green_features && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {GREEN_FEATURES.filter(([key]) => data.green_features[key] != null).map(([key, name]) => (
            <div key={key} className="rounded-2xl bg-surface-2 px-3 py-2">
              <div className="text-[11px] text-muted">{name}</div>
              <div className="font-semibold tabular-nums">{Number(data.green_features[key]).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
      <Note>{data.note}</Note>
    </div>
  )
}

function CropResult({ data }) {
  return (
    <div>
      <Head title="Recommended crops" mode={data.mode} />
      <Bars rows={data.recommendations.map((r) => ({ label: r.crop, value: r.confidence * 100 }))} max={100} unit="%" digits={0} />
      <Note>{data.note}</Note>
    </div>
  )
}

const RISK = { high: 'bg-danger-soft text-danger', medium: 'bg-gold-soft text-gold', low: 'bg-brand-soft text-brand' }

function YieldResult({ data }) {
  const stats = [
    ['previous_yield', `Previous (${data.previous_year || 'last'})`],
    ['historical_mean_3', 'Mean of last 3'],
    ['years_since_previous', 'Years since then'],
    ['history_count', 'Earlier records'],
  ]
  return (
    <div>
      <Head title={data.label || 'Crop yield'} mode={data.mode} />
      <div className="text-4xl font-bold tabular-nums">
        {Number(data.prediction).toFixed(2)}
        <span className="ml-1 text-base font-semibold text-muted">t/ha</span>
      </div>
      <p className="text-xs text-muted">{data.units || 'tonnes per hectare'}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {stats.map(([key, label]) => (
          <div key={key} className="rounded-2xl bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-muted">{label}</div>
            <div className="font-semibold tabular-nums">{data[key] ?? '–'}</div>
          </div>
        ))}
      </div>
      <Note>{data.note}</Note>
    </div>
  )
}

function SoilResult({ data }) {
  const units = data.units || {}
  const medians = data.group_medians || {}
  const inputs = data.inputs || {}
  return (
    <div>
      <Head title={data.label || 'Soil profile'} mode={data.mode} />
      <p className="text-sm">{data.summary}</p>
      <p className="mt-1 text-xs text-muted">{data.sample_count} similar samples in this group</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {Object.keys(inputs).map((name) => (
          <div key={name} className="rounded-2xl bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-muted">{name}{units[name] ? ` · ${units[name]}` : ''}</div>
            <div className="font-semibold tabular-nums">{inputs[name]}</div>
            {medians[name] != null && <div className="text-[11px] text-muted">Group median {medians[name]}</div>}
          </div>
        ))}
      </div>
      <Note>{data.note}</Note>
    </div>
  )
}

function LivestockResult({ data }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className={`rounded-full px-3 py-1 text-sm font-bold capitalize ${RISK[data.risk_level] || RISK.medium}`}>{data.risk_level} risk</span>
        <ModeBadge mode={data.mode} />
      </div>
      {data.possible_conditions?.length
        ? <Bars stacked rows={data.possible_conditions.map((c) => ({ label: c.condition, value: c.match * 100, color: 'bg-gold' }))} max={100} unit="% match" digits={0} />
        : <p className="text-sm">No matching conditions.</p>}
      <Note>{data.note}</Note>
    </div>
  )
}

function TreatmentList({ icon: Icon, title, items, tone }) {
  if (!items?.length) return null
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${tone}`}><Icon size={13} /> {title}</div>
      <ul className="space-y-1 text-[13px]">{items.map((x) => <li key={x}>• {x}</li>)}</ul>
    </div>
  )
}

function DiseaseResult({ data }) {
  const urgency = { high: 'bg-danger text-white', medium: 'bg-gold text-white', low: 'bg-brand text-white' }[data.urgency]
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold">{data.healthy ? 'Looks healthy 🌱' : data.disease}</span>
        {!data.healthy && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${urgency}`}>{data.urgency} urgency</span>}
      </div>
      <div className="mt-1 text-sm text-muted">{data.crop} · {Math.round(data.confidence * 100)}% confident</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${data.confidence * 100}%` }} />
      </div>
      {data.symptoms_seen?.length > 0 && <p className="mt-3 text-[13px]"><b>Seen:</b> {data.symptoms_seen.join(', ')}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <TreatmentList icon={Leaf} title="Organic" items={data.organic_treatment} tone="text-brand" />
        <TreatmentList icon={FlaskConical} title="Chemical" items={data.chemical_treatment} tone="text-sky" />
        <TreatmentList icon={ShieldCheck} title="Prevention" items={data.prevention} tone="text-earth" />
        <TreatmentList icon={AlertTriangle} title="Could also be" items={data.other_possibilities} tone="text-gold" />
      </div>
      <Note>{data.note}</Note>
    </div>
  )
}

function MandiResult({ data }) {
  if (!data.prices) return <SearchResult data={data.web_results || []} title={`${data.commodity} prices (web)`} />
  return (
    <div>
      <Head title={`${data.commodity} · ₹ per quintal`} />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-xs text-muted"><tr><th className="py-1 pr-3 font-medium">Market</th><th className="pr-3 font-medium">Modal</th><th className="pr-3 font-medium">Min–Max</th><th className="font-medium">Date</th></tr></thead>
          <tbody>
            {data.prices.map((p, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1.5 pr-3"><b>{p.market}</b><span className="block text-xs text-muted">{p.district}, {p.state}</span></td>
                <td className="pr-3 font-bold">₹{p.modal?.toLocaleString('en-IN')}</td>
                <td className="pr-3 text-muted">{p.min?.toLocaleString('en-IN')}–{p.max?.toLocaleString('en-IN')}</td>
                <td className="text-muted">{p.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>Source: {data.source}</Note>
    </div>
  )
}

function GrazingResult({ data }) {
  const stats = [['grazing_days', 'grazing days'], ['pasture_kg_dm_per_ha', 'kg DM / ha'], ['available_feed_kg_dm', 'kg feed available'], ['herd_daily_demand_kg_dm', 'kg/day herd demand']]
  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map(([k, label], i) => (
        <div key={k} className={`rounded-2xl p-3 ${i === 0 ? 'bg-brand text-white' : 'bg-surface-2'}`}>
          <div className="text-2xl font-bold">{data[k]}</div><div className={`text-xs ${i === 0 ? 'text-white/80' : 'text-muted'}`}>{label}</div>
        </div>
      ))}
    </div>
  )
}

function SearchResult({ data, title }) {
  if (!Array.isArray(data)) return <Raw data={data} />
  return (
    <div>
      {title && <Head title={title} />}
      <ul className="space-y-2.5">
        {data.map((r) => (
          <li key={r.url} className="text-[13px]">
            <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">{r.title}<ExternalLink size={11} /></a>
            <p className="line-clamp-2 text-muted">{r.snippet}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WeatherResult({ data }) {
  const c = data.current || {}
  const d = data.daily || {}
  return (
    <div>
      <Head title={data.location} />
      <p className="text-[13px]">{WEATHER(c.weather_code ?? 0)[0]} {c.temperature_2m}°C · humidity {c.relative_humidity_2m}% · wind {c.wind_speed_10m} km/h</p>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]">
        {(d.time || []).map((t, i) => (
          <div key={t} className="rounded-xl bg-surface-2 px-0.5 py-1.5">
            <b>{new Date(t).toLocaleDateString(undefined, { weekday: 'short' })}</b>
            <div>{WEATHER(d.weather_code?.[i] ?? 0)[0]}</div>
            <div>{Math.round(d.temperature_2m_max[i])}°/{Math.round(d.temperature_2m_min[i])}°</div>
            <div className="text-sky">{d.precipitation_sum[i]}mm</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemoryResult({ data }) {
  if (Array.isArray(data)) {
    return <ul className="space-y-1 text-[13px]">{data.map((m) => <li key={m.id || m.thread_id}>• {m.text || `${m.title}: ${m.summary}`}</li>)}</ul>
  }
  return <p className="text-[13px]">{data.saved === false ? 'Already known: ' : data.updated ? `Updated ${data.updated}: ` : 'Saved: '}<b>{data.fact || String(data.value ?? '')}</b></p>
}

const BY_KEY = {
  biomass: BiomassResult, predict_pasture_biomass: BiomassResult,
  crop: CropResult, recommend_crop: CropResult,
  yield: YieldResult, predict_crop_yield: YieldResult,
  soil: SoilResult, describe_soil_profile: SoilResult,
  livestock: LivestockResult, assess_livestock_health: LivestockResult,
  diagnose_plant_disease: DiseaseResult, get_mandi_prices: MandiResult,
  estimate_grazing_days: GrazingResult, web_search: SearchResult, get_weather: WeatherResult,
  remember_fact: MemoryResult, recall_memories: MemoryResult, search_past_conversations: MemoryResult, update_farm_profile: MemoryResult,
}

const Raw = ({ data }) => <pre className="max-h-72 overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{typeof data === 'string' ? data : JSON.stringify(data, null, 2)}</pre>

// Falls back to raw JSON if an output doesn't have the shape a renderer expects.
class Fallback extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <Raw data={this.props.data} /> : this.props.children }
}

export function parseOutput(output) {
  try { return JSON.parse(output) } catch { return output }
}

export function Result({ kind, data }) {
  const View = BY_KEY[kind]
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    return <p className="text-sm text-danger">{data.error}</p>
  }
  if (!View || typeof data !== 'object' || data === null) return <Raw data={data} />
  return <Fallback data={data}><View data={data} /></Fallback>
}
