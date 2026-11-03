/** The quick review's state: one task per screen (upload · choose · analyze · review), the run, what is selected for
 * the change request, a person's decisions, the ask's chat and marks, and the in-page camera and cursor the director
 * moves. Nothing here is shared with the review desk's stores except the currency. */
import { create } from 'zustand'
import type { Answer } from '../lib/ask'
import type { Run } from '../lib/types'
import type { Topic } from './plain'

export type Step = 'upload' | 'choose' | 'analyze' | 'review'
export const STEPS: Step[] = ['upload', 'choose', 'analyze', 'review']
export type Sample = 'greenfield' | 'tower'

/** The sample packages' folders as the API lists them (GET /api/projects). */
export const SAMPLE_FOLDER: Record<Sample, string> = { greenfield: 'samples/greenfield', tower: 'samples/tower' }

export type Chip = { sheetId: string; objectId: string; kind: string; sheetNo: string }
export type Turn = { id: number; q: string; shown: string; chip?: Chip; a?: Answer; error?: string; marked?: boolean; added?: boolean }
export type Mark = { id: string; sheetId: string; objectIds: string[]; note: string; question: string }

export type TryState = {
  step: Step
  sample?: Sample
  run?: Run
  /** an upload's or a sample's progress line; an error line */
  busy?: string
  error?: string
  /** rows of the file cascade on screen (Infinity: all) */
  rows: number
  topics: Record<Topic, boolean>
  /** analyze: ms of the replay played so far */
  played: number
  focus?: string
  expanded?: string
  hover?: string
  sheetId?: string
  checked: Record<string, boolean>
  decisions: Record<string, 'confirm' | 'dismiss'>
  /** items a person confirmed here (I-01): the run reads in its `if_confirmed` form */
  confirmed: string[]
  tab: 'findings' | 'ask'
  /** the object under the pointer on the drawing ("sheet/object") */
  hoverObj?: string
  chip?: Chip
  draft: string
  chat: Turn[]
  marks: Mark[]
  drawer: boolean
  set: (p: Partial<TryState>) => void
  reset: () => void
}

const FRESH = {
  step: 'upload' as Step, sample: undefined, run: undefined, busy: undefined, error: undefined, rows: 0,
  topics: { quote: true, code: true, logic: true, files: true }, played: 0, focus: undefined, expanded: undefined, hover: undefined,
  sheetId: undefined, checked: {}, decisions: {}, confirmed: [], tab: 'findings' as const, hoverObj: undefined, chip: undefined,
  draft: '', chat: [], marks: [], drawer: false,
}

export const useTry = create<TryState>((set) => ({ ...FRESH, set: (p) => set(p), reset: () => set({ ...FRESH }) }))

/* ------------------------------------------------------------------ camera and cursor (the director's) */

export type Cam = { x: number; y: number; k: number }
export const useCam = create<Cam>(() => ({ x: 0, y: 0, k: 1 }))

export type Cursor = { x: number; y: number; on: boolean; down: boolean; ripple: number; ghost?: string; label?: string }
export const useCursor = create<Cursor>(() => ({ x: 1500, y: 1180, on: false, down: false, ripple: 0 }))

export const isTryDirector = () => {
  try {
    return new URLSearchParams(window.location.search).get('director') === '1'
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ sound cues */

export type CueName = 'click' | 'stamp' | 'whoosh' | 'type'
let sink: ((name: CueName) => void) | null = null
/** The director's cue log (window.__cues); the screens report their own landings through it. */
export const setCueSink = (f: ((name: CueName) => void) | null) => { sink = f }
export const cue = (name: CueName) => sink?.(name)
