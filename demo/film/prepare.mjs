/**
 * Gathers everything the composition reads, at render time, into public/:
 *
 * - public/data/film.json: the live numbers, read from the runs (never typed): <repo>/frontend-mock/run.json and
 *   rules.json for scenes captured from the repo run, frontend/public/mock/run.json and rules.json for scenes still
 *   captured from the built-in mock (captures/manifest.json says which); the bill row of the cold open (the repo run's
 *   bill checks, else the bill generator landsight/synth/bills.py); the canopies of L-1 for the highlighter; the clip
 *   lengths of both narrators (ffprobe).
 * - public/gen/sfx-<narrator-independent>.wav: one mixed effects track for the whole film: the app's own sound cues as
 *   logged at capture (captures/<scene>.events.json), the paper beats' keys, squeaks, ticks and thud (src/timing.js).
 * - public/captures, public/audio, public/img: links to the captures, the recorded audio, the sheet and the lockup.
 *
 *   node prepare.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GEN, RATE, mixInto, readWav, writeWav } from './lib/wav.mjs'
import { CLOSE, coldOpen, who } from './src/timing.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const PUB = join(HERE, 'public')
const FFPROBE = process.env.FFPROBE ?? '/opt/homebrew/bin/ffprobe'
const BEATS = JSON.parse(readFileSync(join(HERE, 'beats.json'), 'utf8'))
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const rel = (p) => relative(REPO, p)

const SRC = {
  repo: { run: join(REPO, 'frontend-mock', 'run.json'), rules: join(REPO, 'frontend-mock', 'rules.json') },
  mock: { run: join(REPO, 'frontend', 'public', 'mock', 'run.json'), rules: join(REPO, 'frontend', 'public', 'mock', 'rules.json') },
}
const directors = {
  repo: existsSync(join(REPO, 'frontend-mock', 'director.json')) ? read(join(REPO, 'frontend-mock', 'director.json')) : [],
  mock: read(join(REPO, 'frontend', 'public', 'mock', 'director.json')),
}
const runs = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, { run: read(v.run), rules: existsSync(v.rules) ? read(v.rules) : [], files: { run: rel(v.run), rules: rel(v.rules) } }]))

// ---------- public/ links ----------
function place(src, dst) {
  mkdirSync(dirname(dst), { recursive: true })
  if (existsSync(dst)) rmSync(dst)
  try { linkSync(src, dst) } catch { copyFileSync(src, dst) }
}
const manifest = existsSync(join(HERE, 'captures', 'manifest.json')) ? read(join(HERE, 'captures', 'manifest.json')) : {}
for (const b of BEATS.beats.filter((x) => x.scene)) {
  const f = join(HERE, 'captures', `${b.scene}.mp4`)
  if (existsSync(f)) place(f, join(PUB, 'captures', `${b.scene}.mp4`))
}
for (const dir of ['music', 'sfx']) {
  for (const f of readdirSync(join(HERE, 'audio', dir))) place(join(HERE, 'audio', dir, f), join(PUB, 'audio', dir, f))
}
// the narration, loudness-normalised (the TTS reads come in near -22 LUFS; the film sits at -16 with the voice on top)
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
for (const dir of ['v1-brian', 'v1-alice']) {
  mkdirSync(join(PUB, 'audio', dir), { recursive: true })
  for (const f of readdirSync(join(HERE, 'audio', dir)).filter((x) => /^beat-\d+\.mp3$/.test(x))) {
    const src = join(HERE, 'audio', dir, f)
    const dst = join(PUB, 'audio', dir, f.replace(/\.mp3$/, '.wav'))
    if (existsSync(dst) && statSync(dst).mtimeMs > statSync(src).mtimeMs) continue
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', dst])
  }
}
// the lockup without its dark backing rect, so it can sit over a picture
const lockupSvg = readFileSync(join(REPO, 'frontend', 'public', 'brand', 'lockup-dark.svg'), 'utf8').replace(/<rect[^>]*fill="#14161a"[^>]*\/>/, '')

// ---------- helpers on a run ----------
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const pretty = (model) => model.replace(/^muse-spark/i, 'Muse Spark').replace(/^sam/i, 'SAM').replace(/-(\d)/g, ' $1').replace(/-/g, ' ')
const fmt = (v, d = 0) => (v === undefined ? '?' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }))
const treeItem = (run) => run.items.find((i) => i.kind === 'tree')
const sheet = (run, id) => run.sheets.find((s) => s.sheet_id === id)
function centreOf(outline) {
  let x = 0
  let y = 0
  for (const [a, b] of outline) { x += a; y += b }
  x /= outline.length
  y /= outline.length
  const r = outline.reduce((m, [a, b]) => m + Math.hypot(a - x, b - y), 0) / outline.length
  return { cx: x, cy: y, r }
}
function models(run) {
  const calls = run.timing?.calls ?? []
  const names = [...new Set(calls.map((c) => c.model))]
  return { spark: names.find((m) => /spark/i.test(m)), sam: names.find((m) => /sam/i.test(m)) }
}
const repoModels = models(runs.repo.run)
const MODEL = { spark: pretty(repoModels.spark ?? 'muse-spark'), sam: pretty(repoModels.sam ?? 'sam') }

// ---------- the cold open's bill row ----------
function billRow() {
  for (const k of ['repo']) {
    // the current bill misspells it "Camphore" (E18); the cold open types the row as first written
    const c = runs[k].run.checks.find((x) => /^camphor tree/i.test(String(x.numbers?.bill_text ?? '')) && num(x.numbers?.bill_qty) !== undefined)
    if (c) return { text: c.numbers.bill_text, qty: c.numbers.bill_qty, price: c.numbers.unit_price, unit: c.numbers.bill_unit, source: runs[k].files.run }
  }
  // the bill generator: the first revision's camphor row (D-25: NT$4,200)
  const py = join(REPO, 'landsight', 'synth', 'bills.py')
  const m = readFileSync(py, 'utf8').match(/Row\("camphor",\s*"([^"]+)",\s*"[^"]*",\s*"([^"]+)",\s*(\d+),\s*(\d+)\)/)
  if (!m) throw new Error('no camphor row in the repo run nor in landsight/synth/bills.py')
  return { text: m[1], unit: m[2], qty: Number(m[3]), price: Number(m[4]), source: rel(py) }
}
const row = billRow()
// The film's money follows its bill clip: captured with --currency usd, the cold open types the price in dollars,
// read from the run's USD field for the same bill row (never converted here).
const CURRENCY = (manifest.bill?.currency ?? process.env.FILM_CURRENCY ?? '').toLowerCase()
function usdPrice() {
  const camphor = runs.repo.run.checks.filter((x) => /camph/i.test(String(x.numbers?.bill_text ?? '')) || (x.numbers?.item_id === treeItem(runs.repo.run)?.item_id && num(x.numbers?.unit_price) !== undefined))
  for (const c of camphor) {
    const n = c.numbers ?? {}
    const key = ['unit_price_usd', 'usd_unit_price', 'price_usd'].find((k) => num(n[k]) !== undefined) ?? Object.keys(n).find((k) => /usd/i.test(k) && /price/i.test(k) && num(n[k]) !== undefined)
    if (key) return { value: n[key], source: `${runs.repo.files.run} · ${c.check_id}.${key}` }
  }
  return null
}
if (CURRENCY === 'usd') {
  const usd = usdPrice()
  if (usd) Object.assign(row, { price_usd: usd.value, price_source: usd.source })
  else console.warn('WARNING: the bill clip is in USD but the run has no USD price for the camphor row; the cold open stays in NT$')
}

// ---------- the paper sheet: the counted L-1 and its canopies ----------
// The repo run's counted plan (the sheet holding the tree item) when its SVG is English, else the frontend's
// English mock sheet. The canopies to tick are that sheet's objects of the tree item, west to east.
const CJK = /[\u3400-\u9fff]/
function paperSource() {
  for (const k of ['repo', 'mock']) {
    const run = runs[k].run
    const tree = treeItem(run)
    if (!tree) continue
    const sh = run.sheets.find((x) => (tree.sheet_ids?.length ? tree.sheet_ids.includes(x.sheet_id) : true) && x.objects?.some((o) => tree.object_ids.includes(o.object_id)))
    if (!sh?.svg_url) continue
    const file = k === 'repo' ? join(REPO, 'frontend-mock', sh.svg_url.replace(/^\/(api|frontend-mock)\//, 'api/')) : join(REPO, 'frontend', 'public', sh.svg_url.replace(/^\//, ''))
    if (!existsSync(file)) continue
    const svg = readFileSync(file, 'utf8')
    if (CJK.test(svg)) continue
    return { k, run, tree, sheet: sh, svg, file: rel(file) }
  }
  throw new Error('no English sheet with the tree item in either run')
}
const P = paperSource()
const L1 = P.sheet
const svgText = P.svg
const vb = svgText.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
const toSvg = ({ cx, cy, r }) => ({ x: cx - L1.bounds.min_x, y: L1.bounds.max_y - cy, r })
const canopies = L1.objects.filter((o) => P.tree.object_ids.includes(o.object_id) && o.kind === 'tree')
  .map((o) => ({ id: o.object_id, ...toSvg(centreOf(o.outline)), open: !o.closed }))
  .sort((a, b) => a.x - b.x)
const repoTree = treeItem(runs.repo.run)
const repoL1 = runs.repo.run.sheets.find((x) => x.objects?.some((o) => o.object_id === repoTree.spark?.object_id && (repoTree.sheet_ids?.length ? repoTree.sheet_ids.includes(x.sheet_id) : true))) ?? L1
const openObj = repoL1.objects.find((o) => o.object_id === repoTree.spark?.object_id) ?? repoL1.objects.find((o) => o.kind === 'tree' && !o.closed)
const openC = centreOf(openObj.outline)
const gapAngles = (openObj.gaps ?? []).map(([x, y]) => Math.atan2(y - openC.cy, x - openC.cx)).sort((a, b) => a - b)
const drawnCount = repoTree.spark_count ?? repoTree.proposed_count ?? repoTree.quote_count ?? repoTree.geometry_count
const paper = {
  row: { ...row, display: row.price_usd !== undefined ? `${row.text} · ${row.qty} · $ ${fmt(row.price_usd)}` : `${row.text} · ${row.qty} · NT$ ${fmt(row.price)}` },
  drawn: drawnCount,
  drawn_source: `${runs.repo.files.run} · ${repoTree.item_id} ${repoTree.label} (geometry ${repoTree.geometry_count} + ${MODEL.spark} ${(repoTree.spark_count ?? 0) - (repoTree.geometry_count ?? 0)})`,
  sheet: { svg: svgText, viewBox: vb, id: L1.sheet_id, source: P.file },
  canopies: canopies.slice(0, drawnCount),
  open: { id: openObj.object_id, ...toSvg(openC), pieces: openObj.gaps?.length ?? 0, gapAngles, maxGap: runs.repo.run.checks.find((c) => num(c.numbers?.max_gap_m) !== undefined)?.numbers.max_gap_m },
}
const paperOpen = canopies.find((c) => c.id === paper.open.id)
if (paperOpen) Object.assign(paper.open, { x: paperOpen.x, y: paperOpen.y, r: paperOpen.r })

// ---------- captions: per app beat, from the run its capture was made on ----------
function captionsFor(scene, k) {
  const { run, rules } = runs[k]
  const tree = treeItem(run)
  const m = models(run)
  const spark = pretty(m.spark ?? repoModels.spark ?? 'muse-spark')
  const sam = pretty(m.sam ?? repoModels.sam ?? 'sam')
  const calls = run.timing?.calls ?? []
  const checks = run.checks
  switch (scene) {
    case 'drop': {
      // as the drop scene counts them: the package's own files (an archive's members are its verdict)
      const files = run.files.filter((f) => !f.parent)
      const bySpark = files.filter((f) => f.decided_by === 'spark').length
      return [
        { at: 1.2, until: 10.4, kicker: spark, text: `decided ${bySpark} of ${files.length} files` },
      ]
    }
    case 'wake': {
      const closed = tree.geometry_count
      const plan = run.sheets.find((x) => (tree.sheet_ids?.length ? tree.sheet_ids.includes(x.sheet_id) : true) && x.objects?.some((o) => tree.object_ids.includes(o.object_id)))
      const total = closed + (plan?.objects ?? []).filter((o) => tree.object_ids.includes(o.object_id) && !o.closed).length
      return [
        { at: 1.5, until: 10, kicker: 'geometry', text: `closed outlines measured exactly`, mono: `${tree.label} · closed ${closed} of ${total} · schedule ${tree.schedule_count}` },
        { at: 10.5, until: 21, kicker: 'routing', text: `${total - closed} open outline → ${spark}`, mono: `geometry closed ${closed} of ${total} · Spark called on ${total - closed}` },
      ]
    }
    case 'eye': {
      const c = checks.find((x) => num(x.numbers?.gaps) !== undefined)
      const call = calls.find((x) => /group|read_object|eye/i.test(x.call)) ?? calls.find((x) => /spark/i.test(x.model))
      return [
        { at: 1.0, until: 6.5, kicker: 'geometry', text: `${c?.numbers.gaps} pieces · gaps to ${fmt((c?.numbers.max_gap_m ?? 0) * 100)} cm`, mono: 'the measured facts go into the prompt' },
        { at: 7.0, until: 19, kicker: spark, text: `one tree · confidence ${fmt(tree.spark?.confidence ?? c?.numbers.confidence, 2)}`, mono: `${call ? `1 call · ${fmt(call.seconds, 1)} s` : '1 call'}${run.timing?.recorded ? ' · recorded' : ''}` },
      ]
    }
    case 'hedge': {
      const c = checks.find((x) => num(x.numbers?.spacing_m) !== undefined && num(x.numbers?.length_m) !== undefined)
      const n = c?.numbers ?? {}
      return [
        { at: 1.0, until: 7.5, kicker: 'geometry', text: `H-01 measured · ${fmt(n.length_m, 1)} m`, mono: `@ ${n.spacing_m} m · ${n.rows} rows → ${n.count}` },
        { at: 8.0, until: 13.6, kicker: 'rules', text: 'the legend is not counted · typ. is a label', mono: `${spark} reads · geometry measures` },
      ]
    }
    case 'colour': {
      const scene = (k === 'repo' ? directors.repo : directors.mock).find((d) => d.id === 'colour')
      const sid = scene?.sheet_id
      const controls = checks.filter((x) => x.category === 'area' && num(x.numbers?.masks) === 0 && x.numbers?.prompt)
      const control = controls.find((x) => sid && (x.title ?? '').includes(sid)) ?? controls[0]
      const objKind = (id) => run.items.find((it) => it.object_ids.includes(String(id).split('/').pop()))?.kind
      const fits = checks.filter((x) => num(x.numbers?.sam_m2) !== undefined && num(x.numbers?.cad_m2) !== undefined)
      const surfaces = fits.filter((x) => (x.evidence?.object_ids ?? []).some((id) => ['shrub_bed', 'lawn', 'paving'].includes(objKind(id))))
      const pool = surfaces.length ? surfaces : fits.filter((x) => x.severity !== 'review')
      const worst = Math.max(...pool.map((x) => Math.abs(x.numbers.error_pct ?? 0)))
      const legend = calls.filter((x) => x.prompt_source === 'spark_legend').length
      const excluded = checks.reduce((a, x) => a + (num(x.numbers?.legend_excluded) ?? 0), 0)
      const out = []
      if (control) {
        const on = num(control.numbers.masks_on_colour)
        const legacy = calls.find((x) => x.prompt_source === 'manual' && /lines/.test(x.call))
        out.push({ at: 0.8, until: 6.5, kicker: sam, text: `line work · ${control.numbers.masks} masks`, mono: on !== undefined ? `"${control.numbers.prompt}" on lines → 0\non colour → ${on}` : legacy ? `control: ${legacy.call} → 0` : `"${control.numbers.prompt}" → 0` })
      }
      out.push({ at: 7.0, until: 19.4, kicker: sam, text: `${surfaces.length ? 'beds and paving' : `${pool.length} areas`} within ${fmt(worst, 1)}% of CAD`, mono: `${legend ? `prompts from ${spark}'s legend read\n` : ''}${excluded} legend swatches excluded` })
      return out
    }
    case 'gauge': {
      const rule = rules.find((r) => r.category === 'regulation' && num(r.numbers?.required) !== undefined) ?? checks.find((r) => r.category === 'regulation' && num(r.numbers?.required) !== undefined)
      const n = rule?.numbers ?? {}
      const article = rule?.citation?.article?.match(/Art\.?\s*(\d+)/)?.[1] ?? '302'
      const pit = checks.find((c) => num(c.numbers?.pit_area_m2 ?? c.numbers?.pit_m2) !== undefined)?.numbers
      // the scene itself shows the title-block read and the L-6 detail; the captions name the rule and the change
      const out = [
        { at: 1.0, until: 9.0, kicker: 'rule', text: `Building Technical Regulations §${article}`, mono: `required ${fmt(n.required, 1)}\nprovided ${fmt(n.provided, 1)}` },
      ]
      if (pit && num(pit.provided_before) !== undefined) out.push({ at: 9.5, until: 21.4, kicker: `${spark} · L-6`, text: num(pit.trees_downgraded) !== undefined ? `pit on slab: ${pit.trees_downgraded} large trees count as small` : 'tree pit on slab', mono: `provided ${fmt(pit.provided_before, 1)} → ${fmt(pit.provided_after, 1)}` })
      return out
    }
    case 'bill': {
      const rows = checks.filter((x) => num(x.numbers?.row) !== undefined)
      const flags = rows.filter((x) => x.severity === 'flag')
      const aligned = rows.filter((x) => num(x.numbers?.align_confidence) !== undefined).length
      return [
        { at: 1.0, until: 9, kicker: spark, text: `${aligned} bill rows aligned to the drawing`, mono: `${flags.length} rows flagged` },
        { at: 9.5, until: 23.4, kicker: 'prices', text: "the firm's own price list · sample", mono: 'the drawing governs' },
      ]
    }
    case 'callback': {
      const e = run.errors ?? {}
      const len = (v) => (Array.isArray(v) ? v.length : num(v) ?? 0)
      return [
        { at: 4.6, until: 9.8, kicker: spark, text: 'L-2 is an elevation · not counted', mono: 'same trees, from the side' },
        { at: 10.2, until: 15.6, kicker: 'answer key', text: `${e.planted ?? 0} errors planted`, mono: `found ${len(e.found)} · needs review ${len(e.flagged)} · missed ${len(e.missed)}` },
      ]
    }
    default:
      return []
  }
}

const app = {}
for (const b of BEATS.beats.filter((x) => x.scene)) {
  const cap = manifest[b.scene]
  const k = cap?.source ?? 'mock'
  const evFile = join(HERE, 'captures', `${b.scene}.events.json`)
  app[b.scene] = {
    beat: b.n,
    capture: existsSync(join(HERE, 'captures', `${b.scene}.mp4`)) ? `captures/${b.scene}.mp4` : null,
    source: k,
    source_file: runs[k].files.run,
    fallback: cap?.fallback ?? null,
    captions: captionsFor(b.scene, k),
    events: existsSync(evFile) ? read(evFile) : [],
  }
}

// ---------- narration ----------
const probe = (f) => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
const narration = {}
for (const [who_, dir, voice] of [['brian', 'v1-brian', 'Brian'], ['alice', 'v1-alice', 'Alice']]) {
  narration[who_] = { voice, dir: `audio/${dir}`, ext: 'wav', clips: {} }
  for (const b of BEATS.beats) {
    const f = join(HERE, 'audio', dir, `beat-${String(b.n).padStart(2, '0')}.mp3`)
    if (existsSync(f)) narration[who_].clips[b.n] = probe(f)
  }
}

// ---------- the end card ----------
const end = {
  lockup: lockupSvg,
  models: [MODEL.spark, MODEL.sam],
  models_source: `${runs.repo.files.run} · timing.calls`,
}

// ---------- the effects track ----------
const sfx = {
  tick: readWav(join(HERE, 'audio', 'sfx', 'tick.wav')),
  snap: readWav(join(HERE, 'audio', 'sfx', 'snap.wav')),
  thud: readWav(join(HERE, 'audio', 'sfx', 'thud.wav')),
  chime: readWav(join(HERE, 'audio', 'sfx', 'chime.wav')),
}
for (const [k, f] of Object.entries(GEN)) sfx[k] = f()
const bed = new Float32Array(BEATS.duration * RATE)
const SFX_GAIN = { tick: 0.55, snap: 0.8, thud: 1.0, chime: 0.75, stamp: 0.7, whoosh: 0.5, key: 0.5, enter: 0.6, squeak: 0.55 }
// beat 1: room tone under the typing, keys, Enter, eight squeaks, the thud
const co = coldOpen(paper.row.display.length, paper.canopies.length)
mixInto(bed, sfx.room.subarray(0, Math.round(co.card * RATE)), 0, 0.5)
co.keyTimes.forEach((t, i) => mixInto(bed, sfx.key, t, SFX_GAIN.key * (0.8 + 0.2 * Math.abs(Math.sin(i * 2.3))), 0.92 + 0.16 * Math.abs(Math.cos(i * 1.3))))
mixInto(bed, sfx.enter, co.enter, SFX_GAIN.enter)
co.tickTimes.forEach((t, i) => mixInto(bed, sfx.squeak, t, SFX_GAIN.squeak, 0.95 + 0.04 * (i % 3)))
mixInto(bed, sfx.thud, co.card, SFX_GAIN.thud * 1.1)
// beat 2: a tick per piece of the open outline
const wh = who(paper.open.pieces)
wh.pieceTimes.forEach((t, i) => mixInto(bed, sfx.tick, t, SFX_GAIN.tick * 0.7, 0.85 + i * 0.035))
// app beats: the app's own cues, at their logged times
for (const b of BEATS.beats.filter((x) => x.scene)) {
  for (const e of app[b.scene].events) {
    const clip = sfx[e.name]
    if (!clip) continue
    mixInto(bed, clip, b.start + e.t, (SFX_GAIN[e.name] ?? 0.6) * (e.volume ?? 1), e.rate ?? 1)
  }
}
// beat 11: room tone in the last second
mixInto(bed, sfx.room.subarray(0, RATE), CLOSE.roomTone, 0.5)
let peak = 0
for (const s of bed) peak = Math.max(peak, Math.abs(s))
if (peak > 0.95) for (let i = 0; i < bed.length; i++) bed[i] *= 0.95 / peak
mkdirSync(join(PUB, 'gen'), { recursive: true })
writeWav(join(PUB, 'gen', 'sfx.wav'), bed)

const film = {
  generated_at: new Date().toISOString(),
  beats: BEATS.beats,
  model: MODEL,
  runs: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.files])),
  paper,
  app,
  narration,
  end,
  music: { open: probe(join(HERE, 'audio', 'music', 'open.mp3')), close: probe(join(HERE, 'audio', 'music', 'close.mp3')) },
}
mkdirSync(join(PUB, 'data'), { recursive: true })
writeFileSync(join(PUB, 'data', 'film.json'), JSON.stringify(film, null, 1))
console.log(`public/data/film.json · bill row "${paper.row.display}" (${paper.row.source}) · drawn ${paper.drawn} · ${paper.canopies.length} canopies · open ${paper.open.id} ${paper.open.pieces} pieces`)
for (const [s, a] of Object.entries(app)) console.log(`  ${s.padEnd(9)} ${a.capture ? 'clip' : 'NO CLIP'} · ${a.source}${a.fallback ? ` (fallback: ${a.fallback})` : ''} · ${a.events.length} cues · ${a.captions.map((c) => c.text).join(' | ')}`)
console.log(`public/gen/sfx.wav · peak ${peak.toFixed(2)}`)
