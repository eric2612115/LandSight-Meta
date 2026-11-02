/** Step 6, Export: the change request — a cover (project, N changes, $X, sheets affected), one page per affected
 * sheet with numbered red revision clouds and a legend, the change list; Download PDF (the print stylesheet) and
 * "Copy email to the developer". */
import { motion } from 'framer-motion'
import { Copy, Download, X } from 'lucide-react'
import { useState } from 'react'
import { SheetView } from '../components/SheetView'
import { objectsOn } from '../lib/flags'
import { isRasterSheet } from '../lib/model'
import type { Sheet } from '../lib/types'
import { cloudBox, mergeClouds } from './cloud'
import { Cloud } from './Drawing'
import { t, td, useLang } from './i18n'
import { changeOf, type Finding } from './model'
import { plainTitle } from './plain'
import { useTry, type Mark } from './store'
import type { useReview } from './view'

type V = ReturnType<typeof useReview>
type Line = { n: number; sheet?: Sheet; what: string; change: string; money: string; evidence: string; f?: Finding; m?: Mark }

export function Export({ v }: { v: V }) {
  const { checked, marks, set } = useTry()
  const lang = useLang((s) => s.lang)
  const [copied, setCopied] = useState(false)
  const picked = v.findings.filter((f) => checked[f.id])
  const sheetOf = (id?: string) => v.run.sheets.find((s) => s.sheet_id === id)
  const lines: Line[] = [
    ...picked.map((f, i) => ({ n: i + 1, sheet: sheetOf(f.sheetId), what: plainTitle(f.check, lang, (s) => td(s)), change: v.m.text(t(td(changeOf(f, (twd) => v.m.money(twd), v.chip(f))))), money: v.chip(f) ?? '', evidence: v.evidence(f), f })),
    ...marks.map((m, i) => ({ n: picked.length + i + 1, sheet: sheetOf(m.sheetId), what: m.note, change: t('Asked: {0}', m.question), money: '', evidence: m.objectIds.join(', '), m })),
  ]
  const total = v.moneyText(v.queried(picked))
  const sheets = [...new Map(lines.filter((l) => l.sheet && (l.m || (l.f && objectsOn(l.sheet, l.f.check).length))).map((l) => [l.sheet!.sheet_id, l.sheet!])).values()]
  const project = v.run.package.name
  const email = [
    t('Subject: Change request — {0}', project), '',
    t('Dear developer,'), '',
    t('We reviewed {0}. Please revise these {1} points before we price the job:', project, lines.length), '',
    ...lines.map((l) => `${l.n}. [${l.sheet?.number ?? l.f?.check.check_id ?? ''}] ${l.what} — ${l.change}${l.money ? ` (${l.money})` : ''}`), '',
    t('Queried: {0}.', total), '', t('Regards'),
  ].join('\n')
  const copy = () => {
    void navigator.clipboard?.writeText(email).then(() => setCopied(true), () => setCopied(false))
  }
  return (
    <motion.div initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 80, opacity: 0 }} transition={{ duration: 0.35, ease: [0.2, 0.7, 0.3, 1] }}
      className="try-report scroll" data-dir="report"
      style={{ position: 'absolute', left: 220, right: 0, top: 0, bottom: 0, background: 'var(--t-bg)', borderLeft: '1px solid var(--t-line)', boxShadow: 'var(--t-shadow)', zIndex: 20 }}>
      <div className="noprint" style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 12, padding: '16px 32px', background: 'var(--t-bg)', borderBottom: '1px solid var(--t-line)' }}>
        <span style={{ fontSize: 20, fontWeight: 650 }}>{t('Change request')}</span>
        <span className="ink2">{t('{0} changes · {1}', lines.length, total)}</span>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn-s" data-dir="copy-email" onClick={copy}><Copy size={16} />{copied ? t('Copied') : t('Copy email to the developer')}</button>
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
          const here = lines.filter((l) => l.sheet?.sheet_id === s.sheet_id)
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
                  <td style={cell}>{l.sheet?.number ?? (l.f ? v.where(l.f) : '')}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{l.what}</td>
                  <td style={cell}>{l.change}</td>
                  <td style={{ ...cell, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.money}</td>
                  <td style={{ ...cell, color: 'var(--t-ink-2)' }}>{l.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </motion.div>
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
