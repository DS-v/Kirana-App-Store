const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function request(method, path, body) {
  const token = localStorage.getItem('kirana_token')
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
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
