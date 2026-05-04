import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    port: parseInt(process.env.PORT || '5173'),
    allowedHosts: true,
  },
  preview: {
    port: parseInt(process.env.PORT || '4173'),
    host: true,
    allowedHosts: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Kirana Smart Orders',
        short_name: 'Kirana',
        description: 'Smart order and catalog management for kirana stores',
        theme_color: '#16a34a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ],
        // PWA Share Target: when shopkeeper shares a WhatsApp message to this app,
        // it opens /orders?text=<message> and the order is auto-parsed.
        share_target: {
          action: '/orders',
          method: 'GET',
          params: { text: 'text', title: 'title', url: 'url' }
        }
      },
      workbox: {
        // Precache static assets only — exclude HTML so the document is always
        // fetched network-first. Otherwise an OLD service worker can serve a
        // cached index.html that references hashed bundle URLs that the new
        // deploy has already deleted, causing a "blank-screen-after-OAuth"
        // crash where the app comes back from Google → tries to load
        // /assets/index-<old-hash>.js → 404 → React never mounts.
        globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest}'],
        // Don't fall back to cached index.html for navigations — let the
        // NetworkFirst rule below handle it.
        navigateFallback: null,
        // When a new SW activates, drop precache entries whose URL/revision
        // no longer matches. Combined with skipWaiting (default for
        // registerType:'autoUpdate'), this self-heals after one reload.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          // 1) HTML / page navigations — always try the network first so a
          //    fresh index.html (with current hashed asset URLs) wins. Falls
          //    back to cache only if offline. 3s timeout keeps mobile fast.
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // 2) Hashed JS/CSS chunks — content-addressable, safe to cache
          //    long-term. Keeps offline support working.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // 3) Google Fonts.
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' },
          },
        ],
      }
    })
  ]
})
