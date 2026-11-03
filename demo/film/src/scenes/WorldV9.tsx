import {ThreeCanvas} from '@remotion/three';
import {useEffect, useMemo, useState} from 'react';
import {useThree} from '@react-three/fiber';
import {AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import t08 from './t08.json';

/**
 * Film v9, Part 1 (0:06–1:30): one grey-box world under one camera path (demo/SCRIPT-V9.md). The planting plan
 * (the real L-1 render, 1 m = 1 unit) lies on the ground; the tower stands north of its site boundary, so nothing
 * covers a drawn tree. The sheets stack into the tower (each sheet a floor: 1F L-101, 5F L-102, 8F L-103 standing
 * for 8/12/16/20F, RF L-104); floors slide out of the stack like drawers; the eighth canopy's twelve LINE segments
 * (src/scenes/t08.json) rise slowly off the paper; the row counts, the hedge fills with plants, the pavers light;
 * T-10 is clouded from the high view. No text lives in the scene — every card is a React overlay (AnimaticV9.tsx),
 * placed with `projectAt` when it must follow a point in the world. Everything from the frame; render with --gl=angle.
 */
export type WorldSheet = {id: string; png: string};
export type WorldV9Props = {sheets: WorldSheet[]; l1: string};

const SX = (X: number) => X + t08.svg.offset_x;
const SZ = (Y: number) => t08.svg.flip_y - Y;
export const L1 = {w: 83.2, h: 45.2};
export const T8 = {x: SX(t08.centre[0]), z: SZ(t08.centre[1])};
export const T10 = {x: SX(39.0), z: SZ(-2.6), r: 1.95};
export const ROW = [...t08.row].sort((a, b) => a.centre[0] - b.centre[0]).map((r) => ({id: r.id, x: SX(r.centre[0]), z: SZ(r.centre[1]), r: r.r}));
export const HEDGE = {x: SX(48.8), z0: SZ(1.5), z1: SZ(28.5), n: 91};
export const PAVERS = {x: 24, z: 38, w: 14, d: 6};
/** The tower, north of the site boundary (the sheet's north is −z). */
const TOWER = {x: 29.6, z: -21, podW: 44, podD: 26, podH: 4.5, podFloors: 4, twrW: 24, twrD: 16, twrH: 3.4, twrFloors: 16};
const DECK_Y = TOWER.podFloors * TOWER.podH;
type Slab = {i: number; y: number; w: number; d: number; floor: string};
const SLABS: Slab[] = [];
for (let k = 0; k < TOWER.podFloors; k++) SLABS.push({i: SLABS.length, y: k * TOWER.podH, w: TOWER.podW, d: TOWER.podD, floor: String(k + 1)});
for (let k = 0; k < TOWER.twrFloors; k++) SLABS.push({i: SLABS.length, y: DECK_Y + k * TOWER.twrH, w: TOWER.twrW, d: TOWER.twrD, floor: String(k + 5)});
SLABS.push({i: SLABS.length, y: DECK_Y + TOWER.twrFloors * TOWER.twrH, w: TOWER.twrW, d: TOWER.twrD, floor: 'R'});
export const floorY = (f: string) => SLABS.find((s) => s.floor === f)!.y;
const STACK_Y0 = 120;
const DRAWER = 46; // how far a floor slides out, east
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number, fn: (u: number) => number = smooth) => fn(clamp01((t - a) / (b - a)));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- the camera: one path
type Key = {t: number; pos: THREE.Vector3; look: THREE.Vector3; fov?: number};
const TX = TOWER.x;
const TZ = TOWER.z;
const KEYS: Key[] = [
  {t: 6.0, pos: V(TX, STACK_Y0 + 62, TZ + 0.01), look: V(TX, STACK_Y0, TZ), fov: 40},
  {t: 7.5, pos: V(TX, STACK_Y0 + 62, TZ + 0.01), look: V(TX, STACK_Y0, TZ), fov: 40},
  {t: 10.0, pos: V(TX + 100, 150, TZ + 120), look: V(TX, 100, TZ), fov: 40},
  {t: 14.0, pos: V(TX + 70, 58, TZ + 92), look: V(TX + 14, 34, TZ), fov: 42},
  {t: 18.0, pos: V(TX + 86, 52, TZ + 76), look: V(TX + 20, 30, TZ), fov: 42},
  {t: 21.5, pos: V(TX + 96, 88, TZ + 60), look: V(TX + 22, 74, TZ), fov: 42},
  {t: 25.2, pos: V(TX + 98, 86, TZ + 58), look: V(TX + 22, 72, TZ), fov: 42},
  {t: 27.5, pos: V(TX + 100, 50, TZ + 62), look: V(TX + 24, 26, TZ), fov: 42},
  {t: 31.0, pos: V(TX + 96, 46, TZ + 70), look: V(TX + 22, 24, TZ), fov: 42},
  {t: 35.0, pos: V(TX + 20, 60, TZ + 120), look: V(TX, 36, TZ), fov: 42},
  {t: 38.0, pos: V(TX + 40, 50, TZ + 110), look: V(TX, 30, TZ + 10), fov: 42},
  {t: 41.0, pos: V(10, 7, 46), look: V(18, 1, 32), fov: 45},
  {t: 43.0, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 44.5, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 46.5, pos: V(T8.x + 7.5, 5.5, T8.z + 7.5), look: V(T8.x - 2.1, 1.2, T8.z + 2.1), fov: 45},
  {t: 50.0, pos: V(T8.x + 8.5, 5.6, T8.z + 6.5), look: V(T8.x - 2.1, 1.2, T8.z + 2.1), fov: 45},
  {t: 52.0, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 53.2, pos: V(T8.x, 14, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 55.0, pos: V(24, 17, 50), look: V(23, 0, 32), fov: 45},
  {t: 57.0, pos: V(24, 17, 50), look: V(23, 0, 32), fov: 45},
  {t: 59.0, pos: V(66, 20, 34), look: V(53.4, 0, 20), fov: 45},
  {t: 60.6, pos: V(66, 20, 34), look: V(53.4, 0, 20), fov: 45},
  {t: 62.5, pos: V(30, 20, 56), look: V(24, 0, 38), fov: 45},
  {t: 64.0, pos: V(30, 20, 56), look: V(24, 0, 38), fov: 45},
  {t: 75.0, pos: V(28, 22, 58), look: V(24, 0, 36), fov: 45},
  {t: 78.5, pos: V(40, 120, 90), look: V(32, 0, 8), fov: 42},
  {t: 90.0, pos: V(38, 125, 92), look: V(32, 0, 8), fov: 42},
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
const scratch = new THREE.PerspectiveCamera(42, 16 / 9, 0.2, 900);
function aim(cam: THREE.PerspectiveCamera, t: number) {
  const c = cameraAt(t);
  cam.position.copy(c.pos);
  const dir = c.look.clone().sub(c.pos).normalize();
  const vert = clamp01((Math.abs(dir.y) - 0.86) / 0.13); // straight down, the world's up is useless: blend to −z
  cam.up.set(0, 1 - vert, -vert).normalize();
  cam.lookAt(c.look);
  cam.fov = c.fov;
  cam.near = 0.2;
  cam.far = 900;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
/** Where a world point lands on the 1920 × 1080 frame at time t (for the overlay's labels). */
export function projectAt(t: number, p: [number, number, number]): {x: number; y: number; visible: boolean} {
  aim(scratch, t);
  const v = new THREE.Vector3(...p).project(scratch);
  return {x: (v.x + 1) * 960, y: (1 - v.y) * 540, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2};
}

// ---------------------------------------------------------------- the drawers and the lit floors
/** How far out (0–1) a floor's drawer is at time t, and where its plate sits (east offset, extra height). */
export function drawerAt(t: number, floor: string): {out: number; dx: number; dy: number} {
  let out = 0;
  let dy = 0;
  if (floor === '8') {
    out = Math.max(ov(t, 14.6, 16.0) * (1 - ov(t, 20.3, 21.3)), ov(t, 26.4, 27.6) * (1 - ov(t, 30.4, 31.4)));
  } else if (floor === 'R') {
    out = ov(t, 21.4, 22.4) * (1 - ov(t, 25.3, 26.2));
  } else if (floor === '5') {
    out = ov(t, 26.6, 27.8) * (1 - ov(t, 30.4, 31.4));
    dy = (floorY('8') - floorY('5') + 0.5) * ov(t, 28.2, 29.6) * (1 - ov(t, 30.4, 31.0)); // rises onto 8F: the same drawing
  }
  return {out, dx: out * DRAWER, dy};
}
const GHOSTS = ['8', '12', '16', '20'];
function ghostAt(t: number, floor: string) {
  const k = GHOSTS.indexOf(floor);
  if (k < 0) return 0;
  return ov(t, 16.6 + k * 0.35, 17.0 + k * 0.35) * (1 - ov(t, 20.3, 20.9));
}
function glowAt(t: number, floor: string) {
  const at = floor === '5' ? 35.5 : floor === '8' ? 36.0 : floor === 'R' ? 36.5 : -1;
  if (at < 0) return 0;
  const u = (t - at) / 0.9;
  return u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
}

// ---------------------------------------------------------------- textures
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

const CameraRig: React.FC<{t: number}> = ({t}) => {
  const {camera, size} = useThree();
  const pc = camera as THREE.PerspectiveCamera;
  pc.aspect = size.width / size.height;
  aim(pc, t);
  return null;
};

/** Each piece's own height once lifted (0.4 … 5.4 m), the same for the overlay's tags. */
export const pieceHeight = (i: number) => 0.4 + ((i * 5) % 12) * 0.45;
/** T-08's rise: 0 on the paper, 1 fully lifted. */
export const riseAt = (t: number) => ov(t, 43.0, 45.2) * (1 - ov(t, 50.2, 51.6));
export const pieceEnds = (i: number): [[number, number], [number, number]] => {
  const seg = t08.canopy[i];
  return [
    [SX(seg.points[0][0]), SZ(seg.points[0][1])],
    [SX(seg.points[1][0]), SZ(seg.points[1][1])],
  ];
};

const Scene: React.FC<{t: number; sheets: WorldSheet[]; tex: THREE.Texture[]; l1: THREE.Texture}> = ({t, sheets, tex, l1}) => {
  const stackIn = ov(t, 7.5, 10.0);
  const toTower = ov(t, 10.0, 13.0);
  const idx = (id: string) => sheets.findIndex((s) => s.id === id);
  const first = idx('L-1-revB');
  const fixed: Record<string, number> = {'1': idx('L-101'), '5': idx('L-102'), '8': idx('L-103'), R: idx('L-104')};
  const used = new Set([...Object.values(fixed), first]);
  const rest = sheets.map((_, i) => i).filter((i) => !used.has(i));
  const sheetOfSlab = SLABS.map((s) => (fixed[s.floor] !== undefined ? fixed[s.floor] : s.floor === '2' ? first : rest.shift()!));
  const groundA = ov(t, 38.0, 41.0);
  const rise = riseAt(t);
  const ringP = ov(t, 51.6, 52.4, (u) => u);
  const counted = t >= 53.4 ? Math.min(8, Math.floor((t - 53.4) / 0.3) + 1) : 0;
  const hedgeFill = ov(t, 57.4, 60.0, (u) => u);
  const hedgeA = Math.min(ov(t, 57.2, 57.6), 1 - ov(t, 64, 65));
  const pavA = Math.min(ov(t, 61.0, 61.6), 1 - ov(t, 64, 65));
  const t10 = ov(t, 76.0, 76.6);
  const cloud = ov(t, 76.6, 78.0, (u) => u);
  return (
    <>
      <CameraRig t={t} />
      <hemisphereLight args={['#ffffff', '#777777', 2.0]} />
      <directionalLight position={[60, 90, 50]} intensity={1.6} />
      <fog attach="fog" args={['#8a8a8a', 240, 560]} />

      {/* the ground and the planting plan on it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, -0.02, 10]}>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color="#8d8d8d" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, 0, L1.h / 2]}>
        <planeGeometry args={[L1.w, L1.h]} />
        <meshBasicMaterial map={l1} transparent opacity={groundA} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* the site boundary, traced for the high view */}
      {[[4.6, 4.6, 54.6, 4.6], [54.6, 4.6, 54.6, 34.6], [54.6, 34.6, 4.6, 34.6], [4.6, 34.6, 4.6, 4.6]].map(([x1, z1, x2, z2], k) => (
        <Bar key={k} a={[x1, z1]} b={[x2, z2]} y={0.05} colour="#2457ff" th={0.14} op={0.7 * ov(t, 75.5, 77)} />
      ))}

      {/* the eight canopies: rings; T-08 is its twelve real LINE segments, rising off the paper */}
      {ROW.map((r, i) => {
        const is8 = r.id === t08.object_id;
        const col = i < counted && t < 64 ? (is8 ? '#e5484d' : '#2457ff') : '#1d2026';
        return is8 ? null : <Ring key={r.id} x={r.x} z={r.z} r={r.r} colour={col} th={0.07} op={groundA} />;
      })}
      {t08.canopy.map((seg, i) => {
        const [a, b] = pieceEnds(i);
        return <Bar key={seg.handle} a={a} b={b} y={0.06 + pieceHeight(i) * rise} colour={rise > 0.02 ? '#6d8dff' : t >= 43 && t < 64 ? '#2457ff' : '#1d2026'} th={0.09} op={groundA} />;
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
      {/* the ground grid and the x / y / z axes around T-08, in the scene, so they turn with the tree */}
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

      {/* the hedge H-01 fills with plants (two rows, 91 each); the pavers light */}
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

      {/* T-10 beyond the boundary: red, then the cloud */}
      <Ring x={T10.x} z={T10.z} r={T10.r} colour={t10 > 0.5 ? '#e5484d' : '#1d2026'} th={0.12} op={groundA} />
      {cloud > 0 ? (
        <mesh position={[T10.x, 0.1, T10.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[T10.r + 0.9, T10.r + 1.4, 48, 1, 0, cloud * Math.PI * 2]} />
          <meshBasicMaterial color="#d92d20" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}

      {/* the sheets: the first floats high and fills the frame; the rest stack under and over it; the stack becomes the tower */}
      {SLABS.map((s) => {
        const si = sheetOfSlab[s.i];
        const isFirst = si === first;
        const inA = isFirst ? 1 : ov(t, 7.5 + (s.i % 10) * 0.12, 8.5 + (s.i % 10) * 0.12);
        const firstOrder = SLABS.findIndex((x) => sheetOfSlab[x.i] === first);
        const yStack = STACK_Y0 + (s.i - firstOrder) * 3.4;
        const y = lerp(yStack, s.y + 0.45, toTower);
        const w = lerp(L1.w, s.w, toTower);
        const h = (w * 1140) / 2100;
        const from = [TX + (s.i % 2 ? 140 : -140), yStack + (s.i % 3) * 20, TZ + (s.i % 2 ? -60 : 90)];
        const d = drawerAt(t, s.floor);
        const x = (isFirst ? TX : lerp(from[0], TX, smooth(inA))) + d.dx;
        const z = isFirst ? TZ : lerp(from[2], TZ, smooth(inA));
        const ghost = ghostAt(t, s.floor);
        const glow = glowAt(t, s.floor);
        const lit = Math.max(ghost, glow, d.out);
        const a = Math.min(inA * (isFirst || stackIn > 0 ? 1 : 0), 1 - 0.55 * toTower + 0.55 * lit);
        if (a <= 0.001) return null;
        const map = s.floor === '12' || s.floor === '16' || s.floor === '20' ? (ghost > 0 ? tex[fixed['8']] : tex[si]) : tex[si];
        return (
          <group key={s.i} position={[x, y + d.dy, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial map={map} color={lit > 0 ? new THREE.Color().setRGB(1 - 0.55 * lit, 1 - 0.4 * lit, 1) : new THREE.Color('#ffffff')} transparent opacity={a} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
            </mesh>
            {lit > 0 ? (
              <mesh position={[0, 0, 0.1]}>
                <planeGeometry args={[w + 2, h + 2]} />
                <meshBasicMaterial color="#2457ff" transparent opacity={0.45 * lit} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
              </mesh>
            ) : null}
          </group>
        );
      })}

      {/* the tower: grey boxes, a floor per sheet; a drawer's slab rides out with its sheet */}
      {SLABS.map((s) => {
        const d = drawerAt(t, s.floor);
        const fh = Number(s.floor) <= 4 ? TOWER.podH : TOWER.twrH;
        return (
          <group key={s.i} position={[TX + d.dx, s.y + d.dy, TZ]}>
            <mesh position={[0, 0.2, 0]}>
              <boxGeometry args={[s.w, 0.4, s.d]} />
              <meshStandardMaterial color="#d2d2d2" transparent opacity={0.95 * toTower} />
            </mesh>
            {s.floor !== 'R' ? (
              <mesh position={[0, 0.4 + (fh - 0.4) / 2, 0]}>
                <boxGeometry args={[s.w - 1.2, fh - 0.5, s.d - 1.2]} />
                <meshStandardMaterial color="#7f8ba3" transparent opacity={(d.out > 0 ? 0.25 : 0.6) * toTower} depthWrite={false} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </>
  );
};

export const WorldV9: React.FC<WorldV9Props> = ({sheets, l1}) => {
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
/** The floor plate's world position for the overlay (the drawer cards point at it). */
export function plateAt(t: number, floor: string): [number, number, number] {
  const s = SLABS.find((x) => x.floor === floor)!;
  const d = drawerAt(t, floor);
  return [TX + d.dx, s.y + d.dy + 0.5, TZ];
}
