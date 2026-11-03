/**
 * Renders single frames of a composition for several looks at the given times (one bundle, one browser), for
 * comparing styles without a full render (the bundle is deleted when the run ends):
 *   node stills-v5.mjs <Composition> <outDir> <styles|-> <t1> <t2> ...
 * `styles` is a comma list passed as the `look` prop (or `-` for none); output <outDir>/<look>-<t>.png.
 * SCALE (default 1) sets the output scale; the 3D renders with angle as in the film renders.
 */
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {withBundle} from './lib/temp-bundle.mjs';

const [id, out, styles, ...times] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
const chromiumOptions = {gl: 'angle'};
// one bundle for every look and time, deleted again when the run ends (lib/temp-bundle.mjs)
await withBundle(async (serveUrl) => {
  const browser = await openBrowser('chrome', {chromiumOptions});
  try {
    for (const look of styles === '-' ? [null] : styles.split(',')) {
      const inputProps = look ? {look} : {};
      const composition = await selectComposition({serveUrl, id, inputProps, chromiumOptions, puppeteerInstance: browser});
      for (const s of times) {
        const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
        const output = join(out, `${look ?? id}-${s}.png`);
        const t0 = Date.now();
        await renderStill({serveUrl, composition, frame, output, inputProps, chromiumOptions, puppeteerInstance: browser, scale: Number(process.env.SCALE ?? 1), timeoutInMilliseconds: 120000});
        console.log(output, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }
    }
  } finally {
    await browser.close({silent: true});
  }
});
