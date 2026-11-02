import {ThreeCanvas} from '@remotion/three';
import {useEffect, useMemo, useState} from 'react';
import {useThree} from '@react-three/fiber';
import {AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {V7} from './story-v7-cues.js';
import {clamp01, ease, easeOut, lerp, over} from './v7-ui';

/**
 * The tower at blue hour (film v7, 0:00–0:22): a massing read off the tower package's sheets — a podium 1–4F with
 * its landscaped deck (L-101 ground floor, L-102 the 4F podium garden), a tower 5–21F (L-103, the typical floor planter
 * plan, stands for 8, 12, 16, 20F) and a roof garden (L-104, R1F). Glass, warm windows, a low crane up the
 * facade; the floors lift apart from the bottom and each slab tips flat into a paper sheet textured with a real
 * render (public/v7/sheets: the six tower renders and the greenfield sheets), fanning into a grid of thirty; the push
 * onto L-103 (the L1 fallback); the restack; L-103 lit cobalt and copied to the six floors it stands for; five go dark
 * when the bill prices one. Everything is a function of the frame (no clocks): render with --gl=angle.
 *
 * This is an illustration of real sheets and real findings; the product's screen is 2D.
 */
export type TowerSheet = {id: string; title: string; png: string};
export type Tower3DProps = {sheets: TowerSheet[]; typicalFloors: string[]};

const T = V7.tower;
// the massing (metres)
const POD = {w: 44, d: 26, floorH: 4.5, floors: 4};
const TWR = {w: 24, d: 17, floorH: 3.4, floors: 17, x: -4, z: -1}; // 5–21F, set back on the podium
const DECK_Y = POD.floors * POD.floorH; // 18: the podium garden (4F deck)
const ROOF_Y = DECK_Y + TWR.floors * TWR.floorH; // 75.8: the roof garden
const SLAB = 0.45;
/** The 22 slabs, bottom first: 1–4F podium, 5–21F tower, R1F roof. */
type Slab = {i: number; y: number; w: number; d: number; x: number; z: number; h: number; floor: string; kind: 'podium' | 'tower' | 'roof'};
const SLABS: Slab[] = [];
for (let k = 0; k < POD.floors; k++) SLABS.push({i: SLABS.length, y: k * POD.floorH, w: POD.w, d: POD.d, x: 0, z: 0, h: POD.floorH, floor: String(k + 1), kind: 'podium'});
for (let k = 0; k < TWR.floors; k++) SLABS.push({i: SLABS.length, y: DECK_Y + k * TWR.floorH, w: TWR.w, d: TWR.d, x: TWR.x, z: TWR.z, h: TWR.floorH, floor: String(k + 5), kind: 'tower'});
SLABS.push({i: SLABS.length, y: ROOF_Y, w: TWR.w, d: TWR.d, x: TWR.x, z: TWR.z, h: 1.2, floor: 'R1', kind: 'roof'});
const floorY = (floor: string) => SLABS.find((s) => s.floor === floor)!.y;

// the grid of thirty (world units): 6 × 5, facing +z, in front of the tower
const SHEET_W = 20;
const SHEET_H = SHEET_W * (1140 / 2100);
const GRID = {cols: 6, rows: 5, dx: 23, dy: 13.2, cx: 0, cy: 42, z: 24};
/** Which sheet lies on which slab: floor 1 L-101, 4 L-102, 6 L-103, the roof L-104, the rest in list order. */
function sheetOfSlab(sheets: TowerSheet[]): number[] {
  const idx = (id: string) => sheets.findIndex((s) => s.id === id);
  const fixed: Record<string, number> = {'1': idx('L-101'), '4': idx('L-102'), '6': idx('L-103'), R1: idx('L-104')};
  const used = new Set(Object.values(fixed));
  const rest = sheets.map((_, i) => i).filter((i) => !used.has(i));
  return SLABS.map((s) => (fixed[s.floor] !== undefined ? fixed[s.floor] : rest.shift()!));
}
/** The grid slot of each sheet index: L-103 in the centre slot (14), the sheet that was there takes L-103's place. */
function slotOfSheet(sheets: TowerSheet[]): number[] {
  const lc = sheets.findIndex((s) => s.id === 'L-103');
  const slots = sheets.map((_, i) => i);
  const centre = 14;
  [slots[lc], slots[centre]] = [slots[centre], slots[lc]];
  return slots;
}
const slotPos = (slot: number) => {
  const c = slot % GRID.cols;
  const r = Math.floor(slot / GRID.cols);
  return new THREE.Vector3(GRID.cx + (c - (GRID.cols - 1) / 2) * GRID.dx, GRID.cy + ((GRID.rows - 1) / 2 - r) * GRID.dy, GRID.z);
};

// ---------------------------------------------------------------- the camera: keyframes by seconds
type Cam = {pos: THREE.Vector3; look: THREE.Vector3; fov: number};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, u: number) => new THREE.Vector3(lerp(a.x, b.x, u), lerp(a.y, b.y, u), lerp(a.z, b.z, u));
const LC1_SLOT = slotPos(14);
const KEYS: {t: number; cam: Cam; fn?: (u: number) => number}[] = [
  {t: 0, cam: {pos: V(34, 2.5, 66), look: V(-2, 24, 0), fov: 48}},
  {t: T.crane.end, cam: {pos: V(28, 40, 56), look: V(-2, 56, 0), fov: 44}, fn: ease},
  {t: T.grid.settle, cam: {pos: V(0, GRID.cy, GRID.z + 124), look: V(0, GRID.cy, GRID.z), fov: 40}, fn: ease},
  {t: T.grid.hold, cam: {pos: V(3, GRID.cy + 1, GRID.z + 120), look: V(0, GRID.cy, GRID.z), fov: 40}, fn: (u) => u},
  {t: T.push.end, cam: {pos: V(LC1_SLOT.x, LC1_SLOT.y, LC1_SLOT.z + 15.5), look: LC1_SLOT.clone(), fov: 40}, fn: ease},
  {t: T.restack.end, cam: {pos: V(70, 46, 92), look: V(16, 38, 0), fov: 42}, fn: ease},
  {t: T.fade.out, cam: {pos: V(84, 48, 78), look: V(16, 38, 0), fov: 42}, fn: (u) => u},
];
function camera(t: number): Cam {
  if (t <= KEYS[0].t) return KEYS[0].cam;
  for (let k = 1; k < KEYS.length; k++) {
    if (t <= KEYS[k].t) {
      const a = KEYS[k - 1];
      const b = KEYS[k];
      const u = (b.fn ?? ease)(clamp01((t - a.t) / (b.t - a.t)));
      return {pos: lerpV(a.cam.pos, b.cam.pos, u), look: lerpV(a.cam.look, b.cam.look, u), fov: lerp(a.cam.fov, b.cam.fov, u)};
    }
  }
  return KEYS[KEYS.length - 1].cam;
}

// ---------------------------------------------------------------- textures
/** A warm window strip for one floor: `cols` lit panes on black, a seeded scatter of dark ones. */
function windowTexture(cols: number, seed: number): THREE.CanvasTexture {
  const w = 64 * cols;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let c = 0; c < cols; c++) {
    const r = rnd();
    if (r < 0.28) continue; // dark
    const warm = r < 0.55 ? 'rgba(255,196,120,' : 'rgba(255,224,170,';
    g.fillStyle = `${warm}${(0.35 + rnd() * 0.65).toFixed(2)})`;
    g.fillRect(c * 64 + 10, 10, 44, 40);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
function useSheetTextures(urls: string[]): THREE.Texture[] | null {
  const [tex, setTex] = useState<THREE.Texture[] | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    const handle = delayRender('tower sheet textures');
    const loader = new THREE.TextureLoader();
    Promise.all(
      urls.map((u) =>
        loader.loadAsync(u).then((x) => {
          x.colorSpace = THREE.SRGBColorSpace;
          x.anisotropy = 4;
          return x;
        }),
      ),
    )
      .then((xs) => {
        setTex(xs);
        continueRender(handle);
      })
      .catch((e) => {
        console.error(e);
        continueRender(handle);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tex;
}

// ---------------------------------------------------------------- the per-frame state of every slab and sheet
type SlabState = {y: number; a: number}; // the building's own opacity
type SheetState = {pos: THREE.Vector3; rot: THREE.Euler; scale: number; a: number; tint: THREE.Color; emissive: number};
const WHITE = new THREE.Color('#ffffff');
const COBALT = new THREE.Color('#2457ff');
const COBALT_LT = new THREE.Color('#6d8dff');

function stateAt(t: number, sheets: TowerSheet[]) {
  const sheetOf = sheetOfSlab(sheets);
  const slotOf = slotOfSheet(sheets);
  const slabs: SlabState[] = [];
  const sheetStates: SheetState[] = sheets.map((_, si) => ({pos: slotPos(slotOf[si]).clone().add(new THREE.Vector3(0, 0, -260)), rot: new THREE.Euler(0, 0, 0), scale: 0.001, a: 0, tint: WHITE.clone(), emissive: 0}));
  const restack = over(t, T.restack.start, T.restack.end); // 0 → 1 as the sheets fly back
  const slabOf = (si: number) => sheetOf.indexOf(si);
  for (const s of SLABS) {
    const li = T.lift.start + s.i * T.lift.stagger; // the slab lifts
    const lift = over(t, li, li + 0.55, easeOut); // the separation
    const paper = over(t, li + 0.25, li + T.lift.perSlab); // tips flat into a sheet
    const fly = over(t, li + 0.5, Math.max(T.grid.settle, li + 1.1)); // to its grid slot
    const sep = s.i * 2.6 + 6; // the lifted gap
    const y = s.y + lift * sep * (1 - restack);
    const a = (1 - paper) * (1 - restack) + restack; // the building fades to paper and back
    slabs.push({y, a: Math.min(1, a)});
    const si = sheetOf[s.i];
    const st = sheetStates[si];
    // the sheet: flat on the slab, then upright, then into the grid; the reverse on the restack
    const flatPos = new THREE.Vector3(s.x, y + SLAB + 0.3, s.z);
    const slot = slotPos(slotOf[si]);
    const p = Math.max(paper, 0) * (1 - restack);
    const f = fly * (1 - restack);
    st.pos = lerpV(flatPos, slot, f);
    st.rot = new THREE.Euler(lerp(-Math.PI / 2, 0, p), 0, 0);
    st.scale = lerp(Math.max(s.w / SHEET_W, 0.6), 1, f);
    st.a = p;
    st.emissive = 0;
  }
  // the eight sheets not born of a slab fan in from behind during the grid, and leave on the restack
  sheets.forEach((_, si) => {
    if (slabOf(si) >= 0) return;
    const st = sheetStates[si];
    const u = over(t, 4.3 + (si % 8) * 0.14, T.grid.settle) * (1 - restack);
    const slot = slotPos(slotOf[si]);
    st.pos = lerpV(slot.clone().add(new THREE.Vector3((si % 2 ? 1 : -1) * 40, -30, -140)), slot, u);
    st.rot = new THREE.Euler(0, 0, lerp((si % 2 ? 1 : -1) * 0.6, 0, u));
    st.scale = lerp(0.3, 1, u);
    st.a = u;
  });
  // the six plates: L-103 lights at its own floor and copies rise to 9, 12, 15, 18, 21F
  const lc = sheets.findIndex((s) => s.id === 'L-103');
  const plates: SheetState[] = [];
  if (t >= T.plates.start - 0.2 && lc >= 0) {
    const base = SLABS.find((s) => s.floor === '6')!;
    const dark = over(t, T.bill.dark, T.bill.dark + 0.5);
    const light = over(t, T.plates.start, T.plates.start + 0.4);
    const lcState = sheetStates[lc];
    lcState.a = Math.max(lcState.a, light);
    lcState.tint = WHITE.clone().lerp(COBALT_LT, light);
    lcState.emissive = light;
    const tray = (base.w + 7) / SHEET_W; // wider than the floor, so the lit plate shows as a tray through the facade
    lcState.pos = new THREE.Vector3(base.x, base.y + SLAB + 0.6, base.z);
    lcState.rot = new THREE.Euler(-Math.PI / 2, 0, 0);
    lcState.scale = lerp(base.w / SHEET_W, tray, light);
    ['9', '12', '15', '18', '21'].forEach((fl, k) => {
      const at = T.plates.start + (k + 1) * T.plates.step;
      const u = over(t, at, at + 0.35, easeOut);
      if (u <= 0) return;
      const y = lerp(base.y, floorY(fl), u) + SLAB + 0.6;
      plates.push({pos: new THREE.Vector3(base.x, y, base.z), rot: new THREE.Euler(-Math.PI / 2, 0, 0), scale: tray, a: u * (1 - 0.92 * dark), tint: COBALT_LT.clone(), emissive: 1 - dark});
    });
  }
  return {slabs, sheetStates, plates};
}

// ---------------------------------------------------------------- the scene
const CameraRig: React.FC<{t: number}> = ({t}) => {
  const {camera: cam, size} = useThree();
  const c = camera(t);
  const pc = cam as THREE.PerspectiveCamera;
  pc.position.copy(c.pos);
  pc.lookAt(c.look);
  pc.fov = c.fov;
  pc.aspect = size.width / size.height;
  pc.near = 0.5;
  pc.far = 600;
  pc.updateProjectionMatrix();
  return null;
};

const Floor: React.FC<{s: Slab; st: SlabState; winF: THREE.Texture; winS: THREE.Texture}> = ({s, st, winF, winS}) => {
  const glassH = s.kind === 'roof' ? 0 : s.h - SLAB;
  const inset = 0.5;
  const mats = useMemo(() => {
    const f = new THREE.MeshBasicMaterial({map: winF, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false});
    const sd = new THREE.MeshBasicMaterial({map: winS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false});
    const none = new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false});
    return [sd, sd, none, none, f, f];
  }, [winF, winS]);
  mats.forEach((m) => {
    m.opacity = st.a * (m === mats[2] ? 0 : 0.95);
  });
  return (
    <group position={[s.x, st.y, s.z]}>
      {/* the slab */}
      <mesh position={[0, SLAB / 2, 0]}>
        <boxGeometry args={[s.w, SLAB, s.d]} />
        <meshStandardMaterial color="#a9b0b8" roughness={0.85} metalness={0.05} transparent opacity={st.a} />
      </mesh>
      {/* the slab's lit edge (a blue-hour rim) */}
      <mesh position={[0, SLAB / 2, 0]}>
        <boxGeometry args={[s.w + 0.08, SLAB * 0.5, s.d + 0.08]} />
        <meshBasicMaterial color="#8fb3ff" transparent opacity={0.22 * st.a} depthWrite={false} toneMapped={false} />
      </mesh>
      {glassH > 0 ? (
        <>
          {/* the glass */}
          <mesh position={[0, SLAB + glassH / 2, 0]}>
            <boxGeometry args={[s.w - inset * 2, glassH, s.d - inset * 2]} />
            <meshPhysicalMaterial color="#5f8fd6" roughness={0.12} metalness={0.3} transparent opacity={0.42 * st.a} depthWrite={false} />
          </mesh>
          {/* the warm windows */}
          <mesh position={[0, SLAB + glassH / 2, 0]} material={mats}>
            <boxGeometry args={[s.w - inset * 2 - 0.1, glassH * 0.72, s.d - inset * 2 - 0.1]} />
          </mesh>
          {/* a dark core so the windows read against something */}
          <mesh position={[0, SLAB + glassH / 2, 0]}>
            <boxGeometry args={[s.w - inset * 2 - 1.6, glassH - 0.2, s.d - inset * 2 - 1.6]} />
            <meshStandardMaterial color="#0d1424" roughness={0.9} transparent opacity={0.9 * st.a} />
          </mesh>
        </>
      ) : null}
    </group>
  );
};

/** The podium deck's garden (L-102) and the roof garden (L-104): planters, lawn, trees; they ride their slab. */
const Garden: React.FC<{y: number; a: number; kind: 'deck' | 'roof'}> = ({y, a, kind}) => {
  const items = useMemo(() => {
    const out: {x: number; z: number; r: number; h: number}[] = [];
    let s = kind === 'deck' ? 7 : 11;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    if (kind === 'deck') {
      // trees along the deck's free edges, outside the tower footprint
      for (let k = 0; k < 9; k++) out.push({x: -POD.w / 2 + 3 + k * 4.7, z: POD.d / 2 - 3.2, r: 1.6 + rnd() * 0.6, h: 2.2 + rnd()});
      for (let k = 0; k < 4; k++) out.push({x: POD.w / 2 - 3.5, z: -POD.d / 2 + 4 + k * 4.6, r: 1.5 + rnd() * 0.6, h: 2.2 + rnd()});
    } else {
      for (let k = 0; k < 4; k++) out.push({x: TWR.x - TWR.w / 2 + 4 + k * 5, z: TWR.z - TWR.d / 2 + 3.5, r: 1.2 + rnd() * 0.4, h: 1.6 + rnd() * 0.6});
    }
    return out;
  }, [kind]);
  const base = kind === 'deck' ? {x: 0, z: 0, w: POD.w, d: POD.d} : {x: TWR.x, z: TWR.z, w: TWR.w, d: TWR.d};
  return (
    <group position={[0, y + SLAB, 0]}>
      {/* the lawn and planter beds */}
      <mesh position={[base.x + (kind === 'deck' ? 6 : 0), 0.08, base.z + (kind === 'deck' ? 8 : 2)]}>
        <boxGeometry args={[kind === 'deck' ? 16 : 12, 0.16, kind === 'deck' ? 7 : 6]} />
        <meshStandardMaterial color="#2f6b3a" roughness={0.95} transparent opacity={a} />
      </mesh>
      <mesh position={[base.x - base.w / 2 + 1.2, 0.35, base.z]}>
        <boxGeometry args={[1.6, 0.7, base.d - 2]} />
        <meshStandardMaterial color="#6a6f78" roughness={0.9} transparent opacity={a} />
      </mesh>
      <mesh position={[base.x - base.w / 2 + 1.2, 0.74, base.z]}>
        <boxGeometry args={[1.3, 0.1, base.d - 2.3]} />
        <meshStandardMaterial color="#3a7d44" roughness={0.95} transparent opacity={a} />
      </mesh>
      {/* the parapet */}
      <mesh position={[base.x, 0.55, base.z + base.d / 2 - 0.15]}>
        <boxGeometry args={[base.w, 1.1, 0.3]} />
        <meshPhysicalMaterial color="#7fa6e0" roughness={0.15} transparent opacity={0.5 * a} depthWrite={false} />
      </mesh>
      {items.map((it, k) => (
        <group key={k} position={[it.x, 0, it.z]}>
          <mesh position={[0, it.h / 2, 0]}>
            <cylinderGeometry args={[0.12, 0.16, it.h, 6]} />
            <meshStandardMaterial color="#4a3b2a" roughness={1} transparent opacity={a} />
          </mesh>
          <mesh position={[0, it.h + it.r * 0.7, 0]} scale={[1, 0.8, 1]}>
            <sphereGeometry args={[it.r, 12, 10]} />
            <meshStandardMaterial color="#2f6d3c" roughness={0.95} transparent opacity={a} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

const SheetMesh: React.FC<{st: SheetState; tex: THREE.Texture}> = ({st, tex}) => {
  if (st.a <= 0.001) return null;
  return (
    <group position={st.pos} rotation={st.rot} scale={st.scale}>
      <mesh>
        <planeGeometry args={[SHEET_W, SHEET_H]} />
        <meshBasicMaterial map={tex} color={st.tint} transparent opacity={st.a} side={THREE.DoubleSide} toneMapped={false} depthWrite={st.a > 0.5} />
      </mesh>
      {st.emissive > 0 ? (
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[SHEET_W * 1.02, SHEET_H * 1.04]} />
          <meshBasicMaterial color={COBALT} transparent opacity={0.55 * st.emissive * st.a} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
};

const Scene: React.FC<{t: number; sheets: TowerSheet[]; tex: THREE.Texture[]}> = ({t, sheets, tex}) => {
  const wins = useMemo(() => SLABS.map((s) => [windowTexture(s.kind === 'podium' ? 14 : 8, s.i + 1), windowTexture(s.kind === 'podium' ? 9 : 6, s.i + 40)] as const), []);
  const {slabs, sheetStates, plates} = stateAt(t, sheets);
  const lc = sheets.findIndex((s) => s.id === 'L-103');
  const deck = slabs[3]; // the 4F slab carries the podium garden
  const roof = slabs[SLABS.length - 1];
  const glow = over(t, T.plates.start, T.plates.start + 0.4) * (1 - 0.6 * over(t, T.bill.dark, T.bill.dark + 0.5));
  return (
    <>
      <CameraRig t={t} />
      <fog attach="fog" args={['#0a1024', 90, 320]} />
      <hemisphereLight args={['#3a5aa8', '#06080f', 2.4]} />
      <directionalLight position={[70, 50, 90]} intensity={2.6} color="#ffb476" />
      <directionalLight position={[-60, 30, -40]} intensity={1.0} color="#4a6cff" />
      {glow > 0 ? <pointLight position={[TWR.x, floorY('12'), TWR.z]} intensity={260 * glow} color="#2457ff" distance={46} decay={2} /> : null}
      {/* the ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color="#0c111c" roughness={0.95} />
      </mesh>
      {/* the street: a faint warm wash at the base */}
      <pointLight position={[30, 3, 40]} intensity={900} color="#ffb070" distance={120} decay={2} />
      {SLABS.map((s) => (
        <Floor key={s.i} s={s} st={slabs[s.i]} winF={wins[s.i][0]} winS={wins[s.i][1]} />
      ))}
      <Garden y={deck.y + POD.floorH - SLAB} a={deck.a} kind="deck" />
      <Garden y={roof.y} a={roof.a} kind="roof" />
      {sheetStates.map((st, si) => (si === lc ? null : <SheetMesh key={sheets[si].id} st={st} tex={tex[si]} />))}
      {/* L-103 last, so its cobalt reads through the glass */}
      {lc >= 0 ? <SheetMesh st={sheetStates[lc]} tex={tex[lc]} /> : null}
      {plates.map((p, k) => (
        <SheetMesh key={`plate-${k}`} st={p} tex={tex[lc]} />
      ))}
    </>
  );
};

export const Tower3D: React.FC<Tower3DProps> = ({sheets}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = frame / fps;
  const urls = useMemo(() => sheets.map((s) => staticFile(s.png)), [sheets]);
  const tex = useSheetTextures(urls);
  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg, #05070f 0%, #0a1024 55%, #1b2a55 100%)'}}>
      {/* the last light on the horizon */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 62% 96%, rgba(255,150,80,0.22) 0%, rgba(255,120,60,0) 40%)'}} />
      {tex ? (
        <ThreeCanvas width={width} height={height} gl={{alpha: true, antialias: true}} style={{background: 'transparent'}} camera={{fov: 45, near: 0.5, far: 600, position: [34, 2.5, 66]}}>
          <Scene t={t} sheets={sheets} tex={tex} />
        </ThreeCanvas>
      ) : null}
      {/* a soft vignette and a hint of grain-free haze */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};
