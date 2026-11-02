/**
 * 1920 × 1080 screenshots of the running frontend in real time with Playwright (demo/film's dependency; run
 * `npm ci` there once), where a shot needs a click, a drop or a wait that scripts/shoot.mjs cannot do:
 *
 *   node scripts/shoot-pw.mjs --url <url> [--wait MS] [--out F.png]
 *                             [--click SELECTOR] [--await SELECTOR] [--shots MS:F1.png,MS:F2.png] [--drop N] [--reduced]
 *
 * --wait: after load, before anything else (default 3000). --click: a Playwright selector (e.g. "text=Open the sample
 * package"). --await: a selector to wait for after the click (e.g. "[data-cascade-count]", the cascade's first row);
 * --shots are taken that many ms after it appears (after the click, or the wait, when there is none). --drop N drops
 * the first N files of the sample folder on the drop zone (a synthetic DataTransfer, as a browser would hand them
 * over loose). --reduced emulates prefers-reduced-motion.
 *
 *   node scripts/shoot-pw.mjs --url 'http://localhost:5195/open?source=live&scale=1' --click 'text=Open the sample package' \
 *     --await '[data-cascade-count]' --shots 1100:screenshots/v2/open-cascade-mid.png,3300:screenshots/v2/open-cascade-end.png
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const { chromium } = createRequire(import.meta.url)(join(REPO, 'demo', 'film', 'node_modules', 'playwright'))

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? dflt : args[i + 1]
}
const url = opt('url')
if (!url) {
  console.error('usage: node scripts/shoot-pw.mjs --url <url> [--wait MS] [--out F.png] [--click SEL] [--await SEL] [--shots MS:F.png,…] [--drop N] [--reduced]')
  process.exit(2)
}
const out = opt('out')
const wait = Number(opt('wait', '3000'))
const click = opt('click')
const awaitSel = opt('await')
const drop = Number(opt('drop', '0'))
const reduced = args.includes('--reduced')
const shots = (opt('shots', '') || '').split(',').filter(Boolean).map((s) => {
  const i = s.indexOf(':')
  return { at: Number(s.slice(0, i)), file: s.slice(i + 1) }
}).sort((a, b) => a.at - b.at)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}] ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))
  // 'load', not 'networkidle': the dev server's HMR socket never goes idle
  await page.goto(url, { waitUntil: 'load' })
  await sleep(wait)
  if (drop > 0) {
    const folder = join(REPO, 'samples', 'greenfield', 'Greenfield Residences — Landscape Package')
    const names = readdirSync(folder).filter((n) => !n.startsWith('.') && statSync(join(folder, n)).isFile()).sort().slice(0, drop)
    const files = names.map((n) => ({ name: n, b64: readFileSync(join(folder, n)).toString('base64') }))
    const dt = await page.evaluateHandle((files) => {
      const dt = new DataTransfer()
      for (const f of files) {
        const bin = atob(f.b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const file = new File([bytes], f.name)
        Object.defineProperty(file, 'webkitRelativePath', { value: `judge-drop/${f.name}` })
        dt.items.add(file)
      }
      return dt
    }, files)
    await page.dispatchEvent('text=Drop the developer’s package here', 'drop', { dataTransfer: dt })
    console.log(`dropped ${names.length} files: ${names.join(', ')}`)
  }
  if (click) {
    await page.click(click)
    console.log(`clicked ${click}`)
  }
  if (awaitSel) {
    const t0 = Date.now()
    await page.waitForSelector(awaitSel, { timeout: 120000, state: 'attached' })
    console.log(`${awaitSel} appeared after ${Date.now() - t0} ms`)
  }
  let t = 0
  for (const s of shots) {
    await sleep(Math.max(0, s.at - t))
    t = s.at
    await page.screenshot({ path: s.file })
    console.log(`${s.file} @ +${s.at} ms`)
  }
  if (out) {
    await page.screenshot({ path: out })
    console.log(out)
  }
} finally {
  await browser.close()
}
