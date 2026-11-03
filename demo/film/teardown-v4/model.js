// The machine: the sample package built from its own numbers (data.js). The site, L-1 on a basement slab (a plinth
// whose cut face shows the slab, the drainage and the soil), with its beds, lawn, paving, hedge, fire lane and trees in
// pits; north of it, the 20-floor tower on the 28 × 18 m plate: slabs with the lift shaft open through them, the core,
// the stair, glass on the closed floors, and the landscaped floors open (5F podium roof garden, the four typical sky
// gardens, the roof). update(s) poses everything from one state; nothing here knows the time.
// Frame: x = L-1's x (east), y = height, z = -(L-1's y) (north is -z). 1 unit = 1 m.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rng} from 'teardown-kit/util.js';
import {FIG, HEDGE, LEVELS, P, ROW, SAM, SEVEN, T08, TWR} from './data.js';
import {L6, L6_BORDER_C} from './land.js';
import SHEETS from './gen/sheets.js';

const V3 = THREE.Vector3;
export const ACCENT = new THREE.Color('#2457ff');
const KEEP_ALL = 1e6;
/** The explode: each level rises this much per level below it. */
export const GAP = 4.2;
/** The lift car waits at 4F, under the planter. */
const CAR_Y = LEVELS[3].y + 1.5;
/** The two cut planes: tower parts clip on one, site parts on the other; parked far away when off. */
export const TOWER_CUT = new THREE.Plane(new V3(0, 0, -1), KEEP_ALL);
export const SITE_CUT = new THREE.Plane(new V3(0, 0, -1), KEEP_ALL);

const std = (color, o = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.8, metalness: 0, envMapIntensity: 0.4, ...o});
function materials(cut, clip = true) {
  // a study model: matte near-white parts (ink edges come from the stage), the landscape in pale, muted tones
  const m = {
    concrete: std('#f1eee8', {roughness: 0.72}), core: std('#e9e5de', {roughness: 0.75}), glass: std('#d6dadd', {roughness: 0.55, envMapIntensity: 0.5}),
    column: std('#f3f1ec'), rim: std('#f3f1ec'), soil: std('#8b745d', {roughness: 1}), shrub: std('#ffffff', {roughness: 0.9}),
    lawn: std('#d7e0cb', {roughness: 1}), stair: std('#e4e0d8'), wall: std('#efece6'), car: std('#a4abb4', {roughness: 0.6}),
    person: std('#2a2e35', {roughness: 0.6}), plinth: std('#eeebe4'), side: std('#e3ded5'), slab: std('#cdc7bc'),
    drain: std('#9a9288'), fill: std('#ded5c6'), pavers: std('#ffffff'), aggregate: std('#e3ded5'), grassPavers: std('#ffffff'),
    mulch: std('#cdbfae', {roughness: 1}), lane: std('#d9d9d5'), road: std('#cdcbc6'), trunk: std('#c9bfb2'), foliage: std('#e4e8dc', {roughness: 0.9}),
    accent: std('#2457ff', {emissive: ACCENT, emissiveIntensity: 0.3, roughness: 0.6}),
  };
  for (const [k, x] of Object.entries(m)) {
    // trees stand whole in a section, as a section drawing shows them in elevation behind the cut
    if (clip && k !== 'trunk' && k !== 'foliage') x.clippingPlanes = [cut];
    x.side = THREE.DoubleSide;
    x.shadowSide = THREE.FrontSide;
  }
  return m;
}
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({color, toneMapped: false, ...o});

// a box between two L-1 points and two heights
const BOX = new THREE.BoxGeometry(1, 1, 1);
function boxOf(parent, list, [x0, y0, x1, y1], h0, h1, mat, cap = null, shadow = true) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(Math.max(0.001, x1 - x0), Math.max(0.001, h1 - h0), Math.max(0.001, y1 - y0));
  m.position.set((x0 + x1) / 2, (h0 + h1) / 2, -(y0 + y1) / 2);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  if (list && cap) list.push({parent, b: [x0, y0, x1, y1], h0, h1, cap, mesh: m});
  return m;
}
/** Caps: the flat face a section leaves on each solid it cuts (axis 'x' or 'y' on L-1's frame, at `at`). */
function caps(list, axis, at, keepLess, mats) {
  const made = [];
  for (const c of list) {
    const [x0, y0, x1, y1] = c.b;
    const lo = axis === 'x' ? x0 : y0;
    const hi = axis === 'x' ? x1 : y1;
    if (at <= lo + 1e-3 || at >= hi - 1e-3) continue;
    const span = axis === 'x' ? y1 - y0 : x1 - x0;
    const q = new THREE.Mesh(new THREE.PlaneGeometry(span, c.h1 - c.h0), mats[c.cap]);
    // the face sits a hair toward the removed side and looks that way (the camera's side)
    if (axis === 'x') {
      q.rotation.y = keepLess ? Math.PI / 2 : -Math.PI / 2;
      q.position.set(at + (keepLess ? 0.012 : -0.012), (c.h0 + c.h1) / 2, -(y0 + y1) / 2);
    } else {
      q.rotation.y = keepLess ? Math.PI : 0;
      q.position.set((x0 + x1) / 2, (c.h0 + c.h1) / 2, -at + (keepLess ? -0.012 : 0.012));
    }
    q.visible = false;
    c.parent.add(q);
    made.push(q);
  }
  return made;
}

// foliage: a clump of spheres merged, for a tree crown or a shrub
const SPH = new THREE.IcosahedronGeometry(1, 3);
const LOW = new THREE.IcosahedronGeometry(1, 1);
function crown(r, h, seed) {
  const R = rng(seed);
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + R();
    const d = k === 0 ? 0 : r * (0.38 + 0.2 * R());
    const s = r * (k === 0 ? 0.62 : 0.5 + 0.12 * R());
    parts.push(LOW.clone().scale(s, s * 0.86, s).translate(Math.cos(a) * d, h + (R() - 0.4) * r * 0.32, Math.sin(a) * d));
  }
  return mergeGeometries(parts);
}
function tree(parent, x, y, r, seed, mats) {
  const g = new THREE.Group();
  g.position.set(x, 0, -y);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * r, 0.16 * r, 1.9 * (r / 1.95), 12).translate(0, 0.95 * (r / 1.95), 0), mats.trunk);
  const top = new THREE.Mesh(crown(r * 0.98, 2.55 * (r / 1.95), seed), mats.foliage);
  top.material = mats.foliage;
  for (const m of [trunk, top]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  const col = new THREE.Color().setHSL(0.27 + 0.03 * Math.sin(seed), 0.16, 0.56 + 0.04 * Math.cos(seed * 1.7));
  top.userData.col = col;
  g.userData = {trunk, top, r};
  parent.add(g);
  return g;
}
/** Shrubs on a grid inside a box, as one instanced mesh (its colours vary a little). */
function shrubs(parent, b, h0, r, gap, seed, mat, n0 = 0.8) {
  const R = rng(seed);
  const pts = [];
  for (let x = b[0] + gap / 2; x < b[2] - gap / 4; x += gap) for (let y = b[1] + gap / 2; y < b[3] - gap / 4; y += gap) pts.push([x + (R() - 0.5) * gap * 0.3, y + (R() - 0.5) * gap * 0.3]);
  const im = new THREE.InstancedMesh(SPH, mat, pts.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  pts.forEach(([x, y], i) => {
    const s = r * (n0 + 0.4 * R());
    o.position.set(x, h0 + s * 0.6, -y);
    o.scale.set(s, s * 0.8, s);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    im.setColorAt(i, c.setHSL(0.22 + 0.04 * R(), 0.12 + 0.05 * R(), 0.8 + 0.06 * R()));
  });
  im.castShadow = true;
  im.receiveShadow = true;
  parent.add(im);
  return im;
}
/** A sheet of paper with its drawing: w × h metres, lying flat (its top toward -z) unless turned. */
function paper(id, w, h, pad = 1) {
  const tex = new THREE.TextureLoader().load(SHEETS[id]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // pad > 1: the paper runs on past the drawing's own edge (its edge pixels are paper), the drawing stays w × h
  tex.repeat.set(pad, pad);
  tex.offset.set(-(pad - 1) / 2, -(pad - 1) / 2);
  const mat = basic('#ffffff', {map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const geo = new THREE.PlaneGeometry(w * pad, h * pad);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.castShadow = true;
  // an ink edge, so white paper reads on the pale studio
  const edgeMat = new THREE.LineBasicMaterial({color: '#1d2026', transparent: true, opacity: 0.4, toneMapped: false});
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.01;
  const g = new THREE.Group();
  g.add(m, edge);
  g.userData.mat = mat;
  g.userData.edgeMat = edgeMat;
  g.visible = false;
  return g;
}
/** A flat accent line between two L-1 points at height h (a thin box). */
function bar(parent, a, b, h, w, mat) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(L, w * 0.5, w);
  m.position.set((a[0] + b[0]) / 2, h, -(a[1] + b[1]) / 2);
  m.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
  parent.add(m);
  return m;
}

export function buildModel() {
  const root = new THREE.Group();
  const TM = materials(TOWER_CUT);
  const SM = materials(SITE_CUT);
  // B-10 stays whole when the core is cut: it sits over the shaft the section opens
  const UM = materials(TOWER_CUT, false);
  const glassMeshes = [];
  const capMats = {
    concrete: basic('#5d6067', {side: THREE.DoubleSide}), soil: basic('#5e4a38', {side: THREE.DoubleSide}),
    drain: basic('#3f4246', {side: THREE.DoubleSide}), fill: basic('#a8987f', {side: THREE.DoubleSide}),
  };
  const lineMat = basic('#2457ff');
  const tower = new THREE.Group();
  const site = new THREE.Group();
  root.add(site, tower);

  // ------------------------------------------------------------ the tower, level by level
  const [px0, py0, px1, py1] = TWR.plate;
  const [lx0, ly0, lx1, ly1] = TWR.lift;
  const [cx0, cy0, cx1, cy1] = TWR.core;
  const towerBoxes = [];
  const levels = [];
  const S = 0.3;
  for (const L of LEVELS) {
    const g = new THREE.Group();
    g.position.y = L.y;
    tower.add(g);
    const lv = {L, g, parts: {}};
    // the slab, open over the lift shaft (four boxes round the hole)
    for (const b of [[px0, py0, px1, ly0], [px0, ly1, px1, py1], [px0, ly0, lx0, ly1], [lx1, ly0, px1, ly1]]) boxOf(g, towerBoxes, b, -S, 0, TM.concrete, 'concrete');
    const top = L.roof ? L.h : L.h - S;
    // the core round the lift and the lobby (its east side open where the corridor leaves), the shaft's own walls
    const w = 0.3;
    const coreH = L.roof ? 3.2 : L.h - S;
    const coreWalls = [[cx0, cy0, cx1, cy0 + w], [cx0, cy1 - w, cx1, cy1], [cx0, cy0, cx0 + w, cy1], [cx1 - w, cy0, cx1, TWR.corridor[1]], [lx0, ly1, lx1 + w, ly1 + w], [lx1, ly0, lx1 + w, ly1]];
    for (const b of coreWalls) boxOf(g, towerBoxes, b, 0, coreH, TM.core, 'concrete');
    if (L.roof) boxOf(g, towerBoxes, [cx0, cy0, cx1, cy1], coreH - 0.3, coreH, TM.core, 'concrete');
    if (!L.open) {
      // a closed floor: glass inside the slab edge
      glassMeshes.push(boxOf(g, null, [px0 + 0.2, py0 + 0.2, px1 - 0.2, py1 - 0.2], 0, top, TM.glass, null));
    } else if (!L.roof) {
      // an open floor: the columns, the stair, a terrace ledge for the south planters
      const im = new THREE.InstancedMesh(BOX, TM.column, TWR.columns.length);
      const o = new THREE.Object3D();
      TWR.columns.forEach(([x, y], i) => {
        o.position.set(x, top / 2, -y);
        o.scale.set(0.8, top, 0.8);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      g.add(im);
      const [sx0, sy0, sx1, sy1] = TWR.stair;
      for (const b of [[sx0, sy0, sx1, sy0 + 0.2], [sx0, sy1 - 0.2, sx1, sy1], [sx1 - 0.2, sy0, sx1, sy1]]) boxOf(g, towerBoxes, b, 0, top, TM.wall, 'concrete');
      for (let y = sy0 + 0.6, k = 0; y < sy1 - 0.5; y += 0.4, k++) boxOf(g, null, [sx0 + 0.2, y, sx1 - 0.2, y + 0.4], 0, 0.04 + 0.17 * (k % 9), TM.stair, null, false);
      const ledge = [px0, TWR.planters[0][1], px1, py0];
      boxOf(g, towerBoxes, ledge, -S, 0, TM.concrete, 'concrete');
      glassMeshes.push(boxOf(g, null, [px0, ledge[1], px1, ledge[1] + 0.12], 0, 1.05, TM.glass, null));
    }
    // the landscape on this floor
    const soil = L.n === 5 ? TWR.soil['L-102'] : L.typical ? TWR.soil['L-103'] : L.roof ? TWR.soil['L-104'] : 0;
    const planter = (b, d, rim = 0.2, key) => {
      const pg = new THREE.Group();
      g.add(pg);
      const H = d + 0.25;
      const M = key === 'b10' ? UM : TM;
      const list = key === 'b10' ? null : towerBoxes;
      for (const e of [[b[0], b[1], b[2], b[1] + rim], [b[0], b[3] - rim, b[2], b[3]], [b[0], b[1], b[0] + rim, b[3]], [b[2] - rim, b[1], b[2], b[3]]]) boxOf(pg, list, e, 0, H, key === 'b10' ? M.accent : M.rim, 'concrete');
      boxOf(pg, null, [b[0] + rim, b[1] + rim, b[2] - rim, b[3] - rim], 0, 0.1, M.drain, null);
      const sl = boxOf(pg, list, [b[0] + rim, b[1] + rim, b[2] - rim, b[3] - rim], 0.1, 0.1 + d, M.soil, 'soil');
      const inner = [b[0] + rim, b[1] + rim, b[2] - rim, b[3] - rim];
      const sh = shrubs(pg, inner, 0.1 + d, L.roof ? 0.3 : 0.42, L.roof ? 0.56 : 0.62, Math.round(b[0] * 31 + b[1] * 7 + L.n), M.shrub);
      return {g: pg, soil: sl, shrubs: sh, d, b};
    };
    if (L.n === 5 || L.typical) lv.parts.planters = TWR.planters.map((b) => planter(b, soil));
    if (L.n === 5) {
      // B-10: the podium planter drawn over the lift shaft, its five shrubs
      lv.parts.b10 = planter(TWR.liftPlanter, soil, 0.2, 'b10');
    }
    if (L.typical) {
      // the escape corridor (walls on A-EGRESS): planters inside it along the north wall, niches behind them
      const [kx0, ky0, kx1, ky1] = TWR.corridor;
      const cw = 0.15;
      boxOf(g, towerBoxes, [kx0, ky0 - cw, kx1, ky0], 0, 2.4, TM.wall, 'concrete');
      const cps = TWR.corridorPlanters;
      const depth = cps[0][3] - cps[0][1];
      const segs = [[kx0, cps[0][0]], [cps[0][2], cps[1][0]], [cps[1][2], kx1]];
      for (const [a, b] of segs) boxOf(g, towerBoxes, [a, ky1, b, ky1 + cw], 0, 2.4, TM.wall, 'concrete');
      for (const c of cps) boxOf(g, towerBoxes, [c[0], ky1 + depth, c[2], ky1 + depth + cw], 0, 2.4, TM.wall, 'concrete');
      lv.parts.corridor = cps.map((b) => planter(b, 0.5, 0.08));
    }
    if (L.roof) {
      // parapet, the roof lawn on 0.3 m, the two orange-jasmine planters on 0.3 m
      const pw = 0.25;
      for (const b of [[px0, py0, px1, py0 + pw], [px0, py1 - pw, px1, py1], [px0, py0, px0 + pw, py1], [px1 - pw, py0, px1, py1]]) boxOf(g, towerBoxes, b, 0, 1.1, TM.concrete, 'concrete');
      const rl = TWR.roofLawn;
      boxOf(g, null, rl, 0, 0.1, TM.drain, null);
      boxOf(g, towerBoxes, rl, 0.1, 0.1 + TWR.soil['L-104'], TM.lawn, 'soil');
      lv.parts.roof = TWR.roofPlanters.map((b) => planter(b, TWR.soil['L-104'], 0.2));
    }
    // the lit overlay: a blue tint on the slab and its outline, for a floor the review is pointing at
    const litMat = basic('#2457ff', {transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide});
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(px1 - px0, py1 - py0), litMat);
    lit.rotation.x = -Math.PI / 2;
    lit.position.set((px0 + px1) / 2, 0.03, -(py0 + py1) / 2);
    lit.renderOrder = 4;
    g.add(lit);
    const edgeMat = basic('#2457ff', {transparent: true, opacity: 0});
    const edges = [];
    for (const [a, b] of [[[px0, py0], [px1, py0]], [[px1, py0], [px1, py1]], [[px1, py1], [px0, py1]], [[px0, py1], [px0, py0]]]) {
      edges.push(bar(g, a, b, 0.02, 0.28, edgeMat));
      edges.push(bar(g, a, b, -S - 0.02, 0.28, edgeMat));
    }
    lv.lit = {mat: litMat, edgeMat};
    levels.push(lv);
  }
  const level = (key) => levels.find((l) => l.L.key === key);
  // the lift car, below 5F
  const car = boxOf(tower, null, [lx0 + 0.25, ly0 + 0.25, lx1 - 0.25, ly1 - 0.25], CAR_Y - 1.2, CAR_Y + 1.2, TM.car, null);
  // the person on 8F
  const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.15, 6, 16).translate(0, 0.82, 0), TM.person);
  person.castShadow = true;
  level('8F').g.add(person);
  person.visible = false;

  // ------------------------------------------------------------ the site
  const siteBoxes = [];
  const slabTop = -(P.pit.soil + P.pit.drainage);
  const base = [-4, -9, 54, 53];
  boxOf(site, siteBoxes, base, slabTop - 0.6, slabTop, SM.slab, 'concrete');
  boxOf(site, siteBoxes, base, slabTop, -P.pit.soil, SM.drain, 'drain');
  // the fill between the pits, then the pits themselves (soil 1.0 m on the slab, 150 mm kerbs)
  const pitHalf = P.pit.m / 2;
  const k = 0.15;
  const fillXs = [base[0]];
  for (const r of ROW) fillXs.push(r.x - pitHalf - k, r.x + pitHalf + k);
  fillXs.push(base[2]);
  const rowY = ROW[0].y;
  const band = [rowY - pitHalf - k, rowY + pitHalf + k];
  boxOf(site, siteBoxes, [base[0], base[1], base[2], band[0]], -P.pit.soil, 0, SM.plinth, 'fill');
  boxOf(site, siteBoxes, [base[0], band[1], base[2], base[3]], -P.pit.soil, 0, SM.plinth, 'fill');
  for (let i = 0; i < fillXs.length; i += 2) boxOf(site, siteBoxes, [fillXs[i], band[0], fillXs[i + 1], band[1]], -P.pit.soil, 0, SM.plinth, 'fill');
  const pits = [];
  for (const r of ROW) {
    const pg = new THREE.Group();
    site.add(pg);
    for (const e of [[r.x - pitHalf - k, band[0], r.x - pitHalf, band[1]], [r.x + pitHalf, band[0], r.x + pitHalf + k, band[1]], [r.x - pitHalf, band[0], r.x + pitHalf, band[0] + k], [r.x - pitHalf, band[1] - k, r.x + pitHalf, band[1]]]) boxOf(pg, siteBoxes, e, -P.pit.soil, 0.05, SM.side, 'concrete');
    boxOf(pg, siteBoxes, [r.x - pitHalf, band[0] + k, r.x + pitHalf, band[1] - k], -P.pit.soil, -0.02, SM.soil, 'soil');
    boxOf(pg, null, [r.x - pitHalf, band[0] + k, r.x + pitHalf, band[1] - k], -0.02, 0.0, SM.mulch, null);
    pits.push(pg);
  }
  // surfaces (their own group, so they can rise)
  const surf = new THREE.Group();
  site.add(surf);
  const canvasTex = (draw, rep) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
    t.anisotropy = 8;
    return t;
  };
  const pv = P.site.paving;
  const pavB = pv['PV-1'].box;
  SM.pavers.map = canvasTex((x) => {
    x.fillStyle = '#d9d0c1';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#bdb2a1';
    x.lineWidth = 5;
    for (let r = 0; r < 8; r++) {
      x.beginPath();
      x.moveTo(0, r * 32);
      x.lineTo(256, r * 32);
      x.stroke();
      for (let c = 0; c < 5; c++) {
        const xx = c * 64 + (r % 2) * 32;
        x.beginPath();
        x.moveTo(xx, r * 32);
        x.lineTo(xx, r * 32 + 32);
        x.stroke();
      }
    }
  }, [(pavB[2] - pavB[0]) / 1.6, (pavB[3] - pavB[1]) / 1.6]);
  const gpB = pv['PV-3'].box;
  SM.grassPavers.map = canvasTex((x) => {
    x.fillStyle = '#c9cfbc';
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#a9b897';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) x.fillRect(c * 64 + 10, r * 64 + 10, 44, 44);
  }, [(gpB[2] - gpB[0]) / 1.2, (gpB[3] - gpB[1]) / 1.2]);
  const pavers = boxOf(surf, null, pavB, 0, 0.05, SM.pavers, null, false);
  boxOf(surf, null, pv['PV-2'].box, 0, 0.04, SM.aggregate, null, false);
  boxOf(surf, null, gpB, 0, 0.04, SM.grassPavers, null, false);
  boxOf(surf, null, P.site.fireLane, 0, 0.03, SM.lane, null, false);
  boxOf(surf, null, [base[0], base[1], base[2], 0], 0, 0.02, SM.road, null, false);
  const lawn = boxOf(surf, null, P.site.lawn, 0, 0.08, SM.lawn, null, false);
  const beds = boxOf(surf, null, P.site.beds, 0, 0.12, SM.mulch, null, false);
  const pl = P.site.planter;
  for (const e of [[pl[0], pl[1], pl[2], pl[1] + 0.2], [pl[0], pl[3] - 0.2, pl[2], pl[3]], [pl[0], pl[1], pl[0] + 0.2, pl[3]], [pl[2] - 0.2, pl[1], pl[2], pl[3]]]) boxOf(surf, null, e, 0, 0.45, SM.side, null);
  const bedShrubs = shrubs(surf, P.site.beds, 0.12, 0.34, 0.62, 11, SM.shrub);
  // the hedge: one plant every 0.3 m, two rows
  const hedgePts = [];
  for (const x of HEDGE.x) for (let i = 0; i < HEDGE.perRow; i++) hedgePts.push([x, HEDGE.y0 + i * HEDGE.gap, i]);
  const hedge = new THREE.InstancedMesh(SPH, SM.shrub, hedgePts.length);
  hedge.castShadow = true;
  hedge.receiveShadow = true;
  {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const R = rng(5);
    hedgePts.forEach(([x, y], i) => {
      o.position.set(x, 0.3, -y);
      o.scale.set(0.24, 0.32, 0.24);
      o.updateMatrix();
      hedge.setMatrixAt(i, o.matrix);
      hedge.setColorAt(i, c.setHSL(0.24, 0.14, 0.76 + 0.05 * R()));
    });
  }
  surf.add(hedge);
  // the hedge as drawn: its two lines on the ground (the note's line), lit while the plants grow
  const hedgeLines = HEDGE.x.map((x) => bar(surf, [x, HEDGE.y0], [x, HEDGE.y1], 0.06, 0.09, lineMat));
  // trees
  const trees = new THREE.Group();
  site.add(trees);
  const rowTrees = ROW.map((r, i) => tree(trees, r.x, r.y, r.r, 3 + i * 7, SM));
  const t08 = rowTrees[ROW.findIndex((r) => r.id === T08.object_id)];
  const t08Mat = SM.foliage.clone();
  const FOL = SM.foliage.color.clone();
  const others = [tree(trees, P.site.existing[0], P.site.existing[1], P.site.existing[2], 91, SM), tree(trees, P.site.laneTree[0], P.site.laneTree[1], 1.95, 92, SM), tree(trees, P.site.roadTree[0], P.site.roadTree[1], 1.95, 93, SM)];
  const seven = SEVEN.map((s, i) => tree(trees, s.x, s.y, 1.95, 60 + i, SM));
  for (const g of [...rowTrees, ...others, ...seven]) {
    g.userData.top.material = g === t08 ? t08Mat : SM.foliage;
  }

  // T-08 as drawn: ONE CAD tree symbol, twelve short arcs (its twelve loose LINEs, end to end on the circle) round
  // a centre cross, in its own frame (x east, y north, metres from the centre), posed by film.js
  const symMat = basic('#2457ff', {transparent: true, side: THREE.DoubleSide, depthWrite: false});
  const symbol = new THREE.Group();
  root.add(symbol);
  const [ccx, ccy] = T08.centre;
  const pieces = T08.canopy.map((seg, i) => {
    const [a, b] = seg.points;
    let ta = Math.atan2(a[1] - ccy, a[0] - ccx);
    let tb = Math.atan2(b[1] - ccy, b[0] - ccx);
    if (tb < ta) [ta, tb] = [tb, ta];
    if (tb - ta > Math.PI) [ta, tb] = [tb, ta + 2 * Math.PI];
    const g = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.RingGeometry(T08.radius - 0.06, T08.radius + 0.06, 18, 1, ta, tb - ta), symMat);
    g.add(arc);
    const mid = (ta + tb) / 2;
    const mark = new THREE.Object3D();
    mark.position.set(Math.cos(mid) * T08.radius * 1.32, Math.sin(mid) * T08.radius * 1.32, 0);
    g.add(mark);
    g.userData = {mid, i, mark};
    symbol.add(g);
    return g;
  });
  const cross = new THREE.Group();
  for (const c of T08.cross) {
    const [a, b] = c.points;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.08, Math.abs(b[0] - a[0])), Math.max(0.08, Math.abs(b[1] - a[1]))), symMat);
    m.position.set((a[0] + b[0]) / 2 - ccx, (a[1] + b[1]) / 2 - ccy, 0);
    cross.add(m);
  }
  symbol.add(cross);
  const fullMat = basic('#2457ff', {transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false});
  const fullRing = new THREE.Mesh(new THREE.RingGeometry(T08.radius - 0.07, T08.radius + 0.07, 96), fullMat);
  symbol.add(fullRing);
  symbol.visible = false;
  // the rings a confirmed tree gets (one per row tree)
  const ringMat = basic('#2457ff', {transparent: true, opacity: 0, depthWrite: false});
  const rings = ROW.map((r) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r.r - 0.09, r.r + 0.09, 96), ringMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(r.x, 0.12, -r.y);
    m.renderOrder = 5;
    site.add(m);
    return m;
  });


  // ------------------------------------------------------------ the sheets
  const sheets = new THREE.Group();
  root.add(sheets);
  // L-1 and the colour plan cover the same window as L-1's render (metres, from footprint-v11.json)
  const WIN = [-4.6, -10.6, 78.6, 54.1];
  const winW = WIN[2] - WIN[0];
  const winH = WIN[3] - WIN[1];
  const sheet = {};
  for (const id of ['L-1-revB', 'F-26-p1']) {
    sheet[id] = paper(id, winW, winH);
    sheet[id].position.set((WIN[0] + WIN[2]) / 2, 0, -(WIN[1] + WIN[3]) / 2);
    sheets.add(sheet[id]);
  }
  // the tower sheets: an 80 × 42 m frame plus the renderer's 1.6 m margin, on the tower's frame shifted onto L-1
  const TW = [-4.6, -10.6 + TWR.dy, 78.6, 34.6 + TWR.dy];
  for (const id of ['L-102', 'L-103', 'L-104']) {
    sheet[id] = paper(id, TW[2] - TW[0], TW[3] - TW[1]);
    sheet[id].userData.home = new V3((TW[0] + TW[2]) / 2, 0, -(TW[1] + TW[3]) / 2);
    sheets.add(sheet[id]);
  }
  sheet['L-103b'] = [0, 1, 2].map(() => {
    const g = paper('L-103', TW[2] - TW[0], TW[3] - TW[1]);
    sheets.add(g);
    return g;
  });
  sheet['L-6'] = paper('L-6', L6.w, L6.h, 1.8);
  sheets.add(sheet['L-6']);

  // ------------------------------------------------------------ SAM 3.1's masks, from its own polygons on the colour plan
  const px2m = ([u, v]) => [WIN[0] + (u * winW) / SAM.w, WIN[3] - (v * winH) / SAM.h];
  const maskMat = basic('#2457ff', {transparent: true, opacity: 0.36, depthWrite: false, side: THREE.DoubleSide});
  const maskEdge = new THREE.LineBasicMaterial({color: '#2457ff', toneMapped: false, transparent: true});
  const masks = SAM.rows.map((row) => {
    const g = new THREE.Group();
    for (const poly of row.polys) {
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(...px2m(p))));
      const geo = new THREE.ExtrudeGeometry(shape, {depth: 1, bevelEnabled: false}).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, maskMat);
      m.renderOrder = 6;
      g.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), maskEdge);
      e.renderOrder = 7;
      g.add(e);
    }
    g.visible = false;
    root.add(g);
    return g;
  });

  // ------------------------------------------------------------ section caps, made once per cut
  const CUTS = {
    // the roof: through the south roof planter, looking north (keep y >= the cut)
    roof: {axis: 'y', at: (TWR.roofPlanters[0][1] + TWR.roofPlanters[0][3]) / 2, keepLess: false, list: towerBoxes, plane: TOWER_CUT},
    // the core: through the lift shaft, looking west (keep x <= the cut)
    core: {axis: 'x', at: (lx0 + lx1) / 2, keepLess: true, list: towerBoxes, plane: TOWER_CUT},
    // the pits: through the row, looking north (keep y >= the cut)
    pit: {axis: 'y', at: rowY, keepLess: false, list: siteBoxes, plane: SITE_CUT},
  };
  for (const c of Object.values(CUTS)) c.caps = caps(c.list, c.axis, c.at, c.keepLess, capMats);
  // in the core's section the shaft reads as a dark box below the 5F slab: its three walls' inner faces
  {
    const H = LEVELS[4].y - 0.3;
    const dark = basic('#3d4046', {side: THREE.DoubleSide, clippingPlanes: [TOWER_CUT]});
    const face = (w, x, z, ry) => {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, H + 0.3), dark);
      q.rotation.y = ry;
      q.position.set(x, H / 2 - 0.3 / 2, z);
      q.visible = false;
      tower.add(q);
      CUTS.core.caps.push(q);
    };
    face(ly1 - ly0 - 0.3, lx0 + 0.31, -(ly0 + 0.3 + ly1) / 2, Math.PI / 2);
    face(lx1 - lx0 - 0.3, (lx0 + 0.3 + lx1) / 2, -(ly0 + 0.31), 0);
    face(lx1 - lx0 - 0.3, (lx0 + 0.3 + lx1) / 2, -(ly1 - 0.01), 0);
  }

  // ------------------------------------------------------------ dimension and note lines (accent), placed by film.js
  const dimMat = basic('#2457ff', {transparent: true, opacity: 0});
  const dims = new THREE.Group();
  root.add(dims);
  const dim = () => {
    const g = new THREE.Group();
    const a = new THREE.Mesh(BOX, dimMat);
    const t0 = new THREE.Mesh(BOX, dimMat);
    const t1 = new THREE.Mesh(BOX, dimMat);
    g.add(a, t0, t1);
    g.userData = {a, t0, t1};
    dims.add(g);
    return g;
  };
  const dimA = dim();
  const dimB = dim();
  /** A dimension between two world points, its ticks across it, w thick. */
  const setDim = (g, p, q, w, side = new V3(0, 1, 0)) => {
    const {a, t0, t1} = g.userData;
    const d = new V3().subVectors(q, p);
    const L = d.length();
    const mid = new V3().addVectors(p, q).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), d.clone().normalize());
    a.position.copy(mid);
    a.quaternion.copy(quat);
    a.scale.set(L, w, w);
    const tick = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), side.clone().normalize());
    for (const [t, at] of [[t0, p], [t1, q]]) {
      t.position.copy(at);
      t.quaternion.copy(tick);
      t.scale.set(w * 9, w, w);
    }
    g.visible = true;
  };
  // the roof's 0.4 m line: dashes across the cut face of the south roof planter
  const dashes = new THREE.Group();
  {
    const rp = TWR.roofPlanters[0];
    const y = CUTS.roof.at;
    for (let x = rp[0] - 0.6; x < rp[2] + 0.6; x += 0.5) bar(dashes, [x, y], [Math.min(x + 0.3, rp[2] + 0.6), y], 0, 0.05, dimMat);
    dashes.position.set(0, 0.1 + 0.4, 0.04);
    level('RF').g.add(dashes);
  }

  // ------------------------------------------------------------ fades: whole subsystems turn to air
  const towerMats = [...Object.values(TM), ...Object.values(UM)];
  const siteMats = [...Object.values(SM), t08Mat];
  const fade = (mats, a) => {
    for (const m of mats) {
      const tr = a < 0.999;
      if (m.transparent !== tr) {
        m.transparent = tr;
        m.needsUpdate = true;
      }
      m.opacity = a;
      m.depthWrite = a > 0.5;
    }
  };

  /**
   * s: {assemble 0..1, siteRise, treeGrow, explode, drawers {key: [dx, dz]}, lift {key: dy}, lit {key: 0..1},
   *     towerA, siteA, cut: null | {name, k}, b10 (x offset), roofSoil (m), corridorOut 0..1, person {x, y, a},
   *     examine 0..1, symbol {a, pos, rotX, rotY, drift, close}, rings, glassA, sheets {id: {pos, rotX, rotY, a, s}},
   *     masks [0..1], hedge 0..1, hedgeLine 0..1, pavers 0..1, shrink 0..1, seven [0..1], dims}
   */
  const tmp = new V3();
  const update = (s) => {
    // tower: assemble, explode, drawers, lift away
    const n = levels.length;
    levels.forEach((lv, i) => {
      const k = Math.min(1, Math.max(0, (s.assemble ?? 1) * (n + 3) - i));
      const e = k * k * (3 - 2 * k);
      const [dx, dz] = s.drawers?.[lv.L.key] ?? [0, 0];
      lv.g.position.set(dx, lv.L.y + (s.explode ?? 0) * GAP * i + (s.lift?.[lv.L.key] ?? 0) + (1 - e) * 6, dz);
      lv.g.scale.set(1, Math.max(0.001, e), 1);
      lv.g.visible = e > 0.002;
      const l = s.lit?.[lv.L.key] ?? 0;
      lv.lit.mat.opacity = 0.34 * l;
      lv.lit.edgeMat.opacity = l;
      lv.lit.mat.visible = l > 0.002;
      lv.lit.edgeMat.visible = l > 0.002;
    });
    car.position.y = CAR_Y + (s.explode ?? 0) * GAP * 3;
    fade(towerMats, s.towerA ?? 1);
    tower.visible = (s.towerA ?? 1) > 0.01;
    fade(siteMats, s.siteA ?? 1);
    site.visible = (s.siteA ?? 1) > 0.01;
    // section
    for (const [name, c] of Object.entries(CUTS)) {
      const on = s.cut?.name === name;
      for (const q of c.caps) q.visible = on && (s.cut.k ?? 0) > 0.999;
    }
    TOWER_CUT.constant = KEEP_ALL;
    SITE_CUT.constant = KEEP_ALL;
    if (s.cut) {
      const c = CUTS[s.cut.name];
      // the plane sweeps in from outside the model to its place
      const far = c.axis === 'x' ? 40 : 30;
      const at = c.at + (1 - (s.cut.k ?? 1)) * (c.keepLess ? far : -far);
      if (c.axis === 'x') {
        c.plane.normal.set(c.keepLess ? -1 : 1, 0, 0);
        c.plane.constant = c.keepLess ? at : -at;
      } else {
        // L-1 y = -z; keep y >= at means -z >= at, i.e. -z - at >= 0
        c.plane.normal.set(0, 0, c.keepLess ? 1 : -1);
        c.plane.constant = c.keepLess ? at : -at;
      }
    }
    for (const m of glassMeshes) m.visible = (s.glassA ?? 1) > 0.5;
    // the floor's own parts
    const b10 = level('5F').parts.b10;
    b10.g.position.z = -(s.b10 ?? 0);
    const roof = level('RF').parts.roof;
    for (const r of roof) {
      const d = s.roofSoil ?? r.d;
      r.soil.scale.y = d;
      r.soil.position.y = 0.1 + d / 2;
      r.shrubs.position.y = d - r.d;
    }
    for (const L of ['8F', '12F', '16F', '20F']) for (const c of level(L).parts.corridor) c.g.position.z = -(s.corridorOut ?? 0) * (c.b[3] - c.b[1] + 0.15);
    person.visible = (s.person?.a ?? 0) > 0.01;
    if (person.visible) person.position.set(s.person.x, 0, -s.person.y);
    // site: the surfaces rise, the trees grow
    const rise = s.siteRise ?? 1;
    surf.scale.y = Math.max(0.001, rise);
    surf.visible = rise > 0.002;
    const grow = s.treeGrow ?? 1;
    const shrink = 1 - 0.28 * (s.shrink ?? 0);
    for (const g of rowTrees) {
      g.scale.setScalar(Math.max(0.001, grow));
      g.userData.top.scale.setScalar(shrink);
      g.userData.top.position.y = (1 - shrink) * 1.2;
    }
    for (const g of others) g.scale.setScalar(Math.max(0.001, grow));
    seven.forEach((g, i) => {
      const k = s.seven?.[i] ?? 0;
      g.visible = k > 0.002;
      g.scale.setScalar(Math.max(0.001, k));
    });
    // T-08: the tree takes the accent; its drawing stands beside it, the arcs drift apart, close into one ring
    const ex = s.examine ?? 0;
    t08Mat.color.copy(FOL).lerp(ACCENT, ex);
    t08Mat.emissive.copy(ACCENT);
    t08Mat.emissiveIntensity = 0.28 * ex;
    const sy = s.symbol;
    symbol.visible = !!sy && sy.a > 0.01;
    if (symbol.visible) {
      symbol.position.copy(sy.pos);
      symbol.rotation.set(sy.rotX ?? 0, sy.rotY ?? 0, 0, 'YXZ');
      symMat.opacity = sy.a * (1 - (sy.close ?? 0));
      fullMat.opacity = sy.a * (sy.close ?? 0);
      // what is not drawn stays out of the AO and ink buffers too
      fullRing.visible = fullMat.opacity > 0.01;
      for (const g of pieces) g.visible = symMat.opacity > 0.01;
      cross.visible = sy.a > 0.01;
      const dr = sy.drift ?? 0;
      for (const g of pieces) {
        const {mid, i} = g.userData;
        g.position.set(Math.cos(mid) * 0.32 * dr, Math.sin(mid) * 0.32 * dr, (((i * 7) % 5) - 2) * 0.16 * dr);
        g.rotation.set(0.25 * dr * Math.sin(i * 1.7), 0.25 * dr * Math.cos(i * 2.3), 0);
      }
      cross.position.z = 0.05 * dr;
    }
    ringMat.opacity = s.rings ?? 0;
    for (const r of rings) r.visible = (s.rings ?? 0) > 0.01;
    // the hedge grows plant by plant along its two lines
    const hg = s.hedge ?? 1;
    if (hg < 1) {
      // both rows grow together from the south end, a plant every 0.3 m
      const o = new THREE.Object3D();
      hedgePts.forEach(([x, y, i], j) => {
        const show = i < Math.round(HEDGE.perRow * hg);
        o.position.set(x, 0.3, -y);
        o.scale.set(show ? 0.24 : 1e-4, show ? 0.32 : 1e-4, show ? 0.24 : 1e-4);
        o.updateMatrix();
        hedge.setMatrixAt(j, o.matrix);
      });
      hedge.instanceMatrix.needsUpdate = true;
      hedge.userData.dirty = true;
    } else if (hedge.userData.dirty) {
      const o = new THREE.Object3D();
      hedgePts.forEach(([x, y], j) => {
        o.position.set(x, 0.3, -y);
        o.scale.set(0.24, 0.32, 0.24);
        o.updateMatrix();
        hedge.setMatrixAt(j, o.matrix);
      });
      hedge.instanceMatrix.needsUpdate = true;
      hedge.userData.dirty = false;
    }
    for (const l of hedgeLines) l.visible = (s.hedgeLine ?? 0) > 0.01;
    // the pavers lift a little and take the accent
    const pa = s.pavers ?? 0;
    pavers.position.y = 0.025 + pa * 0.35;
    SM.pavers.emissive.copy(ACCENT);
    SM.pavers.emissiveIntensity = 0.42 * pa;
    lawn.position.y = 0.04;
    // sheets
    for (const [id, g] of Object.entries(sheet)) {
      const list = Array.isArray(g) ? g : [g];
      list.forEach((gg, j) => {
        const st = s.sheets?.[Array.isArray(g) ? `${id}.${j}` : id];
        gg.visible = !!st && st.a > 0.004;
        if (!gg.visible) return;
        gg.userData.mat.opacity = st.a;
        gg.userData.edgeMat.opacity = Math.min(1, 0.4 * st.a * (st.edge ?? 1));
        if (st.pos) gg.position.copy(st.pos);
        gg.rotation.set(st.rotX ?? 0, st.rotY ?? 0, 0, 'YXZ');
        gg.scale.setScalar(st.s ?? 1);
      });
    }
    // masks
    SAM.rows.forEach((r, i) => {
      const k = s.masks?.[i] ?? 0;
      masks[i].visible = k > 0.003;
      masks[i].position.y = (s.maskY ?? 0) + 0.02;
      masks[i].scale.y = Math.max(0.001, k * 0.9);
    });
    maskEdge.opacity = Math.min(1, (s.masks ?? []).reduce((a, b) => Math.max(a, b), 0) * 3);
    // dimensions
    dimMat.opacity = s.dimA ?? 0;
    dimA.visible = !!s.dimA && !!s.dim1;
    dimB.visible = !!s.dimA && !!s.dim2;
    if (s.dim1) setDim(dimA, s.dim1[0], s.dim1[1], s.dim1[2], s.dim1[3]);
    if (s.dim2) setDim(dimB, s.dim2[0], s.dim2[1], s.dim2[2], s.dim2[3]);
    dashes.visible = !!s.dashes && (s.dimA ?? 0) > 0;
  };

  return {root, tower, site, levels, level, update, sheet, sheets, masks, CUTS, rowTrees, t08, pieces, symbol, seven, car, person, WIN, slabTop};
}
export {FIG};
