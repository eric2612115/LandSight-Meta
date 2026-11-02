/** /statement — C's board: the reconciliation (the bill as submitted, as the drawings support it), every flag by
 * scenario with found / expected / Δ / state, the scoreboard, Art. 302, the sheets, and the exports. */
import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useCounts, useFlags, useTotals } from '../app/derive'
import { upto, useShow } from '../app/show'
import { useDecisions, useNav, useUI } from '../app/state'
import { Pulse } from '../shell/Shell'
import { filmSheets, shownText, sheetCaption, type Flag } from '../lib/flags'
import { fmt, num } from '../lib/format'
import { useMoney } from '../lib/money'
import { latestBill } from '../lib/pkg'
import { CATCHES, SCENARIO_BLURB, SCENARIO_NAME, scenarioSlices } from '../lib/scenario'
import { flagsCsv, ledgerRow, openHtml, queryLetterHtml, saveText, statementHtml, statementOf, type Fmt, type StmtLine } from '../lib/statement'
import type { Run } from '../lib/types'

export function StatementScreen({ run }: { run: Run }) {
  const flags = useFlags(run)
  const m = useMoney(run.currency)
  const d = useDecisions((s) => s.d)
  const notes = useDecisions((s) => s.notes)
  const c = useCounts(run)
  const totals = useTotals(run)
  const sh = useShow()
  const go = useNav((s) => s.go)
  const ui = useUI()
  const f: Fmt = { cur: m.cur, rate: m.rate, money: m.money, text: m.text }
  const s = useMemo(() => statementOf(run, flags, { cur: m.cur, rate: m.rate, money: m.money, text: m.text }), [run, flags, m.cur, m.rate, m.money, m.text])
  const t = sh.count ?? 1
  const tx = (v: number, sign = false) => shownText(v * t, m.cur, m.rate, sign)
  const open = (x?: Flag) => {
    if (!x) return
    ui.set({ selected: x.id, ...(x.sheetIds[0] ? { sheetId: x.sheetIds[0] } : {}) })
    go('review')
  }
  const lb = latestBill(run)
  const g = totals.greening?.numbers as Record<string, number> | undefined
  const ctx = { run, flags, d, notes, f }

  return (
    <div className="flex h-[1004px] flex-col bg-pane">
      <div className="flex h-[40px] flex-none items-center justify-between border-b border-line bg-hover px-5 text-ink-2">
        <span>Governing bill <b className="font-medium text-ink">{lb?.name}</b> · sum of rows <b className="mono font-medium text-ink">{tx(s.bill)}</b> · {run.files.filter((x) => x.verdict === 'bill').length} versions read · governing drawings <b className="font-medium text-ink">{run.sheets.filter((x) => x.counted).map((x) => `${x.number}${x.revision && x.number === 'L-1' ? ` Rev ${x.revision}` : ''}`).join(' · ')}</b></span>
        <span>{m.cur === 'usd' ? `1 USD = NT$${fmt(run.currency?.twd_per_usd, 3)} (${run.currency?.as_of})` : 'NT$, as stored'} · your price list</span>
      </div>
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '1140px 1fr' }}>
        <section className="stmt scroll-thin min-h-0 overflow-y-auto px-8 py-6">
          <h1>Statement — what the bill says, what the drawings support</h1>
          <div className="lead">{lb?.name} against {run.sheets.filter((x) => x.counted).map((x) => x.number).join(', ')} and your installed price list · {m.cur === 'usd' ? `USD at NT$${fmt(run.currency?.twd_per_usd, 3)}` : 'NT$'} · every line is a flag you can open on the review</div>
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: 64 }} /><col /><col style={{ width: 230 }} /><col style={{ width: 120 }} /></colgroup>
            <tbody>
              <tr><td className="id" /><td className="t font-medium">Bill as submitted<small>sum of its rows</small></td><td className="calc" /><td className="m">{tx(s.bill)}</td></tr>
              {s.subtotal && <Line l={s.subtotal} aside onOpen={open} />}
              <Sub text="Less: billed, not drawn" lines={s.lessNotDrawn} sign="−" onOpen={open} t={t} f={f} d={d} />
              <Sub text="Less: rate above your installed list" lines={s.lessRate} sign="−" onOpen={open} t={t} f={f} d={d} />
              <Sub text="Plus: under-billed against the drawing or your list" lines={s.plus} sign="+" onOpen={open} t={t} f={f} d={d} />
              <Sub text="To reprice" lines={s.reprice} sign="" onOpen={open} t={t} f={f} d={d} />
              <tr className="tot"><td className="id" /><td className="t">Bill as the drawings support it<small>before the hedge is repriced</small></td><td className="calc">{s.calc}</td><td className="m">{tx(s.supported)}</td></tr>
              {s.also.length > 0 && <tr className="sub"><td colSpan={4}>Also in the package</td></tr>}
              {s.also.map((l) => <Line key={l.id + l.title} l={l} aside onOpen={open} />)}
            </tbody>
          </table>

          <h2 className="!mt-7">Every flag, by scenario</h2>
          <table className="ledger" style={{ tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: 64 }} /><col style={{ width: 330 }} /><col /><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col style={{ width: 80 }} /></colgroup>
            <thead><tr><th>ID</th><th>Flag</th><th>Basis</th><th className="r">Found</th><th className="r">Expected</th><th className="r">Δ</th><th>State</th></tr></thead>
            <tbody>
              {CATCHES.map((sc) => {
                const rows = flags.filter((x) => x.scenario === sc && x.alarm)
                const all = flags.filter((x) => x.scenario === sc)
                return (
                  <ScenarioRows key={sc} name={SCENARIO_NAME[sc]} blurb={SCENARIO_BLURB[sc]} count={rows.length} all={all.length} rows={rows} run={run} f={f} d={d} onOpen={open} />
                )
              })}
            </tbody>
          </table>
        </section>

        <aside className="stmt scroll-thin min-h-0 overflow-y-auto border-l border-line bg-hover px-7 py-6">
          <Scoreboard run={run} flags={flags} d={d} />
          <h2>Greening, Art. 302</h2>
          {g && totals.greening ? (
            <table className="pr">
              <tbody>
                <tr><td>Required<span className="bar"><i style={{ width: '100%' }} /></span></td><td>0.5 × {fmt(g.A_prime, 0)} m² × {fmt(g.beta, 2)}</td><td>{fmt(g.required, 1)}</td></tr>
                <tr><td>Provided, as drawn<span className="bar"><i style={{ width: `${Math.min(100, (g.provided / g.required) * 100)}%`, background: 'var(--color-ink)' }} /></span></td><td>{fmt(g.sum_gi_ai, 1)} × α {fmt(g.alpha, 1)}</td><td>{fmt(g.provided, 1)}</td></tr>
                {(totals.greening.fixes ?? []).slice(0, 3).map((x) => (
                  <tr key={x.label}><td className="overflow-hidden text-ellipsis" style={{ maxWidth: 380 }} title={x.label}>Fix {x.id ?? ''} · {x.label.replace(/, the same species/, '').replace(/, a second native species.*$/, '')}</td><td>{x.passes ? 'passes' : 'short'}</td><td className="text-blue">{fmt(num(x.result), 1)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-ink-2">No greening check in this run.</p>}
          <h2>By sheet</h2>
          <BySheet run={run} flags={flags} />
          <h2>Export</h2>
          <div className="mt-3 grid gap-2">
            <button className={`btn relative ${c.confirmed ? 'primary' : 'off'}`} disabled={!c.confirmed} onClick={() => openHtml(queryLetterHtml(ctx))}>
              {c.confirmed ? `Query letter to the developer — ${c.confirmed} confirmed ${c.confirmed === 1 ? 'flag' : 'flags'}` : 'Query letter to the developer — needs confirmed flags'}
              {sh.pulse === 'letter' && <Pulse />}
            </button>
            <button className="btn" onClick={() => openHtml(statementHtml(ctx, s))}>Printable statement (HTML)</button>
            <button className="btn" onClick={() => saveText(`landsight-${run.run_id.slice(0, 8)}-flags.csv`, flagsCsv(ctx))}>Flags with evidence (CSV)</button>
          </div>
        </aside>
      </div>
      <div className="cbar">
        <div className="l">
          <span>Bill <b>{tx(s.bill)}</b></span>
          <span>Queried <b>{tx(totals.queried)}</b>{s.bill ? ` · ${fmt((totals.queried / s.bill) * 100, 1)}%` : ''}</span>
          <span>Under-billed <b>{tx(totals.under)}</b></span>
          {g && <span>Art. 302 <b>{fmt(g.provided, 1)} / {fmt(g.required, 1)}</b></span>}
          <span>Confirmed <b>{c.confirmed} of {c.alarms}</b></span>
        </div>
        <div className="l"><span>Export is built from confirmed flags and your notes</span></div>
      </div>
    </div>
  )
}

function Line({ l, aside, onOpen }: { l: StmtLine; aside?: boolean; onOpen: (x?: Flag) => void }) {
  return (
    <tr className={`${aside ? 'aside' : ''} ${l.flag ? 'link' : ''}`} onClick={() => onOpen(l.flag)}>
      <td className="id">{l.id}</td><td className="t">{l.title}<small>{l.small}</small></td><td className="calc">{l.calc}</td><td className="m q">{l.text}</td>
    </tr>
  )
}

function Sub({ text, lines, sign, onOpen, t, f, d }: { text: string; lines: StmtLine[]; sign: string; onOpen: (x?: Flag) => void; t: number; f: Fmt; d: Record<string, { state: string }> }) {
  if (!lines.length) return null
  return (
    <>
      <tr className="sub"><td colSpan={4}>{text}</td></tr>
      {lines.map((l) => (
        <tr key={l.id} className={`link ${d[l.id]?.state === 'confirmed' ? 'done' : ''}`} onClick={() => onOpen(l.flag)}>
          <td className="id">{l.id}{d[l.id]?.state === 'confirmed' ? ' ✓' : ''}</td><td className="t">{l.title}<small>{l.small}</small></td><td className="calc">{l.calc}</td>
          <td className={`m ${l.value === undefined ? 'q' : ''}`}>{l.value !== undefined ? `${sign}${shownText(l.value * t, f.cur, f.rate)}` : l.text}</td>
        </tr>
      ))}
    </>
  )
}

function ScenarioRows({ name, blurb, count, all, rows, run, f, d, onOpen }: { name: string; blurb: string; count: number; all: number; rows: Flag[]; run: Run; f: Fmt; d: Record<string, { state: string }>; onOpen: (x?: Flag) => void }) {
  return (
    <>
      <tr className="grp"><td colSpan={7}>{name}<span>{blurb}</span><span className="float-right !ml-0">{count} need you · {all - count} noted</span></td></tr>
      {rows.map((x) => {
        const r = ledgerRow(run, x, f)
        const st = d[x.id]?.state ?? (x.check.severity === 'fail' ? 'fail' : x.check.severity === 'review' ? 'review' : 'open')
        return (
          <tr key={x.id} className="link" onClick={() => onOpen(x)}>
            <td className="id">{x.id}</td>
            <td className="t" title={x.check.title}>{f.text(x.check.title)}</td>
            <td className="b overflow-hidden text-ellipsis" title={r.basis}>{r.basis}</td>
            <td className="n">{r.found}</td><td className="n">{r.expected}</td>
            <td className={`d ${r.q ? 'q' : ''}`}>{r.delta}</td>
            <td className={`st ${st === 'fail' ? 'fail' : st === 'confirmed' ? 'ok' : ''}`}>{st}</td>
          </tr>
        )
      })}
    </>
  )
}

function Scoreboard({ run, flags, d }: { run: Run; flags: Flag[]; d: Record<string, { state: string }> }) {
  const sh = useShow()
  const slices = scenarioSlices(run)
  const e = run.errors
  const rows = CATCHES.map((sc) => {
    const mine = flags.filter((x) => x.scenario === sc)
    const alarms = mine.filter((x) => x.alarm)
    return { sc, need: alarms.filter((x) => !d[x.id]).length, confirmed: alarms.filter((x) => d[x.id]?.state === 'confirmed').length, dismissed: alarms.filter((x) => d[x.id]?.state === 'dismissed').length, noted: mine.length - alarms.length, slice: slices[sc] }
  })
  const shown = upto(sh.score, rows.length + 2)
  const sum = (k: 'need' | 'confirmed' | 'dismissed' | 'noted') => rows.reduce((a, r) => a + r[k], 0) + (k === 'noted' ? flags.filter((x) => x.scenario === 'info').length : 0)
  return (
    <>
      <h2 className="!mt-0">Flags by scenario</h2>
      <table className="pr">
        <thead><tr><th>Scenario</th><th>Need you</th><th>Confirmed</th><th>Dismissed</th><th>Noted</th><th>Planted · found</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <motion.tr key={r.sc} initial={false} animate={{ opacity: i < shown ? 1 : 0 }} transition={{ duration: 0.3 }}>
              <td>{SCENARIO_NAME[r.sc]}</td><td>{r.need}</td><td>{r.confirmed}</td><td>{r.dismissed}</td><td>{r.noted}</td>
              <td>{r.slice.planted} · {r.slice.found.length}{r.slice.flagged.length ? ` + ${r.slice.flagged.length}` : ''}</td>
            </motion.tr>
          ))}
          <motion.tr className="all" initial={false} animate={{ opacity: rows.length < shown ? 1 : 0 }}>
            <td>All checks</td><td>{sum('need')}</td><td>{sum('confirmed')}</td><td>{sum('dismissed')}</td><td>{sum('noted')}</td><td>{e.planted} · {e.found.length}{e.flagged.length ? ` + ${e.flagged.length}` : ''}</td>
          </motion.tr>
        </tbody>
      </table>
      <motion.p className="mt-2 text-ink-2" initial={false} animate={{ opacity: rows.length + 1 < shown ? 1 : 0 }}>
        Answer key, sample package only: <b className="font-medium text-ink">planted {e.planted} · found {e.found.length} · flagged {e.flagged.length} · missed {e.missed.length} · false alarms {e.false_alarms.length}</b>
        {e.flagged.length ? <> · flagged for review: {e.flagged.join(', ')}</> : null}
      </motion.p>
    </>
  )
}

function BySheet({ run, flags }: { run: Run; flags: Flag[] }) {
  const sheets = filmSheets(run)
  const n = (sid: string) => flags.filter((x) => x.alarm && (x.check.evidence.sheet_ids ?? []).includes(sid)).length
  const withFlags = sheets.filter((s) => n(s.sheet_id) > 0).sort((a, b) => n(b.sheet_id) - n(a.sheet_id))
  const rest = sheets.filter((s) => !withFlags.includes(s))
  return (
    <ul className="m-0 list-none p-0">
      {withFlags.map((s) => (
        <li key={s.sheet_id} className="grid h-[30px] items-center gap-3 border-b border-line-2 text-ink-2" style={{ gridTemplateColumns: '48px 1fr auto' }}>
          <div className="h-[24px] overflow-hidden border border-line bg-paper"><img src={s.png_url} alt="" className="h-full w-full object-cover" /></div>
          <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"><b className="font-medium text-ink">{s.number} {s.title}{s.revision && sheets.filter((x) => x.number === s.number).length > 1 ? ` Rev ${s.revision}` : ''}</b> · {s.counted ? 'measured' : s.not_counted_reason?.split(/[:(]/)[0]}</div>
          <i className="mono not-italic font-medium text-blue">{n(s.sheet_id)}</i>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="grid h-[30px] items-center gap-3 text-ink-2" style={{ gridTemplateColumns: '48px 1fr auto' }}>
          <div className="h-[24px] overflow-hidden border border-line bg-paper opacity-50"><img src={rest[0].png_url} alt="" className="h-full w-full object-cover" /></div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap"><b className="font-medium text-ink">{rest.map((s) => sheetCaption(run, s).no).join(', ')}</b> · read, not counted</div><i />
        </li>
      )}
    </ul>
  )
}
