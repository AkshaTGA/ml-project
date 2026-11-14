import { useMemo, useRef } from 'react'
import { useAuth } from '@clerk/react'

// In dev, Vite proxies /api to the backend. For a deployed frontend set VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function parse(res) {
  if (res.ok) return res.status === 204 ? null : res.json()
  let detail = res.statusText
  try { detail = (await res.json()).detail || detail } catch { /* not json */ }
  throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
}

// Reads the server-sent agent events: status, memory_recalled, thinking, token, tool_start,
// tool_end, answer_done, memory_saved, title, suggestions, error, done.
async function readEvents(res, onEvent) {
  if (!res.ok || !res.body) await parse(res)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '))
      if (line) onEvent(JSON.parse(line.slice(6)))
    }
  }
}

export function makeApi(getToken) {
  async function call(path, { method = 'GET', json, form, signal, raw } = {}) {
    const token = await getToken()
    const headers = { Authorization: `Bearer ${token}` }
    if (json !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${path}`, {
      method, headers, signal,
      body: json !== undefined ? JSON.stringify(json) : form,
    })
    return raw ? res : parse(res)
  }

  return {
    profile: () => call('/api/profile'),
    updateProfile: (fields) => call('/api/profile', { method: 'PUT', json: fields }),
    onboard: (fields) => call('/api/onboarding', { method: 'POST', json: fields }),
    dashboard: () => call('/api/dashboard'),
    threads: () => call('/api/threads'),
    threadMessages: (id) => call(`/api/threads/${id}/messages`),
    renameThread: (id, title) => call(`/api/threads/${id}`, { method: 'PATCH', json: { title } }),
    deleteThread: (id) => call(`/api/threads/${id}`, { method: 'DELETE' }),
    rewindThread: (id, keepTurns) => call(`/api/threads/${id}/rewind`, { method: 'POST', json: { keep_turns: keepTurns } }),
    restoreThread: (id, checkpointId, summary) => call(`/api/threads/${id}/restore`, { method: 'POST', json: { checkpoint_id: checkpointId, summary: summary || '' } }),
    stopChat: (id) => call(`/api/chat/${id}/stop`, { method: 'POST' }),
    branchThread: (id, keepTurns) => call(`/api/threads/${id}/branch`, { method: 'POST', json: { keep_turns: keepTurns } }),
    memory: () => call('/api/memory'),
    editMemory: (kind, id, text) => call(`/api/memory/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', json: { text } }),
    forget: (kind, id) => call(`/api/memory/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    clearMemory: () => call('/api/memory', { method: 'DELETE' }),
    models: () => call('/api/models'),
    runModel: (id, inputs) => call(`/api/models/${id}/predict`, { method: 'POST', json: { inputs } }),
    upload(fileList) {
      const form = new FormData()
      for (const f of fileList) form.append('uploads', f, f.name)
      return call('/api/upload', { method: 'POST', form })
    },
    fileBlob: async (id) => (await call(`/api/files/${id}`, { raw: true })).blob(),
    stt(blob, language) {
      const form = new FormData()
      form.append('audio', blob, 'speech.webm')
      if (language) form.append('language', language)
      return call('/api/voice/stt', { method: 'POST', form })
    },
    tts: (text, opts = {}) => call('/api/voice/tts', { method: 'POST', json: { text, ...opts } }),
    async chat({ threadId, message, attachments, voice, verbose = false, signal, onEvent }) {
      const res = await call('/api/chat', {
        method: 'POST', signal, raw: true,
        json: { thread_id: threadId, message, attachments, voice: !!voice, verbose: !!verbose },
      })
      await readEvents(res, onEvent)
    },
  }
}

// Stable for the whole session: effects that depend on `api` must not re-run on every render.
export function useApi() {
  const { getToken } = useAuth()
  const tokenRef = useRef(getToken)
  tokenRef.current = getToken
  return useMemo(() => makeApi(() => tokenRef.current()), [])
}

export async function health() {
  return parse(await fetch(`${BASE}/api/health`))
}

// Shrink big photos in the browser before upload: faster uploads on rural connections.
export async function downscaleImage(file, maxSide = 1600) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1.5e6) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
