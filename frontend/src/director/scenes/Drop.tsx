import { AnimatePresence, motion } from 'framer-motion'
import { Eye, FolderOpen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Num } from '../../components/Num'
import { isRasterSheet, sheetById, verdictLabel } from '../../lib/model'
import { play } from '../../lib/sound'
import type { FileVerdict } from '../../lib/types'
import { verdictIcon } from '../../plain/panels'
import { SheetThumb } from '../../components/SheetView'
import { setDir, useDirector, useScript } from '../core'
import { OnStage } from './common'

const GRID = { x: 400, y: 88, w: 1480, h: 770 }
const FOLDER = { x: 205, y: 300 }
const STRIP_Y = 902

const SHORT: Record<string, string> = {
  drawing_vector: 'vector', drawing_raster: 'raster', drawing_image: 'image', backup_ignored: 'ignored', archive_unpacked: 'unpacked',
}
const short = (f: FileVerdict, n: number) => (n > 12 ? SHORT[f.verdict] ?? (f.verdict === 'unsupported' && f.ext ? `.${f.ext.replace(/^\./, '')} unsupported` : verdictLabel(f)) : verdictLabel(f))

const dead = (f: FileVerdict) => f.verdict === 'unsupported' || f.verdict === 'unreadable'
const quiet = (f: FileVerdict) => dead(f) || f.verdict === 'backup_ignored'

/** The drop: the folder lands, every file fans out and resolves to its verdict, the drawings line up as sheets. */
export function Drop() {
  const api = useDirector()
  const { run } = api
  const files = run.files
  const n = files.length
  const cols = n > 24 ? 5 : n > 12 ? 4 : n > 4 ? 3 : Math.max(1, n)
  const rows = Math.ceil(n / cols)
  const gap = n > 24 ? 12 : 16
  const cardW = (GRID.w - (cols - 1) * gap) / cols
  const cardH = Math.min(n > 12 ? 100 : 128, (GRID.h - (rows - 1) * 10) / rows)
  const gridH = rows * cardH + (rows - 1) * 10
  const top = GRID.y + Math.max(0, (GRID.h - gridH) / 2)
  const big = n <= 12
  const sheets = useMemo(() => files.filter((f) => f.sheet_id && sheetById(run, f.sheet_id)).map((f) => ({ f, s: sheetById(run, f.sheet_id)! })), [files, run])
  const thumbW = Math.min(176, (1780 - (sheets.length - 1) * 14) / Math.max(1, sheets.length))
  const thumbH = Math.round(thumbW * 0.56)

  const [phase, setPhase] = useState(0)
  const [resolved, setResolved] = useState(0)
  const [board, setBoard] = useState(false)
  const e = run.errors

  useScript(async (s) => {
    setDir({ showSheet: false, panelW: 0 })
    await s.sleep(300)
    setPhase(1)
    play('whoosh', { volume: 0.5 })
    await s.sleep(650)
    setPhase(2)
    await s.sleep(450 + n * 45)
    setPhase(3)
    const step = Math.max(70, Math.min(160, 4200 / n))
    for (let i = 1; i <= n; i++) {
      setResolved(i)
      const f = files[i - 1]
      if (dead(f)) play('thud', { volume: 0.45 })
      else play('tick', { rate: f.decided_by === 'spark' ? 1.25 : 1, volume: 0.5 })
      await s.sleep(dead(f) ? step + 260 : step)
    }
    await s.sleep(700)
    setPhase(4)
    sheets.forEach((_, i) => setTimeout(() => !s.signal.aborted && play('tick', { rate: 0.9 + i * 0.05, volume: 0.35 }), 120 + i * 90))
    await s.sleep(900 + sheets.length * 90)
    if (e.planted > 0) {
      setBoard(true)
      play('snap', { volume: 0.6 })
    }
    await s.sleep(2600)
  })

  const pos = (i: number) => ({ x: GRID.x + (i % cols) * (cardW + gap), y: top + Math.floor(i / cols) * (cardH + 10) })

  return (
    <OnStage>
      <div className="absolute inset-0 bg-chrome" />
      {/* the folder */}
      <AnimatePresence>
        {phase >= 1 && (
          <motion.div className="absolute flex flex-col items-start" style={{ left: 60, top: 150, width: 300 }} initial={{ opacity: 0, scale: 0.85, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <FolderOpen className="text-paper" style={{ width: 150, height: 150 }} strokeWidth={1.3} />
            <div className="mt-5 text-[30px] font-semibold leading-tight tracking-tight text-white">{run.package.name}</div>
            <div className="mt-3 text-[28px] text-mute"><span className="mono font-semibold text-white">{n}</span> files · <span className="mono font-semibold text-white">{sheets.length}</span> sheets</div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* the error board */}
      <AnimatePresence>
        {board && (
          <motion.div className="absolute rounded-2xl border border-line bg-[#171a1f] p-5" style={{ left: 60, top: 560, width: 300 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            {([['planted', e.planted, '#e8eaed'], ['found', e.found.length, '#3ccf7f'], ['needs review', e.flagged.length, '#8fa6ff'], ['missed', e.missed.length, e.missed.length ? '#f0a500' : '#e8eaed'], ['false alarms', e.false_alarms.length, '#e8eaed']] as const).map(([k, v, c]) => (
              <div key={k} className="flex items-baseline justify-between py-1">
                <span className="text-[28px] text-mute">{k}</span>
                <span className="mono text-[36px] font-bold" style={{ color: c }}><Num value={v} duration={0.9} /></span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {/* the cards */}
      {phase >= 2 && files.map((f, i) => {
        const p = pos(i)
        const done = phase >= 3 && i < resolved
        const Icon = verdictIcon(f)
        const drawing = f.verdict.startsWith('drawing')
        const dim = phase >= 4 && !f.sheet_id
        const rot = ((i * 37) % 23) - 11
        return (
          <motion.div key={f.file_id} className="absolute overflow-hidden rounded-2xl border bg-[#1b1e23]"
            style={{ left: p.x, top: p.y, width: cardW, height: cardH, borderColor: done && quiet(f) ? '#262a30' : '#2f343c' }}
            initial={{ x: FOLDER.x - p.x - cardW / 2, y: FOLDER.y - p.y - cardH / 2, scale: 0.3, rotate: rot, opacity: 0 }}
            animate={{ x: done && dead(f) ? [0, -12, 12, -8, 8, -3, 0] : 0, y: 0, scale: 1, rotate: 0, opacity: dim ? 0.32 : done && quiet(f) ? 0.55 : 1 }}
            transition={{ default: { delay: phase === 2 ? i * 0.045 : 0, duration: 0.42, ease: [0.16, 1, 0.3, 1] }, x: done && dead(f) ? { duration: 0.45 } : { delay: phase === 2 ? i * 0.045 : 0, duration: 0.42, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.3 } }}>
            <div className="flex h-full flex-col justify-between px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="mono shrink-0 rounded-md bg-[#2a2f37] px-1.5 py-0.5 text-[18px] font-semibold uppercase text-soft">{(f.ext || '?').replace(/^\./, '')}</span>
                <span className={`truncate text-[#d5d9df] ${big ? 'text-[28px]' : 'text-[22px]'}`}>{f.name}</span>
              </div>
              <div className="flex h-[40px] items-center">
                <AnimatePresence mode="wait">
                  {done ? (
                    <motion.div key="chip" className="flex min-w-0 items-center gap-2" initial={{ opacity: 0, scale: 0.8, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.22 }}>
                      <span className={`flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-[3px] text-[28px] font-semibold leading-tight ${drawing ? 'bg-paper text-ink' : quiet(f) ? 'bg-[#23272d] text-[#7c838e]' : 'bg-[#2c313a] text-[#eef0f3]'}`}>
                        <Icon className="h-6 w-6 shrink-0" strokeWidth={2.2} />
                        <span className="truncate">{short(f, n)}</span>
                      </span>
                      {f.decided_by === 'spark' && <Eye className="h-7 w-7 shrink-0 text-cobalt-lt" strokeWidth={2.4} />}
                    </motion.div>
                  ) : (
                    <motion.div key="reading" className="h-[10px] w-2/3 overflow-hidden rounded-full bg-[#262a31]" exit={{ opacity: 0 }}>
                      <motion.div className="h-full w-1/3 rounded-full bg-[#3a404a]" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )
      })}
      {/* drawings slide into a sheet strip */}
      {phase >= 4 && sheets.map(({ f, s }, j) => {
        const i = files.indexOf(f)
        const p = pos(i)
        const x = (1920 - (sheets.length * thumbW + (sheets.length - 1) * 14)) / 2 + j * (thumbW + 14)
        return (
          <motion.div key={s.sheet_id} className="absolute" style={{ left: x, top: STRIP_Y, width: thumbW }}
            initial={{ x: p.x - x, y: p.y - STRIP_Y, opacity: 0, scale: 0.9 }} animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: j * 0.09, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <div className="overflow-hidden rounded-lg bg-paper shadow-[0_10px_30px_rgba(0,0,0,0.45)]" style={{ height: thumbH }}>
              <SheetThumb sheet={s} raster={isRasterSheet(run, s)} className="h-full w-full" />
            </div>
            <div className="mt-2 flex items-baseline justify-center gap-2 text-center">
              <span className={`mono text-[24px] font-semibold ${s.counted ? 'text-white' : 'text-mute'}`}>{s.number}</span>
            </div>
          </motion.div>
        )
      })}
    </OnStage>
  )
}
