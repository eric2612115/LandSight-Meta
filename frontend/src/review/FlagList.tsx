/** B's left pane: the package tree, then every flag grouped by scenario with the group's line, filters, and the pin
 * number each flag has on the sheet shown. */
import { useState } from 'react'
import { inFilter, useCounts, useTotals } from '../app/derive'
import { upto, useShow } from '../app/show'
import { useDecisions, useUI, type Filter } from '../app/state'
import { sheetState, shownMoney, shownText, type Flag } from '../lib/flags'
import { fmt } from '../lib/format'
import { useMoney } from '../lib/money'
import { packageGroups } from '../lib/pkg'
import { CATCHES, SCENARIO_NAME, type Scenario } from '../lib/scenario'
import type { Run } from '../lib/types'

const hasMoney = (f: Flag) => f.money.kind === 'over' || f.money.kind === 'under' || f.money.kind === 'left_out'

type Props = { run: Run; flags: Flag[]; pinNo: Record<string, number>; onSelect: (f: Flag) => void; onSheet: (id: string) => void; sheetId?: string }

export function FlagList({ run, flags, pinNo, onSelect, onSheet, sheetId }: Props) {
  const ui = useUI()
  const d = useDecisions((s) => s.d)
  const c = useCounts(run)
  const totals = useTotals(run)
  const m = useMoney(run.currency)
  const rowsShown = useShow((s) => s.rows)
  const t = run.timing as Run['timing'] & { mode?: string; recorded?: boolean }

  const views: [Filter, string, number][] = [['need', 'Need you', c.need], ['noted', 'Noted', c.noted], ['confirmed', 'Confirmed', c.confirmed], ['all', 'All', c.all]]
  const groups: Scenario[] = ui.filter === 'need' || ui.filter === 'confirmed' ? [...CATCHES] : [...CATCHES, 'info']
  const shown = (f: Flag) => inFilter(f, ui.filter, d[f.id]?.state)
  const money = (f: Flag) => shownText(shownMoney(f.money, m.cur, m.rate), m.cur, m.rate)
  const g = totals.greening?.numbers as Record<string, number> | undefined

  const summary = (s: Scenario, all: Flag[]) => {
    const alarms = all.filter((f) => f.alarm)
    if (s === 'quote') return <><i>{alarms.length}</i>{shownText(totals.queried, m.cur, m.rate)} queried of {shownText(totals.bill, m.cur, m.rate)}</>
    if (s === 'regulation') return <><i>{alarms.length}</i>{g ? `Art. 302: ${fmt(g.provided, 1)} of ${fmt(g.required, 1)} kgCO₂e/yr` : 'regulations'}</>
    if (s === 'design') {
      const pending = alarms.filter((f) => run.items.some((it) => !it.agreed && !it.confirmed && it.spark?.object_id && (f.check.evidence.object_ids ?? []).length === 1 && f.check.evidence.object_ids![0] === it.spark.object_id)).length
      return <><i>{alarms.length}</i>{pending ? `${pending} needs your confirmation` : 'drawing against drawing'}</>
    }
    if (s === 'format') return <><i>{alarms.length}</i>{all.length} verdicts, {alarms.length ? `${alarms.length} for you` : 'nothing for you'} {ui.expanded.format ? '▾' : '▸'}</>
    return <><i>{all.length}</i>agreements and notes</>
  }

  let index = 0
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden bg-pane">
      <div className="ph">Package <span className="r">{run.package.file_count} files · run {run.run_id.slice(0, 8)} · {t.mode ?? 'fixtures'}{t.recorded === false ? '' : ', recorded'}</span></div>
      <PackageTree run={run} sheetId={sheetId} onSheet={onSheet} />
      <div className="fh">
        Flags
        <div className="views">
          {views.map(([k, label, n]) => (
            <button key={k} className={ui.filter === k ? 'on' : ''} onClick={() => ui.set({ filter: k })}>{label} {n}</button>
          ))}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-2">
        {groups.map((s) => {
          const all = flags.filter((f) => f.scenario === s)
          const open = ui.expanded[s] ?? false
          const rows = all.filter((f) => shown(f) || (open && s === 'format'))
          if (!all.length) return null
          return (
            <div key={s}>
              <div className={`g ${s === 'format' ? 'cursor-pointer' : ''}`} onClick={s === 'format' ? () => ui.set({ expanded: { ...ui.expanded, format: !open } }) : undefined}>
                {SCENARIO_NAME[s]} <span className="r">{summary(s, all)}</span>
              </div>
              {rows.map((f) => {
                const i = index++
                if (i >= upto(rowsShown, Infinity)) return null
                const st = d[f.id]?.state
                const glyph = st === 'confirmed' ? 'ok' : !f.alarm ? 'info' : f.check.severity === 'fail' ? 'fail' : f.check.severity === 'review' ? 'rev' : ''
                const n = pinNo[f.id]
                return (
                  <div key={f.id} data-flag={f.id} className={`f ${ui.selected === f.id ? 'sel' : ''} ${st === 'confirmed' ? 'done' : ''} ${st === 'dismissed' ? 'gone' : ''}`}
                    onClick={() => onSelect(f)} title={f.check.title}>
                    <span className={`sv ${glyph}`}>{glyph === 'ok' ? '✓' : ''}</span>
                    <span>{n ? <span className={`pn ${st === 'confirmed' ? 'ink' : ''}`}>{n}</span> : null}</span>
                    <span className="id">{f.id}</span>
                    <span className="t flex min-w-0"><span className="min-w-0 overflow-hidden text-ellipsis">{m.text(f.check.title)}</span>{hasMoney(f) && <span className="flex-none">&nbsp;— {money(f)}</span>}</span>
                    <span className="w">{f.where}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
        {ui.filter === 'confirmed' && c.confirmed === 0 && (
          <p className="px-4 py-3 text-ink-3">Nothing confirmed yet. Confirm a flag on the sheet or in the dock; confirmed flags make the query letter.</p>
        )}
      </div>
    </aside>
  )
}

function PackageTree({ run, sheetId, onSheet }: { run: Run; sheetId?: string; onSheet: (id: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ drawings: true })
  const groups = packageGroups(run)
  const sheetOf = (fid: string) => run.sheets.find((s) => s.file_id === fid && s.source !== 'pdf_vector' && s.source !== 'pdf_raster')
  return (
    <div className="tree flex-none border-b border-line pb-1.5 pt-1">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="n" onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>
            <span className="c">{open[g.id] ? '▾' : '▸'}</span><span>{g.name}</span><span className="r">{g.summary}</span>
          </div>
          {open[g.id] && g.id === 'drawings' && <DrawingRows run={run} sheetId={sheetId} onSheet={onSheet} />}
          {open[g.id] && g.id !== 'drawings' && g.files.map((f) => {
            const s = sheetOf(f.file_id)
            return (
              <div key={f.file_id} className={`n child ${s && s.sheet_id === sheetId ? 'on' : ''}`} onClick={() => s && onSheet(s.sheet_id)}>
                <span className="c" /><span className="overflow-hidden text-ellipsis whitespace-nowrap pr-3">{f.name}</span><span className="r">{f.why.split(/[:;]/)[0]}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Measured and superseded drawings each on a line; the ones read but not counted on one line, as B sets them. */
function DrawingRows({ run, sheetId, onSheet }: { run: Run; sheetId?: string; onSheet: (id: string) => void }) {
  const dxf = run.sheets.filter((s) => s.source === 'dxf' || s.source === undefined)
  const lead = dxf.filter((s) => s.counted || /superseded/i.test(s.not_counted_reason ?? ''))
  const rest = dxf.filter((s) => !lead.includes(s))
  const name = (sid: string) => run.files.find((f) => f.file_id === run.sheets.find((s) => s.sheet_id === sid)?.file_id)?.name ?? sid
  return (
    <>
      {lead.map((s) => {
        const st = sheetState(run, s)
        return (
          <div key={s.sheet_id} className={`n child ${s.sheet_id === sheetId ? 'on' : ''}`} onClick={() => onSheet(s.sheet_id)}>
            <span className="c" /><span>{name(s.sheet_id)}</span><span className={`r ${st.includes('governs') ? 'b' : ''}`}>{st}</span>
          </div>
        )
      })}
      {rest.length > 0 && (
        <div className="n child">
          <span className="c" />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap pr-3">
            {rest.map((s, i) => (
              <span key={s.sheet_id}>
                {i > 0 && ', '}
                <button className={`cursor-pointer border-0 bg-transparent p-0 ${s.sheet_id === sheetId ? 'font-medium text-ink' : 'text-ink-2'} hover:text-ink`} onClick={() => onSheet(s.sheet_id)}>{s.number}</button>
              </span>
            ))}
          </span>
          <span className="r">read, not counted</span>
        </div>
      )}
    </>
  )
}
