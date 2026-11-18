import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ArrowUp, AudioLines, Camera, Paperclip, Square } from 'lucide-react'
import { VoiceTypingButton } from '../common'
import { downscaleImage, useApi } from '../../lib/api'
import { useI18n } from '../../lib/i18n'
import { useToast } from '../../lib/toast'
import ContextChip from './ContextChip'
import { Attachment } from './Message'

const ACCEPT = 'image/*,.pdf,.txt,.csv,.md,.json'

const Composer = forwardRef(function Composer({ busy, onSend, onStop, onVoiceMode, onOpenContext }, ref) {
  const api = useApi()
  const toast = useToast()
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [context, setContext] = useState([])
  const fileRef = useRef(null)
  const cameraRef = useRef(null)
  const textRef = useRef(null)

  async function addFiles(list) {
    const items = [...list].map((f) => ({
      key: crypto.randomUUID(), name: f.name, kind: f.type.startsWith('image/') ? 'image' : 'document',
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, uploading: true, file: f,
    }))
    setFiles((prev) => [...prev, ...items])
    await Promise.all(items.map(async (item) => {
      try {
        const [saved] = await api.upload([await downscaleImage(item.file)])
        setFiles((prev) => prev.map((a) => (a.key === item.key ? { ...a, ...saved, uploading: false } : a)))
      } catch (err) {
        setFiles((prev) => prev.filter((a) => a.key !== item.key))
        toast({ title: `Upload failed: ${item.name}`, message: err.message })
      }
    }))
  }

  useImperativeHandle(ref, () => ({
    addFiles,
    setText: (value) => { setText(value); textRef.current?.focus() },
    pickImage: (prompt) => { if (prompt) setText(prompt); cameraRef.current?.click() },
    addContext(item) {
      setContext((prev) => {
        const rest = item.type === 'message'
          ? prev.filter((entry) => entry.type !== 'message')
          : prev.filter((entry) => !(entry.type === item.type && entry.id === item.id))
        return [...rest, item].slice(-3)
      })
      textRef.current?.focus()
    },
  }))

  const uploading = files.some((f) => f.uploading)
  const canSend = !busy && !uploading && (text.trim() || files.length || context.length)

  function submit() {
    if (!canSend) return
    const message = text.trim() || (context.length ? t('aboutThis') : '')
    onSend(message, files.map(({ id, name, kind, content_type, preview }) => ({ id, name, kind, content_type, preview })), { context })
    setText('')
    setFiles([])
    setContext([])
  }

  function insertVoice(spoken) {
    setText((prev) => (prev && !/\s$/.test(prev) ? `${prev} ${spoken}` : prev + spoken))
    textRef.current?.focus()
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-[30px] bg-ask p-2.5 shadow-[0_12px_32px_-18px_rgba(36,107,48,0.5)] transition focus-within:shadow-[0_14px_36px_-16px_rgba(36,107,48,0.6)]">
        {(context.length > 0 || files.length > 0) && (
          <div className="flex flex-col gap-2 p-2 pb-1">
            {context.length > 0 && (
              <div className="flex flex-col items-start gap-1.5">
                {context.map((item) => (
                  <ContextChip key={`${item.type}-${item.id}`} item={item} onOpen={onOpenContext}
                    onRemove={() => setContext((prev) => prev.filter((entry) => !(entry.type === item.type && entry.id === item.id)))} />
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f) => <Attachment key={f.key} file={f} pending={f.uploading} onRemove={() => setFiles((p) => p.filter((x) => x.key !== f.key))} />)}
              </div>
            )}
          </div>
        )}
        <textarea ref={textRef} rows={1} value={text} placeholder={t('askAnything')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
          onPaste={(e) => { const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/')); if (imgs.length) addFiles(imgs) }}
          className="block max-h-52 min-h-14 w-full resize-none bg-transparent px-3 py-3 text-base outline-none [field-sizing:content] placeholder:text-brand-strong/50" />
        <div className="flex items-center gap-1 px-1">
          <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          <button title={t('attachFiles')} onClick={() => fileRef.current.click()} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink"><Paperclip size={18} /></button>
          <button title={t('photoLeaf')} onClick={() => cameraRef.current.click()} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink"><Camera size={18} /></button>
          <VoiceTypingButton onText={insertVoice} size={18} className="h-9 min-w-9" />
          <span className="flex-1" />
          <button title={t('voiceMode')} onClick={onVoiceMode}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-gold/15 to-brand/15 px-3 py-2 text-sm font-semibold text-brand-strong transition hover:from-gold/25 hover:to-brand/25">
            <AudioLines size={17} /> <span className="hidden sm:inline">{t('voiceMode')}</span>
          </button>
          {busy ? (
            <button title={t('stop')} onClick={onStop} className="grid size-10 place-items-center rounded-full bg-ink text-bg"><Square size={14} fill="currentColor" /></button>
          ) : (
            <button title={t('send')} onClick={submit} disabled={!canSend}
              className="grid size-10 place-items-center rounded-full bg-brand text-white shadow-md shadow-brand/30 transition hover:bg-brand-strong disabled:bg-surface-3 disabled:text-muted disabled:shadow-none">
              <ArrowUp size={19} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">{t('mistakesNote')}</p>
    </div>
  )
})

export default Composer
