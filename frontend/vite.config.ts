import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

/** Serves the backend agent's mock responses from <repo>/frontend-mock/ at /frontend-mock/ (dev and preview). */
function repoMock(): Plugin {
  const root = resolve(import.meta.dirname, '..', 'frontend-mock')
  const types: Record<string, string> = { '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? '').split('?')[0]
    if (!url.startsWith('/frontend-mock/')) return next()
    const file = normalize(join(root, decodeURIComponent(url.slice('/frontend-mock/'.length))))
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404
      res.end('not found')
      return
    }
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    res.end(readFileSync(file))
  }
  return {
    name: 'landsight-repo-mock',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), repoMock()],
  server: {
    port: 5195,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8795', changeOrigin: true } },
  },
  preview: {
    port: 5195,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8795', changeOrigin: true } },
  },
})
