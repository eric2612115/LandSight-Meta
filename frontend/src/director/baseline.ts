/** Each scene's end state, so any scene can start from what the film has shown before it. */
import type { ObjLook } from '../components/SheetView'
import type { TallyView } from '../components/Tally'
import type { Run, Scene } from '../lib/types'
import { initialDir, type DirState } from './core'
import { callbackData, eyeData, hedgeData, isOpen, itemOf, sceneSheet, tallyBase, wakeObjects } from './data'

export const LOOK = {
  washed: { fill: '#3a3f47', fillOpacity: 0.1, tag: true, tagTone: 'ink' } as ObjLook,
  flagged: { fill: 'transparent', open: true, stroke: '#f0a500', strokeWidth: 2.6, tag: true, tagTone: 'amber' } as ObjLook,
  confirmed: { fill: '#1f9d55', fillOpacity: 0.16, stroke: '#1f9d55', strokeWidth: 2.6, tag: true, tagTone: 'green', open: false, gaps: false } as ObjLook,
  greyed: { fill: '#8f959e', fillOpacity: 0.28 } as ObjLook,
}

type End = (st: DirState, run: Run, scene: Scene, scenes: Scene[]) => void

const put = (st: DirState, sheetId: string, id: string, look: ObjLook) => {
  st.looks[sheetId] = { ...st.looks[sheetId], [id]: { ...st.looks[sheetId]?.[id], ...look } }
}

const upsert = (rows: TallyView[], row: TallyView, at?: number) => {
  const i = rows.findIndex((r) => r.key === row.key)
  if (i >= 0) rows[i] = { ...rows[i], ...row }
  else rows.splice(at ?? rows.length, 0, row)
}

export const hedgeLater = (scenes: Scene[], from: Scene) => scenes.slice(scenes.indexOf(from) + 1).some((s) => s.id === 'hedge')

/** Rows the wake scene puts on the tally, and the counts they end on. */
export function wakeTally(run: Run, scene: Scene, scenes: Scene[]): { row: TallyView; objects: string[] }[] {
  const sheet = sceneSheet(run, scene)
  if (!sheet) return []
  const skipHedge = hedgeLater(scenes, scene)
  const out: { row: TallyView; objects: string[] }[] = []
  for (const o of wakeObjects(run, scene, sheet)) {
    const it = itemOf(run, sheet, o.object_id)
    if (!it || (skipHedge && it.kind === 'hedge')) continue
    let entry = out.find((e) => e.row.key === tallyBase(it).key)
    if (!entry) {
      entry = { row: { ...tallyBase(it), drawn: 0, schedule: it.schedule_count, status: 'pending' }, objects: [] }
      out.push(entry)
    }
    entry.objects.push(o.object_id)
  }
  for (const e of out) {
    const it = run.items.find((i) => tallyBase(i).key === e.row.key)!
    const objs = sheet.objects.filter((o) => e.objects.includes(o.object_id))
    e.row.drawn = it.unit === 'plant' ? objs.filter((o) => !isOpen(o)).length : it.geometry_count
    e.row.status = objs.some(isOpen) || !it.agreed ? 'flagged' : 'agreed'
  }
  return out
}

const END: Partial<Record<Scene['id'], End>> = {
  wake: (st, run, scene, scenes) => {
    const sheet = sceneSheet(run, scene)
    if (!sheet) return
    const skipHedge = hedgeLater(scenes, scene)
    for (const o of wakeObjects(run, scene, sheet)) {
      if (o.kind === 'hedge' && skipHedge) put(st, sheet.sheet_id, o.object_id, { tag: true, tagTone: 'ink' })
      else put(st, sheet.sheet_id, o.object_id, isOpen(o) ? LOOK.flagged : LOOK.washed)
    }
    for (const { row } of wakeTally(run, scene, scenes)) upsert(st.tally, row)
  },
  eye: (st, run, scene) => {
    const d = eyeData(run, scene)
    if (!d) return
    put(st, d.sheet.sheet_id, d.obj.object_id, LOOK.confirmed)
    const it = d.item
    const n = it.spark_count ?? it.proposed_count ?? it.quote_count ?? it.geometry_count
    upsert(st.tally, { ...tallyBase(it), drawn: n, spark: it.spark_count, schedule: it.schedule_count, status: 'confirmed', credit: 'confirmed' })
  },
  hedge: (st, run, scene) => {
    const d = hedgeData(run, scene)
    if (!d) return
    put(st, d.sheet.sheet_id, d.obj.object_id, { ...LOOK.washed, dots: d.count })
    if (d.legend) put(st, d.sheet.sheet_id, d.legend.object_id, LOOK.greyed)
    upsert(st.tally, { ...tallyBase(d.item), drawn: d.count, spark: d.item.spark_count, schedule: d.item.schedule_count, status: 'agreed' }, Math.min(1, st.tally.length))
  },
}

export function baseline(run: Run, scenes: Scene[], idx: number): DirState {
  const st = initialDir()
  st.looks = {}
  st.tally = []
  for (let j = 0; j < idx; j++) END[scenes[j].id]?.(st, run, scenes[j], scenes)
  const scene = scenes[idx]
  st.showSheet = scene.id !== 'drop'
  st.sheetId = scene.id === 'callback' ? callbackData(run, scene)?.plan.sheet_id : sceneSheet(run, scene)?.sheet_id
  return st
}
