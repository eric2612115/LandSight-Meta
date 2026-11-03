/**
 * The Landsight logo. Traces the wordmark (Inter 600, loaded from Google Fonts as the film does) into a path
 * (scripts/trace-wordmark.py → src/logo/wordmark.json), then writes from src/logo/marks.js:
 *   public/v11/logo/       the three options, light and dark: mark and lockup as SVG and 1024 px transparent PNG
 *   public/v11/logo-options.png   the preview sheet: each option at 512, 64 and 16 px (the 16 px one also 4× unsmoothed)
 *   frontend/public/brand/ the picked mark (b): mark.svg (currentColor, for the app), mark-light/-dark, lockup-light/
 *                          -dark (.svg + 1024 px .png), favicon-32.png and apple-touch-icon.png (180 px)
 *
 *   node logo-v11.mjs [--no-trace]
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(HERE, 'public', 'v11', 'logo');
const BRAND = join(REPO, 'frontend', 'public', 'brand');
const SCRATCH = join(HERE, 'stills', 'logo-tmp');
mkdirSync(OUT, {recursive: true});
mkdirSync(SCRATCH, {recursive: true});
const FONT_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=block">';
const PICK = 'b';

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1200, height: 800}, deviceScaleFactor: 1});

// 1 · the wordmark, rendered big in Inter 600 and traced to a path
if (!process.argv.includes('--no-trace')) {
  const FPX = 1000;
  await page.setViewportSize({width: 5200, height: 1600});
  await page.setContent(`<html><head>${FONT_LINK}</head><body style="margin:0;background:#fff"><div id="box" style="display:inline-block;padding:0 40px;font-family:Inter;font-weight:600;font-size:${FPX}px;letter-spacing:${(-2.5 * FPX) / 100}px;line-height:1.3;color:#000"><span id="w">Landsight</span><span id="base" style="display:inline-block;width:0;height:0;vertical-align:baseline"></span></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const box = document.getElementById('box').getBoundingClientRect();
    const w = document.getElementById('w').getBoundingClientRect();
    const b = document.getElementById('base').getBoundingClientRect();
    return {x: box.x, y: box.y, w: box.width, h: box.height, ww: w.width, wx: w.x, base: b.y};
  });
  const png = join(SCRATCH, 'wordmark-1000.png');
  await page.screenshot({path: png, clip: {x: m.x, y: m.y, width: Math.ceil(m.w), height: Math.ceil(m.h)}});
  const metrics = join(SCRATCH, 'wordmark-1000.json');
  // x: the traced path starts at the box's left padding (40 px); the width is the glyph run less the last letter's tracking
  writeFileSync(metrics, JSON.stringify({font_px: FPX, width_px: m.ww + (2.5 * FPX) / 100, baseline_px: m.base - m.y, height_px: m.h, pad_px: m.wx - m.x}));
  execFileSync('uv', ['run', 'python', join(HERE, 'scripts', 'trace-wordmark.py'), png, metrics], {cwd: REPO, stdio: 'inherit'});
}
const {MARKS, THEMES, appMarkSvg, lockupSvg, markSvg} = await import(`./src/logo/marks.js?${Date.now()}`);

const shot = async (svg, w, h, file, bg) => {
  await page.setViewportSize({width: w, height: h});
  await page.setContent(`<html><head><style>html,body{margin:0;background:${bg ?? 'transparent'}}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`);
  await page.waitForTimeout(80);
  await page.screenshot({path: file, omitBackground: !bg, clip: {x: 0, y: 0, width: w, height: h}});
};
const dims = (svg) => svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);

// 2 · the options
for (const key of ['a', 'b', 'c']) {
  for (const theme of Object.keys(THEMES)) {
    const base = `landsight-${key}-${MARKS[key].name}-${theme}`;
    const mark = markSvg(key, theme);
    const lock = lockupSvg(key, theme);
    writeFileSync(join(OUT, `${base}-mark.svg`), mark + '\n');
    writeFileSync(join(OUT, `${base}-lockup.svg`), lock + '\n');
    await shot(mark, 1024, 1024, join(OUT, `${base}-mark-1024.png`));
    const [, , vw, vh] = dims(lock);
    await shot(lock, 1024, Math.round((1024 * vh) / vw), join(OUT, `${base}-lockup-1024.png`));
  }
}
for (const theme of Object.keys(THEMES)) writeFileSync(join(OUT, `landsight-b-canopy-${theme}-mark-small.svg`), markSvg('b16', theme) + '\n');

// 3 · the picked set for the app
mkdirSync(BRAND, {recursive: true});
writeFileSync(join(BRAND, 'mark.svg'), appMarkSvg(PICK) + '\n');
for (const theme of Object.keys(THEMES)) {
  const mark = markSvg(PICK, theme);
  const lock = lockupSvg(PICK, theme);
  writeFileSync(join(BRAND, `mark-${theme}.svg`), mark + '\n');
  writeFileSync(join(BRAND, `lockup-${theme}.svg`), lock + '\n');
  await shot(mark, 1024, 1024, join(BRAND, `mark-${theme}.png`));
  const [, , vw, vh] = dims(lock);
  await shot(lock, 1024, Math.round((1024 * vh) / vw), join(BRAND, `lockup-${theme}.png`));
}
const tile = (px, inset) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${px}" height="${px}"><rect width="32" height="32" rx="${px >= 64 ? 0 : 7}" fill="${THEMES.light.bg}"/><g transform="translate(${inset} ${inset}) scale(${(32 - 2 * inset) / 32})">${MARKS[px <= 32 ? 'b16' : PICK].body(THEMES.light)}</g></svg>`;
await shot(tile(32, 1.5), 32, 32, join(BRAND, 'favicon-32.png'));
await shot(tile(180, 4), 180, 180, join(BRAND, 'apple-touch-icon.png'), THEMES.light.bg);

// 4 · the preview sheet
const tiny = {};
for (const key of ['a', 'b', 'b16', 'c'])
  for (const theme of Object.keys(THEMES)) {
    const f = join(SCRATCH, `${key}-${theme}-16.png`);
    await shot(markSvg(key, theme), 16, 16, f);
    tiny[`${key}-${theme}`] = `data:image/png;base64,${readFileSync(f).toString('base64')}`;
  }
const small = (key) => (key === 'b' ? 'b16' : key);
const panel = (key, theme) => {
  const c = THEMES[theme];
  const lock = lockupSvg(key, theme).replace(/ width="\d+" height="\d+"/, ' style="height:64px;width:auto"');
  return `<div class="panel" style="background:${c.bg};color:${c.ink}">
    <div class="big">${markSvg(key, theme, 512)}</div>
    <div class="side">
      <div class="lbl">512 · 64 · 16 px${key === 'b' ? ' (16 px: the six-arc small cut)' : ''}</div>
      <div class="row">${markSvg(key, theme, 64)}<span style="width:28px"></span>${markSvg(small(key), theme, 16)}<span style="width:28px"></span><img src="${tiny[`${small(key)}-${theme}`]}" style="width:64px;height:64px;image-rendering:pixelated;outline:1px dashed ${c.ink}33"><span class="note">16 px ×4</span>${key === 'b' ? `<span style="width:28px"></span><img src="${tiny[`b-${theme}`]}" style="width:64px;height:64px;image-rendering:pixelated;opacity:.55"><span class="note">twelve arcs at 16 px</span>` : ''}</div>
      <div class="lock">${lock}</div>
      <div class="tab"><div class="fav">${markSvg(small(key), theme, 16)}</div><span>Landsight</span></div>
    </div>
  </div>`;
};
const W = 2360;
await page.setViewportSize({width: W, height: 2000});
await page.setContent(`<html><head>${FONT_LINK}<style>
  body{margin:0;background:#d9d9d6;font-family:Inter;width:${W}px}
  h1{font-size:40px;font-weight:600;margin:36px 48px 6px;color:#1d2026}
  .sub{font-size:22px;margin:0 48px 24px;color:#3a3f47}
  .opt{display:flex;gap:24px;margin:0 48px 28px;align-items:stretch}
  .tag{width:150px;font-size:56px;font-weight:600;color:#1d2026;padding-top:20px}
  .tag small{display:block;font-size:20px;font-weight:400;line-height:1.3;margin-top:10px;color:#3a3f47}
  .panel{display:flex;gap:40px;padding:36px;border-radius:18px;flex:1}
  .big svg{display:block}
  .side{display:flex;flex-direction:column;gap:30px;justify-content:center}
  .lbl{font-size:18px;opacity:.6}
  .row{display:flex;align-items:center}
  .row svg{display:block}
  .note{font-size:16px;opacity:.55;margin-left:10px}
  .tab{display:flex;align-items:center;gap:8px;font-size:13px;background:rgba(127,127,127,.18);border-radius:8px 8px 0 0;padding:8px 14px;width:200px}
  .fav svg{display:block}
</style></head><body>
<h1>Landsight — logo options · picked: (b)</h1>
<div class="sub">ink + one cobalt · each at 512, 64 and 16 px, light and dark · the wordmark is Inter 600 traced to a path</div>
${['a', 'b', 'c'].map((key) => `<div class="opt"><div class="tag">(${key})<small>${MARKS[key].name}<br>${MARKS[key].about}</small></div>${panel(key, 'light')}${panel(key, 'dark')}</div>`).join('')}
</body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const height = await page.evaluate(() => document.body.scrollHeight + 20);
await page.setViewportSize({width: W, height});
await page.screenshot({path: join(HERE, 'public', 'v11', 'logo-options.png'), fullPage: true});
await browser.close();
rmSync(SCRATCH, {recursive: true, force: true});
console.log('done:', OUT, BRAND);
