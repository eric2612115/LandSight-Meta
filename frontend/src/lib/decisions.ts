/** A person's verdict on a flag: what the screen keeps (`Decision`) and what the API stores on every Check
 * (docs/API.md "A decision on each flag": `decision` "open" | "confirm" | "dismiss", `note`, `decided_at`). */
import type { Check, Run } from './types'

export type DecisionWord = 'open' | 'confirm' | 'dismiss'
export type Decision = { state: 'confirmed' | 'dismissed'; at: number; source: 'screen' | 'ask' }
export type Seed = { d: Record<string, Decision>; notes: Record<string, string> }

export const toWord = (state: Decision['state'] | null | undefined): DecisionWord =>
  state === 'confirmed' ? 'confirm' : state === 'dismissed' ? 'dismiss' : 'open'
export const toState = (word: string | null | undefined): Decision['state'] | null =>
  word === 'confirm' ? 'confirmed' : word === 'dismiss' ? 'dismissed' : null

/** What the checks carry from the server: the decisions a person made (with their notes), and every check a person
 * touched at all (`decided_at` set — a reopened check counts, so it can clear an older record of it). */
export function decisionsOfChecks(checks: Check[]): Seed & { decided: Set<string> } {
  const d: Seed['d'] = {}
  const notes: Seed['notes'] = {}
  const decided = new Set<string>()
  for (const c of checks) {
    const state = toState(c.decision)
    if (c.decided_at || state) decided.add(c.check_id)
    if (state) {
      const at = c.decided_at ? Date.parse(c.decided_at) : NaN
      d[c.check_id] = { state, at: Number.isFinite(at) ? at : 0, source: 'screen' }
    }
    if (typeof c.note === 'string' && c.note) notes[c.check_id] = c.note
  }
  return { d, notes, decided }
}

/** The decisions a run opens with. The checks' own words win wherever a person decided on the server; the run's
 * older annotations (a `flag` → confirmed, with its note) fill in the rest. What this browser saved is taken last
 * on the recorded sources (the mock has no decision endpoint: the decision stays here, as before) and not at all for
 * the decisions on the live source, where it would disagree with the server after a reload; a saved note is kept
 * as a draft unless the server has one. */
export function mergeDecisions(args: { checks: Check[]; annotations: Seed; saved: Seed; live: boolean }): Seed {
  const server = decisionsOfChecks(args.checks)
  const d: Seed['d'] = { ...args.annotations.d }
  for (const id of server.decided) delete d[id]
  Object.assign(d, server.d)
  const notes: Seed['notes'] = { ...args.saved.notes, ...args.annotations.notes, ...server.notes }
  if (!args.live) {
    Object.assign(d, args.saved.d)
    Object.assign(notes, args.saved.notes)
  }
  return { d, notes }
}

/** The Run with one check replaced by the one the API returned (POST …/decision); an unknown check changes nothing. */
export function applyCheck(run: Run, check: Check): Run {
  if (!run.checks.some((c) => c.check_id === check.check_id)) return run
  return { ...run, checks: run.checks.map((c) => (c.check_id === check.check_id ? check : c)) }
}
