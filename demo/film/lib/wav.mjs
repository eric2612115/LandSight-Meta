/** Tiny mono PCM WAV helpers: read 16-bit files, write 16-bit files, synthesise, mix with pitch (rate) and gain. */
import { readFileSync, writeFileSync } from 'node:fs'

export const RATE = 48000

export function readWav(file) {
  const b = readFileSync(file)
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file}: not a WAV`)
  let p = 12
  let fmt = null
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4)
    const size = b.readUInt32LE(p + 4)
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) }
    if (id === 'data') {
      if (!fmt || fmt.bits !== 16) throw new Error(`${file}: only 16-bit PCM`)
      const n = size / 2 / fmt.channels
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        let s = 0
        for (let c = 0; c < fmt.channels; c++) s += b.readInt16LE(p + 8 + (i * fmt.channels + c) * 2)
        out[i] = s / fmt.channels / 32768
      }
      if (fmt.rate !== RATE) return resample(out, fmt.rate / RATE)
      return out
    }
    p += 8 + size + (size % 2)
  }
  throw new Error(`${file}: no data chunk`)
}

export function writeWav(file, samples, rate = RATE) {
  const n = samples.length
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0, 'ascii')
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVEfmt ', 8, 'ascii')
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36, 'ascii')
  b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2)
  writeFileSync(file, b)
}

/** Read `src` at `rate` × speed (pitch up when > 1), linear interpolation. */
export function resample(src, rate) {
  const n = Math.floor(src.length / rate)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i * rate
    const j = Math.floor(x)
    const f = x - j
    out[i] = (src[j] ?? 0) * (1 - f) + (src[j + 1] ?? 0) * f
  }
  return out
}

export function mixInto(bed, clip, atSeconds, gain = 1, rate = 1) {
  const c = rate === 1 ? clip : resample(clip, rate)
  const o = Math.round(atSeconds * RATE)
  for (let i = 0; i < c.length; i++) {
    const k = o + i
    if (k >= 0 && k < bed.length) bed[k] += c[i] * gain
  }
}

export function synth(seconds, f) {
  const n = Math.floor(seconds * RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = f(i / RATE, i)
  const a = Math.min(n, 144)
  const z = Math.min(n, 480)
  for (let i = 0; i < a; i++) out[i] *= i / a
  for (let i = 0; i < z; i++) out[n - 1 - i] *= i / z
  return out
}

let seed = 7
export const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

/** The few sounds the film needs beyond audio/sfx: keys, Enter, the highlighter, the clack, whoosh, stamp, room tone. */
export const GEN = {
  key: () => {
    let lp = 0
    return synth(0.035, (t) => { lp += (noise() - lp) * 0.6; return 0.55 * (noise() - lp) * Math.exp(-t * 260) + 0.18 * Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t * 300) })
  },
  enter: () => synth(0.16, (t) => 0.38 * Math.sin(2 * Math.PI * 392 * t) * Math.exp(-t * 18) + 0.05 * Math.sin(2 * Math.PI * 784 * t) * Math.exp(-t * 30)),
  squeak: () => {
    let lp = 0
    return synth(0.13, (t) => {
      lp += (noise() - lp) * 0.3
      const env = Math.sin((Math.PI * t) / 0.13) ** 2
      return env * (0.16 * Math.sin(2 * Math.PI * (2600 + 900 * t / 0.13) * t) * (0.7 + 0.3 * lp) + 0.12 * lp)
    })
  },
  whoosh: () => {
    let lp = 0
    return synth(0.42, (t) => { lp += (noise() - lp) * (0.03 + 0.18 * Math.sin((Math.PI * t) / 0.42)); return 0.5 * lp * Math.sin((Math.PI * t) / 0.42) })
  },
  stamp: () => {
    let lp = 0
    return synth(0.24, (t) => { lp += (noise() - lp) * 0.2; return 0.7 * Math.sin(2 * Math.PI * (90 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18) + 0.4 * lp * Math.exp(-t * 45) })
  },
  room: () => {
    let b = 0
    let lp = 0
    return synth(10, (t) => { b = 0.985 * b + 0.015 * noise(); lp += (b - lp) * 0.2; return 0.9 * lp + 0.004 * noise() })
  },
}
