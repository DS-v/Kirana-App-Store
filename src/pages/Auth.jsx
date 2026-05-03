import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Phone, RotateCcw } from 'lucide-react'
import supabase from '../lib/supabase'
import { useToast } from '../components/Toast'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

const Spinner = () => (
  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
)

export default function Auth({ onAuth }) {
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [shopName, setShopName] = useState('')
  const [busy, setBusy] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [session, setSession] = useState(null)
  const otpRefs = useRef([])
  const toast = useToast()

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setSession(session); setStep('setup') }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s && step !== 'setup') { setSession(s); setStep('setup') }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signInWithGoogle() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { toast(error.message, 'error'); setBusy(false) }
  }

  async function sendOtp() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) return toast('Enter a valid 10-digit number', 'error')
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${digits}` })
    setBusy(false)
    if (error) return toast(error.message, 'error')
    setStep('otp'); setCountdown(30)
  }

  async function verifyOtp() {
    const code = otp.join('')
    if (code.length < 6) return toast('Enter the 6-digit OTP', 'error')
    setBusy(true)
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+91${phone.replace(/\D/g, '')}`,
      token: code, type: 'sms',
    })
    setBusy(false)
    if (error) return toast(error.message, 'error')
    setSession(data.session); setStep('setup')
  }

  async function finishSetup() {
    if (!shopName.trim()) return toast('Enter your shop name', 'error')
    onAuth(session, shopName.trim())
  }

  function handleOtpChange(idx, val) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]; next[idx] = digit; setOtp(next)
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  function handleOtpKey(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }
  function handleOtpPaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) { setOtp(pasted.split('')); otpRefs.current[5]?.focus() }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* Top brand strip */}
      <div className="flex flex-col items-center pt-16 pb-10 px-8 text-center">
        <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-emerald-100">
          <span className="text-white text-2xl">🛒</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Kirana Smart Orders</h1>
        <p className="text-zinc-400 text-sm mt-1.5">Orders · Catalog · Udhaar · WhatsApp</p>
      </div>

      {/* Card area */}
      <div className="flex-1 px-6 pb-10">
        <div className="max-w-sm mx-auto space-y-4">

          {/* ── PHONE STEP ── */}
          {step === 'phone' && (
            <>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-6">Sign in to continue</p>

              {/* Google */}
              <button
                onClick={signInWithGoogle}
                disabled={busy}
                className="w-full flex items-center justify-center gap-3 bg-white border border-zinc-200 text-zinc-700
                           font-semibold py-3.5 rounded-xl text-sm active:scale-[0.97] transition-all
                           hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 shadow-sm"
              >
                {busy ? <Spinner /> : <><GoogleIcon />Continue with Google</>}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-zinc-100" />
                <span className="text-xs text-zinc-400">or</span>
                <div className="flex-1 h-px bg-zinc-100" />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-500">Mobile Number</label>
                <div className="flex gap-2">
                  <div className="flex items-center justify-center bg-zinc-50 border border-zinc-200 rounded-xl px-3 text-zinc-500 text-sm font-semibold w-20 flex-shrink-0">
                    🇮🇳 +91
                  </div>
                  <input
                    className="input-field flex-1 text-lg font-medium tracking-widest"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    maxLength={10}
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && sendOtp()}
                  />
                </div>
              </div>

              <button
                onClick={sendOtp}
                disabled={busy || phone.replace(/\D/g, '').length < 10}
                className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {busy ? <Spinner /> : <><Phone size={16} />Send OTP</>}
              </button>

              <p className="text-center text-xs text-zinc-400 pt-2">
                By continuing you agree to our Terms of Service
              </p>
            </>
          )}

          {/* ── OTP STEP ── */}
          {step === 'otp' && (
            <>
              <button
                onClick={() => setStep('phone')}
                className="flex items-center gap-2 text-zinc-500 text-sm font-medium mb-2 -ml-1"
              >
                <ArrowLeft size={15} /> Back
              </button>

              <div className="mb-6">
                <h2 className="text-xl font-bold text-zinc-900">Enter OTP</h2>
                <p className="text-zinc-400 text-sm mt-1">
                  Sent to <span className="font-semibold text-zinc-600">+91 {phone}</span>
                </p>
              </div>

              {/* 6-box OTP */}
              <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => otpRefs.current[idx] = el}
                    className="w-11 h-13 text-center text-xl font-bold border-2 rounded-xl
                               focus:outline-none transition-all border-zinc-200 bg-zinc-50
                               focus:border-emerald-400 focus:bg-white"
                    style={{ height: '52px' }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(idx, e.target.value)}
                    onKeyDown={e => handleOtpKey(idx, e)}
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              <button
                onClick={verifyOtp}
                disabled={busy || otp.join('').length < 6}
                className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40 mt-2"
              >
                {busy ? <Spinner /> : 'Verify & Continue →'}
              </button>

              <div className="text-center pt-1">
                {countdown > 0 ? (
                  <p className="text-sm text-zinc-400">Resend in <span className="font-semibold text-zinc-600">{countdown}s</span></p>
                ) : (
                  <button
                    onClick={() => { sendOtp(); setOtp(['','','','','','']) }}
                    className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold mx-auto"
                  >
                    <RotateCcw size={13} /> Resend OTP
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── SETUP STEP ── */}
          {step === 'setup' && (
            <>
              <div className="mb-6">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
                  <span className="text-2xl">🎉</span>
                </div>
                <h2 className="text-xl font-bold text-zinc-900">You're in!</h2>
                <p className="text-zinc-400 text-sm mt-1">What's your shop called?</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-500">Shop Name</label>
                <input
                  className="input-field text-lg font-medium"
                  placeholder="e.g. Sharma General Store"
                  value={shopName}
                  autoFocus
                  onChange={e => setShopName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && finishSetup()}
                />
              </div>

              <button
                onClick={finishSetup}
                disabled={busy || !shopName.trim()}
                className="btn-primary disabled:opacity-40 flex items-center justify-center"
              >
                {busy ? <Spinner /> : 'Start Managing Orders →'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
