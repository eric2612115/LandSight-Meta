/** Derived views of a Run that both modes share. */
import { en } from './english'
import { bboxOf, type BBox } from './geo'
import type { Check, DrawingObject, FileVerdict, Item, Run, Sheet } from './types'

export const sheetById = (run: Run, id?: string) => run.sheets.find((s) => s.sheet_id === id)

export const fileById = (run: Run, id?: string) => run.files.find((f) => f.file_id === id)

export const isRasterSheet = (run: Run, s: Sheet) => {
  const f = fileById(run, s.file_id)
  return f ? f.verdict === 'drawing_raster' || f.verdict === 'drawing_image' : false
}

export const itemForObject = (run: Run, sheetId: string, objectId: string): Item | undefined =>
  run.items.find((it) => it.object_ids.includes(objectId) && (it.sheet_ids.length === 0 || it.sheet_ids.includes(sheetId)))

/** The object Muse Spark was asked about: the item's open outline, else its first object. */
export function askedObject(run: Run, it: Item): { sheet?: Sheet; obj?: DrawingObject } {
  const want = it.spark?.object_id
  if (want) {
    for (const sid of it.sheet_ids) {
      const s = sheetById(run, sid)
      const o = s?.objects.find((x) => x.object_id === want)
      if (s && o) return { sheet: s, obj: o }
    }
  }
  for (const sid of it.sheet_ids.length ? it.sheet_ids : run.sheets.map((s) => s.sheet_id)) {
    const s = sheetById(run, sid)
    if (!s) continue
    const objs = s.objects.filter((o) => it.object_ids.includes(o.object_id))
    const open = objs.find((o) => !o.closed)
    if (open || objs.length) return { sheet: s, obj: open ?? objs[0] }
  }
  return {}
}

/** Crop window convention: a square centred on the asked object, 1.8 × its larger side. */
export function cropWindow(o: DrawingObject): BBox {
  const b = bboxOf(o.outline)
  const side = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.8
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  return { x0: cx - side / 2, y0: cy - side / 2, x1: cx + side / 2, y1: cy + side / 2 }
}

/** Grounding points onto the crop, in 0..1 of its width/height. Metres near the object, else normalised or pixels. */
export function pointsOnCrop(points: [number, number][] | undefined, o: DrawingObject | undefined, natural?: { w: number; h: number }): [number, number][] {
  if (!Array.isArray(points) || !points.length) return []
  points = points.filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (!points.length) return []
  const win = o ? cropWindow(o) : null
  const inside = (p: [number, number]) => win && p[0] >= win.x0 - 3 && p[0] <= win.x1 + 3 && p[1] >= win.y0 - 3 && p[1] <= win.y1 + 3
  if (win && points.every(inside)) return points.map(([x, y]) => [(x - win.x0) / (win.x1 - win.x0), (win.y1 - y) / (win.y1 - win.y0)])
  const max = Math.max(...points.flat())
  if (max <= 1) return points
  if (max <= 1000 && !natural) return points.map(([x, y]) => [x / 1000, y / 1000])
  if (natural) return points.map(([x, y]) => [x / natural.w, y / natural.h])
  return []
}

export function pointsOnSheet(points: [number, number][] | undefined, o: DrawingObject | undefined): [number, number][] {
  if (!points?.length || !o) return []
  const win = cropWindow(o)
  const inside = (p: [number, number]) => p[0] >= win.x0 - 3 && p[0] <= win.x1 + 3 && p[1] >= win.y0 - 3 && p[1] <= win.y1 + 3
  return points.every(inside) ? points : []
}

export const tallyKey = (t: { label: string; species_code?: string }) => (t.species_code || t.label).toLowerCase()

export const itemTallyRow = (run: Run, it: Item) =>
  run.tally.find((t) => (t.species_code && t.species_code === it.species_code) || t.label.toLowerCase() === it.label.toLowerCase())

export const SEVERITY_ORDER: Record<string, number> = { fail: 0, flag: 1, review: 2, info: 3 }

export const CATEGORY_ORDER = [
  'quantity', 'regulation', 'protected_tree', 'bill', 'price', 'arithmetic', 'units', 'area', 'scale', 'revision', 'sheet', 'document', 'ingest',
] as const

export const CATEGORY_NAME: Record<string, string> = {
  quantity: 'Quantities', regulation: 'Regulations', protected_tree: 'Protected trees', bill: 'Bill', price: 'Prices',
  arithmetic: 'Arithmetic', units: 'Units', area: 'Areas', scale: 'Scale', revision: 'Revisions', sheet: 'Sheets',
  document: 'Documents', ingest: 'Files',
}

/** The sheet a check is best shown on: one that holds its objects, else its first sheet. */
export function sheetForCheck(run: Run, c: Check, preferred?: string): Sheet | undefined {
  const ids = c.evidence.object_ids ?? []
  const sids = c.evidence.sheet_ids ?? []
  const holds = (s: Sheet) => ids.length === 0 || s.objects.some((o) => ids.includes(o.object_id))
  const pref = preferred ? sheetById(run, preferred) : undefined
  if (pref && sids.includes(pref.sheet_id) && holds(pref)) return pref
  for (const sid of sids) {
    const s = sheetById(run, sid)
    if (s && holds(s)) return s
  }
  return sheetById(run, sids[0])
}

export const VERDICT_NAME: Record<FileVerdict['verdict'], string> = {
  drawing_vector: 'drawing · vector', drawing_raster: 'drawing · raster', drawing_image: 'drawing · image', bill: 'bill',
  quote: 'quote', spec: 'spec', document: 'document', presentation: 'presentation', backup_ignored: 'backup — ignored',
  archive_unpacked: 'archive — unpacked', unsupported: 'unsupported', unreadable: 'unreadable',
}

export const verdictLabel = (f: FileVerdict) => (f.verdict === 'unsupported' && f.ext ? `unsupported — .${f.ext}` : VERDICT_NAME[f.verdict] ?? en(f.verdict, 'file'))

export type BillRow = {
  row: number
  text: string
  qty?: number
  unit?: string
  price?: number
  amount?: number
  drawn?: number
  listLow?: number
  listHigh?: number
  itemId?: string
  objectIds: string[]
  sheetIds: string[]
  confidence?: number
  alignedTo?: string
  checks: Check[]
}

/** Bill rows, reconstructed from bill/price/arithmetic checks that carry `numbers.row`. */
export function billRows(run: Run): BillRow[] {
  const by = new Map<number, BillRow>()
  for (const c of run.checks) {
    const n = c.numbers ?? {}
    const row = typeof n.row === 'number' ? n.row : undefined
    if (row === undefined) continue
    const r = by.get(row) ?? { row, text: '', objectIds: [], sheetIds: [], checks: [] }
    const s = (k: string) => (typeof n[k] === 'string' ? (n[k] as string) : undefined)
    const v = (k: string) => (typeof n[k] === 'number' ? (n[k] as number) : undefined)
    r.text ||= s('bill_text') ?? ''
    r.qty ??= v('bill_qty')
    r.unit ??= s('bill_unit')
    r.price ??= v('unit_price')
    r.drawn ??= v('drawn_qty')
    r.listLow ??= v('list_low')
    r.listHigh ??= v('list_high')
    r.itemId ??= s('item_id')
    r.confidence ??= v('align_confidence')
    r.alignedTo ??= s('aligned_to')
    if (row && v('amount') !== undefined) r.amount = v('amount')
    for (const id of c.evidence.object_ids ?? []) if (!r.objectIds.includes(id)) r.objectIds.push(id)
    for (const id of c.evidence.sheet_ids ?? []) if (!r.sheetIds.includes(id)) r.sheetIds.push(id)
    r.checks.push(c)
    by.set(row, r)
  }
  const rows = [...by.values()].sort((a, b) => a.row - b.row)
  for (const r of rows) {
    if (r.amount === undefined && r.qty !== undefined && r.price !== undefined) r.amount = r.qty * r.price
    if (!r.text && r.itemId) r.text = run.items.find((i) => i.item_id === r.itemId)?.label ?? ''
  }
  return rows
}
