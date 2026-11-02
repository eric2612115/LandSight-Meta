/** Ask the package: a dock reachable from every screen (⌘K or the top bar). The owner's question, Muse Spark's answer
 * with the file, page and sentence each fact came from (each one opens the file or sheet and lights it), the actions
 * the answer supports as buttons, and the recent questions. */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useAskAction } from '../app/actions'
import { upto, useShow } from '../app/show'
import { useNav, useUI } from '../app/state'
import { ACTION_VERB, ask, citeTarget, sourceName, type Answer, type Citation, type ProposedAction } from '../lib/ask'
import { RECORDED } from '../lib/askMock'
import { useResolvedSource } from '../lib/api'
import { fmt } from '../lib/format'
import { useMoney } from '../lib/money'
import { priceRange } from '../lib/ask'
import type { Run } from '../lib/types'
import { Pulse } from '../shell/Shell'
import { create } from 'zustand'

type AskState = { q: string; answer?: Answer; busy: boolean; error?: string; recent: Answer[]; done: Record<string, string> }
export const useAsk = create<AskState>(() => ({ q: '', busy: false, recent: [], done: {} }))

export const actionKey = (a: Answer, i: number) => `${a.ask_id}:${i}`

export async function askNow(question: string, run: Run, live: boolean) {
  useAsk.setState({ busy: true, error: undefined, q: question })
  try {
    const a = await ask(question, run, live)
    useAsk.setState((s) => ({ answer: a, busy: false, recent: [a, ...s.recent.filter((x) => x.question !== a.question)].slice(0, 8) }))
    return a
  } catch (e) {
    useAsk.setState({ busy: false, error: String((e as Error).message ?? e) })
    return undefined
  }
}

export function AskDock({ run }: { run?: Run }) {
  const ui = useUI()
  const st = useAsk()
  const sh = useShow()
  const src = useResolvedSource()
  const apply = useAskAction(run)
  const box = useRef<HTMLTextAreaElement>(null)
  const [litCite, setLitCite] = useState<number | null>(null)

  useEffect(() => {
    if (ui.askOpen) setTimeout(() => box.current?.focus(), 60)
  }, [ui.askOpen])

  const a = st.answer
  const typedQ = sh.asked
  const answerText = a ? a.answer.slice(0, upto(sh.answer, a.answer.length)) : ''
  const answerDone = !a || sh.answer === null || sh.answer >= a.answer.length
  const submit = () => {
    if (!run || !st.q.trim() || st.busy) return
    void askNow(st.q, run, src === 'live')
  }

  return (
    <AnimatePresence>
      {ui.askOpen && (
        <motion.aside key="ask" className="ask absolute bottom-[28px] right-0 top-[48px] z-30 flex w-[640px] flex-col border-l border-line bg-pane shadow-[-24px_0_48px_-28px_rgba(0,0,0,0.35)]"
          initial={{ x: 660 }} animate={{ x: 0 }} exit={{ x: 660 }} transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}>
          <div className="ph">Ask the package <span className="r flex items-center gap-3"><span>{run ? `scoped to run ${run.run_id.slice(0, 8)} · ` : ''}every answer recorded and cited · Esc</span><button className="cursor-pointer border-0 bg-transparent text-[16px] text-ink-3 hover:text-ink" onClick={() => ui.set({ askOpen: false })} aria-label="Close">×</button></span></div>
          <div className="border-b border-line-2 p-4">
            <div className="relative">
              <textarea ref={box} className="field block h-[64px] pr-[84px] text-[14px]" placeholder="Ask about the specs, the bills, the regulations, your prices… e.g. what soil depth does the spec require on the slab?"
                value={typedQ ?? st.q} onChange={(e) => useAsk.setState({ q: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
                  if (e.key === 'Escape') ui.set({ askOpen: false })
                }} />
              <button className="btn primary absolute bottom-2 right-2 relative" style={{ position: 'absolute' }} onClick={submit} disabled={st.busy || !run}>{st.busy ? 'Reading…' : 'Ask'}{sh.pulse === 'ask-go' && <Pulse />}</button>
            </div>
            <div className="hint mt-1.5">{src === 'live' ? 'POST /api/ask · recorded questions answer at once; others need the server started with live calls' : 'Recorded answers (tests/fixtures/ask) · the live API answers new questions'}</div>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {st.error && <p className="p-4 text-ink">Could not ask: {st.error}</p>}
            {a && run ? (
              <div>
                <div className="px-4 pb-3 pt-4">
                  <div className="q">{a.question}</div>
                  <p className="ans mt-2 whitespace-pre-line">{answerText}{!answerDone && <span className="ml-px inline-block h-[15px] w-[7px] translate-y-[2px] bg-blue" />}</p>
                  <div className="mt-2 text-ink-3">
                    {a.via === 'none' ? 'no recording' : `Muse Spark${a.call?.model ? ` (${a.call.model})` : ''} · ${a.via === 'live' && !a.call?.recorded ? 'live' : 'recorded'}${a.call?.seconds ? ` · ${fmt(a.call.seconds, 1)} s` : ''} · confidence ${fmt(a.confidence, 2)}`}
                  </div>
                </div>
                {answerDone && a.citations.length > 0 && (
                  <div className="border-t border-line-2 pt-1">
                    <div className="px-4 py-1.5 font-semibold">Citations <span className="font-normal text-ink-3">· click to open the file and light the page</span></div>
                    {a.citations.map((c, i) => (
                      <motion.div key={i} className={`cit ${(sh.cite ?? litCite) === i ? 'on' : ''}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        onClick={() => { setLitCite(i); openCitation(run, c, ui.set) }}>
                        <span className="n">{i + 1}</span>
                        <span className="src">{sourceName(run, c)}<span>{c.page ? `p. ${c.page}` : c.file_id === 'run' ? 'check' : c.file_id === 'rules' ? 'rules.json' : ''}{c.verified === false ? ' · not found in source' : ''}</span></span>
                        <blockquote>“{c.quote}”</blockquote>
                      </motion.div>
                    ))}
                  </div>
                )}
                {answerDone && a.proposed_actions.length > 0 && (
                  <div className="border-t border-line-2 px-4 py-3">
                    <div className="mb-2 font-semibold">What the answer supports</div>
                    <div className="grid gap-2">
                      {a.proposed_actions.slice(0, upto(sh.actions, a.proposed_actions.length)).map((p, i) => (
                        <ActionRow key={i} run={run} a={a} p={p} i={i} apply={apply} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-4 text-ink-2">Ask in plain words. The answer names the file, the page and the sentence it came from, and offers to turn it into a confirmed element, a confirmed price, a regulation note or a flag.</div>
            )}
            <div className="recent border-t border-line-2 py-2">
              <div className="px-4 py-1.5 font-semibold">{st.recent.length ? 'Recent questions' : 'Recorded on this package'}</div>
              {(st.recent.length ? st.recent.map((x) => x.question) : RECORDED.map((x) => x.question)).map((q) => (
                <button key={q} onClick={() => run && askNow(q, run, src === 'live')}><span>{q}</span><span className="text-ink-3">↵</span></button>
              ))}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function ActionRow({ run, a, p, i, apply }: { run: Run; a: Answer; p: ProposedAction; i: number; apply: (p: ProposedAction) => Promise<string> }) {
  const done = useAsk((s) => s.done[actionKey(a, i)])
  const sh = useShow()
  const m = useMoney(run.currency)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const range = p.kind === 'confirm_price' ? priceRange(p.value) : null
  const value = range ? `${m.range(range[0], range[1])}${m.cur === 'usd' ? ` (NT$${range[0].toLocaleString('en-US')}–${range[1].toLocaleString('en-US')})` : ''}` : p.value
  const go = async () => {
    setBusy(true)
    setErr(null)
    try {
      const line = await apply(p)
      useAsk.setState((s) => ({ done: { ...s.done, [actionKey(a, i)]: line } }))
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid items-start gap-3" style={{ gridTemplateColumns: '1fr auto' }}>
      <div className="min-w-0">
        <div><span className="font-medium">{ACTION_VERB[p.kind]}</span> <span className="mono text-blue">{p.target_id}</span> <span className="text-ink-2">· {value}</span></div>
        <div className="text-ink-3">{err ?? (done ? `Recorded: ${done}` : p.why)}</div>
      </div>
      {done ? <span className="btn done">Recorded ✓</span> : (
        <button className="btn relative" onClick={go} disabled={busy}>{busy ? '…' : ACTION_VERB[p.kind]}{sh.pulse === `action-${i}` && <Pulse />}</button>
      )}
    </div>
  )
}

/** Open what a citation points at, and light it: the sheet's objects, the check, the file row, the price row. */
export function openCitation(run: Run, c: Citation, set: ReturnType<typeof useUI.getState>['set']) {
  const t = citeTarget(run, c)
  const go = useNav.getState().go
  const source = sourceName(run, c)
  if (!t) return
  if (t.kind === 'sheet') {
    set({ sheetId: t.sheetId, hi: { quote: c.quote, source, sheetId: t.sheetId, objectIds: t.objectIds, page: c.page }, compare: false, colour: false })
    go('review')
  } else if (t.kind === 'check') {
    const chk = run.checks.find((x) => x.check_id === t.checkId)
    const sid = chk?.evidence.sheet_ids?.find((s) => run.sheets.some((x) => x.sheet_id === s))
    set({ selected: t.checkId, ...(sid ? { sheetId: sid } : {}), hi: undefined, filter: chk && chk.severity === 'info' ? 'all' : useUI.getState().filter })
    go('review')
  } else if (t.kind === 'file') {
    set({ hi: { quote: c.quote, source, fileId: t.fileId, page: t.page } })
    go('open')
  } else {
    set({ hi: { quote: c.quote, source, code: t.code } })
    go('prices')
  }
}
