import { create } from 'zustand'
import { api, normaliseProduct, normaliseCustomer } from '../api/client.js'

// ── local cache helpers ───────────────────────────────────────────────────────
const cache = {
  get: (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb } catch { return fb } },
  set: (k, v)  => localStorage.setItem(k, JSON.stringify(v)),
}

// ── store ─────────────────────────────────────────────────────────────────────
const useStore = create((set, get) => ({
  // ── auth ───────────────────────────────────────────────────────────────────
  token:    localStorage.getItem('kirana_token') || null,
  shopId:   localStorage.getItem('kirana_shop_id') || null,
  shopName: localStorage.getItem('kirana_shop_name') || '',
  ownerPhone: localStorage.getItem('kirana_phone') || '',

  setAuth: ({ token, shopId, shopName, phone }) => {
    localStorage.setItem('kirana_token', token)
    localStorage.setItem('kirana_shop_id', shopId)
    localStorage.setItem('kirana_shop_name', shopName)
    localStorage.setItem('kirana_phone', phone)
    set({ token, shopId, shopName, ownerPhone: phone })
  },

  logout: () => {
    ['kirana_token','kirana_shop_id','kirana_shop_name','kirana_phone'].forEach(k => localStorage.removeItem(k))
    set({ token: null, shopId: null, shopName: '', ownerPhone: '' })
  },

  // ── loading / error ────────────────────────────────────────────────────────
  loading: false,
  error: null,
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  // ── products ───────────────────────────────────────────────────────────────
  products: cache.get('products', []),

  fetchProducts: async () => {
    try {
      const data = await api.get('/api/products')
      const products = data.map(normaliseProduct)
      cache.set('products', products)
      set({ products })
    } catch (e) {
      console.warn('fetchProducts:', e.message)
    }
  },

  addProduct: async (p) => {
    const data = await api.post('/api/products', {
      name: p.name, price: p.price, unit: p.unit,
      category: p.category, inStock: p.inStock, aliases: p.aliases ?? [],
    })
    const product = normaliseProduct(data)
    set(s => {
      const products = [...s.products, product]
      cache.set('products', products)
      return { products }
    })
    return product
  },

  updateProduct: async (id, patch) => {
    const data = await api.put(`/api/products/${id}`, {
      name: patch.name, price: patch.price, unit: patch.unit,
      category: patch.category, inStock: patch.inStock, aliases: patch.aliases,
    })
    const updated = normaliseProduct(data)
    set(s => {
      const products = s.products.map(p => p.id === id ? updated : p)
      cache.set('products', products)
      return { products }
    })
  },

  deleteProduct: async (id) => {
    await api.delete(`/api/products/${id}`)
    set(s => {
      const products = s.products.filter(p => p.id !== id)
      cache.set('products', products)
      return { products }
    })
  },

  toggleStock: async (id) => {
    const product = get().products.find(p => p.id === id)
    if (!product) return
    await get().updateProduct(id, { inStock: !product.inStock })
  },

  // ── customers ──────────────────────────────────────────────────────────────
  customers: cache.get('customers', []),

  fetchCustomers: async () => {
    try {
      const data = await api.get('/api/customers')
      const customers = data.map(normaliseCustomer)
      cache.set('customers', customers)
      set({ customers })
    } catch (e) {
      console.warn('fetchCustomers:', e.message)
    }
  },

  addCustomer: async (c) => {
    const data = await api.post('/api/customers', { name: c.name, phone: c.phone, notes: c.notes })
    const customer = normaliseCustomer(data)
    set(s => {
      const customers = [...s.customers, customer]
      cache.set('customers', customers)
      return { customers }
    })
    return customer
  },

  updateCustomer: async (id, patch) => {
    const data = await api.put(`/api/customers/${id}`, patch)
    const updated = normaliseCustomer(data)
    set(s => {
      const customers = s.customers.map(c => c.id === id ? updated : c)
      cache.set('customers', customers)
      return { customers }
    })
  },

  addUdhaar: async (id, amount) => {
    const data = await api.patch(`/api/customers/${id}/udhaar`, { delta: amount })
    const updated = normaliseCustomer(data)
    set(s => {
      const customers = s.customers.map(c => c.id === id ? updated : c)
      cache.set('customers', customers)
      return { customers }
    })
  },

  clearUdhaar: async (id, amount) => {
    const data = await api.patch(`/api/customers/${id}/udhaar`, { delta: -amount })
    const updated = normaliseCustomer(data)
    set(s => {
      const customers = s.customers.map(c => c.id === id ? updated : c)
      cache.set('customers', customers)
      return { customers }
    })
  },

  // ── orders ─────────────────────────────────────────────────────────────────
  orders: cache.get('orders', []),

  fetchOrders: async () => {
    try {
      const data = await api.get('/api/orders')
      cache.set('orders', data)
      set({ orders: data })
    } catch (e) {
      console.warn('fetchOrders:', e.message)
    }
  },

  addOrder: async (order) => {
    const data = await api.post('/api/orders', order)
    const newOrder = { ...data, createdAt: data.created_at ?? data.createdAt ?? new Date().toISOString() }
    set(s => {
      const orders = [newOrder, ...s.orders]
      cache.set('orders', orders)
      return { orders }
    })
    return newOrder
  },

  updateOrder: async (id, patch) => {
    await api.put(`/api/orders/${id}`, patch)
    set(s => {
      const orders = s.orders.map(o => o.id === id ? { ...o, ...patch } : o)
      cache.set('orders', orders)
      return { orders }
    })
  },

  deleteOrder: async (id) => {
    await api.delete(`/api/orders/${id}`)
    set(s => {
      const orders = s.orders.filter(o => o.id !== id)
      cache.set('orders', orders)
      return { orders }
    })
  },

  // ── hydrate all data after login ───────────────────────────────────────────
  hydrate: async () => {
    set({ loading: true })
    await Promise.all([
      get().fetchProducts(),
      get().fetchCustomers(),
      get().fetchOrders(),
    ])
    set({ loading: false })
  },
}))

export default useStore
