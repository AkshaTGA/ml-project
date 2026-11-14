import { useEffect, useState } from 'react'

// How much of the agent's work to show in chat. Off (the default) is a short
// status line. On shows memories, tool arguments and timings.
const KEY = 'agriassist.verboseSteps'

export function verboseSteps() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setVerboseSteps(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('agriassist-prefs'))
}

export function useVerboseSteps() {
  const [on, setOn] = useState(verboseSteps)
  useEffect(() => {
    const sync = () => setOn(verboseSteps())
    window.addEventListener('agriassist-prefs', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('agriassist-prefs', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [on, setVerboseSteps]
}
