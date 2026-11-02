/** The quick review's view of a Run: findings in their groups, the confirmed state a person's Confirm brings, what a
 * change request says for each, the file groups of the open, the analyze steps. Every figure comes from the Run. */
import { flagSheets, moneyOf, nums, objectsOn, type FlagMoney } from '../lib/flags'
import { isAlarm } from '../lib/scenario'
import type { Check, FileVerdict, Item, Run, Sheet } from '../lib/types'
import { groupOf, SAMPLE, topicOf, type Group, type Topic } from './plain'

export type Finding = {
  id: string
  check: Check
  group: Group
  topic: Topic
  money: FlagMoney
  /** the sheet it is drawn on (the first of its evidence that holds its objects) */
  sheetId?: string
  /** 1-based, in the order the list shows */
  n: number
}

const SAMPLE_ORDER = Object.keys(SAMPLE)
const GROUP_ORDER: Record<Group, number> = { send: 0, fix: 1, code: 2, ask: 3 }
const SEV: Record<string, number> = { fail: 0, flag: 1, review: 2, info: 3 }

/** The alarms of a run as findings, grouped (send · fix · code · ask), biggest money first inside a group. */
export function findingsOf(run: Run): Finding[] {
  const out = run.checks.filter(isAlarm).map((c) => {
    const sheets = flagSheets(run, c)
    const s = sheets.find((sid) => objectsOnId(run, sid, c).length > 0) ?? sheets[0]
    return { id: c.check_id, check: c, group: groupOf(c, run), topic: topicOf(c, run), money: moneyOf(c), sheetId: s, n: 0 }
  })
  const big = (f: Finding) => (f.money.kind === 'over' || f.money.kind === 'left_out' || f.money.kind === 'under' ? f.money.twd : 0)
  // the sample's ids keep the table's order (the story's order); everything else: biggest money first, then severity
  const at = (f: Finding) => (SAMPLE[f.id]?.category === f.check.category ? SAMPLE_ORDER.indexOf(f.id) : 999)
  out.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || at(a) - at(b) || big(b) - big(a) || SEV[a.check.severity] - SEV[b.check.severity])
  out.forEach((f, i) => { f.n = i + 1 })
  return out
}

const objectsOnId = (run: Run, sheetId: string, c: Check) => {
  const s = run.sheets.find((x) => x.sheet_id === sheetId)
  return s ? objectsOn(s, c) : []
}

/** Money a finding queries (TWD): over-billing, a left-out row, an under-billing; 0 when it is not money. */
export const isMoney = (m: FlagMoney) => m.kind === 'over' || m.kind === 'left_out' || m.kind === 'under'

/** The item a check asks a person to confirm (E01 → I-01): only a check about an open outline Muse Spark read as one
 * object (its `gaps`); the item by its item_ids, else the item whose Spark object the check names. */
export function itemOf(run: Run, c: Check): Item | undefined {
  if (typeof nums(c).gaps !== 'number') return undefined
  const ids = c.item_ids ?? []
  const objs = c.evidence.object_ids ?? []
  return run.items.find((it) => ids.includes(it.item_id) && it.spark) ?? run.items.find((it) => !!it.spark?.object_id && objs.includes(it.spark.object_id))
}

/** The Run as it reads once these items are confirmed: the item counts the Spark object, and every check waiting on
 * it takes its `if_confirmed` form (the backend's own swap, D-78; GET /api/runs/{id} does the same). */
export function withConfirmed(run: Run, items: string[]): Run {
  if (!items.length) return run
  const done = new Set(items)
  const checks = run.checks.map((c) => {
    const pend = c.pending_items ?? []
    const alt = (c as Check & { if_confirmed?: Partial<Check> }).if_confirmed
    if (!alt || !pend.length || !pend.every((p) => done.has(p))) return c
    return { ...c, ...alt, numbers: { ...(c.numbers ?? {}), ...(alt.numbers ?? {}) }, confirmed_state: true }
  })
  const itemsOut = run.items.map((it) => (done.has(it.item_id) ? { ...it, confirmed: true, quote_count: it.quote_count ?? it.spark_count ?? it.geometry_count } : it))
  return { ...run, checks, items: itemsOut }
}

/* ------------------------------------------------------------------ the open: file groups */

export type FileGroup = 'drawings' | 'bills' | 'documents' | 'scans' | 'notread'
export const FILE_GROUPS: FileGroup[] = ['drawings', 'bills', 'documents', 'scans', 'notread']

export function fileGroupOf(f: FileVerdict): FileGroup {
  switch (f.verdict) {
    case 'drawing_vector': case 'archive_unpacked': return 'drawings'
    case 'bill': return 'bills'
    case 'drawing_raster': case 'drawing_image': return 'scans'
    case 'backup_ignored': case 'unsupported': case 'unreadable': return 'notread'
    default: return 'documents'
  }
}

/** The package's own files (an archive's members are listed under it, not again), grouped, in path order. */
export function fileGroups(run: Run): Record<FileGroup, FileVerdict[]> {
  const out: Record<FileGroup, FileVerdict[]> = { drawings: [], bills: [], documents: [], scans: [], notread: [] }
  for (const f of run.files) if (!f.parent) out[fileGroupOf(f)].push(f)
  return out
}

/** The governing bill: the one the bill-versions check names (the latest by date), else the last bill. */
export function governingBill(run: Run): FileVerdict | undefined {
  const bills = run.files.filter((f) => f.verdict === 'bill')
  const c = run.checks.find((x) => x.category === 'revision' && /bill/i.test(x.title))
  return bills.find((f) => c?.title.includes(f.name)) ?? bills[bills.length - 1]
}

/** The governing bill's revision name ("20261014") as its file name carries it. */
export const billRev = (f?: FileVerdict) => f?.name.match(/(\d{6,8}(?:-\d)?)/)?.[1] ?? f?.name ?? ''

/* ------------------------------------------------------------------ the project card */

export type ProjectCard = { name: string; location?: string; works?: string; ground?: string; site?: string; sheet?: string; byTitleBlock: boolean }

/** The title block's label → value pairs, read off the governing plan's print text (the sheet the run rendered). */
export function titleFields(texts: string[]): Record<string, string> {
  const keys = new Set(['PROJECT', 'WORKS', 'SITE AREA', 'GROUND', 'BUILDING COVERAGE', 'SCALE', 'TITLE', 'DRAWING NO.'])
  const out: Record<string, string> = {}
  texts.forEach((t, i) => {
    const k = t.trim().toUpperCase()
    if (keys.has(k) && texts[i + 1] && !keys.has(texts[i + 1].trim().toUpperCase()) && !(k in out)) out[k] = texts[i + 1].trim()
  })
  return out
}

const cap = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())

/** The card: the title block where the run's plan carries one, else the package name and the code checks' site area. */
export function projectCard(run: Run, fields: Record<string, string>): ProjectCard {
  const project = fields.PROJECT
  const [name, ...rest] = (project ?? '').split(',').map((s) => s.trim())
  const a0 = run.checks.map((c) => nums(c).A0).find((v) => typeof v === 'number') as number | undefined
  return {
    name: name || run.package.name.split(' — ')[0],
    location: rest.length ? rest.join(', ') : undefined,
    works: fields.WORKS,
    ground: fields.GROUND ? cap(fields.GROUND) : undefined,
    site: fields['SITE AREA'] ?? (a0 ? `${a0.toLocaleString('en-US')} m²` : undefined),
    sheet: fields['DRAWING NO.'],
    byTitleBlock: !!project,
  }
}

/** The plan the title block is read from: the counted plan of the latest revision. */
export function governingPlan(run: Run): Sheet | undefined {
  const plans = run.sheets.filter((s) => s.kind === 'plan' && s.counted && s.source !== 'pdf_vector' && s.source !== 'pdf_raster')
  return plans.sort((a, b) => (b.revision ?? '').localeCompare(a.revision ?? '') || a.number.localeCompare(b.number))[0] ?? run.sheets[0]
}

/* ------------------------------------------------------------------ analyze: the run's own calls */

export type AnalyzeStep = { key: 'spark' | 'geometry' | 'sam' | 'bill' | 'code'; model: string; label: string; total: number; unit: string; seconds: number }

/** Five steps from `timing.calls` and the run: Muse Spark's sheet and document reads, geometry's measured sheets,
 * SAM 3.1's calls, the bill versions, the code checks. `seconds` is each step's share of the recorded time. */
export function analyzeSteps(run: Run): AnalyzeStep[] {
  const calls = ((run.timing as { calls?: { call: string; model: string; seconds: number }[] }).calls ?? [])
  const spark = calls.filter((c) => /spark/i.test(c.model))
  const sam = calls.filter((c) => /sam/i.test(c.model))
  const sheetsRead = spark.filter((c) => /classify_sheet|raster_plan|floor_sheet/.test(c.call)).length || run.sheets.length
  const measured = run.sheets.filter((s) => s.source === 'dxf' || (!s.source && s.objects.length)).length
  const objects = run.sheets.filter((s) => s.source === 'dxf').reduce((a, s) => a + s.objects.length, 0)
  const bills = run.files.filter((f) => f.verdict === 'bill').length
  const code = run.checks.filter((c) => c.category === 'regulation' || c.category === 'protected_tree').length
  const sum = (xs: { seconds: number }[]) => xs.reduce((a, c) => a + (c.seconds || 0), 0)
  const geomS = Math.max(1, (run.timing.total_s || 10) * 0.25)
  return [
    { key: 'spark', model: 'Muse Spark', label: 'reading {0} sheets', total: sheetsRead, unit: 'sheets', seconds: sum(spark) || sheetsRead * 3 },
    { key: 'geometry', model: 'Geometry', label: 'closing outlines, counting', total: objects || measured, unit: 'objects', seconds: geomS },
    { key: 'sam', model: 'SAM 3.1', label: 'measuring colour areas', total: sam.length, unit: 'calls', seconds: sum(sam) || sam.length * 2 },
    { key: 'bill', model: 'Bill', label: '{0} versions aligned', total: bills, unit: 'versions', seconds: Math.max(1, sum(spark.filter((c) => /align/.test(c.call)))) },
    { key: 'code', model: 'Building code', label: 'greenery, fire lane, water', total: code, unit: 'rules', seconds: Math.max(1, geomS / 2) },
  ]
}

/** Each step's slice of a compressed replay of `total` ms, proportional to its recorded time (each at least 10%). */
export function replaySlices(steps: AnalyzeStep[], total: number): [number, number][] {
  const w = steps.map((s) => Math.max(s.seconds, 0.1 * steps.reduce((a, x) => a + x.seconds, 0)))
  const W = w.reduce((a, x) => a + x, 0)
  let t = 0
  return w.map((x) => {
    const a = t
    t += (x / W) * total
    return [a, t]
  })
}

/* ------------------------------------------------------------------ the change request */

/** What to change, in one line, from the check's numbers (a bill row: from → to; else its first fix; else the ask). */
export function changeOf(f: Finding, money: (twd: number) => string, shown?: string | null): string {
  const c = f.check
  const n = nums(c)
  const row = n.row
  if (typeof row === 'number' && typeof n.bill_qty === 'number' && typeof n.drawn_qty === 'number' && c.category === 'quantity')
    return `Row ${row}: ${n.bill_qty} → ${n.drawn_qty} ${n.drawn_name ?? ''}${f.money.twd ? ` · ${shown ?? money(f.money.twd)}` : ''}`.replace(/\s+·/, ' ·')
  if (typeof row === 'number' && c.category === 'price' && typeof n.list_low === 'number' && typeof n.list_high === 'number')
    return `Row ${row}: reprice inside your list (${money(n.list_low)}–${money(n.list_high)})`
  if (c.category === 'arithmetic' && typeof n.left_out === 'number') return `Fix the subtotal: add ${money(n.left_out)} left out`
  const fix = c.fixes?.find((x) => x.passes) ?? c.fixes?.[0]
  if (fix) return fix.label
  if (f.group === 'ask') return 'Ask the architect to confirm'
  if (f.group === 'send') return 'Revise and reissue'
  return 'Align the bill with the drawing'
}
