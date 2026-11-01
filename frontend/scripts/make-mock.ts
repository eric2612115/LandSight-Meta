/**
 * Writes the frontend's built-in mock data (public/mock/) from docs/API.md: run.json, director.json, rules.json,
 * one print-like SVG per sheet and the crop Muse Spark was sent. Everything is English and synthetic.
 *
 *   node scripts/make-mock.ts
 *
 * Geometry follows landsight/synth/site.py (metres, origin at the site's south-west corner, x east, y north) and
 * the package in docs/PACKAGE.md. SVGs follow landsight/dxf/render.py: metres as user units, y flipped, the
 * window is the sheet bounds padded by 2 % of the longer side.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mock')

type Pt = [number, number]
type Box = [number, number, number, number]
type Prim =
  | { t: 'line'; pts: Pt[]; layer: string; closed?: boolean; dash?: string; colour?: string }
  | { t: 'text'; s: string; x: number; y: number; h: number; layer?: string; rot?: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean; colour?: string }
  | { t: 'circle'; c: Pt; r: number; layer: string; fill?: string; dash?: string }
  | { t: 'fill'; pts: Pt[]; fill: string; opacity?: number }

const WEIGHT: Record<string, number> = {
  FRAME: 0.16, BORDER: 0.05, SITE: 0.1, TREE: 0.085, PLANT: 0.08, HATCH: 0.028, LEADER: 0.05, TABLE: 0.05,
  DIM: 0.04, BG: 0.05, PIPE: 0.075, ROAD: 0.07, MATCH: 0.12, DETAIL: 0.06, MASK: 0.05,
}

class Drawing {
  prims: Prim[] = []
  line(a: Pt, b: Pt, layer = 'PLANT', dash?: string) {
    this.prims.push({ t: 'line', pts: [a, b], layer, dash })
  }
  poly(pts: Pt[], layer = 'PLANT', closed = false, dash?: string, colour?: string) {
    this.prims.push({ t: 'line', pts, layer, closed, dash, colour })
  }
  rect(b: Box, layer = 'PLANT', dash?: string) {
    this.poly(boxPts(b), layer, true, dash)
  }
  text(s: string, x: number, y: number, h = 0.6, opts: Partial<Extract<Prim, { t: 'text' }>> = {}) {
    this.prims.push({ t: 'text', s, x, y, h, layer: 'TEXT', ...opts })
  }
  circle(c: Pt, r: number, layer = 'PLANT', fill?: string, dash?: string) {
    this.prims.push({ t: 'circle', c, r, layer, fill, dash })
  }
  fill(pts: Pt[], fill: string, opacity = 1) {
    this.prims.push({ t: 'fill', pts, fill, opacity })
  }
}

// ------------------------------------------------------------------------------------------------ geometry

const r3 = (v: number) => Math.round(v * 1000) / 1000
const boxPts = ([x0, y0, x1, y1]: Box): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const fp = (pts: Pt[]) => pts.map(([x, y]) => [r3(x), r3(y)])

function canopy(cx: number, cy: number, r: number, n = 12, rot = 15): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 * i) / n) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt
  })
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 32): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt
  })
}

function area(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    s += x0 * y1 - x1 * y0
  }
  return Math.abs(s) / 2
}

/** Twelve pieces, each shortened so the ends of consecutive pieces are `gap` apart; returns pieces and gap points. */
function openCanopy(verts: Pt[], gap: number) {
  const n = verts.length
  const shorten = gap / (2 * Math.cos(Math.PI / n))
  const pieces: [Pt, Pt][] = []
  for (let i = 0; i < n; i++) {
    const [x0, y0] = verts[i]
    const [x1, y1] = verts[(i + 1) % n]
    const L = Math.hypot(x1 - x0, y1 - y0)
    const ux = (x1 - x0) / L
    const uy = (y1 - y0) / L
    pieces.push([[x0 + ux * shorten, y0 + uy * shorten], [x1 - ux * shorten, y1 - uy * shorten]])
  }
  const gaps: Pt[] = pieces.map((p, i) => {
    const next = pieces[(i + 1) % n]
    return [r3((p[1][0] + next[0][0]) / 2), r3((p[1][1] + next[0][1]) / 2)]
  })
  return { pieces, gaps }
}

/** Clip the infinite line through p with direction d to an axis-aligned box (Liang-Barsky); null when it misses. */
function clipLine(p: Pt, d: Pt, b: Box): [Pt, Pt] | null {
  let t0 = -1e9
  let t1 = 1e9
  const checks: [number, number][] = [[-d[0], p[0] - b[0]], [d[0], b[2] - p[0]], [-d[1], p[1] - b[1]], [d[1], b[3] - p[1]]]
  for (const [pp, q] of checks) {
    if (Math.abs(pp) < 1e-12) {
      if (q < 0) return null
      continue
    }
    const t = q / pp
    if (pp < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
  }
  if (t0 >= t1) return null
  return [[p[0] + d[0] * t0, p[1] + d[1] * t0], [p[0] + d[0] * t1, p[1] + d[1] * t1]]
}

function hatchLines(dr: Drawing, b: Box, angleDeg: number, spacing: number, layer = 'HATCH') {
  const a = (angleDeg * Math.PI) / 180
  const d: Pt = [Math.cos(a), Math.sin(a)]
  const nrm: Pt = [-d[1], d[0]]
  const cx = (b[0] + b[2]) / 2
  const cy = (b[1] + b[3]) / 2
  const reach = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2
  for (let s = -reach; s <= reach; s += spacing) {
    const seg = clipLine([cx + nrm[0] * s, cy + nrm[1] * s], d, b)
    if (seg) dr.line(seg[0], seg[1], layer)
  }
}

function grassHatch(dr: Drawing, b: Box, step = 1.3) {
  let row = 0
  for (let y = b[1] + step / 2; y < b[3] - 0.2; y += step * 0.8, row++) {
    for (let x = b[0] + step / 2 + (row % 2 ? step / 2 : 0); x < b[2] - 0.3; x += step) {
      for (const dx of [-0.16, 0, 0.16]) dr.line([x + dx * 0.6, y], [x + dx, y + 0.3], 'HATCH')
    }
  }
}

function brickHatch(dr: Drawing, b: Box, h = 0.7, w = 1.4) {
  let row = 0
  for (let y = b[1] + h; y < b[3] - 1e-6; y += h, row++) dr.line([b[0], y], [b[2], y], 'HATCH')
  row = 0
  for (let y = b[1]; y < b[3] - 1e-6; y += h, row++) {
    for (let x = b[0] + (row % 2 ? w / 2 : w); x < b[2] - 1e-6; x += w) dr.line([x, y], [x, Math.min(y + h, b[3])], 'HATCH')
  }
}

function sandHatch(dr: Drawing, b: Box, seed = 3, density = 2.2) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const n = Math.round((b[2] - b[0]) * (b[3] - b[1]) * density)
  for (let i = 0; i < n; i++) {
    const x = b[0] + 0.15 + rnd() * (b[2] - b[0] - 0.3)
    const y = b[1] + 0.15 + rnd() * (b[3] - b[1] - 0.3)
    dr.circle([x, y], 0.05 + rnd() * 0.04, 'HATCH')
  }
}

function gridHatch(dr: Drawing, b: Box, step = 0.75) {
  for (let x = b[0] + step; x < b[2] - 1e-6; x += step) dr.line([x, b[1]], [x, b[3]], 'HATCH')
  for (let y = b[1] + step; y < b[3] - 1e-6; y += step) dr.line([b[0], y], [b[2], y], 'HATCH')
  for (let x = b[0] + step / 2; x < b[2]; x += step)
    for (let y = b[1] + step / 2; y < b[3]; y += step) dr.circle([x, y], 0.12, 'HATCH')
}

function textWidth(s: string, h: number) {
  return h * 0.62 * s.length
}

function leader(dr: Drawing, s: string, x: number, y: number, target: Pt, h = 0.6) {
  const w = textWidth(s, h)
  dr.text(s, x, y, h)
  const right = target[0] >= x + w / 2
  const start: Pt = right ? [x, y - 0.18] : [x + w, y - 0.18]
  const elbow: Pt = right ? [x + w, y - 0.18] : [x, y - 0.18]
  dr.poly([start, elbow, target], 'LEADER')
  dr.circle(target, 0.09, 'LEADER', '#1d2026')
}

/** A table of rows; a row of one string spans the whole width. Returns its box. */
function table(dr: Drawing, x0: number, yTop: number, colW: number[], rows: (string | null)[][], rowH: number | number[], h = 0.42) {
  const xs = [x0]
  for (const w of colW) xs.push(xs[xs.length - 1] + w)
  const width = xs[xs.length - 1] - x0
  const hs = Array.isArray(rowH) ? rowH : rows.map(() => rowH)
  let y = yTop
  dr.line([x0, yTop], [x0 + width, yTop], 'TABLE')
  rows.forEach((row, r) => {
    const yn = y - hs[r]
    dr.line([x0, yn], [x0 + width, yn], 'TABLE')
    dr.line([x0, y], [x0, yn], 'TABLE')
    dr.line([x0 + width, y], [x0 + width, yn], 'TABLE')
    const base = yn + (hs[r] - h) / 2 + h * 0.12
    if (row.length === 1) {
      dr.text(row[0] ?? '', x0 + 0.3, base, r === 0 ? h * 1.25 : h, { bold: r === 0 })
    } else {
      row.forEach((cell, i) => {
        if (i > 0 && cell !== null) dr.line([xs[i], y], [xs[i], yn], 'TABLE')
        if (cell) dr.text(cell, xs[i] + 0.2, base, h, { bold: r === 1 && hs.length > 3 })
      })
    }
    y = yn
  })
  return [x0, y, x0 + width, yTop] as Box
}

function titleBlock(dr: Drawing, x0: number, y0: number, w: number, hgt: number, rows: [string, string][]) {
  const keyW = w * 0.3
  const rh = hgt / rows.length
  const h = Math.min(0.62, rh * 0.32)
  dr.rect([x0, y0, x0 + w, y0 + hgt], 'FRAME')
  rows.forEach(([k, v], i) => {
    const yb = y0 + hgt - rh * (i + 1)
    if (i > 0) dr.line([x0, yb + rh], [x0 + w, yb + rh], 'TABLE')
    dr.text(k, x0 + 0.3, yb + rh / 2 - h * 0.35, h * 0.72, { colour: '#5b616b' })
    dr.text(v, x0 + keyW + 0.3, yb + rh / 2 - h * 0.35, h, { bold: i < 2 })
  })
  dr.line([x0 + keyW, y0], [x0 + keyW, y0 + hgt], 'TABLE')
  return [x0, y0, x0 + w, y0 + hgt] as Box
}

function scaleBar(dr: Drawing, x0: number, y0: number, seg = 2.5, label = 'm') {
  for (let i = 0; i < 4; i++) {
    const b: Box = [x0 + seg * i, y0, x0 + seg * (i + 1), y0 + 0.4]
    dr.rect(b, 'DIM')
    if (i % 2 === 0) dr.fill(boxPts(b), '#1d2026')
  }
  dr.text('0', x0 - 0.15, y0 - 0.9, 0.5)
  dr.text(String(seg * 2), x0 + seg * 2 - 0.15, y0 - 0.9, 0.5)
  dr.text(`${seg * 4} ${label}`, x0 + seg * 4 - 0.15, y0 - 0.9, 0.5)
}

function northArrow(dr: Drawing, x: number, y: number) {
  dr.poly([[x, y - 1.2], [x + 1.0, y + 1.8], [x + 2.0, y - 1.2], [x + 1.0, y - 0.3]], 'DIM', true)
  dr.fill([[x + 1.0, y + 1.8], [x + 2.0, y - 1.2], [x + 1.0, y - 0.3]], '#1d2026')
  dr.text('N', x + 0.72, y + 2.25, 0.8, { bold: true })
}

function frame(dr: Drawing, b: Box) {
  dr.rect(b, 'FRAME')
  dr.rect([b[0] + 0.5, b[1] + 0.5, b[2] - 0.5, b[3] - 0.5], 'BORDER')
}

// ------------------------------------------------------------------------------------------------ the site

const TREE_R = 2.0
const TREES: Pt[] = Array.from({ length: 8 }, (_, i) => [5 + 4 * i, 2.5])
const HEDGE_X = [48.8, 49.2]
const HEDGE_Y = [1.5, 28.5]
const BED: Box = [6, 12, 21, 22]
const LAWN: Box = [24, 12, 44, 22]
const FIRE: Box = [44.4, 0, 48.4, 30]
const PAVING: { id: string; label: string; box: Box; code: string }[] = [
  { id: 'P-01', label: 'Permeable pavers', box: [2, 3, 28.5, 11], code: 'PP' },
  { id: 'P-02', label: 'Exposed aggregate', box: [31, 3, 43, 7], code: 'EA' },
  { id: 'P-03', label: 'Grass pavers', box: [31, 9, 37, 15], code: 'GP' },
]
const L1_BOUNDS: Box = [-3, -9, 77, 33]
const PROJECT = 'GREENFIELD RESIDENCES, local'

type Obj = Record<string, unknown> & { object_id: string; kind: string; outline: number[][] }

function obj(o: Obj): Obj {
  return o
}

const treeIds = TREES.map((_, i) => `T-${String(i + 1).padStart(2, '0')}`)

function planBase(dr: Drawing, title: string, number: string, rev: string, date: string, scale = '1:200') {
  frame(dr, L1_BOUNDS)
  dr.poly(boxPts([0, 0, 50, 30]), 'SITE', true, '1.4 0.35 0.25 0.35')
  dr.text('SITE BOUNDARY', 0.4, 30.4, 0.45, { colour: '#5b616b' })
  dr.line([-2.5, -0.8], [53, -0.8], 'ROAD')
  dr.line([-2.5, -8.2], [53, -8.2], 'ROAD')
  dr.text('8 M ROAD', 18.5, -3.4, 0.8, { colour: '#5b616b' })
  scaleBar(dr, 0, -6.6)
  northArrow(dr, 49.2, -6.0)
  titleBlock(dr, 54, -7.5, 21, 14.5, [
    ['PROJECT', PROJECT], ['DRAWING', title], ['SHEET', `${number}   REV ${rev}`], ['SCALE', scale],
    ['SITE AREA', '1,500 m²'], ['BUILDING COVERAGE', '40%   ARTIFICIAL GROUND'], ['DATE', date],
  ])
}

function sheetL1(opts: { revB?: boolean; withSchedule?: boolean } = {}) {
  const dr = new Drawing()
  const objects: Obj[] = []
  planBase(dr, opts.revB ? 'PLANTING PLAN (REV B)' : 'PLANTING PLAN', 'L-1', opts.revB ? 'B' : 'A',
    opts.revB ? '2026-10-14' : '2026-09-18')
  // the frontage row
  const centres: Pt[] = opts.revB ? [...TREES.slice(0, 4), [21.5, 2.5], ...TREES.slice(5), [37, 2.5]] : TREES
  centres.forEach(([cx, cy], i) => {
    const v = canopy(cx, cy, TREE_R)
    const id = `T-${String(i + 1).padStart(2, '0')}`
    const open = !opts.revB && i === 7
    if (open) {
      const { pieces, gaps } = openCanopy(v, 0.4)
      pieces.forEach((p) => dr.line(p[0], p[1], 'TREE'))
      objects.push(obj({
        object_id: id, kind: 'tree', label: 'Camphor', species_code: 'CC', centre: [cx, cy], area_m2: r3(area(v)),
        outline: fp(v), closed: false, gaps, by: 'spark',
      }))
    } else {
      dr.poly(v, 'TREE', true)
      objects.push(obj({
        object_id: id, kind: 'tree', label: 'Camphor', species_code: 'CC', centre: [cx, cy], area_m2: r3(area(v)),
        outline: fp(v), closed: true, by: 'geometry',
      }))
    }
    dr.line([cx - 0.4, cy], [cx + 0.4, cy], 'TREE')
    dr.line([cx, cy - 0.4], [cx, cy + 0.4], 'TREE')
  })
  const t3 = TREES[2]
  leader(dr, 'CAMPHOR, typ.', t3[0] + 1.0, t3[1] + 4.6, [t3[0] + 1.93 * Math.cos(Math.PI / 3), t3[1] + 1.93 * Math.sin(Math.PI / 3)])

  // the two trees drawn where greening cannot count, and the existing tree
  const roadTree = canopy(42, -3.6, 1.8)
  dr.poly(roadTree, 'TREE', true)
  dr.line([41.6, -3.6], [42.4, -3.6], 'TREE')
  dr.line([42, -4.0], [42, -3.2], 'TREE')
  const laneTree = canopy(46.4, 8.5, 1.8)
  dr.poly(laneTree, 'TREE', true)
  dr.line([46.0, 8.5], [46.8, 8.5], 'TREE')
  dr.line([46.4, 8.1], [46.4, 8.9], 'TREE')
  if (!opts.revB) {
    objects.push(obj({
      object_id: 'T-09', kind: 'tree', label: 'Camphor', species_code: 'CC', centre: [42, -3.6], area_m2: r3(area(roadTree)),
      outline: fp(roadTree), closed: true, by: 'geometry', excluded: { reason: 'outside the site boundary — road reserve' },
    }))
    objects.push(obj({
      object_id: 'T-10', kind: 'tree', label: 'Camphor', species_code: 'CC', centre: [46.4, 8.5], area_m2: r3(area(laneTree)),
      outline: fp(laneTree), closed: true, by: 'geometry',
      excluded: { reason: 'inside the fire-truck access lane — greening cannot count here', rule: 'Building Technical Regulations §299' },
    }))
  }
  const ex = ellipse(10, 26.2, 2.6, 2.6, 36)
  dr.poly(ex, 'TREE', true)
  dr.line([8.2, 24.4], [11.8, 28.0], 'TREE')
  dr.line([8.2, 28.0], [11.8, 24.4], 'TREE')
  dr.text('EXISTING CAMPHOR  DBH 95 cm', 13.4, 26.9, 0.5)
  dr.text('TO BE REMOVED', 13.4, 26.0, 0.5, { bold: true })
  objects.push(obj({
    object_id: 'X-01', kind: 'existing_tree', label: 'Existing camphor, DBH 95 cm', species_code: 'CC', centre: [10, 26.2],
    area_m2: r3(area(ex)), outline: fp(ex), closed: true, by: 'geometry',
  }))

  // fire lane
  dr.rect(FIRE, 'PLANT', '0.6 0.3')
  hatchLines(dr, FIRE, 45, 1.4)
  hatchLines(dr, FIRE, 135, 1.4)
  dr.text('FIRE TRUCK ACCESS LANE', 46.8, 12.6, 0.55, { rot: 90, bold: true })
  objects.push(obj({ object_id: 'FL-01', kind: 'fire_lane', label: 'Fire-truck access lane', outline: fp(boxPts(FIRE)), closed: true, by: 'geometry' }))

  // hedge
  for (const x of HEDGE_X) dr.line([x, HEDGE_Y[0]], [x, HEDGE_Y[1]], 'PLANT')
  leader(dr, 'DURANTA H0.6 @0.3m, 2 ROWS', 33.2, 25.0, [HEDGE_X[0], 23.8], 0.55)
  objects.push(obj({
    object_id: 'H-01', kind: 'hedge', label: 'Duranta', species_code: 'DE', centre: [49, 15], length_m: 27.0,
    outline: fp(boxPts([HEDGE_X[0], HEDGE_Y[0], HEDGE_X[1], HEDGE_Y[1]])), closed: true, by: 'geometry',
  }))

  // bed and lawn
  dr.rect(BED, 'PLANT')
  hatchLines(dr, BED, 45, 0.75)
  dr.fill(boxPts([10.6, 14.2, 16.4, 16.6]), '#f7f5f0')
  dr.text('AZALEA', 13.5, 15.6, 0.8, { anchor: 'middle', bold: true })
  dr.text('150 m²', 13.5, 14.6, 0.55, { anchor: 'middle' })
  objects.push(obj({
    object_id: 'B-01', kind: 'shrub_bed', label: 'Azalea', species_code: 'RH', centre: [13.5, 17], area_m2: 150,
    outline: fp(boxPts(BED)), closed: true, by: 'geometry',
  }))
  dr.rect(LAWN, 'PLANT')
  grassHatch(dr, LAWN)
  dr.fill(boxPts([31.2, 14.2, 36.8, 16.6]), '#f7f5f0')
  dr.text('LAWN', 34, 15.6, 0.8, { anchor: 'middle', bold: true })
  dr.text('200 m²', 34, 14.6, 0.55, { anchor: 'middle' })
  objects.push(obj({
    object_id: 'L-01', kind: 'lawn', label: 'Lawn', species_code: 'LW', centre: [34, 17], area_m2: 200,
    outline: fp(boxPts(LAWN)), closed: true, by: 'geometry',
  }))
  objects.push(obj({ object_id: 'BD-01', kind: 'boundary', label: 'Site boundary', outline: fp(boxPts([0, 0, 50, 30])), closed: true, by: 'geometry' }))

  // legend
  const LG: Box = [54, 19.5, 73, 31.5]
  dr.rect(LG, 'FRAME')
  dr.text('LEGEND', 55, 30.0, 0.8, { bold: true })
  const sym = canopy(57.5, 27.0, 1.7)
  dr.poly(sym, 'TREE', true)
  dr.line([57.1, 27], [57.9, 27], 'TREE')
  dr.line([57.5, 26.6], [57.5, 27.4], 'TREE')
  dr.text('CC   CAMPHOR', 60.6, 26.75, 0.55)
  dr.text('Cinnamomum camphora', 60.6, 25.95, 0.42, { colour: '#5b616b' })
  const sw: Box = [55.6, 22.4, 59.4, 23.9]
  dr.rect(sw, 'PLANT')
  hatchLines(dr, sw, 45, 0.5)
  dr.text('RH   AZALEA', 60.6, 23.0, 0.55)
  for (const y of [21.1, 20.7]) dr.line([55.6, y], [59.4, y], 'PLANT')
  dr.text('DE   DURANTA', 60.6, 20.65, 0.55)
  objects.push(obj({ object_id: 'LG-01', kind: 'legend', label: 'Legend', outline: fp(boxPts(LG)), closed: true, by: 'geometry', excluded: { reason: 'legend — not counted' } }))
  objects.push(obj({ object_id: 'LG-02', kind: 'legend', label: 'Legend symbol, Camphor', centre: [57.5, 27], outline: fp(sym), closed: true, by: 'geometry', excluded: { reason: 'legend symbol — not a tree' } }))

  if (opts.withSchedule !== false) {
    const box = plantSchedule(dr, 54, 18.4, opts.revB ? 9 : 8)
    objects.push(obj({ object_id: 'SC-01', kind: 'schedule', label: 'Plant schedule', outline: fp(boxPts(box)), closed: true, by: 'geometry' }))
  }
  objects.push(obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([54, -7.5, 75, 7])), closed: true, by: 'geometry' }))
  return { dr, objects }
}

function plantSchedule(dr: Drawing, x0: number, yTop: number, trees: number, h = 0.4) {
  const rows: (string | null)[][] = [
    ['PLANT SCHEDULE'],
    ['CODE', 'NAME', 'QTY', 'UNIT', 'CAL. cm', 'H m', 'W m', 'REMARKS'],
    ['CC', 'CAMPHOR', String(trees), 'EA', '10', '3.5', '1.5', 'Cinnamomum camphora'],
    ['DE', 'DURANTA', '182', 'EA', '–', '0.6', '–', '@0.3 m, 2 ROWS'],
    ['RH', 'AZALEA', '150', 'm²', '–', '0.4', '–', '4 PLANTS / m²'],
    ['LW', 'LAWN', '200', 'm²', '–', '–', '–', 'CARPET GRASS'],
    [`TREES TOTAL ${trees}`],
  ]
  return table(dr, x0, yTop, [1.5, 3.0, 1.3, 1.3, 2.0, 1.5, 1.5, 6.9], rows, [1.1, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95], h)
}

function sheetL3() {
  const dr = new Drawing()
  const objects: Obj[] = []
  planBase(dr, 'PAVING PLAN', 'L-3', 'A', '2026-09-18')
  const callouts: Record<string, [number, number, Pt]> = {
    'P-01': [12.5, 13.6, [14, 9]], 'P-02': [40.0, 9.4, [41, 6]], 'P-03': [38.8, 16.6, [35, 13]],
  }
  for (const p of PAVING) {
    dr.rect(p.box, 'PLANT')
    if (p.id === 'P-01') brickHatch(dr, p.box)
    if (p.id === 'P-02') sandHatch(dr, p.box)
    if (p.id === 'P-03') gridHatch(dr, p.box)
    const [tx, ty, tgt] = callouts[p.id]
    leader(dr, p.label.toUpperCase(), tx, ty, tgt, 0.55)
    objects.push(obj({
      object_id: p.id, kind: 'paving', label: p.label, species_code: p.code,
      centre: [(p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2], area_m2: r3(area(boxPts(p.box))),
      outline: fp(boxPts(p.box)), closed: true, by: 'geometry',
    }))
  }
  // planter edge: eight loose pieces
  const PE: Box = [6, 16, 14, 19]
  const c = boxPts(PE)
  for (let i = 0; i < 4; i++) {
    const a = c[i]
    const b = c[(i + 1) % 4]
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    dr.line([a[0], a[1]], [m[0] - (b[0] - a[0]) * 0.006, m[1] - (b[1] - a[1]) * 0.006], 'PLANT')
    dr.line([m[0] + (b[0] - a[0]) * 0.006, m[1] + (b[1] - a[1]) * 0.006], b, 'PLANT')
  }
  dr.text('PLANTER', 10, 17.3, 0.6, { anchor: 'middle', bold: true })
  objects.push(obj({ object_id: 'PE-01', kind: 'planter_edge', label: 'Planter edge', centre: [10, 17.5], length_m: 22, outline: fp(c), closed: false, by: 'geometry' }))
  const LG: Box = [54, 19.5, 73, 31.5]
  dr.rect(LG, 'FRAME')
  dr.text('LEGEND', 55, 30.0, 0.8, { bold: true })
  const sw: [Box, string, (d: Drawing, b: Box) => void][] = [
    [[55.6, 26.6, 59.4, 28.2], 'PERMEABLE PAVERS', (d, b) => brickHatch(d, b, 0.4, 0.8)],
    [[55.6, 23.9, 59.4, 25.5], 'EXPOSED AGGREGATE', (d, b) => sandHatch(d, b, 9, 4)],
    [[55.6, 21.2, 59.4, 22.8], 'GRASS PAVERS', (d, b) => gridHatch(d, b, 0.5)],
  ]
  for (const [b, label, h] of sw) {
    dr.rect(b, 'PLANT')
    h(dr, b)
    dr.text(label, 60.6, b[1] + 0.55, 0.55)
  }
  objects.push(obj({ object_id: 'LG-01', kind: 'legend', label: 'Legend', outline: fp(boxPts(LG)), closed: true, by: 'geometry', excluded: { reason: 'legend — not counted' } }))
  objects.push(obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([54, -7.5, 75, 7])), closed: true, by: 'geometry' }))
  return { dr, objects }
}

function sheetL2() {
  const dr = new Drawing()
  const objects: Obj[] = []
  frame(dr, [-3, -9, 63, 9])
  dr.line([1, 0], [37, 0], 'FRAME')
  for (let x = 1.4; x < 37; x += 0.8) dr.line([x, 0], [x - 0.5, -0.5], 'HATCH')
  TREES.forEach(([cx], i) => {
    for (const dx of [-0.12, 0.12]) dr.line([cx + dx, 0], [cx + dx, 1.15], 'TREE')
    const e = ellipse(cx, 2.3, 0.9, 1.2, 36)
    dr.poly(e, 'TREE', true)
    // a little canopy texture
    dr.poly([[cx - 0.5, 2.0], [cx - 0.1, 2.6], [cx + 0.3, 2.2]], 'HATCH')
    dr.poly([[cx - 0.2, 3.0], [cx + 0.25, 2.7], [cx + 0.5, 3.0]], 'HATCH')
    dr.text('CAMPHOR H3.5', cx, 3.9, 0.32, { anchor: 'middle' })
    objects.push(obj({
      object_id: treeIds[i], kind: 'tree', label: 'Camphor', species_code: 'CC', centre: [cx, 2.3], outline: fp(e), closed: true,
      by: 'geometry', excluded: { reason: 'elevation — the same trees as L-1, not counted' },
    }))
  })
  dr.line([1, -1.2], [37, -1.2], 'DIM')
  dr.text('SOUTH ELEVATION   1:100', 12, -2.6, 0.6, { bold: true })
  titleBlock(dr, 40, -7.5, 21, 14.5, [
    ['PROJECT', PROJECT], ['DRAWING', 'SOUTH ELEVATION'], ['SHEET', 'L-2   REV A'], ['SCALE', '1:100'],
    ['SITE AREA', '1,500 m²'], ['BUILDING COVERAGE', '40%'], ['DATE', '2026-09-18'],
  ])
  objects.push(obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([40, -7.5, 61, 7])), closed: true, by: 'geometry' }))
  return { dr, objects }
}

function sheetL5() {
  const dr = new Drawing()
  const objects: Obj[] = []
  frame(dr, [-3, -8, 41, 33])
  dr.poly([[21, 0], [0, 0], [0, 30], [21, 30]], 'SITE', false, '1.4 0.35 0.25 0.35')
  TREES.slice(0, 4).forEach(([cx, cy], i) => {
    const v = canopy(cx, cy, TREE_R)
    dr.poly(v, 'TREE', true)
    dr.line([cx - 0.4, cy], [cx + 0.4, cy], 'TREE')
    dr.line([cx, cy - 0.4], [cx, cy + 0.4], 'TREE')
    dr.poly(canopy(cx, cy, 0.25, 12), 'TREE', true)
    objects.push(obj({
      object_id: treeIds[i], kind: 'tree', label: 'Camphor', species_code: 'CC', centre: [cx, cy], outline: fp(v), closed: true,
      by: 'geometry', excluded: { reason: 'enlarged plan — repeats L-1, not counted' },
    }))
  })
  dr.rect(BED, 'PLANT')
  hatchLines(dr, BED, 45, 0.75)
  dr.fill(boxPts([10.6, 14.2, 16.4, 16.6]), '#f7f5f0')
  dr.text('AZALEA', 13.5, 15.6, 0.8, { anchor: 'middle', bold: true })
  dr.line([21, -2], [21, 31], 'MATCH', '1.6 0.4')
  dr.text('MATCH LINE — SEE L-1', 21.6, 24, 0.6, { rot: 90, bold: true })
  objects.push(obj({ object_id: 'ML-01', kind: 'match_line', label: 'Match line', outline: [[21, -2], [21, 31]], closed: false, by: 'geometry' }))
  scaleBar(dr, 1, -5.6, 1.25)
  dr.text('SCALE BAR 1:100', 1, -7.2, 0.45, { colour: '#5b616b' })
  titleBlock(dr, 24, -7, 16, 12.5, [
    ['PROJECT', 'GREENFIELD RESIDENCES'], ['DRAWING', 'ENLARGED PLAN — WEST'], ['SHEET', 'L-5   REV A'], ['SCALE', '1:200'],
    ['DATE', '2026-09-18'],
  ])
  objects.push(obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([24, -7, 40, 5.5])), closed: true, by: 'geometry' }))
  return { dr, objects }
}

function sheetL0() {
  const dr = new Drawing()
  frame(dr, L1_BOUNDS)
  dr.text('GREENFIELD RESIDENCES', 4, 25.5, 2.6, { bold: true })
  dr.text('LANDSCAPE PACKAGE · local, national', 4, 22.6, 1.1)
  dr.text('LANDSCAPE OVER BASEMENT SLAB', 4, 20.8, 0.8, { colour: '#5b616b' })
  const rows: (string | null)[][] = [
    ['DRAWING INDEX'],
    ['L-0', 'COVER AND INDEX'], ['L-1', 'PLANTING PLAN'], ['L-2', 'SOUTH ELEVATION'], ['L-3', 'PAVING PLAN'],
    ['L-4', 'PLANT SCHEDULE'], ['L-5', 'ENLARGED PLAN — WEST'], ['L-6', 'TREE PIT DETAIL'], ['L-7', 'IRRIGATION PLAN'],
    ['L-8', 'LIGHTING PLAN'], ['L-9', 'SECTIONS'],
  ]
  table(dr, 4, 17.5, [2.6, 14], rows, 1.2, 0.55)
  titleBlock(dr, 54, -7.5, 21, 14.5, [
    ['PROJECT', PROJECT], ['DRAWING', 'COVER AND INDEX'], ['SHEET', 'L-0   REV A'], ['SCALE', 'NTS'],
    ['SITE AREA', '1,500 m²'], ['BUILDING COVERAGE', '40%'], ['DATE', '2026-09-18'],
  ])
  return { dr, objects: [obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([54, -7.5, 75, 7])), closed: true, by: 'geometry' })] }
}

function sheetL4() {
  const dr = new Drawing()
  frame(dr, L1_BOUNDS)
  const box = plantSchedule(dr, 4, 28, 12, 0.7)
  titleBlock(dr, 54, -7.5, 21, 14.5, [
    ['PROJECT', PROJECT], ['DRAWING', 'PLANT SCHEDULE'], ['SHEET', 'L-4   REV A'], ['SCALE', 'NTS'],
    ['SITE AREA', '1,500 m²'], ['BUILDING COVERAGE', '40%'], ['DATE', '2026-09-18'],
  ])
  return {
    dr, objects: [
      obj({ object_id: 'SC-01', kind: 'schedule', label: 'Plant schedule', outline: fp(boxPts(box)), closed: true, by: 'geometry' }),
      obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([54, -7.5, 75, 7])), closed: true, by: 'geometry' }),
    ],
  }
}

function sheetL6() {
  const dr = new Drawing()
  const B: Box = [-1.6, -1.9, 6.4, 2.4]
  frame(dr, B)
  // grade, pit, soil, drainage, slab
  dr.line([-1.2, 0], [0, 0], 'DETAIL')
  dr.line([1.2, 0], [2.6, 0], 'DETAIL')
  dr.poly([[0, 0], [0, -0.8], [1.2, -0.8], [1.2, 0]], 'DETAIL')
  dr.rect([-1.2, -1.05, 2.6, -0.85], 'DETAIL')
  hatchLines(dr, [-1.2, -1.05, 2.6, -0.85], 45, 0.08)
  dr.line([0, -0.7], [1.2, -0.7], 'DETAIL', '0.06 0.04')
  sandHatch(dr, [0, -0.8, 1.2, -0.7], 5, 120)
  dr.poly(ellipse(0.6, -0.25, 0.35, 0.22, 28), 'DETAIL', true)
  for (const dx of [-0.07, 0.07]) dr.line([0.6 + dx, -0.05], [0.6 + dx, 1.5], 'DETAIL')
  dr.poly(ellipse(0.6, 1.75, 0.55, 0.4, 28), 'DETAIL', true)
  dr.line([0, 0.25], [1.2, 0.25], 'DIM')
  dr.text('1.2 m', 0.6, 0.32, 0.09, { anchor: 'middle' })
  dr.line([1.45, 0], [1.45, -0.8], 'DIM')
  dr.text('0.8 m SOIL', 1.52, -0.42, 0.09)
  dr.text('DRAINAGE LAYER', 1.52, -0.74, 0.07, { colour: '#5b616b' })
  dr.text('BASEMENT SLAB', 1.52, -0.98, 0.07, { colour: '#5b616b' })
  dr.text('TREE PIT 1.2 × 1.2 m ON SLAB', -1.2, 2.0, 0.13, { bold: true })
  titleBlock(dr, 3.0, -1.6, 3.1, 2.4, [['PROJECT', 'GREENFIELD RESIDENCES'], ['DRAWING', 'TREE PIT DETAIL'], ['SHEET', 'L-6'], ['SCALE', '1:20']])
  return { dr, objects: [obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([3.0, -1.6, 6.1, 0.8])), closed: true, by: 'geometry' })] }
}

function backgroundPlan(title: string, number: string, reason: string, extra: (dr: Drawing) => void) {
  const dr = new Drawing()
  const objects: Obj[] = []
  planBase(dr, title, number, 'A', '2026-09-30')
  TREES.forEach(([cx, cy], i) => {
    const v = canopy(cx, cy, TREE_R)
    dr.poly(v, 'BG', true, '0.4 0.25')
    objects.push(obj({ object_id: treeIds[i], kind: 'tree', label: 'Camphor', species_code: 'CC', centre: [cx, cy], outline: fp(v), closed: true, by: 'geometry', excluded: { reason } }))
  })
  dr.rect(BED, 'BG', '0.4 0.25')
  dr.rect(LAWN, 'BG', '0.4 0.25')
  extra(dr)
  objects.push(obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([54, -7.5, 75, 7])), closed: true, by: 'geometry' }))
  return { dr, objects }
}

function sheetL7() {
  return backgroundPlan('IRRIGATION PLAN', 'L-7', 'irrigation sheet — canopies are background', (dr) => {
    dr.poly([[1, 1], [1, 11.4], [45, 11.4]], 'PIPE')
    for (let y = 12.8; y < 22; y += 1.2) dr.line([6.3, y], [20.7, y], 'PIPE', '0.3 0.15')
    for (let x = 26; x <= 42; x += 4) for (let y = 13.5; y <= 20.5; y += 3.5) {
      dr.circle([x, y], 0.3, 'PIPE')
      dr.circle([x, y], 2.6, 'BG', undefined, '0.2 0.2')
    }
    TREES.forEach(([cx, cy]) => dr.circle([cx, cy + 0.9], 0.18, 'PIPE', '#1d2026'))
    dr.text('MAIN LINE DN32', 2, 11.9, 0.55)
    dr.text('DRIP LINES @1.2 m', 6.4, 22.6, 0.55)
  })
}

function sheetL8() {
  return backgroundPlan('LIGHTING PLAN', 'L-8', 'lighting sheet — canopies are background', (dr) => {
    for (const [x, y] of [[3, 7], [11, 7], [19, 7], [27, 7], [35, 7], [43, 7], [46.4, 16], [46.4, 25]] as Pt[]) {
      dr.circle([x, y], 0.45, 'PIPE')
      dr.line([x - 0.45, y], [x + 0.45, y], 'PIPE')
      dr.line([x, y - 0.45], [x, y + 0.45], 'PIPE')
    }
    TREES.forEach(([cx, cy]) => {
      dr.poly([[cx - 0.3, cy - 1.0], [cx + 0.3, cy - 1.0], [cx, cy - 0.5]], 'PIPE', true)
    })
    dr.text('POLE LIGHT 3.5 m', 3.6, 7.6, 0.5)
    dr.text('UPLIGHT UNDER CANOPY', 6.2, -1.9, 0.5)
  })
}

// ------------------------------------------------------------------------------------------------ SVG output

function padWindow(b: Box): Box {
  const pad = 0.02 * Math.max(b[2] - b[0], b[3] - b[1])
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]
}

function boundsOf(dr: Drawing): Box {
  let b: Box = [Infinity, Infinity, -Infinity, -Infinity]
  const add = ([x, y]: Pt) => {
    b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]
  }
  for (const p of dr.prims) {
    if (p.t === 'line' || p.t === 'fill') p.pts.forEach(add)
    if (p.t === 'circle') {
      add([p.c[0] - p.r, p.c[1] - p.r])
      add([p.c[0] + p.r, p.c[1] + p.r])
    }
  }
  return b.map(r3) as Box
}

type SvgOpts = { px?: number; bg?: string; weight?: number; ink?: string; defs?: string; groupAttr?: string; under?: string; over?: string }

function toSvg(dr: Drawing, win: Box, o: SvgOpts = {}) {
  const [x0, , , y1] = win
  const W = win[2] - win[0]
  const H = win[3] - win[1]
  const px = o.px ?? 14
  const ws = o.weight ?? 1
  const ink = o.ink ?? '#1d2026'
  const P = ([x, y]: Pt) => `${(x - x0).toFixed(3)},${(y1 - y).toFixed(3)}`
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(3)} ${H.toFixed(3)}" width="${Math.round(W * px)}" height="${Math.round(H * px)}" font-family="Inter, Helvetica, Arial, sans-serif">`,
  ]
  if (o.defs) out.push(`<defs>${o.defs}</defs>`)
  out.push(`<rect width="${W.toFixed(3)}" height="${H.toFixed(3)}" fill="${o.bg ?? '#ffffff'}" data-layer="PAPER"/>`)
  out.push(`<g ${o.groupAttr ?? ''}>`)
  if (o.under) out.push(o.under)
  for (const p of dr.prims) {
    if (p.t === 'fill') {
      out.push(`<polygon points="${p.pts.map(P).join(' ')}" fill="${p.fill}"${p.opacity !== undefined && p.opacity < 1 ? ` fill-opacity="${p.opacity}"` : ''} data-layer="FILL"/>`)
    }
  }
  for (const p of dr.prims) {
    if (p.t === 'line') {
      const w = (WEIGHT[p.layer] ?? 0.06) * ws
      const stroke = p.colour ?? (p.layer === 'BG' ? '#8f959e' : ink)
      const dash = p.dash ? ` stroke-dasharray="${p.dash.split(' ').map((v) => (Number(v) * ws).toFixed(3)).join(' ')}"` : ''
      const tag = p.closed ? 'polygon' : 'polyline'
      out.push(`<${tag} points="${p.pts.map(P).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w.toFixed(3)}"${dash} stroke-linecap="round" stroke-linejoin="round" data-layer="${p.layer}"/>`)
    } else if (p.t === 'circle') {
      const w = (WEIGHT[p.layer] ?? 0.06) * ws
      const [cx, cy] = P(p.c).split(',')
      const dash = p.dash ? ` stroke-dasharray="${p.dash}"` : ''
      out.push(`<circle cx="${cx}" cy="${cy}" r="${p.r.toFixed(3)}" fill="${p.fill ?? 'none'}" stroke="${p.layer === 'BG' ? '#8f959e' : ink}" stroke-width="${w.toFixed(3)}"${dash} data-layer="${p.layer}"/>`)
    }
  }
  for (const p of dr.prims) {
    if (p.t === 'text') {
      const [x, y] = P([p.x, p.y]).split(',')
      const rot = p.rot ? ` transform="rotate(${(-p.rot).toFixed(2)} ${x} ${y})"` : ''
      const anchor = p.anchor && p.anchor !== 'start' ? ` text-anchor="${p.anchor}"` : ''
      const weight = p.bold ? ' font-weight="600"' : ''
      out.push(`<text x="${x}" y="${y}" font-size="${p.h.toFixed(3)}"${anchor}${weight}${rot} fill="${p.colour ?? ink}" data-layer="TEXT">${esc(p.s)}</text>`)
    }
  }
  if (o.over) out.push(o.over)
  out.push('</g></svg>')
  return out.join('\n')
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ------------------------------------------------------------------------------------------------ colour + scan

function rounded(b: Box, r: number, jitter: number, seed: number): Pt[] {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * jitter
  const pts: Pt[] = []
  const corners: [Pt, number][] = [[[b[2] - r, b[1] + r], -90], [[b[2] - r, b[3] - r], 0], [[b[0] + r, b[3] - r], 90], [[b[0] + r, b[1] + r], 180]]
  for (const [[cx, cy], a0] of corners) {
    for (let k = 0; k <= 4; k++) {
      const a = ((a0 + (90 * k) / 4) * Math.PI) / 180
      pts.push([r3(cx + r * Math.cos(a) + rnd()), r3(cy + r * Math.sin(a) + rnd())])
    }
  }
  return pts
}

function blob(cx: number, cy: number, r: number, seed: number, n = 28): Pt[] {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5)
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    const rr = r * (1 + rnd() * 0.06)
    return [r3(cx + rr * Math.cos(a)), r3(cy + rr * Math.sin(a))] as Pt
  })
}

function presentation() {
  const dr = new Drawing()
  planBase(dr, 'PRESENTATION PLAN', 'PP-1', 'A', '2026-09-20', 'NTS')
  const C = { pavers: '#d8c9ad', aggregate: '#c4bdb0', grass: '#b9d7a0', bed: '#e7a6c8', lawn: '#cfe7b0', canopy: '#7fb26f', hedge: '#4f8f4a', lane: '#f2d7cf' }
  dr.fill(boxPts([0, 0, 50, 30]), '#efeadf')
  dr.fill(boxPts(FIRE), C.lane)
  dr.fill(boxPts(PAVING[0].box), C.pavers)
  dr.fill(boxPts(PAVING[1].box), C.aggregate)
  dr.fill(boxPts(PAVING[2].box), C.grass)
  dr.fill(boxPts(BED), C.bed)
  dr.fill(boxPts(LAWN), C.lawn)
  dr.fill(boxPts([HEDGE_X[0] - 0.15, HEDGE_Y[0], HEDGE_X[1] + 0.15, HEDGE_Y[1]]), C.hedge)
  for (const p of PAVING) dr.rect(p.box, 'HATCH')
  brickHatch(dr, PAVING[0].box)
  dr.rect(BED, 'PLANT')
  dr.rect(LAWN, 'PLANT')
  TREES.forEach(([cx, cy]) => {
    dr.fill(canopy(cx, cy, TREE_R + 0.15, 24, 0), C.canopy)
    dr.poly(canopy(cx, cy, TREE_R + 0.15, 24, 0), 'TREE', true)
    dr.circle([cx - 0.5, cy + 0.5], 0.5, 'HATCH')
    dr.circle([cx + 0.6, cy - 0.2], 0.4, 'HATCH')
  })
  dr.text('AZALEA', 13.5, 16.6, 0.8, { anchor: 'middle', bold: true })
  dr.text('LAWN', 34, 16.6, 0.8, { anchor: 'middle', bold: true })
  dr.text('PERMEABLE PAVERS', 15.2, 8.6, 0.6, { anchor: 'middle', bold: true })
  const LG: Box = [54, 19.5, 73, 31.5]
  dr.rect(LG, 'FRAME')
  dr.text('LEGEND', 55, 30.0, 0.8, { bold: true })
  ;([[C.canopy, 'CAMPHOR'], [C.bed, 'AZALEA'], [C.lawn, 'LAWN'], [C.pavers, 'PERMEABLE PAVERS'], [C.aggregate, 'EXPOSED AGGREGATE'], [C.grass, 'GRASS PAVERS']] as [string, string][]).forEach(([c, label], i) => {
    const y = 28.0 - i * 1.4
    dr.fill(boxPts([55.6, y, 58.4, y + 0.9]), c)
    dr.rect([55.6, y, 58.4, y + 0.9], 'HATCH')
    dr.text(label, 59.4, y + 0.2, 0.5)
  })
  const objects: Obj[] = []
  TREES.forEach(([cx, cy], i) => {
    const b = blob(cx, cy, TREE_R + 0.1, 11 + i * 7)
    objects.push(obj({ object_id: `M-${String(i + 1).padStart(2, '0')}`, kind: 'tree', label: 'Camphor', species_code: 'CC', centre: [cx, cy], area_m2: r3(area(b)), outline: b, closed: true, by: 'sam' }))
  })
  const masks: [string, string, string, Box, string][] = [
    ['M-09', 'shrub_bed', 'Azalea', [6.08, 12.06, 20.92, 21.98], 'RH'],
    ['M-10', 'lawn', 'Lawn', [23.94, 11.9, 44.06, 22.1], 'LW'],
    ['M-11', 'paving', 'Permeable pavers', [2.1, 3.1, 28.4, 10.95], 'PP'],
    ['M-12', 'paving', 'Exposed aggregate', [30.9, 2.95, 43.05, 7.1], 'EA'],
    ['M-13', 'paving', 'Grass pavers', [31.1, 9.05, 36.95, 14.9], 'GP'],
  ]
  masks.forEach(([id, kind, label, b, code], i) => {
    const pts = rounded(b, 0.35, 0.05, 101 + i * 13)
    objects.push(obj({ object_id: id, kind, label, species_code: code, centre: [r3((b[0] + b[2]) / 2), r3((b[1] + b[3]) / 2)], area_m2: Math.round(area(pts) * 10) / 10, outline: pts, closed: true, by: 'sam' }))
  })
  objects.push(obj({ object_id: 'BD-01', kind: 'boundary', label: 'Site boundary', outline: fp(boxPts([0, 0, 50, 30])), closed: true, by: 'geometry' }))
  objects.push(obj({ object_id: 'TB-01', kind: 'title_block', label: 'Title block', outline: fp(boxPts([54, -7.5, 75, 7])), closed: true, by: 'geometry' }))
  return { dr, objects }
}

// ------------------------------------------------------------------------------------------------ run.json

const SPECIES_NAMES: Record<string, string> = { CC: 'Cinnamomum camphora', DE: 'Duranta erecta', RH: 'Rhododendron simsii', LW: 'Axonopus compressus' }

function main() {
  mkdirSync(join(OUT, 'sheets'), { recursive: true })
  mkdirSync(join(OUT, 'crops'), { recursive: true })

  const L1 = sheetL1()
  const sheetsSrc: Record<string, { dr: Drawing; objects: Obj[] }> = {
    'L-0': sheetL0(), 'L-1': L1, 'L-1B': sheetL1({ revB: true }), 'L-2': sheetL2(), 'L-3': sheetL3(), 'L-4': sheetL4(),
    'L-5': sheetL5(), 'L-6': sheetL6(), 'L-7': sheetL7(), 'L-8': sheetL8(), 'PP-1': presentation(),
  }
  const bounds: Record<string, Box> = {}
  for (const [id, s] of Object.entries(sheetsSrc)) {
    // like the backend: the API bounds are the padded print window
    const win = padWindow(boundsOf(s.dr)).map(r3) as Box
    bounds[id] = win
    writeFileSync(join(OUT, 'sheets', `${id}.svg`), toSvg(s.dr, win, { px: id === 'L-6' ? 160 : 14 }))
  }
  // PP-1: the colour rendering doubles as the "png" a raster sheet would carry
  // SCAN: the L-1 drawing as a grey, slightly rotated scan
  bounds.SCAN = bounds['L-1']
  const scanWin = bounds.SCAN
  const scanDefs = `<filter id="grain" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.44  0 0 0 0 0.42  0 0 0 0.16 0"/><feComposite in2="SourceGraphic" operator="over"/></filter><filter id="soft"><feGaussianBlur stdDeviation="0.035"/></filter>`
  const W = scanWin[2] - scanWin[0]
  const H = scanWin[3] - scanWin[1]
  writeFileSync(join(OUT, 'sheets', 'SCAN.svg'), toSvg(L1.dr, scanWin, {
    px: 14, bg: '#e4e1d9', ink: '#3b3b3b', weight: 1.4, defs: scanDefs,
    groupAttr: `transform="rotate(1.5 ${(W / 2).toFixed(2)} ${(H / 2).toFixed(2)})" filter="url(#soft)"`,
    over: `<rect x="-5" y="-5" width="${W + 10}" height="${H + 10}" filter="url(#grain)" fill="#000" fill-opacity="0.0"/>`,
  }))

  // the crop Muse Spark was sent: T-08 and its neighbourhood
  const cropWin: Box = [29.4, -1.0, 36.6, 6.2]
  const cropDr = new Drawing()
  cropDr.prims = L1.dr.prims.filter((p) => p.t !== 'text')
  writeFileSync(join(OUT, 'crops', 'I-01.svg'), toSvg(cropDr, cropWin, {
    px: 80, weight: 0.55,
    over: `<rect x="${(33 - 2.3 - cropWin[0]).toFixed(2)}" y="${(cropWin[3] - 2.5 - 2.3).toFixed(2)}" width="4.6" height="4.6" fill="none" stroke="#d92d20" stroke-width="0.04" stroke-dasharray="0.18 0.12"/>`,
  }))

  const sheetMeta: Record<string, Partial<Record<string, unknown>>> = {
    'L-0': { file_id: 'f01', title: 'Cover and Index', number: 'L-0', kind: 'cover', kind_confidence: 0.98, kind_by: 'spark', kind_why: 'Title, drawing index and no site geometry.', revision: 'A', date: '2026-09-18', scale_title: 'NTS', counted: false, not_counted_reason: 'cover sheet' },
    'L-1': { file_id: 'f02', title: 'Planting Plan', number: 'L-1', kind: 'plan', kind_confidence: 0.97, kind_by: 'spark', kind_why: 'Plan view: canopies in plan, a plant schedule and a north arrow.', revision: 'A', date: '2026-09-18', scale_title: '1:200', scale_measured: '1:200', counted: true },
    'L-1B': { file_id: 'f03', title: 'Planting Plan (Rev B)', number: 'L-1', kind: 'plan', kind_confidence: 0.96, kind_by: 'spark', kind_why: 'Same sheet number as L-1, Rev B in the title block, dated 2026-10-14.', revision: 'B', date: '2026-10-14', scale_title: '1:200', scale_measured: '1:200', counted: false, not_counted_reason: 'second revision of L-1 — counts shown for both; confirm which governs' },
    'L-2': { file_id: 'f05', title: 'South Elevation', number: 'L-2', kind: 'elevation', kind_confidence: 0.99, kind_by: 'spark', kind_why: 'Trees drawn from the side on a ground line: trunks and canopy ellipses.', revision: 'A', date: '2026-09-18', scale_title: '1:100', counted: false, not_counted_reason: 'elevation — the same trees as L-1, not counted' },
    'L-3': { file_id: 'f06', title: 'Paving Plan', number: 'L-3', kind: 'plan', kind_confidence: 0.95, kind_by: 'spark', kind_why: 'Plan view of hatched paving areas with callouts.', revision: 'A', date: '2026-09-18', scale_title: '1:200', scale_measured: '1:200', counted: true },
    'L-4': { file_id: 'f07', title: 'Plant Schedule', number: 'L-4', kind: 'schedule', kind_confidence: 0.99, kind_by: 'spark', kind_why: 'A table of species, quantities and sizes; no drawing.', revision: 'A', date: '2026-09-18', scale_title: 'NTS', counted: false, not_counted_reason: 'schedule — read, not measured' },
    'L-5': { file_id: 'f08', title: 'Enlarged Plan — West', number: 'L-5', kind: 'plan', kind_confidence: 0.9, kind_by: 'spark', kind_why: 'Enlarged plan of the west half with a match line to L-1.', revision: 'A', date: '2026-09-18', scale_title: '1:200', scale_measured: '1:100', counted: false, not_counted_reason: 'enlarged plan — repeats four trees of L-1' },
    'L-6': { file_id: 'f09', title: 'Tree Pit Detail', number: 'L-6', kind: 'detail', kind_confidence: 0.97, kind_by: 'spark', kind_why: 'A section through one tree pit with dimensions.', revision: 'A', date: '2026-09-18', scale_title: '1:20', counted: false, not_counted_reason: 'detail — pit 1.2 × 1.2 m, soil 0.8 m read for the greening rule' },
    'L-7': { file_id: 'f10', title: 'Irrigation Plan', number: 'L-7', kind: 'background', kind_confidence: 0.93, kind_by: 'spark', kind_why: 'Pipes and heads over dashed canopies: the trees are background.', revision: 'A', date: '2026-09-30', scale_title: '1:200', counted: false, not_counted_reason: 'irrigation — canopies are background' },
    'L-8': { file_id: 'f11', title: 'Lighting Plan', number: 'L-8', kind: 'background', kind_confidence: 0.92, kind_by: 'spark', kind_why: 'Light fixtures over dashed canopies: the trees are background.', revision: 'A', date: '2026-09-30', scale_title: '1:200', counted: false, not_counted_reason: 'lighting — canopies are background' },
    SCAN: { file_id: 'f19', title: 'Planting Plan (scan)', number: 'L-1', kind: 'plan', kind_confidence: 0.81, kind_by: 'spark', kind_why: 'A raster scan of L-1, rotated 1.5°; title block read by Muse Spark.', revision: 'A', date: '2026-09-18', scale_title: '1:200', counted: false, not_counted_reason: 'raster scan — no vectors, not measured' },
    'PP-1': { file_id: 'f20', title: 'Presentation Plan (Colour)', number: 'PP-1', kind: 'plan', kind_confidence: 0.88, kind_by: 'spark', kind_why: 'A coloured rendering of the site; areas by SAM 3.1.', revision: 'A', date: '2026-09-20', scale_title: 'NTS', counted: false, not_counted_reason: 'presentation — SAM areas compared with CAD, not counted' },
  }
  const sheets = Object.entries(sheetMeta).map(([id, meta]) => {
    const b = bounds[id]
    const src = sheetsSrc[id]
    const raster = id === 'SCAN' || id === 'PP-1'
    return {
      sheet_id: id, ...meta,
      svg_url: `/mock/sheets/${id}.svg`,
      png_url: raster ? `/mock/sheets/${id}.svg` : `/mock/sheets/${id}.svg`,
      bounds: { min_x: b[0], min_y: b[1], max_x: b[2], max_y: b[3] },
      objects: src ? src.objects : [],
    }
  })

  const t08 = L1.objects.find((o) => o.object_id === 'T-08')!
  const t08pts = (t08.outline as number[][])
  const points = [t08.centre as number[], t08pts[1], t08pts[4], t08pts[7], t08pts[10]].map((p) => [r3(p[0]), r3(p[1])])
  const items = [
    {
      item_id: 'I-01', kind: 'tree', label: 'Camphor', species_code: 'CC', unit: 'plant', geometry_count: 7, spark_count: 8, schedule_count: 8, label_count: 1,
      agreed: false, flagged_reason: 'T-08 is an open outline (12 gaps, up to 40 cm). Muse Spark says one tree; please confirm.',
      object_ids: treeIds, sheet_ids: ['L-1'],
      spark: {
        crop_url: '/mock/crops/I-01.svg', confidence: 0.95, points,
        why: 'Twelve straight pieces form one ring of radius 2.0 m with gaps under 0.4 m; the centre cross matches the seven closed canopies; "CAMPHOR, typ." on T-03 applies to identical symbols.',
        answer: { is_one_object: true, kind: 'tree', label: 'typ. → Camphor', species_code: 'CC', count: 1, confidence: 0.95, model: 'muse-spark' },
      },
    },
    { item_id: 'I-02', kind: 'hedge', label: 'Duranta', species_code: 'DE', unit: 'plant', geometry_count: 182, spark_count: 182, schedule_count: 182, label_count: 1, agreed: true, quote_count: 182, object_ids: ['H-01'], sheet_ids: ['L-1'] },
    { item_id: 'I-03', kind: 'shrub_bed', label: 'Azalea', species_code: 'RH', unit: 'm2', geometry_count: 150, schedule_count: 150, agreed: true, quote_count: 150, object_ids: ['B-01'], sheet_ids: ['L-1'] },
    { item_id: 'I-04', kind: 'lawn', label: 'Lawn', species_code: 'LW', unit: 'm2', geometry_count: 200, schedule_count: 200, agreed: true, quote_count: 200, object_ids: ['L-01'], sheet_ids: ['L-1'] },
    { item_id: 'I-05', kind: 'paving', label: 'Permeable pavers', species_code: 'PP', unit: 'm2', geometry_count: 212, spark_count: 212, agreed: true, quote_count: 212, object_ids: ['P-01'], sheet_ids: ['L-3'] },
    { item_id: 'I-06', kind: 'paving', label: 'Exposed aggregate', species_code: 'EA', unit: 'm2', geometry_count: 48, spark_count: 48, agreed: true, quote_count: 48, object_ids: ['P-02'], sheet_ids: ['L-3'] },
    { item_id: 'I-07', kind: 'paving', label: 'Grass pavers', species_code: 'GP', unit: 'm2', geometry_count: 36, spark_count: 36, agreed: true, quote_count: 36, object_ids: ['P-03'], sheet_ids: ['L-3'] },
    { item_id: 'I-08', kind: 'planter_edge', label: 'Planter edge', unit: 'm', geometry_count: 22, agreed: true, quote_count: 22, object_ids: ['PE-01'], sheet_ids: ['L-3'] },
  ]

  const files = [
    ['f01', 'Drawings/CAD/L-0 Cover and Index.dxf', 'drawing_vector', 'content', 'DXF, one sheet: the cover and a drawing index of ten sheets.', 'L-0', 182_400],
    ['f02', 'Drawings/CAD/L-1 Planting Plan.dxf', 'drawing_vector', 'content', 'DXF, Rev A of 2026-09-18: the planting plan.', 'L-1', 412_800],
    ['f03', 'Drawings/CAD/L-1 Planting Plan (Rev B).dxf', 'drawing_vector', 'spark', 'A second revision of L-1: Rev B, 2026-10-14, read from the title block.', 'L-1B', 418_300],
    ['f04', 'Drawings/CAD/L-1 Planting Plan.bak', 'backup_ignored', 'content', 'AutoCAD backup with the same content as L-1 Rev A.', undefined, 412_800],
    ['f05', 'Drawings/CAD/L-2 South Elevation.dxf', 'drawing_vector', 'spark', 'Muse Spark: an elevation — the same eight trees from the side.', 'L-2', 156_200],
    ['f06', 'Drawings/CAD/L-3 Paving Plan.dxf', 'drawing_vector', 'content', 'DXF: hatched paving areas, a planter edge.', 'L-3', 344_100],
    ['f07', 'Drawings/CAD/L-4 Plant Schedule.dxf', 'drawing_vector', 'spark', 'Muse Spark: a schedule sheet — read, not measured.', 'L-4', 98_700],
    ['f08', 'Drawings/CAD/L-5 Enlarged Plan - West.dxf', 'drawing_vector', 'spark', 'Muse Spark: an enlarged plan; a match line found.', 'L-5', 201_900],
    ['f09', 'Drawings/CAD/L-6 Tree Pit Detail.dxf', 'drawing_vector', 'spark', 'Muse Spark: a detail — pit 1.2 × 1.2 m, soil 0.8 m on the slab.', 'L-6', 64_300],
    ['f10', 'Drawings/CAD/L-7 Irrigation Plan.dxf', 'drawing_vector', 'spark', 'Muse Spark: irrigation — the canopies are background.', 'L-7', 288_000],
    ['f11', 'Drawings/CAD/L-8 Lighting Plan.dxf', 'drawing_vector', 'spark', 'Muse Spark: lighting — the canopies are background.', 'L-8', 241_600],
    ['f12', 'Drawings/CAD/pasted image #1.png', 'drawing_image', 'spark', 'Material photo: exposed aggregate — matched to P-02.', undefined, 1_204_000],
    ['f13', 'Drawings/CAD/pasted image #2.png', 'drawing_image', 'spark', 'Material photo: permeable pavers — matched to P-01.', undefined, 988_000],
    ['f14', 'Drawings/CAD/pasted image #3.png', 'drawing_image', 'spark', 'Material photo: grass pavers — matched to P-03.', undefined, 1_102_000],
    ['f15', 'Drawings/CAD/pasted image #4.png', 'drawing_image', 'spark', 'Material photo: a granite kerb — no matching item.', undefined, 876_000],
    ['f16', 'Drawings/CAD/pasted image #5.png', 'drawing_image', 'spark', 'Material photo: azalea in flower — matched to B-01.', undefined, 1_310_000],
    ['f17', 'Drawings/CAD/pasted image #6.png', 'drawing_image', 'spark', 'Material photo: a camphor specimen — matched to Camphor.', undefined, 1_450_000],
    ['f18', 'Drawings/PDF/Landscape Drawings (Full Set).pdf', 'drawing_vector', 'content', 'Vector PDF, nine pages: the same sheets as the DXFs.', undefined, 3_820_000],
    ['f19', 'Drawings/PDF/L-1 Planting Plan (scan).pdf', 'drawing_raster', 'content', 'Raster only, rotated 1.5°: no vectors to measure.', 'SCAN', 5_610_000],
    ['f20', 'Drawings/PDF/Presentation Plan (Colour).pdf', 'drawing_raster', 'spark', 'A colour rendering: areas found by SAM 3.1.', 'PP-1', 7_240_000],
    ['f21', 'Drawings/PDF/Design review notes 240910.pdf', 'spec', 'spark', 'Review notes: three issues raised by the reviewer.', undefined, 212_000],
    ['f22', 'Bills/Landscape BOQ rev1.xlsx', 'bill', 'content', 'Bill, first revision.', undefined, 48_200],
    ['f23', 'Bills/Landscape BOQ rev1a.xlsx', 'bill', 'content', 'Bill, same day: one row changed.', undefined, 48_900],
    ['f24', 'Bills/Landscape BOQ rev2.xlsx', 'bill', 'content', 'Bill, current: eleven rows, a hidden sheet.', undefined, 61_700],
    ['f25', 'Bills/Tree pit guide - shallow roots.pdf', 'spec', 'content', 'Specification text: tree pit, shallow-rooted species.', undefined, 402_000],
    ['f26', 'Bills/Tree pit guide - medium roots.pdf', 'spec', 'content', 'Specification text: tree pit, medium-rooted species.', undefined, 398_000],
    ['f27', 'Bills/Tree pit guide - deep roots.pdf', 'spec', 'content', 'Specification text: tree pit, deep-rooted species.', undefined, 405_000],
    ['f28', 'Bills/Planting procurement spec.pdf', 'spec', 'content', 'Specification text: plant procurement standard.', undefined, 655_000],
    ['f29', 'Quotes/Irrigation/irrigation-quote-240909.xls', 'unsupported', 'ext', 'Excel 97-2003: save as .xlsx to read it.', undefined, 72_704],
    ['f30', 'Quotes/Metal/street-furniture-quote.pdf', 'quote', 'content', 'A supplier quote: benches and bollards.', undefined, 188_000],
    ['f31', 'Quotes/Metal/metal-details.zip', 'archive_unpacked', 'ext', 'Zip, unpacked: one DXF inside.', undefined, 96_500],
    ['f32', 'Quotes/Metal/metal-details.zip/drain-cover-detail.dxf', 'drawing_vector', 'spark', 'A drain cover detail — not a landscape quantity.', undefined, 121_000],
    ['f33', 'Other/BOQ - Landscape - 20241014 (paving update).xlsx', 'bill', 'content', 'Bill, latest by date: paving 212 → 236 m².', undefined, 63_100],
    ['f34', 'Green Building Label - required documents.pdf', 'spec', 'spark', 'Checklist: a greening report is required.', undefined, 254_000],
    ['f35', 'Planter mood board.pptx', 'presentation', 'ext', 'A slide deck, not a drawing.', undefined, 2_310_000],
  ].map(([file_id, path, verdict, decided_by, why, sheet_id, size]) => {
    const p = String(path)
    const name = p.split('/').pop()!
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
    const f: Record<string, unknown> = { file_id, path: `Greenfield Residences — Landscape Package/${p}`, name, ext, size_bytes: size, verdict, decided_by, why }
    if (sheet_id) f.sheet_id = sheet_id
    if (file_id === 'f31') f.children = ['f32']
    return f
  })

  const trees8 = treeIds
  const BTR = 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=D0070115&flno='
  const terms = [
    { label: 'Camphor · 8 trees × 16 m²', count_or_area: 8, Ai: 128, Gi: 1.5, product: 192.0 },
    { label: 'Duranta hedge · 54 m × 0.3 m', count_or_area: 16.2, Ai: 16.2, Gi: 0.5, product: 8.1 },
    { label: 'Azalea bed', count_or_area: 150, Ai: 150, Gi: 0.5, product: 75.0 },
    { label: 'Lawn', count_or_area: 200, Ai: 200, Gi: 0.3, product: 60.0 },
  ]
  const greening = {
    check_id: 'E14', category: 'regulation', title: 'Greening carbon fixation is short: 268.1 of 297.0 kgCO₂e/yr', severity: 'fail', by: ['geometry', 'spark', 'rule'],
    why: 'One tree species gives no native-tree bonus (α 0.8). Σ Gi × Ai = 335.1, × 0.8 = 268.1, below the 297.0 required for a 1,500 m² ordinary site at 40% coverage.',
    evidence: { sheet_ids: ['L-1'], object_ids: [...trees8, 'H-01', 'B-01', 'L-01'] },
    citation: { article: 'Building Technical Regulations §302 — greening carbon-fixation requirement', url: `${BTR}302`, gloss: 'The planting’s total carbon fixation must exceed ½ × the minimum greening area × β (β 0.66 on an ordinary site).' },
    numbers: { required: 297.0, A0: 1500, Ap: 0, r: 0.4, A_prime: 900, beta: 0.66, provided: 268.1, sigma: 335.1, alpha: 0.8, ra: 0, unit: 'kgCO₂e/yr', jurisdiction: 'national rule · local', terms } as Record<string, unknown>,
    fixes: [
      { label: '+2 Camphor, the same species', result: 306.5, passes: true },
      { label: 'swap 2 of 8 Camphor for Bischofia (Bischofia javanica), a second native species — α 0.8 → 1.3, no extra trees', result: 435.6, passes: true },
    ],
  }

  type C = Record<string, unknown>
  const ck = (check_id: string, category: string, severity: string, by: string[], title: string, why: string, evidence: C = {}, extra: C = {}): C => ({ check_id, category, title, severity, by, why, evidence, ...extra })
  const checks: C[] = [
    ck('E01', 'quantity', 'flag', ['geometry', 'spark'], 'T-08 is an open outline; Muse Spark says one tree', 'Geometry closes seven canopies; the eighth has 12 gaps up to 40 cm. Muse Spark sees one tree and why; a person confirms.', { sheet_ids: ['L-1'], object_ids: ['T-08'] }),
    ck('E02', 'quantity', 'flag', ['geometry', 'spark', 'bill'], 'Schedule and bill say 12 Camphor, the drawing shows 8', 'L-4 and the bill list 12 Camphor; L-1 shows 8 canopies and its own schedule says 8. The drawing governs; raise it with the developer.', { sheet_ids: ['L-1', 'L-4'], object_ids: trees8, cells: ['BOQ rev2!C5'] }, { numbers: { row: 5, bill_text: 'Camphor tree, cal. 10 cm', bill_qty: 12, bill_unit: 'EA', unit_price: 5000, drawn_qty: 8, item_id: 'I-01', align_confidence: 0.97, aligned_to: 'CC · Cinnamomum camphora · cal. 10 · H3.5' } }),
    ck('E03', 'revision', 'review', ['spark'], 'Two revisions of L-1: Rev B is newer and shows 9 trees', 'Rev A (2026-09-18) and Rev B (2026-10-14) are both in the folder. Counts are shown for both; confirm which revision the quote follows.', { file_ids: ['f02', 'f03'], sheet_ids: ['L-1', 'L-1B'] }, { numbers: { rev_a_trees: 8, rev_b_trees: 9 } }),
    ck('E04', 'sheet', 'info', ['spark'], 'L-2 is an elevation — the same trees, not counted', 'Muse Spark classed L-2 as an elevation: the eight trees drawn from the side. Counting them would double the trees.', { sheet_ids: ['L-2', 'L-1'], object_ids: trees8 }),
    ck('E05', 'sheet', 'info', ['spark', 'geometry'], 'L-5 is an enlarged plan — four trees repeated, not counted', 'A match line at x = 21 m ties L-5 to L-1; T-01 to T-04 appear on both.', { sheet_ids: ['L-5'], object_ids: trees8.slice(0, 4) }),
    ck('E06', 'sheet', 'info', ['spark'], 'L-7 and L-8 show canopies as background', 'Irrigation and lighting sheets draw the trees dashed for reference; they are not planting sheets.', { sheet_ids: ['L-7', 'L-8'], file_ids: ['f10', 'f11'] }),
    ck('E07', 'quantity', 'info', ['geometry'], 'Legend symbol is not a tree', 'The tree symbol inside the legend box is excluded from the count.', { sheet_ids: ['L-1'], object_ids: ['LG-01', 'LG-02'] }),
    ck('E08', 'quantity', 'flag', ['geometry'], 'A tree is drawn outside the site, in the road reserve', 'T-09 sits 3.6 m south of the boundary. It is drawn, not counted toward greening, and not ours to plant.', { sheet_ids: ['L-1'], object_ids: ['T-09'] }),
    ck('E09', 'regulation', 'flag', ['geometry', 'rule'], 'A tree is drawn inside the fire-truck access lane', 'T-10 is inside the hatched lane, an area where greening cannot count; it may also block the lane.', { sheet_ids: ['L-1'], object_ids: ['T-10', 'FL-01'] }, { citation: { article: 'Building Technical Regulations §299 — definitions: area hard to green', url: `${BTR}299`, gloss: 'Fire-truck access lanes and similar areas are excluded from the minimum greening area.' } }),
    ck('E10', 'area', 'flag', ['geometry'], 'Paving on L-3 overlaps the lawn on L-1 by 20 m²', 'The permeable-paver hatch on L-3 runs 20 m² into the lawn drawn on L-1: that area would be priced twice.', { sheet_ids: ['L-3', 'L-1'], object_ids: ['P-01', 'L-01'] }, { numbers: { overlap_m2: 20 } }),
    ck('E12', 'regulation', 'flag', ['spark', 'rule'], 'Tree pits on the slab are too shallow for large trees', 'L-6: pit 1.2 × 1.2 m (1.44 m²), soil 0.8 m on the basement slab. Large trees then count as small: Gi 1.5 → 1.0.', { sheet_ids: ['L-6'] }, { citation: { article: 'Greening Design Technical Specification, Table 1 — carbon fixation by planting type', url: 'https://www.nlma.gov.tw/', gloss: 'On artificial ground, soil depth and pit size set which Gi class a tree may claim.' }, numbers: { pit_m2: 1.44, soil_m: 0.8, gi_from: 1.5, gi_to: 1.0 } }),
    ck('E13', 'bill', 'flag', ['bill', 'spark'], 'Azalea: 450 plants for 150 m² is 3 per m²; the schedule asks 4', 'At 4 plants per m² the bed needs 600. The bill is 150 plants short.', { cells: ['BOQ rev2!C7'], object_ids: ['B-01'], sheet_ids: ['L-1'] }, { numbers: { row: 7, bill_text: 'Azalea, H0.4', bill_qty: 450, bill_unit: 'EA', unit_price: 120, drawn_qty: 600, item_id: 'I-03', align_confidence: 0.94 } }),
    greening,
    ck('E15', 'protected_tree', 'review', ['spark', 'rule'], 'Existing camphor DBH 95 cm marked "to be removed"', 'A trunk of this size may be a protected tree under the city’s rule. Removal needs a review before the permit.', { sheet_ids: ['L-1'], object_ids: ['X-01'] }, { citation: { article: 'local City Tree Protection Ordinance — trees of protected size', url: 'https://lawsearch.local.gov.tw/', gloss: 'Trees above a set trunk size may not be removed without approval.' }, numbers: { dbh_cm: 95 } }),
    ck('E16', 'scale', 'flag', ['geometry', 'spark'], 'L-5: the title block says 1:200, the scale bar measures 1:100', 'Areas measured on this sheet at the title-block scale would be four times too large.', { sheet_ids: ['L-5'], object_ids: ['TB-01'] }, { numbers: { title: '1:200', measured: '1:100' } }),
    ck('E17', 'bill', 'flag', ['bill', 'geometry'], 'Hedge: bill 150 plants, drawing 182', '27.0 m at 0.3 m in two rows is 182 plants. The bill prices 150 — 32 short.', { cells: ['BOQ rev2!C6'], object_ids: ['H-01'], sheet_ids: ['L-1'] }, { numbers: { row: 6, bill_text: 'Duranta hedge, H0.6, 2 rows', bill_qty: 150, bill_unit: 'EA', unit_price: 180, drawn_qty: 182, item_id: 'I-02', align_confidence: 0.93 } }),
    ck('E18', 'bill', 'info', ['spark'], '"Camphore tree" aligned to Camphor at lower confidence', 'BOQ rev1a spells it "Camphore tree"; Muse Spark aligned it to CC Camphor at 0.81.', { file_ids: ['f23'], cells: ['BOQ rev1a!B5'] }, { numbers: { align_confidence: 0.81 } }),
    ck('E19', 'price', 'flag', ['bill'], 'Camphor at NT$5,000 is 65% under your price list', 'Your list prices Camphor cal. 10 cm at NT$14,000–16,000. At NT$5,000 the row cannot buy the specified tree.', { cells: ['BOQ rev2!E5'], object_ids: trees8, sheet_ids: ['L-1'] }, { numbers: { row: 5, unit_price: 5000, list_low: 14000, list_high: 16000, item_id: 'I-01' } }),
    ck('E20', 'price', 'flag', ['bill'], 'Permeable pavers at NT$3,800/m² are twice your list', 'Your list: NT$1,700–2,000 per m².', { cells: ['BOQ rev2!E9'], object_ids: ['P-01'], sheet_ids: ['L-3'] }, { numbers: { row: 9, bill_text: 'Permeable pavers, 60 mm', bill_qty: 212, bill_unit: 'm²', unit_price: 3800, drawn_qty: 212, list_low: 1700, list_high: 2000, item_id: 'I-05', align_confidence: 0.96 } }),
    ck('E21', 'arithmetic', 'flag', ['bill'], 'The subtotal skips row 11', '=SUM(F5:F10) leaves out the grass pavers: the subtotal is NT$54,000 short.', { cells: ['BOQ rev2!F12'] }, { numbers: { row: 12, bill_text: 'Subtotal', amount: 1141400, computed: 1195400 } }),
    ck('E22', 'revision', 'flag', ['bill'], 'Four versions of the bill; the newest by date changes paving 212 → 236 m²', 'rev1, rev1a, rev2 and the 20241014 budget file differ. The drawing shows 212 m².', { file_ids: ['f22', 'f23', 'f24', 'f33'], object_ids: ['P-01'] }, { numbers: { drawn_qty: 212, latest_bill_qty: 236 } }),
    ck('E23', 'bill', 'flag', ['bill'], 'A hidden sheet holds other totals', 'Sheet "old totals" is hidden in BOQ rev2 and sums to NT$1,320,000.', { file_ids: ['f24'] }),
    ck('E24', 'bill', 'info', ['bill'], 'Merged two-row header parsed', 'The bill’s two-row merged header was read into one header row.', { file_ids: ['f24'] }),
    ck('E25', 'ingest', 'info', ['spark'], 'The scanned L-1 has no vectors — read, not measured', 'Raster only and rotated 1.5°; Muse Spark read its title block (L-1, Rev A).', { file_ids: ['f19'], sheet_ids: ['SCAN'] }),
    ck('E26', 'ingest', 'flag', ['rule'], 'Excel 97 quote cannot be read — save as .xlsx', 'irrigation-quote-240909.xls is in the 1997–2003 format.', { file_ids: ['f29'] }),
    ck('E27', 'ingest', 'info', ['rule'], 'Backup ignored; zip unpacked', 'L-1 Planting Plan.bak matches Rev A; metal-details.zip holds one drain-cover DXF, not a landscape quantity.', { file_ids: ['f04', 'f31', 'f32'] }),
    ck('E28', 'document', 'review', ['spark'], 'Pasted material photos matched to paving types', 'Six photos pasted into the CAD folder: aggregate, pavers and grass pavers matched to P-01 to P-03; one kerb photo has no item.', { file_ids: ['f12', 'f13', 'f14', 'f15', 'f16', 'f17'] }),
    ck('E29', 'sheet', 'flag', ['spark', 'rule'], 'L-9 Sections is listed in the index but missing', 'The L-0 index lists ten sheets; L-9 is not in the package.', { sheet_ids: ['L-0'], file_ids: ['f01'] }),
    ck('E30', 'document', 'info', ['spark'], 'The green-building checklist requires a greening report', 'The §302 result above is that report’s core number.', { file_ids: ['f34'] }, { citation: { article: 'Building Technical Regulations §302 — greening carbon-fixation requirement', url: `${BTR}302`, gloss: 'The greening calculation is a required document for the label.' } }),
    ck('C-B08', 'bill', 'info', ['bill', 'spark'], 'Lawn: bill matches the drawing', 'Bill row 8 aligned to L-01, 200 m².', { cells: ['BOQ rev2!C8'], object_ids: ['L-01'], sheet_ids: ['L-1'] }, { numbers: { row: 8, bill_text: 'Lawn, carpet grass', bill_qty: 200, bill_unit: 'm²', unit_price: 350, drawn_qty: 200, item_id: 'I-04', align_confidence: 0.98 } }),
    ck('C-B10', 'bill', 'info', ['bill', 'spark'], 'Exposed aggregate: bill matches the drawing', 'Bill row 10 aligned to P-02, 48 m².', { cells: ['BOQ rev2!C10'], object_ids: ['P-02'], sheet_ids: ['L-3'] }, { numbers: { row: 10, bill_text: 'Exposed aggregate', bill_qty: 48, bill_unit: 'm²', unit_price: 2600, drawn_qty: 48, item_id: 'I-06', align_confidence: 0.95 } }),
    ck('C-B11', 'bill', 'info', ['bill', 'spark'], 'Grass pavers: bill matches the drawing', 'Bill row 11 aligned to P-03, 36 m².', { cells: ['BOQ rev2!C11'], object_ids: ['P-03'], sheet_ids: ['L-3'] }, { numbers: { row: 11, bill_text: 'Grass pavers', bill_qty: 36, bill_unit: 'm²', unit_price: 1500, drawn_qty: 36, item_id: 'I-07', align_confidence: 0.95 } }),
  ]
  const found = ['E01', 'E02', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E12', 'E13', 'E14', 'E16', 'E17', 'E18', 'E19', 'E20', 'E21', 'E22', 'E23', 'E24', 'E25', 'E26', 'E27', 'E29', 'E30']

  const tally = [
    { label: 'Camphor', species_code: 'CC', drawn: 7, spark: 8, schedule: 8, unit: 'plant', status: 'flagged' },
    { label: 'Duranta', species_code: 'DE', drawn: 182, spark: 182, schedule: 182, unit: 'plant', status: 'agreed' },
    { label: 'Azalea', species_code: 'RH', drawn: 150, spark: 0, schedule: 150, unit: 'm²', status: 'agreed' },
    { label: 'Lawn', species_code: 'LW', drawn: 200, spark: 0, schedule: 200, unit: 'm²', status: 'agreed' },
    { label: 'Permeable pavers', species_code: 'PP', drawn: 212, spark: 212, schedule: 0, unit: 'm²', status: 'agreed' },
    { label: 'Exposed aggregate', species_code: 'EA', drawn: 48, spark: 48, schedule: 0, unit: 'm²', status: 'agreed' },
    { label: 'Grass pavers', species_code: 'GP', drawn: 36, spark: 36, schedule: 0, unit: 'm²', status: 'agreed' },
    { label: 'Planter edge', drawn: 22, spark: 0, schedule: 0, unit: 'm', status: 'agreed' },
  ]

  const run = {
    run_id: 'mock-2026-11-02-greenfield',
    package: { name: 'Greenfield Residences — Landscape Package', folder: 'samples/greenfield', file_count: files.length },
    files, sheets, items, checks,
    errors: { planted: 30, found, flagged: ['E03', 'E15', 'E28'], missed: ['E11'], false_alarms: [] },
    tally,
    timing: { total_s: 38.4, spark_calls: 17, sam_calls: 2 },
  }
  const masks = sheets.find((s) => s.sheet_id === 'PP-1')!.objects.filter((o) => o.by === 'sam').map((o) => o.object_id)
  const director = [
    { id: 'drop', title: 'Thirty-five files, one verdict each', duration_s: 15 },
    { id: 'wake', title: 'The drawing wakes up', sheet_id: 'L-1', focus: [...trees8, 'H-01', 'B-01', 'L-01'], item_ids: ['I-01', 'I-03', 'I-04'], duration_s: 11 },
    { id: 'eye', title: 'The eye', sheet_id: 'L-1', focus: ['T-08'], item_ids: ['I-01'], check_ids: ['E01'], duration_s: 20 },
    { id: 'hedge', title: 'Hedge math', sheet_id: 'L-1', focus: ['H-01'], item_ids: ['I-02'], check_ids: ['E07'], duration_s: 17 },
    { id: 'colour', title: 'Lines to colour', sheet_id: 'PP-1', focus: masks, item_ids: ['I-01', 'I-03', 'I-04', 'I-05', 'I-06', 'I-07'], duration_s: 15 },
    { id: 'gauge', title: 'The gauge', sheet_id: 'L-1', check_ids: ['E14'], duration_s: 17 },
    { id: 'bill', title: 'The bill', sheet_id: 'L-1', check_ids: ['E02', 'E17', 'E19'], item_ids: ['I-01', 'I-02', 'I-03', 'I-04', 'I-05', 'I-06', 'I-07'], duration_s: 20 },
    { id: 'callback', title: 'Twelve, again', sheet_id: 'L-2', focus: trees8, check_ids: ['E04'], duration_s: 13 },
  ]
  const rules = checks.filter((c) => c.category === 'regulation' || c.category === 'protected_tree')
  writeFileSync(join(OUT, 'run.json'), JSON.stringify(run, null, 1))
  writeFileSync(join(OUT, 'director.json'), JSON.stringify(director, null, 1))
  writeFileSync(join(OUT, 'rules.json'), JSON.stringify(rules, null, 1))
  void SPECIES_NAMES
  console.log(`wrote ${OUT}: ${files.length} files, ${sheets.length} sheets, ${items.length} items, ${checks.length} checks`)
}

main()
