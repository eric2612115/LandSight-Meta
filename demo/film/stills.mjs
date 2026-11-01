/**
 * Probe a render and pull N evenly spaced frames into stills/ (plus a contact sheet), to look at before accepting it.
 *
 *   node stills.mjs [landsight-v1.mp4] [12]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
const FFPROBE = process.env.FFPROBE ?? '/opt/homebrew/bin/ffprobe'
const file = join(HERE, process.argv[2] ?? 'landsight-v1.mp4')
const n = Number(process.argv[3] ?? 12)
const info = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', file]).toString())
const duration = Number(info.format.duration)
console.log(`${file}\n  duration ${duration.toFixed(3)} s · ${(Number(info.format.size) / 1e6).toFixed(1)} MB`)
for (const s of info.streams) console.log(`  ${s.codec_type} ${s.codec_name}${s.width ? ` ${s.width}×${s.height} @ ${s.r_frame_rate}` : ` ${s.sample_rate} Hz × ${s.channels}`}`)
const out = join(HERE, 'stills')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const names = []
for (let i = 0; i < n; i++) {
  const t = (duration * (i + 0.5)) / n
  const name = join(out, `${String(i + 1).padStart(2, '0')}-${t.toFixed(1).padStart(5, '0')}s.png`)
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', name])
  names.push(name)
}
const cols = 4
const rows = Math.ceil(n / cols)
execFileSync(FFMPEG, ['-v', 'error', '-y', ...names.flatMap((f) => ['-i', f]), '-filter_complex',
  `${names.map((_, i) => `[${i}:v]scale=480:270[v${i}]`).join(';')};${names.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${n}:layout=${names.map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}`,
  join(out, 'contact.png')])
console.log(`  ${n} stills → stills/ (+ contact.png, ${cols}×${rows})`)
