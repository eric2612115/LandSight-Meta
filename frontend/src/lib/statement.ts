/** C's Statement as data: the reconciliation lines (bill as submitted → as the drawings support it) and one ledger
 * row per flag (basis · found · expected · Δ), plus the three exports built from them. */
import type { Decision } from '../app/state'
import { moneyOf, nums, shownMoney, shownText, type Flag } from './flags'
import { fmt, num, qty } from './format'
import { formatRange, moneyInText, type Currency, type Rate } from './money'
import { latestBill } from './pkg'
import { SCENARIO_NAME } from './scenario'
import type { Run } from './types'

export type Fmt = { cur: Currency; rate?: Rate | null; money: (twd: number | undefined | null) => string; text: (s: string) => string }

export type StmtLine = { flag?: Flag; id: string; title: string; small: string; calc: string; value?: number; text?: string }
export type Statement = {
  billName: string
  bill: number
  subtotal?: StmtLine
  lessNotDrawn: StmtLine[]
  lessRate: StmtLine[]
  plus: StmtLine[]
  reprice: StmtLine[]
  supported: number
  calc: string
  also: StmtLine[]
}

const tx = (v: number, f: Fmt, sign = false) => shownText(v, f.cur, f.rate, sign)

export function statementOf(run: Run, flags: Flag[], f: Fmt): Statement {
  const arith = flags.find((x) => x.check.category === 'arithmetic')
  const an = arith ? nums(arith.check) : {}
  const billTwd = num(an.sum_of_rows)
  const bill = billTwd !== undefined ? shownMoney({ kind: 'none', twd: billTwd }, f.cur, f.rate) : 0
  const quote = flags.filter((x) => x.scenario === 'quote' && x.alarm)
  const line = (x: Flag, small: string, calc: string): StmtLine => ({ flag: x, id: x.id, title: name(x), small, calc, value: shownMoney(x.money, f.cur, f.rate) })
  const times = (x: Flag) => {
    const m = x.money
    if (m.n === undefined || m.unit === undefined) return ''
    return `${qty(m.n)} × ${f.money(m.unit)}`
  }
  const lessNotDrawn = quote.filter((x) => x.money.kind === 'over' && x.money.group === 'quantity').map((x) => {
    const n = nums(x.check)
    return line(x, `bill ${qty(num(n.bill_qty))}, ${sheetOfFlag(run, x)} shows ${qty(num(n.drawn_qty))} · the plan governs`, times(x))
  })
  const lessRate = quote.filter((x) => x.money.kind === 'over' && x.money.group === 'rate').map((x) => {
    const n = nums(x.check)
    return line(x, `${f.money(num(n.bill_price) ?? num(n.unit_price))}/${unitOf(n)} billed · your list tops at ${f.money(num(n.list_high))}`, times(x))
  })
  const plus = quote.filter((x) => x.money.kind === 'under').map((x) => {
    const n = nums(x.check)
    const small = x.check.category === 'price'
      ? `${f.money(num(n.bill_price) ?? num(n.unit_price))} billed · your list starts at ${f.money(num(n.list_low))} — check the spec before accepting`
      : `${qty(num(n.bill_qty))} billed · ${qty(num(n.drawn_m2) ?? num(n.drawn_qty))} m² at the schedule’s ${qty(num(n.schedule_per_m2))}/m² needs ${qty(num(n.needed))}`
    return line(x, small, times(x))
  })
  const reprice = quote.filter((x) => x.money.kind === 'reprice').map((x) => {
    const n = nums(x.check)
    return { ...line(x, `billed ${qty(num(n.bill_qty))} ${String(n.bill_unit)} at ${f.money(num(n.unit_price))} · drawn ${qty(num(n.drawn_qty))} plants · priced per plant`, `${qty(num(n.bill_qty))} ${String(n.bill_unit)} → ${qty(num(n.drawn_qty))} plants`), value: undefined, text: `${f.money(num(n.amount))} today` }
  })
  const less = [...lessNotDrawn, ...lessRate].reduce((a, l) => a + (l.value ?? 0), 0)
  const add = plus.reduce((a, l) => a + (l.value ?? 0), 0)
  const also: StmtLine[] = []
  for (const x of quote.filter((y) => y.money.kind === 'which')) {
    const n = nums(x.check)
    also.push({ flag: x, id: x.id, title: x.check.title.replace(/ in BOQ.*$/, ''), small: 'ask which sheet the developer priced from', calc: `vs ${f.money(num(n.visible_total))} visible`, text: f.money(num(n.hidden_total)) })
  }
  const versions = run.checks.find((c) => c.category === 'revision' && (c.by ?? []).includes('bill'))
  if (versions) also.push({ id: versions.check_id, title: `${qty(num(versions.numbers?.versions))} versions of the bill`, small: f.text(versions.why.replace(/^Versions ordered by the date in each bill's heading: /, '')).slice(0, 150), calc: '', text: 'latest governs' })
  for (const q of run.files.filter((x) => x.verdict === 'quote')) {
    const amt = Number((q.why.match(/total(?:ling|ing)?\s+([\d,]+)/i)?.[1] ?? '').replace(/,/g, ''))
    also.push({ id: '', title: q.name, small: q.why.replace(/^quote:\s*/, '').split(/ totaling/)[0], calc: amt ? `NT$${amt.toLocaleString('en-US')}` : '', text: amt ? f.money(amt) : '' })
  }
  const lb = latestBill(run)
  return {
    billName: lb?.name ?? 'the bill',
    bill,
    subtotal: arith ? { flag: arith, id: arith.id, title: `Its own subtotal, ${String(an.formula ?? '')}`, small: `omits row ${qty(num(an.row))} ${String(an.bill_text ?? '')}, ${f.money(num(an.left_out))} — the bill does not add up`, calc: '', text: f.money(num(an.subtotal)) } : undefined,
    lessNotDrawn, lessRate, plus, reprice, also,
    supported: bill - less + add,
    calc: `${tx(bill, f)} − ${tx(less, f)} + ${tx(add, f)}`,
  }
}

const unitOf = (n: Record<string, unknown>) => (n.bill_unit === 'EA' ? 'plant' : String(n.bill_unit ?? n.unit ?? ''))
const name = (x: Flag) => String(nums(x.check).drawn_name ?? nums(x.check).bill_text ?? x.check.title).replace(/\s*\(PV-\d\)$/, '')
const sheetOfFlag = (run: Run, x: Flag) => {
  const s = run.sheets.find((y) => y.sheet_id === x.sheetIds[0])
  return s ? `${s.number}${s.revision && s.counted && run.sheets.filter((z) => z.number === s.number && z.source === s.source).length > 1 ? ` Rev ${s.revision}` : ''}` : 'the drawing'
}

/** One ledger row: what it was checked against, what was found, what was expected, the difference. */
export function ledgerRow(_run: Run, x: Flag, f: Fmt): { basis: string; found: string; expected: string; delta: string; q?: boolean } {
  const c = x.check
  const n = nums(c)
  const v = (k: string) => num(n[k])
  const m = moneyOf(c)
  const money = m.kind === 'over' || m.kind === 'under' || m.kind === 'left_out' ? tx((m.kind === 'under' ? -1 : 1) * shownMoney(m, f.cur, f.rate), f, true) : undefined
  const art = c.citation?.article.replace(/^Building Technical Regulations, Design and Construction Part, /, '').replace(/^Technical Specification for Building-Site Greening Design, /, 'Greening spec ').replace(/ Self-Government Ordinance/, ' ordinance')
  switch (c.category) {
    case 'arithmetic': return { basis: `Cell G20 · ${String(n.formula ?? '')}`, found: f.money(v('subtotal')), expected: f.money(v('sum_of_rows')), delta: money ?? '' }
    case 'price': return { basis: `Your installed list ${formatRange(v('list_low'), v('list_high'), f.cur, f.rate)}/${unitOf(n)}`, found: f.money(v('bill_price') ?? v('unit_price')), expected: m.kind === 'over' ? `≤ ${f.money(v('list_high'))}` : `≥ ${f.money(v('list_low'))}`, delta: money ?? '' }
    case 'units': return { basis: 'Drawn by the plant, billed by the metre', found: `${qty(v('bill_qty'))} ${String(n.bill_unit)}`, expected: `${qty(v('drawn_qty'))} pl`, delta: 'reprice', q: true }
    case 'bill':
      if (v('hidden_total') !== undefined) return { basis: 'Priced rows on a hidden sheet', found: f.money(v('hidden_total')), expected: f.money(v('visible_total')), delta: 'which?', q: true }
      return { basis: 'Muse Spark’s alignment of the bill’s name', found: fmt(v('align_confidence') ?? v('confidence'), 2), expected: '–', delta: 'confirm', q: true }
    case 'quantity':
      if (v('needed') !== undefined) return { basis: `Schedule asks ${qty(v('schedule_per_m2'))}/m² · ${qty(v('drawn_m2'))} m²`, found: qty(v('bill_qty')), expected: qty(v('needed')), delta: money ?? '' }
      if (v('bill_qty') !== undefined) return { basis: 'Plan governs (general note 1)', found: qty(v('bill_qty')), expected: qty(v('drawn_qty')), delta: money ?? '' }
      if (v('schedule') !== undefined) return { basis: 'Schedule against the plan · plan governs', found: qty(v('schedule')), expected: qty(v('drawn')), delta: `−${qty(v('difference'))}`, q: true }
      if (v('geometry') !== undefined) return { basis: `${qty(v('gaps'))} pieces, gaps to ${fmt(v('max_gap_m'), 2)} m · Spark ${fmt(v('confidence'), 2)}`, found: `${qty(v('geometry'))} closed`, expected: qty(v('spark')), delta: 'confirm', q: true }
      if (v('x') !== undefined) return { basis: `Centre (${qty(v('x'))}, ${qty(v('y'))}), outside the boundary`, found: 'outside', expected: 'inside', delta: '−1 tree', q: true }
      break
    case 'regulation':
      if (v('required') !== undefined && v('provided') !== undefined) return { basis: `0.5 × A′ ${qty(v('A_prime'))} m² × β ${fmt(v('beta'), 2)} · α ${fmt(v('alpha'), 1)}`, found: fmt(v('provided'), 1), expected: fmt(v('required'), 1), delta: fmt(v('provided')! - v('required')!, 1).replace('-', '−') }
      if (v('pit_area_m2') !== undefined) return { basis: `${art ?? 'Greening spec'} · L-6`, found: `${fmt(v('pit_area_m2'), 2)} m²`, expected: '4.0 m²', delta: 'Gi 1.5→1.0', q: true }
      if (v('zone_m2') !== undefined) return { basis: 'Art. 299 only if the architect declares it', found: 'in lane', expected: 'clear', delta: '−1 tree', q: true }
      break
    case 'protected_tree': return { basis: art ?? 'tree ordinance', found: `${fmt(v('dbh_m'), 2)} m`, expected: `≥ ${fmt(v('threshold_m'), 2)} m`, delta: 'protected?', q: true }
    case 'document': return { basis: 'Green Building Label checklist', found: `${qty(v('required_documents'))} documents`, expected: '1 report', delta: 'report', q: true }
    case 'scale': return { basis: 'Not measured: areas would read ×4', found: String(n.scale_title ?? ''), expected: String(n.scale_measured ?? ''), delta: `×${qty((v('factor') ?? 2) ** 2)}`, q: true }
    case 'area':
      if (v('overlap_m2') !== undefined) return { basis: 'The same ground counted twice', found: `${fmt(v('overlap_m2'), 0)} m²`, expected: '0', delta: 'which?', q: true }
      if (n.label_code) return { basis: `Legend keys ${String(n.hatch ?? '')} to ${String(n.hatch_code)}`, found: String(n.label_code), expected: String(n.hatch_code), delta: 'which?', q: true }
      break
    case 'sheet':
      if (v('listed') !== undefined) return { basis: 'The index against the sheets present', found: qty((v('listed') ?? 0) - (v('missing') ?? 0)), expected: qty(v('listed')), delta: `−${qty(v('missing'))} sheet`, q: true }
      break
  }
  return { basis: f.text(c.why.split(/[.;:]/)[0]).slice(0, 60), found: '–', expected: '–', delta: c.severity === 'info' ? 'noted' : 'ask', q: true }
}

/* ------------------------------------------------------------------ exports */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const csvCell = (s: unknown) => {
  const t = String(s ?? '')
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

type Ctx = { run: Run; flags: Flag[]; d: Record<string, Decision>; notes: Record<string, string>; f: Fmt }

export function flagsCsv({ run, flags, d, notes, f }: Ctx): string {
  const head = ['id', 'scenario', 'severity', 'state', 'title', 'where', 'basis', 'found', 'expected', 'delta', 'money_twd', `money_${f.cur}`, 'read_by', 'evidence_files', 'evidence_cells', 'citation', 'note', 'why']
  const rows = flags.map((x) => {
    const r = ledgerRow(run, x, f)
    const files = (x.check.evidence.file_ids ?? []).map((id) => run.files.find((y) => y.file_id === id)?.name ?? id).join('; ')
    return [x.id, x.scenario, x.check.severity, d[x.id]?.state ?? (x.alarm ? 'open' : 'noted'), f.text(x.check.title), x.where, r.basis, r.found, r.expected, r.delta,
      x.money.twd ? Math.round(x.money.twd) : '', x.money.twd ? shownMoney(x.money, f.cur, f.rate) : '', x.check.by.join(' '), files, (x.check.evidence.cells ?? []).join(' '),
      x.check.citation ? `${x.check.citation.article} ${x.check.citation.url}` : '', notes[x.id] ?? '', f.text(x.check.why)]
  })
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

const PAGE = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:13px/1.45 Inter,system-ui,sans-serif;color:#171a1e;margin:40px auto;max-width:880px;padding:0 24px}h1{font-size:22px;margin:0 0 4px}
.lead{color:#5c636d;margin:0 0 20px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eceef1;text-align:left;vertical-align:top}
td.r,th.r{text-align:right;font-family:'JetBrains Mono',monospace;white-space:nowrap}tr.sub td{background:#f5f6f8;color:#5c636d;font-weight:500}
tr.tot td{border-top:1px solid #171a1e;border-bottom:2px solid #171a1e;font-weight:600}small{color:#5c636d}h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#5c636d;border-bottom:1px solid #171a1e;padding-bottom:4px;margin-top:28px}
.q{margin:0 0 18px}.q b{display:block}.id{font-family:'JetBrains Mono',monospace;color:#2457ff}.foot{color:#8a919b;margin-top:28px;font-size:12px}@media print{body{margin:0}}</style></head><body>${body}</body></html>`

export function statementHtml(ctx: Ctx, s: Statement): string {
  const { run, f } = ctx
  const row = (l: StmtLine, sign: string) => `<tr><td class="id">${esc(l.id)}</td><td>${esc(l.title)} <small>${esc(l.small)}</small></td><td class="r">${esc(l.calc)}</td><td class="r">${l.value !== undefined ? sign + tx(l.value, f) : esc(l.text ?? '')}</td></tr>`
  const sub = (t: string) => `<tr class="sub"><td colspan="4">${esc(t)}</td></tr>`
  const body = `<h1>Statement — what the bill says, what the drawings support</h1>
<p class="lead">${esc(run.package.name)} · ${esc(s.billName)} against the governing drawings and your installed price list · ${f.cur === 'usd' ? `USD at NT$${fmt(run.currency?.twd_per_usd, 3)} (${run.currency?.as_of ?? ''})` : 'NT$'} · run ${esc(run.run_id)}</p>
<table><tr><td></td><td><b>Bill as submitted</b> <small>sum of its rows</small></td><td></td><td class="r"><b>${tx(s.bill, f)}</b></td></tr>
${s.subtotal ? `<tr><td class="id">${esc(s.subtotal.id)}</td><td>${esc(s.subtotal.title)} <small>${esc(s.subtotal.small)}</small></td><td></td><td class="r">${esc(s.subtotal.text ?? '')}</td></tr>` : ''}
${s.lessNotDrawn.length ? sub('Less: billed, not drawn') + s.lessNotDrawn.map((l) => row(l, '−')).join('') : ''}
${s.lessRate.length ? sub('Less: rate above your installed list') + s.lessRate.map((l) => row(l, '−')).join('') : ''}
${s.plus.length ? sub('Plus: under-billed against the drawing or your list') + s.plus.map((l) => row(l, '+')).join('') : ''}
${s.reprice.length ? sub('To reprice') + s.reprice.map((l) => row(l, '')).join('') : ''}
<tr class="tot"><td></td><td>Bill as the drawings support it <small>before the hedge is repriced</small></td><td class="r">${esc(s.calc)}</td><td class="r">${tx(s.supported, f)}</td></tr>
${s.also.length ? sub('Also in the package') + s.also.map((l) => row(l, '')).join('') : ''}</table>
<h2>Every flag</h2><table><tr><th>ID</th><th>Scenario</th><th>Flag</th><th class="r">Found</th><th class="r">Expected</th><th class="r">Δ</th><th>State</th></tr>
${ctx.flags.filter((x) => x.alarm).map((x) => { const r = ledgerRow(run, x, f); return `<tr><td class="id">${esc(x.id)}</td><td>${SCENARIO_NAME[x.scenario]}</td><td>${esc(f.text(x.check.title))}</td><td class="r">${esc(r.found)}</td><td class="r">${esc(r.expected)}</td><td class="r">${esc(r.delta)}</td><td>${ctx.d[x.id]?.state ?? 'open'}</td></tr>` }).join('')}</table>
<p class="foot">Landsight · every line is a check you can open on the review screen · prices stored in TWD, shown at one dated public rate.</p>`
  return PAGE(`Statement — ${run.package.name}`, body)
}

export function queryLetterHtml(ctx: Ctx): string {
  const { run, flags, d, notes, f } = ctx
  const mine = flags.filter((x) => d[x.id]?.state === 'confirmed')
  const lb = latestBill(run)
  const items = mine.map((x, i) => {
    const r = ledgerRow(run, x, f)
    const cite = x.check.citation ? `<br><small>${esc(x.check.citation.article)} — ${esc(x.check.citation.url)}</small>` : ''
    const where = [x.where, ...(x.check.evidence.cells ?? []).slice(0, 2).map((c) => c.replace(/^F-\d+:/, ''))].filter(Boolean).join(' · ')
    return `<div class="q"><b>${i + 1}. ${esc(f.text(x.check.title))} <span class="id">${esc(x.id)}</span></b>
${esc(f.text(x.check.why))}<br><small>${esc(where)} · found ${esc(r.found)}, expected ${esc(r.expected)}${r.delta ? ` · ${esc(r.delta)}` : ''}</small>${cite}
${notes[x.id] ? `<p><b>Our request:</b> ${esc(notes[x.id])}</p>` : ''}</div>`
  }).join('')
  const body = `<h1>Queries on the landscape package</h1>
<p class="lead">To: the developer · Re: ${esc(run.package.name)} · bill ${esc(lb?.name ?? '')} · ${mine.length} ${mine.length === 1 ? 'query' : 'queries'}</p>
<p>Before we price the landscape works we need the following settled. Each item names the drawing, the bill cell or the regulation it rests on.</p>
${items || '<p>No confirmed flags yet.</p>'}
<p>Please answer each item or issue a revised drawing or bill. Quantities on the plan take precedence over the schedule (general note 1).</p>
<p class="foot">Built by Landsight from confirmed flags · run ${esc(run.run_id)} · ${f.cur === 'usd' ? `USD at NT$${fmt(run.currency?.twd_per_usd, 3)}` : 'NT$'}</p>`
  return PAGE(`Queries — ${run.package.name}`, body)
}

export function openHtml(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function saveText(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const moneyText = moneyInText
