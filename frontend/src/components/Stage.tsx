import { useLayoutEffect, useState, type ReactNode } from 'react'

export const STAGE_W = 1920
export const STAGE_H = 1080

/** A fixed 1920 × 1080 stage scaled to fit the window, so screen recordings are exact. */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const pinned = Number(new URLSearchParams(window.location.search).get('scale'))
    const fit = () => setScale(pinned > 0 ? pinned : Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#0b0c0f]">
      <div className="relative flex-none overflow-hidden bg-chrome" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'center' }}>
        {children}
      </div>
    </div>
  )
}
