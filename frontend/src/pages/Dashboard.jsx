import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import {
  AlertTriangle, ArrowRight, ArrowUp, Camera, ChevronRight, CloudRain, CloudSun, Droplets, IndianRupee, Info,
  MapPin, MessageSquare, Sprout, Thermometer, Wind,
} from 'lucide-react'
import { FarmScene, WheatArt } from '../components/FarmScene'
import { VoiceField } from '../components/common'
import { useApi } from '../lib/api'
import { useAppData } from '../lib/appData'
import { useI18n } from '../lib/i18n'

export const WEATHER = (code) => {
  if (code === 0) return ['☀️', 'Clear sky']
  if (code <= 3) return ['⛅', 'Partly cloudy']
  if (code <= 48) return ['🌫️', 'Fog']
  if (code <= 57) return ['🌦️', 'Drizzle']
  if (code <= 67) return ['🌧️', 'Rain']
  if (code <= 77) return ['🌨️', 'Snow']
  if (code <= 82) return ['🌧️', 'Showers']
  return ['⛈️', 'Thunderstorm']
}

const soft = 'rounded-[28px] bg-surface shadow-[0_10px_30px_-18px_rgba(40,70,30,0.35)]'
const rise = (i) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.05, duration: 0.4 } })

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-[28px] bg-surface-2 ${className}`} />
}

function WeatherCard({ weather, location }) {
  if (!weather) {
    return (
      <div className={`${soft} flex min-h-44 flex-col justify-center p-6`}>
        <MapPin className="text-brand" />
        <p className="mt-2 text-sm text-muted">Add your farm location in My Farm to see the weather here.</p>
        <Link to="/app/settings?tab=profile" className="mt-3 text-sm font-semibold text-brand-strong">Add location</Link>
      </div>
    )
  }
  const c = weather.current || {}
  const d = weather.daily || {}
  const [icon, label] = WEATHER(c.weather_code ?? d.weather_code?.[0] ?? 0)
  const temp = c.temperature_2m == null ? '–' : Math.round(c.temperature_2m)
  return (
    <div className={`${soft} flex min-h-44 flex-col p-6`}>
      <div className="flex items-start gap-4">
        <span className="text-5xl leading-none">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} /> {location || 'Your farm'}</div>
          <div className="mt-1 font-display text-5xl font-bold tracking-tight text-ink">{temp}°C</div>
          <div className="text-muted">{label}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
        {c.relative_humidity_2m != null && <span className="flex items-center gap-1"><Droplets size={14} /> {c.relative_humidity_2m}%</span>}
        {c.wind_speed_10m != null && <span className="flex items-center gap-1"><Wind size={14} /> {c.wind_speed_10m} km/h</span>}
        {c.precipitation != null && <span className="flex items-center gap-1"><CloudRain size={14} /> {c.precipitation} mm</span>}
      </div>
      {!!d.time?.length && (
        <div className="mt-4 grid grid-cols-7 gap-1 border-t border-line/80 pt-3">
          {d.time.map((day, i) => (
            <div key={day} className="text-center text-xs text-muted">
              <div>{new Date(day).toLocaleDateString(undefined, { weekday: 'narrow' })}</div>
              <div className="my-1 text-base">{WEATHER(d.weather_code?.[i] ?? 0)[0]}</div>
              <div className="font-semibold text-ink">{Math.round(d.temperature_2m_max?.[i] ?? 0)}°</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FarmCard({ profile, onAsk, t }) {
  const crops = profile?.crops || []
  const animals = Object.entries(profile?.livestock || {}).filter(([, n]) => n)
  const headline = crops[0] || (animals[0] ? `${animals[0][1]} ${animals[0][0]}` : null)
  const facts = [
    profile?.land_area && `${profile.land_area} ${profile.land_unit || 'acre'}`,
    profile?.soil,
    profile?.irrigation,
    animals.map(([a, n]) => `${n} ${a}`).join(', '),
  ].filter(Boolean)
  const ask = (name) => onAsk(t('cropAskPrompt').replace('{crop}', name))
  const art = <WheatArt className="pointer-events-none absolute -right-2 bottom-0 h-32 w-40 opacity-90" />

  if (!headline) {
    return (
      <Link to="/app/settings?tab=profile" className={`${soft} relative flex min-h-44 flex-col justify-center overflow-hidden p-6`}>
        <div className="text-sm text-muted">{t('onYourFarm')}</div>
        <div className="mt-1 font-display text-3xl font-bold text-ink">Your farm</div>
        <p className="mt-1 max-w-[70%] text-sm text-muted">{t('addYourCrop')}</p>
        {art}
      </Link>
    )
  }

  return (
    <div className={`${soft} relative min-h-44 overflow-hidden p-6`}>
      <button type="button" onClick={() => ask(crops[0] || headline)} className="block w-full pr-10 text-left">
        <div className="text-sm text-muted">{t('onYourFarm')}</div>
        <div className="mt-1 max-w-[70%] font-display text-4xl font-bold tracking-tight text-ink">{headline}</div>
        <p className="mt-1 max-w-[68%] text-sm text-muted">{facts.join(' · ') || animals.map(([a, n]) => `${n} ${a}`).join(', ') || 'Ask how it is doing'}</p>
      </button>
      {crops.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {crops.slice(1).map((c) => (
            <button key={c} type="button" onClick={() => ask(c)}
              className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-strong">{c}</button>
          ))}
        </div>
      )}
      {art}
      <button type="button" aria-label={t('askAssistant')} onClick={() => ask(crops[0] || headline)}
        className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-surface-2 text-muted">
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

const ALERT_STYLE = {
  warning: 'border-gold/40 bg-gold-soft text-gold',
  info: 'border-sky/30 bg-sky-soft text-sky',
}
const ALERT_ICON = { rain: CloudRain, heat: Thermometer, frost: Thermometer, irrigation: Droplets }

export default function Dashboard() {
  const api = useApi()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { profile } = useAppData()
  const [data, setData] = useState(null)
  const [ask, setAsk] = useState('')

  useEffect(() => { api.dashboard().then(setData).catch(() => setData({})) }, [api])

  const startChat = (state) => navigate('/app/chat', { state })

  const actions = [
    { icon: Sprout, label: t('cropAdvice'), bg: 'bg-mint', color: 'text-brand-strong', state: { prompt: t('cropAdvicePrompt') } },
    { icon: Camera, label: t('scanLeaf'), bg: 'bg-sand', color: 'text-sand-ink', state: { action: 'scan' } },
    { icon: CloudSun, label: t('weather'), bg: 'bg-sky-tile', color: 'text-sky', state: { prompt: t('weatherPrompt') } },
    { icon: IndianRupee, label: t('mandiPrices'), bg: 'bg-lilac', color: 'text-lilac-ink', state: { prompt: t('mandiPrompt') } },
  ]

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-8 sm:pt-8">
        <div className="grid items-center gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div {...rise(0)} className="order-2 lg:order-1">
            <h1 className="font-display text-4xl font-bold tracking-tight text-brand-strong sm:text-5xl">
              {t('namaste')}{profile?.name ? `, ${profile.name}` : ''} 👋
            </h1>
            <p className="mt-2 text-lg text-muted">{t('helpToday')}</p>
            <motion.form {...rise(1)} onSubmit={(e) => { e.preventDefault(); if (ask.trim()) startChat({ prompt: ask }) }}
              className="mt-6 flex min-h-[5.25rem] items-center gap-2 rounded-full bg-ask py-2 pr-2 pl-3 shadow-[0_12px_32px_-18px_rgba(36,107,48,0.55)]">
              <VoiceField plain micFirst value={ask} onChange={setAsk} placeholder={t('askByVoice')} className="flex-1" />
              <button type="submit" disabled={!ask.trim()} aria-label={t('send')}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-strong disabled:opacity-40">
                <ArrowUp size={22} />
              </button>
            </motion.form>
          </motion.div>
          <motion.div {...rise(0)} className="order-1 h-48 overflow-hidden rounded-[32px] shadow-sm lg:order-2 lg:h-72">
            <FarmScene className="h-full w-full" />
          </motion.div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {actions.map((a, i) => {
            const Icon = a.icon
            return (
              <motion.button {...rise(2 + i)} key={a.label} type="button" whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
                onClick={() => startChat(a.state)}
                className={`flex min-h-[8.75rem] flex-col items-center justify-center gap-3 rounded-[28px] ${a.bg} px-4 py-5 text-center`}>
                <Icon size={30} strokeWidth={1.75} className={a.color} />
                <span className={`text-base font-semibold ${a.color}`}>{a.label}</span>
              </motion.button>
            )
          })}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <motion.div {...rise(6)}>
            {data ? <WeatherCard weather={data.weather} location={profile?.location_name} /> : <Skeleton className="h-52" />}
          </motion.div>
          <motion.div {...rise(7)}>
            <FarmCard profile={profile} t={t} onAsk={(prompt) => startChat({ prompt })} />
          </motion.div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <motion.div {...rise(8)} className={`${soft} p-5`}>
            <h2 className="flex items-center gap-2 font-bold"><AlertTriangle size={18} className="text-gold" /> {t('alerts')}</h2>
            <div className="mt-3 space-y-2">
              {!data && <><Skeleton className="h-16" /><Skeleton className="h-16" /></>}
              {data?.alerts?.length === 0 && (
                <div className="flex items-center gap-2 rounded-2xl bg-brand-soft px-3 py-3 text-sm text-brand-strong"><Info size={16} /> {t('noAlerts')}</div>
              )}
              {data?.alerts?.map((a) => {
                const Icon = ALERT_ICON[a.kind] || Info
                return (
                  <div key={a.kind + a.date} className={`rounded-2xl border px-3 py-2.5 ${ALERT_STYLE[a.level] || ALERT_STYLE.info}`}>
                    <div className="flex items-center gap-2 text-sm font-bold"><Icon size={15} /> {a.title}
                      <span className="ml-auto text-xs font-medium opacity-75">{new Date(a.date).toLocaleDateString(undefined, { weekday: 'short' })}</span></div>
                    <p className="mt-0.5 text-sm text-ink/80">{a.message}</p>
                  </div>
                )
              })}
            </div>
          </motion.div>

          <motion.div {...rise(9)} className={`${soft} p-5`}>
            <h2 className="flex items-center gap-2 font-bold"><IndianRupee size={18} className="text-brand" /> {t('mandi')}</h2>
            <div className="mt-3 space-y-2">
              {!data && <><Skeleton className="h-14" /><Skeleton className="h-14" /></>}
              {data && !data.mandi?.length && <p className="text-sm text-muted">Add your crops in My Farm to track their prices.</p>}
              {data?.mandi?.map((m) => (
                <button key={m.commodity} onClick={() => startChat({ prompt: `What is today's mandi price of ${m.commodity} near me? Should I sell now or wait?` })}
                  className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 text-left transition hover:bg-surface-3">
                  <span className="flex-1"><b>{m.commodity}</b>
                    <span className="block text-xs text-muted">{m.markets?.[0] ? `${m.markets[0].market}, ${m.markets[0].state}` : 'Tap to ask for live prices'}</span></span>
                  {m.modal ? <span className="text-right font-bold">₹{m.modal.toLocaleString('en-IN')}<span className="block text-[11px] font-normal text-muted">/quintal</span></span>
                    : <ArrowRight size={16} className="text-muted" />}
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div {...rise(10)} className={`${soft} p-5`}>
            <h2 className="flex items-center gap-2 font-bold"><MessageSquare size={18} className="text-brand" /> {t('recentChats')}</h2>
            <div className="mt-3 space-y-1">
              {(data?.recent_threads || []).map((th) => (
                <Link key={th.id} to={`/app/chat/${th.id}`} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-surface-2">
                  <MessageSquare size={14} className="text-muted" /><span className="flex-1 truncate">{th.title}</span>
                </Link>
              ))}
              {data && !data.recent_threads?.length && <p className="text-sm text-muted">No questions yet. Ask one above.</p>}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
