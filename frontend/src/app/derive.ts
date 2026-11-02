/** Derived views every screen shares, memoised per Run. */
import { useMemo } from 'react'
import { flagsOf, shownMoney, type Flag } from '../lib/flags'
import { moneyValue, useMoney } from '../lib/money'
import type { Run } from '../lib/types'
import { useDecisions, type Filter } from './state'

export function useFlags(run: Run): Flag[] {
  return useMemo(() => flagsOf(run), [run])
}

export function useCounts(run: Run) {
  const flags = useFlags(run)
  const d = useDecisions((s) => s.d)
  return useMemo(() => {
    const alarms = flags.filter((f) => f.alarm)
    const confirmed = alarms.filter((f) => d[f.id]?.state === 'confirmed').length
    const dismissed = alarms.filter((f) => d[f.id]?.state === 'dismissed').length
    return { alarms: alarms.length, confirmed, dismissed, need: alarms.length - confirmed - dismissed, noted: flags.length - alarms.length + dismissed, all: flags.length }
  }, [flags, d])
}

export const inFilter = (f: Flag, filter: Filter, state?: 'confirmed' | 'dismissed') =>
  filter === 'all' ? true
    : filter === 'need' ? f.alarm && !state
      : filter === 'confirmed' ? state === 'confirmed'
        : !f.alarm || state === 'dismissed'

/** The money totals of the quote flags, in the shown currency (each line as it prints, so they add up on screen). */
export function useTotals(run: Run) {
  const flags = useFlags(run)
  const m = useMoney(run.currency)
  return useMemo(() => {
    const quote = flags.filter((f) => f.scenario === 'quote' && f.alarm)
    const v = (f: Flag) => shownMoney(f.money, m.cur, m.rate)
    const queried = quote.filter((f) => f.money.kind === 'over' || f.money.kind === 'left_out').reduce((a, f) => a + v(f), 0)
    const under = quote.filter((f) => f.money.kind === 'under').reduce((a, f) => a + v(f), 0)
    const arith = run.checks.find((c) => c.category === 'arithmetic')
    const sumRows = typeof arith?.numbers?.sum_of_rows === 'number' ? (arith.numbers.sum_of_rows as number) : undefined
    const bill = moneyValue(sumRows, m.cur, m.rate) ?? 0
    const greening = run.checks.find((c) => c.category === 'regulation' && typeof c.numbers?.required === 'number' && typeof c.numbers?.provided === 'number')
    return { queried, under, bill, sumRowsTwd: sumRows, greening, quote }
  }, [flags, m.cur, m.rate, run.checks])
}
