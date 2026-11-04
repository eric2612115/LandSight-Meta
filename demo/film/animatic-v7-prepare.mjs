/**
 * Film v7 animatic: the voice and the ticks.
 *
 * - audio/v7-voice/line-NN.mp3: every line of Parts 1 and 2 in the narration voice
 *   (stability 0.65, similarity 0.9, style 0, speaker boost, mp3_44100_192), kept for the final if the lines stay; a
 *   line whose text already exists in public/audio/v7-eric (the Part 1 pass) is copied, not re-generated. The files
 *   are mirrored into public/audio/v7-voice for Remotion.
 * - public/gen/animatic-ticks.wav: a 1 kHz tick at each music cue point.
 * - public/data/animatic-v7.json: each line's measured length and its overrun past its window.
 *
 * SPEECH_API_KEY from the environment (never printed); 429s retried with backoff. node animatic-v7-prepare.mjs [--no-audio]
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RATE, mixInto, synth, writeWav} from './lib/wav.mjs';
import {ANIM} from './src/scenes/animatic-v7-cues.js';
import {V7} from './src/scenes/story-v7-cues.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUB = join(HERE, 'public');
const VOICE = join(HERE, 'audio', 'v7-voice');
const PUB_VOICE = join(PUB, 'audio', 'v7-voice');
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const args = new Set(process.argv.slice(2));
for (const d of [VOICE, PUB_VOICE, join(PUB, 'gen'), join(PUB, 'data')]) mkdirSync(d, {recursive: true});

const file = (n) => join(VOICE, `line-${String(n).padStart(2, '0')}.mp3`);
const KEY = process.env.SPEECH_API_KEY;
const API = (process.env.SPEECH_API_BASE || '').replace(/\/$/, '');
const HEADER = process.env.SPEECH_API_HEADER;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const voiceId = readFileSync(process.env.VOICE_ID_FILE, 'utf8').trim();

async function tts(text, out, label) {
  if (!KEY || !API || !HEADER) throw new Error(`SPEECH_API_KEY, SPEECH_API_BASE and SPEECH_API_HEADER are required (needed for ${label})`);
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_192`, {
      method: 'POST',
      headers: {[HEADER]: KEY, 'content-type': 'application/json', accept: 'audio/mpeg'},
      body: JSON.stringify({text, model_id: process.env.SPEECH_MODEL, voice_settings: {stability: 0.65, similarity_boost: 0.9, style: 0, use_speaker_boost: true}}),
    });
    if (res.ok) {
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      console.log(`  ${label} → audio/v7-voice/${out.split('/').pop()}`);
      return;
    }
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) {
      const wait = 2000 * 2 ** attempt;
      console.log(`  ${label}: HTTP ${res.status}, retry in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  throw new Error(`${label}: gave up after 6 attempts`);
}

if (!args.has('--no-audio')) {
  // the Part 1 pass already made some of these lines, word for word: copy those
  const earlier = new Map(V7.voice.map((v) => [v.text, join(PUB, 'audio', 'v7-eric', `line-${String(v.n).padStart(2, '0')}.mp3`)]));
  for (const v of ANIM.voice) {
    const out = file(v.n);
    if (existsSync(out)) continue;
    const prior = earlier.get(v.text);
    if (prior && existsSync(prior)) {
      copyFileSync(prior, out);
      console.log(`  line ${v.n}: copied from the Part 1 pass`);
      continue;
    }
    try {
      await tts(v.text, out, `line ${v.n}`);
    } catch (e) {
      const msg = String(e.message);
      if (/quota_exceeded/.test(msg)) {
        console.log(`  line ${v.n}: speech quota exhausted — this and the later lines are left silent (subtitled from the script): ${msg.match(/You have [^"]*required for this request/)?.[0] ?? ''}`);
        break;
      }
      throw e;
    }
  }
}
for (const v of ANIM.voice) if (existsSync(file(v.n))) copyFileSync(file(v.n), join(PUB_VOICE, `line-${String(v.n).padStart(2, '0')}.mp3`));

// the lengths and the overruns
const probe = (f) => Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], {encoding: 'utf8'}).trim());
const lines = ANIM.voice.map((v) => {
  const f = file(v.n);
  const seconds = existsSync(f) ? probe(f) : null;
  const overrun = seconds === null ? null : Math.max(0, +(v.at + seconds - v.until).toFixed(2));
  return {n: v.n, at: v.at, until: v.until, seconds, overrun, text: v.text};
});
for (const l of lines) if (l.overrun) console.log(`  line ${l.n} runs ${l.overrun}s past its window (${l.at} → ${l.until}, ${l.seconds.toFixed(2)}s): ${l.text}`);

// the ticks: 1 kHz, 60 ms, at each music cue
const bed = new Float32Array(Math.ceil(ANIM.duration * RATE));
const tick = synth(0.06, (t) => Math.sin(2 * Math.PI * 1000 * t) * 0.5);
for (const [at] of ANIM.music) mixInto(bed, tick, at, 1);
writeWav(join(PUB, 'gen', 'animatic-ticks.wav'), bed);

writeFileSync(join(PUB, 'data', 'animatic-v7.json'), JSON.stringify({lines, ticks: 'gen/animatic-ticks.wav'}, null, 1));
console.log(`public/data/animatic-v7.json: ${lines.filter((l) => l.seconds).length}/${lines.length} lines`);
