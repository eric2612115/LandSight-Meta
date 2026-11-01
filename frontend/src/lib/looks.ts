import type { ObjLook } from '../components/SheetView'
import { itemForObject } from './model'
import type { Run, Sheet } from './types'

export const C = {
  graphite: '#3a3f47', cobalt: '#2457ff', violet: '#7a3cff', amber: '#f0a500', amberInk: '#c98a00', green: '#1f9d55', red: '#d92d20', mute: '#8f959e',
}

const QUIET = new Set(['legend', 'title_block', 'schedule', 'boundary', 'fire_lane', 'match_line'])

/** The plain product: every object in its final state; the selection in cobalt. */
export function plainLooks(run: Run, sheet: Sheet, selected: Set<string>, confirmed: Set<string>): Record<string, ObjLook> {
  const out: Record<string, ObjLook> = {}
  for (const o of sheet.objects) {
    const it = itemForObject(run, sheet.sheet_id, o.object_id)
    const isSel = selected.has(o.object_id)
    let look: ObjLook = {}
    if (o.by === 'sam') {
      look = { fill: C.violet, fillOpacity: 0.2, stroke: C.violet, strokeWidth: 1.6, tag: false }
    } else if (o.excluded || !sheet.counted) {
      look = QUIET.has(o.kind) ? {} : { fill: C.mute, fillOpacity: 0.1, tag: true, tagTone: 'mute' }
    } else if (it) {
      const ok = it.confirmed || confirmed.has(it.item_id)
      const open = !o.closed && (o.gaps?.length ?? 0) > 0
      look = { fill: C.graphite, fillOpacity: 0.08, tag: true, tagTone: 'ink' }
      if (open && !ok) look = { ...look, fill: 'transparent', open: true, stroke: C.amber, strokeWidth: 2.4, gaps: true, gapColour: C.red, tagTone: 'amber' }
      if (open && ok) look = { ...look, fill: C.green, fillOpacity: 0.14, stroke: C.green, strokeWidth: 2.4, tagTone: 'green' }
      if (o.kind === 'hedge' && it.geometry_count) look.dots = it.geometry_count
    }
    if (isSel) look = { ...look, fill: C.cobalt, fillOpacity: 0.16, stroke: C.cobalt, strokeWidth: 2.6, tag: QUIET.has(o.kind) ? look.tag : true, tagTone: 'cobalt' }
    out[o.object_id] = look
  }
  return out
}
