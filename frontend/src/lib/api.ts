import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

function normalise(raw: Run, src: SourceKind): Run {
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
  for (const it of run.items) {
    it.label = it.label || kindName(it.kind)
    if (it.spark) {
      it.spark.crop_url = rewrite(src, it.spark.crop_url)
      // points may come as [x, y] metres or as { m: [x, y], norm: [0..1000, 0..1000], px } objects
      const raw = (it.spark.points ?? []) as unknown[]
      if (raw.length && !Array.isArray(raw[0])) {
        const objs = raw as { m?: [number, number]; norm?: [number, number] }[]
        it.spark.points = objs.filter((p) => Array.isArray(p.m)).map((p) => p.m!)
        const crop = objs.filter((p) => Array.isArray(p.norm)).map((p) => [p.norm![0] / 1000, p.norm![1] / 1000] as [number, number])
        if (crop.length) it.spark.points_crop = crop
      }
      if (!Array.isArray(it.spark.points)) it.spark.points = undefined
    }
  }
  for (const c of run.checks) c.evidence ??= {}
  return run
}

export async function fetchRun(src: SourceKind): Promise<Run> {
  if (src === 'live') {
    try {
      return normalise(await getJSON<Run>('/api/run'), src)
    } catch {
      return normalise(await getJSON<Run>('/api/package/open', { method: 'POST' }), src)
    }
  }
  return normalise(await getJSON<Run>(`${BASE[src]}/run.json`), src)
}

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
  return useQuery({ queryKey: ['run', src], queryFn: () => fetchRun(src!), enabled: !!src, staleTime: Infinity, retry: 1 })
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

function applyConfirm(run: Run, item: Item): Run {
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
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: Item) => {
      if (src !== 'live') return confirmedItem(item)
      return deepEnglish(await getJSON<Item>(`/api/items/${encodeURIComponent(item.item_id)}/confirm`, { method: 'POST' }))
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: ['run', src] })
      const prev = qc.getQueryData<Run>(['run', src])
      if (prev) qc.setQueryData<Run>(['run', src], applyConfirm(prev, confirmedItem(item)))
      return { prev }
    },
    onError: (_e, _item, ctx) => {
      if (ctx?.prev) qc.setQueryData(['run', src], ctx.prev)
    },
    onSuccess: (item) => {
      const cur = qc.getQueryData<Run>(['run', src])
      if (cur) qc.setQueryData<Run>(['run', src], applyConfirm(cur, item))
      if (src === 'live') void qc.invalidateQueries({ queryKey: ['run', src] })
    },
  })
}
