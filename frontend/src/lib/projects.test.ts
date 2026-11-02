import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalise } from './api'
import { countsOf, runRowOf, runRows, summaryOf, type PackageRun, type RunSummary } from './projects'
import { scenarioSlices } from './scenario'
import type { Run } from './types'

const mock = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'frontend-mock', name), 'utf8'))
const listing = mock('package_runs.json') as PackageRun[]
const run: Run = normalise(mock('run.json'), 'repo')

describe('the runs of a package (GET /api/packages/{id}/runs → the Runs table)', () => {
  it('maps one listed run onto a row: id, mode, scoreboard, the four scenario cells, the calls, the time', () => {
    const row = runRowOf(listing[0])
    expect(row).toMatchObject({ id: '8c1a0be45bcd', mode: 'fixtures', finished_at: '2026-11-02T05:09:17+00:00', planted: 30, found: 28, flagged: 2, missed: 0, false_alarms: 0, spark_calls: 39, sam_calls: 12, total_s: 14.18, openable: true })
    expect(row.scenarios).toEqual({
      quote: { planted: 10, found: 9, flagged: 1, missed: 0, false_alarms: 0 },
      regulation: { planted: 5, found: 4, flagged: 1, missed: 0, false_alarms: 0 },
      design: { planted: 11, found: 11, flagged: 0, missed: 0, false_alarms: 0 },
      format: { planted: 4, found: 4, flagged: 0, missed: 0, false_alarms: 0 },
    })
  })

  it('the mock’s listing holds exactly the run it opens, with the same scoreboard the Run derives', () => {
    expect(listing.map((r) => r.run_id)).toContain(run.run_id)
    const row = runRowOf(listing.find((r) => r.run_id === run.run_id)!)
    const mine = summaryOf(run)
    expect([row.planted, row.found, row.flagged, row.missed, row.false_alarms]).toEqual([mine.planted, mine.found, mine.flagged, mine.missed, mine.false_alarms])
    expect(row.scenarios).toEqual(mine.scenarios)
    expect(mine.scenarios).toEqual(countsOf(scenarioSlices(run)))
  })

  it('a package without an answer key lists zeros, and a short listing row still makes a row', () => {
    const bare = runRowOf({ run_id: 'abc', created_at: '2026-11-02T01:00:00+00:00', finished_at: '2026-11-02T01:00:09+00:00', source: 'live', scoreboard: { planted: 0, found: 0, flagged: 0, missed: 0, false_alarms: 0 }, by_scenario: {}, seconds: 9.5, calls: { spark: 11, sam: 7 } })
    expect(bare).toMatchObject({ id: 'abc', mode: 'live', planted: 0, spark_calls: 11, sam_calls: 7, total_s: 9.5, scenarios: {} })
  })

  it('the listing is the table: a run reviewed in this tab stays on top until the listing has it; without a listing the package record follows the session', () => {
    const row = (id: string, finished_at = '2026-11-02'): RunSummary => ({ id, mode: 'fixtures', finished_at, planted: 0, found: 0, flagged: 0, missed: 0, false_alarms: 0, spark_calls: 0, total_s: 0 })
    const listed = listing.map((r) => runRowOf(r))
    const fresh = row('new00000')
    expect(runRows(listed, [fresh], [row('8c1a0be45bcd')]).map((r) => r.id)).toEqual(['new00000', '8c1a0be45bcd'])
    // the refetch after the review has it: the listing's copy (stored times) wins and the session's is dropped
    expect(runRows([runRowOf({ ...listing[0], run_id: 'new00000' }), ...listed], [fresh], []).map((r) => r.id)).toEqual(['new00000', '8c1a0be45bcd'])
    expect(runRows(undefined, [fresh], [row('8c1a0be45bcd'), row('new00000'), row('')]).map((r) => r.id)).toEqual(['new00000', '8c1a0be45bcd', ''])
  })
})
