/** The film's scenes as camera moves and reveals on the real screens (D-59): nothing here draws its own UI. Each
 * scene sets the screen it needs, then moves the camera (the whole screen) and the sheet's own zoom, reveals what
 * the product shows, and plays the sound grammar (tick · snap · thud · chime · stamp · whoosh). */
import { askNow, useAsk } from '../screens/AskDock'
import { openCitation } from '../screens/AskDock'
import { defaultSheet } from '../screens/Review'
import { refs } from '../app/refs'
import { caption, clearShow, show } from '../app/show'
import { frame, useDecisions, useNav, useUI, wide, type Route } from '../app/state'
import { RECORDED } from '../lib/askMock'
import { flagsOf, objectsOn, shownMoney, shownText } from '../lib/flags'
import { fmt, num } from '../lib/format'
import { bboxOf, padBox, unionBox } from '../lib/geo'
import { formatMoney, formatTimes, useCurrency, type Currency } from '../lib/money'
import { packageGroups } from '../lib/pkg'
import { play } from '../lib/sound'
import type { Check, Run, Scene, SceneId } from '../lib/types'
import { tween } from './tween'

export type Ctx = {
  run: Run
  scene: Scene
  live: boolean
  sleep: (ms: number) => Promise<void>
  /** wait for Enter or a click on the pulsed control; auto mode goes on by itself */
  gate: (autoMs?: number) => Promise<void>
  signal: AbortSignal
  confirm: (c: Check) => void
  apply: (a: { kind: string; target_id: string; value: string; why: string }) => Promise<string>
}

export const SCENE_ORDER: SceneId[] = ['drop', 'wake', 'eye', 'hedge', 'colour', 'gauge', 'bill', 'ask', 'callback']

export const SCENE_TITLE: Record<SceneId, string> = {
  drop: 'The package lands', wake: 'The drawing wakes up', eye: 'What Muse Spark saw', hedge: 'The hedge, measured',
  colour: 'Lines to colour', gauge: 'The gauge, twice', bill: 'The bill, traced', ask: 'Ask the package', callback: 'The statement',
}

/** Every scene starts from the same clean screen. */
function prepare(route: Route, ui: Partial<ReturnType<typeof useUI.getState>> = {}) {
  clearShow()
  wide(0)
  useUI.setState({ selected: undefined, filter: 'need', compare: false, colour: false, gauge: 'after', askOpen: false, hi: undefined, expanded: {}, ...ui })
  useNav.getState().go(route)
}

const sheetH = () => refs.review?.sheet()

/** Select a flag on the review screen (mounted or not yet): its sheet comes with it. */
function selectFlag(run: Run, id: string, sheet?: string) {
  const f = flagsOf(run).find((x) => x.id === id)
  const sid = sheet ?? f?.sheetIds[0]
  useUI.setState({ selected: id, ...(sid ? { sheetId: sid } : {}) })
}
const cur = (): Currency => useCurrency.getState().cur
const flagById = (run: Run, id: string) => run.checks.find((c) => c.check_id === id)
const pick = (run: Run, scene: Scene, ok: (c: Check) => boolean) => run.checks.find((c) => scene.check_ids?.includes(c.check_id) && ok(c)) ?? run.checks.find(ok)

/* ------------------------------------------------------------------ the scenes */

const drop = async ({ run, sleep, gate }: Ctx) => {
  const total = packageGroups(run).reduce((a, g) => a + g.files.length, 0)
  prepare('open')
  show({ files: 0, facts: false, pulse: 'drop' })
  frame({ x: 0, y: 48, w: 980, h: 520 }, 0)
  caption(`A developer’s package: ${run.package.file_count} files, as it arrived.`)
  await sleep(1300)
  await gate(900)
  show({ pulse: undefined })
  play('whoosh', { volume: 0.5 })
  wide(1600)
  caption('Every file gets a verdict and a reason.')
  const dead = new Set(packageGroups(run).filter((g) => g.id === 'unread').flatMap((g) => g.files.map((f) => f.file_id)))
  const order = packageGroups(run).flatMap((g) => g.files)
  for (let i = 0; i < total; i++) {
    show({ files: i + 1 })
    if (dead.has(order[i].file_id)) play('thud', { volume: 0.4 })
    else play('tick', { rate: order[i].decided_by === 'spark' ? 1.25 : 1, volume: 0.45 })
    await sleep(95)
  }
  play('snap', { volume: 0.6 })
  show({ facts: true })
  await sleep(900)
  const tree = document.querySelector('[data-tree]')
  if (tree) tree.scrollTo({ top: tree.scrollHeight, behavior: 'smooth' })
  frame({ x: 581, y: 860, w: 940, h: 190 }, 1100)
  caption('A backup, an Excel 97 file, a slide deck, a zip: named, not guessed.')
  await sleep(2600)
  wide(1000)
  if (tree) tree.scrollTo({ top: 0, behavior: 'smooth' })
  const sheets = run.sheets.length
  const flags = flagsOf(run).filter((f) => f.alarm).length
  caption(`${sheets} sheets read · ${flags} flags for the owner.`)
  show({ pulse: 'review' })
  await sleep(2200)
}

const wake = async ({ run, scene, sleep }: Ctx) => {
  const sid = scene.sheet_id && run.sheets.some((s) => s.sheet_id === scene.sheet_id) ? scene.sheet_id : defaultSheet(run)
  prepare('review', { sheetId: sid })
  show({ pins: 0, rows: 0, counted: 0 })
  caption('The governing plan, measured: every flag pinned where it is.')
  await sleep(500)
  frame({ x: 581, y: 88, w: 1339, h: 692 }, 1100)
  await sleep(700)
  play('whoosh', { volume: 0.4 })
  let last = -1
  await tween(1500, (p) => {
    show({ counted: p })
    const k = Math.floor(p * 12)
    if (k !== last) {
      last = k
      play('tick', { rate: 0.9 + p * 0.5, volume: 0.3 })
    }
  }, sleep)
  const pins = refs.review ? (document.querySelectorAll('[data-pin]').length || 12) : 12
  for (let i = 0; i < Math.max(pins, 12); i++) {
    show({ pins: i + 1 })
    play('tick', { rate: 1 + i * 0.04, volume: 0.45 })
    await sleep(150)
  }
  show({ pins: null })
  await sleep(600)
  wide(1000)
  caption('Four kinds of catch: quote, regulation, design, format.')
  const n = flagsOf(run).filter((f) => f.alarm).length + 4
  for (let r = 0; r <= n; r++) {
    show({ rows: r })
    if (r % 3 === 0) play('tick', { volume: 0.25, rate: 1.4 })
    await sleep(55)
  }
  show({ rows: null })
  play('snap', { volume: 0.5 })
  await sleep(2400)
}

const eye = async ({ run, scene, sleep, gate, confirm }: Ctx) => {
  const item = run.items.find((i) => scene.item_ids?.includes(i.item_id) && i.spark) ?? run.items.find((i) => !i.agreed && i.spark)
  const objId = item?.spark?.object_id
  const check = run.checks.find((c) => objId && (c.evidence.object_ids ?? []).length === 1 && c.evidence.object_ids![0] === objId)
  const sheetId = item?.sheet_ids[0] ?? defaultSheet(run)
  prepare('review', { sheetId })
  show({ callout: false, typed: 0, points: false, sources: 0 })
  await sleep(200)
  const sheet = run.sheets.find((s) => s.sheet_id === sheetId)
  const obj = sheet?.objects.find((o) => o.object_id === objId)
  if (!sheet || !obj || !check) return
  selectFlag(run, check.check_id, sheetId)
  caption(`${obj.object_id}: twelve loose pieces. Geometry can’t close it.`)
  await sleep(300)
  const b = bboxOf(obj.outline)
  await sheetH()?.zoomToBox({ x0: b.x0 - 12, x1: b.x1 + 26, y0: b.y0 - 7, y1: b.y1 + 7 }, { duration: 1200 })
  frame({ x: 500, y: 60, w: 1420, h: 820 }, 1200)
  play('thud', { volume: 0.4 })
  await sleep(1300)
  show({ callout: true })
  play('whoosh', { volume: 0.35 })
  await sleep(700)
  caption('Muse Spark is shown the crop and the measured facts. Its answer, as recorded:')
  const len = 260
  for (let c = 0; c <= len; c += 3) {
    show({ typed: c })
    await sleep(18)
  }
  show({ typed: null, points: true })
  for (let i = 0; i < 6; i++) setTimeout(() => play('tick', { rate: 1.3 }), i * 80)
  await sleep(900)
  caption(`Three sources: geometry ${item!.geometry_count}, Muse Spark ${item!.spark_count}, the schedule ${item!.schedule_count}.`)
  for (let r = 1; r <= 3; r++) {
    show({ sources: r })
    play('tick', { volume: 0.45 })
    await sleep(500)
  }
  show({ pulse: 'confirm' })
  await gate(1800)
  show({ pulse: undefined })
  confirm(check)
  play('snap')
  caption(`Confirmed: ${item!.spark_count} trees. The count changes only when a person says so.`)
  await sleep(2600)
}

const hedge = async ({ run, scene, sleep }: Ctx) => {
  const c = pick(run, scene, (x) => x.category === 'units')
  if (!c) return
  const sheetId = (c.evidence.sheet_ids ?? [])[0] ?? defaultSheet(run)
  prepare('review', { sheetId })
  show({ tape: 0, formula: 0, dots: 0 })
  selectFlag(run, c.check_id, sheetId)
  caption(`${String(c.numbers?.drawn_name ?? 'The hedge')}: the bill prices ${fmt(num(c.numbers?.bill_qty), 0)} ${String(c.numbers?.bill_unit ?? '')}.`, undefined, true)
  await sleep(300)
  const sheet = run.sheets.find((s) => s.sheet_id === sheetId)!
  const o = objectsOn(sheet, c).find((x) => x.kind === 'hedge')
  if (!o) return
  const b = bboxOf(o.outline)
  const vertical = b.y1 - b.y0 >= b.x1 - b.x0
  const span = 9
  const at = (t: number) => (vertical ? { x0: b.x0 - span * 1.2, x1: b.x0 + span * 1.2, y0: b.y0 + (b.y1 - b.y0) * t - span / 2, y1: b.y0 + (b.y1 - b.y0) * t + span / 2 } : { x0: b.x0 + (b.x1 - b.x0) * t - span, x1: b.x0 + (b.x1 - b.x0) * t + span, y0: b.y0 - span / 2, y1: b.y0 + span / 2 })
  await sheetH()?.zoomToBox(at(0), { duration: 1000 })
  frame({ x: 581, y: 88, w: 1339, h: 852 }, 1000)
  await sleep(500)
  let mark = 0
  await tween(3200, (p) => {
    show({ tape: p })
    void sheetH()?.zoomToBox(at(Math.min(1, p)), { duration: 0 })
    const m = Math.floor((p * (b.y1 - b.y0 || b.x1 - b.x0)) / 5)
    if (m > mark) {
      mark = m
      play('tick', { rate: 0.9 + m * 0.05, volume: 0.35 })
    }
  }, sleep, (t) => t * t * (3 - 2 * t))
  play('snap', { volume: 0.6 })
  await sheetH()?.zoomToBox(padBox(b, 8, 2), { duration: 900 })
  const hn = run.checks.find((x) => num(x.numbers?.spacing_m) !== undefined && (x.evidence.object_ids ?? []).includes(o.object_id))?.numbers ?? {}
  caption(`Measured: ${fmt(num(hn.length_m) ?? b.y1 - b.y0, 1)} m at ${num(hn.spacing_m) ?? 0.3} m, ${num(hn.rows) ?? 2} rows.`, undefined, true)
  show({ formula: 1 })
  play('tick')
  await sleep(1100)
  show({ formula: 2 })
  play('tick')
  const count = num(run.checks.find((x) => num(x.numbers?.spacing_m) !== undefined)?.numbers?.count) ?? 182
  let last = 0
  await tween(1800, (p) => {
    const n = Math.round(p * count)
    show({ dots: n })
    if (n - last >= 10) {
      last = n
      play('tick', { rate: 0.75 + 1.2 * p, volume: 0.35 })
    }
  }, sleep, (t) => t)
  caption(`${count} plants drawn; the bill prices metres. Reprice per plant.`, undefined, true)
  play('thud', { volume: 0.5 })
  await sleep(2600)
}

const colour = async ({ run, scene, sleep, gate }: Ctx) => {
  const sheet = run.sheets.find((s) => s.sheet_id === scene.sheet_id && s.filled_png_url) ?? run.sheets.find((s) => s.counted && s.filled_png_url)
  if (!sheet) return
  const control = run.checks.find((c) => c.control && (c.evidence.sheet_ids ?? []).includes(sheet.sheet_id) && /line drawing/i.test(c.title)) ?? run.checks.find((c) => c.control)
  prepare('review', { sheetId: sheet.sheet_id })
  show({ pour: 0, masks: 0, control: 0, pulse: 'colour' })
  if (control) selectFlag(run, control.check_id, sheet.sheet_id)
  caption('SAM 3.1 segments colour, not line work. Same words, two images:', undefined, true)
  frame({ x: 581, y: 48, w: 1339, h: 900 }, 900)
  await sleep(1200)
  show({ control: 1 })
  play('thud', { volume: 0.5 })
  caption(`On the line drawing, “${control?.control?.prompt ?? 'the legend’s words'}”: ${control?.control?.masks_on_lines ?? 0} masks.`, undefined, true)
  await sleep(1800)
  await gate(800)
  useUI.setState({ colour: true })
  show({ pulse: undefined })
  play('whoosh', { volume: 0.55 })
  await tween(1700, (p) => show({ pour: p }), sleep)
  show({ control: 2 })
  play('snap')
  caption(`On the coloured render: ${control?.control?.masks_on_colour ?? ''} masks. The words came from Muse Spark’s reading of the legend.`, undefined, true)
  for (let i = 1; i <= 4; i++) {
    show({ masks: i })
    play('tick', { rate: 1.1 + i * 0.08, volume: 0.5 })
    await sleep(450)
  }
  show({ masks: null })
  await sleep(2600)
}

const gauge = async ({ run, scene, sleep }: Ctx) => {
  const c = pick(run, scene, (x) => x.category === 'regulation' && num(x.numbers?.required) !== undefined && num(x.numbers?.provided) !== undefined)
  if (!c) return
  const before = c.before_downgrade
  const after = c.after_downgrade
  const plan = (c.evidence.sheet_ids ?? []).find((s) => run.sheets.find((x) => x.sheet_id === s)?.counted) ?? defaultSheet(run)
  prepare('review', { sheetId: plan, gauge: before ? 'before' : 'after' })
  show({ gauge: 0, fixes: 0, callout: false })
  selectFlag(run, c.check_id, plan)
  const required = num(c.numbers?.required)!
  caption(`Art. 302 greening: ${fmt(required, 1)} kgCO₂e/yr required.`, undefined, true)
  frame({ x: 581, y: 380, w: 1339, h: 580 }, 1000)
  await sleep(900)
  const start = before?.provided ?? num(c.numbers?.provided)!
  play('whoosh', { volume: 0.35 })
  await tween(1300, (p) => show({ gauge: start * p }), sleep)
  play('thud')
  caption(`As drawn: ${fmt(start, 1)}. A fail.`, undefined, true)
  await sleep(1300)
  show({ fixes: 1 })
  play('chime', { volume: 0.5 })
  await sleep(1300)
  if (before && after) {
    const pit = after.pit
    const pitSheet = pit?.sheet_id && run.sheets.some((s) => s.sheet_id === pit.sheet_id) ? pit.sheet_id : undefined
    if (pitSheet) {
      useUI.setState({ sheetId: pitSheet })
      caption(`But the tree pit on the slab is ${fmt(pit!.width_m, 1)} × ${fmt(pit!.length_m, 1)} m (${run.sheets.find((s) => s.sheet_id === pitSheet)?.number}).`, undefined, true)
      frame({ x: 581, y: 48, w: 1339, h: 912 }, 900)
      await sleep(400)
      const pitObj = run.sheets.find((s) => s.sheet_id === pitSheet)?.objects.find((o) => o.kind === 'tree_pit')
      if (pitObj) useUI.setState({ hi: { quote: `${fmt(pit!.width_m, 1)} × ${fmt(pit!.length_m, 1)} m = ${fmt(pit!.area_m2, 2)} m² · soil ${fmt(pit!.soil_depth_m, 1)} m · on slab`, source: 'the tree pit detail', label: 'Read by Muse Spark', sheetId: pitSheet, objectIds: [pitObj.object_id] } })
      play('thud', { volume: 0.6 })
      await sleep(2600)
      useUI.setState({ sheetId: plan, hi: undefined })
      frame({ x: 581, y: 380, w: 1339, h: 580 }, 900)
      await sleep(500)
    }
    useUI.setState({ gauge: 'after' })
    show({ fixes: 0 })
    caption(`On artificial ground the large trees count as small: ${fmt(after.provided, 1)}.`, undefined, true)
    play('whoosh', { volume: 0.3, rate: 0.8 })
    await tween(1300, (p) => show({ gauge: before.provided + (after.provided - before.provided) * p }), sleep)
    play('thud')
    await sleep(1200)
    for (let i = 1; i <= 3; i++) {
      show({ fixes: i })
      play(i === 1 ? 'tick' : 'chime', { volume: 0.5 })
      await sleep(700)
    }
    const fa = after.fixes?.[0]
    const fb = after.fixes?.[1]
    caption(`${fa ? `${fa.label.replace(/, the same species/, '')} passes` : ''}${fb ? ` — or change one tree to a second native species: ${fmt(num(fb.result), 1)}` : ''}.`, undefined, true)
  }
  show({ gauge: null, fixes: null })
  await sleep(2800)
}

const bill = async ({ run, scene, sleep }: Ctx) => {
  const c = pick(run, scene, (x) => x.category === 'quantity' && num(x.numbers?.bill_qty) !== undefined && num(x.numbers?.drawn_qty) !== undefined && num(x.numbers!.bill_qty)! > num(x.numbers!.drawn_qty)!)
  if (!c) return
  const n = c.numbers as Record<string, number | string>
  prepare('review', { sheetId: (c.evidence.sheet_ids ?? [])[0] ?? defaultSheet(run) })
  show({ hop: 0, callout: false })
  selectFlag(run, c.check_id)
  await sleep(200)
  frame({ x: 581, y: 600, w: 1339, h: 360 }, 1000)
  caption('The bill, traced to the drawing.', undefined, true)
  await sleep(1200)
  show({ hop: 1 })
  play('tick')
  caption(`Row ${n.row} of the bill: ${n.bill_qty} ${String(n.drawn_name ?? '')}.`, undefined, true)
  await sleep(1600)
  show({ hop: 2 })
  play('tick', { rate: 1.2 })
  caption(`The governing drawing: ${n.drawn_qty}.`, undefined, true)
  await sleep(1600)
  show({ hop: 3 })
  const t = formatTimes(Number(n.bill_qty) - Number(n.drawn_qty), Number(n.unit_price), cur(), run.currency)
  play('chime', { volume: 0.6 })
  caption(`${Number(n.bill_qty) - Number(n.drawn_qty)} × ${t.unit} = ${t.total} billed, not drawn.`, undefined, true)
  await sleep(2400)
  const over = run.checks.find((x) => x.category === 'price' && num(x.numbers?.over_list_twd) !== undefined)
  if (over) {
    const f = flagsOf(run).find((x) => x.id === over.check_id)!
    selectFlag(run, over.check_id)
    show({ hop: 3 })
    play('thud', { volume: 0.5 })
    caption(`${String(over.numbers?.drawn_name ?? '')}: ${shownText(shownMoney(f.money, cur(), run.currency), cur(), run.currency)} over your own price list.`, undefined, true)
    await sleep(3000)
  }
  show({ hop: null })
}

const ask = async ({ run, sleep, gate, live, apply }: Ctx) => {
  prepare('review', { sheetId: defaultSheet(run) })
  useAsk.setState({ answer: undefined, q: '', error: undefined, done: {} })
  const seed = RECORDED.find((r) => /camphor row/i.test(r.question)) ?? RECORDED[0]
  const q = seed.question
  show({ asked: '', answer: 0, actions: 0 })
  useUI.setState({ askOpen: true })
  caption('The owner asks the package itself.')
  frame({ x: 1280, y: 48, w: 640, h: 960 }, 0)
  await sleep(900)
  for (let i = 1; i <= q.length; i++) {
    show({ asked: q.slice(0, i) })
    if (i % 2) play('tick', { volume: 0.18, rate: 1.6 })
    await sleep(42)
  }
  useAsk.setState({ q })
  show({ pulse: 'ask-go' })
  await gate(500)
  show({ pulse: undefined, asked: null })
  play('whoosh', { volume: 0.4 })
  const a = await askNow(q, run, live)
  if (!a) return
  for (let c = 0; c <= a.answer.length; c += 4) {
    show({ answer: c })
    await sleep(14)
  }
  show({ answer: null })
  caption('Muse Spark answers from the package — the file, the page, the sentence.')
  await sleep(1800)
  const ci = a.citations.findIndex((x) => x.file_id !== 'run' && x.file_id !== 'rules')
  if (ci >= 0) {
    show({ cite: ci })
    play('tick')
    await sleep(600)
    openCitation(run, a.citations[ci], useUI.getState().set)
    useUI.setState({ askOpen: true })
    caption(`Click a citation: the sheet opens on the sentence (${a.citations[ci].page ? `p. ${a.citations[ci].page}` : 'its page'}).`, undefined, true)
    await sleep(700)
    // the sheet moves to the sentence, in the part of the pane the dock leaves free
    const words = a.citations[ci].quote.replace(/^\d+\.\s*/, '').split(/\s+/).slice(0, 3).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
    const box = sheetH()?.findText(new RegExp(words, 'i'))
    if (box) await sheetH()?.zoomToBox(padBox(box, 6, 5), { duration: 1000, rect: { x: 40, y: 80, w: 1280 - 581 - 80, h: 560 } })
    frame({ x: 581, y: 48, w: 1339, h: 900 }, 900)
    await sleep(2200)
  }
  frame({ x: 1280, y: 300, w: 640, h: 700 }, 900)
  show({ actions: a.proposed_actions.length })
  const ai = a.proposed_actions.findIndex((p) => p.kind === 'confirm_price')
  const idx = ai >= 0 ? ai : 0
  const action = a.proposed_actions[idx]
  if (action) {
    show({ pulse: `action-${idx}` })
    caption(action.kind === 'confirm_price' ? 'One click turns the answer into a confirmed price.' : 'One click turns the answer into an action.')
    await gate(1400)
    show({ pulse: undefined })
    const line = await apply(action)
    useAsk.setState((s) => ({ done: { ...s.done, [`${a.ask_id}:${idx}`]: line } }))
    caption(`Recorded: ${line}.`)
  }
  await sleep(2600)
}

const callback = async ({ run, sleep }: Ctx) => {
  prepare('statement')
  show({ count: 0, score: 0 })
  frame({ x: 0, y: 48, w: 1140, h: 560 }, 0)
  caption('What the bill says, and what the drawings support.')
  await sleep(600)
  let last = -1
  await tween(1900, (p) => {
    show({ count: p })
    const k = Math.floor(p * 14)
    if (k !== last) {
      last = k
      play('tick', { rate: 0.8 + p * 0.6, volume: 0.3 })
    }
  }, sleep)
  show({ count: null })
  play('snap', { volume: 0.6 })
  await sleep(1400)
  frame({ x: 1140, y: 48, w: 780, h: 400 }, 1100)
  await sleep(900)
  for (let r = 1; r <= 6; r++) {
    show({ score: r })
    play(r === 6 ? 'chime' : 'tick', { volume: 0.5 })
    await sleep(r === 5 ? 700 : 420)
  }
  const e = run.errors
  caption(`${e.planted} errors planted · ${e.found.length} found · ${e.flagged.length} flagged for a person · ${e.missed.length} missed · ${e.false_alarms.length} false alarms.`)
  await sleep(3200)
  wide(1100)
  const confirmed = Object.values(useDecisions.getState().d).filter((x) => x.state === 'confirmed').length
  if (confirmed) {
    show({ pulse: 'letter' })
    caption('Confirmed flags become the query letter to the developer.')
  }
  await sleep(2600)
}

export const SCENES: Record<SceneId, (c: Ctx) => Promise<void>> = { drop, wake, eye, hedge, colour, gauge, bill, ask, callback }

/** Whether a Run carries what a scene needs; a scene that would show nothing is skipped. */
export function sceneAvailable(run: Run, id: SceneId, scene: Scene): boolean {
  switch (id) {
    case 'drop': return run.files.length > 0
    case 'wake': return run.sheets.length > 0
    case 'eye': return run.items.some((i) => i.spark)
    case 'hedge': return run.checks.some((c) => c.category === 'units')
    case 'colour': return run.sheets.some((s) => s.filled_png_url)
    case 'gauge': return !!pick(run, scene, (x) => x.category === 'regulation' && num(x.numbers?.required) !== undefined)
    case 'bill': return run.checks.some((c) => c.category === 'quantity' && num(c.numbers?.bill_qty) !== undefined)
    case 'ask': return true
    case 'callback': return true
  }
}

export const unionOf = (boxes: Parameters<typeof unionBox>[0]) => unionBox(boxes)
export const moneyNow = (twd: number, run: Run) => formatMoney(twd, cur(), run.currency)
export { flagById }
