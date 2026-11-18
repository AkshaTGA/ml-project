export function flashFocus(id) {
  if (!id) return false
  const el = document.querySelector(`[data-focus-id="${CSS.escape(String(id))}"]`)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('outline', 'outline-2', 'outline-offset-4', 'outline-brand')
  setTimeout(() => el.classList.remove('outline', 'outline-2', 'outline-offset-4', 'outline-brand'), 1600)
  return true
}
