/**
 * Film v10 animatic: every time in seconds. The opening is Eric (three grey slots, 0–14), the push through his
 * monitor (14–15), then one three.js world (WorldV10.tsx) with every card in screen space (AnimaticV10.tsx) — each
 * problem shown, then its fix; the bridge is an object match (the sheets fly into a folder that becomes the folder
 * the cursor drags on /try); Part 2 is the /try capture with its holds cut; then the close. No sound: timed subtitles
 * at 155 wpm, each at its beat; the later line takes the screen.
 */
import cues from './try-v9-cues.json' with {type: 'json'};

export const WPS = 155 / 60;
export const PART2_AT = 98.5;

const clicks = cues.cues.filter((c) => c.name === 'click').map((c) => c.t);
export const CAP = {drop: clicks[0], continue: clicks[1], analyze: clicks[2], review: clicks[3], e08: clicks[4], e022: clicks[5], e01: clicks[6], confirm: clicks[7], e14: clicks[8], select1: clicks[9], select2: clicks[10], create: clicks[11], closeReport: clicks[12], ask: clicks[13], end: cues.duration_s};
/** The capture with its holds cut (the Choose hold, the Analyze wait, the E01 hold before Confirm, the report hold, the tail). */
export const SEGMENTS = [
  [0, CAP.continue + 3.2],
  [CAP.analyze - 0.4, CAP.analyze + 2.2],
  [CAP.review - 0.3, CAP.e08 + 2.6],
  [CAP.e022 - 0.3, CAP.e01 + 2.4],
  [CAP.confirm - 0.6, CAP.confirm + 1.6],
  [CAP.e14 - 0.3, CAP.create + 0.6],
  [CAP.closeReport - 0.3, 81.5],
];
export const PART2_S = SEGMENTS.reduce((a, [f, t]) => a + (t - f), 0);
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

export const V10 = {
  fps: 30,
  width: 1920,
  height: 1080,
  duration: Math.ceil(LOCKUP_AT + 2.0),

  /** The opening: Eric, three grey slots with one label each; then the push through his monitor. */
  opening: [
    {start: 0, end: 3, label: 'LIVE · Eric to camera'},
    {start: 3, end: 10, label: 'LIVE · his screen, drawings tiled, red boxes'},
    {start: 10, end: 14, label: 'LIVE · Eric to camera'},
  ],
  push: {from: 14.0, to: 15.0},

  /** The beats of the world (starts), for the record and the overlay. */
  beats: {
    stack: 15, drawer103: 20, roof: 26, alike: 31, lift: 35.5, corridor: 40.5, close: 47.5, ground: 49.5, turn: 54.5, tree: 56.5, raster: 65.6, bills: 74.6, pit: 82.5, findings: 91, bridge: 95.5,
  },

  type: [
    {text: 'Two weeks → two minutes.', at: 96.2, until: 98.5},
    {text: '30 planted · 28 found · 2 flagged · 0 missed', at: CLOSE_AT + 0.4, until: LOCKUP_AT},
  ],

  /** Screen-space cards: the problem, then its fix (a small green card under it). */
  cards: [
    {at: 21.0, until: 26.0, dot: 'amber', title: 'One sheet, four floors. The bill priced one.', sub: 'L-103 · bill 38.4 m² of shrubs · drawing 153.6 (T01, T06)', fix: {at: 24.0, text: 'fixed · typ. floor × 1 → × 4 · 153.6 m² priced'}},
    {at: 26.4, until: 31.0, dot: 'blue', title: 'Roof soil 0.3 m — the minimum is 0.4 m', sub: 'L-104 · orange jasmine not counted toward greening (T02)', fix: {at: 29.2, text: 'fixed · soil 0.3 → 0.4 m · 35 m² counted again'}},
    {at: 31.4, until: 35.5, dot: 'amber', title: 'Two sheets, one drawing, different titles', sub: 'L-102 and L-103 · 91% the same line work (T08)', fix: {at: 34.0, text: 'resolved · two floors confirmed, each priced once'}},
    {at: 36.0, until: 40.5, dot: 'red', title: 'A planter over the lift shaft — send back', sub: 'L-102 · planter B-10, 7.5 m² · overlaps the shaft by 3.0 m² (T09)', fix: {at: 39.0, text: 'sent back to the designer · the planter moves off the core'}},
    {at: 41.0, until: 47.5, dot: 'blue', title: 'Escape corridor 0.9 m — the code asks 1.2 m', sub: 'Art. 92 · 1.5 m between the walls, two planters leave 0.9 m · repeats on 8F, 12F, 16F, 20F (T10)', fix: {at: 46.2, text: 'fixed · planters moved to the walls · the corridor opens to 1.5 m'}},
    {at: 48.0, until: 49.6, dot: 'white', title: 'Landsight stacks every floor and checks them against each other.', sub: ''},
    {at: 64.0, until: 65.6, dot: 'blue', title: 'One tree, 95% — confirmed by you', sub: 'E01 · twelve LINE entities · the model asks before it counts'},
    {at: 72.6, until: 74.6, dot: 'blue', title: 'SAM 3.1: lawn 195 m² from the picture · 200 m² in the drawings', sub: 'Muse Spark wrote the prompts from the legend · no CAD needed · azalea 146 vs 150 · 11 of 11 Camphor (C-45–C-48)'},
    {at: 74.6, until: 77.3, dot: 'amber', title: 'Billed 12 trees. Drawn 8.', sub: 'bill row 6 · Camphore tree, cal. 10 cm · 12 EA (E02.2)', fix: {at: 76.4, text: 'fixed · row 6 corrected 12 → 8 · $516 off the bill'}},
    {at: 77.4, until: 80.1, dot: 'amber', title: 'Hedge: 182 plants, billed as 27 m', sub: 'DU H0.6 @0.3m o.c. DOUBLE ROW · bill row 7 (E17)', fix: {at: 79.2, text: 'fixed · repriced per plant · 182 plants'}},
    {at: 80.2, until: 82.6, dot: 'amber', title: 'Pavers $10,856 over your price list', sub: 'bill row 11 · $117/m² · your list up to $71 · 236 m² (E20)', fix: {at: 81.8, text: 'fixed · repriced at your list · $71/m²'}},
    {at: 84.0, until: 88.6, dot: 'blue', title: 'On a slab, a big tree counts as a small one', sub: 'pit 1.5 × 1.5 m on a concrete slab · Gi 1.5 → 1.0 (E12) · greenery 209.9 under 297.0 (E14)', fix: {at: 89.2, text: 'fixed · +7 trees → 299.5 · or one species swap → 341.1 · pass'}},
  ],

  findings: {
    at: 91.4,
    sendBack: ['A tree drawn outside the site (E08)', 'A planter over the lift shaft (T09)', 'A sheet on the index, not in the package (E29)', 'Title block 1:200, scale bar 1:100 (E16)', 'Two sheets alike, 91% (T08)'],
    fix: ['Billed 12 trees, drawn 8 · $516', 'Hedge billed 27 m, drawn 182 plants', 'Pavers 65% over your list · $10,856', 'Roof lawn 57% under your list (T07)'],
    code: ['Greenery 209.9 / 297 (E14)', 'Roof soil 0.3 m, minimum 0.4 m (T02)', 'Escape corridor 0.9 m, minimum 1.2 m (T10)'],
    total: '$17,788 to query',
  },

  /** The folder match: where the capture's drag chip sits at its first frames (1080p px). */
  folderTarget: {x: 1040, y: 590, w: 220, h: 44},

  /** The voice: `at` is the beat it belongs to; the subtitle queue starts it there or when the previous line ends. */
  voice: [
    {n: 1, at: 0.3, pictureUntil: 3, who: 'Eric', text: 'Every building gets approved on drawings like these.'},
    {n: 2, at: 3.3, pictureUntil: 10, who: 'Eric', text: 'A landscape package is thirty files — and checking it by hand takes about two weeks.'},
    {n: 3, at: 10.3, pictureUntil: 14, who: 'Eric', text: "I'm Eric. I built Landsight to do it in two minutes."},
    {n: 4, at: 15.2, pictureUntil: 20, text: 'Because a building arrives as a stack of flat drawings — and the errors hide between the floors.'},
    {n: 5, at: 20.3, pictureUntil: 26, text: 'One sheet stands for four floors. The bill priced one — a hundred and fifteen square metres of shrubs missing.'},
    {n: 6, at: 26.3, pictureUntil: 31, text: 'On the roof, thirty centimetres of soil — the rule asks for forty.'},
    {n: 7, at: 31.3, pictureUntil: 35.5, text: 'Two sheets are the same drawing under different titles.'},
    {n: 8, at: 35.8, pictureUntil: 40.5, text: 'On the podium, a planter sits on top of the lift shaft — it goes back to the designer.'},
    {n: 9, at: 40.8, pictureUntil: 47.5, text: 'On four floors, planters squeeze the escape corridor to ninety centimetres; the code asks for one-twenty. Move them, and it opens.'},
    {n: 10, at: 47.8, pictureUntil: 49.5, text: 'Landsight stacks every floor and checks them against each other.'},
    {n: 11, at: 50.3, pictureUntil: 54.5, text: 'Down on the ground, the planting plan shows a row of trees.'},
    {n: 12, at: 57.3, pictureUntil: 63.5, text: 'You see a tree. A computer sees twelve loose lines — no tree at all.'},
    {n: 13, at: 63.6, pictureUntil: 65.6, text: 'Muse Spark reads it as one tree, and asks you before it counts it.'},
    {n: 13.5, at: 65.8, pictureUntil: 74.6, text: 'Sometimes all you get is a coloured picture. Muse Spark reads its legend; SAM 3.1 finds every patch — lawn, a hundred and ninety-five square metres; the drawings say two hundred.'},
    {n: 14, at: 74.8, pictureUntil: 82.5, text: 'The bill charges for twelve trees; the drawing has eight. A hedge priced by the metre, not by the plant. Pavers, ten thousand over your own list.'},
    {n: 15, at: 83.3, pictureUntil: 91, text: 'On the concrete slab the pits are too small, so each big tree counts as a small one — and the greenery falls short. Seven more trees, or one species swap, and it passes.'},
    {n: 16, at: 91.6, pictureUntil: 95.5, text: "A developer told us: nonsense goes straight back; the rest, flag one by one. That's what you get."},
    {n: 17, at: 97.2, pictureUntil: PART2_AT, text: 'Now drop the folder in.'},
    {n: 18, at: capToFilm(CAP.drop), pictureUntil: capToFilm(CAP.continue), text: 'Drop the folder as it came — backups, scans, four versions of the bill. Every file gets a verdict, and the one that governs is named.'},
    {n: 19, at: capToFilm(CAP.continue) + 0.6, pictureUntil: capToFilm(CAP.analyze), text: 'It reads the project off the title block. Pick what to check, and analyze.'},
    {n: 20, at: capToFilm(CAP.analyze) + 0.2, pictureUntil: capToFilm(CAP.review), text: 'Muse Spark reads every sheet and document, SAM 3.1 measures the colour plans, and the geometry does the counting.'},
    {n: 21, at: capToFilm(CAP.review) + 0.2, pictureUntil: capToFilm(CAP.confirm), text: "On the right, the developer's way: what to send back, what to fix before pricing, what the code says. Every item opens on the drawing with its evidence — and nothing counts until you confirm it."},
    {n: 22, at: capToFilm(CAP.e14) + 0.1, pictureUntil: capToFilm(CAP.select1), text: 'Short on greenery? It shows the fixes that pass.'},
    {n: 23, at: capToFilm(CAP.select1) + 0.1, pictureUntil: capToFilm(CAP.closeReport), text: 'Pick what goes back to the developer — and it writes the change request: every point clouded on the drawing, numbered and priced, ready to send.'},
    {n: 24, at: capToFilm(CAP.ask) + 0.1, pictureUntil: CLOSE_AT, text: "Point at anything and tell it what you think. It answers from the package — even when you're wrong — and marks the drawing with the right question."},
    {n: 25, at: CLOSE_AT + 0.3, pictureUntil: LOCKUP_AT, text: 'We hid thirty errors in a package. It found twenty-eight, flagged two for a person, and missed none. Every number traces back to the drawing.'},
  ],
};

export const wordCount = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
/** Each line starts at its beat; on screen the later line takes over (one line at a time), so a line cut short is one that overran. `overrun` is how far it runs past its picture, `clipped` how much the next line cuts off. */
export const timed = () =>
  V10.voice.map((v, i, all) => {
    const s = wordCount(v.text) / WPS;
    const next = all[i + 1];
    return {...v, start: v.at, seconds: s, end: v.at + s, overrun: Math.max(0, +(v.at + s - v.pictureUntil).toFixed(1)), clipped: next ? Math.max(0, +(v.at + s - next.at).toFixed(1)) : 0};
  });
