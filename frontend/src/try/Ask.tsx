/** Step 7, Ask: point at an object on the drawing (hover outlines it, a click drops it here as a chip), ask in your
 * words; the question goes to POST /api/ask prefixed with the object's context and the screen's language. The answer
 * comes with its citations and two actions: Mark on drawing (a red cloud and the note, into the change request) and
 * Add to change request. */
import { ArrowUp, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useResolvedSource } from '../lib/api'
import { sourceName } from '../lib/ask'
import { RECORDED } from '../lib/askMock'
import { kindName } from '../lib/english'
import type { Run } from '../lib/types'
import { askTry, RECORDED_T10 } from './data'
import { t, useLang } from './i18n'
import { isTryDirector, useTry, type Chip, type Turn } from './store'

let seq = 0

/** The package the six recorded questions (lib/askMock.ts) were asked on: the greenfield sample, or its folder dropped. */
const RECORDED_PACKAGE = 'Greenfield Residences — Landscape Package'

/** "About T-10, a tree on L-1: …" — the object's context the question carries. */
export const withContext = (q: string, chip?: Chip) => (chip ? `About ${chip.objectId}, a ${kindName(chip.kind)} on ${chip.sheetNo}: ${q.trim()}` : q.trim())

export async function send(run: Run, live: boolean, lang: 'en' | 'zh-TW') {
  const s = useTry.getState()
  if (!s.draft.trim()) return
  const q = withContext(s.draft, s.chip)
  const turn: Turn = { id: ++seq, q, shown: s.draft.trim(), chip: s.chip }
  s.set({ chat: [...s.chat, turn], draft: '', chip: undefined })
  const patch = (p: Partial<Turn>) => useTry.getState().set({ chat: useTry.getState().chat.map((x) => (x.id === turn.id ? { ...x, ...p } : x)) })
  try {
    // the film replays the answer the API recorded, after a fixed wait, so every take is the same
    const a = isTryDirector() && q === RECORDED_T10.question
      ? await new Promise<typeof RECORDED_T10>((r) => setTimeout(() => r({ ...RECORDED_T10, run_id: run.run_id }), 1500))
      : await askTry(q, run, lang, live)
    patch({ a })
  } catch (e) {
    patch({ error: String((e as Error).message ?? e) })
  }
}

export function AskPanel({ run }: { run: Run }) {
  const { chat, chip, draft, set } = useTry()
  const live = useResolvedSource() === 'live'
  const lang = useLang((s) => s.lang)
  const end = useRef<HTMLDivElement>(null)
  // the recorded questions, offered in English on the package they were recorded on (not in the film)
  const suggest = !chat.length && lang === 'en' && !isTryDirector() && run.package.name === RECORDED_PACKAGE
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [chat])
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-dir="ask">
      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: '8px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!chat.length && (
          <div className="ink2" style={{ fontSize: 15, lineHeight: 1.55, marginTop: 20 }}>
            {t('Point at anything on the drawing and say what is wrong. Hover an object to see what it is; click it to ask about it. The answer comes from the package, with its sources.')}
          </div>
        )}
        {suggest && (
          <div data-dir="ask-suggestions" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="ink3" style={{ fontSize: 13 }}>{t('Recorded on this package (no key needed):')}</div>
            {RECORDED.map((r) => (
              <button key={r.question} className="btn-s" data-dir="ask-suggestion" onClick={() => { set({ draft: r.question }); void send(run, live, lang) }}
                style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', minHeight: 40, padding: '9px 14px', lineHeight: 1.35, whiteSpace: 'normal' }}>
                {r.question}
              </button>
            ))}
          </div>
        )}
        {chat.map((x) => <TurnView key={x.id} x={x} run={run} />)}
        <div ref={end} />
      </div>
      <div style={{ padding: '12px 22px 16px', borderTop: '1px solid var(--t-line)' }}>
        {chip && (
          <div className="chip" data-dir="ask-chip" style={{ marginBottom: 10, background: 'var(--t-accent-soft)', color: 'var(--t-accent)', height: 30, fontSize: 14 }}>
            {chip.objectId} · {t(kindName(chip.kind))} · {chip.sheetNo}
            <button className="btn-g" style={{ padding: 0 }} onClick={() => set({ chip: undefined })}><X size={14} /></button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea className="field" data-dir="ask-input" rows={2} value={draft} placeholder={t('Ask about the package…')} onChange={(e) => set({ draft: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(run, live, lang) } }}
            style={{ flex: 1, resize: 'none', padding: '12px 14px', lineHeight: 1.4 }} />
          <button className="btn-p" data-dir="ask-send" style={{ width: 48, padding: 0, justifyContent: 'center' }} disabled={!draft.trim()} onClick={() => void send(run, live, lang)}><ArrowUp size={20} /></button>
        </div>
      </div>
    </div>
  )
}

function TurnView({ x, run }: { x: Turn; run: Run }) {
  const { chat, marks, checked, set } = useTry()
  const patch = (p: Partial<Turn>) => set({ chat: chat.map((y) => (y.id === x.id ? { ...y, ...p } : y)) })
  const act = x.a?.proposed_actions?.[0]
  const note = act?.value || x.a?.answer.split(/(?<=\.)\s/)[0] || x.shown
  const mark = () => {
    if (!x.chip) return
    set({ marks: [...marks, { id: `M${x.id}`, sheetId: x.chip.sheetId, objectIds: [x.chip.objectId], note, question: x.q }], ...(act && run.checks.some((c) => c.check_id === act.target_id) ? { checked: { ...checked, [act.target_id]: true } } : {}) })
    patch({ marked: true })
  }
  const add = () => {
    if (act && run.checks.some((c) => c.check_id === act.target_id)) set({ checked: { ...checked, [act.target_id]: true } })
    else if (x.chip) set({ marks: [...marks, { id: `M${x.id}`, sheetId: x.chip.sheetId, objectIds: [x.chip.objectId], note, question: x.q }] })
    patch({ added: true })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ alignSelf: 'flex-end', maxWidth: '86%', background: 'var(--t-accent)', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', fontSize: 15 }}>
        {x.chip && <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 2 }}>{x.chip.objectId} · {t(kindName(x.chip.kind))} · {x.chip.sheetNo}</div>}
        {x.shown}
      </div>
      <div className="surface2" data-dir="answer" style={{ padding: '14px 16px', borderRadius: '16px 16px 16px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="chip" style={{ background: '#4d7cff', color: '#fff', height: 24, fontSize: 12.5 }}>Muse Spark</span>
          {x.a && <span className="ink3" style={{ fontSize: 12.5 }}>{x.a.via === 'live' && !x.a.call?.recorded ? t('asked live') : t('recorded answer')}{typeof x.a.confidence === 'number' ? ` · ${Math.round(x.a.confidence * 100)}%` : ''}</span>}
        </div>
        {!x.a && !x.error && <div className="ink2" style={{ fontSize: 15 }}>{t('Reading the package…')}</div>}
        {x.error && <div style={{ color: 'var(--t-red)', fontSize: 14 }}>{x.error}</div>}
        {x.a && (
          <>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{x.a.answer}</div>
            {x.a.citations.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }} data-dir="citations">
                {x.a.citations.slice(0, 3).map((c, i) => (
                  <div key={i} style={{ fontSize: 13, lineHeight: 1.4, paddingLeft: 10, borderLeft: '2px solid var(--t-line)' }}>
                    <span className="ink3">{sourceName(run, c)}{c.page ? `, p. ${c.page}` : ''} · </span><span className="ink2">“{c.quote}”</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
              {x.chip && <button className="btn-s" data-dir="ask-mark" disabled={x.marked} onClick={mark} style={!x.marked ? { background: 'var(--t-red)', borderColor: 'var(--t-red)', color: '#fff' } : undefined}>{t('Mark on drawing')}</button>}
              <button className="btn-s" data-dir="ask-add" disabled={x.added || x.marked} onClick={add}>{t('Add to change request')}</button>
              {(x.marked || x.added) && <span data-dir="ask-added" style={{ fontSize: 14, color: 'var(--t-accent)', fontWeight: 600 }}>{t('Added to the change request')}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
