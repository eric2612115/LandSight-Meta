/** Step 6, Export: the change request — a cover (project, N changes, $X, sheets affected), one page per affected
 * sheet with numbered red revision clouds and a legend, the change list; Download PDF (the print stylesheet) and the
 * reply to the developer (an email preview, the mail app, the clipboard; reply.ts writes it). */
import { motion } from 'framer-motion'
import { Copy, Download, Mail, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SheetView } from '../components/SheetView'
import { objectsOn } from '../lib/flags'
import { isRasterSheet } from '../lib/model'
import type { Run, Sheet } from '../lib/types'
import { sheetTexts, useProjectName } from './Choose'
import { cloudBox, mergeClouds } from './cloud'
import { Cloud } from './Drawing'
import { t, td, useLang } from './i18n'
import { changeOf } from './model'
import { plainTitle } from './plain'
import { changeLines, developerOf, emailText, mailtoOf, replyEmail, type Reply } from './reply'
import { isTryDirector, useTry } from './store'
import type { useReview } from './view'

type V = ReturnType<typeof useReview>

/** The developer the package's cover names (its print text), once read; undefined when no cover names one. */
export function useDeveloper(run: Run) {
  const [dev, setDev] = useState<{ id: string; name?: string } | null>(null)
  const { run_id: id, sheets } = run
  useEffect(() => {
    let alive = true
    void (async () => {
      for (const s of sheets.filter((x) => x.kind === 'cover' && x.svg_url)) {
        const name = developerOf(await sheetTexts(s.svg_url).catch(() => []))
        if (name) return alive && setDev({ id, name })
      }
      if (alive) setDev({ id })
    })()
    return () => {
      alive = false
    }
  }, [id, sheets])
  return dev?.id === id ? dev.name : undefined
}

export function Export({ v }: { v: V }) {
  const { checked, marks, set } = useTry()
  const lang = useLang((s) => s.lang)
  const sheetOf = (id?: string) => v.run.sheets.find((s) => s.sheet_id === id)
  const lines = changeLines<Sheet>(v.findings, checked, marks, {
    finding: (f) => {
      const sheet = sheetOf(f.sheetId)
      return { sheetRef: sheet, sheet: sheet?.number ?? v.where(f), what: plainTitle(f.check, lang, (s) => td(s)), change: v.m.text(changeOf(f, (twd) => v.m.money(twd), v.chip(f))), money: v.chip(f) ?? '', evidence: v.evidence(f) }
    },
    mark: (m) => {
      const sheet = sheetOf(m.sheetId)
      return { sheetRef: sheet, sheet: sheet?.number, what: m.note, change: t('Asked: {0}', m.question), money: '', evidence: m.objectIds.join(', ') }
    },
  })
  const total = v.moneyText(v.queried(v.findings.filter((f) => checked[f.id])))
  const sheets = [...new Map(lines.filter((l) => l.sheetRef && (l.m || (l.f && objectsOn(l.sheetRef, l.f.check).length))).map((l) => [l.sheetRef!.sheet_id, l.sheetRef!])).values()]
  const project = v.run.package.name
  const name = useProjectName(v.run)
  const developer = useDeveloper(v.run)
  const reply = replyEmail({ to: developer, project: name, pkg: project, lines, total }, t)
  return (
    <motion.div initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 80, opacity: 0 }} transition={{ duration: 0.35, ease: [0.2, 0.7, 0.3, 1] }}
      className="try-report scroll" data-dir="report"
      style={{ position: 'absolute', left: 220, right: 0, top: 0, bottom: 0, background: 'var(--t-bg)', borderLeft: '1px solid var(--t-line)', boxShadow: 'var(--t-shadow)', zIndex: 20 }}>
      <div className="noprint" style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 12, padding: '16px 32px', background: 'var(--t-bg)', borderBottom: '1px solid var(--t-line)' }}>
        <span style={{ fontSize: 20, fontWeight: 650 }}>{t('Change request')}</span>
        <span className="ink2">{t('{0} changes · {1}', lines.length, total)}</span>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn-p" data-dir="pdf" onClick={() => window.print()}><Download size={18} />{t('Download PDF')}</button>
        <button className="btn-g" data-dir="close-report" onClick={() => set({ drawer: false })}><X size={20} /></button>
      </div>
      <div style={{ width: 1360, margin: '0 auto', padding: '28px 0 60px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section className="page surface" data-dir="cover" style={{ padding: '36px 40px' }}>
          <div className="ink3" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('Change request')}</div>
          <div style={{ fontSize: 36, fontWeight: 650, letterSpacing: '-0.03em', marginTop: 6 }}>{project}</div>
          <div style={{ display: 'flex', gap: 48, marginTop: 24 }}>
            <Stat k={t('Changes')} v={String(lines.length)} />
            <Stat k={t('Queried')} v={total} />
            <Stat k={t('Sheets affected')} v={sheets.map((s) => s.number).join(' · ') || '–'} />
            <Stat k={t('Run')} v={v.run.run_id} mono />
          </div>
        </section>
        {sheets.map((s) => {
          const here = lines.filter((l) => l.sheetRef?.sheet_id === s.sheet_id)
          return (
            <section key={s.sheet_id} className="page surface" data-dir={`page-${s.sheet_id}`} style={{ padding: 24, display: 'grid', gridTemplateColumns: '920px 1fr', gap: 24 }}>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--t-line)' }}>
                <SheetView sheet={s} width={920} height={600} homeRect={{ x: 10, y: 10, w: 900, h: 580 }} raster={isRasterSheet(v.run, s)} grid={false}>
                  {(ctx) => (
                    <g>
                      {mergeClouds(here.flatMap((l) => {
                        const objs = l.f ? objectsOn(s, l.f.check) : s.objects.filter((o) => l.m!.objectIds.includes(o.object_id))
                        const box = cloudBox(objs, 0.9)
                        return box ? [{ box, n: l.n, id: l.f?.id ?? l.m!.id }] : []
                      })).map((c) => <Cloud key={c.first.id} id={`r-${c.first.id}`} box={c.box} n={c.label} k={ctx.t.k} />)}
                    </g>
                  )}
                </SheetView>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 650 }}>{s.number} <span style={{ fontWeight: 500 }}>{td(s.title)}</span></div>
                <div className="ink3" style={{ fontSize: 14, marginTop: 2 }}>{s.revision ? `${t('Rev')} ${s.revision} · ` : ''}{t('{0} clouded', here.length)}</div>
                <ol style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {here.map((l) => (
                    <li key={l.n} data-dir={`note-${l.f?.id ?? l.m!.id}`} style={{ display: 'flex', gap: 12 }}>
                      <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 999, background: '#ff3b30', color: '#fff', fontSize: 13, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{l.n}</span>
                      <span>
                        <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>{l.what}</span>
                        <span className="ink2" style={{ display: 'block', fontSize: 14, marginTop: 2 }}>{l.change}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )
        })}
        <section className="page surface" data-dir="change-list" style={{ padding: '24px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 650, marginBottom: 12 }}>{t('The change list')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr className="ink3" style={{ textAlign: 'left' }}>
                {[t('No.'), t('Sheet'), t('What is wrong'), t('What to change'), t('Money'), t('Evidence')].map((h) => <th key={h} style={{ fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--t-line)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.n}>
                  <td style={cell}>{l.n}</td>
                  <td style={cell}>{l.sheet ?? ''}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{l.what}</td>
                  <td style={cell}>{l.change}</td>
                  <td style={{ ...cell, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.money}</td>
                  <td style={{ ...cell, color: 'var(--t-ink-2)' }}>{l.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <ReplyPanel reply={reply} />
      </div>
    </motion.div>
  )
}

/** Reply to the developer: the email as it will read, Download PDF, the mail app (a `mailto:`; the PDF is attached by
 * hand), the clipboard. Not printed. In director mode the mail link never navigates. */
function ReplyPanel({ reply }: { reply: Reply }) {
  const hot = useTry((s) => s.hot)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(emailText(reply, t)).then(() => setCopied(true), () => setCopied(false))
  }
  const director = isTryDirector()
  return (
    <section className="surface noprint" data-dir="reply" style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20, fontWeight: 650 }}>{t('Reply to the developer')}</span>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn-s" data-dir="reply-pdf" onClick={() => window.print()}><Download size={16} />{t('Download PDF')}</button>
        <a className={`btn-s ${hot === 'mailto' ? 'hot' : ''}`} data-dir="mailto" href={mailtoOf(reply)} style={{ textDecoration: 'none' }}
          onClick={director ? (e) => e.preventDefault() : undefined}><Mail size={16} />{t('Open in your mail app')}</a>
        <button className="btn-s" data-dir="copy-email" onClick={copy}><Copy size={16} />{copied ? t('Copied') : t('Copy email')}</button>
      </div>
      <div className="ink3" style={{ fontSize: 13, marginTop: 8, textAlign: 'right' }}>{t('The PDF is not attached automatically: download it, then attach it to the email.')}</div>
      <div className="surface2" style={{ marginTop: 14, padding: '16px 20px', fontSize: 14.5 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 6 }}>
          <span className="ink3">{t('To')}</span><span data-dir="reply-to" style={{ fontWeight: 600 }}>{reply.to}</span>
          <span className="ink3">{t('Subject')}</span><span style={{ fontWeight: 600 }}>{reply.subject}</span>
        </div>
        <div style={{ borderTop: '1px solid var(--t-line)', margin: '12px 0' }} />
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{reply.body}</div>
      </div>
    </section>
  )
}

const cell: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--t-line)', verticalAlign: 'top' }

function Stat({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="ink3" style={{ fontSize: 13 }}>{k}</div>
      <div className={mono ? 'mono' : ''} style={{ fontSize: 24, fontWeight: 650, marginTop: 4 }}>{v}</div>
    </div>
  )
}
