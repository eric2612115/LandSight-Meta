/** A revision cloud: a scalloped path around the union box of a finding's objects, in the sheet's own SVG user space
 * (x = metres east, y = −metres north, as lib/geo.ts pathOf), so it lands on the objects at any zoom. */
import { bboxOf, padBox, unionBox, type BBox } from '../lib/geo'
import type { DrawingObject } from '../lib/types'

/** The box the cloud goes around: the objects' union, padded by `pad` metres (null when no object has an outline). */
export function cloudBox(objects: Pick<DrawingObject, 'outline'>[], pad = 1): BBox | null {
  const b = unionBox(objects.filter((o) => o.outline.length > 0).map((o) => bboxOf(o.outline)))
  return b ? padBox(b, pad) : null
}

/** The scalloped outline of a box (metres), clockwise on screen, each scallop an arc bulging outward. `arc`: the
 * scallop's chord in metres (default: a quarter of the shorter side, 0.6–3 m). */
export function cloudPath(b: BBox, arc?: number): string {
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const chord = arc ?? Math.min(3, Math.max(0.6, Math.min(w, h) / 4))
  // screen corners (y flipped): top-left, top-right, bottom-right, bottom-left
  const pts: [number, number][] = [[b.x0, -b.y1], [b.x1, -b.y1], [b.x1, -b.y0], [b.x0, -b.y0]]
  const f = (v: number) => Number(v.toFixed(3))
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % 4]
    const len = Math.hypot(bx - ax, by - ay)
    const n = Math.max(2, Math.round(len / chord))
    const r = (len / n) * 0.62
    for (let k = 1; k <= n; k++) d += `A${f(r)},${f(r)} 0 0 1 ${f(ax + ((bx - ax) * k) / n)},${f(ay + ((by - ay) * k) / n)}`
  }
  return `${d}Z`
}

/** Clouds that would sit on the same objects drawn once, their numbers joined ("8·9"), in first-number order. */
export function mergeClouds<T extends { box: BBox; n: number | string }>(items: T[]): { box: BBox; label: string; first: T }[] {
  const key = (b: BBox) => [b.x0, b.y0, b.x1, b.y1].map((v) => v.toFixed(1)).join(',')
  const out = new Map<string, { box: BBox; label: string; first: T }>()
  for (const it of items) {
    const k = key(it.box)
    const had = out.get(k)
    if (had) had.label += `·${it.n}`
    else out.set(k, { box: it.box, label: String(it.n), first: it })
  }
  return [...out.values()]
}
