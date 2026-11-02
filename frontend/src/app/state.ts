/** The app's own state: which screen, what is selected, what the owner decided, and the camera the director moves. */
import { create } from 'zustand'
import { mergeDecisions, type Decision, type Seed } from '../lib/decisions'
import type { Scenario } from '../lib/scenario'
import type { Check } from '../lib/types'

export const isDirector = () => {
  try {
    return new URLSearchParams(window.location.search).get('director') === '1'
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ routes */

export type Route = 'projects' | 'open' | 'review' | 'statement' | 'prices'
export const PATH: Record<Route, string> = { projects: '/', open: '/open', review: '/review', statement: '/statement', prices: '/prices' }

export const routeOf = (path: string): Route =>
  path.startsWith('/review') ? 'review' : path.startsWith('/statement') ? 'statement' : path.startsWith('/prices') ? 'prices' : path.startsWith('/open') ? 'open' : 'projects'

type Nav = { route: Route; go: (r: Route) => void }

/** Routes are real paths (/ projects, /open, /review, /statement, /prices) kept with the query (?source, ?currency); the director
 * moves between screens without touching the address, so `#scene=` and a reload keep working. */
export const useNav = create<Nav>((set) => ({
  route: typeof window === 'undefined' ? 'projects' : isDirector() ? 'open' : routeOf(window.location.pathname),
  go: (route) => {
    if (!isDirector()) {
      try {
        const u = new URL(window.location.href)
        if (u.pathname !== PATH[route]) {
          u.pathname = PATH[route]
          u.hash = ''
          window.history.pushState(null, '', u)
        }
      } catch {
        /* no history */
      }
    }
    set({ route })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (!isDirector()) useNav.setState({ route: routeOf(window.location.pathname) })
  })
}

/* ------------------------------------------------------------------ review UI */

export type Filter = 'need' | 'noted' | 'confirmed' | 'all'

/** What the Ask dock last opened: a sheet with objects, a file row, or a price row; the quote is shown with it. */
export type Highlight = { quote: string; source: string; label?: string; sheetId?: string; objectIds?: string[]; fileId?: string; page?: number; code?: string }

type UI = {
  /** Projects: the package whose runs and files are shown */
  pkg?: number
  selected?: string
  sheetId?: string
  filter: Filter
  compare: boolean
  colour: boolean
  gauge: 'before' | 'after'
  expanded: Partial<Record<Scenario, boolean>>
  askOpen: boolean
  hi?: Highlight
  set: (p: Partial<UI>) => void
}

/** Deep links: ?flag=E09&sheet=L-1-revB&compare=1&colour=1&filter=all&ask=… open the screen on that state. */
function fromUrl(): Partial<UI> {
  try {
    const q = new URLSearchParams(window.location.search)
    if (isDirector()) return {}
    const filter = q.get('filter')
    return {
      selected: q.get('flag') ?? undefined,
      sheetId: q.get('sheet') ?? undefined,
      compare: q.get('compare') === '1',
      colour: q.get('colour') === '1',
      askOpen: q.has('ask'),
      ...(filter === 'need' || filter === 'noted' || filter === 'confirmed' || filter === 'all' ? { filter } : {}),
    }
  } catch {
    return {}
  }
}

export const useUI = create<UI>((set) => ({
  filter: 'need',
  compare: false,
  colour: false,
  gauge: 'after',
  expanded: {},
  askOpen: false,
  ...(typeof window === 'undefined' ? {} : fromUrl()),
  set: (p) => set(p),
}))

/* ------------------------------------------------------------------ decisions */

export type { Decision } from '../lib/decisions'

type Decisions = {
  runId?: string
  d: Record<string, Decision>
  notes: Record<string, string>
  /** seed: what the run's annotations say; opts.checks: the checks' own `decision` words; opts.live: the server is the record */
  load: (runId: string, seed?: Partial<Seed>, opts?: { checks?: Check[]; live?: boolean }) => void
  decide: (checkId: string, state: Decision['state'] | null, source?: Decision['source']) => void
  note: (checkId: string, text: string) => void
  reset: () => void
}

const KEY = (runId: string) => `landsight.decisions.${runId}`

function persist(s: Pick<Decisions, 'runId' | 'd' | 'notes'>) {
  if (!s.runId || isDirector()) return
  try {
    window.localStorage.setItem(KEY(s.runId), JSON.stringify({ d: s.d, notes: s.notes }))
  } catch {
    /* storage may be unavailable */
  }
}

/** Confirmed and dismissed flags with the owner's notes, per run. On the live source the checks' own `decision`
 * words are the record (lib/decisions.ts says how they merge with the Run's annotations and what this browser
 * saved); on the recorded mocks the decision stays in the browser (not in director mode). */
export const useDecisions = create<Decisions>((set, get) => ({
  d: {},
  notes: {},
  load: (runId, seed, opts) => {
    if (get().runId === runId) return
    let saved: Seed = { d: {}, notes: {} }
    if (!isDirector()) {
      try {
        const s = JSON.parse(window.localStorage.getItem(KEY(runId)) ?? '{}') as Partial<Seed>
        saved = { d: s.d ?? {}, notes: s.notes ?? {} }
      } catch {
        /* nothing saved, or unreadable */
      }
    }
    const live = opts?.live === true
    const m = mergeDecisions({ checks: opts?.checks ?? [], annotations: { d: seed?.d ?? {}, notes: seed?.notes ?? {} }, saved, live })
    set({ runId, d: m.d, notes: m.notes })
    // the server is the record on live: what this browser kept for the run is brought in line with it
    if (live) persist({ runId, d: m.d, notes: m.notes })
  },
  decide: (id, state, source = 'screen') => {
    const d = { ...get().d }
    if (state) d[id] = { state, at: Date.now(), source }
    else delete d[id]
    set({ d })
    persist({ ...get(), d })
  },
  note: (id, text) => {
    const notes = { ...get().notes, [id]: text }
    set({ notes })
    persist({ ...get(), notes })
  },
  reset: () => set({ d: {}, notes: {} }),
}))

/* ------------------------------------------------------------------ camera */

export type Cam = { x: number; y: number; k: number; dur: number }
export const STAGE = { w: 1920, h: 1080 }

export const useCamera = create<Cam>(() => ({ x: 0, y: 0, k: 1, dur: 0 }))

/** Frame a stage rectangle (1920 × 1080 coordinates): the camera scales and moves the whole screen. */
export function frame(r: { x: number; y: number; w: number; h: number }, dur = 900, maxK = 2.6) {
  const k = Math.min(maxK, STAGE.w / r.w, STAGE.h / r.h)
  const x = (STAGE.w - r.w * k) / 2 - r.x * k
  const y = (STAGE.h - r.h * k) / 2 - r.y * k
  useCamera.setState({ k, x: Math.min(0, Math.max(STAGE.w - STAGE.w * k, x)), y: Math.min(0, Math.max(STAGE.h - STAGE.h * k, y)), dur })
}

export const wide = (dur = 900) => useCamera.setState({ x: 0, y: 0, k: 1, dur })
