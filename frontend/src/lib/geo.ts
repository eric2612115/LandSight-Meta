import type { Bounds, DrawingObject } from './types'

export type BBox = { x0: number; y0: number; x1: number; y1: number }

export const bboxOf = (pts: number[][]): BBox => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

export const unionBox = (boxes: BBox[]): BBox | null =>
  boxes.length
    ? boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }))
    : null

export const padBox = (b: BBox, px: number, py = px): BBox => ({ x0: b.x0 - px, y0: b.y0 - py, x1: b.x1 + px, y1: b.y1 + py })

export const boundsBox = (b: Bounds): BBox => ({ x0: b.min_x, y0: b.min_y, x1: b.max_x, y1: b.max_y })

export const centreOf = (o: DrawingObject): [number, number] => {
  if (o.centre) return o.centre
  const b = bboxOf(o.outline)
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]
}

/** SVG path in the sheet's user space (x = metres east, y = −metres north). */
export const pathOf = (pts: number[][], closed: boolean) =>
  pts.length ? `M${pts.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join('L')}${closed ? 'Z' : ''}` : ''

export type Seg = [[number, number], [number, number]]

/** The loose pieces of an open outline: each edge, shortened where a gap point sits near its ends. */
export function openSegments(o: DrawingObject): Seg[] {
  const pts = o.outline
  const n = pts.length
  if (n < 2) return []
  const gaps = o.gaps ?? []
  const segs: Seg[] = []
  const edges = o.closed || gaps.length >= n ? n : n - 1
  for (let i = 0; i < edges; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const ux = (b[0] - a[0]) / L
    const uy = (b[1] - a[1]) / L
    const near = (p: number[]) => gaps.some(([gx, gy]) => Math.hypot(gx - p[0], gy - p[1]) < Math.min(0.6, L / 3))
    const sa = near(a) ? Math.min(0.2, L / 6) : 0
    const sb = near(b) ? Math.min(0.2, L / 6) : 0
    segs.push([[a[0] + ux * sa, a[1] + uy * sa], [b[0] - ux * sb, b[1] - uy * sb]])
  }
  return segs
}

/** Points spread evenly along the two long sides of a hedge band (or along a polyline when there is one row). */
export function hedgeDots(o: DrawingObject, count: number, rows = 2): [number, number][] {
  const pts = o.outline
  if (pts.length < 2 || count <= 0) return []
  let lines: [number[], number[]][]
  if (pts.length === 4 && rows === 2) {
    const e = [0, 1, 2, 3].map((i) => [pts[i], pts[(i + 1) % 4]] as [number[], number[]])
    const len = (s: [number[], number[]]) => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1])
    const sorted = [...e].sort((a, b) => len(b) - len(a))
    const [l1, l2] = sorted
    // run both rows the same way (south to north / west to east)
    const orient = (s: [number[], number[]]) => (s[0][1] + s[0][0] * 1e-3 <= s[1][1] + s[1][0] * 1e-3 ? s : ([s[1], s[0]] as [number[], number[]]))
    lines = [orient(l1), orient(l2)]
  } else {
    lines = [[pts[0], pts[pts.length - 1]]]
  }
  const per = Math.max(1, Math.round(count / lines.length))
  const out: [number, number][] = []
  for (let k = 0; k < per; k++) {
    for (const [a, b] of lines) {
      const t = per === 1 ? 0.5 : k / (per - 1)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** Spread k picks over n ids, as the greening fix does (round-half-even like Python). */
export function spread(ids: string[], k: number): string[] {
  const n = ids.length
  const roundEven = (v: number) => {
    const f = Math.floor(v)
    const d = v - f
    if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1
    return Math.round(v)
  }
  return n && k ? Array.from({ length: k }, (_, j) => ids[Math.min(n - 1, roundEven(((j + 0.5) * n) / k - 0.5))]) : []
}
