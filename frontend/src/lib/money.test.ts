import { describe, expect, it } from 'vitest'
import { formatMoney, formatRange, formatTimes, moneyInText, overList, readCurrency } from './money'

const rate = { base: 'TWD', usd_per_twd: 1 / 32.478, twd_per_usd: 32.478, as_of: '2026-10-30' }

describe('money', () => {
  it('formats TWD with thousands separators and USD with no decimals', () => {
    expect(formatMoney(4200, 'twd', rate)).toBe('NT$4,200')
    expect(formatMoney(896800, 'twd', rate)).toBe('NT$896,800')
    expect(formatMoney(4200, 'usd', rate)).toBe('$129')
    expect(formatMoney(354000, 'usd', rate)).toBe('$10,900')
    expect(formatMoney(4200, 'usd', rate, { symbol: false })).toBe('129')
    expect(formatMoney(undefined, 'usd', rate)).toBe('–')
    expect(formatMoney(155, 'usd', rate)).toBe('$4.77')
    expect(formatTimes(150, 155, 'usd', rate).total).toBe('$716')
  })

  it('falls back to TWD when the Run carries no rate', () => {
    expect(formatMoney(4200, 'usd', undefined)).toBe('NT$4,200')
    expect(formatRange(6200, 7200, 'usd', null)).toBe('NT$6,200–7,200')
  })

  it('writes a range with one symbol and keeps n × unit arithmetic exact on screen', () => {
    expect(formatRange(6200, 7200, 'usd', rate)).toBe('$191–222')
    expect(formatRange(6200, 7200, 'twd', rate)).toBe('NT$6,200–7,200')
    const t = formatTimes(4, 4200, 'usd', rate)
    expect([t.unit, t.total, t.totalValue]).toEqual(['$129', '$516', 516])
    expect(formatTimes(4, 4200, 'twd', rate).total).toBe('NT$16,800')
  })

  it('reads the currency from the URL; director defaults to USD, plain to TWD', () => {
    expect(readCurrency('?director=1', true)).toBe('usd')
    expect(readCurrency('', false)).toBe('twd')
    expect(readCurrency('?currency=TWD&director=1', true)).toBe('twd')
    expect(readCurrency('?currency=usd', false)).toBe('usd')
  })

  it('sums what the bill asks over the top of the list, from the price flags only', () => {
    const checks = [
      { category: 'price', numbers: { bill_price: 3800, list_high: 2300, bill_qty: 236 } },
      { category: 'price', numbers: { bill_price: 4200, list_high: 7200, bill_qty: 12 } },
      { category: 'quantity', numbers: { bill_price: 9999, list_high: 1, bill_qty: 1 } },
      { category: 'price', numbers: { over_list_twd: 1000 } },
    ]
    expect(overList(checks)).toBe(354000 + 1000)
  })

  it('shows NT$ figures inside the API text in USD', () => {
    expect(moneyInText('Camphor NT$4,200: about 37% under your installed list (6,200–7,200)', 'usd', rate))
      .toBe('Camphor $129: about 37% under your installed list ($191–222)')
    expect(moneyInText('Your list: PV-1 NT$1,300–2,300 per m².', 'usd', rate)).toBe('Your list: PV-1 $40–71 per m².')
    expect(moneyInText('NT$4,200', 'twd', rate)).toBe('NT$4,200')
  })
})
