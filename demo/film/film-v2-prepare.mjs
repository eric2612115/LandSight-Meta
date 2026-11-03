/**
 * Stages what the v2 film (FilmV2.tsx) reads into public/v2 (render with --gl=angle after this):
 *   live/A.mp4, live/B.mp4      Eric's footage, graded and with the brand marks on his monitors hidden
 *                                (live/work/*-graded.mp4 from scripts/live-lut.py + scripts/live-prep.py), 4K at 29.97
 *   live/A-1080.mp4, B-1080.mp4  the same at 1080p for the review cut
 *   live/A-last.png              the screen shot's last frame (4K), its menu bar text blurred (scripts/live-menubar.py):
 *                                the push into the monitor warps it
 *   audio/eric.wav               Eric's own voice: B-cut audio → ElevenLabs Audio Isolation → light EQ → −16 LUFS
 *                                (audio/eric-live/b-voice.wav)
 *   try.mp4, try-1080.mp4        the /try capture (captures/try-4k60.mp4) and its 1080p60 proxy;
 *                                src/scenes/try-v2-cues.json its cues (captures/try-cues.json)
 *   logo-lockup-dark.svg         the logo (b), from frontend/public/brand
 *   sheets/, l6-border.json      from scripts/stage-v2-sheets.py (run it from the repo root with uv)
 *
 *   node film-v2-prepare.mjs [--force]
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const FORCE = process.argv.includes('--force');
const V2 = join(HERE, 'public', 'v2');
for (const d of ['live', 'audio']) mkdirSync(join(V2, d), {recursive: true});

const stale = (src, dst) => FORCE || !existsSync(dst) || statSync(src).mtimeMs > statSync(dst).mtimeMs;
const copy = (src, dst) => {
  if (stale(src, dst)) (copyFileSync(src, dst), console.log('→', dst));
};
const proxy = (src, dst, args) => {
  if (!stale(src, dst)) return;
  console.log('proxy →', dst);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src, ...args, '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-g', '10', '-pix_fmt', 'yuv420p', '-an', dst], {stdio: 'inherit'});
};

for (const k of ['A', 'B']) {
  const src = join(HERE, 'live', 'work', `${k}-graded.mp4`);
  copy(src, join(V2, 'live', `${k}.mp4`));
  proxy(src, join(V2, 'live', `${k}-1080.mp4`), ['-vf', 'scale=1920:1080:flags=lanczos', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709']);
}
{
  // the menu bar (system language) blurred out of the frame the push enlarges
  const src = join(HERE, 'live', 'work', 'A-last.png');
  const dst = join(V2, 'live', 'A-last.png');
  if (stale(src, dst)) execFileSync('uv', ['run', 'python', join(HERE, 'scripts', 'live-menubar.py'), src, dst], {cwd: REPO, stdio: 'inherit'});
}
copy(join(HERE, 'audio', 'eric-live', 'b-voice.wav'), join(V2, 'audio', 'eric.wav'));
const cap = join(HERE, 'captures', 'try-4k60.mp4');
copy(cap, join(V2, 'try.mp4'));
proxy(cap, join(V2, 'try-1080.mp4'), ['-vf', 'scale=1920:1080:flags=lanczos']);
writeFileSync(join(HERE, 'src', 'scenes', 'try-v2-cues.json'), JSON.stringify(JSON.parse(readFileSync(join(HERE, 'captures', 'try-cues.json'), 'utf8')), null, 1) + '\n');
copy(join(REPO, 'frontend', 'public', 'brand', 'lockup-dark.svg'), join(V2, 'logo-lockup-dark.svg'));
if (!existsSync(join(V2, 'l6-border.json'))) console.warn('missing public/v2/l6-border.json: run uv run python demo/film/scripts/stage-v2-sheets.py');
else copyFileSync(join(V2, 'l6-border.json'), join(HERE, 'src', 'scenes', 'l6-border.json'));
