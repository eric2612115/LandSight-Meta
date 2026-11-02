/**
 * Gathers what the Scene1Tree composition reads, into public/:
 *
 * - public/data/scene1.json: the L-1 sheet the frontend serves (frontend-mock/api/sheets/L-1-revB.svg, inline so it
 *   stays vector-sharp at any push) and the two narration clip lengths (ffprobe).
 * - public/audio/scene1-brian/line-01.wav, line-02.wav: the ElevenLabs reads, loudness-normalised like the v1 film.
 * - public/gen/scene1-sfx.wav: the mixed effects track: room tone, one tick at the scan, a rasp per stroke as the
 *   twelve separate, the snap and the soft chime when they close (cues from src/scenes/scene1-cues.js).
 *
 *   node scene1-prepare.mjs
 */
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GEN, RATE, mixInto, noise, readWav, synth, writeWav} from './lib/wav.mjs';
import {SCENE1} from './src/scenes/scene1-cues.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const PUB = join(HERE, 'public');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE ?? '/opt/homebrew/bin/ffprobe';
const t08 = JSON.parse(readFileSync(join(HERE, 'src', 'scenes', 't08.json'), 'utf8'));

// ---------- the sheet ----------
const sheetFile = join(REPO, 'frontend-mock', 'api', 'sheets', `${t08.sheet_id}.svg`);
const svg = readFileSync(sheetFile, 'utf8');
if (/[㐀-鿿]/.test(svg)) throw new Error(`${sheetFile}: the sheet has CJK text; the film is English only`);
const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);

// ---------- the narration ----------
const probe = (f) => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const VOICE_DIR = 'scene1-brian';
const narration = {voice: 'Brian', dir: `audio/${VOICE_DIR}`, clips: {}};
mkdirSync(join(PUB, 'audio', VOICE_DIR), {recursive: true});
for (const n of [1, 2]) {
  const src = join(HERE, 'audio', VOICE_DIR, `line-0${n}.mp3`);
  if (!existsSync(src)) throw new Error(`${relative(REPO, src)} is missing (the ElevenLabs read)`);
  const dst = join(PUB, 'audio', VOICE_DIR, `line-0${n}.wav`);
  if (!existsSync(dst) || statSync(dst).mtimeMs <= statSync(src).mtimeMs) {
    // v1 normalises its lines to -16 LUFS under music; here the voice carries the mix, so -15.2 lands the scene at -17 LUFS
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src, '-af', 'loudnorm=I=-15.2:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', dst]);
  }
  narration.clips[n] = probe(src);
}

// ---------- the effects ----------
/** A short rasp: a pen dragged a few millimetres, band-passed noise with a falling edge. */
function rasp() {
  let lp = 0;
  let bp = 0;
  return synth(0.09, (t) => {
    lp += (noise() - lp) * 0.35;
    bp += (lp - bp) * 0.08;
    const env = Math.exp(-t * 26) * Math.min(1, t / 0.005);
    return env * (0.55 * (lp - bp) + 0.1 * Math.sin(2 * Math.PI * (1500 - 500 * (t / 0.09)) * t));
  });
}
const sfx = {
  tick: readWav(join(HERE, 'audio', 'sfx', 'tick.wav')),
  snap: readWav(join(HERE, 'audio', 'sfx', 'snap.wav')),
  chime: readWav(join(HERE, 'audio', 'sfx', 'chime.wav')),
  room: GEN.room(),
  rasp: rasp(),
};
const GAIN = {room: 0.5, tick: 0.55, rasp: 0.42, snap: 0.8, chime: 0.45};
const bed = new Float32Array(SCENE1.duration * RATE);
// room tone under everything (the generated bed is 10 s; two copies, the second faded in over the first's tail)
mixInto(bed, sfx.room, 0, GAIN.room);
mixInto(bed, sfx.room, 9.0, GAIN.room);
for (let i = Math.round(9.0 * RATE); i < Math.round(10.0 * RATE); i++) bed[i] *= 1 - 0.5 * Math.sin((Math.PI * (i / RATE - 9.0)) / 1.0); // keep the overlap level
mixInto(bed, sfx.tick, SCENE1.scan.hit, GAIN.tick);
SCENE1.rasps.forEach((t, i) => mixInto(bed, sfx.rasp, t, GAIN.rasp * (0.85 + 0.15 * Math.abs(Math.sin(i * 2.1))), 0.9 + 0.025 * i));
mixInto(bed, sfx.snap, SCENE1.snap, GAIN.snap);
mixInto(bed, sfx.chime, SCENE1.chime, GAIN.chime);
let peak = 0;
for (const s of bed) peak = Math.max(peak, Math.abs(s));
if (peak > 0.95) for (let i = 0; i < bed.length; i++) bed[i] *= 0.95 / peak;
mkdirSync(join(PUB, 'gen'), {recursive: true});
writeWav(join(PUB, 'gen', 'scene1-sfx.wav'), bed);

// ---------- data ----------
const data = {
  generated_at: new Date().toISOString(),
  sheet: {svg, viewBox, id: t08.sheet_id, source: relative(REPO, sheetFile)},
  narration,
  sfx: {tick: 'audio/sfx/tick.wav', snap: 'audio/sfx/snap.wav', chime: 'audio/sfx/chime.wav', room: 'lib/wav.mjs GEN.room', rasp: 'scene1-prepare.mjs rasp()'},
};
mkdirSync(join(PUB, 'data'), {recursive: true});
writeFileSync(join(PUB, 'data', 'scene1.json'), JSON.stringify(data, null, 1));
console.log(`public/data/scene1.json · sheet ${data.sheet.source} (${viewBox.join(' ')}) · narration ${narration.clips[1].toFixed(2)} s + ${narration.clips[2].toFixed(2)} s · T-08 ${t08.canopy.length} pieces + ${t08.cross.length} cross`);
console.log(`public/gen/scene1-sfx.wav · peak ${peak.toFixed(2)} · tick @${SCENE1.scan.hit} · ${SCENE1.rasps.length} rasps ${SCENE1.rasps[0]}–${SCENE1.rasps.at(-1).toFixed(2)} · snap @${SCENE1.snap} · chime @${SCENE1.chime}`);
