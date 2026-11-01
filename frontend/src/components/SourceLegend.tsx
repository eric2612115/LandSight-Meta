const ITEMS: [string, string][] = [
  ['#3a3f47', 'geometry'],
  ['#2457ff', 'Muse Spark'],
  ['#7a3cff', 'SAM 3.1'],
  ['#f0a500', 'flag'],
  ['#1f9d55', 'confirmed'],
]

/** Graphite = geometry, cobalt = Muse Spark, violet = SAM 3.1, amber = flag, green = confirmed. */
export function SourceLegend({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center ${className}`} style={{ gap: size * 0.95, fontSize: size }}>
      {ITEMS.map(([c, label]) => (
        <div key={label} className="flex items-center text-soft" style={{ gap: size * 0.32 }}>
          <span className="inline-block rounded-full" style={{ width: size * 0.5, height: size * 0.5, background: c, boxShadow: c === '#3a3f47' ? 'inset 0 0 0 1.5px #6b727d' : undefined }} />
          <span className="font-normal tracking-tight">{label}</span>
        </div>
      ))}
    </div>
  )
}
