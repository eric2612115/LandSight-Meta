/**
 * Bundles the film once for a script run and hands its serveUrl to `fn`, then always deletes that bundle: after the
 * last render, on an error, on Ctrl-C or SIGTERM. Each bundle is a folder `remotion-webpack-bundle-*` in the system temp
 * dir holding a full copy of public/ (about 0.9 GB), so a script that skipped this left one such folder behind per run.
 *   await withBundle(async (serveUrl) => { ...renderStill({serveUrl, ...}) ... });
 */
import {bundle} from '@remotion/bundler';
import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'remotion-webpack-bundle-';

export async function withBundle(fn) {
  let dir = null;
  const remove = () => {
    // only ever the folder this bundle() made: directly in the temp dir, with the bundler's prefix
    if (dir && dirname(resolve(dir)) === resolve(tmpdir()) && basename(dir).startsWith(PREFIX)) rmSync(dir, {recursive: true, force: true});
    dir = null;
  };
  const onSignal = (signal) => {
    remove();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const serveUrl = await bundle({entryPoint: join(ROOT, 'src', 'index.ts'), publicDir: join(ROOT, 'public'), onDirectoryCreated: (d) => (dir = d)});
    return await fn(serveUrl);
  } finally {
    remove();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}
