/**
 * Film v9 animatic (demo/SCRIPT-V9.md): every time in seconds. Part 1 (0–90) is one three.js world (WorldV9.tsx)
 * with every card in screen space (AnimaticV9.tsx); Part 2 is the /try capture on its director cues, with the long
 * holds cut; then the close. No sound: timed subtitles at 155 wpm.
 */
import cues from './try-v9-cues.json' with {type: 'json'};

export const WPS = 155 / 60;
export const PART2_AT = 93;

/** The capture's clicks, in the director's order (seconds on the capture's clock). */
const clicks = cues.cues.filter((c) => c.name === 'click').map((c) => c.t);
export const CAP = {
  drop: clicks[0],
  continue: clicks[1],
  analyze: clicks[2],
  review: clicks[3],
  e08: clicks[4],
  e022: clicks[5],
  e01: clicks[6],
  confirm: clicks[7],
  e14: clicks[8],
  select1: clicks[9],
  select2: clicks[10],
  create: clicks[11],
  closeReport: clicks[12],
  ask: clicks[13],
  end: cues.duration_s,
};
/** The capture, with its two long holds cut: the Analyze wait and the report hold. [from, to] on the capture's clock. */
export const SEGMENTS = [
  [0, CAP.analyze + 5.0],
  [CAP.review - 0.3, CAP.create + 1.6],
  [CAP.closeReport - 0.3, CAP.end],
];
export const PART2_S = SEGMENTS.reduce((a, [f, t]) => a + (t - f), 0);
/** Capture time → film time (through the cuts); a time inside a cut lands at the cut. */
export function capToFilm(tc) {
  let acc = PART2_AT;
  for (const [f, t] of SEGMENTS) {
    if (tc < f) return acc;
    if (tc <= t) return acc + (tc - f);
    acc += t - f;
  }
  return acc;
}
export const CLOSE_AT = PART2_AT + PART2_S;
export const LOCKUP_AT = CLOSE_AT + 10.8;

export const V9 = {
  fps: 30,
  width: 1920,
  height: 1080,
  duration: Math.ceil(LOCKUP_AT + 2.5),

  live: {pain: {start: 0, end: 2.6, label: "LIVE · Eric's screen, red boxes"}},
  push: {pain: {from: 2.6, to: 7.0}, product: {from: 91.6, to: 93.0}},

  /** The three big type cards. */
  type: [
    {text: 'Two weeks → two minutes.', at: 90.0, until: 92.4},
    {text: '30 planted · 28 found · 2 flagged · 0 missed', at: CLOSE_AT + 0.4, until: LOCKUP_AT},
  ],

  /** Screen-space cards: dot red = send back, amber = fix before pricing, blue = building code, white = a line. */
  cards: [
    {at: 3.0, until: 7.5, dot: 'white', title: '30 files · 2 weeks · by hand', sub: 'one person, boxing errors on screen'},
    {at: 15.0, until: 21.0, dot: 'amber', title: 'One sheet, four floors. The bill priced one.', sub: 'L-103 · bill 38.4 m² of shrubs · drawing 153.6 (T01, T06)'},
    {at: 21.4, until: 26.0, dot: 'blue', title: 'Roof soil 0.3 m — the minimum is 0.4 m', sub: 'L-104 · orange jasmine not counted toward greening (T02)'},
    {at: 26.4, until: 31.0, dot: 'amber', title: 'Two sheets, one drawing, different titles', sub: 'L-102 and L-103 · 91% the same line work (T08)'},
    {at: 31.6, until: 34.4, dot: 'red', title: 'A planter over the lift shaft — send back', sub: 'L-102 · planter B-10, 7.5 m² · overlaps the shaft by 3.0 m² (T09)'},
    {at: 34.8, until: 38.2, dot: 'blue', title: 'Escape corridor 0.9 m — the code asks 1.2 m', sub: 'Art. 92 · 1.5 m between the walls, two planters leave 0.9 m · repeats on 8F, 12F, 16F, 20F (T10)'},
    {at: 38.2, until: 41.2, dot: 'white', title: 'Landsight stacks every floor and checks them against each other.', sub: ''},
    {at: 53.6, until: 56.4, dot: 'blue', title: 'Muse Spark: one tree, 95% — confirmed by you', sub: 'E01 · twelve LINE entities · counted only after Confirm'},
    {at: 56.4, until: 60.2, dot: 'amber', title: 'Billed 12 trees. Drawn 8.', sub: 'bill row 6 · Camphore tree, cal. 10 cm · 12 EA · $516 to query (E02.2)'},
    {at: 60.4, until: 63.8, dot: 'amber', title: 'Hedge: 182 plants, billed as 27 m', sub: 'DU H0.6 @0.3m o.c. DOUBLE ROW · bill row 7 (E17)'},
    {at: 64.0, until: 67.2, dot: 'amber', title: 'Pavers $10,856 over your price list', sub: 'bill row 11 · $117/m² · your list up to $71 · 236 m² (E20)'},
    {at: 68.0, until: 73.8, dot: 'blue', title: 'Tree pits on the slab: big trees count as small', sub: 'L-6 · 1.5 × 1.5 m pit · soil 1.0 m · on the basement slab (E12)'},
    {at: 74.0, until: 78.2, dot: 'blue', title: 'Greenery 209.9 / 297 — fix: +7 trees, or change one species', sub: 'E14 · 261.1 before the pit rule · +7 Camphor → 299.5 · one Bischofia → 341.1'},
  ],

  /** The findings on the frame (1:15–1:22), the developer's way. */
  findings: {
    at: 78.6,
    sendBack: ['A tree drawn outside the site (E08)', 'A planter over the lift shaft (T09)', 'A sheet on the index, not in the package (E29)', 'Title block 1:200, scale bar 1:100 (E16)', 'Two sheets alike, 91% (T08)'],
    fix: ['Billed 12 trees, drawn 8 · $516', 'Hedge billed 27 m, drawn 182 plants', 'Pavers 65% over your list · $10,856', 'Roof lawn 57% under your list (T07)'],
    code: ['Greenery 209.9 / 297 (E14)', 'Roof soil 0.3 m, minimum 0.4 m (T02)', 'Escape corridor 0.9 m, minimum 1.2 m (T10)'],
    total: '$17,788 to query',
  },

  /** The bridge: the pipeline, left to right. */
  pipeline: {at: 85.4, step: 0.55, nodes: ['Drop the folder', 'Muse Spark reads every sheet', 'Geometry and SAM 3.1 measure', 'The bill and the code are checked', 'You confirm', 'The change request']},

  /** The voice: `at` is the start, `pictureUntil` the end of the picture it sits on. */
  voice: [
    {n: 1, at: 0.3, pictureUntil: 8, text: 'This is how a landscape package gets checked today: thirty files, two weeks, one person, boxing errors by hand.'},
    {n: 2, at: 8.2, pictureUntil: 14, text: 'Because a building arrives as a stack of flat drawings — and the errors hide between the floors.'},
    {n: 3, at: 14.3, pictureUntil: 21, text: 'One sheet stands for four floors. The bill priced one — a hundred and fifteen square metres of shrubs missing.'},
    {n: 4, at: 21.3, pictureUntil: 26, text: 'On the roof, thirty centimetres of soil — the rule asks for forty.'},
    {n: 5, at: 26.3, pictureUntil: 31, text: 'Two sheets are the same drawing under different titles.'},
    {n: 5.1, at: 31.3, pictureUntil: 34.4, text: 'A planter sits over the lift shaft.'},
    {n: 5.2, at: 34.6, pictureUntil: 38.2, text: 'And on four floors, planters squeeze the escape corridor below the code.'},
    {n: 6, at: 38.3, pictureUntil: 41, text: 'Landsight stacks every floor and checks them against each other.'},
    {n: 7, at: 41.3, pictureUntil: 46, text: 'Down on the ground, the planting plan shows a row of trees.'},
    {n: 8, at: 46.3, pictureUntil: 53, text: 'You see a tree. A computer sees twelve loose lines — no tree at all.'},
    {n: 9, at: 53.3, pictureUntil: 56, text: 'Muse Spark reads it as one tree, and asks you before it counts it.'},
    {n: 10, at: 58.8, pictureUntil: 67, text: 'The bill charges for twelve trees; the drawing has eight. A hedge priced by the metre, not by the plant. Pavers, ten thousand over your own list.'},
    {n: 11, at: 67.3, pictureUntil: 78, text: 'On a concrete slab, a small pit makes a big tree count as small — the greenery falls short of the code. Landsight finds the fix that works.'},
    {n: 12, at: 78.3, pictureUntil: 85, text: "A developer told us: nonsense goes straight back; the rest, flag one by one. That's what you get."},
    {n: 13, at: 85.3, pictureUntil: 93, text: 'Drop the folder. Muse Spark reads every sheet, SAM 3.1 measures, Landsight checks the bill and the code — two weeks, in about two minutes.'},
    {n: 14, at: capToFilm(CAP.drop), pictureUntil: capToFilm(CAP.continue), text: 'Drop the folder as it came — backups, scans, four versions of the bill. Every file gets a verdict, and the one that governs is named.'},
    {n: 15, at: capToFilm(CAP.continue) + 2.6, pictureUntil: capToFilm(CAP.analyze), text: 'It reads the project off the title block. Pick what to check, and analyze.'},
    {n: 16, at: capToFilm(CAP.analyze) + 0.2, pictureUntil: capToFilm(CAP.review), text: 'Muse Spark reads every sheet and document, SAM 3.1 measures the colour plans, and the geometry does the counting.'},
    {n: 17, at: capToFilm(CAP.review) + 0.2, pictureUntil: capToFilm(CAP.confirm), text: "On the right, the developer's way: what to send back, what to fix before pricing, what the code says. Every item opens on the drawing with its evidence — and nothing counts until you confirm it."},
    {n: 18, at: capToFilm(CAP.e14) + 0.1, pictureUntil: capToFilm(CAP.select1), text: 'Short on greenery? It shows the fixes that pass.'},
    {n: 19, at: capToFilm(CAP.select1) + 0.1, pictureUntil: capToFilm(CAP.closeReport), text: 'Pick what goes back to the developer — and it writes the change request: every point clouded on the drawing, numbered and priced, ready to send.'},
    {n: 20, at: capToFilm(CAP.ask) + 0.1, pictureUntil: CLOSE_AT, text: "Point at anything and tell it what you think. It answers from the package — even when you're wrong — and marks the drawing with the right question."},
    {n: 21, at: CLOSE_AT + 0.3, pictureUntil: LOCKUP_AT, text: 'We hid thirty errors in a package. It found twenty-eight, flagged two for a person, and missed none. Every number traces back to the drawing.'},
  ],
};

export const wordCount = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
export const timed = () =>
  V9.voice.map((v) => {
    const s = wordCount(v.text) / WPS;
    return {...v, seconds: s, end: v.at + s, overrun: Math.max(0, +(v.at + s - v.pictureUntil).toFixed(1))};
  });
