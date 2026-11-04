/** `/try`, the quick review (demo/TRY-UI.md): one task per screen — Upload · Choose · Analyze · Review — the drawing as
 * the hero, findings in plain words grouped by what you do with them, one primary button per screen. The review desk
 * stays for the expert ("Open the full review desk →"). `?director=1&sample=greenfield` plays the film's Part 2 on
 * a virtual clock (director.ts) with an in-page cursor above the camera layer. */
import { Check, ChevronDown, Moon, Sun } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Mark } from '../components/Brand'
import { Stage } from '../components/Stage'
import { useCurrency, type Currency } from '../lib/money'
import { applyTheme } from '../lib/theme'
import { Analyze } from './Analyze'
import { Choose } from './Choose'
import { t, useLang } from './i18n'
import { Review } from './Review'
import { isTryDirector, STEPS, useCam, useCursor, useTry, type Step } from './store'
import './try.css'
import { Upload } from './Upload'

const TryDirector = lazy(() => import('./director'))
const THEME_KEY = 'landsight.try.theme'

function initialTheme(): 'dark' | 'light' {
  const q = new URLSearchParams(window.location.search).get('theme')
  if (q === 'light' || q === 'dark') return q
  try {
    return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export default function TryApp() {
  const [tt, setTt] = useState<'dark' | 'light'>(initialTheme)
  const lang = useLang((s) => s.lang)
  const step = useTry((s) => s.step)
  const director = isTryDirector()
  // the desk's tokens (the sheet's desk grid, the paper's shadow) follow the same choice
  useEffect(() => applyTheme(tt), [tt])
  useEffect(() => {
    document.title = 'Landsight — quick review'
  }, [])
  const flip = () => {
    const next = tt === 'dark' ? 'light' : 'dark'
    try {
      window.localStorage.setItem(THEME_KEY, next)
    } catch {
      /* storage may be unavailable */
    }
    setTt(next)
  }
  return (
    <Stage>
      <div className="try" data-tt={tt} lang={lang}>
        <CameraLayer>
          <TopBar theme={tt} onTheme={flip} />
          <main style={{ position: 'absolute', left: 0, right: 0, top: 72, bottom: 0 }}>
            {step === 'upload' && <Upload />}
            {step === 'choose' && <Choose />}
            {step === 'analyze' && <Analyze />}
            {step === 'review' && <Review />}
          </main>
        </CameraLayer>
        {director && <CursorLayer />}
        {director && (
          <Suspense fallback={null}>
            <TryDirector />
          </Suspense>
        )}
      </div>
    </Stage>
  )
}

/** The camera: the whole screen scaled and moved by the director. No `will-change`: the browser re-rasterises the
 * layer at each scale, so a zoom stays crisp. */
function CameraLayer({ children }: { children: ReactNode }) {
  const { x, y, k } = useCam()
  return <div id="try-camera" style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${x}px, ${y}px) scale(${k})` }}>{children}</div>
}

const STEP_NAME: Record<Step, string> = { upload: 'Upload', choose: 'Choose', analyze: 'Analyze', review: 'Review' }

function TopBar({ theme, onTheme }: { theme: 'dark' | 'light'; onTheme: () => void }) {
  const { step, run, set } = useTry()
  const { lang, setLang } = useLang()
  const at = STEPS.indexOf(step)
  const desk = () => {
    const u = new URL(window.location.href)
    u.pathname = '/review'
    u.searchParams.delete('director')
    u.searchParams.delete('sample')
    if (run) u.searchParams.set('run', run.run_id)
    window.location.assign(u.toString())
  }
  return (
    <header style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 72, display: 'flex', alignItems: 'center', padding: '0 28px', borderBottom: '1px solid var(--t-line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 500 }}>
        <Mark size={30} colour={theme === 'dark' ? '#e8edf2' : '#12161b'} />
        <span style={{ fontSize: 19, fontWeight: 650, letterSpacing: '-0.02em' }}>Landsight</span>
        <span className="ink3" style={{ fontSize: 14 }}>{t('Quick review')}</span>
      </div>
      <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }} data-dir="stepper">
        {STEPS.map((s, i) => {
          const done = i < at
          const on = i === at
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {i > 0 && <span style={{ width: 44, height: 1, background: 'var(--t-line)' }} />}
              <button className="btn-g" disabled={!done} onClick={() => done && set({ step: s })}
                style={{ display: 'flex', alignItems: 'center', gap: 9, color: on ? 'var(--t-ink)' : done ? 'var(--t-ink-2)' : 'var(--t-ink-3)', cursor: done ? 'pointer' : 'default', fontSize: 15, fontWeight: on ? 600 : 500 }}>
                <span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 650,
                  background: on ? 'var(--t-accent)' : done ? 'var(--t-accent-soft)' : 'var(--t-s3)', color: on ? '#fff' : done ? 'var(--t-accent)' : 'var(--t-ink-3)' }}>
                  {done ? <Check size={15} strokeWidth={3} /> : i + 1}
                </span>
                {t(STEP_NAME[s])}
              </button>
            </div>
          )
        })}
      </nav>
      <div style={{ width: 500, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        {step === 'review' && <button className="btn-g" onClick={desk} style={{ flex: 'none', whiteSpace: 'nowrap' }}>{t('Open the full review desk →')}</button>}
        <div className="seg" data-dir="lang">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          <button className={lang === 'zh-TW' ? 'on' : ''} onClick={() => setLang('zh-TW')}>中</button>
        </div>
        {!isTryDirector() && <CurrencyMenu />}
        <button className="btn-g" onClick={onTheme} title={theme === 'dark' ? t('Light') : t('Dark')} style={{ display: 'grid', placeItems: 'center', width: 36, height: 36 }}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  )
}

const CURRENCY_NAME: Record<Currency, string> = { twd: 'NT$ TWD', usd: '$ USD' }

/** The currency, a menu of its own beside the language: neither one moves the other. Not in a film take, whose frames
 * stay as they were recorded. */
function CurrencyMenu() {
  const { cur, setCur } = useCurrency()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="cur-menu" data-dir="nav-currency" onPointerDown={(e) => e.stopPropagation()}>
      <button aria-haspopup="listbox" aria-expanded={open} title={t('Currency')} onClick={() => setOpen(!open)}>
        {CURRENCY_NAME[cur]} <ChevronDown size={14} />
      </button>
      {open && (
        <div role="listbox" aria-label={t('Currency')}>
          {(['twd', 'usd'] as const).map((c) => (
            <button key={c} role="option" aria-selected={c === cur} className={c === cur ? 'on' : ''} data-dir={`nav-currency-${c}`} onClick={() => { setCur(c); setOpen(false) }}>
              {CURRENCY_NAME[c]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The director's cursor, drawn above the camera at a constant size: an arrow, a click ripple, a folder ghost. */
function CursorLayer() {
  const c = useCursor()
  if (!c.on) return null
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${c.x}px, ${c.y}px)`, pointerEvents: 'none', zIndex: 50 }}>
      {c.ripple > 0 && <span key={c.ripple} className="try-ripple" />}
      {c.ghost && (
        <div style={{ position: 'absolute', left: 18, top: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14,
          background: 'rgba(23,28,34,0.92)', border: '1px solid rgba(255,255,255,0.18)', color: '#e8edf2', font: '600 15px Inter, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 18px 40px -12px rgba(0,0,0,0.6)' }}>
          <svg width="30" height="24" viewBox="0 0 30 24"><path d="M1 4a3 3 0 0 1 3-3h7l3 3h12a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3z" fill="#4d7cff" /></svg>
          {c.ghost}
        </div>
      )}
      <svg width="28" height="34" viewBox="0 0 28 34" style={{ position: 'absolute', left: -3, top: -2, transform: `scale(${c.down ? 0.88 : 1})`, transformOrigin: '3px 2px', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.45))' }}>
        <path d="M3 2 L3 26 L9.5 20 L14 31 L18.5 29 L14 18.5 L23 18.5 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
