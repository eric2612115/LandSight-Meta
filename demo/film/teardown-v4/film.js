// Landsight, the review as a teardown: the sample package (model.js) in the studio (stage.js) under the console
// (console.js). The operator follows the narration beat by beat and shows, at each second, the finding the approved
// cut shows: the sheets stack into the tower; the tower explodes and the typical floor's three twins light; a section
// through the roof planter; two sheets laid on each other; a section through the lift shaft; the corridor from above;
// the tree x-rayed into its twelve loose lines and confirmed; SAM 3.1's masks blooming off the colour plan; the bill's
// trees counted; the hedge planted plant by plant; the pavers lifted; a section through the pits on the slab; the
// findings. Then, after the product's own capture (Part 2, in Remotion), the end. render(t) is a pure function of t.
import * as THREE from 'three';
import {runSim} from 'teardown-kit/runtime.js';
import {createConsole} from './console.js';
import {B, BOARD, CLOSE_AT, END, FINDINGS, GREEN, GROUPS, HEDGE, LEVEL, LEVELS, LOG, LOGO_AT, PART2_AT, ROW, SAM, SEVEN, SUBS, T08, TM, TWR} from './data.js';
import {L6_BORDER_C, LAND_D} from './land.js';
import {LOOK} from './look.js';
import {GAP} from './model.js';
import {createStage} from './stage.js';

export const DURATION = LOGO_AT + 0.2;
const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'landsight', subtitle: ''}, director: {enabled: false}, watermark: ''};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoother = (x) => {
  const u = clamp01(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const win = (t, a, b, f = 0.35) => Math.min(ss(a, a + f, t), 1 - ss(b - f, b, t));
const lerp = (a, b, k) => a + (b - a) * k;
const box = (b) => ({cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2});
const W = (x, h, y) => [x, h, -y]; // L-1 point at a height → world
const R = 'translate(0, -50%)';
const Lft = 'translate(-100%, -50%)';

// ------------------------------------------------------------ the views (degrees, metres; u = seconds on the view)
const L6POS = V(20, 96, -41.5);
const LIFT = box(TWR.lift);
const RP = TWR.roofPlanters[0];
const PAV = box([2, 3, 28.5, 11]);
const SX = 27; // the machine sits between the two cards
export const VIEW = {
  land: () => ({tx: L6POS.x + L6_BORDER_C[0], ty: L6POS.y, tz: L6POS.z - L6_BORDER_C[1], az: 0, el: 90, d: LAND_D, sx: 0, sy: 0}),
  stack: (u) => ({tx: 26, ty: 58, tz: -32, az: 28 + 1.6 * u, el: 30, d: 215, sx: SX, sy: 30}),
  hero: (u) => ({tx: 24, ty: 30, tz: -26, az: 35 + 1.1 * u, el: 19, d: 228, sx: SX, sy: 40}),
  tower: (u) => ({tx: 33, ty: 79, tz: -38, az: 30 + 0.7 * u, el: 8, d: 448, sx: SX, sy: 34}),
  roof: (u) => ({tx: RP[2] - 1.6, ty: LEVEL.RF.y + 0.55, tz: -(RP[1] + RP[3]) / 2, az: 9 + 0.5 * u, el: 6, d: 6.8, sx: SX, sy: 30}),
  alike: (u) => ({tx: 34, ty: 40, tz: -30, az: 26 + 0.7 * u, el: 8, d: 150, sx: SX, sy: 0}),
  core: (u) => ({tx: LIFT.cx - 2, ty: 10.0, tz: -LIFT.cy, az: 57 + 0.5 * u, el: 20, d: 62, sx: SX, sy: 10}),
  corridor: () => ({tx: 24.2, ty: LEVEL['8F'].y, tz: -42.6, az: 0, el: 89.6, d: 31, sx: SX, sy: 20}),
  site: (u) => ({tx: 25, ty: 1, tz: -15, az: 14 + 1.0 * u, el: 30, d: 96, sx: SX, sy: 40}),
  tree: (u) => ({tx: T08.centre[0], ty: 2.2, tz: -(T08.centre[1] + SYM_OFF / 2), az: 90 + 0.8 * u, el: 16, d: 24, sx: -34, sy: 30}),
  row: (u) => ({tx: 19, ty: 1.4, tz: -4, az: 13 + 0.6 * u, el: 23, d: 82, sx: SX, sy: 0}),
  raster: () => ({tx: 22, ty: 4.8, tz: -15, az: 0, el: 89.6, d: 128, sx: 104, sy: 20}),
  hedge: (u) => ({tx: 47.5, ty: 0.6, tz: -14, az: 40 + 0.8 * u, el: 19, d: 54, sx: SX, sy: 0}),
  pavers: (u) => ({tx: PAV.cx, ty: 0, tz: -PAV.cy, az: 9 + 0.8 * u, el: 34, d: 72, sx: SX, sy: 0}),
  pit: (u) => ({tx: ROW[5].x - 2, ty: 1.0, tz: -ROW[0].y, az: 3 + 0.3 * u, el: 4, d: 26, sx: SX, sy: 0}),
  pit2: (u) => ({tx: 20, ty: 1.5, tz: -6, az: 9 + 0.6 * u, el: 24, d: 80, sx: SX, sy: 0}),
  end: (u) => ({tx: 24, ty: 30, tz: -26, az: 30 + 2.4 * u, el: 19, d: 238, sx: 150, sy: 46}),
};
const INTRO = (f) => lerp(B.pull, B.drawer103, f);
/** The symbol stands this far north of its tree, beside it as the camera (east of them) sees them. */
const SYM_OFF = 6.4;
export const SCRIPT = [
  {t: 0, view: 'land'},
  {t: B.pull, view: 'stack', blend: 2.3},
  {t: INTRO(0.55), view: 'hero', blend: 2.0},
  {t: B.drawer103, view: 'tower', blend: 1.6},
  {t: B.roof, view: 'roof', blend: 1.8},
  {t: B.alike, view: 'alike', blend: 1.6},
  {t: B.lift, view: 'core', blend: 1.6},
  {t: B.corridor, view: 'corridor', blend: 1.6},
  {t: B.ground, view: 'site', blend: 1.7},
  {t: B.tree, view: 'tree', blend: 1.5},
  {t: TM.confirm.click - 0.2, view: 'row', blend: 1.4},
  {t: B.raster, view: 'raster', blend: 1.5},
  {t: B.bills, view: 'row', blend: 1.5},
  {t: B.hedge, view: 'hedge', blend: 1.5},
  {t: B.pavers, view: 'pavers', blend: 1.4},
  {t: B.pit, view: 'pit', blend: 1.6},
  {t: TM.pit.seven - 0.5, view: 'pit2', blend: 1.3},
  {t: B.findings, view: 'hero', blend: 1.6},
  {t: CLOSE_AT - 0.01, view: 'end'},
];
const blend = (a, b, k) => {
  const o = {};
  for (const key in b) {
    if (key === 'az') o.az = a.az + ((((b.az - a.az + 540) % 360) - 180) * k);
    else if (key === 'd') o.d = Math.exp(lerp(Math.log(a.d), Math.log(b.d), k));
    else o[key] = lerp(a[key], b[key], k);
  }
  // pull out on the way, so a move between two close-ups never passes through the building
  o.d = Math.max(o.d, 0.9 * Math.max(a.d, b.d) * Math.sqrt(Math.sin(Math.PI * k)));
  return o;
};
export const camAt = (t) => {
  let i = 0;
  while (i < SCRIPT.length - 1 && SCRIPT[i + 1].t <= t) i++;
  const e = SCRIPT[i];
  const cur = VIEW[e.view](t - e.t);
  if (i > 0 && e.blend) {
    const k = ss(e.t, e.t + e.blend, t);
    if (k < 1) return blend(VIEW[SCRIPT[i - 1].view](t - SCRIPT[i - 1].t), cur, k);
  }
  return cur;
};

// ------------------------------------------------------------ the model's pose at t
const TYP = ['8F', '12F', '16F', '20F'];
const litOn = (k, t) => (k === 0 ? ss(B.drawer103 + 0.3, B.drawer103 + 1.3, t) : ss(TM.typical.lit + (k - 1) * TM.typical.step, TM.typical.lit + (k - 1) * TM.typical.step + 0.6, t));
const CORR = TWR.corridor;
const CP = TWR.corridorPlanters;
const laneY = (CORR[1] + CP[0][1]) / 2;
const personAt = (t) => {
  const C = TM.corridor;
  const x0 = TWR.lobby[0] + 4.6;
  const x1 = CP[0][0] - 0.45;
  const x2 = TWR.stair[0] + 0.6;
  const x = t < C.walk2[0] ? lerp(x0, x1, ss(C.walk1[0], C.walk1[1], t)) : lerp(x1, x2, ss(C.walk2[0], C.walk2[1], t));
  return {x, y: laneY, a: win(t, C.walk1[0] - 0.4, B.ground - 0.2, 0.3)};
};
function poseAt(t, cam) {
  const s = {sheets: {}, lit: {}, drawers: {}, lift: {}};
  s.assemble = ss(TM.assemble[0], TM.assemble[1], t);
  s.siteRise = ss(TM.siteRise[0], TM.siteRise[1], t);
  s.treeGrow = ss(TM.siteRise[0] + 0.3, TM.siteRise[1] + 0.5, t);
  // the typical floors: the stack opens, 8F slides out under L-103, then 12F, 16F, 20F
  s.explode = win(t, B.drawer103 + 0.05, B.roof + 0.25, 1.0);
  const shut = 1 - ss(B.roof - 0.6, B.roof + 0.2, t);
  TYP.forEach((f, k) => {
    const on = litOn(k, t) * shut;
    s.drawers[f] = [14 * on, 3 * on];
    s.lit[f] = on;
  });
  // the two alike floors
  const al = win(t, B.alike + 0.1, B.lift + 0.1, 0.45);
  s.lit['5F'] = al;
  s.lit['8F'] = Math.max(s.lit['8F'], al);
  // the lift core: 5F lit, the site out of the way; B-10 leaves the shaft
  s.siteA = 1 - win(t, B.lift + 0.05, B.corridor + 0.2, 0.5);
  // B-10 slides south, off the core (the core starts 1 m into it; 2.6 m clears the planter's 2.5 m)
  s.b10 = -(TWR.liftPlanter[3] - TWR.core[1] + 0.1) * ss(TM.lift.slide[0], TM.lift.slide[1], t);
  // the corridor: the floors above 8F lift away; the planters step into the wall
  // the floors above 8F stay up, out of every frame, until the tower has faded for the colour plan
  const away = ss(B.corridor + 0.05, B.corridor + 1.05, t) * (1 - ss(B.raster + 1.0, B.raster + 3.0, t));
  const awayCore = win(t, B.lift + 0.05, B.corridor + 0.4, 0.9);
  for (const L of LEVELS) s.lift[L.key] = Math.max(L.n > 8 ? away * (70 + 2 * L.n) : 0, L.n > 5 ? awayCore * (60 + 2 * L.n) : 0);
  s.glassA = 1 - win(t, B.lift + 0.15, B.corridor - 0.1, 0.3);
  s.corridorOut = ss(TM.corridor.out[0], TM.corridor.out[1], t);
  s.person = personAt(t);
  // the roof soil
  s.roofSoil = lerp(TWR.soil['L-104'], 0.4, ss(TM.roof.soil[0], TM.roof.soil[1], t));
  // sections
  const cut = (name, a, b, inn, out) => (t >= a && t < b ? {name, k: ss(a, inn, t) * (1 - ss(out, b, t))} : null);
  s.cut = cut('roof', B.roof + 0.2, B.alike, TM.roof.cut + 0.2, B.alike - 0.4) ?? cut('core', B.lift + 0.15, B.corridor, TM.lift.cut + 0.2, B.corridor - 0.4) ?? cut('pit', B.pit + 0.2, TM.pit.seven - 0.2, B.pit + 1.1, TM.pit.seven - 0.6);
  // the tower steps aside for the top-down colour plan
  s.towerA = 1 - win(t, B.raster - 0.2, B.bills + 0.5, 0.6);
  // T-08: x-ray, rise, close into one ring, confirm all eight
  const C = TM.confirm;
  s.examine = win(t, B.tree + 0.2, C.click + 0.7, 0.5);
  const up = ss(TM.tree.ghost[0], TM.tree.ghost[1] + 0.3, t);
  const symA = win(t, B.tree + 0.1, C.click + 0.6, 0.3);
  if (symA > 0) {
    const [cx, cy] = T08.centre;
    s.symbol = {
      a: symA,
      pos: V(cx, lerp(0.08, 2.5, up), -lerp(cy, cy + SYM_OFF, up)),
      rotX: lerp(-Math.PI / 2, 0, up),
      rotY: lerp(0, Math.PI / 2, up),
      drift: ss(TM.tree.rise[0], TM.tree.rise[1], t) * (1 - ss(C.ring[0], C.ring[1], t)),
      close: ss(C.ring[1] - 0.1, C.ring[1] + 0.3, t),
    };
  }
  s.rings = ss(C.click, C.click + 0.5, t) * (1 - ss(B.raster - 0.4, B.raster, t)) + win(t, TM.bills.count, B.hedge, 0.3) * 0.8;
  // SAM 3.1: the colour plan over the site, the masks bloom one class at a time
  const plan = win(t, B.raster + 0.15, B.bills - 0.1, 0.6);
  s.maskY = 4.8;
  if (plan > 0) s.sheets['F-26-p1'] = {a: plan, pos: V(37, 4.8 + (1 - plan) * 6, -21.75)};
  s.masks = SAM.rows.map((r, k) => ss(TM.raster.row(k), TM.raster.row(k) + 0.9, t) * (1 - ss(B.bills - 0.6, B.bills - 0.15, t)));
  // the hedge: unplanted to its drawn lines, then a plant every 0.3 m
  const H = TM.hedge;
  s.hedge = t < B.hedge ? 1 : t < H.grow[0] ? 1 - ss(B.hedge + 0.1, B.hedge + 0.7, t) : clamp01((t - H.grow[0]) / (H.grow[1] - H.grow[0]));
  s.hedgeLine = win(t, B.hedge + 0.2, B.pavers, 0.3);
  s.pavers = win(t, B.pavers + 0.2, B.pit, 0.5);
  // the pits: the trees count as small, seven more fix it
  s.shrink = ss(TM.pit.shrink[0], TM.pit.shrink[1], t) * (1 - ss(B.findings, B.findings + 0.8, t));
  s.seven = SEVEN.map((_, k) => ss(TM.pit.seven + k * 0.16, TM.pit.seven + 0.5 + k * 0.16, t));
  // dimensions
  const L8 = LEVEL['8F'].y;
  if (t >= B.roof && t < B.alike) {
    const d = s.roofSoil;
    const z = -(RP[1] + RP[3]) / 2 + 0.06;
    s.dim1 = [V(RP[2] - 0.9, LEVEL.RF.y + 0.1, z), V(RP[2] - 0.9, LEVEL.RF.y + 0.1 + d, z), 0.025, V(1, 0, 0)];
    s.dimA = win(t, TM.roof.cut + 0.3, B.alike - 0.3, 0.3);
    s.dashes = true;
  } else if (t >= B.corridor && t < B.ground) {
    const out = s.corridorOut;
    const x = CP[0][0] + 0.7;
    s.dim1 = [V(x, L8 + 0.08, -CORR[1]), V(x, L8 + 0.08, -lerp(CP[0][1], CORR[3], out)), 0.06, V(1, 0, 0)];
    s.dimA = win(t, TM.corridor.dim, B.ground, 0.3);
  } else if (t >= B.pit && t < TM.pit.seven) {
    const x = ROW[5].x + 0.75 + 0.15 + 0.35;
    s.dim1 = [V(x, -1.0, -ROW[0].y + 0.06), V(x, 0, -ROW[0].y + 0.06), 0.025, V(1, 0, 0)];
    s.dimA = win(t, B.pit + 1.2, TM.pit.seven - 0.3, 0.3);
  }
  // the sheets
  const sheetIn = (k) => ss(TM.sheetsIn[0] + 0.25 * k, TM.sheetsIn[0] + 0.25 * k + 0.9, t);
  if (t < TM.l6Away[1]) {
    const k = ss(TM.l6Away[0], TM.l6Away[1], t);
    s.sheets['L-6'] = {a: 1 - k, pos: V(L6POS.x - 70 * k * k, L6POS.y + 6 * k, L6POS.z + 20 * k)};
  }
  // a pile of drawings under L-6 that spreads, each sheet to its floor: L-1 to the ground, L-104 to the roof
  const spread = ss(TM.l6Away[0] + 0.5, TM.assemble[0] + 0.6, t);
  const pileY = (k) => L6POS.y - 1.6 - 1.4 * k;
  const pile = (k, floorY, x, z) => V(lerp(L6POS.x, x, spread), lerp(pileY(k), floorY, spread), lerp(L6POS.z, z, spread));
  const L1a = (t < TM.l6Away[1] ? 1 : 1) * (1 - ss(TM.siteRise[0], TM.siteRise[1] - 0.3, t));
  if (L1a > 0 && t >= TM.pull) s.sheets['L-1-revB'] = {a: L1a, pos: pile(3, 0.07, 37, -21.75)};
  const levelIdx = (key) => LEVELS.findIndex((l) => l.key === key);
  const n = LEVELS.length;
  [['L-104', 'RF'], ['L-103', '8F'], ['L-102', '5F']].forEach(([id, key], j) => {
    const i = levelIdx(key);
    const built = clamp01(s.assemble * (n + 3) - i);
    const a = 1 - smoother(built * 1.4);
    if (a > 0 && t >= TM.pull) s.sheets[id] = {a, pos: pile(j, LEVEL[key].y + 0.6, 37, -(TWR.dy + 12))};
  });
  // standing sheets face the camera
  const face = (cam.az * Math.PI) / 180;
  const stand = (pos, a, sc) => ({a, pos, rotX: Math.PI / 2, rotY: face, s: sc});
  const ty = win(t, TM.typical.sheet - 0.1, B.roof, 0.5);
  if (ty > 0) {
    const yAt = (f) => LEVEL[f].y + s.explode * GAP * LEVELS.findIndex((l) => l.key === f) + 4;
    s.sheets['L-103'] = {...stand(V(63, yAt('8F'), -37), ty, 0.3), edge: 2.2};
    TYP.slice(1).forEach((f, k) => {
      const on = litOn(k + 1, t) * ty;
      if (on > 0) s.sheets[`L-103b.${k}`] = {...stand(V(63, lerp(yAt('8F'), yAt(f), on), -37 - 0.2 * (k + 1)), 0.92 * on, 0.3), edge: 2.2};
    });
  }
  const ak = win(t, TM.alike.lift[0], B.lift + 0.1, 0.5);
  if (ak > 0) {
    const ov = ss(TM.alike.overlay[0], TM.alike.overlay[1], t);
    const p102 = V(lerp(6, 40, ov), lerp(LEVEL['5F'].y + 10, 39, ov), lerp(-14, -16.6, ov));
    s.sheets['L-103'] = stand(V(lerp(62, 40, ov), 39, -17), ak, 0.56);
    s.sheets['L-102'] = stand(p102, ak * lerp(1, 0.55, ov), 0.56);
  }
  return s;
}

// ------------------------------------------------------------ the console at t
const findingAt = (t) => {
  let i = -1;
  for (let k = 0; k < FINDINGS.length; k++) if (FINDINGS[k].at <= t) i = k;
  return i < 0 ? null : {f: FINDINGS[i], next: FINDINGS[i + 1]?.at ?? PART2_AT};
};
const GROUP_NAME = Object.fromEntries(GROUPS.map((g) => [g.key, g.name]));
export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const {rowsHtml, esc} = ui;
    const fixHtml = (fx, t) => (fx && t >= fx.at ? `<div class="fix" style="opacity:${ss(fx.at, fx.at + 0.35, t).toFixed(2)}"><i></i><span>${esc(fx.text)}</span></div>` : '');
    let confirmSpot = [262, 470];
    // ---------------------------------------------------------- the left card
    const leftAt = (t) => {
      const cur = findingAt(t);
      if (!cur) return null;
      const {f, next} = cur;
      if (!f.title && !f.note && f.key !== 'sam') return null;
      const a = win(t, f.showAt ?? f.at + 0.35, next - 0.05, 0.3);
      if (a <= 0) return null;
      const L = {a, head: 'finding', group: f.id, title: f.title, ref: f.ref, html: ''};
      if (f.key === 'typical') {
        L.html = rowsHtml(f.rows) + (t >= TM.typical.found ? `<div class="fix" style="color:${LOOK.ink};opacity:${ss(TM.typical.found, TM.typical.found + 0.35, t).toFixed(2)}"><i style="background:${LOOK.ink}"></i><span>Landsight finds the other three floors</span></div>` : '') + fixHtml(f.fix, t);
      } else if (f.key === 'confirm') {
        const C = TM.confirm;
        const done = t >= C.click + 0.12;
        L.html = t >= C.button ? `<div class="btn" style="background:${done ? LOOK.ink : LOOK.accent};opacity:${ss(C.button, C.button + 0.3, t).toFixed(2)}">${done ? 'Confirmed · 8 trees' : 'Confirm one tree'}</div>` : '';
      } else if (f.key === 'sam') {
        let h = `<table class="t"><tr><th>What</th><th>SAM 3.1</th><th>Drawings</th><th>Diff.</th></tr>`;
        SAM.rows.forEach((r, k) => {
          const at = TM.raster.row(k);
          const o = ss(at + 0.3, at + 0.8, t);
          const v = r.sam * ss(at + 0.3, at + 1.0, t);
          const fmt = (x) => (r.kind === 'symbols' ? String(Math.round(x)) : x.toFixed(1));
          const big = Math.abs(r.diff_pct) >= 10;
          const diff = r.diff_pct === 0 ? '0%' : `${r.diff_pct > 0 ? '+' : '−'}${Math.abs(r.diff_pct).toFixed(1)}%`;
          h += `<tr style="opacity:${o.toFixed(2)}"><td>${esc(r.what)}</td><td class="n" style="color:${LOOK.accent}">${fmt(v)}</td><td class="n" style="font-weight:500">${fmt(r.drawings)}</td><td class="n" style="${big ? `color:${LOOK.accent}` : `color:${LOOK.mute};font-weight:500`}">${diff}</td></tr>`;
        });
        h += `</table>`;
        const no = ss(TM.raster.row(3) + 0.8, TM.raster.row(3) + 1.2, t);
        h += `<div style="margin-top:14px;font-size:29px;font-weight:600;line-height:1.16;opacity:${no.toFixed(2)}">The fire lane differs: a tree is drawn over it.</div>`;
        h += `<div style="margin-top:8px;font-size:17px;color:${LOOK.mute};opacity:${no.toFixed(2)}">Nothing counts until a person confirms.</div>`;
        L.html = h;
        L.wide = true;
      } else if (f.key === 'hedge') {
        const H = TM.hedge;
        const n = Math.round(HEDGE.n * (t < H.grow[0] ? 0 : clamp01((t - H.grow[0]) / (H.grow[1] - H.grow[0]))));
        L.title = '';
        L.html = `<div class="mo" style="margin-top:8px;font-size:25px;font-weight:600;opacity:${ss(H.note, H.note + 0.3, t).toFixed(2)}">${esc(f.note)}</div>` +
          `<div style="margin-top:8px;font-size:29px;font-weight:600;line-height:1.16;opacity:${ss(H.decoded, H.decoded + 0.4, t).toFixed(2)}">${esc(f.decoded)}</div>` +
          `<div style="opacity:${ss(H.bill, H.bill + 0.35, t).toFixed(2)}">${rowsHtml([['Drawn', `${n} plants`], ['Billed', '27 m · row 7']])}</div>` +
          (t >= H.card ? `<div style="margin-top:14px;font-size:29px;font-weight:700;line-height:1.16;opacity:${ss(H.card, H.card + 0.3, t).toFixed(2)}">${esc(f.title)}</div>` : '');
        L.ref = '';
        L.wide = true;
      } else if (f.key === 'pit') {
        const P = TM.pit;
        const down = ss(P.shrink[0], P.shrink[1], t);
        const upk = ss(P.seven, P.pass, t);
        const v = lerp(lerp(GREEN.before, GREEN.small, down), GREEN.after, upk);
        const pass = v >= GREEN.required;
        const ma = ss(P.meter, P.meter + 0.4, t);
        const px = (x) => (x / 330) * 392;
        L.html = t >= P.meter
          ? `<div style="opacity:${ma.toFixed(2)}"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px"><span style="font-size:29px;font-weight:600">Greenery</span><span class="mo" style="font-size:12px;color:${LOOK.mute}">KGCO2E / YR · E14</span></div>` +
            `<div style="position:relative;height:26px;margin-top:38px;background:#ece9e2;border-radius:6px"><div style="position:absolute;left:0;top:0;bottom:0;width:${px(v).toFixed(1)}px;background:${pass ? LOOK.accent : LOOK.ink};border-radius:6px"></div>` +
            `<div style="position:absolute;left:${(px(GREEN.required) - 2).toFixed(1)}px;top:-10px;bottom:-10px;width:3px;background:${LOOK.mute}"></div><div style="position:absolute;right:${(392 - px(GREEN.required) + 10).toFixed(1)}px;top:-36px;font-size:17px;color:${LOOK.mute};white-space:nowrap">required ${GREEN.required}</div></div>` +
            `<div style="display:flex;align-items:baseline;gap:14px;margin-top:12px"><span style="font-size:44px;font-weight:700">${v.toFixed(1)}</span><span style="font-size:29px;font-weight:600;color:${pass ? LOOK.accent : LOOK.mute}">${pass ? 'passes' : down > 0.5 ? 'short' : 'provided'}</span></div></div>`
          : '';
        L.html += t >= P.pass ? `<div class="fix" style="opacity:${ss(P.pass, P.pass + 0.35, t).toFixed(2)}"><i></i><span>Fix: +7 trees → ${GREEN.after}</span></div>` : '';
      } else {
        L.html = rowsHtml(f.rows ?? []) + fixHtml(f.fix, t);
      }
      return L;
    };
    // ---------------------------------------------------------- the findings board and the end
    const boardAt = (t) => {
      const T0 = TM.findings.board;
      const a = win(t, T0, B.type + 0.3, 0.4);
      if (a <= 0) return null;
      const delay = {send: 0, fix: 1.1, code: 2.0, ask: 2.6};
      const col = (key, x, y) => {
        const items = BOARD[key];
        let h = `<div style="position:absolute;left:${x}px;top:${y}px;width:700px"><h3 style="opacity:${ss(T0 + delay[key], T0 + delay[key] + 0.3, t).toFixed(2)}"><i></i>${GROUP_NAME[key]}</h3>`;
        items.forEach((it, i) => {
          const o = ss(T0 + delay[key] + 0.3 + i * 0.2, T0 + delay[key] + 0.55 + i * 0.2, t);
          h += `<p style="opacity:${o.toFixed(2)}">${esc(it)}</p>`;
        });
        return h + '</div>';
      };
      const tot = ss(T0 + 3.0, T0 + 3.4, t);
      return {a, html: col('send', 40, 30) + col('fix', 780, 30) + col('code', 40, 330) + col('ask', 780, 330) + `<div style="position:absolute;left:40px;right:40px;bottom:34px;display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid ${LOOK.line};padding-top:18px;opacity:${tot.toFixed(2)}"><span class="sm">Greenfield Residences · flagged one by one</span><span style="font-size:44px;font-weight:700;color:${LOOK.accent}">${esc(BOARD.total)}</span></div>`};
    };
    const endAt = (t) => {
      if (t < CLOSE_AT) return null;
      const u = t - CLOSE_AT;
      let h = `<div class="sm" style="margin-bottom:18px">review complete · all subsystems checked</div>`;
      END.bullets.forEach((b, k) => {
        const o = ss(b.at, b.at + 0.35, u);
        const last = k === END.bullets.length - 1;
        h += `<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px;opacity:${o.toFixed(2)};transform:translateX(${((1 - o) * -14).toFixed(1)}px)"><i style="flex:none;width:12px;height:12px;margin-top:12px;border-radius:50%;background:${last ? LOOK.accent : LOOK.ink}"></i><div style="font-size:${last ? 31 : 29}px;font-weight:${last ? 700 : 600};line-height:1.18;letter-spacing:-.3px;${last ? `color:${LOOK.accent}` : ''}">${esc(b.text)}${b.by ? `<div style="font-size:19px;font-weight:500;color:${LOOK.mute};margin-top:3px">${esc(b.by)}</div>` : ''}</div></div>`;
      });
      const lo = ss(END.line, END.line + 0.4, u);
      h += `<div style="margin-top:26px;font-size:50px;font-weight:750;letter-spacing:-1.2px;line-height:1.05;opacity:${lo.toFixed(2)}">Every number, traced to the drawing.</div>`;
      return {a: ss(0.05, 0.45, u), html: h};
    };
    // ---------------------------------------------------------- the operator's pointer
    {
      // lay the confirm card out once to find where its button sits
      ui.update({left: leftAt(TM.confirm.click + 0.01), logAt: () => 0, groups: {}, subs: {}});
      const b = document.querySelector('.btn');
      if (b) {
        const r = b.getBoundingClientRect();
        confirmSpot = [r.left + r.width / 2, r.top + r.height / 2];
      }
    }
    const EV = [];
    for (const f of FINDINGS) {
      if (f.sub && ui.spots[`sub:${f.sub}`]) EV.push({t: f.at + 0.15, spot: ui.spots[`sub:${f.sub}`]});
      if (f.mode && ui.spots[`mode:${f.mode}`]) EV.push({t: f.at + 0.75, spot: ui.spots[`mode:${f.mode}`]});
    }
    EV.push({t: TM.confirm.click, spot: confirmSpot});
    EV.sort((a, b) => a.t - b.t);
    const chips = Object.values(ui.spots);
    const restY = Math.max(...chips.map((p) => p[1])) + 34;
    const REST = [[1478, restY], [1502, restY + 8], [1456, restY + 4]];
    // it waits at rest beside the chips, travels to the one it presses, clicks, and goes back to rest
    const WP = [[0, ...REST[0]]];
    let restAt = REST[0];
    let last = 0;
    EV.forEach((e, i) => {
      WP.push([Math.max(last + 0.05, e.t - 0.85), ...restAt]);
      WP.push([e.t - 0.18, ...e.spot], [e.t + 0.2, ...e.spot]);
      restAt = REST[i % REST.length];
      WP.push([e.t + 0.95, ...restAt]);
      last = e.t + 0.95;
    });
    WP.sort((a, b) => a[0] - b[0]);
    const cursorAt = (t) => {
      let i = 0;
      while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
      const [t0, x0, y0] = WP[i];
      const [t1, x1, y1] = WP[i + 1];
      const k = ss(t0, t1, t);
      const len = Math.hypot(x1 - x0, y1 - y0);
      const bow = Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
      let press = false;
      let ring = 0;
      let rx = 0;
      let ry = 0;
      for (const e of EV) {
        if (t >= e.t - 0.07 && t < e.t + 0.09) press = true;
        if (t >= e.t && t < e.t + 0.55) {
          ring = 1 - (t - e.t) / 0.55;
          [rx, ry] = e.spot;
        }
      }
      const a = win(t, B.drawer103 - 1.2, B.findings + 0.3, 0.5);
      return {a, x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
    };
    // ---------------------------------------------------------- labels into the model
    const P = (p) => st.project(p);
    const call = (text, world, dx, dy, o, extra = {}) => {
      if (o <= 0.01) return null;
      const at = P(world);
      if (!at) return null;
      // keep the whole label between the two cards and above the caption
      const w = text.length * 15.5 + 44;
      const a = extra.anchor === R ? 0 : extra.anchor === Lft ? 1 : 0.5;
      const lx = Math.min(1172 - w * (1 - a), Math.max(500 + w * a, at[0] + dx));
      const ly = Math.min(770, Math.max(150, at[1] + dy));
      return {text, at, label: [lx, ly], o, ...extra};
    };
    const callouts = (t, s) => {
      const out = [];
      const push = (c) => c && out.push(c);
      push(call('L-6 · tree pit detail', [L6POS.x - 30, L6POS.y, L6POS.z + 15], 60, -60, win(t, TM.tagL6[0] + 0.4, TM.tagL6[1], 0.3), {anchor: R}));
      push(call("L-1 · the tower's footprint", W(TWR.plate[2], 0.2, TWR.plate[1]), 80, 40, win(t, TM.tagL1[0], TM.tagL1[1], 0.3), {anchor: R}));
      // typical floors
      TYP.forEach((f, k) => {
        const o = litOn(k, t) * win(t, B.drawer103 + 0.6, B.roof - 0.2, 0.3);
        const i = LEVELS.findIndex((l) => l.key === f);
        const p = W(TWR.plate[2] + s.drawers[f][0], LEVEL[f].y + s.explode * GAP * i, TWR.plate[1] - s.drawers[f][1] + 9);
        push(call(k === 0 ? '8F · L-103' : f, p, 70, 0, o, {anchor: R, accent: k > 0}));
      });
      // roof
      if (t >= B.roof && t < B.alike) {
        const fixed = s.roofSoil > 0.395;
        const z = (RP[1] + RP[3]) / 2;
        push(call(`soil ${s.roofSoil.toFixed(1)} m`, W(RP[2] - 0.9, LEVEL.RF.y + 0.1 + s.roofSoil / 2, z), 120, 70, win(t, TM.roof.cut + 0.4, B.alike - 0.3, 0.3), {anchor: R, accent: fixed}));
        push(call('0.4 m minimum', W(RP[0] + 1.2, LEVEL.RF.y + 0.5, z), -60, -90, win(t, TM.roof.cut + 0.7, B.alike - 0.3, 0.3), {anchor: Lft}));
      }
      // alike
      push(call('L-102 on L-103 · 91% the same', [40, 39 + 13, -16.6], 0, -60, win(t, TM.alike.overlay[1] - 0.2, B.lift - 0.1, 0.3), {accent: true}));
      // lift
      if (t >= B.lift && t < B.corridor) {
        push(call('lift shaft · the car below', W(LIFT.cx, LEVEL['4F'].y + 1.2, LIFT.cy), -120, 50, win(t, B.lift + 0.9, B.corridor - 0.1, 0.3), {anchor: Lft}));
        const slid = ss(TM.lift.slide[1] - 0.1, TM.lift.slide[1] + 0.2, t);
        const b = TWR.liftPlanter;
        push(call(slid > 0.5 ? 'planter B-10 · off the core' : 'planter B-10', W(LIFT.cx - 0.6, LEVEL['5F'].y + 1.3, (b[1] + b[3]) / 2 + s.b10), -60, -110, win(t, B.lift + 1.2, B.corridor - 0.1, 0.3), {anchor: Lft, accent: slid > 0.5}));
      }
      // corridor
      if (t >= B.corridor && t < B.ground) {
        const out2 = s.corridorOut;
        const x = CP[0][0] + 0.7;
        const clear = lerp(0.9, 1.5, out2);
        const dimA = win(t, TM.corridor.dim, B.ground, 0.3);
        push(call(`${clear.toFixed(1)} m clear`, W(x, LEVEL['8F'].y, lerp(CORR[1], CORR[3], 0.5)), 0, 150, dimA, {accent: out2 > 0.95}));
        push(call('the code: 1.2 m', W(x + 2.6, LEVEL['8F'].y, CORR[3]), 40, -120, dimA * (1 - ss(TM.corridor.out[0], TM.corridor.out[0] + 0.3, t)), {anchor: R}));
        const pa = s.person;
        push(call('stopped', W(pa.x, LEVEL['8F'].y + 1.8, pa.y), -40, -110, win(t, TM.corridor.walk1[1] - 0.1, TM.corridor.out[0] + 0.3, 0.15), {anchor: Lft}));
      }
      // the tree and its drawing, side by side; the drawing's twelve pieces numbered round it
      if (s.symbol && t < B.confirm + 0.4) {
        const [cx, cy] = T08.centre;
        const lo = win(t, TM.tree.ghost[1], B.confirm + 0.4, 0.3);
        push(call('You see one tree', W(cx, 3.2, cy), -110, 150, lo, {anchor: Lft}));
        push(call('A computer sees 12 loose lines', W(cx, 2.5 + 2.2, cy + SYM_OFF), 30, -95, lo, {anchor: R, accent: true}));
        const v = new THREE.Vector3();
        st.model.pieces.forEach((g, i) => {
          g.userData.mark.getWorldPosition(v);
          const at = P([v.x, v.y, v.z]);
          if (at) out.push({text: String(i + 1), at, label: at, o: ss(TM.tree.rise[0] + 0.3 + i * 0.06, TM.tree.rise[0] + 0.6 + i * 0.06, t) * (1 - ss(B.confirm, B.confirm + 0.3, t)), small: true, bare: true});
        });
      }
      // the bill's count on the row
      if (t >= TM.bills.count && t < B.hedge + 0.1) {
        const n = Math.min(ROW.length, Math.floor((t - TM.bills.count) / TM.bills.step) + 1);
        ROW.slice(0, n).forEach((r, i) => {
          const at = P(W(r.x, 4.6, r.y));
          if (at) out.push({text: String(i + 1), at, label: [at[0], at[1] - 34], o: win(t, TM.bills.count + i * TM.bills.step, B.hedge + 0.1, 0.12), accent: true});
        });
      }
      // hedge: the count at the growing end
      if (t >= TM.hedge.grow[0] - 0.1 && t < B.pavers) {
        const k = clamp01((t - TM.hedge.grow[0]) / (TM.hedge.grow[1] - TM.hedge.grow[0]));
        const n = Math.round(HEDGE.n * k);
        push(call(`${n} plants`, W(HEDGE.x[0], 0.6, lerp(HEDGE.y0, HEDGE.y1, k)), -40, -90, win(t, TM.hedge.grow[0], B.pavers, 0.25), {anchor: Lft, accent: k > 0.999}));
      }
      // pit
      if (t >= B.pit && t < B.findings) {
        const P2 = TM.pit;
        const r = ROW[5];
        push(call('pit 1.5 × 1.5 m · on the slab', W(r.x - 0.75, -0.5, r.y), -60, 120, win(t, P2.paper[1], P2.seven + 0.2, 0.3), {anchor: Lft}));
        push(call('soil 1.0 m', W(r.x + 1.25, -0.5, r.y), 70, 60, win(t, B.pit + 1.3, P2.seven - 0.3, 0.3), {anchor: R}));
        push(call('counts as small · Gi 1.5 → 1.0', W(r.x, 3.6, r.y), 90, -120, win(t, P2.shrink[0] + 0.6, P2.seven + 0.4, 0.3), {anchor: R}));
        const s4 = SEVEN[3];
        push(call('+7 trees on the plan', W(s4.x, 4.4, s4.y), 0, -110, Math.min(s.seven[6], win(t, P2.seven, B.findings, 0.3)), {accent: true}));
      }
      return out;
    };

    window.LS = st;
    return {
      resize,
      render(t) {
        const cam = camAt(t);
        const s = poseAt(t, cam);
        st.frame(s, cam);
        const cur = findingAt(t);
        const f = cur?.f;
        const inEnd = t >= CLOSE_AT;
        const L = inEnd ? null : leftAt(t);
        const groups = {};
        for (const g of GROUPS) {
          const active = f?.groups?.includes(g.key) && t >= f.at + 0.3 && t < (cur?.next ?? 0) - 0.1;
          const seen = FINDINGS.some((x) => x.groups?.includes(g.key) && x.at + 0.3 <= t);
          groups[g.key] = inEnd || t >= B.findings ? 'seen' : active ? 'active' : seen ? 'seen' : 'idle';
        }
        const all = inEnd || t >= B.findings;
        const part = all ? `All ${SUBS.length} checked` : f?.sub && t >= f.at + 0.15 && t < (cur?.next ?? 0) - 0.1 ? SUBS.find((x) => x.key === f.sub).name : null;
        const board = inEnd ? null : boardAt(t);
        const logAt = (x) => clamp01((x - B.land) / (PART2_AT - B.land));
        ui.update({
          chrome: ss(TM.consoleIn[0], TM.consoleIn[1], t),
          rightA: board ? 1 - board.a : 1,
          sheet: inEnd ? ['All sheets', 'Greenfield Residences'] : t < B.pull ? ['L-6', 'Tree pit detail'] : [f?.sheet ?? '', f?.sheetName ?? ''],
          log: inEnd ? 1 : logAt(t),
          logAt,
          left: L ? {...L, a: L.a * (board ? 1 - board.a : 1)} : null,
          wide: L?.wide,
          groups,
          part,
          partDone: all,
          mode: !inEnd && f?.mode && t >= f.at + 0.75 && t < (cur?.next ?? 0) - 0.1 ? f.mode : null,
          board,
          end: endAt(t),
          callouts: inEnd ? [] : callouts(t, s),
          cursor: inEnd ? null : cursorAt(t),
        });
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
