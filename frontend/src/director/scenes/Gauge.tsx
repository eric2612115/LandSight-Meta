import { AnimatePresence, motion } from 'framer-motion'
import { Check, Scale } from 'lucide-react'
import { useState } from 'react'
import { Gauge as Bar } from '../../components/Gauge'
import { SheetThumb } from '../../components/SheetView'
import { fmt, num } from '../../lib/format'
import { isRasterSheet } from '../../lib/model'
import { play } from '../../lib/sound'
import type { Fix } from '../../lib/types'
import { homeRect, setDir, setLook, useDirector, useScript } from '../core'
import { gaugeData } from '../data'
import { InPanel, OnStage, PanelHeader } from './common'

const PANEL = 700
const WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']
/** the second native species' tone: distinct from the green of a confirmed tree */
const SECOND = '#0e7c86'

const extra = (f?: Fix) => f?.extra_trees ?? Number(f?.label.match(/^\+\s*(\d+)/)?.[1] ?? 0)

/** The gauge, twice (SCRIPT v4 beat 8): the gauge fills red; chip 1 "+N trees" passes; the L-6 tree-pit detail slides
 * in with the measured pit and the rule; the gauge drops; chip 1 re-prices in place; chip 2 changes ONE tree to a
 * second native species and one canopy changes tone. Every number is read from the greening check's two states. */
export function Gauge() {
  const api = useDirector()
  const { run, scene } = api
  const d = gaugeData(run, scene)!
  const { check, required, sheet, swapped, site, before, after, add0, add1, swap, k, second, detail, A0, r } = d
  const twice = !!(before && after && add0 && add1)
  const start = twice ? before!.provided : d.provided
  const end = twice ? after!.provided : d.provided
  const [value, setValue] = useState(0)
  const [card, setCard] = useState(false)
  const [chip1, setChip1] = useState<Fix | undefined>()
  const [repriced, setRepriced] = useState(false)
  const [pit, setPit] = useState(false)
  const [chip2, setChip2] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const results = [start, end, num(add0?.result), num(add1?.result), num(swap?.result)].filter((v): v is number => v !== undefined)
  const max = Math.max(required, ...results) * 1.1
  const alpha0 = before?.alpha ?? d.alpha ?? 0.8
  const alpha1 = swap?.alpha ?? 1.3
  const unit = typeof check.numbers?.unit === 'string' ? check.numbers.unit : 'kgCO₂e/yr'
  const article = (check.citation?.article ?? check.title).replace(/, Design and Construction Part/, '')
  const p = after?.pit
  const rule = after?.rule

  useScript(async (s) => {
    setDir({ panelW: 0, tallyMode: 'compact' })
    await s.sleep(300)
    await api.sheet()?.zoomToBox(site, { rect: homeRect(PANEL, 690), duration: 450 })
    await s.sleep(300)
    setDir({ panelW: PANEL })
    setCard(true)
    play('whoosh', { volume: 0.4 })
    await s.sleep(800)
    setValue(start)
    await s.sleep(1250)
    play('thud')
    await s.sleep(900)
    // chip 1: more of the same tree passes
    setChip1(twice ? add0 : add1)
    play('chime', { volume: 0.6 })
    await s.sleep(1500)
    if (twice) {
      // the tree-pit detail: on a slab, pits this size make every large tree count as small
      setPit(true)
      play('thud', { volume: 0.7 })
      await s.sleep(2300)
      setValue(end)
      play('whoosh', { volume: 0.3, rate: 0.8 })
      await s.sleep(1300)
      setRepriced(true)
      setChip1(add1)
      play('thud', { volume: 0.4 })
      await s.sleep(1500)
    }
    if (swap) {
      setWaiting(true)
      await s.gate(1300)
      setWaiting(false)
      setChip2(true)
      setValue(num(swap.result) ?? end)
      swapped.forEach((id) => setLook(sheet.sheet_id, id, { fill: SECOND, fillOpacity: 0.5, stroke: SECOND, strokeWidth: 3, tag: second, tagTone: 'green', pulse: SECOND, pulseKey: Date.now() }))
      play('chime')
      await s.sleep(2600)
    }
    await s.sleep(800)
  })

  const pass = value > required && value > 0
  const n1 = extra(chip1)
  const alpha = chip2 ? alpha1 : alpha0
  return (
    <>
      <OnStage>
        <AnimatePresence>
          {pit && detail && (
            <motion.div key="pit" className="absolute overflow-hidden rounded-2xl border border-line bg-[#171a1f] shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
              style={{ left: 720, top: 700, width: 440, height: 340 }} initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <div className="h-[150px] overflow-hidden bg-paper"><SheetThumb sheet={detail} raster={isRasterSheet(run, detail)} className="h-full w-full" /></div>
              <div className="px-5 py-3">
                <div className="text-[28px] font-semibold text-white"><span className="mono">{detail.number}</span> · tree pit</div>
                {p && (
                  <div className="mono text-[28px] leading-snug text-[#8fa6ff]">
                    {fmt(p.width_m, 1)} × {fmt(p.length_m, 1)} m = {fmt(p.area_m2, 2)} m²<br />soil {fmt(p.soil_depth_m, 1)} m{p.on_slab ? ' · on slab' : ''}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </OnStage>
      <InPanel>
        <AnimatePresence>
          {card && (
            <motion.div className="flex h-full flex-col p-8" style={{ width: PANEL }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              <PanelHeader icon={<Scale className="h-8 w-8 text-soft" />} title="Regulation check" />
              <div className="mt-4 text-[30px] font-medium leading-snug text-white">{article}</div>
              {A0 !== undefined && r !== undefined && (
                <div className="mt-1 text-[28px] leading-snug text-mute">site <span className="mono text-soft">{fmt(A0)}</span> m² · coverage <span className="mono text-soft">{fmt(r * 100)}%</span> · read from the title block</div>
              )}
              <div className="mt-4 flex items-baseline gap-4">
                <span className="mono text-[72px] font-bold leading-none" style={{ color: value === 0 ? '#8a919c' : pass ? '#3ccf7f' : '#ff6b6f', transition: 'color 300ms' }}>{fmt(value, 1)}</span>
                <span className="text-[28px] text-mute">of <span className="mono text-white">{fmt(required, 1)}</span> {unit}</span>
              </div>
              <div className="mt-3">
                <Bar value={value} required={required} max={max} width={PANEL - 64} height={44} fontSize={28} showValue={false} duration={1.15} />
              </div>
              <div className="mt-4 space-y-3">
                <AnimatePresence>
                  {chip1 && (
                    <motion.div key="chip1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: chip2 ? 0.45 : 1, y: 0 }} transition={{ duration: 0.3 }}
                      className="flex items-center justify-between gap-4 rounded-2xl border-2 border-green bg-[rgba(31,157,85,0.14)] px-5 py-3">
                      <span className="text-[30px] font-semibold text-white">
                        +<motion.span key={n1} className="mono inline-block" initial={repriced ? { scale: 1.6, color: '#f0a500' } : false} animate={{ scale: 1, color: '#ffffff' }} transition={{ duration: 0.5 }}>{n1}</motion.span> trees
                        {repriced && add0 && <span className="ml-3 text-[28px] font-normal text-mute">was +{extra(add0)}</span>}
                      </span>
                      <span className="mono flex shrink-0 items-center gap-2 text-[30px] font-semibold text-[#3ccf7f]">{fmt(num(chip1.result), 1)} <Check className="h-8 w-8" strokeWidth={3} /></span>
                    </motion.div>
                  )}
                  {pit && rule && (
                    <motion.div key="rule" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                      className="rounded-2xl border border-amber/60 bg-[rgba(240,165,0,0.1)] px-5 py-3 text-[28px] leading-snug text-[#ffd27a]">
                      {rule}
                    </motion.div>
                  )}
                  {(chip2 || waiting) && swap && (
                    <motion.button key="chip2" onClick={() => waiting && api.release()} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                      className={`relative block w-full rounded-2xl border-2 px-5 py-3 text-left ${chip2 ? 'border-green bg-[rgba(31,157,85,0.14)]' : 'border-line-2 bg-[#1f2329]'}`}>
                      {waiting && <motion.span className="absolute inset-0 rounded-2xl" animate={{ boxShadow: ['0 0 0 0 rgba(255,255,255,0.35)', '0 0 0 12px rgba(255,255,255,0)'] }} transition={{ duration: 1.4, repeat: Infinity }} />}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[30px] font-semibold text-white">change {WORDS[k] ?? k} tree{k === 1 ? '' : 's'} to {second}</span>
                        {chip2 && <span className="mono flex shrink-0 items-center gap-2 text-[30px] font-semibold text-[#3ccf7f]">{fmt(num(swap.result), 1)} <Check className="h-8 w-8" strokeWidth={3} /></span>}
                      </div>
                      <div className="mt-1 text-[28px] leading-snug text-mute">native-species factor <span className="mono text-soft">{fmt(alpha0, 1)} → {fmt(alpha1, 1)}</span><br />no extra trees</div>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-auto flex items-end justify-between text-[28px] leading-snug text-mute">
                <span>pass · fail · needs review<br />the architect signs off</span>
                <motion.span key={alpha} initial={{ scale: 1.2 }} animate={{ scale: 1, color: alpha > alpha0 ? '#3ccf7f' : '#c3c8cf' }} className="mono font-semibold">α {fmt(alpha, 1)}</motion.span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </InPanel>
    </>
  )
}
