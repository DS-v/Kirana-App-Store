// Normalise the API URL: add https:// if no protocol is specified
// (guards against Railway env var set as "foo.up.railway.app" without https://)
function normaliseBase(url) {
  if (!url) return 'http://localhost:3001'
  if (/^https?:\/\//i.test(url)) return url.replace(/\/$/, '')
  return `https://${url.replace(/\/$/, '')}`
}
const BASE = normaliseBase(import.meta.env.VITE_API_URL)

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
