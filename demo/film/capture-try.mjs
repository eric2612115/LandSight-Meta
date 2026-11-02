/**
 * Captures the film's Part 2 — the quick review at /try played by its director (frontend/src/try/director.tsx) —
 * frame-exact on a virtual clock (lib/vclock.js): each frame advances page time by 1/fps, takes a lossless
 * screenshot and pipes it to ffmpeg, so the clip is smooth and sharp however slow the machine is.
 *
 *   node capture-try.mjs [--fps 60] [--dpr 2] [--out try-4k60] [--source live|repo] [--base URL] [--seconds N]
 *
 * Defaults are the film's: 1920 × 1080 CSS px at deviceScaleFactor 2 (3840 × 2160), 60 fps, source live, out
 * captures/try-4k60.mp4 plus captures/try-cues.json (the director's sound cues {t, name}, seconds from the first
 * frame) — for a test: `--fps 30 --dpr 1 --out try-test`. The director loads everything the take needs before t0
 * (`window.__director.ready`); the capture then calls `__director.start()` (the page is opened with `&wait=1`) and
 * records `__director.duration`.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'captures')
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? dflt : args[i + 1]
}
const FPS = Number(opt('fps', '60'))
const DPR = Number(opt('dpr', '2'))
const NAME = opt('out', 'try-4k60')
const SOURCE = opt('source', 'live')
const BASE = opt('base', 'http://localhost:5195')
const SECONDS = opt('seconds', '')
const W = 1920
const H = 1080
const URL_ = `${BASE}/try?director=1&sample=greenfield&scale=1&wait=1&mute=1&source=${SOURCE}`

const VCLOCK = readFileSync(join(HERE, 'lib', 'vclock.js'), 'utf8')
const VITE_STUB = readFileSync(join(HERE, 'lib', 'vite-client-stub.js'), 'utf8')
mkdirSync(OUT, { recursive: true })

function ffmpeg(argv, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] })
    p.on('error', reject)
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
    if (input) input(p.stdin)
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'] })
try {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
  await context.addInitScript({ content: VCLOCK })
  // no HMR during a take: Vite's client is a stub (styles only)
  await context.route((u) => new URL(u).pathname === '/@vite/client', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: VITE_STUB }))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(URL_, { waitUntil: 'load' })
  // the director loads the run, the sheets, the images and the recorded answer (real network): step page time
  // lightly until it says ready
  for (let i = 0; ; i++) {
    if (await page.evaluate(() => window.__director?.ready === true)) break
    if (i > 1500) throw new Error('the director was not ready in 45 s')
    await page.evaluate(() => window.__vclock.step(30))
    await sleep(30)
  }
  await page.evaluate(async () => { await document.fonts.ready })
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r })))))
  const duration = SECONDS ? Number(SECONDS) * 1000 : await page.evaluate(() => window.__director.duration)
  await page.evaluate(() => window.__director.start())
  await page.evaluate(() => window.__vclock.step(0))
  const cdp = await context.newCDPSession(page)
  const total = Math.round((duration / 1000) * FPS)
  const file = join(OUT, `${NAME}.mp4`)
  let feed
  const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', file], (stdin) => { feed = stdin })
  const started = Date.now()
  for (let i = 0; i < total; i++) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
    const buf = Buffer.from(shot.data, 'base64')
    if (!feed.write(buf)) await new Promise((r) => feed.once('drain', r))
    await page.evaluate((ms) => window.__vclock.step(ms), 1000 / FPS)
    if (i % (FPS * 10) === 0) process.stdout.write(`  ${(i / FPS).toFixed(0)} s of ${(duration / 1000).toFixed(0)} s (${((Date.now() - started) / 1000).toFixed(0)} s wall)\n`)
  }
  feed.end()
  await enc
  const cues = await page.evaluate(() => window.__cues ?? [])
  const state = await page.evaluate(() => ({ done: window.__director.done, t: window.__director.t }))
  const cueFile = join(OUT, NAME === 'try-4k60' ? 'try-cues.json' : `${NAME}.cues.json`)
  writeFileSync(cueFile, JSON.stringify({ url: URL_, fps: FPS, dpr: DPR, duration_s: duration / 1000, director: state, page_errors: errors.slice(0, 10), cues }, null, 1))
  console.log(`→ ${file} · ${total} frames · ${cues.length} cues → ${cueFile}${errors.length ? ` · ${errors.length} page errors: ${errors.slice(0, 3).join(' | ')}` : ''}`)
  await context.close()
} finally {
  await browser.close()
}
