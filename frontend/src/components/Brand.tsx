import mark from '../../public/brand/mark.svg?raw'

const inner = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

/** The Landsight mark: twelve loose pieces of a canopy, one in cobalt (public/brand/mark.svg). */
export function Mark({ size = 32, colour = '#f7f5f0' }: { size?: number; colour?: string }) {
  return <svg width={size} height={size} viewBox="0 0 100 100" style={{ color: colour, flex: 'none' }} dangerouslySetInnerHTML={{ __html: inner }} />
}

/** Mark + wordmark, as in public/brand/lockup-dark.svg. */
export function Lockup({ size = 32, colour = '#f7f5f0' }: { size?: number; colour?: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size * 0.32 }}>
      <Mark size={size * 1.12} colour={colour} />
      <span className="font-semibold leading-none" style={{ fontSize: size * 0.82, letterSpacing: '-0.03em', color: colour }}>
        Land<span style={{ color: 'var(--color-blue)' }}>sight</span>
      </span>
    </span>
  )
}
