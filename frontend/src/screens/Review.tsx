/** /review — B's two panes: flags grouped by scenario on the left; the sheet with pins, the callout, the dock and the
 * filmstrip on the right. Keyboard: ↑↓ move, ⏎ confirm, ⌫ dismiss. */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useFlagActions } from '../app/actions'
import { inFilter, useFlags } from '../app/derive'
import { useDecisions, useUI } from '../app/state'
import { loadSvg, type SheetHandle } from '../components/SheetView'
import { filmSheets, type Flag } from '../lib/flags'
import { isRasterSheet } from '../lib/model'
import type { Run } from '../lib/types'
import { FlagList } from '../review/FlagList'
import { pinsOn } from '../review/model'
import { SheetPane } from '../review/SheetPane'

export type ReviewHandle = { sheet: () => SheetHandle | null; select: (id: string | undefined, opts?: { sheet?: string }) => void }

export const defaultSheet = (run: Run) => (filmSheets(run).find((s) => s.counted && s.kind === 'plan') ?? run.sheets[0])?.sheet_id

/** What the review opens with, fetched ahead (during the Open screen's cascade) so the step after it is instant: the
 * governing sheet's print and the filmstrip's thumbnails. */
export function warmReview(run: Run) {
  const sheet = run.sheets.find((s) => s.sheet_id === defaultSheet(run))
  if (sheet && !isRasterSheet(run, sheet)) void loadSvg(sheet.svg_url)
  for (const s of filmSheets(run)) {
    const img = new Image()
    img.src = s.png_url
  }
}

export const Review = forwardRef<ReviewHandle, { run: Run }>(function Review({ run }, ref) {
  const flags = useFlags(run)
  const ui = useUI()
  const d = useDecisions((s) => s.d)
  const acts = useFlagActions(run)
  const sheetRef = useRef<SheetHandle>(null)
  const sheetId = ui.sheetId && run.sheets.some((s) => s.sheet_id === ui.sheetId) ? ui.sheetId : defaultSheet(run)
  const sheet = run.sheets.find((s) => s.sheet_id === sheetId)!
  const listed = useMemo(() => flags.filter((f) => inFilter(f, ui.filter, d[f.id]?.state) || f.id === ui.selected), [flags, ui.filter, d, ui.selected])
  const pins = useMemo(() => (sheet ? pinsOn(sheet, listed.filter((f) => f.alarm || f.id === ui.selected)) : []), [sheet, listed, ui.selected])
  const pinNo = useMemo(() => Object.fromEntries(pins.map((p) => [p.flag.id, p.n])), [pins])
  const selected = flags.find((f) => f.id === ui.selected)

  const select = useCallback((f: Flag | undefined, opts: { sheet?: string } = {}) => {
    if (!f) return ui.set({ selected: undefined })
    const target = opts.sheet ?? (f.sheetIds.length && !f.sheetIds.includes(sheetId!) ? f.sheetIds[0] : undefined)
    ui.set({ selected: f.id, ...(target ? { sheetId: target } : {}), hi: ui.hi && target && ui.hi.sheetId !== target ? undefined : ui.hi })
  }, [ui, sheetId])

  useImperativeHandle(ref, () => ({
    sheet: () => sheetRef.current,
    select: (id, opts) => select(flags.find((f) => f.id === id), opts),
  }), [flags, select])

  // first visit: the first flag pinned on the governing plan
  useEffect(() => {
    if (ui.selected === undefined && !useUI.getState().selected && pins.length && !new URLSearchParams(window.location.search).get('director')) {
      // the first pinned flag that queries money, else the first pin
      ui.set({ selected: (pins.find((p) => p.flag.money.kind === 'over') ?? pins[0]).flag.id })
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ↑↓ move, ⏎ confirm, ⌫ dismiss (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) || useUI.getState().askOpen) return
      const visible = flags.filter((f) => inFilter(f, useUI.getState().filter, useDecisions.getState().d[f.id]?.state))
      const i = visible.findIndex((f) => f.id === useUI.getState().selected)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const next = visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (next) {
          select(next)
          document.querySelector(`[data-flag="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' })
        }
      } else if (e.key === 'Enter' && i >= 0) {
        e.preventDefault()
        acts.confirm(visible[i].check)
        const next = visible[i + 1]
        if (next && useUI.getState().filter === 'need') select(next)
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && i >= 0) {
        e.preventDefault()
        acts.dismiss(visible[i].check)
        const next = visible[i + 1]
        if (next) select(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flags, select, acts])

  if (!sheet) return <div className="p-6 text-ink-2">This run has no sheets to show.</div>
  return (
    <div className="grid h-[1004px] gap-px bg-line" style={{ gridTemplateColumns: '580px 1fr' }}>
      <FlagList run={run} flags={flags} pinNo={pinNo} sheetId={sheetId} onSelect={(f) => select(f)} onSheet={(id) => ui.set({ sheetId: id, compare: false, colour: false })} />
      <SheetPane ref={sheetRef} run={run} sheet={sheet} flags={flags} pins={pins} selected={selected} onSelect={(f) => select(f)}
        onSheet={(id) => ui.set({ sheetId: id, compare: false, colour: false })}
        acts={{ confirm: (f) => acts.confirm(f.check), dismiss: (f) => acts.dismiss(f.check), reopen: (f) => acts.reopen(f.check), note: (f, text) => acts.note(f.check, text) }} />
    </div>
  )
})
