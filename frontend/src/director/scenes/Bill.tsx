import { AnimatePresence, motion } from 'framer-motion'
import { FileSpreadsheet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Num } from '../../components/Num'
import { fmt, qty } from '../../lib/format'
import { centreOf } from '../../lib/geo'
import { play } from '../../lib/sound'
import { PANEL_MARGIN, PANEL_TOP, STAGE, homeRect, setDir, setLook, useDirector, useScript } from '../core'
import { billData } from '../data'
import { InPanel, OnStage, useProject } from './common'

const PANEL = 900
const PAD = 28
const TITLE_H = 64
const HEAD_H = 54
const ROW_H = 60
const COLS = [52, 364, 92, 70, 132, 134]

/** The developer's bill beside the sheet: rows aligned to drawing items, three flags, one click, NT$ running. */
export function Bill() {
  const api = useDirector()
  const { run, scene } = api
  const d = billData(run, scene)!
  const { rows, sheet, flags, fileName, site } = d
  const project = useProject()
  const [open, setOpen] = useState(false)
  const [wired, setWired] = useState(0)
  const [slammed, setSlammed] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [money, setMoney] = useState(0)

  const first = flags.find((f) => f.cell === 'qty') ?? flags[0]
  const firstRow = rows.find((r) => r.row === first?.row)
  const extra = firstRow && firstRow.qty !== undefined && firstRow.drawn !== undefined ? firstRow.qty - firstRow.drawn : 0
  const price = firstRow?.price ?? 0

  const anchors = useMemo(() => rows.map((r) => {
    const objs = sheet.objects.filter((o) => r.objectIds.includes(o.object_id))
    if (!objs.length) return null
    const cs = objs.map(centreOf)
    return [cs.reduce((a, c) => a + c[0], 0) / cs.length, cs.reduce((a, c) => a + c[1], 0) / cs.length] as [number, number]
  }), [rows, sheet])

  useScript(async (s) => {
    setDir({ panelW: 0 })
    await s.sleep(300)
    await api.sheet()?.zoomToBox(site, { rect: homeRect(PANEL, 740), duration: 450 })
    await s.sleep(250)
    setDir({ panelW: PANEL })
    setOpen(true)
    play('whoosh', { volume: 0.45 })
    await s.sleep(900)
    for (let i = 0; i < rows.length; i++) {
      setWired(i + 1)
      if (anchors[i]) play('tick', { volume: 0.35, rate: 1 + i * 0.04 })
      await s.sleep(anchors[i] ? 340 : 120)
    }
    await s.sleep(700)
    for (let i = 0; i < flags.length; i++) {
      setSlammed(i + 1)
      play('thud')
      await s.sleep(1150)
    }
    if (firstRow) {
      setWaiting(true)
      await s.gate(1600)
      setWaiting(false)
      setPicked(firstRow.row)
      firstRow.objectIds.forEach((id) => setLook(sheet.sheet_id, id, { stroke: '#f0a500', strokeWidth: 3, fill: '#f0a500', fillOpacity: 0.26 }))
      play('tick')
      await s.sleep(250)
      setMoney(extra * price)
      await s.sleep(2600)
    }
    await s.sleep(800)
  })

  const panelLeft = STAGE.w - PANEL_MARGIN - PANEL
  const rowY = (i: number) => PANEL_TOP + PAD + TITLE_H + 14 + HEAD_H + i * ROW_H + ROW_H / 2
  const flagFor = (row: number) => flags.filter((f, i) => f.row === row && i < slammed)

  return (
    <>
      <OnStage>
        <svg width={STAGE.w} height={STAGE.h} className="absolute inset-0">
          {open && rows.map((r, i) => {
            const a = anchors[i]
            if (!a || i >= wired) return null
            const [ex, ey] = project(a[0], a[1])
            const sx = panelLeft
            const sy = rowY(i)
            const hot = picked === r.row || flagFor(r.row).length > 0
            const path = `M${sx},${sy} C${sx - 160},${sy} ${ex + 200},${ey - 40} ${ex},${ey}`
            return (
              <g key={r.row}>
                <motion.path d={path} fill="none" stroke={hot ? '#f0a500' : '#2457ff'} strokeWidth={hot ? 3 : 2.2} strokeOpacity={0.95}
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: 'easeOut' }} />
                <motion.circle cx={ex} cy={ey} r={7} fill={hot ? '#f0a500' : '#2457ff'} stroke="#fff" strokeWidth={2.5} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 }} />
                <circle cx={sx} cy={sy} r={5} fill={hot ? '#f0a500' : '#2457ff'} />
              </g>
            )
          })}
        </svg>
      </OnStage>
      <InPanel>
        {open && (
          <div className="flex h-full flex-col bg-[#fbfbf9] text-[#1d2026]" style={{ width: PANEL, padding: PAD }}>
            <div className="flex shrink-0 items-center gap-3 rounded-xl bg-[#eceeef] px-4" style={{ height: TITLE_H }}>
              <FileSpreadsheet className="h-8 w-8 text-[#3a3f47]" />
              <span className="truncate text-[28px] font-semibold">{fileName}</span>
              <span className="ml-auto rounded-md bg-[#dfe2e5] px-2 py-0.5 text-[22px] font-semibold text-[#5b616b]">the developer’s bill</span>
            </div>
            <div className="mt-[14px] overflow-hidden rounded-xl border border-[#dadde1]">
              <div className="flex items-center bg-[#f0f1f3] text-[24px] font-semibold uppercase tracking-wide text-[#6b717b]" style={{ height: HEAD_H }}>
                {['#', 'Description', 'Qty', 'Unit', 'NT$ each', 'Amount'].map((h, i) => (
                  <div key={h} className={`px-3 ${i >= 2 && i !== 3 ? 'text-right' : ''}`} style={{ width: COLS[i] }}>{h}</div>
                ))}
              </div>
              {rows.map((r, i) => {
                const fl = flagFor(r.row)
                const q = fl.find((f) => f.cell === 'qty')
                const pr = fl.find((f) => f.cell === 'price')
                const off = !anchors[i] && r.sheetIds.length > 0 && !r.sheetIds.includes(sheet.sheet_id)
                return (
                  <motion.div key={r.row} initial={false} animate={{ backgroundColor: fl.length ? '#fff1cc' : picked === r.row ? '#fff1cc' : i < wired ? '#ffffff' : '#fbfbf9', scale: fl.length ? [1.035, 1] : 1 }}
                    transition={{ duration: 0.25 }} onClick={() => waiting && r.row === firstRow?.row && api.release()}
                    className="relative flex items-center border-t border-[#e3e5e8] text-[28px]" style={{ height: ROW_H, boxShadow: fl.length ? 'inset 6px 0 0 #f0a500' : undefined, cursor: waiting && r.row === firstRow?.row ? 'pointer' : undefined }}>
                    {waiting && r.row === firstRow?.row && (
                      <motion.span className="absolute inset-0" animate={{ boxShadow: ['inset 0 0 0 0 rgba(240,165,0,0.6)', 'inset 0 0 0 5px rgba(240,165,0,0)'] }} transition={{ duration: 1.3, repeat: Infinity }} />
                    )}
                    <div className="mono px-3 text-[24px] text-[#8a9099]" style={{ width: COLS[0] }}>{r.row}</div>
                    <div className="flex items-center gap-2 truncate px-3 font-medium" style={{ width: COLS[1] }}>
                      <span className="truncate">{r.text}</span>
                      {off && <span className="mono shrink-0 rounded bg-[#eceef0] px-1.5 text-[20px] text-[#6b717b]">{r.sheetIds[0]}</span>}
                    </div>
                    <div className={`mono px-3 text-right ${q ? 'font-bold text-[#a86f00]' : ''}`} style={{ width: COLS[2] }}>{qty(r.qty)}</div>
                    <div className="px-3 text-[24px] text-[#6b717b]" style={{ width: COLS[3] }}>{r.unit ?? ''}</div>
                    <div className={`mono px-3 text-right ${pr ? 'font-bold text-[#a86f00]' : ''}`} style={{ width: COLS[4] }}>{r.price !== undefined ? fmt(r.price) : ''}</div>
                    <div className="mono px-3 text-right" style={{ width: COLS[5] }}>{r.amount !== undefined ? fmt(r.amount) : ''}</div>
                  </motion.div>
                )
              })}
            </div>
            <div className="mt-5 space-y-2.5">
              <AnimatePresence>
                {flags.slice(0, slammed).map((f) => {
                  const r = rows.find((x) => x.row === f.row)!
                  const text = f.cell === 'price'
                    ? `NT$${fmt(r.price)} · your list ${fmt(r.listLow)}–${fmt(r.listHigh)}`
                    : `bill ${qty(r.qty)} · drawn ${qty(r.drawn)}`
                  return (
                    <motion.div key={f.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28 }}
                      className="flex items-baseline gap-3 rounded-xl bg-[#fff1cc] px-4 py-2.5">
                      <span className="mono text-[24px] font-semibold text-[#a86f00]">row {f.row}</span>
                      <span className="text-[28px] font-semibold text-[#3d2c00]">{text}</span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            <div className="mt-auto flex items-end justify-between rounded-2xl bg-[#1d2026] px-6 py-5 text-white" style={{ opacity: picked ? 1 : 0, transition: 'opacity 300ms' }}>
              <div>
                <div className="text-[28px] text-[#aab1bb]">billed, not drawn</div>
                <div className="mono text-[30px] text-[#f0a500]">{extra} × NT${fmt(price)}</div>
              </div>
              <div className="mono text-[60px] font-bold leading-none text-[#f0a500]">NT$<Num value={money} duration={1.8} format={(v) => fmt(v)} /></div>
            </div>
          </div>
        )}
      </InPanel>
    </>
  )
}
