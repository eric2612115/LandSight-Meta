import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { pointsOnCrop } from '../lib/model'
import type { DrawingObject, SparkView } from '../lib/types'

const KEYS = ['is_one_object', 'kind', 'label', 'label_text', 'label_meaning', 'confidence', 'species', 'species_code', 'count', 'implies_count']
const SKIP = new Set(['why', 'model', 'id', 'facts'])

/** The answer as short JSON lines: preferred keys first, strings clipped. */
export function answerLines(answer: Record<string, unknown>, max = 6): string[] {
  const has = (k: string) => k in answer && answer[k] !== '' && answer[k] !== null && answer[k] !== undefined
  const keys = [...KEYS.filter(has), ...Object.keys(answer).filter((k) => !KEYS.includes(k) && !SKIP.has(k) && has(k) && typeof answer[k] !== 'object')]
  const picked = keys.slice(0, max)
  const val = (v: unknown) => {
    if (typeof v === 'string') return JSON.stringify(v.length > 22 ? `${v.slice(0, 21)}…` : v)
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return JSON.stringify(v)
    return '…'
  }
  return ['{', ...picked.map((k, i) => `  "${k}": ${val(answer[k])}${i < picked.length - 1 ? ',' : ''}`), '}']
}

/** Colour a JSON line: keys soft, strings cobalt, numbers and booleans white. */
export function JsonLine({ line }: { line: string }) {
  const m = line.match(/^(\s*)"([^"]+)":\s(.*?)(,?)$/)
  if (!m) return <span className="text-mute">{line}</span>
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

/** The crop that was sent, with grounding points popping onto it. */
export function SparkCrop({ spark, obj, showPoints, className = '', pointSize = 14 }: { spark: SparkView; obj?: DrawingObject; showPoints: boolean; className?: string; pointSize?: number }) {
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
