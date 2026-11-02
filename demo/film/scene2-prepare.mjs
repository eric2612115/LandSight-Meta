/**
 * Gathers what the Scene2Folder composition reads, into public/:
 *
 * - public/data/scene2.json: the thirty files of the recorded Run (frontend-mock/run.json files[], plus the one zip
 *   member) with the verdict in the product's own words (the Open screen's mapping, frontend/src/lib/pkg.ts
 *   verdictOf + flags.ts sheetState, re-read here from the Run), their reason and decided_by, the card layout on the
 *   dark field (shelf-packed by the product's five groups, widths estimated for Inter), and the per-card times: when
 *   each pours out, when the scan line stamps it, when the junk sinks and the bills stack. Also the L-1 (Rev B) sheet
 *   the frontend serves, inline, for the fold at the end.
 * - public/gen/scene2-sfx.wav: the effects track: room tone, a paper slap when the folder tips, a Geiger-like tick
 *   train under the pour, a clack per stamp, a slide as the bills stack, a hiss as the sheet settles; mixed, then
 *   loudness-normalised to -17 LUFS with ffmpeg (two passes).
 *
 *   node scene2-prepare.mjs
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GEN, RATE, mixInto, noise, synth, writeWav} from './lib/wav.mjs';
import {SCENE2} from './src/scenes/scene2-cues.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const PUB = join(HERE, 'public');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const run = JSON.parse(readFileSync(join(REPO, 'frontend-mock', 'run.json'), 'utf8'));

// ---------- the verdict in the product's words (frontend/src/lib/pkg.ts verdictOf, flags.ts sheetState) ----------
const filmSheets = run.sheets.filter((s) => s.source !== 'pdf_vector' && s.source !== 'pdf_raster');
function sheetState(s) {
  if (s.counted) return filmSheets.filter((x) => x.number === s.number).length > 1 ? 'measured · governs' : 'measured';
  if (/superseded/i.test(s.not_counted_reason ?? '')) return `Rev ${s.revision ?? ''} · superseded`.replace('Rev  ·', 'superseded ·');
  return 'read, not counted';
}
const billKey = (name) => {
  const m = name.match(/(\d{8})|(\d{4})(-\d)?/);
  if (!m) return name;
  return m[1] ? m[1] : `2026${m[2]}${m[3] ?? ''}`;
};
const latestBill = run.files.filter((f) => f.verdict === 'bill').sort((a, b) => billKey(b.name).localeCompare(billKey(a.name)))[0];
function verdictOf(f) {
  const sheet = run.sheets.find((s) => s.sheet_id === f.sheet_id);
  if (sheet && filmSheets.includes(sheet)) {
    const st = sheetState(sheet);
    return {text: st, strong: st.includes('governs') || st === 'measured'};
  }
  switch (f.verdict) {
    case 'drawing_vector': return {text: `PDF · ${(f.sheet_ids ?? []).length} vector pages`};
    case 'drawing_raster': return {text: 'raster · title block read'};
    case 'drawing_image': return {text: 'photo · read, not measured'};
    case 'bill': return latestBill?.file_id === f.file_id ? {text: 'bill · governs', strong: true} : {text: 'bill · earlier version'};
    case 'quote': return {text: 'quote · read'};
    case 'spec': return {text: 'spec · read'};
    case 'presentation': return {text: 'slide deck · not a drawing'};
    case 'backup_ignored': return {text: 'backup · ignored'};
    case 'archive_unpacked': return {text: 'zip · unpacked'};
    case 'unsupported': return {text: `unsupported · .${f.ext.replace(/^\./, '')}`};
    case 'unreadable': return {text: 'unreadable'};
    case 'document': return {text: 'document · read'};
    default: return {text: String(f.verdict)};
  }
}
/** The Open screen's five groups (pkg.ts groupOf). */
function groupOf(f) {
  const ext = f.ext.replace(/^\./, '');
  switch (f.verdict) {
    case 'drawing_vector': return ext === 'pdf' ? 'sets' : 'drawings';
    case 'drawing_raster':
    case 'drawing_image': return 'sets';
    case 'bill': return 'bills';
    case 'spec':
    case 'quote':
    case 'document': return 'docs';
    default: return 'unread';
  }
}
const BY_NAME = {ext: 'extension', content: 'content', spark: 'Muse Spark'};
const GROUPS = ['drawings', 'bills', 'docs', 'sets', 'unread'];

// ---------- the cards ----------
/** Inter Medium advance widths, in em, close enough to pack with a margin (the card is sized by its name). */
const EM = {
  ' ': 0.28, '-': 0.4, '.': 0.28, ',': 0.28, '(': 0.35, ')': 0.35, '#': 0.62, '_': 0.5, '·': 0.3,
  i: 0.26, j: 0.26, l: 0.26, f: 0.34, t: 0.36, r: 0.38, s: 0.5, z: 0.5, c: 0.55, a: 0.56, e: 0.57, v: 0.53, x: 0.53, y: 0.53, k: 0.55,
  m: 0.9, w: 0.8, I: 0.28, J: 0.5, L: 0.55, F: 0.58, E: 0.6, T: 0.62, S: 0.62, Z: 0.62, P: 0.64, Y: 0.64, B: 0.65, K: 0.65, R: 0.65, X: 0.66,
  A: 0.68, V: 0.68, C: 0.7, D: 0.72, U: 0.72, G: 0.74, H: 0.75, N: 0.75, O: 0.76, Q: 0.76, M: 0.9, W: 1.0,
};
const FONT_PX = 26;
const textWidth = (s) => [...s].reduce((a, ch) => a + (EM[ch] ?? (/[0-9]/.test(ch) ? 0.6 : 0.6)), 0) * FONT_PX * 1.05;
const CARD = {padX: 14, height: 76, gap: 18, groupGap: 44, left: 48, right: 1872, top: 92, maxRows: 8, pitchMax: 100};
const hash = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const cards = run.files.map((f, i) => {
  const v = verdictOf(f);
  const group = groupOf(f);
  // the card is sized by its name, or by its verdict (set a weight heavier) when that is the wider
  const w = Math.round(Math.max(textWidth(f.name), textWidth(v.text) * 1.05 + 8) + 2 * CARD.padX);
  return {
    i, file_id: f.file_id, name: f.name, ext: f.ext.replace(/^\./, ''), parent: f.parent ?? null,
    verdict: f.verdict, text: v.text, strong: Boolean(v.strong), reason: f.why, decided_by: BY_NAME[f.decided_by] ?? f.decided_by,
    group, junk: group === 'unread', bill: f.verdict === 'bill', governs: v.text.endsWith('governs'),
    w, h: CARD.height, rot: 0, x: 0, y: 0, row: 0, pour: 0, stamp: 0, sink: null,
  };
});
if (cards.length !== run.package.file_count + 1) throw new Error(`run.json: ${cards.length} files, expected ${run.package.file_count} + 1 unpacked`);

// shelf packing in the product's group order: a card continues the row when it fits, else opens the next row
const rows = [];
let cur = null;
let lastGroup = null;
for (const g of GROUPS) {
  for (const c of cards.filter((c) => c.group === g)) {
    const extra = cur && lastGroup !== g ? CARD.groupGap : 0;
    if (!cur || cur.x + extra + c.w > CARD.right) {
      cur = {x: CARD.left, cards: []};
      rows.push(cur);
    } else cur.x += extra;
    c.x = cur.x;
    c.row = rows.length - 1;
    cur.x += c.w + CARD.gap;
    cur.cards.push(c);
    lastGroup = g;
  }
}
if (rows.length > CARD.maxRows) throw new Error(`layout: ${rows.length} rows, more than ${CARD.maxRows} fit above the captions`);
const pitch = Math.min(CARD.pitchMax, Math.floor((868 - CARD.height - CARD.top) / (rows.length - 1)));
rows.forEach((r, ri) => {
  // each row sits a little left or right of centre, so the field reads as a scatter, not a table
  const used = r.x - CARD.gap - CARD.left;
  const slack = CARD.right - CARD.left - used;
  const shift = Math.round(slack * (0.25 + 0.5 * hash(ri, 9)));
  for (const c of r.cards) {
    c.x += shift + Math.round((hash(c.i, 1) - 0.5) * 10);
    c.y = CARD.top + ri * pitch + Math.round((hash(c.i, 2) - 0.5) * 12);
    c.rot = Number((((hash(c.i, 3) - 0.5) * 2 * Math.min(3, (2.6 * 400) / c.w))).toFixed(2));
  }
});

// the per-card times: pour in the Run's order; stamped as the scan line crosses the card's centre; the junk sinks
for (const c of cards) {
  c.pour = Number((SCENE2.pour.start + c.i * SCENE2.pour.step).toFixed(3));
  const cx = c.x + c.w / 2;
  c.stamp = Number((SCENE2.sweep.start + ((cx - SCENE2.sweep.x0) / (SCENE2.sweep.x1 - SCENE2.sweep.x0)) * (SCENE2.sweep.end - SCENE2.sweep.start)).toFixed(3));
  if (c.junk) c.sink = Number((c.stamp + SCENE2.sink.delay).toFixed(3));
}
const bills = cards.filter((c) => c.bill);
const stackAt = Number((Math.max(...bills.map((c) => c.stamp)) + SCENE2.stack.delay).toFixed(3));
const topBill = bills.find((c) => c.governs);
if (!topBill) throw new Error('no bill governs');

// ---------- the sheet ----------
const sheetId = 'L-1-revB';
const sheetFile = join(REPO, 'frontend-mock', 'api', 'sheets', `${sheetId}.svg`);
const svg = readFileSync(sheetFile, 'utf8');
if (/[㐀-鿿]/.test(svg)) throw new Error(`${sheetFile}: the sheet has CJK text; the film is English only`);
const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);

// ---------- the effects ----------
/** A paper slap: a broadband burst with a soft low body. */
function slap() {
  let lp = 0;
  return synth(0.16, (t) => {
    lp += (noise() - lp) * 0.45;
    const env = Math.exp(-t * 55) * Math.min(1, t / 0.003);
    return env * (0.75 * (noise() - 0.5 * lp)) + 0.3 * Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 32);
  });
}
/** One Geiger tick: a click with a short bright tail. */
function geiger() {
  return synth(0.018, (t) => 0.9 * noise() * Math.exp(-t * 900) + 0.35 * Math.sin(2 * Math.PI * 3400 * t) * Math.exp(-t * 420));
}
/** A stamp clack: a wooden knock, two short partials over a damped noise edge. */
function clack() {
  let lp = 0;
  return synth(0.08, (t) => {
    lp += (noise() - lp) * 0.5;
    return 0.6 * lp * Math.exp(-t * 140) + 0.5 * Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 95) + 0.28 * Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-t * 170);
  });
}
/** The slide of a sheet over three others: low-passed noise that swells and stops. */
function slide() {
  let lp = 0;
  return synth(0.4, (t) => {
    lp += (noise() - lp) * 0.09;
    const env = Math.sin((Math.PI * t) / 0.4) ** 1.6;
    return 0.9 * lp * env;
  });
}
/** The hiss of a sheet settling: high-passed noise, a quick rise and a long fall. */
function hiss() {
  let lp = 0;
  return synth(1.0, (t) => {
    lp += (noise() - lp) * 0.35;
    const env = Math.min(1, t / 0.06) * Math.exp(-t * 3.6);
    return 0.5 * (noise() - lp) * env;
  });
}
const sfx = {room: GEN.room(), slap: slap(), geiger: geiger(), clack: clack(), slide: slide(), hiss: hiss()};
// the transients sit low over a fuller room tone, so the -17 LUFS pass below stays linear under its -1.5 dBTP ceiling
const GAIN = {room: 1.0, slap: 0.42, geiger: 0.3, clack: 0.28, slide: 0.5, hiss: 0.5};
const bed = new Float32Array(SCENE2.duration * RATE);
mixInto(bed, sfx.room, 0, GAIN.room);
mixInto(bed, sfx.slap, SCENE2.folder.slap, GAIN.slap);
// the tick train: irregular, thickest in the middle of the pour, one tick also on every card's own pour
const ticks = [];
for (let t = SCENE2.pour.ticks.from, k = 0; t < SCENE2.pour.ticks.to; k++) {
  ticks.push(Number(t.toFixed(3)));
  const mid = 1 - Math.abs((t - 2.5) / 1.05);
  t += 0.035 + 0.075 * hash(k, 5) * (1.3 - 0.8 * Math.max(0, mid));
}
ticks.forEach((t, k) => mixInto(bed, sfx.geiger, t, GAIN.geiger * (0.6 + 0.4 * hash(k, 6)), 0.85 + 0.4 * hash(k, 7)));
cards.forEach((c) => mixInto(bed, sfx.geiger, c.pour, GAIN.geiger * 0.8, 1.1));
cards.forEach((c) => mixInto(bed, sfx.clack, c.stamp, GAIN.clack * (c.strong ? 1.25 : 0.85 + 0.3 * hash(c.i, 8)), c.strong ? 0.82 : 0.92 + 0.22 * hash(c.i, 4)));
mixInto(bed, sfx.slide, stackAt, GAIN.slide);
mixInto(bed, sfx.hiss, SCENE2.sheet.hiss, GAIN.hiss);
let peak = 0;
for (const s of bed) peak = Math.max(peak, Math.abs(s));
if (peak > 0.95) for (let i = 0; i < bed.length; i++) bed[i] *= 0.95 / peak;
mkdirSync(join(PUB, 'gen'), {recursive: true});
const raw = join(PUB, 'gen', 'scene2-sfx-raw.wav');
const out = join(PUB, 'gen', 'scene2-sfx.wav');
writeWav(raw, bed);
// ffmpeg loudnorm, two passes, to the film's -17 LUFS (the first pass measures, the second applies it linearly)
const TARGET = 'I=-17:TP=-1.5:LRA=11';
/** Pass 1: ffmpeg prints the measured loudness as JSON on stderr. */
function measure() {
  const err = execFileSync('/bin/sh', ['-c', `"${FFMPEG}" -v info -i "${raw}" -af "loudnorm=${TARGET}:print_format=json" -f null - 2>&1`]).toString();
  const a = err.lastIndexOf('{');
  return JSON.parse(err.slice(a, err.indexOf('}', a) + 1));
}
const meas = measure();
execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', raw, '-af', `loudnorm=${TARGET}:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}:measured_LRA=${meas.input_lra}:measured_thresh=${meas.input_thresh}:offset=${meas.target_offset}:linear=true`, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', out]);
const check = execFileSync('/bin/sh', ['-c', `"${FFMPEG}" -v info -i "${out}" -af ebur128=framelog=quiet -f null - 2>&1 | grep -A4 "Integrated loudness" | grep "I:"`]).toString().trim();
unlinkSync(raw);

// ---------- data ----------
const data = {
  generated_at: new Date().toISOString(),
  package: {name: run.package.name, file_count: run.package.file_count, run_id: run.run_id},
  layout: {rows: rows.length, pitch, card: CARD, fontPx: FONT_PX},
  stack: {at: stackAt, top: topBill.i, under: bills.filter((c) => c !== topBill).map((c) => c.i)},
  cards,
  sheet: {svg, viewBox, id: sheetId, source: relative(REPO, sheetFile)},
  sfx: {room: 'lib/wav.mjs GEN.room', slap: 'scene2-prepare.mjs slap()', geiger: 'geiger()', clack: 'clack()', slide: 'slide()', hiss: 'hiss()', ticks: ticks.length, loudness: check},
};
mkdirSync(join(PUB, 'data'), {recursive: true});
writeFileSync(join(PUB, 'data', 'scene2.json'), JSON.stringify(data, null, 1));
const byGroup = GROUPS.map((g) => `${g} ${cards.filter((c) => c.group === g).length}`).join(' · ');
console.log(`public/data/scene2.json · ${cards.length} cards (${byGroup}) · ${rows.length} rows, pitch ${pitch} · stamps ${Math.min(...cards.map((c) => c.stamp)).toFixed(2)}–${Math.max(...cards.map((c) => c.stamp)).toFixed(2)} s · stack @${stackAt} · sheet ${data.sheet.source}`);
console.log(`public/gen/scene2-sfx.wav · peak ${peak.toFixed(2)} · ${ticks.length} ticks · ${cards.length} clacks · measured ${meas.input_i} LUFS → ${check}`);
for (const c of cards) console.log(`  ${c.file_id.padEnd(6)} ${c.group.padEnd(8)} row ${c.row} x ${String(c.x).padStart(4)} w ${String(c.w).padStart(3)} ${c.rot.toFixed(1).padStart(5)}° · ${c.text}${c.strong ? ' *' : ''}${c.junk ? ' (sinks)' : ''} · ${c.name}`);
