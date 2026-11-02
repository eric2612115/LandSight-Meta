/**
 * Scene 2, "The folder bursts" (9 s, 0:15–0:24 of the film): every fixed cue in seconds, shared by scene2-prepare.mjs
 * (the layout, the per-card times and the effects mix) and src/scenes/Scene2Folder.tsx (which draws them). The
 * per-card times (pour start, stamp, sink) depend on the layout and live in public/data/scene2.json.
 */

export const SCENE2 = {
  fps: 30,
  duration: 9,
  /** 0–1.5 s: the folder slides in from the left edge and tips; the paper slap is its rim hitting the field. */
  folder: {in: 0.0, settled: 1.0, tipStart: 1.05, slap: 1.38, fadeStart: 4.2, fadeEnd: 4.8, mouth: [540, 430]},
  /** 1.5–4 s: the cards pour, one every 50 ms in the Run's own order; a Geiger-like tick train underneath. */
  pour: {start: 1.5, step: 0.05, ticks: {from: 1.5, to: 3.55}},
  /** 4–6.6 s: one cobalt scan line, left to right; a card is stamped as the line crosses its centre. */
  sweep: {start: 4.0, end: 6.6, x0: -20, x1: 1940},
  /** The junk greys and falls this long after its stamp; the four bills stack this long after the last bill's stamp. */
  sink: {delay: 0.45, seconds: 0.9},
  stack: {delay: 0.3, seconds: 0.55},
  /** The two governing cards pulse once at the second caption. */
  pulse: 6.0,
  /** 7–9 s: the survivors converge and fold into the sheet. */
  converge: {start: 7.0, spread: 0.2},
  sheet: {start: 7.4, grown: 8.35, inkStart: 7.95, inkEnd: 8.5, width: 1400, hiss: 7.55},
  captions: [
    {text: '30 files. Every one gets a verdict.', at: 1.5, until: 5.5},
    {text: 'The one that governs is named.', at: 6.0, until: 8.2},
  ],
}
