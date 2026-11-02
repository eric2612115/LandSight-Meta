/** / — the product's home: projects, their packages (folders) and each package's runs (GET /api/packages/{id}/runs)
 * with the scoreboard by scenario. New project, Add package (a folder path, or one of the three samples), Review
 * (runs it, with progress), Open (the run on /review?run=<id>). The firm's price list is shared by every project. */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { beginCascade } from '../app/cascade'
import { useNav, useUI } from '../app/state'
import { useResolvedSource, useRunSel } from '../lib/api'
import { fmt } from '../lib/format'
import { countsOf, runRows, SAMPLES, useAddPackage, useNewProject, usePackageRuns, useProjects, useProjectStore, useReviewPackage, whereRun, type Package, type Project, type RunSummary } from '../lib/projects'
import { CATCHES, SCENARIO_NAME, scenarioSlices } from '../lib/scenario'
import type { Run } from '../lib/types'
import { Tree } from './Open'

export const shortPkg = (p: Project | undefined, name: string) => (p && name.startsWith(`${p.name} — `) ? name.slice(p.name.length + 3) : name)

export function Projects({ run }: { run?: Run }) {
  const { projects, live, loading, error } = useProjects()
  const ui = useUI()
  const here = whereRun(projects, run)
  const pkgId = ui.pkg ?? here.pkg?.package_id ?? projects[0]?.packages[0]?.package_id
  const project = projects.find((p) => p.packages.some((k) => k.package_id === pkgId)) ?? projects[0]
  const pkg = project?.packages.find((k) => k.package_id === pkgId)
  const [naming, setNaming] = useState<string | null>(null)
  const newProject = useNewProject()

  return (
    <div className="grid h-[1004px] gap-px bg-line" style={{ gridTemplateColumns: '580px 1fr' }}>
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-pane">
        <div className="ph">Projects <span className="r flex items-center gap-3">{live ? 'landsight.db' : 'recorded reviews (docs/STACK.md)'}<button className="btn !py-0.5" onClick={() => setNaming(naming === null ? '' : null)}>New project</button><button className="btn primary !py-0.5" onClick={() => window.location.assign(`/try${window.location.search}`)}>Quick review →</button></span></div>
        <AnimatePresence>
          {naming !== null && (
            <motion.div className="flex gap-2 border-b border-line-2 p-3" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <input autoFocus className="field" placeholder="Project name — e.g. Riverside Court" value={naming} onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && naming.trim()) newProject.mutate(naming.trim(), { onSuccess: () => setNaming(null) }) }} />
              <button className="btn primary" disabled={!naming.trim() || newProject.isPending} onClick={() => newProject.mutate(naming.trim(), { onSuccess: () => setNaming(null) })}>Create</button>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <p className="px-4 py-2 text-ink">{error}</p>}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {loading && <p className="px-4 py-3 text-ink-2">Reading landsight.db…</p>}
          {projects.map((p) => (
            <div key={p.project_id}>
              <div className="g">{p.name}<span className="r">{p.packages.length} {p.packages.length === 1 ? 'package' : 'packages'} · since {p.created_at.slice(0, 10)}</span></div>
              {p.packages.length === 0 && <div className="px-4 py-2 text-ink-3">No package yet — add a folder on the right.</div>}
              {p.packages.map((k) => {
                const r = k.latest_run
                const on = k.package_id === pkgId
                return (
                  <div key={k.package_id} className={`cursor-pointer border-l-2 px-4 py-1.5 ${on ? 'border-blue bg-blue-soft' : 'border-transparent hover:bg-hover'}`} onClick={() => ui.set({ pkg: k.package_id })}>
                    <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                      <span className={`overflow-hidden text-ellipsis ${on ? 'font-medium' : ''}`}>{shortPkg(p, k.name)}</span>
                      <span className="text-ink-2">{k.file_count !== undefined ? `${k.file_count} files · ` : ''}added {k.registered_at.slice(0, 10)}</span>
                    </div>
                    <div className="mono mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-ink-3">
                      {r ? `${k.runs} ${k.runs === 1 ? 'run' : 'runs'} · last ${r.mode} · ${scoreLine(r)}` : 'not reviewed yet'}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <AddPackage projects={projects} project={project} />
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-pane">
        {pkg && project ? <PackageDetail project={project} pkg={pkg} run={run} /> : <div className="p-6 text-ink-2">Create a project, then add the developer’s folder.</div>}
      </section>
    </div>
  )
}

const NO_RUNS: RunSummary[] = []

export const scoreLine = (r: Pick<RunSummary, 'planted' | 'found' | 'flagged' | 'missed' | 'false_alarms'>) =>
  `planted ${r.planted} · found ${r.found} · flagged ${r.flagged} · missed ${r.missed} · false alarms ${r.false_alarms}`

function AddPackage({ projects, project }: { projects: Project[]; project?: Project }) {
  const [path, setPath] = useState('')
  const [to, setTo] = useState<number | undefined>()
  const add = useAddPackage()
  const ui = useUI()
  const go = useNav((s) => s.go)
  const target = to ?? project?.project_id
  const submit = (p: string) => target !== undefined && add.mutate({ projectId: target, path: p }, { onSuccess: (k) => { setPath(''); ui.set({ pkg: k.package_id }) } })
  return (
    <div className="border-t border-line p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-semibold">Add package</span>
        <select className="border-0 bg-transparent text-ink-2" value={target} onChange={(e) => setTo(Number(e.target.value))}>
          {projects.map((p) => <option key={p.project_id} value={p.project_id}>to {p.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <input className="field" placeholder="the developer’s folder — /path/to/package" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && path.trim() && submit(path.trim())} />
        <button className="btn" disabled={!path.trim() || add.isPending} onClick={() => submit(path.trim())}>Add</button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-ink-2">
        add a sample:
        {SAMPLES.map((s) => <button key={s.path} className="btn ghost !px-1.5 !py-0.5 text-blue" onClick={() => submit(s.path)}>{s.name}</button>)}
        <span className="ml-auto" />
        <button className="btn ghost !px-1.5 !py-0.5" onClick={() => go('open')}>Open the sample package →</button>
      </div>
      {add.error && <div className="mt-2 text-ink">{String((add.error as Error).message)}</div>}
    </div>
  )
}

function PackageDetail({ project, pkg, run }: { project: Project; pkg: Package; run?: Run }) {
  const review = useReviewPackage()
  const src = useResolvedSource()
  const go = useNav((s) => s.go)
  const openRun = useRunSel((s) => s.open)
  const curId = useRunSel((s) => s.id)
  const [t0, setT0] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const listing = usePackageRuns(pkg.package_id)
  const session = useProjectStore((s) => s.session[pkg.package_id]) ?? NO_RUNS
  // every run of the package from the listing; until it answers, the package record (its latest run) and this
  // session's reviews, where the run on screen fills in what the summary leaves out (the scenarios, SAM calls)
  const runs = runRows(listing.data, session, pkg.run_list ?? (pkg.latest_run ? [pkg.latest_run] : [])).map((r) =>
    run && r.id === run.run_id ? { ...r, scenarios: r.scenarios ?? countsOf(scenarioSlices(run)), sam_calls: r.sam_calls ?? run.timing.sam_calls } : r)
  const mine = run && runs.some((r) => r.id === run.run_id)
  const latestOpenable = runs.find((r) => r.id && (src === 'live' || r.openable))

  useEffect(() => {
    if (t0 === null) return
    const h = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(h)
  }, [t0])

  /** A fresh review: the run opens on /open and every file gets its verdict in the cascade (app/cascade.ts). */
  const start = (live: boolean) => {
    setT0(Date.now())
    setNow(Date.now())
    review.mutate({ packageId: pkg.package_id, live }, {
      onSuccess: (r) => { setT0(null); beginCascade(r.run_id); openRun(r.run_id); go('open') },
      onError: () => setT0(null),
    })
  }
  /** A stored run from the table opens straight on the review. */
  const open = (r: RunSummary) => {
    openRun(r.id)
    go('review')
  }
  const elapsed = t0 !== null ? (now - t0) / 1000 : 0

  return (
    <>
      <div className="flex h-[56px] flex-none items-center justify-between gap-6 border-b border-line-2 px-5">
        <div className="min-w-0">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px]"><span className="text-ink-2">{project.name} ›</span> <b className="font-semibold">{shortPkg(project, pkg.name)}</b></div>
          <div className="mono overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-ink-3">{pkg.folder} · {pkg.kind} · added {pkg.registered_at.slice(0, 10)}{pkg.file_count !== undefined ? ` · ${pkg.file_count} files` : ''}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" disabled={review.isPending || src !== 'live'} onClick={() => start(true)} title={src !== 'live' ? 'needs the live API' : 'asks Muse Spark and SAM 3.1 live (MODEL_API_KEY)'}>Review live</button>
          <button className="btn" disabled={review.isPending || src !== 'live'} onClick={() => start(false)} title={src !== 'live' ? 'needs the live API (landsight serve)' : 'recorded calls'}>{review.isPending ? 'Reviewing…' : 'Review'}</button>
          <button className="btn primary" disabled={!latestOpenable} onClick={() => latestOpenable && open(latestOpenable)}>Open {latestOpenable && latestOpenable.id === runs[0]?.id ? 'latest run' : 'run'} →</button>
        </div>
      </div>
      {review.isPending && (
        <div className="flex-none border-b border-line-2 px-5 py-2.5">
          <div className="relative h-[2px] overflow-hidden bg-line-2">
            <motion.div className="absolute inset-y-0 w-1/3 bg-blue" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
          </div>
          <div className="mt-1.5 text-ink-2">Reviewing · {fmt(elapsed, 1)} s · triage, sheets, geometry, Muse Spark and SAM 3.1 ({review.variables?.live ? 'live' : 'recorded calls'}), checks, rules — the run is written to landsight.db</div>
        </div>
      )}
      {review.error && <div className="flex-none border-b border-line-2 px-5 py-2 text-ink">{String((review.error as Error).message)}</div>}

      <div className="flex-none px-5 pb-1 pt-4 font-semibold">Runs <span className="font-normal text-ink-3">· every review of this folder, newest first{src !== 'live' ? ' · the recorded mock opens the sample’s fixtures run; the others live in landsight.db' : ''}{listing.isLoading ? ' · reading…' : ''}</span></div>
      {listing.error && <div className="flex-none px-5 pb-1 text-ink">The runs of this package could not be read: {String((listing.error as Error).message)}</div>}
      <div className="flex-none px-3">
        <table className="ledger stmt w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: 140 }} /><col style={{ width: 96 }} /><col /><col style={{ width: 76 }} /><col style={{ width: 92 }} /><col style={{ width: 76 }} /><col style={{ width: 70 }} /><col style={{ width: 92 }} /><col style={{ width: 70 }} /><col style={{ width: 70 }} /><col style={{ width: 96 }} /></colgroup>
          <thead><tr><th>Run</th><th>Finished</th><th>Scoreboard</th>{CATCHES.map((s) => <th key={s} className="r" title={`${SCENARIO_NAME[s]}: planted · found + flagged`}>{SCENARIO_NAME[s]}</th>)}<th className="r">Muse Spark</th><th className="r">SAM 3.1</th><th className="r">Time</th><th /></tr></thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={10} className="text-ink-3">Not reviewed yet: Review reads every file and runs every check.</td></tr>}
            {runs.map((r, i) => {
              const openable = !!r.id && (src === 'live' || r.openable)
              return (
                <tr key={`${r.id}-${i}`} className={`${openable ? 'link' : ''} ${r.id && r.id === (curId ?? run?.run_id) ? 'done' : ''}`} onClick={() => openable && open(r)}>
                  <td><span className="mono text-ink-3">{r.id ? r.id.slice(0, 8) : '—'}</span> · {r.mode}</td>
                  <td title={r.finished_at}>{r.finished_at.slice(0, 10)}</td>
                  <td title={r.note}>{scoreLine(r)}</td>
                  {CATCHES.map((s) => {
                    const sl = r.scenarios?.[s]
                    return <td key={s} className="r tnum">{sl ? `${sl.planted}${sl.found !== undefined ? ` · ${sl.found}${sl.flagged ? `+${sl.flagged}` : ''}` : ''}` : '–'}</td>
                  })}
                  <td className="r tnum">{r.spark_calls}</td>
                  <td className="r tnum">{r.sam_calls ?? '–'}</td>
                  <td className="r tnum">{r.total_s ? `${fmt(r.total_s, 1)} s` : '–'}</td>
                  <td className="st">{openable ? <span className="text-blue">Open →</span> : <span title="start the API to open it">in landsight.db</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {runs[0]?.note && <p className="px-2.5 pb-1 pt-1.5 text-ink-3">{runs.map((r) => r.note && `${r.id ? r.id.slice(0, 8) : r.mode}: ${r.note}`).filter(Boolean).join(' · ')}</p>}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-line">
        {mine && run ? <Tree run={run} /> : <FilesHint runs={runs} onOpen={(r) => openRun(r.id)} />}
      </div>
    </>
  )
}

function FilesHint({ runs, onOpen }: { runs: RunSummary[]; onOpen: (r: RunSummary) => void }) {
  const src = useResolvedSource()
  const r = useMemo(() => runs.find((x) => x.id && (src === 'live' || x.openable)), [runs, src])
  return (
    <div className="p-5 text-ink-2">
      Every file of the package gets a verdict and a reason in each run.
      {r ? <> <button className="btn ghost !px-1 !py-0 text-blue" onClick={() => onOpen(r)}>Show the files of run {r.id.slice(0, 8)}</button></> : ' Start the API (landsight serve) to read this folder’s runs.'}
    </div>
  )
}
