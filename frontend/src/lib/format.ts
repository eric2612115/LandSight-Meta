export const fmt = (v: number | undefined | null, digits = 0) =>
  v === undefined || v === null || Number.isNaN(v)
    ? '–'
    : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Integers stay integers; others keep one decimal. */
export const qty = (v: number | undefined | null) =>
  v === undefined || v === null ? '–' : Number.isInteger(v) ? fmt(v) : fmt(v, 1)

export const bytes = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} kB` : `${n} B`

export const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}%`

export const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
