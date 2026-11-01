import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDir, useDirector } from '../core'

export const COLOURS = { graphite: '#3a3f47', cobalt: '#2457ff', violet: '#7a3cff', amber: '#f0a500', green: '#1f9d55', red: '#e5484d', redInk: '#d92d20' }

export function useProject() {
  const v = useDir((s) => s.view)
  return (x: number, y: number): [number, number] => [v.x + v.k * x, v.y - v.k * y]
}

const portal = (el: Element | null, children: ReactNode) => (el ? createPortal(children, el) : null)

export function InSheet({ children }: { children: ReactNode }) {
  return portal(useDirector().slots.sheet, children)
}
export function OnScreen({ children }: { children: ReactNode }) {
  return portal(useDirector().slots.screen, children)
}
export function OverSheet({ children }: { children: ReactNode }) {
  return portal(useDirector().slots.html, children)
}
export function InPanel({ children }: { children: ReactNode }) {
  return portal(useDirector().slots.panel, children)
}
export function OnStage({ children }: { children: ReactNode }) {
  return portal(useDirector().slots.stage, children)
}

/** Tween a number with ease-out on requestAnimationFrame; rejects when the scene is aborted. */
export function tween(ms: number, onUpdate: (t: number) => void, signal: AbortSignal, ease: (t: number) => number = (t) => 1 - Math.pow(1 - t, 3)) {
  return new Promise<void>((resolve, reject) => {
    const t0 = performance.now()
    const step = () => {
      if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
      const p = Math.min(1, (performance.now() - t0) / ms)
      onUpdate(ease(p))
      if (p < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

export const linear = (t: number) => t

export function PanelHeader({ icon, title, right, tone = '#e8eaed' }: { icon?: ReactNode; title: string; right?: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 text-[30px] font-semibold tracking-tight" style={{ color: tone }}>
        {icon}
        {title}
      </div>
      {right}
    </div>
  )
}
