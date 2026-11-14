import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Brain, CloudSun, GitBranch, IndianRupee, Leaf, PawPrint, RotateCcw, Sprout } from 'lucide-react'
import Composer from '../components/chat/Composer'
import Message from '../components/chat/Message'
import VoiceMode from '../components/chat/VoiceMode'
import { FullPageSpinner } from '../components/common'
import { useApi } from '../lib/api'
import { useAppData } from '../lib/appData'
import { useI18n } from '../lib/i18n'
import { AudioQueue } from '../lib/voice'
import { verboseSteps } from '../lib/prefs'
import { voiceId } from '../lib/voices'
import { useToast } from '../lib/toast'

// Messages of every thread opened in this session, so switching back is instant and a reply
// that is still streaming keeps landing in the right conversation.
const threadCache = new Map()

function applyEvent(msg, e) {
  const steps = [...msg.steps]
  const last = steps.at(-1)
  switch (e.type) {
    case 'status':
      if (e.step === 'context' && !steps.some((s) => s.type === 'context')) steps.push({ type: 'context', status: 'active' })
      return { ...msg, steps }
    case 'memory_recalled':
      return { ...msg, steps: steps.map((s) => (s.type === 'context'
        ? { ...s, status: 'done', count: e.count ?? e.memories?.length ?? 0, recentThreads: e.recent_threads ?? 0 } : s)) }
    case 'thinking':
      if (last?.type === 'thinking') steps[steps.length - 1] = { ...last, content: last.content + e.content }
      else steps.push({ type: 'thinking', content: e.content })
      return { ...msg, steps }
    case 'token':
      return { ...msg, content: msg.content + e.content }
    case 'tool_start':
      // Text written before a tool call is the agent's plan, not the answer.
      if (msg.content.trim()) steps.push({ type: 'note', content: msg.content.trim() })
      steps.push({ type: 'tool', id: e.id, name: e.name, args: e.args, output: null, startedAt: Date.now() })
      return { ...msg, steps, content: '' }
    case 'tool_end':
      return { ...msg, steps: steps.map((s) => (s.id === e.id ? { ...s, output: e.output, endedAt: Date.now() } : s)) }
    case 'answer_done':
      return { ...msg, status: 'done', timing: e.timing }
    case 'suggestions':
      return { ...msg, suggestions: e.suggestions }
    case 'error':
      return { ...msg, status: 'done', error: e.message }
    case 'done':
      return { ...msg, status: 'done' }
    default:
      return msg
  }
}

// Index in the message list where turn number `keepTurns` starts (a turn = one user message + its answer).
function cutIndex(msgs, keepTurns) {
  let seen = 0
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== 'user') continue
    if (seen === keepTurns) return i
    seen++
  }
  return msgs.length
}

const withoutSuggestions = (msgs) => msgs.map((m) => (m.suggestions ? { ...m, suggestions: [] } : m))

const STARTERS = [
  { icon: Leaf, text: 'My tomato leaves have brown spots with yellow rings. What is it?', tone: 'text-danger' },
  { icon: CloudSun, text: 'Should I spray pesticide this week given the weather?', tone: 'text-sky' },
  { icon: IndianRupee, text: 'What are onion prices in my nearest mandi today?', tone: 'text-gold' },
  { icon: PawPrint, text: 'मेरी गाय को बुखार है और वह खाना नहीं खा रही, क्या करूँ?', tone: 'text-earth' },
]

export default function ChatPage() {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { threadId: routeId } = useParams()
  const { t } = useI18n()
  const { profile, setThreads, refreshThreads } = useAppData()
  // Id for a chat that has no URL yet; renewed whenever the user goes back to "New chat".
  const draftRef = useRef(null)
  const prevRouteRef = useRef(routeId)
  if (!draftRef.current || (prevRouteRef.current && !routeId)) draftRef.current = crypto.randomUUID()
  prevRouteRef.current = routeId
  const threadId = routeId || draftRef.current
  const [, force] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [speakingIdx, setSpeakingIdx] = useState(null)
  const [dragging, setDragging] = useState(false)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)
  const composerRef = useRef(null)
  const stickRef = useRef(true)
  const speaker = useRef(null)

  const messages = threadCache.get(threadId) || []
  const setMessages = useCallback((id, update) => {
    threadCache.set(id, update(threadCache.get(id) || []))
    force((n) => n + 1)
  }, [])

  // Load history when opening an existing conversation.
  useEffect(() => {
    if (!routeId || threadCache.has(routeId)) return
    setLoading(true)
    api.threadMessages(routeId)
      .then((msgs) => setMessages(routeId, () => msgs.map((m) => (m.role === 'assistant' ? { ...m, status: 'done' } : m))))
      .catch(() => { toast({ title: 'Conversation not found' }); navigate('/app/chat', { replace: true }) })
      .finally(() => setLoading(false))
  }, [api, routeId, navigate, setMessages, toast])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: busy ? 'auto' : 'smooth' })
  })

  const send = useCallback(async (text, files = [], { voice = false, onEvent } = {}) => {
    const id = threadId
    const isNew = !(threadCache.get(id) || []).length
    stickRef.current = true
    setMessages(id, (prev) => [
      ...prev.map((m) => (m.suggestions ? { ...m, suggestions: [] } : m)),
      { role: 'user', content: text, attachments: files, voice },
      { role: 'assistant', content: '', steps: [], status: 'streaming' },
    ])
    if (isNew) {
      setThreads((prev) => (prev.some((th) => th.id === id) ? prev
        : [{ id, title: text.slice(0, 60) || files[0]?.name || 'New chat', updated_at: new Date().toISOString() }, ...prev]))
      if (!routeId) navigate(`/app/chat/${id}`, { replace: true })
    }
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    const update = (e) => setMessages(id, (prev) => [...prev.slice(0, -1), applyEvent(prev.at(-1), e)])
    let answered = false
    try {
      await api.chat({
        threadId: id, message: text, attachments: files.map((f) => f.id), voice, verbose: verboseSteps(), signal: controller.signal,
        onEvent(e) {
          onEvent?.(e)
          if (e.type === 'answer_done') answered = true
          if (e.type === 'answer_done' || e.type === 'error') setBusy(false)
          if (e.type === 'memory_saved') {
            toast({
              icon: <Brain size={16} />, title: 'Remembered', message: e.memory.text,
              action: { label: 'Undo', onClick: () => api.forget('fact', e.memory.id) },
            })
          } else if (e.type === 'title') {
            setThreads((prev) => prev.map((th) => (th.id === id ? { ...th, title: e.title } : th)))
          } else update(e)
        },
      })
    } catch (err) {
      onEvent?.({ type: 'error', message: err.message })
      // The connection dropped but the server keeps working on the answer: fetch it when it's ready.
      if (err.name !== 'AbortError' && !answered) recoverAnswer(id)
      else if (err.name !== 'AbortError') update({ type: 'error', message: err.message })
    } finally {
      update({ type: 'done' })
      setBusy(false)
      refreshThreads()
    }
  }, [api, navigate, refreshThreads, routeId, setMessages, setThreads, threadId, toast])

  // Stable, so finished visuals (choices) don't re-render on every streamed word.
  const sendRef = useRef(send)
  sendRef.current = send
  const ask = useCallback((text) => sendRef.current(text), [])

  async function recoverAnswer(id) {
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        const msgs = await api.threadMessages(id)
        const last = msgs.at(-1)
        if (last?.role === 'assistant' && last.content) {
          setMessages(id, () => msgs.map((m) => (m.role === 'assistant' ? { ...m, status: 'done' } : m)))
          return
        }
      } catch { /* keep trying */ }
    }
    setMessages(id, (prev) => [...prev.slice(0, -1), applyEvent(prev.at(-1), { type: 'error', message: 'Connection lost. Reload this chat to see the answer.' })])
  }

  function stop() {
    api.stopChat(threadId).catch(() => {})
    abortRef.current?.abort()
  }

  // Shortcuts from the dashboard (ask, scan a leaf, check pasture, voice).
  const handledStateRef = useRef(null)
  useEffect(() => {
    const state = location.state
    if (!state || handledStateRef.current === state) return
    handledStateRef.current = state
    navigate(location.pathname, { replace: true, state: null })
    if (state.prompt) send(state.prompt)
    if (state.action === 'scan') composerRef.current?.pickImage('Please check this leaf/plant for disease and tell me the treatment.')
    if (state.action === 'pasture') composerRef.current?.pickImage('Estimate the biomass of this pasture and how long it can feed my animals.')
    if (state.action === 'voice') setVoiceOpen(true)
  }, [location.state]) // eslint-disable-line react-hooks/exhaustive-deps

  async function speak(index, content) {
    speaker.current?.stop()
    if (speakingIdx === index) { setSpeakingIdx(null); return }
    setSpeakingIdx(index)
    const queue = new AudioQueue({ onIdle: () => setSpeakingIdx((i) => (i === index ? null : i)) })
    speaker.current = queue
    queue.push(api.tts(content, { preferred_language: profile?.language, speaker: voiceId(profile, 'read') }).then((r) => r.audios).catch((err) => {
      toast({ title: 'Could not read aloud', message: err.message })
      return []
    }))
  }

  const closeVoice = useCallback(() => setVoiceOpen(false), [])

  // ----- Rewind, edit, regenerate, branch -----
  async function rewind(keepTurns, { undoable = true } = {}) {
    const id = threadId
    const snapshot = threadCache.get(id) || []
    speaker.current?.stop()
    setSpeakingIdx(null)
    const res = await api.rewindThread(id, keepTurns)
    setMessages(id, (prev) => withoutSuggestions(prev.slice(0, cutIndex(prev, keepTurns))))
    if (undoable && res.checkpoint_id) {
      toast({
        icon: <RotateCcw size={16} />, title: t('rewound'),
        message: `${res.removed} ${t('laterRemoved')}`,
        action: {
          label: t('undo'),
          onClick: () => api.restoreThread(id, res.checkpoint_id, res.summary)
            .then(() => setMessages(id, () => snapshot))
            .catch((err) => toast({ title: 'Could not undo', message: err.message })),
        },
      })
    }
    return res
  }

  const guard = (fn) => async (...args) => {
    if (busy) return
    try { await fn(...args) } catch (err) { toast({ title: 'Something went wrong', message: err.message }) }
  }

  // Remove this question and everything after it; put the question back in the box to rephrase.
  const rewindBeforeUser = guard(async (turn) => {
    const question = messages[cutIndex(messages, turn)]
    await rewind(turn)
    composerRef.current?.setText(question?.content || '')
  })

  const editAndResend = guard(async (turn, text) => {
    const question = messages[cutIndex(messages, turn)]
    await rewind(turn, { undoable: false })
    send(text, question?.attachments || [])
  })

  const regenerate = guard(async (turn) => {
    const question = messages[cutIndex(messages, turn)]
    if (!question) return
    await rewind(turn, { undoable: false })
    send(question.content, question.attachments || [])
  })

  const rewindAfterAnswer = guard(async (turn) => { await rewind(turn + 1) })

  // New conversation with everything up to and including this answer; the original stays as it is.
  const branch = guard(async (turn) => {
    const res = await api.branchThread(threadId, turn + 1)
    threadCache.set(res.id, withoutSuggestions(messages.slice(0, cutIndex(messages, turn + 1))))
    setThreads((prev) => [{ id: res.id, title: res.title, parent_id: threadId, updated_at: new Date().toISOString() }, ...prev])
    navigate(`/app/chat/${res.id}`)
    toast({ icon: <GitBranch size={16} />, title: t('branched'), message: res.title })
  })

  // Only conversations the server already knows about can be rewound or branched.
  const persisted = !!routeId
  // Turn number of every message (a user message starts a new turn).
  const turnOf = messages.reduce((acc, m) => [...acc, Math.max((acc.at(-1) ?? -1) + (m.role === 'user' ? 1 : 0), 0)], [])

  return (
    <div className="relative flex h-full flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); composerRef.current?.addFiles(e.dataTransfer.files) }}>
      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-4 pt-16 sm:pt-8"
        onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120 }}>
        {loading ? <FullPageSpinner /> : messages.length === 0 ? (
          <div className="mx-auto flex max-w-3xl flex-col items-center pt-[8vh] text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-brand to-brand-strong text-white shadow-xl shadow-brand/30">
              <Sprout size={30} />
            </motion.div>
            <h1 className="mt-5 font-display text-3xl font-bold text-brand-strong sm:text-4xl">{t('namaste')}{profile?.name ? `, ${profile.name}` : ''} 👋</h1>
            <p className="mt-2 max-w-lg text-lg text-muted">{t('helpToday')}</p>
            <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
              {STARTERS.map(({ icon: Icon, text, tone }, i) => (
                <motion.button key={text} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
                  onClick={() => send(text)}
                  className="flex items-start gap-3 rounded-3xl bg-surface p-4 text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                  <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} /> {text}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-7 pb-6">
            {messages.map((m, i) => {
              const turn = turnOf[i]
              const actionable = persisted && m.status !== 'streaming'
              return (
                <Message key={i} message={m} isLast={i === messages.length - 1} onSuggestion={ask}
                  onSpeak={() => speak(i, m.content)} speaking={speakingIdx === i} busy={busy}
                  onEditResend={actionable && m.role === 'user' ? (text) => editAndResend(turn, text) : undefined}
                  onRewind={actionable ? () => (m.role === 'user' ? rewindBeforeUser(turn) : rewindAfterAnswer(turn)) : undefined}
                  onRegenerate={actionable && m.role === 'assistant' ? () => regenerate(turn) : undefined}
                  onBranch={actionable && m.role === 'assistant' ? () => branch(turn) : undefined} />
              )
            })}
          </div>
        )}
      </div>
      <div className="px-3 pb-3 sm:px-4">
        <Composer ref={composerRef} busy={busy} onSend={(text, files) => send(text, files)}
          onStop={stop} onVoiceMode={() => setVoiceOpen(true)} />
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-3xl border-2 border-dashed border-brand bg-brand-soft/80 text-lg font-bold text-brand-strong">
          Drop photos or documents here
        </div>
      )}
      <AnimatePresence>{voiceOpen && <VoiceMode onClose={closeVoice} onSend={send} />}</AnimatePresence>
    </div>
  )
}
