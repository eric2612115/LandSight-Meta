/** The detail docked under the sheet. B's four columns (text, numbers, citation, decision) for most flags; the
 * greening gauge before and after the tree-pit rule for Art. 302; C's inspector (the bill cells, the drawing, the
 * money, related flags, a note) for quote flags. */
import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useShow } from '../app/show'
import { useDecisions, useUI } from '../app/state'
import { SheetCrop, type CropMark } from '../components/SheetView'
import { moneyOf, numberRows, nums, objectsOn, shownMoney, shownText, type Flag } from '../lib/flags'
import { fmt, num, qty } from '../lib/format'
import { bboxOf, centreOf, unionBox } from '../lib/geo'
import { billRows } from '../lib/model'
import { useMoney } from '../lib/money'
import { latestBill } from '../lib/pkg'
import type { Check, Fix, Run, Sheet } from '../lib/types'
import { Pulse } from '../shell/Shell'
import { cropBox } from './model'

type Acts = { state?: 'confirmed' | 'dismissed'; onConfirm: () => void; onDismiss: () => void; onReopen: () => void; /** the note typed under the flag (sent to the live backend with its decision) */ onNote?: (text: string) => void }

export const isGreening = (c: Check) => num(c.numbers?.required) !== undefined && num(c.numbers?.provided) !== undefined && c.category === 'regulation'
export const isQuote = (f: Flag) => f.scenario === 'quote' && (num(nums(f.check).row) !== undefined || f.check.category === 'bill' || f.check.category === 'arithmetic')

const by = (c: Check) => c.by.map((b) => (b === 'spark' ? 'Muse Spark' : b === 'sam' ? 'SAM 3.1' : b === 'bill' ? 'the bill reader' : b)).join(' and ')

function Decide({ id, acts, wide }: { id: string; acts: Acts; wide?: boolean }) {
  const note = useDecisions((s) => s.notes[id] ?? '')
  const noteLocal = useDecisions((s) => s.note)
  const setNote = (text: string) => (acts.onNote ? acts.onNote(text) : noteLocal(id, text))
  const pulse = useShow((s) => s.pulse)
  return (
    <div className="acts">
      {acts.state === 'confirmed' ? (
        <>
          <span className="btn done">Confirmed · in the query</span>
          <button className="btn ghost" onClick={acts.onReopen}>Reopen</button>
        </>
      ) : (
        <>
          <button className="btn primary relative" onClick={acts.onConfirm}>{wide ? 'Confirm — add to the query' : 'Confirm flag'}{pulse === 'confirm' && <Pulse />}</button>
          <button className="btn" onClick={acts.state === 'dismissed' ? acts.onReopen : acts.onDismiss}>{acts.state === 'dismissed' ? 'Dismissed · reopen' : 'Dismiss'}</button>
        </>
      )}
      {!wide && <input className="field" placeholder="Note for the developer…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />}
    </div>
  )
}

export function Detail({ run, flag, acts }: { run: Run; flag: Flag; acts: Acts }) {
  const m = useMoney(run.currency)
  const c = flag.check
  const rows = numberRows(c, (t) => m.money(t), 6)
  const control = c.control
  const sh = useShow()
  return (
    <div className="detail" style={{ height: 160, gridTemplateColumns: '1.2fr 1.05fr .9fr 190px' }}>
      <div className="min-w-0 overflow-hidden">
        <h3><span className="id">{flag.id}</span>{m.text(c.title)}</h3>
        <p className="line-clamp-5">{m.text(c.why)} <span className="text-ink-3">Read by {by(c)}.</span></p>
      </div>
      {control ? (
        <div className="kv">
          <span className="h">The controlled test</span>
          <span>Prompt, Muse Spark’s words</span><b>“{control.prompt}”</b>
          {[['On the line drawing', `${control.masks_on_lines} masks`], ['On the coloured render', `${control.masks_on_colour} masks`]].map(([k, v], i) => (
            <motion.span key={k} className="contents" initial={false} animate={{ opacity: (sh.control ?? 2) > i ? 1 : 0 }}><span>{k}</span><b className={i === 1 ? 'text-blue' : ''}>{v}</b></motion.span>
          ))}
          <span>Only the image changes</span><b>{c.prompt_source === 'spark_legend' ? 'legend read by Spark' : ''}</b>
        </div>
      ) : (
        <div className="kv">
          <span className="h">Numbers</span>
          {rows.length ? rows.map(([k, v]) => <span key={k} className="contents"><span>{k}</span><b>{v}</b></span>) : <span className="col-span-2 text-ink-3">No figures: the flag is the finding.</span>}
        </div>
      )}
      <Cite run={run} c={c} />
      <Decide id={flag.id} acts={acts} />
    </div>
  )
}

function Cite({ run, c }: { run: Run; c: Check }) {
  if (c.citation) {
    const host = (() => {
      try {
        const u = new URL(c.citation.url)
        const code = u.searchParams.get('pcode')
        return `${u.hostname.replace(/^www\./, '')}${code ? ` · ${code}` : ''}`
      } catch {
        return 'source'
      }
    })()
    return (
      <div className="cite min-w-0 overflow-hidden">
        <div className="h">{c.citation.article.replace(/, Design and Construction Part/, '')}</div>
        <p className="line-clamp-5">{c.citation.gloss}{c.citation.url && <> <a href={c.citation.url} target="_blank" rel="noreferrer">{host}</a></>}</p>
      </div>
    )
  }
  const files = (c.evidence.file_ids ?? []).map((id) => run.files.find((f) => f.file_id === id)?.name ?? id)
  const cells = c.evidence.cells ?? []
  return (
    <div className="cite min-w-0 overflow-hidden">
      <div className="h">Evidence</div>
      <p className="line-clamp-5">
        {files.length ? files.slice(0, 3).join(' · ') : 'the drawing'}
        {cells.length ? <><br /><span className="mono text-[12px]">{cells.slice(0, 4).map((x) => x.replace(/^F-\d+:/, '')).join(' · ')}</span></> : null}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ the gauge */

export function GaugeDock({ run, flag, acts }: { run: Run; flag: Flag; acts: Acts }) {
  const m = useMoney(run.currency)
  const ui = useUI()
  const sh = useShow()
  const c = flag.check
  const before = c.before_downgrade ?? undefined
  const after = c.after_downgrade ?? undefined
  const twice = !!(before && after)
  const stateNow = twice && ui.gauge === 'before' ? before! : after ?? undefined
  const required = num(c.numbers?.required)!
  const provided = stateNow?.provided ?? num(c.numbers?.provided)!
  const value = sh.gauge ?? provided
  const fixes: Fix[] = (stateNow?.fixes ?? c.fixes ?? []).filter((f) => num(f.result) !== undefined)
  const max = Math.max(required, ...fixes.map((f) => num(f.result) ?? 0), before?.provided ?? 0) * 1.08
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`
  const pit = after?.pit
  const pass = value > required
  const shownFixes = sh.fixes ?? fixes.length
  return (
    <div className="detail" style={{ height: 160, gridTemplateColumns: '1.05fr 1.15fr 1fr 190px' }}>
      <div className="min-w-0 overflow-hidden">
        <h3><span className="id">{flag.id}</span>{m.text(c.title)}</h3>
        <p className="line-clamp-4">{c.citation?.gloss}</p>
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold">Greening, Art. 302 <span className="font-normal text-ink-3">kgCO₂e/yr</span></span>
          {twice && (
            <div className="seg sm">
              <button className={ui.gauge === 'before' ? 'on' : ''} onClick={() => ui.set({ gauge: 'before' })}>before the pit rule</button>
              <button className={ui.gauge === 'after' ? 'on' : ''} onClick={() => ui.set({ gauge: 'after' })}>after</button>
            </div>
          )}
        </div>
        <div className="relative mt-2 h-[22px] bg-hover">
          {twice && ui.gauge === 'after' && <div className="absolute inset-y-0 left-0 border-r border-dashed border-ink-3 bg-line-2" style={{ width: pct(before!.provided) }} />}
          <motion.div className="absolute inset-y-0 left-0" style={{ background: pass ? 'var(--color-blue-fill)' : 'var(--color-ink)' }} initial={false} animate={{ width: pct(value) }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
          <div className="absolute -bottom-1 -top-1 w-[2px] bg-blue" style={{ left: pct(required) }} />
        </div>
        <div className="mono mt-1.5 flex justify-between text-[13px]">
          <span><b className="font-medium">{fmt(value, 1)}</b> <span className="text-ink-2">provided{twice ? (ui.gauge === 'after' ? `, was ${fmt(before!.provided, 1)}` : '') : ''}</span></span>
          <span className="text-blue">required {fmt(required, 1)}</span>
        </div>
        <div className="mt-1.5 text-ink-2">
          {pit && ui.gauge === 'after' ? <>L-6: pit {fmt(pit.width_m, 1)} × {fmt(pit.length_m, 1)} m = {fmt(pit.area_m2, 2)} m² on slab, soil {fmt(pit.soil_depth_m, 1)} m — {after?.downgraded?.[0]?.count ?? 8} large trees count as small (Gi 1.5 → 1.0).</> : `As drawn, before the tree-pit rule · α ${fmt(num(c.numbers?.alpha), 1)} · A′ ${fmt(num(c.numbers?.A_prime), 0)} m² · β ${fmt(num(c.numbers?.beta), 2)}`}
        </div>
      </div>
      <div className="kv">
        <span className="h">Three ways to pass{twice ? ` (${ui.gauge} the pit rule)` : ''}</span>
        {fixes.slice(0, 3).map((f, i) => (
          <motion.span key={f.label} className="contents" initial={false} animate={{ opacity: i < shownFixes ? 1 : 0 }}>
            <span title={f.label}>{fixLabel(f)}</span><b className={f.passes ? 'text-blue' : ''}>{fmt(num(f.result), 1)}</b>
          </motion.span>
        ))}
      </div>
      <Decide id={flag.id} acts={acts} />
    </div>
  )
}

const fixLabel = (f: Fix) => `${f.id ? `${f.id} · ` : ''}${f.label.replace(/, the same species/, '').replace(/, a second native species \(α → [\d.]+\); no extra trees/, ' (α 1.3)').replace(/ \(Gi 0\.5\)/, '')}`

/* ------------------------------------------------------------------ C's inspector */

export function Inspector({ run, flag, flags, acts, onSelect }: { run: Run; flag: Flag; flags: Flag[]; acts: Acts; onSelect: (f: Flag) => void }) {
  const m = useMoney(run.currency)
  const sh = useShow()
  const hop = sh.hop ?? 3
  const c = flag.check
  const n = nums(c)
  const row = num(n.row)
  const rows = useMemo(() => billRows(run), [run])
  const bill = run.files.find((f) => f.file_id === n.bill_file) ?? latestBill(run)
  const note = useDecisions((s) => s.notes[flag.id] ?? '')
  const noteLocal = useDecisions((s) => s.note)
  const setNote = (text: string) => (acts.onNote ? acts.onNote(text) : noteLocal(flag.id, text))
  const mo = moneyOf(c)
  const sheet = run.sheets.find((s) => s.sheet_id === flag.sheetIds[0])
  const related = flags.filter((f) => f.id !== flag.id && f.alarm && (
    (row !== undefined && num(nums(f.check).row) === row) ||
    (typeof n.item_id === 'string' && (f.check.item_ids ?? []).includes(n.item_id as string)) ||
    (typeof n.item_id === 'string' && nums(f.check).item_id === n.item_id))).slice(0, 4)

  // the bill rows shown: the flagged one and its neighbours
  const at = rows.findIndex((r) => r.row === row)
  const win = at < 0 ? rows.slice(-4) : rows.slice(Math.max(0, Math.min(at - 1, rows.length - 4)), Math.max(0, Math.min(at - 1, rows.length - 4)) + 4)
  const cell: 'qty' | 'price' | 'unit' | 'amount' = c.category === 'price' ? 'price' : c.category === 'units' ? 'unit' : c.category === 'arithmetic' ? 'amount' : 'qty'

  const col = (h: number) => ({ initial: false as const, animate: { opacity: hop >= h ? 1 : 0.12 }, transition: { duration: 0.35 } })
  return (
    <div className="insp" style={{ height: 300, gridTemplateColumns: '1.45fr .95fr 1.1fr 250px' }}>
      <motion.div className="blk" {...col(1)}>
        <div className="l"><span className="overflow-hidden text-ellipsis"><span className={`hop ${hop >= 1 ? '' : 'dim'}`}>1</span>The bill · {bill?.name.replace(/\.xlsx$/, '').replace(/^Landscape BOQ /, 'BOQ ') ?? 'BOQ'}</span><b>{row !== undefined ? `row ${row}${n.bill_cell ? `, cell ${String(n.bill_cell).replace(/^B/, cell === 'price' ? 'F' : cell === 'unit' ? 'D' : cell === 'amount' ? 'G' : 'E')}` : ''}` : c.evidence.cells?.[0]?.split('!')[0] ?? ''}</b></div>
        {c.category === 'bill' && num(n.hidden_total) !== undefined ? (
          <div className="math mt-2">
            <span>Visible sheet ‘BOQ’</span><span /><b>{m.money(num(n.visible_total))}</b>
            <span>Hidden sheet ‘old’</span><span>11 priced rows</span><b>{m.money(num(n.hidden_total))}</b>
            <div className="tot"><span>Which one did the developer price from?</span><b className="!text-ink">ask</b></div>
          </div>
        ) : (
          <table className="cells">
            <thead><tr><th>#</th><th>Description</th><th>Unit</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {win.map((r) => (
                <tr key={r.row} className={r.row === row ? 'hi' : ''}>
                  <td>{r.row}</td>
                  <td className="txt" title={r.text}>{r.text}</td>
                  <td className={r.row === row && cell === 'unit' ? 'cell' : ''}>{r.unit}</td>
                  <td className={`r ${r.row === row && cell === 'qty' ? 'cell' : ''}`}>{qty(r.qty)}</td>
                  <td className={`r ${r.row === row && cell === 'price' ? 'cell' : ''}`}>{m.money(r.price)}</td>
                  <td className={`r ${r.row === row && cell === 'amount' ? 'cell' : ''}`}>{r.qty !== undefined && r.price !== undefined && r.qty === Math.round(r.qty) ? m.times(r.qty, r.price).total : m.money(r.amount)}</td>
                </tr>
              ))}
              {c.category === 'arithmetic' && (
                <tr className="hi"><td>20</td><td className="txt">Subtotal {String(n.formula ?? '')}</td><td /><td /><td /><td className="r cell">{m.money(num(n.subtotal))}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </motion.div>

      <motion.div className="blk" {...col(2)}>
        <div className="l"><span className="overflow-hidden text-ellipsis"><span className={`hop ${hop >= 2 ? '' : 'dim'}`}>2</span>The drawing{sheet ? ` · ${sheet.number}${sheet.revision && sheet.counted ? ` Rev ${sheet.revision}` : ''}` : ''}</span><b>{drawnText(c)}</b></div>
        {sheet ? <DrawingCrop run={run} sheet={sheet} check={c} /> : <div className="flex h-[200px] items-center justify-center border border-line bg-hover px-6 text-center text-ink-2">{c.category === 'arithmetic' ? `The bill’s own arithmetic: ${String(n.formula ?? '')} stops at row 17; row ${n.row} is left out. Nothing on a drawing to compare.` : 'A bill matter: nothing on a drawing to compare.'}</div>}
      </motion.div>

      <motion.div className="blk flex flex-col" {...col(3)}>
        <div className="l"><span><span className={`hop ${hop >= 3 ? '' : 'dim'}`}>3</span>The money</span><b>{m.cur === 'usd' ? `USD at NT$${fmt(run.currency?.twd_per_usd, 3)}` : 'NT$'}</b></div>
        <MoneyMath run={run} flag={flag} />
        {related.length > 0 && (
          <div className="mt-auto pt-2">
            <div className="l mb-1"><span>Related</span></div>
            <ul className="rel">
              {related.map((f) => (
                <li key={f.id} onClick={() => onSelect(f)}><span><i>{f.id}</i>{m.text(f.check.title)}</span><span>{f.money.kind === 'over' || f.money.kind === 'under' ? shownText((f.money.kind === 'under' ? -1 : 1) * shownMoney(f.money, m.cur, m.rate), m.cur, m.rate, true) : f.money.label ?? f.check.severity}</span></li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>

      <div className="blk flex flex-col gap-2">
        <div className="l"><span className="overflow-hidden text-ellipsis"><span className="mono text-blue">{flag.id}</span> · Quote · {c.by.map((b) => (b === 'spark' ? 'Muse Spark' : b)).join(' · ')}</span></div>
        <div className="line-clamp-2 text-[14px] font-semibold leading-snug">{m.text(c.title)}</div>
        <textarea className="field min-h-[64px] flex-1" placeholder={`Note for the developer — e.g. “Row ${row ?? ''}: ${mo.kind === 'over' ? 'reduce to the drawn quantity' : 'please confirm'}.”`} value={note}
          onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <Decide id={flag.id} acts={acts} wide />
        <span className="hint">Confirmed flags are the query letter. ↑↓ moves, ⏎ confirms, ⌫ dismisses.</span>
      </div>
    </div>
  )
}

function drawnText(c: Check) {
  const n = nums(c)
  const d = num(n.drawn_qty)
  if (d === undefined) return ''
  const u = n.drawn_unit === 'm2' ? 'm²' : n.drawn_unit === 'plant' ? (c.category === 'units' ? 'plants' : 'drawn') : String(n.drawn_unit ?? '')
  return `${qty(d)} ${u}`
}

/** The flag's objects on its sheet, numbered west to east; an open outline Spark proposed is dashed until confirmed. */
function DrawingCrop({ run, sheet, check }: { run: Run; sheet: Sheet; check: Check }) {
  const objs = objectsOn(sheet, check).sort((a, b) => centreOf(a)[0] - centreOf(b)[0])
  const b = unionBox(objs.map((o) => bboxOf(o.outline)))
  if (!b) return <div className="h-[200px] border border-line bg-paper" />
  const box = cropBox(b, 1.6, 1.55)
  const pending = run.items.find((it) => !it.agreed && !it.confirmed && it.spark?.object_id && objs.some((o) => o.object_id === it.spark!.object_id))
  const trees = objs.length > 1
  const marks: CropMark[] = objs.map((o, i) => ({
    id: o.object_id, outline: o.outline, closed: o.closed || o.kind !== 'planter_edge',
    label: trees ? `${i + 1}${pending?.spark?.object_id === o.object_id ? ' · E01' : ''}` : o.object_id,
    dashed: pending?.spark?.object_id === o.object_id,
  }))
  const caption = trees ? `${objs.length} ${objs[0].kind === 'tree' ? 'canopies' : 'outlines'} on ${sheet.number}${pending ? ` · ${pending.spark!.object_id} counts once you confirm E01` : ''}` : `${objs[0].object_id}${objs[0].area_m2 ? ` · ${fmt(objs[0].area_m2, 0)} m²` : objs[0].length_m ? ` · ${fmt(objs[0].length_m, 1)} m` : ''}`
  return (
    <div className="relative h-[230px] overflow-hidden border border-line">
      <SheetCrop sheet={sheet} box={box} marks={marks} className="h-full w-full" labelSize={(box.x1 - box.x0) / 40} />
      <div className="absolute bottom-2 left-2 border border-blue-line bg-pane px-2 py-0.5 text-[13px]">{caption}</div>
    </div>
  )
}

function MoneyMath({ run, flag }: { run: Run; flag: Flag }) {
  const m = useMoney(run.currency)
  const sh = useShow()
  const c = flag.check
  const n = nums(c)
  const mo = flag.money
  const v = (k: string) => num(n[k])
  const unitName = n.bill_unit === 'EA' ? 'plants' : String(n.bill_unit ?? '')
  const total = shownMoney(mo, m.cur, m.rate)
  if (c.category === 'units') {
    const hedge = run.checks.find((x) => num(x.numbers?.spacing_m) !== undefined && (x.evidence.object_ids ?? []).some((id) => (c.evidence.object_ids ?? []).includes(id)))
    const h = (hedge?.numbers ?? {}) as Record<string, number>
    const per = h.length_m && h.spacing_m ? Math.floor(h.length_m / h.spacing_m + 1e-9) + 1 : undefined
    const lines = h.length_m ? [`${fmt(h.length_m, 1)} m ÷ ${h.spacing_m} m + 1 = ${per}`, `${per} × ${h.rows} rows = ${h.count} plants`] : []
    const shown = sh.formula ?? lines.length
    return (
      <div className="math">
        {lines.length > 0 && <span className="col-span-3">Drawn: {fmt(h.length_m, 1)} m at {h.spacing_m} m, {h.rows} rows</span>}
        {lines.map((l, i) => (
          <motion.b key={l} className="col-span-3 !text-left text-[14px]" initial={false} animate={{ opacity: i < shown ? 1 : 0, x: i < shown ? 0 : -6 }}>{l}</motion.b>
        ))}
        <span>Billed</span><span>{qty(v('bill_qty'))} {String(n.bill_unit)} × {m.money(v('unit_price'))}</span><b>{m.money(v('amount'))}</b>
        <div className="tot"><span>Priced by the metre, drawn by the plant</span><b className="!text-[15px]">reprice</b></div>
      </div>
    )
  }
  if (mo.kind === 'left_out') {
    return (
      <div className="math">
        <span>Sum of its rows</span><span /><b>{m.money(v('sum_of_rows'))}</b>
        <span>Its subtotal</span><span className="mono text-[12px]">{String(n.formula ?? '')}</span><b>{m.money(v('subtotal'))}</b>
        <div className="tot"><span>Left out: row {qty(v('row'))} {String(n.bill_text ?? '')}</span><b>{shownText(total, m.cur, m.rate)}</b></div>
      </div>
    )
  }
  if (c.category === 'price' && (mo.kind === 'over' || mo.kind === 'under')) {
    const t = m.times(mo.n!, mo.unit!)
    return (
      <div className="math">
        <span>The bill’s rate</span><span /><b>{m.money(v('bill_price') ?? v('unit_price'))}</b>
        <span>Your list, {String(n.aligned_to ?? '')}</span><span /><b>{m.range(v('list_low'), v('list_high'))}</b>
        <span>{mo.kind === 'over' ? 'Over the top' : 'Under the low end'}</span><span>{qty(mo.n)} × {t.unit}</span><b>{t.total}</b>
        <div className="tot"><span>{mo.kind === 'over' ? 'Over your price list' : 'Under your price list'}</span><b>{mo.kind === 'under' ? '−' : ''}{shownText(total, m.cur, m.rate)}</b></div>
      </div>
    )
  }
  if (mo.kind === 'over' || mo.kind === 'under') {
    const t = m.times(mo.n!, mo.unit!)
    const needed = v('needed')
    return (
      <div className="math">
        {mo.kind === 'over' ? (
          <><span>Billed, not drawn</span><span>{qty(v('bill_qty'))} − {qty(v('drawn_qty'))}</span><b>{qty(mo.n)} {unitName}</b></>
        ) : (
          <><span>Needed</span><span>{qty(v('drawn_m2'))} m² × {qty(v('schedule_per_m2'))}/m²</span><b>{qty(needed)}</b>
            <span>Billed</span><span /><b>{qty(v('bill_qty'))}</b></>
        )}
        <span>At the bill’s rate</span><span>{m.cur === 'usd' ? `NT$${fmt(mo.unit, 0)}` : ''}</span><b>× {t.unit}</b>
        <div className="tot"><span>{mo.kind === 'over' ? 'Over-billed' : 'Under-billed'}</span><b>{mo.kind === 'under' ? '−' : ''}{t.total}</b></div>
      </div>
    )
  }
  if (mo.kind === 'confirm') {
    return (
      <div className="math">
        <span>The bill says</span><span /><b>‘{String(n.bill_text ?? '')}’</b>
        <span>Aligned to</span><span>by Muse Spark</span><b>{String(n.aligned_to ?? '')} {String(n.drawn_name ?? '')}</b>
        <div className="tot"><span>Confidence</span><b className="!text-ink">{fmt(v('align_confidence') ?? v('confidence'), 2)}</b></div>
      </div>
    )
  }
  return <div className="text-ink-2">{m.text(c.why)}</div>
}
