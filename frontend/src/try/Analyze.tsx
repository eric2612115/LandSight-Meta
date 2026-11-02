/** Step 3, Analyze: a sample's own calls replayed on a compressed clock (~8 s) — Muse Spark's reads, geometry,
 * SAM 3.1, the bill versions, the code — each with its counter from `timing.calls` and the run, ending "N checks". */
import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { fmt } from '../lib/format'
import { t } from './i18n'
import { analyzeSteps, replaySlices } from './model'
import { cue, useTry } from './store'

export const REPLAY_MS = 8000
const TICK = 50

const CHIP: Record<string, string> = { spark: '#4d7cff', geometry: '#9aa4af', sam: '#22c3a6', bill: '#f5a524', code: '#b48cff' }

export function Analyze() {
  const { run, played, sample, set } = useTry()
  const steps = useMemo(() => (run ? analyzeSteps(run) : []), [run])
  const slices = useMemo(() => replaySlices(steps, REPLAY_MS), [steps])
  useEffect(() => {
    if (played >= REPLAY_MS) return
    const h = setTimeout(() => {
      const next = Math.min(REPLAY_MS, played + TICK)
      if (next >= REPLAY_MS) cue('stamp')
      set({ played: next })
    }, TICK)
    return () => clearTimeout(h)
  }, [played, set])
  if (!run) return null
  const done = played >= REPLAY_MS
  const tm = run.timing as { mode?: string; recorded?: boolean }
  const recorded = tm.mode === 'fixtures' || tm.recorded === true
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 34, fontWeight: 650, letterSpacing: '-0.03em' }}>{done ? t('Reviewed') : t('Reviewing the package')}</div>
        <span className="chip" style={{ height: 30, fontSize: 14 }}>
          {sample && recorded ? t('Recorded run — live, this takes about two minutes') : t('This package’s review · {0} s', fmt(run.timing.total_s, 0))}
        </span>
      </div>
      <div style={{ width: 1080, marginTop: 34, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {steps.map((s, i) => {
          const [a, b] = slices[i]
          const p = Math.max(0, Math.min(1, (played - a) / (b - a)))
          const on = played >= a && played < b
          const n = Math.round(p * s.total)
          return (
            <div key={s.key} data-dir={`an-${s.key}`} className="surface" style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 26px', opacity: p === 0 ? 0.45 : 1,
              borderColor: on ? 'var(--t-accent)' : 'var(--t-line)', transition: 'opacity 250ms, border-color 250ms' }}>
              <span style={{ width: 34, height: 34, borderRadius: 999, display: 'grid', placeItems: 'center', background: p >= 1 ? 'var(--t-accent)' : 'var(--t-s3)', flex: 'none' }}>
                {p >= 1 ? <Check size={18} color="#fff" strokeWidth={3} /> : <span className="ink3" style={{ fontSize: 14, fontWeight: 650 }}>{i + 1}</span>}
              </span>
              <span className="chip" style={{ height: 30, fontSize: 14, color: '#fff', background: CHIP[s.key], width: 150, justifyContent: 'center' }}>{t(s.model)}</span>
              <span style={{ fontSize: 20, fontWeight: 550, flex: 1 }}>{t(s.label, s.total)}</span>
              <span className="mono" style={{ fontSize: 18, width: 180, textAlign: 'right' }}>{n} <span className="ink3">/ {s.total} {t(s.unit)}</span></span>
              <span style={{ width: 160, height: 6, borderRadius: 999, background: 'var(--t-s3)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${p * 100}%`, background: 'var(--t-accent)' }} />
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ height: 150, display: 'flex', alignItems: 'center', gap: 40, marginTop: 20 }}>
        {done && (
          <>
            <motion.div data-dir="checks" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.04em' }}>
              {t('{0} checks', run.checks.length)}
            </motion.div>
            <button className="btn-p" data-dir="to-review" onClick={() => set({ step: 'review' })}>{t('Review the findings')} <ArrowRight size={18} /></button>
          </>
        )}
      </div>
    </div>
  )
}
