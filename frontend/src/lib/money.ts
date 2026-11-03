import { create } from 'zustand'

/** Money on screen. Every stored price is TWD; the Run carries one dated public rate (`run.currency`), and every money
 * figure on screen goes through `formatMoney` / `useMoney`: NT$ with thousands separators, USD with no decimals. */
export type Currency = 'twd' | 'usd'
export type Rate = { base: string; usd_per_twd: number; as_of?: string; source?: string; twd_per_usd?: number }

const thousands = (v: number) => Math.round(v).toLocaleString('en-US')

/** The figure in the shown currency (USD rounded to whole dollars, or to cents under $20 — a plant at $4.77 is not
 * $5); null when it cannot be shown. */
export function moneyValue(twd: number | undefined | null, cur: Currency, rate?: Rate | null): number | null {
  if (twd === undefined || twd === null || !Number.isFinite(twd)) return null
  if (cur === 'usd' && rate?.usd_per_twd) {
    const v = twd * rate.usd_per_twd
    return Math.abs(v) < 20 ? Math.round(v * 100) / 100 : Math.round(v)
  }
  return twd
}

/** NT$4,200 · $129. `symbol: false` gives the bare figure (a table column that names its currency in the header). */
export function formatMoney(twd: number | undefined | null, cur: Currency, rate?: Rate | null, opts: { symbol?: boolean } = {}): string {
  const v = moneyValue(twd, cur, rate)
  if (v === null) return '–'
  const usd = cur === 'usd' && !!rate?.usd_per_twd
  const body = Number.isInteger(v) ? thousands(v) : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return opts.symbol === false ? body : `${usd ? '$' : 'NT$'}${body}`
}

/** A range with the symbol once: NT$6,200–7,200 · $191–222. */
export function formatRange(low: number | undefined | null, high: number | undefined | null, cur: Currency, rate?: Rate | null): string {
  const a = moneyValue(low, cur, rate)
  const b = moneyValue(high, cur, rate)
  if (a !== null && b !== null && (!Number.isInteger(a) || !Number.isInteger(b))) {
    const f2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `${symbolOf(cur, rate)}${f2(a)}–${f2(b)}`
  }
  return `${formatMoney(low, cur, rate)}–${formatMoney(high, cur, rate, { symbol: false })}`
}

/** n × a unit price, with the total from the shown unit so the arithmetic on screen holds (4 × $129 = $516). */
export function formatTimes(n: number, twd: number | undefined | null, cur: Currency, rate?: Rate | null) {
  const unit = moneyValue(twd, cur, rate) ?? 0
  const total = Math.round(n * unit * 100) / 100
  const usd = cur === 'usd' && !!rate?.usd_per_twd
  return { unit: formatMoney(twd, cur, rate), total: `${usd ? '$' : 'NT$'}${thousands(total)}`, totalValue: total, prefix: usd ? '$' : 'NT$' }
}

export const symbolOf = (cur: Currency, rate?: Rate | null) => (cur === 'usd' && rate?.usd_per_twd ? '$' : 'NT$')

/** `?currency=usd|twd`; director mode (the film) and the quick review /try (its visitors are international) default to
 * USD, the review desk to TWD. TWD stays one click away on every screen. */
export function readCurrency(search: string, director: boolean, path = ''): Currency {
  const q = new URLSearchParams(search).get('currency')?.toLowerCase()
  if (q === 'usd' || q === 'twd') return q
  return director || path === '/try' || path.startsWith('/try/') ? 'usd' : 'twd'
}

const isDirector = () => {
  try {
    return new URLSearchParams(window.location.search).get('director') === '1'
  } catch {
    return false
  }
}

type CurrencyState = { cur: Currency; setCur: (c: Currency) => void }

export const useCurrency = create<CurrencyState>((set) => ({
  cur: typeof window === 'undefined' ? 'twd' : readCurrency(window.location.search, isDirector(), window.location.pathname),
  setCur: (cur) => {
    try {
      const u = new URL(window.location.href)
      u.searchParams.set('currency', cur)
      window.history.replaceState(window.history.state, '', u)
    } catch {
      /* no URL to keep it in */
    }
    set({ cur })
  },
}))

/** Σ over the price flags of (bill unit price − list high) × bill quantity, where the bill is over the list (TWD). */
export function overList(checks: { category: string; numbers?: Record<string, unknown> }[]): number {
  let total = 0
  for (const c of checks) {
    if (c.category !== 'price') continue
    const n = c.numbers ?? {}
    const over = typeof n.over_list_twd === 'number' ? n.over_list_twd : undefined
    const price = typeof n.bill_price === 'number' ? n.bill_price : typeof n.unit_price === 'number' ? n.unit_price : undefined
    const high = typeof n.list_high === 'number' ? n.list_high : undefined
    const q = typeof n.bill_qty === 'number' ? n.bill_qty : undefined
    if (over !== undefined) total += over
    else if (price !== undefined && high !== undefined && q !== undefined && price > high) total += (price - high) * q
  }
  return total
}

/** NT$ figures inside a check's text, shown in the chosen currency (the numbers come from the Run; the text is the
 * API's TWD wording). A "low–high" pair is shown as one range. */
export function moneyInText(text: string, cur: Currency, rate?: Rate | null): string {
  if (cur !== 'usd' || !rate?.usd_per_twd) return text
  const n = (s: string) => Number(s.replace(/,/g, ''))
  return text
    .replace(/NT\$\s?([\d,]+(?:\.\d+)?)(?:\s?[–-]\s?([\d,]+(?:\.\d+)?))?/g, (_, a: string, b?: string) =>
      b ? formatRange(n(a), n(b), cur, rate) : formatMoney(n(a), cur, rate))
    .replace(/(list \()([\d,]+(?:\.\d+)?)[–-]([\d,]+(?:\.\d+)?)\)/g, (_, pre: string, a: string, b: string) => `${pre}${formatRange(n(a), n(b), cur, rate)})`)
}

/** The money formatter for one Run: the chosen currency when the Run carries a rate, else TWD. */
export function useMoney(rate?: Rate | null) {
  const wanted = useCurrency((s) => s.cur)
  const cur: Currency = wanted === 'usd' && rate?.usd_per_twd ? 'usd' : 'twd'
  return {
    cur,
    wanted,
    rate,
    symbol: symbolOf(cur, rate),
    money: (twd: number | undefined | null, opts?: { symbol?: boolean }) => formatMoney(twd, cur, rate, opts),
    value: (twd: number | undefined | null) => moneyValue(twd, cur, rate),
    range: (low: number | undefined | null, high: number | undefined | null) => formatRange(low, high, cur, rate),
    times: (n: number, twd: number | undefined | null) => formatTimes(n, twd, cur, rate),
    text: (s: string) => moneyInText(s, cur, rate),
  }
}
