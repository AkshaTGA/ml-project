import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import { UserButton } from '@clerk/react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronDown, GitBranch, Home, LayoutGrid, MessageCircle, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Settings as SettingsIcon, Sprout, Trash2,
} from 'lucide-react'
import { Logo } from '../components/common'
import { useApi } from '../lib/api'
import { useAppData } from '../lib/appData'
import { LANGUAGES, useI18n } from '../lib/i18n'

function groupThreads(threads) {
  const today = new Date().toDateString()
  const week = Date.now() - 7 * 864e5
  const groups = { today: [], week: [], older: [] }
  for (const t of threads) {
    const d = new Date(t.updated_at)
    if (d.toDateString() === today) groups.today.push(t)
    else if (d.getTime() > week) groups.week.push(t)
    else groups.older.push(t)
  }
  return groups
}

function ThreadItem({ thread, active, onDelete, onRename }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(thread.title)
  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); onRename(title); setEditing(false) }} className="px-1">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setEditing(false)}
          className="w-full rounded-lg border border-brand bg-surface px-2 py-1.5 text-sm outline-none" />
      </form>
    )
  }
  return (
    <Link to={`/app/chat/${thread.id}`}
      className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${active ? 'bg-surface font-semibold shadow-sm' : 'text-ink/80 hover:bg-surface/70'}`}>
      {thread.parent_id && <GitBranch size={13} className="shrink-0 text-muted" aria-label="Branched chat" />}
      <span className="min-w-0 flex-1 truncate">{thread.title.replace(/^↳\s*/, '')}</span>
      <span className="hidden gap-0.5 group-hover:flex">
        <button onClick={(e) => { e.preventDefault(); setEditing(true) }} className="rounded p-1 text-muted hover:text-ink" title="Rename"><Pencil size={13} /></button>
        <button onClick={(e) => { e.preventDefault(); onDelete() }} className="rounded p-1 text-muted hover:text-danger" title="Delete"><Trash2 size={13} /></button>
      </span>
    </Link>
  )
}

export default function AppLayout() {
  const api = useApi()
  const navigate = useNavigate()
  const location = useLocation()
  const threadId = useMatch('/app/chat/:threadId')?.params.threadId
  const { t, lang, setLang } = useI18n()
  const { threads, setThreads } = useAppData()
  const [open, setOpen] = useState(() => window.innerWidth >= 900)
  const [query, setQuery] = useState('')
  const [langOpen, setLangOpen] = useState(false)
  const isMobile = () => window.innerWidth < 900

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? threads.filter((th) => th.title.toLowerCase().includes(q) || th.summary?.toLowerCase().includes(q)) : threads
  }, [threads, query])
  const groups = groupThreads(filtered)

  async function remove(id) {
    if (!confirm('Delete this conversation?')) return
    setThreads((prev) => prev.filter((th) => th.id !== id))
    await api.deleteThread(id).catch(() => {})
    if (id === threadId) navigate('/app/chat')
  }

  async function rename(id, title) {
    setThreads((prev) => prev.map((th) => (th.id === id ? { ...th, title } : th)))
    await api.renameThread(id, title).catch(() => {})
  }

  const tab = new URLSearchParams(location.search).get('tab')
  const nav = [
    { id: 'home', to: '/app', icon: Home, label: t('home') },
    { id: 'chat', to: '/app/chat', icon: MessageCircle, label: t('askAssistant') },
    { id: 'farm', to: '/app/settings?tab=profile', icon: Sprout, label: t('myFarm') },
    { id: 'tools', to: '/app/models', icon: LayoutGrid, label: t('farmTools') },
    { id: 'settings', to: '/app/settings?tab=style', icon: SettingsIcon, label: t('settings') },
  ]
  const itemActive = (item) => {
    if (item.id === 'home') return location.pathname === '/app'
    if (item.id === 'chat') return location.pathname.startsWith('/app/chat')
    if (item.id === 'farm') return location.pathname.startsWith('/app/settings') && (!tab || tab === 'profile' || tab === 'memory')
    if (item.id === 'tools') return location.pathname.startsWith('/app/models')
    if (item.id === 'settings') return location.pathname.startsWith('/app/settings') && !!tab && tab !== 'profile' && tab !== 'memory'
    return false
  }

  const sidebar = (
    <motion.aside initial={false} animate={{ x: 0 }}
      className="flex h-full w-[260px] flex-col gap-4 border-r border-line/70 bg-bg/80 p-4">
      <div className="flex items-center justify-between px-1.5 pt-1">
        <Link to="/app"><Logo size={30} /></Link>
        <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink" title="Close sidebar">
          <PanelLeftClose size={18} />
        </button>
      </div>
      <button onClick={() => { navigate('/app/chat'); if (isMobile()) setOpen(false) }}
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand-soft px-3 py-2.5 font-semibold text-brand-strong transition hover:bg-mint">
        <Plus size={18} /> {t('newChat')}
      </button>
      <nav className="flex flex-col gap-0.5">
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.id} to={item.to} end={item.id === 'home'} onClick={() => isMobile() && setOpen(false)}
              className={() => `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] transition ${
                itemActive(item) ? 'bg-brand-soft font-semibold text-brand-strong' : 'font-medium text-ink/75 hover:bg-surface/80'}`}>
              <Icon size={18} strokeWidth={1.75} /> {item.label}
            </NavLink>
          )
        })}
      </nav>
      <div className="relative mt-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchChats')}
          className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-brand" />
      </div>
      <div className="scroll-thin -mx-1 flex-1 overflow-y-auto px-1" onClick={() => isMobile() && setOpen(false)}>
        {[['today', t('recent')], ['week', 'This week'], ['older', t('earlier')]].map(([key, label]) => groups[key].length > 0 && (
          <div key={key} className="mb-3">
            <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">{label}</div>
            {groups[key].map((th) => (
              <ThreadItem key={th.id} thread={th} active={th.id === threadId} onDelete={() => remove(th.id)} onRename={(title) => rename(th.id, title)} />
            ))}
          </div>
        ))}
        {threads.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Your conversations will appear here.</p>}
      </div>
      <div className="relative flex items-center gap-2 border-t border-line pt-3">
        <UserButton appearance={{ elements: { avatarBox: 'size-8' } }} />
        <button onClick={() => setLangOpen((v) => !v)} className="ml-auto flex items-center gap-2 rounded-full bg-surface px-2.5 py-1.5 text-sm shadow-sm hover:text-ink">
          <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-strong">
            {(LANGUAGES.find((l) => l.code === lang)?.native || 'A').slice(0, 1)}
          </span>
          {LANGUAGES.find((l) => l.code === lang)?.native}
          <ChevronDown size={14} className="text-muted" />
        </button>
        <AnimatePresence>
          {langOpen && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="absolute bottom-12 right-0 z-30 w-44 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-xl">
              {LANGUAGES.filter((l) => l.ui).map((l) => (
                <button key={l.code} onClick={() => { setLang(l.code); setLangOpen(false) }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-surface-2 ${l.code === lang ? 'font-bold text-brand' : ''}`}>
                  {l.native} <span className="text-xs text-muted">{l.name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  )

  return (
    <div className="flex h-full">
      <AnimatePresence initial={false}>
        {open && (
          <>
            <motion.div key="backdrop" className="fixed inset-0 z-30 bg-black/30 min-[900px]:hidden" initial={{ opacity: 0 }}
              animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div key="sidebar" className="fixed inset-y-0 left-0 z-40 min-[900px]:static"
              initial={{ x: -280, width: 0 }} animate={{ x: 0, width: 260 }} exit={{ x: -280, width: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <main className="relative flex min-w-0 flex-1 flex-col">
        {!open && (
          <button onClick={() => setOpen(true)} title="Open sidebar"
            className="absolute left-3 top-3 z-20 rounded-xl border border-line bg-surface/80 p-2 text-muted backdrop-blur hover:text-ink">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <div key={location.pathname.startsWith('/app/chat') ? 'chat' : location.pathname} className="min-h-0 flex-1">
          <Outlet context={{ sidebarOpen: open }} />
        </div>
      </main>
    </div>
  )
}
