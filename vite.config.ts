import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Cross-origin isolation headers — required for SharedArrayBuffer (whisper.cpp
// + ffmpeg threads). Applied to both dev and preview servers (ADR-0001).
function crossOriginIsolation(): Plugin {
  const headers = (res: { setHeader(k: string, v: string): void }) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  }
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => (headers(res), next()))
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => (headers(res), next()))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), crossOriginIsolation()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  worker: { format: 'es' },
  optimizeDeps: {
    // ffmpeg.wasm ships its own workers; let Vite serve it untouched.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
