/**
 * Film v11 animatic (demo/SCRIPT-V11.md): every time in seconds. Eric opens (three grey slots, 0–14); the camera
 * pushes into his monitor until L-101 fills the frame, holds, and pulls back into one three.js world (WorldV11.tsx)
 * where the sheets stack into the tower on L-1's footprint; every problem is shown, then fixed; the SAM 3.1 beat is a
 * calm plan-and-list; Part 1 ends on black with "Two weeks → two minutes." and a hard cut into the /try capture
 * (its holds cut, timed from its cues file); the end is the project at dusk with four bullets, the line and the logo.
 * No sound: timed subtitles at 155 wpm, each at its beat; the later line takes the screen.
 */
import cues from './try-v11-cues.json' with {type: 'json'};

export const WPS = 155 / 60;

/** Part 1: the starts of the beats. */
export const B = {
  push: 14.0, land: 15.0, pull: 15.3, drawer103: 21.4, roof: 27.4, alike: 32.2, lift: 35.1, corridor: 39.3, ground: 45.6,
  tree: 48.6, confirm: 52.8, raster: 57.4, bills: 65.8, hedge: 68.8, pavers: 74.2, pit: 77.6, findings: 87.0, type: 92.6,
};
export const PART2_AT = 94.1;

/**
 * Part 2: the capture's clicks by name, in order (the director's cue file has only `click` cues). A capture with more
 * moments (the price-list chip, the reply-email panel) adds its names here; the segments and the lines follow.
 */
export const CLICK_NAMES = ['drop', 'continue', 'analyze', 'review', 'e08', 'e022', 'e01', 'confirm', 'e14', 'select1', 'select2', 'create', 'closeReport', 'ask', 'input', 'send', 'mark'];
const clicks = cues.cues.filter((c) => c.name === 'click').map((c) => c.t);
export const CAP = Object.fromEntries(CLICK_NAMES.map((n, i) => [n, clicks[i]]));
CAP.end = cues.duration_s;
/** The capture with its holds cut: [from, to] in capture seconds. */
export const SEGMENTS = [
  [CAP.drop - 0.5, CAP.analyze + 5.4],
  [CAP.review - 0.3, CAP.e08 + 2.0],
  [CAP.e022 - 0.3, CAP.e01 + 1.6],
  [CAP.confirm - 0.5, CAP.confirm + 1.3],
  [CAP.e14 - 0.2, CAP.e14 + 3.7],
  [CAP.select1 - 0.3, CAP.create + 2.6],
  [CAP.ask - 0.2, CAP.ask + 8.0],
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
/** Film time → capture time (null between segments never happens: the segments butt). */
export function filmToCap(t) {
  let acc = PART2_AT;
  for (const [f, to] of SEGMENTS) {
    const d = to - f;
    if (t < acc + d) return f + (t - acc);
    acc += d;
  }
  return SEGMENTS[SEGMENTS.length - 1][1];
}
/**
 * The capture still shows the old project line on the Choose screen (the location row); until the new capture lands
 * it is covered with the panel's colour. Rects in 1080p px at the panel's two zoom states; the zoom eases between.
 */
export const COVER = {
  colour: '#11151b',
  from: CAP.continue, to: CAP.analyze,
  plain: [340, 302, 190, 42],
  zoomed: [488, 436, 262, 56],
  zoomIn: [11.66, 12.2], zoomOut: [13.42, 13.95],
};
export const CLOSE_AT = PART2_AT + PART2_S;
export const END = {
  bullets: [
    {at: 0.3, text: 'Reads every sheet, bill and PDF', by: 'Muse Spark 1.3'},
    {at: 1.0, text: 'Measures colour plans', by: 'SAM 3.1'},
    {at: 1.7, text: 'Checks quantities, prices and the building code', by: ''},
    {at: 2.4, text: '30 planted errors: 28 found · 2 flagged · 0 missed', by: ''},
  ],
  line: 4.3,
  logo: 6.9,
  hold: 3.6,
};
export const LOGO_AT = CLOSE_AT + END.logo;

export const V11 = {
  fps: 30,
  width: 1920,
  height: 1080,
  duration: Math.ceil((LOGO_AT + END.hold) * 30) / 30,

  /** The opening: Eric, three grey slots with one label each; the push through his monitor onto L-101. */
  opening: [
    {start: 0, end: 3, label: 'LIVE · Eric to camera'},
    {start: 3, end: 10, label: 'LIVE · his screen: drawings tiled, red boxes; ends on L-101 full-screen'},
    {start: 10, end: 14, label: 'LIVE · Eric to camera'},
  ],

  /** Screen-space cards: the problem, then its fix (a green card under it). */
  cards: [
    {at: 21.6, until: 27.2, dot: 'amber', title: 'One sheet, four floors. The bill priced one.', sub: 'L-103 · typical floor 8F · bill 38.4 m² of shrubs (T01, T06)', fix: {at: 25.4, text: 'fixed · typical floor × 4 · 153.6 m² priced'}},
    {at: 27.6, until: 31.8, dot: 'blue', title: 'Roof soil 0.3 m — the minimum is 0.4 m', sub: 'L-104 · orange jasmine not counted toward greening (T02)', fix: {at: 30.2, text: 'fixed · soil 0.3 → 0.4 m · 35 m² counted again'}},
    {at: 32.4, until: 35.0, dot: 'amber', title: 'Two sheets, one drawing, different titles', sub: 'L-102 and L-103 · 91% the same line work (T08)', fix: {at: 34.0, text: 'resolved · two floors confirmed, each priced once'}},
    {at: 35.3, until: 39.2, dot: 'red', title: 'A planter over the lift shaft — send back', sub: 'L-102 · planter B-10, 7.5 m² · 3.0 m² over the shaft (T09)', fix: {at: 37.9, text: 'sent back · the planter moves off the core'}},
    {at: 39.5, until: 45.5, dot: 'blue', title: 'Escape corridor 0.9 m — the code asks 1.2 m', sub: 'local building code, Art. 92 · on 8F, 12F, 16F, 20F (T10)', fix: {at: 43.6, text: 'fixed · planters into the wall line · 1.5 m clear'}},
    {at: 54.0, until: 57.3, dot: 'blue', title: 'Muse Spark: one tree, 95%', sub: 'twelve LINE entities · it asks before it counts (E01)'},
    {at: 66.0, until: 68.7, dot: 'amber', title: 'Billed 12 trees. Drawn 8.', sub: 'bill row 6 · Camphor tree, cal. 10 cm (E02.2)', fix: {at: 67.6, text: 'fixed · row 6: 12 → 8 · $516 off the bill'}},
    {at: 74.4, until: 77.5, dot: 'amber', title: 'Pavers $10,856 over your price list', sub: 'bill row 11 · $117/m² · your list up to $71 · 236 m² (E20)', fix: {at: 76.3, text: 'fixed · repriced at your list · $71/m²'}},
  ],

  /** The typical floor: the three other floors it stands for, lit one by one. */
  typical: {lit: 23.0, step: 0.55, card: 23.2, floors: ['12', '16', '20']},

  /** The hedge (E17): the note decoded, the plants counted along the 27 m line, the bill row. */
  hedge: {note: 'DU H0.6 @0.3m o.c. DOUBLE ROW', decoded: 'Duranta hedge · one plant every 0.3 m · two rows', bill: 'bill row 7 · Duranta hedge · 27 m', card: 'The bill prices metres; the drawing means 182 plants', grow: [70.4, 72.8], n: 182},

  /** The pit (E12/E14), on the drawing. */
  pit: {tilt: 77.6, paper: [78.6, 79.4], shrink: [81.0, 82.0], meter: 80.2, seven: 83.2, pass: 85.0},

  findings: {
    at: 87.2,
    sendBack: ['A tree drawn outside the site (E08)', 'A planter over the lift shaft (T09)', 'A sheet on the index, not in the package (E29)', 'Title block 1:200, scale bar 1:100 (E16)', 'Two sheets alike, 91% (T08)'],
    fix: ['Billed 12 trees, drawn 8 · $516', 'Hedge billed 27 m, drawn 182 plants', 'Pavers 65% over your list · $10,856', 'Roof lawn 57% under your list (T07)'],
    code: ['Greenery 209.9 / 297 (E14)', 'Roof soil 0.3 m, minimum 0.4 m (T02)', 'Escape corridor 0.9 m, minimum 1.2 m (T10)'],
    total: '$17,788 to query',
  },

  /** The voice: `at` is when the line starts; `pictureUntil` is the end of its picture. */
  voice: [
    {n: 1, at: 0.2, pictureUntil: 3, who: 'Eric', text: 'Every building gets approved on drawings like these.'},
    {n: 2, at: 3.3, pictureUntil: 10, who: 'Eric', text: 'A landscape package is thirty files — and checking it by hand takes about two weeks.'},
    {n: 3, at: 10.2, pictureUntil: 14, who: 'Eric', text: "I'm Eric. I built Landsight to do it in two minutes."},
    {n: 4, at: 15.2, pictureUntil: B.drawer103, text: 'A building arrives as a stack of flat drawings — and the errors hide between the floors.'},
    {n: 5, at: B.drawer103 + 0.1, pictureUntil: B.roof, text: 'One sheet stands for four floors. The bill priced one. Landsight finds the other three.'},
    {n: 6, at: B.roof + 0.1, pictureUntil: B.alike, text: 'On the roof: thirty centimetres of soil; the rule asks for forty.'},
    {n: 7, at: B.alike + 0.1, pictureUntil: B.lift, text: 'Two sheets: the same drawing, different titles.'},
    {n: 8, at: B.lift + 0.1, pictureUntil: B.corridor, text: 'A planter on top of the lift shaft — sent back.'},
    {n: 9, at: B.corridor + 0.1, pictureUntil: B.ground, text: 'Planters squeeze the escape corridor to ninety centimetres. The code asks for one-twenty.'},
    {n: 10, at: B.ground + 0.1, pictureUntil: B.tree, text: 'On the ground, a row of trees.'},
    {n: 11, at: B.tree + 0.1, pictureUntil: B.confirm, text: 'You see a tree. A computer sees twelve loose lines.'},
    {n: 12, at: B.confirm + 0.1, pictureUntil: B.raster, text: 'Muse Spark reads one tree — and asks you before it counts.'},
    {n: 13, at: B.raster + 0.1, pictureUntil: B.bills, text: 'Only a coloured picture? SAM 3.1 measures every patch: lawn, a hundred and ninety-five square metres; the drawings say two hundred.'},
    {n: 14, at: B.bills + 0.1, pictureUntil: B.hedge, text: 'The bill: twelve trees; eight are drawn.'},
    {n: 15, at: B.hedge + 0.1, pictureUntil: B.pavers, text: 'A hedge note means a hundred and eighty-two plants; the bill prices metres.'},
    {n: 16, at: B.pavers + 0.1, pictureUntil: B.pit, text: 'Pavers, ten thousand over your own price list.'},
    {n: 17, at: B.pit + 0.2, pictureUntil: B.findings, text: 'On the slab, the pits are too small — big trees count as small, and the greenery falls short. Seven more trees fix it.'},
    {n: 18, at: B.findings + 0.1, pictureUntil: B.type, text: 'A developer told us: nonsense goes straight back; the rest, flag one by one.'},
    {n: 19, at: capToFilm(CAP.drop) + 0.1, pictureUntil: capToFilm(CAP.continue), text: 'Drop the folder as it came. Every file gets a verdict; the bill that governs is named.'},
    {n: 20, at: capToFilm(CAP.continue) + 0.3, pictureUntil: capToFilm(CAP.analyze), text: 'It reads the project off the title block — with your price list and your local rules. Analyze.'},
    {n: 21, at: capToFilm(CAP.analyze) + 0.2, pictureUntil: capToFilm(CAP.review - 0.3), text: 'Muse Spark reads every sheet, SAM 3.1 measures the colour plans, geometry counts.'},
    {n: 22, at: capToFilm(CAP.review) + 0.2, pictureUntil: capToFilm(CAP.e14 - 0.2), text: "On the right, the developer's way: send back, fix before pricing, the code. Every item opens on the drawing — and nothing counts until you confirm."},
    {n: 23, at: capToFilm(CAP.e14) + 0.1, pictureUntil: capToFilm(CAP.select1 - 0.3), text: 'Short on greenery? It shows the fixes that pass.'},
    {n: 24, at: capToFilm(CAP.select1) + 0.1, pictureUntil: capToFilm(CAP.ask - 0.2), text: 'Pick what goes back — it writes the change request, clouded and priced on the drawing.'},
    {n: 25, at: capToFilm(CAP.ask) + 0.1, pictureUntil: CLOSE_AT, text: "Point at anything and say what you think. It answers from the package — even when you're wrong."},
    {n: 26, at: CLOSE_AT + 0.5, pictureUntil: CLOSE_AT + END.line, text: 'Thirty planted errors: twenty-eight found, two flagged, none missed.'},
    {n: 27, at: CLOSE_AT + END.line, pictureUntil: LOGO_AT + END.hold, text: 'Every number, traced to the drawing.'},
  ],
};

export const wordCount = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
/** Each line starts at its `at`; on screen the later line takes over. `overrun`: past its picture; `clipped`: cut by the next line. */
export const timed = () =>
  V11.voice.map((v, i, all) => {
    const s = wordCount(v.text) / WPS;
    const next = all[i + 1];
    return {...v, start: v.at, seconds: s, end: v.at + s, overrun: Math.max(0, +(v.at + s - v.pictureUntil).toFixed(2)), clipped: next ? Math.max(0, +(v.at + s - next.at).toFixed(2)) : 0};
  });
