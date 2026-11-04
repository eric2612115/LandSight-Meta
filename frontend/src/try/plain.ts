/** The quick review's groups and plain titles. For the sample package (Greenfield Residences, the 30 planted errors)
 * an explicit table, checked against frontend-mock/run.json, and a second one for the tower's ten planted errors
 * (T01–T10, checked against the tower's review in tests/test_tower.py): each row names the check's category, and is
 * used only when the check on screen has that id *and* that category, so another package's "E08" never borrows it. Every other check falls back to a rule on its scenario,
 * category and severity, and to the backend's own title. */
import { scenarioOf } from '../lib/scenario'
import type { Check, Run } from '../lib/types'

/** Send back: the drawing or document is wrong or incomplete. Fix: quantities and money. Code: the building code.
 * Ask: the architect has to say (conditionals, a protected tree). */
export type Group = 'send' | 'fix' | 'code' | 'ask'
export const GROUPS: Group[] = ['send', 'fix', 'code', 'ask']

type Row = { group: Group; category: Check['category']; en: string; zh: string }

/** The sample's alarms, id → group and plain title (≤ 9 words, a reviewer's words), EN and zh-TW. */
export const SAMPLE: Record<string, Row> = {
  E08: { group: 'send', category: 'quantity', en: 'A tree drawn outside the site', zh: '樹木畫在基地範圍外' },
  E10: { group: 'send', category: 'area', en: 'Grass pavers drawn over 20 m² of lawn', zh: '植草磚與草坪重疊 20 m²' },
  E16: { group: 'send', category: 'scale', en: 'L-5 is drawn at a different scale', zh: 'L-5 實際比例與圖框不符' },
  E29: { group: 'send', category: 'sheet', en: 'Sheet L-9 is missing from the package', zh: '發包資料缺少圖紙 L-9' },
  E21: { group: 'send', category: 'arithmetic', en: 'The bill’s subtotal leaves out irrigation', zh: '標單小計漏算灌溉系統' },
  E23: { group: 'send', category: 'bill', en: 'The bill hides an older priced sheet', zh: '標單藏有另一份計價工作表' },
  E11: { group: 'send', category: 'area', en: 'Paving code and hatch disagree', zh: '鋪面代碼與填充圖案不一致' },
  'E02.2': { group: 'fix', category: 'quantity', en: 'Billed 12, drawn 8', zh: '計價 12 株、圖上 8 株' },
  E02: { group: 'fix', category: 'quantity', en: 'Schedule says 12 camphor, the plan fewer', zh: '植栽表樟樹 12 株，平面圖較少' },
  E01: { group: 'fix', category: 'quantity', en: 'One tree drawn as 12 loose lines', zh: '一棵樹畫成 12 條散線' },
  E17: { group: 'fix', category: 'units', en: 'Hedge billed by the metre, drawn by plant', zh: '綠籬以米計價、圖上以株計' },
  E13: { group: 'fix', category: 'quantity', en: 'Too few azaleas for the bed', zh: '杜鵑株數不足以種滿花床' },
  E19: { group: 'fix', category: 'price', en: 'Camphor priced 32% under your list', zh: '樟樹單價低於單價表 32%' },
  E20: { group: 'fix', category: 'price', en: 'Pavers priced 65% over your list', zh: '透水鋪面單價高於單價表 65%' },
  'E22.2': { group: 'fix', category: 'quantity', en: 'Pavers billed 236 m², drawn 212 m²', zh: '透水鋪面計價 236 m²、圖上 212 m²' },
  E18: { group: 'fix', category: 'bill', en: 'Bill says “Camphore”: confirm it is camphor', zh: '標單寫「Camphore」：請確認為樟樹' },
  E14: { group: 'code', category: 'regulation', en: 'Greenery short of the code', zh: '綠化量未達法規' },
  E12: { group: 'code', category: 'regulation', en: 'Tree pits too small on the slab', zh: '樓板上的樹穴太小' },
  E30: { group: 'code', category: 'document', en: 'Green building label needs a greening report', zh: '綠建築標章需附綠化量計算書' },
  'C-53': { group: 'code', category: 'regulation', en: 'Too little rain soaks in over the slab', zh: '樓板上方保水不足' },
  E09: { group: 'ask', category: 'regulation', en: 'A tree stands in the fire lane', zh: '樹木擋住消防車道' },
  E15: { group: 'ask', category: 'protected_tree', en: 'A possibly protected tree marked for removal', zh: '可能受保護的老樹標示移除' },
}

/** The tower's (samples/tower) ten planted errors, id → group and plain title, EN and zh-TW. T03 and T05 are found as
 * information (not alarms), so the review shows them only when they become one; their rows keep the rule's group. */
export const TOWER: Record<string, Row> = {
  T09: { group: 'send', category: 'area', en: 'A planter drawn over the lift shaft', zh: '花台畫在電梯井上' },
  T03: { group: 'send', category: 'sheet', en: 'A section sheet, not counted', zh: '剖面圖不列入數量計算' },
  T05: { group: 'send', category: 'quantity', en: 'The same hedge on two floors, counted on each', zh: '兩層樓的同一綠籬，各層分別計算' },
  T06: { group: 'fix', category: 'quantity', en: 'Sky-garden shrubs billed for one floor, not four', zh: '空中花園灌木只計一層、應為四層' },
  T07: { group: 'fix', category: 'price', en: 'Roof lawn priced 57% under your list', zh: '屋頂草坪單價低於單價表 57%' },
  T01: { group: 'code', category: 'quantity', en: 'One sheet drawn for four floors', zh: '一張圖代表四個樓層' },
  T02: { group: 'code', category: 'regulation', en: 'Roof soil too thin for orange jasmine', zh: '屋頂月橘覆土太薄' },
  T10: { group: 'code', category: 'regulation', en: 'Planters narrow the escape corridor to 0.9 m', zh: '花台使逃生走廊淨寬縮至 0.9 m' },
  T04: { group: 'ask', category: 'sheet', en: 'Roof soil depth: two sheets disagree', zh: '屋頂覆土深度：兩張圖不一致' },
  T08: { group: 'ask', category: 'sheet', en: 'Two floor plans are 91% the same', zh: '兩張樓層平面圖有 91% 相同' },
}

const sampleRow = (c: Check): Row | undefined => {
  const r = SAMPLE[c.check_id] ?? TOWER[c.check_id]
  return r && r.category === c.category ? r : undefined
}

/** The group of a check: the sample's table, else the rule — quote → fix; the code → code, unless it hangs on a
 * person's answer (a protected tree, a conditional) → ask; drawings and files: a review → ask, else send back. */
export function groupOf(c: Check, run?: Run): Group {
  const row = sampleRow(c)
  if (row) return row.group
  const s = scenarioOf(c, run)
  const n = c.numbers ?? {}
  if (s === 'quote') return 'fix'
  if (s === 'regulation') return c.category === 'protected_tree' || 'with_lane_as_ap' in n ? 'ask' : 'code'
  return c.severity === 'review' ? 'ask' : 'send'
}

/** The plain title: the sample's table, else the backend's title (translated through the data templates in 中). */
export function plainTitle(c: Check, lang: 'en' | 'zh-TW', translate: (s: string) => string = (s) => s): string {
  const row = sampleRow(c)
  if (row) return lang === 'zh-TW' ? row.zh : row.en
  return lang === 'zh-TW' ? translate(c.title) : c.title
}

/** The four switches on Choose: which findings the review shows (the run holds all). */
export type Topic = 'quote' | 'code' | 'logic' | 'files'
export const TOPICS: Topic[] = ['quote', 'code', 'logic', 'files']
export function topicOf(c: Check, run?: Run): Topic {
  const s = scenarioOf(c, run)
  return s === 'quote' ? 'quote' : s === 'regulation' ? 'code' : s === 'format' ? 'files' : 'logic'
}
