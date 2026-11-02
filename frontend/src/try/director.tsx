/** The film's Part 2 (demo/SCRIPT-V7.md, 1:30–2:58) played on /try: `?director=1&sample=greenfield`. Every beat sits
 * at an absolute time from t0 (`until`), so the take is the same however long a frame takes; everything the take
 * needs (the run, the sheets, the thumbnails, the crop, the recorded answer, the fonts) is loaded before t0, and the
 * only waits after it are for an element the screen has just drawn. An in-page cursor (above the camera, constant
 * size) moves in ~0.35 s eased, ripples on a click; the camera zooms 1.4–1.8× to its target and back (0.6 s ease
 * in-out). Sound cues go to `window.__cues` ({t, name}, seconds from t0); `window.__director` = {duration, ready,
 * done, start}. `&wait=1` holds t0 until `__director.start()` (the capture calls it). No randomness anywhere. */
import { useEffect } from 'react'
import { loadSvg } from '../components/SheetView'
import { useResolvedSource } from '../lib/api'
import { useCurrency } from '../lib/money'
import type { Answer } from '../lib/ask'
import type { SourceKind } from '../lib/source'
import type { Run } from '../lib/types'
import { sheetTexts } from './Choose'
import { RECORDED_T10, loadSample } from './data'
import { drawing } from './Drawing'
import { governingPlan, replaySlices, analyzeSteps } from './model'
import { REPLAY_MS } from './Analyze'
import { cue, setCueSink, useCam, useCursor, useTry, type CueName, type Sample } from './store'

export const DURATION = 88_000
const W = 1920
const H = 1080

type Cue = { t: number; name: CueName }
declare global {
  interface Window {
    __cues?: Cue[]
    __director?: { duration: number; ready: boolean; done: boolean; t: number; start: () => void }
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const now = () => performance.now()
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))
const frame = () => new Promise<number>((r) => requestAnimationFrame(r))

async function tween(ms: number, fn: (p: number) => void) {
  const t0 = now()
  for (;;) {
    const p = Math.min(1, (now() - t0) / ms)
    fn(easeInOut(p))
    if (p >= 1) return
    await frame()
  }
}

const q = (sel: string) => document.querySelector<HTMLElement | SVGElement>(`[data-dir="${sel}"]`)
async function need(sel: string): Promise<HTMLElement | SVGElement> {
  for (let i = 0; i < 400; i++) {
    const el = q(sel)
    if (el) return el
    await sleep(16)
  }
  throw new Error(`director: ${sel} never drew`)
}

/** An element's rect in stage pixels (the 1920 × 1080 stage, what the cursor and the camera use). */
function stageRect(el: Element) {
  const st = document.getElementById('stage')!.getBoundingClientRect()
  const s = st.width / W
  const r = el.getBoundingClientRect()
  return { x: (r.left - st.left) / s, y: (r.top - st.top) / s, w: r.width / s, h: r.height / s }
}
type R = ReturnType<typeof stageRect>

/* ------------------------------------------------------------------ cursor */

/** Where the cursor rests in the camera's own space while the camera moves (so it stays on what it pointed at). */
let pinned: { x: number; y: number } | null = null

const setCursor = (x: number, y: number) => useCursor.setState({ x, y })
const toLocal = (x: number, y: number) => {
  const c = useCam.getState()
  return { x: (x - c.x) / c.k, y: (y - c.y) / c.k }
}

async function move(x: number, y: number, ms = 350) {
  const c0 = useCursor.getState()
  await tween(ms, (p) => setCursor(c0.x + (x - c0.x) * p, c0.y + (y - c0.y) * p))
  pinned = toLocal(x, y)
}
async function moveTo(sel: string, fx = 0.5, fy = 0.5, ms = 350) {
  const r = stageRect(await need(sel))
  await move(r.x + r.w * fx, r.y + r.h * fy, ms)
}
async function press(sel?: string, name: CueName = 'click') {
  useCursor.setState((c) => ({ down: true, ripple: c.ripple + 1 }))
  cue(name)
  if (sel) (await need(sel)).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  await sleep(110)
  useCursor.setState({ down: false })
}
async function click(sel: string, fx = 0.5, fy = 0.5, ms = 350) {
  await moveTo(sel, fx, fy, ms)
  await sleep(90)
  await press(sel)
}

/* ------------------------------------------------------------------ camera */

function camFor(r: R, k: number) {
  const c = useCam.getState()
  // the rect in the camera's own space
  const lx = (r.x - c.x) / c.k
  const ly = (r.y - c.y) / c.k
  const cx = lx + r.w / c.k / 2
  const cy = ly + r.h / c.k / 2
  return { k, x: Math.min(0, Math.max(W - W * k, W / 2 - cx * k)), y: Math.min(0, Math.max(H - H * k, H / 2 - cy * k)) }
}
async function camTo(to: { x: number; y: number; k: number }, ms = 600) {
  const a = useCam.getState()
  await tween(ms, (p) => {
    const c = { x: a.x + (to.x - a.x) * p, y: a.y + (to.y - a.y) * p, k: a.k + (to.k - a.k) * p }
    useCam.setState(c)
    if (pinned) setCursor(c.x + pinned.x * c.k, c.y + pinned.y * c.k)
  })
}
const zoom = async (sel: string | R, k: number, ms = 600) => camTo(camFor(typeof sel === 'string' ? stageRect(await need(sel)) : sel, k), ms)
const out = (ms = 600) => camTo({ x: 0, y: 0, k: 1 }, ms)
const union = (a: R, b: R): R => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/** Scroll a list so the element sits `top` px below its top (a tween, on the page's clock). */
async function scrollTo(list: string, sel: string, top = 140, ms = 450) {
  const box = (await need(list)) as HTMLElement
  const el = await need(sel)
  const s = box.getBoundingClientRect().height / box.clientHeight || 1
  const d = (el.getBoundingClientRect().top - box.getBoundingClientRect().top) / s - top
  const from = box.scrollTop
  const to = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, from + d))
  await tween(ms, (p) => { box.scrollTop = from + (to - from) * p })
}

async function type(text: string, cps = 18) {
  for (let i = 1; i <= text.length; i++) {
    useTry.getState().set({ draft: text.slice(0, i) })
    if (text[i - 1] !== ' ') cue('type')
    await sleep(1000 / cps)
  }
}

/* ------------------------------------------------------------------ the data, before t0 */

const img = (src: string) => new Promise<void>((r) => {
  const i = new Image()
  i.onload = i.onerror = () => r()
  i.src = src
  void i.decode?.().catch(() => undefined)
})

async function prepare(sample: Sample, src: SourceKind): Promise<{ run: Run; answer: Answer }> {
  const live = src === 'live'
  const run = await loadSample(sample, src)
  const plan = governingPlan(run)
  const drawn = [...new Set(run.sheets.filter((s) => s.source === 'dxf' && s.objects.length).map((s) => s.svg_url))]
  await Promise.all([
    ...drawn.map((u) => loadSvg(u)),
    plan ? sheetTexts(plan.svg_url) : null,
    ...run.sheets.map((s) => (s.png_url ? img(s.png_url) : null)),
    ...run.items.map((it) => (it.spark?.crop_url ? img(it.spark.crop_url) : null)),
    document.fonts.ready,
  ])
  let answer = RECORDED_T10
  if (live) {
    try {
      // the API replays its recording of the film's question (asked live once; tests/fixtures/ask/)
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: RECORDED_T10.question, run_id: run.run_id, lang: 'en' }) })
      if (r.ok) answer = (await r.json()) as Answer
    } catch {
      /* the copy in the bundle is the same recording */
    }
  }
  return { run, answer }
}

/* ------------------------------------------------------------------ the timeline */

async function play(run: Run, t0: number) {
  const until = (ms: number) => sleep(t0 + ms - now())
  const set = useTry.getState().set

  // 1:30 Upload — the page settles in; a folder is dragged onto the drop zone
  useCam.setState({ k: 1.05, x: -W * 0.025, y: -H * 0.025 })
  void camTo({ x: 0, y: 0, k: 1 }, 700)
  await until(600)
  useCursor.setState({ on: true, x: 1640, y: 1130, ghost: run.package.name.split(' — ')[0] })
  await until(700)
  await moveTo('drop', 0.5, 0.55, 1300)
  await until(2000)
  useCursor.setState((c) => ({ ghost: undefined, ripple: c.ripple + 1 }))
  cue('click')
  cue('whoosh')
  set({ run, sample: 'greenfield', rows: 0 })
  await until(2300)
  await move(1560, 960, 500)
  await until(4800)
  await zoom('files-bills', 1.7)
  await until(6600)
  await zoom('files-notread', 1.7)
  await until(8200)
  await out()
  await until(8800)
  await click('continue')
  cue('whoosh')

  // 1:40 Choose — the project from the title block; four switches; Analyze
  await until(11600)
  await zoom('project', 1.5)
  await until(13400)
  await out()
  await until(14000)
  for (const k of ['quote', 'code', 'logic', 'files']) await moveTo(`topic-${k}`, 0.5, 0.5, 400).then(() => sleep(100))
  await until(16500)
  await click('analyze')
  cue('whoosh')

  // 1:47 Analyze — the run's calls replayed; the camera follows the active step
  const slices = replaySlices(analyzeSteps(run), REPLAY_MS)
  const keys = ['spark', 'geometry', 'sam', 'bill', 'code']
  const a0 = now() - t0
  await move(1700, 1000, 400)
  for (let i = 0; i < keys.length; i++) {
    await until(a0 + slices[i][0] + (i === 0 ? 200 : 0))
    await zoom(`an-${keys[i]}`, 1.4, i === 0 ? 600 : 420)
  }
  await until(a0 + REPLAY_MS)
  await out()
  await until(a0 + REPLAY_MS + 1300)
  await click('to-review')
  cue('whoosh')

  // 1:57 Review — the groups; send back: the tree off the site; fix: billed 12, drawn 8; confirm T-08; greenery
  await until(27600)
  const top = stageRect(await need('summary-chips'))
  const send = stageRect(await need('g-fix'))
  await zoom(union(top, send), 1.4)
  await until(29800)
  await out()
  await until(30300)
  await click('card-E08', 0.4, 0.3)
  await until(31700)
  await zoom('cloud-E08', 1.6)
  await until(33800)
  await out()
  await until(34600)
  await scrollTo('findings', 'card-E02.2', 220)
  await click('card-E02.2', 0.4, 0.25)
  await until(37200)
  await scrollTo('findings', 'card-E01', 260)
  await click('card-E01', 0.4, 0.12)
  await until(38800)
  await zoom('card-E01', 1.5)
  await until(42600)
  await moveTo('confirm-E01')
  await until(43900)
  await press('confirm-E01')
  cue('stamp')
  await until(45800)
  await out()
  await until(46400)
  await scrollTo('findings', 'card-E14', 160, 500)
  await click('card-E14', 0.4, 0.15)
  await until(48000)
  await zoom('gauge-E14', 1.6)
  await until(50600)
  await out()

  // 2:22 Select — select all on Send back, then on Fix before pricing; the bar counts
  await until(51800)
  await scrollTo('findings', 'g-send', 0, 500)
  set({ expanded: undefined })
  await until(52600)
  await click('all-send')
  await until(53700)
  await scrollTo('findings', 'g-fix', 60, 450)
  await click('all-fix')
  await until(55400)
  await zoom('create', 1.4)
  await until(57600)
  await out()

  // 2:29 Export — the change request, its clouds and notes
  await until(58800)
  await click('create')
  cue('whoosh')
  await until(60800)
  const cloud = stageRect(await need('cloud-r-E02.2'))
  const note = stageRect(await need('note-E02.2'))
  await zoom(union(cloud, note), 1.8)
  await until(65000)
  await out()
  await until(65800)
  await scrollTo('report', 'change-list', 120, 900)
  await until(67400)
  await moveTo('pdf', 0.5, 0.5, 450)
  await until(70700)
  await click('close-report')

  // 2:42 Ask — point at T-10, ask, the recorded answer, mark the drawing
  await until(71500)
  await click('tab-ask')
  // the drawing flies back to T-10 (its finding), then the cursor points at it
  set({ focus: 'E08' })
  await until(72350)
  const at = drawing.h?.project(...centreOf(run, 'L-1-revB', 'T-10'))
  const dr = stageRect(await need('drawing'))
  const st = document.getElementById('stage')!.getBoundingClientRect()
  const scale = st.width / W
  const svg = q('drawing')!.querySelector('svg')!.getBoundingClientRect()
  const tx = at ? (svg.left - st.left) / scale + at[0] : dr.x + dr.w / 2
  const ty = at ? (svg.top - st.top) / scale + at[1] : dr.y + dr.h / 2
  await move(tx, ty, 450)
  set({ hoverObj: 'L-1-revB/T-10' })
  await until(73300)
  await press(undefined)
  set({ tab: 'ask', chip: { sheetId: 'L-1-revB', objectId: 'T-10', kind: 'tree', sheetNo: 'L-1' }, hoverObj: undefined })
  await until(73600)
  await click('ask-input', 0.4, 0.5)
  await type('This tree is outside the site. Mark it for removal.')
  await until(76700)
  await press('ask-send')
  await need('ask-mark')
  await until(78300)
  await zoom('answer', 1.4)
  await until(80100)
  await out(450)
  await click('ask-mark', 0.5, 0.5, 300)
  cue('stamp')
  await until(80900)
  await zoom('mark-M1', 1.6)

  // 2:52 Close — the whole screen
  await until(82500)
  pinned = null
  await move(1880, 1060, 500)
  await out(700)
  useCursor.setState({ on: false })
  await until(DURATION)
}

function centreOf(run: Run, sheetId: string, objectId: string): [number, number] {
  const o = run.sheets.find((s) => s.sheet_id === sheetId)?.objects.find((x) => x.object_id === objectId)
  if (!o) return [0, 0]
  if (o.centre) return [o.centre[0], o.centre[1]]
  const xs = o.outline.map((p) => p[0])
  const ys = o.outline.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

export default function TryDirector() {
  const src = useResolvedSource()
  useEffect(() => {
    if (!src) return
    let alive = true
    const cues: Cue[] = []
    window.__cues = cues
    const state = { duration: DURATION, ready: false, done: false, t: 0, start: () => {} }
    window.__director = state
    useCurrency.getState().setCur('usd')
    const sample = (new URLSearchParams(window.location.search).get('sample') ?? 'greenfield') as Sample
    const wait = new URLSearchParams(window.location.search).get('wait') === '1'
    void prepare(sample, src).then(async ({ run, answer }) => {
      if (!alive) return
      // the recorded answer the API holds (identical to the bundled copy) is the one the film plays
      Object.assign(RECORDED_T10, answer)
      useTry.getState().reset()
      await new Promise<void>((go) => {
        state.start = go
        state.ready = true
        if (!wait) go()
      })
      const t0 = now()
      setCueSink((name) => cues.push({ t: Math.round(now() - t0) / 1000, name }))
      const tick = setInterval(() => { state.t = now() - t0 }, 100)
      try {
        await play(run, t0)
      } catch (e) {
        console.error(e)
      } finally {
        clearInterval(tick)
        setCueSink(null)
        state.done = true
      }
    })
    return () => {
      alive = false
    }
  }, [src])
  return null
}
