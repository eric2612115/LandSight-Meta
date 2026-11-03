import {ThreeCanvas} from '@remotion/three';
import {useEffect, useMemo, useState} from 'react';
import {useThree} from '@react-three/fiber';
import {AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import t08 from './t08.json';
import {V10} from './animatic-v10-cues.js';

/**
 * Film v10, Part 1 (0:14–1:29): one grey-box world under one camera path. The planting plan (the real L-1 render,
 * 1 m = 1 unit) lies on the ground and the paper continues north, where the tower's footprint is drawn in the same
 * style and the tower stands on it — reality on the drawing, nothing over a drawn tree. Trees are stylised 3D trees
 * on their plan circles; when the camera turns top-down they shrink back into the circles. The floors slide out of
 * the stack like drawers; each problem is shown and then fixed in the scene (the planter leaves the lift shaft, the
 * corridor's planters move to the walls and the corridor opens); the eighth canopy's twelve LINE segments rise off the
 * paper; the pit cut-away shows a big tree boxed on the slab, shrinking, then seven more trees; at the end the sheets
 * fly to the lens into the folder. No text in the scene — the overlay places cards with `projectAt`.
 */
export type WorldSheet = {id: string; png: string};
export type WorldV10Props = {sheets: WorldSheet[]; l1: string};

const B = V10.beats;
const SX = (X: number) => X + t08.svg.offset_x;
const SZ = (Y: number) => t08.svg.flip_y - Y;
export const L1 = {w: 83.2, h: 45.2};
export const T8 = {x: SX(t08.centre[0]), z: SZ(t08.centre[1])};
export const T10 = {x: SX(39.0), z: SZ(-2.6), r: 1.95};
export const ROW = [...t08.row].sort((a, b) => a.centre[0] - b.centre[0]).map((r) => ({id: r.id, x: SX(r.centre[0]), z: SZ(r.centre[1]), r: r.r}));
export const HEDGE = {x: SX(48.8), z0: SZ(1.5), z1: SZ(28.5), n: 91};
export const PAVERS = {x: 24, z: 38, w: 14, d: 6};
export const PIT = {x: 98, z: 30};
const TOWER = {x: 29.6, z: -24, podW: 44, podD: 26, podH: 4.5, podFloors: 4, twrW: 24, twrD: 16, twrH: 3.4, twrFloors: 16};
const DECK_Y = TOWER.podFloors * TOWER.podH;
type Slab = {i: number; y: number; w: number; d: number; floor: string};
const SLABS: Slab[] = [];
for (let k = 0; k < TOWER.podFloors; k++) SLABS.push({i: SLABS.length, y: k * TOWER.podH, w: TOWER.podW, d: TOWER.podD, floor: String(k + 1)});
for (let k = 0; k < TOWER.twrFloors; k++) SLABS.push({i: SLABS.length, y: DECK_Y + k * TOWER.twrH, w: TOWER.twrW, d: TOWER.twrD, floor: String(k + 5)});
SLABS.push({i: SLABS.length, y: DECK_Y + TOWER.twrFloors * TOWER.twrH, w: TOWER.twrW, d: TOWER.twrD, floor: 'R'});
export const floorY = (f: string) => SLABS.find((s) => s.floor === f)!.y;
const STACK_Y0 = 120;
export const DRAWER = 46;
const TX = TOWER.x;
const TZ = TOWER.z;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number, fn: (u: number) => number = smooth) => fn(clamp01((t - a) / (b - a)));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- the camera: one path
type Key = {t: number; pos: THREE.Vector3; look: THREE.Vector3; fov?: number};
const Y5 = floorY('5');
const Y8 = floorY('8');
const KEYS: Key[] = [
  {t: V10.push.from, pos: V(TX, STACK_Y0 + 62, TZ + 0.01), look: V(TX, STACK_Y0, TZ), fov: 40},
  {t: B.stack, pos: V(TX, STACK_Y0 + 62, TZ + 0.01), look: V(TX, STACK_Y0, TZ), fov: 40},
  {t: 17.5, pos: V(TX + 100, 150, TZ + 120), look: V(TX, 100, TZ), fov: 40},
  {t: B.drawer103, pos: V(TX + 70, 58, TZ + 92), look: V(TX + 14, 34, TZ), fov: 42},
  {t: 24.0, pos: V(TX + 86, 52, TZ + 76), look: V(TX + 20, 30, TZ), fov: 42},
  {t: 26.5, pos: V(TX + 96, 88, TZ + 60), look: V(TX + 22, 74, TZ), fov: 42},
  {t: 30.2, pos: V(TX + 98, 86, TZ + 58), look: V(TX + 22, 72, TZ), fov: 42},
  {t: 32.5, pos: V(TX + 100, 50, TZ + 62), look: V(TX + 24, 26, TZ), fov: 42},
  {t: 35.0, pos: V(TX + 100, 50, TZ + 62), look: V(TX + 24, 26, TZ), fov: 42},
  {t: 36.6, pos: V(TX + DRAWER + 12, Y5 + 9, TZ + 16), look: V(TX + DRAWER + 3, Y5 - 2, TZ + 2), fov: 42},
  {t: 39.8, pos: V(TX + DRAWER + 12, Y5 + 9, TZ + 16), look: V(TX + DRAWER + 3, Y5 - 2, TZ + 2), fov: 42},
  {t: 41.6, pos: V(TX + DRAWER + 0.3, Y8 + 9.5, TZ + 0.02), look: V(TX + DRAWER + 0.3, Y8, TZ), fov: 42},
  {t: 46.8, pos: V(TX + DRAWER + 0.3, Y8 + 9.5, TZ + 0.02), look: V(TX + DRAWER + 0.3, Y8, TZ), fov: 42},
  {t: 48.0, pos: V(TX + 20, 60, TZ + 120), look: V(TX, 36, TZ), fov: 42},
  {t: B.ground, pos: V(TX + 40, 50, TZ + 110), look: V(TX, 30, TZ + 10), fov: 42},
  {t: 51.5, pos: V(8, 5, 46), look: V(18, 2.2, 32), fov: 45},
  {t: 53.5, pos: V(27, 4.5, 44), look: V(31, 2.2, 32), fov: 45},
  {t: 55.2, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 58.2, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 60.0, pos: V(T8.x + 7.5, 5.5, T8.z + 7.5), look: V(T8.x - 2.1, 1.2, T8.z + 2.1), fov: 45},
  {t: 63.4, pos: V(T8.x + 8.5, 5.6, T8.z + 6.5), look: V(T8.x - 2.1, 1.2, T8.z + 2.1), fov: 45},
  {t: 65.0, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 65.8, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 74.6, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 76.0, pos: V(24, 17, 50), look: V(23, 0, 32), fov: 45},
  {t: 77.4, pos: V(24, 17, 50), look: V(23, 0, 32), fov: 45},
  {t: 78.8, pos: V(66, 20, 34), look: V(53.4, 0, 20), fov: 45},
  {t: 80.0, pos: V(66, 20, 34), look: V(53.4, 0, 20), fov: 45},
  {t: 81.2, pos: V(30, 20, 56), look: V(24, 0, 38), fov: 45},
  {t: 82.3, pos: V(30, 20, 56), look: V(24, 0, 38), fov: 45},
  {t: 83.6, pos: V(PIT.x + 9, 3.2, PIT.z + 9), look: V(PIT.x - 1, 1.6, PIT.z), fov: 45},
  {t: 88.5, pos: V(PIT.x + 10, 3.6, PIT.z + 8.5), look: V(PIT.x - 2, 1.6, PIT.z), fov: 45},
  {t: 91.0, pos: V(PIT.x + 13, 5, PIT.z + 11), look: V(PIT.x - 4, 1.4, PIT.z), fov: 45},
  {t: 92.6, pos: V(40, 120, 90), look: V(32, 0, 8), fov: 42},
  {t: B.bridge, pos: V(38, 125, 92), look: V(32, 0, 8), fov: 42},
  {t: 98.5, pos: V(60, 175, 150), look: V(32, 0, 8), fov: 42},
];
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k.pos), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k.look), false, 'centripetal');
export function cameraAt(t: number) {
  const n = KEYS.length - 1;
  let k = 0;
  while (k < n && t > KEYS[k + 1].t) k++;
  if (t <= KEYS[0].t) return {pos: KEYS[0].pos, look: KEYS[0].look, fov: KEYS[0].fov ?? 42};
  if (k >= n) return {pos: KEYS[n].pos, look: KEYS[n].look, fov: KEYS[n].fov ?? 42};
  const a = KEYS[k];
  const b = KEYS[k + 1];
  const e = smooth(clamp01((t - a.t) / (b.t - a.t)));
  const u = (k + e) / n;
  return {pos: posCurve.getPoint(u), look: lookCurve.getPoint(u), fov: lerp(a.fov ?? 42, b.fov ?? 42, e)};
}
/** How fast the view turns at t, degrees per frame (the overlay blurs the fast moves). */
export function turnRate(t: number, fps: number): number {
  const a = cameraAt(t);
  const b = cameraAt(Math.max(0, t - 1 / fps));
  const da = a.look.clone().sub(a.pos).normalize();
  const db = b.look.clone().sub(b.pos).normalize();
  const ang = (Math.acos(clamp01(da.dot(db))) * 180) / Math.PI;
  const move = a.pos.distanceTo(b.pos);
  return ang + move * 0.15;
}
/** A point in the camera's own frame. */
export function camPoint(t: number, rx: number, ry: number, dist: number): [number, number, number] {
  const c = cameraAt(t);
  const f = c.look.clone().sub(c.pos).normalize();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const p = c.pos.clone().add(f.multiplyScalar(dist)).add(r.multiplyScalar(rx)).add(u.multiplyScalar(ry));
  return [p.x, p.y, p.z];
}
const scratch = new THREE.PerspectiveCamera(42, 16 / 9, 0.2, 900);
function aim(cam: THREE.PerspectiveCamera, t: number) {
  const c = cameraAt(t);
  cam.position.copy(c.pos);
  const dir = c.look.clone().sub(c.pos).normalize();
  const vert = clamp01((Math.abs(dir.y) - 0.86) / 0.13);
  cam.up.set(0, 1 - vert, -vert).normalize();
  cam.lookAt(c.look);
  cam.fov = c.fov;
  cam.near = 0.2;
  cam.far = 900;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
export function projectAt(t: number, p: [number, number, number]): {x: number; y: number; visible: boolean} {
  aim(scratch, t);
  const v = new THREE.Vector3(...p).project(scratch);
  return {x: (v.x + 1) * 960, y: (1 - v.y) * 540, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2};
}

// ---------------------------------------------------------------- the drawers, the fixes
export function drawerAt(t: number, floor: string): {out: number; dx: number; dy: number} {
  let out = 0;
  let dy = 0;
  if (floor === '8') {
    out = Math.max(ov(t, 20.6, 22.0) * (1 - ov(t, 25.3, 26.2)), ov(t, 31.4, 32.6) * (1 - ov(t, 34.9, 35.6)), ov(t, 40.6, 41.6) * (1 - ov(t, 47.0, 47.8)));
  } else if (floor === 'R') {
    out = ov(t, 26.4, 27.4) * (1 - ov(t, 30.3, 31.1));
  } else if (floor === '5') {
    out = Math.max(ov(t, 31.6, 32.8) * (1 - ov(t, 34.9, 35.6)), ov(t, 35.6, 36.6) * (1 - ov(t, 39.8, 40.5)));
    dy = (Y8 - Y5 + 0.5) * ov(t, 33.2, 34.4) * (1 - ov(t, 34.9, 35.4));
  }
  return {out, dx: out * DRAWER, dy};
}
const GHOSTS = ['8', '12', '16', '20'];
const ghostAt = (t: number, floor: string) => {
  const k = GHOSTS.indexOf(floor);
  return k < 0 ? 0 : ov(t, 22.4 + k * 0.35, 22.8 + k * 0.35) * (1 - ov(t, 25.3, 25.9));
};
const glowAt = (t: number, floor: string) => {
  const at = floor === '5' ? 48.0 : floor === '8' ? 48.4 : floor === 'R' ? 48.8 : -1;
  if (at < 0) return 0;
  const u = (t - at) / 0.9;
  return u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
};
/** The lift-shaft planter: hangs over the void, then slides onto the deck beside the core (the fix). */
export const planterSlide = (t: number) => ov(t, 38.5, 39.5);
/** The corridor's planters: inside the corridor (0.9 m clear), then moved to the walls (the fix). */
export const plantersOut = (t: number) => ov(t, 45.0, 46.0);
/** The walking person on L-103's drawer: x along the corridor (world offset from the plate's centre). */
export function personAt(t: number): {x: number; z: number; a: number} {
  const walk1 = ov(t, 41.5, 43.4, (u) => u);
  const walk2 = ov(t, 46.2, 47.5, (u) => u);
  const x = lerp(lerp(-4.0, -2.5, walk1), 4.0, walk2);
  return {x, z: -0.25, a: Math.min(ov(t, 41.2, 41.5), 1 - ov(t, 47.5, 47.8))};
}
/** The trees: full 3D while the camera is on the ground, flattening into their plan circles on the turn. */
export const treeScale = (t: number) => ov(t, 49.5, 51.0) * (1 - ov(t, 54.5, 56.5));
export const pieceHeight = (i: number) => 0.4 + ((i * 5) % 12) * 0.45;
export const riseAt = (t: number) => ov(t, 56.6, 58.8) * (1 - ov(t, 63.5, 64.6));
export const pieceEnds = (i: number): [[number, number], [number, number]] => {
  const seg = t08.canopy[i];
  return [
    [SX(seg.points[0][0]), SZ(seg.points[0][1])],
    [SX(seg.points[1][0]), SZ(seg.points[1][1])],
  ];
};
/** The pit beat: the big tree shrinks (76.5–78), the seven trees appear (80–81.5). */
export const pitShrink = (t: number) => ov(t, 85.5, 87.0);
export const sevenAt = (t: number, k: number) => ov(t, 89.0 + k * 0.18, 89.5 + k * 0.18);
/** The bridge: the sheets fly to the lens (86.5–88.8). */
export const flyAt = (t: number) => ov(t, B.bridge, 97.8);

// ---------------------------------------------------------------- pieces
function useTextures(urls: string[]): THREE.Texture[] | null {
  const [tex, setTex] = useState<THREE.Texture[] | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    const handle = delayRender('world textures');
    const loader = new THREE.TextureLoader();
    Promise.all(urls.map((u) => loader.loadAsync(u).then((x) => ((x.colorSpace = THREE.SRGBColorSpace), (x.anisotropy = 8), x))))
      .then((xs) => (setTex(xs), continueRender(handle)))
      .catch((e) => (console.error(e), continueRender(handle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tex;
}
const Bar: React.FC<{a: [number, number]; b: [number, number]; y: number; colour: string; th?: number; op?: number}> = ({a, b, y, colour, th = 0.08, op = 1}) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-4 || op <= 0) return null;
  return (
    <mesh position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <boxGeometry args={[len, th, th]} />
      <meshBasicMaterial color={colour} transparent={op < 1} opacity={op} toneMapped={false} />
    </mesh>
  );
};
const Ring: React.FC<{x: number; z: number; r: number; y?: number; colour: string; th?: number; op?: number}> = ({x, z, r, y = 0.05, colour, th = 0.08, op = 1}) =>
  op <= 0 ? null : (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r, th, 6, 48]} />
      <meshBasicMaterial color={colour} transparent={op < 1} opacity={op} toneMapped={false} />
    </mesh>
  );
/** A stylised tree: a trunk and a canopy; `s` 1 is full, 0 flattens the canopy into its plan circle. */
const Tree: React.FC<{x: number; z: number; r: number; s: number; h?: number; colour?: string; op?: number}> = ({x, z, r, s, h = 2.6, colour = '#2f7d44', op = 1}) => {
  if (s <= 0.005 || op <= 0) return null;
  const trunk = h * s;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, trunk / 2, 0]}>
        <cylinderGeometry args={[0.14, 0.2, Math.max(0.01, trunk), 8]} />
        <meshStandardMaterial color="#5a4632" transparent={op < 1} opacity={op} />
      </mesh>
      <mesh position={[0, trunk + r * 0.7 * s + 0.03, 0]} scale={[1, Math.max(0.03, s), 1]}>
        <sphereGeometry args={[r, 14, 12]} />
        <meshStandardMaterial color={colour} transparent={op < 1} opacity={op} />
      </mesh>
    </group>
  );
};
const CameraRig: React.FC<{t: number}> = ({t}) => {
  const {camera, size} = useThree();
  const pc = camera as THREE.PerspectiveCamera;
  pc.aspect = size.width / size.height;
  aim(pc, t);
  return null;
};

const Scene: React.FC<{t: number; sheets: WorldSheet[]; tex: THREE.Texture[]; l1: THREE.Texture}> = ({t, sheets, tex, l1}) => {
  const stackIn = ov(t, V10.push.from + 0.5, B.stack + 3.0);
  const toTower = ov(t, B.stack + 2.5, B.stack + 5.5);
  const idx = (id: string) => sheets.findIndex((s) => s.id === id);
  const first = idx('L-1-revB');
  const fixed: Record<string, number> = {'1': idx('L-101'), '5': idx('L-102'), '8': idx('L-103'), R: idx('L-104')};
  const used = new Set([...Object.values(fixed), first]);
  const rest = sheets.map((_, i) => i).filter((i) => !used.has(i));
  const sheetOfSlab = SLABS.map((s) => (fixed[s.floor] !== undefined ? fixed[s.floor] : s.floor === '2' ? first : rest.shift()!));
  const groundA = ov(t, B.ground - 1.5, B.ground + 1.5);
  const ts = treeScale(t);
  const rise = riseAt(t);
  const ringP = ov(t, 64.6, 65.2, (u) => u);
  const counted = t >= 74.6 ? Math.min(8, Math.floor((t - 74.6) / 0.28) + 1) : 0;
  const hedgeFill = ov(t, 77.4, 79.6, (u) => u);
  const hedgeA = Math.min(ov(t, 77.3, 77.7), 1 - ov(t, 82.5, 83.2));
  const pavA = Math.min(ov(t, 80.2, 80.8), 1 - ov(t, 82.5, 83.2));
  const t10 = ov(t, 92.6, 93.2);
  const cloud = ov(t, 93.2, 94.4, (u) => u);
  const shrink = pitShrink(t);
  const fly = flyAt(t);
  const lens = camPoint(t, 0, 0, 40);
  const slide = planterSlide(t);
  const pOut = plantersOut(t);
  return (
    <>
      <CameraRig t={t} />
      <hemisphereLight args={['#ffffff', '#777777', 2.0]} />
      <directionalLight position={[60, 90, 50]} intensity={1.6} />
      <fog attach="fog" args={['#8a8a8a', 260, 600]} />

      {/* the ground; the planting plan; the paper continues north with the tower's footprint drawn on it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, -0.02, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#8d8d8d" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, 0, L1.h / 2]}>
        <planeGeometry args={[L1.w, L1.h]} />
        <meshBasicMaterial map={l1} transparent opacity={groundA} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, -0.005, -28]}>
        <planeGeometry args={[L1.w, 56]} />
        <meshBasicMaterial color="#f7f5f0" transparent opacity={Math.max(groundA, toTower)} toneMapped={false} depthWrite={false} />
      </mesh>
      {[[TOWER.podW, TOWER.podD], [TOWER.twrW, TOWER.twrD]].map(([w, d], k) => (
        <group key={k}>
          <Bar a={[TX - w / 2, TZ - d / 2]} b={[TX + w / 2, TZ - d / 2]} y={0.02} colour="#1d2026" th={0.12} op={toTower} />
          <Bar a={[TX + w / 2, TZ - d / 2]} b={[TX + w / 2, TZ + d / 2]} y={0.02} colour="#1d2026" th={0.12} op={toTower} />
          <Bar a={[TX + w / 2, TZ + d / 2]} b={[TX - w / 2, TZ + d / 2]} y={0.02} colour="#1d2026" th={0.12} op={toTower} />
          <Bar a={[TX - w / 2, TZ + d / 2]} b={[TX - w / 2, TZ - d / 2]} y={0.02} colour="#1d2026" th={0.12} op={toTower} />
        </group>
      ))}
      {/* the drawn site boundary of the planting plan, for the high view */}
      {[[4.6, 4.6, 54.6, 4.6], [54.6, 4.6, 54.6, 34.6], [54.6, 34.6, 4.6, 34.6], [4.6, 34.6, 4.6, 4.6]].map(([x1, z1, x2, z2], k) => (
        <Bar key={k} a={[x1, z1]} b={[x2, z2]} y={0.05} colour="#2457ff" th={0.14} op={0.7 * ov(t, 92.0, 93.5)} />
      ))}

      {/* the trees: 3D on their circles, flattening into the circles on the turn; the circles themselves */}
      {ROW.map((r, i) => {
        const is8 = r.id === t08.object_id;
        const col = i < counted && t < 82.5 ? (is8 ? '#e5484d' : '#2457ff') : '#1d2026';
        return (
          <group key={r.id}>
            {!is8 ? <Ring x={r.x} z={r.z} r={r.r} colour={col} th={0.07} op={groundA} /> : null}
            <Tree x={r.x} z={r.z} r={r.r} s={ts} op={groundA} />
          </group>
        );
      })}
      <Tree x={T10.x} z={T10.z} r={T10.r} s={ts} op={groundA} />
      {t08.canopy.map((seg, i) => {
        const [a, b] = pieceEnds(i);
        return <Bar key={seg.handle} a={a} b={b} y={0.06 + pieceHeight(i) * rise} colour={rise > 0.02 ? '#6d8dff' : t >= 56.5 && t < 82.5 ? '#2457ff' : '#1d2026'} th={0.09} op={groundA} />;
      })}
      {t08.cross.map((seg) => (
        <Bar key={seg.handle} a={[SX(seg.points[0][0]), SZ(seg.points[0][1])]} b={[SX(seg.points[1][0]), SZ(seg.points[1][1])]} y={0.06} colour="#1d2026" th={0.06} op={groundA * (1 - rise)} />
      ))}
      {ringP > 0 ? (
        <mesh position={[T8.x, 0.1, T8.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[t08.radius + 0.25, t08.radius + 0.4, 64, 1, Math.PI / 2, -ringP * Math.PI * 2]} />
          <meshBasicMaterial color="#2457ff" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}
      {rise > 0 ? (
        <group position={[T8.x, 0.04, T8.z]}>
          {Array.from({length: 13}, (_, k) => k - 6).map((k) =>
            k === 0 ? null : (
              <group key={k}>
                <Bar a={[k * 0.5, -3]} b={[k * 0.5, 3]} y={0} colour="#ffffff" th={0.03} op={0.5 * rise} />
                <Bar a={[-3, k * 0.5]} b={[3, k * 0.5]} y={0} colour="#ffffff" th={0.03} op={0.5 * rise} />
              </group>
            ),
          )}
          <Bar a={[-3.8, 0]} b={[3.8, 0]} y={0} colour="#ffffff" th={0.06} op={rise} />
          <Bar a={[0, -3.8]} b={[0, 3.8]} y={0} colour="#ffffff" th={0.06} op={rise} />
          <mesh position={[0, 3, 0]}>
            <boxGeometry args={[0.06, 6, 0.06]} />
            <meshBasicMaterial color="#ffd400" transparent opacity={rise} toneMapped={false} />
          </mesh>
        </group>
      ) : null}

      {/* the hedge fills with plants; the pavers light */}
      {hedgeA > 0
        ? [0, 1].map((rowK) =>
            Array.from({length: HEDGE.n}, (_, k) => {
              const u = k / (HEDGE.n - 1);
              if (u > hedgeFill) return null;
              return <Ring key={`${rowK}-${k}`} x={HEDGE.x + (rowK ? 0.4 : 0)} z={HEDGE.z0 - (HEDGE.z0 - HEDGE.z1) * u} r={0.14} y={0.1} colour="#1f9d55" th={0.04} op={hedgeA} />;
            }),
          )
        : null}
      {pavA > 0 ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[PAVERS.x, 0.05, PAVERS.z]}>
          <planeGeometry args={[PAVERS.w, PAVERS.d]} />
          <meshBasicMaterial color="#e8c46a" transparent opacity={0.6 * pavA} toneMapped={false} />
        </mesh>
      ) : null}

      {/* the pit cut-away: soil over the slab, the pit box with roots, the big tree that shrinks; then seven more */}
      {t >= 82.5 && t < 92.6 ? (
        <group position={[PIT.x, 0, PIT.z]}>
          <mesh position={[0, -0.5, 0]}>
            <boxGeometry args={[8, 1.0, 5]} />
            <meshStandardMaterial color="#6b5a46" />
          </mesh>
          <mesh position={[0, -1.3, 0]}>
            <boxGeometry args={[8, 0.6, 5]} />
            <meshStandardMaterial color="#a3a3a3" />
          </mesh>
          <mesh position={[0, -0.5, 1.2]}>
            <boxGeometry args={[1.5, 1.0, 1.5]} />
            <meshStandardMaterial color="#c8b48a" />
          </mesh>
          {[[-0.5, -0.9], [0.5, -0.9], [-0.2, -0.95], [0.3, -0.85]].map(([dx, dy], k) => (
            <mesh key={k} position={[dx / 2, dy / 2 - 0.05, 1.2 + 0.78]} rotation={[0, 0, Math.atan2(dy, dx) + Math.PI / 2]}>
              <boxGeometry args={[0.07, Math.hypot(dx, dy), 0.07]} />
              <meshBasicMaterial color="#3b2a1a" toneMapped={false} />
            </mesh>
          ))}
          <Tree x={0} z={1.2} r={lerp(2.3, 1.15, shrink)} s={1} h={lerp(3.2, 1.7, shrink)} colour={shrink > 0.5 ? '#9c5a3c' : '#2f7d44'} />
          {Array.from({length: 7}, (_, k) => (
            <Tree key={k} x={-1.6 - k * 1.3} z={3.2 + (k % 2) * 0.9} r={1.0} s={sevenAt(t, k)} h={1.7} />
          ))}
        </group>
      ) : null}

      {/* T-10 beyond the boundary: red, then the cloud */}
      <Ring x={T10.x} z={T10.z} r={T10.r} colour={t10 > 0.5 ? '#e5484d' : '#1d2026'} th={0.12} op={groundA} />
      {cloud > 0 ? (
        <mesh position={[T10.x, 0.1, T10.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[T10.r + 0.9, T10.r + 1.4, 48, 1, 0, cloud * Math.PI * 2]} />
          <meshBasicMaterial color="#d92d20" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}

      {/* the sheets: the first floats high and fills the frame; the stack becomes the tower; at the end they fly to the lens */}
      {SLABS.map((s) => {
        const si = sheetOfSlab[s.i];
        const isFirst = si === first;
        const inA = isFirst ? 1 : ov(t, V10.push.from + 0.5 + (s.i % 10) * 0.12, V10.push.from + 1.5 + (s.i % 10) * 0.12);
        const firstOrder = SLABS.findIndex((x) => sheetOfSlab[x.i] === first);
        const yStack = STACK_Y0 + (s.i - firstOrder) * 3.4;
        const y0 = lerp(yStack, s.y + 0.45, toTower);
        const w0 = lerp(L1.w, s.w, toTower);
        const from = [TX + (s.i % 2 ? 140 : -140), yStack + (s.i % 3) * 20, TZ + (s.i % 2 ? -60 : 90)];
        const d = drawerAt(t, s.floor);
        const x0 = (isFirst ? TX : lerp(from[0], TX, smooth(inA))) + d.dx;
        const z0 = isFirst ? TZ : lerp(from[2], TZ, smooth(inA));
        const f = smooth(clamp01(fly * 1.3 - (s.i % 7) * 0.04));
        const x = lerp(x0, lens[0], f);
        const y = lerp(y0 + d.dy, lens[1], f);
        const z = lerp(z0, lens[2], f);
        const w = lerp(w0, 2.4, f);
        const h = (w * 1140) / 2100;
        const ghost = ghostAt(t, s.floor);
        const glow = glowAt(t, s.floor);
        const lit = Math.max(ghost, glow, d.out);
        const a = Math.min(inA * (isFirst || stackIn > 0 ? 1 : 0), 1 - 0.55 * toTower + 0.55 * Math.max(lit, f)) * (1 - ov(t, 97.4, 97.9));
        if (a <= 0.001) return null;
        const map = s.floor === '12' || s.floor === '16' || s.floor === '20' ? (ghost > 0 ? tex[fixed['8']] : tex[si]) : tex[si];
        return (
          <group key={s.i} position={[x, y, z]} rotation={[-Math.PI / 2 * (1 - f), 0, 0]}>
            <mesh>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial map={map} color={lit > 0 ? new THREE.Color().setRGB(1 - 0.55 * lit, 1 - 0.4 * lit, 1) : new THREE.Color('#ffffff')} transparent opacity={a} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
            </mesh>
            {lit > 0 && f === 0 ? (
              <mesh position={[0, 0, 0.1]}>
                <planeGeometry args={[w + 2, h + 2]} />
                <meshBasicMaterial color="#2457ff" transparent opacity={0.45 * lit} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
              </mesh>
            ) : null}
          </group>
        );
      })}

      {/* L-102's drawer: the lift shaft as a dark void through the podium; planter B-10 hangs over it, then slides onto the deck */}
      {(() => {
        const d = drawerAt(t, '5');
        if (d.out <= 0.02 || t < 35.5 || t > 40.6) return null;
        return (
          <group position={[TX + d.dx + 3, Y5 + d.dy, TZ + 2]}>
            <mesh position={[0, -9.5, 0]}>
              <boxGeometry args={[2.5, 19.4, 2.5]} />
              <meshStandardMaterial color="#15171c" />
            </mesh>
            <mesh position={[0, 0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2.5, 2.5]} />
              <meshBasicMaterial color="#15171c" toneMapped={false} />
            </mesh>
            {[-1.25, 1.25].map((x) => (
              <mesh key={`x${x}`} position={[x, 0.62, 0]}>
                <boxGeometry args={[0.12, 0.12, 2.5]} />
                <meshBasicMaterial color={slide > 0.9 ? '#3ccf7f' : '#e5484d'} toneMapped={false} />
              </mesh>
            ))}
            {[-1.25, 1.25].map((z) => (
              <mesh key={`z${z}`} position={[0, 0.62, z]}>
                <boxGeometry args={[2.5, 0.12, 0.12]} />
                <meshBasicMaterial color={slide > 0.9 ? '#3ccf7f' : '#e5484d'} toneMapped={false} />
              </mesh>
            ))}
            <mesh position={[lerp(1.0, 4.6, slide), lerp(0.95, 0.85, slide), 0]}>
              <boxGeometry args={[3, 0.7, 2.5]} />
              <meshStandardMaterial color="#2f7d44" transparent opacity={0.92} />
            </mesh>
          </group>
        );
      })()}
      {/* L-103's drawer: the escape corridor; two planters pinch it to 0.9 m, then move to the walls and it opens */}
      {(() => {
        const d = drawerAt(t, '8');
        if (d.out <= 0.02 || t < 40.4 || t > 48.0) return null;
        return (
          <group position={[TX + d.dx, Y8 + 0.5, TZ]}>
            {[-0.75, 0.75].map((z) => (
              <mesh key={z} position={[0, 0.5, z]}>
                <boxGeometry args={[9, 1.0, 0.15]} />
                <meshStandardMaterial color="#d8d8d8" />
              </mesh>
            ))}
            <mesh position={[-5.2, 0.5, 0]}>
              <boxGeometry args={[1.4, 1.0, 1.65]} />
              <meshStandardMaterial color="#15171c" />
            </mesh>
            <mesh position={[5.2, 0.5, 0]}>
              <boxGeometry args={[1.4, 1.0, 1.65]} />
              <meshStandardMaterial color="#bcbcbc" />
            </mesh>
            {[-1.6, 1.6].map((px) => (
              <mesh key={px} position={[px, 0.3, lerp(0.38, 1.35, pOut)]}>
                <boxGeometry args={[1.4, 0.6, 0.6]} />
                <meshStandardMaterial color="#2f7d44" />
              </mesh>
            ))}
          </group>
        );
      })()}

      {/* the tower: grey boxes, a floor per sheet; a drawer's slab rides out with its sheet; it fades on the fly-in */}
      {SLABS.map((s) => {
        const d = drawerAt(t, s.floor);
        const fh = Number(s.floor) <= 4 ? TOWER.podH : TOWER.twrH;
        const op = toTower * (1 - ov(t, B.bridge, 97.0));
        if (op <= 0.001) return null;
        return (
          <group key={s.i} position={[TX + d.dx, s.y + d.dy, TZ]}>
            <mesh position={[0, 0.2, 0]}>
              <boxGeometry args={[s.w, 0.4, s.d]} />
              <meshStandardMaterial color="#d2d2d2" transparent opacity={0.95 * op} />
            </mesh>
            {s.floor !== 'R' ? (
              <mesh position={[0, 0.4 + (fh - 0.4) / 2, 0]}>
                <boxGeometry args={[s.w - 1.2, fh - 0.5, s.d - 1.2]} />
                <meshStandardMaterial color="#7f8ba3" transparent opacity={(d.out > 0 ? 0.25 : 0.6) * op} depthWrite={false} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </>
  );
};

export const WorldV10: React.FC<WorldV10Props> = ({sheets, l1}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = frame / fps;
  const urls = useMemo(() => [...sheets.map((s) => staticFile(s.png)), staticFile(l1)], [sheets, l1]);
  const tex = useTextures(urls);
  return (
    <AbsoluteFill style={{background: '#8a8a8a'}}>
      {tex ? (
        <ThreeCanvas width={width} height={height} gl={{alpha: true, antialias: true}} style={{background: 'transparent'}} camera={{fov: 42, near: 0.2, far: 900, position: [0, 100, 100]}}>
          <Scene t={t} sheets={sheets} tex={tex.slice(0, sheets.length)} l1={tex[sheets.length]} />
        </ThreeCanvas>
      ) : null}
    </AbsoluteFill>
  );
};
export function plateAt(t: number, floor: string): [number, number, number] {
  const s = SLABS.find((x) => x.floor === floor)!;
  const d = drawerAt(t, floor);
  return [TX + d.dx, s.y + d.dy + 0.5, TZ];
}
/** The corridor's dimension line on L-103's drawer: from the planter's edge to the far wall. */
export function corridorAt(t: number): {a: [number, number, number]; b: [number, number, number]} {
  const d = drawerAt(t, '8');
  const y = Y8 + 1.4;
  const planterEdge = lerp(0.38, 1.35, plantersOut(t)) - 0.3;
  return {a: [TX + d.dx, y, TZ - 0.75], b: [TX + d.dx, y, TZ + Math.min(0.75, planterEdge)]};
}
/** Where the person stands, in the world. */
export function personWorld(t: number): [number, number, number] {
  const d = drawerAt(t, '8');
  const p = personAt(t);
  return [TX + d.dx + p.x, Y8 + 0.9, TZ + p.z];
}
