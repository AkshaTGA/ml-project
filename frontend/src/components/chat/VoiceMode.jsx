import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Mic, MicOff, X } from 'lucide-react'
import { useApi } from '../../lib/api'
import { useAppData } from '../../lib/appData'
import { useI18n } from '../../lib/i18n'
import { AudioQueue, startRecording, takeSentences } from '../../lib/voice'
import { voiceId } from '../../lib/voices'
import { TOOL_INFO } from './AgentTimeline'

const ORB = {
  idle: 'from-surface-3 to-surface-2',
  listening: 'from-brand to-[#c4b36a]',
  transcribing: 'from-brand to-sky',
  thinking: 'from-gold to-[#f59e0b]',
  speaking: 'from-sky to-brand',
  error: 'from-danger to-gold',
}

/**
 * Hands-free conversation: listen -> transcribe -> agent -> speak (sentence by sentence while the
 * answer is still streaming) -> listen again. Messages also appear in the chat behind it.
 */
export default function VoiceMode({ onClose, onSend }) {
  const api = useApi()
  const { t } = useI18n()
  const { profile } = useAppData()
  const [state, setState] = useState('idle')
  const [level, setLevel] = useState(0)
  const [heard, setHeard] = useState('')
  const [answer, setAnswer] = useState('')
  const [activity, setActivity] = useState('')
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')
  const rec = useRef(null)
  const queue = useRef(null)
  const alive = useRef(true)
  const answerDone = useRef(false)
  const mutedRef = useRef(false)
  const listenRef = useRef(null)
  const sendRef = useRef(onSend)
  sendRef.current = onSend

  const listen = useCallback(async () => {
    if (!alive.current || mutedRef.current) { setState('idle'); return }
    setError('')
    setLevel(0)
    try {
      rec.current = await startRecording({ autoStop: true, onLevel: setLevel, onAutoStop: (blob) => handleSpeech(blob) })
      setState('listening')
    } catch {
      setError('Microphone access is blocked. Allow it in your browser settings.')
      setState('error')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  listenRef.current = listen

  async function handleSpeech(blob) {
    rec.current = null
    setLevel(0)
    if (!alive.current) return
    if (!blob) return listenRef.current()
    setState('transcribing')
    let text = ''
    let language = profile?.language
    try {
      const result = await api.stt(blob, null)
      text = result.text?.trim()
      language = result.language || language
    } catch (err) {
      setError(err.message)
      setState('error')
      return
    }
    if (!text) return listenRef.current()
    setHeard(text)
    setAnswer('')
    setActivity(t('thinking'))
    setState('thinking')
    answerDone.current = false
    let buffer = ''
    const speak = (sentence) => queue.current.push(
      api.tts(sentence, { language, preferred_language: profile?.language, speaker: voiceId(profile, 'mode') }).then((r) => r.audios).catch(() => []))

    sendRef.current(text, [], {
      voice: true,
      onEvent(e) {
        if (!alive.current) return
        if (e.type === 'tool_start') setActivity(t(TOOL_INFO[e.name]?.active || 'working'))
        if (e.type === 'token') {
          setAnswer((a) => a + e.content)
          buffer += e.content
          const { sentences, rest } = takeSentences(buffer)
          buffer = rest
          sentences.forEach(speak)
        }
        if (e.type === 'answer_done' || e.type === 'error' || e.type === 'done') {
          if (answerDone.current) return
          answerDone.current = true
          if (buffer.trim()) speak(buffer.trim())
          buffer = ''
          if (e.type === 'error') setError(e.message)
          if (!queue.current.busy) listenRef.current()
        }
      },
    })
  }

  useEffect(() => {
    alive.current = true
    queue.current = new AudioQueue({
      onStart: () => setState('speaking'),
      onIdle: () => { if (answerDone.current && alive.current) listenRef.current() },
    })
    listen()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      alive.current = false
      rec.current?.cancel()
      queue.current?.stop()
      window.removeEventListener('keydown', onKey)
    }
  }, [listen, onClose])

  function tapOrb() {
    if (state === 'speaking') { queue.current.stop(); answerDone.current = true; listen() }
    else if (state === 'listening') rec.current?.stop().then((blob) => blob && handleSpeech(blob))
    else if (state === 'idle' || state === 'error') listen()
  }

  function toggleMute() {
    mutedRef.current = !mutedRef.current
    setMuted(mutedRef.current)
    if (mutedRef.current) { rec.current?.cancel(); rec.current = null; setState('idle') } else listen()
  }

  const label = {
    idle: t('tapToTalk'), listening: t('listening'), transcribing: '…', thinking: activity || t('thinking'),
    speaking: t('speaking'), error: error || t('somethingWrong'),
  }[state]
  const scale = state === 'listening' ? 1 + level * 0.45 : 1

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center bg-bg/95 px-6 py-8 backdrop-blur-2xl">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <span className="text-sm font-semibold text-muted">{t('voiceMode')}</span>
        <button onClick={onClose} className="grid size-10 place-items-center rounded-full bg-surface-2 hover:bg-surface-3" aria-label={t('closeVoice')}><X size={20} /></button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        <button onClick={tapOrb} className="relative grid size-56 place-items-center sm:size-64" aria-label={t('talkOrb')}>
          {(state === 'speaking' || state === 'thinking') && [0, 1, 2].map((i) => (
            <motion.span key={i} className={`absolute inset-6 rounded-full bg-gradient-to-br ${ORB[state]} opacity-30`}
              animate={{ scale: [1, 1.5], opacity: [0.35, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }} />
          ))}
          <motion.span className={`absolute inset-6 rounded-full bg-gradient-to-br ${ORB[state]} shadow-2xl`}
            animate={{ scale, rotate: state === 'thinking' ? 360 : 0 }}
            transition={state === 'thinking' ? { rotate: { duration: 3, repeat: Infinity, ease: 'linear' } } : { type: 'spring', stiffness: 300, damping: 20 }} />
          <span className="absolute inset-10 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,.55),transparent_55%)]" />
          {state === 'idle' && <Mic size={44} className="relative text-muted" />}
        </button>
        <AnimatePresence mode="wait">
          <motion.p key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`text-center text-lg font-semibold ${state === 'error' ? 'text-danger' : state === 'thinking' ? 'text-shimmer' : ''}`}>
            {label}
          </motion.p>
        </AnimatePresence>
        <div className="w-full max-w-xl space-y-3 text-center">
          {heard && <p className="text-muted">“{heard}”</p>}
          {answer && <p className="scroll-thin max-h-40 overflow-y-auto text-lg leading-relaxed">{answer.replace(/[*#_`|>]/g, '')}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={toggleMute} className={`grid size-14 place-items-center rounded-full ${muted ? 'bg-danger text-white' : 'bg-surface-2 hover:bg-surface-3'}`}
          aria-label={muted ? t('unmute') : t('mute')}>{muted ? <MicOff size={22} /> : <Mic size={22} />}</button>
        <button onClick={onClose} className="grid size-14 place-items-center rounded-full bg-danger text-white" aria-label={t('endVoice')}><X size={24} /></button>
      </div>
    </motion.div>
  )
}
