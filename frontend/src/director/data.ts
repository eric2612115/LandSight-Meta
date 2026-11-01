/** What each scene needs from the run, derived once; a scene whose data is missing is skipped. */
import { bboxOf, centreOf, padBox, spread, unionBox, type BBox } from '../lib/geo'
import { num } from '../lib/format'
import { plantName } from '../lib/english'
import { askedObject, billRows, isRasterSheet, sheetById, tallyKey } from '../lib/model'
import type { Check, DrawingObject, Fix, Item, Run, Scene, Sheet } from '../lib/types'

export const firstPlan = (run: Run) => run.sheets.find((s) => s.counted && s.kind === 'plan') ?? run.sheets[0]

export const sceneSheet = (run: Run, scene: Scene): Sheet | undefined => sheetById(run, scene.sheet_id) ?? firstPlan(run)

export const isOpen = (o: DrawingObject) => !o.closed && (o.gaps?.length ?? 0) > 0

const QUIET = new Set(['legend', 'title_block', 'schedule', 'boundary', 'fire_lane', 'match_line'])

/** Items whose objects sit on the sheet, in run order. */
export function itemsOnSheet(run: Run, sheet: Sheet): Item[] {
  return run.items.filter((it) => it.object_ids.some((id) => sheet.objects.some((o) => o.object_id === id)) && (it.sheet_ids.length === 0 || it.sheet_ids.includes(sheet.sheet_id)))
}

/** The objects the wake scene reveals, west to east. */
export function wakeObjects(run: Run, scene: Scene, sheet: Sheet): DrawingObject[] {
  const focus = scene.focus?.length ? scene.focus : itemsOnSheet(run, sheet).flatMap((it) => it.object_ids)
  return sheet.objects.filter((o) => focus.includes(o.object_id) && !o.excluded && !QUIET.has(o.kind)).sort((a, b) => centreOf(a)[0] - centreOf(b)[0])
}

export const itemOf = (run: Run, sheet: Sheet, objectId: string) =>
  run.items.find((it) => it.object_ids.includes(objectId) && (it.sheet_ids.length === 0 || it.sheet_ids.includes(sheet.sheet_id)))

export function tallyBase(it: Item) {
  const name = plantName(it.label, it.species_code, it.label, it.botanical)
  return { key: tallyKey(it), label: name.common, unit: it.unit === 'plant' ? 'plant' : it.unit === 'm2' ? 'm²' : it.unit }
}

export function eyeData(run: Run, scene: Scene) {
  const sheet = sceneSheet(run, scene)
  if (!sheet) return null
  const item = run.items.find((i) => scene.item_ids?.includes(i.item_id)) ?? run.items.find((i) => !i.agreed)
  if (!item) return null
  const asked = askedObject(run, item)
  const obj = (scene.focus?.length ? sheet.objects.find((o) => o.object_id === scene.focus![0]) : undefined) ?? asked.obj
  if (!obj) return null
  return { sheet, item, obj }
}

export function hedgeData(run: Run, scene: Scene) {
  const sheet = sceneSheet(run, scene)
  if (!sheet) return null
  const item = run.items.find((i) => scene.item_ids?.includes(i.item_id) && i.kind === 'hedge') ?? run.items.find((i) => i.kind === 'hedge')
  if (!item) return null
  const obj = sheet.objects.find((o) => item.object_ids.includes(o.object_id))
  if (!obj) return null
  const check = run.checks.find((c) => num(c.numbers?.spacing_m) !== undefined && (c.evidence.object_ids ?? []).includes(obj.object_id))
  const n = check?.numbers ?? {}
  const b = bboxOf(obj.outline)
  const long = Math.max(b.x1 - b.x0, b.y1 - b.y0)
  const count = item.geometry_count ?? item.quote_count ?? 0
  const rows = num(n.rows) ?? 2
  const length = num(n.length_m) ?? Math.round(long * 10) / 10
  const per = num(n.per_row) ?? Math.round(count / rows)
  const spacing = num(n.spacing_m) ?? (per > 1 ? Math.round((length / (per - 1)) * 100) / 100 : length)
  const legend = sheet.objects.filter((o) => o.kind === 'legend').sort((a, c) => area(c) - area(a))[0]
  const typCheck = run.checks.find((c) => num(c.numbers?.label_at_x) !== undefined)
  const typAt = typCheck ? [num(typCheck.numbers!.label_at_x)!, num(typCheck.numbers!.label_at_y)!] as [number, number] : undefined
  const vertical = b.y1 - b.y0 >= b.x1 - b.x0
  return { sheet, item, obj, count, rows, length, per, spacing, legend, typAt, vertical, box: b }
}

const area = (o: DrawingObject) => {
  const b = bboxOf(o.outline)
  return (b.x1 - b.x0) * (b.y1 - b.y0)
}

export type Mask = { id: string; label: string; polys: number[][][]; centre: [number, number]; sam?: number; cad?: number; pct?: number; tree?: boolean }

export function colourData(run: Run, scene: Scene) {
  const sheet = sceneSheet(run, scene)
  if (!sheet) return null
  const raster = isRasterSheet(run, sheet)
  const masks: Mask[] = []
  const sam = sheet.objects.filter((o) => o.by === 'sam')
  if (sam.length) {
    const trees = sam.filter((o) => o.kind === 'tree')
    if (trees.length) {
      const it = run.items.find((i) => i.kind === 'tree')
      const samArea = trees.reduce((a, o) => a + (o.area_m2 ?? 0), 0)
      masks.push({ id: 'trees', label: `${trees.length} ${plantName(it?.label ?? 'Camphor', it?.species_code).common} canopies`, polys: trees.map((o) => o.outline), centre: centreOfBox(unionBox(trees.map((o) => bboxOf(o.outline)))!), sam: samArea, tree: true })
    }
    for (const o of sam.filter((x) => x.kind !== 'tree')) {
      const it = run.items.find((i) => i.kind === o.kind && i.label.toLowerCase() === (o.label ?? '').toLowerCase()) ?? run.items.find((i) => i.species_code && i.species_code === o.species_code)
      const cad = it?.geometry_count
      masks.push({ id: o.object_id, label: plantName(o.label, o.species_code, o.label).common, polys: [o.outline], centre: centreOf(o), sam: o.area_m2, cad, pct: cad && o.area_m2 ? ((o.area_m2 - cad) / cad) * 100 : undefined })
    }
  } else {
    for (const c of run.checks.filter((x) => x.category === 'area' && num(x.numbers?.sam_m2) !== undefined)) {
      const objs = sheet.objects.filter((o) => (c.evidence.object_ids ?? []).includes(o.object_id))
      if (!objs.length) continue
      const it = itemOf(run, sheet, objs[0].object_id)
      const n = c.numbers!
      const tree = objs.length > 1 && objs.every((o) => o.kind === 'tree')
      const name = plantName(it?.label ?? objs[0].label, it?.species_code ?? objs[0].species_code, it?.label ?? '').common
      masks.push({
        id: c.check_id, label: tree ? `${objs.length} ${name} canopies` : name, polys: objs.map((o) => o.outline), tree,
        centre: centreOfBox(unionBox(objs.map((o) => bboxOf(o.outline)))!), sam: num(n.sam_m2), cad: num(n.cad_m2), pct: num(n.error_pct),
      })
    }
  }
  if (!masks.length) return null
  // the coloured render SAM 3.1 was given, when the run has one; else rasters show themselves and vector sheets are
  // painted from their objects
  const colourHref = sheet.filled_png_url ?? (raster ? sheet.png_url : undefined)
  const site = siteBox(run, sheet)
  const onSheet = (c: Check) => (c.evidence.sheet_ids ?? []).includes(sheet.sheet_id)
  const controlCheck = run.checks.find((c) => c.check_id === scene.control_check_id && c.control) ?? run.checks.find((c) => c.control && onSheet(c))
  const control = controlCheck?.control
  const legendCheck = run.checks.find((c) => c.legend?.length && onSheet(c))
  const promptSource = control?.colour_prompt_source ?? legendCheck?.prompt_source ?? controlCheck?.prompt_source
  // "beige area" -> the legend entry Muse Spark named beige: the words SAM was given came from the legend
  const head = control?.prompt.replace(/\s+(area|circle)$/, '')
  const entry = legendCheck?.legend?.find((l) => l.colour === head)
  const legendLine = promptSource === 'spark_legend' && control && entry
    ? { colour: entry.colour, label: entry.label.replace(/^[A-Z]{1,3}-?\d*\s+/, ''), prompt: control.prompt }
    : undefined
  return { sheet, masks, raster, colourHref, site, control, promptSource, legendLine }
}

const centreOfBox = (b: BBox): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]

/** The planted area of a sheet: its boundary object, else everything that is counted, padded. */
export function siteBox(_run: Run, sheet: Sheet): BBox {
  const boundary = sheet.objects.find((o) => o.kind === 'boundary')
  if (boundary) return padBox(bboxOf(boundary.outline), 2.5)
  const objs = sheet.objects.filter((o) => !QUIET.has(o.kind) && !o.excluded)
  const b = unionBox(objs.map((o) => bboxOf(o.outline)))
  return b ? padBox(b, 3) : { x0: sheet.bounds.min_x, y0: sheet.bounds.min_y, x1: sheet.bounds.max_x, y1: sheet.bounds.max_y }
}

export function gaugeData(run: Run, scene: Scene) {
  const check: Check | undefined = run.checks.find((c) => scene.check_ids?.includes(c.check_id) && num(c.numbers?.required) !== undefined) ??
    run.checks.find((c) => c.category === 'regulation' && num(c.numbers?.required) !== undefined && num(c.numbers?.provided) !== undefined)
  if (!check) return null
  const n = check.numbers!
  const required = num(n.required)!
  const provided = num(n.provided)!
  const sheet = sceneSheet(run, scene)
  if (!sheet) return null
  const before = check.before_downgrade ?? undefined
  const after = check.after_downgrade ?? undefined
  const fixes = ((after ?? check).fixes ?? []).filter((f) => num(f.result) !== undefined)
  const addFix = (st?: { fixes?: Fix[] }) => st?.fixes?.find((f) => f.id === 'a' || /^\+\s*\d+\s/.test(f.label))
  const swapFix = (st?: { fixes?: Fix[] }) => st?.fixes?.find((f) => f.id === 'b' || /swap|change/i.test(f.label))
  const trees = run.items.find((i) => i.kind === 'tree')
  const treeIds = trees ? sheet.objects.filter((o) => trees.object_ids.includes(o.object_id)).sort((a, b) => centreOf(a)[0] - centreOf(b)[0]).map((o) => o.object_id) : []
  const swap = swapFix(after) ?? swapFix(check)
  const k = Number(swap?.label.match(/(?:swap|change)\s+(\d+)/i)?.[1] ?? 1)
  const swapped = swap?.object_ids?.length ? swap.object_ids : spread(treeIds, k)
  const second = swap?.label.match(/(?:for|to)\s+([A-Z][a-z]+)/)?.[1] ?? 'Bischofia'
  const detail = after?.pit ? sheetById(run, after.pit.sheet_id) : run.sheets.find((s) => s.detail)
  const pitCheck = run.checks.find((c) => scene.check_ids?.includes(c.check_id) && c !== check && num(c.numbers?.pit_area_m2) !== undefined)
  return {
    check, required, provided, fixes, sheet, swapped, second, alpha: num(n.alpha), site: siteBox(run, sheet),
    before, after, add0: addFix(before), add1: addFix(after) ?? addFix(check), swap, k, detail, pitCheck,
    A0: num(n.A0), r: num(n.r),
  }
}

export type BillFlag = { id: string; row: number; cell: 'qty' | 'unit' | 'price'; check: Check }

export function billData(run: Run, scene: Scene) {
  const rows = billRows(run)
  if (!rows.length) return null
  const sheet = sceneSheet(run, scene)
  if (!sheet) return null
  const isFlag = (c: Check) => c.severity !== 'info' && c.severity !== 'review'
  const wanted = scene.amber_check_ids?.length ? scene.amber_check_ids : (scene.check_ids ?? [])
  const order = wanted.filter((id) => rows.some((r) => r.checks.some((c) => c.check_id === id && isFlag(c))))
  const ids = order.length ? order : rows.flatMap((r) => r.checks.filter(isFlag).map((c) => c.check_id))
  const flags: BillFlag[] = [...new Set(ids)].slice(0, 3).map((id) => {
    const row = rows.find((r) => r.checks.some((c) => c.check_id === id))!
    const c = row.checks.find((x) => x.check_id === id)!
    const cell = c.category === 'price' ? 'price' as const : c.category === 'units' ? 'unit' as const : 'qty' as const
    return { id, row: row.row, cell, check: c }
  })
  // what the bill hides: flags on the workbook itself (a hidden sheet) and its arithmetic (a subtotal that skips rows)
  const tail = run.checks.filter((c) => scene.check_ids?.includes(c.check_id) && !flags.some((f) => f.id === c.check_id)
    && (c.category === 'arithmetic' || (c.category === 'bill' && isFlag(c))))
  const fileId = rows.map((r) => r.checks.map((c) => c.numbers?.bill_file).find((x) => typeof x === 'string')).find(Boolean) as string | undefined
  const file = (fileId ? run.files.find((f) => f.file_id === fileId) : undefined) ?? run.files.filter((f) => f.verdict === 'bill').sort((a, b) => b.name.localeCompare(a.name))[0]
  return { rows, sheet, flags, tail, fileName: file?.name ?? 'Bill of quantities', site: siteBox(run, sheet) }
}

export function callbackData(run: Run, scene: Scene) {
  const elev = sheetById(run, scene.sheet_id) ?? run.sheets.find((s) => s.kind === 'elevation')
  if (!elev || elev.kind !== 'elevation') return null
  const etrees = elev.objects.filter((o) => o.kind === 'tree').sort((a, b) => centreOf(a)[0] - centreOf(b)[0])
  const plan = (scene.sheet_ids ?? []).map((id) => sheetById(run, id)).find((s) => s && s.counted && s.kind === 'plan') ??
    run.sheets.find((s) => s.counted && s.kind === 'plan' && s.objects.some((o) => o.kind === 'tree' && !o.excluded))
  if (!plan || !etrees.length) return null
  const ptrees = plan.objects.filter((o) => o.kind === 'tree' && !o.excluded && o.by !== 'sam').sort((a, b) => centreOf(a)[0] - centreOf(b)[0])
  const byId = etrees.every((e) => ptrees.some((p) => p.object_id === e.object_id))
  const pairs = byId ? etrees.map((e) => [e, ptrees.find((p) => p.object_id === e.object_id)!] as const) : etrees.slice(0, ptrees.length).map((e, i) => [e, ptrees[i]] as const)
  const check = run.checks.find((c) => scene.check_ids?.includes(c.check_id) && c.category === 'sheet') ?? run.checks.find((c) => c.category === 'sheet' && (c.evidence.sheet_ids ?? []).includes(elev.sheet_id))
  // the enlarged plan whose title and scale bar disagree: product output, never the cause of the bill's twelve
  const scale = run.checks.find((c) => scene.check_ids?.includes(c.check_id) && c.category === 'scale') ??
    run.checks.find((c) => c.category === 'scale' && c.severity !== 'info')
  const enlarged = scale ? sheetById(run, (scale.evidence.sheet_ids ?? [])[0]) : undefined
  const scaleChip = scale && enlarged ? {
    number: enlarged.number,
    title: typeof scale.numbers?.scale_title === 'string' ? scale.numbers.scale_title : enlarged.scale_title,
    measured: typeof scale.numbers?.scale_measured === 'string' ? scale.numbers.scale_measured : enlarged.scale_measured,
    enlarged: /enlarged/i.test(enlarged.title) || /enlarged/i.test(enlarged.not_counted_reason ?? ''),
  } : undefined
  return { elev, plan, pairs, check, scaleChip }
}

export function sceneAvailable(run: Run, s: Scene): boolean {
  switch (s.id) {
    case 'drop': return run.files.length > 0
    case 'wake': return !!sceneSheet(run, s)
    case 'eye': return !!eyeData(run, s)
    case 'hedge': return !!hedgeData(run, s)
    case 'colour': return !!colourData(run, s)
    case 'gauge': return !!gaugeData(run, s)
    case 'bill': return !!billData(run, s)
    case 'callback': return !!callbackData(run, s)
    default: return false
  }
}
