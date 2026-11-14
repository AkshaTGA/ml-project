import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Brain, Check, History, Languages, Pencil, Search, Sparkles, Sprout, Trash2, UserCog, Volume2, X } from 'lucide-react'
import { Spinner, VoiceField } from '../components/common'
import { useApi } from '../lib/api'
import { useAppData } from '../lib/appData'
import { LANGUAGES, useI18n } from '../lib/i18n'
import { useVerboseSteps } from '../lib/prefs'
import { useToast } from '../lib/toast'
import { AudioQueue } from '../lib/voice'
import { VOICES, voiceId, voiceSettings } from '../lib/voices'

const TABS = [
  ['profile', UserCog, 'profile'], ['memory', Brain, 'memory'], ['style', Sparkles, 'style'], ['language', Languages, 'languageVoice'],
]
const PRESETS = [
  'Keep answers short and to the point.',
  "Explain simply, like I'm new to farming.",
  'Use local units like bigha and quintal.',
  'Always suggest an organic option first.',
  'Reply in Hinglish (Hindi in English letters).',
  'Give approximate costs in rupees.',
  'Use step-by-step lists.',
]
const PROFILE_FIELDS = [
  ['name', 'Name'], ['role', 'Role'], ['location_name', 'Location'], ['land_area', 'Land area'], ['land_unit', 'Land unit'],
  ['crops', 'Crops'], ['livestock', 'Livestock'], ['irrigation', 'Irrigation'], ['soil', 'Soil'], ['goals', 'Goals & challenges'],
]

const card = 'rounded-3xl border border-line bg-surface p-5 shadow-sm'

function display(field, value) {
  if (value == null || value === '') return null
  if (field === 'crops') return value.length ? value.join(', ') : null
  if (field === 'livestock') {
    const parts = Object.entries(value || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`)
    return parts.length ? parts.join(', ') : null
  }
  return String(value)
}

function parse(field, text) {
  if (field === 'crops') return text.split(',').map((s) => s.trim()).filter(Boolean)
  if (field === 'land_area') return text === '' ? null : Number(text)
  if (field === 'livestock') {
    return Object.fromEntries(text.split(',').map((p) => p.trim().match(/^(\d+)\s+(.+)$/)).filter(Boolean).map((m) => [m[2].trim(), Number(m[1])]))
  }
  return text
}

/** One editable memory row: shows text, with inline edit (with voice typing) and delete. */
function MemoryRow({ label, text, meta, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(text || '')
  const [busy, setBusy] = useState(false)
  useEffect(() => setValue(text || ''), [text])

  async function save() {
    setBusy(true)
    await onSave(value)
    setBusy(false)
    setEditing(false)
  }

  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}
      className="group flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        {label && <div className="text-xs font-semibold text-muted">{label}</div>}
        {editing ? (
          <div className="mt-1 flex items-start gap-2">
            <VoiceField as="textarea" rows={2} value={value} onChange={setValue} className="flex-1" autoFocus />
            <button onClick={save} className="mt-1 grid size-9 place-items-center rounded-xl bg-brand text-white">{busy ? <Spinner size={15} /> : <Check size={16} />}</button>
            <button onClick={() => { setEditing(false); setValue(text || '') }} className="mt-1 grid size-9 place-items-center rounded-xl bg-surface-3"><X size={16} /></button>
          </div>
        ) : (
          <div className={`text-sm ${text ? '' : 'italic text-muted'}`}>{text || 'Not set'}</div>
        )}
        {meta && !editing && <div className="mt-0.5 text-[11px] text-muted">{meta}</div>}
      </div>
      {!editing && (
        <div className="flex gap-1 opacity-60 transition group-hover:opacity-100">
          <button onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink" title="Edit"><Pencil size={15} /></button>
          {text && <button onClick={onDelete} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-danger" title="Remove"><Trash2 size={15} /></button>}
        </div>
      )}
    </motion.li>
  )
}

function MemoryTab() {
  const api = useApi()
  const toast = useToast()
  const { setProfile } = useAppData()
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')

  const load = () => api.memory().then(setData).catch((e) => toast({ title: 'Could not load memory', message: e.message }))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="grid h-40 place-items-center"><Spinner /></div>
  const facts = data.facts.filter((f) => f.text.toLowerCase().includes(query.toLowerCase()))

  async function editProfile(field, text) {
    const profile = await api.editMemory('profile', field, parse(field, text))
    setProfile(profile)
    setData((d) => ({ ...d, profile }))
  }
  async function removeProfile(field) {
    await api.forget('profile', field)
    load()
  }
  async function clearAll() {
    if (!confirm('Forget everything AgriAssist learned from your chats? Your farm profile and chat history stay.')) return
    const r = await api.clearMemory()
    toast({ title: 'Memory cleared', message: `${r.facts_deleted} facts and ${r.summaries_cleared} summaries removed.` })
    load()
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">This is everything AgriAssist uses to personalise answers. Edit anything that is wrong, or remove it. Changes apply to your next message.</p>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-bold"><Sprout size={18} className="text-brand" /> Farm profile <span className="text-xs font-normal text-muted">· long-term</span></h3>
        <ul className="mt-2">
          {PROFILE_FIELDS.map(([field, label]) => (
            <MemoryRow key={field} label={label} text={display(field, data.profile?.[field])}
              onSave={(t) => editProfile(field, t)} onDelete={() => removeProfile(field)} />
          ))}
        </ul>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex items-center gap-2 font-bold"><Brain size={18} className="text-brand" /> Learned facts <span className="text-xs font-normal text-muted">· long-term · {data.facts.length}</span></h3>
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories"
              className="w-48 rounded-xl border border-line bg-bg py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand" />
          </div>
        </div>
        <ul className="mt-2">
          <AnimatePresence initial={false}>
            {facts.map((f) => (
              <MemoryRow key={f.id} text={f.text}
                meta={`${f.category === 'onboarding' ? 'From setup' : 'Learned in chat'} · ${new Date(f.edited_at || f.created_at).toLocaleDateString()}${f.edited_at ? ' · edited' : ''}`}
                onSave={async (t) => { const m = await api.editMemory('fact', f.id, t); setData((d) => ({ ...d, facts: d.facts.map((x) => (x.id === f.id ? { ...x, ...m } : x)) })) }}
                onDelete={async () => { await api.forget('fact', f.id); setData((d) => ({ ...d, facts: d.facts.filter((x) => x.id !== f.id) })) }} />
            ))}
          </AnimatePresence>
          {facts.length === 0 && <li className="px-3 py-4 text-sm text-muted">{query ? 'No matching memories.' : 'Nothing learned yet. Chat with AgriAssist and it will remember what matters.'}</li>}
        </ul>
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-bold"><History size={18} className="text-brand" /> Conversation summaries <span className="text-xs font-normal text-muted">· short-term</span></h3>
        <p className="mt-1 text-xs text-muted">Recent summaries help AgriAssist continue where you left off in a new chat.</p>
        <ul className="mt-2">
          <AnimatePresence initial={false}>
            {data.threads.map((th) => (
              <MemoryRow key={th.id} label={th.title} text={th.summary} meta={new Date(th.updated_at).toLocaleString()}
                onSave={async (t) => { await api.editMemory('thread', th.id, t); setData((d) => ({ ...d, threads: d.threads.map((x) => (x.id === th.id ? { ...x, summary: t } : x)) })) }}
                onDelete={async () => { await api.forget('thread', th.id); setData((d) => ({ ...d, threads: d.threads.filter((x) => x.id !== th.id) })) }} />
            ))}
          </AnimatePresence>
          {data.threads.length === 0 && <li className="px-3 py-4 text-sm text-muted">No summaries yet.</li>}
        </ul>
      </section>

      <button onClick={clearAll} className="flex items-center gap-2 rounded-2xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft">
        <Trash2 size={16} /> Clear all learned memories
      </button>
    </div>
  )
}

function DetailCard() {
  const { t } = useI18n()
  const [verbose, setVerbose] = useVerboseSteps()
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold">{t('showWork')}</h3>
          <p className="mt-1 max-w-xl text-sm text-muted">{t('showWorkHelp')}</p>
          <p className="mt-3 text-sm font-semibold text-brand-strong">{verbose ? t('detailed') : t('simple')}</p>
        </div>
        <button type="button" role="switch" aria-checked={verbose} onClick={() => setVerbose(!verbose)}
          className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition ${verbose ? 'bg-brand' : 'bg-surface-3'}`}>
          <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition ${verbose ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
    </div>
  )
}

function StyleTab() {
  const api = useApi()
  const toast = useToast()
  const { t } = useI18n()
  const { profile, setProfile } = useAppData()
  const [text, setText] = useState(profile?.custom_instructions || '')
  const [saving, setSaving] = useState(false)
  const dirty = text !== (profile?.custom_instructions || '')

  async function save() {
    setSaving(true)
    try {
      setProfile(await api.updateProfile({ custom_instructions: text }))
      toast({ icon: <Check size={16} />, title: t('saved'), message: 'AgriAssist will follow your style from the next message.' })
    } catch (err) {
      toast({ title: 'Could not save', message: err.message })
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <DetailCard />
      <div className={card}>
        <h3 className="font-bold">How should AgriAssist talk to you?</h3>
        <p className="mt-1 text-sm text-muted">Your instructions are added on top of AgriAssist's own rules. They change tone, language and format, but never switch off safety advice or tool use.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setText((v) => (v.includes(p) ? v : [v.trim(), p].filter(Boolean).join('\n')))}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${text.includes(p) ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line hover:border-brand'}`}>
              + {p}
            </button>
          ))}
        </div>
        <VoiceField as="textarea" rows={7} value={text} onChange={(v) => setText(v.slice(0, 1500))} className="mt-4"
          placeholder="e.g. Talk to me like a friendly neighbour. I prefer organic methods. Always tell me the cost per acre." />
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>{text.length} / 1500</span>
          <button onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? <Spinner size={15} /> : <Check size={15} />} {t('save')}
          </button>
        </div>
      </div>
      <div className="rounded-3xl border border-dashed border-line p-5 text-sm">
        <div className="font-semibold">How it's layered</div>
        <ol className="mt-2 space-y-1 text-muted">
          <li>1. AgriAssist's safety and tool rules (fixed)</li>
          <li className="font-semibold text-brand-strong">2. Your style instructions (above)</li>
          <li>3. Your farm profile, memories and recent chats</li>
          <li>4. Your message</li>
        </ol>
      </div>
    </div>
  )
}

function ProfileTab() {
  return (
    <div className={card}>
      <p className="text-sm text-muted">Your farm profile is part of AgriAssist's memory. Edit any field below, or redo the full setup.</p>
      <Link to="/onboarding?redo=1" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-strong">
        <Sprout size={16} /> Redo farm setup
      </Link>
      <div className="mt-4"><MemoryTabProfileOnly /></div>
    </div>
  )
}

function MemoryTabProfileOnly() {
  const api = useApi()
  const { profile, setProfile } = useAppData()
  return (
    <ul>
      {PROFILE_FIELDS.map(([field, label]) => (
        <MemoryRow key={field} label={label} text={display(field, profile?.[field])}
          onSave={async (t) => setProfile(await api.editMemory('profile', field, parse(field, t)))}
          onDelete={async () => { await api.forget('profile', field); setProfile(await api.profile().then((r) => r.profile)) }} />
      ))}
    </ul>
  )
}

const VOICE_SAMPLE = {
  'en-IN': 'Namaste. I can read your farm advice in this voice.',
  'hi-IN': 'नमस्ते। मैं आपकी खेती की सलाह इस आवाज़ में पढ़ सकता हूँ।',
  'mr-IN': 'नमस्कार. मी तुमच्या शेतीचा सल्ला या आवाजात वाचू शकतो.',
  'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ। ਮੈਂ ਤੁਹਾਡੀ ਖੇਤੀ ਦੀ ਸਲਾਹ ਇਸ ਆਵਾਜ਼ ਵਿੱਚ ਪੜ੍ਹ ਸਕਦਾ ਹਾਂ।',
  'ta-IN': 'வணக்கம். உங்கள் பண்ணை ஆலோசனையை இந்தக் குரலில் படிக்க முடியும்.',
  'te-IN': 'నమస్కారం. మీ పొలం సలహాను ఈ గొంతులో చదవగలను.',
  'kn-IN': 'ನಮಸ್ಕಾರ. ನಿಮ್ಮ ಕೃಷಿ ಸಲಹೆಯನ್ನು ಈ ಧ್ವನಿಯಲ್ಲಿ ಓದಬಹುದು.',
  'ml-IN': 'നമസ്കാരം. നിങ്ങളുടെ കൃഷി ഉപദേശം ഈ ശബ്ദത്തിൽ വായിക്കാം.',
  'gu-IN': 'નમસ્તે. હું તમારી ખેતીની સલાહ આ અવાજમાં વાંચી શકું છું.',
  'bn-IN': 'নমস্কার। আমি আপনার চাষের পরামর্শ এই গলায় পড়তে পারি।',
  'od-IN': 'ନମସ୍କାର। ମୁଁ ଆପଣଙ୍କ ଚାଷ ପରାମର୍ଶ ଏହି ସ୍ୱରରେ ପଢ଼ିପାରିବି।',
}

function VoicePicker({ title, help, selected, onSelect, onPreview, previewing }) {
  const { t } = useI18n()
  return (
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="mt-1 text-sm text-muted">{help}</p>
        </div>
        <button type="button" onClick={onPreview} disabled={previewing}
          className="flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-strong disabled:opacity-50">
          {previewing ? <Spinner size={15} /> : <Volume2 size={15} />} {t('hearVoice')}
        </button>
      </div>
      {[['female', 'voiceWomen'], ['male', 'voiceMen']].map(([gender, label]) => (
        <div key={gender} className="mt-4">
          <div className="text-xs font-bold tracking-wide text-muted uppercase">{t(label)}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {VOICES.filter((v) => v.gender === gender).map((v) => (
              <button key={v.id} type="button" onClick={() => onSelect(v.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${selected === v.id ? 'border-brand bg-brand-soft font-semibold text-brand-strong' : 'border-line hover:border-brand'}`}>
                {v.name}{v.note ? <span className="ml-1 text-xs font-normal text-muted">{t(v.note)}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function LanguageTab() {
  const api = useApi()
  const toast = useToast()
  const { lang, setLang, t } = useI18n()
  const { profile, setProfile } = useAppData()
  const previewRef = useRef(null)
  const [previewing, setPreviewing] = useState(null)
  useEffect(() => () => previewRef.current?.stop(), [])

  async function setReplyLanguage(code) {
    setProfile(await api.updateProfile({ language: code }))
  }

  async function setSpeaker(key, id) {
    try {
      const next = { ...voiceSettings(profile), [key]: id }
      setProfile(await api.updateProfile({ voice_settings: next }))
    } catch (err) {
      toast({ title: 'Could not save voice', message: err.message })
    }
  }

  function preview(key) {
    previewRef.current?.stop()
    const speaker = voiceId(profile, key)
    const sample = VOICE_SAMPLE[profile?.language] || VOICE_SAMPLE['en-IN']
    setPreviewing(key)
    const queue = new AudioQueue({ onIdle: () => setPreviewing((current) => (current === key ? null : current)) })
    previewRef.current = queue
    queue.push(api.tts(sample, { preferred_language: profile?.language, speaker }).then((r) => r.audios).catch((err) => {
      toast({ title: 'Could not play this voice', message: err.message })
      setPreviewing(null)
      return []
    }))
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="font-bold">App language</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {LANGUAGES.filter((l) => l.ui).map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)}
              className={`rounded-2xl border-2 px-4 py-2 transition ${lang === l.code ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/50'}`}>
              <b>{l.native}</b> <span className="text-xs text-muted">{l.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={card}>
        <h3 className="font-bold">Reply & voice language</h3>
        <p className="mt-1 text-sm text-muted">AgriAssist replies in whatever language you write or speak. This is the default for voice and when it can't tell.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LANGUAGES.map((l) => (
            <button key={l.code} onClick={() => setReplyLanguage(l.code)}
              className={`rounded-2xl border-2 px-3 py-2 text-left transition ${profile?.language === l.code ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/50'}`}>
              <div className="font-bold">{l.native}</div><div className="text-xs text-muted">{l.name}</div>
            </button>
          ))}
        </div>
      </div>
      <VoicePicker title={t('voiceModeVoice')} help={t('voiceHelpMode')} selected={voiceId(profile, 'mode')}
        onSelect={(id) => setSpeaker('mode', id)} onPreview={() => preview('mode')} previewing={previewing === 'mode'} />
      <VoicePicker title={t('readAloudVoice')} help={t('voiceHelpRead')} selected={voiceId(profile, 'read')}
        onSelect={(id) => setSpeaker('read', id)} onPreview={() => preview('read')} previewing={previewing === 'read'} />
    </div>
  )
}

export default function Settings() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'profile'
  const panels = { profile: <ProfileTab />, memory: <MemoryTab />, style: <StyleTab />, language: <LanguageTab /> }

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-16 sm:px-8 sm:pt-10">
        <h1 className="font-display text-3xl font-bold tracking-tight text-brand-strong sm:text-4xl">
          {tab === 'profile' || tab === 'memory' ? t('myFarm') : t('settings')}
        </h1>
        <div className="no-scrollbar mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
          {TABS.map(([id, Icon, label]) => (
            <button key={id} onClick={() => setParams({ tab: id })}
              className={`relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === id ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
              {tab === id && <motion.span layoutId="tab" className="absolute inset-0 rounded-xl bg-brand-soft" />}
              <Icon size={16} className="relative" /><span className="relative">{t(label)}</span>
            </button>
          ))}
        </div>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">{panels[tab]}</motion.div>
      </div>
    </div>
  )
}
