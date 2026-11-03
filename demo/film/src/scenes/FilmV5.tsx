import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {B, BIG, CAP, CLOSE_AT, END, LIVE, LOGO_AT, PART2_AT, PUSH, SEGMENTS, V2, captions} from './film-v2-cues.js';
import {FIRST, FOOT, HEDGE, L1, PAL, PT, ROW, SEVEN, SHAFT, T8, WorldV5, corridorAt, countedAt, drawerAt, firstBorderAt, hedgeGrow, personAt, personWorld, pieceEnds, pieceHeight, pitShrink, plantersOut, planterSlide, plateAt, projectAt, riseAt, sevenAt} from './WorldV5';
import type {WorldSheet} from './WorldV5';
import {LOOKS} from './v5-look';
import type {Look, LookSpec} from './v5-look';
import t08 from './t08.json';
import sam from './sam-v11.json';
import l6 from './l6-border.json';

/**
 * Film v5: Film v2 as approved (story, timing, cards, captions, the mix, the opening and Part 2 unchanged) in one of four
 * looks (`look`: v5-look.ts) over WorldV5's real materials. Cards and captions follow the look; nothing to read is under
 * 34 px; no timecode in a render (the prop stays for notes).
 *
 * Film v2 (demo/SCRIPT-V11.md as built in animatic v11, with Eric's footage and the final look). Eric opens on his own
 * footage and voice; the push continues digitally into his upper monitor (the screen shot's last frame, perspective-
 * corrected so the drawn border of L-6 lands exactly on the 3D sheet), holds 0.3 s and pulls back into the world
 * (WorldV2). Every card is one style (ink panel, a status dot, Inter); a fix is worded as the fix Landsight asks for.
 * Captions are one line at a time, phrase by phrase. Part 2 is the /try capture full-bleed, its holds cut. The end at dusk.
 * `proxy` reads the 1080p proxies (the review cut); `timecode` stamps the frame for notes; `sound` plays the mix
 * (public/v2/audio/mix.wav from scripts/audio-v2.py: Eric's voice, the narration, the music, the effects).
 */
export type FilmV5Props = {sheets?: WorldSheet[]; proxy?: boolean; timecode?: boolean; sound?: boolean; look?: Look};
/** The look's cards (one look per render). */
let U: LookSpec['ui'] = LOOKS.ink.ui;
const INK = '#1D2026';
const onLight = () => U.text === INK;
const line = (a: number) => (onLight() ? `rgba(29,32,38,${a * 0.8})` : `rgba(255,255,255,${a})`);
const dotColour = (d: string) => ({red: C.red, amber: C.amber, blue: U.accent, cobalt: U.accent, green: C.greenLt, none: 'transparent'})[d] ?? d;
const dotGlow = (d: string) => (U.dotGlow && d !== 'none' ? `0 0 14px ${dotColour(d)}` : undefined);
/** A solid cobalt for buttons and masks (the blueprint's accent is white). */
const solid = () => (U.accent === '#FFFFFF' ? '#2F5FE8' : U.accent);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const win = (t: number, a: number, b: number, f = 0.3) => Math.min(ov(t, a, a + f), 1 - ov(t, b - f, b));
const CAPS = captions();
const NUM = {fontVariantNumeric: 'tabular-nums' as const};
const L1_PNG = 'v2/sheets/L-1.png';
const SAM_PNG = 'v2/sheets/F-26-p1.png';

/** The one card: an ink panel, a status dot, a title, an optional line under it. */
const Card: React.FC<{dot: string; title: string; sub?: string; a: number; x?: number; y?: number; w?: number; size?: number; inline?: boolean}> = ({dot, title, sub, a, x = 64, y = 64, w, size = 50, inline = false}) =>
  a <= 0.002 ? null : (
    <div style={{position: inline ? 'relative' : 'absolute', left: inline ? undefined : x, top: inline ? undefined : y, width: w, boxSizing: 'border-box', opacity: a, transform: `translateY(${(1 - a) * 10}px)`, borderRadius: 20, background: U.panel, backdropFilter: U.blur, border: U.border, padding: `${Math.round(size * 0.34)}px ${Math.round(size * 0.52)}px`, color: U.text, fontFamily: FONT.sans, boxShadow: U.shadow, whiteSpace: 'nowrap', ...NUM}}>
      <div style={{display: 'flex', alignItems: 'center', gap: Math.round(size * 0.32)}}>
        <div style={{width: Math.round(size * 0.32), height: Math.round(size * 0.32), borderRadius: '50%', background: dotColour(dot), boxShadow: dotGlow(dot), flex: 'none'}} />
        <div style={{fontSize: size, fontWeight: 600, letterSpacing: -0.02 * size, lineHeight: 1.15}}>{title}</div>
      </div>
      {sub ? <div style={{marginTop: Math.round(size * 0.14), marginLeft: Math.round(size * 0.64), fontSize: Math.max(34, Math.round(size * 0.6)), fontWeight: 400, opacity: U.sub, lineHeight: 1.3}}>{sub}</div> : null}
    </div>
  );
/** A label in the scene: the same card, small, anchored on a point. */
const Tag: React.FC<{x: number; y: number; text: string; dot?: string; size?: number; a?: number; anchor?: string}> = ({x, y, text, dot = 'none', size: size0 = 32, a = 1, anchor = 'translate(-50%, -50%)'}) => {
  const size = Math.max(34, size0);
  return a <= 0.002 ? null : (
    <div style={{position: 'absolute', left: x, top: y, transform: anchor, opacity: a, display: 'flex', alignItems: 'center', gap: Math.round(size * 0.3), fontFamily: FONT.sans, fontSize: size, fontWeight: 600, color: U.text, background: U.panel, backdropFilter: U.blur, border: U.border, boxShadow: U.shadow, padding: `${Math.round(size * 0.22)}px ${Math.round(size * 0.45)}px`, borderRadius: 999, whiteSpace: 'nowrap', ...NUM}}>
      {dot !== 'none' ? <div style={{width: Math.round(size * 0.32), height: Math.round(size * 0.32), borderRadius: '50%', background: dotColour(dot), boxShadow: dotGlow(dot)}} /> : null}
      {text}
    </div>
  );
};
const Check: React.FC<{x: number; y: number; a: number; r?: number}> = ({x, y, a, r = 36}) =>
  a <= 0.002 ? null : (
    <svg width={2 * r} height={2 * r} style={{position: 'absolute', left: x - r, top: y - r, opacity: a, transform: `scale(${0.7 + 0.3 * a})`}}>
      <circle cx={r} cy={r} r={r - 2} fill={C.green} stroke="#fff" strokeWidth={3} />
      <path d={`M${r * 0.52} ${r * 1.02} l${r * 0.32} ${r * 0.32} l${r * 0.62} ${r * -0.66}`} stroke="#fff" strokeWidth={r * 0.18} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
const Leader: React.FC<{from: [number, number]; to: {x: number; y: number; visible: boolean}; a: number}> = ({from, to, a}) =>
  to.visible && a > 0.002 ? (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: a}}>
      <line x1={from[0]} y1={from[1]} x2={to.x} y2={to.y} stroke={U.leader} strokeOpacity={0.8} strokeWidth={3} strokeDasharray="10 8" />
      <circle cx={to.x} cy={to.y} r={10} fill={onLight() ? '#fff' : U.accent} stroke={U.leader} strokeWidth={4} />
    </svg>
  ) : null;
const TypeCard: React.FC<{text: string; a: number}> = ({text, a}) => (
  <AbsoluteFill style={{background: U.typeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: a}}>
    <div style={{fontFamily: FONT.sans, fontSize: 140, fontWeight: 700, letterSpacing: -4, color: U.typeText, textAlign: 'center'}}>{text}</div>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- the opening: Eric's footage and the push
/** Solves the 2D homography mapping four points onto four (TL, TR, BR, BL), as a CSS matrix3d. */
function homography(src: number[][], dst: number[][]): string {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  const [a, bb, c, d, e, f, g, hh] = h;
  return `matrix3d(${a},${d},0,${g},${bb},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
}
const area = (q: number[][]) => Math.abs(q.reduce((s, p, i) => s + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0)) / 2;
/** Where L-6's drawn border lands on screen when the push lands (the 3D sheet under the camera). */
const LAND_QUAD = firstBorderAt(B.land, l6.border, l6.h / l6.w).map((p) => {
  const q = projectAt(B.land, p);
  return [q.x, q.y];
});
const SRC = PUSH.quad;
const HALF = SRC.map(([x, y]) => [x * (1920 / PUSH.size[0]), y * (1080 / PUSH.size[1])]);
const ZOOM = Math.sqrt(area(LAND_QUAD) / area(HALF));
function pushMatrix(t: number): string {
  const e = ov(t, PUSH.warp[0], PUSH.warp[1]);
  const v = (Math.pow(ZOOM, e) - 1) / (ZOOM - 1);
  return homography(SRC, HALF.map((p, i) => [lerp(p[0], LAND_QUAD[i][0], v), lerp(p[1], LAND_QUAD[i][1], v)]));
}
const Opening: React.FC<{t: number; fps: number; proxy: boolean}> = ({t, fps, proxy}) => {
  if (t >= B.land + 0.1) return null;
  const pushing = t >= PUSH.warp[0];
  const fade = 1 - ov(t, PUSH.fade[0], PUSH.fade[1]);
  const xf = pushing ? pushMatrix(t) : undefined;
  const big = {position: 'absolute' as const, left: 0, top: 0, width: PUSH.size[0], height: PUSH.size[1], transformOrigin: '0 0', transform: xf};
  // the margins outside the drawn border turn to paper as the push lands, so the hand-over to the 3D sheet is clean
  const pm = ov(t, B.land - 0.35, B.land - 0.08);
  const [tl, , br] = LAND_QUAD;
  return (
    <AbsoluteFill style={{opacity: fade, background: '#000'}}>
      {LIVE.map((s, k) => (
        <Sequence key={k} from={Math.round(s.start * fps)} durationInFrames={Math.round(s.end * fps) - Math.round(s.start * fps)} layout="none" name={`live ${k + 1} · ${s.clip}`}>
          <OffthreadVideo src={staticFile(`v2/live/${s.clip}${proxy ? '-1080' : ''}.mp4`)} startFrom={Math.round((s.from / s.rate) * fps)} playbackRate={s.rate} muted style={pushing && s.clip === 'A' ? big : {position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
        </Sequence>
      ))}
      {t >= PUSH.still ? <Img src={staticFile('v2/live/A-last.png')} style={big} /> : null}
      {pm > 0 ? (
        <>
          <div style={{position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(0, tl[1]), background: U.plan === 'blueprint' ? U.planBg : '#ffffff', opacity: pm}} />
          <div style={{position: 'absolute', left: 0, top: br[1], right: 0, bottom: 0, background: U.plan === 'blueprint' ? U.planBg : '#ffffff', opacity: pm}} />
          <div style={{position: 'absolute', left: 0, top: tl[1], width: Math.max(0, tl[0]), height: br[1] - tl[1], background: U.plan === 'blueprint' ? U.planBg : '#ffffff', opacity: pm}} />
          <div style={{position: 'absolute', left: br[0], top: tl[1], right: 0, height: br[1] - tl[1], background: U.plan === 'blueprint' ? U.planBg : '#ffffff', opacity: pm}} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Part 1 overlays
const Panel: React.FC<{style: React.CSSProperties; children: React.ReactNode}> = ({style, children}) => (
  <div style={{position: 'absolute', boxSizing: 'border-box', borderRadius: 20, background: U.panel, backdropFilter: U.blur, border: U.border, boxShadow: U.shadow, color: U.text, fontFamily: FONT.sans, ...NUM, ...style}}>{children}</div>
);

/** The roof planter, cut away: soil 0.3 m against the dashed 0.4 m line, a ruler, roots; the soil rises to 0.4 m. Real
 * materials as in the world: concrete walls and slab, dark soil, timber decking, leafy planting. */
const RoofCut: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 28.2, 31.9, 0.4);
  if (a <= 0) return null;
  const fix = ov(t, 30.0, 30.8);
  const PX = 760;
  const base = 520;
  const depth = lerp(0.3, 0.4, fix);
  const top = base - depth * PX;
  const line = base - 0.4 * PX;
  const ok = fix > 0.95;
  const F = FONT.sans;
  const T = (f: string, s: number) => (
    <pattern id={`rc-${f}`} patternUnits="userSpaceOnUse" width={s} height={s}>
      <image href={staticFile(`v5/textures/${f}`)} width={s} height={s} preserveAspectRatio="none" />
    </pattern>
  );
  return (
    <Panel style={{right: 50, top: 340, width: 1000, height: 600, opacity: a, overflow: 'hidden'}}>
      <svg width={1000} height={600} viewBox="0 0 1040 624">
        <defs>
          {T('concrete_floor_02_diff_2k.jpg', 360)}
          {T('farm_soil_diff_1k.jpg', 300)}
          {T('wood_floor_deck_diff_1k.jpg', 240)}
          {T('leafy_grass_diff_1k.jpg', 160)}
          <linearGradient id="rc-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <circle cx={52} cy={50} r={10} fill={U.accent} />
        <text x={76} y={62} fill={U.text} fontFamily={F} fontSize={38} fontWeight={600}>Roof planter, cut away · L-104</text>
        <line x1={110} y1={base} x2={110} y2={base - 0.5 * PX} stroke={U.text} strokeOpacity={0.8} strokeWidth={3} />
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((m) => (
          <g key={m}>
            <line x1={94} y1={base - m * PX} x2={126} y2={base - m * PX} stroke={U.text} strokeOpacity={0.8} strokeWidth={3} />
            <text x={82} y={base - m * PX + 11} fill={U.text} fillOpacity={0.8} fontFamily={F} fontSize={32} textAnchor="end">{m.toFixed(1)}</text>
          </g>
        ))}
        <rect x={130} y={base} width={660} height={30} fill="url(#rc-concrete_floor_02_diff_2k.jpg)" />
        <rect x={130} y={base - 14} width={30} height={14} fill="url(#rc-wood_floor_deck_diff_1k.jpg)" />
        <rect x={760} y={base - 14} width={30} height={14} fill="url(#rc-wood_floor_deck_diff_1k.jpg)" />
        <rect x={160} y={base - 0.5 * PX} width={26} height={0.5 * PX} fill="url(#rc-concrete_floor_02_diff_2k.jpg)" />
        <rect x={734} y={base - 0.5 * PX} width={26} height={0.5 * PX} fill="url(#rc-concrete_floor_02_diff_2k.jpg)" />
        <rect x={186} y={top} width={548} height={base - top} fill="url(#rc-farm_soil_diff_1k.jpg)" />
        <rect x={186} y={top} width={548} height={base - top} fill="#1b130c" fillOpacity={0.45} />
        <rect x={186} y={top} width={548} height={base - top} fill="url(#rc-shade)" />
        {[240, 360, 480, 600, 690].map((x, k) => (
          <g key={x} stroke="#2a1c10" strokeWidth={4} fill="none" strokeOpacity={0.9}>
            <path d={`M${x} ${top} q ${k % 2 ? 18 : -18} ${(base - top) * 0.45} ${k % 2 ? -6 : 8} ${(base - top) * 0.85}`} />
            <path d={`M${x} ${top} q ${k % 2 ? -26 : 26} ${(base - top) * 0.35} ${k % 2 ? -34 : 30} ${(base - top) * 0.6}`} />
          </g>
        ))}
        {[230, 330, 430, 530, 630, 700].map((x, k) => (
          <g key={x}>
            <circle cx={x} cy={top - 38} r={44} fill="url(#rc-leafy_grass_diff_1k.jpg)" />
            <circle cx={x} cy={top - 38} r={44} fill={k % 2 ? '#2d6a1f' : '#3a7a28'} fillOpacity={0.62} />
            <circle cx={x + 30} cy={top - 22} r={30} fill="url(#rc-leafy_grass_diff_1k.jpg)" />
            <circle cx={x + 30} cy={top - 22} r={30} fill="#4a8a30" fillOpacity={0.55} />
          </g>
        ))}
        <line x1={140} y1={line} x2={800} y2={line} stroke={U.accent} strokeWidth={5} strokeDasharray="16 12" />
        <text x={812} y={line + 13} fill={U.accent} fontFamily={F} fontSize={36} fontWeight={700}>0.4 m min.</text>
        <line x1={800} y1={base} x2={800} y2={top} stroke={ok ? C.greenLt : U.text} strokeWidth={5} />
        <line x1={786} y1={top} x2={814} y2={top} stroke={ok ? C.greenLt : U.text} strokeWidth={5} />
        <text x={826} y={(base + top) / 2 + 26} fill={ok ? C.greenLt : U.text} fontFamily={F} fontSize={58} fontWeight={700}>{`${depth.toFixed(1)} m`}</text>
        <circle cx={52} cy={594} r={9} fill={ok ? C.greenLt : U.accent} />
        <text x={74} y={606} fill={U.text} opacity={0.9} fontFamily={F} fontSize={36}>{ok ? 'Fix: raise the soil to 0.4 m · 35 m² counts again' : 'soil 0.3 m · the shrubs are not counted (T02)'}</text>
      </svg>
    </Panel>
  );
};

/** The greenery meter (local building code) in the right third: 261.1 → 209.9 as the tree shrinks, → 299.5 with the seven trees. */
const Meter: React.FC<{t: number}> = ({t}) => {
  const P = V2.pit;
  const a = win(t, P.meter, 86.9, 0.4);
  if (a <= 0) return null;
  const down = ov(t, P.shrink[0], P.shrink[1]);
  const up = ov(t, P.seven, P.pass);
  const v = lerp(lerp(261.1, 209.9, down), 299.5, up);
  const pass = v >= 297;
  const W = 700;
  const px = (n: number) => (n / 330) * W;
  return (
    <Panel style={{right: 50, top: 250, width: W + 64, padding: '24px 32px', opacity: a}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
        <div style={{width: 14, height: 14, borderRadius: 7, background: pass ? C.greenLt : C.red}} />
        <div style={{fontSize: 38, fontWeight: 600}}>Greenery</div>
      </div>
      <div style={{fontSize: 34, opacity: U.sub, marginTop: 4, marginLeft: 28}}>kgCO₂e / yr · local building code (E14)</div>
      <div style={{position: 'relative', height: 44, marginTop: 72, background: line(0.12), borderRadius: 10}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: px(v), background: pass ? C.greenLt : U.accent, borderRadius: 10, boxShadow: U.dotGlow ? `0 0 18px ${pass ? C.greenLt : U.accent}` : undefined}} />
        <div style={{position: 'absolute', left: px(297) - 2, top: -14, bottom: -14, width: 4, background: U.text}} />
        <div style={{position: 'absolute', left: px(297) - 300, top: -58, width: 292, textAlign: 'right', fontSize: 34, opacity: 0.85}}>required 297</div>
      </div>
      <div style={{marginTop: 22, fontSize: 56, fontWeight: 700}}>{v.toFixed(1)}</div>
      <div style={{fontSize: 34, marginTop: 2, fontWeight: 500, opacity: 0.9}}>{pass ? 'Fix: +7 trees · passes' : down > 0.5 ? 'short · each big tree counts as small' : 'provided'}</div>
    </Panel>
  );
};

/** The coloured plan (a raster page, no CAD): SAM 3.1's real masks fill one by one; the list in the right third. */
const SAM_PLAN = (() => {
  const [x0, y0, x1, y1] = sam.crop;
  const k = 1180 / (x1 - x0);
  return {x0, y0, k, left: 48, top: 60, w: 1180, h: (y1 - y0) * k};
})();
const COLS = {swatch: 40, what: 210, sam: 108, dwg: 112, diff: 144};
const Raster: React.FC<{t: number}> = ({t}) => {
  const a = win(t, B.raster, B.bills, 0.45);
  if (a <= 0) return null;
  const S = SAM_PLAN;
  const rowAt = (k: number) => B.raster + 0.7 + k * 1.45;
  const fmt = (r: (typeof sam.rows)[number], v: number) => (r.kind === 'symbols' ? String(Math.round(v)) : v.toFixed(1));
  const cell = (w: number, extra: React.CSSProperties = {}): React.CSSProperties => ({width: w, flex: 'none', boxSizing: 'border-box', ...extra});
  return (
    <AbsoluteFill style={{opacity: a, background: U.rasterBg, color: U.text, fontFamily: FONT.sans, ...NUM}}>
      <div style={{position: 'absolute', left: S.left, top: S.top, width: S.w, height: S.h, overflow: 'hidden', borderRadius: 14, background: '#ffffff', border: `1.5px solid ${line(0.2)}`}}>
        <Img src={staticFile(SAM_PNG)} style={{position: 'absolute', left: -S.x0 * S.k, top: -S.y0 * S.k, width: sam.w * S.k, height: sam.h * S.k, filter: 'url(#v5-neutral)'}} />
        <svg width={S.w} height={S.h} style={{position: 'absolute', inset: 0}}>
          {sam.rows.map((r, k) => {
            const at = rowAt(k);
            const draw = ov(t, at, at + 0.6);
            const fill = ov(t, at + 0.45, at + 0.9);
            if (draw <= 0) return null;
            return (
              <g key={r.what}>
                {r.polys.map((ring, j) => (
                  <path key={j} d={'M' + ring.map(([x, y]) => `${((x - S.x0) * S.k).toFixed(1)} ${((y - S.y0) * S.k).toFixed(1)}`).join('L') + 'Z'} pathLength={1} fill={solid()} fillOpacity={0.3 * fill} stroke={solid()} strokeWidth={3.5} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{position: 'absolute', left: S.left, top: S.top + S.h + 18, fontSize: 24, color: U.text, opacity: 0.6}}>Presentation Plan (Colour).pdf · a raster page, no CAD</div>
      {/* the list: one row per colour, in columns */}
      <div style={{position: 'absolute', left: 1268, top: 72, width: 614, color: U.text}}>
        <div style={{fontSize: 24, opacity: 0.66, marginBottom: 26}}>Colour words read from the legend by Muse Spark</div>
        <div style={{display: 'flex', alignItems: 'flex-end', fontSize: 22, fontWeight: 600, letterSpacing: 0.4, opacity: 0.6, paddingBottom: 12, borderBottom: `1px solid ${line(0.22)}`}}>
          <div style={cell(COLS.swatch + COLS.what)}>What</div>
          <div style={cell(COLS.sam, {textAlign: 'right'})}>SAM 3.1</div>
          <div style={cell(COLS.dwg, {textAlign: 'right'})}>Drawings</div>
          <div style={cell(COLS.diff, {textAlign: 'right'})}>Diff.</div>
        </div>
        {sam.rows.map((r, k) => {
          const ra = ov(t, rowAt(k) + 0.3, rowAt(k) + 0.8);
          const big = Math.abs(r.diff_pct) >= 10;
          return (
            <div key={r.what} style={{display: 'flex', alignItems: 'center', height: 128, borderBottom: `1px solid ${line(0.12)}`, opacity: ra}}>
              <div style={cell(COLS.swatch)}>
                <div style={{width: 30, height: 30, borderRadius: 6, background: r.plan_colour, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)'}} />
              </div>
              <div style={cell(COLS.what, {whiteSpace: 'nowrap'})}>
                <div style={{fontSize: 28, fontWeight: 600, lineHeight: 1.1}}>{r.what}</div>
                <div style={{fontSize: 20, opacity: 0.6, marginTop: 6}}>{`“${r.prompt}” · ${r.kind === 'symbols' ? 'count' : 'm²'}`}</div>
              </div>
              <div style={cell(COLS.sam, {textAlign: 'right', fontSize: 32, fontWeight: 700, color: U.accent})}>{fmt(r, r.sam * ov(t, rowAt(k) + 0.3, rowAt(k) + 1.0))}</div>
              <div style={cell(COLS.dwg, {textAlign: 'right', fontSize: 32, fontWeight: 500})}>{r.kind === 'symbols' ? String(r.drawings) : Number(r.drawings).toFixed(1)}</div>
              <div style={cell(COLS.diff, {textAlign: 'right', fontSize: 28, fontWeight: 600, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8})}>
                {big ? <div style={{width: 11, height: 11, borderRadius: 6, background: C.amber}} /> : null}
                {r.diff_pct === 0 ? '0%' : `${r.diff_pct > 0 ? '+' : '−'}${Math.abs(r.diff_pct).toFixed(1)}%`}
              </div>
            </div>
          );
        })}
        <div style={{marginTop: 18, fontSize: 24, opacity: 0.66 * ov(t, rowAt(3) + 0.8, rowAt(3) + 1.2), lineHeight: 1.4}}>The fire lane differs: a tree is drawn over it.<br />Nothing counts until a person confirms.</div>
      </div>
    </AbsoluteFill>
  );
};

const Findings: React.FC<{t: number}> = ({t}) => {
  const F = V2.findings;
  const a = win(t, F.at, B.type, 0.4);
  if (a <= 0) return null;
  const group = (title: string, dot: string, items: string[], x: number, delay: number) => (
    <div style={{position: 'absolute', left: x, top: 76, width: 590}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, fontFamily: FONT.sans, fontSize: 42, fontWeight: 700, color: U.text, marginBottom: 16, opacity: ov(t, F.at + delay, F.at + delay + 0.3)}}>
        <div style={{width: 16, height: 16, borderRadius: 8, background: dotColour(dot), boxShadow: dotGlow(dot)}} />
        {title}
      </div>
      {items.map((it, i) => (
        <div key={it} style={{marginBottom: 10}}>
          <Card dot={dot} title={it} a={ov(t, F.at + delay + 0.3 + i * 0.2, F.at + delay + 0.55 + i * 0.2)} w={590} size={26} inline />
        </div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: U.bigVeil}} />
      {group('Send back', 'red', F.sendBack, 40, 0)}
      {group('Fix before pricing', 'amber', F.fix, 665, 1.1)}
      {group('Building code', 'blue', F.code, 1290, 2.0)}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 200, textAlign: 'center', opacity: ov(t, F.at + 3.0, F.at + 3.4)}}>
        <span style={{fontFamily: FONT.sans, fontSize: 64, fontWeight: 700, color: U.text, background: U.panel, backdropFilter: U.blur, padding: '14px 44px', borderRadius: 20, border: U.border, ...NUM}}>{F.total}</span>
      </div>
    </AbsoluteFill>
  );
};

/** The split frame for the tree: the plan on the left (one tree), the world on the right (twelve lines). */
const Split: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 50.1, 52.8, 0.35);
  if (a <= 0) return null;
  const k = 110;
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, width: 960, height: 1080, overflow: 'hidden', background: U.planBg, opacity: a, isolation: 'isolate'}}>
        <Img src={staticFile(L1_PNG)} style={{position: 'absolute', width: L1.w * k, height: L1.h * k, left: 480 - (T8.x - L1.x0) * k, top: 560 - (T8.z - L1.z0) * k, ...(U.plan === 'blueprint' ? {filter: 'grayscale(1) invert(1)', mixBlendMode: 'screen' as const} : {filter: 'url(#v5-neutral)'})}} />
        <div style={{position: 'absolute', left: 480 - k * (t08.radius + 0.4), top: 560 - k * (t08.radius + 0.4), width: 2 * k * (t08.radius + 0.4), height: 2 * k * (t08.radius + 0.4), borderRadius: '50%', border: `7px solid ${U.plan === 'blueprint' ? '#FFFFFF' : solid()}`, boxShadow: U.dotGlow ? `0 0 22px ${U.accent}` : undefined, boxSizing: 'border-box'}} />
      </div>
      <div style={{position: 'absolute', left: 958, top: 0, width: 4, height: 1080, background: onLight() ? '#E8EAED' : U.accent, opacity: a}} />
      <Card dot="none" title="What you see" sub="one tree" a={a} x={64} y={64} size={46} />
      <Card dot="blue" title="What a computer sees" sub="twelve loose LINEs" a={a} x={1024} y={64} size={46} />
    </>
  );
};

/** Part 2 sits in the frame full-bleed: the capture is the app at 1:1, the most legible at phone size. */
const Part2: React.FC<{fps: number; proxy: boolean}> = ({fps, proxy}) => {
  let at = PART2_AT;
  return (
    <>
      {SEGMENTS.map(([f, to], k) => {
        const from = at;
        at += to - f;
        return (
          <Sequence key={k} from={Math.round(from * fps)} durationInFrames={Math.round(at * fps) - Math.round(from * fps)} name={`capture ${k + 1}`} layout="none">
            <OffthreadVideo src={staticFile(proxy ? 'v2/try-1080.mp4' : 'v2/try.mp4')} startFrom={Math.round(f * fps)} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
          </Sequence>
        );
      })}
    </>
  );
};

const Caption: React.FC<{t: number}> = ({t}) => {
  const c = CAPS.find((x) => t >= x.start && t < x.end);
  if (!c) return null;
  const dip = 1 - ov(t, LOGO_AT - 0.35, LOGO_AT - 0.05);
  if (dip <= 0.002) return null;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 42, textAlign: 'center', opacity: dip}}>
      <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 44, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.3, color: U.capText, background: U.cap, border: U.capBorder, backdropFilter: U.blur, boxShadow: onLight() ? U.shadow : undefined, padding: '9px 24px 11px', borderRadius: 12, whiteSpace: 'nowrap', ...NUM}}>{c.text}</span>
    </div>
  );
};

export const FilmV5: React.FC<FilmV5Props> = ({sheets, proxy = false, timecode = false, sound = true, look = 'ink'}) => {
  U = LOOKS[look].ui;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const part1World = t >= B.land - 0.45 && t < B.type && !(t > B.raster + 0.5 && t < B.bills - 0.45);
  const endWorld = t >= CLOSE_AT;
  const duskU = clamp01((t - CLOSE_AT) / (LOGO_AT + END.hold - CLOSE_AT));
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      {/* the scans' cream paper, neutralised to white for the 2D plans */}
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id="v5-neutral" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1.032 0 0 0 0 0 1.041 0 0 0 0 0 1.0625 0 0 0 0 0 1 0" />
        </filter>
      </svg>
      {part1World && sheets ? <WorldV5 t={Math.max(t, B.push)} sheets={sheets} l1={L1_PNG} look={look} /> : null}
      {endWorld && sheets ? <WorldV5 t={200} sheets={sheets} l1={L1_PNG} dusk={duskU} look={look} /> : null}

      {/* the opening: Eric's footage, his voice; the push into his monitor */}
      <Opening t={t} fps={fps} proxy={proxy} />
      {sound ? <Audio src={staticFile('v2/audio/mix.wav')} /> : null}

      {/* the stack: the first sheet, then the footprint the tower lands on */}
      {t >= 15.4 && t < 17.2 ? (() => {
          const p = projectAt(t, [plateAt(t, '1')[0] + 30, 40.5, plateAt(t, '1')[2] + 14]);
          return p.visible ? <Tag x={p.x} y={p.y} text={`${FIRST} · tree pit detail`} dot="blue" size={32} a={win(t, 15.4, 17.2)} /> : null;
        })() : null}
      {t >= 19.0 && t < 21.3 ? (() => {
          const p = projectAt(t, [FOOT.podium.cx - FOOT.podium.w / 2, 0, FOOT.podium.cz + FOOT.podium.d / 2]);
          return p.visible ? <Tag x={Math.max(p.x - 30, 560)} y={Math.min(p.y, 860)} anchor="translate(-100%, -50%)" text="L-1 · the tower's footprint" dot="blue" size={34} a={win(t, 19.0, 21.3)} /> : null;
        })() : null}

      {/* the typical floor: L-103 lit; 12F, 16F, 20F found one by one */}
      {t >= 21.8 && t < 27.2
        ? ['8', ...V2.typical.floors].map((f, k) => {
            const d = drawerAt(t, f);
            if (d.out < 0.6) return null;
            const p = projectAt(t, [plateAt(t, f)[0] + 13.5, plateAt(t, f)[1], plateAt(t, f)[2] + 4]);
            return p.visible ? <Tag key={f} x={p.x} y={p.y} anchor="translate(0, -50%)" text={k === 0 ? '8F · L-103' : `${f}F`} dot={k === 0 ? 'blue' : 'green'} size={36} a={win(t, k === 0 ? 22.0 : V2.typical.lit + (k - 1) * V2.typical.step + 0.4, 27.2)} /> : null;
          })
        : null}
      {t >= 24.4 && t < 27.2 ? <Card dot="green" title="Landsight finds the other three floors" a={win(t, 24.4, 27.2)} x={64} y={780} size={44} /> : null}

      {/* the roof: the cut-away, with its leader to L-104's drawer */}
      {t >= 28.2 && t < 31.9 ? <Leader from={[950, 640]} to={projectAt(t, [plateAt(t, 'R')[0] + 6, plateAt(t, 'R')[1], plateAt(t, 'R')[2] + 3])} a={win(t, 28.4, 31.9) * 0.9} /> : null}
      <RoofCut t={t} />

      {/* the two alike sheets */}
      {t >= 33.4 && t < 35.0 ? (() => {
          const p = projectAt(t, [plateAt(t, '8')[0] + 12, plateAt(t, '8')[1] + 1, plateAt(t, '8')[2] - 6]);
          return p.visible ? <Tag x={Math.min(p.x, 1880)} y={p.y - 90} anchor="translate(-100%, -50%)" text="L-102 on L-103 · 91% the same" dot="amber" size={36} a={win(t, 33.6, 35.0)} /> : null;
        })() : null}

      {/* the lift shaft: labels, the check */}
      {t >= 35.9 && t < 39.3 ? (() => {
          const pl = plateAt(t, '5');
          const shaft = projectAt(t, [pl[0] + SHAFT.x - 0.4, pl[1], pl[2] + SHAFT.z + 1.9]);
          const plan = projectAt(t, [pl[0] + SHAFT.x + 1.55 + (4.3 - 1.55) * planterSlide(t), pl[1] + 1.6, pl[2] + SHAFT.z - 0.4]);
          return (
            <>
              {shaft.visible ? <Tag x={shaft.x - 60} y={shaft.y + 40} anchor="translate(-100%, -50%)" text="lift shaft · the car below" size={32} a={win(t, 36.0, 39.3)} /> : null}
              {plan.visible ? <Tag x={plan.x} y={plan.y - 40} text="planter B-10" size={30} a={win(t, 36.3, 39.3)} /> : null}
              {shaft.visible ? <Check x={shaft.x - 160} y={shaft.y - 70} a={ov(t, 38.5, 38.9)} /> : null}
            </>
          );
        })() : null}

      {/* the escape corridor from above: the person, the dimension, the fix */}
      {t >= 41.0 && t < 45.9 ? (() => {
          const p = projectAt(t, personWorld(t));
          const pa = personAt(t).a;
          const c = corridorAt(t);
          const ea = projectAt(t, c.a);
          const eb = projectAt(t, c.b);
          const dimA = win(t, 42.3, 45.9);
          const pOut = plantersOut(t);
          const clear = lerp(0.9, 1.5, pOut);
          const ok = pOut > 0.95;
          const col = ok ? C.green : PAL.ink;
          return (
            <>
              {p.visible ? (
                <div style={{position: 'absolute', left: p.x - 26, top: p.y - 26, opacity: pa}}>
                  <div style={{position: 'absolute', left: -16, top: 6, width: 84, height: 40, borderRadius: 20, background: '#fff', border: `5px solid ${PAL.ink}`, boxSizing: 'border-box'}} />
                  <div style={{position: 'absolute', left: 0, top: 0, width: 52, height: 52, borderRadius: 26, background: '#fff', border: `5px solid ${PAL.ink}`, boxSizing: 'border-box'}} />
                </div>
              ) : null}
              {ea.visible && eb.visible && dimA > 0 ? (
                <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: dimA}}>
                  <line x1={ea.x} y1={ea.y} x2={eb.x} y2={eb.y} stroke={col} strokeWidth={6} />
                  {[ea, eb].map((e, k) => (
                    <line key={k} x1={e.x - 20} y1={e.y} x2={e.x + 20} y2={e.y} stroke={col} strokeWidth={6} />
                  ))}
                </svg>
              ) : null}
              {ea.visible ? <Tag x={ea.x} y={Math.min(ea.y, eb.y) - 64} text={`${clear.toFixed(1)} m clear`} dot={ok ? 'green' : 'red'} size={44} a={dimA} /> : null}
              {ea.visible && pOut < 0.3 ? <Tag x={ea.x} y={Math.min(ea.y, eb.y) - 136} text="the code: 1.2 m" size={32} a={dimA} /> : null}
              {p.visible && t >= 42.5 && t < 43.4 ? <Tag x={p.x - 40} y={p.y + 150} text="stopped" dot="red" size={32} a={win(t, 42.5, 43.4, 0.15)} /> : null}
              {p.visible ? <Check x={p.x + 90} y={p.y - 70} a={ov(t, 45.0, 45.3)} /> : null}
            </>
          );
        })() : null}

      {/* the tree: the split frame, the twelve pieces numbered; the confirm */}
      <Split t={t} />
      {riseAt(t) > 0.3 && t < 52.8
        ? t08.canopy.map((seg, i) => {
            const [a, b] = pieceEnds(i);
            const p = projectAt(t, [(a[0] + b[0]) / 2, 0.06 + pieceHeight(i) * riseAt(t), (a[1] + b[1]) / 2]);
            if (!p.visible || p.x < 1000 || p.y < 260) return null;
            return <Tag key={seg.handle} x={p.x + 34} y={p.y - 20} text={String(i + 1)} size={26} a={ov(t, 50.6 + i * 0.06, 50.9 + i * 0.06)} />;
          })
        : null}
      {t >= 54.8 && t < 57.4 ? (() => {
          const p = projectAt(t, [T8.x + 2.7, 0, T8.z + 1.0]);
          const click = ov(t, 55.6, 56.0);
          return (
            <>
              <div style={{position: 'absolute', left: p.x, top: p.y, padding: '14px 28px', borderRadius: 14, background: click > 0.6 ? C.green : solid(), color: '#fff', fontFamily: FONT.sans, fontSize: 38, fontWeight: 600, boxShadow: U.shadow, opacity: win(t, 54.8, 57.4)}}>{click > 0.6 ? 'Confirmed · 8 trees' : 'Confirm — one tree'}</div>
              <div style={{position: 'absolute', left: p.x + 80 - 18, top: p.y + 36 - 18, width: 36, height: 36, borderRadius: 18, border: '5px solid #fff', background: solid(), transform: `scale(${1 + click * 2})`, opacity: t < 55.6 ? 0 : 1 - click}} />
            </>
          );
        })() : null}

      {/* the coloured plan and SAM 3.1's masks */}
      <Raster t={t} />

      {/* the bill's count: 1…8 on the row */}
      {countedAt(t) > 0
        ? ROW.slice(0, countedAt(t)).map((r, i) => {
            const p = projectAt(t, [r.x, 0, r.z]);
            return <Tag key={r.id} x={p.x} y={p.y} text={String(i + 1)} dot="blue" size={40} />;
          })
        : null}
      {t >= 67.6 && t < 68.8 ? (() => {
          const p = projectAt(t, [ROW[7].x, 0, ROW[7].z - 3.4]);
          return <Tag x={p.x} y={p.y} text="Fix: bill 12 → 8" dot="green" size={40} a={win(t, 67.6, 68.8, 0.2)} />;
        })() : null}

      {/* the hedge: the note decoded, the count along the line, the bill row */}
      {t >= 69.2 && t < 74.2 ? (() => {
          const H = V2.hedge;
          const a = win(t, 69.2, 74.2, 0.35);
          const n = Math.round(H.n * hedgeGrow(t));
          const lead = projectAt(t, [HEDGE.x, 0.3, HEDGE.z0 - (HEDGE.z0 - HEDGE.z1) * hedgeGrow(t)]);
          return (
            <>
              <Panel style={{left: 64, top: 64, opacity: a, padding: '20px 30px'}}>
                <div style={{fontSize: 34, fontWeight: 500, opacity: 0.7, letterSpacing: 0.5}}>{H.note}</div>
                <div style={{fontSize: 46, fontWeight: 600, marginTop: 8, opacity: ov(t, 69.8, 70.3)}}>{H.decoded}</div>
              </Panel>
              <Card dot="amber" title={H.bill} a={win(t, 70.2, 74.2)} x={1920 - 64 - 640} y={300} w={640} size={36} />
              {lead.visible && n > 0 ? <Tag x={Math.min(lead.x, 1880)} y={lead.y - 70} anchor={lead.x > 1640 ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)'} text={`${n} plants`} dot="green" size={46} a={a} /> : null}
              {t >= 72.9 ? <Card dot="amber" title={H.card} a={win(t, 72.9, 74.2, 0.3)} x={64} y={780} size={44} /> : null}
            </>
          );
        })() : null}

      {/* the pit: the card, the labels on the cut-away under the paper, the meter, the seven trees */}
      {t >= 77.8 && t < 87.0 ? (() => {
          const P = V2.pit;
          const pit = projectAt(t, [PT.x - 0.9, -0.9, PT.z + 0.9]);
          const can = projectAt(t, [PT.x, 3.6, PT.z]);
          const sh = pitShrink(t);
          return (
            <>
              <Card dot="blue" title="On the slab, a big tree counts as small" sub="pit 1.5 × 1.5 m · soil 1.0 m on the concrete slab (L-6) · E12" a={win(t, 78.0, 86.9)} size={46} />
              <Card dot="green" title="Fix: +7 trees → 299.5" a={Math.min(ov(t, P.pass, P.pass + 0.35), win(t, 78, 86.9))} x={64} y={232} size={40} />
              {pit.visible ? <Tag x={pit.x} y={pit.y} anchor="translate(-100%, -50%)" text="pit 1.5 × 1.5 m · on the slab" size={32} a={win(t, 79.4, 83.4)} /> : null}
              {can.visible && sh > 0.4 ? <Tag x={can.x - 110} y={can.y + 40} anchor="translate(-100%, -50%)" text="counts as small · Gi 1.5 → 1.0" dot="red" size={32} a={win(t, 81.6, 83.6)} /> : null}
              {SEVEN.map((s, k) => {
                const p = projectAt(t, [s.x, 0, s.z]);
                return k === 3 && p.visible ? <Tag key={k} x={p.x} y={p.y - 110} text="+7 trees on the plan" dot="green" size={36} a={Math.min(sevenAt(t, 6), win(t, P.seven, 86.9))} /> : null;
              })}
            </>
          );
        })() : null}
      <Meter t={t} />

      {/* the findings; the big type on black; the hard cut */}
      <Findings t={t} />
      {t >= B.type - 0.2 && t < PART2_AT ? <TypeCard text="Two weeks → ten minutes." a={ov(t, B.type - 0.2, B.type)} /> : null}

      {/* the cards, each with the fix it asks for */}
      {V2.cards.map((c) => {
        const a = win(t, c.at, c.until);
        if (a <= 0) return null;
        const f = c.fix ? Math.min(ov(t, c.fix.at, c.fix.at + 0.35), a) : 0;
        return (
          <div key={c.title}>
            <Card dot={c.dot} title={c.title} sub={c.sub} a={a} size={46} />
            {c.fix ? <Card dot="green" title={c.fix.text} a={f} x={64} y={c.sub ? 232 : 176} size={40} /> : null}
          </div>
        );
      })}

      {/* Part 2: the capture, its holds cut, full-bleed */}
      {t >= PART2_AT - 0.1 && t < CLOSE_AT + 0.1 ? <Part2 fps={fps} proxy={proxy} /> : null}

      {/* large type over the end of Part 2, one card at a time */}
      {BIG.map((b) => {
        const a = win(t, b.at, b.until, 0.3);
        return a > 0.002 ? (
          <AbsoluteFill key={b.text} style={{opacity: a, background: U.bigVeil, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{fontFamily: FONT.sans, fontSize: 76, fontWeight: 700, letterSpacing: -2, color: U.typeText, textAlign: 'center', transform: `translateY(${(1 - a) * 8}px)`}}>{b.text}</div>
          </AbsoluteFill>
        ) : null;
      })}

      {/* the end: the finished project, the four bullets, the line, the logo */}
      {t >= CLOSE_AT ? (() => {
          const u = t - CLOSE_AT;
          // the end frame (and its caption) dips out first, then the logo comes in: never text over text
          const veil = ov(u, END.logo - 0.35, END.logo - 0.05);
          const logoIn = ov(u, END.logo, END.logo + 0.4);
          return (
            <>
              <AbsoluteFill style={{background: '#000', opacity: 1 - ov(u, 0, 0.45)}} />
              <AbsoluteFill style={{background: U.veil, opacity: 1 - veil}} />
              <div style={{position: 'absolute', left: 110, top: 200, opacity: 1 - veil, fontFamily: FONT.sans, color: U.endText, ...NUM}}>
                {END.bullets.map((b, k) => {
                  const a = ov(u, b.at, b.at + 0.35);
                  return (
                    <div key={k} style={{display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 30, opacity: a, transform: `translateX(${(1 - a) * -18}px)`}}>
                      <div style={{width: 14, height: 14, borderRadius: 7, background: U.accent, boxShadow: U.dotGlow ? `0 0 14px ${U.accent}` : undefined, flex: 'none', transform: 'translateY(-8px)'}} />
                      <div style={{fontSize: 46, fontWeight: 600, letterSpacing: -0.6}}>
                        {b.text}
                        {b.by ? <span style={{fontWeight: 400, opacity: 0.6}}>{` — ${b.by}`}</span> : null}
                      </div>
                    </div>
                  );
                })}
                <div style={{marginTop: 44, fontSize: 76, fontWeight: 700, letterSpacing: -2, opacity: ov(u, END.line, END.line + 0.4)}}>Every number, traced to the drawing.</div>
              </div>
              <AbsoluteFill style={{background: U.logoBg, opacity: veil, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                <Img src={staticFile(`v2/logo-lockup-${U.logo}.svg`)} style={{height: 160, opacity: logoIn, transform: `scale(${lerp(0.95, 1, logoIn)})`}} />
                <div style={{fontFamily: FONT.sans, fontSize: 36, fontWeight: 500, marginTop: 48, color: U.endText, opacity: 0.88 * logoIn}}>github.com/eric2612115/landsight</div>
                <div style={{fontFamily: FONT.sans, fontSize: 34, marginTop: 14, color: U.endText, opacity: 0.6 * logoIn}}>Built with Muse Spark 1.3 and SAM 3.1</div>
              </AbsoluteFill>
            </>
          );
        })() : null}

      <Caption t={t} />
      {timecode ? (
        <div style={{position: 'absolute', right: 18, top: 14, fontFamily: FONT.sans, fontSize: 18, fontWeight: 500, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '3px 9px', borderRadius: 6, ...NUM}}>
          {`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** The sheets in stacking order: L-6 first (the opening lands on it), then as v11. */
export const FILM_V5_SHEETS: WorldSheet[] = ['L-6', 'L-102', 'L-103', 'L-104', 'L-101', 'L-301', 'L-501', 'L-0', 'L-1-revB', 'L-1-revA', 'L-2', 'L-3', 'L-4', 'L-5', 'L-7', 'L-8', 'F-24-p1', 'F-25-p1', 'F-25-p2', 'F-25-p3', 'F-25-p4', 'F-25-p5', 'F-25-p6', 'F-25-p7', 'F-25-p8', 'F-25-p9', 'F-26-p1', 'L-3.filled', 'L-1-revB.filled'].map((id) => ({id, png: `v2/sheets/${id}.png`}));
export {CAP};
