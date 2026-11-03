/** Step 2, Choose: the project read off the title block (Muse Spark read the sheets; the plan's print carries the
 * fields), its name editable in place, whose prices (the firm's list, /prices) and which rules the review applies,
 * four switches for what the review shows, the currency, Analyze. */
import { motion } from 'framer-motion'
import { ArrowRight, Building2, Calculator, FileStack, GitCompare, Pencil, Scale, Tags } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSvg } from '../components/SheetView'
import { useCurrency } from '../lib/money'
import { PRICE_LIST_NAME, usePriceList } from '../lib/prices'
import type { Run } from '../lib/types'
import { t } from './i18n'
import { governingPlan, projectCard, titleFields } from './model'
import type { Topic } from './plain'
import { isTryDirector, useTry } from './store'

/** The governing plan's print text, in order (the SVG the run rendered). */
export async function sheetTexts(url: string): Promise<string[]> {
  const r = await loadSvg(url)
  if (!r) return []
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${r.html}</svg>`, 'image/svg+xml')
  return Array.from(doc.querySelectorAll('text')).map((x) => x.textContent ?? '').filter(Boolean)
}

export function useTitleFields(run?: Run) {
  const [fields, setFields] = useState<{ id: string; f: Record<string, string> } | null>(null)
  const plan = run ? governingPlan(run) : undefined
  useEffect(() => {
    if (!plan) return
    let alive = true
    void sheetTexts(plan.svg_url).then((texts) => alive && setFields({ id: plan.sheet_id, f: titleFields(texts) }))
    return () => {
      alive = false
    }
  }, [plan])
  return fields && plan && fields.id === plan.sheet_id ? fields.f : null
}

/** The project's name: as a person edited it here for this run, else the title block's (the card's), else the
 * package name's first part. */
export function useProjectName(run?: Run) {
  const fields = useTitleFields(run)
  const edited = useTry((s) => s.projectName)
  if (!run) return ''
  if (edited && edited.runId === run.run_id) return edited.name
  return fields ? projectCard(run, fields).name : run.package.name.split(' — ')[0]
}

export const TOPIC: Record<Topic, { name: string; line: string; icon: typeof Calculator }> = {
  quote: { name: 'Quantities & quote', line: 'The bill against the drawings and your price list', icon: Calculator },
  code: { name: 'Building code', line: 'Greenery, fire lane, tree pits, water retention', icon: Building2 },
  logic: { name: 'Drawing logic', line: 'Sheets that disagree, scales, missing sheets', icon: GitCompare },
  files: { name: 'Files', line: 'Backups, scans, versions, unsupported formats', icon: FileStack },
}

export function Choose() {
  const { run, topics, set } = useTry()
  const fields = useTitleFields(run)
  const card = useMemo(() => (run && fields ? projectCard(run, fields) : null), [run, fields])
  const { cur, setCur } = useCurrency()
  const prices = usePriceList()
  const hot = useTry((s) => s.hot)
  const name = useProjectName(run)
  if (!run) return null
  const rows: [string, string | undefined][] = card ? [
    [t('Location'), card.location], [t('Works'), card.works], [t('Ground'), card.ground], [t('Site area'), card.site],
  ] : []
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '760px 820px', justifyContent: 'center', gap: 56, paddingTop: 64 }}>
      <div data-dir="project" style={{ alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section className="surface" style={{ padding: '34px 38px', boxShadow: 'var(--t-shadow)' }}>
          <div className="ink3" style={{ fontSize: 14, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('Project')}</div>
          <motion.div key={card?.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 8 }}>
            {card ? <ProjectName name={name} onSave={(v) => set({ projectName: { runId: run.run_id, name: v } })} /> : <span style={{ fontSize: 40, fontWeight: 650 }}>…</span>}
          </motion.div>
          <div className="ink2" style={{ fontSize: 16, marginTop: 6 }}>{run.package.name}</div>
          <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '170px 1fr', rowGap: 18, fontSize: 19 }}>
            {rows.filter(([, v]) => v).map(([k, v], i) => (
              <motion.div key={k} style={{ display: 'contents' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.22, duration: 0.3 }}>
                <span className="ink3">{k}</span>
                <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.22, duration: 0.3 }} style={{ fontWeight: 550 }}>{v}</motion.span>
              </motion.div>
            ))}
          </div>
          {card && (
            <div className="chip" style={{ marginTop: 30, height: 30, fontSize: 14 }}>
              <span className="dot" style={{ background: 'var(--t-accent)', width: 8, height: 8 }} />
              {card.byTitleBlock ? t('read from the title block · Muse Spark') : t('from the package name and the code checks')}
              {card.sheet ? ` · ${card.sheet}` : ''}
            </div>
          )}
        </section>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '0 4px' }}>
          <a className={`chip ${hot === 'price-chip' ? 'hot' : ''}`} data-dir="price-chip" href="/prices" target="_blank" rel="noreferrer" title={t('Open the price list')}
            style={{ height: 32, fontSize: 14, textDecoration: 'none' }} onClick={isTryDirector() ? (e) => e.preventDefault() : undefined}>
            <Tags size={15} />{t('Price list: {0} · {1} items', t(PRICE_LIST_NAME), prices.loading ? '…' : prices.rows.length)}
          </a>
          <span className="chip" data-dir="rules-chip" style={{ height: 32, fontSize: 14 }}>
            <Scale size={15} />{t('Rules: local building code (2026)')}
          </span>
        </div>
      </div>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 650, letterSpacing: '-0.02em' }}>{t('What to check')}</div>
        <div data-dir="topics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {(Object.keys(TOPIC) as Topic[]).map((k) => {
            const T = TOPIC[k]
            const on = topics[k]
            return (
              <button key={k} data-dir={`topic-${k}`} className="surface2" onClick={() => set({ topics: { ...topics, [k]: !on } })}
                style={{ textAlign: 'left', padding: '20px 20px 18px', color: 'var(--t-ink)', cursor: 'pointer', borderColor: on ? 'var(--t-accent)' : 'var(--t-line)', boxShadow: on ? 'inset 0 0 0 1px var(--t-accent)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <T.icon size={22} color={on ? 'var(--t-accent)' : 'var(--t-ink-3)'} />
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{t(T.name)}</span>
                  <span style={{ marginLeft: 'auto', width: 40, height: 24, borderRadius: 999, background: on ? 'var(--t-accent)' : 'var(--t-s3)', position: 'relative', transition: 'background 200ms' }}>
                    <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 18, height: 18, borderRadius: 999, background: '#fff', transition: 'left 200ms' }} />
                  </span>
                </div>
                <div className="ink2" style={{ fontSize: 14.5, marginTop: 10 }}>{t(T.line)}</div>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <span className="ink2" style={{ fontSize: 16 }}>{t('Currency')}</span>
          <div className="seg" data-dir="currency">
            <button className={cur === 'usd' ? 'on' : ''} onClick={() => setCur('usd')}>USD</button>
            <button className={cur === 'twd' ? 'on' : ''} onClick={() => setCur('twd')}>TWD</button>
          </div>
          {run.currency?.as_of && <span className="ink3" style={{ fontSize: 13 }}>{t('rate of {0}', run.currency.as_of)}</span>}
        </div>
        <div style={{ marginTop: 'auto', marginBottom: 36, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-p" data-dir="analyze" disabled={!Object.values(topics).some(Boolean)} onClick={() => set({ step: 'analyze', played: 0 })}>{t('Analyze')} <ArrowRight size={18} /></button>
        </div>
      </section>
    </div>
  )
}

/** The project's name, click to edit: Enter or leaving the field keeps it, Escape drops the edit. */
function ProjectName({ name, onSave }: { name: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const dropped = useRef(false)
  const big = { fontSize: 40, fontWeight: 650, letterSpacing: '-0.03em' } as const
  if (draft === null)
    return (
      <button data-dir="project-name" className="btn-g" onClick={() => setDraft(name)} title={t('Edit the project name')}
        style={{ ...big, color: 'var(--t-ink)', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 14, textAlign: 'left', background: 'transparent' }}>
        {name}<Pencil size={18} color="var(--t-ink-3)" />
      </button>
    )
  const save = () => {
    const v = draft.trim()
    if (v && v !== name && !dropped.current) onSave(v)
    dropped.current = false
    setDraft(null)
  }
  return (
    <input className="field" autoFocus value={draft} aria-label={t('Project name')} onChange={(e) => setDraft(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') { dropped.current = true; setDraft(null) } }}
      style={{ ...big, width: '100%', padding: '0 12px', height: 56, borderRadius: 12 }} />
  )
}
