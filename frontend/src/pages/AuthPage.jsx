import { Link } from 'react-router'
import { SignIn, SignUp } from '@clerk/react'
import { motion } from 'motion/react'
import { Logo } from '../components/common'
import { useI18n } from '../lib/i18n'

export default function AuthPage({ mode }) {
  const { t } = useI18n()
  const quotes = [
    { text: t('authQ1'), lang: t('modelBiomass') },
    { text: t('authQ2'), lang: t('theAgent') },
    { text: t('authQ3'), lang: t('modelCattle') },
  ]
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="pasture-panel relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-[var(--c-straw)]/20 blur-3xl" />
        <Link to="/" className="relative"><Logo tone="light" /></Link>
        <div className="relative mt-auto">
          <h2 className="font-display text-4xl leading-tight font-bold">{t('authHeadline1')}<br />{t('authHeadline2')}</h2>
          <div className="mt-8 space-y-3">
            {quotes.map((q, i) => (
              <motion.div key={q.text} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.2 }}
                className="w-fit max-w-md rounded-2xl rounded-bl-sm bg-white/15 px-4 py-3 backdrop-blur">
                <div>{q.text}</div><div className="mt-1 text-xs text-white/70">{q.lang}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-6 p-6">
        <Link to="/" className="lg:hidden"><Logo /></Link>
        {mode === 'sign-in'
          ? <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
          : <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />}
      </div>
    </div>
  )
}
