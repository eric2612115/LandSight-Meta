import { createContext, useContext, useEffect } from 'react'
import { create } from 'zustand'
import type { ObjLook, Rect, SheetHandle, View } from '../components/SheetView'
import type { TallyView } from '../components/Tally'
import { sleep } from '../lib/format'
import type { Run, Scene } from '../lib/types'

export const STAGE = { w: 1920, h: 1080 }
export const TOP = 84
export const PANEL_TOP = 96
export const PANEL_MARGIN = 32

/** Where the sheet rests: the stage minus the top band, the tally corner and the right panel. */
export function homeRect(panelW: number, bottom = 860): Rect {
  const left = panelW ? 40 : 140
  const right = panelW ? STAGE.w - PANEL_MARGIN - panelW - 40 : STAGE.w - 140
  return { x: left, y: TOP, w: right - left, h: bottom - TOP }
}

export type DirState = {
  sheetId?: string
  showSheet: boolean
  looks: Record<string, Record<string, ObjLook>>
  tally: TallyView[]
  tallyMode: 'full' | 'compact' | 'hidden'
  panelW: number
  underlay: 'normal' | 'lines'
  pour: number
  view: View
  tagSize: number
}

export const initialDir = (): DirState => ({
  sheetId: undefined,
  showSheet: false,
  looks: {},
  tally: [],
  tallyMode: 'full',
  panelW: 0,
  underlay: 'normal',
  pour: 0,
  view: { k: 1, x: 0, y: 0 },
  tagSize: 28,
})

export const useDir = create<DirState>(() => initialDir())

export const setDir = (p: Partial<DirState>) => useDir.setState(p)

export function setLooks(sheetId: string, update: (prev: Record<string, ObjLook>) => Record<string, ObjLook>) {
  useDir.setState((s) => ({ looks: { ...s.looks, [sheetId]: update(s.looks[sheetId] ?? {}) } }))
}

export function setLook(sheetId: string, objectId: string, look: Partial<ObjLook> | null) {
  setLooks(sheetId, (prev) => {
    const next = { ...prev }
    if (look === null) delete next[objectId]
    else next[objectId] = { ...prev[objectId], ...look }
    return next
  })
}

export function setTally(update: (rows: TallyView[]) => TallyView[]) {
  useDir.setState((s) => ({ tally: update(s.tally) }))
}

/** Insert or update one tally row; new rows go to `at` (default: the end). */
export function upsertTally(row: Partial<TallyView> & { key: string }, at?: number) {
  setTally((rows) => {
    const i = rows.findIndex((r) => r.key === row.key)
    if (i >= 0) return rows.map((r, j) => (j === i ? { ...r, ...row } : r))
    const full = { label: row.key, unit: 'plant', status: 'pending', ...row } as TallyView
    const next = [...rows]
    next.splice(at ?? next.length, 0, full)
    return next
  })
}

export type Slots = {
  sheet: SVGGElement | null
  screen: SVGGElement | null
  html: HTMLDivElement | null
  panel: HTMLDivElement | null
  stage: HTMLDivElement | null
}

export type DirectorApi = {
  run: Run
  scene: Scene
  scenes: Scene[]
  auto: boolean
  sheet: () => SheetHandle | null
  slots: Slots
  /** wait for Enter / a click on the highlighted control; auto mode continues by itself */
  gate: (signal: AbortSignal, autoMs?: number) => Promise<void>
  release: () => void
  confirm: (itemId: string) => void
  done: () => void
}

export const DirectorContext = createContext<DirectorApi | null>(null)

export function useDirector(): DirectorApi {
  const ctx = useContext(DirectorContext)
  if (!ctx) throw new Error('useDirector outside the director')
  return ctx
}

export type Script = { sleep: (ms: number) => Promise<void>; gate: (autoMs?: number) => Promise<void>; signal: AbortSignal }

/** Run a scene's choreography once per mount; aborted on unmount (or a retake). */
export function useScript(run: (s: Script) => Promise<void>) {
  const api = useDirector()
  useEffect(() => {
    const ctl = new AbortController()
    const s: Script = { sleep: (ms) => sleep(ms, ctl.signal), gate: (ms) => api.gate(ctl.signal, ms), signal: ctl.signal }
    run(s).then(
      () => !ctl.signal.aborted && api.done(),
      (e: unknown) => {
        if ((e as { name?: string })?.name !== 'AbortError') console.error(e)
      },
    )
    return () => ctl.abort()
    // the choreography runs once per mount by design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
