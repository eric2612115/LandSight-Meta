/**
 * The four kinds of catch (docs/PLAN-V2.md) on the screen. The backend sends `Check.scenario` and `Run.scenarios`
 * (docs/API.md, v2); when a Run does not carry them yet (frontend-mock/ was written before the field), the screen
 * derives them here, with the same mapping as landsight/review/scenarios.py — this file is the only place it lives.
 */
import type { Check, Run } from './types'

export type Scenario = 'quote' | 'regulation' | 'design' | 'format' | 'info'
export const CATCHES = ['quote', 'regulation', 'design', 'format'] as const
export const SCENARIOS: Scenario[] = [...CATCHES, 'info']

export const SCENARIO_NAME: Record<Scenario, string> = {
  quote: 'Quote', regulation: 'Regulation', design: 'Design', format: 'Format', info: 'Agreements and notes',
}

/** One line for each group, as the board says it. */
export const SCENARIO_BLURB: Record<Scenario, string> = {
  quote: 'bill against drawing, against your list, the bill’s own arithmetic',
  regulation: 'Art. 302 greening, the tree-pit rule, the fire lane, the protected tree, the label checklist',
  design: 'drawing against drawing: outlines, schedule, scale, overlaps, labels, the index',
  format: 'every file has a verdict and a reason',
  info: 'what agreed, and what was read',
}

/** check.category → scenario, when the check's sources do not decide it (scenarios.py CATEGORY). */
export const CATEGORY_SCENARIO: Record<string, Scenario> = {
  bill: 'quote', price: 'quote', arithmetic: 'quote', units: 'quote',
  regulation: 'regulation', protected_tree: 'regulation',
  sheet: 'design', scale: 'design', area: 'design',
  ingest: 'format',
}

/** Planted error → scenario (the answer key's own field when it has one; scenarios.py ERROR_SCENARIO). */
export const ERROR_SCENARIO: Record<string, Scenario> = {
  ...Object.fromEntries(['E02', 'E13', 'E17', 'E18', 'E19', 'E20', 'E21', 'E22', 'E23', 'E24'].map((e) => [e, 'quote'])),
  ...Object.fromEntries(['E09', 'E12', 'E14', 'E15', 'E30'].map((e) => [e, 'regulation'])),
  ...Object.fromEntries(['E01', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E10', 'E11', 'E16', 'E29'].map((e) => [e, 'design'])),
  ...Object.fromEntries(['E25', 'E26', 'E27', 'E28'].map((e) => [e, 'format'])),
  ...Object.fromEntries(['T01', 'T02'].map((e) => [e, 'regulation'])),
  ...Object.fromEntries(['T03', 'T04', 'T05', 'T08'].map((e) => [e, 'design'])),
  ...Object.fromEntries(['T06', 'T07'].map((e) => [e, 'quote'])),
} as Record<string, Scenario>

const ALARM = new Set(['flag', 'fail', 'review'])

export const isAlarm = (c: Check) => ALARM.has(c.severity) && !c.ok

/** The scenario of one check: its own field, else the mapping above. */
export function scenarioOf(c: Check & { scenario?: string }, run?: Run): Scenario {
  if (c.scenario && (SCENARIOS as string[]).includes(c.scenario)) return c.scenario as Scenario
  if (c.ok) return 'info'
  const by = new Set(c.by ?? [])
  if (c.category === 'document') return ALARM.has(c.severity) ? 'regulation' : 'info'
  if (c.category === 'revision') return by.has('bill') ? 'quote' : 'design'
  if (c.category === 'quantity') return by.has('bill') || /schedule/i.test(c.title ?? '') ? 'quote' : 'design'
  if (c.category === 'sheet' && run) {
    const members = new Set(run.files.filter((f) => f.parent).map((f) => f.file_id))
    const pages = new Set(run.sheets.filter((s) => s.source === 'pdf_vector' || s.source === 'pdf_raster').map((s) => s.sheet_id))
    const files = c.evidence.file_ids ?? []
    const sheets = c.evidence.sheet_ids ?? []
    if ((files.length && files.every((f) => members.has(f))) || (sheets.length && sheets.every((s) => pages.has(s)))) return 'format'
  }
  return CATEGORY_SCENARIO[c.category] ?? 'design'
}

export type ScenarioSlice = {
  planted: number
  found: string[]
  flagged: string[]
  missed: string[]
  false_alarms: string[]
  checks: number
  alarms: number
}

/** `Run.scenarios` when the backend sends it; else the same slices from `errors` and the mapping above. */
export function scenarioSlices(run: Run): Record<Scenario, ScenarioSlice> {
  const sent = (run as Run & { scenarios?: Record<Scenario, ScenarioSlice> }).scenarios
  if (sent && CATCHES.every((s) => sent[s])) return sent
  const err = run.errors
  const of = (id: string) => ERROR_SCENARIO[id.split('.')[0]] ?? 'design'
  const ids = [...new Set([...err.found, ...err.flagged, ...err.missed])]
  const out = {} as Record<Scenario, ScenarioSlice>
  for (const s of SCENARIOS) {
    const mine = run.checks.filter((c) => scenarioOf(c, run) === s)
    out[s] = {
      planted: ids.filter((e) => of(e) === s).length,
      found: err.found.filter((e) => of(e) === s),
      flagged: err.flagged.filter((e) => of(e) === s),
      missed: err.missed.filter((e) => of(e) === s),
      false_alarms: mine.filter((c) => err.false_alarms.includes(c.check_id)).map((c) => c.check_id),
      checks: mine.length,
      alarms: mine.filter(isAlarm).length,
    }
  }
  return out
}
