/** Projects → packages → runs (landsight.db; docs/API.md "Stable data"). Live: GET /api/projects, POST /api/projects,
 * POST /api/projects/{id}/packages, POST /api/packages/{id}/review, and GET /api/packages/{id}/runs for every run of
 * the package on screen. On the repo source the sample's listing is frontend-mock/package_runs.json (it holds exactly
 * the run the mock opens); the rest of the list is the record of the reviews in docs/STACK.md (the tower, the
 * held-out package), which only the API can open. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { normalise, useResolvedSource } from './api'
import { CATCHES, scenarioSlices, type ScenarioSlice, type Scenario } from './scenario'
import type { Run } from './types'

/** One scenario's cell in the Runs table: planted · found+flagged (the tower's record has only the planted count). */
export type ScenarioCounts = { planted: number; found?: number; flagged?: number; missed?: number; false_alarms?: number }

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
  scenarios?: Partial<Record<Scenario, ScenarioCounts>>
  /** the mock: whether this run can be opened without the API */
  openable?: boolean
  note?: string
}

export type Counts = { planted: number; found: number; flagged: number; missed: number; false_alarms: number }

/** GET /api/packages/{package_id}/runs, one per review, newest first (docs/API.md "RunSummary"). */
export type PackageRun = {
  run_id: string
  created_at: string
  finished_at: string
  source: 'fixtures' | 'live' | string
  scoreboard: Counts
  by_scenario: Partial<Record<Scenario, Counts>>
  seconds: number
  calls: { spark: number; sam: number }
}

/** The Run's slices (ids per scenario) as the table's counts. */
export function countsOf(slices: Partial<Record<Scenario, ScenarioSlice>>): Partial<Record<Scenario, ScenarioCounts>> {
  const out: Partial<Record<Scenario, ScenarioCounts>> = {}
  for (const s of CATCHES) {
    const x = slices[s]
    if (x) out[s] = { planted: x.planted, found: x.found.length, flagged: x.flagged.length, missed: x.missed.length, false_alarms: x.false_alarms.length }
  }
  return out
}

/** One row of the Runs table from the API's listing: the scoreboard, the four scenario cells, the calls, the time. */
export function runRowOf(r: PackageRun, openable = true): RunSummary {
  const sb = r.scoreboard ?? { planted: 0, found: 0, flagged: 0, missed: 0, false_alarms: 0 }
  const scenarios: Partial<Record<Scenario, ScenarioCounts>> = {}
  for (const s of CATCHES) {
    const x = r.by_scenario?.[s]
    if (x) scenarios[s] = { planted: x.planted, found: x.found, flagged: x.flagged, missed: x.missed, false_alarms: x.false_alarms }
  }
  return {
    id: r.run_id, mode: r.source, finished_at: r.finished_at ?? r.created_at ?? '',
    planted: sb.planted, found: sb.found, flagged: sb.flagged, missed: sb.missed, false_alarms: sb.false_alarms,
    spark_calls: r.calls?.spark ?? 0, sam_calls: r.calls?.sam, total_s: r.seconds ?? 0, scenarios, openable,
  }
}

/** The rows the table shows. With the listing: the runs reviewed in this tab that the listing does not hold yet (the
 * refetch after a review brings them in, with the stored times), then the listing, newest first. Without one: the
 * session's runs, then what the package record holds (the API's latest_run, or the mock's STACK.md rows). */
export function runRows(listing: RunSummary[] | undefined, session: RunSummary[], known: RunSummary[]): RunSummary[] {
  if (listing) {
    const ids = new Set(listing.map((r) => r.id))
    return [...session.filter((r) => !ids.has(r.id)), ...listing]
  }
  return [...session, ...known.filter((r) => !r.id || !session.some((x) => x.id === r.id))]
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
const GREENFIELD = countsOf({
  quote: slice(10, ['E02', 'E13', 'E17', 'E19', 'E20', 'E21', 'E22', 'E23', 'E24'], ['E18']),
  regulation: slice(5, ['E09', 'E12', 'E14', 'E30'], ['E15']),
  design: slice(11, ['E01', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E10', 'E11', 'E16', 'E29']),
  format: slice(4, ['E25', 'E26', 'E27', 'E28']),
})

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
            scenarios: countsOf({ design: slice(4, ['H01', 'H03', 'H05', 'H10']), quote: slice(3, ['H02', 'H07', 'H08']), regulation: slice(3, ['H06', 'H11'], ['H04']), format: slice(1, ['H09']) }),
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
    spark_calls: run.timing.spark_calls, sam_calls: run.timing.sam_calls, total_s: run.timing.total_s, scenarios: countsOf(scenarioSlices(run)), openable: true,
  }
}

/** frontend-mock/package_runs.json is the sample's listing: MOCK_PROJECTS package 1 (samples/greenfield). */
const REPO_LISTED_PACKAGE = 1

export const packageRunsKey = (src: string | null, packageId?: number) => ['package-runs', src, packageId] as const

/** Every run of a package, newest first: GET /api/packages/{id}/runs on the live source (refetched after a review
 * here), frontend-mock/package_runs.json for the sample on the repo source; nothing on the other packages or the
 * bundled mock (the table then shows what the package record holds). */
export function usePackageRuns(packageId?: number) {
  const src = useResolvedSource()
  const enabled = packageId !== undefined && (src === 'live' || (src === 'repo' && packageId === REPO_LISTED_PACKAGE))
  return useQuery({
    queryKey: packageRunsKey(src, packageId),
    enabled,
    retry: 1,
    queryFn: async (): Promise<RunSummary[]> => {
      const url = src === 'live' ? `/api/packages/${packageId}/runs` : '/frontend-mock/package_runs.json'
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) throw new Error(`GET ${url} → ${r.status}`)
      // the mock holds exactly the run it opens; the API opens any stored run
      return ((await r.json()) as PackageRun[]).map((x) => runRowOf(x, true))
    },
  })
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
      void qc.invalidateQueries({ queryKey: packageRunsKey(src, packageId) })
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
