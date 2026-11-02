import {ThreeCanvas} from '@remotion/three';
import {useEffect, useMemo, useState} from 'react';
import {useThree} from '@react-three/fiber';
import {AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import t08 from './t08.json';

/**
 * Film v8, Part 1 (0:06–1:12): ONE world, grey-box previz, under ONE camera path (demo/SCRIPT-V8.md). The L-1 sheet
 * (the real render) floats high as the first sheet, the other sheets stack under and over it, the stack becomes the
 * tower (the sheets are its floors), the typical plate lights and copies up six floors, the bill row floats beside
 * it; the camera descends to the ground, which carries L-1 at 1 m = 1 unit; the eight canopies; T-08's twelve real
 * LINE segments (src/scenes/t08.json) rise to different heights as the camera orbits it, with the dashed ground grid
 * and the x/y/z axes in the same scene, so they turn as one; the bill billboard, the hedge tape, the pavers; down
 * through the soil to the slab and the pits; the greenery bar; up to the high view, T-10 clouded, the findings as
 * translucent planes. Everything from the frame; no clock. Render with --gl=angle.
 */
export type WorldSheet = {id: string; png: string};
export type WorldV8Props = {sheets: WorldSheet[]; l1: string};

// sheet units (svg) → world: x = X + 4.6, z = 34.6 − Y, y up. The L-1 sheet is 83.2 × 45.2.
const SX = (X: number) => X + t08.svg.offset_x;
const SZ = (Y: number) => t08.svg.flip_y - Y;
const L1 = {w: 83.2, h: 45.2};
const T8 = {x: SX(t08.centre[0]), z: SZ(t08.centre[1])};
const TOWER = {x: 29.6, z: 17, podW: 44, podD: 26, podH: 4.5, podFloors: 4, twrW: 24, twrD: 16, twrH: 3.4, twrFloors: 17};
const DECK_Y = TOWER.podFloors * TOWER.podH;
type Slab = {i: number; y: number; w: number; d: number; floor: string};
const SLABS: Slab[] = [];
for (let k = 0; k < TOWER.podFloors; k++) SLABS.push({i: SLABS.length, y: k * TOWER.podH, w: TOWER.podW, d: TOWER.podD, floor: String(k + 1)});
for (let k = 0; k < TOWER.twrFloors; k++) SLABS.push({i: SLABS.length, y: DECK_Y + k * TOWER.twrH, w: TOWER.twrW, d: TOWER.twrD, floor: String(k + 5)});
SLABS.push({i: SLABS.length, y: DECK_Y + TOWER.twrFloors * TOWER.twrH, w: TOWER.twrW, d: TOWER.twrD, floor: 'R1'});
const floorY = (f: string) => SLABS.find((s) => s.floor === f)!.y;
const STACK_Y0 = 120; // where the first sheet floats in the opening
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number, fn: (u: number) => number = smooth) => fn(clamp01((t - a) / (b - a)));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- the camera: one path, eased Catmull-Rom splines
type Key = {t: number; pos: THREE.Vector3; look: THREE.Vector3; fov?: number};
const KEYS: Key[] = [
  {t: 6.0, pos: V(TOWER.x, STACK_Y0 + 62, TOWER.z + 0.01), look: V(TOWER.x, STACK_Y0, TOWER.z), fov: 40},
  {t: 8.0, pos: V(TOWER.x, STACK_Y0 + 62, TOWER.z + 0.01), look: V(TOWER.x, STACK_Y0, TOWER.z), fov: 40},
  {t: 10.0, pos: V(TOWER.x + 90, 150, TOWER.z + 110), look: V(TOWER.x, 80, TOWER.z), fov: 40},
  {t: 14.0, pos: V(TOWER.x + 130, 70, TOWER.z + 40), look: V(TOWER.x + 10, 40, TOWER.z), fov: 42},
  {t: 18.0, pos: V(TOWER.x - 60, 60, TOWER.z + 130), look: V(TOWER.x + 12, 38, TOWER.z), fov: 42},
  {t: 21.0, pos: V(TOWER.x, 14, TOWER.z + 70), look: V(TOWER.x, 6, TOWER.z + 20), fov: 45},
  {t: 24.0, pos: V(12, 4.5, 42), look: V(16, 1, 32), fov: 45},
  {t: 25.5, pos: V(T8.x, 16, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 27.0, pos: V(T8.x, 2.6, T8.z + 8.5), look: V(T8.x, 1.6, T8.z), fov: 45},
  {t: 30.0, pos: V(T8.x + 8.5, 2.6, T8.z), look: V(T8.x, 1.6, T8.z), fov: 45},
  {t: 31.5, pos: V(T8.x + 8.5, 2.6, T8.z), look: V(T8.x, 1.6, T8.z), fov: 45},
  {t: 33.0, pos: V(T8.x, 16, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 34.0, pos: V(T8.x, 16, T8.z + 0.02), look: V(T8.x, 0, T8.z), fov: 45},
  {t: 37.0, pos: V(24, 13, 50), look: V(23, 0, 32), fov: 45},
  {t: 40.0, pos: V(26, 10, 46), look: V(23, 2, 30), fov: 45},
  {t: 43.0, pos: V(64, 12, 8), look: V(53.4, 0, 19), fov: 45},
  {t: 45.0, pos: V(64, 12, 8), look: V(53.4, 0, 19), fov: 45},
  {t: 47.5, pos: V(30, 18, 54), look: V(24, 0, 38), fov: 45},
  {t: 49.0, pos: V(30, 18, 54), look: V(24, 0, 38), fov: 45},
  {t: 52.5, pos: V(31, 5, 46), look: V(24, -1, 36), fov: 45},
  {t: 55.5, pos: V(33, -0.3, 40), look: V(T8.x, -0.7, T8.z), fov: 45},
  {t: 58.0, pos: V(35.5, 0.2, 36), look: V(T8.x, -0.6, T8.z), fov: 45},
  {t: 61.0, pos: V(46, 7, 48), look: V(44, 2, 36), fov: 45},
  {t: 63.0, pos: V(46, 7, 48), look: V(44, 2, 36), fov: 45},
  {t: 67.0, pos: V(34, 95, 75), look: V(32, 0, 22), fov: 42},
  {t: 72.0, pos: V(30, 100, 70), look: V(32, 0, 22), fov: 42},
];
/** A point in the camera's own frame at time t: `dist` ahead, `rx` right, `ry` up (for cards that must stay in frame). */
function camPoint(t: number, rx: number, ry: number, dist: number): [number, number, number] {
  const c = cameraAt(t);
  const f = c.look.clone().sub(c.pos).normalize();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const p = c.pos.clone().add(f.multiplyScalar(dist)).add(r.multiplyScalar(rx)).add(u.multiplyScalar(ry));
  return [p.x, p.y, p.z];
}
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k.pos), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k.look), false, 'centripetal');
function cameraAt(t: number) {
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

// ---------------------------------------------------------------- textures and text
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
const textCache = new Map<string, THREE.CanvasTexture>();
/** A label or a card as a canvas texture: `lines` of text on a translucent dark ground (or none). */
function textTexture(lines: string[], opts: {bg?: string; colour?: string; size?: number; w?: number; mono?: boolean; accent?: string}): THREE.CanvasTexture {
  const key = JSON.stringify([lines, opts]);
  const hit = textCache.get(key);
  if (hit) return hit;
  const size = opts.size ?? 44;
  const pad = 28;
  const probe = document.createElement('canvas').getContext('2d')!;
  let widest = 0;
  lines.forEach((l, i) => {
    probe.font = `${i === 0 ? 600 : 400} ${size}px ${opts.mono ? 'JetBrains Mono, Menlo, monospace' : 'Inter, Helvetica, Arial, sans-serif'}`;
    widest = Math.max(widest, probe.measureText(l).width);
  });
  const w = Math.ceil(Math.max(opts.w ?? 0, widest + pad * 2));
  const h = pad * 2 + lines.length * size * 1.3;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = Math.ceil(h);
  const g = canvas.getContext('2d')!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.beginPath();
    g.roundRect(0, 0, w, h, 28);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    g.stroke();
  }
  lines.forEach((l, i) => {
    g.font = `${i === 0 ? 600 : 400} ${size}px ${opts.mono ? 'JetBrains Mono, Menlo, monospace' : 'Inter, Helvetica, Arial, sans-serif'}`;
    g.fillStyle = i === 0 && opts.accent ? opts.accent : (opts.colour ?? '#fff');
    g.textBaseline = 'top';
    g.fillText(l, pad, pad + i * size * 1.3);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  textCache.set(key, tex);
  return tex;
}
/** An upright plane that faces the camera's position (yaw only), `w` metres wide. */
const Billboard: React.FC<{p: [number, number, number]; w: number; tex: THREE.CanvasTexture; cam: THREE.Vector3; a?: number}> = ({p, w, tex, cam, a = 1}) => {
  if (a <= 0.001) return null;
  const img = tex.image as HTMLCanvasElement;
  const h = (w * img.height) / img.width;
  const centre = new THREE.Vector3(p[0], p[1] + h / 2, p[2]);
  const dir = cam.clone().sub(centre).normalize();
  const vert = clamp01((Math.abs(dir.y) - 0.86) / 0.13); // under a straight-down camera, use −z as up (as the camera does)
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam, centre, new THREE.Vector3(0, 1 - vert, -vert).normalize()));
  return (
    <mesh position={[p[0], p[1] + h / 2, p[2]]} quaternion={q}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent opacity={a} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
};
/** A flat label lying on the ground (or a plane) at height y. */
const FlatText: React.FC<{p: [number, number, number]; w: number; tex: THREE.CanvasTexture; a?: number}> = ({p, w, tex, a = 1}) => {
  if (a <= 0.001) return null;
  const img = tex.image as HTMLCanvasElement;
  const h = (w * img.height) / img.width;
  return (
    <mesh position={p} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent opacity={a} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};
/** A thin bar between two points on the horizontal plane at height y (a line with body). */
const Bar: React.FC<{a: [number, number]; b: [number, number]; y: number; colour: string; th?: number; op?: number}> = ({a, b, y, colour, th = 0.08, op = 1}) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return null;
  return (
    <mesh position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <boxGeometry args={[len, th, th]} />
      <meshBasicMaterial color={colour} transparent={op < 1} opacity={op} toneMapped={false} />
    </mesh>
  );
};
const Ring: React.FC<{x: number; z: number; r: number; y?: number; colour: string; th?: number; op?: number}> = ({x, z, r, y = 0.05, colour, th = 0.08, op = 1}) => (
  <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
    <torusGeometry args={[r, th, 6, 48]} />
    <meshBasicMaterial color={colour} transparent={op < 1} opacity={op} toneMapped={false} />
  </mesh>
);

// ---------------------------------------------------------------- the scene
const CameraRig: React.FC<{t: number}> = ({t}) => {
  const {camera, size} = useThree();
  const c = cameraAt(t);
  const pc = camera as THREE.PerspectiveCamera;
  pc.position.copy(c.pos);
  // looking straight down, the world's up is useless as the camera's up: blend toward −z so the view does not roll
  const dir = c.look.clone().sub(c.pos).normalize();
  const vert = clamp01((Math.abs(dir.y) - 0.86) / 0.13);
  pc.up.set(0, 1 - vert, -vert).normalize();
  pc.lookAt(c.look);
  pc.fov = c.fov;
  pc.aspect = size.width / size.height;
  pc.near = 0.2;
  pc.far = 900;
  pc.updateProjectionMatrix();
  return null;
};

const Scene: React.FC<{t: number; sheets: WorldSheet[]; tex: THREE.Texture[]; l1: THREE.Texture}> = ({t, sheets, tex, l1}) => {
  const cam = cameraAt(t).pos;
  // ---- the stack (8–10) → the tower (10–13): sheet i sits at the floor it becomes
  const stackIn = ov(t, 8.0, 10.0);
  const toTower = ov(t, 10.5, 13.0);
  const lc = sheets.findIndex((s) => s.id === 'L-103');
  const sheetOfSlab = (s: Slab) => (s.floor === '1' ? sheets.findIndex((x) => x.id === 'L-101') : s.floor === '4' ? sheets.findIndex((x) => x.id === 'L-102') : s.floor === '6' ? lc : s.floor === 'R1' ? sheets.findIndex((x) => x.id === 'L-104') : 6 + s.i);
  const first = sheets.findIndex((s) => s.id === 'L-1-revB');
  // ---- the lit plates (13–17), the bill row (15), the card (16.5)
  const lit = ['6', '9', '12', '15', '18', '21'];
  // ---- the ground L-1 unfolds (18–21)
  const groundA = ov(t, 18.0, 21.0);
  // ---- T-08: the twelve pieces rise (25.5–27.5), snap (31.5–32.5); the ring (32.6–33.4)
  const rise = ov(t, 25.3, 27.5) * (1 - ov(t, 31.5, 32.4));
  const ringP = ov(t, 32.6, 33.4, (u) => u);
  const refA = Math.min(ov(t, 24.5, 25.5), 1 - ov(t, 34.0, 35.0));
  // ---- the row counts 1…8 (35–37.5), the bill billboard (36–40.5), the tape (41–44), the plants (44.3), the pavers (45.5)
  const counted = Math.max(0, Math.min(8, Math.floor((t - 35.0) / 0.3) + 1));
  const billA = Math.min(ov(t, 36.0, 36.8), 1 - ov(t, 40.5, 41.5));
  const tape = ov(t, 41.0, 44.0, (u) => u);
  const hedgeA = 1 - ov(t, 48.0, 49.0);
  const plantsA = ov(t, 44.3, 44.8) * hedgeA;
  const pavA = ov(t, 45.5, 46.2) * (1 - ov(t, 49.5, 50.5));
  // ---- underground (49–63): the ground thins as the camera sinks; the pit label; the canopies shrink; the bar falls
  const under = ov(t, 50.0, 53.0);
  const shrink = ov(t, 57.0, 58.5);
  const barFall = ov(t, 59.0, 61.0);
  const barV = lerp(261.1, 209.9, barFall);
  // ---- the high view (63–72): T-10 red, the cloud, the findings
  const t10 = ov(t, 65.5, 66.2);
  const cloud = ov(t, 66.2, 67.8, (u) => u);
  const row = [...t08.row].sort((a, b) => a.centre[0] - b.centre[0]);
  const T10 = {x: SX(39.0), z: SZ(-2.6), r: 1.95};
  const findings = ['Send back · a tree off the site', 'Billed 12, drawn 8 · $516', 'Pavers over your list · $10,856', 'Greenery short · building code', 'Hedge priced by the metre · 182 plants'];
  return (
    <>
      <CameraRig t={t} />
      <hemisphereLight args={['#ffffff', '#777777', 2.0]} />
      <directionalLight position={[60, 90, 50]} intensity={1.6} />
      <fog attach="fog" args={['#8a8a8a', 220, 520]} />

      {/* the ground: flat grey, then L-1 unfolds on it; it thins when the camera goes below */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, -0.02, L1.h / 2]}>
        <planeGeometry args={[800, 800]} />
        <meshStandardMaterial color="#8d8d8d" transparent opacity={1 - 0.8 * under} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L1.w / 2, 0, L1.h / 2]}>
        <planeGeometry args={[L1.w, L1.h]} />
        <meshBasicMaterial map={l1} transparent opacity={groundA * (1 - 0.72 * under)} toneMapped={false} depthWrite={false} />
      </mesh>
      {groundA > 0.9 ? <FlatText p={[12, 0.03, 44]} w={14} tex={textTexture(['ground: the real L-1 sheet, 1 m = 1 unit'], {size: 40, mono: true, colour: '#222'})} a={groundA} /> : null}

      {/* underground: the soil, the slab, the pits under the eight canopies */}
      <group>
        <mesh position={[29.6, -0.55, 19.6]}>
          <boxGeometry args={[50, 1.0, 30]} />
          <meshStandardMaterial color="#6b5a46" transparent opacity={0.35 * under} wireframe={false} />
        </mesh>
        <mesh position={[29.6, -1.35, 19.6]}>
          <boxGeometry args={[50, 0.5, 30]} />
          <meshStandardMaterial color="#9a9a9a" transparent opacity={0.95 * under} />
        </mesh>
        {under > 0 ? <FlatText p={[18, -1.08, 26]} w={16} tex={textTexture(['the concrete slab (basement) · artificial ground'], {size: 40, mono: true, colour: '#111'})} a={under} /> : null}
        {row.map((r) => (
          <mesh key={r.id} position={[SX(r.centre[0]), -0.6, SZ(r.centre[1])]}>
            <boxGeometry args={[1.5, 1.0, 1.5]} />
            <meshStandardMaterial color="#c8b48a" transparent opacity={0.95 * under} />
          </mesh>
        ))}
        {t >= 55.5 && t < 63 ? <Billboard p={camPoint(t, 1.6, 0.6, 5)} w={3.6} tex={textTexture(['tree pit 1.5 × 1.5 m · soil 1.0 m · on the slab', 'E12: a large tree counts as small (Gi 1.5 → 1.0)'], {bg: 'rgba(20,22,26,0.85)', size: 44})} cam={cam} a={ov(t, 55.5, 56)} /> : null}
      </group>

      {/* the eight canopies (rings) and the cross; T-08's real twelve LINE segments, rising with the orbit */}
      {row.map((r, i) => {
        const is8 = r.id === t08.object_id;
        const sc = lerp(1, 0.6, shrink);
        const col = i < counted && t < 49 ? (is8 ? '#e5484d' : '#2457ff') : '#1d2026';
        return (
          <group key={r.id}>
            {!is8 ? <Ring x={SX(r.centre[0])} z={SZ(r.centre[1])} r={r.r * sc} colour={col} th={0.07} /> : null}
            {i < counted && t < 49 ? <FlatText p={[SX(r.centre[0]), 0.08, SZ(r.centre[1]) + 0.2]} w={1.6} tex={textTexture([String(i + 1)], {size: 120, colour: col})} /> : null}
          </group>
        );
      })}
      {t08.canopy.map((seg, i) => {
        const h = 0.4 + ((i * 5) % 12) * 0.45; // each piece's own height when lifted (0.4 … 5.4 m)
        const y = 0.06 + h * rise;
        const sc = lerp(1, 0.6, shrink);
        const a: [number, number] = [T8.x + (SX(seg.points[0][0]) - T8.x) * sc, T8.z + (SZ(seg.points[0][1]) - T8.z) * sc];
        const b: [number, number] = [T8.x + (SX(seg.points[1][0]) - T8.x) * sc, T8.z + (SZ(seg.points[1][1]) - T8.z) * sc];
        return <Bar key={seg.handle} a={a} b={b} y={y} colour={rise > 0.05 ? '#6d8dff' : t >= 24 && t < 49 ? '#2457ff' : '#1d2026'} th={0.09} />;
      })}
      {t08.cross.map((seg) => (
        <Bar key={seg.handle} a={[SX(seg.points[0][0]), SZ(seg.points[0][1])]} b={[SX(seg.points[1][0]), SZ(seg.points[1][1])]} y={0.06} colour="#1d2026" th={0.06} op={1 - rise} />
      ))}
      {ringP > 0 ? (
        <mesh position={[T8.x, 0.1, T8.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[t08.radius + 0.25, t08.radius + 0.4, 64, 1, Math.PI / 2, -ringP * Math.PI * 2]} />
          <meshBasicMaterial color="#2457ff" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ) : null}
      {/* the dashed ground grid and the x / y / z axes around T-08: in the scene, so they turn with the tree */}
      {refA > 0 ? (
        <group position={[T8.x, 0.04, T8.z]}>
          {Array.from({length: 13}, (_, k) => k - 6).map((k) =>
            k === 0 ? null : (
              <group key={k}>
                <Bar a={[k * 0.5, -3]} b={[k * 0.5, 3]} y={0} colour="#ffffff" th={0.03} op={0.45 * refA} />
                <Bar a={[-3, k * 0.5]} b={[3, k * 0.5]} y={0} colour="#ffffff" th={0.03} op={0.45 * refA} />
              </group>
            ),
          )}
          <Bar a={[-3.8, 0]} b={[3.8, 0]} y={0} colour="#ffffff" th={0.06} op={0.9 * refA} />
          <Bar a={[0, -3.8]} b={[0, 3.8]} y={0} colour="#ffffff" th={0.06} op={0.9 * refA} />
          <mesh position={[0, 3, 0]}>
            <boxGeometry args={[0.06, 6, 0.06]} />
            <meshBasicMaterial color="#ffd400" transparent opacity={0.9 * refA} toneMapped={false} />
          </mesh>
          <FlatText p={[4.3, 0.01, 0]} w={1} tex={textTexture(['x'], {size: 120, mono: true})} a={refA} />
          <FlatText p={[0, 0.01, -4.3]} w={1} tex={textTexture(['z'], {size: 120, mono: true})} a={refA} />
          <Billboard p={[0.3, 6.1, 0]} w={2.4} tex={textTexture(['y · height'], {size: 100, mono: true, colour: '#ffd400'})} cam={cam} a={refA} />
          
        </group>
      ) : null}
      {t >= 27.5 && t < 31 ? <Billboard p={camPoint(t, 2.2, 1.6, 7)} w={4.6} tex={textTexture(['T-08: twelve LINE entities of the DXF,', 'each at its own height'], {bg: 'rgba(20,22,26,0.85)', size: 44})} cam={cam} a={ov(t, 27.5, 28)} /> : null}
      {t >= 31.0 && t < 35 ? <Billboard p={camPoint(t, 2.4, -1.2, 8)} w={5} tex={textTexture(['Muse Spark: one tree · 95% · Confirm?', 'a cursor clicks Confirm at 0:33.5 — counted only then'], {bg: 'rgba(20,22,26,0.85)', size: 44, accent: '#9ab4ff'})} cam={cam} a={ov(t, 31.0, 31.6)} /> : null}

      {/* the bill billboard beside the row (36–40.5): row 6 lit */}
      <Billboard p={[22, 0.3, 28.5]} w={16} tex={textTexture(['the bill · BOQ 20261014 (governs)', '6   Camphore tree, cal. 10 cm   EA   12   4,200   ← lit', '7   Duranta hedge                m    27   950', '11  Permeable pavers (PV-1)      m²   236  3,800'], {bg: 'rgba(250,248,242,0.95)', size: 40, mono: true, colour: '#1d2026', accent: '#8a6a00'})} cam={cam} a={billA} />
      {billA > 0.5 ? <Billboard p={[33, 0.3, 29.5]} w={7} tex={textTexture(['$516 for trees that aren’t drawn', 'E02.2 · billed 12 · drawn 8 · 4 × $129'], {bg: 'rgba(20,22,26,0.85)', size: 44, accent: '#f0a500'})} cam={cam} a={billA} /> : null}

      {/* the hedge H-01 (x = 48.8, y 1.5 → 28.5 in sheet metres): the tape runs 0 → 27 m, the double row of 182 plants */}
      {tape > 0 && hedgeA > 0 ? (
        <>
          <Bar a={[SX(48.8), SZ(1.5)]} b={[SX(48.8), SZ(1.5 + 27 * tape)]} y={0.12} colour="#2457ff" th={0.35} op={hedgeA} />
          <Billboard p={[SX(48.8) + 0.8, 0.3, SZ(1.5 + 27 * tape)]} w={6} tex={textTexture([`tape ${(27 * tape).toFixed(1)} m`], {size: 100, mono: true, colour: '#2457ff', bg: 'rgba(255,255,255,0.8)'})} cam={cam} a={hedgeA} />
          {plantsA > 0 ? [0, 1].map((rowK) => Array.from({length: 91}, (_, k) => <Ring key={`${rowK}-${k}`} x={SX(48.8 + (rowK ? 0.4 : 0))} z={SZ(1.5 + k * 0.3)} r={0.12} y={0.1} colour="#1f9d55" th={0.03} op={plantsA} />)) : null}
          {plantsA > 0 ? <Billboard p={[SX(48.8) - 7, 0.3, SZ(14)]} w={9} tex={textTexture(['DU H0.6 @0.3m o.c. DOUBLE ROW', '27.0 ÷ 0.3 + 1 = 91 · × 2 rows = 182 plants', 'the bill: row 7 · 27 m — priced by the metre (E17)'], {bg: 'rgba(20,22,26,0.85)', size: 44, accent: '#f0a500'})} cam={cam} a={plantsA} /> : null}
        </>
      ) : null}

      {/* the pavers: a lit rectangle on the ground */}
      {pavA > 0 ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[24, 0.05, 38]}>
            <planeGeometry args={[14, 6]} />
            <meshBasicMaterial color="#e8c46a" transparent opacity={0.55 * pavA} toneMapped={false} />
          </mesh>
          <Billboard p={[24, 0.3, 36]} w={10} tex={textTexture(['PV-1 permeable pavers · $117/m² billed', 'your list: up to $71 · 236 m² × $46', '$10,856 over your list (E20)'], {bg: 'rgba(20,22,26,0.85)', size: 44, accent: '#f0a500'})} cam={cam} a={pavA} />
        </>
      ) : null}

      {/* the greenery bar in the scene (58–63): a bar to the code line, falling */}
      {t >= 58 && t < 64 ? (
        <group position={[38, 0, 36]}>
          <mesh position={[6, 0.3, 0]}>
            <boxGeometry args={[12, 0.6, 0.6]} />
            <meshStandardMaterial color="#444" />
          </mesh>
          <mesh position={[(12 * barV) / 360 / 2, 0.3, 0]}>
            <boxGeometry args={[(12 * barV) / 360, 0.7, 0.7]} />
            <meshBasicMaterial color={barV >= 297 ? '#3ccf7f' : '#e5484d'} toneMapped={false} />
          </mesh>
          <mesh position={[(12 * 297) / 360, 0.6, 0]}>
            <boxGeometry args={[0.1, 1.6, 0.9]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <Billboard p={[6, 1.6, 0.2]} w={7} tex={textTexture([`Greenery ${barV.toFixed(1)} / 297 — ${barV >= 297 ? 'pass' : 'fail'} · +7 trees, or change one species`, 'E14 · 209.9 provided after the pit rule (261.1 before) · required 297.0'], {bg: 'rgba(20,22,26,0.85)', size: 44, accent: barV >= 297 ? '#3ccf7f' : '#ff8a8a'})} cam={cam} a={ov(t, 58.5, 59)} />
        </group>
      ) : null}

      {/* the high view: the site boundary, T-10 beyond it, red, the cloud; the findings as translucent planes */}
      <group>
        {[[4.6, 4.6, 54.6, 4.6], [54.6, 4.6, 54.6, 34.6], [54.6, 34.6, 4.6, 34.6], [4.6, 34.6, 4.6, 4.6]].map(([x1, z1, x2, z2], k) => (
          <Bar key={k} a={[x1, z1]} b={[x2, z2]} y={0.05} colour="#2457ff" th={0.12} op={0.6 * ov(t, 63.5, 65)} />
        ))}
        <Ring x={T10.x} z={T10.z} r={T10.r} colour={t10 > 0.5 ? '#e5484d' : '#1d2026'} th={0.12} />
        {cloud > 0 ? (
          <mesh position={[T10.x, 0.1, T10.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[T10.r + 0.9, T10.r + 1.3, 48, 1, 0, cloud * Math.PI * 2]} />
            <meshBasicMaterial color="#d92d20" side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        ) : null}
        {cloud > 0.99 ? <FlatText p={[T10.x + 7, 0.1, T10.z]} w={9} tex={textTexture(['T-10 · off the site · revision cloud (E08)'], {size: 60, colour: '#d92d20'})} /> : null}
        {t >= 68 && t < 72.5
          ? findings.map((f, i) => (
              <Billboard key={f} p={camPoint(t, 26, 16 - i * 7.5, 70)} w={26} tex={textTexture([f], {bg: 'rgba(20,22,26,0.82)', size: 60, accent: i === 0 ? '#ff8a8a' : i === 3 ? '#9ab4ff' : '#f0a500'})} cam={cam} a={ov(t, 68 + i * 0.5, 68.4 + i * 0.5)} />
            ))
          : null}
      </group>

      {/* the sheets: the first floats high and fills the frame, the others stack under and over it; the stack becomes the tower */}
      {sheets.map((s, si) => {
        const slab = SLABS.find((x) => sheetOfSlab(x) === si);
        const isFirst = si === first;
        const inA = isFirst ? 1 : ov(t, 8.0 + (si % 10) * 0.12, 9.0 + (si % 10) * 0.12);
        // where it sits in the stack: the first at STACK_Y0, the others spaced 3.4 under and over it, in slab order
        const order = slab ? slab.i : 22 + (si % 8);
        const firstOrder = SLABS.find((x) => sheetOfSlab(x) === first)?.i ?? 0;
        const yStack = STACK_Y0 + (order - firstOrder) * 3.4;
        const yTower = slab ? slab.y + 0.3 : -50;
        const y = lerp(yStack, yTower, toTower);
        const w = lerp(L1.w, slab ? slab.w : 20, toTower);
        const h = (w * 1140) / 2100;
        const from = [TOWER.x + (si % 2 ? 140 : -140), yStack + (si % 3) * 20, TOWER.z + (si % 2 ? -60 : 90)];
        const x = isFirst ? TOWER.x : lerp(from[0], TOWER.x, smooth(inA));
        const z = isFirst ? TOWER.z : lerp(from[2], TOWER.z, smooth(inA));
        const litK = slab ? lit.indexOf(slab.floor) : -1;
        const litA = litK >= 0 ? ov(t, 13.2 + litK * 0.35, 13.5 + litK * 0.35) : 0;
        const a = Math.min(inA * (isFirst ? 1 : stackIn > 0 ? 1 : 0), 1 - 0.75 * toTower + litA * 0.75) * (1 - ov(t, 18, 21));
        if (a <= 0.001 || !slab) return null;
        return (
          <group key={s.id} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh>
              <planeGeometry args={[litA > 0 ? w + 6 : w, litA > 0 ? h + 5 : h]} />
              <meshBasicMaterial map={litK === 0 || litK > 0 ? tex[lc] : tex[si]} color={litA > 0 ? new THREE.Color('#6d8dff') : new THREE.Color('#ffffff')} transparent opacity={a} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
            </mesh>
          </group>
        );
      })}

      {/* the tower: grey boxes, the sheets are its floors */}
      {SLABS.map((s) => (
        <group key={s.i} position={[TOWER.x, s.y, TOWER.z]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[s.w, 0.4, s.d]} />
            <meshStandardMaterial color="#cfcfcf" transparent opacity={0.95 * toTower} />
          </mesh>
          {s.floor !== 'R1' ? (
            <mesh position={[0, 0.4 + (s.floor.length && Number(s.floor) <= 4 ? TOWER.podH - 0.4 : TOWER.twrH - 0.4) / 2, 0]}>
              <boxGeometry args={[s.w - 1.2, (Number(s.floor) <= 4 ? TOWER.podH : TOWER.twrH) - 0.5, s.d - 1.2]} />
              <meshStandardMaterial color="#7f8ba3" transparent opacity={0.6 * toTower} depthWrite={false} />
            </mesh>
          ) : null}
        </group>
      ))}
      {toTower > 0.5 && t < 20 ? <Billboard p={camPoint(t, -22, 22, 90)} w={30} tex={textTexture(['3D tower, blue hour later · the sheets are its floors'], {bg: 'rgba(20,22,26,0.8)', size: 56})} cam={cam} a={ov(t, 12.5, 13)} /> : null}
      {t >= 14.5 && t < 19 ? <Billboard p={camPoint(t, -24, -4, 90)} w={28} tex={textTexture(['L-103 · typ. floor, lit cobalt · copies to 8, 12, 16, 20F (T01)'], {bg: 'rgba(20,22,26,0.85)', size: 48, accent: '#9ab4ff'})} cam={cam} a={ov(t, 14.5, 15)} /> : null}
      {/* the bill row floats beside the tower (15.5), the glass card (16.5) */}
      {t >= 15.3 && t < 19.5 ? <Billboard p={camPoint(t, 24, 10, 90)} w={38} tex={textTexture(['13   Planter shrubs, typ. floor  (x 1)   m²   20   620', 'the tower bill, row 13 · the × 1 circled red (T06)'], {bg: 'rgba(250,248,242,0.95)', size: 48, mono: true, colour: '#1d2026', accent: '#c0392b'})} cam={cam} a={ov(t, 15.3, 15.9)} /> : null}
      {t >= 16.5 && t < 20 ? <Billboard p={camPoint(t, 24, -4, 90)} w={32} tex={textTexture(['Bill: 1 floor · Drawing: 6 floors', 'Planter shrubs, typ. floor x 1: bill 20 m², drawing 120 m² · $19/m²'], {bg: 'rgba(20,22,26,0.85)', size: 52, accent: '#ff8a8a'})} cam={cam} a={ov(t, 16.5, 17)} /> : null}
    </>
  );
};

export const WorldV8: React.FC<WorldV8Props> = ({sheets, l1}) => {
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
