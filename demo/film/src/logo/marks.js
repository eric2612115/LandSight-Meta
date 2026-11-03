/**
 * Landsight logo (SCRIPT-V11 note 13). The owner picked (b), the canopy: twelve short arcs whose gaps close as they go
 * round, resolving into one circle, the closing arc in cobalt, a plan-tree dot in the centre. (a) and (c) stay for
 * the record. Marks are drawn on a 32-unit grid in ink plus one cobalt; `b16` is the canopy for 16–32 px (six arcs,
 * wider gaps) so the gaps do not fill in. The wordmark is Inter 600 traced to one path
 * (wordmark.json, by scripts/trace-wordmark.py) — no live text in any file.
 */
import WORDMARK from './wordmark.json' with {type: 'json'};

export const THEMES = {
  light: {ink: '#1d2026', cobalt: '#2457ff', bg: '#f7f5f0'},
  dark: {ink: '#e8eaed', cobalt: '#6d8dff', bg: '#14161a'},
};

const r2 = (n) => Math.round(n * 1000) / 1000;
const arc = (cx, cy, r, a0, a1) => {
  const p = (a) => [r2(cx + r * Math.cos((a * Math.PI) / 180)), r2(cy + r * Math.sin((a * Math.PI) / 180))];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
/** n arcs round a circle; the gap after arc k falls from g0 to g1 degrees (the circle closes); the last arc cobalt. */
const canopy = ({ink, cobalt}, {n, r, stroke, g0, g1, dot}) => {
  const gaps = Array.from({length: n}, (_, k) => r2(g1 + (g0 - g1) * (1 - k / (n - 1)) ** 1.4));
  const each = (360 - gaps.reduce((a, b) => a + b, 0)) / n;
  let a = -105;
  const arcs = [];
  for (let k = 0; k < n; k++) {
    arcs.push(`<path d="${arc(16, 16, r, a, a + each)}" stroke="${k === n - 1 ? cobalt : ink}"/>`);
    a += each + gaps[k];
  }
  return `<g fill="none" stroke-width="${stroke}" stroke-linecap="butt">${arcs.join('')}</g><circle cx="16" cy="16" r="${dot}" fill="${ink}"/>`;
};

export const MARKS = {
  a: {
    name: 'sight',
    about: 'a plan-view tree inside four viewfinder corner brackets',
    body: ({ink, cobalt}) => {
      const o = 1.5;
      const L = 9;
      const corners = [`M${o} ${o + L}V${o}H${o + L}`, `M${32 - o - L} ${o}H${32 - o}V${o + L}`, `M${32 - o} ${32 - o - L}V${32 - o}H${32 - o - L}`, `M${o + L} ${32 - o}H${o}V${32 - o - L}`];
      return `<g fill="none" stroke="${cobalt}" stroke-width="3" stroke-linecap="square">${corners.map((d) => `<path d="${d}"/>`).join('')}</g><circle cx="16" cy="16" r="7.4" fill="none" stroke="${ink}" stroke-width="2.6"/><path d="M16 11.6V20.4M11.6 16H20.4" stroke="${ink}" stroke-width="2.2"/>`;
    },
  },
  b: {
    name: 'canopy',
    about: 'twelve short arcs closing into one circle, the closing arc in cobalt',
    body: (c) => canopy(c, {n: 12, r: 11.6, stroke: 3.6, g0: 13, g1: 0, dot: 2.6}),
  },
  b16: {
    name: 'canopy-small',
    about: 'the canopy for 16–32 px: six arcs, wider gaps, still closing',
    body: (c) => canopy(c, {n: 6, r: 11.6, stroke: 3.8, g0: 50, g1: 0, dot: 3.2}),
  },
  c: {
    name: 'callout',
    about: 'a plan-view tree with a drawing leader to a cobalt finding dot',
    body: ({ink, cobalt}) =>
      `<circle cx="12.4" cy="19.6" r="9.2" fill="none" stroke="${ink}" stroke-width="2.8"/><path d="M12.4 14V25.2M6.8 19.6H18" stroke="${ink}" stroke-width="2.2"/><path d="M18.9 13.1L23.4 8.6" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/><circle cx="25.6" cy="6.4" r="4.6" fill="${cobalt}"/>`,
  },
};

export const WORD = WORDMARK;

/** A standalone mark on the 32 grid (`px` sets width/height). */
export const markSvg = (key, theme, px) => {
  const c = THEMES[theme];
  const size = px ? ` width="${px}" height="${px}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"${size} role="img" aria-label="Landsight">${MARKS[key].body(c)}</svg>`;
};
/** The app's mark.svg: a 0 0 100 100 view box, ink as currentColor (frontend/src/components/Brand.tsx inlines it). */
export const appMarkSvg = (key) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="Landsight"><g transform="scale(3.125)">${MARKS[key].body({ink: 'currentColor', cobalt: THEMES.light.cobalt})}</g></svg>`;

/** Mark + traced wordmark: the mark 1.04 × the font size, centred on the cap height; the baseline shared. */
export const LOCKUP = (() => {
  const m = 104;
  const gap = 30;
  const pad = 4;
  const baseline = pad + Math.max(36 + m / 2, WORD.ascent);
  const h = Math.ceil(baseline + Math.max(m / 2 - 36, WORD.descent) + pad);
  const w = Math.ceil(pad + m + gap + WORD.width + pad);
  return {m, gap, pad, baseline, w, h};
})();
export const lockupSvg = (key, theme) => {
  const c = THEMES[theme];
  const L = LOCKUP;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.w} ${L.h}" width="${L.w}" height="${L.h}" role="img" aria-label="Landsight"><g transform="translate(${L.pad} ${r2(L.baseline - 36 - L.m / 2)}) scale(${r2(L.m / 32)})">${MARKS[key].body(c)}</g><path transform="translate(${L.pad + L.m + L.gap} ${r2(L.baseline)})" fill="${c.ink}" fill-rule="evenodd" d="${WORD.d}"/></svg>`;
};
