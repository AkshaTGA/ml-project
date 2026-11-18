import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  AlertTriangle, ArrowUp, Camera, ChartColumn, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, IndianRupee, Info,
  Layers, MapPin, MessageSquare, Sprout, Sun, Thermometer, Wind,
} from 'lucide-react'
import { FarmScene } from '../components/FarmScene'
import { VoiceField } from '../components/common'
import { useApi } from '../lib/api'
import { useAppData } from '../lib/appData'
import { useI18n } from '../lib/i18n'
import { knownText } from '../lib/labels'

export function WeatherIcon({ code = 0, size = 18, className = '' }) {
  const Icon = code === 0 ? Sun
    : code <= 3 ? CloudSun
    : code <= 48 ? CloudFog
    : code <= 57 ? CloudDrizzle
    : code <= 67 ? CloudRain
    : code <= 77 ? CloudSnow
    : code <= 82 ? CloudRain
    : CloudLightning
  return <Icon size={size} className={className} />
}

export function weatherKey(code) {
  if (code === 0) return 'wxClear'
  if (code <= 3) return 'wxPartly'
  if (code <= 48) return 'wxFog'
  if (code <= 57) return 'wxDrizzle'
  if (code <= 67) return 'wxRain'
  if (code <= 77) return 'wxSnow'
  if (code <= 82) return 'wxShowers'
  return 'wxStorm'
}

function usefulFact(value) {
  if (value == null) return ''
  const text = String(value).trim()
  if (!text || /^(don'?t know|unknown|not sure|n\/?a|none|na|-)$/i.test(text)) return ''
  return text
}

function Panel({ className = '', children }) {
  return <section className={`rounded-2xl p-5 sm:p-6 ${className}`}>{children}</section>
}

function Kicker({ children }) {
  return <p className="text-[11px] font-bold tracking-[0.16em] uppercase opacity-70">{children}</p>
}

function WeatherPanel({ weather, location }) {
  const { t, lang } = useI18n()
  if (!weather) {
    return (
      <Panel className="flex h-full flex-col justify-center bg-sky-soft text-ink">
        <Kicker>{t('weather')}</Kicker>
        <p className="mt-3 max-w-sm text-sm">{t('dashNoLocation')}</p>
        <Link to="/app/settings?tab=profile" className="mt-4 text-sm font-semibold text-sky">{t('dashAddLocation')}</Link>
      </Panel>
    )
  }
  const c = weather.current || {}
  const d = weather.daily || {}
  const code = c.weather_code ?? d.weather_code?.[0] ?? 0
  const label = t(weatherKey(code))
  const temp = c.temperature_2m == null ? '–' : Math.round(c.temperature_2m)
  return (
    <Panel className="flex h-full flex-col bg-sky-soft text-ink">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Kicker><span className="inline-flex items-center gap-1 normal-case tracking-normal"><MapPin size={12} /> {location || t('yourFarm')}</span></Kicker>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-6xl leading-none font-bold tracking-tight">{temp}°</span>
            <WeatherIcon code={code} size={32} className="mb-1" />
          </div>
          <p className="mt-2 text-sm font-medium">{label}</p>
        </div>
        <ul className="space-y-1 text-right text-sm">
          {c.relative_humidity_2m != null && <li className="flex items-center justify-end gap-1.5"><Droplets size={13} /> {c.relative_humidity_2m}%</li>}
          {c.wind_speed_10m != null && <li className="flex items-center justify-end gap-1.5"><Wind size={13} /> {c.wind_speed_10m} km/h</li>}
          {c.precipitation != null && <li className="flex items-center justify-end gap-1.5"><CloudRain size={13} /> {c.precipitation} mm</li>}
        </ul>
      </div>
      {!!d.time?.length && (
        <div className="mt-6 grid grid-cols-7 border-t border-sky/20 pt-4">
          {d.time.map((day, i) => (
            <div key={day} className="text-center">
              <div className="text-[11px] font-semibold opacity-60">{new Date(day).toLocaleDateString(lang, { weekday: 'short' })}</div>
              <div className="my-1 flex justify-center"><WeatherIcon code={d.weather_code?.[i] ?? 0} size={16} /></div>
              <div className="text-sm font-bold">{Math.round(d.temperature_2m_max?.[i] ?? 0)}°</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function FarmPanel({ profile, onAsk, t }) {
  const crops = profile?.crops || []
  const animals = Object.entries(profile?.livestock || {}).filter(([, n]) => n)
  const headline = (crops[0] && knownText(crops[0], t)) || (animals[0] ? `${animals[0][1]} ${knownText(animals[0][0], t)}` : null)
  const facts = [
    profile?.land_area && `${profile.land_area} ${knownText(profile.land_unit || 'acre', t)}`,
    usefulFact(profile?.soil) && knownText(usefulFact(profile.soil), t),
    usefulFact(profile?.irrigation) && knownText(usefulFact(profile.irrigation), t),
    animals.map(([a, n]) => `${n} ${knownText(a, t)}`).join(', '),
  ].filter(Boolean)
  const ask = (name) => onAsk(t('cropAskPrompt').replace('{crop}', name))

  if (!headline) {
    return (
      <Link to="/app/settings?tab=profile" className="flex h-full flex-col justify-between rounded-2xl bg-mint p-5 text-brand-strong sm:p-6">
        <Kicker>{t('onYourFarm')}</Kicker>
        <div>
          <div className="text-3xl font-bold">{t('myFarm')}</div>
          <p className="mt-2 text-sm">{t('addYourCrop')}</p>
        </div>
      </Link>
    )
  }

  return (
    <div className="flex h-full flex-col rounded-2xl bg-mint p-5 text-brand-strong sm:p-6">
      <Kicker>{t('onYourFarm')}</Kicker>
      <button type="button" onClick={() => ask(crops[0] || headline)} className="mt-4 text-left">
        <div className="text-4xl font-bold tracking-tight sm:text-5xl">{headline}</div>
        <p className="mt-2 text-sm opacity-80">{facts.join(' · ') || t('helpToday')}</p>
      </button>
      {crops.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {crops.slice(1).map((c) => (
            <button key={c} type="button" onClick={() => ask(c)}
              className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">{knownText(c, t)}</button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => ask(crops[0] || headline)}
        className="mt-auto w-fit pt-8 text-sm font-bold underline decoration-brand/40 underline-offset-4">
        {t('askAssistant')} · {headline}
      </button>
    </div>
  )
}

const ALERT_ICON = { rain: CloudRain, heat: Thermometer, frost: Thermometer, irrigation: Droplets }

export default function Dashboard() {
  const api = useApi()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const { profile } = useAppData()
  const [data, setData] = useState(null)
  const [ask, setAsk] = useState('')

  useEffect(() => { api.dashboard().then(setData).catch(() => setData({})) }, [api])

  const startChat = (state) => navigate('/app/chat', { state })
  const today = new Date().toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })

  const models = [
    { id: 'biomass', icon: Sprout, name: t('modelBiomass'), hint: t('modelBiomassHint'), tint: 'bg-brand text-white' },
    { id: 'yield', icon: ChartColumn, name: t('modelYield'), hint: t('modelYieldHint'), tint: 'bg-brand-soft text-brand-strong' },
    { id: 'soil', icon: Layers, name: t('modelSoil'), hint: t('modelSoilHint'), tint: 'bg-sand text-sand-ink' },
  ]
  const actions = [
    { icon: Sprout, label: t('checkPasture'), tint: 'text-brand-strong', state: { prompt: t('pasturePrompt') } },
    { icon: Camera, label: t('scanLeaf'), tint: 'text-sand-ink', state: { action: 'scan' } },
    { icon: CloudSun, label: t('weather'), tint: 'text-sky', state: { prompt: t('weatherPrompt') } },
    { icon: IndianRupee, label: t('mandiPrices'), tint: 'text-lilac-ink', state: { prompt: t('mandiPrompt') } },
  ]

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-8 sm:pt-8">
        <header className="grid items-end gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="text-sm font-semibold text-brand">{today}</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-ink sm:text-6xl sm:leading-[0.95]">
              {t('namaste')}{profile?.name ? `, ${profile.name}` : ''}
            </h1>
            <p className="mt-3 max-w-md text-lg text-muted">{t('helpToday')}</p>
          </div>
          <div className="h-36 overflow-hidden rounded-tl-[3.5rem] rounded-br-[3.5rem] lg:col-span-5 lg:h-44">
            <FarmScene className="h-full w-full" />
          </div>
        </header>

        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold tracking-[0.16em] text-brand uppercase">{t('farmTools')}</p>
              <h2 className="text-lg font-bold">{t('runThenAsk')}</h2>
            </div>
            <Link to="/app/models" className="text-sm font-semibold text-brand">{t('farmTools')}</Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Link to="/app/models?model=biomass"
              className="pasture-panel flex flex-col justify-between rounded-3xl p-6 text-white transition hover:-translate-y-0.5 hover:shadow-xl lg:col-span-2">
              <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-[var(--c-straw)]">{t('flagshipModel')}</span>
              <span className="mt-6">
                <Sprout size={28} />
                <span className="mt-3 block text-2xl font-bold">{t('modelBiomass')}</span>
                <span className="mt-1 block max-w-md text-sm text-white/80">{t('modelBiomassBlurb')}</span>
              </span>
            </Link>
            <div className="grid gap-3">
              {models.filter((m) => m.id !== 'biomass').map(({ id, icon: Icon, name, hint, tint }) => (
                <Link key={id} to={`/app/models?model=${id}`}
                  className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tint}`}><Icon size={22} /></span>
                  <span>
                    <span className="block font-bold">{name}</span>
                    <span className="mt-0.5 block text-sm text-muted">{hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) startChat({ prompt: ask }) }}
          className="mt-8 flex min-h-16 items-center gap-2 rounded-2xl border border-line bg-surface pr-2 pl-3 shadow-[0_10px_30px_-24px_rgba(30,60,24,0.9)]">
          <VoiceField plain micFirst value={ask} onChange={setAsk} placeholder={t('askByVoice')} className="flex-1" inputClassName="text-base" />
          <button type="submit" disabled={!ask.trim()} aria-label={t('send')}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand-strong disabled:opacity-40">
            <ArrowUp size={20} />
          </button>
        </form>

        <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-4 sm:divide-y-0">
          {actions.map(({ icon: Icon, label, tint, state }) => (
            <button key={label} type="button" onClick={() => startChat(state)}
              className="flex items-center gap-3 px-4 py-4 text-left transition hover:bg-surface-2">
              <Icon size={18} className={tint} />
              <span className="font-semibold text-ink">{label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {data ? <WeatherPanel weather={data.weather} location={profile?.location_name} /> : <div className="h-56 animate-pulse rounded-2xl bg-sky-soft" />}
          </div>
          <div className="lg:col-span-5">
            <FarmPanel profile={profile} t={t} onAsk={(prompt) => startChat({ prompt })} />
          </div>
        </div>

        <section className="mt-4 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          <div className="grid lg:grid-cols-3 lg:divide-x lg:divide-line">
            <div className="border-b border-line p-5 lg:border-b-0 sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-bold"><AlertTriangle size={15} className="text-gold" /> {t('alerts')}</h2>
              <div className="mt-4 space-y-4">
                {!data && <p className="text-sm text-muted">{t('dashChecking')}</p>}
                {data?.alerts?.length === 0 && (
                  <div>
                    <p className="text-2xl font-bold text-brand-strong">{t('dashClear')}</p>
                    <p className="mt-1 text-sm text-muted">{t('noAlerts')}</p>
                  </div>
                )}
                {data?.alerts?.map((a) => {
                  const Icon = ALERT_ICON[a.kind] || Info
                  return (
                    <div key={a.kind + a.date} className="border-l-2 border-gold pl-3">
                      <div className="flex items-center gap-2 text-sm font-bold"><Icon size={14} className="text-gold" /> {a.title}</div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{a.message}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-b border-line p-5 lg:border-b-0 sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-bold"><IndianRupee size={15} className="text-brand" /> {t('mandi')}</h2>
              <div className="mt-4 space-y-1">
                {!data && <p className="text-sm text-muted">{t('dashRates')}</p>}
                {data && !data.mandi?.length && <p className="text-sm text-muted">{t('dashAddCrops')}</p>}
                {data?.mandi?.map((m) => (
                  <button key={m.commodity} onClick={() => startChat({ prompt: t('mandiAskPrompt', { crop: m.commodity }) })}
                    className="flex w-full items-baseline justify-between gap-3 border-b border-line py-3 text-left last:border-0">
                    <span className="min-w-0">
                      <b className="block truncate">{m.commodity}</b>
                      <span className="block truncate text-xs text-muted">{m.markets?.[0] ? `${m.markets[0].market}, ${m.markets[0].state}` : t('askTodayRate')}</span>
                    </span>
                    {m.modal
                      ? <span className="text-lg font-bold text-brand-strong">₹{m.modal.toLocaleString('en-IN')}</span>
                      : <span className="text-sm font-semibold text-brand">{t('askShort')}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-bold"><MessageSquare size={15} className="text-brand" /> {t('recentChats')}</h2>
              <div className="mt-4 space-y-1">
                {(data?.recent_threads || []).map((th) => (
                  <Link key={th.id} to={`/app/chat/${th.id}`} className="block border-b border-line py-3 last:border-0 hover:text-brand-strong">
                    <span className="line-clamp-2 text-sm leading-snug">{th.title}</span>
                    {th.updated_at && (
                      <span className="mt-1 block text-[11px] text-muted">{new Date(th.updated_at).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}</span>
                    )}
                  </Link>
                ))}
                {!data && <p className="text-sm text-muted">{t('dashLoading')}</p>}
                {data && !data.recent_threads?.length && <p className="text-sm text-muted">{t('dashNoQuestions')}</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
