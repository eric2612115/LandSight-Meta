/** The drawing, the review's hero: the sheet (pan / zoom, SheetView), a numbered marker per finding on it, the
 * hovered card's objects lit, red revision clouds around the focused and the selected findings and the ask's marks,
 * and every object outlined with its id and kind under the pointer (a click drops it into the ask). */
import { motion } from 'framer-motion'
import { Maximize2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { SheetView, type ObjLook, type SheetHandle } from '../components/SheetView'
import { kindName } from '../lib/english'
import { objectsOn } from '../lib/flags'
import { bboxOf, pathOf, type BBox } from '../lib/geo'
import { isRasterSheet } from '../lib/model'
import type { DrawingObject, Run, Sheet } from '../lib/types'
import { cloudBox, cloudPath, mergeClouds } from './cloud'
import { t, td } from './i18n'
import type { Finding } from './model'
import { useTry, type Mark } from './store'

const RED = '#ff3b30'
const COBALT = '#2f62ff'
const HOT = new Set(['tree', 'existing_tree', 'hedge', 'shrub_bed', 'lawn', 'paving', 'planter_edge', 'fire_lane', 'tree_pit'])

/** The drawing's handle, for the director (the screen point of an object) and the ask. */
export const drawing: { h: SheetHandle | null; sheetId?: string } = { h: null }

const BAR = 52

export function Drawing({ run, sheet, findings, width, height }: { run: Run; sheet: Sheet; findings: Finding[]; width: number; height: number }) {
  const { focus, hover, hoverObj, checked, marks, tab, set } = useTry()
  const ref = useRef<SheetHandle>(null)
  const viewH = height - BAR
  const home = { x: 24, y: 18, w: width - 48, h: viewH - 36 }
  const onSheet = useMemo(() => findings.filter((f) => f.sheetId === sheet.sheet_id), [findings, sheet.sheet_id])
  const boxOf = (f: Finding) => cloudBox(objectsOn(sheet, f.check), 0.9)
  const clouded = onSheet.filter((f) => f.id === focus || checked[f.id])
  const sheetMarks = marks.filter((m) => m.sheetId === sheet.sheet_id)

  useEffect(() => {
    drawing.h = ref.current
    drawing.sheetId = sheet.sheet_id
  })

  // a focused finding flies the drawing to its objects
  const focused = onSheet.find((f) => f.id === focus)
  useEffect(() => {
    if (!focused) return
    const b = cloudBox(objectsOn(sheet, focused.check), 0.9)
    if (!b) return
    const size = Math.max(b.x1 - b.x0, b.y1 - b.y0)
    // a single tree gets its neighbourhood; a row or a bed gets a margin
    const pad = size < 12 ? size * 0.8 + 9 : size * 0.18 + 3
    void ref.current?.zoomToBox(b, { duration: 900, pad, rect: home })
    // once per focus and sheet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id, sheet.sheet_id])

  const looks = useMemo(() => {
    const out: Record<string, ObjLook> = {}
    const lit = onSheet.find((f) => f.id === hover)
    if (lit) for (const o of objectsOn(sheet, lit.check)) out[o.object_id] = { fill: COBALT, fillOpacity: 0.12, stroke: COBALT, strokeWidth: 2.2 }
    return out
  }, [onSheet, hover, sheet])

  const hot = useMemo(() => sheet.objects.filter((o) => HOT.has(o.kind) && o.outline.length > 1)
    .sort((a, b) => area(bboxOf(b.outline)) - area(bboxOf(a.outline))), [sheet])
  const hovered = hoverObj?.startsWith(`${sheet.sheet_id}/`) ? sheet.objects.find((o) => `${sheet.sheet_id}/${o.object_id}` === hoverObj) : undefined

  const pick = (o: DrawingObject) => {
    const f = onSheet.find((x) => objectsOn(sheet, x.check).some((y) => y.object_id === o.object_id))
    if (tab !== 'ask' && f) return set({ focus: f.id, expanded: f.id })
    set({ tab: 'ask', chip: { sheetId: sheet.sheet_id, objectId: o.object_id, kind: o.kind, sheetNo: sheet.number } })
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ height: BAR, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', borderBottom: '1px solid var(--t-line)' }}>
        <b style={{ fontSize: 16 }}>{sheet.number}</b>
        <span style={{ fontSize: 15 }}>{td(sheet.title)}</span>
        {sheet.revision && <span className="ink3" style={{ fontSize: 14 }}>{t('Rev')} {sheet.revision}{sheet.scale_title ? ` · ${sheet.scale_title}` : ''}</span>}
        <span className="ink2" style={{ marginLeft: 'auto', fontSize: 14 }}>{t('{0} findings on this sheet', onSheet.length)}</span>
        <button className="btn-g" title={t('Fit')} onClick={() => void ref.current?.home({ rect: home })}><Maximize2 size={16} /></button>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: BAR, bottom: 0, background: 'var(--t-bg)' }} data-dir="drawing">
        <SheetView ref={ref} sheet={sheet} width={width} height={viewH} homeRect={home} raster={isRasterSheet(run, sheet)} looks={looks} interactive grid tagSize={13}
          overlay={(ctx) => (
            <g>
              {onSheet.filter((f) => !clouded.includes(f)).map((f) => {
                const b = boxOf(f)
                if (!b) return null
                const [x, y] = ctx.project(b.x1, b.y1)
                return (
                  <g key={f.id} style={{ cursor: 'pointer' }} onClick={() => set({ focus: f.id, expanded: f.id })} data-dir={`pin-${f.id}`}>
                    <circle cx={x} cy={y} r={11} fill="#12161b" stroke="#fff" strokeWidth={1.5} />
                    <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={11} fontWeight={700} fontFamily="Inter">{f.n}</text>
                  </g>
                )
              })}
            </g>
          )}>
          {(ctx) => (
            <g>
              {hot.map((o) => (
                <path key={o.object_id} d={pathOf(o.outline, true)} fill="transparent" stroke="transparent" strokeWidth={10} vectorEffect="non-scaling-stroke" pointerEvents="all"
                  style={{ cursor: 'pointer' }} data-obj={`${sheet.sheet_id}/${o.object_id}`}
                  onMouseEnter={() => set({ hoverObj: `${sheet.sheet_id}/${o.object_id}` })}
                  onMouseLeave={() => useTry.getState().hoverObj === `${sheet.sheet_id}/${o.object_id}` && set({ hoverObj: undefined })}
                  onClick={(e) => { e.stopPropagation(); pick(o) }} />
              ))}
              {mergeClouds(clouded.flatMap((f) => {
                const box = boxOf(f)
                return box ? [{ box, n: f.n, id: f.id }] : []
              })).map((c) => <Cloud key={c.first.id} id={c.first.id} box={c.box} n={c.label} k={ctx.t.k} />)}
              {sheetMarks.map((m, i) => <MarkCloud key={m.id} m={m} sheet={sheet} n={i + 1} k={ctx.t.k} left={(ctx.project(cloudBox(sheet.objects.filter((o) => m.objectIds.includes(o.object_id)), 0.9)?.x1 ?? 0, 0)[0] + 310) > width} />)}
              {hovered && <Outline o={hovered} k={ctx.t.k} />}
            </g>
          )}
        </SheetView>
      </div>
    </div>
  )
}

const area = (b: BBox) => (b.x1 - b.x0) * (b.y1 - b.y0)

/** A red revision cloud around a box with its numbered tag (the tag keeps its size at any zoom). */
export function Cloud({ id, box, n, k, tag }: { id: string; box: BBox; n: number | string; k: number; tag?: string }) {
  return (
    <g pointerEvents="none">
      <motion.path data-dir={`cloud-${id}`} d={cloudPath(box)} fill={RED} fillOpacity={0.06} stroke={RED} strokeWidth={2.6} vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, ease: 'easeOut' }} />
      <g transform={`translate(${box.x0},${-box.y1}) scale(${1 / k})`}>
        <rect x={-15 - (String(n).length - 1) * 4} y={-15} width={30 + (String(n).length - 1) * 8} height={30} rx={15} fill={RED} stroke="#fff" strokeWidth={2} />
        <text y={0.5} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={14} fontWeight={700} fontFamily="Inter">{n}</text>
        {tag && <text x={22} y={0.5} dominantBaseline="central" fill={RED} fontSize={13} fontWeight={650} fontFamily="Inter" style={{ paintOrder: 'stroke', stroke: '#f7f5f0', strokeWidth: 4 }}>{tag}</text>}
      </g>
    </g>
  )
}

/** The ask's mark: a cloud around the object and the note beside it. */
/** `left`: the note goes left of the cloud (the cloud is near the pane's right edge). */
function MarkCloud({ m, sheet, n, k, left }: { m: Mark; sheet: Sheet; n: number; k: number; left: boolean }) {
  const objs = sheet.objects.filter((o) => m.objectIds.includes(o.object_id))
  const b = cloudBox(objs, 0.9)
  if (!b) return null
  return (
    <g pointerEvents="none" data-dir={`mark-${m.id}`}>
      <Cloud id={m.id} box={b} n={`A${n}`} k={k} />
      <g transform={`translate(${left ? b.x0 : b.x1},${-b.y1}) scale(${1 / k})`}>
        <foreignObject x={left ? -294 : 14} y={-6} width={280} height={120}>
          <div style={{ background: '#fff', border: `1.5px solid ${RED}`, borderRadius: 10, padding: '7px 10px', font: '600 12.5px/1.35 Inter, sans-serif', color: '#1a1d21' }}>{m.note}</div>
        </foreignObject>
      </g>
    </g>
  )
}

/** The object under the pointer: a cobalt outline and its id and kind. */
function Outline({ o, k }: { o: DrawingObject; k: number }) {
  const b = bboxOf(o.outline)
  const label = `${o.object_id} · ${t(kindName(o.kind))}`
  return (
    <g pointerEvents="none" data-dir="hover-outline">
      <path d={pathOf(o.outline, o.closed)} fill={COBALT} fillOpacity={0.12} stroke={COBALT} strokeWidth={2.6} vectorEffect="non-scaling-stroke" />
      <g transform={`translate(${(b.x0 + b.x1) / 2},${-b.y1}) scale(${1 / k})`}>
        <rect x={-label.length * 4.2 - 10} y={-34} width={label.length * 8.4 + 20} height={26} rx={8} fill={COBALT} />
        <text y={-20.5} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={14} fontWeight={650} fontFamily="Inter">{label}</text>
      </g>
    </g>
  )
}
