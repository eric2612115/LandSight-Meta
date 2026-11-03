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
import {LOOKS} from './v5-look';
import type {Look, LookSpec} from './v5-look';
import t08 from './t08.json';
import fpJson from './footprint-v11.json';
import {B, V2 as V11} from './film-v2-cues.js';

/**
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
export type WorldV5Props = {t: number; sheets: WorldSheet[]; l1: string; dusk?: number; look: Look};
/** The look of the current render (one look per composition render). */
let L: LookSpec = LOOKS.ink;
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
const TOWER = {x: FOOT.podium.cx, z: FOOT.podium.cz, podW: FOOT.podium.w, podD: FOOT.podium.d, podH: 4.5, podFloors: 4, twrW: FOOT.tower.w, twrD: FOOT.tower.d, twrH: 3.4, twrFloors: 16};
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
type Key = {t: number; pos: THREE.Vector3; look: THREE.Vector3; fov?: number};
const TOP = (x: number, y: number, z: number, h: number): [THREE.Vector3, THREE.Vector3] => [V(x, y + h, z + 0.02), V(x, y, z)];
const KEYS: Key[] = [
  {t: B.push, pos: V(TX, S0 + H0, TZ + 0.01), look: V(TX, S0, TZ), fov: 40},
  {t: B.pull, pos: V(TX, S0 + H0, TZ + 0.01), look: V(TX, S0, TZ), fov: 40},
  {t: 17.4, pos: V(TX + 70, S0 + 46, TZ + 112), look: V(TX, S0 + 4, TZ), fov: 40},
  {t: 19.8, pos: V(TX + 58, 80, 136), look: V(TX + 4, 20, TZ + 18), fov: 40},
  {t: B.drawer103 + 0.2, pos: V(TX + 84, 62, TZ + 100), look: V(TX + 18, 47, TZ), fov: 42},
  {t: 26.8, pos: V(TX + 86, 63, TZ + 96), look: V(TX + 20, 48, TZ), fov: 42},
  {t: 28.4, pos: V(TX + 96, YR + 22, TZ + 50), look: V(TX + 66, YR - 3, TZ), fov: 42},
  {t: 31.6, pos: V(TX + 97, YR + 22, TZ + 49), look: V(TX + 66, YR - 3, TZ), fov: 42},
  {t: 33.0, pos: V(TX + 70, 44, TZ + 40), look: V(TX + 44, 25, TZ), fov: 42},
  {t: 34.8, pos: V(TX + 70.5, 44, TZ + 39.5), look: V(TX + 44, 25, TZ), fov: 42},
  {t: 36.2, pos: V(TX + DR + 0.6, Y5 + 12.5, TZ + 8.5), look: V(TX + DR + 3.6, Y5 - 2.0, TZ + 2), fov: 42},
  {t: 38.9, pos: V(TX + DR + 0.8, Y5 + 12.5, TZ + 8.4), look: V(TX + DR + 3.6, Y5 - 2.0, TZ + 2), fov: 42},
  {t: 40.2, pos: V(TX + DR + 6, Y8 + 7.5, TZ + 9), look: V(TX + DR, Y8 + 0.6, TZ), fov: 42},
  {t: 41.5, ...(([p, l]) => ({pos: p, look: l}))(TOP(TX + DR, Y8 + 0.5, TZ + 0.2, 10.5)), fov: 42},
  {t: 45.2, ...(([p, l]) => ({pos: p, look: l}))(TOP(TX + DR, Y8 + 0.5, TZ + 0.2, 10.5)), fov: 42},
  {t: 46.7, pos: V(TX + 34, 44, 84), look: V(TX, 22, 4), fov: 42},
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
type Cam = {pos: THREE.Vector3; look: THREE.Vector3; fov: number};
function pathAt(t: number): Cam {
  const n = KEYS.length - 1;
  if (t <= KEYS[0].t) return {pos: KEYS[0].pos, look: KEYS[0].look, fov: KEYS[0].fov ?? 42};
  if (t >= KEYS[n].t) return {pos: KEYS[n].pos, look: KEYS[n].look, fov: KEYS[n].fov ?? 42};
  let k = 0;
  while (k < n && t > KEYS[k + 1].t) k++;
  const a = KEYS[k];
  const b = KEYS[k + 1];
  const e = smooth(clamp01((t - a.t) / (b.t - a.t)));
  // a still segment (same key twice) holds exactly; a moving one follows the curve through the keys
  if (a.pos.equals(b.pos) && a.look.equals(b.look)) return {pos: a.pos, look: a.look, fov: a.fov ?? 42};
  const u = (k + e) / n;
  return {pos: posCurve.getPoint(u), look: lookCurve.getPoint(u), fov: lerp(a.fov ?? 42, b.fov ?? 42, e)};
}
/** The end: a slow drift past the tower at dusk, from the south-east. `u` 0–1 over the end. */
function duskAt(u: number): Cam {
  const a = -0.55 + 0.22 * u;
  const r = 178 - 20 * u;
  return {pos: V(TX + Math.sin(a) * -r, 50 - 6 * u, TZ + Math.cos(a) * r), look: V(TX - 44, 33, TZ + 18), fov: 40};
}
export function cameraAt(t: number, dusk?: number): Cam {
  return dusk !== undefined ? duskAt(dusk) : pathAt(t);
}
const scratch = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 900);
function aim(cam: THREE.PerspectiveCamera, c: Cam) {
  cam.position.copy(c.pos);
  const dir = c.look.clone().sub(c.pos).normalize();
  const vert = clamp01((Math.abs(dir.y) - 0.86) / 0.13);
  cam.up.set(0, 1 - vert, -vert).normalize();
  cam.lookAt(c.look);
  cam.fov = c.fov;
  cam.near = 0.5;
  cam.far = 900;
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
export function drawerAt(t: number, floor: string): {out: number; dx: number; dy: number} {
  let out = 0;
  let dy = 0;
  if (floor === '8') {
    out = Math.max(ov(t, 21.6, 22.6) * (1 - ov(t, 26.4, 27.3)), ov(t, 32.4, 33.2) * (1 - ov(t, 34.5, 35.2)), ov(t, 39.3, 40.2) * (1 - ov(t, 45.0, 45.9)));
  } else if (TY.floors.includes(floor)) {
    const k = TY.floors.indexOf(floor);
    out = ov(t, TY.lit + k * TY.step, TY.lit + 0.6 + k * TY.step) * (1 - ov(t, 26.4, 27.3));
  } else if (floor === 'R') {
    out = ov(t, 27.6, 28.4) * (1 - ov(t, 31.4, 32.1));
  } else if (floor === '5') {
    out = ov(t, 32.4, 33.2) * (1 - ov(t, 38.9, 39.6));
    dy = (Y8 - Y5 + 0.6) * ov(t, 33.3, 34.0) * (1 - ov(t, 34.4, 35.0));
  }
  return {out, dx: out * DRAWER, dy};
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
  const walk1 = ov(t, 41.3, 42.5, (u) => u);
  const walk2 = ov(t, 44.0, 45.2, (u) => u);
  const x = lerp(lerp(-4.2, -2.75, walk1), 4.2, walk2);
  return {x, z: -0.3, a: Math.min(ov(t, 41.0, 41.3), 1 - ov(t, 45.3, 45.6))};
}
export const CORRIDOR = {len: 9, half: 0.75, niche: 0.7, px: [-1.6, 1.6], pw: 1.4, pd: 0.6};
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
export const towerA = (t: number) => ov(t, 18.4, 20.4);
export const stackIn = (t: number) => ov(t, 16.0, 18.4);
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
const PBR_IDS = {concrete: 'concrete_floor_02', facade: 'concrete_tile_facade', deck: 'wood_floor_deck', soil: 'farm_soil', lawn: 'leafy_grass', pavers: 'stone_pavers', bark: 'japanese_camphor_bark', metal: 'metal_plate'} as const;
type PBRKey = keyof typeof PBR_IDS;
type PBRSet = {map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture};
type PBR = Record<PBRKey, PBRSet> & {studio: THREE.DataTexture; night: THREE.DataTexture};
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
const Shrubs: React.FC<{w: number; d: number; h: number; seed: number}> = ({w, d, h, seed}) => {
  const M = mats();
  const balls = useMemo(() => {
    const r = rand(seed * 7919);
    const nx = Math.max(1, Math.round(w / 0.62));
    const nz = Math.max(1, Math.round(d / 0.62));
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
  }, [w, d, h, seed]);
  const th = 0.1;
  return (
    <group>
      {[
        [0, -d / 2 + th / 2, w, th],
        [0, d / 2 - th / 2, w, th],
        [-w / 2 + th / 2, 0, th, d - 2 * th],
        [w / 2 - th / 2, 0, th, d - 2 * th],
      ].map(([x, z, ww, dd], k) => (
        <mesh key={k} position={[x, h / 2, z]} geometry={mBox(ww, h, dd)} castShadow receiveShadow material={M.concrete} />
      ))}
      <mesh position={[0, (h - 0.12) / 2, 0]} geometry={mBox(w - 2 * th, h - 0.12, d - 2 * th)} receiveShadow material={M.soil} />
      <Leaves clumps={balls} card={0.17} seed={seed} />
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
      <group key={k} position={[r.x + 0.9, 0.3, r.z + 0.9]}>
        <pointLight color="#ffd9a8" intensity={22} distance={10} decay={2} />
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
const Look: React.FC<{night: boolean}> = () => {
  const {gl, scene} = useThree();
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const src = L.hdr === 'night' ? PBR_MAPS!.night : PBR_MAPS!.studio;
    src.mapping = THREE.EquirectangularReflectionMapping;
    const tx = pm.fromEquirectangular(src).texture;
    pm.dispose();
    return tx;
  }, [gl]);
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = L.exposure;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.environment = env;
  scene.environmentIntensity = L.env;
  return null;
};
/**
 * The stage: a sky dome from `top` overhead to `horizon` that travels with the camera; the ground 3 m below the paper, a
 * grid on it fading with distance, into the horizon through the fog; a shadow catcher on the ground (polygon offset).
 */
const Stage: React.FC = () => {
  const {camera} = useThree();
  const m = useMemo(() => {
    const dome = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {top: {value: new THREE.Color(L.top)}, hor: {value: new THREE.Color(L.horizon)}},
      vertexShader: 'varying vec3 vD;\nvoid main() {\n  vD = normalize(position);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragmentShader: 'uniform vec3 top;\nuniform vec3 hor;\nvarying vec3 vD;\nvoid main() {\n  float k = smoothstep(0.0, 0.6, vD.y);\n  gl_FragColor = vec4(mix(hor, top, k), 1.0);\n  #include <colorspace_fragment>\n}',
    });
    const ground = new THREE.ShaderMaterial({
      fog: true,
      toneMapped: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {base: {value: new THREE.Color(L.ground)}, grid: {value: new THREE.Color(L.grid)}, gridA: {value: L.gridA}, centre: {value: new THREE.Vector2(TX, 6)}}]),
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
      <mesh material={m.dome} position={camera.position.toArray()} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[800, 48, 24]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, -3, 0]} material={m.ground}>
        <planeGeometry args={[1400, 1400]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, -3, 0]} receiveShadow renderOrder={1}>
        <planeGeometry args={[1400, 1400]} />
        <shadowMaterial color="#000000" opacity={L.shadowA} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8} />
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
export const SHAFT = {x: 3, z: 2, s: 2.5};

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
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * ${L.selfLit.toFixed(3)};`);
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
const Sheet: React.FC<{w: number; h: number; map: THREE.Texture; tint: THREE.Color; op: number; hole?: THREE.ShapeGeometry; night: boolean}> = ({w, h, map, tint, op, hole}) => {
  const tr = op < 0.999;
  const mat = <meshStandardMaterial map={map} color={tint} roughness={0.93} metalness={0} transparent={tr} opacity={op} side={THREE.DoubleSide} depthWrite={!tr} onBeforeCompile={sheetShader} customProgramCacheKey={sheetKey} />;
  return (
    <>
      {hole ? (
        <mesh geometry={hole} renderOrder={3} receiveShadow castShadow>
          {mat}
        </mesh>
      ) : (
        <mesh renderOrder={3} receiveShadow castShadow>
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

const Scene: React.FC<{t: number; sheets: WorldSheet[]; tex: THREE.Texture[]; l1: THREE.Texture; dusk?: number}> = ({t, sheets, tex, l1, dusk}) => {
  // the end (`dusk`): the finished project in the same materials and light as Part 1 (Eric's note), seen on a slow orbit
  const end = dusk !== undefined;
  const night = false;
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
  const paper = end ? 1 : paperAt(t);
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
      <Look night={night} />
      {end ? <Dof focus={cameraAt(t, dusk).pos.distanceTo(new THREE.Vector3(TX, 28, TZ))} /> : null}
      <Stage />
      {/* fill: a soft sky; key: soft, casting the contact shadows; rim: cool, from behind */}
      <hemisphereLight args={[L.hemiSky, L.hemiGround, L.hemi]} />
      <directionalLight
        position={keyPos.toArray()}
        target={KEY.obj}
        intensity={L.keyI}
        color={L.key}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-shadowR}
        shadow-camera-right={shadowR}
        shadow-camera-top={shadowR}
        shadow-camera-bottom={-shadowR}
        shadow-camera-near={1}
        shadow-camera-far={480}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={5}
        shadow-intensity={L.top === '#FFFFFF' ? 0.45 : 0.65}
      />
      <primitive object={KEY.obj} />
      <directionalLight position={[focus.x + 70, focus.y + 34, focus.z - 120]} intensity={L.rimI} color={L.rim} />
      <directionalLight position={[focus.x - 140, focus.y + 20, focus.z - 40]} intensity={L.rimI * 0.45} color={L.rim} />
      <fog attach="fog" args={[L.horizon, L.fog[0], L.fog[1]]} />
      {L.garden ? <GardenLights /> : null}

      {/* the planting plan on paper (or blueprint) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.x0 + L1.w / 2, 0, L1.z0 + L1.h / 2]} renderOrder={2} receiveShadow>
        <planeGeometry args={[L1.w, L1.h]} />
        <meshStandardMaterial map={l1} color="#ffffff" roughness={0.94} metalness={0} transparent={paper < 0.999} opacity={paper} depthWrite={paper > 0.99} onBeforeCompile={sheetShader} customProgramCacheKey={sheetKey} />
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
            {!is8 ? <Ring x={r.x} z={r.z} r={r.r} colour={col} th={i < counted ? 0.16 : 0.07} /> : null}
            {!isPit ? <Tree x={r.x} z={r.z} r={r.r * 0.85} s={ts} h={2.8} seed={i + 3} night={night} /> : null}
          </group>
        );
      })}
      <Tree x={T10.x} z={T10.z} r={T10.r * 0.85} s={ts} h={2.8} seed={41} night={night} />
      <Ring x={T10.x} z={T10.z} r={T10.r} colour={ink} th={0.08} />
      {t08.canopy.map((seg, i) => {
        const [a, b] = pieceEnds(i);
        return <Bar key={seg.handle} a={a} b={b} y={0.06 + pieceHeight(i) * rise} colour={rise > 0.02 || (t >= 50 && t < 66) ? L.accent : ink} th={rise > 0.02 ? 0.12 : 0.09} />;
      })}
      {t08.cross.map((seg) => (
        <Bar key={seg.handle} a={[SX(seg.points[0][0]), SZ(seg.points[0][1])]} b={[SX(seg.points[1][0]), SZ(seg.points[1][1])]} y={0.06} colour={ink} th={0.06} op={1 - rise} />
      ))}
      {ringP > 0 && t < 66 ? (
        <mesh position={[T8.x, 0.1, T8.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[t08.radius + 0.25, t08.radius + 0.5, 96, 1, Math.PI / 2, -ringP * Math.PI * 2]} />
          <meshBasicMaterial color={L.accent} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}

      {/* the hedge: two rows of plants grow along the 27 m line */}
      {hedgeA > 0 ? <Hedge upto={hedgeN} /> : null}
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
            <Ring x={s.x} z={s.z} r={s.r} colour={end ? ink : L.accentLt} th={0.1} op={a} />
            <Tree x={s.x} z={s.z} r={0.9} s={a} h={1.9} seed={100 + k} night={night} />
          </group>
        );
      })}

      {/* the sheets: L-6 first, high; the others fly in and stack; the stack settles into the tower on the footprint */}
      {SLABS.map((s) => {
        const si = sheetOfSlab[s.i];
        const isFirst = s.floor === '1';
        const a0 = isFirst ? 1 : ov(t, 16.0 + (s.i % 10) * 0.16, 17.1 + (s.i % 10) * 0.16);
        if (!end && a0 <= 0) return null;
        const yStack = S0 + s.i * 3.0;
        const settle = end ? 1 : ov(t, 18.4 + (s.i / SLABS.length) * 0.6, 19.8 + (s.i / SLABS.length) * 0.6);
        const y0 = lerp(yStack, s.y + 0.45, settle);
        const big = isFirst ? lerp(1.04, 1, ov(t, B.pull, 17.0)) : 1;
        const w0 = lerp(L1.w * big, s.w, settle);
        const from = [TX + (s.i % 2 ? 150 : -150), yStack + (s.i % 3) * 24, TZ + (s.i % 2 ? -70 : 100)];
        const d = drawerAt(t, s.floor);
        const x = (isFirst || end ? TX : lerp(from[0], TX, smooth(a0))) + d.dx;
        const z = isFirst || end ? TZ : lerp(from[2], TZ, smooth(a0));
        const y = isFirst || end ? y0 + d.dy : lerp(from[1], y0, smooth(a0)) + d.dy;
        const lit = litAt(t, s.floor);
        const typical = TY.floors.includes(s.floor) && lit.k > 0;
        const map = typical ? tex[fixed['8']] : tex[si];
        const h = w0 * aspect(map);
        const onStage = d.out > 0.02;
        const op = Math.min(1, isFirst ? 1 : a0) * (onStage ? 1 : 1 - 0.75 * settle);
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

      {/* L-102's drawer: the shaft, an open dark void with its lift car below; planter B-10 over it, then off the core */}
      {(() => {
        const d = drawerAt(t, '5');
        if (end || d.out <= 0.02 || t < 35.0 || t > 39.8) return null;
        const hx = TX + d.dx + SHAFT.x;
        const hz = TZ + SHAFT.z;
        const y0 = Y5 + d.dy + 0.45;
        const s = SHAFT.s;
        const edge = slide > 0.9 ? L.accentLt : L.accent;
        return (
          <group position={[hx, y0, hz]}>
            {[
              [0, s / 2, s, 0.12],
              [0, -s / 2, s, 0.12],
              [s / 2, 0, 0.12, s],
              [-s / 2, 0, 0.12, s],
            ].map(([x, z, w, dd], k) => (
              <mesh key={k} position={[x, -4.5, z]} material={M.concreteDk} receiveShadow>
                <boxGeometry args={[w, 9, dd]} />
              </mesh>
            ))}
            <mesh position={[0, -9, 0]}>
              <boxGeometry args={[s, 0.1, s]} />
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
              [[-s / 2, -s / 2], [s / 2, -s / 2]],
              [[s / 2, -s / 2], [s / 2, s / 2]],
              [[s / 2, s / 2], [-s / 2, s / 2]],
              [[-s / 2, s / 2], [-s / 2, -s / 2]],
            ].map(([a, b], k) => (
              <Bar key={k} a={a as [number, number]} b={b as [number, number]} y={0.08} colour={edge} th={0.16} />
            ))}
            <group position={[lerp(1.55, 4.3, slide), 0.02, 0]}>
              <Shrubs w={3} d={2.5} h={0.7} seed={10} />
            </group>
          </group>
        );
      })()}

      {/* L-103's drawer: the escape corridor; two planters pinch it to 0.9 m, then step into niches in the wall line */}
      {(() => {
        const d = drawerAt(t, '8');
        if (end || d.out <= 0.02 || t < 39.3 || t > 46.0) return null;
        const C = CORRIDOR;
        const wallH = 1.0;
        const segs: [number, number][] = [];
        let x = -C.len / 2;
        for (const px of C.px) {
          segs.push([x, px - C.pw / 2 - 0.1]);
          x = px + C.pw / 2 + 0.1;
        }
        segs.push([x, C.len / 2]);
        return (
          <group position={[TX + d.dx, Y8 + 0.5, TZ]}>
            <mesh position={[0, wallH / 2, -C.half - 0.08]} material={M.concrete} castShadow receiveShadow>
              <boxGeometry args={[C.len, wallH, 0.16]} />
            </mesh>
            {segs.map(([a, b], k) => (
              <mesh key={k} position={[(a + b) / 2, wallH / 2, C.half + 0.08]} material={M.concrete} castShadow receiveShadow>
                <boxGeometry args={[b - a, wallH, 0.16]} />
              </mesh>
            ))}
            {C.px.map((px) => (
              <group key={px}>
                <mesh position={[px, wallH / 2, C.half + C.niche + 0.08]} material={M.concrete} castShadow receiveShadow>
                  <boxGeometry args={[C.pw + 0.36, wallH, 0.16]} />
                </mesh>
                {[-1, 1].map((sg) => (
                  <mesh key={sg} position={[px + sg * (C.pw / 2 + 0.1), wallH / 2, C.half + C.niche / 2 + 0.08]} material={M.concrete} castShadow receiveShadow>
                    <boxGeometry args={[0.16, wallH, C.niche]} />
                  </mesh>
                ))}
                <group position={[px, 0, lerp(C.half - C.pd / 2, C.half + C.pd / 2 + 0.06, pOut)]}>
                  <Shrubs w={C.pw} d={C.pd} h={0.5} seed={px > 0 ? 3 : 4} />
                </group>
              </group>
            ))}
            {[-1, 1].map((sg) => (
              <mesh key={sg} position={[sg * (C.len / 2 + 0.7), wallH / 2, 0]} material={M.concreteDk} castShadow receiveShadow>
                <boxGeometry args={[1.4, wallH, 1.66]} />
              </mesh>
            ))}
          </group>
        );
      })()}

      {/* the tower: concrete slabs, a blue glass curtain wall on aluminium mullions, a stone podium, a roof garden; a drawer's
          floor rides out with its sheet; at night the rooms glow behind the glass */}
      {SLABS.map((s) => {
        const d = drawerAt(t, s.floor);
        const fh = Number(s.floor) <= 4 ? TOWER.podH : TOWER.twrH;
        const op = toTower;
        if (op <= 0.002) return null;
        const hole = s.floor === '5' && t > 35.0 && t < 39.8 && d.out > 0.02;
        const lit = litAt(t, s.floor);
        const litGlass = lit.k > 0.05 && lit.colour !== LIT_STAGE ? (lit.colour === '#2457ff' ? L.accent : L.accentLt) : null;
        const podium = Number(s.floor) <= 4;
        const T = towerMats(op);
        const fa = s.floor !== 'R' ? facade(s.w, s.d, fh, podium) : null;
        return (
          <group key={s.i} position={[TX + d.dx, s.y + d.dy, TZ]}>
            {!hole ? (
              <mesh position={[0, 0.2, 0]} geometry={mBox(s.w, 0.4, s.d)} material={T.slab} castShadow receiveShadow />
            ) : (
              (() => {
                const x0 = SHAFT.x - SHAFT.s / 2;
                const x1 = SHAFT.x + SHAFT.s / 2;
                const z0 = SHAFT.z - SHAFT.s / 2;
                const z1 = SHAFT.z + SHAFT.s / 2;
                const parts: [number, number, number, number][] = [
                  [-s.w / 2, x0, -s.d / 2, s.d / 2],
                  [x1, s.w / 2, -s.d / 2, s.d / 2],
                  [x0, x1, -s.d / 2, z0],
                  [x0, x1, z1, s.d / 2],
                ];
                return parts.map(([a, b, c, e], k) => <mesh key={k} position={[(a + b) / 2, 0.2, (c + e) / 2]} geometry={mBox(b - a, 0.4, e - c)} material={T.slab} castShadow receiveShadow />);
              })()
            )}
            {fa ? (
              <>
                {L.windows > 0 && d.out <= 0.02 ? <mesh position={[0, 0.4 + (fh - 0.4) / 2, 0]} geometry={mBox(s.w - 1.6, fh - 0.7, s.d - 1.6)} material={T.room[s.i % 5]} /> : null}
                <mesh position={[0, 0.4 + (fh - 0.4) / 2, 0]} geometry={mBox(s.w - 1.2, fh - 0.5, s.d - 1.2)} material={d.out > 0.02 ? T.glass('out') : litGlass ? T.glass('lit', litGlass) : T.glass('base')} renderOrder={4} />
                <mesh position={[0, 0.4, 0]} geometry={fa.mullions} material={T.metal} castShadow />
                {fa.stone ? <mesh position={[0, 0.4, 0]} geometry={fa.stone} material={T.stone} castShadow receiveShadow /> : null}
              </>
            ) : (
              <RoofGarden w={s.w} d={s.d} />
            )}
          </group>
        );
      })}
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

export const WorldV5: React.FC<WorldV5Props> = ({t, sheets, l1, dusk, look}) => {
  L = LOOKS[look];
  const {width, height} = useVideoConfig();
  const urls = useMemo(() => [...sheets.map((s) => staticFile(s.png)), staticFile(l1)], [sheets, l1]);
  const tex = useTextures(urls);
  const pbr = usePBR();
  return (
    <AbsoluteFill style={{background: L.horizon}}>
      {tex && pbr ? (
        <ThreeCanvas width={width} height={height} shadows gl={{antialias: true, alpha: false, powerPreference: 'high-performance'}} camera={{fov: 42, near: 0.5, far: 900, position: [0, 100, 100]}}>
          <Scene t={t} sheets={sheets} tex={tex.slice(0, sheets.length)} l1={tex[sheets.length]} dusk={dusk} />
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
  const s = SLABS.find((x) => x.floor === floor)!;
  const d = drawerAt(t, floor);
  return [TX + d.dx, s.y + d.dy + 0.5, TZ];
}
/** The corridor's dimension line on L-103's drawer: from the south wall to the planter's face (or the north wall). */
export function corridorAt(t: number): {a: [number, number, number]; b: [number, number, number]} {
  const d = drawerAt(t, '8');
  const y = Y8 + 1.6;
  const C = CORRIDOR;
  const face = lerp(C.half - C.pd, C.half, plantersOut(t));
  const x = TX + d.dx + C.px[0];
  return {a: [x, y, TZ - C.half], b: [x, y, TZ + face]};
}
export function personWorld(t: number): [number, number, number] {
  const d = drawerAt(t, '8');
  const p = personAt(t);
  return [TX + d.dx + p.x, Y8 + 1.4, TZ + p.z];
}
