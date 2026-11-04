/** /try: the sample's group table and plain titles against the recorded run (frontend-mock/run.json), the rule and
 * the fallback for other packages, the revision cloud's path. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalise } from '../lib/api'
import { numberRows } from '../lib/flags'
import { isAlarm } from '../lib/scenario'
import type { Check, Run } from '../lib/types'
import { cloudBox, cloudPath } from './cloud'
import { dictionaries, readLang, useLang } from './i18n'
import { changeOf, findingsOf, withConfirmed } from './model'
import { groupOf, plainTitle, SAMPLE, TOWER } from './plain'

const run = normalise(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'frontend-mock', 'run.json'), 'utf8')) as Run, 'repo')
const byId = (id: string) => run.checks.find((c) => c.check_id === id)!

describe('the sample table', () => {
  it('names every alarm of the sample, with the category the run gives it', () => {
    const alarms = run.checks.filter(isAlarm).map((c) => c.check_id).sort()
    expect(Object.keys(SAMPLE).sort()).toEqual(alarms)
    for (const [id, row] of Object.entries(SAMPLE)) expect(byId(id).category, id).toBe(row.category)
  })
  it('groups as the spec says', () => {
    const g = (id: string) => groupOf(byId(id), run)
    expect(['E08', 'E10', 'E16', 'E29', 'E21', 'E23'].map(g)).toEqual(Array(6).fill('send'))
    expect(['E02.2', 'E02', 'E17', 'E13', 'E19', 'E20', 'E22.2', 'E18'].map(g)).toEqual(Array(8).fill('fix'))
    expect(['E14', 'E12', 'E30', 'C-53'].map(g)).toEqual(Array(4).fill('code'))
    expect(['E09', 'E15'].map(g)).toEqual(['ask', 'ask'])
  })
  it('plain titles are short and in both languages', () => {
    for (const [id, row] of Object.entries(SAMPLE)) {
      expect(row.en.split(/\s+/).length, id).toBeLessThanOrEqual(9)
      expect(row.zh.length, id).toBeGreaterThan(0)
    }
    expect(plainTitle(byId('E08'), 'en')).toBe('A tree drawn outside the site')
    expect(plainTitle(byId('E02.2'), 'zh-TW')).toBe('計價 12 株、圖上 8 株')
  })
  it('the money and the change line come from the run: billed 12, drawn 8 → 4 × NT$4,200', () => {
    const f = findingsOf(run).find((x) => x.id === 'E02.2')!
    expect(f.money).toMatchObject({ kind: 'over', twd: 16800, n: 4 })
    expect(changeOf(f, (v) => `NT$${v}`)).toBe('Row 6: 12 → 8 Camphor · NT$16800')
  })
  it('a confirmed T-08 swaps the waiting checks to their confirmed form (209.9 provided)', () => {
    const c = withConfirmed(run, ['I-01'])
    expect(c.checks.find((x) => x.check_id === 'E14')!.numbers!.provided).toBe(209.9)
    expect(c.items.find((x) => x.item_id === 'I-01')!.quote_count).toBe(8)
  })
})

describe('the language a visitor starts in', () => {
  it('takes the address, then the saved choice, then the browser', () => {
    expect(readLang('?lang=en', 'zh-TW', ['zh-TW'])).toBe('en')
    expect(readLang('?lang=zh-TW', 'en', ['en-US'])).toBe('zh-TW')
    expect(readLang('', 'en', ['zh-TW'])).toBe('en')
    expect(readLang('', 'zh-TW', ['en-US'])).toBe('zh-TW')
  })
  it('reads any Chinese browser as the Traditional screen and everything else as English', () => {
    for (const b of ['zh-TW', 'zh-Hant', 'zh-HK', 'zh-MO', 'zh-CN', 'zh-Hans', 'zh']) expect(readLang('', null, [b]), b).toBe('zh-TW')
    for (const b of ['en-US', 'en-GB', 'es-ES', 'ja-JP', 'zu']) expect(readLang('', null, [b]), b).toBe('en')
    expect(readLang('', null, [])).toBe('en')
    expect(readLang('', null)).toBe('en')
  })
  it('goes by the first language the browser lists', () => {
    expect(readLang('', null, ['en-US', 'zh-TW'])).toBe('en')
    expect(readLang('', null, ['zh-TW', 'en-US'])).toBe('zh-TW')
  })
  it('keeps a film take in English on a Chinese browser unless the address asks for Chinese', () => {
    expect(readLang('?director=1', null, ['zh-TW'])).toBe('en')
    expect(readLang('?director=1&lang=zh-TW', null, ['en-US'])).toBe('zh-TW')
  })
})

describe('the change line follows the screen', () => {
  afterEach(() => useLang.setState({ lang: 'en' }))
  const money = (v: number) => `NT$${v}`
  const line = (id: string) => changeOf(findingsOf(run).find((x) => x.id === id)!, money)
  it('stays in English on an English screen', () => {
    expect(line('E02.2')).toBe('Row 6: 12 → 8 Camphor · NT$16800')
    expect(line('E20')).toBe('Row 11: reprice inside your list (NT$1300–NT$2300)')
    expect(line('E21')).toBe('Fix the subtotal: add NT$117190 left out')
    expect(line('E08')).toBe('Revise and reissue')
    expect(line('E17')).toBe('Align the bill with the drawing')
    expect(line('E09')).toBe('Ask the architect to confirm')
  })
  it('is Chinese on a Chinese screen: no English word in any line of the sample', () => {
    useLang.setState({ lang: 'zh-TW' })
    expect(line('E02.2')).toBe('第 6 列：12 → 8 樟樹 · NT$16800')
    expect(line('E13')).toBe('第 8 列：450 → 150 杜鵑 · NT$23250')
    expect(line('E22.2')).toBe('第 11 列：236 → 212 透水鋪面 · NT$91200')
    expect(line('E20')).toBe('第 11 列：依單價表重新計價（NT$1300–NT$2300）')
    expect(line('E21')).toBe('修正小計：補上漏算的 NT$117190')
    expect(line('E08')).toBe('修正後重新發行')
    expect(line('E17')).toBe('讓標單與圖面一致')
    expect(line('E09')).toBe('請建築師確認')
    for (const f of findingsOf(run)) expect(changeOf(f, money), f.id).not.toMatch(/[A-Za-z]{3,}/)
  })
  it('calls a bill 標單 everywhere on the Chinese screen', () => {
    const { ui, data } = dictionaries()
    const zh = [...Object.values(ui), ...Object.values(data), ...Object.values(SAMPLE).map((r) => r.zh), ...Object.values(TOWER).map((r) => r.zh)]
    expect(zh.filter((s) => s.includes('數量表'))).toEqual([])
    expect(ui.Bill).toBe('標單')
    expect(ui['Quantities & quote']).toBe('數量與報價')
  })
  it('has Chinese for every label an open finding of the sample can show, confirmed or not', () => {
    const { ui } = dictionaries()
    const labels = [run, withConfirmed(run, ['I-01'])].flatMap((r) => findingsOf(r).flatMap((f) => numberRows(f.check, money, 99).map(([k]) => k)))
    expect(labels.filter((k) => !ui[k])).toEqual([])
    expect(ui.yes).toBe('是')
  })
})

describe('the tower table', () => {
  const check = (p: Partial<Check>): Check => ({ check_id: 'T09', category: 'area', title: 'Planter drawn over the lift shaft (L-102)', severity: 'fail', by: ['geometry'], why: '', evidence: {}, scenario: 'design', ...p })
  it('sends the planter over the lift shaft back and puts the corridor under the building code', () => {
    const t09 = check({})
    const t10 = check({ check_id: 'T10', category: 'regulation', scenario: 'regulation', title: 'Planters narrow the escape corridor on L-103 to 0.9 m, below the 1.2 m minimum' })
    expect([groupOf(t09), groupOf(t10)]).toEqual(['send', 'code'])
    expect(plainTitle(t09, 'en')).toBe('A planter drawn over the lift shaft')
    expect(plainTitle(t10, 'en')).toBe('Planters narrow the escape corridor to 0.9 m')
    expect(plainTitle(t10, 'zh-TW')).toBe(TOWER.T10.zh)
  })
  it('gives every tower error a plain title, grouped as the rule groups the check (the group from the rule, the title from the table)', () => {
    const tower: Record<string, [Check['category'], string, Check['severity']]> = {
      T01: ['quantity', 'regulation', 'flag'], T02: ['regulation', 'regulation', 'fail'], T03: ['sheet', 'design', 'info'],
      T04: ['sheet', 'design', 'review'], T05: ['quantity', 'design', 'info'], T06: ['quantity', 'quote', 'flag'],
      T07: ['price', 'quote', 'flag'], T08: ['sheet', 'design', 'review'], T09: ['area', 'design', 'fail'], T10: ['regulation', 'regulation', 'fail'],
    }
    expect(Object.keys(TOWER).sort()).toEqual(Object.keys(tower))
    for (const [id, [category, scenario, severity]] of Object.entries(tower)) {
      const c = check({ check_id: id, category, scenario, severity, title: 'the backend title' })
      expect(TOWER[id].category, id).toBe(category)
      expect(plainTitle(c, 'en'), id).toBe(TOWER[id].en)
      expect(plainTitle(c, 'zh-TW'), id).toBe(TOWER[id].zh)
      expect(groupOf(c), id).toBe(TOWER[id].group)
    }
  })
  it('keeps its titles short and leaves another category alone', () => {
    for (const [id, row] of Object.entries(TOWER)) expect(row.en.split(/\s+/).length, id).toBeLessThanOrEqual(9)
    expect(plainTitle(check({ category: 'quantity', title: 'something else' }), 'en')).toBe('something else')
  })
})

describe('another package: the rule and the fallback', () => {
  const check = (p: Partial<Check>): Check => ({ check_id: 'E08', category: 'scale', title: 'L-102 scale bar disagrees', severity: 'flag', by: ['geometry'], why: '', evidence: {}, ...p })
  it('an id the table knows, with another category, is not borrowed', () => {
    const c = check({ scenario: 'design' })
    expect(groupOf(c)).toBe('send')
    expect(plainTitle(c, 'en')).toBe('L-102 scale bar disagrees')
    expect(plainTitle(c, 'zh-TW', (s) => `zh:${s}`)).toBe('zh:L-102 scale bar disagrees')
  })
  it('falls back by scenario and severity', () => {
    expect(groupOf(check({ check_id: 'T06', category: 'quantity', scenario: 'quote' }))).toBe('fix')
    expect(groupOf(check({ check_id: 'T02', category: 'regulation', scenario: 'regulation', severity: 'fail' }))).toBe('code')
    expect(groupOf(check({ check_id: 'X1', category: 'protected_tree', scenario: 'regulation', severity: 'review' }))).toBe('ask')
    expect(groupOf(check({ check_id: 'T08', category: 'sheet', scenario: 'design', severity: 'review' }))).toBe('ask')
  })
})

describe('the revision cloud', () => {
  it('goes around the union box of the objects, padded, in sheet space (y flipped)', () => {
    const b = cloudBox([{ outline: [[10, 2], [12, 2], [12, 4]] }, { outline: [[20, -1], [21, 0]] }], 1)!
    expect(b).toEqual({ x0: 9, y0: -2, x1: 22, y1: 5 })
    const d = cloudPath(b)
    expect(d.startsWith('M9,-5')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    const ends = [...d.matchAll(/A[\d.]+,[\d.]+ 0 0 1 (-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(ends.length).toBeGreaterThanOrEqual(8)
    // every scallop ends on the box's edge, and the last closes at the start
    for (const [x, y] of ends) expect(x === 9 || x === 22 || y === -5 || y === 2).toBe(true)
    expect(ends[ends.length - 1]).toEqual([9, -5])
  })
  it('lands on the T-10 tree of L-1 Rev B', () => {
    const sheet = run.sheets.find((s) => s.sheet_id === 'L-1-revB')!
    const t10 = sheet.objects.find((o) => o.object_id === 'T-10')!
    const b = cloudBox([t10], 0)!
    expect((b.x0 + b.x1) / 2).toBeCloseTo(t10.centre?.[0] ?? 39, 0)
  })
})

describe('clouds on the same objects', () => {
  it('are drawn once with their numbers joined', async () => {
    const { mergeClouds } = await import('./cloud')
    const b = { x0: 0, y0: 0, x1: 4, y1: 4 }
    const m = mergeClouds([{ box: b, n: 8 }, { box: { ...b }, n: 9 }, { box: { x0: 9, y0: 0, x1: 12, y1: 3 }, n: 10 }])
    expect(m.map((x) => x.label)).toEqual(['8·9', '10'])
  })
})
