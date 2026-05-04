import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ToastProvider } from './components/Toast'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Catalog from './pages/Catalog'
import Orders from './pages/Orders'
import Customers from './pages/Customers'
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
  const hydrate              = useStore(s => s.hydrate)
  const loading              = useStore(s => s.loading)
  const shopId               = useStore(s => s.shopId)
  const shopName             = useStore(s => s.shopName)
  const setIncomingMessages  = useStore(s => s.setIncomingMessages)
  const addIncomingMessage   = useStore(s => s.addIncomingMessage)

  useEffect(() => {
    // Ensure the shop row exists in the DB on every app load.
    // POST /api/shops uses upsert (ON CONFLICT DO UPDATE) so this is always safe.
    // Critical for returning users whose session is restored from localStorage —
    // they skip handleAuth so the shop row may not exist, causing FK errors on products.
    if (shopName) {
      import('./api/client.js').then(({ api }) =>
        api.post('/api/shops', { name: shopName }).catch(() => {/* non-fatal */})
      )
    }

    hydrate()

    // Fetch any pending incoming messages that arrived while the app was closed
    if (shopId) {
      supabase
        .from('incoming_whatsapp')
        .select('*')
        .eq('shop_id', shopId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data }) => { if (data?.length) setIncomingMessages(data) })
    }

    // Supabase Realtime — new incoming messages arrive here in real-time
    const channel = supabase
      .channel('incoming_whatsapp_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incoming_whatsapp' },
        payload => addIncomingMessage(payload.new)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

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
            <Route path="/day"       element={<Navigate to="/orders" replace />} />
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
    let cancelled = false

    // Hard fallback: never let the boot spinner hang. If Supabase auth deadlocks
    // (gotrue-js lock contention is a known issue), proceed to the sign-in screen
    // after 3s and let the user log in fresh.
    const bootTimeout = setTimeout(() => {
      if (!cancelled) setBooting(false)
    }, 3000)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      if (session && !token) {
        const phone        = session.user.phone || ''
        const fromMetadata = session.user.user_metadata?.shop_name
        const fromStorage  = localStorage.getItem('kirana_shop_name')
        let name           = fromMetadata || fromStorage || ''

        // Last-resort fallback: fetch from backend (covers accounts that were
        // created before user_metadata persistence and are now signing in
        // from a fresh incognito / different device with no localStorage).
        if (!name) {
          try {
            // Stage the token so api.get() can authenticate.
            localStorage.setItem('kirana_token', session.access_token)
            const { api } = await import('./api/client.js')
            const shop = await api.get('/api/shops')
            if (shop?.name) name = shop.name
          } catch {
            localStorage.removeItem('kirana_token')
          }
        }

        if (cancelled) return
        if (name) {
          setAuth({ token: session.access_token, shopId: session.user.id, shopName: name, phone })
          // Backfill user_metadata so this round-trip isn't needed next time.
          if (!fromMetadata) {
            supabase.auth.updateUser({ data: { shop_name: name } }).catch(() => {})
          }
        }
      }
      clearTimeout(bootTimeout)
      setBooting(false)
    }).catch(() => {
      if (cancelled) return
      clearTimeout(bootTimeout)
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
    return () => {
      cancelled = true
      clearTimeout(bootTimeout)
      subscription.unsubscribe()
    }
  }, [])

  async function handleAuth(session, shopName) {
    setAuth({
      token:    session.access_token,
      shopId:   session.user.id,
      shopName,
      phone:    session.user.phone || '',
    })
    // Persist shop name to Supabase user_metadata so it survives localStorage clears
    // (incognito, different device, etc.) and is read by App on next login.
    try { await supabase.auth.updateUser({ data: { shop_name: shopName } }) } catch {}
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
