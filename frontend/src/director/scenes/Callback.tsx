import { AnimatePresence, motion } from 'framer-motion'
import { Eye } from 'lucide-react'
import { useRef, useState } from 'react'
import { SheetView, type SheetHandle, type ObjLook } from '../../components/SheetView'
import { fmt } from '../../lib/format'
import { bboxOf, centreOf, padBox, unionBox } from '../../lib/geo'
import { isRasterSheet } from '../../lib/model'
import { play } from '../../lib/sound'
import { STAGE, setDir, useDirector, useScript } from '../core'
import { callbackData } from '../data'
import { OnStage, useProject } from './common'

const STRIP = { x: 48, y: 572, w: STAGE.w - 96, h: 300 }

/** Twelve, again: the elevation slides in under the plan; each side-view tree is tied to its canopy. Same trees, not counted. */
export function Callback() {
  const api = useDirector()
  const { run, scene } = api
  const { elev, plan, pairs, check } = callbackData(run, scene)!
  const project = useProject()
  const elevRef = useRef<SheetHandle>(null)
  const [strip, setStrip] = useState(false)
  const [ev, setEv] = useState<{ k: number; x: number; y: number } | null>(null)
  const [lines, setLines] = useState(0)
  const [label, setLabel] = useState(false)
  const looks: Record<string, ObjLook> = Object.fromEntries(pairs.map(([e]) => [e.object_id, { fill: '#3a3f47', fillOpacity: 0.1 }]))

  useScript(async (s) => {
    setDir({ panelW: 0, tallyMode: 'compact' })
    await s.sleep(300)
    const pbox = unionBox(pairs.map(([, p]) => bboxOf(p.outline)))!
    await api.sheet()?.zoomToBox(padBox(pbox, 2.5, 1.6), { rect: { x: 140, y: 96, w: 1640, h: 400 }, duration: 480 })
    await s.sleep(250)
    // align the elevation so each side-view tree stands under its canopy
    const v = api.sheet()!.view()
    const sx = pairs.map(([, p]) => v.x + v.k * centreOf(p)[0])
    const exs = pairs.map(([e]) => centreOf(e)[0])
    const n = pairs.length
    const kE = n > 1 && exs[n - 1] !== exs[0] ? (sx[n - 1] - sx[0]) / (exs[n - 1] - exs[0]) : v.k
    const xE = sx[0] - kE * exs[0] - STRIP.x
    const ebox = unionBox(pairs.map(([e]) => bboxOf(e.outline)))!
    const yE = STRIP.h - 54 + kE * ebox.y0
    setEv({ k: kE, x: xE, y: yE })
    setStrip(true)
    play('whoosh', { volume: 0.5 })
    await s.sleep(700)
    for (let i = 1; i <= n; i++) {
      setLines(i)
      play('tick', { rate: 0.95 + i * 0.04, volume: 0.4 })
      await s.sleep(130)
    }
    await s.sleep(500)
    setLabel(true)
    play('chime', { volume: 0.7 })
    await s.sleep(2600)
  })

  const conf = elev.kind_by === 'spark' ? elev.kind_confidence : undefined

  return (
    <OnStage>
      <motion.div className="absolute overflow-hidden rounded-[18px] border border-line shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
        style={{ left: STRIP.x, top: STRIP.y, width: STRIP.w, height: STRIP.h }}
        initial={{ x: STAGE.w, opacity: 0 }} animate={{ x: strip ? 0 : STAGE.w, opacity: strip ? 1 : 0 }} transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}>
        {ev && (
          <SheetView ref={elevRef} initialView={ev} sheet={elev} width={STRIP.w} height={STRIP.h}
            homeRect={{ x: 0, y: 0, w: STRIP.w, h: STRIP.h }} raster={isRasterSheet(run, elev)} looks={looks} tagSize={22} />
        )}
        <div className="absolute left-5 top-4 rounded-xl bg-[rgba(20,22,26,0.88)] px-4 py-2 text-[28px] text-white">
          <span className="mono font-semibold">{elev.number}</span> · {elev.title} <span className="text-amber">· not counted</span>
        </div>
        <div className="absolute right-5 top-4 flex items-center gap-2 rounded-xl bg-cobalt px-4 py-2 text-[28px] font-semibold text-white">
          <Eye className="h-7 w-7" /> Muse Spark: {elev.kind.toUpperCase()}{conf !== undefined && <span className="mono font-normal opacity-80"> · {fmt(conf, 2)}</span>}
        </div>
      </motion.div>
      <svg width={STAGE.w} height={STAGE.h} className="absolute inset-0">
        {ev && pairs.slice(0, lines).map(([e, p]) => {
          const eb = bboxOf(e.outline)
          const pb = bboxOf(p.outline)
          const ex = STRIP.x + ev.x + ev.k * centreOf(e)[0]
          const ey = STRIP.y + ev.y - ev.k * eb.y1
          const [px, py] = project(centreOf(p)[0], pb.y0)
          return (
            <g key={e.object_id}>
              <motion.line x1={ex} y1={ey} x2={px} y2={py} stroke="#2457ff" strokeWidth={3} strokeDasharray="10 8" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }} />
              <circle cx={px} cy={py} r={6} fill="#2457ff" />
              <circle cx={ex} cy={ey} r={6} fill="#2457ff" />
            </g>
          )
        })}
      </svg>
      <AnimatePresence>
        {label && (
          <motion.div className="absolute left-1/2 rounded-2xl border border-line bg-[rgba(20,22,26,0.94)] px-8 py-3 text-center shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
            style={{ top: 498, x: '-50%' }} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.32, ease: 'easeOut' }}>
            <div className="text-[40px] font-semibold tracking-tight text-white">same trees · <span className="text-amber">not counted</span></div>
            {check && <div className="mt-0.5 text-[28px] text-mute">{plan.number} counts {pairs.length}; {elev.number} draws the same {pairs.length} from the side</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </OnStage>
  )
}
