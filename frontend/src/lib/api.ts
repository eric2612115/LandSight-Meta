import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { create } from 'zustand'
import { isDirector, useNav } from '../app/state'
import type { DecisionWord } from './decisions'
import { en, kindName } from './english'
import { useSource, type SourceKind } from './source'
import type { Check, Item, Run, Scene } from './types'

const BASE: Record<SourceKind, string> = { live: '/api', repo: '/frontend-mock', mock: '/mock' }

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', ...init })
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${r.status}`)
  return (await r.json()) as T
}

/** Replace every CJK string in the payload by its English form; URLs and ids are left alone. */
function deepEnglish<T>(v: T): T {
  if (typeof v === 'string') return en(v, '') as T
  if (Array.isArray(v)) return v.map(deepEnglish) as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = /(_url|_id|^path$|^url$)/.test(k) ? x : deepEnglish(x)
    return out as T
  }
  return v
}

const rewrite = (src: SourceKind, url: string | undefined) =>
  url && src === 'repo' && url.startsWith('/api/') ? `/frontend-mock${url}` : url ?? ''

export function normalise(raw: Run, src: SourceKind): Run {
  const run = deepEnglish(raw)
  run.files ??= []
  run.sheets ??= []
  run.items ??= []
  run.checks ??= []
  run.tally ??= []
  run.errors ??= { planted: 0, found: [], flagged: [], missed: [], false_alarms: [] }
  run.timing ??= { total_s: 0, spark_calls: 0, sam_calls: 0 }
  for (const s of run.sheets) {
    s.svg_url = rewrite(src, s.svg_url)
    s.png_url = rewrite(src, s.png_url)
    if (s.filled_png_url) s.filled_png_url = rewrite(src, s.filled_png_url)
    s.title = s.title || s.number || s.sheet_id
    s.objects ??= []
  }
  run.items = run.items.map((it) => normaliseItem(it, src))
  for (const f of run.files) f.ext = (f.ext ?? '').replace(/^\./, '').toLowerCase()
  for (const c of run.checks) normaliseCheck(c)
  return run
}

/** One Check as the screen draws it (in place): the evidence's "sheet/object" refs split into sheet and object ids. */
export function normaliseCheck(c: Check): Check {
  c.evidence ??= {}
  const refs = c.evidence.object_ids ?? []
  if (refs.some((r) => r.includes('/'))) {
    // object ids are unique per sheet only: keep the sheet-qualified refs for drawing them
    c.evidence.refs = refs.filter((r) => r.includes('/'))
    const sheets = new Set(c.evidence.sheet_ids ?? [])
    c.evidence.object_ids = [...new Set(refs.map((r) => {
      const i = r.indexOf('/')
      if (i > 0) sheets.add(r.slice(0, i))
      return i > 0 ? r.slice(i + 1) : r
    }))]
    c.evidence.sheet_ids = [...sheets]
  }
  return c
}

/** POST /api/runs/{run}/checks/{check}/decision: a person's verdict on one check of a stored run (the current run
 * included), with the note when there is one (an absent note clears the stored one). The Check comes back as the
 * run's `checks` list serves it, normalised the same way. 422 for a bad body, 404 for an unknown run or check. */
export async function postDecision(runId: string, checkId: string, decision: DecisionWord, note?: string): Promise<Check> {
  const body: { decision: DecisionWord; note?: string } = { decision }
  if (note) body.note = note
  const raw = await getJSON<Check>(`/api/runs/${encodeURIComponent(runId)}/checks/${encodeURIComponent(checkId)}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return normaliseCheck(deepEnglish(raw))
}

const isPair = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1])

/** One Item as the screen draws it, from GET /api/run or POST /api/items/{id}/confirm alike: the label, the crop URL
 * for the source, and Spark's grounding points as [x, y] metres (`points`) plus fractions of the crop
 * (`points_crop`). The API sends points as { m: [x, y], norm: [0..1000, 0..1000], px, to_segment_m } objects. */
export function normaliseItem(raw: Item, src: SourceKind): Item {
  const it: Item = { ...raw, label: raw.label || kindName(raw.kind) }
  if (it.spark) {
    const sp = { ...it.spark, crop_url: rewrite(src, it.spark.crop_url) }
    const pts = (Array.isArray(sp.points) ? sp.points : []) as unknown[]
    if (pts.length && !pts.every(isPair)) {
      const objs = pts.filter((p): p is { m?: unknown; norm?: unknown } => !!p && typeof p === 'object' && !Array.isArray(p))
      sp.points = objs.map((p) => p.m).filter(isPair).map((m) => [m[0], m[1]] as [number, number])
      const crop = objs.map((p) => p.norm).filter(isPair).map((n) => [n[0] / 1000, n[1] / 1000] as [number, number])
      if (crop.length) sp.points_crop = crop
    }
    if (!Array.isArray(sp.points) || !sp.points.every(isPair)) sp.points = undefined
    if (sp.points_crop && (!Array.isArray(sp.points_crop) || !sp.points_crop.every(isPair))) sp.points_crop = undefined
    it.spark = sp
  }
  return it
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET /api/run; while the backend is opening or reviewing a package it answers 202 {status: "running"} or the
 * previous Run with `stale: true`: ask again (every 1.5 s, `tries` times), and take the stale Run only if the open
 * never finishes. */
export async function liveRun(tries = 40): Promise<Run> {
  let stale: Run | undefined
  for (let i = 0; i < tries; i++) {
    const r = await fetch('/api/run', { cache: 'no-store' })
    if (r.status === 404) throw new Error('GET /api/run → 404')
    if (!r.ok) throw new Error(`GET /api/run → ${r.status}`)
    const body = (await r.json()) as Run & { status?: string }
    if (body.run_id && !body.stale) return body
    if (body.run_id) stale = body
    await wait(1500)
  }
  if (stale) return stale
  throw new Error('GET /api/run: the package is still opening')
}

/** The run on screen: `?run=<id>` (GET /api/runs/{id}), else the server's current run. With no current run the
 * review, Statement and director screens open the sample package (POST /api/package/open, which reviews it and
 * stores a run); the Projects, Open and Prices screens never do — they answer `null` and show "No package open",
 * so visiting the home screen does not add a run to landsight.db. */
export async function fetchRun(src: SourceKind, id?: string, openIfNone = true): Promise<Run | null> {
  if (src === 'live') {
    if (id) return normalise(await getJSON<Run>(`/api/runs/${encodeURIComponent(id)}`), src)
    let run: Run
    try {
      run = await liveRun()
    } catch {
      if (!openIfNone) return null
      run = await getJSON<Run>('/api/package/open', { method: 'POST' })
    }
    return normalise(run, src)
  }
  const run = normalise(await getJSON<Run>(`${BASE[src]}/run.json`), src)
  if (id && id !== run.run_id) throw new Error(`run ${id} is in landsight.db, not in the recording: start the API (landsight serve) to open it`)
  return run
}

/** Which run the screens show: `?run=<id>` in the address, kept across screens. */
export const useRunSel = create<{ id?: string; open: (id?: string) => void }>((set) => ({
  id: typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search).get('run') ?? undefined,
  open: (id) => {
    try {
      const u = new URL(window.location.href)
      if (id) u.searchParams.set('run', id)
      else u.searchParams.delete('run')
      window.history.replaceState(window.history.state, '', u)
    } catch {
      /* no URL */
    }
    set({ id })
  },
}))

export const runKey = (src: SourceKind | null, id?: string) => ['run', src, id ?? 'current'] as const

export async function fetchDirector(src: SourceKind): Promise<Scene[]> {
  const url = src === 'live' ? '/api/director' : `${BASE[src]}/director.json`
  try {
    return deepEnglish(await getJSON<Scene[]>(url))
  } catch {
    // the backend agent's mocks may not carry a director list yet: fall back to ours
    return src === 'mock' ? [] : deepEnglish(await getJSON<Scene[]>('/mock/director.json'))
  }
}

export async function fetchRules(src: SourceKind): Promise<Check[]> {
  const url = src === 'live' ? '/api/rules' : `${BASE[src]}/rules.json`
  try {
    return deepEnglish(await getJSON<Check[]>(url))
  } catch {
    return []
  }
}

export function useResolvedSource() {
  return useSource((s) => s.resolved)
}

export function useRun() {
  const src = useResolvedSource()
  const id = useRunSel((s) => s.id)
  const route = useNav((s) => s.route)
  const wantsRun = isDirector() || route === 'review' || route === 'statement'
  const q = useQuery({ queryKey: runKey(src, id), queryFn: () => fetchRun(src!, id, wantsRun), enabled: !!src, staleTime: Infinity, retry: 1 })
  // the home screen left the query at `null` (no current run); a screen that needs one asks again, and may open the sample
  const { data, isFetching, refetch } = q
  useEffect(() => {
    if (wantsRun && data === null && !isFetching) void refetch()
  }, [wantsRun, data, isFetching, refetch])
  return q
}

export function useDirectorScenes() {
  const src = useResolvedSource()
  return useQuery({ queryKey: ['director', src], queryFn: () => fetchDirector(src!), enabled: !!src, staleTime: Infinity, retry: 0 })
}

export function useRules() {
  const src = useResolvedSource()
  return useQuery({ queryKey: ['rules', src], queryFn: () => fetchRules(src!), enabled: !!src, staleTime: Infinity, retry: 0 })
}

/** The confirmed form of an item, as the backend would return it. */
export function confirmedItem(it: Item): Item {
  return { ...it, confirmed: true, agreed: true, quote_count: it.quote_count ?? it.spark_count ?? it.geometry_count }
}

export function applyConfirm(run: Run, item: Item): Run {
  const items = run.items.map((x) => (x.item_id === item.item_id ? item : x))
  const tally = run.tally.map((t) =>
    (t.species_code && t.species_code === item.species_code) || t.label.toLowerCase() === item.label.toLowerCase()
      ? { ...t, status: 'confirmed' as const, drawn: item.quote_count ?? t.drawn }
      : t,
  )
  return { ...run, items, tally }
}

/** POST /api/items/{id}/confirm, optimistic; in mock modes the confirmation stays local. */
export function useConfirm() {
  const src = useResolvedSource()
  const id = useRunSel((s) => s.id)
  const key = runKey(src, id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: Item) => {
      if (src !== 'live') return confirmedItem(item)
      // the server's Item carries Spark's points as objects: the same normalisation as GET /api/run, before the cache
      return normaliseItem(deepEnglish(await getJSON<Item>(`/api/items/${encodeURIComponent(item.item_id)}/confirm`, { method: 'POST' })), 'live')
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Run>(key)
      if (prev) qc.setQueryData<Run>(key, applyConfirm(prev, confirmedItem(item)))
      return { prev }
    },
    onError: (_e, _item, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSuccess: (item) => {
      const cur = qc.getQueryData<Run>(key)
      if (cur) qc.setQueryData<Run>(key, applyConfirm(cur, item))
      if (src === 'live') void qc.invalidateQueries({ queryKey: key })
    },
  })
}
