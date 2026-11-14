// In dev, Vite proxies /api to the backend. For a deployed frontend set VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch { /* not json */ }
    throw new Error(detail)
  }
  return res.json()
}

export const fileUrl = (id) => `${BASE}/api/files/${id}`
export const getHealth = () => request('/api/health')
export const getModels = () => request('/api/models')
export const getThreadMessages = (id) => request(`/api/threads/${id}/messages`)
export const deleteThread = (id) => request(`/api/threads/${id}`, { method: 'DELETE' })

export function runModel(modelId, inputs) {
  return request(`/api/models/${modelId}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs }),
  })
}

export async function uploadFiles(fileList) {
  const form = new FormData()
  for (const f of fileList) form.append('uploads', f)
  return request('/api/upload', { method: 'POST', body: form })
}

// Streams agent events: token, tool_start, tool_end, error, done.
export async function streamChat({ threadId, message, attachments, signal, onEvent }) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, message, attachments }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Chat request failed (${res.status})`)
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
