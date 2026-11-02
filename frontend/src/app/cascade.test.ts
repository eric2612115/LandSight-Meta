import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/sound', () => ({ play: vi.fn(), warmUpSound: vi.fn() }))

import { normalise } from '../lib/api'
import { latestBill, packageGroups } from '../lib/pkg'
import { play } from '../lib/sound'
import type { Run } from '../lib/types'
import { beginCascade, cancelCascade, CASCADE, cascadePlan, cascadeRows, playCascade, revealRows, useCascade } from './cascade'
import { SHOW_NONE, useShow } from './show'

const mock = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'frontend-mock', name), 'utf8'))
const run: Run = normalise(mock('run.json'), 'repo')
const played = play as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  useShow.setState({ ...SHOW_NONE, pulse: undefined })
  useCascade.setState({ pending: undefined, playing: false })
  played.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('the rows of the cascade', () => {
  it('are every file of the Run, once, in the table’s order (the five groups, each in the Run’s order)', () => {
    const rows = cascadeRows(run)
    expect(rows.length).toBe(run.files.length)
    expect(rows.map((r) => r.file.file_id)).toEqual(packageGroups(run).flatMap((g) => g.files.map((f) => f.file_id)))
    expect(new Set(rows.map((r) => r.file.file_id)).size).toBe(run.files.length)
  })

  it('know which rows are junk, which govern, which Muse Spark decided — from the Run, nothing invented', () => {
    const rows = cascadeRows(run)
    const unread = new Set(packageGroups(run).filter((g) => g.id === 'unread').flatMap((g) => g.files.map((f) => f.file_id)))
    expect(unread.size).toBeGreaterThan(0)
    expect(rows.filter((r) => r.junk).map((r) => r.file.file_id)).toEqual([...unread])
    expect(rows.find((r) => r.file.file_id === latestBill(run)!.file_id)!.governs).toBe(true)
    expect(rows.filter((r) => r.governs).every((r) => !r.junk)).toBe(true)
    expect(rows.filter((r) => r.spark).every((r) => r.file.decided_by === 'spark')).toBe(true)
  })
})

describe('the pacing', () => {
  it('thirty-odd files land one a tick, 60–90 ms apart, in about two and a half seconds', () => {
    const p = cascadePlan(run.files.length)
    expect(p.per).toBe(1)
    expect(p.step).toBeGreaterThanOrEqual(60)
    expect(p.step).toBeLessThanOrEqual(90)
    expect(p.total).toBeGreaterThan(2000)
    expect(p.total).toBeLessThan(3000)
    expect(cascadePlan(30).total).toBeCloseTo(2550, -2)
  })

  it('a package of any size stays inside the budget, several rows a tick when it must, and lands every row', () => {
    for (const n of [1, 5, 30, 31, 60, 100, 250, 500]) {
      const p = cascadePlan(n)
      expect(p.step).toBeGreaterThanOrEqual(CASCADE.stepMin)
      expect(p.step).toBeLessThanOrEqual(CASCADE.stepMax)
      expect(p.total).toBeLessThanOrEqual(CASCADE.budget + p.step)
      expect(p.ticks * p.per).toBeGreaterThanOrEqual(n)
    }
    expect(cascadePlan(0)).toEqual({ step: 0, per: 1, ticks: 0, total: 0 })
  })
})

describe('revealRows (the director’s scene 1 and the product share it)', () => {
  it('counts the files up one a tick on the caller’s clock, with the sound grammar per row', async () => {
    const sleeps: number[] = []
    const counts: number[] = []
    const unsub = useShow.subscribe((s) => counts.push(s.files ?? -1))
    await revealRows(run, async (ms) => { sleeps.push(ms) })
    unsub()
    const rows = cascadeRows(run)
    const { step } = cascadePlan(rows.length)
    expect(sleeps).toEqual(Array(rows.length).fill(step))
    expect(counts).toEqual(rows.map((_, i) => i + 1))
    expect(useShow.getState().files).toBe(rows.length)
    expect(played.mock.calls.length).toBe(rows.length)
    rows.forEach((r, i) => {
      const [name, opts] = played.mock.calls[i] as [string, { rate?: number }]
      if (r.governs) expect(name).toBe('stamp')
      else if (r.junk) expect(name).toBe('thud')
      else {
        expect(name).toBe('tick')
        expect(opts.rate).toBe(r.spark ? 1.25 : 1)
      }
    })
    expect(played.mock.calls.some(([n]) => n === 'stamp')).toBe(true)
    expect(played.mock.calls.some(([n]) => n === 'thud')).toBe(true)
  })
})

describe('the product’s cascade', () => {
  it('beginCascade empties the table for the run it marks; the Open screen then plays it to the end state within four seconds', async () => {
    vi.useFakeTimers()
    beginCascade(run.run_id)
    expect(useShow.getState().files).toBe(0)
    expect(useShow.getState().facts).toBe(false)
    expect(useCascade.getState().pending).toBe(run.run_id)
    const warm = vi.fn()
    const done = playCascade(run, { warm })
    expect(useCascade.getState()).toMatchObject({ pending: undefined, playing: true })
    expect(warm).toHaveBeenCalledTimes(1)
    const { total } = cascadePlan(run.files.length)
    await vi.advanceTimersByTimeAsync(total + 50)
    await done
    expect(total + 50).toBeLessThan(4000)
    expect(useShow.getState().files).toBeNull()
    expect(useShow.getState().facts).toBeNull()
    expect(useShow.getState().pulse).toBe('review')
    expect(useCascade.getState().playing).toBe(false)
    expect(played.mock.calls.at(-1)![0]).toBe('snap')
    // the Review button pulses once
    await vi.advanceTimersByTimeAsync(1500)
    expect(useShow.getState().pulse).toBeUndefined()
  })

  it('a click skips to the end state: no more rows land, the table is whole, the snap plays once', async () => {
    vi.useFakeTimers()
    beginCascade(run.run_id)
    const done = playCascade(run)
    const { step } = cascadePlan(run.files.length)
    await vi.advanceTimersByTimeAsync(step * 3 + 1)
    const mid = useShow.getState().files
    expect(mid).toBeGreaterThanOrEqual(3)
    expect(mid).toBeLessThan(run.files.length)
    const before = played.mock.calls.length
    window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await done
    expect(useShow.getState().files).toBeNull()
    expect(useShow.getState().facts).toBeNull()
    expect(useShow.getState().pulse).toBe('review')
    expect(useCascade.getState().playing).toBe(false)
    expect(played.mock.calls.length).toBe(before + 1)
    expect(played.mock.calls.at(-1)![0]).toBe('snap')
    await vi.advanceTimersByTimeAsync(step * 5)
    expect(useShow.getState().files).toBeNull()
  })

  it('prefers-reduced-motion: no cascade, the table lands whole', () => {
    const mm = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    try {
      beginCascade(run.run_id)
      expect(useShow.getState().files).toBeNull()
      expect(useCascade.getState().pending).toBeUndefined()
    } finally {
      window.matchMedia = mm
    }
  })

  it('an open that fails after beginCascade puts the table back', () => {
    beginCascade('gone')
    expect(useShow.getState().files).toBe(0)
    cancelCascade()
    expect(useShow.getState().files).toBeNull()
    expect(useShow.getState().facts).toBeNull()
    expect(useCascade.getState().pending).toBeUndefined()
  })
})
