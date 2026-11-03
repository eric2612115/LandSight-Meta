/** What the review screen derives from a Run for one sheet: its pins, its counted line, its other revision, and
 * the three sources of a quantity. */
import { plantName } from '../lib/english'
import { objectsOn, type Flag } from '../lib/flags'
import { fmt, qty } from '../lib/format'
import { bboxOf, unionBox, type BBox } from '../lib/geo'
import { askedObject, itemTallyRow } from '../lib/model'
import type { Check, Item, Run, Sheet } from '../lib/types'

export type PinSpot = { flag: Flag; n: number; at: [number, number]; box: BBox }

/** Pins on a sheet: one per listed flag whose objects are on it, numbered in list order, at the objects' top-right. */
export function pinsOn(sheet: Sheet, listed: Flag[]): PinSpot[] {
  const out: PinSpot[] = []
  for (const f of listed) {
    const objs = objectsOn(sheet, f.check)
    if (!objs.length) continue
    const box = unionBox(objs.map((o) => bboxOf(o.outline)))!
    out.push({ flag: f, n: out.length + 1, at: [box.x1, box.y1], box })
  }
  return out
}

/** Spread pins that would sit on one another (screen px). */
export function spreadPins(pins: { n: number; x: number; y: number }[], gap = 22) {
  const placed: { n: number; x: number; y: number }[] = []
  for (const p of pins) {
    let { x } = p
    let guard = 0
    while (placed.some((q) => Math.hypot(q.x - x, q.y - p.y) < gap) && guard++ < 12) x += gap
    placed.push({ ...p, x })
  }
  return placed
}

/** The other revision of a sheet's number, when the package has two. */
export function twinOf(run: Run, sheet: Sheet): Sheet | undefined {
  return run.sheets.find((s) => s.number === sheet.number && s.sheet_id !== sheet.sheet_id && s.source !== 'pdf_vector' && s.source !== 'pdf_raster')
}

/** Objects that moved between two revisions. Ids are numbered per sheet, so each object is matched to the nearest
 * one of the same kind on the other revision: a match 0.3–6 m away has moved. */
export function movedBetween(a: Sheet, b: Sheet) {
  const out: { id: string; from: [number, number]; to: [number, number]; d: number }[] = []
  const quiet = new Set(['legend', 'title_block', 'schedule', 'scale_bar', 'boundary', 'match_line', 'building'])
  for (const o of b.objects) {
    if (!o.centre || quiet.has(o.kind)) continue
    let best: { c: [number, number]; d: number } | undefined
    for (const p of a.objects) {
      if (p.kind !== o.kind || !p.centre) continue
      const d = Math.hypot(o.centre[0] - p.centre[0], o.centre[1] - p.centre[1])
      if (!best || d < best.d) best = { c: p.centre, d }
    }
    if (best && best.d > 0.3 && best.d < 6) out.push({ id: o.object_id, from: best.c, to: o.centre, d: best.d })
  }
  return out
}

/** "counted: 8 trees · 182 hedge plants · 150 m² bed · 200 m² lawn" for a measured sheet. */
export function countedLine(run: Run, sheet: Sheet, t = 1): string {
  if (!sheet.counted) return sheet.not_counted_reason ?? 'read, not counted'
  const items = run.items.filter((it) => it.sheet_ids.includes(sheet.sheet_id))
  const parts = items.map((it) => {
    const row = itemTallyRow(run, it)
    const n = Math.round((it.confirmed ? it.quote_count ?? it.spark_count : row?.drawn ?? it.geometry_count ?? 0) ?? 0) * t
    const name = plantName(it.label, it.species_code, it.label).common.toLowerCase()
    if (it.kind === 'tree') return `${qty(Math.round(n))} ${n === 1 ? 'tree' : 'trees'}`
    if (it.kind === 'hedge') return `${qty(Math.round(n))} hedge plants`
    if (it.kind === 'shrub_bed') return `${qty(Math.round(n))} m² bed`
    if (it.unit === 'm') return `${qty(Math.round(n))} m ${name}`
    return `${qty(Math.round(n))} m² ${name}`
  })
  return parts.length ? `counted: ${parts.join(' · ')}` : 'measured'
}

/** The item a flag is about, for the callout's crop and three sources. */
export function itemOfFlag(run: Run, c: Check): Item | undefined {
  // only a flag about the very object Muse Spark was shown (T-08), not every check that names the item
  const objs = c.evidence.object_ids ?? []
  return run.items.find((it) => it.spark?.object_id && objs.length <= 2 && objs.includes(it.spark.object_id) && (!c.item_ids || c.item_ids.includes(it.item_id)))
}

/** Geometry, Muse Spark, the plant list: what each source says about an item. */
export function threeSources(run: Run, it: Item) {
  const { obj } = askedObject(run, it)
  const gaps = obj?.gaps?.length ?? 0
  const answer = it.spark?.answer ?? {}
  const kind = typeof answer.kind === 'string' ? answer.kind : 'object'
  const one = answer.is_one_object === true
  return {
    geometry: { n: it.geometry_count, text: obj && !obj.closed ? `closed · ${obj.object_id} open${gaps ? `, ${gaps} gaps` : ''}` : 'closed' },
    spark: { n: it.spark_count, text: it.spark ? `${one ? `one ${kind}` : kind}, ${fmt(it.spark.confidence, 2)}` : '' },
    list: { n: it.schedule_count, text: 'schedule' },
  }
}

/** The window a crop of these boxes shows: square-ish, padded. */
export function cropBox(b: BBox, pad = 1.6, aspect = 1): BBox {
  let w = b.x1 - b.x0 + pad * 2
  let h = b.y1 - b.y0 + pad * 2
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 }
}
