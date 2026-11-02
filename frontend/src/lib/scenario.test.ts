import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalise } from './api'
import { matchRecorded, RECORDED } from './askMock'
import { citeTarget, priceRange } from './ask'
import { flagsOf, moneyOf, objectsOn, shownMoney } from './flags'
import { scenarioOf, scenarioSlices } from './scenario'
import { ledgerRow, statementOf } from './statement'
import type { Run } from './types'

const run: Run = normalise(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'frontend-mock', 'run.json'), 'utf8')), 'repo')
const rate = run.currency!
const f = { cur: 'usd' as const, rate, money: (t: number | undefined | null) => `$${Math.round((t ?? 0) * rate.usd_per_twd)}`, text: (s: string) => s }

describe('scenarios derived when the Run does not carry them', () => {
  it('maps the sample’s 22 flags to the four kinds as the backend does', () => {
    const alarms = flagsOf(run).filter((x) => x.alarm)
    const by = (s: string) => alarms.filter((x) => x.scenario === s).map((x) => x.id).sort()
    expect(alarms).toHaveLength(22)
    expect(by('quote')).toEqual(['E02', 'E02.2', 'E13', 'E17', 'E18', 'E19', 'E20', 'E21', 'E22.2', 'E23'])
    // C-53: the Art. 305 water-retention check (D-64), "review", outside the answer key (unscored)
    expect(by('regulation')).toEqual(['C-53', 'E09', 'E12', 'E14', 'E15', 'E30'])
    expect(by('design')).toEqual(['E01', 'E08', 'E10', 'E11', 'E16', 'E29'])
    expect(by('format')).toEqual([])
  })

  it('slices the answer key by scenario: quote 10 (9 + 1), regulation 5 (4 + 1), design 11, format 4', () => {
    const s = scenarioSlices(run)
    expect([s.quote.planted, s.quote.found.length, s.quote.flagged.length]).toEqual([10, 9, 1])
    expect([s.regulation.planted, s.regulation.found.length, s.regulation.flagged.length]).toEqual([5, 4, 1])
    expect([s.design.planted, s.format.planted]).toEqual([11, 4])
  })

  it('takes the check’s own scenario when the backend sends one', () => {
    const c = { ...run.checks.find((x) => x.check_id === 'E02')!, scenario: 'design' as const }
    expect(scenarioOf(c, run)).toBe('design')
  })
})

describe('the money on screen', () => {
  it('prices each quote flag from its own numbers, n × the shown unit', () => {
    const m = (id: string) => moneyOf(run.checks.find((x) => x.check_id === id)!)
    expect(m('E02.2')).toMatchObject({ kind: 'over', n: 4, unit: 4200, twd: 16800 })
    expect(shownMoney(m('E02.2'), 'usd', rate)).toBe(516)
    expect(m('E20')).toMatchObject({ kind: 'over', n: 236, unit: 1500 })
    expect(m('E13')).toMatchObject({ kind: 'under', n: 150, unit: 155 })
    expect(m('E21')).toMatchObject({ kind: 'left_out', twd: 117190 })
    expect(m('E17').kind).toBe('reprice')
  })

  it('reconciles the bill: as submitted − billed-not-drawn − over the list + under-billed', () => {
    const s = statementOf(run, flagsOf(run), f)
    const less = [...s.lessNotDrawn, ...s.lessRate].reduce((a, l) => a + (l.value ?? 0), 0)
    const plus = s.plus.reduce((a, l) => a + (l.value ?? 0), 0)
    expect(s.lessNotDrawn.map((l) => l.id).sort()).toEqual(['E02.2', 'E22.2'])
    expect(s.lessRate.map((l) => l.id)).toEqual(['E20'])
    expect(s.supported).toBeCloseTo(s.bill - less + plus, 6)
    const r = ledgerRow(run, flagsOf(run).find((x) => x.id === 'E02.2')!, f)
    expect([r.found, r.expected, r.delta]).toEqual(['12', '8', '+$516'])
  })
})

describe('object ids are per sheet', () => {
  it('draws E12’s L-4/X-01 on L-4 only, never on L-1’s legend X-01', () => {
    const e12 = run.checks.find((x) => x.check_id === 'E12')!
    const l1 = run.sheets.find((s) => s.sheet_id === 'L-1-revB')!
    const l6 = run.sheets.find((s) => s.sheet_id === 'L-6')!
    expect(objectsOn(l1, e12)).toHaveLength(0)
    expect(objectsOn(l6, e12).map((o) => o.object_id)).toEqual(['PIT-01'])
  })
})

describe('ask the package, recorded', () => {
  it('answers the six recorded questions and only those', () => {
    expect(RECORDED).toHaveLength(6)
    expect(matchRecorded('why is the camphor row flagged')?.question).toBe('Why is the camphor row flagged?')
    expect(matchRecorded('What soil depth does the spec want on the slab?')?.question).toMatch(/soil depth/)
    expect(matchRecorded('how tall is the lighting mast')).toBeUndefined()
  })

  it('opens a PDF page of a drawing on the measured drawing, a review check on the review', () => {
    const soil = RECORDED[0].citations.find((c) => c.source === 'Landscape Drawings (Full Set).pdf' && c.page === 7)!
    expect(citeTarget(run, soil)).toMatchObject({ kind: 'sheet', sheetId: 'L-6' })
    const camphor = RECORDED.find((r) => /camphor row/.test(r.question))!
    expect(citeTarget(run, camphor.citations[0])).toEqual({ kind: 'check', checkId: 'E02.2' })
    expect(citeTarget(run, RECORDED[0].citations[0])).toMatchObject({ kind: 'file', fileId: 'F-08' })
    expect(priceRange('6200-7200')).toEqual([6200, 7200])
  })
})
