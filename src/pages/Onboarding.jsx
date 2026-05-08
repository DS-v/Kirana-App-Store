import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from '../components/Toast'

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const setShopInfo = useStore(s => s.setShopInfo)
  const toast = useToast()

  function finish() {
    if (!name.trim()) return toast('Please enter your shop name', 'error')
    if (phone.replace(/\D/g, '').length < 10) return toast('Enter a valid 10-digit number', 'error')
    setShopInfo(name.trim(), phone.trim())
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-600 to-green-800 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-white text-center">
        <div className="bg-white/20 rounded-3xl p-6 mb-6">
          <ShoppingBag size={56} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Kirana Smart Orders</h1>
        <p className="text-green-100 text-lg">WhatsApp orders, catalog & credit — all in one tap</p>

        <div className="mt-8 grid grid-cols-2 gap-3 w-full max-w-xs text-sm">
          {[
            ['📦', 'Smart Catalog'],
            ['💬', 'WhatsApp Orders'],
            ['📋', 'Credit / Udhaar'],
            ['📊', 'Daily Summary'],
          ].map(([icon, text]) => (
            <div key={text} className="bg-white/15 rounded-2xl py-3 px-4 flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <span className="font-medium">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Setup form */}
      <div className="bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl">
        <h2 className="text-xl font-bold text-ink-700 mb-1">Let's set up your shop</h2>
        <p className="text-ink-400 text-sm mb-6">Takes less than a minute</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-ink-600 mb-1">Shop Name</label>
            <input
              className="input-field text-lg"
              placeholder="e.g. Sharma General Store"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-600 mb-1">Your WhatsApp Number</label>
            <div className="flex gap-2">
              <div className="input-field w-14 text-center font-medium text-ink-600 flex items-center justify-center">+91</div>
              <input
                className="input-field flex-1 text-lg"
                placeholder="9876543210"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          <button onClick={finish} className="btn-primary mt-2">
            Start Managing Orders →
          </button>
        </div>
      </div>
    </div>
  )
}
