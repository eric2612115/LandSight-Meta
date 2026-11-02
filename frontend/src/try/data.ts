/** Where the quick review's data comes from: a sample's stored run (GET /api/runs/{id} on the live API; the recorded
 * greenfield run on ?source=repo), an uploaded folder (lib/upload.ts), the ask (POST /api/ask with `lang`) and a
 * person's decisions (POST …/decision, live only, D-78). */
import { fetchRun, postDecision } from '../lib/api'
import { ask as askRecorded, type Answer } from '../lib/ask'
import type { SourceKind } from '../lib/source'
import type { Run } from '../lib/types'
import { capMessage, detailOf, formOf, NEEDS_LIVE, runOfUpload, uploadingLine, type Picked, type UploadResponse } from '../lib/upload'
import { SAMPLE_RUN, type Sample } from './store'

/** Muse Spark's answer to the film's question, as the API recorded it (tests/fixtures/ask/ask_package__16a0d33f6bc624fe.json,
 * asked live once on run 3d48f7f05e1d; POST /api/ask replays it). */
export const RECORDED_T10 = Object.values(import.meta.glob<Answer>('./recorded-ask.json', { eager: true, import: 'default' }))[0]

export async function loadSample(sample: Sample, src: SourceKind): Promise<Run> {
  if (src !== 'live' && sample === 'tower') throw new Error('The tower’s run is stored in landsight.db: start the API (landsight serve) to open it.')
  const run = await fetchRun(src, src === 'live' ? SAMPLE_RUN[sample] : undefined)
  if (!run) throw new Error('No run')
  return run
}

/** An uploaded folder: the caps, the project (the first, else a new "Quick review"), the multipart POST, the run. */
export async function uploadFolder(files: Picked[], src: SourceKind, onLine: (s: string) => void): Promise<Run> {
  if (src !== 'live') throw new Error(NEEDS_LIVE)
  const cap = capMessage(files)
  if (cap) throw new Error(cap)
  onLine(uploadingLine(files))
  const projects = (await (await fetch('/api/projects', { cache: 'no-store' })).json()) as { project_id: number }[]
  let pid = projects[0]?.project_id
  if (pid === undefined) {
    const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Quick review' }) })
    pid = ((await r.json()) as { project_id: number }).project_id
  }
  const r = await fetch(`/api/projects/${pid}/packages/upload`, { method: 'POST', body: formOf(files) })
  if (!r.ok) throw new Error(await detailOf(r))
  onLine('Reading the package… (the review runs now; about two minutes)')
  return runOfUpload((await r.json().catch(() => ({}))) as UploadResponse)
}

/** POST /api/ask with `lang`; a question with no recording goes live (?live=1, the server records it). Off the live
 * API: the film's recorded answer, else the six recorded answers (lib/askMock.ts). */
export async function askTry(question: string, run: Run, lang: 'en' | 'zh-TW', live: boolean): Promise<Answer> {
  const q = question.trim()
  if (!live) {
    if (q === RECORDED_T10.question) return { ...RECORDED_T10, run_id: run.run_id, via: 'recorded' }
    return askRecorded(q, run, false)
  }
  const post = (url: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, run_id: run.run_id, lang }) })
  let r = await post('/api/ask')
  if (r.status === 404) r = await post('/api/ask?live=1')
  if (!r.ok) throw new Error(await detailOf(r))
  return { ...((await r.json()) as Answer), via: 'live' }
}

/** A person's Confirm / Dismiss, kept by the API on the live source; elsewhere it stays on this screen. */
export function postWord(run: Run, checkId: string, word: 'confirm' | 'dismiss' | 'open', live: boolean) {
  if (!live) return
  postDecision(run.run_id, checkId, word).catch((e: unknown) => console.warn('decision not saved', e))
}
