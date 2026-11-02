/** /open — open a package: the drop zone (a dropped folder is walked and uploaded, D-81; the click path is a folder
 * picker), a folder path on the API's machine, or the sample; every file with its verdict and the reason (B's package
 * tree, in five groups), the run's facts, and Review. */
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { useCounts } from '../app/derive'
import { upto, useShow } from '../app/show'
import { useNav, useUI } from '../app/state'
import { Mark } from '../components/Brand'
import { normalise, runKey, useResolvedSource, useRunSel } from '../lib/api'
import { bytes, fmt } from '../lib/format'
import { BY_NAME, packageGroups, verdictOf } from '../lib/pkg'
import { packageRunsKey, useNewProject, useProjects } from '../lib/projects'
import { useSource } from '../lib/source'
import type { Run } from '../lib/types'
import { capMessage, detailOf, entriesOf, formOf, fromInput, isLoneZip, NEEDS_LIVE, runOfUpload, uploadingLine, walkEntries, type Picked, type UploadResponse } from '../lib/upload'
import { Pulse } from '../shell/Shell'

const UPLOAD_OFF = 'This API does not take an uploaded folder (its upload flag is off): type the folder’s path below, or open the sample.'

export function Open({ run }: { run?: Run }) {
  const go = useNav((s) => s.go)
  const sh = useShow()
  const src = useResolvedSource()
  const qc = useQueryClient()
  const ui = useUI()
  /** GET /api/health features.upload: false when the API's upload is switched off (LANDSIGHT_FEATURES_OFF=upload) */
  const uploadOn = useSource((s) => s.features?.upload)
  const canUpload = src === 'live' && uploadOn !== false
  const { projects } = useProjects()
  const newProject = useNewProject()
  const [busy, setBusy] = useState(false)
  /** the upload's stage: "Uploading N files (X MB)…", then "Reading the package…" */
  const [stage, setStage] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [path, setPath] = useState('')
  const [over, setOver] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  /** The project an upload goes to: the one selected on the Projects screen, else the first, else a new one. */
  const projectFor = async (): Promise<number> => {
    const sel = projects.find((p) => p.packages.some((k) => k.package_id === ui.pkg)) ?? projects[0]
    if (sel) return sel.project_id
    return (await newProject.mutateAsync('New project')).project_id
  }

  /** POST the walked folder, wait for its review, open the run. */
  const upload = async (files: Picked[]) => {
    setErr(null)
    if (src !== 'live') return setErr(NEEDS_LIVE)
    if (uploadOn === false) return setErr(UPLOAD_OFF)
    const cap = capMessage(files)
    if (cap) return setErr(cap)
    setStage(uploadingLine(files))
    try {
      const pid = await projectFor()
      const r = await fetch(`/api/projects/${pid}/packages/upload`, { method: 'POST', body: formOf(files) })
      if (r.status === 404) throw new Error(UPLOAD_OFF)
      if (!r.ok) throw new Error(await detailOf(r))
      setStage('Reading the package…')
      const body = (await r.json().catch(() => ({}))) as UploadResponse
      const opened = await runOfUpload(body)
      useRunSel.getState().open(opened.run_id)
      qc.setQueryData(runKey(src, opened.run_id), opened)
      const pkgId = body.package?.package_id ?? body.package_id
      if (pkgId !== undefined) ui.set({ pkg: pkgId })
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: packageRunsKey(src, pkgId) })
      go('review')
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally {
      setStage(null)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    // the entries must be taken before anything awaits: the DataTransfer is emptied once the handler returns
    const entries = entriesOf(e.dataTransfer)
    const loose = entries.length ? [] : Array.from(e.dataTransfer.files)
    if (src !== 'live') return setErr(NEEDS_LIVE)
    if (uploadOn === false) return setErr(UPLOAD_OFF)
    if (isLoneZip(entries)) return setErr('A .zip is not opened as a package yet: unpack it and drop the folder.')
    if (!entries.length && !loose.length) return setErr('Nothing to read in that drop: drop the developer’s folder.')
    setErr(null)
    setStage('Reading the folder…')
    walkEntries(entries).then((files) => upload(files.length ? files : fromInput(loose)), (x: unknown) => { setStage(null); setErr(`The folder could not be read: ${String((x as Error)?.message ?? x)}`) })
  }

  const open = async (folder?: string) => {
    setErr(null)
    if (src !== 'live') {
      // the recorded run is the sample package already: show it again, resolving
      useRunSel.getState().open(undefined)
      await qc.invalidateQueries({ queryKey: runKey(src, undefined) })
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/package/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(folder ? { path: folder } : {}) })
      if (!r.ok) throw new Error(`the server answered ${r.status}${r.status === 422 ? ': give a folder path' : ''}`)
      useRunSel.getState().open(undefined)
      qc.setQueryData(runKey(src, undefined), normalise((await r.json()) as Run, 'live'))
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid h-[1004px] gap-px bg-line" style={{ gridTemplateColumns: '580px 1fr' }}>
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-pane">
        <div className="ph">Open a package <span className="r">{src === 'live' ? 'uploaded to the API, or a folder on its machine' : 'recorded run of the sample package'}</span></div>
        <div className="p-4">
          <div className={`relative flex h-[230px] flex-col items-center justify-center gap-2 border-[1.5px] border-dashed text-center transition-colors ${over ? 'border-blue bg-blue-soft' : 'border-[#c4c9d0] bg-hover'}`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = canUpload ? 'copy' : 'none'; setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <Mark size={40} colour="#171a1e" />
            <div className="text-[15px] font-semibold">Drop the developer’s package here</div>
            <div className="max-w-[420px] text-ink-2">{src !== 'live'
              ? 'Dropping a folder needs the live API (landsight serve). This is the recorded run of the sample package.'
              : uploadOn === false
                ? 'This API’s upload is switched off (LANDSIGHT_FEATURES_OFF=upload): type the folder’s path below, or open the sample.'
                : 'The folder as it arrived: drawings, bills, specs, scans and the files nobody can open. Every file gets a verdict and a reason.'}</div>
            {stage ? (
              <div className="mt-2 flex items-center gap-2 text-ink">
                <span className="relative inline-block h-[2px] w-[120px] overflow-hidden bg-line-2"><motion.span className="absolute inset-y-0 w-1/3 bg-blue" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} /></span>
                <b className="font-medium">{stage}</b>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <button className="btn" disabled={busy || !canUpload} onClick={() => picker.current?.click()} title={src !== 'live' ? 'needs the live API (landsight serve)' : !canUpload ? 'the API’s upload is switched off' : 'the folder, every file inside it'}>Choose a folder…</button>
                <button className="btn primary relative" onClick={() => open()} disabled={busy}>{busy ? 'Reading the package…' : 'Open the sample package'}{sh.pulse === 'drop' && <Pulse />}</button>
              </div>
            )}
            <input ref={picker} type="file" multiple className="hidden" {...{ webkitdirectory: '' }}
              onChange={(e) => { const fs = fromInput(Array.from(e.target.files ?? [])); e.target.value = ''; void upload(fs) }} />
          </div>
          <div className="mt-3 flex gap-2">
            <input className="field" placeholder="or a folder on the API’s machine — /path/to/package" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && path && open(path)} />
            <button className="btn" disabled={!path || busy || src !== 'live'} onClick={() => open(path)} title={src !== 'live' ? 'needs the live API' : ''}>Open</button>
          </div>
          {err && <div className="mt-2 text-ink-2">{err}</div>}
        </div>
        {run && <Facts run={run} />}
        {run && (
          <motion.div className="mt-auto border-t border-line-2 p-4" initial={false} animate={{ opacity: sh.facts === false ? 0 : 1 }}>
            <button className="btn primary relative h-[40px] w-full text-[14px]" onClick={() => go('review')}>
              Review <FlagCount run={run} /> →{sh.pulse === 'review' && <Pulse />}
            </button>
          </motion.div>
        )}
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-pane">
        {run ? <Tree run={run} /> : <div className="p-6 text-ink-2">Reading…</div>}
      </section>
    </div>
  )
}

function FlagCount({ run }: { run: Run }) {
  const c = useCounts(run)
  return <>{c.alarms} flags</>
}

function Facts({ run }: { run: Run }) {
  const sh = useShow()
  const t = run.timing as Run['timing'] & { spark_s?: number; sam_s?: number; mode?: string }
  const c = useCounts(run)
  const sheets = run.sheets.length
  const measured = run.sheets.filter((s) => s.counted).length
  const rows: [string, string][] = [
    ['Run', `${run.run_id.slice(0, 12)} · ${t.mode ?? 'fixtures'}, recorded`],
    ['Files', `${run.package.file_count} in the package · ${run.files.length - run.package.file_count} unpacked from an archive`],
    ['Sheets', `${sheets} read · ${measured} measured`],
    ['Muse Spark', `${t.spark_calls} calls${t.spark_s ? ` · ${fmt(t.spark_s, 1)} s` : ''} · sheet kinds, legends, schedules, the bill’s rows`],
    ['SAM 3.1', `${t.sam_calls} calls${t.sam_s ? ` · ${fmt(t.sam_s, 1)} s` : ''} · areas on the coloured render`],
    ['Geometry', `${measured} sheets measured · outlines, areas, counts`],
    ['Checks', `${run.checks.length} ran · ${c.alarms} need you`],
    ['Total', `${fmt(t.total_s, 1)} s`],
  ]
  return (
    <motion.div className="border-t border-line-2 px-4 py-3" initial={false} animate={{ opacity: sh.facts === false ? 0 : 1 }} transition={{ duration: 0.4 }}>
      <div className="mb-1.5 font-semibold">The run</div>
      <div className="kv" style={{ gridTemplateColumns: '96px 1fr' }}>
        {rows.map(([k, v]) => <span key={k} className="contents"><span>{k}</span><b className="!font-sans !font-normal text-ink">{v}</b></span>)}
      </div>
    </motion.div>
  )
}

export function Tree({ run }: { run: Run }) {
  const sh = useShow()
  const hi = useUI((s) => s.hi)
  const groups = packageGroups(run)
  const total = groups.reduce((a, g) => a + g.files.length, 0)
  const shown = upto(sh.files, total)
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((a, g) => a + g.files.length, 0))
  return (
    <>
      <div className="ph">Package <span className="r">{run.package.name} · {run.package.file_count} files{run.files.length > run.package.file_count ? ` + ${run.files.length - run.package.file_count} unpacked` : ''} · {shown < total ? `${shown} of ${total} read` : 'every file has a verdict and a reason'}</span></div>
      <div className="grid h-[28px] flex-none items-center gap-4 border-b border-line-2 px-4 text-ink-3" style={{ gridTemplateColumns: COLS }}>
        <span>File</span><span>Verdict</span><span>Why</span><span>Decided by</span><span className="text-right">Size</span>
      </div>
      <div data-tree className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {groups.map((g, gi) => {
          const start = starts[gi]
          const vis = Math.max(0, Math.min(g.files.length, shown - start))
          return (
            <div key={g.id}>
              <div className="g">{g.name} <span className="r">{vis === g.files.length ? g.summary : <><i>{vis}</i>reading…</>}</span></div>
              {g.files.map((f, j) => {
                const on = j < vis
                const v = verdictOf(run, f)
                const lit = hi?.fileId === f.file_id
                return (
                  <div key={f.file_id}>
                    <div className={`grid h-[27px] items-center gap-4 border-l-2 px-4 ${lit ? 'border-blue bg-blue-soft' : 'border-transparent'}`} style={{ gridTemplateColumns: COLS }}>
                      <span className={`overflow-hidden text-ellipsis whitespace-nowrap ${f.parent ? 'pl-4 text-ink-2' : ''}`}>{f.parent ? '↳ ' : ''}{f.name}</span>
                      <AnimatePresence initial={false}>
                        {on ? (
                          <motion.span key="v" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={`whitespace-nowrap ${v.strong ? 'text-blue' : 'text-ink'}`}>{v.text}</motion.span>
                        ) : <span key="w" className="text-ink-3">…</span>}
                      </AnimatePresence>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-ink-2" title={f.why}>{on ? f.why : ''}</span>
                      <span className="text-ink-3">{on ? BY_NAME[f.decided_by] ?? f.decided_by : ''}</span>
                      <span className="mono text-right text-ink-3">{bytes(f.size_bytes)}</span>
                    </div>
                    {lit && hi && (
                      <div className="border-l-2 border-blue bg-blue-soft py-1.5 pl-[34px] pr-4 text-ink-2">
                        From the ask{hi.page ? ` · p. ${hi.page}` : ''}: <mark className="q">“{hi.quote}”</mark>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}

const COLS = '420px 230px 1fr 96px 64px'
