import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { fmt, pct } from '../../lib/format'
import { pathOf } from '../../lib/geo'
import { play } from '../../lib/sound'
import { setDir, setLooks, useDirector, useScript } from '../core'
import { colourData } from '../data'
import { InSheet, OverSheet, tween, useProject } from './common'

const VIOLET = '#7a3cff'

/** Paint for objects when the run has no coloured rendering of the sheet. */
const PAINT: Record<string, string> = { tree: '#7fb26f', hedge: '#4f8f4a', shrub_bed: '#e7a6c8', lawn: '#cfe7b0', paving: '#d8c9ad', planter_edge: '#c4bdb0' }

/** Lines to colour: SAM finds nothing in line work; colour pours in and the masks bloom, each against CAD. */
export function Colour() {
  const api = useDirector()
  const { run, scene } = api
  const d = colourData(run, scene)!
  const { sheet, masks, raster, colourHref, site, control, legendLine } = d
  const project = useProject()
  const [pour, setPour] = useState(0)
  const [badge, setBadge] = useState(false)
  const [lines, setLines] = useState(!!control)
  const [legend, setLegend] = useState(false)
  const [bloom, setBloom] = useState(0)
  const [labels, setLabels] = useState(0)
  const ownColour = !(raster && colourHref === sheet.png_url)
  const found = masks.slice(0, bloom).reduce((a, m) => a + m.polys.length, 0)
  // the header names one prompt, so its count is the Run's count for that prompt (the controlled test's two numbers);
  // without a controlled test it counts the masks shown so far
  const headCount = control ? (lines ? control.masks_on_lines : bloom > 0 ? control.masks_on_colour : control.masks_on_lines) : found
  const radius = useMemo(() => masks.map((m) => Math.max(...m.polys.flat().map(([x, y]) => Math.hypot(x - m.centre[0], y - m.centre[1])))), [masks])

  useScript(async (s) => {
    setDir({ panelW: 0, tallyMode: 'full' })
    setLooks(sheet.sheet_id, () => ({}))
    if (!ownColour) setDir({ underlay: 'lines', pour: 0 })
    await s.sleep(250)
    await api.sheet()?.zoomToBox(site, { rect: { x: 700, y: 210, w: 1180, h: 820 }, duration: 520 })
    await s.sleep(500)
    setBadge(true)
    play('tick', { volume: 0.5 })
    // the controlled test: the same words on the line work find nothing (two seconds of silence)
    await s.sleep(control ? 2200 : 1700)
    if (legendLine) {
      setLegend(true)
      play('tick', { volume: 0.4, rate: 1.2 })
      await s.sleep(1900)
    }
    setLines(false)
    play('whoosh', { volume: 0.55 })
    await tween(650, (p) => (ownColour ? setPour(p) : setDir({ pour: p })), s.signal)
    await s.sleep(700)
    for (let i = 0; i < masks.length; i++) {
      setBloom(i + 1)
      play('tick', { rate: 1.1 + i * 0.06, volume: 0.5 })
      await s.sleep(420)
    }
    await s.sleep(700)
    for (let i = 0; i < masks.length; i++) {
      setLabels(i + 1)
      await s.sleep(260)
    }
    await s.sleep(2600)
  })

  // labels at their mask centres, pushed apart where they would overlap
  const trees = masks.find((m) => m.tree)
  const placed = useMemo(() => {
    const boxes: { x: number; y: number; w: number; h: number }[] = []
    return masks.map((m) => {
      const [x, y0] = project(m.centre[0], m.centre[1])
      const w = Math.max(m.label.length * 16 + (m.sam !== undefined ? 150 : 0), 280) + 32
      const h = m.cad !== undefined ? 96 : 56
      let y = y0
      for (let pass = 0; pass < 6; pass++) {
        const hit = boxes.find((b) => Math.abs(b.x - x) < (b.w + w) / 2 && Math.abs(b.y - y) < (b.h + h) / 2 + 6)
        if (!hit) break
        y = hit.y + (y >= hit.y ? 1 : -1) * ((hit.h + h) / 2 + 8)
      }
      if (!m.tree) boxes.push({ x, y, w, h })
      return { m, x, y }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masks, project(0, 0)[0], project(0, 0)[1], project(1, 0)[0]])
  const b = sheet.bounds
  const W = b.max_x - b.min_x
  const H = b.max_y - b.min_y
  const objs = sheet.objects.filter((o) => PAINT[o.kind] && !o.excluded && o.by !== 'sam')

  return (
    <>
      <InSheet>
        <defs>
          <clipPath id="colour-pour"><rect x={b.min_x} y={-b.max_y} width={W} height={H * pour} /></clipPath>
          <radialGradient id="bloom-grad">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.72" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
          {masks.map((m, i) => (
            <mask key={m.id} id={`bloom-${i}`}>
              <motion.circle cx={m.centre[0]} cy={-m.centre[1]} fill="url(#bloom-grad)" initial={{ r: 0 }} animate={{ r: i < bloom ? radius[i] * 1.45 : 0 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
            </mask>
          ))}
        </defs>
        {ownColour && pour > 0 && (
          <g clipPath="url(#colour-pour)">
            {colourHref ? (
              <image href={colourHref} x={b.min_x} y={-b.max_y} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: 'multiply' }} />
            ) : (
              objs.map((o) => <path key={o.object_id} d={pathOf(o.outline, true)} fill={PAINT[o.kind]} style={{ mixBlendMode: 'multiply' }} />)
            )}
          </g>
        )}
        {masks.map((m, i) => (
          <g key={m.id} mask={`url(#bloom-${i})`} style={{ opacity: i < bloom ? 1 : 0 }}>
            {m.polys.map((p, j) => (
              <path key={j} d={pathOf(p, true)} fill={VIOLET} fillOpacity={0.34} stroke={VIOLET} strokeWidth={2.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            ))}
          </g>
        ))}
      </InSheet>
      <OverSheet>
        <AnimatePresence>
          {badge && (
            <motion.div key="badge" className="absolute left-[150px] top-[110px] flex items-center gap-3 rounded-2xl bg-violet px-6 py-3 text-[34px] font-semibold text-white shadow-[0_14px_40px_rgba(122,60,255,0.35)]"
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <span>SAM 3.1 · {control && <span className="mono font-normal">"{control.prompt}"{lines ? ' on line work' : ''} · </span>}<motion.span key={lines ? 'ctl' : headCount} className="mono inline-block" initial={{ scale: 1.35 }} animate={{ scale: 1 }}>{headCount}</motion.span> {headCount === 1 ? 'mask' : 'masks'}</span>
              {trees && labels > masks.indexOf(trees) && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-l border-white/30 pl-3 text-[28px] font-medium">
                  {trees.label}{trees.sam !== undefined && <span className="mono"> · {fmt(trees.sam, 1)} m²</span>}
                  {trees.cad !== undefined && trees.pct !== undefined && <span className="mono font-normal opacity-80"> · CAD {fmt(trees.cad, 1)} {pct(trees.pct)}</span>}
                </motion.span>
              )}
            </motion.div>
          )}
          {legend && legendLine && (
            <motion.div key="legend" className="absolute left-[150px] top-[186px] flex items-center gap-3 rounded-2xl bg-cobalt px-6 py-3 text-[30px] font-semibold text-white shadow-[0_14px_40px_rgba(36,87,255,0.35)]"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <span>Spark reads the legend: <span className="mono font-normal">{legendLine.colour}</span> = {legendLine.label}</span>
              <span className="text-white/70">→</span>
              <span className="rounded-xl bg-violet px-3 py-0.5">SAM 3.1 <span className="mono font-normal">"{legendLine.prompt}"</span></span>
            </motion.div>
          )}
          {placed.slice(0, labels).map(({ m, x, y }) => {
            if (m.tree) return null
            const off = m.pct !== undefined ? Math.abs(m.pct) : 0
            return (
              <motion.div key={m.id} className="absolute whitespace-nowrap rounded-xl bg-[rgba(20,22,26,0.9)] px-4 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.35)]"
                style={{ left: x, top: y, x: '-50%', y: '-50%' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
                <div className="flex items-baseline gap-3">
                  <span className="text-[28px] font-semibold text-white">{m.label}</span>
                  {m.sam !== undefined && <span className="mono text-[28px] font-semibold text-violet-lt">{fmt(m.sam, 1)} m²</span>}
                </div>
                {m.cad !== undefined && (
                  <div className="mono text-[28px] text-mute">CAD {fmt(m.cad, 1)} · <span style={{ color: off > 5 ? '#f0a500' : '#c3c8cf' }}>{m.pct !== undefined ? pct(m.pct) : '–'}</span></div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </OverSheet>
    </>
  )
}
