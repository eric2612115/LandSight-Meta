import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { pointsOnCrop } from '../lib/model'
import { ErrorBoundary } from './ErrorBoundary'
import type { DrawingObject, SparkView } from '../lib/types'

/** The fields Muse Spark's group_and_read answer is shown with: exactly what the recorded answer carries for the open
 * outline (is_one_object, kind, confidence, why, points), nothing derived and nothing invented. */
const FIELDS = ['is_one_object', 'kind', 'confidence'] as const

const wrap = (text: string, first: number, rest: number, lines: number): string[] => {
  const words = text.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    const room = out.length === 0 ? first : rest
    if (cur && (cur + ' ' + w).length > room) {
      out.push(cur)
      cur = w
      if (out.length === lines) break
    } else cur = cur ? `${cur} ${w}` : w
  }
  if (out.length < lines && cur) out.push(cur)
  const used = out.join(' ').length
  if (used < text.length && out.length) out[out.length - 1] = `${out[out.length - 1].replace(/[\s,.;:]+$/, '')}…`
  return out
}

/** The answer as short JSON lines. `why` wraps onto at most `why` lines of `cols` characters; points are summarised. */
export function answerLines(answer: Record<string, unknown>, opts: { why?: number; cols?: number; braces?: boolean } = {}): string[] {
  const { why = 0, cols = 34, braces = true } = opts
  const has = (k: string) => k in answer && answer[k] !== '' && answer[k] !== null && answer[k] !== undefined
  const lines: string[] = []
  for (const k of FIELDS) if (has(k)) lines.push(`  "${k}": ${JSON.stringify(answer[k])}`)
  if (why > 0 && typeof answer.why === 'string' && answer.why) {
    const head = '  "why": "'
    const parts = wrap(answer.why, cols - head.length, cols - 4, why)
    parts.forEach((t, i) => lines.push(i === 0 ? `${head}${t}${parts.length === 1 ? '"' : ''}` : `    ${t}${i === parts.length - 1 ? '"' : ''}`))
  }
  const pts = Array.isArray(answer.points) ? answer.points.length : 0
  if (pts) lines.push(`  "points": [${pts} points]`)
  const body = lines.map((l, i) => (i < lines.length - 1 && !lines[i + 1].startsWith('    ') ? `${l},` : l))
  return braces ? ['{', ...body, '}'] : body
}

/** Colour a JSON line: keys soft, strings cobalt, numbers and booleans white; a wrapped string keeps its colour. */
export function JsonLine({ line }: { line: string }) {
  const m = line.match(/^(\s*)"([^"]+)":\s(.*?)(,?)$/)
  if (!m) {
    if (/^\s{4}\S/.test(line)) return <span className="text-[#8fa6ff]">{line}</span>
    return <span className="text-mute">{line}</span>
  }
  const [, ind, key, value, comma] = m
  const isStr = value.startsWith('"')
  return (
    <span>
      {ind}
      <span className="text-[#9aa3b0]">"{key}"</span>
      <span className="text-mute">: </span>
      <span className={isStr ? 'text-[#8fa6ff]' : 'text-[#f2f4f7]'}>{value}</span>
      <span className="text-mute">{comma}</span>
    </span>
  )
}

type CropProps = { spark: SparkView; obj?: DrawingObject; showPoints: boolean; className?: string; pointSize?: number }

/** The crop that was sent, with grounding points popping onto it; a bad field shows an inline note, never a blank page. */
export function SparkCrop(props: CropProps) {
  return (
    <ErrorBoundary label="Muse Spark's crop" resetKey={props.spark} className={props.className}>
      <SparkCropInner {...props} />
    </ErrorBoundary>
  )
}

function SparkCropInner({ spark, obj, showPoints, className = '', pointSize = 14 }: CropProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | undefined>()
  const pts = useMemo(() => spark.points_crop ?? pointsOnCrop(spark.points, obj, natural), [spark.points_crop, spark.points, obj, natural])
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-white ${className}`}>
      <div className="relative h-full max-w-full" style={{ aspectRatio: natural ? `${natural.w} / ${natural.h}` : '1 / 1' }}>
      <img src={spark.crop_url} alt="The crop sent to Muse Spark" className="block h-full w-full"
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
      <AnimatePresence>
        {showPoints && pts.map(([x, y], i) => (
          <motion.span key={i} className="absolute rounded-full"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: pointSize, height: pointSize, marginLeft: -pointSize / 2, marginTop: -pointSize / 2, background: '#2457ff', boxShadow: '0 0 0 3px rgba(255,255,255,0.95), 0 0 0 6px rgba(36,87,255,0.25)' }}
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ delay: i * 0.12, type: 'spring', stiffness: 520, damping: 18 }} />
        ))}
      </AnimatePresence>
      </div>
    </div>
  )
}
