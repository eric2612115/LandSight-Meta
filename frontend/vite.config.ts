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

/** The API the dev server proxies /api to: :8795 unless VITE_API_PORT says otherwise
 * (`uv run python -m landsight serve --port 8796` + `VITE_API_PORT=8796 npm run dev`). */
const API = `http://127.0.0.1:${process.env.VITE_API_PORT || '8795'}`

// strictPort false: when 5195 is taken, Vite takes the next free port and prints it (or pin one with --port)
export default defineConfig({
  plugins: [react(), tailwindcss(), repoMock()],
  server: {
    port: 5195,
    strictPort: false,
    proxy: { '/api': { target: API, changeOrigin: true } },
  },
  preview: {
    port: 5195,
    strictPort: false,
    proxy: { '/api': { target: API, changeOrigin: true } },
  },
})
