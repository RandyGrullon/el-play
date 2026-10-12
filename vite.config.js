import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const API_PORT = process.env.API_PORT || 5001

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    // La app llama siempre a /api (mismo origen, como en Vercel); en desarrollo Vite lo pasa al backend
    proxy: { '/api': `http://localhost:${API_PORT}` }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'apple-touch-icon.png'],
      workbox: {
        // Evita "Unexpected early exit" de terser en build (race con rollup)
        mode: 'development',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Sin conexión se muestra lo último que cargó (la red siempre tiene prioridad)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v2/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'el-play-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 80, maxAgeSeconds: 2 * 24 * 60 * 60 }
            }
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://www.mlbstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'el-play-logos',
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'el-play-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 } }
          }
        ]
      },
      manifest: {
        name: 'El Play - Béisbol en vivo',
        short_name: 'El Play',
        description: 'LIDOM, Serie del Caribe y Clásico Mundial en vivo, con la zona de strike pitcheo a pitcheo.',
        lang: 'es',
        theme_color: '#f6f6f9',
        background_color: '#f6f6f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
