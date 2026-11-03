import {ThreeCanvas} from '@remotion/three';
import {useEffect, useMemo, useState} from 'react';
import {useFrame, useThree} from '@react-three/fiber';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {AbsoluteFill, continueRender, delayRender, staticFile, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {HDRLoader} from 'three/examples/jsm/loaders/HDRLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {GTAOPass} from 'three/examples/jsm/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {FullScreenQuad, Pass} from 'three/examples/jsm/postprocessing/Pass.js';
import {Reflector} from 'three/examples/jsm/objects/Reflector.js';
import {DAY, NIGHT} from './v6-look';
import type {V6Spec} from './v6-look';
import type {LookSpec} from './v5-look';
import t08 from './t08.json';
import fpJson from './footprint-v11.json';
import {B, V2 as V11} from './film-v2-cues.js';

/**
 * Film v6 — the hybrid: V2's world and beats, V4's explode, lift-shaft section and corridor, and an architectural tower
 * (podium in stone, an open 5F garden, a finned curtain wall, sky gardens on 8F/12F/16F/20F, a roof garden and crown),
 * by day in Part 1 (a low sun, a cloudy sky in the glass) and at night at the end. GTAO on every frame; bloom at night.
 *
 * Film v5 — WorldV2 with real PBR materials (Poly Haven CC0, public/v5/textures/SOURCES.md) and one of four looks
 * (v5-look.ts: studio white, ink black, cobalt blueprint, night render); the same scene, camera path and beats.
 * Leafy canopies are leaf cards on clustered shells; the tower is a glass curtain wall on aluminium mullions, concrete slabs
 * and a stone podium, with a roof garden. As WorldV2 below.
 *
 * Film v2 — the final look of the v11 world (WorldV11.tsx): the same scene, camera path and beats, with real materials
 * (paper with grain and soft contact shadows, concrete, glass, soil, foliage as clustered spheres), a soft key, a fill
 * and a low warm rim, an ink / paper / cobalt palette (red and amber only on status dots; green only for a fix or a
 * find). The opening now lands on L-6 (the tree-pit detail on Eric's monitor): L-6 is the first sheet.
 *
 * As v11: Part 1 (0:15–1:33) and the end: one world under one camera path. L-1, the planting plan (1 m =
 * 1 unit), lies on the ground; the tower's footprint is drawn on the same paper north of the landscape and the tower
 * stands on it; the 3D trees stand on L-1's circles in front. L-101 is the sheet the camera pulls back from; the other
 * sheets fly in and stack, then settle into the tower. The floors slide out like drawers; each problem is shown and
 * fixed in the scene: the typical floor's three other floors light green, the lift-shaft planter (a box of shrubs)
 * leaves the open shaft, the corridor's planters step into the wall line, the hedge's 182 plants grow along their
 * line, the paper turns translucent over one tree's pit on the slab. `dusk` is the end: the same project at dusk.
 * No text in the scene — the overlay places its cards with `projectAt`. Nothing coplanar: the ground sits 3 m below
 * the paper, tints float above it with a polygon offset.
 */
export type WorldSheet = {id: string; png: string};
export type WorldV6Props = {t: number; sheets: WorldSheet[]; l1: string; dusk?: number; cold?: boolean};
/** The look of the current frame: day in Part 1, night at the end. */
let L: V6Spec = DAY;
/** The sheet the opening pushes into and the world pulls back from. */
export const FIRST = 'L-6';

const SX = (X: number) => X + t08.svg.offset_x;
const SZ = (Y: number) => t08.svg.flip_y - Y;
export const T8 = {x: SX(t08.centre[0]), z: SZ(t08.centre[1])};
export const T10 = {x: SX(39.0), z: SZ(-2.6), r: 1.95};
export const ROW = [...t08.row].sort((a, b) => a.centre[0] - b.centre[0]).map((r) => ({id: r.id, x: SX(r.centre[0]), z: SZ(r.centre[1]), r: r.r}));
export const HEDGE = {x: SX(48.8), z0: SZ(1.5), z1: SZ(28.5), n: 91, gap: 0.42};
export const PAVERS = {x: 44, z: 26.4, w: 12, d: 4.2};
/** The pit beat's tree: the third camphor of the row; the seven new trees go in the strip between the beds and the row. */
export const PT = ROW[2];
export const SEVEN = Array.from({length: 7}, (_, k) => ({x: 12 + k * 4, z: 26.6, r: 1.0}));

// ---------------------------------------------------------------- the paper and the footprint (public/v11/footprint.json)
type FPFile = {placeholder?: boolean; sheet?: {outline: number[][]}; render?: {window_m: number[]}};
const fpFile = fpJson as FPFile;
/** L-1 as rendered (Rev B, with the tower's footprint): the window in sheet metres; world x = X + 4.6, z = 34.6 − Y. */
const WIN = fpFile.render?.window_m ?? [-4.6, -10.6, 78.6, 34.6];
export const L1 = {w: WIN[2] - WIN[0], h: WIN[3] - WIN[1], x0: SX(WIN[0]), z0: SZ(WIN[3])};
type Rect = {cx: number; cz: number; w: number; d: number};
function footprint(): {placeholder: boolean; podium: Rect; tower: Rect} {
  const o = fpFile.sheet?.outline;
  if (!fpFile.placeholder && o && o.length > 2) {
    const xs = o.map((p) => SX(p[0]));
    const zs = o.map((p) => SZ(p[1]));
    const podium = {cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs)};
    return {placeholder: false, podium, tower: {...podium, w: podium.w * 0.78, d: podium.d * 0.78}};
  }
  // PLACEHOLDER (no footprint.json yet): drawn north of the landscape on a paper continued past L-1's top edge
  return {placeholder: true, podium: {cx: 29.6, cz: -24, w: 44, d: 26}, tower: {cx: 29.6, cz: -24, w: 24, d: 16}};
}
export const FOOT = footprint();
const TOWER = {x: FOOT.podium.cx, z: FOOT.podium.cz, podW: FOOT.podium.w, podD: FOOT.podium.d, podH: 4.5, podFloors: 4, twrW: FOOT.podium.w, twrD: FOOT.podium.d, twrH: 3.4, twrFloors: 16};
const DECK_Y = TOWER.podFloors * TOWER.podH;
type Slab = {i: number; y: number; w: number; d: number; floor: string};
const SLABS: Slab[] = [];
for (let k = 0; k < TOWER.podFloors; k++) SLABS.push({i: SLABS.length, y: k * TOWER.podH, w: TOWER.podW, d: TOWER.podD, floor: String(k + 1)});
for (let k = 0; k < TOWER.twrFloors; k++) SLABS.push({i: SLABS.length, y: DECK_Y + k * TOWER.twrH, w: TOWER.twrW, d: TOWER.twrD, floor: String(k + 5)});
SLABS.push({i: SLABS.length, y: DECK_Y + TOWER.twrFloors * TOWER.twrH, w: TOWER.twrW, d: TOWER.twrD, floor: 'R'});
export const floorY = (f: string) => SLABS.find((s) => s.floor === f)!.y;
export const TX = TOWER.x;
export const TZ = TOWER.z;
export const DRAWER = 46;
const S0 = 40; // the stack's bottom sheet (L-6, the first) before the tower settles
const H0 = 64.3; // the camera height at which the first sheet fills the frame (fov 40, 16:9)
const aspect = (tx: THREE.Texture) => {
  const im = tx.image as {width: number; height: number} | undefined;
  return im && im.width ? im.height / im.width : 1140 / 2100;
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number, fn: (u: number) => number = smooth) => fn(clamp01((t - a) / (b - a)));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y5 = floorY('5');
const Y8 = floorY('8');
const YR = floorY('R');
const DR = DRAWER;

// ---------------------------------------------------------------- the camera: one path
type Key = {t: number; pos: THREE.Vector3; look: THREE.Vector3; fov?: number; straight?: number};
/** An orbit key: a target, azimuth from south (+z) toward east (+x), elevation, distance (degrees, metres); a 38 mm lens. */
const ORB = (tg: [number, number, number], az: number, el: number, d: number, fov = 30, straight = 1) => {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return {pos: V(tg[0] + d * Math.cos(e) * Math.sin(a), tg[1] + d * Math.sin(e), tg[2] + d * Math.cos(e) * Math.cos(a)), look: V(...tg), fov, straight};
};
/** Aim off-centre: the target sits `nx` (NDC, −1…1) across the frame. */
const SIDE = (k: {pos: THREE.Vector3; look: THREE.Vector3; fov: number; straight: number}, nx: number) => {
  const f = k.look.clone().sub(k.pos);
  const d = f.length();
  const right = new THREE.Vector3(-f.z, 0, f.x).normalize();
  const half = Math.atan(Math.tan(((k.fov / 2) * Math.PI) / 180) * (16 / 9));
  return {...k, look: k.look.clone().add(right.multiplyScalar(-nx * d * Math.tan(half)))};
};
const TOP = (x: number, y: number, z: number, h: number): [THREE.Vector3, THREE.Vector3] => [V(x, y + h, z + 0.02), V(x, y, z)];
/** The lift shaft's centre in tower-local metres (PKG.lift; SHAFT below is the same square on L-102's drawer). */
const SHAFT_C = {x: -2.75, z: 2.75};
const KEYS: Key[] = [
  {t: B.push, pos: V(TX, S0 + H0, TZ + 0.01), look: V(TX, S0, TZ), fov: 40},
  {t: B.pull, pos: V(TX, S0 + H0, TZ + 0.01), look: V(TX, S0, TZ), fov: 40},
  {t: 17.4, pos: V(TX + 70, S0 + 46, TZ + 112), look: V(TX, S0 + 4, TZ), fov: 40},
  // v6.2: open on the tower standing on L-1, then push in until it fills the frame, the drawing still at its base
  // (verticals straight: a 38 mm lens, the lens shifted, not tilted)
  {t: 18.6, ...ORB([TX + 10, 30, TZ + 8], 28, 20, 255)},
  {t: 21.0, ...ORB([TX + 4, 32, TZ + 2], 33, 13, 200)},
  // the explode, zoomed on the typical floors: 8F to 20F out to the east, large; the one L-103 card on the right
  {t: 22.2, ...SIDE(ORB([TX + 19, 88, TZ + 4], 24, 9, 222), -0.33)},
  {t: 26.9, ...SIDE(ORB([TX + 19, 88, TZ + 4], 26, 9, 214), -0.33)},
  // the roof drawer, large on the left; the section and its number on the right
  {t: 28.4, ...SIDE(ORB([TX + 14, YR + 1, TZ + 3], 26, 24, 60, 30, 0.8), -0.46)},
  {t: 31.6, ...SIDE(ORB([TX + 14, YR + 1, TZ + 3], 27, 24, 59, 30, 0.8), -0.46)},
  // the two alike sheets (V2's view, the 38 mm lens)
  {t: 33.0, pos: V(TX + 81, 52, TZ + 57), look: V(TX + 44, 25, TZ), fov: 30, straight: 0.5},
  {t: 34.8, pos: V(TX + 81.5, 52, TZ + 56.5), look: V(TX + 44, 25, TZ), fov: 30, straight: 0.5},
  // v6.3: V2's lift beat, the camera and motion as V2: over L-102's drawer, the open shaft and planter B-10 on the drawing
  {t: 36.2, pos: V(TX + DR + SHAFT_C.x - 2.4, Y5 + 12.5, TZ + SHAFT_C.z + 6.5), look: V(TX + DR + SHAFT_C.x + 0.6, Y5 - 2.0, TZ + SHAFT_C.z), fov: 42},
  {t: 38.9, pos: V(TX + DR + SHAFT_C.x - 2.2, Y5 + 12.5, TZ + SHAFT_C.z + 6.4), look: V(TX + DR + SHAFT_C.x + 0.6, Y5 - 2.0, TZ + SHAFT_C.z), fov: 42},
  // v6.7: on the way to the corridor the camera keeps the tower's 8F level in frame (no blank white frame)
  {t: 39.5, pos: V(TX + 26, Y8 + 16, TZ + 14), look: V(TX + 4, Y8 + 1, TZ - 3), fov: 34},
  // the escape corridor from above (V4), closer: the corridor and the stair on the right, the text on the left
  {t: 40.3, ...(([p, l]) => ({pos: p, look: l}))(TOP(28.3, Y8, -8.6, 20.5)), fov: 30},
  {t: 45.2, ...(([p, l]) => ({pos: p, look: l}))(TOP(28.3, Y8, -8.6, 20.5)), fov: 30},
  {t: 46.7, pos: V(TX + 48, 53, 118), look: V(TX, 22, 4), fov: 30, straight: 0.6},
  {t: 48.0, pos: V(23, 3.6, 47), look: V(31, 5.5, 16), fov: 45},
  {t: 49.7, ...(([p, l]) => ({pos: p, look: l}))(TOP(T8.x, 0, T8.z, 14)), fov: 45},
  {t: 50.3, ...(([p, l]) => ({pos: p, look: l}))(TOP(T8.x, 0, T8.z, 14)), fov: 45},
  {t: 51.2, pos: V(T8.x + 7.5, 5.5, T8.z + 7.5), look: V(T8.x - 2.1, 1.2, T8.z + 2.1), fov: 45},
  {t: 52.6, pos: V(T8.x + 8.4, 5.6, T8.z + 6.6), look: V(T8.x - 2.1, 1.2, T8.z + 2.1), fov: 45},
  {t: 53.5, ...(([p, l]) => ({pos: p, look: l}))(TOP(T8.x, 0, T8.z, 14)), fov: 45},
  {t: 57.4, ...(([p, l]) => ({pos: p, look: l}))(TOP(T8.x, 0, T8.z, 14)), fov: 45},
  {t: 65.4, ...(([p, l]) => ({pos: p, look: l}))(TOP(24, 0, 31.6, 23)), fov: 45},
  {t: 68.4, ...(([p, l]) => ({pos: p, look: l}))(TOP(24, 0, 31.6, 23)), fov: 45},
  {t: 69.8, pos: V(HEDGE.x + 15, 12, (HEDGE.z0 + HEDGE.z1) / 2 + 0.5), look: V(HEDGE.x - 0.5, 0, (HEDGE.z0 + HEDGE.z1) / 2), fov: 45},
  {t: 73.9, pos: V(HEDGE.x + 15, 12, (HEDGE.z0 + HEDGE.z1) / 2 + 0.5), look: V(HEDGE.x - 0.5, 0, (HEDGE.z0 + HEDGE.z1) / 2), fov: 45},
  {t: 75.0, pos: V(50, 17, 44), look: V(44, 0, 27), fov: 45},
  {t: 77.2, pos: V(50, 17, 44), look: V(44, 0, 27), fov: 45},
  {t: 78.3, pos: V(PT.x + 6, 2.4, PT.z + 9), look: V(PT.x, 2.4, PT.z), fov: 45},
  {t: 80.0, pos: V(PT.x + 6.4, 6.6, PT.z + 9.0), look: V(PT.x - 0.4, 0.2, PT.z), fov: 45},
  {t: 82.6, pos: V(PT.x + 6.8, 6.9, PT.z + 9.4), look: V(PT.x - 0.4, 0.3, PT.z), fov: 45},
  {t: 84.0, pos: V(PT.x + 10, 17, PT.z + 15), look: V(25, 0, 27), fov: 45},
  {t: 86.6, pos: V(PT.x + 10, 17.5, PT.z + 15.5), look: V(25, 0, 27), fov: 45},
  {t: 88.6, pos: V(TX + 40, 120, 96), look: V(TX + 4, 10, 4), fov: 42},
  {t: B.type, pos: V(TX + 38, 124, 98), look: V(TX + 4, 10, 4), fov: 42},
];
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k.pos), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k.look), false, 'centripetal');
type Cam = {pos: THREE.Vector3; look: THREE.Vector3; fov: number; straight?: number};
/**
 * v6.3 the opening, after the push lands on the first sheet: not a zoom. A slow oblique slider glide across the sheet on
 * a long lens (16°, about 85 mm), low (24° above the paper), from its lower-left corner toward the centre, eased ends; it
 * rises as the stack begins and hands over to the wide on the tower (the 19.4 key).
 */
const GLIDE = {a: 15.3, b: 17.8, el: 24, az: -22, d: 50, fov: 16, from: [-30, 19] as [number, number], to: [-2, 2] as [number, number]};
/**
 * The glide as a reusable camera segment: starts at `start`, lasts `dur` s, over a sheet centred at `c` (lying flat).
 * The next opening (Eric's restructure) runs it from 0:00 over L-1; this cut runs it from the landing (GLIDE.a).
 */
export function glideCam(t: number, start: number, dur = GLIDE.b - GLIDE.a, c: [number, number, number] = [TX, S0, TZ]): Cam {
  const g = GLIDE;
  const u = smooth(clamp01((t - start) / dur));
  const lk = V(c[0] + lerp(g.from[0], g.to[0], u), c[1], c[2] + lerp(g.from[1], g.to[1], u));
  const a = (g.az * Math.PI) / 180;
  const e = (g.el * Math.PI) / 180;
  const pos = lk.clone().add(V(g.d * Math.cos(e) * Math.sin(a), g.d * Math.sin(e), g.d * Math.cos(e) * Math.cos(a)));
  return {pos, look: lk, fov: g.fov, straight: 0};
}
const glideAt = (t: number): Cam => glideCam(t, GLIDE.a);
const camMix = (p: Cam, q: Cam, w: number): Cam => ({pos: p.pos.clone().lerp(q.pos, w), look: p.look.clone().lerp(q.look, w), fov: lerp(p.fov, q.fov, w), straight: lerp(p.straight ?? 0, q.straight ?? 0, w)});
const KEY_WIDE = 18.6;
function openingAt(t: number): Cam {
  // v6.4: the glide is the cold open's now; after the push the camera rises and pulls straight back as the sheets stack
  const k0 = KEYS[1];
  const top: Cam = {pos: k0.pos, look: k0.look, fov: k0.fov ?? 40, straight: 0};
  const wk = KEYS.find((k) => k.t === KEY_WIDE)!;
  const wide: Cam = {pos: wk.pos, look: wk.look, fov: wk.fov ?? 30, straight: wk.straight ?? 0};
  const up: Cam = {pos: top.pos.clone().add(V(10, 26, 30)), look: top.look.clone().add(V(4, 4, 0)), fov: 34, straight: 0};
  // v6.9: slower and continuous (eased hand-offs), so fine linework never sweeps fast across the frame
  const c1 = camMix(top, up, smooth(clamp01((t - B.pull) / 2.0)));
  return camMix(c1, wide, smooth(clamp01((t - 15.8) / (KEY_WIDE - 15.8))));
}
/** The opening's lens blur: on the linework through the middle, the near and far paper soft (0 outside the glide). */
export function glideDof(t: number): {k: number; focus: number} {
  // v6.4: no lens blur after the push (the glide's shallow focus is in the cold open: coldDof)
  const k = 0 * Math.min(ov(t, B.pull, B.pull + 0.7), 1 - ov(t, 17.2, 17.9));
  const c = openingAt(Math.max(t, B.pull));
  return {k, focus: c.pos.distanceTo(c.look)};
}
function pathAt(t: number): Cam {
  if (t > B.pull && t < KEY_WIDE) return openingAt(t);
  const n = KEYS.length - 1;
  if (t <= KEYS[0].t) return {pos: KEYS[0].pos, look: KEYS[0].look, fov: KEYS[0].fov ?? 42, straight: KEYS[0].straight ?? 0};
  if (t >= KEYS[n].t) return {pos: KEYS[n].pos, look: KEYS[n].look, fov: KEYS[n].fov ?? 42, straight: KEYS[n].straight ?? 0};
  let k = 0;
  while (k < n && t > KEYS[k + 1].t) k++;
  const a = KEYS[k];
  const b = KEYS[k + 1];
  const e = smooth(clamp01((t - a.t) / (b.t - a.t)));
  // a still segment (same key twice) holds exactly; a moving one follows the curve through the keys
  if (a.pos.equals(b.pos) && a.look.equals(b.look)) return {pos: a.pos, look: a.look, fov: a.fov ?? 42, straight: a.straight ?? 0};
  const u = (k + e) / n;
  return {pos: posCurve.getPoint(u), look: lookCurve.getPoint(u), fov: lerp(a.fov ?? 42, b.fov ?? 42, e), straight: lerp(a.straight ?? 0, b.straight ?? 0, e)};
}
/** The end: a slow drift past the tower at dusk, from the south-east. `u` 0–1 over the end. */
function duskAt(u: number): Cam {
  // v6: a long lens at night, the tower on the right third, verticals straight
  // v6.3: night architectural photography: eye level (2.2 m), a long lens (20°), verticals straight, a slow slide
  const a = -0.7 + 0.1 * u;
  const r = 362 - 10 * u;
  const tw = V(TX, 27, TZ);
  const pos = V(TX + Math.sin(a) * -r, 2.2, TZ + Math.cos(a) * r);
  const f = tw.clone().sub(pos);
  const right = new THREE.Vector3(-f.z, 0, f.x).normalize();
  const half = Math.atan(Math.tan((10 * Math.PI) / 180) * (16 / 9));
  return {pos, look: tw.clone().add(right.multiplyScalar(-0.56 * f.length() * Math.tan(half))), fov: 20, straight: 1};
}
// ---------------------------------------------------------------- v6.4: the cold open (0:00–0:09)
/** Thirty sheets (the package and L-1 on top) on the ground at L-1's place: a neat pile, thirty in the air, a messy pile. */
export const COLD_END = 10.2;
const COLD = {cx: L1.x0 + L1.w / 2, cz: L1.z0 + L1.h / 2, n: 30};
type ColdPose = {p: THREE.Vector3; yaw: number; pitch: number; roll: number};
// made on first use (the seeded rand is defined further down the module)
let COLD_SH: {pile: ColdPose; air: ColdPose; mess: ColdPose; bob: number}[] | null = null;
const coldSheets = () => (COLD_SH ??= Array.from({length: COLD.n}, (_, i) => {
  const r = rand(500 + i * 31);
  const col = i % 6;
  const row = Math.floor(i / 6);
  return {
    pile: {p: V(COLD.cx + (r() - 0.5) * 1.4, 0.03 + i * 0.05, COLD.cz + (r() - 0.5) * 1.2), yaw: (r() - 0.5) * 0.03, pitch: 0, roll: 0},
    // v6.8: a neat 6 × 5 grid on the ground, like a laid-out contact sheet (pitch 92 × 72 m: no two sheets touch)
    air: {p: V(COLD.cx + (col - 2.5) * 92, 0.06, COLD.cz + (row - 2) * 72), yaw: 0, pitch: 0, roll: 0},
    mess: {p: V(COLD.cx + (r() - 0.5) * 34, 0.04 + i * 0.075, COLD.cz + (r() - 0.5) * 24), yaw: (r() - 0.5) * 1.2, pitch: 0, roll: 0},
    bob: r() * Math.PI * 2,
  };
}));
const poseMix = (a: ColdPose, b: ColdPose, u: number, uy = u): ColdPose => ({p: V(lerp(a.p.x, b.p.x, u), lerp(a.p.y, b.p.y, uy), lerp(a.p.z, b.p.z, u)), yaw: lerp(a.yaw, b.yaw, u), pitch: lerp(a.pitch, b.pitch, u), roll: lerp(a.roll, b.roll, u)});
/**
 * Sheet i of the cold open at t (v6.8): the top sheet first, each slides out of the pile in turn (3.0–4.6, 0.5 s each)
 * into its cell, the grid complete at 5.1; then each lifts on its own arc (its own height, so no two meet) into the mess.
 * Flat sheets on separate heights never intersect; on the ground they never overlap.
 */
export function coldSheetAt(t: number, i: number): ColdPose {
  const c = coldSheets()[i];
  const k = COLD.n - 1 - i;
  const out = smooth(clamp01((t - (3.0 + k * 0.055)) / 0.5));
  const lift = 0.6 + i * 0.6;
  const a = poseMix(c.pile, c.air, out);
  if (out > 0 && out < 1) a.p.y = lerp(c.pile.p.y, c.air.p.y, out) + Math.sin(out * Math.PI) * lift;
  const f = clamp01((t - (6.0 + i * 0.03)) / 0.8);
  if (f <= 0) return a;
  const b = poseMix(a, c.mess, smooth(f));
  b.p.y = lerp(a.p.y, c.mess.p.y, smooth(f)) + Math.sin(f * Math.PI) * (8 + i * 1.2);
  return b;
}
/** The cold open's camera: already gliding at 0:00 over L-1 on the pile; up and back to see thirty; down onto the mess. */
function coldCam(t: number): Cam {
  const top = coldSheets()[COLD.n - 1].pile.p;
  const g = glideCam(Math.min(t, 3.0), -0.7, 3.9, [COLD.cx, top.y, COLD.cz]);
  const o = (tg: [number, number, number], az: number, el: number, d: number): Cam => ORB(tg, az, el, d, 30, 0);
  const air = camMix(SIDE(o([COLD.cx, 0, COLD.cz + 6], 12, 40, 820) as Cam & {fov: number; straight: number}, 0.2), SIDE(o([COLD.cx, 0, COLD.cz + 6], 16, 40, 800) as Cam & {fov: number; straight: number}, 0.2), smooth(clamp01((t - 4.6) / 1.6)));
  // the pile on the right half, clear of the big number on the left
  const mess = camMix(SIDE(o([COLD.cx, 1, COLD.cz + 1], 22, 52, 178) as Cam & {fov: number; straight: number}, 0.36), SIDE(o([COLD.cx + 4, 1.5, COLD.cz + 3], 25, 54, 140) as Cam & {fov: number; straight: number}, 0.36), smooth(clamp01((t - 7.0) / 3.0)));
  const c1 = camMix(g, air, smooth(clamp01((t - 2.85) / 2.05)));
  return camMix(c1, mess, smooth(clamp01((t - 5.95) / 1.35)));
}
/** The glide's shallow focus (on the linework through the middle), gone as the camera rises. */
export function coldDof(t: number): {k: number; focus: number} {
  const c = coldCam(t);
  return {k: 1 - ov(t, 2.5, 3.3), focus: c.pos.distanceTo(c.look)};
}
export function cameraAt(t: number, dusk?: number): Cam {
  if (dusk === undefined && t < COLD_END) return coldCam(t);
  return dusk !== undefined ? duskAt(dusk) : pathAt(t);
}
const scratch = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 900);
function aim(cam: THREE.PerspectiveCamera, c: Cam) {
  cam.position.copy(c.pos);
  const dir = c.look.clone().sub(c.pos).normalize();
  const vert = clamp01((Math.abs(dir.y) - 0.86) / 0.13);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  const st = (c.straight ?? 0) * (1 - vert);
  cam.fov = c.fov;
  cam.near = 0.5;
  cam.far = 900;
  if (st > 0.001) {
    // two-point perspective: tilt less (st 1: level), shift the lens so the look point stays at the frame's centre
    const p2 = pitch * (1 - st);
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    cam.up.set(0, 1, 0);
    cam.lookAt(c.pos.clone().add(flat.multiplyScalar(Math.cos(p2))).add(new THREE.Vector3(0, Math.sin(p2), 0)));
    const f = 1 / Math.tan((c.fov * Math.PI) / 360);
    cam.setViewOffset(1920, 1080, 0, f * Math.tan(p2 - pitch) * 540, 1920, 1080);
  } else {
    cam.up.set(0, 1 - vert, -vert).normalize();
    cam.lookAt(c.look);
    cam.clearViewOffset();
  }
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
export function projectAt(t: number, p: [number, number, number], dusk?: number): {x: number; y: number; visible: boolean} {
  aim(scratch, cameraAt(t, dusk));
  const v = new THREE.Vector3(...p).project(scratch);
  return {x: (v.x + 1) * 960, y: (1 - v.y) * 540, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2};
}

// ---------------------------------------------------------------- the drawers, the fixes, the timings
const TY = V11.typical;
export function drawerAt(t: number, floor: string): {out: number; dx: number; dy: number; dz: number} {
  // v6: the explode and the roof pull a floor 14 m east, 3 m south (V4); the two alike sheets keep V2's long drawer;
  // the lift and the corridor stay in the tower (V4's section and plan views)
  let out = 0;
  let dy = 0;
  let far = false;
  if (floor === '8') {
    const ex = ov(t, 21.6, 22.6) * (1 - ov(t, 26.4, 27.3));
    const al = ov(t, 32.4, 33.2) * (1 - ov(t, 34.5, 35.2));
    out = Math.max(ex, al);
    far = al > ex;
  } else if (TY.floors.includes(floor)) {
    const k = TY.floors.indexOf(floor);
    out = ov(t, TY.lit + k * TY.step, TY.lit + 0.6 + k * TY.step) * (1 - ov(t, 26.4, 27.3));
  } else if (floor === 'R') {
    out = ov(t, 27.6, 28.4) * (1 - ov(t, 31.4, 32.1));
  } else if (floor === '5') {
    // v6.3: V2's lift beat: L-102 stays out on its drawer until the planter is off the core
    out = ov(t, 32.4, 33.2) * (1 - ov(t, 38.9, 39.6));
    dy = (Y8 - Y5 + 0.6) * ov(t, 33.3, 34.0) * (1 - ov(t, 34.4, 35.0));
    far = true;
  }
  // v6.2: the four typical floors slide clear of the stack (36 m east, 5 m south) and grow (drawerScale): large in the zoom
  const typ = (floor === '8' && !far) || TY.floors.includes(floor);
  return {out, dx: out * (far ? DRAWER : typ ? 36 : 14), dy, dz: out * (far ? 0 : typ ? 5 : 3)};
}
/** v6.2: a typical floor's scale as it slides out of the explode (a callout; the model itself unchanged). */
export function drawerScale(t: number, floor: string): number {
  if ((floor !== '8' && !TY.floors.includes(floor)) || t < 21.4 || t > 27.4) return 1;
  return 1 + 0.4 * drawerAt(t, floor).out;
}
/** The explode (V4): every level rises GAP per level below it (v6.2: about one floor height). */
export const GAP = 3.4;
const winT = (t: number, a: number, b: number, f: number) => Math.min(ov(t, a, a + f), 1 - ov(t, b - f, b));
export const explodeAt = (t: number) => winT(t, B.drawer103 + 0.05, B.roof + 0.25, 1.0);
/** The floors above 5F lift away for the core section, those above 8F for the corridor plan (V4); back for the ground. */
export function liftAway(t: number, n: number): number {
  // v6.3: the lift beat is V2's drawer again, so only the corridor's plan lifts floors away
  const away = winT(t, B.corridor + 0.05, 46.6, 1.0);
  return n > 8 ? away * (70 + 2 * n) : 0;
}
const floorNo = (f: string) => (f === 'R' ? 21 : Number(f));
/** A level's height now: its storey, the explode, the lift-away and a drawer's rise. */
export function levelAt(t: number, floor: string): number {
  const s = SLABS.find((x) => x.floor === floor)!;
  return s.y + explodeAt(t) * GAP * s.i + liftAway(t, floorNo(floor)) + drawerAt(t, floor).dy;
}
/** How a drawer's sheet is lit: amber (the typical floor), green (the floors it stands for), blue (on stage). */
export function litAt(t: number, floor: string): {k: number; colour: string} {
  if (t >= 21.6 && t < 27.3) {
    if (floor === '8') return {k: ov(t, 21.8, 22.4) * (1 - ov(t, 26.4, 27.0)), colour: '#2457ff'};
    if (TY.floors.includes(floor)) {
      const k = TY.floors.indexOf(floor);
      return {k: ov(t, TY.lit + k * TY.step + 0.2, TY.lit + 0.6 + k * TY.step) * (1 - ov(t, 26.4, 27.0)), colour: '#3ccf7f'};
    }
  }
  const d = drawerAt(t, floor);
  return {k: d.out * 0.6, colour: '#9fb3ff'};
}
export const planterSlide = (t: number) => ov(t, 37.6, 38.5);
export const plantersOut = (t: number) => ov(t, 43.0, 43.9);
/** The walking person on L-103's drawer: x along the corridor (from the plate's centre). */
export function personAt(t: number): {x: number; z: number; a: number} {
  // v6: from the lobby along the corridor; stopped at the first planter; through to the stair after the fix
  const walk1 = ov(t, 41.3, 42.5, (u) => u);
  const walk2 = ov(t, 44.0, 45.2, (u) => u);
  const x = lerp(lerp(0.6, 3.0, walk1), 9.4, walk2);
  return {x, z: -0.95, a: Math.min(ov(t, 41.0, 41.3), 1 - ov(t, 45.3, 45.6))};
}
export const CORRIDOR = {len: 9, half: 0.75, niche: 0.7, px: [-1.6, 1.6], pw: 1.4, pd: 0.6};
/**
 * The tower package (landsight/synth/tower.py) in tower-local metres: x east, z south, origin the 28 × 18 m plate's centre
 * (package X − 20, 18 − Y). Rects are [x0, z0, x1, z1].
 */
export const PKG = {
  // v6.3: the corridor 2.1 m wall to wall; its planters drawn 1.2 m deep (0.9 m clear), halved in place by the fix (1.5 m)
  core: [-4, -2, 3, 4], lift: [-4, 1.5, -1.5, 4], stair: [8, -5, 11, 1], corridor: [3, -2.6, 8, -0.5],
  b10: [-5, 2.5, -2, 5], cplanters: [[3.5, -2.6, 5.5, -1.4], [5.8, -2.6, 7.8, -1.4]],
  terrace: [[-13.5, 9.5, -7.5, 11], [-6.5, 9.5, -0.5, 11], [0.5, 9.5, 6.5, 11], [7.5, 9.5, 13.5, 11]],
  roofLawn: [-12.5, -7, -5, 7], roofPlanters: [[5, 4.5, 12, 7], [5, -6.5, 12, -4]],
  cols: [-13, -6.5, 0, 6.5, 13].flatMap((x) => [8, 0, -8].map((z) => [x, z])).filter(([x, z]) => !(x === 0 && z === 0)),
};
/** B-10 leaves the shaft: 1.6 m south, off the core. */
export const b10At = (t: number) => 1.6 * ov(t, 37.6, 38.5);
export const treeScale = (t: number) => ov(t, 19.8, 21.0) * (1 - ov(t, 48.8, 50.0)) + ov(t, 68.6, 69.6) * (1 - ov(t, 92.4, 92.6));
export const pieceHeight = (i: number) => 0.4 + ((i * 5) % 12) * 0.45;
export const riseAt = (t: number) => ov(t, 50.3, 51.4) * (1 - ov(t, 52.8, 53.4));
export const pieceEnds = (i: number): [[number, number], [number, number]] => {
  const seg = t08.canopy[i];
  return [
    [SX(seg.points[0][0]), SZ(seg.points[0][1])],
    [SX(seg.points[1][0]), SZ(seg.points[1][1])],
  ];
};
const P = V11.pit;
export const paperAt = (t: number) => 1 - 0.72 * ov(t, P.paper[0], P.paper[1]) * (1 - ov(t, P.seven - 0.6, P.seven));
export const pitShrink = (t: number) => ov(t, P.shrink[0], P.shrink[1]);
export const sevenAt = (t: number, k: number) => ov(t, P.seven + k * 0.16, P.seven + 0.5 + k * 0.16);
export const hedgeGrow = (t: number) => ov(t, V11.hedge.grow[0], V11.hedge.grow[1], (u) => u);
export const towerA = (t: number) => ov(t, 18.6, 20.6);
/**
 * v6.3 the build (the pagoda reference): each sheet lands on its floor bottom-up (landAt); the floor rises off it as a
 * cobalt wire ghost, fills white with ink 0.45 s later, and the materials sweep up the tower as a scan (scanAt).
 */
export const landAt = (i: number) => 17.9 + (i / (SLABS.length - 1)) * 1.5;
export const scanAt = (i: number) => 20.0 + (i / (SLABS.length - 1)) * 0.8;
export function buildAt(t: number, i: number): number | undefined {
  if (t < 17.0 || t >= scanAt(i)) return undefined;
  return t < landAt(i) + 0.45 ? 0 : 1;
}
/** v6.3 drawing mode for the explanation beats (white, ink, one cobalt subject); the materials elsewhere. */
export function drawAt(t: number): number {
  return Math.max(Math.min(ov(t, 22.0, 22.6), 1 - ov(t, 45.6, 46.2)), Math.min(ov(t, 48.9, 49.5), 1 - ov(t, 87.0, 87.6)));
}
/** The beat's subject: the only thing drawn in cobalt. */
export function subjectAt(t: number): string {
  if (t < 27.4) return 'typical';
  if (t < 32.2) return 'roof';
  if (t < 35.1) return 'alike';
  if (t < 39.4) return 'b10';
  if (t < 46.5) return 'corridor';
  if (t < 57.5) return 'tree8';
  if (t < 68.8) return 'row';
  if (t < 74.2) return 'hedge';
  if (t < 77.6) return 'pavers';
  return 'pit';
}
export const stackIn = (t: number) => ov(t, 17.0, 18.6);
export const countedAt = (t: number) => (t >= 66.0 && t < 68.9 ? Math.min(8, Math.floor((t - 66.0) / 0.2) + 1) : 0);

// ---------------------------------------------------------------- pieces
function useTextures(urls: string[]): THREE.Texture[] | null {
  const [tex, setTex] = useState<THREE.Texture[] | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    const handle = delayRender('world textures');
    const loader = new THREE.TextureLoader();
    // a sheet that fails to load becomes blank paper rather than taking the world down
    Promise.all(urls.map((u) => loader.loadAsync(u).then((x) => ((x.colorSpace = THREE.SRGBColorSpace), (x.anisotropy = 16), x)).catch((e) => (console.error(u, e), new THREE.Texture()))))
      .then((xs) => (setTex(xs), continueRender(handle)))
      .catch((e) => (console.error(e), continueRender(handle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tex;
}

// ---------------------------------------------------------------- the palette and the materials
/** Ink, paper, one cobalt; red and amber only as status; green only for a fix or a find. Foliage and soil are materials. */
export const PAL = {
  ink: '#1d2026', paper: '#f7f5f0', cobalt: '#2457ff', cobaltLt: '#6d8dff', green: '#1f9d55', greenLt: '#3ccf7f',
  ground: '#dcd9d2', sky: '#ebe9e4', concrete: '#d3cdc2', concreteDk: '#a9a296', soil: '#6b5641', trunk: '#6a5745',
  glass: '#aebbd6', duskSky: '#141a29', duskGround: '#1f2533',
};
const FOLIAGE = ['#5b7d55', '#52744d', '#66885d', '#4c6d48', '#5f8257', '#577a51'];
const rand = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
/** A tileable grey noise texture (seeded, so every render worker builds the same one): concrete, soil. */
function noiseTexture(seed: number, size: number, base: number, amp: number, blob: number): THREE.DataTexture {
  const r = rand(seed);
  const n = size * size;
  const fine = new Float32Array(n).map(() => r() - 0.5);
  const cs = Math.max(2, Math.round(size / blob));
  const coarse = new Float32Array(cs * cs).map(() => r() - 0.5);
  const data = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // bilinear, wrapping, so the coarse mottling tiles
      const fx = (x / size) * cs;
      const fy = (y / size) * cs;
      const x0 = Math.floor(fx) % cs;
      const y0 = Math.floor(fy) % cs;
      const x1 = (x0 + 1) % cs;
      const y1 = (y0 + 1) % cs;
      const u = fx - Math.floor(fx);
      const v = fy - Math.floor(fy);
      const c = lerp(lerp(coarse[y0 * cs + x0], coarse[y0 * cs + x1], u), lerp(coarse[y1 * cs + x0], coarse[y1 * cs + x1], u), v);
      const val = Math.max(0, Math.min(255, Math.round(base + amp * (0.45 * fine[y * size + x] + 1.0 * c))));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = val;
      data[i + 3] = 255;
    }
  const tx = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.magFilter = THREE.LinearFilter;
  tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.generateMipmaps = true;
  tx.anisotropy = 8;
  tx.needsUpdate = true;
  return tx;
}
// ---------------------------------------------------------------- real materials (public/v5/textures, Poly Haven CC0)
const PBR_IDS = {stone: 'granite_tile', concrete: 'concrete_floor_02', facade: 'concrete_tile_facade', deck: 'wood_floor_deck', soil: 'farm_soil', lawn: 'leafy_grass', pavers: 'stone_pavers', bark: 'japanese_camphor_bark', metal: 'metal_plate'} as const;
type PBRKey = keyof typeof PBR_IDS;
type PBRSet = {map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture};
type PBR = Record<PBRKey, PBRSet> & {studio: THREE.DataTexture; night: THREE.DataTexture; sky: THREE.DataTexture};
let PBR_MAPS: PBR | null = null;
function usePBR(): PBR | null {
  const [pbr, setPbr] = useState<PBR | null>(PBR_MAPS);
  useEffect(() => {
    if (PBR_MAPS) return;
    const handle = delayRender('pbr textures');
    const tl = new THREE.TextureLoader();
    const tex = (f: string, srgb: boolean) =>
      tl.loadAsync(staticFile(`v5/textures/${f}`)).then((x) => {
        x.wrapS = x.wrapT = THREE.RepeatWrapping;
        x.anisotropy = 8;
        if (srgb) x.colorSpace = THREE.SRGBColorSpace;
        return x;
      });
    const keys = Object.keys(PBR_IDS) as PBRKey[];
    Promise.all<readonly [string, unknown]>([
      ...keys.map((k) => {
        const res = k === 'concrete' ? '2k' : '1k';
        const id = PBR_IDS[k];
        return Promise.all([tex(`${id}_diff_${res}.jpg`, true), tex(`${id}_nor_${res}.jpg`, false), tex(`${id}_rough_${res}.jpg`, false)]).then(([map, normalMap, roughnessMap]) => [k, {map, normalMap, roughnessMap}] as const);
      }),
      new HDRLoader().loadAsync(staticFile('v5/textures/studio_small_08_1k.hdr')).then((x) => ['studio', x] as const),
      new HDRLoader().loadAsync(staticFile('v5/textures/dikhololo_night_1k.hdr')).then((x) => ['night', x] as const),
      new HDRLoader().loadAsync(staticFile('v5/textures/kloofendal_48d_partly_cloudy_puresky_1k.hdr')).then((x) => ['sky', x] as const),
    ])
      .then((all) => {
        PBR_MAPS = Object.fromEntries(all) as unknown as PBR;
        setPbr(PBR_MAPS);
        continueRender(handle);
      })
      .catch((e) => (console.error(e), continueRender(handle)));
  }, []);
  return pbr;
}
/** A PBR material at a real scale: `m` metres per tile on metre UVs (mBox); the clones share the images. */
function pbrMat(k: PBRKey, m: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const s = PBR_MAPS![k];
  const rep = (x: THREE.Texture) => {
    const c = x.clone();
    c.repeat.set(1 / m, 1 / m);
    c.needsUpdate = true;
    return c;
  };
  const mat = new THREE.MeshStandardMaterial({map: rep(s.map), normalMap: rep(s.normalMap), roughnessMap: rep(s.roughnessMap), roughness: 1, metalness: 0, ...extra});
  mat.color.multiply(new THREE.Color(L.matTint));
  return mat;
}
/** Timber as a muted natural grey-brown, not the scan's saturated orange: its colour kept mostly as grain, then tinted. */
function mutedTimber(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, 0.3) * vec3(2.45, 3.1, 2.45);');
  };
  m.customProgramCacheKey = () => 'muted-timber';
  return m;
}
/** A box whose UVs are in metres on every face, so a texture keeps its real scale at any size. */
function mBoxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  uv.needsUpdate = true;
  return g;
}
const BOXES = new Map<string, THREE.BoxGeometry>();
function mBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = BOXES.get(key);
  if (!g) BOXES.set(key, (g = mBoxGeo(w, h, d)));
  return g;
}
type Mats = {concrete: THREE.MeshStandardMaterial; concreteDk: THREE.MeshStandardMaterial; soil: THREE.MeshStandardMaterial; trunk: THREE.MeshStandardMaterial; deck: THREE.MeshStandardMaterial; pavers: THREE.MeshStandardMaterial; lawn: THREE.MeshStandardMaterial; slab: THREE.MeshStandardMaterial; paperEdge: THREE.MeshStandardMaterial; leaf: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial};
let MATS: Mats | null = null;
let MATS_LOOK: LookSpec | null = null;
function mats(): Mats {
  if (MATS && MATS_LOOK === L) return MATS;
  MATS_LOOK = L;
  MATS = {
    // the scan is a warm grey: cooled so it reads as concrete, not sand
    concrete: pbrMat('concrete', 2.2, {color: new THREE.Color(0.98, 1.06, 1.18)}),
    concreteDk: pbrMat('concrete', 2.2, {color: new THREE.Color(0.58, 0.63, 0.7)}),
    soil: pbrMat('soil', 1.4, {color: '#7a6d62'}),
    trunk: pbrMat('bark', 0.9),
    deck: pbrMat('deck', 2.4),
    pavers: pbrMat('pavers', 2.0),
    lawn: pbrMat('lawn', 1.6, {color: new THREE.Color(0.72, 1.0, 0.62)}),
    slab: pbrMat('concrete', 3.0, {color: new THREE.Color(0.9, 0.97, 1.08)}),
    paperEdge: new THREE.MeshStandardMaterial({color: L.edge, roughness: 0.95, metalness: 0}),
    leaf: new THREE.MeshStandardMaterial({map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, metalness: 0, color: new THREE.Color(L.matTint).multiplyScalar(L.foliageK)}),
    metal: new THREE.MeshStandardMaterial({color: '#cfd4db', metalness: 1, roughness: 0.32}),
  };
  return MATS;
}
/** The tower's materials (one fade for the whole tower): concrete slabs, stone podium, aluminium, glass in three states. */
let TM: {look: LookSpec; slab: THREE.MeshStandardMaterial; stone: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial; glass: Map<string, THREE.MeshStandardMaterial>; room: THREE.MeshBasicMaterial[]} | null = null;
function towerMats(op: number) {
  if (!TM || TM.look !== L) {
    TM = {
      look: L,
      slab: pbrMat('concrete', 3.0, {color: new THREE.Color(1.02, 1.1, 1.22)}),
      // the cladding scan is a dark charcoal panel: lifted to a mid stone grey
      stone: pbrMat('facade', 3.0, {color: new THREE.Color(2.3, 2.36, 2.45)}),
      metal: new THREE.MeshStandardMaterial({color: '#d3d8df', metalness: 1, roughness: 0.28, roughnessMap: PBR_MAPS!.metal.roughnessMap}),
      glass: new Map(),
      // rooms lit a soft warm white, some floors dark, so the glass reads as windows at night
      room: [1.5, 0.12, 1.25, 0.05, 1.4].map((k) => new THREE.MeshBasicMaterial({color: new THREE.Color('#fff3e2').multiplyScalar(k)})),
    };
  }
  const T = TM;
  for (const m of [T.slab, T.stone, T.metal]) {
    const tr = op < 0.999;
    if (m.transparent !== tr) {
      m.transparent = tr;
      m.needsUpdate = true;
    }
    m.opacity = op;
  }
  const glass = (kind: 'base' | 'out' | 'lit', colour = L.windows > 0 ? '#3d5677' : '#6f97c9') => {
    const key = kind + colour;
    let g = T.glass.get(key);
    if (!g) T.glass.set(key, (g = new THREE.MeshStandardMaterial({color: colour, metalness: 0.5, roughness: 0.05, transparent: true, depthWrite: false, envMapIntensity: 1.6})));
    g.opacity = (kind === 'out' ? 0.2 : kind === 'lit' ? 0.62 : L.windows > 0 ? 0.3 : 0.66) * op;
    return g;
  };
  return {...T, glass};
}
const FACADES = new Map<string, {mullions: THREE.BufferGeometry; stone: THREE.BufferGeometry | null}>();
/**
 * A floor's façade (origin on the slab's top, centred): aluminium mullions every 1.5 m on the glass line and a head
 * transom; on the podium, stone piers every 5.5 m and a stone spandrel at the sill. Nothing coplanar with the glass.
 */
function facade(w: number, d: number, fh: number, podium: boolean) {
  const key = `${w}|${d}|${fh}|${podium}`;
  const hit = FACADES.get(key);
  if (hit) return hit;
  const gw = w - 1.2;
  const gd = d - 1.2;
  const gh = fh - 0.5;
  const ms: THREE.BufferGeometry[] = [];
  const st: THREE.BufferGeometry[] = [];
  const add = (arr: THREE.BufferGeometry[], bw: number, bh: number, bd: number, x: number, y: number, z: number) => arr.push(mBoxGeo(bw, bh, bd).translate(x, y, z));
  for (const sg of [-1, 1]) {
    const nx = Math.round(gw / 1.5);
    for (let k = 0; k <= nx; k++) add(ms, 0.07, gh, 0.14, -gw / 2 + (gw * k) / nx, gh / 2, sg * (gd / 2 + 0.05));
    add(ms, gw + 0.1, 0.1, 0.16, 0, gh - 0.05, sg * (gd / 2 + 0.05));
    const nz = Math.round(gd / 1.5);
    for (let k = 0; k <= nz; k++) add(ms, 0.14, gh, 0.07, sg * (gw / 2 + 0.05), gh / 2, -gd / 2 + (gd * k) / nz);
    add(ms, 0.16, 0.1, gd + 0.1, sg * (gw / 2 + 0.05), gh - 0.05, 0);
    if (podium) {
      add(st, gw + 0.6, 1.1, 0.3, 0, 0.55, sg * (gd / 2 + 0.2));
      add(st, 0.3, 1.1, gd + 0.6, sg * (gw / 2 + 0.2), 0.55, 0);
      const px = Math.round(gw / 5.5);
      for (let k = 0; k <= px; k++) add(st, 0.7, gh, 0.42, -gw / 2 + (gw * k) / px, gh / 2, sg * (gd / 2 + 0.22));
      const pz = Math.round(gd / 5.5);
      for (let k = 0; k <= pz; k++) add(st, 0.42, gh, 0.7, sg * (gw / 2 + 0.22), gh / 2, -gd / 2 + (gd * k) / pz);
    }
  }
  const out = {mullions: mergeGeometries(ms)!, stone: podium ? mergeGeometries(st)! : null};
  FACADES.set(key, out);
  return out;
}

const Bar: React.FC<{a: [number, number]; b: [number, number]; y: number; colour: string; th?: number; op?: number}> = ({a, b, y, colour, th = 0.08, op = 1}) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-4 || op <= 0.002) return null;
  return (
    <group position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <mesh>
        <boxGeometry args={[len, th, th]} />
        <meshBasicMaterial color={colour} transparent={op < 1} opacity={op} toneMapped={false} />
      </mesh>
      {L.glow > 0 && (colour === L.accent || colour === L.accentLt) ? (
        <mesh renderOrder={6}>
          <boxGeometry args={[len + th * 2.4, th * 0.5, th * 3.6]} />
          <meshBasicMaterial color={colour} transparent opacity={0.18 * L.glow * op} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ) : null}
    </group>
  );
};
const Ring: React.FC<{x: number; z: number; r: number; y?: number; colour: string; th?: number; op?: number}> = ({x, z, r, y = 0.05, colour, th = 0.08, op = 1}) =>
  op <= 0.002 ? null : (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r, th, 6, 64]} />
      <meshBasicMaterial color={colour} transparent={op < 1} opacity={op} toneMapped={false} />
    </mesh>
  );
/** A flat tint floating over the paper (never coplanar: lifted and polygon-offset). */
const Tint: React.FC<{x: number; z: number; w: number; d: number; colour: string; op: number; y?: number}> = ({x, z, w, d, colour, op, y = 0.06}) =>
  op <= 0.002 ? null : (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]} renderOrder={5}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color={colour} transparent opacity={op} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
/** Leaf greens: several, as a real planting has. */
const LEAF = ['#4e7a3a', '#5f8d45', '#3f6a32', '#6c9a4c', '#557f3e', '#466f37', '#7aa356'];
/** A sprig of leaves (alpha in the shape, a midrib), drawn once: every canopy, shrub and hedge is made of these cards. */
let LEAF_TEX: THREE.Texture | null = null;
function leafTexture(): THREE.Texture {
  if (LEAF_TEX) return LEAF_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const leaf = (x: number, y: number, a: number, l: number, w: number, sh: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(w, l * 0.25, w * 0.8, l * 0.75, 0, l);
    g.bezierCurveTo(-w * 0.8, l * 0.75, -w, l * 0.25, 0, 0);
    const gr = g.createLinearGradient(-w, 0, w, 0);
    gr.addColorStop(0, `rgb(${sh - 40},${sh - 40},${sh - 40})`);
    gr.addColorStop(0.5, `rgb(${sh},${sh},${sh})`);
    gr.addColorStop(1, `rgb(${sh - 60},${sh - 60},${sh - 60})`);
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(0, l - 8);
    g.stroke();
    g.restore();
  };
  const r = rand(5);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r() * 0.5;
    leaf(128 + Math.cos(a) * 8, 128 + Math.sin(a) * 8, a - Math.PI / 2, 78 + r() * 34, 24 + r() * 9, 195 + Math.round(r() * 55));
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  LEAF_TEX = tx;
  return tx;
}
type Clump = {p: [number, number, number]; s: number; m: number};
/**
 * Foliage as leaf cards on the shells of its clumps, each card facing out with a twist (so the mass shades as a volume and
 * its edge reads as leaves). `upto` shows the first n clumps only (the hedge grows).
 */
const Leaves: React.FC<{clumps: Clump[]; card: number; seed: number; upto?: number}> = ({clumps, card, seed, upto}) => {
  const mesh = useMemo(() => {
    const r = rand(seed * 7717 + 3);
    const per = clumps.map((c) => Math.max(6, Math.round(((c.s * c.s * 4 * Math.PI) / (card * card)) * 0.9)));
    const cum: number[] = [0];
    per.forEach((n) => cum.push(cum[cum.length - 1] + n));
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(card, card), mats().leaf, cum[cum.length - 1]);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const Z = new THREE.Vector3(0, 0, 1);
    const d = new THREE.Vector3();
    const n = new THREE.Vector3();
    const col = new THREE.Color();
    let i = 0;
    clumps.forEach((c, ci) => {
      for (let k = 0; k < per[ci]; k++) {
        const u = r() * 2 - 1;
        const th = r() * Math.PI * 2;
        const sq = Math.sqrt(1 - u * u);
        d.set(sq * Math.cos(th), u, sq * Math.sin(th));
        const rr = c.s * (0.6 + 0.4 * Math.sqrt(r()));
        n.set(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.8).add(d).normalize();
        q.setFromUnitVectors(Z, n);
        spin.setFromAxisAngle(Z, r() * Math.PI * 2);
        q.multiply(spin);
        const k2 = 0.75 + 0.5 * r();
        m.compose(new THREE.Vector3(c.p[0] + d.x * rr, c.p[1] + d.y * rr, c.p[2] + d.z * rr), q, new THREE.Vector3(k2, k2, k2));
        im.setMatrixAt(i, m);
        im.setColorAt(i, col.set(LEAF[(c.m + Math.floor(r() * 3)) % LEAF.length]).multiplyScalar(0.78 + 0.4 * r()));
        i++;
      }
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.userData.cum = cum;
    im.userData.noAO = true;
    im.userData.leaf = true;
    return im;
  }, [clumps, card, seed]);
  const cum = mesh.userData.cum as number[];
  mesh.count = upto === undefined ? cum[cum.length - 1] : cum[Math.max(0, Math.min(clumps.length, upto))];
  return <primitive object={mesh} />;
};
/** A canopy: clumps (seeded per tree), each a little different in size and green. */
function canopy(seed: number, r: number): Clump[] {
  const g = rand(seed * 104729 + 17);
  const out: Clump[] = [{p: [0, 0, 0], s: r * 0.72, m: Math.floor(g() * LEAF.length)}];
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + g() * 0.6;
    const rr = r * (0.42 + 0.18 * g());
    const up = (g() - 0.35) * r * 0.55;
    out.push({p: [Math.cos(a) * rr, up, Math.sin(a) * rr], s: r * (0.4 + 0.16 * g()), m: Math.floor(g() * LEAF.length)});
  }
  out.push({p: [(g() - 0.5) * r * 0.3, r * 0.42, (g() - 0.5) * r * 0.3], s: r * 0.46, m: Math.floor(g() * LEAF.length)});
  return out;
}
/** A tree: a bark trunk, four limbs and a leafy canopy; `s` 1 is full, 0 flattens it into its plan circle. */
const Tree: React.FC<{x: number; z: number; r: number; s: number; h?: number; op?: number; y?: number; seed?: number; night?: boolean}> = ({x, z, r, s, h = 2.6, op = 1, y = 0, seed = 1}) => {
  const balls = useMemo(() => canopy(seed, r), [seed, r]);
  if (s <= 0.005 || op <= 0.002) return null;
  const M = mats();
  const trunk = h * s;
  const k = Math.max(0.6, r / 1.6);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, trunk / 2, 0]} castShadow receiveShadow material={M.trunk}>
        <cylinderGeometry args={[0.1 * k, 0.17 * k, Math.max(0.01, trunk), 14]} />
      </mesh>
      <group position={[0, trunk, 0]} scale={[1, Math.max(0.03, s), 1]}>
        {[0, 1, 2, 3].map((j) => {
          const a = (j / 4) * Math.PI * 2 + seed;
          return (
            <mesh key={j} position={[Math.cos(a) * r * 0.2, r * 0.28, Math.sin(a) * r * 0.2]} rotation={[Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]} castShadow material={M.trunk}>
              <cylinderGeometry args={[0.035 * k, 0.075 * k, r * 0.72, 8]} />
            </mesh>
          );
        })}
      </group>
      <group position={[0, trunk + r * 0.55 * s, 0]} scale={[1, Math.max(0.03, s), 1]}>
        <Leaves clumps={balls} card={0.3 + 0.08 * r} seed={seed} />
      </group>
    </group>
  );
};
/** A planter box: concrete walls, dark soil, and leafy shrubs. Origin at the box's base centre. */
const Shrubs: React.FC<{w: number; d: number; h: number; seed: number; card?: number; grid?: number; wall?: THREE.Material}> = ({w, d, h, seed, card = 0.17, grid = 0.62, wall}) => {
  const M = mats();
  const balls = useMemo(() => {
    const r = rand(seed * 7919);
    const nx = Math.max(1, Math.round(w / grid));
    const nz = Math.max(1, Math.round(d / grid));
    const out: Clump[] = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const cx = -w / 2 + (w / nx) * (i + 0.5);
        const cz = -d / 2 + (d / nz) * (j + 0.5);
        const base = Math.min(w / nx, d / nz) * 0.42;
        for (let k = 0; k < 4; k++) {
          const s = base * (0.62 + 0.36 * r());
          out.push({p: [cx + (r() - 0.5) * base * 1.0, h - 0.05 + s * (0.5 + 0.45 * r()), cz + (r() - 0.5) * base * 1.0], s, m: Math.floor(r() * LEAF.length)});
        }
      }
    return out;
  }, [w, d, h, seed, grid]);
  const th = 0.1;
  return (
    <group>
      {[
        [0, -d / 2 + th / 2, w, th],
        [0, d / 2 - th / 2, w, th],
        [-w / 2 + th / 2, 0, th, d - 2 * th],
        [w / 2 - th / 2, 0, th, d - 2 * th],
      ].map(([x, z, ww, dd], k) => (
        <mesh key={k} position={[x, h / 2, z]} geometry={mBox(ww, h, dd)} castShadow receiveShadow material={wall ?? M.concrete} />
      ))}
      <mesh position={[0, (h - 0.12) / 2, 0]} geometry={mBox(w - 2 * th, h - 0.12, d - 2 * th)} receiveShadow material={M.soil} />
      <Leaves clumps={balls} card={card} seed={seed} />
    </group>
  );
};
/** The hedge: two rows of plants along the 27 m line, in growing order. */
let HEDGE_CLUMPS: (Clump & {u: number})[] | null = null;
function hedgeClumps() {
  if (HEDGE_CLUMPS) return HEDGE_CLUMPS;
  const out: (Clump & {u: number})[] = [];
  for (const rowK of [0, 1])
    for (let k = 0; k < HEDGE.n; k++) {
      const u = k / (HEDGE.n - 1);
      const g = rand(k * 31 + rowK * 7 + 5);
      const sz = 0.2 * (0.85 + 0.3 * g());
      out.push({p: [HEDGE.x + (rowK ? HEDGE.gap / 2 : -HEDGE.gap / 2), sz, HEDGE.z0 - (HEDGE.z0 - HEDGE.z1) * u], s: sz, m: (k + rowK * 3) % LEAF.length, u});
    }
  return (HEDGE_CLUMPS = out.sort((a, b) => a.u - b.u));
}
const Hedge: React.FC<{upto: number}> = ({upto}) => {
  const cl = hedgeClumps();
  return <Leaves clumps={cl} card={0.15} seed={9} upto={cl.filter((c) => c.u <= upto + 1e-6).length} />;
};
/** The roof garden on R: timber decking along the parapets, concrete planters with dark soil and shrubs. */
const RoofGarden: React.FC<{w: number; d: number}> = ({w, d}) => {
  const M = mats();
  return (
    <group position={[0, 0.4, 0]}>
      {[-1, 1].map((sg) => (
        <group key={sg} position={[0, 0, sg * (d / 2 - 0.85)]}>
          <mesh position={[0, 0.06, 0]} geometry={mBox(w - 0.4, 0.12, 1.5)} material={M.deck} receiveShadow castShadow />
          <group position={[0, 0.12, sg * 0.3]}>
            <Shrubs w={w - 2.6} d={0.8} h={0.55} seed={sg > 0 ? 21 : 22} />
          </group>
        </group>
      ))}
    </group>
  );
};
/** Night: low garden lights, a warm pool at each tree of the plan. */
const GardenLights: React.FC = () => (
  <>
    {[...ROW, T10, ...SEVEN].map((r, k) => (
      <group key={k} position={[r.x + 0.5, 0.35, r.z + 0.5]}>
        <pointLight color="#ffd39a" intensity={46} distance={9} decay={2} />
        <mesh>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshBasicMaterial color="#fff1d6" toneMapped={false} />
        </mesh>
      </group>
    ))}
  </>
);
/** A sheet with a square hole (the lift shaft on L-102), its texture mapped as on a plain plane. */
function holedSheet(w: number, h: number, hx: number, hy: number, hs: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(hx - hs / 2, hy - hs / 2);
  hole.lineTo(hx - hs / 2, hy + hs / 2);
  hole.lineTo(hx + hs / 2, hy + hs / 2);
  hole.lineTo(hx + hs / 2, hy - hs / 2);
  hole.closePath();
  s.holes.push(hole);
  const g = new THREE.ShapeGeometry(s);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / w + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / h + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const CameraRig: React.FC<{t: number; dusk?: number}> = ({t, dusk}) => {
  const {camera, size} = useThree();
  const pc = camera as THREE.PerspectiveCamera;
  pc.aspect = size.width / size.height;
  aim(pc, cameraAt(t, dusk));
  return null;
};
/** Image-based light from a small studio HDRI (a night HDRI for the night look): reflections on glass, metal and leaves. */
/** The sky HDRI above the horizon over a flat ground of `ground` below it, as a PMREM for reflections. */
function skyOverGround(gl: THREE.WebGLRenderer, src: THREE.Texture, ground: THREE.Color): THREE.Texture {
  const pm = new THREE.PMREMGenerator(gl);
  const env = new THREE.Scene();
  env.background = src;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(500, 48), new THREE.MeshBasicMaterial({color: ground, side: THREE.DoubleSide}));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -2;
  env.add(disc);
  const tx = pm.fromScene(env, 0.0, 0.1, 1000).texture;
  pm.dispose();
  return tx;
}
/**
 * The day curtain wall: a darker, reflective blue-grey glass, so the sky in it and the light fins read crisply on the
 * white stage. It reflects its own sky over a mid-grey ground (GLASS_ENV, set in TowerV6): dark and deep below the
 * horizon, the clouds above it. Its own envMap also makes `env` count (three uses scene.environmentIntensity otherwise).
 */
const GLASS6 = {colour: '#8a9bb0', metalness: 0.88, roughness: 0.025, opacity: 0.9, env: 1.8, ground: '#686c72'};
let GLASS_ENV: THREE.Texture | null = null;
const Look: React.FC<{night: boolean}> = () => {
  const {gl, scene} = useThree();
  const env = useMemo(() => {
    const night = L.sky === 'night';
    const src = night ? PBR_MAPS!.night : PBR_MAPS!.sky;
    src.mapping = THREE.EquirectangularReflectionMapping;
    GLASS_ENV = night ? null : skyOverGround(gl, src, new THREE.Color(GLASS6.ground));
    // the sky (and its clouds) above the horizon; below it the stage, so metal and leaves see sky over a light ground
    return skyOverGround(gl, src, new THREE.Color(night ? '#0b1530' : '#dfe3e9').multiplyScalar(night ? 1 : 1.4));
  }, [gl]);
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = L.exposure;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFShadowMap;
  gl.localClippingEnabled = true;
  scene.environment = env;
  scene.environmentIntensity = L.env * (1 - 0.72 * WARM_AMB);
  return null;
};
/**
 * The stage: a sky dome from `top` overhead to `horizon` that travels with the camera; the ground 3 m below the paper, a
 * grid on it fading with distance, into the horizon through the fog; a shadow catcher on the ground (polygon offset).
 */
const Stage: React.FC<{t: number; end: boolean}> = ({t, end}) => {
  const {camera} = useThree();
  // v6.3: the ground sits just under the paper for the opening and the end (the site reads as a site); 3 m down otherwise
  const gy = end || t < 46.5 ? -0.08 : -3;
  const m = useMemo(() => {
    const dome = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {top: {value: new THREE.Color(L.top).multiplyScalar(L.gain)}, hor: {value: new THREE.Color(L.horizon).multiplyScalar(L.gain)}, warm: {value: new THREE.Color(L.warm ?? L.horizon).multiplyScalar(L.gain)}},
      vertexShader: 'varying vec3 vD;\nvoid main() {\n  vD = normalize(position);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragmentShader: 'uniform vec3 top;\nuniform vec3 hor;\nuniform vec3 warm;\nvarying vec3 vD;\nvoid main() {\n  vec3 c = mix(warm, hor, smoothstep(-0.01, 0.12, vD.y));\n  c = mix(c, top, smoothstep(0.04, 0.6, vD.y));\n  gl_FragColor = vec4(c, 1.0);\n  #include <colorspace_fragment>\n}',
    });
    const ground = new THREE.ShaderMaterial({
      fog: true,
      toneMapped: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {base: {value: new THREE.Color(L.ground).multiplyScalar(L.gain)}, grid: {value: new THREE.Color(L.grid).multiplyScalar(L.gain)}, gridA: {value: L.gridA}, centre: {value: new THREE.Vector2(TX, 6)}}]),
      vertexShader: '#include <fog_pars_vertex>\nvarying vec3 vW;\nvoid main() {\n  vec4 w = modelMatrix * vec4(position, 1.0);\n  vW = w.xyz;\n  vec4 mvPosition = viewMatrix * w;\n  gl_Position = projectionMatrix * mvPosition;\n  #include <fog_vertex>\n}',
      fragmentShader: [
        'uniform vec3 base;\nuniform vec3 grid;\nuniform float gridA;\nuniform vec2 centre;\nvarying vec3 vW;',
        '#include <fog_pars_fragment>',
        'float gline(float x, float w) {\n  float d = abs(fract(x - 0.5) - 0.5) / max(fwidth(x), 1e-4);\n  return 1.0 - min(d / w, 1.0);\n}',
        'void main() {\n  vec2 p = vW.xz;\n  float minor = max(gline(p.x / 5.0, 0.9), gline(p.y / 5.0, 0.9));\n  float major = max(gline(p.x / 25.0, 1.4), gline(p.y / 25.0, 1.4));\n  float fade = 1.0 - smoothstep(30.0, 230.0, length(p - centre));\n  gl_FragColor = vec4(mix(base, grid, gridA * fade * max(0.45 * minor, major)), 1.0);\n  #include <colorspace_fragment>\n  #include <fog_fragment>\n}',
      ].join('\n'),
    });
    return {dome, ground};
  }, []);
  return (
    <>
      <mesh material={m.dome} position={camera.position.toArray()} renderOrder={-10} frustumCulled={false} userData={{noAO: true}}>
        <sphereGeometry args={[800, 48, 24]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, gy, 0]} material={m.ground} userData={{noAO: true}}>
        <planeGeometry args={[1400, 1400]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, gy, 0]} receiveShadow renderOrder={1} userData={{noAO: true}}>
        <planeGeometry args={[1400, 1400]} />
        <shadowMaterial color="#000000" opacity={L.shadowA * (1 - 0.45 * WARM)} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8} />
      </mesh>
    </>
  );
};
/**
 * A soft depth of field for the end (behind the bullets): the tower in focus, the far ground and the near paper soft.
 * A real lens blur in the render (three's BokehPass, a fixed kernel), never a CSS blur.
 */
const Dof: React.FC<{focus: number}> = ({focus}) => {
  const {gl, scene, camera, size} = useThree();
  const fx = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, samples: 4});
    const composer = new EffectComposer(gl, rt);
    composer.addPass(new RenderPass(scene, camera));
    const bokeh = new BokehPass(scene, camera, {focus, aperture: 0.00005, maxblur: 0.0032});
    composer.addPass(bokeh);
    composer.addPass(new OutputPass());
    return {composer, bokeh};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  fx.composer.setPixelRatio(gl.getPixelRatio());
  fx.composer.setSize(size.width, size.height);
  (fx.bokeh.uniforms as Record<string, {value: number}>).focus.value = focus;
  useFrame(() => fx.composer.render(), 1);
  return null;
};
/** The lift shaft in plan on L-102 (drawer-local): centre and side. */
export const SHAFT = {x: -2.75, z: 2.75, s: 2.5};

/**
 * The sheets' shader: the drawing as white paper (the cream of the scans neutralised; a little self-lit on a dark stage, so
 * paper reads as lit paper) or as blueprint (white lines on blue). One program per look.
 */
function sheetShader(sh: {fragmentShader: string}) {
  const b = new THREE.Color(L.blue);
  const bp = L.sheet === 'blueprint';
  sh.fragmentShader = sh.fragmentShader
    .replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec3 pc = min(sampledDiffuseColor.rgb * vec3(1.075, 1.095, 1.148), vec3(1.0));
  ${bp ? `float lum = dot(pc, vec3(0.2126, 0.7152, 0.0722));\n  pc = mix(vec3(0.97, 0.98, 1.0), vec3(${b.r.toFixed(4)}, ${b.g.toFixed(4)}, ${b.b.toFixed(4)}), smoothstep(0.08, 0.7, lum));` : ''}
  diffuseColor *= vec4(pc, sampledDiffuseColor.a);
#endif`,
    )
    // v6.3: emissive.r carries how much of the self-light to drop (the warm opening lets the sun colour the paper)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance = diffuseColor.rgb * ${L.selfLit.toFixed(3)} * (1.0 - emissive.r);`);
}
const sheetKey = () => `sheet-${L.sheet}-${L.selfLit}-${L.blue}`;
/** A soft halo texture for the sheets' edge glow (ink look). */
let GLOW: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.filter = 'blur(9px)';
  g.fillStyle = '#fff';
  g.fillRect(14, 14, 228, 228);
  GLOW = new THREE.CanvasTexture(c);
  return GLOW;
}
/** A sheet: the drawing on top, a thin paper edge under it (never coplanar), lit, casting soft shadows; a faint halo on ink. */
const Sheet: React.FC<{w: number; h: number; map: THREE.Texture; tint: THREE.Color; op: number; hole?: THREE.ShapeGeometry; night: boolean; shadow?: boolean; order?: number}> = ({w, h, map, tint, op, hole, shadow = true, order = 3}) => {
  const tr = op < 0.999;
  const mat = <meshStandardMaterial map={map} color={tint} emissive={SELF_WARM()} roughness={0.93} metalness={0} transparent={tr} opacity={op} side={THREE.DoubleSide} depthWrite={!tr} onBeforeCompile={sheetShader} customProgramCacheKey={sheetKey} />;
  return (
    <>
      {hole ? (
        <mesh geometry={hole} renderOrder={3} receiveShadow castShadow userData={{drawKeep: true}}>
          {mat}
        </mesh>
      ) : (
        <mesh renderOrder={order} receiveShadow={shadow} castShadow={shadow} userData={{drawKeep: true}}>
          <planeGeometry args={[w, h]} />
          {mat}
        </mesh>
      )}
      {!tr && !hole ? (
        <mesh position={[0, 0, -0.07]} material={mats().paperEdge}>
          <boxGeometry args={[w * 0.998, h * 0.998, 0.1]} />
        </mesh>
      ) : null}
      {!tr && !hole && L.edgeGlow ? (
        <mesh position={[0, 0, -0.16]} renderOrder={1}>
          <planeGeometry args={[w + 2.4, h + 2.4]} />
          <meshBasicMaterial color={L.edgeGlow} alphaMap={glowTexture()} transparent opacity={0.3} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------- v6: the tower (podium, 5F garden, finned tower, sky gardens, roof)
/** The section through the lift core (V4): keep x ≤ the shaft's centre; parked far away when off. The ghost keeps the rest. */
const CUT = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6);
const CUT_INV = new THREE.Plane(new THREE.Vector3(1, 0, 0), -1e6);
export const cutAt = (t: number) => winT(t, B.lift + 0.15, B.corridor, 0.8);
/** A solid cut by the section shows a flat poché (its back faces), not a hollow shell. */
function poche<M extends THREE.Material>(m: M, col: string): M {
  const c = new THREE.Color(col);
  m.side = THREE.DoubleSide;
  m.clippingPlanes = [CUT];
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = vec4(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)}, 1.0);`);
  };
  m.customProgramCacheKey = () => `poche-${col}`;
  return m;
}
type TowerMats = Record<'slab' | 'core' | 'stone' | 'fin' | 'spandrel' | 'glass' | 'deck' | 'rail' | 'lawn' | 'ghost' | 'car' | 'crown' | 'void', THREE.Material>;
let TW: {look: V6Spec; m: TowerMats} | null = null;
function towerMats6(): TowerMats {
  if (TW && TW.look === L) return TW.m;
  const night = L.windows > 0;
  const clip = <M extends THREE.Material>(m: M) => ((m.clippingPlanes = [CUT]), m);
  const m: TowerMats = {
    // floors in a light granite tile, walls in light plaster (the concrete scan's normals only); cut faces a matte,
    // neutral charcoal (any blue in a dark poche goes navy through the Neutral tone curve's toe)
    slab: poche(pbrMat('stone', 1.2, {color: new THREE.Color(1.3, 1.32, 1.36), roughnessMap: null, roughness: 0.82}), '#4a4a4c'),
    core: poche(new THREE.MeshStandardMaterial({color: '#e6e9ee', roughness: 0.88, metalness: 0, normalMap: PBR_MAPS!.concrete.normalMap, normalScale: new THREE.Vector2(0.4, 0.4)}), '#444446'),
    stone: poche(pbrMat('stone', 2.4, {color: new THREE.Color(1.8, 1.82, 1.86), roughnessMap: null, roughness: 0.74}), '#4f4f51'),
    fin: clip(new THREE.MeshStandardMaterial({color: '#cfd4dc', metalness: 1, roughness: 0.3, roughnessMap: PBR_MAPS!.metal.roughnessMap})),
    spandrel: clip(new THREE.MeshStandardMaterial({color: '#b9c1cc', metalness: 0.9, roughness: 0.32})),
    glass: clip(new THREE.MeshStandardMaterial({...(night ? {color: '#2c3d5c', metalness: 0.75, roughness: 0.035, opacity: 0.34} : {color: GLASS6.colour, metalness: GLASS6.metalness, roughness: GLASS6.roughness, opacity: GLASS6.opacity, envMapIntensity: GLASS6.env}), transparent: true, depthWrite: false, side: THREE.DoubleSide})),
    deck: clip(mutedTimber(pbrMat('deck', 2.2))),
    rail: clip(new THREE.MeshStandardMaterial({color: '#dfe7f2', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide})),
    lawn: clip(pbrMat('lawn', 1.6, {color: new THREE.Color(0.72, 1.0, 0.62)})),
    ghost: Object.assign(new THREE.MeshBasicMaterial({color: '#c3c7ce', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide}), {clippingPlanes: [CUT_INV]}),
    car: poche(new THREE.MeshStandardMaterial({color: '#dfe4ec', metalness: 0.6, roughness: 0.3, emissive: '#cfdcff', emissiveIntensity: 0.55}), '#e3e8f0'),
    void: poche(new THREE.MeshBasicMaterial({color: '#0b0d12'}), '#07080b'),
    crown: clip(new THREE.MeshStandardMaterial({color: '#d6dbe3', metalness: 1, roughness: 0.26, emissive: night ? '#cfe0ff' : '#000000', emissiveIntensity: night ? 0.55 : 0})),
  };
  TW = {look: L, m};
  return m;
}
type Kind = 'lobby' | 'podium' | 'garden' | 'tower' | 'sky' | 'roof';
const kindOf = (f: string): Kind => (f === 'R' ? 'roof' : f === '1' ? 'lobby' : Number(f) <= 4 ? 'podium' : f === '5' ? 'garden' : TY.floors.includes(f) || f === '8' ? 'sky' : 'tower');
type LevelGeo = Partial<Record<keyof TowerMats, THREE.BufferGeometry>>;
const LGEO = new Map<string, LevelGeo>();
/** One level's geometry by kind (origin: the level's floor at the plate's centre; slab −0.3…0.05), merged per material. */
function levelGeo(kind: Kind, fh: number): LevelGeo {
  const key = `${kind}|${fh}`;
  const hit = LGEO.get(key);
  if (hit) return hit;
  const parts: Record<string, THREE.BufferGeometry[]> = {};
  const box = (mat: keyof TowerMats, xa: number, ya: number, za: number, xb: number, yb: number, zb: number) => {
    const [x0, x1] = [Math.min(xa, xb), Math.max(xa, xb)];
    const [y0, y1] = [Math.min(ya, yb), Math.max(ya, yb)];
    const [z0, z1] = [Math.min(za, zb), Math.max(za, zb)];
    (parts[mat] ??= []).push(mBoxGeo(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  };
  const pane = (mat: keyof TowerMats, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
    const w = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(w, y1 - y0);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    (parts[mat] ??= []).push(g);
  };
  const top = fh - 0.3;
  const garden = kind === 'garden' || kind === 'sky';
  // the slab, open over the lift shaft; gardens have a 2 m ledge to the south for the terrace planters
  const [lx0, lz0, lx1, lz1] = PKG.lift;
  box('slab', -14, -0.3, -9, 14, 0.05, lz0);
  box('slab', -14, -0.3, lz1, 14, 0.05, garden ? 11 : 9);
  box('slab', -14, -0.3, lz0, lx0, 0.05, lz1);
  box('slab', lx1, -0.3, lz0, 14, 0.05, lz1);
  // the core round the lift and the lobby (east side open for the corridor); the shaft's own walls
  const ch = kind === 'roof' ? 3.4 : top;
  const [cx0, cz0, cx1, cz1] = PKG.core;
  const w = 0.3;
  box('core', cx0, 0.05, cz0, cx1, ch, cz0 + w);
  box('core', cx0, 0.05, cz1 - w, cx1, ch, cz1);
  box('core', cx0, 0.05, cz0 + w, cx0 + w, ch, cz1 - w);
  box('core', cx1 - w, 0.05, PKG.corridor[3], cx1, ch, cz1 - w);
  box('core', lx0 + w, 0.05, lz0 - w, lx1 + w, ch, lz0);
  box('core', lx1, 0.05, lz0, lx1 + w, ch, cz1 - w);
  if (kind === 'roof') box('core', cx0, 3.4, cz0, cx1, 3.7, cz1);
  // the shaft, dark inside (seen when the section opens it)
  if (kind !== 'roof') box('void', lx0 + 0.32, -0.3, lz0 + 0.02, lx1 - 0.02, top + 0.3, cz1 - 0.32);
  const fins = (z: number, depth: number, y0: number, y1: number, from = -14, to = 14, step = 1.4) => {
    const n = Math.round((to - from) / step);
    for (let k = 0; k <= n; k++) {
      const x = from + ((to - from) * k) / n;
      box('fin', x - 0.06, y0, z + Math.sign(depth) * 0.02, x + 0.06, y1, z + depth);
    }
  };
  const finsX = (x: number, depth: number, y0: number, y1: number, from = -9, to = 9, step = 1.4) => {
    const n = Math.round((to - from) / step);
    for (let k = 0; k <= n; k++) {
      const z = from + ((to - from) * k) / n;
      box('fin', x + Math.sign(depth) * 0.02, y0, z - 0.06, x + depth, y1, z + 0.06);
    }
  };
  if (kind === 'lobby' || kind === 'podium') {
    // stone piers proud of the line, a stone spandrel (podium) or fascia (lobby); glass recessed between
    const g0 = kind === 'lobby' ? 1.2 : 0.5;
    for (const x of [-14, -9.33, -4.67, 0, 4.67, 9.33, 14]) for (const sz of [-1, 1]) box('stone', x - 0.45, 0.05, sz * 8.45, x + 0.45, top, sz * 9.22);
    for (const z of [-9, -4.5, 0, 4.5, 9]) for (const sx of [-1, 1]) box('stone', sx * 13.45, 0.05, z - 0.45, sx * 14.22, top, z + 0.45);
    const band = kind === 'lobby' ? [top - 0.75, top] : [0.05, 1.15];
    box('stone', -14.15, band[0], 8.7, 14.15, band[1], 9.15);
    box('stone', -14.15, band[0], -9.15, 14.15, band[1], -8.7);
    box('stone', 13.7, band[0], -8.7, 14.15, band[1], 8.7);
    box('stone', -14.15, band[0], -8.7, -13.7, band[1], 8.7);
    const gy0 = kind === 'lobby' ? 0.05 : 1.15;
    const gy1 = kind === 'lobby' ? top - 0.75 : top;
    pane('glass', -14 + g0, 9 - g0, 14 - g0, 9 - g0, gy0, gy1);
    pane('glass', 14 - g0, -9 + g0, -14 + g0, -9 + g0, gy0, gy1);
    pane('glass', 14 - g0, 9 - g0, 14 - g0, -9 + g0, gy0, gy1);
    pane('glass', -14 + g0, -9 + g0, -14 + g0, 9 - g0, gy0, gy1);
    if (kind === 'lobby') box('slab', -14 + g0, top - 0.75, -9 + g0, 14 - g0, top - 0.7, 9 - g0);
    fins(9 - g0, 0.12, gy0, gy1, -14 + g0, 14 - g0, 1.55);
    fins(-9 + g0, -0.12, gy0, gy1, -14 + g0, 14 - g0, 1.55);
  } else if (kind === 'tower' || kind === 'sky') {
    // the curtain wall: an aluminium spandrel at each slab, vertical fins every 1.4 m, glass 0.35 m behind the fins' face
    const sky = kind === 'sky';
    box('spandrel', -14.1, -0.3, 8.95, 14.1, 0.22, 9.1);
    box('spandrel', -14.1, -0.3, -9.1, 14.1, 0.22, -8.95);
    box('spandrel', 13.95, -0.3, -8.95, 14.1, 0.22, 8.95);
    box('spandrel', -14.1, -0.3, -8.95, -13.95, 0.22, 8.95);
    const gz = 8.62;
    const gx = 13.62;
    const south = sky ? 6 : gz;
    pane('glass', gx, -gz, -gx, -gz, 0.22, top);
    pane('glass', gx, south, gx, -gz, 0.22, top);
    pane('glass', -gx, -gz, -gx, south, 0.22, top);
    pane('glass', -gx, south, gx, south, sky ? 0.05 : 0.22, top);
    fins(-gz, -0.55, -0.3, top, -14, 14);
    finsX(gx, 0.55, -0.3, top, -9, sky ? 6 : 9);
    finsX(-gx, -0.55, -0.3, top, -9, sky ? 6 : 9);
    if (!sky) fins(gz, 0.55, -0.3, top);
    else {
      // the sky garden: a 3 m terrace behind the line, a 2 m planted ledge, a glass rail; columns on the 8 m grid
      box('deck', -14, 0.05, 6, 14, 0.12, 11);
      box('spandrel', -14.1, -0.3, 10.95, 14.1, 0.25, 11.1);
      pane('rail', -14, 11.05, 14, 11.05, 0.25, 1.2);
      pane('rail', 14.05, 9, 14.05, 11, 0.12, 1.2);
      pane('rail', -14.05, 11, -14.05, 9, 0.12, 1.2);
      for (const [x, z] of PKG.cols) if (z === 8) box('stone', x - 0.4, 0.12, z - 0.4, x + 0.4, top, z + 0.4);
      // the stair (three walls, its treads) and the escape corridor's walls, niches behind the north wall
      const [sx0, sz0, sx1, sz1] = PKG.stair;
      box('core', sx0, 0.05, sz0, sx1, 2.6, sz0 + 0.2);
      box('core', sx0, 0.05, sz1 - 0.2, sx1, 2.6, sz1);
      box('core', sx1 - 0.2, 0.05, sz0, sx1, 2.6, sz1);
      // v6.3: the stair's treads, rail and arrow are the plan's ink (FilmV6 draws them); here the walls and the core wall
      box('core', sx0 + 1.4, 0.05, sz0 + 1.4, sx0 + 1.6, 1.0, sz1);
      const [kx0, kz0, kx1, kz1] = PKG.corridor;
      box('core', kx0, 0.05, kz1, kx1, 2.4, kz1 + 0.15);
      box('core', kx0, 0.05, kz0 - 0.15, kx1, 2.4, kz0);
    }
  } else if (kind === 'garden') {
    // 5F, the podium roof garden: open, columns, timber deck, a glass rail round the edge
    for (const [x0, z0, x1, z1] of [[-14, -9, cx0, 11], [cx1, -9, 14, 11], [cx0, cz1, cx1, 11], [cx0, -9, cx1, cz0]]) box('deck', x0, 0.05, z0, x1, 0.12, z1);
    for (const [x, z] of PKG.cols) box('stone', x - 0.4, 0.12, z - 0.4, x + 0.4, top, z + 0.4);
    box('spandrel', -14.1, -0.3, 10.95, 14.1, 0.25, 11.1);
    pane('rail', -14, 11.05, 14, 11.05, 0.25, 1.2);
    pane('rail', 14.05, -9, 14.05, 11, 0.12, 1.2);
    pane('rail', -14.05, 11, -14.05, -9, 0.12, 1.2);
    pane('rail', 14, -9.05, -14, -9.05, 0.12, 1.2);
  } else {
    // the roof: a parapet, deck, the crown (the fins carried 4 m above the roof under a ring beam)
    box('spandrel', -14.1, -0.3, 8.95, 14.1, 1.1, 9.1);
    box('spandrel', -14.1, -0.3, -9.1, 14.1, 1.1, -8.95);
    box('spandrel', 13.95, -0.3, -8.95, 14.1, 1.1, 8.95);
    box('spandrel', -14.1, -0.3, -8.95, -13.95, 1.1, 8.95);
    for (const [x0, z0, x1, z1] of [[-5, -8.9, cx0, 8.9], [cx1, -8.9, 13.9, 8.9], [cx0, cz1, cx1, 8.9], [cx0, -8.9, cx1, cz0]]) box('deck', x0, 0.05, z0, x1, 0.12, z1);
    fins(9.1, 0.45, 1.1, 4.0);
    fins(-9.1, -0.45, 1.1, 4.0);
    finsX(14.1, 0.45, 1.1, 4.0);
    finsX(-14.1, -0.45, 1.1, 4.0);
    box('crown', -14.6, 4.0, 9.1, 14.6, 4.45, 9.6);
    box('crown', -14.6, 4.0, -9.6, 14.6, 4.45, -9.1);
    box('crown', 14.1, 4.0, -9.1, 14.6, 4.45, 9.1);
    box('crown', -14.6, 4.0, -9.1, -14.1, 4.45, 9.1);
  }
  const out: LevelGeo = {};
  for (const [k, list] of Object.entries(parts)) out[k as keyof TowerMats] = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  LGEO.set(key, out);
  return out;
}
/** Night: the rooms behind the glass, lit at random in warm, neutral and cool whites; a third of them dark. */
let ROOMS: THREE.InstancedMesh | null = null;
function rooms(): THREE.InstancedMesh {
  if (ROOMS) return ROOMS;
  const r = rand(4242);
  const cols = ['#ffdcb4', '#ffe6c8', '#fff0de', '#f4f6ff', '#e6eeff'];
  const list: {p: THREE.Vector3; ry: number; w: number; h: number; c: THREE.Color}[] = [];
  for (const s of SLABS) {
    const kind = kindOf(s.floor);
    if (kind === 'roof' || kind === 'garden') continue;
    const fh = Number(s.floor) <= 4 ? TOWER.podH : TOWER.twrH;
    const y = s.y + (kind === 'lobby' ? 0.05 : kind === 'podium' ? 1.2 : 0.5);
    const h = (kind === 'lobby' ? fh - 1.1 : kind === 'podium' ? fh - 1.5 : fh - 0.85) - 0.05;
    const inset = kind === 'lobby' ? 2.4 : 1.3;
    const south = kind === 'sky' ? 6 - 1.0 : 9 - inset;
    // each floor has its own occupancy, so the lit rooms never line up into bands
    const occ = 0.35 + 0.6 * r();
    const faces: [number, number, number, number, number][] = [
      [-14 + inset, south, 14 - inset, south, 0],
      [14 - inset, -9 + inset, -14 + inset, -9 + inset, Math.PI],
      [14 - inset, south, 14 - inset, -9 + inset, Math.PI / 2],
      [-14 + inset, -9 + inset, -14 + inset, south, -Math.PI / 2],
    ];
    for (const [x0, z0, x1, z1, ry] of faces) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2.8));
      for (let k = 0; k < n; k++) {
        if (r() > occ) continue;
        const u = (k + 0.5) / n;
        const c = new THREE.Color(cols[Math.floor(r() * cols.length)]).multiplyScalar(0.62 + 0.34 * r());
        list.push({p: new THREE.Vector3(TX + lerp(x0, x1, u), y + h / 2, TZ + lerp(z0, z1, u)), ry, w: (len / n) * 0.96, h, c});
      }
    }
  }
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({color: '#ffffff', side: THREE.DoubleSide, toneMapped: true}), list.length);
  const m = new THREE.Matrix4();
  list.forEach((o, i) => {
    m.compose(o.p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.ry), new THREE.Vector3(o.w, o.h, 1));
    im.setMatrixAt(i, m);
    im.setColorAt(i, o.c);
  });
  im.userData.noAO = true;
  im.frustumCulled = false;
  return (ROOMS = im);
}
/** Night: light washes up the podium's stone piers and the tower's base (uplights), a soft gradient, additive. */
let WASH: THREE.Texture | null = null;
function washTexture(): THREE.Texture {
  if (WASH) return WASH;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 256, 2, 32, 256, 250);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 256);
  WASH = new THREE.CanvasTexture(c);
  return WASH;
}
const Washes: React.FC = () => {
  const items: [number, number, number, number, number][] = [];
  for (const x of [-14, -9.33, -4.67, 0, 4.67, 9.33, 14]) items.push([x, 0, 9.32, 0, 11]);
  for (const z of [-9, -4.5, 0, 4.5, 9]) items.push([14.32, 0, z, Math.PI / 2, 11]);
  for (const x of [-11.2, -5.6, 0, 5.6, 11.2]) items.push([x, 21.4, 9.3, 0, 14]);
  return (
    <>
      {items.map(([x, y, z, ry, h], k) => (
        <mesh key={k} position={[TX + x, y + h / 2, TZ + z]} rotation={[0, ry, 0]} renderOrder={7} userData={{noAO: true}}>
          <planeGeometry args={[2.2, h]} />
          <meshBasicMaterial color="#ffe6c4" alphaMap={washTexture()} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </>
  );
};
/** The tower: each level from its kind; the explode, the drawers, the lift-away and the core section as V4. */
const TowerV6: React.FC<{t: number; end: boolean; on: number}> = ({t, end, on}) => {
  const T = towerMats6();
  const n = SLABS.length;
  // v6.3: no section and no isolation: the lift beat is V2's drawer (Scene)
  const cut = 0;
  const iso = false;
  CUT.constant = 1e6;
  CUT_INV.constant = -1e6;
  // the glass clears for the section (V4); by day it reflects its own sky over grey (GLASS6)
  const glass = T.glass as THREE.MeshStandardMaterial;
  glass.opacity = (L.windows > 0 ? 0.34 : GLASS6.opacity) * (1 - cut);
  glass.envMap = L.windows > 0 ? null : GLASS_ENV;
  const slide = planterSlide(t);
  const pOut = plantersOut(t);
  return (
    <>
      {SLABS.map((s) => {
        void on;
        void n;
        const e = end ? 1 : smooth(clamp01((t - landAt(s.i)) / 0.35));
        if (e <= 0.002) return null;
        const kind = kindOf(s.floor);
        const fh = Number(s.floor) <= 4 ? TOWER.podH : TOWER.twrH;
        const geo = levelGeo(kind, fh);
        const alike = (t > 31.9 && t < 35.4) || (s.floor === '5' && t >= 35.4 && t < 39.8);
        const d0 = drawerAt(t, s.floor);
        const d = end || alike ? {dx: 0, dz: 0, dy: 0, out: 0} : d0;
        const y = end ? s.y : levelAt(t, s.floor) - d0.dy + d.dy;
        const lit = end ? {k: 0, colour: LIT_STAGE} : litAt(t, s.floor);
        const litCol = lit.colour === '#2457ff' ? L.accent : L.accentLt;
        const ghost = iso && Number(s.floor) <= 5;
        const sc = end ? 1 : drawerScale(t, s.floor);
        return (
          <group key={s.i} position={[TX + d.dx, y, TZ + d.dz]} scale={[sc, sc * Math.max(0.001, e), sc]} userData={{subject: s.floor === '8' || TY.floors.includes(s.floor) ? 'typical' : undefined, build: end ? undefined : buildAt(t, s.i)}}>
            {(Object.keys(geo) as (keyof TowerMats)[]).map((mk) =>
              ghost ? (
                mk !== 'slab' && mk !== 'core' && mk !== 'stone' && mk !== 'deck' ? null : <mesh key={mk} geometry={geo[mk]} material={GHOST6} renderOrder={6} userData={{noAO: true}} />
              ) : (
                <mesh key={mk} geometry={geo[mk]} material={T[mk]} castShadow={mk !== 'glass' && mk !== 'rail'} receiveShadow renderOrder={mk === 'glass' || mk === 'rail' ? 4 : 0} userData={{noAO: mk === 'glass' || mk === 'rail', noEdge: mk === 'fin' || mk === 'void'}} />
              ),
            )}
            {!ghost && (kind === 'garden' || kind === 'sky')
              ? PKG.terrace.map((b, j) => (
                  <group key={`t${j}`} position={[(b[0] + b[2]) / 2, 0.12, (b[1] + b[3]) / 2]}>
                    <Shrubs w={b[2] - b[0]} d={b[3] - b[1]} h={kind === 'garden' ? 1.15 : 0.85} seed={s.i * 10 + j} />
                  </group>
                ))
              : null}
            {kind === 'sky'
              ? PKG.cplanters.map((b, j) => {
                  // v6.3: 1.2 m deep as drawn; the fix halves them in place, their backs on the wall
                  const dep = lerp(b[3] - b[1], (b[3] - b[1]) / 2, pOut);
                  return (
                    <group key={`c${j}`} position={[(b[0] + b[2]) / 2, 0.05, b[1] + dep / 2]}>
                      <Shrubs w={b[2] - b[0]} d={dep} h={0.6} seed={70 + s.i + j} />
                    </group>
                  );
                })
              : null}
            {kind === 'garden' ? (
              <group position={[(PKG.b10[0] + PKG.b10[2]) / 2, 0.12, (PKG.b10[1] + PKG.b10[3]) / 2 + 1.6 * slide]}>
                <Shrubs w={PKG.b10[2] - PKG.b10[0]} d={PKG.b10[3] - PKG.b10[1]} h={B10_H} seed={10} />
              </group>
            ) : null}
            {kind === 'roof' ? (
              <>
                <mesh position={[(PKG.roofLawn[0] + PKG.roofLawn[2]) / 2, 0.22, (PKG.roofLawn[1] + PKG.roofLawn[3]) / 2]} geometry={mBox(PKG.roofLawn[2] - PKG.roofLawn[0], 0.3, PKG.roofLawn[3] - PKG.roofLawn[1])} material={T.lawn} receiveShadow castShadow />
                {PKG.roofPlanters.map((b, j) => (
                  <group key={`r${j}`} position={[(b[0] + b[2]) / 2, 0.12, (b[1] + b[3]) / 2]} userData={{subject: j === 0 ? 'roof' : undefined}}>
                    <Shrubs w={b[2] - b[0]} d={b[3] - b[1]} h={0.55} seed={30 + j} />
                  </group>
                ))}
              </>
            ) : null}
            {s.floor === '4' ? (
              <mesh position={[SHAFT.x, 1.5 + 1.15, SHAFT.z]} material={T.car} castShadow>
                <boxGeometry args={[2.0, 2.3, 2.0]} />
              </mesh>
            ) : null}
            {lit.k > 0.02 && d.out > 0.02
              ? [
                  [[-14.4, -9.4], [14.4, -9.4]],
                  [[14.4, -9.4], [14.4, 11.4]],
                  [[14.4, 11.4], [-14.4, 11.4]],
                  [[-14.4, 11.4], [-14.4, -9.4]],
                ].map(([a, b], j) => <Bar key={`l${j}`} a={a as [number, number]} b={b as [number, number]} y={0.1} colour={litCol} th={0.32} op={lit.k} />)
              : null}
          </group>
        );
      })}
      {iso && !end ? <LiftShaft /> : null}
      {L.windows > 0 && end ? <primitive object={rooms()} /> : null}
      {L.windows > 0 && end ? <Washes /> : null}
    </>
  );
};
/** v6.2: the podium round the shaft, ghosted for the lift beat. */
const GHOST6 = new THREE.MeshBasicMaterial({color: '#aab1bd', transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide});
/** B-10's planter height (its box); the clash outline in FilmV6 reaches its top. */
export const B10_H = 1.25;
const SHAFT_DARK = new THREE.MeshStandardMaterial({color: '#25282e', roughness: 0.92, metalness: 0});
const SHAFT_NEAR = new THREE.MeshStandardMaterial({color: '#1d2026', roughness: 0.5, metalness: 0, transparent: true, opacity: 0.56, depthWrite: false});
/** v6.2: the lift shaft alone (L-102, T09): dark walls from the ground to the 5F slab; the two near walls see-through, so the car shows inside. */
const LiftShaft: React.FC = () => {
  const [x0, z0, x1, z1] = PKG.lift;
  const top = Y5 + 0.05;
  const w = 0.22;
  const wall = (m: THREE.Material, xa: number, za: number, xb: number, zb: number, k: string) => (
    <mesh key={k} position={[TX + (xa + xb) / 2, top / 2, TZ + (za + zb) / 2]} material={m} renderOrder={m === SHAFT_NEAR ? 7 : 0} userData={{noAO: m === SHAFT_NEAR}}>
      <boxGeometry args={[Math.abs(xb - xa), top, Math.abs(zb - za)]} />
    </mesh>
  );
  return (
    <group>
      {wall(SHAFT_DARK, x0 - w, z0 - w, x0, z1 + w, 'w')}
      {wall(SHAFT_DARK, x0, z0 - w, x1, z0, 'n')}
      {wall(SHAFT_NEAR, x1, z0 - w, x1 + w, z1 + w, 'e')}
      {wall(SHAFT_NEAR, x0, z1, x1, z1 + w, 's')}
      <mesh position={[TX + (x0 + x1) / 2, 0.02, TZ + (z0 + z1) / 2]} material={SHAFT_DARK}>
        <boxGeometry args={[x1 - x0, 0.04, z1 - z0]} />
      </mesh>
    </group>
  );
};
class Toggle extends Pass {
  fn: () => void;
  constructor(fn: () => void) {
    super();
    this.needsSwap = false;
    this.fn = fn;
  }
  render() {
    this.fn();
  }
}
/** Hide (or restore) everything AO must not see: glass, leaf cards, rails, washes, the sky. */
function aoHide(scene: THREE.Scene, hide: boolean) {
  scene.traverse((o) => {
    if (!o.userData.noAO) return;
    if (hide) {
      o.userData.vis = o.visible;
      o.visible = false;
    } else o.visible = o.userData.vis ?? true;
  });
}
/** Every frame through one composer: GTAO (contact shadows so parts separate), the end's lens blur, night bloom. */
const Post: React.FC<{focus?: number; aperture?: number; maxblur?: number; draw: number; subject: string; build: boolean}> = ({focus, aperture = 0.00004, maxblur = 0.0028, draw, subject, build}) => {
  const {gl, scene, camera, size} = useThree();
  const fx = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, samples: 4});
    const composer = new EffectComposer(gl, rt);
    const st = {build: false, saved: [] as Saved[]};
    composer.addPass(new Toggle(() => (st.saved = st.build ? buildSwap(scene) : [])));
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({radius: 1.1, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
    gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16});
    gtao.normalMaterial.clippingPlanes = [CUT];
    composer.addPass(new Toggle(() => aoHide(scene, true)));
    composer.addPass(gtao);
    composer.addPass(new Toggle(() => aoHide(scene, false)));
    composer.addPass(new Toggle(() => (restoreAll(st.saved), (st.saved = []))));
    const bokeh = new BokehPass(scene, camera, {focus: 200, aperture: 0.00004, maxblur: 0.0028});
    composer.addPass(bokeh);
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), L.bloom, 0.55, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const drawPass = new DrawPass(scene, camera);
    composer.addPass(drawPass);
    return {composer, bokeh, bloom, gtao, drawPass, st};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  fx.composer.setPixelRatio(gl.getPixelRatio());
  fx.composer.setSize(size.width, size.height);
  fx.bokeh.enabled = focus !== undefined;
  if (focus !== undefined) {
    const u = fx.bokeh.uniforms as Record<string, {value: number}>;
    u.focus.value = focus;
    u.aperture.value = aperture;
    u.maxblur.value = maxblur;
  }
  fx.bloom.enabled = L.bloom > 0;
  fx.gtao.enabled = true;
  fx.st.build = build;
  fx.drawPass.k = draw;
  fx.drawPass.subject = subject;
  fx.drawPass.enabled = draw > 0.001;
  useFrame(() => fx.composer.render(), 1);
  return null;
};
// ---------------------------------------------------------------- v6.3: the drawing mode and the build
/** Drawing mode: pure white surfaces, ink edges, the sheets as they are, only the subject cobalt. The build: a cobalt wire ghost. */
const DRAWM = (() => {
  const fill = (c: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, fog: false});
  // v6.4: plants are never cobalt. A soft sage fill; behind each leaf card a 1.4× twin in ink makes the outline
  const alphaOnly = (m: THREE.MeshBasicMaterial, key: string, grow = 1) => {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\n  diffuseColor.a *= texture2D( map, vMapUv ).a;\n#endif').replace('#include <color_fragment>', '');
      if (grow !== 1) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3( position.xy * ${grow.toFixed(2)}, position.z );`);
    };
    m.customProgramCacheKey = () => key;
    return m;
  };
  const leaf = alphaOnly(new THREE.MeshBasicMaterial({color: '#A9BFA0', side: THREE.DoubleSide, alphaTest: 0.5, fog: false}), 'draw-leaf');
  const rim = alphaOnly(new THREE.MeshBasicMaterial({color: '#2E3B30', side: THREE.DoubleSide, alphaTest: 0.5, fog: false, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3}), 'draw-leaf-rim', 1.4);
  return {
    white: fill('#ffffff'),
    tint: fill(new THREE.Color('#ffffff').lerp(new THREE.Color('#2F5FE8'), 0.22)),
    bwhite: fill(new THREE.Color('#ffffff').multiplyScalar(1.7)),
    none: new THREE.MeshBasicMaterial({colorWrite: false, depthWrite: false}),
    ink: new THREE.LineBasicMaterial({color: '#1D2026', fog: false}),
    cobalt: new THREE.LineBasicMaterial({color: '#2F5FE8', fog: false}),
    ghost: new THREE.LineBasicMaterial({color: '#2F5FE8', transparent: true, opacity: 0.6, depthWrite: false, fog: false}),
    leaf,
    rim,
  };
})();
const EDGES = new Map<string, THREE.EdgesGeometry>();
/** A mesh's ink edges (28°), made once per geometry, hung on the mesh and shown only while drawing. */
function edgeChild(m: THREE.Mesh): THREE.LineSegments | null {
  let e = m.userData.edgeObj as THREE.LineSegments | undefined;
  if (e && e.parent === m) return e;
  const g = m.geometry as THREE.BufferGeometry | undefined;
  if (!g || !g.attributes?.position) return null;
  let eg = EDGES.get(g.uuid);
  if (!eg) {
    eg = new THREE.EdgesGeometry(g, 28);
    EDGES.set(g.uuid, eg);
  }
  e = new THREE.LineSegments(eg, DRAWM.ink);
  e.userData.edge = true;
  e.visible = false;
  e.raycast = () => {};
  m.add(e);
  m.userData.edgeObj = e;
  return e;
}
type Saved = [THREE.Object3D, 0 | 1 | 2, unknown];
const hideO = (o: THREE.Object3D, sv: Saved[]) => (sv.push([o, 0, o.visible]), (o.visible = false));
const setMat = (m: THREE.Mesh, mat: THREE.Material, sv: Saved[]) => (sv.push([m, 1, m.material]), (m.material = mat));
const showEdge = (m: THREE.Mesh, lm: THREE.LineBasicMaterial, sv: Saved[]) => {
  if (m.userData.noEdge) return;
  const e = edgeChild(m);
  if (!e) return;
  sv.push([e, 0, e.visible]);
  e.visible = true;
  e.material = lm;
};
function restoreAll(sv: Saved[]) {
  for (let i = sv.length - 1; i >= 0; i--) {
    const [o, k, v] = sv[i];
    if (k === 0) o.visible = v as boolean;
    else if (k === 1) (o as THREE.Mesh).material = v as THREE.Material;
    else o.userData.noAO = v;
  }
}
const firstMat = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial & {isMeshBasicMaterial?: boolean; isShaderMaterial?: boolean; isShadowMaterial?: boolean};
function leafFor(mat: THREE.MeshStandardMaterial): THREE.Material {
  if (!DRAWM.leaf.map && mat.map) {
    DRAWM.leaf.map = mat.map;
    DRAWM.rim.map = mat.map;
    DRAWM.leaf.needsUpdate = true;
    DRAWM.rim.needsUpdate = true;
  }
  return DRAWM.leaf;
}
/** The ink rim of a leaf mesh: an instanced twin on the same cards (shown only while drawing). */
function leafRim(im: THREE.InstancedMesh, sv: Saved[]) {
  let r = im.userData.rimObj as THREE.InstancedMesh | undefined;
  if (!r || r.parent !== im) {
    r = new THREE.InstancedMesh(im.geometry, DRAWM.rim, im.instanceMatrix.count);
    r.instanceMatrix = im.instanceMatrix;
    r.frustumCulled = false;
    r.userData.edge = true;
    r.visible = false;
    im.add(r);
    im.userData.rimObj = r;
  }
  r.count = im.count;
  sv.push([r, 0, r.visible]);
  r.visible = true;
}
/** v6.8 tinted illustration: each material's pale colour (soil stays dark, trunks brown, water pale blue). */
const TINTS = new Map<THREE.Material, THREE.Material>();
let TINT_NAMED: Map<THREE.Material, string> | null = null;
function tintFor(mat: THREE.Material): THREE.Material {
  const hit = TINTS.get(mat);
  if (hit) return hit;
  if (!TINT_NAMED) {
    const M = mats();
    const T = towerMats6();
    const C = CTX;
    const pairs: [THREE.Material | undefined, string][] = [
      [M.concrete, '#D9DBDE'], [M.concreteDk, '#C3C6CB'], [M.soil, '#5E4838'], [M.trunk, '#8B6A4C'], [M.deck, '#E4D0AF'], [M.pavers, '#E6E1D7'], [M.lawn, '#BFD4AC'],
      [M.slab, '#CDD0D4'], [M.paperEdge, '#F2F2F0'], [M.metal, '#D2D6DC'],
      [T.slab, '#E2E0DB'], [T.core, '#ECEEF1'], [T.stone, '#D9D6D0'], [T.fin, '#D8DDE4'], [T.spandrel, '#D4D9E1'], [T.deck, '#E4D0AF'], [T.lawn, '#BFD4AC'], [T.car, '#E7E9EC'], [T.crown, '#D8DDE4'],
      [C?.stone, '#E6E1D7'], [C?.turf, '#BFD4AC'], [C?.water, '#CFE1EF'], [C?.coping, '#E3E0DA'], [C?.asphalt, '#B8BBC0'], [C?.grate, '#9FA4AB'], [C?.bollard, '#B9BDC3'],
    ];
    TINT_NAMED = new Map(pairs.filter(([m]) => !!m) as [THREE.Material, string][]);
  }
  const named = TINT_NAMED.get(mat);
  let c: THREE.Color;
  if (named) c = new THREE.Color(named);
  else {
    const base = ((mat as THREE.MeshStandardMaterial).color ?? new THREE.Color('#ffffff')).clone();
    const k = Math.max(base.r, base.g, base.b, 1);
    c = new THREE.Color(base.r / k, base.g / k, base.b / k).lerp(new THREE.Color('#ffffff'), 0.5);
  }
  const m = new THREE.MeshBasicMaterial({color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, fog: false});
  TINTS.set(mat, m);
  return m;
}
const FLAT = new Map<THREE.Material, THREE.MeshBasicMaterial>();
function flatSheet(mat: THREE.MeshStandardMaterial): THREE.MeshBasicMaterial {
  let f = FLAT.get(mat);
  if (!f) {
    f = new THREE.MeshBasicMaterial({map: mat.map, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false});
    FLAT.set(mat, f);
  }
  f.opacity = mat.opacity;
  return f;
}
const GLAZE = new THREE.MeshBasicMaterial({color: '#D6E4EF', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false});
/** The drawing render's swap: tinted fills and ink edges; the subject (a floor plate, a box) cobalt; plants sage. */
function drawSwap(scene: THREE.Scene, subject: string): Saved[] {
  const sv: Saved[] = [];
  const walk = (o: THREE.Object3D, sub: boolean) => {
    if (!o.visible || o.userData.edge) return;
    const s = sub || (!!subject && o.userData.subject === subject);
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = firstMat(m);
      if (o.userData.drawKeep) {
        // the drawings stay as drawn; a fading sheet is drawn flat (unlit), so it veils what is under it only by its opacity
        if (mat.transparent && mat.opacity < 0.99 && mat.map) setMat(m, flatSheet(mat), sv);
      } else if (o.userData.leaf) {
        setMat(m, leafFor(mat), sv);
        leafRim(m as THREE.InstancedMesh, sv);
      } else if (mat.isShadowMaterial) hideO(o, sv);
      else if (mat.isShaderMaterial) setMat(m, DRAWM.white, sv);
      else if (!mat.isMeshBasicMaterial) {
        const tr = mat.transparent && mat.opacity < 0.99;
        setMat(m, tr ? GLAZE : s ? DRAWM.tint : tintFor(Array.isArray(m.material) ? m.material[0] : m.material), sv);
        showEdge(m, s ? DRAWM.cobalt : DRAWM.ink, sv);
      }
    } else if ((o as THREE.Points).isPoints || ((o as THREE.Line).isLine && !o.userData.edge)) hideO(o, sv);
    for (const c of [...o.children]) walk(c, s);
  };
  walk(scene, false);
  return sv;
}
/** The build's swap in the main render: floors still building are a cobalt wire ghost (0) or white with ink (1). */
function buildSwap(scene: THREE.Scene): Saved[] {
  const sv: Saved[] = [];
  const walk = (o: THREE.Object3D, st: number | undefined) => {
    if (!o.visible || o.userData.edge) return;
    const b = o.userData.build !== undefined ? (o.userData.build as number) : st;
    const m = o as THREE.Mesh;
    if (b !== undefined && b < 2 && m.isMesh) {
      const mat = firstMat(m);
      if (o.userData.leaf) hideO(o, sv);
      else if (!mat.isMeshBasicMaterial) {
        const tr = mat.transparent && mat.opacity < 0.99;
        setMat(m, b === 0 || tr ? DRAWM.none : DRAWM.bwhite, sv);
        showEdge(m, b === 0 ? DRAWM.ghost : DRAWM.ink, sv);
        if (b === 0) {
          sv.push([o, 2, o.userData.noAO]);
          o.userData.noAO = true;
        }
      }
    }
    for (const c of [...o.children]) walk(c, b);
  };
  walk(scene, undefined);
  return sv;
}
/** The drawing render, blended over the finished frame in display space (so its white is pure white). */
class DrawPass extends Pass {
  k = 0;
  subject = '';
  scene: THREE.Scene;
  camera: THREE.Camera;
  rt: THREE.WebGLRenderTarget;
  mat: THREE.ShaderMaterial;
  quad: FullScreenQuad;
  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, samples: 4});
    this.mat = new THREE.ShaderMaterial({
      uniforms: {tA: {value: null}, tB: {value: null}, k: {value: 0}},
      vertexShader: 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragmentShader:
        'uniform sampler2D tA;\nuniform sampler2D tB;\nuniform float k;\nvarying vec2 vUv;\nvec3 srgb(vec3 c) {\n  c = clamp(c, 0.0, 1.0);\n  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));\n}\nvoid main() {\n  vec4 a = texture2D(tA, vUv);\n  gl_FragColor = vec4(mix(a.rgb, srgb(texture2D(tB, vUv).rgb), k), 1.0);\n}',
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  setSize(w: number, h: number) {
    this.rt.setSize(w, h);
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const sv = drawSwap(this.scene, this.subject);
    const fog = this.scene.fog;
    this.scene.fog = null;
    const cc = renderer.getClearColor(new THREE.Color());
    const ca = renderer.getClearAlpha();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setClearColor(cc, ca);
    this.scene.fog = fog;
    restoreAll(sv);
    this.mat.uniforms.tA.value = readBuffer.texture;
    this.mat.uniforms.tB.value = this.rt.texture;
    this.mat.uniforms.k.value = this.k;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// ---------------------------------------------------------------- v6.3: the site in context (the opening and the end)
/** Neighbouring masses, ghosted: [x0, z0, x1, z1, height]. */
const NEIGHBOURS: [number, number, number, number, number][] = [
  [-62, -64, -26, -28, 34], [66, -70, 100, -36, 46], [-70, -4, -40, 28, 22], [112, -14, 142, 22, 26],
];
let CTX: {asphalt: THREE.MeshStandardMaterial; ghostDay: THREE.MeshStandardMaterial; ghostNight: THREE.MeshStandardMaterial; edgeDay: THREE.LineBasicMaterial; edgeNight: THREE.LineBasicMaterial; lamp: THREE.MeshBasicMaterial; pool: THREE.MeshBasicMaterial; wet: THREE.MeshStandardMaterial; wetRoad: THREE.MeshStandardMaterial; mirror: Reflector; pond: Reflector; film: THREE.MeshStandardMaterial; stone: THREE.MeshStandardMaterial; turf: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial; coping: THREE.MeshStandardMaterial; grate: THREE.MeshStandardMaterial; glowLine: THREE.MeshBasicMaterial; bollard: THREE.MeshStandardMaterial; pondF: Reflector} | null = null;
function ctxMats() {
  if (CTX) return CTX;
  const M = mats();
  // v6.4: wet paving: a low-resolution reflection (soft, rough) under a paver film; a sharp shallow pool in the foreground
  const mirror = new Reflector(new THREE.PlaneGeometry(1600, 1600), {textureWidth: 256, textureHeight: 144, color: 0x6c7282, clipBias: 0.003});
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set(TX + 40, 0.012, TZ + 60);
  mirror.userData.noAO = true;
  const pool = new Reflector(new THREE.PlaneGeometry(70, 44), {textureWidth: 1920, textureHeight: 1080, color: 0x8d95a8, clipBias: 0.003});
  pool.rotation.x = -Math.PI / 2;
  pool.userData.noAO = true;
  const film = M.pavers.clone();
  film.color = new THREE.Color('#353a45');
  film.transparent = true;
  film.opacity = 0.62;
  film.depthWrite = false;
  film.roughness = 0.55;
  const S = PBR_MAPS!;
  void S;
  CTX = {
    // granite tiles large enough that the joints read from the plaza's distances; a natural, less yellow lawn
    stone: pbrMat('stone', 3.0, {color: new THREE.Color(1.9, 1.86, 1.8), roughness: 0.78}),
    turf: pbrMat('lawn', 1.1, {color: new THREE.Color(0.3, 0.52, 0.3), roughness: 0.95}),
    water: new THREE.MeshStandardMaterial({color: '#1f2d35', roughness: 0.05, metalness: 0.0, envMapIntensity: 1.3}),
    coping: pbrMat('stone', 0.8, {color: new THREE.Color(1.05, 1.04, 1.02), roughness: 0.7}),
    grate: new THREE.MeshStandardMaterial({color: '#3a3d42', roughness: 0.55, metalness: 0.8}),
    glowLine: new THREE.MeshBasicMaterial({color: new THREE.Color('#ffd9a6').multiplyScalar(2.2), toneMapped: false}),
    bollard: new THREE.MeshStandardMaterial({color: '#4a4e55', roughness: 0.5, metalness: 0.6}),
    pondF: new Reflector(new THREE.PlaneGeometry(15.4, 4.6), {textureWidth: 960, textureHeight: 540, color: 0x8d95a8, clipBias: 0.003}),
    asphalt: new THREE.MeshStandardMaterial({color: '#4a4d53', roughness: 0.95, metalness: 0, map: M.concrete.map, normalMap: M.concrete.normalMap}),
    ghostDay: new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.9, transparent: true, opacity: 0.2, depthWrite: false}),
    ghostNight: new THREE.MeshStandardMaterial({color: '#0b1224', roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.9}),
    edgeDay: new THREE.LineBasicMaterial({color: '#1D2026', transparent: true, opacity: 0.12, depthWrite: false}),
    edgeNight: new THREE.LineBasicMaterial({color: '#4D6BB8', transparent: true, opacity: 0.32, depthWrite: false}),
    lamp: new THREE.MeshBasicMaterial({color: new THREE.Color('#ffd8a0').multiplyScalar(3.2), toneMapped: false}),
    pool: new THREE.MeshBasicMaterial({color: '#ffc27a', alphaMap: glowTexture(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false}),
    wet: new THREE.MeshStandardMaterial({color: '#2a2f3a', roughness: 0.5, metalness: 0.1, map: M.pavers.map, transparent: true, opacity: 0.55, depthWrite: false}),
    wetRoad: new THREE.MeshStandardMaterial({color: '#15181f', roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.5, depthWrite: false}),
    mirror,
    pond: pool,
    film,
  };
  CTX.pondF.rotation.x = -Math.PI / 2;
  CTX.pondF.userData.noAO = true;
  return CTX;
}
/** The street trees along the south sidewalk, in grates; none where the 0:48 eye-level camera stands (x ≈ 23). */
const STREET_TREES = Array.from({length: 22}, (_, i) => -64 + i * 11).filter((x) => x > -60 && x < 165 && Math.abs(x - 23) > 8);
const BOXEDGE = new Map<string, THREE.EdgesGeometry>();
const Mass: React.FC<{b: [number, number, number, number, number]; night: boolean; k: number}> = ({b, night, k}) => {
  const C = ctxMats();
  const [x0, z0, x1, z1, h] = b;
  const key = `${x1 - x0}|${h}|${z1 - z0}`;
  const geo = mBox(x1 - x0, h, z1 - z0);
  let eg = BOXEDGE.get(key);
  if (!eg) BOXEDGE.set(key, (eg = new THREE.EdgesGeometry(geo)));
  return (
    <group position={[(x0 + x1) / 2, (h * k) / 2, (z0 + z1) / 2]} scale={[1, Math.max(0.001, k), 1]}>
      <mesh geometry={geo} material={night ? C.ghostNight : C.ghostDay} renderOrder={night ? 0 : 5} userData={{noAO: !night}} />
      <lineSegments geometry={eg} material={night ? C.edgeNight : C.edgeDay} />
    </group>
  );
};
/** v6.3 the site in context: L-1's planned road (curbs, sidewalks, street trees), plaza paving, the planting in 3D, ghosted neighbours; at night wet and lit. */
const Context: React.FC<{k: number; night: boolean}> = ({k, night}) => {
  const M = mats();
  const C = ctxMats();
  const sy = Math.max(0.001, k);
  const X0 = -70;
  const X1 = 170;
  const W = X1 - X0;
  const XC = (X0 + X1) / 2;
  return (
    <group>
      {night ? (
        <>
          <primitive object={C.mirror} />
          <mesh position={[TX + 40, 0.02, TZ + 60]} geometry={mBox(1600, 0.004, 1600)} material={C.film} renderOrder={1} />
          {(() => {
            // the pool sits in the foreground of the night camera, across its view (its coping in dark stone)
            const c = duskAt(0.5);
            const d = c.look.clone().sub(c.pos).setY(0).normalize();
            const at = c.pos.clone().add(d.clone().multiplyScalar(44));
            const yaw = Math.atan2(d.x, d.z);
            return (
              <group position={[at.x, 0.03, at.z]} rotation={[0, yaw, 0]}>
                <primitive object={C.pond} />
                {[[0, 22.3, 70.8, 0.6], [0, -22.3, 70.8, 0.6], [35.3, 0, 0.6, 44], [-35.3, 0, 0.6, 44]].map(([x, z, w, dd], k) => (
                  <mesh key={k} position={[x, 0.06, z]} geometry={mBox(w, 0.16, dd)} material={M.concreteDk} />
                ))}
              </group>
            );
          })()}
        </>
      ) : null}
      <group position={[0, lerp(-0.6, 0, sy), 0]}>
        {/* the planned road (8 m), curbs and sidewalks, south of the site (L-1) */}
        <mesh position={[XC, 0.04, 41.2]} geometry={mBox(W, 0.08, 8)} material={night ? C.wetRoad : C.asphalt} receiveShadow />
        {[37.1, 45.3].map((z) => (
          <mesh key={z} position={[XC, 0.1, z]} geometry={mBox(W, 0.2, 0.24)} material={M.concrete} receiveShadow castShadow />
        ))}
        {[35.9, 46.9].map((z) => (
          <mesh key={z} position={[XC, 0.08, z]} geometry={mBox(W, 0.16, z < 40 ? 2.2 : 3.0)} material={night ? C.wet : M.pavers} receiveShadow />
        ))}
        {Array.from({length: 40}, (_, i) => (
          <mesh key={i} position={[X0 + 3 + i * 6, 0.085, 41.2]} geometry={mBox(3, 0.02, 0.15)} material={M.paperEdge} />
        ))}
        {/* v6.6 the plaza: granite paving with its joints (wet at night), the fire lane, a natural lawn */}
        <mesh position={[29.6, 0.03, -8.2]} geometry={mBox(50, 0.06, 20.6)} material={night ? C.wet : C.stone} receiveShadow />
        <mesh position={[29.6, 0.03, 19.6]} geometry={mBox(50, 0.05, 30)} material={night ? C.wet : C.stone} receiveShadow />
        <mesh position={[6.6, 0.065, 17.05]} geometry={mBox(4, 0.07, 23.1)} material={M.concrete} receiveShadow />
        <mesh position={[38.6, 0.08, 17.5]} geometry={mBox(19.8, 0.12, 9.8)} material={C.turf} receiveShadow />
        {/* a shallow rectangular water feature in the forecourt, its stone coping, a lit inner edge at night */}
        {[[38, 4.4, 16.6, 0.5], [38, 9.6, 16.6, 0.5], [30, 7, 0.5, 5.7], [46, 7, 0.5, 5.7]].map(([x, z, w, d], k) => (
          <mesh key={`c${k}`} position={[x, 0.2, z]} geometry={mBox(w, 0.34, d)} material={C.coping} receiveShadow castShadow />
        ))}
        {night ? (
          <group position={[38, 0.24, 7]}>
            <primitive object={C.pondF} />
            {[[0, -2.3, 15.4, 0.05], [0, 2.3, 15.4, 0.05]].map(([x, z, w, d], k) => (
              <mesh key={k} position={[x, 0.02, z]} geometry={mBox(w, 0.03, d)} material={C.glowLine} />
            ))}
          </group>
        ) : (
          <mesh position={[38, 0.22, 7]} geometry={mBox(15.5, 0.02, 4.7)} material={C.water} />
        )}
        {/* benches: a timber seat on two stone blocks */}
        {[[33, 11.3], [43, 11.3], [20.5, 11.0]].map(([x, z], k) => (
          <group key={`b${k}`} position={[x, 0, z]}>
            {[-0.75, 0.75].map((dx) => (
              <mesh key={dx} position={[dx, 0.22, 0]} geometry={mBox(0.3, 0.4, 0.45)} material={C.coping} castShadow receiveShadow />
            ))}
            <mesh position={[0, 0.46, 0]} geometry={mBox(2.1, 0.08, 0.5)} material={M.deck} castShadow receiveShadow />
          </group>
        ))}
        {/* low bollards along the plaza's edges and the water's path (they glow at night) */}
        {[...Array.from({length: 9}, (_, i) => [7 + i * 6, 34.0]), ...Array.from({length: 5}, (_, i) => [54.0, 8 + i * 6]), ...Array.from({length: 5}, (_, i) => [29 + i * 4.5, 10.4])].map(([x, z], i) => (
          <group key={`p${i}`} position={[x, 0, z]}>
            <mesh position={[0, 0.42, 0]} geometry={mBox(0.16, 0.8, 0.16)} material={C.bollard} castShadow />
            <mesh position={[0, 0.84, 0]} geometry={mBox(0.18, 0.06, 0.18)} material={night ? C.lamp : C.coping} />
            {night ? (
              <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={C.pool}>
                <planeGeometry args={[3.6, 3.6]} />
              </mesh>
            ) : null}
          </group>
        ))}
        {/* tree grates under the street trees */}
        {STREET_TREES.map((x) => (
          <mesh key={`g${x}`} position={[x, 0.165, 47.2]} geometry={mBox(1.6, 0.02, 1.6)} material={C.grate} receiveShadow />
        ))}
      </group>
      {/* raised planting beds (the azalea area of L-1): layered shrubs in varied greens over groundcover */}
      <group position={[0, lerp(-0.8, 0, sy), 0]}>
        {[[14.1, 17.5], [22.1, 17.5]].map(([x, z], k) => (
          <group key={`r${k}`} position={[x, 0.04, z]}>
            <Shrubs w={7} d={9.8} h={0.55} seed={60 + k} card={0.3} grid={0.9} wall={C.coping} />
          </group>
        ))}
      </group>
      {k > 0.05 ? <Hedge upto={9999} /> : null}
      {STREET_TREES.map((x, i) => (
        <Tree key={i} x={x} z={47.2} r={1.7} s={k} h={3.4} seed={200 + i} />
      ))}
      {NEIGHBOURS.map((b, i) => (
        <Mass key={i} b={b} night={night} k={k} />
      ))}
      {night ? (
        <>
          {/* street lights along both sidewalks; low path lights round the site */}
          {Array.from({length: 13}, (_, i) => X0 + 10 + i * 18).flatMap((x, i) =>
            [36.2, 46.4].map((z) => (
              <group key={`${i}-${z}`} position={[x + (z > 40 ? 9 : 0), 0, z]}>
                <mesh position={[0, 3.6, 0]} geometry={mBox(0.14, 7.2, 0.14)} material={M.metal} />
                <mesh position={[0, 7.2, z > 40 ? -0.6 : 0.6]} geometry={mBox(0.9, 0.18, 0.4)} material={C.lamp} />
                <mesh position={[0, 0.03, z > 40 ? -1.6 : 1.6]} rotation={[-Math.PI / 2, 0, 0]} material={C.pool}>
                  <planeGeometry args={[11, 11]} />
                </mesh>
              </group>
            )),
          )}

        </>
      ) : null}
    </group>
  );
};

/** The sun by day (low, long soft shadows), the moon at night; fixed, so the shadow never shimmers. */
const SUN_T = new THREE.Object3D();
SUN_T.position.set(TX, 0, TZ + 24);
const DAPPLE_T = new THREE.Object3D();
DAPPLE_T.position.set(TX - 6, 30, TZ + 4);
let DAPPLE: THREE.Texture | null = null;
/** Light through leaves: a soft pattern of leaf clusters (dark) and gaps (light) for the spot's cookie. */
function dappleTexture(): THREE.Texture {
  if (DAPPLE) return DAPPLE;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  g.filter = 'blur(2.5px)';
  const r = rand(4242);
  for (let k = 0; k < 380; k++) {
    g.save();
    g.translate(r() * 512, r() * 512);
    g.rotate(r() * Math.PI);
    g.fillStyle = `rgba(20,16,10,${0.82 + 0.18 * r()})`;
    g.beginPath();
    g.ellipse(0, 0, 6 + r() * 12, 3 + r() * 6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  DAPPLE = tx;
  return tx;
}
/** v6.3 the warm opening's weight (1 warm and low, 0 the clean day), set by the scene each frame. */
let WARM = 0;
/** The warm opening's dimmed ambient (the glide and the stack only), so the sun reads golden on the paper. */
let WARM_AMB = 0;
const SELF_WARM = () => new THREE.Color(0.7 * WARM, 0, 0);
const Sun: React.FC<{t: number; end: boolean; cold?: boolean}> = ({t, end, cold}) => {
  // v6.3: the opening in a warm, low late-afternoon sun (long soft shadows; leaf dapple drifting over the paper), into the
  // clean, high day light as the explanation beats begin
  const w = WARM;
  const dir = new THREE.Vector3(...L.sunDir).normalize().lerp(new THREE.Vector3(-0.8, 0.34, 0.5).normalize(), w).normalize();
  const p = SUN_T.position.clone().add(dir.clone().multiplyScalar(330));
  // white paper: the light is warm white while the leaves dapple it, golden only on the hero tower after
  const col = cold ? new THREE.Color('#fff1de') : new THREE.Color(L.sun).lerp(new THREE.Color('#fff1de').lerp(new THREE.Color('#ffae5a'), ov(t, 20.4, 21.2)), w);
  const dap = end ? 0 : cold ? 1.3 * (1 - ov(t, 1.8, 2.5)) : w * (1 - ov(t, 20.4, 21.2));
  if (cold) DAPPLE_T.position.set(COLD.cx - 8, 1, COLD.cz + 4);
  else DAPPLE_T.position.set(TX - 6, 30, TZ + 4);
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const sp = DAPPLE_T.position.clone().add(dir.clone().multiplyScalar(240)).add(side.multiplyScalar((t - (cold ? 0 : 15)) * 0.7));
  return (
    <>
      {dap > 0.01 ? <spotLight position={sp.toArray()} target={DAPPLE_T} angle={0.26} penumbra={0.5} decay={0} intensity={cold ? 4.6 : 4.6 * dap} color="#ffeccf" castShadow map={dappleTexture()} shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004} shadow-camera-far={600} /> : null}
      <primitive object={DAPPLE_T} />
      <directionalLight position={p.toArray()} target={SUN_T} intensity={cold ? 0.35 : lerp(L.sunI, 2.9 - 2.3 * dap, w)} color={col} castShadow shadow-mapSize-width={4096} shadow-mapSize-height={4096} shadow-camera-left={-175} shadow-camera-right={175} shadow-camera-top={175} shadow-camera-bottom={-175} shadow-camera-near={1} shadow-camera-far={760} shadow-bias={-0.0003} shadow-normalBias={0.05} shadow-radius={14} />
      <primitive object={SUN_T} />
    </>
  );
};

/** v6.4 the cold open's world: the stage, the warm low sun with its leaf dapple (a little stronger), thirty sheets. */
const ColdScene: React.FC<{t: number; tex: THREE.Texture[]; l1: THREE.Texture}> = ({t, tex, l1}) => {
  // v6.5: white paper; the warmth only where the sun gets through the leaves (WARM_AMB low: a near-neutral ambient)
  WARM = 1;
  WARM_AMB = 0.88;
  const dof = coldDof(t);
  const white = new THREE.Color('#ffffff');
  return (
    <>
      <CameraRig t={t} />
      <Look night={false} />
      <Post focus={dof.k > 0.01 ? dof.focus : undefined} aperture={0.00018 * dof.k} maxblur={0.006} draw={0} subject="" build={false} />
      <Stage t={t} end={false} />
      <hemisphereLight args={[L.hemiSky, L.hemiGround, L.hemi * (1 - 0.72 * WARM_AMB)]} />
      <Sun t={t} end={false} cold />
      <fog attach="fog" args={[new THREE.Color(L.horizon).multiplyScalar(L.gain), L.fog[0] * 4.5, L.fog[1] * 4.5]} />
      {coldSheets().map((_, i) => {
        const s = coldSheetAt(t, i);
        const map = i === COLD.n - 1 ? l1 : tex[i % tex.length];
        const w = L1.w;
        return (
          <group key={i} position={s.p.toArray()} rotation={[s.pitch, s.yaw, s.roll]}>
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <Sheet w={w} h={w * aspect(map)} map={map} tint={white} op={1} night={false} shadow={false} order={3 + i} />
            </group>
          </group>
        );
      })}
    </>
  );
};
const Scene: React.FC<{t: number; sheets: WorldSheet[]; tex: THREE.Texture[]; l1: THREE.Texture; dusk?: number}> = ({t, sheets, tex, l1, dusk}) => {
  // the end (`dusk`): the finished project in the same materials and light as Part 1 (Eric's note), seen on a slow orbit
  const end = dusk !== undefined;
  const night = false;
  // v6.6: neutral at the push's landing (it must match the screen still), then the dappled warm-white light from 15.3
  // v6.9: the light holds constant from the push on (the warm, dappled light lives only in the cold open's glide)
  WARM = 0;
  WARM_AMB = 0;
  const M = mats();
  const idx = (id: string) => sheets.findIndex((s) => s.id === id);
  const first = idx(FIRST);
  const fixed: Record<string, number> = {'1': first, '5': idx('L-102'), '8': idx('L-103'), R: idx('L-104')};
  const used = new Set(Object.values(fixed));
  const rest = sheets.map((_, i) => i).filter((i) => !used.has(i));
  const sheetOfSlab = SLABS.map((s) => (fixed[s.floor] !== undefined ? fixed[s.floor] : rest.shift()!));
  const ts = end ? 1 : treeScale(t);
  const rise = end ? 0 : riseAt(t);
  const ringP = ov(t, 53.4, 54.0, (u) => u);
  const counted = end ? 0 : countedAt(t);
  const hedgeA = end ? 0 : Math.min(ov(t, 69.0, 69.6), 1 - ov(t, 74.0, 74.6));
  const hedgeN = hedgeGrow(t);
  const pavA = end ? 0 : Math.min(ov(t, 74.4, 74.9), 1 - ov(t, 77.3, 77.8));
  const shrink = pitShrink(t);
  const pitOn = !end && t >= 77.6 && t < 87.2;
  // v6.3: at night the drawing sheet is gone (a dark, wet ground instead)
  const paper = end ? 0 : paperAt(t);
  const toTower = end ? 1 : towerA(t);
  const slide = planterSlide(t);
  const pOut = plantersOut(t);
  const fpGlow = end ? 0 : ov(t, 18.8, 19.6) * (1 - ov(t, 21.0, 22.0));
  const ink = L.inkLine;
  // the key light and its shadow frustum never move (a moving shadow map shimmers): one box over the whole scene
  const focus = KEY.target;
  const keyPos = KEY.pos;
  const shadowR = KEY.r;
  return (
    <>
      <CameraRig t={t} dusk={dusk} />
      <Look night={end} />
      {(() => {
        // the end's soft lens; the opening glide's shallow focus on the linework (glideDof)
        const g = end ? {k: 0, focus: 0} : glideDof(t);
        const focus = end ? cameraAt(t, dusk).pos.distanceTo(new THREE.Vector3(TX, 34, TZ)) : g.k > 0.01 ? g.focus : undefined;
        return <Post focus={focus} aperture={end ? 0.00004 : 0.00018 * g.k} maxblur={end ? 0.0028 : 0.006} draw={end ? 0 : drawAt(t)} subject={subjectAt(t)} build={!end && t > 17.0 && t < 20.9} />;
      })()}
      <Stage t={t} end={end} />
      <hemisphereLight args={[L.hemiSky, L.hemiGround, L.hemi * (1 - 0.72 * WARM_AMB)]} />
      <Sun t={t} end={end} />
      {/* rim: cool, from behind */}
      <directionalLight position={[TX + 70, 90, TZ - 140]} intensity={L.rimI} color={L.rim} />
      <fog attach="fog" args={[new THREE.Color(L.horizon).multiplyScalar(L.gain), L.fog[0], L.fog[1]]} />
      {L.garden ? <GardenLights /> : null}
      {(() => {
        const ck = end ? 1 : Math.max(Math.min(ov(t, 20.1, 20.9), 1 - ov(t, 21.9, 22.5)), Math.min(ov(t, 45.9, 46.6), 1 - ov(t, 48.1, 48.8)));
        return ck > 0.001 ? <Context k={ck} night={end} /> : null;
      })()}

      {/* L-102's drawer (V2's lift beat, v6.3): the open shaft with its car below; planter B-10 over it, then off the core */}
      {(() => {
        const d = drawerAt(t, '5');
        if (end || d.out <= 0.02 || t < 35.0 || t > 39.8) return null;
        const hx = TX + d.dx + SHAFT.x;
        const hz = TZ + d.dz + SHAFT.z;
        const y0 = Y5 + d.dy + 0.45;
        const sz = SHAFT.s;
        // the problem in cobalt: a thicker outline with a gentle pulse (no red)
        const th = 0.18 + 0.07 * (0.5 + 0.5 * Math.sin((t - 35) * Math.PI * 2 * 0.8));
        return (
          <group position={[hx, y0, hz]}>
            {[
              [0, sz / 2, sz, 0.12],
              [0, -sz / 2, sz, 0.12],
              [sz / 2, 0, 0.12, sz],
              [-sz / 2, 0, 0.12, sz],
            ].map(([x, z, w, dd], k) => (
              <mesh key={k} position={[x, -4.5, z]} material={M.concreteDk} receiveShadow userData={{drawKeep: true}}>
                <boxGeometry args={[w, 9, dd]} />
              </mesh>
            ))}
            <mesh position={[0, -9, 0]}>
              <boxGeometry args={[sz, 0.1, sz]} />
              <meshBasicMaterial color="#0b0c10" toneMapped={false} />
            </mesh>
            <group position={[0, -3.6, 0]}>
              <mesh position={[0, 1.15, 0]}>
                <boxGeometry args={[2.0, 2.3, 2.0]} />
                <meshStandardMaterial color="#c4c8ce" roughness={0.35} metalness={0.6} />
              </mesh>
              <mesh position={[0, 2.33, 0]}>
                <boxGeometry args={[2.02, 0.06, 2.02]} />
                <meshStandardMaterial color="#d9dce0" roughness={0.4} metalness={0.5} />
              </mesh>
              {[-0.5, 0.5].map((x) => (
                <mesh key={x} position={[x, 4.0, 0]}>
                  <boxGeometry args={[0.04, 3.4, 0.04]} />
                  <meshStandardMaterial color="#4a4f58" roughness={0.5} metalness={0.7} />
                </mesh>
              ))}
            </group>
            {[
              [[-sz / 2, -sz / 2], [sz / 2, -sz / 2]],
              [[sz / 2, -sz / 2], [sz / 2, sz / 2]],
              [[sz / 2, sz / 2], [-sz / 2, sz / 2]],
              [[-sz / 2, sz / 2], [-sz / 2, -sz / 2]],
            ].map(([a, b], k) => (
              <Bar key={k} a={a as [number, number]} b={b as [number, number]} y={0.08} colour={L.accent} th={th} />
            ))}
            <group position={[lerp(1.55, 4.3, slide), 0.02, 0]}>
              <Shrubs w={3} d={2.5} h={0.7} seed={10} />
            </group>
          </group>
        );
      })()}

      {/* the planting plan on paper (or blueprint) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.x0 + L1.w / 2, 0, L1.z0 + L1.h / 2]} renderOrder={2} receiveShadow userData={{drawKeep: true}} visible={paper > 0.002}>
        <planeGeometry args={[L1.w, L1.h]} />
        <meshStandardMaterial map={l1} color="#ffffff" emissive={SELF_WARM()} roughness={0.94} metalness={0} transparent={paper < 0.999} opacity={paper} depthWrite={paper > 0.99} onBeforeCompile={sheetShader} customProgramCacheKey={sheetKey} />
      </mesh>
      {/* the plan's paper edge, under it (never coplanar), so it reads as a sheet on the ground */}
      {paper > 0.99 ? (
        <mesh position={[L1.x0 + L1.w / 2, -0.09, L1.z0 + L1.h / 2]} material={M.paperEdge} receiveShadow>
          <boxGeometry args={[L1.w, 0.16, L1.h]} />
        </mesh>
      ) : null}
      {FOOT.placeholder ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.x0 + L1.w / 2, 0, (FOOT.podium.cz - FOOT.podium.d / 2 - 6 + L1.z0) / 2]} receiveShadow>
          <planeGeometry args={[L1.w, L1.z0 - (FOOT.podium.cz - FOOT.podium.d / 2 - 6)]} />
          <meshStandardMaterial color={L.sheet === 'blueprint' ? L.blue : '#ffffff'} emissive={L.sheet === 'blueprint' ? L.blue : '#ffffff'} emissiveIntensity={L.selfLit} roughness={0.94} />
        </mesh>
      ) : null}
      {(() => {
        const r = FOOT.podium;
        const pts: [number, number][] = [[r.cx - r.w / 2, r.cz - r.d / 2], [r.cx + r.w / 2, r.cz - r.d / 2], [r.cx + r.w / 2, r.cz + r.d / 2], [r.cx - r.w / 2, r.cz + r.d / 2]];
        const op = FOOT.placeholder ? 1 : fpGlow;
        return pts.map((p, j) => <Bar key={j} a={p} b={pts[(j + 1) % 4]} y={0.03} colour={fpGlow > 0.02 ? L.accent : ink} th={lerp(0.16, 0.5, fpGlow)} op={op} />);
      })()}

      {/* the trees: 3D on L-1's circles, flattening into them on the turn; the circles */}
      {ROW.map((r, i) => {
        const is8 = r.id === t08.object_id;
        const col = i < counted ? L.accent : ink;
        const isPit = r.id === PT.id && pitOn;
        return (
          <group key={r.id}>
            {!is8 && !end ? <Ring x={r.x} z={r.z} r={r.r} colour={isPit ? L.accent : col} th={isPit ? 0.2 : i < counted ? 0.16 : 0.07} /> : null}
            {!isPit ? <Tree x={r.x} z={r.z} r={r.r * 0.85} s={ts} h={2.8} seed={i + 3} night={night} /> : null}
          </group>
        );
      })}
      <Tree x={T10.x} z={T10.z} r={T10.r * 0.85} s={ts} h={2.8} seed={41} night={night} />
      {!end ? <Ring x={T10.x} z={T10.z} r={T10.r} colour={ink} th={0.08} /> : null}
      {t08.canopy.map((seg, i) => {
        const [a, b] = pieceEnds(i);
        return end ? null : <Bar key={seg.handle} a={a} b={b} y={0.06 + pieceHeight(i) * rise} colour={rise > 0.02 || (t >= 50 && t < 66) ? L.accent : ink} th={rise > 0.02 ? 0.12 : 0.09} />;
      })}
      {(end ? [] : t08.cross).map((seg) => (
        <Bar key={seg.handle} a={[SX(seg.points[0][0]), SZ(seg.points[0][1])]} b={[SX(seg.points[1][0]), SZ(seg.points[1][1])]} y={0.06} colour={ink} th={0.06} op={1 - rise} />
      ))}
      {ringP > 0 && t < 66 ? (
        <mesh position={[T8.x, 0.1, T8.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[t08.radius + 0.25, t08.radius + 0.5, 96, 1, Math.PI / 2, -ringP * Math.PI * 2]} />
          <meshBasicMaterial color={L.accent} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}

      {/* the hedge: two rows of plants grow along the 27 m line */}
      {hedgeA > 0 ? (
        <group>
          <Hedge upto={hedgeN} />
        </group>
      ) : null}
      {hedgeA > 0 ? <Bar a={[HEDGE.x + 0.55, HEDGE.z0]} b={[HEDGE.x + 0.55, HEDGE.z0 - (HEDGE.z0 - HEDGE.z1) * hedgeN]} y={0.08} colour={L.accentLt} th={0.12} op={hedgeA} /> : null}
      <Tint x={PAVERS.x} z={PAVERS.z} w={PAVERS.w} d={PAVERS.d} colour={L.accent} op={0.32 * pavA} />
      {pavA > 0.002
        ? [
            [[PAVERS.x - PAVERS.w / 2, PAVERS.z - PAVERS.d / 2], [PAVERS.x + PAVERS.w / 2, PAVERS.z - PAVERS.d / 2]],
            [[PAVERS.x + PAVERS.w / 2, PAVERS.z - PAVERS.d / 2], [PAVERS.x + PAVERS.w / 2, PAVERS.z + PAVERS.d / 2]],
            [[PAVERS.x + PAVERS.w / 2, PAVERS.z + PAVERS.d / 2], [PAVERS.x - PAVERS.w / 2, PAVERS.z + PAVERS.d / 2]],
            [[PAVERS.x - PAVERS.w / 2, PAVERS.z + PAVERS.d / 2], [PAVERS.x - PAVERS.w / 2, PAVERS.z - PAVERS.d / 2]],
          ].map(([a, b], k) => <Bar key={k} a={a as [number, number]} b={b as [number, number]} y={0.08} colour={L.accent} th={0.14} op={pavA} />)
        : null}

      {/* the pit, under the paper at the third camphor: kerbs, soil 1.0 m, drainage, the slab; the tree over it */}
      {pitOn ? (
        <group position={[PT.x, 0, PT.z]}>
          <mesh position={[0, -1.3, 0]} geometry={mBox(9, 0.4, 7)} material={M.slab} receiveShadow castShadow />
          {/* the ground on the slab, cut away toward the camera: soil to grade, lawn and stone pavers on top */}
          {[
            {x: -2.7, z: -2.2, w: 3.6, d: 2.6, top: M.lawn},
            {x: 1.8, z: -2.2, w: 5.4, d: 2.6, top: M.pavers},
            {x: -2.7, z: 1.3, w: 3.6, d: 4.4, top: M.lawn},
          ].map((b, k) => (
            <mesh key={k} position={[b.x, -0.6, b.z]} geometry={mBox(b.w, 1.0, b.d)} material={[M.soil, M.soil, b.top, M.soil, M.soil, M.soil]} receiveShadow castShadow />
          ))}
          <mesh position={[0, -1.05, 0]} geometry={mBox(1.5, 0.1, 1.5)} material={M.concreteDk} receiveShadow />
          <mesh position={[0, -0.55, 0]} geometry={mBox(1.5, 0.9, 1.5)} material={M.soil} receiveShadow />
          {[
            [0, 0.825, 1.8, 0.15],
            [0, -0.825, 1.8, 0.15],
            [0.825, 0, 0.15, 1.5],
            [-0.825, 0, 0.15, 1.5],
          ].map(([x, z, w, d], k) => (
            <mesh key={k} position={[x, -0.57, z]} geometry={mBox(w, 1.06, d)} material={M.concrete} castShadow receiveShadow />
          ))}
          <mesh position={[0, -0.5, 0]} material={M.soil}>
            <sphereGeometry args={[0.3, 18, 14]} />
          </mesh>
          {[[0.5, -0.6], [-0.45, -0.7], [0.2, -0.85], [-0.2, -0.8]].map(([dx, dy], k) => (
            <mesh key={k} position={[dx / 2, -0.5 + dy / 2, 0.78]} rotation={[0, 0, Math.atan2(dy, dx) + Math.PI / 2]}>
              <boxGeometry args={[0.05, Math.hypot(dx, dy), 0.05]} />
              <meshStandardMaterial color="#4a3826" roughness={1} />
            </mesh>
          ))}
          <Tree x={0} z={0} r={lerp(2.0, 1.05, shrink)} s={1} h={lerp(3.6, 2.0, shrink)} seed={77} />
        </group>
      ) : null}
      {SEVEN.map((s, k) => {
        const a = end ? 1 : t >= P.seven ? sevenAt(t, k) : 0;
        if (a <= 0) return null;
        return (
          <group key={k}>
            {!end ? <Ring x={s.x} z={s.z} r={s.r} colour={L.accentLt} th={0.1} op={a} /> : null}
            <Tree x={s.x} z={s.z} r={0.9} s={a} h={1.9} seed={100 + k} night={night} />
          </group>
        );
      })}

      {/* the sheets: L-6 first, high; the others fly in and stack; the stack settles into the tower on the footprint */}
      {SLABS.map((s) => {
        const si = sheetOfSlab[s.i];
        const isFirst = s.floor === '1';
        const a0 = isFirst ? 1 : ov(t, 15.5 + s.i * 0.07, 16.6 + s.i * 0.07);
        if (!end && a0 <= 0) return null;
        const yStack = S0 + s.i * 3.0;
        const settle = end ? 1 : ov(t, landAt(s.i) - 0.8, landAt(s.i));
        const y0 = lerp(yStack, s.y + 0.45, settle);
        const big = isFirst ? lerp(1.04, 1, ov(t, B.pull, 17.0)) : 1;
        const w0 = lerp(L1.w * big, s.w, settle);
        // v6.9: in from the east at the sheet's own height (no vertical travel), well below the camera: nothing crosses the lens
        const from = [TX + 240, yStack, TZ];
        const d = drawerAt(t, s.floor);
        const x = (isFirst || end ? TX : lerp(from[0], TX, smooth(a0))) + d.dx;
        const z = (isFirst || end ? TZ : lerp(from[2], TZ, smooth(a0))) + d.dz;
        const y = isFirst || end ? y0 + d.dy : lerp(from[1], y0, smooth(a0)) + d.dy;
        const lit = litAt(t, s.floor);
        const typical = TY.floors.includes(s.floor) && lit.k > 0;
        const map = typical ? tex[fixed['8']] : tex[si];
        const h = w0 * aspect(map);
        // v6: the sheets become the tower and go; only the two alike sheets come back out on V2's long drawers
        const onStage = d.out > 0.02 && t > 31.9 && t < (s.floor === '5' ? 39.8 : 35.4) && (s.floor === '5' || s.floor === '8');
        const op = end ? 0 : (a0 > 0 || isFirst ? 1 : 0) * (onStage ? 1 : 1 - ov(t, landAt(s.i) + 0.1, landAt(s.i) + 0.6));
        if (op <= 0.002) return null;
        const shaftHole = s.floor === '5' && t > 35.0 && t < 39.8 && onStage;
        const litCol = lit.colour === '#2457ff' ? L.accent : L.accentLt;
        const tint = new THREE.Color('#ffffff').lerp(new THREE.Color(litCol), 0.3 * lit.k);
        return (
          <group key={s.i} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <Sheet w={w0} h={h} map={map} tint={tint} op={op} hole={shaftHole ? holedSheet(w0, h, SHAFT.x, -SHAFT.z, SHAFT.s) : undefined} night={night} />
            {lit.k > 0.02 && lit.colour !== LIT_STAGE
              ? [
                  [[-w0 / 2 - 0.3, -h / 2 - 0.3], [w0 / 2 + 0.3, -h / 2 - 0.3]],
                  [[w0 / 2 + 0.3, -h / 2 - 0.3], [w0 / 2 + 0.3, h / 2 + 0.3]],
                  [[w0 / 2 + 0.3, h / 2 + 0.3], [-w0 / 2 - 0.3, h / 2 + 0.3]],
                  [[-w0 / 2 - 0.3, h / 2 + 0.3], [-w0 / 2 - 0.3, -h / 2 - 0.3]],
                ].map(([a, b], k) => (
                  <group key={k} rotation={[Math.PI / 2, 0, 0]}>
                    <Bar a={[a[0], -a[1]]} b={[b[0], -b[1]]} y={0.1} colour={litCol} th={0.5} op={lit.k} />
                  </group>
                ))
              : null}
          </group>
        );
      })}

      {/* the tower (v6) */}
      <TowerV6 t={t} end={end} on={toTower} />
    </>
  );
};
/** The key light: fixed, from the upper left front; its shadow box covers the plan, the tower and the drawers. */
const KEY = (() => {
  const target = new THREE.Vector3(TX + 18, 20, (TZ + L1.z0 + L1.h / 2) / 2);
  const dir = new THREE.Vector3(-0.55, 1.0, 0.42).normalize();
  const obj = new THREE.Object3D();
  obj.position.copy(target);
  return {target, obj, pos: target.clone().add(dir.multiplyScalar(220)), r: 135};
})();
/** The colour a drawer on stage is tinted (not a status: just "this sheet"). */
const LIT_STAGE = '#9fb3ff';
/** Glass: faint vertical mullions every 1.5 m, so the volume reads as a façade. */
let GLASS: THREE.Texture | null = null;
function glassTexture(): THREE.Texture {
  if (GLASS) return GLASS;
  const w = 64;
  const data = new Uint8Array(w * 4 * 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = x < 4 ? 120 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  const tx = new THREE.DataTexture(data, w, 4, THREE.RGBAFormat);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(16, 1);
  tx.magFilter = THREE.LinearFilter;
  tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.generateMipmaps = true;
  tx.needsUpdate = true;
  GLASS = tx;
  return tx;
}

export const WorldV6: React.FC<WorldV6Props> = ({t, sheets, l1, dusk, cold}) => {
  L = dusk !== undefined ? NIGHT : DAY;
  const {width, height} = useVideoConfig();
  const urls = useMemo(() => [...sheets.map((s) => staticFile(s.png)), staticFile(l1)], [sheets, l1]);
  const tex = useTextures(urls);
  const pbr = usePBR();
  return (
    <AbsoluteFill style={{background: L.horizon}}>
      {tex && pbr ? (
        <ThreeCanvas width={width} height={height} shadows gl={{antialias: true, alpha: false, powerPreference: 'high-performance'}} camera={{fov: 42, near: 0.5, far: 900, position: [0, 100, 100]}}>
          {cold ? <ColdScene t={t} tex={tex.slice(0, sheets.length)} l1={tex[sheets.length]} /> : <Scene t={t} sheets={sheets} tex={tex.slice(0, sheets.length)} l1={tex[sheets.length]} dusk={dusk} />}
        </ThreeCanvas>
      ) : null}
    </AbsoluteFill>
  );
};
/** L-6's drawn border in the world at time t (the first sheet, before the tower settles): TL, TR, BR, BL. */
export function firstBorderAt(t: number, border: number[], aspectHW: number): [number, number, number][] {
  const big = lerp(1.04, 1, ov(t, B.pull, 17.0));
  const w = L1.w * big;
  const h = w * aspectHW;
  const [bx0, by0, bx1, by1] = border;
  const P = (bx: number, by: number): [number, number, number] => [TX + (bx - 0.5) * w, S0 + 0.001, TZ - (0.5 - by) * h];
  return [P(bx0, by0), P(bx1, by0), P(bx1, by1), P(bx0, by1)];
}
export function plateAt(t: number, floor: string): [number, number, number] {
  const d = drawerAt(t, floor);
  return [TX + d.dx, levelAt(t, floor) + 0.5, TZ + d.dz];
}
/** The corridor's dimension line on L-103's drawer: from the south wall to the planter's face (or the north wall). */
export function corridorAt(t: number): {a: [number, number, number]; b: [number, number, number]} {
  // the clear width at the first planter: from the south wall to the planter's face (or the north wall's line)
  const y = levelAt(t, '8') + 1.6;
  const x = TX + (PKG.cplanters[0][0] + PKG.cplanters[0][2]) / 2;
  const cp = PKG.cplanters[0];
  const face = lerp(cp[3], (cp[1] + cp[3]) / 2, plantersOut(t));
  return {a: [x, y, TZ + PKG.corridor[3]], b: [x, y, TZ + face]};
}
export function personWorld(t: number): [number, number, number] {
  const p = personAt(t);
  return [TX + p.x, levelAt(t, '8') + 1.4, TZ + p.z];
}
