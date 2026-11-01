/**
 * Records each director scene of the running frontend as a 1920 × 1080, 30 fps H.264 clip cut to its beat window
 * (beats.json, from demo/SCRIPT.md v4), plus the app's sound events and a contact sheet.
 *
 *   node capture.mjs [--source repo|mock] [--no-fallback] [--mock scene,...] [--mode frames|video] [--base URL] [scene ...]
 *
 * --source repo (default) reads <repo>/frontend-mock (the backend's run); a scene the director skips on it for missing
 * data falls back to the frontend's built-in mock unless --no-fallback is given; --mock a,b forces scenes onto the
 * mock. Every clip's source is written to captures/manifest.json and stamped in the film.
 *
 * --mode frames (default): frame-exact. A virtual clock (lib/vclock.js) stops page time; each frame advances it by
 * 1/30 s, takes a lossless screenshot and pipes it to ffmpeg, so the clip is smooth and sharp whatever the machine
 * does. --mode video: Playwright's recordVideo in real time (25 fps VP8, ~1 Mbit/s), trimmed with ffmpeg; softer, kept
 * as a fallback.
 *
 * Out: captures/<scene>.mp4, captures/<scene>.events.json (the app's sound cues, seconds from the beat start),
 * captures/<scene>.contact.png (first / middle / last frame), captures/manifest.json.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'captures')
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
const BEATS = JSON.parse(readFileSync(join(HERE, 'beats.json'), 'utf8'))
const FPS = BEATS.fps
const W = BEATS.width
const H = BEATS.height

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return dflt
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return false
  args.splice(i, 1)
  return true
}
const SOURCE = opt('source', 'repo')
const MODE = opt('mode', 'frames')
const BASE = opt('base', 'http://localhost:5195')
const NO_FALLBACK = flag('no-fallback')
/** --mock drop,bill: force these scenes onto the built-in mock (e.g. while the repo run is a stand-in). */
const FORCE_MOCK = (opt('mock', '') || '').split(',').filter(Boolean)
const ALL = BEATS.beats.filter((b) => b.scene).map((b) => b.scene)
const wanted = args.length ? args : ALL
for (const s of wanted) if (!ALL.includes(s)) throw new Error(`unknown scene ${s}; one of ${ALL.join(', ')}`)

mkdirSync(OUT, { recursive: true })
const manifestFile = join(OUT, 'manifest.json')
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {}
const VCLOCK = readFileSync(join(HERE, 'lib', 'vclock.js'), 'utf8')
const VITE_STUB = readFileSync(join(HERE, 'lib', 'vite-client-stub.js'), 'utf8')
/** No HMR during a take: serve a stub for Vite's client (styles only). */
const freeze = (context) => context.route((u) => new URL(u).pathname === '/@vite/client', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: VITE_STUB }))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = (scene, source) => `${BASE}/?director=1&auto=1&hold=1&scale=1&mute=1&source=${source}#scene=${scene}`

function ffmpeg(argv, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] })
    p.on('error', reject)
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${argv.join(' ')}`))))
    if (input) input(p.stdin)
  })
}

/** What the page shows once the run has loaded: the scene, or the director's Ready card (scene skipped). */
async function waitForStage(page, step) {
  for (let i = 0; i < 600; i++) {
    const state = await page.evaluate(() => {
      const t = document.body.innerText
      if (/space to start/i.test(t)) return 'skipped'
      if (/answer key in repo/i.test(t)) return 'ready'
      return 'loading'
    })
    if (state !== 'loading') return state
    if (step) await step()
    await sleep(30)
  }
  throw new Error('the director did not load in 18 s')
}

async function contact(frames, file) {
  const tmp = frames.map((buf, i) => {
    const f = join(OUT, `.contact-${i}.png`)
    writeFileSync(f, buf)
    return f
  })
  await ffmpeg([...tmp.flatMap((f) => ['-i', f]), '-filter_complex',
    `${tmp.map((_, i) => `[${i}:v]scale=640:360,pad=644:364:2:2:white[v${i}]`).join(';')};${tmp.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${tmp.length}`, file])
  for (const f of tmp) rmSync(f)
}

async function captureFrames(browser, scene, source, seconds, lead = 0) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  await context.addInitScript({ content: VCLOCK })
  await freeze(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url(scene, source), { waitUntil: 'load' })
  const state = await waitForStage(page, () => page.evaluate(() => window.__vclock.step(30)))
  if (state === 'skipped') {
    await context.close()
    return { skipped: true }
  }
  // let images and fonts arrive with page time stopped
  await page.evaluate(async () => { await document.fonts.ready })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r })))))
  // skip the scene's first `lead` seconds frame by frame (no screenshots), so animations step as they would on screen
  for (let i = 0; i < Math.round(lead * FPS); i++) await page.evaluate((ms) => window.__vclock.step(ms), 1000 / FPS)
  const t0 = await page.evaluate(() => window.__vclock.mark())
  const cdp = await context.newCDPSession(page)
  const total = Math.round(seconds * FPS)
  const keep = new Map([[0, null], [Math.floor(total / 2), null], [total - 1, null]])
  const raw = join(OUT, `.${scene}.raw.mp4`)
  let feed
  const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', raw], (stdin) => { feed = stdin })
  const started = Date.now()
  for (let i = 0; i < total; i++) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
    const buf = Buffer.from(shot.data, 'base64')
    if (keep.has(i)) keep.set(i, buf)
    if (!feed.write(buf)) await new Promise((r) => feed.once('drain', r))
    await page.evaluate((ms) => window.__vclock.step(ms), 1000 / FPS)
    if (i % (FPS * 5) === 0) process.stdout.write(`  ${scene}: ${(i / FPS).toFixed(0)} s of ${seconds} s (${((Date.now() - started) / 1000).toFixed(0)} s wall)\n`)
  }
  feed.end()
  await enc
  const events = await page.evaluate((t) => window.__vclock.events.filter((e) => e.t >= t).map((e) => ({ ...e, t: (e.t - t) / 1000 })), t0)
  await context.close()
  return { raw, events: events.filter((e) => e.t < seconds), frames: [...keep.values()], errors, trimFrom: 0 }
}

async function captureVideo(browser, scene, source, seconds, lead = 0) {
  const dir = join(OUT, '.video')
  mkdirSync(dir, { recursive: true })
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir, size: { width: W, height: H } } })
  await freeze(context)
  const born = Date.now()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url(scene, source), { waitUntil: 'load' })
  const state = await waitForStage(page)
  const trimFrom = (Date.now() - born) / 1000 + lead
  if (state === 'skipped') {
    await context.close()
    return { skipped: true }
  }
  await sleep(seconds * 1000 + 500)
  const video = page.video()
  await context.close()
  const webm = await video.path()
  const raw = join(OUT, `.${scene}.raw.mp4`)
  await ffmpeg(['-ss', trimFrom.toFixed(3), '-i', webm, '-t', String(seconds), '-vf', `fps=${FPS}`, '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', raw])
  rmSync(webm)
  const frames = []
  for (const at of [0, seconds / 2, seconds - 0.05]) {
    const f = join(OUT, '.frame.png')
    await ffmpeg(['-ss', String(at), '-i', raw, '-frames:v', '1', f])
    frames.push(readFileSync(f))
    rmSync(f)
  }
  return { raw, events: [], frames, errors, trimFrom: 0, note: 'recordVideo: real time, no sound cues' }
}

const browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'] })
try {
  for (const scene of wanted) {
    const beat = BEATS.beats.find((b) => b.scene === scene)
    const seconds = beat.end - beat.start
    let source = FORCE_MOCK.includes(scene) ? 'mock' : SOURCE
    const why = source !== SOURCE ? `forced onto the mock (--mock)` : undefined
    console.log(`${scene}: beat ${beat.n}, ${seconds} s, source=${source}${why ? ` (${why})` : ''}, mode=${MODE}`)
    const once = MODE === 'video' ? captureVideo : captureFrames
    // a page reload mid-take (e.g. the dev server restarting) destroys the context: take it again
    const run = async (...a) => {
      for (let attempt = 1; ; attempt++) {
        try { return await once(...a) } catch (e) {
          if (attempt >= 3 || !/context was destroyed|navigat|Target closed|has been closed/i.test(String(e))) throw e
          console.log(`  take ${attempt} lost (${String(e).split('\n')[0]}); again in 3 s`)
          await sleep(3000)
        }
      }
    }
    let res = await run(browser, scene, source, seconds, beat.lead ?? 0)
    let fellBack = why
    if (res.skipped && source !== 'mock' && !NO_FALLBACK) {
      fellBack = `the director skips ${scene} on source=${source} (data missing)`
      console.log(`  ${fellBack}; falling back to source=mock`)
      source = 'mock'
      res = await run(browser, scene, source, seconds, beat.lead ?? 0)
    }
    if (res.skipped) throw new Error(`${scene}: the director skips this scene on source=${source}`)
    const out = join(OUT, `${scene}.mp4`)
    // the beat window, exactly: ffmpeg trims (and pads a short clip by holding its last frame)
    await ffmpeg(['-ss', String(res.trimFrom), '-i', res.raw, '-t', String(seconds), '-vf', `tpad=stop_mode=clone:stop_duration=1,fps=${FPS}`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${out}.tmp.mp4`])
    renameSync(`${out}.tmp.mp4`, out)
    rmSync(res.raw)
    writeFileSync(join(OUT, `${scene}.events.json`), JSON.stringify(res.events, null, 1))
    await contact(res.frames, join(OUT, `${scene}.contact.png`))
    manifest[scene] = {
      beat: beat.n, source, fallback: fellBack ?? null, mode: MODE, url: url(scene, source), seconds, lead: beat.lead ?? 0, fps: FPS,
      sound_cues: res.events.length, page_errors: res.errors.slice(0, 5), note: res.note ?? null, captured_at: new Date().toISOString(),
    }
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
    console.log(`  → ${out} · ${res.events.length} sound cues${res.errors.length ? ` · ${res.errors.length} page errors` : ''}`)
  }
} finally {
  await browser.close()
}
