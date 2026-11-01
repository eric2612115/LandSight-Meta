import { animate } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { qty } from '../lib/format'

/** A number that counts to its new value (ease-out) instead of jumping. */
export function Num({ value, duration = 0.5, format = qty, className, style }: {
  value: number | undefined | null
  duration?: number
  format?: (v: number) => string
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value === undefined || value === null) {
      el.textContent = '–'
      prev.current = null
      return
    }
    const from = prev.current ?? 0
    prev.current = value
    if (from === value || duration === 0) {
      el.textContent = format(value)
      return
    }
    const integer = Number.isInteger(value) && Number.isInteger(from)
    const ctl = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = format(integer ? Math.round(v) : Math.round(v * 10) / 10)
      },
    })
    return () => ctl.stop()
  }, [value, duration, format])
  return <span ref={ref} className={className} style={style} />
}
