import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { useAuth } from '@clerk/react'
import { FullPageSpinner } from './components/common'
import { AppDataProvider, useAppData } from './lib/appData'

// Separate bundles: visitors download only the landing page; the app loads after sign-in.
const Landing = lazy(() => import('./pages/Landing'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const AppLayout = lazy(() => import('./layouts/AppLayout'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const ModelsPage = lazy(() => import('./pages/ModelsPage'))
const Settings = lazy(() => import('./pages/Settings'))

function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth()
  const location = useLocation()
  if (!isLoaded) return <FullPageSpinner />
  if (!isSignedIn) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  return <AppDataProvider><Outlet /></AppDataProvider>
}

function RequireOnboarded() {
  const { profile, onboarded, error } = useAppData()
  if (profile === undefined) return <FullPageSpinner />
  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div><div className="text-3xl">🌧️</div><p className="mt-2 font-semibold">Can't reach the AgriAssist server</p>
          <p className="text-sm text-muted">{error}</p></div>
      </div>
    )
  }
  if (!onboarded) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in/*" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up/*" element={<AuthPage mode="sign-up" />} />
        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<RequireOnboarded />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="chat/:threadId?" element={<ChatPage />} />
              <Route path="models" element={<ModelsPage />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
