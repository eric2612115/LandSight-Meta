import { AnimatePresence, motion } from 'framer-motion'
import { FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { Num } from '../../components/Num'
import { qty } from '../../lib/format'
import { overList, useMoney } from '../../lib/money'
import { centreOf } from '../../lib/geo'
import { play } from '../../lib/sound'
import { PANEL_MARGIN, PANEL_TOP, STAGE, homeRect, setDir, setLook, useDirector, useScript } from '../core'
import { billData } from '../data'
import { InPanel, OnStage, useProject } from './common'

const PANEL = 900
const PAD = 28
const TITLE_H = 64
const HEAD_H = 54
const ROW_H = 48
const COLS = [56, 360, 92, 70, 132, 134]

/** The developer's bill beside the sheet: rows aligned to drawing items, three flags, one click, the money running.
 * Every figure is the Run's TWD, shown in the chosen currency at the Run's dated rate (lib/money). */
export function Bill() {
  const api = useDirector()
  const { run, scene } = api
  const d = billData(run, scene)!
  const { rows, sheet, flags, tail, fileName, site } = d
  const project = useProject()
  const [open, setOpen] = useState(false)
  const [wired, setWired] = useState(0)
  const [slammed, setSlammed] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [money, setMoney] = useState(0)
  const m = useMoney(run.currency)
  const [hidden, setHidden] = useState(0)

  const first = flags.find((f) => f.cell === 'qty') ?? flags[0]
  const firstRow = rows.find((r) => r.row === first?.row)
  const extra = firstRow && firstRow.qty !== undefined && firstRow.drawn !== undefined ? firstRow.qty - firstRow.drawn : 0
  const price = firstRow?.price ?? 0
  const billed = m.times(extra, price)
  // a row whose amount is qty × rate shows qty × the shown rate (the arithmetic on screen holds in USD too); any other
  // amount (a total, a row that does not add up) is converted as it stands
  const amountOf = (r: { qty?: number; price?: number; amount?: number }) =>
    r.amount === undefined ? ''
      : r.qty !== undefined && r.price !== undefined && Math.abs(r.qty * r.price - r.amount) < 0.5
        ? m.times(r.qty, r.price).total.replace(/^(NT)?\$/, '')
        : m.money(r.amount, { symbol: false })
  const over = overList(run.checks)

  const anchors = rows.map((r) => {
    const objs = sheet.objects.filter((o) => r.objectIds.includes(o.object_id))
    if (!objs.length) return null
    const cs = objs.map(centreOf)
    return [cs.reduce((a, c) => a + c[0], 0) / cs.length, cs.reduce((a, c) => a + c[1], 0) / cs.length] as [number, number]
  })

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
      setMoney(billed.totalValue)
      await s.sleep(2400)
    }
    for (let i = 0; i < tail.length; i++) {
      setHidden(i + 1)
      play(i === 0 ? 'whoosh' : 'thud', { volume: 0.4, rate: 0.8 })
      await s.sleep(1300)
    }
    await s.sleep(900)
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
              <span className="truncate text-[28px] font-semibold">{fileName.replace(/\.xlsx?$/i, '')}</span>
              <span className="ml-auto shrink-0 whitespace-nowrap rounded-md bg-[#dfe2e5] px-2 py-0.5 text-[22px] font-semibold text-[#5b616b]">the developer’s bill</span>
            </div>
            <div className="mt-[14px] overflow-hidden rounded-xl border border-[#dadde1]">
              <div className="flex items-center bg-[#f0f1f3] text-[24px] font-semibold uppercase tracking-wide text-[#6b717b]" style={{ height: HEAD_H }}>
                {['#', 'Description', 'Qty', 'Unit', `${m.symbol} each`, 'Amount'].map((h, i) => (
                  <div key={h} className={`px-3 ${i >= 2 && i !== 3 ? 'text-right' : ''}`} style={{ width: COLS[i] }}>{h}</div>
                ))}
              </div>
              {rows.map((r, i) => {
                const fl = flagFor(r.row)
                const q = fl.find((f) => f.cell === 'qty' || f.cell === 'unit')
                const pr = fl.find((f) => f.cell === 'price')
                const un = fl.find((f) => f.cell === 'unit')
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
                    <div className={`px-3 text-[24px] ${un ? 'font-bold text-[#a86f00]' : 'text-[#6b717b]'}`} style={{ width: COLS[3] }}>{r.unit ?? ''}</div>
                    <div className={`mono px-3 text-right ${pr ? 'font-bold text-[#a86f00]' : ''}`} style={{ width: COLS[4] }}>{r.price !== undefined ? m.money(r.price, { symbol: false }) : ''}</div>
                    <div className="mono px-3 text-right" style={{ width: COLS[5] }}>{amountOf(r)}</div>
                  </motion.div>
                )
              })}
            </div>
            <div className="mt-5 space-y-2.5">
              <AnimatePresence>
                {flags.slice(0, hidden ? 0 : slammed).map((f) => {
                  const r = rows.find((x) => x.row === f.row)!
                  const n = f.check.numbers ?? {}
                  const tag = typeof (f.check as { tag?: unknown }).tag === 'string' ? (f.check as { tag?: string }).tag : undefined
                  const text = f.cell === 'price'
                    ? `${m.money(r.price)} · your list ${m.range(r.listLow, r.listHigh)}`
                    : f.cell === 'unit'
                      ? `billed ${qty(r.qty)} ${r.unit ?? ''} · drawn ${qty(r.drawn)} ${typeof n.drawn_unit === 'string' && n.drawn_unit === 'plant' ? 'plants' : ''} — unit mismatch`
                      : `bill ${qty(r.qty)} · drawn ${qty(r.drawn)}`
                  return (
                    <motion.div key={f.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28 }}
                      className="flex flex-wrap items-baseline gap-x-3 rounded-xl bg-[#fff1cc] px-4 py-2.5">
                      <span className="mono shrink-0 text-[24px] font-semibold text-[#a86f00]">row {f.row}</span>
                      <span className="whitespace-nowrap text-[28px] font-semibold text-[#3d2c00]">{text}</span>
                      {f.cell === 'price' && tag && <span className="w-full pl-[76px] text-[22px] leading-tight text-[#8a6a1f]">{tag}</span>}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            <div className="mt-2.5 space-y-2">
              <AnimatePresence>
                {tail.slice(0, hidden).map((c) => {
                  const n = c.numbers ?? {}
                  const text = c.category === 'arithmetic'
                    ? `subtotal ${typeof n.formula === 'string' ? n.formula.replace(/^=/, '') : ''} skips row ${typeof n.row === 'number' ? n.row : ''} · the bill does not add up`
                    : `${c.title.replace(/ in .*$/, '')} · other totals`
                  return (
                    <motion.div key={c.check_id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                      className="rounded-xl bg-[#1d2026] px-4 py-2 text-[28px] font-semibold text-[#ffd27a]">{text}</motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            <div className="mt-auto rounded-2xl bg-[#1d2026] px-6 py-5 text-white" style={{ opacity: picked ? 1 : 0, transition: 'opacity 300ms' }}>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[28px] text-[#aab1bb]">billed, not drawn</div>
                  <div className="mono text-[30px] text-[#f0a500]">{extra} × {billed.unit} =</div>
                </div>
                <div className="mono text-[60px] font-bold leading-none text-[#f0a500]">{billed.prefix}<Num value={money} duration={1.8} format={(v) => Math.round(v).toLocaleString('en-US')} /></div>
              </div>
              {over > 0 && (
                <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
                  <span className="text-[28px] text-[#aab1bb]">over your price list</span>
                  <span className="mono text-[40px] font-bold text-[#ffd27a]">{m.money(over)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </InPanel>
    </>
  )
}
