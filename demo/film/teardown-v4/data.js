// The package's real numbers and the film's beats, each from one source:
//  - dimensions: landsight/synth, the generator that drew the sample DXFs (gen/package.json, written by prep.mjs);
//  - times: the locked cues (src/scenes/film-v2-cues.js): the beats B, the cards, the narration's line starts. No time
//    is typed here: each is a cue, or a short offset from one, so nothing can drift from the sound;
//  - words and figures on screen: the approved cut's cards (V2) and the product's four groups.
// Pure data, no three.js: film.js, console.js, model.js and prep.mjs read it.
import {B, CLOSE_AT, END, LOGO_AT, PART2_AT, V2} from '../src/scenes/film-v2-cues.js';
import PKG from './gen/package.json' with {type: 'json'};
import T08 from '../src/scenes/t08.json' with {type: 'json'};
import SAM from '../src/scenes/sam-v11.json' with {type: 'json'};
import {plain} from './look.js';

export {B, CLOSE_AT, END, LOGO_AT, PART2_AT, V2, T08, SAM, plain};
export const P = PKG;

// ------------------------------------------------------------ the package, on L-1's frame (x east, y north, metres)
// The tower sheets draw the plate at (6, 9)-(34, 27); L-1 draws the same 28 × 18 m block as TOWER ABOVE at
// (6, 32.5)-(34, 50.5). One shift puts every tower sheet on the site's frame.
const DY = PKG.site.towerAbove[1] - PKG.tower.plate[1];
const up = (b) => [b[0], b[1] + DY, b[2], b[3] + DY];
const t = PKG.tower;
export const TWR = {
  plate: up(t.plate), core: up(t.core), lift: up(t.lift), lobby: up(t.lobby), stair: up(t.stair), corridor: up(t.corridor),
  liftPlanter: up(t.liftPlanter), corridorPlanters: t.corridorPlanters.map(up), planters: t.planters.map(up),
  roofLawn: up(t.roofLawn), roofPlanters: t.roofPlanters.map(up),
  columns: t.columns.map(([x, y]) => [x, y + DY]), liftShrubs: t.liftShrubs.map(([x, y]) => [x, y + DY]),
  soil: t.soil, floors: t.floors, titles: t.titles, dy: DY,
};
export const area = (b) => (b[2] - b[0]) * (b[3] - b[1]);
const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const sum = (bs) => bs.reduce((s, b) => s + area(b), 0);
/** Figures the model computes from the package; each one is also printed on an approved card (checked in prep). */
export const FIG = {
  typicalShrubs: sum(TWR.planters) + sum(TWR.corridorPlanters), // 38.4 m² a floor
  roofPlanters: sum(TWR.roofPlanters), // 35 m²
  liftPlanter: area(TWR.liftPlanter), // 7.5 m²
  overShaft: overlap(TWR.liftPlanter, TWR.lift), // 3.0 m²
  corridor: TWR.corridor[3] - TWR.corridor[1], // 1.5 m between the A-EGRESS walls
  corridorClear: TWR.corridor[3] - TWR.corridor[1] - (TWR.corridorPlanters[0][3] - TWR.corridorPlanters[0][1]), // 0.9 m
};

// Storeys: the package draws plans only. Heights as the approved cut's tower: 4 podium storeys of 4.5 m, then 3.4 m;
// 20 floors as tower.py says. Open (no facade): the 5F podium roof garden and the typical sky gardens.
export const STOREY = {podium: 4.5, tower: 3.4, podiumFloors: 4, slab: 0.3};
export const LEVELS = [];
{
  let y = 0;
  for (let n = 1; n <= 20; n++) {
    const h = n <= STOREY.podiumFloors ? STOREY.podium : STOREY.tower;
    LEVELS.push({key: `${n}F`, n, y, h, open: n === 5 || t.floors.includes(n), typical: t.floors.includes(n)});
    y += h;
  }
  LEVELS.push({key: 'RF', n: 21, y, h: 1.2, open: true, roof: true});
}
export const LEVEL = Object.fromEntries(LEVELS.map((l) => [l.key, l]));

const s = PKG.site;
/** The row of eight camphors as L-1 draws them (T-08, the last, is twelve loose lines). */
export const ROW = T08.row.map((r) => ({id: r.id, x: r.centre[0], y: r.centre[1], r: r.r})).sort((a, b) => a.x - b.x);
/** The approved cut's seven new trees: the strip between the row and the beds (WorldV2's SEVEN on L-1's frame). */
export const SEVEN = Array.from({length: 7}, (_, k) => ({x: 12 + 4 * k - T08.svg.offset_x, y: T08.svg.flip_y - 26.6}));
export const HEDGE = {x: s.hedge.x, y0: s.hedge.y[0], y1: s.hedge.y[1], gap: s.hedge.spacing, n: s.hedge.n, perRow: s.hedge.n / s.hedge.x.length};

// ------------------------------------------------------------ the beats (film seconds, all from the cues)
const card = (k) => V2.cards[k];
const mix = (a, b, f) => a + (b - a) * f;
const INTRO = (f) => mix(B.pull, B.drawer103, f);
export const TM = {
  push: B.push, land: B.land, pull: B.pull,
  sheetsIn: [B.pull, INTRO(0.3)], l6Away: [B.pull + 0.3, INTRO(0.34)], assemble: [INTRO(0.4), INTRO(0.8)],
  siteRise: [INTRO(0.6), INTRO(0.9)], consoleIn: [B.pull + 0.5, B.pull + 1.4],
  tagL6: [B.pull + 0.1, INTRO(0.31)], tagL1: [INTRO(0.61), B.drawer103 - 0.1],
  typical: {at: B.drawer103, sheet: card(0).at, lit: V2.typical.lit, step: V2.typical.step, found: V2.typical.lit + 1.4, fix: card(0).fix.at},
  roof: {at: B.roof, cut: B.roof + 0.7, soil: [card(1).fix.at - 0.2, card(1).fix.at + 0.6], fix: card(1).fix.at},
  alike: {at: B.alike, lift: [B.alike + 0.1, B.alike + 0.9], overlay: [B.alike + 0.9, card(2).at + 1.0], fix: card(2).fix.at},
  lift: {at: B.lift, cut: B.lift + 0.5, slide: [card(3).fix.at - 0.3, card(3).fix.at + 0.6], fix: card(3).fix.at},
  corridor: {at: B.corridor, walk1: [B.corridor + 1.7, B.corridor + 3.1], dim: B.corridor + 3.0, out: [card(4).fix.at - 0.6, card(4).fix.at + 0.3], walk2: [card(4).fix.at + 0.3, card(4).fix.at + 1.4], fix: card(4).fix.at},
  ground: {at: B.ground},
  tree: {at: B.tree, ghost: [B.tree + 0.2, B.tree + 1.2], rise: [B.tree + 1.7, B.tree + 2.8], split: B.tree + 1.5},
  confirm: {at: B.confirm, ring: [B.confirm, B.confirm + 0.6], card: card(5).at, button: card(5).at + 0.8, click: card(5).at + 1.6},
  raster: {at: B.raster, row: (k) => B.raster + 0.7 + k * 1.45},
  bills: {at: B.bills, count: card(6).at, step: 0.2, fix: card(6).fix.at},
  hedge: {at: B.hedge, note: B.hedge + 0.4, decoded: B.hedge + 1.0, bill: V2.hedge.grow[0] - 0.2, grow: V2.hedge.grow, card: V2.hedge.grow[1] + 0.1},
  pavers: {at: B.pavers, fix: card(7).fix.at},
  pit: {...V2.pit, at: B.pit},
  findings: {at: B.findings, board: V2.findings.at},
  type: B.type, part2: PART2_AT, close: CLOSE_AT, logo: LOGO_AT,
};

// ------------------------------------------------------------ the console's words
export const GROUPS = [
  {key: 'send', name: 'Send back'}, {key: 'fix', name: 'Fix before pricing'},
  {key: 'code', name: 'Building code'}, {key: 'ask', name: 'Ask the architect'},
];
export const SUBS = [
  {key: 'floors', name: 'Floors and slabs', sys: 'tower', done: B.roof},
  {key: 'podium', name: 'Podium roof garden', sys: 'tower', done: B.corridor},
  {key: 'typical', name: 'Typical floors', sys: 'tower', done: B.roof},
  {key: 'core', name: 'Lift core', sys: 'tower', done: B.corridor},
  {key: 'corridor', name: 'Escape corridor', sys: 'tower', done: B.ground},
  {key: 'planters', name: 'Planters', sys: 'tower', done: B.alike},
  {key: 'trees', name: 'Trees', sys: 'site', done: B.hedge},
  {key: 'beds', name: 'Beds', sys: 'site', done: B.bills},
  {key: 'lawn', name: 'Lawn', sys: 'site', done: B.bills},
  {key: 'hedge', name: 'Hedge', sys: 'site', done: B.pavers},
  {key: 'paving', name: 'Paving', sys: 'site', done: B.pit},
  {key: 'pits', name: 'Tree pits', sys: 'site', done: B.findings},
];
export const MODES = ['isolate', 'explode', 'section', 'x-ray', 'masks'];

const H = V2.hedge;
const pc = (k) => ({title: plain(card(k).title), fix: card(k).fix ? {at: card(k).fix.at, text: plain(card(k).fix.text)} : undefined});
/** One entry per beat: what the left card says, which group and subsystem light, the operator's mode. */
export const FINDINGS = [
  {key: 'stack', at: B.pull, sheet: 'L-6', sheetName: 'Tree pit detail'},
  {key: 'stack1', at: INTRO(0.55), sheet: 'L-1', sheetName: 'Planting plan · Rev B'},
  {key: 'typical', at: B.drawer103, sheet: 'L-103', sheetName: 'Typical sky garden', id: 'T01 · T06', groups: ['fix', 'code'], sub: 'typical', mode: 'explode',
    title: pc(0).title, ref: 'L-103 · typical floor 8F', rows: [['Drawn', '4 floors'], ['Billed', '1 floor · 38.4 m²']], fix: pc(0).fix},
  {key: 'roof', at: B.roof, sheet: 'L-104', sheetName: 'RF roof garden', id: 'T02', groups: ['code'], sub: 'planters', mode: 'section',
    title: pc(1).title, ref: 'L-104 · orange jasmine', rows: [['Drawn', '0.3 m soil'], ['Code', '0.4 m minimum'], ['Not counted', '35 m²']], fix: pc(1).fix},
  {key: 'alike', at: B.alike, sheet: 'L-102 · L-103', sheetName: 'Two floor plans', id: 'T08', groups: ['ask'], sub: 'podium', mode: 'isolate',
    title: pc(2).title, ref: 'L-102 and L-103', rows: [['Same line work', '91%'], ['L-102', '5F podium roof garden'], ['L-103', 'Typical sky garden']], fix: pc(2).fix},
  {key: 'lift', at: B.lift, sheet: 'L-102', sheetName: '5F podium roof garden', id: 'T09', groups: ['send'], sub: 'core', mode: 'section',
    title: pc(3).title, ref: 'L-102 · layer A-CORE-LIFT', rows: [['Planter B-10', '7.5 m²'], ['Over the shaft', '3.0 m²']], fix: pc(3).fix},
  {key: 'corridor', at: B.corridor, sheet: 'L-103', sheetName: 'Typical sky garden', id: 'T10', groups: ['code'], sub: 'corridor', mode: 'isolate',
    title: pc(4).title, ref: 'L-103 · layer A-EGRESS · 8F, 12F, 16F, 20F', rows: [['Drawn', '0.9 m clear'], ['Code', '1.2 m'], ['Rooms both sides', '1.6 m']], fix: pc(4).fix},
  {key: 'ground', at: B.ground, sheet: 'L-1', sheetName: 'Planting plan · Rev B', sub: 'trees'},
  {key: 'tree', at: B.tree, sheet: 'L-1', sheetName: 'Planting plan · Rev B', id: 'E01', groups: ['fix'], sub: 'trees', mode: 'x-ray',
    title: 'One tree, twelve loose lines', ref: 'L-1 · tree T-08 · its symbol, as drawn', rows: [], showAt: B.tree + 1.5},
  {key: 'confirm', at: B.confirm, sheet: 'L-1', sheetName: 'Planting plan · Rev B', id: 'E01', groups: ['fix'], sub: 'trees', mode: 'x-ray',
    title: pc(5).title, ref: 'twelve loose lines · it asks before it counts (E01)', rows: [], showAt: card(5).at},
  {key: 'sam', at: B.raster, sheet: 'Colour plan', sheetName: 'Presentation Plan (Colour).pdf', id: 'E09', groups: ['ask'], sub: 'lawn', mode: 'masks',
    title: 'SAM 3.1 measures every patch', ref: 'a raster page, no CAD · colour words read by Muse Spark'},
  {key: 'bills', at: B.bills, sheet: 'Bill row 6', sheetName: 'Landscape BOQ', id: 'E02.2', groups: ['fix'], sub: 'trees', mode: 'isolate',
    title: pc(6).title, ref: card(6).sub, rows: [['Billed', '12 trees'], ['Drawn', '8 trees']], fix: pc(6).fix, showAt: card(6).at},
  {key: 'hedge', at: B.hedge, sheet: 'L-1', sheetName: 'Planting plan · Rev B', id: 'E17', groups: ['fix'], sub: 'hedge', mode: 'isolate',
    title: H.card, ref: H.bill, note: H.note, decoded: H.decoded},
  {key: 'pavers', at: B.pavers, sheet: 'Bill row 11', sheetName: 'Landscape BOQ', id: 'E20', groups: ['fix'], sub: 'paving', mode: 'isolate',
    title: pc(7).title, ref: 'bill row 11 · permeable pavers', rows: [['Billed', '$117 / m²'], ['Your list', 'up to $71 / m²'], ['Area', '236 m²']], fix: pc(7).fix, showAt: card(7).at},
  {key: 'pit', at: B.pit, sheet: 'L-6', sheetName: 'Tree pit detail', id: 'E12 · E14', groups: ['code'], sub: 'pits', mode: 'section',
    title: 'On the slab, a big tree counts as small', ref: 'pit 1.5 × 1.5 m · soil 1.0 m on the concrete slab (L-6)', showAt: B.pit + 0.4},
  {key: 'findings', at: B.findings, sheet: 'All sheets', sheetName: 'Greenfield Residences'},
];
/** The greenery meter (the approved cut's figures, kgCO2e a year, local building code E14). */
export const GREEN = {before: 261.1, small: 209.9, after: 299.5, required: 297};
/** The findings board: the approved cut's lists, in the product's four groups. */
export const BOARD = {
  send: V2.findings.sendBack.filter((x) => !/T08/.test(x)),
  fix: V2.findings.fix,
  code: V2.findings.code,
  ask: [...V2.findings.sendBack.filter((x) => /T08/.test(x)), 'A tree stands in the fire lane (E09)'],
  total: V2.findings.total,
};
export const SCORE = END.bullets;

// ------------------------------------------------------------ the review log (the scrubber's ticks) and the stills
export const LOG = ['land', 'drawer103', 'roof', 'alike', 'lift', 'corridor', 'ground', 'tree', 'confirm', 'raster', 'bills', 'hedge', 'pavers', 'pit', 'findings', 'type'].map((k) => ({k, t: B[k]}));
export const BEATS = {
  duration: PART2_AT,
  part1: [B.land, B.pull + 0.8, INTRO(0.55), INTRO(0.85), ...LOG.slice(1, -1).map((b) => b.t + 1.2), card(0).fix.at, card(3).fix.at + 0.7, card(4).fix.at + 0.9, B.tree + 2.7, TM.confirm.click + 0.4, TM.raster.row(3) + 0.8, V2.hedge.grow[1], V2.pit.shrink[1], V2.pit.pass, V2.findings.at + 3.2],
  end: [CLOSE_AT + END.bullets[3].at + 0.5, CLOSE_AT + END.line + 0.6],
};
