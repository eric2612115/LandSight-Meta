/** Ask the package (docs/API.md): POST /api/ask and POST /api/ask/actions on the live backend; the six recorded
 * answers (askMock.ts) and a local apply when the screen runs on the recorded mock. */
import { matchRecorded } from './askMock'
import { scenarioOf } from './scenario'
import type { Check, Run } from './types'

export type ActionKind = 'confirm_element' | 'confirm_price' | 'regulation_note' | 'flag'
export type ProposedAction = { kind: ActionKind; target_id: string; value: string; why: string }
export type Citation = { file_id: string; page: number; quote: string; verified?: boolean; source?: string | null; chunk_id?: string | null }
export type Answer = {
  question: string
  answer: string
  confidence: number
  run_id: string
  ask_id: number | string
  citations: Citation[]
  proposed_actions: ProposedAction[]
  call?: { model: string; seconds: number; recorded: boolean; fixture?: string; usage?: object }
  /** set by the screen: where the answer came from */
  via?: 'live' | 'recorded' | 'none'
}

let seq = 0

/** POST /api/ask; the recorded answer when the screen is not on the live backend. */
export async function ask(question: string, run: Run, live: boolean): Promise<Answer> {
  const q = question.trim()
  if (live) {
    const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, run_id: run.run_id }) })
    if (r.ok) return { ...((await r.json()) as Answer), via: 'live' }
    if (r.status !== 404) throw new Error(`POST /api/ask → ${r.status}`)
    return none(q, run, 'The server has no recording of this question. Start it with live calls (?live=1 and MODEL_API_KEY) and Muse Spark reads the package for it.')
  }
  const seed = matchRecorded(q)
  if (!seed) return none(q, run, 'No recorded answer matches this question. On the live backend with ?live=1, Muse Spark reads the package’s own PDFs, bills and rules and answers it, with citations.')
  return { ...seed, run_id: run.run_id, ask_id: `r${++seq}`, via: 'recorded' }
}

const none = (question: string, run: Run, answer: string): Answer => ({
  question, answer, confidence: 0, run_id: run.run_id, ask_id: `n${++seq}`, citations: [], proposed_actions: [], via: 'none',
})

export type ActionResult = { run?: Run; price_row?: { code: string; low: number; high: number } }

/** POST /api/ask/actions on the live backend (source "ask" or "screen"); the caller applies it locally otherwise. */
export async function postAction(run: Run, action: ProposedAction, source: 'ask' | 'screen'): Promise<ActionResult> {
  const r = await fetch('/api/ask/actions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id: run.run_id, action, source }),
  })
  if (!r.ok) throw new Error(`POST /api/ask/actions → ${r.status}`)
  return (await r.json()) as ActionResult
}

/** "6200-7200" → [6200, 7200]. */
export function priceRange(value: string): [number, number] | null {
  const m = value.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Where a citation opens: a sheet (with the objects its quote names), a check, a package file, or the price list. */
export type CiteTarget =
  | { kind: 'sheet'; sheetId: string; objectIds: string[]; page: number }
  | { kind: 'check'; checkId: string }
  | { kind: 'file'; fileId: string; page: number }
  | { kind: 'prices'; code?: string }

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9.\-² ]/g, ' ').split(/\s+/).filter((w) => w.length > 2))

function bestCheck(quote: string, among: Check[]): Check | undefined {
  const q = tokens(quote)
  let best: { c: Check; s: number } | undefined
  for (const c of among) {
    const hay = tokens(`${c.check_id} ${c.title} ${c.why} ${c.citation?.gloss ?? ''} ${c.citation?.article ?? ''}`)
    const s = [...q].filter((w) => hay.has(w)).length / Math.max(1, q.size)
    if (!best || s > best.s) best = { c, s }
  }
  return best && best.s > 0.2 ? best.c : undefined
}

export function citeTarget(run: Run, c: Citation): CiteTarget | undefined {
  if (c.file_id === 'price-list') return { kind: 'prices', code: c.quote.match(/\b([A-Z]{2}(?:-\d)?)\b/)?.[1] }
  if (c.file_id === 'run') {
    const id = (c.source ?? '').match(/check\s+(\S+)/i)?.[1]
    const hit = (id && run.checks.find((x) => x.check_id === id)) || bestCheck(c.quote, run.checks)
    return hit ? { kind: 'check', checkId: hit.check_id } : undefined
  }
  if (c.file_id === 'rules') {
    const regs = run.checks.filter((x) => scenarioOf(x, run) === 'regulation')
    const hit = bestCheck(c.quote, regs) ?? regs.find((x) => x.citation)
    return hit ? { kind: 'check', checkId: hit.check_id } : undefined
  }
  const f = run.files.find((x) => x.file_id === c.file_id)
  if (!f) return undefined
  const pages = f.sheet_ids ?? (f.sheet_id ? [f.sheet_id] : [])
  const page = pages[Math.max(0, (c.page || 1) - 1)]
  if (page) {
    // a PDF page that copies a drawing opens the measured drawing of the same number
    const pdf = run.sheets.find((s) => s.sheet_id === page)
    const twin = pdf && (pdf.source === 'pdf_vector' || pdf.source === 'pdf_raster')
      ? run.sheets.filter((s) => s.number === pdf.number && s.source !== 'pdf_vector' && s.source !== 'pdf_raster').sort((a, b) => Number(b.counted) - Number(a.counted) || (b.revision ?? '').localeCompare(a.revision ?? ''))[0]
      : undefined
    const sheet = twin ?? pdf
    if (sheet) {
      const q = tokens(c.quote)
      const objectIds = sheet.objects.filter((o) => {
        const lab = tokens(`${o.label ?? ''} ${o.object_id}`)
        return [...lab].some((w) => q.has(w) && w.length > 3)
      }).map((o) => o.object_id).slice(0, 6)
      return { kind: 'sheet', sheetId: sheet.sheet_id, objectIds, page: c.page }
    }
  }
  return { kind: 'file', fileId: f.file_id, page: c.page }
}

export const sourceName = (run: Run, c: Citation) => {
  if (c.file_id === 'run') return c.source ?? 'The review'
  if (c.file_id === 'rules') return 'Regulation table'
  if (c.file_id === 'price-list') return 'Your price list'
  return run.files.find((f) => f.file_id === c.file_id)?.name ?? c.source ?? c.file_id
}

export const ACTION_VERB: Record<ActionKind, string> = {
  confirm_element: 'Confirm element', confirm_price: 'Confirm price', regulation_note: 'Add regulation note', flag: 'Flag to the developer',
}
