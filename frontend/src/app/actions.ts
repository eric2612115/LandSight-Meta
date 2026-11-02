/** What the owner's clicks do: confirm or dismiss a flag, apply an action Muse Spark proposed. On the live backend a
 * confirmation is recorded with POST /api/ask/actions (a `flag` annotation, source "screen"); on the recorded mock it
 * stays in the browser. */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { normalise, runKey, useConfirm, useResolvedSource, useRunSel } from '../lib/api'
import { postAction, priceRange, type ProposedAction } from '../lib/ask'
import { useSavePrice } from '../lib/prices'
import { play } from '../lib/sound'
import type { Check, Item, Run } from '../lib/types'
import { useDecisions, type Decision } from './state'

/** The item a flag stands for when confirming the flag means accepting what Muse Spark proposed (T-08 is one tree):
 * the check's only object is the object Spark was asked about. */
export function proposedItem(run: Run, c: Check): Item | undefined {
  const ids = c.evidence.object_ids ?? []
  return run.items.find((it) => !it.agreed && !it.confirmed && it.spark?.object_id && ids.length === 1 && ids[0] === it.spark.object_id &&
    (c.item_ids?.includes(it.item_id) ?? true))
}

export function useFlagActions(run: Run) {
  const src = useResolvedSource()
  const confirmItem = useConfirm()
  const decide = useDecisions((s) => s.decide)
  return {
    confirm: (c: Check, opts: { quiet?: boolean } = {}) => {
      decide(c.check_id, 'confirmed')
      if (!opts.quiet) play('chime', { volume: 0.6 })
      const it = proposedItem(run, c)
      if (it) confirmItem.mutate(it)
      if (src === 'live') {
        const note = useDecisions.getState().notes[c.check_id]
        void postAction(run, { kind: 'flag', target_id: c.check_id, value: note || c.title, why: 'Confirmed on the review screen: goes to the query letter' }, 'screen').catch(() => {})
      }
    },
    dismiss: (c: Check) => {
      decide(c.check_id, 'dismissed')
      play('tick', { volume: 0.4 })
    },
    reopen: (c: Check) => decide(c.check_id, null),
  }
}

/** Apply one proposed action; resolves to the line the dock shows once it is recorded. */
export function useAskAction(run: Run | undefined) {
  const src = useResolvedSource()
  const qc = useQueryClient()
  const confirmItem = useConfirm()
  const savePrice = useSavePrice()
  return async (a: ProposedAction): Promise<string> => {
    if (!run) throw new Error('no run')
    const d = useDecisions.getState()
    if (src === 'live') {
      const res = await postAction(run, a, 'ask')
      if (res.run) qc.setQueryData(runKey(src, useRunSel.getState().id), normalise(res.run, 'live'))
      if (a.kind === 'confirm_price') void qc.invalidateQueries({ queryKey: ['price-list'] })
    } else if (a.kind === 'confirm_element') {
      const it = run.items.find((i) => i.item_id === a.target_id)
      if (!it) throw new Error(`no item ${a.target_id}`)
      await confirmItem.mutateAsync(it)
    } else if (a.kind === 'confirm_price') {
      const r = priceRange(a.value)
      if (!r) throw new Error('a price needs low-high')
      await savePrice.mutateAsync({ code: a.target_id, low: r[0], high: r[1] })
    }
    // the screen shows it at once, whichever source recorded it
    if (a.kind === 'flag' && run.checks.some((c) => c.check_id === a.target_id)) {
      d.decide(a.target_id, 'confirmed', 'ask')
      if (!d.notes[a.target_id]) d.note(a.target_id, a.value)
    }
    if (a.kind === 'regulation_note') d.note(a.target_id, a.value)
    play('chime', { volume: 0.6 })
    const r = priceRange(a.value)
    return a.kind === 'confirm_price' ? `price list ${a.target_id} set to NT$${r ? `${r[0].toLocaleString('en-US')}–${r[1].toLocaleString('en-US')}` : a.value}` : a.kind === 'flag' ? `${a.target_id} goes to the query letter` : a.kind === 'regulation_note' ? `note added to ${a.target_id}` : `${a.target_id} confirmed`
  }
}

type Annotation = { kind: string; target_id: string; value?: unknown; source?: string }

/** Seed the decisions from what the backend recorded (annotations, and per-check flags and notes). */
export function useRunDecisions(run: Run | undefined) {
  const load = useDecisions((s) => s.load)
  useEffect(() => {
    if (!run) return
    const d: Record<string, Decision> = {}
    const notes: Record<string, string> = {}
    const ids = new Set(run.checks.map((c) => c.check_id))
    const anns: Annotation[] = [...((run as Run & { annotations?: Annotation[] }).annotations ?? [])]
    for (const c of run.checks as (Check & { flags?: Annotation[]; notes?: Annotation[] })[]) {
      for (const a of c.flags ?? []) anns.push({ ...a, kind: 'flag', target_id: c.check_id })
      for (const a of c.notes ?? []) anns.push({ ...a, kind: 'regulation_note', target_id: c.check_id })
    }
    for (const a of anns) {
      if (!ids.has(a.target_id)) continue
      if (a.kind === 'flag') d[a.target_id] = { state: 'confirmed', at: 0, source: a.source === 'ask' ? 'ask' : 'screen' }
      if (typeof a.value === 'string' && a.value && (a.kind === 'regulation_note' || a.kind === 'flag')) notes[a.target_id] = a.value
    }
    load(run.run_id, { d, notes })
  }, [run, load])
}
