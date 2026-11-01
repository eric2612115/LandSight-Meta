import { AnimatePresence, motion } from 'framer-motion'
import { Ruler } from 'lucide-react'
import { useState } from 'react'
import { fmt, qty } from '../../lib/format'
import { bboxOf, padBox } from '../../lib/geo'
import { play } from '../../lib/sound'
import { LOOK } from '../baseline'
import { homeRect, setDir, setLook, upsertTally, useDirector, useScript } from '../core'
import { hedgeData, tallyBase } from '../data'
import { InPanel, OnScreen, OverSheet, PanelHeader, tween, useProject } from './common'
import type { BBox } from '../../lib/geo'

const PANEL = 620

/** Hedge math: a tape unrolls to the measured length, the formula writes itself, the plants sprout. */
export function Hedge() {
  const api = useDirector()
  const { run, scene } = api
  const d = hedgeData(run, scene)!
  const { sheet, obj, item, count, rows, length, per, spacing, legend, vertical, box } = d
  const project = useProject()
  const [tape, setTape] = useState(0)
  const [phase, setPhase] = useState(0)
  const [shown, setShown] = useState(0)
  const [stamps, setStamps] = useState(0)
  const [typ, setTyp] = useState<BBox | null>(null)
  const line1 = `${fmt(length, 1)} ÷ ${spacing} + 1 = ${per}`
  const line2 = `${per} × ${rows} rows = ${count}`

  useScript(async (s) => {
    setDir({ panelW: 0 })
    setLook(sheet.sheet_id, obj.object_id, { ...LOOK.washed, dots: count, dotsShown: 0 })
    await s.sleep(400)
    await api.sheet()?.zoomToBox(padBox(box, vertical ? 6 : 3, vertical ? 2.2 : 5), { rect: homeRect(PANEL), duration: 420 })
    await s.sleep(400)
    let mark = 0
    await tween(1700, (p) => {
      setTape(p)
      const m = Math.floor((p * length) / 5)
      if (m > mark) {
        mark = m
        play('tick', { rate: 0.9 + m * 0.05, volume: 0.35 })
      }
    }, s.signal)
    play('snap', { volume: 0.6 })
    await s.sleep(500)
    setDir({ panelW: PANEL })
    play('whoosh', { volume: 0.4 })
    setPhase(1)
    await s.sleep(700)
    setPhase(2)
    await s.sleep(1000)
    setPhase(3)
    await s.sleep(1100)
    // the plants sprout, south to north, with a rising tick
    let last = 0
    await tween(1900, (p) => {
      const n = Math.round(p * count)
      setShown(n)
      setLook(sheet.sheet_id, obj.object_id, { dotsShown: n })
      if (n - last >= 8 || (n === count && last !== count)) {
        last = n
        play('tick', { rate: 0.75 + 1.25 * p, volume: 0.4 })
      }
    }, s.signal, (t) => t)
    upsertTally({ ...tallyBase(item), drawn: count, spark: item.spark_count, schedule: item.schedule_count, status: 'agreed', credit: 'geometry', creditKey: Date.now() }, 1)
    play('snap', { volume: 0.5 })
    setPhase(4)
    await s.sleep(1800)
    // two quick stamps: the legend, and the typ. label
    setDir({ panelW: 0 })
    await api.sheet()?.home({ duration: 480, rect: homeRect(0) })
    setTape(0)
    await s.sleep(450)
    if (legend) {
      setLook(sheet.sheet_id, legend.object_id, LOOK.greyed)
      setStamps(1)
      play('stamp')
      await s.sleep(1300)
    }
    const found = api.sheet()?.findText(/typ\.?/i) ?? (d.typAt ? { x0: d.typAt[0], y0: d.typAt[1], x1: d.typAt[0] + 4, y1: d.typAt[1] + 0.6 } : null)
    if (found) {
      setTyp(found)
      setStamps(2)
      play('stamp')
    }
    await s.sleep(2000)
  })

  // the tape, in screen space along the hedge
  const t0 = vertical ? project(box.x0 - 0.75, box.y0) : project(box.x0, box.y0 - 0.75)
  const t1 = vertical ? project(box.x0 - 0.75, box.y0 + (box.y1 - box.y0) * tape) : project(box.x0 + (box.x1 - box.x0) * tape, box.y0 - 0.75)
  const k = project(1, 0)[0] - project(0, 0)[0]
  const ticks: number[] = []
  for (let m = 0; m <= length * tape + 1e-6; m += 1) ticks.push(m)
  const lg = legend ? bboxOf(legend.outline) : null

  return (
    <>
      <OnScreen>
        {tape > 0 && (
          <g>
            {vertical ? (
              <>
                <rect x={t1[0] - 9} y={t1[1]} width={18} height={Math.max(0, t0[1] - t1[1])} rx={3} fill="#3a3f47" />
                {ticks.map((m) => {
                  const y = t0[1] - m * k * ((box.y1 - box.y0) / length)
                  return <line key={m} x1={t0[0] - 9} x2={t0[0] - 9 + (m % 5 === 0 ? 14 : 7)} y1={y} y2={y} stroke="#f7f5f0" strokeWidth={m % 5 === 0 ? 2 : 1.2} />
                })}
              </>
            ) : (
              <rect x={t0[0]} y={t0[1] - 9} width={Math.max(0, t1[0] - t0[0])} height={18} rx={3} fill="#3a3f47" />
            )}
          </g>
        )}
      </OnScreen>
      <OverSheet>
        {tape > 0 && (
          <div className="absolute flex items-center gap-2 rounded-xl bg-[#3a3f47] px-4 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
            style={{ left: vertical ? t1[0] - 26 : t1[0], top: vertical ? t1[1] : t1[1] - 70, transform: vertical ? 'translate(-100%, -50%)' : 'translate(-50%, 0)' }}>
            <Ruler className="h-7 w-7 text-[#c3c8cf]" />
            <span className="mono text-[34px] font-semibold text-white">{fmt(length * tape, 1)} m</span>
          </div>
        )}
        <AnimatePresence>
          {stamps >= 1 && lg && (
            <Stamp key="legend" at={project((lg.x0 + lg.x1) / 2, (lg.y0 + lg.y1) / 2)} colour="#3a3f47" text="legend · not counted" />
          )}
          {stamps >= 2 && typ && (
            <Stamp key="typ" at={project((typ.x0 + typ.x1) / 2 + 1.5, typ.y1 + 3.0)} colour="#2457ff" text="a label, not a ninth tree" />
          )}
        </AnimatePresence>
      </OverSheet>
      <InPanel>
        <div className="flex h-full flex-col p-8" style={{ width: PANEL }}>
          <PanelHeader title="Hedge math" right={<span className="mono text-[30px] font-bold text-[#c3c9d1]">{obj.object_id}</span>} />
          <div className="mt-8 space-y-4">
            <Fact show={phase >= 1} who="geometry" colour="#c3c9d1" label="measured" value={`${fmt(length, 1)} m`} />
            <Fact show={phase >= 1} who="Muse Spark" colour="#8fa6ff" label="the note says" value={`@${spacing} m · ${rows} rows`} />
          </div>
          <div className="mono mt-10 space-y-3 text-[46px] font-semibold leading-tight text-white">
            <Write show={phase >= 2} text={line1} />
            <Write show={phase >= 3} text={line2} highlight />
          </div>
          <div className="mt-auto rounded-2xl bg-[#1f2329] px-6 py-5">
            <div className="text-[28px] text-mute">plants placed</div>
            <div className="mono mt-1 text-[64px] font-bold leading-none" style={{ color: phase >= 4 ? '#f2f4f7' : '#c3c9d1' }}>{qty(shown)}</div>
          </div>
        </div>
      </InPanel>
    </>
  )
}

function Fact({ show, who, colour, label, value }: { show: boolean; who: string; colour: string; label: string; value: string }) {
  return (
    <motion.div initial={false} animate={{ opacity: show ? 1 : 0, y: show ? 0 : 10 }} transition={{ duration: 0.3 }} className="rounded-xl bg-[#1f2329] px-5 py-3">
      <div className="flex items-baseline justify-between whitespace-nowrap text-[28px]">
        <span className="text-mute">{label}</span>
        <span style={{ color: colour }}>{who}</span>
      </div>
      <div className="mono mt-1 whitespace-nowrap text-[36px] font-semibold" style={{ color: colour }}>{value}</div>
    </motion.div>
  )
}

function Write({ show, text, highlight }: { show: boolean; text: string; highlight?: boolean }) {
  return (
    <div className="h-[60px] whitespace-nowrap">
      {show && text.split('').map((c, i) => (
        <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.035, duration: 0.05 }}
          className={highlight && i >= text.lastIndexOf('=') ? 'text-white' : undefined} style={{ color: highlight && i > text.lastIndexOf('=') ? '#ffffff' : undefined }}>
          {c}
        </motion.span>
      ))}
    </div>
  )
}

function Stamp({ at, colour, text }: { at: [number, number]; colour: string; text: string }) {
  return (
    <motion.div className="absolute whitespace-nowrap rounded-xl border-[3px] bg-[rgba(247,245,240,0.92)] px-5 py-2 text-[30px] font-semibold"
      style={{ left: at[0], top: at[1], color: colour, borderColor: colour, x: '-50%', y: '-50%' }}
      initial={{ scale: 1.7, opacity: 0, rotate: -9 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1.2] }}>
      {text}
    </motion.div>
  )
}
