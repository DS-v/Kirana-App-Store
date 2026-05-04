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
        // Same precache pattern as the original config — this is the proven
        // setup the app shipped with for months. The post-OAuth blank-screen
        // fix doesn't actually require NetworkFirst-for-HTML; the three
        // workbox flags below (cleanupOutdatedCaches + skipWaiting +
        // clientsClaim) are sufficient to make the new SW drop stale
        // precache entries and take over immediately on next reload.
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // On new SW activation: delete precache entries whose URL no
        // longer matches the new manifest. Without this, the OLD SW's
        // cached index.html (referencing /assets/index-<OLD-HASH>.js
        // that Railway has already deleted) sticks around and causes
        // the post-OAuth blank-screen crash.
        cleanupOutdatedCaches: true,
        // Make the new SW take over without requiring a full browser
        // restart — combined with cleanupOutdatedCaches, this self-heals
        // after one reload.
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
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
