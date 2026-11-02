/** Step 1, Upload: a drop zone and two samples; then the package's files cascade in, each with its verdict, grouped
 * (Drawings · Bills · Documents · Scans & photos · Not read), the governing bill lit and the junk grey. */
import { motion } from 'framer-motion'
import { ArrowRight, FileImage, FileSpreadsheet, FileText, FolderOpen, PenTool, Slash } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useResolvedSource } from '../lib/api'
import { entriesOf, fromInput, isLoneZip, walkEntries, type Picked } from '../lib/upload'
import type { FileVerdict, Run } from '../lib/types'
import { loadSample, uploadFolder } from './data'
import { t, td } from './i18n'
import { billRev, FILE_GROUPS, fileGroups, governingBill, type FileGroup } from './model'
import { cue, useTry, type Sample } from './store'

const ROW_MS = 70

export const GROUP_NAME: Record<FileGroup, string> = { drawings: 'Drawings', bills: 'Bills', documents: 'Documents', scans: 'Scans & photos', notread: 'Not read' }
const ICON: Record<FileGroup, typeof FileText> = { drawings: PenTool, bills: FileSpreadsheet, documents: FileText, scans: FileImage, notread: Slash }

export function Upload() {
  const run = useTry((s) => s.run)
  return run ? <Files run={run} /> : <Landing />
}

/** Open a sample's stored run, or an uploaded folder's run; the cascade starts from 0 rows. */
export async function openSample(sample: Sample, src: ReturnType<typeof useResolvedSource>) {
  const set = useTry.getState().set
  set({ sample, busy: t('Opening the sample…'), error: undefined })
  try {
    const run = await loadSample(sample, src ?? 'repo')
    set({ run, rows: 0, busy: undefined })
  } catch (e) {
    set({ busy: undefined, error: String((e as Error).message ?? e) })
  }
}

function Landing() {
  const src = useResolvedSource()
  const { busy, error, set } = useTry()
  const [over, setOver] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const take = async (files: Picked[]) => {
    try {
      set({ error: undefined, sample: undefined })
      const run = await uploadFolder(files, src ?? 'repo', (busy) => set({ busy }))
      set({ run, rows: 0, busy: undefined })
    } catch (e) {
      set({ busy: undefined, error: String((e as Error).message ?? e) })
    }
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const entries = entriesOf(e.dataTransfer)
    const loose = entries.length ? [] : Array.from(e.dataTransfer.files)
    if (isLoneZip(entries)) return set({ error: t('A .zip is not opened as a package yet: unpack it and drop the folder.') })
    set({ busy: t('Reading the folder…') })
    walkEntries(entries).then((fs) => take(fs.length ? fs : fromInput(loose)), (x: unknown) => set({ busy: undefined, error: String(x) }))
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 88 }}>
      <h1 style={{ fontSize: 46, fontWeight: 650, letterSpacing: '-0.03em', margin: 0 }}>{t('Review a developer’s package')}</h1>
      <p className="ink2" style={{ fontSize: 19, margin: '14px 0 40px', maxWidth: 820, textAlign: 'center', lineHeight: 1.5 }}>
        {t('Drop the folder as it came. Every file gets a verdict; the drawings, the bill and the building code are checked against each other.')}
      </p>
      <div data-dir="drop" onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        style={{ width: 1120, height: 380, borderRadius: 28, border: `2px dashed ${over ? 'var(--t-accent)' : 'var(--t-line)'}`, background: over ? 'var(--t-accent-soft)' : 'var(--t-s1)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, transition: 'background 200ms, border-color 200ms' }}>
        <FolderOpen size={60} strokeWidth={1.4} color="var(--t-accent)" />
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>{busy ?? t('Drop the developer’s package')}</div>
        <div className="ink2" style={{ fontSize: 16 }}>{t('a folder, as it came — drawings, bills, documents, scans')}</div>
        <button className="btn-s" style={{ marginTop: 8 }} onClick={() => picker.current?.click()} disabled={!!busy}>{t('Choose a folder…')}</button>
        <input ref={picker} type="file" multiple hidden {...{ webkitdirectory: '', directory: '' }}
          onChange={(e) => { const fs = fromInput(Array.from(e.target.files ?? [])); e.target.value = ''; void take(fs) }} />
      </div>
      {error && <div style={{ marginTop: 18, color: 'var(--t-red)', fontSize: 15, maxWidth: 1120 }}>{error}</div>}
      <div style={{ marginTop: 34, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="ink2" style={{ fontSize: 16 }}>{t('Try a sample:')}</span>
        <SampleCard sample="greenfield" name="Greenfield Residences" meta={t('site, 30 files')} />
        <SampleCard sample="tower" name="Greenfield Tower" meta={t('21 floors')} disabled={src !== 'live'} />
      </div>
    </div>
  )
}

function SampleCard({ sample, name, meta, disabled }: { sample: Sample; name: string; meta: string; disabled?: boolean }) {
  const src = useResolvedSource()
  const busy = useTry((s) => s.busy)
  return (
    <button data-dir={`sample-${sample}`} className="surface2" disabled={disabled || !!busy || !src} onClick={() => void openSample(sample, src)}
      title={disabled ? t('needs the live API (landsight serve)') : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', color: 'var(--t-ink)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, textAlign: 'left' }}>
      <span>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>{name}</span>
        <span className="ink2" style={{ fontSize: 14 }}>{meta}</span>
      </span>
      <ArrowRight size={18} color="var(--t-ink-3)" />
    </button>
  )
}

/** The short verdict a row stamps in. */
function verdictShort(f: FileVerdict, gov?: FileVerdict): string {
  switch (f.verdict) {
    case 'bill': return f === gov ? t('governs') : t('older version')
    case 'backup_ignored': return t('.{0} · ignored', f.ext)
    case 'unsupported': return t('.{0} · unsupported', f.ext)
    case 'unreadable': return t('unreadable')
    case 'archive_unpacked': return t('unpacked · {0} inside', f.children?.length ?? 1)
    case 'drawing_vector': return f.ext === 'pdf' ? t('PDF set · read') : t('vector · measured')
    case 'drawing_raster': return t('scan · read, not measured')
    case 'drawing_image': return t('photo · matched')
    case 'spec': return t('spec')
    case 'quote': return t('quote')
    case 'presentation': return t('slide deck')
    default: return t('document')
  }
}

function Files({ run }: { run: Run }) {
  const { rows, set } = useTry()
  const groups = useMemo(() => fileGroups(run), [run])
  const order = useMemo(() => FILE_GROUPS.flatMap((g) => groups[g]), [groups])
  const gov = useMemo(() => governingBill(run), [run])
  const total = order.length
  // the cascade: one row every 70 ms, on whatever clock the page runs (the director's is virtual)
  useEffect(() => {
    if (rows >= total) return
    const h = setTimeout(() => {
      cue('stamp')
      set({ rows: rows + 1 })
    }, rows === 0 ? 240 : ROW_MS)
    return () => clearTimeout(h)
  }, [rows, total, order, gov, set])
  const shown = new Set(order.slice(0, rows).map((f) => f.file_id))
  const done = rows >= total
  const count = (g: FileGroup) => groups[g].length
  const summary = [t('{0} files', total), ...FILE_GROUPS.filter((g) => count(g)).map((g) => `${count(g)} ${t(GROUP_NAME[g]).toLowerCase()}`)].join(' · ')
  const cols: FileGroup[][] = [['drawings'], ['bills', 'scans'], ['documents', 'notread']]
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '30px 56px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="ink3" style={{ fontSize: 14, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('The package')}</div>
          <div style={{ fontSize: 30, fontWeight: 650, letterSpacing: '-0.025em', marginTop: 4 }}>{run.package.name}</div>
        </div>
        <motion.div data-dir="summary" initial={false} animate={{ opacity: done ? 1 : 0.35 }} className="ink2" style={{ fontSize: 17 }}>{done ? summary : t('Reading {0} of {1}…', rows, total)}</motion.div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 26 }}>
        {cols.map((col, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {col.filter((g) => count(g)).map((g) => {
              const Icon = ICON[g]
              const bills = g === 'bills'
              return (
                <section key={g} data-dir={`files-${g}`} className="surface" style={{ padding: '14px 16px 10px', opacity: g === 'notread' ? 0.9 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <Icon size={17} color="var(--t-ink-2)" />
                    <span style={{ fontWeight: 600, fontSize: 16 }}>{t(GROUP_NAME[g])}</span>
                    <span className="ink3" style={{ fontSize: 15 }}>{count(g)}</span>
                    {bills && gov && <span className="ink2" style={{ marginLeft: 'auto', fontSize: 14 }}>{t('{0} versions · {1} governs', count(g), billRev(gov))}</span>}
                  </div>
                  {groups[g].map((f) => (
                    <FileRow key={f.file_id} f={f} on={shown.has(f.file_id)} lit={bills && f === gov} grey={(bills && f !== gov) || g === 'notread'} verdict={verdictShort(f, gov)} />
                  ))}
                </section>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', right: 56, bottom: 36 }}>
        <button className="btn-p" data-dir="continue" disabled={!done} onClick={() => set({ step: 'choose' })}>{t('Continue')} <ArrowRight size={18} /></button>
      </div>
    </div>
  )
}

function FileRow({ f, on, lit, grey, verdict }: { f: FileVerdict; on: boolean; lit: boolean; grey: boolean; verdict: string }) {
  return (
    <motion.div initial={false} animate={{ opacity: on ? (grey ? 0.42 : 1) : 0, y: on ? 0 : 6 }} transition={{ duration: 0.22 }} title={td(f.why)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 8px', margin: '0 -8px', borderRadius: 10,
        background: lit ? 'var(--t-accent-soft)' : 'transparent', boxShadow: lit ? 'inset 0 0 0 1px var(--t-accent)' : 'none' }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14.5 }}>{f.name}</span>
      {on && (
        <motion.span className="chip" initial={{ scale: 1.35, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}
          style={lit ? { background: 'var(--t-accent)', color: '#fff' } : undefined}>{verdict}</motion.span>
      )}
    </motion.div>
  )
}
