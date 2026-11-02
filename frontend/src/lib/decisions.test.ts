import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalise } from './api'
import { applyCheck, decisionsOfChecks, mergeDecisions, toState, toWord, type Decision } from './decisions'
import type { Check, Run } from './types'

const run: Run = normalise(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'frontend-mock', 'run.json'), 'utf8')), 'repo')

const check = (id: string, decision: Check['decision'], note: string | null = null, decided_at: string | null = '2026-11-02T05:15:31+00:00'): Check =>
  ({ check_id: id, category: 'quantity', title: id, severity: 'flag', by: ['geometry'], why: '', evidence: {}, decision, note, decided_at })
const confirmed = (at = 0): Decision => ({ state: 'confirmed', at, source: 'screen' })
const dismissed = (at = 0): Decision => ({ state: 'dismissed', at, source: 'screen' })
const none = { d: {}, notes: {} }

describe('a decision on each flag, as the API stores it', () => {
  it('maps the words both ways: confirm ↔ confirmed, dismiss ↔ dismissed, open ↔ no decision', () => {
    expect(toState('confirm')).toBe('confirmed')
    expect(toState('dismiss')).toBe('dismissed')
    expect(toState('open')).toBeNull()
    expect(toState(undefined)).toBeNull()
    expect(toWord('confirmed')).toBe('confirm')
    expect(toWord('dismissed')).toBe('dismiss')
    expect(toWord(null)).toBe('open')
  })

  it('reads the checks’ own decision, note and decided_at; an open check never decided is not a decision', () => {
    const s = decisionsOfChecks([check('E02', 'confirm', 'row 7: reduce to the drawn quantity'), check('E13', 'dismiss'), check('E20', 'open', null, null), check('E21', 'open', 'kept', '2026-11-02T06:00:00+00:00')])
    expect(s.d.E02).toMatchObject({ state: 'confirmed', at: Date.parse('2026-11-02T05:15:31+00:00') })
    expect(s.d.E13.state).toBe('dismissed')
    expect(s.d.E20).toBeUndefined()
    expect(s.d.E21).toBeUndefined()
    expect(s.notes).toEqual({ E02: 'row 7: reduce to the drawn quantity', E21: 'kept' })
    expect([...s.decided].sort()).toEqual(['E02', 'E13', 'E21'])
  })

  it('the sample’s recorded run carries every check open: nothing is seeded from it', () => {
    expect(run.checks.every((c) => c.decision === 'open' && c.decided_at === null)).toBe(true)
    expect(decisionsOfChecks(run.checks)).toEqual({ d: {}, notes: {}, decided: new Set() })
  })

  it('on live the server’s word is the record: it beats what the browser saved and an older flag annotation; a reopened check clears the annotation', () => {
    const m = mergeDecisions({
      checks: [check('E02', 'confirm', 'from the server'), check('E13', 'open', null, '2026-11-02T06:00:00+00:00'), check('E20', 'open', null, null), check('E21', 'dismiss')],
      annotations: { d: { E13: confirmed(), E20: confirmed(), E02: dismissed() }, notes: { E20: 'the annotation’s note' } },
      saved: { d: { E02: dismissed(5), E21: confirmed(5), E29: confirmed(5) }, notes: { E02: 'typed here', E29: 'a draft' } },
      live: true,
    })
    expect(m.d.E02.state).toBe('confirmed') // the server, not the annotation nor the browser
    expect(m.d.E13).toBeUndefined() // reopened on the server: the annotation no longer counts
    expect(m.d.E20.state).toBe('confirmed') // never decided on the server: the annotation stands
    expect(m.d.E21.state).toBe('dismissed')
    expect(m.d.E29).toBeUndefined() // only this browser knew: it would disagree with the server after a reload
    expect(m.notes).toEqual({ E02: 'from the server', E20: 'the annotation’s note', E29: 'a draft' })
  })

  it('on the recorded sources what the browser saved wins, as before (the mock has no decision endpoint)', () => {
    const m = mergeDecisions({
      checks: [check('E02', 'confirm'), check('E13', 'open', null, null)],
      annotations: { d: { E13: confirmed() }, notes: {} },
      saved: { d: { E02: dismissed(5), E20: confirmed(5) }, notes: { E02: 'typed here' } },
      live: false,
    })
    expect(m.d.E02.state).toBe('dismissed')
    expect(m.d.E13.state).toBe('confirmed')
    expect(m.d.E20.state).toBe('confirmed')
    expect(m.notes.E02).toBe('typed here')
    expect(mergeDecisions({ checks: run.checks, annotations: none, saved: none, live: false })).toEqual(none)
  })

  it('applyCheck puts the Check the API returned in the Run’s list and leaves the rest alone', () => {
    const was = run.checks.find((c) => c.check_id === 'E02')!
    const next = applyCheck(run, { ...was, decision: 'confirm', note: 'row 7', decided_at: '2026-11-02T05:15:31+00:00' })
    expect(next).not.toBe(run)
    expect(next.checks.length).toBe(run.checks.length)
    expect(next.checks.find((c) => c.check_id === 'E02')).toMatchObject({ decision: 'confirm', note: 'row 7' })
    expect(next.checks.filter((c) => c.check_id !== 'E02')).toEqual(run.checks.filter((c) => c.check_id !== 'E02'))
    expect(decisionsOfChecks(next.checks).d.E02.state).toBe('confirmed')
    expect(applyCheck(run, check('not-in-this-run', 'confirm'))).toBe(run)
  })
})
