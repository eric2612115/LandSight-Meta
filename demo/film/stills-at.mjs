/**
 * Renders single frames of a composition at the given times (one bundle, many stills), for looking at a beat
 * without a full render:  node stills-at.mjs <Composition> <outDir> <t1> <t2> ...   (seconds; render with angle)
 */
import {renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {withBundle} from './lib/temp-bundle.mjs';

const [id, out, ...times] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
// one bundle for every time, deleted again when the run ends (lib/temp-bundle.mjs)
await withBundle(async (serveUrl) => {
  const composition = await selectComposition({serveUrl, id, chromiumOptions: {gl: 'angle'}});
  for (const s of times) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
    const output = join(out, `${String(s).padStart(6, '0')}.png`);
    await renderStill({serveUrl, composition, frame, output, chromiumOptions: {gl: 'angle'}, scale: Number(process.env.SCALE ?? 0.5)});
    console.log(output);
  }
});
