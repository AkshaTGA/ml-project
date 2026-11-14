// Microphone recording with live level metering and optional end-of-speech detection,
// plus an ordered audio queue for streamed text-to-speech.

const SPEECH_LEVEL = 0.035
const SILENCE_MS = 1200
const MAX_RECORD_MS = 45000

function pickMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || ''
}

/**
 * Starts recording. Returns { stop(): Promise<Blob|null>, cancel() }.
 * onLevel(0..1) is called every animation frame. With autoStop, recording ends ~1.2 s after
 * the user stops talking and onAutoStop(blob) is called (blob is null if nothing was said).
 */
export async function startRecording({ onLevel, autoStop = false, onAutoStop } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined)
  const chunks = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)

  let spoke = false
  let lastLoud = performance.now()
  const started = performance.now()
  let frame = 0
  let finished = false
  let resolveStop

  const stopped = new Promise((resolve) => { resolveStop = resolve })
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop())
    ctx.close()
    const blob = chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null
    resolveStop(spoke || !autoStop ? blob : null)
  }

  function finish() {
    if (finished) return
    finished = true
    cancelAnimationFrame(frame)
    if (recorder.state !== 'inactive') recorder.stop()
  }

  function tick() {
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const s of samples) sum += s * s
    const rms = Math.sqrt(sum / samples.length)
    onLevel?.(Math.min(1, rms * 8))
    const now = performance.now()
    if (rms > SPEECH_LEVEL) { spoke = true; lastLoud = now }
    if (autoStop && spoke && now - lastLoud > SILENCE_MS) {
      finish()
      stopped.then((blob) => onAutoStop?.(blob))
      return
    }
    if (now - started > MAX_RECORD_MS) {
      finish()
      if (autoStop) stopped.then((blob) => onAutoStop?.(blob))
      return
    }
    frame = requestAnimationFrame(tick)
  }

  recorder.start(250)
  frame = requestAnimationFrame(tick)
  return {
    stop: () => { finish(); return stopped },
    cancel: () => { chunks.length = 0; spoke = false; finish() },
  }
}

/** Plays base64 WAV clips strictly in order; clips can be added while playing. */
export class AudioQueue {
  constructor({ onStart, onIdle } = {}) {
    this.items = []
    this.playing = null
    this.onStart = onStart
    this.onIdle = onIdle
  }

  // Accepts a promise so TTS requests can run in parallel while order is preserved.
  push(clipsPromise) {
    this.items.push(clipsPromise)
    if (!this.playing) this.next()
  }

  async next() {
    const item = this.items.shift()
    if (!item) {
      this.playing = null
      this.onIdle?.()
      return
    }
    this.playing = item
    let clips = []
    try { clips = await item } catch { clips = [] }
    for (const clip of clips) {
      if (this.playing !== item) return
      this.onStart?.()
      await new Promise((resolve) => {
        const audio = new Audio(`data:audio/wav;base64,${clip}`)
        this.audio = audio
        audio.onended = resolve
        audio.onerror = resolve
        audio.play().catch(resolve)
      })
    }
    if (this.playing === item) this.next()
  }

  get busy() { return !!this.playing || this.items.length > 0 }

  stop() {
    this.items = []
    this.playing = null
    this.audio?.pause()
  }
}

// Splits streamed text into speakable sentences as soon as each one completes.
export function takeSentences(buffer, minLength = 40) {
  const out = []
  let rest = buffer
  const re = /[^.!?।॥\n]+[.!?।॥\n]+/g
  let consumed = 0
  let current = ''
  for (const m of buffer.matchAll(re)) {
    current += m[0]
    consumed = m.index + m[0].length
    if (current.trim().length >= minLength) {
      out.push(current.trim())
      current = ''
      rest = buffer.slice(consumed)
    }
  }
  return { sentences: out, rest }
}
