import { AnimatePresence, motion } from 'framer-motion'
import { Check, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Num } from './Num'

export type Credit = 'geometry' | 'spark' | 'sam' | 'confirmed' | 'schedule'

export type TallyView = {
  key: string
  label: string
  unit: string
  drawn?: number
  spark?: number
  schedule?: number
  status: 'agreed' | 'flagged' | 'confirmed' | 'pending'
  /** who changed it last; flashes in that source's colour */
  credit?: Credit
  creditKey?: number
}

const FLASH: Record<Credit, string> = {
  geometry: 'rgba(181,188,198,0.35)', spark: 'rgba(36,87,255,0.55)', sam: 'rgba(122,60,255,0.55)', confirmed: 'rgba(31,157,85,0.6)', schedule: 'rgba(255,255,255,0.25)',
}

const show = (v?: number) => (v === undefined || v === null || v === 0 ? undefined : v)

function Cell({ v, colour, flash, flashKey, size }: { v?: number; colour: string; flash?: string; flashKey?: number; size: number }) {
  const [k, setK] = useState(0)
  const last = useRef(v)
  useEffect(() => {
    if (last.current !== v) {
      last.current = v
      setK((x) => x + 1)
    }
  }, [v, flashKey])
  return (
    <div className="relative text-right" style={{ width: size * 3.3 }}>
      <AnimatePresence>
        {k > 0 && flash && (
          <motion.span key={k} className="absolute rounded-md" style={{ inset: `-${size * 0.12}px -${size * 0.16}px`, background: flash }}
            initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
        )}
      </AnimatePresence>
      <span className="relative mono font-semibold" style={{ color: colour, transition: 'color 300ms ease-out' }}>
        {v === undefined ? <span style={{ color: '#4a505a' }}>–</span> : <Num value={v} />}
      </span>
    </div>
  )
}

/** The corner tally: every change credited to its source in its colour. */
export function Tally({ rows, size = 32, className = '', style }: { rows: TallyView[]; size?: number; className?: string; style?: React.CSSProperties }) {
  const label = Math.round(size * 0.875)
  return (
    <div className={`rounded-2xl border border-line bg-[rgba(18,20,24,0.9)] shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-md ${className}`}
      style={{ padding: `${size * 0.5}px ${size * 0.7}px`, ...style }}>
      <div className="flex items-baseline text-mute" style={{ fontSize: label, gap: size * 0.4, paddingBottom: size * 0.25 }}>
        <div className="flex-1 font-medium tracking-tight" style={{ minWidth: size * 6.2 }}>tally</div>
        <div className="text-right text-graphite-lt" style={{ width: size * 3.3 }}>drawn</div>
        <div className="text-right text-cobalt-lt" style={{ width: size * 3.3 }}>Spark</div>
        <div className="text-right text-soft" style={{ width: size * 3.3 }}>list</div>
        <div style={{ width: size * 0.9 }} />
      </div>
      <AnimatePresence initial={false}>
        {rows.map((r) => {
          const disagree = r.status === 'flagged'
          const drawnColour = r.status === 'confirmed' ? '#3ccf7f' : disagree ? '#f0a500' : '#d5dae1'
          return (
            <motion.div key={r.key} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
              <div className="flex items-center border-t border-line/70" style={{ gap: size * 0.4, padding: `${size * 0.22}px 0`, fontSize: size }}>
                <div className="flex flex-1 items-baseline overflow-hidden" style={{ minWidth: size * 6.2, gap: size * 0.25 }}>
                  <span className="truncate font-medium tracking-tight text-[#eef0f3]" style={{ fontSize: label }}>{r.label}</span>
                  {r.unit !== 'plant' && r.unit !== 'plants' && <span className="text-mute" style={{ fontSize: label * 0.8 }}>{r.unit}</span>}
                </div>
                <Cell v={show(r.drawn)} colour={drawnColour} flash={FLASH[r.credit === 'confirmed' ? 'confirmed' : 'geometry']} flashKey={r.creditKey} size={size} />
                <Cell v={show(r.spark)} colour="#7d98ff" flash={FLASH.spark} size={size} />
                <Cell v={show(r.schedule)} colour="#c3c8cf" flash={FLASH.schedule} size={size} />
                <div className="flex items-center justify-end" style={{ width: size * 0.9 }}>
                  {r.status === 'confirmed' ? (
                    <Check style={{ width: size * 0.7, height: size * 0.7 }} color="#3ccf7f" strokeWidth={3} />
                  ) : disagree ? (
                    <TriangleAlert style={{ width: size * 0.66, height: size * 0.66 }} color="#f0a500" strokeWidth={2.5} />
                  ) : r.status === 'pending' ? null : (
                    <Check style={{ width: size * 0.62, height: size * 0.62 }} color="#6b727d" strokeWidth={2.5} />
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
