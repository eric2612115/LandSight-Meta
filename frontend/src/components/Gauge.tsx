import { motion } from 'framer-motion'
import { fmt } from '../lib/format'
import { Num } from './Num'

/** A horizontal gauge of provided against required; red below, green above. */
export function Gauge({ value, required, max, height = 40, width, showValue = true, fontSize = 28, duration = 1.1 }: {
  value: number
  required: number
  max: number
  height?: number
  width: number
  showValue?: boolean
  fontSize?: number
  duration?: number
}) {
  const pass = value > required
  const colour = value <= 0 ? '#3a3f47' : pass ? '#1f9d55' : '#e5484d'
  const x = (v: number) => (Math.max(0, Math.min(v, max)) / max) * width
  return (
    <div style={{ width }}>
      <div className="relative" style={{ height: fontSize * 1.5 }}>
        {showValue && (
          <motion.div className="absolute bottom-1 mono font-bold" initial={false} animate={{ left: Math.max(0, x(value) - fontSize * 2.6), color: pass ? '#3ccf7f' : value > 0 ? '#ff6b6f' : '#8a919c' }}
            transition={{ duration, ease: [0.16, 1, 0.3, 1] }} style={{ fontSize: fontSize * 1.15, width: fontSize * 5, textAlign: 'right' }}>
            <Num value={value} duration={duration} format={(v) => fmt(v, 1)} />
          </motion.div>
        )}
      </div>
      <div className="relative overflow-visible rounded-full bg-[#262a31]" style={{ height }}>
        <motion.div className="absolute left-0 top-0 h-full rounded-full" initial={false} animate={{ width: x(value), background: colour }}
          transition={{ duration, ease: [0.16, 1, 0.3, 1] }} />
        <div className="absolute top-[-10px] w-[3px] rounded bg-[#f2f4f7]" style={{ left: x(required) - 1.5, height: height + 20 }} />
      </div>
      <div className="relative" style={{ height: fontSize * 1.4 }}>
        <div className="absolute top-2 whitespace-nowrap text-soft" style={{ left: x(required), transform: 'translateX(-50%)', fontSize: fontSize * 0.85 }}>
          required <span className="mono font-semibold text-white">{fmt(required, 1)}</span>
        </div>
      </div>
    </div>
  )
}
