import { Database } from 'lucide-react'
import { useState } from 'react'
import { useSource, type SourcePref } from '../lib/source'

const LABEL: Record<string, string> = { live: 'live backend', repo: 'repo mock', mock: 'built-in mock', auto: 'auto' }
const DOT: Record<string, string> = { live: '#3ccf7f', repo: '#f0a500', mock: '#8a919c' }

/** Which data the page shows; click to pin a source (hidden in director mode). */
export function SourceToggle({ className = '', dropDown = false }: { className?: string; dropDown?: boolean }) {
  const { pref, resolved, available, sparkMode, setPref } = useSource()
  const [open, setOpen] = useState(false)
  const opts: SourcePref[] = ['auto', 'live', 'repo', 'mock']
  return (
    <div className={`z-30 text-[12px] ${className}`}>
      {open && (
        <div className={`absolute right-0 w-[220px] ${dropDown ? 'top-full mt-2' : 'bottom-full mb-2'}`} /* menu */>
        <div className="w-[220px] overflow-hidden rounded-lg border border-line bg-[#16181c] shadow-xl">
          {opts.map((o) => (
            <button key={o} onClick={() => { setPref(o); setOpen(false) }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/[0.05] ${pref === o ? 'text-white' : 'text-soft'}`}>
              <span>{LABEL[o]}{o !== 'auto' && o !== 'mock' && !available[o] && <span className="ml-1.5 text-mute">(not found)</span>}</span>
              {pref === o && <span className="h-1.5 w-1.5 rounded-full bg-cobalt" />}
            </button>
          ))}
        </div>
        </div>
      )}
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full border border-line bg-[rgba(18,20,24,0.9)] px-3 py-1.5 text-soft backdrop-blur hover:text-white">
        <Database className="h-3.5 w-3.5" />
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[resolved ?? 'mock'] }} />
        {resolved ? LABEL[resolved] : 'probing…'}
        {resolved === 'live' && sparkMode && <span className="text-mute">· Spark {sparkMode}</span>}
        {pref !== 'auto' && <span className="text-mute">· pinned</span>}
      </button>
    </div>
  )
}
