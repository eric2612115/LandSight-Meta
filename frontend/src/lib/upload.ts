/** A dropped folder, uploaded (D-81): the walk of what the browser hands over, the caps checked before a byte is
 * sent, the multipart body, and the run that comes back. The request: `POST /api/projects/{project_id}/packages/upload`,
 * multipart/form-data, one `files` part per file whose filename is the file's path relative to where it was dropped,
 * top folder included ("greenfield/L-1 Planting Plan (Rev B).dxf"), in NFC. Hidden files (.DS_Store, ._*, any dot
 * file, Thumbs.db, desktop.ini) are left out, as the server leaves them out of the package's hash. */
import { fetchRun, liveRun, normalise } from './api'
import type { Run } from './types'

export const MB = 1024 * 1024
/** The server's caps (landsight/app/upload.py CAPS): 500 files, 50 MB per file, 100 MB in all. */
export const CAPS = { files: 500, perFile: 50 * MB, total: 100 * MB }

export type Picked = { file: File; path: string }

const SKIP_NAMES = new Set(['Thumbs.db', 'desktop.ini'])
export const isHidden = (name: string) => name.startsWith('.') || SKIP_NAMES.has(name)
export const nfc = (s: string) => s.normalize('NFC')

/** The entries of a drop, taken synchronously (DataTransferItem.webkitGetAsEntry answers null once the drop event has
 * returned): call this first in the drop handler, then walk what it gives. */
export function entriesOf(dt: DataTransfer): FileSystemEntry[] {
  const out: FileSystemEntry[] = []
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue
    const e = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (e) out.push(e)
  }
  return out
}

/** Every entry of a directory: Chrome answers at most 100 per readEntries call, so it is asked again until it answers
 * an empty batch. */
export function readAll(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader()
  const out: FileSystemEntry[] = []
  return new Promise((resolve, reject) => {
    const next = () => reader.readEntries((batch) => {
      if (!batch.length) return resolve(out)
      out.push(...batch)
      next()
    }, reject)
    next()
  })
}

const fileOf = (e: FileSystemFileEntry) => new Promise<File>((resolve, reject) => e.file(resolve, reject))

/** The files under the dropped entries with their relative paths (top folder included), hidden files left out,
 * names in NFC, sorted by path. */
export async function walkEntries(entries: FileSystemEntry[], prefix = ''): Promise<Picked[]> {
  const out: Picked[] = []
  for (const e of entries) {
    const name = nfc(e.name)
    if (isHidden(name)) continue
    const path = prefix ? `${prefix}/${name}` : name
    if (e.isDirectory) out.push(...(await walkEntries(await readAll(e as FileSystemDirectoryEntry), path)))
    else if (e.isFile) out.push({ file: await fileOf(e as FileSystemFileEntry), path })
  }
  return prefix ? out : sorted(out)
}

/** The files of `<input type="file" webkitdirectory>`: the browser gives each its path from the chosen folder down
 * (webkitRelativePath), top folder included. */
export function fromInput(files: Iterable<File>): Picked[] {
  const out: Picked[] = []
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    const path = rel.split('/').map(nfc).join('/')
    if (path.split('/').some(isHidden)) continue
    out.push({ file: f, path })
  }
  return sorted(out)
}

const sorted = (xs: Picked[]) => [...xs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

export const totalBytes = (files: Picked[]) => files.reduce((a, f) => a + f.file.size, 0)

/** The cap the server would answer 413 with, in its own words (upload.py), checked here before anything is sent;
 * null when the upload fits. An empty pick is the 400 the server would give. */
export function capMessage(files: Picked[], caps = CAPS): string | null {
  if (!files.length) return 'an empty upload: no file parts (send one part per file of the dropped folder)'
  if (files.length > caps.files) return `too many files: the cap is ${caps.files} files per upload`
  let total = 0
  for (const f of files) {
    if (f.file.size > caps.perFile) return `file too large: '${f.path}' passes the ${caps.perFile / MB} MB per-file cap`
    total += f.file.size
    if (total > caps.total) return `upload too large: the ${caps.total / MB} MB total cap is passed at '${f.path}'`
  }
  return null
}

/** The multipart body: a `files` part per file, its filename the relative path (NFC). */
export function formOf(files: Picked[]): FormData {
  const fd = new FormData()
  for (const f of files) fd.append('files', f.file, nfc(f.path))
  return fd
}

export const uploadingLine = (files: Picked[]) => `Uploading ${files.length} ${files.length === 1 ? 'file' : 'files'} (${(totalBytes(files) / MB).toFixed(1)} MB)…`

/** A lone .zip: the API unpacks an archive found inside a package, not a dropped archive as the package. */
export const isLoneZip = (entries: { isFile: boolean; name: string }[]) => entries.length === 1 && entries[0].isFile && /\.zip$/i.test(entries[0].name)

export const NEEDS_LIVE = 'Uploading a folder needs the live API (landsight serve): start it and drop the folder again, or open the sample package.'

/** What the endpoint answers (docs/API.md): the Package, the run (null only when the review itself raised, and then
 * `upload.review_error` says why) and the upload's record. The ids are taken too, should an answer carry only those. */
export type UploadResponse = {
  package?: { package_id?: number; name?: string }
  package_id?: number
  run?: Run | null
  run_id?: string
  upload?: { id?: string; folder?: string; files?: number; bytes?: number; skipped?: string[]; reused?: boolean; review_error?: string }
}

/** The server's one-line reason from an error answer ({detail}), else the status. */
export async function detailOf(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { detail?: unknown }
    if (typeof j?.detail === 'string') return j.detail
  } catch {
    /* no JSON body */
  }
  return `the server answered ${r.status}`
}

/** The run of an upload: the one in the answer; else the stored run by id; else the current run once the review
 * finishes (GET /api/run answers 202 meanwhile, as after /review). */
export async function runOfUpload(body: UploadResponse): Promise<Run> {
  if (body.run?.run_id) return normalise(body.run, 'live')
  if (body.upload?.review_error) throw new Error(`The folder was uploaded (${body.upload.folder ?? body.upload.id ?? 'the upload'}) but its review failed: ${body.upload.review_error}`)
  if (body.run_id) {
    try {
      const r = await fetchRun('live', body.run_id)
      if (r) return r
    } catch {
      /* not stored yet: wait for the current run */
    }
  }
  return normalise(await liveRun(240), 'live')
}
