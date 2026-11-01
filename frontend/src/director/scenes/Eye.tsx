import { AnimatePresence, motion } from 'framer-motion'
import { Check, Eye as EyeIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { JsonLine, SparkCrop, answerLines } from '../../components/SparkSaw'
import { fmt, qty } from '../../lib/format'
import { bboxOf, openSegments, padBox, pathOf } from '../../lib/geo'
import { pointsOnSheet } from '../../lib/model'
import { play } from '../../lib/sound'
import { threeSources } from '../../plain/panels'
import { LOOK } from '../baseline'
import { homeRect, setDir, setLook, upsertTally, useDirector, useScript } from '../core'
import { eyeData, tallyBase } from '../data'
import { COLOURS, InPanel, InSheet, PanelHeader } from './common'

const PANEL = 620

/** The eye: zoom to the open outline, red pieces and gaps, what Muse Spark saw, the snap, three sources, Confirm. */
export function Eye() {
  const api = useDirector()
  const { run, scene } = api
  const { sheet, item, obj } = eyeData(run, scene)!
  const segs = useMemo(() => openSegments(obj), [obj])
  const lines = useMemo(() => (item.spark ? answerLines(item.spark.answer, 4) : []), [item])
  const text = lines.join('\n')
  const sheetPoints = useMemo(() => pointsOnSheet(item.spark?.points, obj), [item, obj])
  const src = threeSources(run, item)
  const [phase, setPhase] = useState(0)
  const [typed, setTyped] = useState(0)
  const [rows, setRows] = useState(0)
  const [gaps, setGaps] = useState(false)
  const [snap, setSnap] = useState(false)
  const key = tallyBase(item).key
  const finalCount = item.spark_count ?? item.proposed_count ?? item.quote_count ?? item.geometry_count

  useScript(async (s) => {
    setDir({ panelW: 0 })
    await s.sleep(500)
    await api.sheet()?.zoomToBox(padBox(bboxOf(obj.outline), 3.6, 2.6), { rect: homeRect(PANEL), duration: 300 })
    await s.sleep(450)
    for (let i = 0; i < segs.length; i++) {
      setLook(sheet.sheet_id, obj.object_id, { open: true, fill: 'transparent', strokeWidth: 3.4, stroke: COLOURS.amber, segColours: segs.map((_, j) => (j <= i ? COLOURS.redInk : COLOURS.amber)), tag: true, tagTone: 'red' })
      play('tick', { rate: 0.85 + i * 0.035, volume: 0.45 })
      await s.sleep(110)
    }
    await s.sleep(250)
    setGaps(true)
    play('thud', { volume: 0.35 })
    await s.sleep(1000)
    setDir({ panelW: PANEL })
    play('whoosh', { volume: 0.45 })
    setPhase(1)
    await s.sleep(500)
    setPhase(2)
    await s.sleep(900)
    setPhase(3)
    for (let c = 0; c <= text.length; c += 2) {
      setTyped(c)
      await s.sleep(24)
    }
    setTyped(text.length)
    await s.sleep(400)
    if (item.spark?.points?.length) {
      setPhase(4)
      item.spark.points.forEach((_, i) => setTimeout(() => !s.signal.aborted && play('tick', { rate: 1.3 }), i * 120))
      await s.sleep(400 + item.spark.points.length * 120)
    }
    // the outline snaps closed in cobalt
    setGaps(false)
    setSnap(true)
    setLook(sheet.sheet_id, obj.object_id, { open: false, segColours: undefined, stroke: COLOURS.cobalt, strokeWidth: 3.2, fill: COLOURS.cobalt, fillOpacity: 0.1, tag: true, tagTone: 'cobalt' })
    play('snap')
    upsertTally({ key, spark: item.spark_count, credit: 'spark', creditKey: Date.now() })
    setPhase(5)
    await s.sleep(900)
    for (let r = 1; r <= 3; r++) {
      setRows(r)
      play('tick', { volume: 0.4 })
      await s.sleep(420)
    }
    await s.sleep(350)
    setPhase(6)
    await s.gate(2200)
    api.confirm(item.item_id)
    setPhase(7)
    setSnap(false)
    setLook(sheet.sheet_id, obj.object_id, LOOK.confirmed)
    upsertTally({ key, drawn: finalCount, spark: item.spark_count, status: 'confirmed', credit: 'confirmed', creditKey: Date.now() })
    play('chime')
    await s.sleep(2400)
  })

  const shown = text.slice(0, typed).split('\n')
  const crop = phase >= 2 && item.spark

  return (
    <>
      <InSheet>
        <AnimatePresence>
          {gaps && obj.gaps?.map(([x, y], i) => (
            <motion.circle key={i} cx={x} cy={-y} r={0.13} fill={COLOURS.redInk} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              transition={{ delay: i * 0.045, type: 'spring', stiffness: 600, damping: 20 }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
          ))}
          {phase >= 4 && phase < 7 && sheetPoints.map(([x, y], i) => (
            <motion.circle key={`p${i}`} cx={x} cy={-y} r={0.16} fill={COLOURS.cobalt} stroke="#fff" strokeWidth={0.05} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ opacity: 0 }}
              transition={{ delay: i * 0.12, type: 'spring', stiffness: 520, damping: 16 }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
          ))}
          {snap && (
            <motion.path key="snap" d={pathOf(obj.outline, true)} fill="none" stroke={COLOURS.cobalt} strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.32, ease: 'easeOut' }} />
          )}
        </AnimatePresence>
      </InSheet>

      <InPanel>
        <div className="flex h-full flex-col p-8" style={{ width: PANEL }}>
          <PanelHeader tone="#8fa6ff" icon={<EyeIcon className="h-8 w-8" strokeWidth={2.2} />} title="What Muse Spark saw"
            right={<span className="mono text-[30px] font-bold" style={{ color: phase >= 7 ? '#3ccf7f' : phase >= 5 ? '#8fa6ff' : COLOURS.amber }}>{obj.object_id}</span>} />
          <div className="mt-5 h-[220px] shrink-0">
            <AnimatePresence>
              {crop && item.spark && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }} className="h-full">
                  <SparkCrop spark={item.spark} obj={obj} showPoints={phase >= 4} className="h-full w-full" pointSize={16} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="mono mt-4 min-h-0 flex-1 overflow-hidden rounded-xl bg-[#0f1114] px-5 py-3.5 text-[28px] leading-[1.38]" style={{ opacity: phase >= 3 ? 1 : 0, transition: 'opacity 200ms' }}>
            {phase >= 3 && shown.map((l, i) => (
              <div key={i} className="whitespace-pre">
                <JsonLine line={l} />
                {i === shown.length - 1 && typed < text.length && <span className="ml-0.5 inline-block h-[28px] w-[14px] translate-y-[4px] bg-[#8fa6ff]" />}
              </div>
            ))}
          </div>
          <div className="mt-4 shrink-0 space-y-2">
            {([['Geometry', src.geometry, '#c3c9d1'], ['Muse Spark', src.spark, '#8fa6ff'], ['Plant list', src.list, '#f2f4f7']] as const).map(([k, v, c], i) => (
              <motion.div key={k} initial={false} animate={{ opacity: rows > i ? 1 : 0, x: rows > i ? 0 : 16 }} transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex items-baseline justify-between rounded-xl bg-[#1f2329] px-5 py-[9px]">
                <span className="text-[28px] text-mute">{k}</span>
                <span className="mono text-[30px] font-semibold" style={{ color: c }}>{v}</span>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 h-[76px] shrink-0">
            <AnimatePresence mode="wait">
              {phase === 6 && (
                <motion.button key="confirm" onClick={() => api.release()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="relative h-full w-full rounded-2xl bg-white text-[32px] font-semibold text-chrome">
                  <motion.span className="absolute inset-0 rounded-2xl" animate={{ boxShadow: ['0 0 0 0 rgba(255,255,255,0.45)', '0 0 0 14px rgba(255,255,255,0)'] }} transition={{ duration: 1.4, repeat: Infinity }} />
                  Confirm
                </motion.button>
              )}
              {phase >= 7 && (
                <motion.div key="done" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}
                  className="flex h-full w-full items-center justify-center gap-3 rounded-2xl bg-green text-[32px] font-semibold text-white">
                  <Check className="h-9 w-9" strokeWidth={3} /> Confirmed · {qty(finalCount)} {item.unit === 'plant' ? 'trees' : ''}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="sr-only">{fmt(item.spark?.confidence, 2)}</div>
        </div>
      </InPanel>
    </>
  )
}
