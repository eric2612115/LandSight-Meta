/** The package as a tree: five groups, every file with its verdict and the reason (B's package tree). */
import { filmSheets, sheetState } from './flags'
import type { FileVerdict, Run } from './types'

export type GroupId = 'drawings' | 'bills' | 'docs' | 'sets' | 'unread'

export const GROUP_NAME: Record<GroupId, string> = {
  drawings: 'Drawings', bills: 'Bills', docs: 'Specs and documents', sets: 'PDF sets, scans, photos', unread: 'Not read',
}

export function groupOf(f: FileVerdict): GroupId {
  switch (f.verdict) {
    case 'drawing_vector':
      return f.ext === 'pdf' ? 'sets' : 'drawings'
    case 'drawing_raster':
    case 'drawing_image':
      return 'sets'
    case 'bill':
      return 'bills'
    case 'spec':
    case 'quote':
    case 'document':
      return 'docs'
    default:
      return 'unread'
  }
}

export type PkgGroup = { id: GroupId; name: string; files: FileVerdict[]; summary: string }

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The latest bill by the date in its name (20261014 > rev2 > rev1a > rev1). */
export const latestBill = (run: Run) =>
  run.files.filter((f) => f.verdict === 'bill').sort((a, b) => billKey(b.name).localeCompare(billKey(a.name)))[0]

const billKey = (name: string) => {
  const m = name.match(/(\d{8})|(\d{4})(-\d)?/)
  if (!m) return name
  if (m[1]) return m[1]
  return `2026${m[2]}${m[3] ?? ''}`
}

export function packageGroups(run: Run): PkgGroup[] {
  const by: Record<GroupId, FileVerdict[]> = { drawings: [], bills: [], docs: [], sets: [], unread: [] }
  for (const f of run.files) by[groupOf(f)].push(f)
  const measured = run.sheets.filter((s) => s.counted).length
  const latest = latestBill(run)
  const pdfs = by.docs.filter((f) => f.ext === 'pdf').length
  const summary: Record<GroupId, string> = {
    drawings: `${count(by.drawings.length, 'DXF', 'DXF')} · ${measured} measured`,
    bills: `${by.bills.length} xlsx${latest ? ` · ${latest.name.replace(/^BOQ - Landscape - /, '').replace(/\.xlsx$/, '').split(' ')[0]} governs` : ''}`,
    docs: `${by.docs.length} files · ${pdfs} PDF read`,
    sets: [
      by.sets.filter((f) => f.verdict === 'drawing_vector').length && `${by.sets.filter((f) => f.verdict === 'drawing_vector').length} vector`,
      by.sets.filter((f) => f.verdict === 'drawing_raster').length && `${by.sets.filter((f) => f.verdict === 'drawing_raster').length} raster`,
      by.sets.filter((f) => f.verdict === 'drawing_image').length && `${count(by.sets.filter((f) => f.verdict === 'drawing_image').length, 'photo')}`,
    ].filter(Boolean).join(' · '),
    unread: by.unread.map((f) => (f.verdict === 'archive_unpacked' ? `1 ${f.ext} (unpacked)` : `.${f.ext}`)).join(' · '),
  }
  return (Object.keys(by) as GroupId[]).filter((g) => by[g].length).map((g) => ({ id: g, name: GROUP_NAME[g], files: by[g], summary: summary[g] }))
}

/** A file's verdict as the tree says it: "measured · governs", "Rev A · superseded", "unsupported — .xls". */
export function verdictOf(run: Run, f: FileVerdict): { text: string; strong?: boolean } {
  const sheet = run.sheets.find((s) => s.sheet_id === f.sheet_id)
  if (sheet && filmSheets(run).includes(sheet)) {
    const st = sheetState(run, sheet)
    return { text: st, strong: st.includes('governs') || st === 'measured' }
  }
  switch (f.verdict) {
    case 'drawing_vector': return { text: `PDF · ${(f.sheet_ids ?? []).length} vector pages` }
    case 'drawing_raster': return { text: 'raster · title block read' }
    case 'drawing_image': return { text: 'photo · read, not measured' }
    case 'bill': return latestBill(run)?.file_id === f.file_id ? { text: 'bill · governs', strong: true } : { text: 'bill · earlier version' }
    case 'quote': return { text: 'quote · read' }
    case 'spec': return { text: 'spec · read' }
    case 'presentation': return { text: 'slide deck · not a drawing' }
    case 'backup_ignored': return { text: 'backup · ignored' }
    case 'archive_unpacked': return { text: 'zip · unpacked' }
    case 'unsupported': return { text: `unsupported · .${f.ext}` }
    case 'unreadable': return { text: 'unreadable' }
    case 'document': return { text: 'document · read' }
    default: return { text: String(f.verdict) }
  }
}

export const BY_NAME: Record<string, string> = { ext: 'extension', content: 'content', spark: 'Muse Spark' }
