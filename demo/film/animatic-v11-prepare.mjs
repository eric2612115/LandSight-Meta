/**
 * Stages what animatic v11 reads (render with --gl=angle after this):
 *   public/v11/try.mp4            the /try capture (captures/try-4k60.mp4, or --capture <file>) at 1080p30 for the
 *                                 animatic; src/scenes/try-v11-cues.json its cues (captures/try-cues.json or --cues)
 *   public/v11/sheets/*.png       are rendered from the samples by scripts/stage-v11-sheets.py (the repo's renderers)
 *   src/scenes/footprint-v11.json the tower's footprint on L-1: public/v11/footprint.json when it exists, else a
 *                                 placeholder north of the landscape on the same paper
 *   src/scenes/sam-v11.json       is written by scripts/sam-v11-prepare.py (run it from the repo root with uv)
 *
 *   node animatic-v11-prepare.mjs [--capture captures/try-4k60.mp4] [--cues captures/try-cues.json] [--force]
 *   (then, from the repo root: uv run python demo/film/scripts/stage-v11-sheets.py and scripts/sam-v11-prepare.py)
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? dflt : args[i + 1];
};
const FORCE = args.includes('--force');
const V11 = join(HERE, 'public', 'v11');
mkdirSync(V11, {recursive: true});

// 1 · the capture and its cues
const capture = join(HERE, opt('capture', 'captures/try-4k60.mp4'));
const cues = join(HERE, opt('cues', 'captures/try-cues.json'));
const tryOut = join(V11, 'try.mp4');
if (FORCE || !existsSync(tryOut) || statSync(capture).mtimeMs > statSync(tryOut).mtimeMs) {
  console.log('capture →', tryOut);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', capture, '-vf', 'scale=1920:1080:flags=lanczos,fps=30', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-g', '15', '-pix_fmt', 'yuv420p', '-an', tryOut], {stdio: 'inherit'});
}
writeFileSync(join(HERE, 'src', 'scenes', 'try-v11-cues.json'), JSON.stringify(JSON.parse(readFileSync(cues, 'utf8')), null, 1) + '\n');

// 2 · the footprint
const fpSrc = join(V11, 'footprint.json');
const fpDst = join(HERE, 'src', 'scenes', 'footprint-v11.json');
if (existsSync(fpSrc)) {
  copyFileSync(fpSrc, fpDst);
  console.log('footprint ← public/v11/footprint.json');
} else {
  // PLACEHOLDER until footprint.json lands: WorldV11 draws the footprint north of the landscape on a continued paper
  writeFileSync(fpDst, JSON.stringify({placeholder: true}, null, 1) + '\n');
  console.log('footprint: placeholder (public/v11/footprint.json not there yet)');
}
