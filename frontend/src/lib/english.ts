/**
 * English only on screen. Any string from the API passes through `en()`: Chinese (CJK) text is mapped through the
 * species table when it names a plant, otherwise stripped; if nothing English is left, the fallback is shown.
 * Keys below are unicode escapes so the source stays ASCII.
 */

const CJK = /[⺀-⿿　-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿豈-﫿＀-￯]/

export const hasCJK = (s: string) => CJK.test(s)

type Species = { common: string; botanical?: string }

const BY_CODE: Record<string, Species> = {
  CC: { common: 'Camphor', botanical: 'Cinnamomum camphora' },
  BJ: { common: 'Bischofia', botanical: 'Bischofia javanica' },
  DE: { common: 'Duranta', botanical: 'Duranta erecta' },
  DU: { common: 'Duranta', botanical: 'Duranta erecta' },
  AZ: { common: 'Azalea', botanical: 'Rhododendron simsii' },
  LN: { common: 'Lawn', botanical: 'Axonopus compressus' },
  RH: { common: 'Azalea', botanical: 'Rhododendron simsii' },
  LW: { common: 'Lawn', botanical: 'Axonopus compressus' },
  KE: { common: 'Flamegold (golden-rain tree)', botanical: 'Koelreuteria elegans' },
  TM: { common: 'Madagascar almond', botanical: 'Terminalia mantaly' },
}

const BY_COMMON: Record<string, Species> = Object.fromEntries(
  Object.values(BY_CODE).map((s) => [s.common.toLowerCase(), s]),
)

/** Phrase table for drawing text and labels from Chinese drawings (longest first). */
const PHRASES: [string, string][] = [
  ['\u7da0\u9091\u793e\u5340\u666f\u89c0\u5de5\u7a0b', 'Greenfield Residences Landscape Works'],
  ['\u690d\u683d\u914d\u7f6e\u5e73\u9762\u5716', 'Planting Plan'],
  ['\u5357\u5411\u7acb\u9762\u5716', 'South Elevation'],
  ['\u92ea\u9762\u8a08\u756b\u5716', 'Paving Plan'],
  ['\u690d\u683d\u8868\u5408\u8a08', 'schedule total'],
  ['\u690d\u7269\u540d\u7a31', 'name'],
  ['\u8a08\u756b\u9053\u8def', 'road'],
  ['\u5de5\u7a0b\u540d\u7a31', 'project'],
  ['\u57fa\u5730\u9762\u7a4d', 'site area'],
  ['\u5c0f\u8449\u6b16\u4ec1', 'Madagascar almond'],
  ['\u690d\u683d\u8868', 'Plant Schedule'],
  ['\u7c73\u9ad8\u5f91', 'cal.'],
  ['\u5efa\u853d\u7387', 'coverage'],
  ['\u91d1\u9732\u82b1', 'Duranta'],
  ['\u900f\u6c34\u78da', 'permeable pavers'],
  ['\u6d17\u77f3\u5b50', 'exposed aggregate'],
  ['\u690d\u8349\u78da', 'grass pavers'],
  ['\u6b12\u6a39', 'Flamegold (golden-rain tree)'],
  ['\u6a1f\u6a39', 'Camphor'],
  ['\u675c\u9d51', 'Azalea'],
  ['\u8349\u76ae', 'lawn'],
  ['\u8349\u576a', 'lawn'],
  ['\u8304\u82f3', 'Bischofia'],
  ['\u82b1\u53f0', 'planter'],
  ['\u5716\u4f8b', 'Legend'],
  ['\u7de8\u865f', 'code'],
  ['\u6578\u91cf', 'qty'],
  ['\u55ae\u4f4d', 'unit'],
  ['\u898f\u683c', 'size'],
  ['\u5099\u8a3b', 'notes'],
  ['\u6a39\u9ad8', 'H'],
  ['\u51a0\u5e45', 'W'],
  ['\u96d9\u6392', '2 rows'],
  ['\u55ac\u6728', 'trees'],
  ['\u5716\u9762', 'drawing'],
  ['\u5716\u540d', 'title'],
  ['\u5716\u865f', 'sheet'],
  ['\u6bd4\u4f8b', 'scale'],
  ['\u65e5\u671f', 'date'],
  ['\u682a', 'ea'],
]

/** The English form of an API string; never returns CJK. */
export function en(s: string | undefined | null, fallback = ''): string {
  if (s === undefined || s === null) return fallback
  if (!hasCJK(s)) return s
  let out = s
  for (const [zh, english] of PHRASES) if (out.includes(zh)) out = out.split(zh).join(` ${english} `)
  out = out.replace(new RegExp(CJK.source, 'g'), ' ').replace(/\s+/g, ' ').replace(/\s+([),.:/])/g, '$1').replace(/([(])\s+/g, '$1').trim()
  out = out.replace(/^[·:,/-]+\s*|\s*[·:,/-]+$/g, '')
  return out && /[A-Za-z0-9]/.test(out) ? out : fallback
}

export function species(label?: string, code?: string): Species | undefined {
  if (code && BY_CODE[code.toUpperCase()]) return BY_CODE[code.toUpperCase()]
  const common = en(label).toLowerCase()
  return BY_COMMON[common]
}

/** "Camphor" + "Cinnamomum camphora", for any item or object label. */
export function plantName(label?: string, code?: string, fallback = '', botanical?: string) {
  const english = en(label, fallback)
  const sp = species(english, code)
  const b = en(botanical, '') || sp?.botanical
  return { common: sp?.common ?? english, botanical: b }
}

const KIND: Record<string, string> = {
  tree: 'tree', existing_tree: 'existing tree', hedge: 'hedge', shrub_bed: 'shrub bed', lawn: 'lawn', paving: 'paving',
  planter_edge: 'planter edge', legend: 'legend', title_block: 'title block', schedule: 'schedule', fire_lane: 'fire lane',
  boundary: 'boundary', match_line: 'match line', building: 'building outline',
}
export const kindName = (k: string) => KIND[k] ?? en(k.replace(/_/g, ' '), 'object')

const UNIT: Record<string, string> = { plant: 'plants', m2: 'm²', m: 'm' }
export const unitName = (u: string) => UNIT[u] ?? en(u, '')
