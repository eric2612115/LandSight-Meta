/** /prices — the firm's own installed rates, edited in place (code, name, spec, unit, low, high, basis, source).
 * GET /api/price-list and PUT /api/price-list/{code} on the live backend; the next review prices the bill against them. */
import { useState } from 'react'
import { useFlags } from '../app/derive'
import { useNav, useUI } from '../app/state'
import { shownMoney, shownText } from '../lib/flags'
import { useMoney } from '../lib/money'
import { usePriceList, useSavePrice, validate, type PriceRow } from '../lib/prices'
import type { Run } from '../lib/types'

const FIELDS = ['code', 'name', 'spec', 'unit', 'low', 'high', 'basis', 'source'] as const
type Field = (typeof FIELDS)[number]

export function Prices({ run }: { run?: Run }) {
  const list = usePriceList()
  const save = useSavePrice()
  const m = useMoney(run?.currency)
  const [draft, setDraft] = useState<Record<string, Partial<Record<Field, string>>>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<Partial<Record<Field, string>> | null>(null)
  const hi = useUI((s) => s.hi)

  const value = (r: PriceRow, k: Field) => draft[r.code]?.[k] ?? String(r[k] ?? '')
  const commit = (r: PriceRow, k: Field) => {
    const raw = draft[r.code]?.[k]
    if (raw === undefined || raw === String(r[k] ?? '')) return
    const edit = { code: r.code, [k]: k === 'low' || k === 'high' ? Number(raw.replace(/,/g, '')) : raw }
    const bad = validate(list.rows, edit)
    if (bad) return setErrors({ ...errors, [r.code]: bad })
    save.mutate(edit, {
      onSuccess: () => {
        setErrors((e) => ({ ...e, [r.code]: '' }))
        setSaved((s) => ({ ...s, [r.code]: k }))
        setDraft((d) => ({ ...d, [r.code]: { ...d[r.code], [k]: undefined } }))
      },
      onError: (e) => setErrors((x) => ({ ...x, [r.code]: String((e as Error).message) })),
    })
  }
  const add = () => {
    if (!adding) return
    const e = { code: (adding.code ?? '').trim(), name: adding.name, spec: adding.spec ?? '', unit: adding.unit ?? '', low: Number(adding.low), high: Number(adding.high), basis: adding.basis ?? 'firm', source: adding.source ?? '' }
    const bad = validate(list.rows, e)
    if (bad) return setErrors({ ...errors, __new: bad })
    save.mutate(e, { onSuccess: () => { setAdding(null); setErrors((x) => ({ ...x, __new: '' })); setSaved((s) => ({ ...s, [e.code]: 'added' })) }, onError: (er) => setErrors((x) => ({ ...x, __new: String((er as Error).message) })) })
  }

  return (
    <div className="grid h-[1004px] gap-px bg-line" style={{ gridTemplateColumns: '1fr 520px' }}>
      <section className="flex min-h-0 flex-col bg-pane">
        <div className="flex items-baseline justify-between border-b border-line px-6 pb-3 pt-5">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Your price list</h1>
            <div className="mt-1 text-ink-2">Installed rates in NT$, excluding tax{m.cur === 'usd' ? `; USD beside them at NT$${run?.currency?.twd_per_usd ?? ''}` : ''}. Click a cell to edit; Enter or leaving the cell saves it.</div>
          </div>
          <span className="text-ink-3">{list.live ? 'landsight.db · GET /api/price-list' : 'recorded mock · edits stay in this browser tab'}</span>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4">
          <table className="plist w-full border-collapse">
            <thead><tr><th style={{ width: 70 }}>Code</th><th>Item</th><th>Spec</th><th style={{ width: 70 }}>Unit</th><th className="!text-right" style={{ width: 96 }}>Low NT$</th><th className="!text-right" style={{ width: 96 }}>High NT$</th>{m.cur === 'usd' && <th className="!text-right" style={{ width: 100 }}>USD</th>}<th style={{ width: 150 }}>Basis</th><th>Source</th><th style={{ width: 120 }} /></tr></thead>
            <tbody>
              {list.rows.map((r) => {
                const lit = hi?.code === r.code
                return (
                  <tr key={r.code} className={`${saved[r.code] || lit ? 'edited' : ''} ${errors[r.code] ? 'bad' : ''}`}>
                    {FIELDS.map((k) => (
                      <td key={k}>
                        <input className={`cellin ${k === 'low' || k === 'high' ? 'num' : ''} ${k === 'code' ? 'code' : ''}`} value={value(r, k)} readOnly={k === 'code'}
                          onChange={(e) => setDraft({ ...draft, [r.code]: { ...draft[r.code], [k]: e.target.value } })}
                          onBlur={() => commit(r, k)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                      </td>
                    )).flatMap((td, i) => (i === 5 && m.cur === 'usd' ? [td, <td key="usd" className="mono pr-2 text-right text-ink-3">{m.range(r.low, r.high)}</td>] : [td]))}
                    <td className="st">{errors[r.code] ? <span className="text-ink">{errors[r.code]}</span> : saved[r.code] ? `saved ${saved[r.code]}` : r.updated_at?.slice(0, 10)}</td>
                  </tr>
                )
              })}
              {adding && (
                <tr className="edited">
                  {FIELDS.map((k) => (
                    <td key={k}><input className={`cellin ${k === 'low' || k === 'high' ? 'num' : ''}`} placeholder={k} value={adding[k] ?? ''} onChange={(e) => setAdding({ ...adding, [k]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} /></td>
                  )).flatMap((td, i) => (i === 5 && m.cur === 'usd' ? [td, <td key="usd" />] : [td]))}
                  <td className="st"><button className="btn primary" onClick={add}>Add</button></td>
                </tr>
              )}
            </tbody>
          </table>
          {errors.__new && <p className="px-2 py-2 text-ink">{errors.__new}</p>}
          <div className="flex items-center gap-3 px-2 py-3">
            <button className="btn" onClick={() => setAdding(adding ? null : { basis: 'firm' })}>{adding ? 'Cancel' : '+ Add a row'}</button>
            <span className="text-ink-2">A rate the server refuses (low above high, not a number) is shown on its row; nothing else changes.</span>
          </div>
        </div>
        <div className="border-t border-line bg-hover px-6 py-3 text-ink-2">
          The next review uses the edited rates: open the package again and the bill is priced against this list. A price flag can disappear — the scoreboard then reports the planted error as missed, honestly.
        </div>
      </section>
      {run ? <Used run={run} rows={list.rows} /> : <aside className="bg-hover" />}
    </div>
  )
}

/** What this review flagged against the list, and the rows it priced. */
function Used({ run, rows }: { run: Run; rows: PriceRow[] }) {
  const flags = useFlags(run)
  const m = useMoney(run.currency)
  const go = useNav((s) => s.go)
  const ui = useUI()
  const priced = flags.filter((f) => f.check.category === 'price' && f.check.numbers && f.check.numbers.row !== undefined)
  return (
    <aside className="stmt scroll-thin min-h-0 overflow-y-auto bg-hover px-7 py-6">
      <h2 className="!mt-0">This review against your list</h2>
      <table className="pr">
        <tbody>
          {priced.map((f) => {
            const n = (f.check.numbers ?? {}) as Record<string, number | string>
            const row = rows.find((r) => r.code === n.aligned_to)
            return (
              <tr key={f.id} className="cursor-pointer hover:bg-pane" onClick={() => { ui.set({ selected: f.id }); go('review') }}>
                <td><span className="mono mr-2 text-ink-3">{f.id}</span>{String(n.drawn_name ?? n.bill_text ?? f.check.title)}</td>
                <td>{m.money(Number(n.bill_price ?? n.unit_price))} vs {row ? m.range(row.low, row.high) : m.range(Number(n.list_low), Number(n.list_high))}</td>
                <td className={f.alarm ? 'text-ink' : 'text-ink-3'}>{f.money.kind === 'over' || f.money.kind === 'under' ? shownText((f.money.kind === 'under' ? -1 : 1) * shownMoney(f.money, m.cur, m.rate), m.cur, m.rate, true) : 'inside'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-ink-2">Rates edited here change these lines on the next review, not this one: the Run is a record of what was read and priced when it ran.</p>
      <h2>Where the rates come from</h2>
      <p className="mt-2 text-ink-2">Each row names its basis: a published public budget (P-codes) or a sample rate with no direct source. They are the firm’s own numbers; Landsight never invents a rate.</p>
    </aside>
  )
}
