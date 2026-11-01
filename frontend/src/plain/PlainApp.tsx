import { Clapperboard, Maximize2, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Lockup } from '../components/Brand'
import { SheetView, type SheetHandle } from '../components/SheetView'
import { SourceLegend } from '../components/SourceLegend'
import { CurrencyToggle } from '../components/CurrencyToggle'
import { SourceToggle } from '../components/SourceToggle'
import { Tally } from '../components/Tally'
import { useRules, useRun } from '../lib/api'
import { fmt } from '../lib/format'
import { plainLooks } from '../lib/looks'
import { isRasterSheet, sheetById, sheetForCheck, tallyView } from '../lib/model'
import type { Check, Item, Run, Sheet } from '../lib/types'
import { ChecksBoard, FilesGrid, ItemsTable, ReviewPanel, RulesPanel, Scoreboard, SectionTitle } from './panels'

const SHEET_W = 1268
const SHEET_H = 588
const RAIL = 292

type Selection = { type: 'item' | 'check'; id: string; objects: string[]; sheet?: string } | null

export function PlainApp() {
  const { data: run, error, isLoading } = useRun()
  if (error) return <Centre>Could not load the run: {String(error.message)}</Centre>
  if (isLoading || !run) return <Centre>Loading the package…</Centre>
  return <Product run={run} />
}

function Centre({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-[22px] text-mute">{children}<SourceToggle className="absolute bottom-5 right-6" /></div>
}

function Product({ run }: { run: Run }) {
  const rules = useRules()
  const firstSheet = run.sheets.find((s) => s.counted && s.kind === 'plan') ?? run.sheets[0]
  const [sheetId, setSheetId] = useState(firstSheet?.sheet_id)
  const [sel, setSel] = useState<Selection>(null)
  const [pendingZoom, setPendingZoom] = useState<{ sheet: string; ids: string[]; n: number } | null>(null)
  const sheetRef = useRef<SheetHandle>(null)
  const sheet = sheetById(run, sheetId) ?? firstSheet

  const selectedObjects = useMemo(() => new Set(sel && (!sel.sheet || sel.sheet === sheet?.sheet_id) ? sel.objects : []), [sel, sheet])
  const confirmed = useMemo(() => new Set(run.items.filter((i) => i.confirmed).map((i) => i.item_id)), [run.items])
  const looks = useMemo(() => (sheet ? plainLooks(run, sheet, selectedObjects, confirmed) : {}), [run, sheet, selectedObjects, confirmed])

  useEffect(() => {
    if (!pendingZoom || pendingZoom.sheet !== sheet?.sheet_id) return
    const id = requestAnimationFrame(() => {
      if (pendingZoom.ids.length) void sheetRef.current?.zoomTo(pendingZoom.ids, { duration: 360, pad: 3 })
      else void sheetRef.current?.home({ duration: 360 })
    })
    return () => cancelAnimationFrame(id)
  }, [pendingZoom, sheet])

  const show = useCallback((s: Sheet | undefined, ids: string[]) => {
    if (!s) return
    setSheetId(s.sheet_id)
    const onSheet = ids.filter((id) => s.objects.some((o) => o.object_id === id))
    setPendingZoom((p) => ({ sheet: s.sheet_id, ids: onSheet, n: (p?.n ?? 0) + 1 }))
  }, [])

  const selectItem = useCallback((it: Item) => {
    const s = it.sheet_ids.map((id) => sheetById(run, id)).find((x) => x?.objects.some((o) => it.object_ids.includes(o.object_id))) ?? sheetById(run, it.sheet_ids[0])
    setSel({ type: 'item', id: it.item_id, objects: it.object_ids, sheet: s?.sheet_id })
    show(s, it.object_ids)
  }, [run, show])

  const selectCheck = useCallback((c: Check) => {
    if (sel?.type === 'check' && sel.id === c.check_id) return setSel(null)
    const s = sheetForCheck(run, c, sheet?.sheet_id)
    setSel({ type: 'check', id: c.check_id, objects: c.evidence.object_ids ?? [], sheet: s?.sheet_id })
    if (s) show(s, c.evidence.object_ids ?? [])
  }, [run, sel, sheet, show])

  const onObjectClick = useCallback((o: { object_id: string }) => {
    const it = run.items.find((i) => i.object_ids.includes(o.object_id) && (!sheet || i.sheet_ids.includes(sheet.sheet_id)))
    if (it) selectItem(it)
    else setSel({ type: 'item', id: '', objects: [o.object_id], sheet: sheet?.sheet_id })
  }, [run.items, selectItem, sheet])

  const regulation = (rules.data?.length ? rules.data : run.checks.filter((c) => c.category === 'regulation' || c.category === 'protected_tree'))
  const flaggedCount = run.items.filter((i) => !i.agreed && !i.confirmed).length
  const scroll = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const drawingSheets = run.sheets

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* top bar */}
      <header className="flex h-[72px] shrink-0 items-center gap-6 border-b border-line px-6">
        <Lockup size={28} />
        <div className="h-8 w-px bg-line" />
        <div className="min-w-0">
          <div className="truncate text-[17px] font-medium text-white">{run.package.name}</div>
          <div className="mt-0.5 text-[13px] text-mute">
            <span className="mono text-soft">{run.package.file_count}</span> files · <span className="mono text-soft">{run.sheets.length}</span> sheets · <span className="mono text-soft">{run.items.length}</span> items · <span className="mono text-soft">{run.checks.length}</span> checks
          </div>
        </div>
        <div className="mono ml-2 flex items-center gap-4 rounded-lg border border-line bg-chrome-2 px-3 py-1.5 text-[13px] text-soft">
          <span><span className="text-white">{fmt(run.timing.total_s, 1)}</span> s</span>
          <span className="text-cobalt-lt">Muse Spark <span className="text-white">{run.timing.spark_calls}</span></span>
          <span className="text-violet-lt">SAM 3.1 <span className="text-white">{run.timing.sam_calls}</span></span>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <SourceLegend size={14} />
          <CurrencyToggle rate={run.currency} />
          <SourceToggle className="relative" dropDown />
          <a href="?director=1" className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-soft hover:border-line-2 hover:text-white">
            <Clapperboard className="h-4 w-4" /> Director
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        {/* left: sheets, the sheet, the items */}
        <div className="flex w-[1268px] shrink-0 flex-col gap-3">
          <div className="flex h-[40px] shrink-0 items-end gap-1 overflow-x-auto scrollbar-thin">
            {drawingSheets.map((s) => {
              const active = s.sheet_id === sheet?.sheet_id
              return (
                <button key={s.sheet_id} onClick={() => show(s, [])} title={s.counted ? s.kind_why : s.not_counted_reason}
                  className={`flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 pb-2 pt-1.5 text-[13px] transition-colors ${active ? 'border-cobalt bg-chrome-2 text-white' : 'border-transparent text-mute hover:text-soft'}`}>
                  <span className={`mono font-semibold ${s.counted ? 'text-paper' : ''}`}>{s.number}</span>
                  <span className="max-w-[150px] truncate">{s.title}</span>
                  {!s.counted && <span className="rounded bg-[#262a31] px-1.5 text-[10.5px] uppercase tracking-wide text-mute">not counted</span>}
                </button>
              )
            })}
          </div>
          <div className="relative shrink-0 overflow-hidden rounded-xl border border-line bg-[#101215]" style={{ width: SHEET_W, height: SHEET_H }}>
            {sheet && (
              <SheetView ref={sheetRef} sheet={sheet} width={SHEET_W} height={SHEET_H} homeRect={{ x: RAIL + 28, y: 20, w: SHEET_W - RAIL - 28 - 64, h: SHEET_H - 40 }}
                raster={isRasterSheet(run, sheet)} looks={looks} tagSize={14} interactive cad onObjectClick={onObjectClick} />
            )}
            <div className="pointer-events-none absolute bottom-4 left-4 top-4 flex flex-col justify-between" style={{ width: RAIL }}>
            {sheet && (
              <div className="rounded-lg border border-line bg-[rgba(18,20,24,0.88)] px-3 py-2.5 backdrop-blur">
                <div className="text-[15px] font-semibold text-white">{sheet.number} · {sheet.title}</div>
                {sheet.revision && <div className="mt-0.5 text-[12.5px] text-mute">Rev {sheet.revision}{sheet.date ? ` · ${sheet.date}` : ''}</div>}
                <div className="mt-2 space-y-1 text-[12.5px] leading-snug">
                  <div className={sheet.kind_by === 'spark' ? 'text-cobalt-lt' : 'text-soft'}>{sheet.kind}{sheet.kind_by === 'spark' ? ` · Muse Spark ${fmt(sheet.kind_confidence, 2)}` : ''}</div>
                  <div>{sheet.counted ? <span className="text-soft">counted</span> : <span className="text-amber">{sheet.not_counted_reason ?? 'not counted'}</span>}</div>
                  {sheet.scale_title && <div className="text-mute">scale {sheet.scale_title}{sheet.scale_measured && sheet.scale_measured !== sheet.scale_title && <span className="text-amber"> · measured {sheet.scale_measured}</span>}</div>}
                </div>
              </div>
            )}
            <Tally rows={tallyView(run.tally).slice(0, 5)} size={15} />
            </div>
            <div className="absolute right-4 top-4 flex flex-col overflow-hidden rounded-lg border border-line bg-[rgba(18,20,24,0.88)]">
              <IconBtn onClick={() => { const v = sheetRef.current?.view(); if (v) void sheetRef.current?.setView({ k: v.k * 1.5, x: SHEET_W / 2 - (SHEET_W / 2 - v.x) * 1.5, y: SHEET_H / 2 - (SHEET_H / 2 - v.y) * 1.5 }, 240) }}><Plus className="h-4 w-4" /></IconBtn>
              <IconBtn onClick={() => { const v = sheetRef.current?.view(); if (v) void sheetRef.current?.setView({ k: v.k / 1.5, x: SHEET_W / 2 - (SHEET_W / 2 - v.x) / 1.5, y: SHEET_H / 2 - (SHEET_H / 2 - v.y) / 1.5 }, 240) }}><Minus className="h-4 w-4" /></IconBtn>
              <IconBtn onClick={() => void sheetRef.current?.home({ duration: 320 })}><Maximize2 className="h-4 w-4" /></IconBtn>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ItemsTable run={run} selectedItem={sel?.type === 'item' ? sel.id : undefined} onSelect={selectItem} />
          </div>
        </div>

        {/* right: review, checks, rules, files */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-[#16181c]">
          <nav className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2 text-[13px]">
            {([['review', 'Review', flaggedCount], ['checks', 'Checks', run.checks.length], ['rules', 'Rules', regulation.length], ['files', 'Files', run.files.length]] as const).map(([id, label, n]) => (
              <button key={id} onClick={() => scroll(`sec-${id}`)} className="rounded-md px-2.5 py-1 text-soft hover:bg-white/[0.05] hover:text-white">
                {label} <span className={`mono ml-1 ${id === 'review' && n ? 'text-amber' : 'text-mute'}`}>{n}</span>
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto scrollbar-thin px-4 pb-6 pt-4">
            <div>
              <SectionTitle right="answer key: sample package only">Error scoreboard</SectionTitle>
              <Scoreboard e={run.errors} />
            </div>
            <div>
              <SectionTitle id="sec-review" right="three sources, one answer">Disagreements</SectionTitle>
              <ReviewPanel run={run} onSelect={selectItem} selectedItem={sel?.type === 'item' ? sel.id : undefined} />
            </div>
            <div>
              <SectionTitle id="sec-checks" right={`${run.checks.length} ran`}>Checks</SectionTitle>
              <ChecksBoard run={run} selected={sel?.type === 'check' ? sel.id : undefined} onSelect={selectCheck} />
            </div>
            <div>
              <SectionTitle id="sec-rules" right="named articles, cited">Rules</SectionTitle>
              <RulesPanel checks={regulation} />
            </div>
            <div>
              <SectionTitle id="sec-files" right={`${run.files.length} files`}>Files</SectionTitle>
              <FilesGrid run={run} onSheet={(id) => show(sheetById(run, id), [])} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="flex h-8 w-8 items-center justify-center text-soft hover:bg-white/[0.06] hover:text-white">{children}</button>
}
