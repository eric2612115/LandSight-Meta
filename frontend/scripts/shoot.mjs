/**
 * Screenshots of the running app at exactly 1920 × 1080, in real time (so framer-motion and the scene timings run
 * as they do on screen). Uses the locally installed Google Chrome over the DevTools protocol; no extra packages.
 *
 *   node scripts/shoot.mjs <out-dir> <name>=<url>@<ms> [<name>=<url>@<ms> ...]
 *
 * e.g. node scripts/shoot.mjs screenshots plain=http://localhost:5195/?scale=1@4000
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [outDir, ...jobs] = process.argv.slice(2)
if (!outDir || !jobs.length) {
  console.error('usage: node scripts/shoot.mjs <out-dir> <name>=<url>@<ms> ...')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })
const port = 9300 + Math.floor(Math.random() * 400)
const profile = mkdtempSync(join(tmpdir(), 'landsight-shoot-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars',
  '--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* not up yet */ }
    await sleep(250)
  }
  throw new Error('chrome did not start')
}

try {
  const ws = new WebSocket(await target())
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0
  const waiting = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(String(m.data))
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id) }
  }
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  for (const job of jobs) {
    const eq = job.indexOf('=')
    const at = job.lastIndexOf('@')
    const name = job.slice(0, eq)
    const url = job.slice(eq + 1, at)
    const ms = Number(job.slice(at + 1))
    await send('Page.navigate', { url: 'about:blank' })
    await sleep(150)
    await send('Page.navigate', { url })
    await sleep(ms)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const file = join(outDir, `${name}.png`)
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
    console.log(`${file}  (${url} @ ${ms} ms)`)
  }
  ws.close()
} finally {
  chrome.kill()
}
