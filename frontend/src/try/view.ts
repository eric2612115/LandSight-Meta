/** What the review screens share: the run as confirmed here, its findings as the switches show them, money. */
import { useMemo } from 'react'
import { useTotals } from '../app/derive'
import { nums, shownMoney, shownText, whereOf } from '../lib/flags'
import { useMoney } from '../lib/money'
import type { Run } from '../lib/types'
import { t, td } from './i18n'
import { findingsOf, isMoney, itemOf, withConfirmed, type Finding } from './model'
import { useTry } from './store'

export function useReview(base: Run) {
  const confirmed = useTry((s) => s.confirmed)
  const topics = useTry((s) => s.topics)
  const run = useMemo(() => withConfirmed(base, confirmed), [base, confirmed])
  const all = useMemo(() => findingsOf(run), [run])
  const findings = useMemo(() => all.filter((f) => topics[f.topic]), [all, topics])
  const m = useMoney(run.currency)
  const totals = useTotals(run)
  const moneyOf = (f: Finding) => (isMoney(f.money) ? shownMoney(f.money, m.cur, m.rate) : 0)
  const chip = (f: Finding): string | null => {
    if (isMoney(f.money)) return shownText(moneyOf(f), m.cur, m.rate)
    if (f.money.kind === 'reprice') return t('reprice')
    if (f.money.kind === 'which') return t('which?')
    if (f.money.kind === 'confirm') return t('confirm')
    return null
  }
  /** The one line of evidence a card shows. */
  const evidence = (f: Finding): string => {
    const n = nums(f.check)
    const it = itemOf(run, f.check)
    if (it?.spark && typeof n.gaps === 'number') return t('{0} loose lines · Muse Spark: one tree, {1}%', n.gaps, Math.round((it.spark.confidence ?? 0) * 100))
    return m.text(td(f.check.title))
  }
  const where = (f: Finding) => {
    const s = run.sheets.find((x) => x.sheet_id === f.sheetId)
    return s ? s.number : whereOf(run, f.check)
  }
  const queried = (fs: Finding[]) => fs.filter((f) => f.money.kind === 'over' || f.money.kind === 'left_out').reduce((a, f) => a + moneyOf(f), 0)
  return { run, findings, m, totals, chip, evidence, where, queried, moneyText: (v: number) => shownText(v, m.cur, m.rate) }
}
