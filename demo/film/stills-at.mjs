/**
 * Renders single frames of a composition at the given times (one bundle, many stills), for looking at a beat
 * without a full render:  node stills-at.mjs <Composition> <outDir> <t1> <t2> ...   (seconds; render with angle)
 */
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [id, out, ...times] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
const serveUrl = await bundle({entryPoint: join(HERE, 'src', 'index.ts'), publicDir: join(HERE, 'public')});
const composition = await selectComposition({serveUrl, id, chromiumOptions: {gl: 'angle'}});
for (const s of times) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
  const output = join(out, `${String(s).padStart(6, '0')}.png`);
  await renderStill({serveUrl, composition, frame, output, chromiumOptions: {gl: 'angle'}, scale: Number(process.env.SCALE ?? 0.5)});
  console.log(output);
}
