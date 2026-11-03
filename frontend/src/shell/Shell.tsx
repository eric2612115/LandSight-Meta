/** The frame every screen shares: the 48 px top bar (brand, package, the four steps, Ask), the 28 px status bar (run
 * facts, the rate, TWD / USD), the camera the director moves, and the caption it burns in. */
import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun, SunMoon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Lockup } from '../components/Brand'
import { fmt } from '../lib/format'
import { useCurrency, useMoney } from '../lib/money'
import { useSource } from '../lib/source'
import { nextThemePref, useTheme } from '../lib/theme'
import type { Run } from '../lib/types'
import { useCounts } from '../app/derive'
import { useShow } from '../app/show'
import { useCamera, useNav, useUI, type Route } from '../app/state'
import { useProjects, whereRun } from '../lib/projects'
import { shortPkg } from '../screens/Projects'

export function TopBar({ run }: { run?: Run }) {
  const route = useNav((s) => s.route)
  const go = useNav((s) => s.go)
  const askOpen = useUI((s) => s.askOpen)
  const set = useUI((s) => s.set)
  const pulse = useShow((s) => s.pulse)
  return (
    <header className="top">
      <div className="brand">
        <button onClick={() => go('open')} className="cursor-pointer border-0 bg-transparent p-0" aria-label="Landsight"><Lockup size={22} colour="var(--color-ink)" /></button>
        {run && <Crumbs run={run} />}
      </div>
      {run ? <Steps run={run} route={route} go={go} /> : <div />}
      <div className="right">
        <button className={`btn ghost ${askOpen ? 'on' : ''} relative`} onClick={() => set({ askOpen: !askOpen })}>
          Ask the package <kbd>⌘K</kbd>
          {pulse === 'ask' && <Pulse />}
        </button>
        <button className={`btn ghost ${route === 'prices' ? 'on' : ''}`} onClick={() => go('prices')}>Price list</button>
        <button className="btn ghost" onClick={() => go(route === 'statement' ? 'review' : 'statement')}>{route === 'statement' ? 'Review' : 'Statement'}</button>
        <button className="btn" onClick={() => go('statement')}>Export…</button>
        <ThemeToggle />
      </div>
    </header>
  )
}

const THEME_WORD = { light: 'light', dark: 'dark', system: 'system' } as const

/** Light → dark → system (sun, moon, both), in the currency switch's style; the choice is kept in this browser
 * (lib/theme.ts). */
function ThemeToggle() {
  const pref = useTheme((s) => s.pref)
  const resolved = useTheme((s) => s.resolved)
  const cycle = useTheme((s) => s.cycle)
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : SunMoon
  const next = nextThemePref(pref)
  const now = `${THEME_WORD[pref]}${pref === 'system' ? ` (${resolved} now)` : ''}`
  return (
    <div className="seg sm" role="group" aria-label="Theme">
      <button className="flex items-center !px-[6px] !py-[4px]" onClick={cycle} data-theme-toggle={pref} aria-label={`Theme: ${now}; switch to ${THEME_WORD[next]}`} title={`Theme: ${now} · click for ${THEME_WORD[next]}`}>
        <Icon size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}

/** project › package › run, then the run's facts. */
function Crumbs({ run }: { run: Run }) {
  const { projects } = useProjects()
  const go = useNav((s) => s.go)
  const set = useUI((s) => s.set)
  const { project, pkg } = whereRun(projects, run)
  const mode = (run.timing as Run['timing'] & { mode?: string }).mode ?? 'fixtures'
  return (
    <div className="pkg">
      {project && <button className="cursor-pointer border-0 bg-transparent p-0 text-ink-2 hover:text-ink" onClick={() => { set({ pkg: pkg?.package_id }); go('projects') }}>{project.name} ›</button>}
      <b>{shortPkg(project, pkg?.name ?? run.package.name)}</b>
      <span>› run <span className="mono">{run.run_id.slice(0, 8)}</span> {mode} · {run.package.file_count} files · {run.sheets.length} sheets · {run.checks.length} checks</span>
    </div>
  )
}

function Steps({ run, route, go }: { run: Run; route: Route; go: (r: Route) => void }) {
  const c = useCounts(run)
  const st = (n: number) => {
    const now = route === 'open' || route === 'projects' ? 1 : route === 'review' ? (c.confirmed ? 3 : 2) : route === 'statement' ? 4 : 0
    return n === now ? 'now' : n < now || (now === 0 && n < 3) || (n === 3 && c.confirmed > 0 && now !== 3) ? 'done' : ''
  }
  const items: [number, string, Route][] = [
    [1, 'Open package', 'projects'],
    [2, `Read flags · ${c.alarms}`, 'review'],
    [3, `Confirm · ${c.confirmed} of ${c.alarms}`, 'review'],
    [4, 'Export', 'statement'],
  ]
  return (
    <nav className="steps">
      {items.map(([n, label, r], i) => (
        <span key={n} className="contents">
          {i > 0 && <span className="arrow">›</span>}
          <button className={`s ${st(n)} cursor-pointer border-0 bg-transparent`} onClick={() => go(r)}><span className="k">{n}</span>{label}</button>
        </span>
      ))}
    </nav>
  )
}

export function StatusBar({ run }: { run?: Run }) {
  const m = useMoney(run?.currency)
  const setCur = useCurrency((s) => s.setCur)
  const src = useSource((s) => s.resolved)
  const t = run?.timing as (Run['timing'] & { spark_s?: number; sam_s?: number; mode?: string; recorded?: boolean }) | undefined
  const measured = run?.sheets.filter((s) => s.counted).length ?? 0
  const read = run?.sheets.filter((s) => s.source !== 'pdf_vector' && s.source !== 'pdf_raster').length ?? 0
  const rate = run?.currency?.twd_per_usd ?? (run?.currency?.usd_per_twd ? 1 / run.currency.usd_per_twd : undefined)
  return (
    <div className="status">
      <div className="overflow-hidden text-ellipsis">
        {run ? (
          <>Run <span className="mono">{run.run_id.slice(0, 8)}</span> · {t?.mode ?? 'fixtures'}, {t?.recorded === false ? 'live' : 'recorded'} · {fmt(t?.total_s, 1)} s · Muse Spark {t?.spark_calls ?? 0} calls{t?.spark_s ? `, ${fmt(t.spark_s, 1)} s` : ''} · SAM 3.1 {t?.sam_calls ?? 0} calls{t?.sam_s ? `, ${fmt(t.sam_s, 1)} s` : ''} · geometry {read} sheets, {measured} measured</>
        ) : 'No package open'}
      </div>
      <div className="flex items-center gap-3">
        {rate && <span>1 USD = NT${fmt(rate, 3)} ({run?.currency?.as_of})</span>}
        <span>· rules: local building code, Art. 299 and 302 · local greening rule · local tree protection rule ·</span>
        <span className="text-ink-3">data: {src === 'live' ? 'live API' : src === 'repo' ? 'recorded run (frontend-mock)' : src === 'mock' ? 'built-in mock' : '…'}</span>
        <div className="seg sm" role="group" aria-label="Currency">
          <button className={m.wanted === 'usd' ? 'on' : ''} onClick={() => setCur('usd')}>USD</button>
          <button className={m.wanted === 'twd' ? 'on' : ''} onClick={() => setCur('twd')}>TWD</button>
        </div>
      </div>
    </div>
  )
}

/** The whole screen under the director's camera: scale and move, eased. */
export function Camera({ children }: { children: ReactNode }) {
  const cam = useCamera()
  return (
    <motion.div id="camera" className="absolute inset-0 origin-top-left" initial={false} animate={{ x: cam.x, y: cam.y, scale: cam.k }}
      transition={{ duration: cam.dur / 1000, ease: [0.45, 0, 0.2, 1] }} style={{ transformOrigin: '0 0' }}>
      {children}
    </motion.div>
  )
}

/** The director's one line for a sound-off viewer, outside the camera so it never scales. */
export function Caption() {
  const c = useShow((s) => s.caption)
  const off = new URLSearchParams(window.location.search).get('captions') === '0'
  if (off) return null
  return (
    <div className={`pointer-events-none absolute inset-x-0 flex justify-center ${c?.top ? 'top-[64px]' : 'bottom-[64px]'}`}>
      <AnimatePresence mode="wait">
        {c && (
          <motion.div key={c.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-w-[1240px] items-baseline gap-4 border border-line bg-pane px-6 py-3 text-[26px] font-medium leading-snug tracking-[-0.01em] text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]">
            {c.id && <span className="mono text-[22px] font-medium text-blue">{c.id}</span>}
            <span>{c.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The ring on the control the director is about to press. */
export function Pulse({ inset = -4 }: { inset?: number }) {
  return (
    <motion.span className="pointer-events-none absolute rounded-[6px]" style={{ inset }}
      animate={{ boxShadow: ['0 0 0 0 rgba(36,87,255,0.55)', '0 0 0 10px rgba(36,87,255,0)'] }} transition={{ duration: 1.3, repeat: Infinity }} />
  )
}
