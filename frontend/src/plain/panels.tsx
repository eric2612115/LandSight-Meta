import { motion } from 'framer-motion'
import {
  Archive, Ban, Check as CheckIcon, ChevronRight, CircleAlert, ExternalLink, Eye, FileImage, FileSpreadsheet, FileText,
  Layers, Presentation, ScrollText, ShieldAlert, TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import { Gauge } from '../components/Gauge'
import { JsonLine, SparkCrop, answerLines } from '../components/SparkSaw'
import { useConfirm } from '../lib/api'
import { kindName, plantName, unitName } from '../lib/english'
import { bytes, fmt, num, qty } from '../lib/format'
import { CATEGORY_NAME, CATEGORY_ORDER, SEVERITY_ORDER, askedObject, verdictLabel } from '../lib/model'
import { useMoney } from '../lib/money'
import type { Check, ErrorScore, FileVerdict, Item, Run } from '../lib/types'

export const SEVERITY_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  fail: { bg: 'rgba(229,72,77,0.16)', fg: '#ff8a8d', label: 'fail' },
  flag: { bg: 'rgba(240,165,0,0.16)', fg: '#f0a500', label: 'flag' },
  review: { bg: 'rgba(109,141,255,0.16)', fg: '#93a9ff', label: 'needs review' },
  info: { bg: 'rgba(138,145,156,0.14)', fg: '#a6adb7', label: 'info' },
}

export const SOURCE_DOT: Record<string, { c: string; label: string }> = {
  geometry: { c: '#8b929c', label: 'geometry' },
  spark: { c: '#2457ff', label: 'Muse Spark' },
  sam: { c: '#7a3cff', label: 'SAM 3.1' },
  rule: { c: '#c3c8cf', label: 'rule' },
  bill: { c: '#5fb3a3', label: 'bill' },
}

export function SectionTitle({ children, right, id }: { children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="flex scroll-mt-14 items-baseline justify-between pb-3 pt-1">
      <h2 className="text-[15px] font-semibold uppercase tracking-[0.08em] text-soft">{children}</h2>
      {right && <div className="text-[13px] text-mute">{right}</div>}
    </div>
  )
}

export function Sev({ s }: { s: string }) {
  const st = SEVERITY_STYLE[s] ?? SEVERITY_STYLE.info
  return (
    <span className="inline-flex shrink-0 items-center rounded-md px-2 py-[2px] text-[12px] font-semibold" style={{ background: st.bg, color: st.fg }}>
      {st.label}
    </span>
  )
}

export function Sources({ by }: { by: string[] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {by.map((b) => (
        <span key={b} title={SOURCE_DOT[b]?.label ?? b} className="inline-block h-2 w-2 rounded-full" style={{ background: SOURCE_DOT[b]?.c ?? '#888' }} />
      ))}
    </span>
  )
}

// ------------------------------------------------------------------------------------------------ scoreboard

export function Scoreboard({ e }: { e: ErrorScore }) {
  if (!e.planted) return <div className="rounded-xl border border-line bg-chrome-2 px-4 py-3 text-[13.5px] text-mute">No answer key for this package: the scoreboard runs on the sample package only.</div>
  const cells: [string, number, string][] = [
    ['planted', e.planted, '#e8eaed'],
    ['found', e.found.length, '#3ccf7f'],
    ['needs review', e.flagged.length, '#93a9ff'],
    ['missed', e.missed.length, e.missed.length ? '#f0a500' : '#e8eaed'],
    ['false alarms', e.false_alarms.length, e.false_alarms.length ? '#ff8a8d' : '#e8eaed'],
  ]
  return (
    <div className="grid grid-cols-5 overflow-hidden rounded-xl border border-line bg-chrome-2">
      {cells.map(([label, v, c], i) => (
        <div key={label} className={`px-3 py-3 ${i ? 'border-l border-line' : ''}`}>
          <div className="mono text-[26px] font-semibold leading-none" style={{ color: c }}>{v}</div>
          <div className="mt-1.5 text-[12px] text-mute">{label}</div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ items table

export function ItemsTable({ run, selectedItem, onSelect }: { run: Run; selectedItem?: string; onSelect: (it: Item) => void }) {
  const head = ['ID', 'kind', 'label', 'unit', 'geometry', 'Muse Spark', 'schedule', 'agreed', 'count']
  return (
    <div className="h-full overflow-auto scrollbar-thin rounded-xl border border-line bg-chrome-2">
      <table className="w-full border-collapse text-[14px]">
        <thead className="sticky top-0 z-10 bg-chrome-3 text-left text-[12px] uppercase tracking-[0.06em] text-mute">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-semibold ${i >= 4 ? 'text-right' : ''} ${h === 'Muse Spark' ? 'text-cobalt-lt' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {run.items.map((it) => {
            const flagged = !it.agreed && !it.confirmed
            const sel = it.item_id === selectedItem
            const name = plantName(it.label, it.species_code, it.label, it.botanical)
            return (
              <tr key={it.item_id} onClick={() => onSelect(it)}
                className={`cursor-pointer border-t border-line/70 transition-colors ${sel ? 'bg-[rgba(36,87,255,0.16)]' : flagged ? 'bg-[rgba(240,165,0,0.10)] hover:bg-[rgba(240,165,0,0.16)]' : 'hover:bg-white/[0.03]'}`}>
                <td className={`mono px-3 py-[7px] font-semibold ${flagged ? 'text-amber' : 'text-soft'}`}>{it.item_id}</td>
                <td className="px-3 text-mute">{kindName(it.kind)}</td>
                <td className="px-3">
                  <span className="font-medium text-[#eef0f3]">{name.common}</span>
                  {name.botanical && <span className="ml-2 italic text-mute">{name.botanical}</span>}
                </td>
                <td className="px-3 text-mute">{unitName(it.unit)}</td>
                <td className="mono px-3 text-right text-graphite-lt">{qty(it.geometry_count)}</td>
                <td className="mono px-3 text-right text-cobalt-lt">{qty(it.spark_count)}</td>
                <td className="mono px-3 text-right text-soft">{qty(it.schedule_count)}</td>
                <td className="px-3 text-right">
                  {it.confirmed ? <span className="font-semibold text-green-lt">confirmed</span> : it.agreed ? <CheckIcon className="ml-auto h-4 w-4 text-mute" /> : <span className="font-semibold text-amber">flag</span>}
                </td>
                <td className={`mono px-3 text-right font-semibold ${it.confirmed ? 'text-green-lt' : 'text-white'}`}>{qty(it.quote_count)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ disagreements

export function threeSources(run: Run, it: Item) {
  const { obj } = askedObject(run, it)
  const gaps = obj?.gaps?.length ?? 0
  const geometry = obj && !obj.closed ? `open${gaps ? `, ${gaps} gaps` : ''}` : `${qty(it.geometry_count)} closed`
  const answer = it.spark?.answer ?? {}
  const kind = typeof answer.kind === 'string' ? answer.kind : kindName(it.kind)
  const one = answer.is_one_object === true
  const spark = it.spark ? `${one ? `one ${kind}` : `${qty(it.spark_count)} ${kind}`}, ${fmt(it.spark.confidence, 2)}` : qty(it.spark_count)
  return { geometry, spark, list: qty(it.schedule_count) }
}

export function ReviewPanel({ run, onSelect, selectedItem }: { run: Run; onSelect: (it: Item) => void; selectedItem?: string }) {
  const confirm = useConfirm()
  const flagged = run.items.filter((it) => !it.agreed || it.confirmed)
  if (!flagged.length) return <div className="rounded-xl border border-line bg-chrome-2 p-4 text-mute">Every quantity agrees across geometry, Muse Spark and the plant list.</div>
  return (
    <div className="space-y-3">
      {flagged.map((it) => {
        const s = threeSources(run, it)
        const { obj } = askedObject(run, it)
        const name = plantName(it.label, it.species_code, it.label, it.botanical)
        const done = !!it.confirmed
        return (
          <div key={it.item_id} className={`overflow-hidden rounded-xl border bg-chrome-2 ${done ? 'border-green/50' : 'border-amber/50'} ${selectedItem === it.item_id ? 'ring-2 ring-cobalt/60' : ''}`}>
            <button onClick={() => onSelect(it)} className="flex w-full items-start gap-3 px-4 pb-2 pt-3 text-left">
              {done ? <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-lt" /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber" />}
              <div className="min-w-0">
                <div className="text-[16px] font-semibold text-white">{it.item_id} · {name.common}{name.botanical && <span className="ml-2 font-normal italic text-mute">{name.botanical}</span>}</div>
                {it.flagged_reason && <div className="mt-1 text-[13.5px] leading-snug text-soft">{it.flagged_reason}</div>}
              </div>
            </button>
            <div className="grid grid-cols-3 gap-px border-y border-line bg-line text-[13px]">
              {([['Geometry', s.geometry, '#b5bcc6'], ['Muse Spark', s.spark, '#7d98ff'], ['Plant list', s.list, '#e8eaed']] as const).map(([k, v, c]) => (
                <div key={k} className="bg-chrome-2 px-3 py-2">
                  <div className="text-[11.5px] uppercase tracking-[0.06em] text-mute">{k}</div>
                  <div className="mono mt-0.5 text-[15px] font-semibold" style={{ color: c }}>{v}</div>
                </div>
              ))}
            </div>
            {it.spark && (
              <div className="grid grid-cols-[180px_1fr] gap-3 px-4 py-3">
                <SparkCrop spark={it.spark} obj={obj} showPoints className="h-[180px] w-[180px]" pointSize={9} />
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-cobalt-lt"><Eye className="h-3.5 w-3.5" /> What Muse Spark saw</div>
                  <pre className="mono overflow-hidden rounded-lg bg-[#111317] px-3 py-2 text-[12.5px] leading-[1.45]">
                    {answerLines(it.spark.answer).map((l, i) => <div key={i}><JsonLine line={l} /></div>)}
                  </pre>
                  <div className="mt-2 text-[12.5px] leading-snug text-mute">{it.spark.why}</div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
              <div className="text-[13px] text-mute">{done ? <>quote count <span className="mono font-semibold text-green-lt">{qty(it.quote_count)}</span></> : 'Landsight does not count it until a person confirms.'}</div>
              <button disabled={done || confirm.isPending} onClick={() => confirm.mutate(it)}
                className={`rounded-lg px-4 py-1.5 text-[14px] font-semibold transition-colors ${done ? 'bg-green/20 text-green-lt' : 'bg-white text-chrome hover:bg-[#dfe3e8]'}`}>
                {done ? 'Confirmed' : 'Confirm'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ checks

export function ChecksBoard({ run, selected, onSelect }: { run: Run; selected?: string; onSelect: (c: Check) => void }) {
  const groups = CATEGORY_ORDER.map((cat) => [cat, run.checks.filter((c) => c.category === cat).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.check_id.localeCompare(b.check_id))] as const).filter(([, cs]) => cs.length)
  const extra = run.checks.filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c.category))
  const m = useMoney(run.currency)
  return (
    <div className="space-y-4">
      {[...groups, ...(extra.length ? ([['other', extra]] as const) : [])].map(([cat, cs]) => (
        <div key={cat}>
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.07em] text-mute">
            <span>{CATEGORY_NAME[cat] ?? cat}</span>
            <span className="mono">{cs.length}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-chrome-2">
            {cs.map((c, i) => <CheckRow key={c.check_id} c={c} first={i === 0} open={selected === c.check_id} onClick={() => onSelect(c)} text={m.text} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function CheckRow({ c, first, open, onClick, text = (s) => s }: { c: Check; first: boolean; open: boolean; onClick: () => void; text?: (s: string) => string }) {
  return (
    <div className={`${first ? '' : 'border-t border-line/70'} ${open ? 'bg-[rgba(36,87,255,0.10)]' : ''}`}>
      <button onClick={onClick} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03]">
        <span className="mono mt-[3px] w-[42px] shrink-0 text-[12px] font-semibold text-mute">{c.check_id}</span>
        <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-[#e6e8eb]">{text(c.title)}</span>
        <span className="mt-[2px] flex shrink-0 items-center gap-2"><Sources by={c.by} /><Sev s={c.severity} /></span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3 pl-[64px] text-[13px] leading-snug text-soft">
          <div>{text(c.why)}</div>
          {c.citation && (
            <a href={c.citation.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-line bg-[#111317] px-3 py-2 hover:border-line-2">
              <div className="flex items-center gap-1.5 font-semibold text-white"><ScrollText className="h-3.5 w-3.5 text-mute" />{c.citation.article}<ExternalLink className="h-3 w-3 text-mute" /></div>
              <div className="mt-1 text-mute">{c.citation.gloss}</div>
            </a>
          )}
          {(c.evidence.cells?.length || c.evidence.object_ids?.length) ? (
            <div className="flex flex-wrap gap-1.5">
              {c.evidence.object_ids?.slice(0, 10).map((id) => <span key={id} className="mono rounded bg-[#262a31] px-1.5 py-[1px] text-[11.5px] text-soft">{id}</span>)}
              {c.evidence.cells?.map((cell) => <span key={cell} className="mono rounded bg-[#1f2a29] px-1.5 py-[1px] text-[11.5px] text-[#8fd3c4]">{cell}</span>)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ rules

const TERM_NAME: Record<string, string> = { A0: 'site area A₀', Ap: 'hard to green Aₚ', r: 'coverage r', A_prime: 'min. greening A′', beta: 'β', alpha: 'α', ra: 'native ratio rₐ', sigma: 'Σ Gi × Ai' }

export function RulesPanel({ checks }: { checks: Check[] }) {
  const main = checks.find((c) => num(c.numbers?.required) !== undefined && num(c.numbers?.provided) !== undefined)
  const others = checks.filter((c) => c !== main)
  if (!main) return <div className="rounded-xl border border-line bg-chrome-2 p-4 text-mute">No regulation checks in this run.</div>
  const n = main.numbers ?? {}
  const required = num(n.required) ?? 0
  const provided = num(n.provided) ?? 0
  const results = (main.fixes ?? []).map((f) => num(f.result) ?? 0)
  const max = Math.max(required, provided, ...results) * 1.08
  const terms = Array.isArray(n.terms) ? (n.terms as Record<string, unknown>[]) : []
  const scalar = (k: string) => (n[k] !== undefined && typeof n[k] !== 'object' ? String(n[k]) : undefined)
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-chrome-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            {main.citation ? (
              <a href={main.citation.url} target="_blank" rel="noreferrer" className="text-[15px] font-semibold text-white hover:underline">{main.citation.article}</a>
            ) : <div className="text-[15px] font-semibold text-white">{main.title}</div>}
            {main.citation && <div className="mt-1 text-[13px] leading-snug text-mute">{main.citation.gloss}</div>}
          </div>
          <Sev s={main.severity} />
        </div>
        <div className="mt-3">
          <Gauge value={provided} required={required} max={max} width={520} height={16} fontSize={15} duration={0} />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          {['A0', 'Ap', 'r', 'A_prime', 'beta', 'sigma', 'alpha', 'ra'].filter((k) => scalar(k) !== undefined).map((k) => (
            <div key={k} className="flex justify-between border-b border-line/50 py-1">
              <span className="text-mute">{TERM_NAME[k] ?? k}</span>
              <span className="mono text-soft">{scalar(k)}</span>
            </div>
          ))}
          <div className="flex justify-between border-b border-line/50 py-1"><span className="text-mute">required</span><span className="mono font-semibold text-white">{fmt(required, 1)}</span></div>
          <div className="flex justify-between border-b border-line/50 py-1"><span className="text-mute">provided</span><span className={`mono font-semibold ${provided > required ? 'text-green-lt' : 'text-[#ff8a8d]'}`}>{fmt(provided, 1)}</span></div>
        </div>
        {terms.length > 0 && (
          <table className="mt-3 w-full text-[13px]">
            <thead className="text-left text-[11.5px] uppercase tracking-[0.06em] text-mute">
              <tr><th className="py-1 font-semibold">term</th><th className="text-right font-semibold">Ai m²</th><th className="text-right font-semibold">Gi</th><th className="text-right font-semibold">Gi × Ai</th></tr>
            </thead>
            <tbody>
              {terms.map((t, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="py-1 text-soft">{String(t.label ?? '')}</td>
                  <td className="mono text-right text-soft">{qty(num(t.Ai))}</td>
                  <td className="mono text-right text-soft">{String(t.Gi ?? '')}</td>
                  <td className="mono text-right text-white">{fmt(num(t.product), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {main.fixes && main.fixes.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-mute">two ways to pass</div>
            {main.fixes.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-[#111317] px-3 py-2 text-[13.5px]">
                <span className="text-soft">{f.label}</span>
                <span className={`mono shrink-0 font-semibold ${f.passes ? 'text-green-lt' : 'text-[#ff8a8d]'}`}>{typeof f.result === 'number' ? fmt(f.result, 1) : f.result} {f.passes ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-[12.5px] text-mute">pass / fail / needs review · the architect signs off</div>
      </div>
      {others.map((c) => (
        <div key={c.check_id} className="rounded-xl border border-line bg-chrome-2 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[14px] font-medium text-white">{c.title}</div>
            <Sev s={c.severity} />
          </div>
          {c.citation && <a href={c.citation.url} target="_blank" rel="noreferrer" className="mt-1 block text-[12.5px] text-cobalt-lt hover:underline">{c.citation.article}</a>}
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ files

export function verdictIcon(f: FileVerdict) {
  switch (f.verdict) {
    case 'drawing_vector': return Layers
    case 'drawing_raster': return FileImage
    case 'drawing_image': return FileImage
    case 'bill': return FileSpreadsheet
    case 'quote': return FileSpreadsheet
    case 'presentation': return Presentation
    case 'backup_ignored': return Ban
    case 'archive_unpacked': return Archive
    case 'unsupported': return CircleAlert
    case 'unreadable': return ShieldAlert
    default: return FileText
  }
}

export function FilesGrid({ run, onSheet }: { run: Run; onSheet: (sheetId: string) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-chrome-2">
      {run.files.map((f, i) => {
        const Icon = verdictIcon(f)
        const dead = f.verdict === 'unsupported' || f.verdict === 'unreadable' || f.verdict === 'backup_ignored'
        const drawing = f.verdict.startsWith('drawing')
        return (
          <div key={f.file_id} className={i ? 'border-t border-line/70' : ''}>
            <button onClick={() => (f.sheet_id ? onSheet(f.sheet_id) : setOpen(open === f.file_id ? null : f.file_id))}
              className="flex w-full items-center gap-2.5 px-3 py-[7px] text-left hover:bg-white/[0.03]">
              <Icon className={`h-4 w-4 shrink-0 ${dead ? 'text-[#5a606a]' : drawing ? 'text-paper' : 'text-soft'}`} />
              <span className={`min-w-0 flex-1 truncate text-[13px] ${dead ? 'text-mute' : 'text-[#e6e8eb]'}`} title={f.path}>{f.name}</span>
              {f.decided_by === 'spark' && <Eye className="h-3.5 w-3.5 shrink-0 text-cobalt-lt" aria-label="decided by Muse Spark" />}
              <span className={`shrink-0 rounded-md px-2 py-[2px] text-[12px] font-medium ${drawing ? 'bg-paper text-ink' : dead ? 'bg-[#22262c] text-mute' : 'bg-[#262a31] text-soft'}`}>{verdictLabel(f)}</span>
              {f.sheet_id && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-mute" />}
            </button>
            {(open === f.file_id) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-3 pb-2 pl-[38px] text-[12.5px] text-mute">
                {f.why} · {bytes(f.size_bytes)} · decided by {f.decided_by === 'spark' ? 'Muse Spark' : f.decided_by === 'ext' ? 'extension' : 'content'}
              </motion.div>
            )}
          </div>
        )
      })}
    </div>
  )
}
