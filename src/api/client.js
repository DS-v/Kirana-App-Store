function getApiBase() {
  const raw = import.meta.env.VITE_API_URL
  if (raw) {
    return /^https?:\/\//i.test(raw) ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
  }
  // Fallback for Railway: frontend is kirana-frontend-*.up.railway.app,
  // backend is kirana-app-store-*.up.railway.app
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.railway.app')) {
    return `https://${window.location.hostname.replace(/^kirana-frontend/, 'kirana-app-store')}`
  }
  return 'http://localhost:3001'
}
const BASE = getApiBase()

async function request(method, path, body) {
  const token = localStorage.getItem('kirana_token')
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (networkErr) {
    throw new Error(`Cannot reach server — check your internet or backend URL (${BASE})`)
  }

  if (res.status === 204) return null

  // Safely parse JSON — handle empty or non-JSON bodies (e.g. 502 from Railway)
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error(`Server error (${res.status}) — backend may be down or misconfigured`)
  }

  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  patch:  (path, body)  => request('PATCH',  path, body),
  delete: (path)        => request('DELETE', path),
}

// Normalise Supabase snake_case response to camelCase for products
export function normaliseProduct(p) {
  return {
    id:        p.id,
    name:      p.name,
    aliases:   p.aliases ?? [],
    price:     Number(p.price),
    unit:      p.unit,
    category:  p.category,
    inStock:   p.in_stock ?? p.inStock ?? true,
  }
}

export function normaliseCustomer(c) {
  return {
    id:      c.id,
    name:    c.name,
    phone:   c.phone ?? '',
    udhaar:  Number(c.udhaar ?? 0),
    notes:   c.notes ?? '',
  }
}

/**
 * Calls /api/llm/parse-catalog on free-form text and returns
 * Array<{name,price,unit,category,inStock}> or null on any failure
 * (network, timeout, LLM unavailable). Caller should fall back to a
 * local regex parser when this returns null.
 */
export async function aiParseCatalog(text, { timeoutMs = 15000 } = {}) {
  if (!text || !text.trim()) return null
  try {
    const data = await Promise.race([
      api.post('/api/llm/parse-catalog', { text }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ])
    if (!data?.products?.length) return null
    return data.products.map(p => ({
      name:     String(p.name || '').trim(),
      price:    Number(p.price) || 0,
      unit:     p.unit || 'packet',
      category: p.category || 'Other',
      inStock:  true,
    })).filter(p => p.name)
  } catch {
    return null
  }
}
