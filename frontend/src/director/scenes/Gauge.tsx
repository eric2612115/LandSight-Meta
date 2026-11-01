import { AnimatePresence, motion } from 'framer-motion'
import { Check, Scale } from 'lucide-react'
import { useState } from 'react'
import { Gauge as Bar } from '../../components/Gauge'
import { fmt, num } from '../../lib/format'
import { play } from '../../lib/sound'
import { homeRect, setDir, setLook, useDirector, useScript } from '../core'
import { gaugeData } from '../data'
import { COLOURS, InPanel, PanelHeader } from './common'

const PANEL = 700

/** A fix label in a few words: "+2 trees", "swap 2 for a second native species (Bischofia)". */
function chipText(label: string) {
  const add = label.match(/^\+\s*(\d+)\s+(\w+)/)
  if (add) return `+${add[1]} trees`
  const swap = label.match(/swap\s+(\d+).*?for\s+([A-Z][a-z]+)/i)
  if (swap) return `swap ${swap[1]} for a second native species (${swap[2]})`
  const change = label.match(/change\s+(\w+)\s+(\w+)\s+to\s+([A-Z][a-z]+)/i)
  if (change) return `change ${change[1].toLowerCase()} ${change[2]} to ${change[3]}, a second native species`
  return label.length > 60 ? `${label.slice(0, 58)}…` : label
}

/** The gauge: provided against required, red; then the two ways to pass, the second without extra trees. */
export function Gauge() {
  const api = useDirector()
  const { run, scene } = api
  const d = gaugeData(run, scene)!
  const { check, required, provided, fixes, sheet, swapped, site } = d
  const [value, setValue] = useState(0)
  const [card, setCard] = useState(false)
  const [chips, setChips] = useState(0)
  const [active, setActive] = useState(-1)
  const [waiting, setWaiting] = useState(false)
  const max = Math.max(required, provided, ...fixes.map((f) => num(f.result) ?? 0)) * 1.1
  const alpha0 = d.alpha ?? 0.8
  const alpha = active >= 0 ? fixes[active]?.alpha ?? (/swap|change/i.test(fixes[active]?.label ?? '') ? 1.3 : alpha0) : alpha0
  const unit = typeof check.numbers?.unit === 'string' ? check.numbers.unit : 'kgCO₂e/yr'
  const article = check.citation?.article ?? check.title
  const jurisdiction = typeof check.numbers?.jurisdiction === 'string' ? check.numbers.jurisdiction : undefined

  useScript(async (s) => {
    setDir({ panelW: 0 })
    await s.sleep(300)
    await api.sheet()?.zoomToBox(site, { rect: homeRect(PANEL, 690), duration: 450 })
    await s.sleep(300)
    setDir({ panelW: PANEL })
    setCard(true)
    play('whoosh', { volume: 0.4 })
    await s.sleep(900)
    setValue(provided)
    await s.sleep(1250)
    play('thud')
    await s.sleep(1100)
    for (let i = 0; i < fixes.length; i++) {
      setChips(i + 1)
      play('tick', { volume: 0.4 })
      await s.sleep(500)
      setWaiting(true)
      await s.gate(1500)
      setWaiting(false)
      setActive(i)
      setValue(num(fixes[i].result) ?? provided)
      const swapFix = /swap|change/i.test(fixes[i].label)
      if (swapFix) {
        swapped.forEach((id) => setLook(sheet.sheet_id, id, { fill: COLOURS.green, fillOpacity: 0.34, tag: true, tagTone: 'green', pulse: COLOURS.green, pulseKey: Date.now() }))
      } else {
        swapped.forEach((id) => setLook(sheet.sheet_id, id, { fill: '#3a3f47', fillOpacity: 0.1, tag: true, tagTone: 'ink' }))
      }
      await s.sleep(1150)
      play('snap')
      await s.sleep(1300)
    }
    await s.sleep(1200)
  })

  const pass = value > required && value > 0
  return (
    <InPanel>
      <AnimatePresence>
        {card && (
          <motion.div className="flex h-full flex-col p-8" style={{ width: PANEL }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <PanelHeader icon={<Scale className="h-8 w-8 text-soft" />} title="Regulation check" />
            <div className="mt-5 text-[30px] font-medium leading-snug text-white">{article}</div>
            {jurisdiction && <div className="mt-2 text-[28px] text-mute">{jurisdiction}</div>}
            <div className="mt-8 flex items-baseline gap-4">
              <span className="mono text-[76px] font-bold leading-none" style={{ color: value === 0 ? '#8a919c' : pass ? '#3ccf7f' : '#ff6b6f', transition: 'color 300ms' }}>{fmt(value, 1)}</span>
              <span className="text-[28px] text-mute">of <span className="mono text-white">{fmt(required, 1)}</span> {unit}</span>
            </div>
            <div className="mt-4">
              <Bar value={value} required={required} max={max} width={PANEL - 64} height={44} fontSize={28} showValue={false} duration={1.15} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-[28px]">
              <span className="text-mute">native-tree bonus</span>
              <motion.span key={alpha} initial={{ scale: 1.25, color: '#ffffff' }} animate={{ scale: 1, color: alpha > alpha0 ? '#3ccf7f' : '#c3c8cf' }} className="mono font-semibold">α {fmt(alpha, 1)}</motion.span>
            </div>
            <div className="mt-6 space-y-3">
              {fixes.map((f, i) => (
                <motion.button key={i} onClick={() => waiting && chips === i + 1 && api.release()} initial={false}
                  animate={{ opacity: chips > i ? (active === -1 || active === i ? 1 : 0.42) : 0, y: chips > i ? 0 : 12 }} transition={{ duration: 0.3 }}
                  className={`relative flex w-full items-center justify-between gap-4 rounded-2xl border-2 px-5 py-4 text-left ${active === i ? 'border-green bg-[rgba(31,157,85,0.14)]' : 'border-line-2 bg-[#1f2329]'}`}>
                  {waiting && chips === i + 1 && (
                    <motion.span className="absolute inset-0 rounded-2xl" animate={{ boxShadow: ['0 0 0 0 rgba(255,255,255,0.35)', '0 0 0 12px rgba(255,255,255,0)'] }} transition={{ duration: 1.4, repeat: Infinity }} />
                  )}
                  <span className="text-[28px] font-medium leading-snug text-white">{chipText(f.label)}</span>
                  <span className="mono flex shrink-0 items-center gap-2 text-[30px] font-semibold" style={{ color: f.passes ? '#3ccf7f' : '#ff6b6f' }}>
                    {fmt(num(f.result), 1)} {f.passes && <Check className="h-8 w-8" strokeWidth={3} />}
                  </span>
                </motion.button>
              ))}
            </div>
            <div className="mt-auto text-[28px] leading-snug text-mute">pass · fail · needs review<br />the architect signs off</div>
          </motion.div>
        )}
      </AnimatePresence>
    </InPanel>
  )
}
