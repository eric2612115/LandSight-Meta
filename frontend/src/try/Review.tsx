/** Step 4–7, Review: sheets left, the drawing centre, the findings right in four groups (Send back · Fix before
 * pricing · Building code · Ask the architect) with a chat tab; select into a change request, export it. */
import { AnimatePresence, motion } from 'framer-motion'
import { Check as CheckIcon, ChevronDown, X } from 'lucide-react'
import { filmSheets, numberRows } from '../lib/flags'
import { useResolvedSource } from '../lib/api'
import type { Run } from '../lib/types'
import { AskPanel } from './Ask'
import { postWord } from './data'
import { Drawing } from './Drawing'
import { Export } from './Export'
import { t, td, useLang } from './i18n'
import { itemOf, type Finding } from './model'
import { GROUPS, plainTitle, type Group } from './plain'
import { isTryDirector, useTry } from './store'
import { useReview } from './view'

export const GROUP_NAME: Record<Group, string> = { send: 'Send back', fix: 'Fix before pricing', code: 'Building code', ask: 'Ask the architect' }
export const GROUP_COLOUR: Record<Group, string> = { send: 'var(--t-red)', fix: 'var(--t-amber)', code: 'var(--t-cobalt)', ask: 'var(--t-grey)' }

const LEFT = 220
const RIGHT = 600

export function Review() {
  const base = useTry((s) => s.run)
  if (!base) return null
  return <ReviewOf base={base} />
}

function ReviewOf({ base }: { base: Run }) {
  const v = useReview(base)
  const { sheetId, focus, tab, drawer, set } = useTry()
  const first = v.findings.find((f) => f.sheetId)?.sheetId ?? filmSheets(v.run)[0]?.sheet_id
  const sheet = v.run.sheets.find((s) => s.sheet_id === (sheetId ?? first))
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `${LEFT}px 1fr ${RIGHT}px` }}>
      <Thumbs run={v.run} findings={v.findings} current={sheet?.sheet_id} onPick={(id) => set({ sheetId: id })} />
      <div style={{ position: 'relative', borderLeft: '1px solid var(--t-line)', borderRight: '1px solid var(--t-line)', overflow: 'hidden' }}>
        {sheet && <Drawing run={v.run} sheet={sheet} findings={v.findings} width={1920 - LEFT - RIGHT - 2} height={1008} />}
      </div>
      <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--t-s1)' }}>
        <div style={{ padding: '18px 22px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="seg" data-dir="tabs">
            <button className={tab === 'findings' ? 'on' : ''} onClick={() => set({ tab: 'findings' })} data-dir="tab-findings">{t('Findings')}</button>
            <button className={tab === 'ask' ? 'on' : ''} onClick={() => set({ tab: 'ask' })} data-dir="tab-ask">{t('Ask')}</button>
          </div>
          <div data-dir="summary-chips" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <span className="chip" style={{ height: 30, fontSize: 14 }}>{t('{0} issues', v.findings.length)}</span>
            <span className="chip" style={{ height: 30, fontSize: 14, color: 'var(--t-ink)' }}>{t('{0} queried', v.moneyText(v.queried(v.findings)))}</span>
          </div>
        </div>
        {tab === 'findings' ? <FindingList v={v} focus={focus} /> : <AskPanel run={v.run} />}
        <SelectBar v={v} />
      </aside>
      <AnimatePresence>{drawer && <Export key="export" v={v} />}</AnimatePresence>
    </div>
  )
}

type V = ReturnType<typeof useReview>

function Thumbs({ run, findings, current, onPick }: { run: Run; findings: Finding[]; current?: string; onPick: (id: string) => void }) {
  const count = (id: string) => findings.filter((f) => f.sheetId === id).length
  const sheets = filmSheets(run).filter((s) => s.png_url).sort((a, b) => Number(count(b.sheet_id) > 0) - Number(count(a.sheet_id) > 0))
  return (
    <nav className="scroll" style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }} data-dir="thumbs">
      {sheets.map((s) => {
        const n = count(s.sheet_id)
        const on = s.sheet_id === current
        return (
          <button key={s.sheet_id} onClick={() => onPick(s.sheet_id)} data-dir={`thumb-${s.sheet_id}`}
            style={{ border: 0, padding: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--t-ink)', opacity: n || on ? 1 : 0.55 }}>
            <div style={{ height: 104, borderRadius: 12, background: '#f7f5f0', overflow: 'hidden', position: 'relative', boxShadow: on ? '0 0 0 2px var(--t-accent)' : '0 0 0 1px var(--t-line)' }}>
              <img src={s.png_url} alt="" loading="eager" style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
              {n > 0 && <span style={{ position: 'absolute', right: 6, top: 6, minWidth: 22, height: 22, borderRadius: 999, background: 'var(--t-red)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{n}</span>}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <b>{s.number}</b>{s.revision ? ` · ${t('Rev')} ${s.revision}` : ''} <span className="ink2">{td(s.title)}</span>
            </div>
          </button>
        )
      })}
    </nav>
  )
}

function FindingList({ v, focus }: { v: V; focus?: string }) {
  const { checked, set } = useTry()
  return (
    <div className="scroll" data-dir="findings" style={{ flex: 1, minHeight: 0, padding: '4px 22px 24px' }}>
      {GROUPS.map((g) => {
        const fs = v.findings.filter((f) => f.group === g)
        if (!fs.length) return null
        const all = fs.every((f) => checked[f.id])
        return (
          <section key={g} className={`g-${g}`} style={{ marginTop: 16 }}>
            <div data-dir={`g-${g}`} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34 }}>
              <span className="dot" style={{ background: GROUP_COLOUR[g] }} />
              <span style={{ fontSize: 17, fontWeight: 650 }}>{t(GROUP_NAME[g])}</span>
              <span className="ink3" style={{ fontSize: 15 }}>{fs.length}</span>
              <button className="btn-g" data-dir={`all-${g}`} style={{ marginLeft: 'auto' }}
                onClick={() => set({ checked: { ...checked, ...Object.fromEntries(fs.map((f) => [f.id, !all])) } })}>{all ? t('Clear') : t('Select all')}</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {fs.map((f) => <Card key={f.id} f={f} v={v} on={focus === f.id} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Card({ f, v, on }: { f: Finding; v: V; on: boolean }) {
  const { checked, expanded, decisions, confirmed, set } = useTry()
  const lang = useLang((s) => s.lang)
  const live = useResolvedSource() === 'live'
  const open = expanded === f.id
  const chip = v.chip(f)
  const state = decisions[f.id]
  const pick = () => set({ focus: f.id, expanded: open ? undefined : f.id, ...(f.sheetId ? { sheetId: f.sheetId } : {}) })
  const decide = (word: 'confirm' | 'dismiss') => {
    const s = useTry.getState()
    const it = word === 'confirm' ? itemOf(v.run, f.check) : undefined
    set({ decisions: { ...s.decisions, [f.id]: word }, ...(it && !s.confirmed.includes(it.item_id) ? { confirmed: [...s.confirmed, it.item_id] } : {}) })
    postWord(v.run, f.id, word, live && !isTryDirector())
  }
  return (
    <div className={`card ${on ? 'on' : ''}`} data-dir={`card-${f.id}`} onClick={pick}
      onMouseEnter={() => set({ hover: f.id })} onMouseLeave={() => useTry.getState().hover === f.id && set({ hover: undefined })}
      style={{ opacity: state === 'dismiss' ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className={`check ${checked[f.id] ? 'on' : ''}`} data-dir={`check-${f.id}`} onClick={(e) => { e.stopPropagation(); set({ checked: { ...checked, [f.id]: !checked[f.id] } }) }}>
          {checked[f.id] && <CheckIcon size={14} color="#fff" strokeWidth={3} />}
        </button>
        <span className="mono ink3" style={{ fontSize: 12, width: 18 }}>{f.n}</span>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', minWidth: 0 }}>{plainTitle(f.check, lang, (s) => td(s))}</span>
        {state && <span className="chip" style={{ color: state === 'confirm' ? 'var(--t-accent)' : 'var(--t-ink-3)' }}>{state === 'confirm' ? t('Confirmed') : t('Dismissed')}</span>}
        {chip && <span className="chip" style={{ color: 'var(--t-ink)', fontWeight: 650 }}>{chip}</span>}
        <ChevronDown size={16} color="var(--t-ink-3)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 62 }}>
        <span className="chip" style={{ height: 22, fontSize: 12 }}>{v.where(f)}</span>
        <span className="ink2" style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{v.evidence(f)}</span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}>
            <Detail f={f} v={v} confirmed={confirmed} state={state} onDecide={decide} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Detail({ f, v, confirmed, state, onDecide }: { f: Finding; v: V; confirmed: string[]; state?: 'confirm' | 'dismiss'; onDecide: (w: 'confirm' | 'dismiss') => void }) {
  const c = f.check
  const it = itemOf(v.run, c)
  const rows = numberRows(c, (twd) => v.m.money(twd), 6)
  const n = c.numbers ?? {}
  const gauge = typeof n.required === 'number' && typeof n.provided === 'number' && c.category === 'regulation'
  const fixes = gauge ? (c.fixes ?? []).flatMap((x) => (x.extra_trees ? [t('+{0} trees', x.extra_trees)] : /^Change 1 /.test(x.label) ? [t('or change one species')] : [])).slice(0, 2) : []
  const done = it ? confirmed.includes(it.item_id) : false
  return (
    <div style={{ paddingLeft: 62, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'default' }}>
      <p className="ink2" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{v.m.text(td(c.why))}</p>
      {it?.spark && (
        <div data-dir={`crop-${f.id}`} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <img src={it.spark.crop_url} alt="" style={{ width: 132, height: 132, objectFit: 'cover', borderRadius: 12, background: '#f7f5f0' }} />
          <div>
            <div className="ink3" style={{ fontSize: 13 }}>{t('What Muse Spark was shown')}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}>{t('Muse Spark: one tree, {0}%', Math.round((it.spark.confidence ?? 0) * 100))}</div>
            <div data-dir="count" style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="ink3" style={{ fontSize: 13 }}>{t('Counted')}</span>
              <motion.span key={done ? 'b' : 'a'} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ fontSize: 30, fontWeight: 700 }}>
                {done ? it.quote_count ?? it.spark_count : it.geometry_count}
              </motion.span>
              <span className="ink3" style={{ fontSize: 13 }}>{t('of {0} on the schedule', it.schedule_count ?? '–')}</span>
            </div>
          </div>
        </div>
      )}
      {gauge && (
        <div data-dir={`gauge-${f.id}`}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{(n.provided as number).toFixed(1)}</span>
            <span className="ink2" style={{ fontSize: 16 }}>/ {(n.required as number).toFixed(1)} kgCO₂e/yr</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: 'var(--t-s3)', marginTop: 8, position: 'relative', overflow: 'hidden' }}>
            <motion.div initial={false} animate={{ width: `${Math.min(100, ((n.provided as number) / (n.required as number)) * 100)}%` }} transition={{ duration: 0.6 }}
              style={{ height: '100%', background: (n.provided as number) >= (n.required as number) ? 'var(--t-accent)' : 'var(--t-amber)' }} />
          </div>
          {fixes.length > 0 && <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600 }}>{fixes.join(' · ')}</div>}
        </div>
      )}
      {!it?.spark && !gauge && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 4, fontSize: 13.5 }}>
          {rows.map(([k, val]) => <div key={k} style={{ display: 'contents' }}><span className="ink3">{t(k)}</span><span className="mono">{val}</span></div>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-s" data-dir={`confirm-${f.id}`} onClick={() => onDecide('confirm')} disabled={state === 'confirm'}
          style={state !== 'confirm' ? { background: 'var(--t-accent)', borderColor: 'var(--t-accent)', color: '#fff' } : undefined}>
          {state === 'confirm' ? t('Confirmed') : it?.spark ? t('Confirm — {0}', t('one tree')) : t('Confirm')}
        </button>
        <button className="btn-s" onClick={() => onDecide('dismiss')} disabled={state === 'dismiss'}>{t('Dismiss')}</button>
      </div>
    </div>
  )
}

function SelectBar({ v }: { v: V }) {
  const { checked, marks, set } = useTry()
  const picked = v.findings.filter((f) => checked[f.id])
  const n = picked.length + marks.length
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          style={{ padding: '14px 22px 18px', borderTop: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-p" data-dir="create" style={{ flex: 1, justifyContent: 'center' }} onClick={() => set({ drawer: true })}>
            {t('Create change request · {0} items · {1}', n, v.moneyText(v.queried(picked)))}
          </button>
          <button className="btn-g" title={t('Clear')} onClick={() => set({ checked: {}, marks: [] })}><X size={18} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
