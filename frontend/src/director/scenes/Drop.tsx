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

const GRID = { x: 60, y: 194, w: 1800, h: 706 }
const FOLDER = { x: 110, y: 130 }
const STRIP_Y = 912

const SHORT: Record<string, string> = {
  drawing_vector: 'vector', drawing_raster: 'raster', drawing_image: 'image', backup_ignored: 'ignored', archive_unpacked: 'unpacked',
}
const short = (f: FileVerdict, n: number) => (n > 12 ? SHORT[f.verdict] ?? (f.verdict === 'unsupported' && f.ext ? `.${f.ext.replace(/^\./, '')} unsupported` : verdictLabel(f)) : verdictLabel(f))

/** A file name without its extension (the badge shows it), shortened in the middle so both ends stay readable. */
const stem = (f: FileVerdict, max: number) => {
  const ext = f.ext && f.name.toLowerCase().endsWith(f.ext.toLowerCase()) ? f.name.slice(0, -f.ext.length) : f.name
  return ext.length <= max ? ext : `${ext.slice(0, Math.ceil(max * 0.62) - 1)}…${ext.slice(ext.length - Math.floor(max * 0.38))}`
}

const dead = (f: FileVerdict) => f.verdict === 'unsupported' || f.verdict === 'unreadable'
const quiet = (f: FileVerdict) => dead(f) || f.verdict === 'backup_ignored'

/** The drop: the folder lands, every file fans out and resolves to its verdict, the drawings line up as sheets. */
export function Drop() {
  const api = useDirector()
  const { run } = api
  // the package's own files (an archive's members are its verdict, not chips of their own)
  const files = useMemo(() => run.files.filter((f) => !f.parent), [run])
  const n = files.length
  const cols = n > 12 ? 2 : n > 4 ? 3 : Math.max(1, n)
  const rows = Math.ceil(n / cols)
  const gap = 20
  const rowGap = n > 12 ? 3 : 10
  const cardW = (GRID.w - (cols - 1) * gap) / cols
  const cardH = Math.min(n > 12 ? 52 : 128, (GRID.h - (rows - 1) * rowGap) / rows)
  const gridH = rows * cardH + (rows - 1) * rowGap
  const top = GRID.y + Math.max(0, (GRID.h - gridH) / 2)
  const big = n <= 12
  const nameMax = Math.floor((cardW - 420) / 15.5)
  const sheets = useMemo(() => files.filter((f) => f.sheet_id && sheetById(run, f.sheet_id)).map((f) => ({ f, s: sheetById(run, f.sheet_id)! })), [files, run])
  const bills = files.filter((f) => f.verdict === 'bill').length
  const unsupported = files.filter(dead).length
  const missing = run.checks.filter((c) => api.scene.check_ids?.includes(c.check_id) && c.category === 'sheet' && c.severity !== 'info').length
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

  // column-major: the folder's own order reads down the first column, then the second
  const pos = (i: number) => (n > 12
    ? { x: GRID.x + Math.floor(i / rows) * (cardW + gap), y: top + (i % rows) * (cardH + rowGap) }
    : { x: GRID.x + (i % cols) * (cardW + gap), y: top + Math.floor(i / cols) * (cardH + rowGap) })

  return (
    <OnStage>
      <div className="absolute inset-0 bg-chrome" />
      {/* the folder, and the count line */}
      <AnimatePresence>
        {phase >= 1 && (
          <motion.div className="absolute flex items-center gap-6" style={{ left: 60, top: 92, width: 1800 }} initial={{ opacity: 0, scale: 0.9, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <FolderOpen className="shrink-0 text-paper" style={{ width: 84, height: 84 }} strokeWidth={1.4} />
            <div className="min-w-0">
              <div className="truncate text-[34px] font-semibold leading-tight tracking-tight text-white">{run.package.name}</div>
              <div className="mt-1 text-[28px] text-mute">
                <span className="mono font-semibold text-white">{n}</span> files · <span className="mono font-semibold text-white">{sheets.length}</span> drawings on stage · <span className="mono font-semibold text-white">{bills}</span> bills · <span className="mono font-semibold text-white">{unsupported}</span> unsupported{missing > 0 && <> · <span className="mono font-semibold text-amber">{missing}</span> <span className="text-amber">missing</span></>}
              </div>
            </div>
            <AnimatePresence>
              {board && (
                <motion.div className="ml-auto flex shrink-0 items-baseline gap-6 rounded-2xl border border-line bg-[#171a1f] px-6 py-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                  {([['planted', e.planted, '#e8eaed'], ['found', e.found.length, '#3ccf7f'], ['review', e.flagged.length, '#8fa6ff'], ['missed', e.missed.length, e.missed.length ? '#f0a500' : '#e8eaed']] as const).map(([k, v, c]) => (
                    <span key={k} className="flex items-baseline gap-2">
                      <span className="text-[28px] text-mute">{k}</span>
                      <span className="mono text-[34px] font-bold" style={{ color: c }}><Num value={v} duration={0.9} /></span>
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
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
            <div className={`flex h-full ${big ? 'flex-col justify-between py-3' : 'items-center justify-between gap-3'} px-4`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="mono w-[58px] shrink-0 rounded-md bg-[#2a2f37] px-1.5 py-0.5 text-center text-[20px] font-semibold uppercase text-soft">{(f.ext || '?').replace(/^\./, '')}</span>
                <span className="truncate text-[28px] text-[#e3e6ea]">{big ? f.name : stem(f, nameMax)}</span>
              </div>
              <div className="flex h-[40px] shrink-0 items-center">
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
