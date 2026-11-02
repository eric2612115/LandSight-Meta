import { select } from 'd3-selection'
import 'd3-transition'
import { zoom as d3zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode,
} from 'react'
import { en } from '../lib/english'
import { bboxOf, centreOf, openSegments, padBox, pathOf, unionBox, type BBox } from '../lib/geo'
import type { DrawingObject, Sheet } from '../lib/types'

export type Tone = 'ink' | 'amber' | 'cobalt' | 'green' | 'violet' | 'mute' | 'red'

export const TONE: Record<Tone, string> = {
  ink: '#3a3f47', amber: '#c98a00', cobalt: '#2457ff', green: '#1f9d55', violet: '#7a3cff', mute: '#8f959e', red: '#d92d20',
}

export type ObjLook = {
  fill?: string
  fillOpacity?: number
  stroke?: string
  strokeWidth?: number
  dash?: string
  hidden?: boolean
  /** show the ID tag (true) or a custom text */
  tag?: boolean | string
  tagTone?: Tone
  /** draw as loose pieces; per-piece colours */
  open?: boolean
  segColours?: (string | undefined)[]
  gaps?: boolean
  gapColour?: string
  /** hedge plant dots (count) */
  dots?: number
  /** how many of the dots are shown yet (they sprout south to north) */
  dotsShown?: number
  dotColour?: string
  /** pulse ring: change the key to restart */
  pulse?: string
  pulseKey?: number
}

export type Rect = { x: number; y: number; w: number; h: number }
export type View = { k: number; x: number; y: number }

export type SheetCtx = { t: View; project: (x: number, y: number) => [number, number] }

export type SheetHandle = {
  zoomToBox: (b: BBox, opts?: { rect?: Rect; duration?: number; pad?: number }) => Promise<void>
  zoomTo: (ids: string[], opts?: { rect?: Rect; duration?: number; pad?: number }) => Promise<void>
  home: (opts?: { rect?: Rect; duration?: number }) => Promise<void>
  setView: (v: View, duration?: number) => Promise<void>
  view: () => View
  fitView: (b: BBox, rect: Rect) => View
  project: (x: number, y: number) => [number, number]
  findText: (re: RegExp) => BBox | null
  objectBox: (ids: string[]) => BBox | null
}

type Underlay =
  | { kind: 'svg'; html: string; win: BBox }
  | { kind: 'raster'; href: string; win: BBox }

const svgCache = new Map<string, Promise<{ html: string; W: number; H: number } | null>>()
let idSeq = 0

/** Fetch the print SVG, drop its paper and any CJK text, namespace its ids; cached per URL. */
export function loadSvg(url: string) {
  let p = svgCache.get(url)
  if (!p) {
    p = fetch(url, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
        const root = doc.documentElement
        if (root.nodeName !== 'svg') return null
        const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
        const W = vb.length === 4 ? vb[2] : Number(root.getAttribute('width'))
        const H = vb.length === 4 ? vb[3] : Number(root.getAttribute('height'))
        if (!(W > 0 && H > 0)) return null
        root.querySelectorAll('rect').forEach((r) => {
          const full = Math.abs(Number(r.getAttribute('width')) - W) < 1e-3 && Math.abs(Number(r.getAttribute('height')) - H) < 1e-3
          if (r.getAttribute('data-layer') === 'PAPER' || (full && !r.getAttribute('stroke'))) r.remove()
        })
        root.querySelectorAll('text').forEach((t) => {
          const s = t.textContent ?? ''
          const english = en(s, '')
          if (!english) t.remove()
          else if (english !== s) t.textContent = english
        })
        const prefix = `u${++idSeq}-`
        let html = Array.from(root.childNodes).map((n) => new XMLSerializer().serializeToString(n)).join('')
        html = html.replace(/\sid="([^"]+)"/g, ` id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`).replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`)
        html = html.replace(/\sxmlns="[^"]*"/g, '')
        return { html, W, H }
      })
      .catch(() => null)
    svgCache.set(url, p)
  }
  return p
}

/** The sheet's window in metres: the backend's bounds already carry the print padding. */
function paddedWindow(sheet: Sheet): BBox {
  const b = sheet.bounds
  return { x0: b.min_x, y0: b.min_y, x1: b.max_x, y1: b.max_y }
}

function useUnderlay(sheet: Sheet | undefined, rasterSheet: boolean, href?: string): Underlay | null | 'loading' {
  const [state, setState] = useState<{ key: string; u: Underlay | null } | null>(null)
  const raster = rasterSheet || !!href
  const url = sheet ? (href ?? (raster ? sheet.png_url : sheet.svg_url)) : ''
  const key = `${sheet?.sheet_id}|${url}|${raster}`
  useEffect(() => {
    if (!sheet || !url) return
    let alive = true
    if (raster) {
      Promise.resolve().then(() => alive && setState({ key, u: { kind: 'raster', href: url, win: paddedWindow(sheet) } }))
    } else {
      void loadSvg(url).then((r) => {
        if (!alive) return
        if (!r) return setState({ key, u: null })
        const b = sheet.bounds
        const bw = b.max_x - b.min_x
        const bh = b.max_y - b.min_y
        // the print SVG covers the bounds (plus any symmetric padding)
        const px = Math.max(0, (r.W - bw) / 2)
        const py = Math.max(0, (r.H - bh) / 2)
        setState({ key, u: { kind: 'svg', html: r.html, win: { x0: b.min_x - px, y0: b.min_y - py, x1: b.min_x - px + r.W, y1: b.max_y + py } } })
      })
    }
    return () => {
      alive = false
    }
  }, [key, raster, sheet, url])
  if (!sheet || !url) return null
  return state && state.key === key ? state.u : 'loading'
}

export function fitView(b: BBox, r: Rect): View {
  const bw = Math.max(1e-6, b.x1 - b.x0)
  const bh = Math.max(1e-6, b.y1 - b.y0)
  const k = Math.min(r.w / bw, r.h / bh)
  return { k, x: r.x + (r.w - bw * k) / 2 - b.x0 * k, y: r.y + (r.h - bh * k) / 2 + b.y1 * k }
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

const UnderlayLayer = memo(function UnderlayLayer({ u, filter }: { u: Underlay; filter?: string }) {
  const W = u.win.x1 - u.win.x0
  const H = u.win.y1 - u.win.y0
  if (u.kind === 'raster') {
    return (
      <image href={u.href} x={u.win.x0} y={-u.win.y1} width={W} height={H} preserveAspectRatio="none"
        style={{ mixBlendMode: 'multiply', filter, transition: 'filter 600ms ease-out' }} />
    )
  }
  return (
    <g className="ul" transform={`translate(${u.win.x0},${-u.win.y1})`} style={{ filter, transition: 'filter 600ms ease-out' }}
      dangerouslySetInnerHTML={{ __html: u.html }} />
  )
})

type ObjectLayerProps = {
  objects: DrawingObject[]
  looks: Record<string, ObjLook>
  ink: boolean
  onClick?: (o: DrawingObject) => void
}

const NONE: Record<string, ObjLook> = {}

const ObjectLayer = memo(function ObjectLayer({ objects, looks, ink, onClick }: ObjectLayerProps) {
  return (
    <g>
      {objects.map((o) => {
        const look = looks[o.object_id] ?? {}
        if (look.hidden) return null
        const closedPath = pathOf(o.outline, o.closed || (o.kind !== 'match_line' && o.kind !== 'planter_edge'))
        const area = o.kind !== 'match_line'
        const open = look.open ?? false
        const segs = open ? openSegments(o) : []
        const inkStroke = ink && !look.stroke ? '#1d2026' : undefined
        return (
          <g key={o.object_id} data-id={o.object_id}>
            {area && (
              <path className="obj" d={closedPath}
                style={{ fill: look.fill ?? 'transparent', fillOpacity: look.fillOpacity ?? 1, stroke: 'none', cursor: onClick ? 'pointer' : undefined }}
                pointerEvents={onClick ? 'all' : 'none'} onClick={onClick ? () => onClick(o) : undefined} />
            )}
            {open
              ? segs.map((s, i) => (
                  <path key={i} className="obj" d={`M${s[0][0]},${-s[0][1]}L${s[1][0]},${-s[1][1]}`} vectorEffect="non-scaling-stroke"
                    style={{ stroke: look.segColours?.[i] ?? look.stroke ?? inkStroke ?? 'transparent', strokeWidth: look.strokeWidth ?? 1.4, fill: 'none', strokeLinecap: 'round' }} />
                ))
              : (look.stroke || inkStroke) && (
                  <path className="obj" d={closedPath} vectorEffect="non-scaling-stroke"
                    style={{ stroke: look.stroke ?? inkStroke, strokeWidth: look.strokeWidth ?? 1.3, strokeDasharray: look.dash, fill: 'none', strokeLinejoin: 'round' }}
                    pointerEvents="none" />
                )}
            {look.gaps && o.gaps?.map(([x, y], i) => (
              <path key={`g${i}`} d={`M${x},${-y}h0`} vectorEffect="non-scaling-stroke" strokeLinecap="round"
                style={{ stroke: look.gapColour ?? '#d92d20', strokeWidth: 11 }} />
            ))}
          </g>
        )
      })}
    </g>
  )
})

type Anchor = { x: number; y: number; dx: number; dy: number; anchor: 'middle' | 'end' }

/** A tree symbol's centre cross reaches about a quarter of the radius each way; a tag inside starts below it. */
const CROSS = 0.3

/** Where an ID tag sits: never on the centre cross. Inside a canopy, under the cross, when it fits there; else above
 * the canopy (alone) or alternately above and below the row (a row of trees). */
function tagAnchor(o: DrawingObject, tagSize: number, k: number, text: string, rank: number): Anchor {
  const b = bboxOf(o.outline)
  const [cx, cy] = centreOf(o)
  if (o.kind === 'hedge' && b.y1 - b.y0 > (b.x1 - b.x0) * 3) return { x: b.x0, y: cy, dx: -12, dy: tagSize * 0.35, anchor: 'end' }
  if (o.kind === 'tree' || o.kind === 'existing_tree') {
    const r = (b.y1 - b.y0) / 2
    const wide = (b.x1 - b.x0) * 0.78 * k >= text.length * tagSize * 0.62 + 10
    const tall = r * (0.92 - CROSS) * k >= tagSize * 0.9
    if (wide && tall) return { x: cx, y: cy - r * CROSS, dx: 0, dy: tagSize * 0.82, anchor: 'middle' }
    if (rank < 0 || rank % 2 === 1) return { x: cx, y: b.y1, dx: 0, dy: -tagSize * 0.32, anchor: 'middle' }
    return { x: cx, y: b.y0, dx: 0, dy: tagSize * 1.02, anchor: 'middle' }
  }
  return { x: cx, y: cy, dx: 0, dy: -tagSize * 0.25, anchor: 'middle' }
}

/** Rank of each tree along its row (west to east), so crowded tags can alternate. */
function treeRanks(objects: DrawingObject[]): Record<string, number> {
  const trees = objects.filter((o) => o.kind === 'tree' && !o.excluded).sort((a, b) => centreOf(a)[0] - centreOf(b)[0])
  return Object.fromEntries(trees.map((o, i) => [o.object_id, i]))
}

function TagLayer({ objects, looks, k, size }: { objects: DrawingObject[]; looks: Record<string, ObjLook>; k: number; size: number }) {
  const ranks = useMemo(() => treeRanks(objects), [objects])
  return (
    <g pointerEvents="none">
      <AnimatePresence>
        {objects.map((o) => {
          const look = looks[o.object_id]
          if (!look?.tag || look.hidden) return null
          const text = typeof look.tag === 'string' ? look.tag : o.object_id
          const a = tagAnchor(o, size, k, text, ranks[o.object_id] ?? -1)
          const colour = TONE[look.tagTone ?? 'ink']
          return (
            <g key={o.object_id} transform={`translate(${a.x},${-a.y}) scale(${1 / k})`}>
              <motion.g initial={{ opacity: 0, scale: 0.35, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
                <text x={a.dx} y={a.dy} textAnchor={a.anchor} fontFamily="JetBrains Mono, monospace" fontWeight={700} fontSize={size}
                  style={{ fill: colour, transition: 'fill 320ms ease-out', paintOrder: 'stroke', stroke: '#f7f5f0', strokeWidth: size * 0.22, strokeLinejoin: 'round', letterSpacing: '-0.02em' }}>
                  {text}
                </text>
              </motion.g>
            </g>
          )
        })}
      </AnimatePresence>
    </g>
  )
}

function PulseLayer({ objects, looks }: { objects: DrawingObject[]; looks: Record<string, ObjLook> }) {
  return (
    <g pointerEvents="none">
      {objects.map((o) => {
        const look = looks[o.object_id]
        if (!look?.pulse) return null
        const d = pathOf(o.outline, true)
        return (
          <g key={`${o.object_id}-${look.pulseKey ?? 0}`}>
            {[0, 0.55].map((delay) => (
              <motion.path key={delay} d={d} vectorEffect="non-scaling-stroke" fill="none" stroke={look.pulse} strokeWidth={3}
                initial={{ opacity: 0.95, scale: 1 }} animate={{ opacity: 0, scale: 1.55 }} transition={{ duration: 1.1, delay, ease: 'easeOut' }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            ))}
          </g>
        )
      })}
    </g>
  )
}

function DotLayer({ objects, looks, k }: { objects: DrawingObject[]; looks: Record<string, ObjLook>; k: number }) {
  return (
    <g pointerEvents="none">
      {objects.map((o) => {
        const look = looks[o.object_id]
        if (!look?.dots) return null
        return <HedgeDots key={o.object_id} o={o} count={look.dots} shown={look.dotsShown ?? look.dots} colour={look.dotColour ?? '#3a3f47'} k={k} />
      })}
    </g>
  )
}

function HedgeDots({ o, count, shown, colour, k }: { o: DrawingObject; count: number; shown: number; colour: string; k: number }) {
  const { d, step } = useMemo(() => {
    const b = bboxOf(o.outline)
    const vertical = b.y1 - b.y0 >= b.x1 - b.x0
    const rows = [0, 1]
    const per = Math.round(count / 2)
    const parts: string[] = []
    const upto = Math.min(per, Math.ceil(shown / 2))
    for (let i = 0; i < upto; i++) {
      const t = per === 1 ? 0.5 : i / (per - 1)
      for (const r of rows) {
        const x = vertical ? (r ? b.x1 : b.x0) : b.x0 + (b.x1 - b.x0) * t
        const y = vertical ? b.y0 + (b.y1 - b.y0) * t : r ? b.y1 : b.y0
        parts.push(`M${x.toFixed(3)},${(-y).toFixed(3)}h0`)
      }
    }
    const len = vertical ? b.y1 - b.y0 : b.x1 - b.x0
    return { d: parts.join(''), step: per > 1 ? len / (per - 1) : len }
  }, [o, count, shown])
  const w = Math.max(1.6, Math.min(6, step * k * 0.62))
  return <path d={d} vectorEffect="non-scaling-stroke" strokeLinecap="round" style={{ stroke: colour, strokeWidth: w }} />
}

type Props = {
  sheet: Sheet
  width: number
  height: number
  homeRect: Rect
  raster?: boolean
  looks?: Record<string, ObjLook>
  tagSize?: number
  interactive?: boolean
  /** 'lines' turns a colour sheet into line work; `pour` (0..1) reveals the colour from the top */
  underlayMode?: 'normal' | 'lines'
  pour?: number
  paperOpacity?: number
  onObjectClick?: (o: DrawingObject) => void
  children?: (ctx: SheetCtx) => ReactNode
  overlay?: (ctx: SheetCtx) => ReactNode
  html?: (ctx: SheetCtx) => ReactNode
  onView?: (v: View) => void
  /** start here instead of fitting the sheet */
  initialView?: View
  /** CAD-viewer furniture: live scale bar, cursor readout in metres, double-click to fit */
  cad?: boolean
  /** the faint grid the paper sits on */
  grid?: boolean
  className?: string
  /** a raster to show instead of the print SVG (the coloured render SAM 3.1 reads) */
  underlayHref?: string
  /** a second raster poured over the underlay from the top, 0..1 (the colour scene) */
  pourHref?: string
}

const LINES_FILTER = 'grayscale(1) contrast(2.6) brightness(1.32)'

export const SheetView = forwardRef<SheetHandle, Props>(function SheetView(props, ref) {
  const { sheet, width, height, homeRect, raster = false, looks = NONE, tagSize = 28, interactive = false, underlayMode = 'normal', pour = 0 } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const ulRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const viewRef = useRef<View>({ k: 1, x: 0, y: 0 })
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 })
  const [ready, setReady] = useState(false)
  const raf = useRef(0)
  const interactiveRef = useRef(interactive)
  const homeRef = useRef(homeRect)
  const onViewRef = useRef(props.onView)
  const initialRef = useRef(props.initialView)
  const fitRef = useRef<(() => void) | null>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  /** true once the view is anywhere but home (a gesture or a camera move); a resize then keeps it */
  const movedRef = useRef(false)
  useEffect(() => {
    interactiveRef.current = interactive
    homeRef.current = homeRect
    onViewRef.current = props.onView
  })

  const u = useUnderlay(sheet, raster, props.underlayHref)
  const underlay = u === 'loading' ? null : u
  const win = underlay ? underlay.win : paddedWindow(sheet)
  const ink = u === null

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5000])
      .filter((ev: Event & { button?: number; ctrlKey?: boolean }) => interactiveRef.current && !ev.button)
      .on('zoom', (ev) => {
        if (ev.sourceEvent) movedRef.current = true
        const t = ev.transform
        viewRef.current = { k: t.k, x: t.x, y: t.y }
        if (!raf.current) {
          raf.current = requestAnimationFrame(() => {
            raf.current = 0
            setView(viewRef.current)
            onViewRef.current?.(viewRef.current)
          })
        }
      })
    zoomRef.current = zb
    select(svg).call(zb).on('dblclick.zoom', null).on('dblclick.fit', () => {
      if (interactiveRef.current) fitRef.current?.()
    })
    // a re-attached behaviour (StrictMode, hot reload) picks up the transform already on the node
    const t = zoomTransform(svg)
    if (t.k !== 1 || t.x !== 0 || t.y !== 0) {
      viewRef.current = { k: t.k, x: t.x, y: t.y }
      setView(viewRef.current)
    }
    return () => {
      select(svg).on('.zoom', null)
    }
  }, [])

  const go = useCallback((v: View, duration = 0, home = false) => {
    movedRef.current = !home
    const svg = svgRef.current
    const zb = zoomRef.current
    if (!svg || !zb) return Promise.resolve()
    const target = zoomIdentity.translate(v.x, v.y).scale(v.k)
    return new Promise<void>((resolve) => {
      const sel = select(svg)
      sel.interrupt()
      if (!duration) {
        sel.call(zb.transform, target)
        resolve()
        return
      }
      sel.transition().duration(duration).ease(ease).call(zb.transform, target).on('end', () => resolve()).on('interrupt', () => resolve())
    })
  }, [])

  // home on first show of each sheet
  const homedFor = useRef<string | null>(null)
  useEffect(() => {
    if (homedFor.current === sheet.sheet_id) return
    homedFor.current = sheet.sheet_id
    void go(initialRef.current ?? fitView(paddedWindow(sheet), homeRef.current), 0, !initialRef.current).then(() => setReady(true))
  }, [go, sheet])

  // the pane changed size (the dock grew or shrank): a sheet still at home is fitted again
  const { x: hx, y: hy, w: hw, h: hh } = homeRect
  useEffect(() => {
    if (!movedRef.current && homedFor.current === sheet.sheet_id) void go(fitView(paddedWindow(sheet), { x: hx, y: hy, w: hw, h: hh }), 0, true)
  }, [go, sheet, hx, hy, hw, hh])

  const objects = sheet.objects
  useEffect(() => {
    fitRef.current = () => void go(fitView(paddedWindow(sheet), homeRef.current), 320, true)
  }, [go, sheet])

  useImperativeHandle(ref, (): SheetHandle => {
    const objectBox = (ids: string[]) => unionBox(objects.filter((o) => ids.includes(o.object_id)).map((o) => bboxOf(o.outline)))
    return {
      zoomToBox: (b, o = {}) => go(fitView(padBox(b, o.pad ?? 0), o.rect ?? homeRef.current), o.duration ?? 320),
      zoomTo: (ids, o = {}) => {
        const b = objectBox(ids)
        return b ? go(fitView(padBox(b, o.pad ?? 2), o.rect ?? homeRef.current), o.duration ?? 320) : Promise.resolve()
      },
      home: (o = {}) => go(fitView(paddedWindow(sheet), o.rect ?? homeRef.current), o.duration ?? 320, true),
      setView: (v, duration = 0) => go(v, duration),
      view: () => viewRef.current,
      fitView,
      project: (x, y) => [viewRef.current.x + viewRef.current.k * x, viewRef.current.y - viewRef.current.k * y],
      findText: (re) => {
        const g = ulRef.current?.querySelector('g.ul') as SVGGElement | null
        if (!g || !underlay) return null
        const t = Array.from(g.querySelectorAll('text')).find((e) => re.test(e.textContent ?? ''))
        if (!t) return null
        const bb = (t as SVGTextElement).getBBox()
        const x0 = underlay.win.x0
        const y1 = underlay.win.y1
        return { x0: bb.x + x0, x1: bb.x + bb.width + x0, y0: y1 - (bb.y + bb.height), y1: y1 - bb.y }
      },
      objectBox,
    }
  }, [go, objects, sheet, underlay])

  const ctx: SheetCtx = useMemo(() => ({ t: view, project: (x: number, y: number) => [view.x + view.k * x, view.y - view.k * y] }), [view])
  const W = win.x1 - win.x0
  const H = win.y1 - win.y0
  const clipId = `pour-${sheet.sheet_id.replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <div className={props.className} style={{ position: 'relative', width, height }}>
      <svg ref={svgRef} width={width} height={height} style={{ display: 'block', cursor: interactive ? 'crosshair' : 'default', opacity: ready ? 1 : 0, transition: 'opacity 200ms' }}
        onMouseMove={props.cad ? (e) => {
          const el = readoutRef.current
          const ctm = svgRef.current?.getScreenCTM()
          if (!el || !ctm) return
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
          const v = viewRef.current
          el.textContent = `x ${((p.x - v.x) / v.k).toFixed(2)} m · y ${(-(p.y - v.y) / v.k).toFixed(2)} m`
        } : undefined}
        onMouseLeave={props.cad ? () => { if (readoutRef.current) readoutRef.current.textContent = '' } : undefined}>
        <defs>
          <filter id="paper-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy={W * 0.003} stdDeviation={W * 0.006} floodColor="#000" floodOpacity="0.22" />
          </filter>
          {pour > 0 && (
            <clipPath id={clipId}>
              <rect x={win.x0} y={-win.y1} width={W} height={H * pour} />
            </clipPath>
          )}
        </defs>
        {props.grid !== false && <Grid view={view} width={width} height={height} />}
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <rect x={win.x0} y={-win.y1} width={W} height={H} fill="#f7f5f0" filter="url(#paper-shadow)" opacity={props.paperOpacity ?? 1} />
          <g ref={ulRef}>
            {underlay && <UnderlayLayer u={underlay} filter={underlayMode === 'lines' ? LINES_FILTER : 'none'} />}
          </g>
          {underlay && underlayMode === 'lines' && pour > 0 && (
            <g clipPath={`url(#${clipId})`}>
              <UnderlayLayer u={underlay} filter="none" />
            </g>
          )}
          {props.pourHref && pour > 0 && (
            <g clipPath={`url(#${clipId})`}>
              <UnderlayLayer u={{ kind: 'raster', href: props.pourHref, win: paddedWindow(sheet) }} />
            </g>
          )}
          <ObjectLayer objects={objects} looks={looks} ink={ink} onClick={props.onObjectClick} />
          <DotLayer objects={objects} looks={looks} k={view.k} />
          <PulseLayer objects={objects} looks={looks} />
          {props.children?.(ctx)}
          <TagLayer objects={objects} looks={looks} k={view.k} size={tagSize} />
        </g>
        {props.overlay?.(ctx)}
      </svg>
      {props.html && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{props.html(ctx)}</div>}
      {props.cad && (
        <div className="pointer-events-none absolute bottom-3 right-3 flex items-end gap-4 border border-line bg-pane/95 px-3 py-1.5 text-[12px] text-ink-2">
          <span ref={readoutRef} className="mono min-w-[196px] text-right text-ink-3" />
          <ScaleBar k={view.k} />
          {sheet.scale_title && <span className="mono text-ink-3">sheet {sheet.scale_title}</span>}
        </div>
      )}
    </div>
  )
})

const NICE = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]

/** A map-style scale bar that re-labels itself from the zoom (metres per pixel). */
function ScaleBar({ k }: { k: number }) {
  const m = NICE.find((v) => v * k >= 70) ?? NICE[NICE.length - 1]
  const px = m * k
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="mono leading-none text-ink-2">{m < 1 ? `${m * 100} cm` : `${m} m`}</span>
      <svg width={px + 2} height={8}>
        <path d={`M1,1V7H${px + 1}V1`} fill="none" stroke="#5c636d" strokeWidth={1.2} />
        <rect x={1} y={4} width={px / 2} height={3} fill="#5c636d" />
      </svg>
    </span>
  )
}

/** A faint grid in drawing metres under the paper, so the canvas reads as unbounded. */
function Grid({ view, width, height }: { view: View; width: number; height: number }) {
  const uid = useId().replace(/:/g, '')
  const step = NICE.find((v) => v * view.k >= 22) ?? 1000
  const s = step * view.k
  const ox = ((view.x % s) + s) % s
  const oy = ((view.y % s) + s) % s
  const major = s * 5
  const mx = ((view.x % major) + major) % major
  const my = ((view.y % major) + major) % major
  return (
    <g pointerEvents="none">
      <defs>
        <pattern id={`gmin${uid}`} width={s} height={s} patternUnits="userSpaceOnUse" x={ox} y={oy}>
          <path d={`M${s},0H0V${s}`} fill="none" stroke="rgba(23,26,30,0.045)" strokeWidth={1} />
        </pattern>
        <pattern id={`gmaj${uid}`} width={major} height={major} patternUnits="userSpaceOnUse" x={mx} y={my}>
          <path d={`M${major},0H0V${major}`} fill="none" stroke="rgba(23,26,30,0.075)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#gmin${uid})`} />
      <rect width={width} height={height} fill={`url(#gmaj${uid})`} />
    </g>
  )
}

/** A small static picture of a sheet: the cleaned print SVG (English only), or its raster. */
export function SheetThumb({ sheet, raster, className }: { sheet: Sheet; raster?: boolean; className?: string }) {
  const [svg, setSvg] = useState<{ html: string; W: number; H: number } | null>(null)
  useEffect(() => {
    if (raster) return
    let alive = true
    void loadSvg(sheet.svg_url).then((r) => alive && setSvg(r))
    return () => {
      alive = false
    }
  }, [sheet.svg_url, raster])
  if (raster) return <img src={sheet.png_url} alt="" className={className} style={{ objectFit: 'contain', mixBlendMode: 'multiply' }} />
  if (!svg) return <div className={className} />
  return <svg className={`ul ${className ?? ''}`} viewBox={`0 0 ${svg.W} ${svg.H}`} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: svg.html }} />
}

export type CropMark = { id: string; outline: number[][]; closed?: boolean; label?: string; dashed?: boolean; tone?: 'blue' | 'ink' | 'mute' }

/** A window of a sheet as it prints, with marks drawn on it: the inspector's and the callout's crop. `box` in metres. */
export function SheetCrop({ sheet, box, marks = [], className, raster, labelSize = 0.9 }: {
  sheet: Sheet; box: BBox; marks?: CropMark[]; className?: string; raster?: boolean; labelSize?: number
}) {
  const u = useUnderlay(sheet, !!raster)
  const underlay = u === 'loading' ? null : u
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const tone = { blue: '#2457ff', ink: '#171a1e', mute: '#8a919b' }
  return (
    <svg className={className} viewBox={`${box.x0} ${-box.y1} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', background: '#f7f5f0' }}>
      {underlay && <UnderlayLayer u={underlay} />}
      {marks.map((m) => {
        const c = tone[m.tone ?? 'blue']
        const b = bboxOf(m.outline)
        return (
          <g key={m.id}>
            <path d={pathOf(m.outline, m.closed ?? true)} fill={m.dashed ? 'none' : c} fillOpacity={m.dashed ? 0 : 0.12} stroke={c} strokeWidth={1.6}
              strokeDasharray={m.dashed ? '4 3' : undefined} vectorEffect="non-scaling-stroke" />
            {m.label && (
              <text x={(b.x0 + b.x1) / 2} y={-b.y0 + labelSize * 1.25} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight={600}
                fontSize={labelSize} fill={c} style={{ paintOrder: 'stroke', stroke: '#f7f5f0', strokeWidth: labelSize * 0.25 }}>{m.label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
