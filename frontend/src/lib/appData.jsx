import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useApi } from './api'

const AppDataContext = createContext(null)

/** Signed-in user's profile and chat list, shared across the app shell. */
export function AppDataProvider({ children }) {
  const api = useApi()
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = none
  const [onboarded, setOnboarded] = useState(false)
  const [threads, setThreads] = useState([])
  const [error, setError] = useState(null)

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api.profile()
      setProfile(data.profile)
      setOnboarded(data.onboarded)
      setError(null)
    } catch (err) {
      setError(err.message)
      setProfile(null)
    }
  }, [api])

  const refreshThreads = useCallback(async () => {
    try { setThreads(await api.threads()) } catch { /* keep the old list */ }
  }, [api])

  useEffect(() => { refreshProfile(); refreshThreads() }, [refreshProfile, refreshThreads])

  return (
    <AppDataContext.Provider value={{ profile, setProfile, onboarded, setOnboarded, refreshProfile, threads, setThreads, refreshThreads, error }}>
      {children}
    </AppDataContext.Provider>
  )
}

export const useAppData = () => useContext(AppDataContext)
