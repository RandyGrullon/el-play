import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const API_PORT = process.env.API_PORT || 5001

// Versión de este build: la misma que escribe generate-version.js en public/version.json (se corre antes de vite build).
// La app la compara con la que hay en el servidor para saber si lo que está corriendo quedó viejo.
const APP_VERSION = (() => {
  try {
    return JSON.parse(readFileSync('./public/version.json', 'utf8')).version || 'dev'
  } catch {
    return 'dev'
  }
})()

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    // La app llama siempre a /api (mismo origen, como en Vercel); en desarrollo Vite lo pasa al backend
    proxy: { '/api': `http://localhost:${API_PORT}` }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'icons/logo-v2.svg', 'icons/apple-touch-icon-v2.png'],
      workbox: {
        // Recarga las pantallas que siguen con la primera versión (ver public/sw-legacy.js)
        importScripts: ['sw-legacy.js'],
        // Evita "Unexpected early exit" de terser en build (race con rollup)
        mode: 'development',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/version\.json/, /^\/sw-legacy\.js/],
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
        // Mismo id que tenían las instalaciones viejas (sin id se usaba start_url): así se actualizan, no se duplican
        id: '/',
        start_url: '/',
        // Íconos con nombre nuevo para que las apps ya instaladas cambien al logo nuevo
        icons: [
          { src: '/icons/icon-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
})
