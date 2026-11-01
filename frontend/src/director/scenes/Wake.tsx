import { useMemo, useState } from 'react'
import { centreOf } from '../../lib/geo'
import { play } from '../../lib/sound'
import { LOOK, hedgeLater, wakeTally } from '../baseline'
import { setDir, setLook, upsertTally, useDir, useDirector, useScript } from '../core'
import { isOpen, sceneSheet, wakeObjects } from '../data'
import { COLOURS, OnScreen, linear, tween } from './common'

/** The drawing wakes up: a scan line sweeps; closed outlines wash and sprout IDs; the open one pulses amber. */
export function Wake() {
  const api = useDirector()
  const { run, scene, scenes } = api
  const sheet = sceneSheet(run, scene)!
  const objs = useMemo(() => wakeObjects(run, scene, sheet), [run, scene, sheet])
  const plan = useMemo(() => wakeTally(run, scene, scenes), [run, scene, scenes])
  const skipHedge = hedgeLater(scenes, scene)
  const [scan, setScan] = useState<number | null>(null)
  const view = useDir((s) => s.view)

  useScript(async (s) => {
    setDir({ panelW: 0, tallyMode: 'full' })
    await s.sleep(120)
    await api.sheet()?.home({ duration: 0 })
    await s.sleep(650)
    play('whoosh', { volume: 0.5 })
    await s.sleep(350)
    const v = api.sheet()!.view()
    const x0 = v.x + v.k * sheet.bounds.min_x
    const x1 = v.x + v.k * sheet.bounds.max_x
    const order = objs.map((o) => ({ o, sx: v.x + v.k * centreOf(o)[0] })).sort((a, b) => a.sx - b.sx)
    const counts: Record<string, number> = {}
    let i = 0
    const reveal = (o: (typeof objs)[number]) => {
      if (isOpen(o)) return
      const entry = plan.find((e) => e.objects.includes(o.object_id))
      if (o.kind === 'hedge' && skipHedge) {
        setLook(sheet.sheet_id, o.object_id, { tag: true, tagTone: 'ink' })
      } else {
        setLook(sheet.sheet_id, o.object_id, LOOK.washed)
      }
      play('tick', { rate: 1 + Math.min(0.5, i * 0.03) })
      if (entry) {
        const it = run.items.find((x) => x.object_ids.includes(o.object_id))
        const plant = it?.unit === 'plant'
        counts[entry.row.key] = plant ? (counts[entry.row.key] ?? 0) + 1 : entry.row.drawn ?? 0
        upsertTally({ ...entry.row, drawn: counts[entry.row.key], status: 'pending', credit: 'geometry', creditKey: Date.now() })
      }
    }
    await tween(2800, (p) => {
      const x = x0 + (x1 - x0) * p
      setScan(x)
      while (i < order.length && order[i].sx <= x) reveal(order[i++].o)
    }, s.signal, linear)
    setScan(null)
    for (const e of plan) if (e.row.status === 'agreed') upsertTally({ key: e.row.key, status: 'agreed' })
    await s.sleep(900)
    // the one that would not close: still white, then amber
    for (const o of objs.filter(isOpen)) {
      setLook(sheet.sheet_id, o.object_id, { ...LOOK.flagged, pulse: COLOURS.amber, pulseKey: Date.now() })
      const entry = plan.find((e) => e.objects.includes(o.object_id))
      if (entry) upsertTally({ key: entry.row.key, status: 'flagged' })
    }
    play('thud')
    await s.sleep(1400)
    for (const o of objs.filter(isOpen)) setLook(sheet.sheet_id, o.object_id, { pulse: COLOURS.amber, pulseKey: Date.now() })
    await s.sleep(1500)
  })

  if (scan === null) return null
  const top = view.y - view.k * sheet.bounds.max_y
  const bottom = view.y - view.k * sheet.bounds.min_y
  const left = view.x + view.k * sheet.bounds.min_x
  const trail = Math.min(220, scan - left)
  return (
    <OnScreen>
      <defs>
        <linearGradient id="scan-trail" x1="0" x2="1">
          <stop offset="0" stopColor="#2457ff" stopOpacity="0" />
          <stop offset="1" stopColor="#3a3f47" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      <rect x={scan - trail} y={top} width={Math.max(0, trail)} height={bottom - top} fill="url(#scan-trail)" />
      <line x1={scan} x2={scan} y1={top - 6} y2={bottom + 6} stroke="#3a3f47" strokeWidth={2.5} />
      <line x1={scan} x2={scan} y1={top - 6} y2={bottom + 6} stroke="#3a3f47" strokeOpacity={0.18} strokeWidth={10} />
    </OnScreen>
  )
}
