/**
 * Gathers what the Scene4Tower composition reads, into public/:
 *
 * - public/tower/<sheet>.png: the six tower sheets, rendered by the repo's own renderer (landsight.dxf.render_png,
 *   the same call the API answers /api/sheets/<id>.png with) from samples/tower's DXF files, via `uv run python`.
 * - public/data/scene4.json: the tower's recorded Run (landsight.db, run 9539ce2f1c3f: runs.run and the scoreboard
 *   columns) reduced to what the scene draws: the six sheets with their titles and floors, which are counted and the
 *   Run's words for the two that are not; the three checks pinned (T01, T02, T08) with their lines quoted verbatim
 *   from the check's title or why (asserted here, so nothing on screen is invented); the typical sheet's floors
 *   (its five copies); the scoreboard (planted · found · flagged · missed, from the runs row); and the per-sheet times.
 * - public/gen/scene4-sfx.wav: the effects track, in scene 2's manner: room tone, a soft paper lift per sheet (and
 *   per copy), a tick per pin, a low chime on the counter; loudness-normalised to -17 LUFS with ffmpeg (two passes).
 *
 *   node scene4-prepare.mjs
 */
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {GEN, RATE, mixInto, noise, readWav, synth, writeWav} from './lib/wav.mjs';
import {SCENE4} from './src/scenes/scene4-cues.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const PUB = join(HERE, 'public');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const UV = process.env.UV ?? 'uv';

// ---------- the Run, as the database holds it ----------
const db = new DatabaseSync(process.env.LANDSIGHT_DB ?? join(REPO, 'landsight.db'), {readOnly: true});
const row = db.prepare('SELECT * FROM runs WHERE id LIKE ?').get(`${SCENE4.run}%`);
if (!row) throw new Error(`landsight.db: no run ${SCENE4.run}`);
const run = JSON.parse(row.run);
const pkg = db.prepare('SELECT name, folder, kind FROM packages WHERE id = ?').get(row.package_id);
if (!pkg || pkg.folder !== SCENE4.packageDir) throw new Error(`run ${row.id} reviewed ${pkg?.folder}, not ${SCENE4.packageDir}`);
const byId = Object.fromEntries(run.checks.map((c) => [c.check_id, c]));
const fileOf = (id) => run.files.find((f) => f.file_id === id);

// ---------- the sheets: the renders ----------
const dxfs = run.sheets.map((s) => {
  const f = fileOf(s.file_id);
  const path = join(run.package.folder, f.path);
  if (!existsSync(path)) throw new Error(`${relative(REPO, path)} is missing`);
  return {sheet_id: s.sheet_id, dxf: path, png: join(PUB, 'tower', `${s.sheet_id}.png`)};
});
mkdirSync(join(PUB, 'tower'), {recursive: true});
const stale = dxfs.filter((d) => !existsSync(d.png) || statSync(d.png).mtimeMs <= statSync(d.dxf).mtimeMs);
if (stale.length) {
  // the repo's renderer, exactly as the API serves /api/sheets/<id>.png (render_png with its defaults)
  const py = [
    'import re, sys',
    'from landsight.dxf import load, render_png',
    'cjk = re.compile(r"[\\u3400-\\u9fff]")',
    'args = sys.argv[1:]',
    'for dxf, png in zip(args[0::2], args[1::2]):',
    '    m = load(dxf)',
    '    bad = [t.content for t in m.texts if cjk.search(t.content)]',
    '    if bad: raise SystemExit(f"{dxf}: the sheet has CJK text; the film is English only: {bad[:3]}")',
    '    render_png(m, png)',
    '    print(f"  {png}: {len(m.entities)} entities, {len(m.texts)} texts")',
  ].join('\n');
  console.log(`rendering ${stale.length} sheet(s) with landsight.dxf.render_png`);
  execFileSync(UV, ['run', 'python', '-c', py, ...stale.flatMap((d) => [d.dxf, d.png])], {cwd: REPO, stdio: 'inherit'});
}
/** The PNG's pixel size, from its header (all six are the renderer's 2100 × 1140). */
function pngSize(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file}: not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
const sizes = dxfs.map((d) => pngSize(d.png));
if (sizes.some(([w, h]) => w !== sizes[0][0] || h !== sizes[0][1])) throw new Error(`the sheet renders differ in size: ${JSON.stringify(sizes)}`);

// ---------- the sheets: what the Run says of each ----------
/** A floor as the Run names it (title blocks say 4F, R1F), and its storey for the stack (R1 sits above 21F). */
const floorLabel = (f) => `${f}F`;
const storey = (f) => (f === 'R1' ? 22 : Number(f));
/** The Run's sheet verdict for a sheet it does not count: the words after the colon of its "— not counted" check. */
function notCounted(sheetId) {
  const c = run.checks.find((x) => x.category === 'sheet' && /— not counted$/.test(x.title) && x.evidence?.sheet_ids?.length === 1 && x.evidence.sheet_ids[0] === sheetId);
  if (!c) throw new Error(`${sheetId} is not counted but no check says why`);
  return {check_id: c.check_id, text: c.title.slice(c.title.lastIndexOf(': ') + 2)};
}
const riseOrder = [];
const exitOrder = [];
const sheets = run.sheets.map((s, i) => {
  const floors = Array.isArray(s.floors) ? s.floors.map(String) : [];
  const counted = Boolean(s.counted);
  if (counted && floors.length === 0) throw new Error(`${s.sheet_id} is counted but has no floors`);
  const nc = counted ? null : notCounted(s.sheet_id);
  const sheet = {
    i, sheet_id: s.sheet_id, title: s.title, file: fileOf(s.file_id).path, png: `tower/${s.sheet_id}.png`,
    floors, counted, level: counted ? storey(floors[0]) : null,
    label: counted ? `${s.sheet_id} · ${floorLabel(floors[0])}` : `${s.sheet_id} · ${nc.text}`,
    not_counted: nc,
    fan: {rot: Number(((i - 2.5) * SCENE4.fan.stepDeg).toFixed(2)), dx: (i - 2.5) * SCENE4.fan.stepX, dy: Math.round(Math.abs(i - 2.5) * SCENE4.fan.dy) - 10, dz: 2 * (run.sheets.length - 1 - i)},
    rise: null, exit: null,
  };
  (counted ? riseOrder : exitOrder).push(sheet);
  return sheet;
});
riseOrder.forEach((s, k) => (s.rise = Number((SCENE4.rise.start + k * SCENE4.rise.step).toFixed(3))));
exitOrder.forEach((s, k) => (s.exit = Number((SCENE4.exit.start + k * SCENE4.exit.step).toFixed(3))));

// ---------- the typical sheet's copies: the floors beyond its first, from the Run ----------
const typical = sheets.filter((s) => s.counted && s.floors.length > 1);
if (typical.length !== 1) throw new Error(`expected one sheet standing for several floors, found ${typical.length}`);
const ghosts = typical[0].floors.slice(1).map((f, k) => ({sheet_id: typical[0].sheet_id, floor: f, label: floorLabel(f), level: storey(f), at: Number((SCENE4.ghosts.start + k * SCENE4.ghosts.step).toFixed(3))}));
const t01 = byId.T01;
if (!t01 || t01.numbers?.floors !== typical[0].floors.length) throw new Error(`T01 says ${t01?.numbers?.floors} floors; the sheet lists ${typical[0].floors.length}`);
if (!/typical/i.test(typical[0].title)) throw new Error(`${typical[0].sheet_id}'s title does not say "typical": ${typical[0].title}`);

// ---------- the pins: three checks, every line a verbatim fragment of the check's title or why ----------
const PIN_LINES = {
  T01: {head: 'One drawing, 6 floors built', line: 'Chinese ixora 20 m² per floor × 6 = 120 m²'},
  T02: {head: '0.3 m soil, below the 0.4 m minimum', line: '32 m² of planting is left out of the greening sum'},
  T08: {head: 'Only the title block tells them apart', line: 'Check they are different floors before pricing both'},
};
const pins = SCENE4.pins.checks.map((id, k) => {
  const c = byId[id];
  if (!c) throw new Error(`the Run has no check ${id}`);
  const text = `${c.title}\n${c.why}`;
  const {head, line} = PIN_LINES[id];
  for (const frag of [head, line]) if (!text.includes(frag)) throw new Error(`${id}: "${frag}" is not in the check's title or why`);
  const sheetIds = c.evidence.sheet_ids;
  if (!sheetIds?.length) throw new Error(`${id} names no sheet`);
  const plates = sheetIds.filter((sid) => sheets.find((s) => s.sheet_id === sid)?.counted);
  if (!plates.length) throw new Error(`${id}: none of ${sheetIds} is a counted sheet`);
  return {
    check_id: id, severity: c.severity, scenario: c.scenario, by: c.by, sheet_ids: sheetIds, plates,
    id_line: `${id} · ${sheetIds.join(' · ')} · ${c.severity}`, head, line, title: c.title,
    at: Number((SCENE4.pins.start + k * SCENE4.pins.step).toFixed(3)),
  };
});

// ---------- the scoreboard: the runs row (what the product's Projects table prints), checked against the Run ----------
const sum = (k) => Object.values(run.scenarios).reduce((a, s) => a + (Array.isArray(s[k]) ? s[k].length : s[k]), 0);
const scoreboard = {
  planted: row.planted, found: row.found, flagged: row.flagged, missed: row.missed, false_alarms: row.false_alarms,
  found_ids: Object.values(run.scenarios).flatMap((s) => s.found), flagged_ids: Object.values(run.scenarios).flatMap((s) => s.flagged),
  missed_ids: Object.values(run.scenarios).flatMap((s) => s.missed),
};
for (const k of ['planted', 'found', 'flagged', 'missed', 'false_alarms']) if (sum(k) !== scoreboard[k]) throw new Error(`scoreboard ${k}: runs row ${scoreboard[k]}, scenarios sum ${sum(k)}`);
// "handed over" is the film's word for the Run's `flagged` (flagged for a person; demo/SCRIPT.md's scoreboard line)
scoreboard.text = `${scoreboard.planted} planted · ${scoreboard.found} found · ${scoreboard.flagged} handed over · ${scoreboard.missed} missed`;
scoreboard.terms = [[scoreboard.planted, 'planted'], [scoreboard.found, 'found'], [scoreboard.flagged, 'handed over'], [scoreboard.missed, 'missed']];

// ---------- the effects ----------
/** A soft paper lift: band-passed noise that swells and stops, a sheet leaving a pile. */
function lift() {
  let lp = 0;
  let bp = 0;
  return synth(0.3, (t) => {
    lp += (noise() - lp) * 0.25;
    bp += (lp - bp) * 0.06;
    const env = Math.sin(Math.PI * Math.min(1, t / 0.3)) ** 1.4;
    return 0.8 * (lp - bp) * env;
  });
}
const sfx = {room: GEN.room(), lift: lift(), tick: readWav(join(HERE, 'audio', 'sfx', 'tick.wav')), chime: readWav(join(HERE, 'audio', 'sfx', 'chime.wav'))};
const GAIN = {room: 0.5, lift: 0.42, ghost: 0.26, exit: 0.3, tick: 0.5, chime: 0.42};
const bed = new Float32Array(SCENE4.duration * RATE);
// room tone under everything (the generated bed is 10 s; two copies, the second faded in over the first's tail)
mixInto(bed, sfx.room, 0, GAIN.room);
mixInto(bed, sfx.room, 9.0, GAIN.room);
for (let i = Math.round(9.0 * RATE); i < Math.round(10.0 * RATE); i++) bed[i] *= 1 - 0.5 * Math.sin((Math.PI * (i / RATE - 9.0)) / 1.0);
riseOrder.forEach((s, k) => mixInto(bed, sfx.lift, s.rise, GAIN.lift, 0.95 + 0.04 * k));
exitOrder.forEach((s, k) => mixInto(bed, sfx.lift, s.exit, GAIN.exit, 0.85 - 0.05 * k));
ghosts.forEach((g, k) => mixInto(bed, sfx.lift, g.at, GAIN.ghost, 1.1 + 0.04 * k));
pins.forEach((p) => mixInto(bed, sfx.tick, p.at, GAIN.tick));
mixInto(bed, sfx.chime, SCENE4.counter.at, GAIN.chime, 0.75); // the chime a fourth lower than scene 1's
let peak = 0;
for (const s of bed) peak = Math.max(peak, Math.abs(s));
if (peak > 0.95) for (let i = 0; i < bed.length; i++) bed[i] *= 0.95 / peak;
mkdirSync(join(PUB, 'gen'), {recursive: true});
const raw = join(PUB, 'gen', 'scene4-sfx-raw.wav');
const out = join(PUB, 'gen', 'scene4-sfx.wav');
writeWav(raw, bed);
// ffmpeg loudnorm, two passes, to the film's -17 LUFS (the first pass measures, the second applies it linearly)
const TARGET = 'I=-17:TP=-1.5:LRA=11';
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
  run: {run_id: row.id, mode: row.mode, finished_at: row.finished_at, package: pkg.name, folder: SCENE4.packageDir, file_count: run.package.file_count, db: 'landsight.db runs.run'},
  png: {size: sizes[0], renderer: 'landsight.dxf.render_png (defaults, as /api/sheets/<id>.png)'},
  sheets, ghosts, pins, scoreboard,
  sfx: {room: 'lib/wav.mjs GEN.room', lift: 'scene4-prepare.mjs lift()', tick: 'audio/sfx/tick.wav', chime: 'audio/sfx/chime.wav at 0.75', loudness: check},
};
mkdirSync(join(PUB, 'data'), {recursive: true});
writeFileSync(join(PUB, 'data', 'scene4.json'), JSON.stringify(data, null, 1));
console.log(`public/data/scene4.json · run ${row.id} (${row.mode}, ${pkg.name}) · ${sheets.length} sheets, ${riseOrder.length} floors + ${ghosts.length} copies of ${typical[0].sheet_id}, ${exitOrder.length} not counted · ${pins.length} pins · ${scoreboard.text}`);
for (const s of sheets) console.log(`  ${s.sheet_id}  ${s.counted ? `floors ${s.floors.join(', ')}  rise @${s.rise}` : `${s.not_counted.text} (${s.not_counted.check_id})  exit @${s.exit}`}  · ${s.title}`);
for (const p of pins) console.log(`  ${p.check_id} @${p.at} [${p.severity}] ${p.sheet_ids.join(', ')} · "${p.head}" / "${p.line}"`);
console.log(`public/gen/scene4-sfx.wav · peak ${peak.toFixed(2)} · ${riseOrder.length + exitOrder.length + ghosts.length} lifts · ${pins.length} ticks · chime @${SCENE4.counter.at} · measured ${meas.input_i} LUFS → ${check}`);
