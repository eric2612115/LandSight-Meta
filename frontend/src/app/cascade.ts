/** The verdict cascade. When a package is opened fresh (POST /api/package/open, an uploaded folder, Review on the
 * Projects screen — not a stored run opened from the Runs table) the Open screen's package table fills row by row in
 * the Run's order with the director's sound grammar: a tick per row (higher when Muse Spark decided the file), the low
 * thud for a file that is not read, the stamp for the file that governs; then the snap, the run facts and the Review
 * button, which pulses once. Every row and verdict is the Run's — the cascade only paces them. Any click skips to the
 * end state; `prefers-reduced-motion` means no cascade at all. Director scene 1 plays the same rows (revealRows). */
import { create } from 'zustand'
import { sleep as wait } from '../lib/format'
import { packageGroups, verdictOf } from '../lib/pkg'
import { play } from '../lib/sound'
import type { FileVerdict, Run } from '../lib/types'
import { show, useShow } from './show'

export type CascadeRow = { file: FileVerdict; junk: boolean; governs: boolean; spark: boolean }

/** The rows in the table's order: the five groups, each in the Run's order. */
export function cascadeRows(run: Run): CascadeRow[] {
  return packageGroups(run).flatMap((g) => g.files.map((f) => ({
    file: f, junk: g.id === 'unread', governs: /governs/.test(verdictOf(run, f).text), spark: f.decided_by === 'spark',
  })))
}

/** Rows land 60–90 ms apart (thirty files ≈ 2.6 s); a bigger package lands several rows a tick so the whole cascade
 * stays inside the budget, well under four seconds with the snap and the pulse. */
export const CASCADE = { stepMax: 85, stepMin: 40, budget: 3200 }

export function cascadePlan(n: number): { step: number; per: number; ticks: number; total: number } {
  if (n <= 0) return { step: 0, per: 1, ticks: 0, total: 0 }
  const step = Math.round(Math.max(CASCADE.stepMin, Math.min(CASCADE.stepMax, CASCADE.budget / n)))
  const per = Math.max(1, Math.ceil((n * step) / CASCADE.budget))
  const ticks = Math.ceil(n / per)
  return { step, per, ticks, total: ticks * step }
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** One sound a tick: the stamp when a governing file lands, the thud for a file that is not read, else the tick. */
export function tickSound(rows: CascadeRow[]) {
  const governs = rows.find((r) => r.governs)
  const junk = rows.find((r) => r.junk)
  if (governs) play('stamp', { volume: 0.55 })
  else if (junk) play('thud', { volume: 0.4 })
  else play('tick', { rate: rows[0]?.spark ? 1.25 : 1, volume: 0.45 })
}

/** The landing row stays in view: the table is scrolled to its foot after the row is drawn. */
function follow() {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return
  requestAnimationFrame(() => {
    const tree = document.querySelector('[data-tree]')
    if (tree) tree.scrollTop = tree.scrollHeight
  })
}

/** Reveal the rows a tick at a time with their sounds. `sleep` is the caller's clock: the director's rejects on a
 * retake, the product's on a click. */
export async function revealRows(run: Run, sleep: (ms: number) => Promise<void>, opts: { sound?: boolean } = {}) {
  const rows = cascadeRows(run)
  const { step, per } = cascadePlan(rows.length)
  for (let i = 0; i < rows.length; i += per) {
    const upto = Math.min(rows.length, i + per)
    show({ files: upto })
    if (opts.sound !== false) tickSound(rows.slice(i, upto))
    follow()
    await sleep(step)
  }
}

type CascadeState = {
  /** the run a fresh open marked for the cascade; the Open screen plays it when that run is on screen */
  pending?: string
  playing: boolean
}

export const useCascade = create<CascadeState>(() => ({ playing: false }))

/** Called with a fresh Run in hand, before it is put on screen: the table starts empty and fills once /open shows it.
 * With `prefers-reduced-motion` the table simply lands whole. */
export function beginCascade(runId: string) {
  if (reducedMotion()) return
  show({ files: 0, facts: false })
  useCascade.setState({ pending: runId })
}

/** An open that failed after beginCascade: nothing to play. */
export function cancelCascade() {
  useCascade.setState({ pending: undefined })
  if (!useCascade.getState().playing) show({ files: null, facts: null })
}

let current: AbortController | null = null
let pulseTimer: ReturnType<typeof setTimeout> | undefined

export const skipCascade = () => current?.abort()

const PULSE_MS = 1400

function finish(skipped: boolean) {
  show({ files: null, facts: null, pulse: 'review' })
  useCascade.setState({ playing: false })
  play('snap', { volume: 0.6 })
  if (!skipped) setTimeout(() => document.querySelector('[data-tree]')?.scrollTo({ top: 0, behavior: 'smooth' }), 700)
  if (pulseTimer) clearTimeout(pulseTimer)
  pulseTimer = setTimeout(() => {
    pulseTimer = undefined
    if (useShow.getState().pulse === 'review') show({ pulse: undefined })
  }, PULSE_MS)
}

/** Play the cascade for the run the Open screen shows; resolves at the end state, played through or skipped by a
 * click. `warm` is what the next screen needs ready (the review's sheet and thumbnails). */
export async function playCascade(run: Run, opts: { warm?: () => void } = {}): Promise<void> {
  current?.abort()
  const ctl = new AbortController()
  current = ctl
  useCascade.setState({ pending: undefined, playing: true })
  const skip = (e: Event) => {
    if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
    ctl.abort()
  }
  window.addEventListener('pointerdown', skip, true)
  window.addEventListener('keydown', skip, true)
  try {
    opts.warm?.()
    await revealRows(run, (ms) => wait(ms, ctl.signal))
  } catch (e) {
    if ((e as { name?: string })?.name !== 'AbortError') throw e
  } finally {
    window.removeEventListener('pointerdown', skip, true)
    window.removeEventListener('keydown', skip, true)
    if (current === ctl) {
      current = null
      finish(ctl.signal.aborted)
    }
  }
}
