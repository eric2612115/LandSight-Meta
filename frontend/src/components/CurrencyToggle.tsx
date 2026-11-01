import { useCurrency, type Currency, type Rate } from '../lib/money'

/** TWD / USD for every money figure; kept in the URL (`?currency=`). USD needs the Run's dated rate. */
export function CurrencyToggle({ rate, className = '' }: { rate?: Rate | null; className?: string }) {
  const { cur, setCur } = useCurrency()
  const opts: Currency[] = ['twd', 'usd']
  const title = rate?.usd_per_twd
    ? `USD at ${rate.twd_per_usd ?? (1 / rate.usd_per_twd).toFixed(3)} TWD per USD (${rate.as_of ?? 'dated'}; ${rate.source ?? 'the Run'}); prices are stored in TWD`
    : 'this Run carries no exchange rate: TWD only'
  return (
    <div className={`flex items-center overflow-hidden rounded-full border border-line text-[12px] ${className}`} title={title} role="group" aria-label="currency">
      {opts.map((o) => {
        const off = o === 'usd' && !rate?.usd_per_twd
        const on = (cur === o && !off) || (o === 'twd' && cur === 'usd' && !rate?.usd_per_twd)
        return (
          <button key={o} disabled={off} onClick={() => setCur(o)} aria-pressed={on}
            className={`px-2.5 py-1 font-semibold uppercase tracking-wide ${on ? 'bg-white/[0.10] text-white' : 'text-mute hover:text-soft'} ${off ? 'cursor-not-allowed opacity-40' : ''}`}>
            {o}
          </button>
        )
      })}
    </div>
  )
}
