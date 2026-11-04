/**
 * Film v7, Part 1: everything StoryV7 needs that is not drawn at render time.
 *
 * - public/data/story-v7.json: every number Part 1 prints, read from the runs — greenfield frontend-mock/run.json and
 *   run_confirmed.json (E01, E02.2, E08, E12, E14, E17, E20, C-27, the tally), the tower run 97e35639fb8d in
 *   landsight.db (T01, T06), the L-1 Rev B objects (the eight canopies, H-01, T-10, the site boundary) and the thirty
 *   sheets of the grid; plus the measured length of every voice clip.
 * - public/v7/sheets/<id>.png: the thirty sheets as 1050 × 570 textures (each render padded onto white at the tower
 *   renders' 2100 × 1140 aspect); public/v7/lc1.png the typical plate at full size.
 * - public/audio/v7-eric/line-NN.mp3: the Part 1 voice; audio/music/v7-m1.mp3
 *   (instrumental); audio/sfx/v7-<kind>.mp3. Skipped when the file exists; 429s retried.
 * - public/gen/story-v7-mix.wav: the mix — voice at −16 LUFS, music ducked −8 dB under the voice and to near silence
 *   at 1:19–1:22, effects, the whole at −14 LUFS integrated, true peak −1 dB (ffmpeg loudnorm, two passes).
 * - demo/props/sheets-a3.pdf: the greenfield L-1, L-3, L-6 and the tower L-101…L-104, one per A3 page, for printing.
 *
 * Usage: node story-v7-prepare.mjs [--no-audio] [--no-mix] [--no-pdf]. SPEECH_API_KEY from the environment
 * (never printed). Node 24 (node:sqlite); ffmpeg at /opt/homebrew/bin/ffmpeg; python via `uv run` from the repo root.
 */
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {V7} from './src/scenes/story-v7-cues.js';
import t08 from './src/scenes/t08.json' with {type: 'json'};

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const PUB = join(HERE, 'public');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const UV = 'uv';
const args = new Set(process.argv.slice(2));
const TOWER_RUN = '97e35639fb8d';

for (const d of ['data', 'v7/sheets', 'audio/v7-eric', 'audio/music', 'audio/sfx', 'gen']) mkdirSync(join(PUB, d), {recursive: true});

// ---------------------------------------------------------------- the runs
const run = JSON.parse(readFileSync(join(REPO, 'frontend-mock', 'run.json'), 'utf8'));
const confirmed = JSON.parse(readFileSync(join(REPO, 'frontend-mock', 'run_confirmed.json'), 'utf8'));
const check = (r, id) => {
  const c = r.checks.find((x) => x.check_id === id);
  if (!c) throw new Error(`run ${r.run_id}: no check ${id}`);
  return c;
};
const E01 = check(run, 'E01');
const E022 = check(run, 'E02.2');
const E08 = check(run, 'E08');
const E12 = check(confirmed, 'E12');
const E14 = check(confirmed, 'E14');
const E17 = check(run, 'E17');
const E20 = check(run, 'E20');
const C27 = check(run, 'C-27');

const db = new DatabaseSync(process.env.LANDSIGHT_DB ?? join(REPO, 'landsight.db'), {readOnly: true});
const towerRow = db.prepare('SELECT id, mode, finished_at, run FROM runs WHERE id LIKE ?').get(`${TOWER_RUN}%`);
if (!towerRow) throw new Error(`landsight.db: no run ${TOWER_RUN}`);
const tower = JSON.parse(towerRow.run);
const T01 = check(tower, 'T01');
const T06 = check(tower, 'T06');
const LC1 = tower.sheets.find((s) => s.sheet_id === 'L-103');

const L1 = run.sheets.find((s) => s.sheet_id === 'L-1-revB');
const obj = (id) => {
  const o = L1.objects.find((x) => x.object_id === id);
  if (!o) throw new Error(`L-1-revB: no object ${id}`);
  return o;
};
const H01 = obj('H-01');
const T10 = obj('T-10');
const boundary = L1.objects.find((x) => x.kind === 'boundary');

/** The screen's dollar figures are n × the shown unit (D-73), as the v5.5 ledger records them. */
const usd = (x) => Math.round(x);
const camphorOver = (E022.numbers.bill_qty - E022.numbers.drawn_qty) * usd(E022.numbers.unit_price_usd); // 4 × $129 = $516
const paversOver = E20.numbers.bill_qty * (usd(E20.numbers.bill_price_usd) - usd(E20.numbers.list_high_usd)); // 236 × $46 = $10,856
const fixA = E14.fixes.find((f) => f.id === 'a');
const fixB = E14.fixes.find((f) => f.id === 'b');
if (!fixA || !fixB) throw new Error('E14: fixes a and b not found');
const before = E14.before_downgrade; // the greening as if the pits were in the ground (confirmed state)
const plus2 = before.fixes.find((f) => /^\+2 Camphor/.test(f.label));

// ---------------------------------------------------------------- the thirty sheets of the grid
const greenfield = ['L-0', 'L-1-revB', 'L-1-revA', 'L-2', 'L-3', 'L-4', 'L-5', 'L-6', 'L-7', 'L-8', 'D-01', 'F-24-p1', 'F-25-p1', 'F-25-p2', 'F-25-p3', 'F-25-p4', 'F-25-p5', 'F-25-p6', 'F-25-p7', 'F-25-p8', 'F-25-p9', 'F-26-p1', 'L-3.filled', 'L-1-revB.filled'];
const towerIds = ['L-101', 'L-102', 'L-103', 'L-104', 'L-301', 'L-501'];
const titleOf = (id) => {
  const t = tower.sheets.find((s) => s.sheet_id === id) || run.sheets.find((s) => s.sheet_id === id.replace('.filled', ''));
  return t ? t.title : id;
};
const sheets = [
  ...towerIds.map((id) => ({id, title: titleOf(id), src: join(PUB, 'tower', `${id}.png`), package: 'tower'})),
  ...greenfield.map((id) => ({id, title: titleOf(id), src: join(REPO, 'frontend-mock', 'api', 'sheets', `${id}.png`), package: 'greenfield'})),
];
if (sheets.length !== 30) throw new Error(`the grid wants 30 sheets, have ${sheets.length}`);
for (const s of sheets) if (!existsSync(s.src)) throw new Error(`missing render ${s.src}`);

/** Pad every render onto white at 2100 × 1140 and shrink to 1050 × 570 (the textures); L-103 also at full size. */
function textures() {
  const py = [
    'import sys, json',
    'from PIL import Image',
    'jobs = json.loads(sys.argv[1])',
    'for src, dst, w, h in jobs:',
    '    im = Image.open(src).convert("RGBA")',
    '    bg = Image.new("RGBA", (2100, 1140), (255, 255, 255, 255))',
    '    s = min(2100 / im.width, 1140 / im.height)',
    '    im2 = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)',
    '    bg.alpha_composite(im2, ((2100 - im2.width) // 2, (1140 - im2.height) // 2))',
    '    bg.convert("RGB").resize((w, h), Image.LANCZOS).save(dst)',
  ].join('\n');
  const jobs = [];
  for (const s of sheets) {
    const dst = join(PUB, 'v7', 'sheets', `${s.id}.png`);
    if (!existsSync(dst)) jobs.push([s.src, dst, 1050, 570]);
  }
  const lc1 = join(PUB, 'v7', 'lc1.png');
  if (!existsSync(lc1)) jobs.push([join(PUB, 'tower', 'L-103.png'), lc1, 2100, 1140]);
  if (jobs.length) {
    console.log(`textures: ${jobs.length} sheet(s)`);
    execFileSync(UV, ['run', 'python', '-c', py, JSON.stringify(jobs)], {cwd: REPO, stdio: 'inherit'});
  }
}
textures();

// ---------------------------------------------------------------- the props PDF (A3, one sheet per page)
function propsPdf() {
  const out = join(REPO, 'demo', 'props', 'sheets-a3.pdf');
  mkdirSync(dirname(out), {recursive: true});
  const pages = [
    ['L-1-revB', join(REPO, 'frontend-mock', 'api', 'sheets', 'L-1-revB.png')],
    ['L-3', join(REPO, 'frontend-mock', 'api', 'sheets', 'L-3.png')],
    ['L-6', join(REPO, 'frontend-mock', 'api', 'sheets', 'L-6.png')],
    ...['L-101', 'L-102', 'L-103', 'L-104'].map((id) => [id, join(PUB, 'tower', `${id}.png`)]),
  ];
  const py = [
    'import sys, json',
    'from PIL import Image',
    'pages = json.loads(sys.argv[1]); out = sys.argv[2]',
    'W, H = 4961, 3508  # A3 landscape at 300 dpi',
    'imgs = []',
    'for sid, src in pages:',
    '    im = Image.open(src).convert("RGB")',
    '    m = 160',
    '    s = min((W - 2 * m) / im.width, (H - 2 * m) / im.height)',
    '    im2 = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)',
    '    page = Image.new("RGB", (W, H), (255, 255, 255))',
    '    page.paste(im2, ((W - im2.width) // 2, (H - im2.height) // 2))',
    '    imgs.append(page)',
    'imgs[0].save(out, "PDF", resolution=300.0, save_all=True, append_images=imgs[1:])',
    'print(f"  {out}: {len(imgs)} A3 pages")',
  ].join('\n');
  execFileSync(UV, ['run', 'python', '-c', py, JSON.stringify(pages), out], {cwd: REPO, stdio: 'inherit'});
}
if (!args.has('--no-pdf')) propsPdf();

// ---------------------------------------------------------------- soundtrack
const KEY = process.env.SPEECH_API_KEY;
const API = (process.env.SPEECH_API_BASE || '').replace(/\/$/, '');
const HEADER = process.env.SPEECH_API_HEADER;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchAudio(path, body, out, label) {
  if (existsSync(out)) return false;
  if (!KEY || !API || !HEADER) throw new Error(`SPEECH_API_KEY, SPEECH_API_BASE and SPEECH_API_HEADER are required (needed for ${label})`);
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}${path}`, {method: 'POST', headers: {[HEADER]: KEY, 'content-type': 'application/json', accept: 'audio/mpeg'}, body: JSON.stringify(body)});
    if (res.ok) {
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      console.log(`  ${label} → ${out.replace(PUB + '/', '')}`);
      return true;
    }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      const wait = 2000 * 2 ** attempt;
      console.log(`  ${label}: HTTP ${res.status}, retry in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  throw new Error(`${label}: gave up after 6 attempts`);
}
const voiceId = readFileSync(process.env.VOICE_ID_FILE, 'utf8').trim();
const voiceFile = (n) => join(PUB, 'audio', 'v7-eric', `line-${String(n).padStart(2, '0')}.mp3`);
const sfxFile = (kind) => join(PUB, 'audio', 'sfx', `v7-${kind}.mp3`);
const musicFile = join(PUB, V7.music.file);

async function sound() {
  console.log('voice');
  for (const v of V7.voice) {
    await fetchAudio(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_192`, {text: v.text, model_id: process.env.SPEECH_MODEL, voice_settings: {stability: 0.65, similarity_boost: 0.9, style: 0, use_speaker_boost: true}}, voiceFile(v.n), `line ${v.n}`);
  }
  console.log('effects');
  for (const [kind, spec] of Object.entries(V7.sfx.kinds)) {
    await fetchAudio(`/v1/sound-generation?output_format=mp3_44100_192`, {text: spec.text, duration_seconds: spec.seconds, prompt_influence: 0.5}, sfxFile(kind), `sfx ${kind}`);
  }
  console.log('music M1');
  try {
    await fetchAudio(`/v1/music?output_format=mp3_44100_192`, {prompt: V7.music.prompt, music_length_ms: V7.music.seconds * 1000, model_id: process.env.MUSIC_MODEL}, musicFile, 'M1');
  } catch (e) {
    console.log(`  M1 failed: ${String(e.message).slice(0, 200)} — the mix will run without music if the file is missing`);
  }
}
if (!args.has('--no-audio')) await sound();

// ---------------------------------------------------------------- the mix
const probe = (file) => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'}).trim());
const lufs = (file) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], {encoding: 'utf8'});
  const m = r.stderr.match(/\{[\s\S]*\}/);
  return JSON.parse(m[0]);
};
const have = (f) => existsSync(f);
const voiceSeconds = {};
for (const v of V7.voice) if (have(voiceFile(v.n))) voiceSeconds[v.n] = probe(voiceFile(v.n));
const voiceSpans = V7.voice.filter((v) => voiceSeconds[v.n]).map((v) => [v.at, v.at + voiceSeconds[v.n]]);

function mix() {
  const out = join(PUB, 'gen', 'story-v7-mix.wav');
  const inputs = [];
  const chains = [];
  const add = (file) => {
    inputs.push('-i', file);
    return inputs.length / 2 - 1;
  };
  const dur = V7.duration;
  // the voice bus
  const vlabels = [];
  for (const v of V7.voice) {
    if (!have(voiceFile(v.n))) continue;
    const i = add(voiceFile(v.n));
    chains.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(v.at * 1000)}|${Math.round(v.at * 1000)},apad=whole_dur=${dur}[v${v.n}]`);
    vlabels.push(`[v${v.n}]`);
  }
  let voiceGain = 0;
  if (vlabels.length) {
    // measure the voice bus once at unity to place it at −16 LUFS
    const tmp = join(PUB, 'gen', 'story-v7-voice.wav');
    const fc = chains.concat([`${vlabels.join('')}amix=inputs=${vlabels.length}:normalize=0:duration=longest,atrim=0:${dur}[voice]`]).join(';');
    execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '[voice]', '-c:a', 'pcm_s16le', tmp]);
    const m = lufs(tmp);
    voiceGain = -16 - Number(m.input_i);
    console.log(`voice bus ${m.input_i} LUFS → gain ${voiceGain.toFixed(1)} dB`);
  }
  // the music bus: −8 dB under every voice line (0.2 s in, 0.4 s out), the script's dip at 1:19–1:22, out at the end
  let musicLabel = null;
  if (have(musicFile)) {
    const i = add(musicFile);
    const ramp = (a, b) => `max(0,min(min((t-(${a - 0.2}))/0.2,1),(${b + 0.4}-t)/0.4))`;
    let env = '0';
    for (const [a, b] of voiceSpans) env = `max(${env},${ramp(a, b)})`;
    const {from, to, db} = V7.music.duck;
    const dip = `max(0,min(min((t-${from})/0.6,1),(${to}-t)/0.8))`;
    const vol = `pow(10,(${8 * -1}*(${env})+${db}*(${dip}))/20)`;
    const m = lufs(musicFile);
    const base = -23 - Number(m.input_i); // the bed sits around −23 LUFS before ducking
    chains.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${dur},apad=whole_dur=${dur},volume=${base.toFixed(2)}dB,volume='${vol}':eval=frame,afade=t=out:st=${V7.music.end.fadeFrom}:d=${(V7.music.end.fadeTo - V7.music.end.fadeFrom).toFixed(2)}[music]`);
    musicLabel = '[music]';
  }
  // the effects bus
  const slabels = [];
  const sfxInputs = {};
  V7.sfx.cues.forEach(([kind, at, gain], k) => {
    const f = sfxFile(kind);
    if (!have(f)) return;
    if (sfxInputs[kind] === undefined) sfxInputs[kind] = add(f);
    const i = sfxInputs[kind];
    chains.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${gain},adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)},apad=whole_dur=${dur}[s${k}]`);
    slabels.push(`[s${k}]`);
  });
  // (amix reads each input once; an effect used at several cues is split)
  for (const [kind, i] of Object.entries(sfxInputs)) {
    const uses = chains.filter((c) => c.startsWith(`[${i}:a]`)).length;
    if (uses > 1) {
      const names = Array.from({length: uses}, (_, j) => `[x${i}_${j}]`);
      chains.unshift(`[${i}:a]asplit=${uses}${names.join('')}`);
      let j = 0;
      for (let c = 0; c < chains.length; c++) if (chains[c].startsWith(`[${i}:a]`) && !chains[c].includes('asplit')) chains[c] = chains[c].replace(`[${i}:a]`, names[j++]);
    }
    void kind;
  }
  let sfxLabel = null;
  if (slabels.length) {
    chains.push(`${slabels.join('')}amix=inputs=${slabels.length}:normalize=0:duration=longest,atrim=0:${dur},volume=-14dB[sfx]`);
    sfxLabel = '[sfx]';
  }
  const buses = [];
  if (vlabels.length) {
    chains.push(`${vlabels.join('')}amix=inputs=${vlabels.length}:normalize=0:duration=longest,atrim=0:${dur},volume=${voiceGain.toFixed(2)}dB[voice]`);
    buses.push('[voice]');
  }
  if (musicLabel) buses.push(musicLabel);
  if (sfxLabel) buses.push(sfxLabel);
  if (!buses.length) {
    console.log('mix: nothing to mix');
    return;
  }
  chains.push(`${buses.join('')}amix=inputs=${buses.length}:normalize=0:duration=longest,atrim=0:${dur}[pre]`);
  const pre = join(PUB, 'gen', 'story-v7-pre.wav');
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', chains.join(';'), '-map', '[pre]', '-c:a', 'pcm_s16le', pre]);
  // loudnorm, two passes: −14 LUFS integrated, true peak −1 dB
  const m = lufs(pre);
  const ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', pre, '-af', ln, '-ar', '48000', '-c:a', 'pcm_s16le', out]);
  const after = lufs(out);
  console.log(`mix → public/gen/story-v7-mix.wav: ${after.input_i} LUFS, true peak ${after.input_tp} dBTP (pre: ${m.input_i} LUFS)`);
}
if (!args.has('--no-mix')) mix();

// ---------------------------------------------------------------- the data file
const data = {
  greenfield: {
    run_id: run.run_id,
    package: run.package.name,
    file_count: run.package.file_count,
    camphor: {
      check: 'E02.2',
      row: E022.numbers.row,
      bill_text: E022.numbers.bill_text,
      bill_unit: E022.numbers.bill_unit,
      bill_qty: E022.numbers.bill_qty,
      unit_price: E022.numbers.unit_price,
      unit_price_usd: usd(E022.numbers.unit_price_usd),
      drawn_qty: E022.numbers.drawn_qty,
      over_usd: camphorOver,
      title: E022.title,
    },
    tree: {check: 'E01', title: E01.title, gaps: E01.numbers.gaps, confidence: E01.numbers.confidence},
    hedge: {
      check: 'E17',
      row: E17.numbers.row,
      bill_text: E17.numbers.bill_text,
      bill_unit: E17.numbers.bill_unit,
      bill_qty: E17.numbers.bill_qty,
      drawn_qty: E17.numbers.drawn_qty,
      rows: E17.numbers.rows,
      row_length_m: E17.numbers.row_length_m,
      spacing_m: C27.numbers.spacing_m,
      count: C27.numbers.count,
      label: 'DU H0.6 @0.3m o.c. DOUBLE ROW',
      label_at: [39.1, 9.4],
      segments: H01.segments,
      title: E17.title,
    },
    pavers: {
      check: 'E20',
      row: E20.numbers.row,
      bill_text: E20.numbers.bill_text,
      bill_qty: E20.numbers.bill_qty,
      drawn_qty: E20.numbers.drawn_qty,
      bill_price_usd: usd(E20.numbers.bill_price_usd),
      list_high_usd: usd(E20.numbers.list_high_usd),
      over_usd: paversOver,
      title: E20.title,
    },
    queried_usd: 17788, // the Statement's own `Queried $17,788 · 38.7%` (v5.5 ledger: Statement.tsx:111, D-73)
    greening: {
      check: 'E14',
      title: E14.title,
      required: E14.numbers.required,
      provided: E14.numbers.provided,
      before_pit_rule: E14.numbers.provided_before_pit_rule,
      plus2: plus2 ? {label: plus2.label, value: plus2.result} : null,
      fixes: [
        {id: 'a', label: fixA.label, value: fixA.result, passes: fixA.passes},
        {id: 'b', label: fixB.label, value: fixB.result, passes: fixB.passes},
      ],
    },
    pit: {check: 'E12', title: E12.title, w: E12.numbers.pit_w_m, l: E12.numbers.pit_l_m, soil: E12.numbers.soil_depth_m, on_slab: E12.numbers.on_slab, downgraded: E12.numbers.trees_downgraded},
    offsite: {check: 'E08', title: E08.title, why: E08.why, centre: T10.centre, outline: T10.outline},
    boundary: boundary.outline,
    row: t08.row,
    svg: t08.svg,
  },
  tower: {
    run_id: towerRow.id,
    mode: towerRow.mode,
    finished_at: towerRow.finished_at,
    package: tower.package.name,
    typical: {check: 'T01', sheet: 'L-103', title: LC1.title, floors: T01.floors, per_floor: T01.numbers.per_floor, total: T01.numbers.total, why: T01.why},
    bill: {
      check: 'T06',
      row: T06.numbers.row,
      bill_text: T06.numbers.bill_text,
      bill_unit: T06.numbers.bill_unit,
      bill_qty: T06.numbers.bill_qty,
      drawn_qty: T06.numbers.drawn_qty,
      unit_price: T06.numbers.unit_price,
      unit_price_usd: T06.numbers.unit_price_usd,
      amount_usd: T06.numbers.amount_usd,
      bill_cell: T06.numbers.bill_cell,
      title: T06.title,
      why: T06.why,
    },
  },
  sheets: sheets.map((s) => ({id: s.id, title: s.title, package: s.package, png: `v7/sheets/${s.id}.png`})),
  lc1: 'v7/lc1.png',
  audio: {voice: Object.fromEntries(V7.voice.map((v) => [v.n, voiceSeconds[v.n] ?? null])), mix: existsSync(join(PUB, 'gen', 'story-v7-mix.wav')) ? 'gen/story-v7-mix.wav' : null},
};
writeFileSync(join(PUB, 'data', 'story-v7.json'), JSON.stringify(data, null, 1));
console.log(`public/data/story-v7.json: greenfield ${run.run_id}, tower ${towerRow.id}; voice ${Object.values(voiceSeconds).length}/${V7.voice.length} lines`);
