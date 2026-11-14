import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useNavigate } from 'react-router'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.jsx'
import { I18nProvider } from './lib/i18n'
import { ToastProvider } from './lib/toast'
import { clerkAppearance } from './lib/clerkTheme'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function MissingKey() {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="max-w-md rounded-3xl border border-line bg-surface p-8 text-center shadow-xl">
        <div className="text-4xl">🔑</div>
        <h1 className="mt-3 text-xl font-bold">Add your Clerk key</h1>
        <p className="mt-2 text-muted">
          Create <code className="rounded bg-surface-2 px-1">frontend/.env</code> with{' '}
          <code className="rounded bg-surface-2 px-1">VITE_CLERK_PUBLISHABLE_KEY=pk_…</code> and restart <code>npm run dev</code>.
        </p>
      </div>
    </div>
  )
}

function ClerkWithRouter({ children }) {
  const navigate = useNavigate()
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={clerkAppearance}
      routerPush={(to) => navigate(to)} routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/app" signUpFallbackRedirectUrl="/app"
      afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {PUBLISHABLE_KEY ? (
      <BrowserRouter>
        <ClerkWithRouter>
          <I18nProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </I18nProvider>
        </ClerkWithRouter>
      </BrowserRouter>
    ) : <MissingKey />}
  </StrictMode>,
)
