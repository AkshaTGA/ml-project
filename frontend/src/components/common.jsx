import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { motion } from 'motion/react'
import { useApi } from '../lib/api'
import { useAppData } from '../lib/appData'
import { startRecording } from '../lib/voice'
import { useToast } from '../lib/toast'

export function Logo({ size = 32, withText = true, className = '', tone = 'default' }) {
  const light = tone === 'light'
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={light ? 'text-white' : 'text-brand'} style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" className="size-full" aria-hidden>
          <path d="M12 21.5c0-6.2.6-10.4 7.2-13.4-1.1 6.2-3.6 9.4-7.2 11-3.6-1.6-6.1-4.8-7.2-11C11.4 11.1 12 15.3 12 21.5Z" fill="currentColor" />
          <path d="M12 21.5V8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
        </svg>
      </span>
      {withText && <span className={`text-[1.15rem] font-bold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>AgriAssist</span>}
    </div>
  )
}

export function Spinner({ size = 18, className = '' }) {
  return <LoaderCircle size={size} className={`animate-spin ${className}`} />
}

export function FullPageSpinner() {
  return (
    <div className="grid h-full place-items-center">
      <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        <Logo size={44} withText={false} />
      </motion.div>
    </div>
  )
}

/** Image from the authenticated file endpoint (an <img src> can't send the auth header). */
const blobCache = new Map()
export function AuthImage({ fileId, src, alt = '', className = '' }) {
  const api = useApi()
  const [url, setUrl] = useState(src || blobCache.get(fileId))
  useEffect(() => {
    if (src || !fileId || blobCache.has(fileId)) return
    let alive = true
    api.fileBlob(fileId).then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      blobCache.set(fileId, objectUrl)
      if (alive) setUrl(objectUrl)
    }).catch(() => {})
    return () => { alive = false }
  }, [api, fileId, src])
  return url ? <img src={url} alt={alt} className={className} /> : <div className={`animate-pulse bg-surface-2 ${className}`} />
}

/** Live microphone level bars. */
export function LevelBars({ level, bars = 5, className = '' }) {
  return (
    <div className={`flex items-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => {
        const shape = 1 - Math.abs(i - (bars - 1) / 2) / bars
        return <span key={i} className="w-[3px] rounded-full bg-current transition-[height] duration-75"
          style={{ height: `${4 + level * 18 * shape + (level > 0.05 ? 2 : 0)}px` }} />
      })}
    </div>
  )
}

/**
 * Multilingual voice typing for any text field: records, transcribes with Sarvam and hands
 * the text back. Used on every input in the app.
 */
export function VoiceTypingButton({ onText, className = '', size = 16, title = 'Voice typing', large = false }) {
  const api = useApi()
  const toast = useToast()
  const { profile } = useAppData() || {}
  const [state, setState] = useState('idle') // idle | recording | transcribing
  const [level, setLevel] = useState(0)
  const recRef = useRef(null)

  useEffect(() => () => recRef.current?.cancel(), [])

  async function toggle(e) {
    e.preventDefault()
    if (state === 'recording') {
      const blob = await recRef.current.stop()
      recRef.current = null
      setLevel(0)
      if (!blob) return setState('idle')
      setState('transcribing')
      try {
        const { text } = await api.stt(blob, profile?.language)
        if (text) onText(text)
      } catch (err) {
        toast({ title: 'Voice typing failed', message: err.message })
      }
      setState('idle')
      return
    }
    try {
      recRef.current = await startRecording({ onLevel: setLevel })
      setState('recording')
    } catch {
      toast({ title: 'Microphone blocked', message: 'Allow microphone access in your browser to use voice.' })
    }
  }

  return (
    <button type="button" onClick={toggle} title={title} aria-label={title} disabled={state === 'transcribing'}
      className={`relative inline-flex shrink-0 items-center justify-center gap-1 rounded-full transition-colors ${
        state === 'recording' ? 'bg-danger px-2.5 text-white' : large ? 'bg-white/80 text-brand shadow-sm hover:bg-white' : 'text-muted hover:bg-surface-2 hover:text-brand'} ${large ? 'size-12' : 'h-8 min-w-8'} ${className}`}>
      {state === 'transcribing' ? <Spinner size={size} /> : state === 'recording'
        ? <><Square size={10} fill="currentColor" /><LevelBars level={level} bars={4} /></>
        : <Mic size={size} />}
    </button>
  )
}

/** Text input / textarea with a voice typing button built in. */
export function VoiceField({ as = 'input', value, onChange, className = '', inputClassName = '', plain = false, micFirst = false, ...props }) {
  const Tag = as
  const ref = useRef(null)

  function insert(text) {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const before = value.slice(0, start)
    const glue = before && !/\s$/.test(before) ? ' ' : ''
    onChange(before + glue + text + value.slice(end))
  }

  const mic = <VoiceTypingButton onText={insert} large={plain} className={plain ? '' : 'mt-1.5'} size={plain ? 22 : 16} />
  return (
    <div className={plain
      ? `flex min-w-0 flex-1 items-center gap-2 ${className}`
      : `flex items-start gap-1 rounded-xl border border-line bg-surface px-3 transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10 ${className}`}>
      {micFirst && mic}
      <Tag ref={ref} value={value} onChange={(e) => onChange(e.target.value)}
        className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70 ${plain ? 'py-3 text-lg placeholder:text-brand-strong/55' : 'py-2.5'} ${as === 'textarea' ? 'resize-none' : ''} ${inputClassName}`}
        {...props} />
      {!micFirst && mic}
    </div>
  )
}
