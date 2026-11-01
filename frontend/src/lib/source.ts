import { create } from 'zustand'

/** Where the data comes from: the live backend, the backend agent's mocks at <repo>/frontend-mock, or ours. */
export type SourceKind = 'live' | 'repo' | 'mock'
export type SourcePref = 'auto' | SourceKind

const KEY = 'landsight.source'

function readPref(): SourcePref {
  try {
    const q = new URLSearchParams(window.location.search).get('source')
    if (q === 'live' || q === 'repo' || q === 'mock' || q === 'auto') return q
    const v = window.localStorage.getItem(KEY)
    if (v === 'live' || v === 'repo' || v === 'mock' || v === 'auto') return v
  } catch {
    /* storage may be unavailable */
  }
  return 'auto'
}

type SourceState = {
  pref: SourcePref
  resolved: SourceKind | null
  available: Record<SourceKind, boolean>
  sparkMode?: string
  setPref: (p: SourcePref) => void
  setProbe: (available: Record<SourceKind, boolean>, sparkMode?: string) => void
}

const pick = (pref: SourcePref, a: Record<SourceKind, boolean>): SourceKind =>
  pref !== 'auto' ? pref : a.live ? 'live' : a.repo ? 'repo' : 'mock'

export const useSource = create<SourceState>((set, get) => ({
  pref: readPref(),
  resolved: null,
  available: { live: false, repo: false, mock: true },
  setPref: (pref) => {
    try {
      window.localStorage.setItem(KEY, pref)
    } catch {
      /* ignore */
    }
    set({ pref, resolved: get().resolved === null ? null : pick(pref, get().available) })
  },
  setProbe: (available, sparkMode) => set({ available, sparkMode, resolved: pick(get().pref, available) }),
}))

async function ok(url: string, timeout = 1500): Promise<Response | null> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' })
    return r.ok ? r : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** Probe once now and then every 5 s until the backend answers. */
export function startProbing(): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const probe = async () => {
    const [health, repo] = await Promise.all([ok('/api/health'), ok('/frontend-mock/run.json')])
    let live = false
    let spark: string | undefined
    if (health) {
      try {
        const j = await health.json()
        live = j?.ok === true
        spark = j?.spark
      } catch {
        live = false
      }
    }
    if (stopped) return
    const prev = useSource.getState()
    const next = { live, repo: !!repo, mock: true }
    if (prev.resolved === null || prev.available.live !== next.live || prev.available.repo !== next.repo || prev.sparkMode !== spark) {
      prev.setProbe(next, spark)
    }
    if (!live) timer = setTimeout(probe, 5000)
  }
  void probe()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
