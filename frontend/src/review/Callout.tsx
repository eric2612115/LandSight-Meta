/** A's paper callout, next to the selected pin: the crop, the measured facts, Muse Spark's answer as recorded (its
 * own fields, nothing derived), the three sources, Confirm / Leave open. The decision is made looking at the drawing. */
import { AnimatePresence, motion } from 'framer-motion'
import { forwardRef, useMemo, useState } from 'react'
import { useShow } from '../app/show'
import { Pulse } from '../shell/Shell'
import { SheetCrop } from '../components/SheetView'
import { answerLines } from '../components/SparkSaw'
import { numberRows, objectsOn, type Flag } from '../lib/flags'
import { ledgerRow } from '../lib/statement'
import { fmt, qty } from '../lib/format'
import { bboxOf, unionBox } from '../lib/geo'
import { askedObject, pointsOnCrop } from '../lib/model'
import { useMoney } from '../lib/money'
import type { Item, Run, Sheet } from '../lib/types'
import { cropBox, threeSources } from './model'

type Props = {
  run: Run
  sheet: Sheet
  flag: Flag
  n: number
  item?: Item
  state?: 'confirmed' | 'dismissed'
  style: React.CSSProperties
  onConfirm: () => void
  onLeave: () => void
  onReopen: () => void
}

export const Callout = forwardRef<HTMLDivElement, Props>(function Callout({ run, sheet, flag, n, item, state, style, onConfirm, onLeave, onReopen }, ref) {
  const sh = useShow()
  const m = useMoney(run.currency)
  const c = flag.check
  const spark = item?.spark
  const lines = useMemo(() => (spark ? answerLines(spark.answer, { why: 2, cols: 46, braces: false }) : []), [spark])
  const text = lines.join('\n')
  const typed = sh.typed === null ? text.length : sh.typed
  const showPoints = sh.points ?? true
  const srcRows = sh.sources ?? 3
  const answer = spark?.answer ?? {}
  const one = answer.is_one_object === true
  const facts = item ? threeSources(run, item) : null
  const count = item ? item.spark_count ?? item.proposed_count : undefined
  const confirmLabel = item && count ? `Confirm — ${qty(count)} ${item.unit === 'plant' ? (item.kind === 'tree' ? 'trees' : 'plants') : item.unit}` : 'Confirm flag'
  const lr = ledgerRow(run, flag, { cur: m.cur, rate: m.rate, money: m.money, text: m.text })

  return (
    <motion.div ref={ref} className="callout" style={style} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
      <div className="row1">
        <div className="crop relative">
          {spark ? <CropImg run={run} item={item!} showPoints={showPoints} /> : <ObjectsCrop sheet={sheet} flag={flag} />}
        </div>
        <div className="t">
          <b><span className="mono font-medium text-blue">{n} · {flag.id}</span> — {m.text(c.title)}</b>
          {spark ? (
            <span>Geometry could not close it{typeof c.numbers?.max_gap_m === 'number' ? ` (gaps to ${fmt(c.numbers.max_gap_m as number, 2)} m)` : ''}. Muse Spark, shown this crop: <em>{one ? `one ${String(answer.kind ?? 'object')}` : String(answer.kind ?? '')}, {fmt(spark.confidence, 2)}</em>.</span>
          ) : (
            <span className="line-clamp-3">{m.text(c.why)}</span>
          )}
        </div>
      </div>
      {spark && (
        <>
          <div className="lab">Muse Spark’s answer, recorded fields</div>
          <div className="json"><Typed text={text} upto={typed} /></div>
        </>
      )}
      <div className="facts">
        {facts ? (
          ([['geometry', facts.geometry.n, false], ['Muse Spark', facts.spark.n, facts.spark.n !== facts.geometry.n], ['schedule', facts.list.n, false]] as const).map(([label, v, x], i) => (
            <motion.div key={label} className={x ? 'x' : ''} initial={false} animate={{ opacity: i < srcRows ? 1 : 0, y: i < srcRows ? 0 : 6 }} transition={{ duration: 0.25 }}>
              <b>{qty(v)}</b>{label}
            </motion.div>
          ))
        ) : (
          lr.found !== '–'
            ? ([[lr.found, 'found'], [lr.expected, 'expected'], [lr.delta, 'Δ']] as const).filter(([v]) => v && v !== '–').map(([v, label], i) => (
              <div key={label} className={i === 2 ? 'x' : ''} title={i === 0 ? lr.basis : undefined}><b>{v}</b>{label}</div>
            ))
            : numberRows(c, (t) => m.money(t), 3).map(([label, value]) => (
              <div key={label} title={`${label}: ${value}`}><b>{value.split(' ')[0]}</b>{label.toLowerCase()}</div>
            ))
        )}
      </div>
      <div className="cacts">
        {state === 'confirmed' ? (
          <>
            <span className="btn done">Confirmed{item && count ? ` · ${qty(count)} ${item.kind === 'tree' ? 'trees' : ''}` : ''}</span>
            <button className="btn ghost" onClick={onReopen}>Reopen</button>
          </>
        ) : (
          <>
            <button className="btn primary relative" onClick={onConfirm}>
              {confirmLabel}
              {sh.pulse === 'confirm' && <Pulse />}
            </button>
            <button className="btn" onClick={onLeave}>Leave open</button>
          </>
        )}
        <span className="ml-auto text-[12px] text-ink-3">{c.by.map((b) => (b === 'spark' ? 'Muse Spark' : b === 'sam' ? 'SAM 3.1' : b)).join(' · ')}</span>
      </div>
    </motion.div>
  )
})

/** The JSON lines, coloured: keys quiet, strings cobalt, values ink; typed up to `upto` characters. */
function Typed({ text, upto }: { text: string; upto: number }) {
  const shown = text.slice(0, upto)
  return (
    <>
      {shown.split('\n').map((l, i, all) => {
        const mm = l.match(/^(\s*)"([^"]+)":\s?(.*)$/)
        const caret = i === all.length - 1 && upto < text.length
        if (!mm) return <div key={i} className="s">{l.trim()}{caret && <Caret />}</div>
        const [, , k, v] = mm
        return (
          <div key={i}>
            <span className="k">"{k}": </span>
            <span className={v.startsWith('"') ? 's' : 'v'}>{v}</span>
            {caret && <Caret />}
          </div>
        )
      })}
    </>
  )
}

const Caret = () => <span className="ml-px inline-block h-[13px] w-[7px] translate-y-[2px] bg-blue" />

function CropImg({ run, item, showPoints }: { run: Run; item: Item; showPoints: boolean }) {
  const [nat, setNat] = useState<{ w: number; h: number }>()
  const { obj } = askedObject(run, item)
  const pts = item.spark!.points_crop ?? pointsOnCrop(item.spark!.points, obj, nat)
  return (
    <>
      <img src={item.spark!.crop_url} alt="What Muse Spark saw" className="block h-full w-full object-contain" onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
      <AnimatePresence>
        {showPoints && pts.map(([x, y], i) => (
          <motion.span key={i} className="absolute h-[5px] w-[5px] rounded-full bg-blue" style={{ left: `${x * 100}%`, top: `${y * 100}%`, marginLeft: -2.5, marginTop: -2.5, boxShadow: '0 0 0 1.5px #fff' }}
            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.08, type: 'spring', stiffness: 520, damping: 18 }} />
        ))}
      </AnimatePresence>
    </>
  )
}

function ObjectsCrop({ sheet, flag }: { sheet: Sheet; flag: Flag }) {
  const objs = objectsOn(sheet, flag.check)
  const b = unionBox(objs.map((o) => bboxOf(o.outline)))
  if (!b) return null
  return <SheetCrop sheet={sheet} box={cropBox(b, 1.2)} marks={objs.map((o) => ({ id: o.object_id, outline: o.outline, closed: o.closed || o.kind !== 'planter_edge' }))} className="h-full w-full" />
}
