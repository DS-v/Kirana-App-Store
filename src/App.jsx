import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ToastProvider } from './components/Toast'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Catalog from './pages/Catalog'
import Orders from './pages/Orders'
import Customers from './pages/Customers'
import EndOfDay from './pages/EndOfDay'
import Auth from './pages/Auth'
import useStore from './store/useStore'
import supabase, { isConfigured } from './lib/supabase'

function Spinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    </div>
  )
}

function AppShell() {
  const hydrate = useStore(s => s.hydrate)
  const loading = useStore(s => s.loading)

  useEffect(() => { hydrate() }, [])

  if (loading) return <Spinner />

  return (
    <BrowserRouter>
      <div className="flex flex-col h-full max-w-lg mx-auto">
        <div className="flex-1 overflow-y-auto pb-20">
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/catalog"   element={<Catalog />} />
            <Route path="/orders"    element={<Orders />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/day"       element={<EndOfDay />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  const token    = useStore(s => s.token)
  const setAuth  = useStore(s => s.setAuth)
  const logout   = useStore(s => s.logout)
  const hydrate  = useStore(s => s.hydrate)
  const [booting, setBooting] = useState(true)

  // On mount: check if Supabase already has an active session (e.g. after Google redirect)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !token) {
        const phone = session.user.phone || ''
        const name  = session.user.user_metadata?.shop_name
          || localStorage.getItem('kirana_shop_name')
          || ''
        if (name) {
          setAuth({ token: session.access_token, shopId: session.user.id, shopName: name, phone })
        }
      }
      setBooting(false)
    })

    // Keep token fresh when Supabase refreshes it
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) logout()
      else {
        const stored = localStorage.getItem('kirana_shop_name')
        if (stored) {
          setAuth({ token: session.access_token, shopId: session.user.id, shopName: stored, phone: session.user.phone || '' })
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleAuth(session, shopName) {
    setAuth({
      token:    session.access_token,
      shopId:   session.user.id,
      shopName,
      phone:    session.user.phone || '',
    })
    // Register/update shop name on backend
    try {
      const { api } = await import('./api/client.js')
      await api.post('/api/shops', { name: shopName })
    } catch { /* non-fatal */ }
    await hydrate()
  }

  if (!isConfigured) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-sm w-full space-y-4">
        <div className="text-4xl">⚙️</div>
        <h2 className="text-xl font-bold text-gray-900">Supabase not configured</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          Copy <code className="bg-gray-100 px-1.5 py-0.5 rounded text-green-700">.env.example</code> to{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-green-700">.env</code> and fill in your
          Supabase project URL and anon key, then restart the dev server.
        </p>
        <div className="bg-gray-900 rounded-xl p-4 text-xs text-green-400 font-mono space-y-1">
          <p>VITE_SUPABASE_URL=https://xxx.supabase.co</p>
          <p>VITE_SUPABASE_ANON_KEY=eyJ...</p>
          <p>VITE_API_URL=http://localhost:3001</p>
        </div>
        <a href="https://supabase.com" target="_blank" rel="noreferrer"
          className="block text-center bg-green-600 text-white font-semibold py-3 rounded-2xl text-sm">
          Get free Supabase project →
        </a>
      </div>
    </div>
  )

  if (booting) return <ToastProvider><Spinner /></ToastProvider>

  return (
    <ToastProvider>
      {token ? <AppShell /> : <Auth onAuth={handleAuth} />}
    </ToastProvider>
  )
}
