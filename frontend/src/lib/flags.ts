/** The review screen's view of a Run's checks: the flags list grouped by scenario, where each flag points, the money
 * each one queries, and the numbers it shows. Every figure comes from the check; nothing is invented here. */
import { num, qty } from './format'
import { formatMoney, moneyValue, type Currency, type Rate } from './money'
import { isAlarm, scenarioOf, type Scenario } from './scenario'
import type { Check, Run, Sheet } from './types'

export type MoneyKind = 'over' | 'under' | 'left_out' | 'reprice' | 'which' | 'confirm' | 'none'

/** Money a flag queries, in TWD. When `n` and `unit` are set the line prints as n × unit and its value is n × the
 * shown unit, so the arithmetic on screen holds in either currency (D-55). */
export type FlagMoney = { kind: MoneyKind; twd: number; n?: number; unit?: number; label?: string; group?: string }

export type Flag = {
  check: Check
  id: string
  scenario: Scenario
  alarm: boolean
  where: string
  money: FlagMoney
  /** sheets the flag can be shown on, in order */
  sheetIds: string[]
}

const SCEN_ORDER: Record<Scenario, number> = { quote: 0, regulation: 1, design: 2, format: 3, info: 4 }
const SEV: Record<string, number> = { fail: 0, flag: 1, review: 2, info: 3 }

export const nums = (c: Check) => (c.numbers ?? {}) as Record<string, unknown>

export function moneyOf(c: Check): FlagMoney {
  const n = nums(c)
  const v = (k: string) => num(n[k])
  const billQty = v('bill_qty')
  const price = v('unit_price') ?? v('bill_price')
  if (c.category === 'arithmetic' && v('left_out') !== undefined) return { kind: 'left_out', twd: v('left_out')!, group: 'arithmetic' }
  if (c.category === 'price' && price !== undefined && billQty !== undefined) {
    const lo = v('list_low')
    const hi = v('list_high')
    if (hi !== undefined && price > hi) return { kind: 'over', twd: (price - hi) * billQty, n: billQty, unit: price - hi, group: 'rate' }
    if (lo !== undefined && price < lo) return { kind: 'under', twd: (lo - price) * billQty, n: billQty, unit: lo - price, group: 'rate' }
  }
  if (c.category === 'units') return { kind: 'reprice', twd: v('amount') ?? 0, label: 'reprice' }
  if (c.category === 'quantity' && billQty !== undefined && price !== undefined) {
    const needed = v('needed')
    if (needed !== undefined && needed > billQty) return { kind: 'under', twd: (needed - billQty) * price, n: needed - billQty, unit: price, group: 'quantity' }
    const drawn = v('drawn_qty')
    if (drawn !== undefined && billQty > drawn) return { kind: 'over', twd: (billQty - drawn) * price, n: billQty - drawn, unit: price, group: 'quantity' }
  }
  if (c.category === 'bill' && c.severity === 'review') return { kind: 'confirm', twd: 0, label: 'confirm' }
  if (c.category === 'bill' && v('hidden_total') !== undefined) return { kind: 'which', twd: 0, label: 'which?' }
  return { kind: 'none', twd: 0 }
}

/** The figure a money line shows, in the shown currency (n × the rounded unit when it is printed as a product). */
export function shownMoney(m: FlagMoney, cur: Currency, rate?: Rate | null): number {
  if (m.n !== undefined && m.unit !== undefined) return Math.round(m.n * (moneyValue(m.unit, cur, rate) ?? 0) * 100) / 100
  return moneyValue(m.twd, cur, rate) ?? 0
}

/** A shown figure back to text, with the currency's symbol. */
export function shownText(v: number, cur: Currency, rate?: Rate | null, sign = false): string {
  const usd = cur === 'usd' && !!rate?.usd_per_twd
  const body = Math.round(Math.abs(v)).toLocaleString('en-US')
  const s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''
  return `${s}${usd ? '$' : 'NT$'}${body}`
}

const sheetNo = (run: Run, id: string) => {
  const s = run.sheets.find((x) => x.sheet_id === id)
  return s ? s.number : id
}

/** Where a flag points, as the list's right column says it: a bill row, sheets, or a document. */
export function whereOf(run: Run, c: Check): string {
  const n = nums(c)
  const row = num(n.row)
  const cells = c.evidence.cells ?? []
  const sheets = [...new Set((c.evidence.sheet_ids ?? []).filter((s) => !/-revA$/.test(s) || (c.evidence.sheet_ids ?? []).length === 1).map((s) => sheetNo(run, s)))]
  if (c.category === 'arithmetic') {
    const cell = cells.find((x) => /G2\d$/.test(x))
    return cell ? `BOQ ${cell.split('!')[1]}` : 'BOQ'
  }
  if (row !== undefined && (c.category === 'price' || c.category === 'bill')) return `BOQ r${row}`
  if (row !== undefined && !sheets.length) return `BOQ r${row}`
  if (row !== undefined && c.category === 'quantity') return `BOQ r${row}`
  if (sheets.length) return sheets.slice(0, 3).join(' ')
  if (cells.length) return 'BOQ'
  const f = run.files.find((x) => x.file_id === (c.evidence.file_ids ?? [])[0])
  if (f) return f.ext ? f.ext.toUpperCase() : 'file'
  return ''
}

/** Sheets a flag can be drawn on: those of its evidence that hold its objects first. */
export function flagSheets(run: Run, c: Check): string[] {
  const sids = (c.evidence.sheet_ids ?? []).filter((s) => run.sheets.some((x) => x.sheet_id === s))
  const holds = (sid: string) => {
    const s = run.sheets.find((x) => x.sheet_id === sid)
    return !!s && objectsOn(s, c).length > 0
  }
  return [...sids.filter(holds), ...sids.filter((s) => !holds(s))]
}

export function flagsOf(run: Run): Flag[] {
  const out = run.checks.map((c) => ({
    check: c, id: c.check_id, scenario: scenarioOf(c, run), alarm: isAlarm(c), where: whereOf(run, c), money: moneyOf(c), sheetIds: flagSheets(run, c),
  }))
  const big = (f: Flag) => (f.money.kind === 'over' || f.money.kind === 'left_out' ? f.money.twd : f.money.kind === 'under' ? f.money.twd * 0.999 : 0)
  return out.sort((a, b) => SCEN_ORDER[a.scenario] - SCEN_ORDER[b.scenario] || Number(b.alarm) - Number(a.alarm) || big(b) - big(a) || SEV[a.check.severity] - SEV[b.check.severity])
}

/** The objects of a flag on one sheet (ids in the API's "sheet/object" form are already split by normalise). */
export function objectsOn(sheet: Sheet, c: Check) {
  const ids = c.evidence.object_ids ?? []
  if (!(c.evidence.sheet_ids ?? []).includes(sheet.sheet_id)) return []
  const refs = c.evidence.refs
  if (refs?.length) return sheet.objects.filter((o) => refs.includes(`${sheet.sheet_id}/${o.object_id}`) && o.outline.length > 0)
  return sheet.objects.filter((o) => ids.includes(o.object_id) && o.outline.length > 0)
}

const UNIT_KEYS: [RegExp, string][] = [[/_m2$/, ' m²'], [/_m$/, ' m'], [/_pct$/, '%']]

const LABEL: Record<string, string> = {
  zone_m2: 'Lane area', required_ap0: 'Required, lane not declared', required_with_lane_as_ap: 'Required if declared, Art. 299',
  provided_with_lane_as_ap: 'Provided if declared', tree_fix_ap0: 'Trees to add', tree_fix_with_lane_as_ap: 'Trees to add if declared',
  required: 'Required', provided: 'Provided', provided_before_pit_rule: 'Before the tree-pit rule', A_prime: 'A′ (greening area)',
  A0: 'Site area', alpha: 'α (species mix)', beta: 'β', sum_gi_ai: 'ΣGi·Ai', pit_w_m: 'Pit width', pit_l_m: 'Pit length',
  pit_area_m2: 'Pit area', soil_depth_m: 'Soil depth', on_slab: 'On slab', trees_downgraded: 'Large trees counted as small',
  provided_before: 'Provided before', provided_after: 'Provided after', dbh_m: 'DBH', threshold_m: 'Ordinance threshold',
  canopy_r_m: 'Canopy radius', rpz_r_m: 'Root protection radius', overlap_m2: 'Overlap', paving_m2: 'Paving', planting_m2: 'Planting',
  greening_lawn_m2: 'Lawn counted for greening', area_m2: 'Area', label_code: 'Box says', hatch_code: 'Hatch says', hatch: 'Hatch pattern',
  scale_title: 'Title block', scale_measured: 'Scale bar measures', factor: 'Linear factor', listed: 'Sheets on the index', missing: 'Missing',
  geometry: 'Geometry (closed)', spark: 'Muse Spark', gaps: 'Gaps', max_gap_m: 'Largest gap', confidence: 'Confidence', schedule: 'Schedule',
  drawn: 'Drawing', difference: 'Difference', x: 'Centre x', y: 'Centre y', visible_total: 'Visible sheet total', hidden_total: 'Hidden sheet total',
  subtotal: 'The bill’s subtotal', sum_of_rows: 'Sum of its rows', left_out: 'Left out', formula: 'Formula', required_documents: 'Documents listed',
  sam_m2: 'SAM 3.1', cad_m2: 'CAD', error_pct: 'Difference', masks: 'Masks on line work', masks_on_colour: 'Masks on the coloured render',
  prompt: 'Prompt (Spark’s words)', length_m: 'Measured length', spacing_m: 'Spacing', rows: 'Rows', count: 'Plants',
  trees_rev_A: 'Trees, Rev A', trees_rev_B: 'Trees, Rev B', moved: 'Moved', moved_m: 'Moved by',
}

const SKIP = /(_usd$|^row$|^bill_|^item_id$|^align_|^aligned_to$|^drawn_unit$|^drawn_name$|^unit$|^seconds$|^tag$|^with_lane_as_ap$|^r$|^ra$|^Ap$|^entries$|^skipped$)/

const MONEY_KEYS = /(price|amount|total|list_low|list_high|subtotal|left_out|sum_of_rows|_twd$)/

/** The check's numbers as label → value pairs, in the order the API sent them (curated labels, units from the key). */
export function numberRows(c: Check, money: (twd: number) => string, max = 6): [string, string][] {
  const out: [string, string][] = []
  for (const [k, raw] of Object.entries(nums(c))) {
    if (SKIP.test(k) || raw === null || raw === undefined || typeof raw === 'object' || typeof raw === 'boolean') continue
    const label = LABEL[k] ?? k.replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase())
    let value: string
    const n = num(raw)
    if (typeof raw === 'string' && n === undefined) value = raw
    else if (n !== undefined && MONEY_KEYS.test(k)) value = money(n)
    else if (n !== undefined) {
      const unit = UNIT_KEYS.find(([re]) => re.test(k))?.[1] ?? ''
      const digits = /required|provided|sum_gi|A_prime|_m2$|_m$/.test(k) && !Number.isInteger(n) ? 1 : undefined
      value = `${digits !== undefined ? n.toFixed(digits) : !Number.isInteger(n) && Math.abs(n) < 10 ? n.toFixed(2) : qty(n)}${unit}`
      if (/^(required|provided)/.test(k) && !/_m2$/.test(k)) value += ' kgCO₂e/yr'
    } else value = String(raw)
    out.push([label, value])
    if (out.length >= max) break
  }
  return out
}

/** Sheet and short title for a list or pin: "L-1 B Planting". */
export function sheetCaption(run: Run, s: Sheet): { no: string; name: string } {
  const twins = run.sheets.filter((x) => x.number === s.number && x.source !== 'pdf_vector' && x.source !== 'pdf_raster')
  const no = twins.length > 1 && s.revision ? `${s.number} ${s.revision}` : s.number
  const superseded = /superseded/i.test(s.not_counted_reason ?? '')
  const words = s.title.split(/\s+/)
  const byKind: Record<string, string> = { cover: 'Cover', elevation: 'Elevation', schedule: 'Schedule' }
  const name = superseded ? 'superseded'
    : byKind[s.kind] ?? (s.kind === 'detail' ? `${words[0]} ${(words[1] ?? '').toLowerCase()}`.replace(/ detail$/, '').trim()
      : /^Enlarged/.test(s.title) ? s.title.replace(/^Enlarged Plan - (\w).*$/, 'Enlarged $1') : words[0])
  return { no, name }
}

/** The sheets of the filmstrip: drawings, not the PDF pages that copy them. */
export const filmSheets = (run: Run) => run.sheets.filter((s) => s.source !== 'pdf_vector' && s.source !== 'pdf_raster')

/** A sheet's governing state: measured and newest, superseded, or read only. */
export function sheetState(run: Run, s: Sheet): string {
  if (s.counted) {
    const twins = filmSheets(run).filter((x) => x.number === s.number)
    return twins.length > 1 ? 'measured · governs' : 'measured'
  }
  if (/superseded/i.test(s.not_counted_reason ?? '')) return `Rev ${s.revision ?? ''} · superseded`.replace('Rev  ·', 'superseded ·')
  return 'read, not counted'
}

export const money2 = (twd: number | undefined, cur: Currency, rate?: Rate | null) => formatMoney(twd, cur, rate)
