import { useState, useEffect, useRef } from 'react'
import { ShoppingBag, ArrowLeft, Phone, RefreshCw } from 'lucide-react'
import supabase from '../lib/supabase'
import { useToast } from '../components/Toast'

// ── Google SVG mark ───────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

// ── tiny step indicator ───────────────────────────────────────────────────────
const steps = ['phone', 'otp', 'setup']

export default function Auth({ onAuth }) {
  const [step, setStep] = useState('phone')   // phone | otp | setup
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [shopName, setShopName] = useState('')
  const [busy, setBusy] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [session, setSession] = useState(null)
  const otpRefs = useRef([])
  const toast = useToast()

  // Countdown timer for resend OTP
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // Handle Google OAuth redirect callback
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session)
        setStep('setup')
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && step !== 'setup') {
        setSession(session)
        setStep('setup')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Google OAuth ────────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { toast(error.message, 'error'); setBusy(false) }
  }

  // ── Phone OTP send ──────────────────────────────────────────────────────────
  async function sendOtp() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) return toast('Enter a valid 10-digit number', 'error')
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${digits}` })
    setBusy(false)
    if (error) return toast(error.message, 'error')
    setStep('otp')
    setCountdown(30)
    toast('OTP sent to +91 ' + digits, 'success')
  }

  // ── OTP verify ──────────────────────────────────────────────────────────────
  async function verifyOtp() {
    const code = otp.join('')
    if (code.length < 6) return toast('Enter the 6-digit OTP', 'error')
    setBusy(true)
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+91${phone.replace(/\D/g, '')}`,
      token: code,
      type: 'sms',
    })
    setBusy(false)
    if (error) return toast(error.message, 'error')
    setSession(data.session)
    setStep('setup')
  }

  // ── Shop setup (first/every login) ─────────────────────────────────────────
  async function finishSetup() {
    if (!shopName.trim()) return toast('Enter your shop name', 'error')
    onAuth(session, shopName.trim())
  }

  // ── OTP digit input handling ────────────────────────────────────────────────
  function handleOtpChange(idx, val) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[idx] = digit
    setOtp(next)
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  function handleOtpKey(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }
  function handleOtpPaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setOtp(pasted.split(''))
      otpRefs.current[5]?.focus()
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-green-600 via-green-700 to-emerald-800 flex flex-col items-center justify-center pt-14 pb-10 px-6 text-white text-center flex-shrink-0">
        <div className="bg-white/15 backdrop-blur rounded-3xl p-5 mb-5 shadow-xl">
          <ShoppingBag size={44} className="text-white" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-1">Kirana Smart Orders</h1>
        <p className="text-green-100 text-base">WhatsApp orders · Catalog · Credit/Udhaar</p>

        <div className="mt-7 grid grid-cols-2 gap-2.5 w-full max-w-xs text-sm">
          {[['📦','Smart Catalog'],['💬','WhatsApp Orders'],['📋','Udhaar Track'],['📊','Daily Summary']].map(([icon, label]) => (
            <div key={label} className="bg-white/10 border border-white/20 rounded-2xl py-2.5 px-3 flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              <span className="font-medium text-white/90">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Auth card ── */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 px-6 pt-8 pb-10 shadow-2xl">

        {/* ────────────────── STEP: phone ────────────────── */}
        {step === 'phone' && (
          <div className="space-y-5 max-w-sm mx-auto">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome</h2>
              <p className="text-gray-500 text-sm mt-1">Sign in to manage your store</p>
            </div>

            {/* Google */}
            <button
              onClick={signInWithGoogle}
              disabled={busy}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 text-gray-700 font-semibold py-4 rounded-2xl text-base active:scale-95 transition-all hover:border-gray-300 hover:shadow-sm disabled:opacity-60"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">or use mobile number</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Phone input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile Number</label>
              <div className="flex gap-2">
                <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded-xl px-3 text-gray-600 font-semibold text-sm w-16 flex-shrink-0">
                  🇮🇳 +91
                </div>
                <input
                  className="input-field flex-1 text-lg font-medium tracking-wide"
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
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><Phone size={18} /> Send OTP</>
              }
            </button>

            <p className="text-center text-xs text-gray-400">
              By continuing you agree to our Terms of Service
            </p>
          </div>
        )}

        {/* ────────────────── STEP: otp ────────────────── */}
        {step === 'otp' && (
          <div className="space-y-6 max-w-sm mx-auto">
            <button onClick={() => setStep('phone')} className="flex items-center gap-2 text-gray-500 text-sm font-medium">
              <ArrowLeft size={16} /> Back
            </button>

            <div>
              <h2 className="text-2xl font-bold text-gray-900">Enter OTP</h2>
              <p className="text-gray-500 text-sm mt-1">
                Sent to <span className="font-semibold text-gray-700">+91 {phone}</span>
              </p>
            </div>

            {/* 6-box OTP */}
            <div className="flex gap-2.5 justify-center" onPaste={handleOtpPaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={el => otpRefs.current[idx] = el}
                  className="w-11 h-14 text-center text-2xl font-bold border-2 rounded-2xl focus:outline-none transition-colors
                    border-gray-200 focus:border-green-500 bg-gray-50 focus:bg-white"
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
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Verify OTP →'
              }
            </button>

            {/* Resend */}
            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-sm text-gray-400">Resend in <span className="font-semibold text-gray-600">{countdown}s</span></p>
              ) : (
                <button
                  onClick={() => { sendOtp(); setOtp(['','','','','','']) }}
                  className="flex items-center gap-1.5 text-sm text-green-600 font-semibold mx-auto"
                >
                  <RefreshCw size={14} /> Resend OTP
                </button>
              )}
            </div>
          </div>
        )}

        {/* ────────────────── STEP: setup ────────────────── */}
        {step === 'setup' && (
          <div className="space-y-6 max-w-sm mx-auto">
            <div>
              <span className="text-4xl">🎉</span>
              <h2 className="text-2xl font-bold text-gray-900 mt-3">You're in!</h2>
              <p className="text-gray-500 text-sm mt-1">What should we call your shop?</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Shop Name</label>
              <input
                className="input-field text-lg"
                placeholder="e.g. Sharma General Store"
                value={shopName}
                autoFocus
                onChange={e => setShopName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && finishSetup()}
              />
            </div>

            <button onClick={finishSetup} disabled={busy || !shopName.trim()} className="btn-primary disabled:opacity-50">
              {busy
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                : 'Start Managing Orders →'
              }
            </button>

            <p className="text-center text-xs text-gray-400">
              You can change this later in settings
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
