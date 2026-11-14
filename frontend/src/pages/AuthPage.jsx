import { Link } from 'react-router'
import { SignIn, SignUp } from '@clerk/react'
import { motion } from 'motion/react'
import { Logo } from '../components/common'

const QUOTES = [
  { text: 'मेरी गेहूं की पत्तियों पर पीले धब्बे हैं, क्या करूँ?', lang: 'Hindi' },
  { text: 'How many days can my 20 goats graze this field?', lang: 'English' },
  { text: 'ਕੱਲ੍ਹ ਮੀਂਹ ਪਵੇਗਾ? ਕੀ ਮੈਂ ਸਪਰੇਅ ਕਰਾਂ?', lang: 'Punjabi' },
]

export default function AuthPage({ mode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#1f5f24] via-[#2f7d32] to-[#5e8f2c] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-[#f2c14e]/20 blur-3xl" />
        <Link to="/" className="relative"><Logo tone="light" /></Link>
        <div className="relative mt-auto">
          <h2 className="font-display text-4xl leading-tight font-bold">Ask in your language.<br />Get advice that remembers your farm.</h2>
          <div className="mt-8 space-y-3">
            {QUOTES.map((q, i) => (
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
