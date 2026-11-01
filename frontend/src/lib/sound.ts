import { Howl, Howler } from 'howler'

/**
 * Four kinds of event, four sounds (demo/DESIGN.md): a soft tick when an ID lands, a snap when an outline closes,
 * a low thud for a flag, a chime for a confirm; plus a short stamp. Synthesised at start-up into tiny WAVs and
 * played through howler, so nothing is shipped and every take sounds the same.
 */

type Name = 'tick' | 'snap' | 'thud' | 'chime' | 'stamp' | 'whoosh'
const RATE = 44100

function wav(samples: Float32Array): string {
  const n = samples.length
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:audio/wav;base64,${btoa(bin)}`
}

function synth(seconds: number, f: (t: number, i: number) => number): Float32Array {
  const n = Math.floor(seconds * RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = f(i / RATE, i)
  // 3 ms fade-in / 8 ms fade-out against clicks
  for (let i = 0; i < Math.min(n, 132); i++) out[i] *= i / 132
  for (let i = 0; i < Math.min(n, 352); i++) out[n - 1 - i] *= i / 352
  return out
}

let seed = 1
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

const RECIPES: Record<Name, () => Float32Array> = {
  tick: () => synth(0.07, (t) => 0.32 * Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 85) + 0.12 * Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-t * 140)),
  snap: () => {
    let lp = 0
    return synth(0.16, (t) => {
      lp += (noise() - lp) * 0.35
      return 0.5 * lp * Math.exp(-t * 90) + 0.36 * Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 32) + 0.18 * Math.sin(2 * Math.PI * 660 * t) * Math.exp(-t * 26)
    })
  },
  thud: () => {
    let lp = 0
    return synth(0.5, (t) => {
      lp += (noise() - lp) * 0.04
      const f = 52 + 70 * Math.exp(-t * 22)
      return 0.9 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7.5) + 0.5 * lp * Math.exp(-t * 30)
    })
  },
  chime: () =>
    synth(1.5, (t) => {
      const env = Math.exp(-t * 3.1)
      return env * (0.22 * Math.sin(2 * Math.PI * 1046.5 * t) + 0.16 * Math.sin(2 * Math.PI * 1568 * t + 0.4) + 0.08 * Math.sin(2 * Math.PI * 2093 * t) * Math.exp(-t * 4) + 0.05 * Math.sin(2 * Math.PI * 1050.5 * t))
    }),
  stamp: () => {
    let lp = 0
    return synth(0.22, (t) => {
      lp += (noise() - lp) * 0.2
      return 0.6 * Math.sin(2 * Math.PI * (90 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18) + 0.35 * lp * Math.exp(-t * 45)
    })
  },
  whoosh: () => {
    let lp = 0
    return synth(0.4, (t) => {
      lp += (noise() - lp) * (0.04 + 0.2 * Math.sin((Math.PI * t) / 0.4))
      return 0.32 * lp * Math.sin((Math.PI * t) / 0.4)
    })
  },
}

let howls: Partial<Record<Name, Howl>> = {}
let ready = false

function init() {
  if (ready) return
  ready = true
  const muted = new URLSearchParams(window.location.search).get('mute') === '1'
  Howler.mute(muted)
  howls = Object.fromEntries(
    (Object.keys(RECIPES) as Name[]).map((k) => [k, new Howl({ src: [wav(RECIPES[k]())], format: ['wav'], volume: k === 'tick' ? 0.55 : 0.8, pool: 12 })]),
  ) as Record<Name, Howl>
}

export function play(name: Name, opts: { rate?: number; volume?: number } = {}) {
  try {
    init()
    const h = howls[name]
    if (!h) return
    const id = h.play()
    if (opts.rate) h.rate(opts.rate, id)
    if (opts.volume !== undefined) h.volume(opts.volume, id)
  } catch {
    /* audio is decoration */
  }
}

export const warmUpSound = () => init()
