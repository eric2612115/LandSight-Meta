/** Projects → packages → runs (landsight.db; docs/API.md "Stable data"). Live: GET /api/projects, POST /api/projects,
 * POST /api/projects/{id}/packages, POST /api/packages/{id}/review. Until the API answers, the list is the record of
 * the reviews in docs/STACK.md (the sample, the tower, the held-out package), and only the sample's recorded run
 * (frontend-mock/) opens. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { normalise, useResolvedSource } from './api'
import { scenarioSlices, type ScenarioSlice, type Scenario } from './scenario'
import type { Run } from './types'

export type RunSummary = {
  id: string
  mode: 'fixtures' | 'live' | string
  finished_at: string
  planted: number
  found: number
  flagged: number
  missed: number
  false_alarms: number
  spark_calls: number
  total_s: number
  sam_calls?: number
  scenarios?: Partial<Record<Scenario, ScenarioSlice | { planted: number }>>
  /** the mock: whether this run can be opened without the API */
  openable?: boolean
  note?: string
}

export type Package = {
  package_id: number
  project_id: number
  name: string
  folder: string
  kind: 'site' | 'tower' | string
  registered_at: string
  runs: number
  latest_run: RunSummary | null
  file_count?: number
  /** runs this screen knows about (the mock's record; reviews run in this session) */
  run_list?: RunSummary[]
}

export type Project = { project_id: number; name: string; created_at: string; packages: Package[] }

const slice = (planted: number, found: string[], flagged: string[] = []): ScenarioSlice =>
  ({ planted, found, flagged, missed: [], false_alarms: [], checks: 0, alarms: 0 })

/** The sample's scoreboard by scenario (STACK.md: the live pass gave the same as the replay). */
const GREENFIELD = {
  quote: slice(10, ['E02', 'E13', 'E17', 'E19', 'E20', 'E21', 'E22', 'E23', 'E24'], ['E18']),
  regulation: slice(5, ['E09', 'E12', 'E14', 'E30'], ['E15']),
  design: slice(11, ['E01', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E10', 'E11', 'E16', 'E29']),
  format: slice(4, ['E25', 'E26', 'E27', 'E28']),
}

/** What docs/STACK.md records of each sample's reviews (dates, modes, call counts, scoreboards). */
export const MOCK_PROJECTS: Project[] = [
  {
    project_id: 1, name: 'Greenfield Residences', created_at: '2026-11-02',
    packages: [
      {
        package_id: 1, project_id: 1, name: 'Greenfield Residences — Landscape Package', folder: 'samples/greenfield', kind: 'site',
        registered_at: '2026-11-02', runs: 2, file_count: 30, latest_run: null,
        run_list: [
          { id: 'f0790912d712', mode: 'fixtures', finished_at: '2026-11-02', planted: 30, found: 28, flagged: 2, missed: 0, false_alarms: 0, spark_calls: 38, sam_calls: 8, total_s: 9.2, scenarios: GREENFIELD, openable: true, note: 'recorded calls replayed' },
          { id: '3151599bed27', mode: 'live', finished_at: '2026-11-02', planted: 30, found: 28, flagged: 2, missed: 0, false_alarms: 0, spark_calls: 39, sam_calls: 12, total_s: 113.0, scenarios: GREENFIELD, note: 'every call asked again (--fresh all)' },
        ],
      },
      {
        package_id: 2, project_id: 1, name: 'Greenfield Residences — Tower Landscape Package', folder: 'samples/tower', kind: 'tower',
        registered_at: '2026-11-02', runs: 1, file_count: 7, latest_run: null,
        run_list: [
          { id: '', mode: 'fixtures', finished_at: '2026-11-02', planted: 8, found: 6, flagged: 2, missed: 0, false_alarms: 0, spark_calls: 18, sam_calls: 10, total_s: 0,
            scenarios: { quote: { planted: 2 }, regulation: { planted: 2 }, design: { planted: 4 } }, note: 'recorded from one live pass' },
        ],
      },
    ],
  },
  {
    project_id: 2, name: 'Riverside Court', created_at: '2026-11-02',
    packages: [
      {
        package_id: 3, project_id: 2, name: 'Riverside Court — Landscape Package', folder: 'samples/heldout', kind: 'site',
        registered_at: '2026-11-02', runs: 1, file_count: 6, latest_run: null,
        run_list: [
          { id: '', mode: 'live', finished_at: '2026-11-02', planted: 11, found: 10, flagged: 1, missed: 0, false_alarms: 0, spark_calls: 11, sam_calls: 7, total_s: 0,
            scenarios: { design: slice(4, ['H01', 'H03', 'H05', 'H10']), quote: slice(3, ['H02', 'H07', 'H08']), regulation: slice(3, ['H06', 'H11'], ['H04']), format: slice(1, ['H09']) },
            note: 'held out: reviewed once live before any check was looked at against it' },
        ],
      },
    ],
  },
]
for (const p of MOCK_PROJECTS) for (const k of p.packages) k.latest_run = k.run_list?.[0] ?? null

/** The sample folders the backend ships (POST /api/projects/{id}/packages {path}). */
export const SAMPLES = [
  { name: 'Greenfield', path: 'samples/greenfield' },
  { name: 'Tower', path: 'samples/tower' },
  { name: 'Held-out', path: 'samples/heldout' },
]

export function summaryOf(run: Run): RunSummary {
  const e = run.errors
  const t = run.timing as Run['timing'] & { mode?: string }
  return {
    id: run.run_id, mode: t.mode ?? 'fixtures', finished_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    planted: e.planted, found: e.found.length, flagged: e.flagged.length, missed: e.missed.length, false_alarms: e.false_alarms.length,
    spark_calls: run.timing.spark_calls, sam_calls: run.timing.sam_calls, total_s: run.timing.total_s, scenarios: scenarioSlices(run), openable: true,
  }
}

/** The mock's list as edited in this tab, and the runs reviewed in this session (the API lists only the latest). */
export const useProjectStore = create<{ mock: Project[]; session: Record<number, RunSummary[]>; files: Record<number, number> }>(() => ({ mock: MOCK_PROJECTS, session: {}, files: {} }))

export function useProjects() {
  const src = useResolvedSource()
  const st = useProjectStore()
  const q = useQuery({
    queryKey: ['projects'],
    enabled: src === 'live',
    queryFn: async () => {
      const r = await fetch('/api/projects', { cache: 'no-store' })
      if (!r.ok) throw new Error(`GET /api/projects → ${r.status}`)
      return (await r.json()) as Project[]
    },
  })
  const base = src === 'live' ? q.data ?? [] : st.mock
  const projects = base.map((p) => ({
    ...p,
    packages: p.packages.map((k) => {
      const mine = st.session[k.package_id] ?? []
      const known = k.run_list ?? (k.latest_run ? [k.latest_run] : [])
      const list = [...mine, ...known.filter((r) => !mine.some((x) => x.id && x.id === r.id))]
      return { ...k, file_count: k.file_count ?? st.files[k.package_id], run_list: list, latest_run: list[0] ?? k.latest_run }
    }),
  }))
  return { projects, live: src === 'live', loading: src === 'live' && q.isLoading, error: q.error ? String(q.error) : null }
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!r.ok) {
    let why = `${r.status}`
    try {
      const j = await r.json()
      why = typeof j?.detail === 'string' ? j.detail : why
    } catch {
      /* keep the status */
    }
    throw new Error(why)
  }
  return (await r.json()) as T
}

export function useNewProject() {
  const src = useResolvedSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string): Promise<Project> => {
      if (src === 'live') return post<Project>('/api/projects', { name })
      const mock = useProjectStore.getState().mock
      const found = mock.find((p) => p.name.toLowerCase() === name.toLowerCase())
      if (found) return found
      const p: Project = { project_id: Math.max(0, ...mock.map((x) => x.project_id)) + 1, name, created_at: new Date().toISOString().slice(0, 10), packages: [] }
      useProjectStore.setState({ mock: [...mock, p] })
      return p
    },
    onSuccess: () => src === 'live' && qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useAddPackage() {
  const src = useResolvedSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, path }: { projectId: number; path: string }): Promise<Package> => {
      if (src === 'live') return post<Package>(`/api/projects/${projectId}/packages`, { path })
      throw new Error('adding a folder needs the live API (landsight serve): the recorded mock knows only its three samples')
    },
    onSuccess: () => src === 'live' && qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

/** POST /api/packages/{id}/review: the Run comes back whole; it becomes the run on screen. */
export function useReviewPackage() {
  const src = useResolvedSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ packageId, live }: { packageId: number; live?: boolean }): Promise<Run> => {
      if (src !== 'live') throw new Error('a new review needs the live API (landsight serve); the recorded run opens as it is')
      return normalise(await post<Run>(`/api/packages/${packageId}/review${live ? '?live=1' : ''}`), 'live')
    },
    onSuccess: (run, { packageId }) => {
      qc.setQueryData(['run', src, run.run_id], run)
      useProjectStore.setState((s) => ({ session: { ...s.session, [packageId]: [summaryOf(run), ...(s.session[packageId] ?? [])] }, files: { ...s.files, [packageId]: run.package.file_count } }))
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

/** The project and package a run belongs to, for the header's project › package › run. */
export function whereRun(projects: Project[], run: Run | undefined): { project?: Project; pkg?: Package } {
  if (!run) return {}
  const pid = (run as Run & { package_id?: number }).package_id
  for (const p of projects) {
    for (const k of p.packages) {
      if ((pid !== undefined && k.package_id === pid) || k.run_list?.some((r) => r.id === run.run_id) || k.name === run.package.name) return { project: p, pkg: k }
    }
  }
  return {}
}
