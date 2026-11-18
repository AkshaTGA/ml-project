import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@clerk/react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight, AudioLines, Brain, Check, CloudSun, IndianRupee, Leaf, MessageCircleQuestion, Mic, Sparkles,
  Sprout, Stethoscope, PawPrint,
} from 'lucide-react'
import { Logo } from '../components/common'
import { LANGUAGES } from '../lib/i18n'

const WORDS = ['farmer', 'किसान', 'शेतकरी', 'ਕਿਸਾਨ', 'விவசாயி', 'రైతు', 'herder', 'ಕೃಷಿಕ', 'কৃষক']

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
}

function RotatingWord() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % WORDS.length), 1800)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="relative inline-grid h-[1.15em] overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout">
        <motion.span key={WORDS[i]} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="bg-gradient-to-r from-brand via-[#5aa83c] to-gold bg-clip-text text-transparent">
          {WORDS[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

const DEMO_STEPS = [
  { icon: Brain, label: 'Recalled 3 memories', detail: 'Wheat · 5 acres · Nashik' },
  { icon: Leaf, label: 'Leaf doctor', detail: 'Yellow rust · 87% confident' },
  { icon: CloudSun, label: 'Checked weather', detail: 'Rain likely Thursday' },
]
const DEMO_ANSWER = 'यह **पीला रतुआ (Yellow rust)** है। गुरुवार को बारिश है, इसलिए **कल सुबह** प्रोपिकोनाज़ोल 25 EC (200 ml/एकड़) का छिड़काव करें…'

function AgentDemo({ compact = false }) {
  const [stage, setStage] = useState(0) // 0 user, 1..3 steps, 4 answer
  const [typed, setTyped] = useState(0)

  useEffect(() => {
    if (stage < 4) {
      const id = setTimeout(() => setStage((s) => s + 1), stage === 0 ? 900 : 1100)
      return () => clearTimeout(id)
    }
    if (typed < DEMO_ANSWER.length) {
      const id = setTimeout(() => setTyped((n) => n + 3), 28)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => { setStage(0); setTyped(0) }, 3500)
    return () => clearTimeout(id)
  }, [stage, typed])

  const answer = DEMO_ANSWER.slice(0, typed).split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))

  return (
    <div className={`relative rounded-[28px] border border-line bg-surface/90 p-5 shadow-2xl shadow-brand/10 backdrop-blur ${compact ? '' : 'sm:p-6'}`}>
      <div className="mb-4 flex items-center gap-2 text-xs text-muted">
        <span className="size-2.5 rounded-full bg-danger/70" /><span className="size-2.5 rounded-full bg-gold/70" /><span className="size-2.5 rounded-full bg-brand/70" />
        <span className="ml-2">AgriAssist · live agent</span>
      </div>
      <div className="ml-auto flex w-fit max-w-[85%] items-end gap-2">
        <div className="rounded-2xl rounded-br-sm bg-brand-soft px-4 py-2.5 text-sm">मेरी गेहूं की पत्तियों पर पीले धब्बे हैं 🌾</div>
      </div>
      <div className="ml-auto mt-2 h-20 w-28 rounded-xl bg-[radial-gradient(circle_at_30%_40%,#e8c547_0_8%,transparent_9%),radial-gradient(circle_at_60%_60%,#e8c547_0_6%,transparent_7%),radial-gradient(circle_at_75%_30%,#d9b13b_0_5%,transparent_6%),linear-gradient(135deg,#4f8f2f,#6aa83c)]" />
      <div className="mt-4 flex gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white"><Sprout size={16} /></div>
        <div className="min-w-0 flex-1 space-y-2">
          {DEMO_STEPS.map((step, i) => {
            const state = stage > i + 1 ? 'done' : stage === i + 1 ? 'active' : 'hidden'
            if (state === 'hidden') return null
            const Icon = step.icon
            return (
              <motion.div key={step.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-bg/60 px-3 py-2 text-sm">
                <span className={`grid size-6 place-items-center rounded-lg ${state === 'done' ? 'bg-brand-soft text-brand' : 'bg-gold-soft text-gold'}`}>
                  {state === 'done' ? <Check size={14} /> : <Icon size={14} className="animate-pulse" />}
                </span>
                <span className={`font-medium ${state === 'active' ? 'text-shimmer' : ''}`}>{step.label}</span>
                <span className="ml-auto truncate text-xs text-muted">{step.detail}</span>
              </motion.div>
            )
          })}
          {stage >= 4 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-1 text-sm leading-relaxed">
              {answer}<span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand align-middle" />
            </motion.p>
          )}
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { icon: Sprout, title: 'Pasture biomass AI', text: 'A shared ResNet reads the pasture photo and the XGBoost model you pick estimates clover, dead, green, total, or green dry matter. Grad-CAM shows what the network used.', tone: 'brand', big: true },
  { icon: Mic, title: 'Talk in your language', text: 'Speak Hindi, Marathi, Tamil or 19 more languages. Hands-free voice mode answers out loud.', tone: 'gold' },
  { icon: Stethoscope, title: 'Leaf doctor', text: 'Snap a leaf. Get the disease, urgency, and organic or chemical treatment.', tone: 'danger' },
  { icon: IndianRupee, title: 'Mandi prices & weather', text: 'Live market rates and 7-day forecasts, turned into sow, spray and sell decisions.', tone: 'sky' },
  { icon: Brain, title: 'Memory that grows', text: 'It remembers your fields, animals and past problems across every chat. You see and control everything it stores.', tone: 'brand' },
  { icon: PawPrint, title: 'Livestock care', text: 'Triage sick animals, plan feed and vaccination for cows, buffaloes, goats and sheep.', tone: 'earth' },
]
const TONES = {
  brand: 'bg-brand-soft text-brand', gold: 'bg-gold-soft text-gold', danger: 'bg-danger-soft text-danger',
  sky: 'bg-sky-soft text-sky', earth: 'bg-gold-soft text-earth',
}

function BiomassVisual() {
  const bars = [['Green', 72, 'bg-brand'], ['Clover', 24, 'bg-[#8bc34a]'], ['Dead', 31, 'bg-earth'], ['Total', 100, 'bg-brand-strong']]
  return (
    <div className="mt-6 space-y-2.5">
      {bars.map(([label, value, color], i) => (
        <div key={label} className="flex items-center gap-3 text-xs">
          <span className="w-12 text-muted">{label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} whileInView={{ width: `${value}%` }}
              viewport={{ once: true }} transition={{ duration: 1, delay: 0.2 + i * 0.12, ease: 'easeOut' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Waveform() {
  return (
    <div className="mt-5 flex h-10 items-center gap-1">
      {Array.from({ length: 28 }, (_, i) => (
        <motion.span key={i} className="w-1 rounded-full bg-gold/80" animate={{ height: [6, 10 + ((i * 7) % 26), 6] }}
          transition={{ duration: 1 + (i % 5) * 0.15, repeat: Infinity, delay: i * 0.04 }} />
      ))}
    </div>
  )
}

export default function Landing() {
  const { isSignedIn } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const cta = isSignedIn
    ? { to: '/app', label: 'Open dashboard' }
    : { to: '/sign-up', label: 'Get started free' }

  return (
    <div className="min-h-full overflow-x-hidden">
      {/* Nav */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all ${scrolled ? 'border-b border-line bg-bg/80 backdrop-blur-xl' : ''}`}>
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/"><Logo /></Link>
          <div className="ml-6 hidden gap-6 text-sm text-muted md:flex">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#languages" className="hover:text-ink">Languages</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!isSignedIn && <Link to="/sign-in" className="hidden rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-2 sm:block">Sign in</Link>}
            <Link to={cta.to} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.03] hover:bg-brand-strong">{cta.label}</Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative px-4 pt-28 pb-20 sm:px-6 sm:pt-36">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[600px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--c-brand-soft),transparent)] opacity-90" />
          <div className="absolute right-[8%] top-40 size-72 rounded-full bg-gold/15 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(var(--c-border)_1px,transparent_1px),linear-gradient(90deg,var(--c-border)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <motion.div {...fadeUp} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs font-semibold text-muted backdrop-blur">
              <Sparkles size={14} className="text-gold" /> Agentic AI for Indian agriculture
            </motion.div>
            <motion.h1 {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 }}
              className="mt-5 font-display text-5xl leading-[1.05] font-bold tracking-tight sm:text-6xl lg:text-7xl">
              The AI expert<br />every <RotatingWord /><br />deserves.
            </motion.h1>
            <motion.p {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="mt-6 max-w-xl text-lg text-muted">
              Ask by voice in your own language. AgriAssist looks at your photos, checks weather and mandi prices,
              runs our ML models, and remembers your farm, so every answer fits <em>your</em> fields and animals.
            </motion.p>
            <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.15 }} className="mt-8 flex flex-wrap gap-3">
              <Link to={cta.to} className="group inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-strong">
                {cta.label} <ArrowRight size={18} className="transition group-hover:translate-x-1" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-6 py-3.5 font-semibold transition hover:border-brand">
                <AudioLines size={18} className="text-brand" /> See an example
              </a>
            </motion.div>
            <motion.dl {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }} className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              {[['22', 'languages by voice'], ['12', 'agent tools'], ['24/7', 'farm memory']].map(([n, l]) => (
                <div key={l}><dt className="font-display text-3xl font-bold">{n}</dt><dd className="text-sm text-muted">{l}</dd></div>
              ))}
            </motion.dl>
          </div>
          <motion.div initial={{ opacity: 0, y: 40, rotate: 1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }} className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-brand/20 via-transparent to-gold/20 blur-2xl" />
            <AgentDemo />
            <motion.div className="absolute -bottom-6 -left-6 hidden items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-xl sm:flex"
              animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity }}>
              <Brain size={18} className="text-brand" /> Remembered: <b>5 acres wheat, Nashik</b>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Language marquee */}
      <section id="languages" className="border-y border-line bg-surface/60 py-6">
        <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-3">
            {[...LANGUAGES, ...LANGUAGES, ...LANGUAGES, ...LANGUAGES].map((l, i) => (
              <span key={i} className="whitespace-nowrap rounded-full border border-line bg-surface px-4 py-2 text-sm">
                <b className="font-semibold">{l.native}</b> <span className="text-muted">· {l.name}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-sm font-bold tracking-widest text-brand uppercase">Everything in one assistant</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">From soil to sale, it has your back.</h2>
          </motion.div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <motion.div key={f.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.06 }}
                  whileHover={{ y: -4 }}
                  className={`group rounded-3xl border border-line bg-surface p-6 transition-shadow hover:shadow-xl hover:shadow-brand/5 ${f.big ? 'md:row-span-2' : ''}`}>
                  <div className={`grid size-11 place-items-center rounded-2xl ${TONES[f.tone]}`}><Icon size={22} /></div>
                  <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                  <p className="mt-1.5 text-muted">{f.text}</p>
                  {f.big && <BiomassVisual />}
                  {f.title.startsWith('Talk') && <Waveform />}
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* How it works / transparency */}
      <section id="how" className="relative px-4 py-24 sm:px-6">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-brand-soft/40 to-transparent" />
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <p className="text-sm font-bold tracking-widest text-brand uppercase">Transparent by design</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Watch it think. Trust what it says.</h2>
            <p className="mt-4 text-lg text-muted">Every answer shows its work: which memories it used, which models it ran, what the weather said. No black box.</p>
            <ol className="mt-8 space-y-5">
              {[
                ['Tell it about your farm', 'A 1-minute setup: language, location, crops and animals.'],
                ['Ask anything, any way', 'Type, talk, or snap a photo of a leaf, pasture or soil report.'],
                ['Get advice that remembers', 'It learns from every chat. You can see, edit or erase any memory.'],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink font-bold text-bg">{i + 1}</span>
                  <div><div className="font-bold">{title}</div><div className="text-muted">{text}</div></div>
                </li>
              ))}
            </ol>
          </motion.div>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}><AgentDemo compact /></motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <motion.div {...fadeUp} className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-gradient-to-br from-[#1f5f24] via-[#2f7d32] to-[#5e8f2c] px-6 py-16 text-center text-white sm:px-16">
          <div className="absolute -right-20 -top-20 size-80 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-24 -left-10 size-80 rounded-full bg-[#f2c14e]/25 blur-3xl" />
          <MessageCircleQuestion className="relative mx-auto" size={40} />
          <h2 className="relative mt-4 font-display text-4xl font-bold sm:text-5xl">Your fields are talking. Start listening.</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/85">Free to use. Works on any phone browser. Speak in the language you think in.</p>
          <Link to={cta.to} className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-bold text-[#1f5f24] transition hover:scale-[1.03]">
            {cta.label} <ArrowRight size={18} />
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-line px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted sm:flex-row">
          <Logo size={26} />
          <p>An ML course project · Pasture biomass estimation + agentic AI for agriculture</p>
        </div>
      </footer>
    </div>
  )
}
