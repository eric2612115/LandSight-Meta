/** B's right pane: the sheet bar, the sheet (unbounded canvas, grid, scale bar, cursor readout) with A's numbered pins
 * and paper callout, the detail dock, and the filmstrip of every sheet with its flag count. */
import { AnimatePresence, motion } from 'framer-motion'
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShow } from '../app/show'
import { useDecisions, useUI } from '../app/state'
import { SheetView, type ObjLook, type SheetHandle, type View } from '../components/SheetView'
import { colourData } from '../director/data'
import { filmSheets, objectsOn, sheetCaption, type Flag } from '../lib/flags'
import { fmt, pct } from '../lib/format'
import { bboxOf, pathOf, type BBox } from '../lib/geo'
import { isRasterSheet } from '../lib/model'
import type { Item, Run, Scene, Sheet } from '../lib/types'
import { Pulse } from '../shell/Shell'
import { Callout } from './Callout'
import { Detail, GaugeDock, Inspector, isGreening, isQuote } from './Dock'
import { countedLine, itemOfFlag, movedBetween, spreadPins, twinOf, type PinSpot } from './model'

export const PANE_W = 1339
const FILM_H = 112
const BAR_H = 40

type Props = {
  run: Run
  sheet: Sheet
  flags: Flag[]
  pins: PinSpot[]
  selected?: Flag
  onSelect: (f: Flag) => void
  onSheet: (id: string) => void
  acts: { confirm: (f: Flag) => void; dismiss: (f: Flag) => void; reopen: (f: Flag) => void }
}

export const SheetPane = forwardRef<SheetHandle, Props>(function SheetPane({ run, sheet, flags, pins, selected, onSelect, onSheet, acts }, ref) {
  const ui = useUI()
  const sh = useShow()
  const d = useDecisions((s) => s.d)
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 })
  const twin = twinOf(run, sheet)
  const coloured = !!sheet.filled_png_url
  const quote = selected && isQuote(selected)
  const dockH = !selected ? 0 : quote ? 300 : 160
  const viewH = 1004 - BAR_H - dockH - FILM_H
  const homeRect = { x: 22, y: 12, w: PANE_W - 44, h: viewH - 24 }
  const raster = isRasterSheet(run, sheet)
  const item = selected ? itemOfFlag(run, selected.check) : undefined
  const selPin = selected ? pins.find((p) => p.flag.id === selected.id) : undefined

  const looks = useMemo(() => sheetLooks(run, sheet, selected, item, sh.dots), [run, sheet, selected, item, sh.dots])
  const colour = useMemo(() => (ui.colour && coloured ? colourData(run, { id: 'colour', title: '', sheet_id: sheet.sheet_id, duration_s: 0 } as Scene) : null), [ui.colour, coloured, run, sheet.sheet_id])
  const moved = useMemo(() => (ui.compare && twin ? movedBetween(twin, sheet) : []), [ui.compare, twin, sheet])
  const pinCount = upto(sh.pins, pins.length)
  const counted = countedLine(run, sheet, sh.counted ?? 1)
  const meta = [sheet.revision && `Rev ${sheet.revision}`, sheet.date, sheet.scale_title, counted].filter(Boolean).join(' · ')
  const pour = sh.pour ?? (ui.colour ? 1 : 0)

  // the leader from the selected row in the list to its pin (B), measured from the DOM after layout
  const paneRef = useRef<HTMLDivElement>(null)
  const [rowY, setRowY] = useState<number | null>(null)
  useLayoutEffect(() => {
    const pane = paneRef.current
    const row = selected ? document.querySelector(`[data-flag="${CSS.escape(selected.id)}"]`) : null
    if (!pane || !row) return setRowY(null)
    const pr = pane.getBoundingClientRect()
    const rr = row.getBoundingClientRect()
    const scale = pr.width / pane.offsetWidth || 1
    setRowY((rr.top + rr.height / 2 - pr.top) / scale)
  }, [selected, ui.filter, d, view, sh.rows])

  // a quote the Ask dock opened on this sheet with no object to light: find its words on the print
  const [quoteBox, setQuoteBox] = useState<{ key: string; b: BBox } | null>(null)
  const hiKey = ui.hi?.sheetId === sheet.sheet_id && !ui.hi.objectIds?.length ? `${sheet.sheet_id}|${ui.hi.quote}` : ''
  useEffect(() => {
    if (!hiKey || !ui.hi) return
    const words = ui.hi.quote.replace(/^\d+\.\s*/, '').split(/\s+/).slice(0, 3).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
    const re = new RegExp(words, 'i')
    let n = 0
    const h = setInterval(() => {
      const b = (ref as React.RefObject<SheetHandle | null>)?.current?.findText(re)
      if (b || ++n > 20) {
        clearInterval(h)
        if (b) setQuoteBox({ key: hiKey, b })
      }
    }, 150)
    return () => clearInterval(h)
  }, [hiKey, ui.hi, ref])
  const qb = quoteBox && quoteBox.key === hiKey ? quoteBox.b : null

  const pinScreen = (p: PinSpot): [number, number] => {
    const k = view.k
    return [view.x + k * p.at[0], view.y - k * p.at[1]]
  }
  const placed = spreadPins(pins.slice(0, pinCount).map((p) => {
    const [x, y] = pinScreen(p)
    return { n: p.n, x: x + 4, y: y - 4 }
  }))
  const sel = selPin ? placed.find((p) => p.n === selPin.n) : undefined
  const calloutLeft = sel ? (sel.x + 26 + 344 < PANE_W - 12 ? sel.x + 26 : sel.x - 26 - 344) : 0
  const calloutH = item?.spark ? 470 : 250
  const calloutTop = sel ? Math.max(12, Math.min(viewH - calloutH - 12, sel.y - 70)) : 0
  const showCallout = sh.callout !== false && !!(selected && sel && sel.x > -10 && sel.x < PANE_W + 10 && sel.y > -10 && sel.y < viewH + 10)

  return (
    <section className="grid min-w-0 overflow-hidden bg-pane" style={{ gridTemplateRows: `${BAR_H}px 1fr ${dockH}px ${FILM_H}px` }}>
      <div className="tb">
        <div className="min-w-0 overflow-hidden text-ellipsis"><b>{sheet.number} {sheet.title}</b><span className="meta">{ui.compare && twin ? `Rev ${sheet.revision} against Rev ${twin.revision} · ${moved.length} moved` : meta}</span></div>
        <div className="tools">
          <button onClick={() => (ref as React.RefObject<SheetHandle>)?.current?.home({ rect: homeRect })}>Fit</button>
          <button onClick={() => oneToOne(ref as React.RefObject<SheetHandle>, sheet, homeRect)} disabled={!/^1:\d+$/.test(sheet.scale_title ?? '')}>1:1</button>
          <button className={ui.compare ? 'on' : ''} disabled={!twin} onClick={() => ui.set({ compare: !ui.compare })}>Compare Rev {twin?.revision ?? 'A'}</button>
          <button className={`relative ${ui.colour ? 'on' : ''}`} disabled={!coloured} onClick={() => ui.set({ colour: !ui.colour })}>Coloured render{sh.pulse === 'colour' && <Pulse inset={-6} />}</button>
          <span>{pins.length} {pins.length === 1 ? 'flag' : 'flags'} on this sheet</span>
        </div>
      </div>

      <div ref={paneRef} className="relative overflow-hidden bg-desk">
        <SheetView ref={ref} sheet={sheet} width={PANE_W} height={viewH} homeRect={homeRect} raster={raster} looks={looks} interactive cad grid
          underlayHref={ui.colour && coloured && sh.pour === null ? sheet.filled_png_url : undefined}
          pour={coloured && sh.pour !== null ? pour : 0} pourHref={coloured && sh.pour !== null ? sheet.filled_png_url : undefined}
          onView={setView} tagSize={13}
          onObjectClick={(o) => {
            const f = pins.find((p) => objectsOn(sheet, p.flag.check).some((x) => x.object_id === o.object_id))
            if (f) onSelect(f.flag)
          }}
          overlay={() => (
            <g>
              {rowY !== null && sel && rowY > 0 && rowY < viewH && <path d={`M0,${rowY}H${Math.max(8, Math.min(40, sel.x / 2))}V${sel.y}H${sel.x - 11}`} fill="none" stroke="#2457ff" strokeWidth={1.25} strokeDasharray="4 3" />}
              {showCallout && sel && <path d={`M${sel.x},${sel.y}L${calloutLeft + (calloutLeft > sel.x ? 0 : 344)},${calloutTop + 40}`} stroke="#2457ff" strokeWidth={1} fill="none" />}
              {placed.map((p) => {
                const pin = pins.find((x) => x.n === p.n)!
                const on = pin.flag.id === selected?.id
                const done = d[pin.flag.id]?.state === 'confirmed'
                return (
                  <motion.g key={pin.flag.id} data-pin={pin.flag.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(pin.flag)}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 24 }}>
                    <circle cx={p.x} cy={p.y} r={on ? 12 : 10} fill={done ? '#171a1e' : '#2457ff'} stroke="#fff" strokeWidth={on ? 2.5 : 1.5} />
                    <text x={p.x} y={p.y + 0.5} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={on ? 12 : 11} fontWeight={600} fontFamily="Inter">{p.n}</text>
                  </motion.g>
                )
              })}
            </g>
          )}
          html={() => (
            <AnimatePresence>
              {showCallout && selected && sel && (
                <Callout key={selected.id} run={run} sheet={sheet} flag={selected} n={sel.n} item={item} state={d[selected.id]?.state}
                  style={{ left: calloutLeft, top: calloutTop }}
                  onConfirm={() => acts.confirm(selected)} onLeave={() => ui.set({ selected: undefined })} onReopen={() => acts.reopen(selected)} />
              )}
            </AnimatePresence>
          )}>
          {(ctx) => (
            <g>
              {ui.compare && twin && <Ghost twin={twin} moved={moved} k={ctx.t.k} />}
              {colour && <Masks data={colour} shown={sh.masks} k={ctx.t.k} />}
              {ui.hi?.sheetId === sheet.sheet_id && ui.hi.objectIds?.map((id) => {
                const o = sheet.objects.find((x) => x.object_id === id)
                if (!o) return null
                const b = bboxOf(o.outline)
                return <rect key={id} x={b.x0 - 0.6} y={-b.y1 - 0.6} width={b.x1 - b.x0 + 1.2} height={b.y1 - b.y0 + 1.2} fill="rgba(36,87,255,0.08)" stroke="#2457ff" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              })}
              {qb && <rect x={qb.x0 - 0.5} y={-qb.y1 - 0.4} width={qb.x1 - qb.x0 + 1} height={qb.y1 - qb.y0 + 0.8} fill="rgba(36,87,255,0.10)" stroke="#2457ff" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
              {sh.tape !== null && selected && <Tape sheet={sheet} flag={selected} t={sh.tape} k={ctx.t.k} />}
            </g>
          )}
        </SheetView>
        {ui.hi?.sheetId === sheet.sheet_id && (
          <div className="absolute left-3 top-3 flex max-w-[760px] items-baseline gap-2 border border-blue-line bg-pane px-3 py-1.5">
            <span className="whitespace-nowrap text-ink-3">{ui.hi.label ?? 'From the ask'} · {ui.hi.source}{ui.hi.page ? `, p. ${ui.hi.page}` : ''}</span>
            <mark className="q">“{ui.hi.quote}”</mark>
            <button className="ml-2 cursor-pointer border-0 bg-transparent text-ink-3 hover:text-ink" onClick={() => ui.set({ hi: undefined })}>×</button>
          </div>
        )}
      </div>

      {selected ? (
        isQuote(selected) ? <Inspector run={run} flag={selected} flags={flags} onSelect={onSelect} acts={actsFor(selected, acts, d[selected.id]?.state)} />
          : isGreening(selected.check) ? <GaugeDock run={run} flag={selected} acts={actsFor(selected, acts, d[selected.id]?.state)} />
            : <Detail run={run} flag={selected} acts={actsFor(selected, acts, d[selected.id]?.state)} />
      ) : <div />}

      <Filmstrip run={run} sheetId={sheet.sheet_id} flags={flags} onSheet={onSheet} />
    </section>
  )
})

const upto = (v: number | null, n: number) => (v === null ? n : Math.min(n, v))

const actsFor = (f: Flag, acts: Props['acts'], state?: 'confirmed' | 'dismissed') => ({
  state, onConfirm: () => acts.confirm(f), onDismiss: () => acts.dismiss(f), onReopen: () => acts.reopen(f),
})

function oneToOne(ref: React.RefObject<SheetHandle | null>, sheet: Sheet, rect: { x: number; y: number; w: number; h: number }) {
  const h = ref.current
  const den = Number(sheet.scale_title?.split(':')[1])
  if (!h || !den) return
  const k = 3779.5 / den // px per drawing metre at the printed scale (96 dpi)
  const v = h.view()
  const cx = (rect.x + rect.w / 2 - v.x) / v.k
  const cy = (rect.y + rect.h / 2 - v.y) / v.k
  void h.setView({ k, x: rect.x + rect.w / 2 - cx * k, y: rect.y + rect.h / 2 - cy * k }, 320)
}

/** The selected flag's objects in cobalt; an open outline in its loose pieces with the gaps; hedge plants as dots. */
function sheetLooks(run: Run, sheet: Sheet, sel: Flag | undefined, item: Item | undefined, dots: number | null): Record<string, ObjLook> {
  const out: Record<string, ObjLook> = {}
  if (!sel) return out
  for (const o of objectsOn(sheet, sel.check)) {
    const open = !o.closed && (o.gaps?.length ?? 0) > 0
    const confirmed = item?.confirmed && item.spark?.object_id === o.object_id
    if (open && !confirmed) out[o.object_id] = { open: true, stroke: '#2457ff', strokeWidth: 2.6, gaps: true, gapColour: '#2457ff', fill: 'rgba(36,87,255,0.06)' }
    else out[o.object_id] = { fill: '#2457ff', fillOpacity: 0.1, stroke: '#2457ff', strokeWidth: 2.2 }
    if (o.kind === 'hedge' && dots !== null) {
      const hedge = run.checks.find((c) => typeof c.numbers?.count === 'number' && (c.evidence.object_ids ?? []).includes(o.object_id))
      const count = (hedge?.numbers?.count as number) ?? run.items.find((it) => it.object_ids.includes(o.object_id))?.geometry_count ?? 0
      out[o.object_id] = { ...out[o.object_id], fill: 'transparent', dots: count, dotsShown: dots, dotColour: '#2457ff' }
    }
  }
  return out
}

/** Rev A under Rev B: its outlines dashed, and an arrow for every object that moved. */
function Ghost({ twin, moved, k }: { twin: Sheet; moved: ReturnType<typeof movedBetween>; k: number }) {
  const quiet = new Set(['legend', 'title_block', 'schedule', 'match_line'])
  return (
    <g pointerEvents="none">
      {twin.objects.filter((o) => !quiet.has(o.kind)).map((o) => (
        <path key={o.object_id} d={pathOf(o.outline, o.closed)} fill="none" stroke="#8a919b" strokeWidth={1.4} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      ))}
      {moved.map((m) => (
        <g key={m.id}>
          <line x1={m.from[0]} y1={-m.from[1]} x2={m.to[0]} y2={-m.to[1]} stroke="#2457ff" strokeWidth={2.4} vectorEffect="non-scaling-stroke" markerEnd="url(#arrow)" />
          <circle cx={m.from[0]} cy={-m.from[1]} r={3 / k} fill="#8a919b" />
          <g transform={`translate(${m.to[0] + 2.4},${-m.to[1] - 2.6}) scale(${1 / k})`}>
            <rect x={-4} y={-15} width={170} height={22} fill="#fff" stroke="#c9d4ff" />
            <text x={4} y={1} fontSize={13} fontFamily="Inter" fontWeight={500} fill="#171a1e">{m.id} moved {fmt(m.d, 1)} m since Rev A</text>
          </g>
        </g>
      ))}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10z" fill="#2457ff" />
        </marker>
      </defs>
    </g>
  )
}

/** SAM 3.1's masks on the coloured render, each against the geometry's area. */
function Masks({ data, shown, k }: { data: NonNullable<ReturnType<typeof colourData>>; shown: number | null; k: number }) {
  const masks = data.masks.slice(0, upto(shown, data.masks.length))
  return (
    <g pointerEvents="none">
      {masks.map((m) => (
        <motion.g key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          {m.polys.map((p, i) => <path key={i} d={pathOf(p, true)} fill="rgba(36,87,255,0.22)" stroke="#2457ff" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />)}
          <g transform={`translate(${m.centre[0]},${-m.centre[1]}) scale(${1 / k})`}>
            <rect x={-92} y={-12} width={184} height={24} fill="#fff" stroke="#2457ff" strokeWidth={1} />
            <text x={0} y={1} textAnchor="middle" dominantBaseline="central" fontSize={12} fontFamily="JetBrains Mono" fill="#171a1e">
              SAM {fmt(m.sam, 1)}{m.cad !== undefined ? ` · CAD ${fmt(m.cad, 1)}` : ''}{m.pct !== undefined ? ` · ${pct(m.pct)}` : ''}
            </text>
          </g>
        </motion.g>
      ))}
    </g>
  )
}

/** The tape along a hedge: unrolls to the measured length (0..1). */
function Tape({ sheet, flag, t, k }: { sheet: Sheet; flag: Flag; t: number; k: number }) {
  const o = objectsOn(sheet, flag.check).find((x) => x.kind === 'hedge')
  if (!o) return null
  const b = bboxOf(o.outline)
  const vertical = b.y1 - b.y0 >= b.x1 - b.x0
  const len = vertical ? b.y1 - b.y0 : b.x1 - b.x0
  const off = 1.2
  const x0 = vertical ? b.x0 - off : b.x0
  const y0 = vertical ? b.y0 : b.y0 - off
  const x1 = vertical ? x0 : b.x0 + len * t
  const y1 = vertical ? b.y0 + len * t : y0
  const marks: number[] = []
  for (let m = 0; m <= len * t + 1e-6; m += 1) marks.push(m)
  return (
    <g pointerEvents="none">
      <line x1={x0} y1={-y0} x2={x1} y2={-y1} stroke="#171a1e" strokeWidth={10} strokeLinecap="butt" vectorEffect="non-scaling-stroke" />
      {marks.map((m) => (vertical
        ? <line key={m} x1={x0 - 4 / k} x2={x0 + (m % 5 === 0 ? 5 : 1) / k} y1={-(y0 + m)} y2={-(y0 + m)} stroke="#fff" strokeWidth={m % 5 === 0 ? 1.6 : 1} vectorEffect="non-scaling-stroke" />
        : <line key={m} y1={-y0 - 4 / k} y2={-y0 + (m % 5 === 0 ? 5 : 1) / k} x1={x0 + m} x2={x0 + m} stroke="#fff" strokeWidth={m % 5 === 0 ? 1.6 : 1} vectorEffect="non-scaling-stroke" />))}
      <g transform={`translate(${x1 - (vertical ? 1.6 : 0)},${-y1 - (vertical ? 0 : 1.6)}) scale(${1 / k})`}>
        <rect x={vertical ? -92 : -40} y={-14} width={84} height={26} fill="#171a1e" />
        <text x={vertical ? -50 : 2} y={0} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={600} fontFamily="JetBrains Mono" fill="#fff">{fmt(len * t, 1)} m</text>
      </g>
    </g>
  )
}

export function Filmstrip({ run, sheetId, flags, onSheet }: { run: Run; sheetId: string; flags: Flag[]; onSheet: (id: string) => void }) {
  const d = useDecisions((s) => s.d)
  const sheets = filmSheets(run)
  return (
    <div className="film">
      {sheets.map((s) => {
        const n = flags.filter((f) => f.alarm && !d[f.id] && (f.check.evidence.sheet_ids ?? []).includes(s.sheet_id)).length
        const cap = sheetCaption(run, s)
        return (
          <div key={s.sheet_id} className={`s ${s.sheet_id === sheetId ? 'on' : ''} ${!s.counted && !n ? 'off' : ''}`} onClick={() => onSheet(s.sheet_id)} title={`${s.number} ${s.title}`}>
            <div className="th"><img src={s.png_url} alt="" loading="lazy" /></div>
            <div className="cap"><span className="overflow-hidden text-ellipsis"><b>{cap.no}</b> {cap.name}</span>{n > 0 && <i>{n}</i>}</div>
          </div>
        )
      })}
    </div>
  )
}

