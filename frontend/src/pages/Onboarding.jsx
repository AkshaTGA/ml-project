import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useUser } from '@clerk/react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Bird, Check, GraduationCap, LocateFixed, MapPin, Minus, PawPrint, Plus, Sprout, Store, Wheat } from 'lucide-react'
import { Logo, Spinner, VoiceField } from '../components/common'
import { useApi } from '../lib/api'
import { useAppData } from '../lib/appData'
import { LANGUAGES, useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'

const ROLES = [
  { id: 'farmer', icon: Wheat, label: 'roleFarmer', text: 'roleFarmerHint' },
  { id: 'herder', icon: PawPrint, label: 'roleHerder', text: 'roleHerderHint' },
  { id: 'mixed', icon: Sprout, label: 'roleMixed', text: 'roleMixedHint' },
  { id: 'agribusiness', icon: Store, label: 'roleBusiness', text: 'roleBusinessHint' },
  { id: 'student', icon: GraduationCap, label: 'roleStudent', text: 'roleStudentHint' },
]
const CROPS = [
  ['Wheat', Wheat, 'cropWheat'], ['Rice', Sprout, 'cropRice'], ['Maize', Sprout, 'cropMaize'], ['Cotton', Sprout, 'cropCotton'], ['Sugarcane', Sprout, 'cropSugarcane'], ['Soybean', Sprout, 'cropSoybean'],
  ['Mustard', Sprout, 'cropMustard'], ['Chickpea', Sprout, 'cropChickpea'], ['Onion', Sprout, 'cropOnion'], ['Tomato', Sprout, 'cropTomato'], ['Potato', Sprout, 'cropPotato'], ['Banana', Sprout, 'cropBanana'],
  ['Mango', Sprout, 'cropMango'], ['Vegetables', Sprout, 'cropVegetables'], ['Millets', Sprout, 'cropMillets'], ['Groundnut', Sprout, 'cropGroundnut'], ['Pasture / fodder', Sprout, 'cropPasture'], ['Fruits', Sprout, 'cropFruits'],
]
const ANIMALS = [['cows', PawPrint, 'animalCows'], ['buffaloes', PawPrint, 'animalBuffaloes'], ['goats', PawPrint, 'animalGoats'], ['sheep', PawPrint, 'animalSheep'], ['poultry', Bird, 'animalPoultry']]
const LAND_UNITS = [['acre', 'unitAcre'], ['bigha', 'unitBigha'], ['hectare', 'unitHectare']]
const IRRIGATION = [['Rainfed', 'irrRainfed'], ['Canal', 'irrCanal'], ['Borewell / tubewell', 'irrBorewell'], ['Drip', 'irrDrip'], ['Sprinkler', 'irrSprinkler'], ['Pond / tank', 'irrPond']]
const SOILS = [['Alluvial', 'soilAlluvial'], ['Black (cotton)', 'soilBlack'], ['Red', 'soilRed'], ['Laterite', 'soilLaterite'], ['Sandy', 'soilSandy'], ['Clay', 'soilClay'], ['Loamy', 'soilLoamy'], ["Don't know", 'soilUnknown']]
const GOALS = [['Increase yield', 'goalYield'], ['Reduce input costs', 'goalCost'], ['Better market prices', 'goalMarket'], ['Animal health', 'goalAnimal'], ['Organic farming', 'goalOrganic'], ['Save water', 'goalWater'], ['Pest & disease control', 'goalPest']]
const STEP_KEYS = ['stepLanguage', 'stepAbout', 'stepLocation', 'stepFarm', 'stepGoals']

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition ${active ? 'border-brand bg-brand text-white shadow-md shadow-brand/25' : 'border-line bg-surface hover:border-brand'}`}>
      {children}
    </button>
  )
}

function LocationSearch({ value, onPick }) {
  const { t } = useI18n()
  const [query, setQuery] = useState(value?.location_name || '')
  const [results, setResults] = useState([])
  const [locating, setLocating] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    if (query.trim().length < 2 || query === value?.location_name) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&name=${encodeURIComponent(query.trim())}`)
        setResults((await res.json()).results || [])
      } catch { setResults([]) }
    }, 250)
    return () => clearTimeout(timer.current)
  }, [query, value?.location_name])

  function pick(r) {
    const name = [...new Set([r.name, r.admin2, r.admin1].filter(Boolean))].join(', ')
    onPick({ location_name: name, lat: r.latitude, lon: r.longitude })
    setQuery(name)
    setResults([])
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      let name = `${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`
      try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`)
        const d = await res.json()
        name = [d.locality || d.city, d.principalSubdivision].filter(Boolean).join(', ') || name
      } catch { /* keep coordinates */ }
      onPick({ location_name: name, lat: coords.latitude, lon: coords.longitude })
      setQuery(name)
      setLocating(false)
    }, () => setLocating(false), { timeout: 10000 })
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <VoiceField value={query} onChange={setQuery} placeholder={t('placePh')} autoFocus />
        <AnimatePresence>
          {results.length > 0 && (
            <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => pick(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                    <MapPin size={16} className="text-brand" />
                    <span><b>{r.name}</b> <span className="text-sm text-muted">{[r.admin2, r.admin1, r.country].filter(Boolean).join(', ')}</span></span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
      <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-brand">
        {locating ? <Spinner size={16} /> : <LocateFixed size={16} className="text-brand" />} {t('useMyLocation')}
      </button>
      {value?.lat != null && (
        <div className="flex items-center gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand-strong">
          <Check size={16} /> {value.location_name} <span className="ml-auto text-xs opacity-70">{value.lat.toFixed(2)}, {value.lon.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}

export default function Onboarding() {
  const api = useApi()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useUser()
  const { lang, setLang, t } = useI18n()
  const { profile, onboarded, setProfile, setOnboarded } = useAppData()
  const [params] = useSearchParams()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [saving, setSaving] = useState(false)
  const [customCrop, setCustomCrop] = useState('')
  const [otherAnimal, setOtherAnimal] = useState('')
  const [form, setForm] = useState({
    language: lang, name: '', role: '', location_name: '', lat: null, lon: null,
    land_area: '', land_unit: 'acre', crops: [], livestock: {}, irrigation: '', soil: '', goals: '',
    ...Object.fromEntries(Object.entries(profile || {}).filter(([, v]) => v != null)),
  })
  const set = (patch) => setForm((f) => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) }))

  useEffect(() => {
    if (user?.firstName && !form.name) set({ name: user.firstName })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = useMemo(() => [
    !!form.language, !!form.name.trim() && !!form.role, true, true, true,
  ][step], [form, step])

  function go(delta) {
    setDir(delta)
    setStep((s) => Math.max(0, Math.min(STEP_KEYS.length - 1, s + delta)))
  }

  async function finish() {
    setSaving(true)
    try {
      const profile = await api.onboard({ ...form, land_area: form.land_area === '' ? null : Number(form.land_area) })
      setProfile(profile)
      setOnboarded(true)
      navigate('/app', { replace: true })
    } catch (err) {
      toast({ title: 'Could not save your profile', message: err.message })
      setSaving(false)
    }
  }

  function toggle(list, item) {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
  }

  // Already set up: go to the dashboard, unless the user chose "Redo farm setup" in Settings.
  if (profile === undefined) return null
  if (onboarded && !saving && params.get('redo') !== '1') return <Navigate to="/app" replace />

  const pages = [
    <div key="lang">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('onboardLangTitle')}</h1>
      <p className="mt-2 text-muted">{t('onboardLangHelp')}</p>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LANGUAGES.map((l) => (
          <button key={l.code} type="button" onClick={() => { set({ language: l.code }); if (l.ui) setLang(l.code) }}
            className={`relative rounded-2xl border-2 p-4 text-left transition ${form.language === l.code ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50'}`}>
            <div className="text-xl font-bold">{l.native}</div>
            <div className="text-sm text-muted">{l.name}</div>
            {form.language === l.code && <Check size={18} className="absolute right-3 top-3 text-brand" />}
          </button>
        ))}
      </div>
    </div>,

    <div key="about">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('onboardHi')}</h1>
      <p className="mt-2 text-muted">{t('onboardAbout')}</p>
      <label className="mt-8 block text-sm font-semibold">{t('onboardName')}</label>
      <VoiceField value={form.name} onChange={(name) => set({ name })} placeholder={t('onboardNamePh')} className="mt-2" />
      <label className="mt-6 block text-sm font-semibold">{t('onboardRole')}</label>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {ROLES.map((r) => {
          const Icon = r.icon
          return (
            <button key={r.id} type="button" onClick={() => set({ role: r.id })}
              className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition ${form.role === r.id ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50'}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand"><Icon size={18} /></span>
              <span><span className="block font-bold">{t(r.label)}</span><span className="text-sm text-muted">{t(r.text)}</span></span>
            </button>
          )
        })}
        <button type="button" onClick={() => set({ role: form.role && !ROLES.some((r) => r.id === form.role) ? form.role : 'other' })}
          className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition sm:col-span-2 ${form.role === 'other' || (form.role && !ROLES.some((r) => r.id === form.role)) ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50'}`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand"><Plus size={18} /></span>
          <span><span className="block font-bold">{t('other')}</span><span className="text-sm text-muted">{t('otherRoleHint')}</span></span>
        </button>
      </div>
      {(form.role === 'other' || (form.role && !ROLES.some((r) => r.id === form.role))) && (
        <input value={form.role === 'other' ? '' : form.role} onChange={(e) => set({ role: e.target.value.trim() || 'other' })}
          placeholder={t('otherRolePh')} className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-brand" />
      )}
    </div>,

    <div key="loc">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('onboardWhere')}</h1>
      <p className="mt-2 text-muted">{t('onboardWhereHelp')}</p>
      <div className="mt-8"><LocationSearch value={form} onPick={set} /></div>
    </div>,

    <div key="farm">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('onboardFarm')}</h1>
      <p className="mt-2 text-muted">{t('onboardSkip')}</p>
      <label className="mt-7 block text-sm font-semibold">{t('onboardLand')}</label>
      <div className="mt-2 flex gap-2">
        <input type="number" min="0" step="0.1" value={form.land_area} onChange={(e) => set({ land_area: e.target.value })} placeholder="5"
          className="w-32 rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-brand" />
        <div className="flex rounded-xl border border-line bg-surface p-1">
          {LAND_UNITS.map(([u, key]) => (
            <button key={u} type="button" onClick={() => set({ land_unit: u })}
              className={`rounded-lg px-3 text-sm font-medium ${form.land_unit === u ? 'bg-brand text-white' : 'text-muted'}`}>{t(key)}</button>
          ))}
          <button type="button" onClick={() => set({ land_unit: LAND_UNITS.some(([u]) => u === form.land_unit) ? 'other' : form.land_unit })}
            className={`rounded-lg px-3 text-sm font-medium ${form.land_unit && !LAND_UNITS.some(([u]) => u === form.land_unit) ? 'bg-brand text-white' : 'text-muted'}`}>{t('other')}</button>
        </div>
        {form.land_unit && !LAND_UNITS.some(([u]) => u === form.land_unit) && (
          <input value={form.land_unit === 'other' ? '' : form.land_unit} onChange={(e) => set({ land_unit: e.target.value.trim() || 'other' })}
            placeholder={t('otherDetail')} className="w-36 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand" />
        )}
      </div>
      <label className="mt-6 block text-sm font-semibold">{t('onboardCrops')}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {CROPS.map(([c, Icon, key]) => <Chip key={c} active={form.crops.includes(c)} onClick={() => set((f) => ({ crops: toggle(f.crops, c) }))}><Icon size={14} /> {t(key)}</Chip>)}
        {form.crops.filter((c) => !CROPS.some(([x]) => x === c)).map((c) => (
          <Chip key={c} active onClick={() => set((f) => ({ crops: toggle(f.crops, c) }))}>{c}</Chip>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); if (customCrop.trim()) { set({ crops: [...form.crops, customCrop.trim()] }); setCustomCrop('') } }}>
          <input value={customCrop} onChange={(e) => setCustomCrop(e.target.value)} placeholder={t('otherCrop')}
            className="w-36 rounded-full border border-dashed border-line bg-transparent px-3.5 py-2 text-sm outline-none focus:border-brand" />
        </form>
      </div>
      <label className="mt-6 block text-sm font-semibold">{t('onboardAnimals')}</label>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {ANIMALS.map(([a, Icon, key]) => {
          const n = form.livestock[a] || 0
          const setN = (v) => set((f) => ({ livestock: { ...f.livestock, [a]: Math.max(0, v) } }))
          return (
            <div key={a} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${n ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`}>
              <Icon size={18} className="text-brand" /><span className="flex-1 text-sm font-medium">{t(key)}</span>
              <button type="button" onClick={() => setN(n - 1)} className="grid size-7 place-items-center rounded-full bg-surface-2"><Minus size={14} /></button>
              <input value={n} onChange={(ev) => setN(parseInt(ev.target.value || '0', 10) || 0)} className="w-8 bg-transparent text-center font-bold outline-none" />
              <button type="button" onClick={() => setN(n + 1)} className="grid size-7 place-items-center rounded-full bg-brand text-white"><Plus size={14} /></button>
            </div>
          )
        })}
        {Object.keys(form.livestock).filter((name) => !ANIMALS.some(([id]) => id === name)).map((name) => {
          const n = form.livestock[name] || 0
          const setN = (v) => set((f) => ({ livestock: { ...f.livestock, [name]: Math.max(0, v) } }))
          return (
            <div key={name} className="flex items-center gap-2 rounded-2xl border border-brand bg-brand-soft px-3 py-2">
              <PawPrint size={18} className="text-brand" /><span className="flex-1 text-sm font-medium">{name}</span>
              <button type="button" onClick={() => setN(n - 1)} className="grid size-7 place-items-center rounded-full bg-surface-2"><Minus size={14} /></button>
              <input value={n} onChange={(ev) => setN(parseInt(ev.target.value || '0', 10) || 0)} className="w-8 bg-transparent text-center font-bold outline-none" />
              <button type="button" onClick={() => setN(n + 1)} className="grid size-7 place-items-center rounded-full bg-brand text-white"><Plus size={14} /></button>
            </div>
          )
        })}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const name = otherAnimal.trim(); if (!name) return; set((f) => ({ livestock: { ...f.livestock, [name]: f.livestock[name] || 1 } })); setOtherAnimal('') }}>
        <input value={otherAnimal} onChange={(e) => setOtherAnimal(e.target.value)} placeholder={t('otherAnimal')}
          className="w-full rounded-xl border border-dashed border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand" />
      </form>
      <label className="mt-6 block text-sm font-semibold">{t('onboardIrrigation')}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {IRRIGATION.map(([x, key]) => <Chip key={x} active={form.irrigation === x} onClick={() => set({ irrigation: form.irrigation === x ? '' : x })}>{t(key)}</Chip>)}
        <Chip active={!!form.irrigation && !IRRIGATION.some(([x]) => x === form.irrigation)} onClick={() => set({ irrigation: IRRIGATION.some(([x]) => x === form.irrigation) ? 'other' : form.irrigation })}>{t('other')}</Chip>
      </div>
      {!!form.irrigation && !IRRIGATION.some(([x]) => x === form.irrigation) && (
        <input value={form.irrigation === 'other' ? '' : form.irrigation} onChange={(e) => set({ irrigation: e.target.value.trim() || 'other' })}
          placeholder={t('otherDetail')} className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand" />
      )}
      <label className="mt-6 block text-sm font-semibold">{t('onboardSoil')}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {SOILS.map(([x, key]) => <Chip key={x} active={form.soil === x} onClick={() => set({ soil: form.soil === x ? '' : x })}>{t(key)}</Chip>)}
        <Chip active={!!form.soil && !SOILS.some(([x]) => x === form.soil)} onClick={() => set({ soil: SOILS.some(([x]) => x === form.soil) ? 'other' : form.soil })}>{t('other')}</Chip>
      </div>
      {!!form.soil && !SOILS.some(([x]) => x === form.soil) && (
        <input value={form.soil === 'other' ? '' : form.soil} onChange={(e) => set({ soil: e.target.value.trim() || 'other' })}
          placeholder={t('otherDetail')} className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand" />
      )}
    </div>,

    <div key="goals">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('onboardGoalsTitle')}</h1>
      <p className="mt-2 text-muted">{t('onboardGoalsHelp')}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {GOALS.map(([g, key]) => (
          <Chip key={g} active={form.goals.includes(g)} onClick={() => set({ goals: form.goals.includes(g) ? form.goals.replace(g, '').replace(/^[,\s]+|[,\s]+$/g, '').replace(/,\s*,/g, ',') : [form.goals, g].filter(Boolean).join(', ') })}>{t(key)}</Chip>
        ))}
      </div>
      <VoiceField as="textarea" rows={5} value={form.goals} onChange={(goals) => set({ goals })} className="mt-4"
        placeholder={t('onboardGoalsPh')} />
    </div>,
  ]

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="pasture-panel relative overflow-hidden p-6 text-white lg:w-[380px] lg:p-10">
        <div className="absolute -bottom-24 -right-24 size-80 rounded-full bg-[var(--c-straw)]/25 blur-3xl" />
        <Logo tone="light" className="relative" />
        <ol className="relative mt-8 hidden space-y-1 lg:block">
          {STEP_KEYS.map((s, i) => (
            <li key={s} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${i === step ? 'bg-white/15' : ''}`}>
              <span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${i < step ? 'bg-white text-brand' : i === step ? 'bg-white/90 text-brand' : 'bg-white/15'}`}>
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              <span className={i === step ? 'font-semibold' : 'text-white/75'}>{t(s)}</span>
            </li>
          ))}
        </ol>
        <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-white/20 lg:hidden">
          <motion.div className="h-full bg-white" animate={{ width: `${((step + 1) / STEP_KEYS.length) * 100}%` }} />
        </div>
        <p className="relative mt-auto hidden pt-16 text-sm text-white/80 lg:block">
          {t('onboardAside')}
        </p>
      </aside>

      <main className="flex flex-1 flex-col px-4 py-8 sm:px-10 lg:py-14">
        <div className="mx-auto w-full max-w-2xl flex-1">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir}
              initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
              {pages[step]}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mx-auto mt-10 flex w-full max-w-2xl items-center gap-3">
          {step > 0 && (
            <button type="button" onClick={() => go(-1)} className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold hover:bg-surface-2">
              <ArrowLeft size={18} /> {t('back')}
            </button>
          )}
          <span className="ml-auto text-sm text-muted">{step + 1} / {STEP_KEYS.length}</span>
          {step < STEP_KEYS.length - 1 ? (
            <button type="button" disabled={!canNext} onClick={() => go(1)}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-strong disabled:opacity-40">
              {t('continue')} <ArrowRight size={18} />
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={finish}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-strong">
              {saving ? <Spinner /> : <Check size={18} />} {t('startUsing')}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
