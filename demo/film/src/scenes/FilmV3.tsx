import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont as loadSerif} from '@remotion/google-fonts/InstrumentSerif';
import {C, FONT} from '../theme';
import {B, BIG, CLOSE_AT, END, LIVE, LOGO_AT, PART2_AT, PUSH, SEGMENTS, V2, captions} from './film-v2-cues.js';
import {EASE, bezier, FIRST, FOOT, HEDGE, L1, PAL, PAVERS, PT, ROW, SEVEN, SHAFT, T8, WorldV3, corridorAt, countedAt, drawerAt, firstBorderAt, hedgeGrow, personAt, personWorld, pieceEnds, pieceHeight, pitShrink, plantersOut, planterSlide, plateAt, projectAt, riseAt, sevenAt} from './WorldV3';
import type {WorldSheet} from './WorldV3';
import t08 from './t08.json';
import sam from './sam-v11.json';
import l6 from './l6-border.json';

/**
 * Film v3 — the restyle of FilmV2 (same beats, same times, same sound): a white studio and a white study model
 * (WorldV3), editorial type instead of cards — an italic serif headline, one small Inter line of evidence with its status
 * dot, the fix in cobalt, and a thin leader line to the object — the exploded floors, Part 2 as a floating window on the
 * white canvas, the big type in the serif, the end on white. Cobalt is the only accent.
 */
export type FilmV3Props = {sheets?: WorldSheet[]; proxy?: boolean; timecode?: boolean; sound?: boolean; console?: boolean};

const serif = loadSerif('italic', {weights: ['400'], subsets: ['latin']}).fontFamily;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number) => EASE(clamp01((t - a) / (b - a)));
const EIN = bezier(0.16, 1, 0.3, 1);
const EOUT = bezier(0.6, 0, 0.9, 0.35);
/** On screen from a to b: in over f (cubic-bezier .16,1,.3,1), out over f/2 (cubic-bezier .6,0,.9,.35). */
const win = (t: number, a: number, b: number, f = 0.5) => (t <= a || t >= b ? 0 : Math.min(EIN(clamp01((t - a) / f)), 1 - EOUT(clamp01((t - (b - f / 2)) / (f / 2)))));
const CAPS = captions();
const INK = PAL.ink;
const DOT: Record<string, string> = {red: C.red, amber: C.amber, blue: C.cobalt, cobalt: C.cobalt, green: C.cobalt, none: 'transparent'};
const NUM = {fontVariantNumeric: 'tabular-nums' as const};
const L1_PNG = 'v3/sheets/L-1.png';
const SAM_PNG = 'v3/sheets/F-26-p1.png';
const WHITE = '#ffffff';
type P3 = [number, number, number];

/** A thin leader: a short horizontal run from the type, then one angle to the object, ending in a small ring. */
const Lead: React.FC<{from: [number, number]; dir: number; to: {x: number; y: number; visible: boolean} | null; a: number; accent?: boolean}> = ({from, dir, to, a, accent = true}) =>
  to && to.visible && a > 0.002 ? (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: a}}>
      <polyline points={`${from[0]},${from[1]} ${from[0] + dir * 46},${from[1]} ${to.x},${to.y}`} fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={1.5} />
      <circle cx={to.x} cy={to.y} r={6} fill={WHITE} stroke={accent ? C.cobalt : INK} strokeWidth={2.5} />
    </svg>
  ) : null;

/** Severity as an outlined word (no coloured dots in Part 1). */
const Chip: React.FC<{text: string}> = ({text}) => (
  <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 24, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: INK, border: `1.5px solid ${INK}`, borderRadius: 999, padding: '3px 14px 4px', marginRight: 14, verticalAlign: 'middle', lineHeight: 1.2}}>{text}</span>
);
const SEV: Record<string, string> = {red: 'send back', amber: 'fix before pricing', blue: 'code'};
const textW = (s: string, px: number, k = 0.5) => s.length * px * k;

/**
 * The editorial callout, placed beside its object: an italic serif headline, one line of evidence (34 px) led by the
 * severity word, the fix in cobalt; a short leader (≤ ~300 px: horizontal, then one angle). Without a target it sits
 * top-left. It keeps 60 px clear of every edge and stays above the caption.
 */
const Callout: React.FC<{t: number; title: string; sub?: string; sev?: string; fix?: string; fixA?: number; a: number; to?: {x: number; y: number; visible: boolean} | null; size?: number; at?: [number, number]}> = ({title, sub, sev, fix, fixA = 0, a, to, size = 66, at}) => {
  if (a <= 0.002) return null;
  const w = Math.max(textW(title, size, 0.42), textW(sub ?? '', 34, 0.5) + (sev ? textW(sev, 24, 0.75) + 40 : 0), textW(fix ?? '', 34, 0.52));
  const h = size * 1.05 + (sub ? 56 : 0) + (fix ? 50 : 0);
  let left: number;
  let bottom: number;
  let dir = 1;
  let lead: [number, number] | null = null;
  if (to && to.visible && !at) {
    const right = to.x > 960;
    dir = right ? 1 : -1;
    left = right ? to.x - 250 - w : to.x + 250;
    if (left < 60 || left + w > 1860) {
      // no room on that side: take the other
      dir = -dir;
      left = right ? to.x + 250 : to.x - 250 - w;
    }
    left = Math.max(60, Math.min(1860 - w, left));
    bottom = Math.max(60 + h, Math.min(900, to.y + 30));
    lead = [dir > 0 ? left + w + 18 : left - 18, bottom - 22];
  } else {
    left = at ? at[0] : 96;
    bottom = (at ? at[1] : 92) + h;
    // placed in the white space, the leader still reaches its object when that is close enough (≤ ~420 px)
    if (to && to.visible) {
      const from: [number, number] = [left + w + 18, bottom - 22];
      if (Math.hypot(to.x - from[0], to.y - from[1]) < 420) lead = from;
    }
  }
  const lift = (1 - a) * 10;
  return (
    <>
      <div style={{position: 'absolute', left: left - 220, top: bottom - h - 180, width: w + 440, height: h + 330, opacity: a * 0.9, background: 'radial-gradient(ellipse at 50% 48%, rgba(250,249,246,0.94) 0%, rgba(250,249,246,0.75) 40%, rgba(250,249,246,0) 70%)'}} />
      <div style={{position: 'absolute', left, top: bottom - h + lift, width: w + 20, opacity: a, color: INK, textAlign: dir > 0 && lead ? 'right' : 'left', ...NUM}}>
        <div style={{fontFamily: serif, fontStyle: 'italic', fontSize: size, lineHeight: 1.0, letterSpacing: -0.4, whiteSpace: 'nowrap'}}>{title}</div>
        {sub ? (
          <div style={{marginTop: 14, fontFamily: FONT.sans, fontSize: 34, fontWeight: 400, lineHeight: 1.2, whiteSpace: 'nowrap', opacity: 0.86}}>
            {sev ? <Chip text={sev} /> : null}
            {sub}
          </div>
        ) : null}
        {fix ? <div style={{marginTop: 10, fontFamily: FONT.sans, fontSize: 34, fontWeight: 600, color: C.cobalt, opacity: fixA, whiteSpace: 'nowrap'}}>{fix}</div> : null}
      </div>
      {lead ? <Lead from={lead} dir={dir} to={to ?? null} a={a} /> : null}
    </>
  );
};
/** A label on the model: a short horizontal run, one angle to its point (≤ ~300 px), 34 px type. */
const Label: React.FC<{x: number; y: number; text: string; a?: number; dx?: number; dy?: number; size?: number; accent?: boolean}> = ({x, y, text, a = 1, dx = 120, dy = -60, size = 34, accent = false}) => {
  if (a <= 0.002) return null;
  const sx = Math.sign(dx) || 1;
  const ex = x + dx;
  const ey = y + dy;
  return (
    <>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: a}}>
        <polyline points={`${x},${y} ${ex - sx * 36},${ey} ${ex},${ey}`} fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={1.4} />
        <circle cx={x} cy={y} r={4.5} fill={accent ? C.cobalt : INK} />
      </svg>
      <div style={{position: 'absolute', left: ex + sx * 10, top: ey, transform: `translate(${sx > 0 ? '0' : '-100%'}, -50%)`, opacity: a, fontFamily: FONT.sans, fontSize: size, fontWeight: 500, color: accent ? C.cobalt : INK, whiteSpace: 'nowrap', ...NUM}}>{text}</div>
    </>
  );
};
const Check: React.FC<{x: number; y: number; a: number; r?: number}> = ({x, y, a, r = 20}) =>
  a <= 0.002 ? null : (
    <svg width={2 * r} height={2 * r} style={{position: 'absolute', left: x - r, top: y - r, opacity: a}}>
      <circle cx={r} cy={r} r={r - 2} fill={C.cobalt} />
      <path d={`M${r * 0.55} ${r * 1.02} l${r * 0.3} ${r * 0.3} l${r * 0.6} ${r * -0.64}`} stroke="#fff" strokeWidth={r * 0.16} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
const TypeCard: React.FC<{text: string; a: number}> = ({text, a}) => (
  <AbsoluteFill style={{background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: a}}>
    <div style={{fontFamily: serif, fontStyle: 'italic', fontSize: 150, color: INK, textAlign: 'center', letterSpacing: -1}}>{text}</div>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- the opening (as v2)
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
          <div style={{position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(0, tl[1]), background: WHITE, opacity: pm}} />
          <div style={{position: 'absolute', left: 0, top: br[1], right: 0, bottom: 0, background: WHITE, opacity: pm}} />
          <div style={{position: 'absolute', left: 0, top: tl[1], width: Math.max(0, tl[0]), height: br[1] - tl[1], background: WHITE, opacity: pm}} />
          <div style={{position: 'absolute', left: br[0], top: tl[1], right: 0, height: br[1] - tl[1], background: WHITE, opacity: pm}} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Part 1: diagrams on white
const RoofCut: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 28.2, 31.9, 0.4);
  if (a <= 0) return null;
  const fix = ov(t, 30.0, 30.8);
  const PX = 700;
  const base = 520;
  const depth = lerp(0.3, 0.4, fix);
  const top = base - depth * PX;
  const line = base - 0.4 * PX;
  const ok = fix > 0.95;
  const F = FONT.sans;
  return (
    <div style={{position: 'absolute', right: 64, top: 330, width: 860, height: 560, opacity: a}}>
      <svg width={860} height={560} viewBox="0 0 960 625">
        <text x={110} y={60} fill={INK} fontFamily={serif} fontStyle="italic" fontSize={46}>The roof planter, cut away</text>
        <line x1={110} y1={base} x2={110} y2={base - 0.5 * PX} stroke={INK} strokeOpacity={0.7} strokeWidth={1.5} />
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((m) => (
          <g key={m}>
            <line x1={100} y1={base - m * PX} x2={120} y2={base - m * PX} stroke={INK} strokeOpacity={0.7} strokeWidth={1.5} />
            <text x={90} y={base - m * PX + 8} fill={INK} fillOpacity={0.7} fontFamily={F} fontSize={22} textAnchor="end">{m.toFixed(1)}</text>
          </g>
        ))}
        <rect x={160} y={base} width={560} height={26} fill="#e9e9e6" stroke={INK} strokeOpacity={0.25} />
        <rect x={160} y={base - 0.5 * PX} width={22} height={0.5 * PX} fill="#f4f4f2" stroke={INK} strokeOpacity={0.25} />
        <rect x={698} y={base - 0.5 * PX} width={22} height={0.5 * PX} fill="#f4f4f2" stroke={INK} strokeOpacity={0.25} />
        <rect x={182} y={top} width={516} height={base - top} fill="#ece7df" />
        {[...Array(70)].map((_, k) => <circle key={k} cx={190 + ((k * 73) % 500)} cy={top + 8 + ((k * 37) % Math.max(10, base - top - 14))} r={1.6} fill={INK} fillOpacity={0.18} />)}
        {[230, 320, 410, 500, 590, 660].map((x, k) => (
          <g key={x}>
            <circle cx={x} cy={top - 34} r={40} fill="#ffffff" stroke={INK} strokeOpacity={0.35} strokeWidth={1.5} />
            <circle cx={x + 26} cy={top - 20} r={26} fill="#ffffff" stroke={INK} strokeOpacity={0.35} strokeWidth={1.5} />
          </g>
        ))}
        <line x1={140} y1={line} x2={760} y2={line} stroke={C.cobalt} strokeWidth={2} strokeDasharray="10 8" />
        <text x={772} y={line + 8} fill={C.cobalt} fontFamily={F} fontSize={24} fontWeight={600}>0.4 m min.</text>
        <line x1={760} y1={base} x2={760} y2={top} stroke={ok ? C.cobalt : INK} strokeWidth={2} />
        <line x1={748} y1={top} x2={772} y2={top} stroke={ok ? C.cobalt : INK} strokeWidth={2} />
        <text x={786} y={(base + top) / 2 + 20} fill={ok ? C.cobalt : INK} fontFamily={serif} fontStyle="italic" fontSize={56}>{`${depth.toFixed(1)} m`}</text>
      </svg>
    </div>
  );
};

const Meter: React.FC<{t: number}> = ({t}) => {
  const P = V2.pit;
  const a = win(t, P.meter, 86.9, 0.4);
  if (a <= 0) return null;
  const down = ov(t, P.shrink[0], P.shrink[1]);
  const up = ov(t, P.seven, P.pass);
  const v = lerp(lerp(261.1, 209.9, down), 299.5, up);
  const pass = v >= 297;
  const W = 460;
  const px = (n: number) => (n / 330) * W;
  return (
    <div style={{position: 'absolute', right: 96, top: 300, width: W, opacity: a, color: INK, fontFamily: FONT.sans, ...NUM}}>
      <div style={{fontFamily: serif, fontStyle: 'italic', fontSize: 46}}>Greenery</div>
      <div style={{fontSize: 24, opacity: 0.7, marginTop: 4}}>kgCO₂e / yr · building code</div>
      <div style={{position: 'relative', height: 6, marginTop: 56, background: 'rgba(29,32,38,0.12)', borderRadius: 3}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: px(v), background: pass ? C.cobalt : INK, borderRadius: 3}} />
        <div style={{position: 'absolute', left: px(297) - 1, top: -12, bottom: -12, width: 2, background: INK}} />
        <div style={{position: 'absolute', left: px(297) - 200, top: -38, width: 194, textAlign: 'right', fontSize: 18, opacity: 0.7}}>required 297</div>
      </div>
      <div style={{marginTop: 20, fontFamily: serif, fontStyle: 'italic', fontSize: 64, lineHeight: 1}}>{v.toFixed(1)}</div>
      <div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 34, marginTop: 8, fontWeight: pass ? 600 : 400, color: pass ? C.cobalt : INK, whiteSpace: 'nowrap'}}>
        {pass ? 'Fix: +7 trees · passes' : down > 0.5 ? 'short of 297' : 'provided'}
      </div>
    </div>
  );
};

const SAM_PLAN = (() => {
  const [x0, y0, x1, y1] = sam.crop;
  const k = 1120 / (x1 - x0);
  return {x0, y0, k, left: 96, top: 120, w: 1120, h: (y1 - y0) * k};
})();
const COLS = {swatch: 36, what: 210, sam: 112, dwg: 118, diff: 124};
const Raster: React.FC<{t: number}> = ({t}) => {
  const a = win(t, B.raster, B.bills, 0.45);
  if (a <= 0) return null;
  const S = SAM_PLAN;
  const rowAt = (k: number) => B.raster + 0.7 + k * 1.45;
  const fmt = (r: (typeof sam.rows)[number], v: number) => (r.kind === 'symbols' ? String(Math.round(v)) : v.toFixed(1));
  const cell = (w: number, extra: React.CSSProperties = {}): React.CSSProperties => ({width: w, flex: 'none', boxSizing: 'border-box', ...extra});
  return (
    <AbsoluteFill style={{opacity: a, background: WHITE, fontFamily: FONT.sans, color: INK, ...NUM}}>
      <div style={{position: 'absolute', left: S.left, top: 44, fontFamily: serif, fontStyle: 'italic', fontSize: 52}}>Only a coloured picture.</div>
      <div style={{position: 'absolute', left: S.left, top: S.top, width: S.w, height: S.h, overflow: 'hidden', borderRadius: 4, background: WHITE, boxShadow: '0 30px 60px rgba(29,32,38,0.12), 0 0 0 1px rgba(29,32,38,0.08)'}}>
        <Img src={staticFile(SAM_PNG)} style={{position: 'absolute', left: -S.x0 * S.k, top: -S.y0 * S.k, width: sam.w * S.k, height: sam.h * S.k}} />
        <svg width={S.w} height={S.h} style={{position: 'absolute', inset: 0}}>
          {sam.rows.map((r, k) => {
            const at = rowAt(k);
            const draw = ov(t, at, at + 0.6);
            const fill = ov(t, at + 0.45, at + 0.9);
            if (draw <= 0) return null;
            return (
              <g key={r.what}>
                {r.polys.map((ring, j) => (
                  <path key={j} d={'M' + ring.map(([x, y]) => `${((x - S.x0) * S.k).toFixed(1)} ${((y - S.y0) * S.k).toFixed(1)}`).join('L') + 'Z'} pathLength={1} fill={C.cobalt} fillOpacity={0.22 * fill} stroke={C.cobalt} strokeWidth={2.5} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{position: 'absolute', left: S.left, top: S.top + S.h + 16, fontSize: 18, opacity: 0.55}}>Presentation Plan (Colour).pdf · a raster page, no CAD</div>
      <div style={{position: 'absolute', left: 1280, top: 124, width: 580}}>
        <div style={{fontSize: 18, opacity: 0.6, marginBottom: 22}}>Colour words read from the legend by Muse Spark</div>
        <div style={{display: 'flex', alignItems: 'flex-end', fontSize: 17, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.5, paddingBottom: 10, borderBottom: '1px solid rgba(29,32,38,0.18)'}}>
          <div style={cell(COLS.swatch + COLS.what)}>What</div>
          <div style={cell(COLS.sam, {textAlign: 'right'})}>SAM 3.1</div>
          <div style={cell(COLS.dwg, {textAlign: 'right'})}>Drawings</div>
          <div style={cell(COLS.diff, {textAlign: 'right'})}>Diff.</div>
        </div>
        {sam.rows.map((r, k) => {
          const ra = ov(t, rowAt(k) + 0.3, rowAt(k) + 0.8);
          const big = Math.abs(r.diff_pct) >= 10;
          return (
            <div key={r.what} style={{display: 'flex', alignItems: 'center', height: 104, borderBottom: '1px solid rgba(29,32,38,0.1)', opacity: ra}}>
              <div style={cell(COLS.swatch)}>
                <div style={{width: 22, height: 22, borderRadius: 4, background: r.plan_colour, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)'}} />
              </div>
              <div style={cell(COLS.what, {whiteSpace: 'nowrap'})}>
                <div style={{fontFamily: serif, fontStyle: 'italic', fontSize: 38, lineHeight: 1.05}}>{r.what}</div>
                <div style={{fontSize: 16, opacity: 0.55, marginTop: 4}}>{`“${r.prompt}” · ${r.kind === 'symbols' ? 'count' : 'm²'}`}</div>
              </div>
              <div style={cell(COLS.sam, {textAlign: 'right', fontSize: 34, fontWeight: 600, color: C.cobalt})}>{fmt(r, r.sam * ov(t, rowAt(k) + 0.3, rowAt(k) + 1.0))}</div>
              <div style={cell(COLS.dwg, {textAlign: 'right', fontSize: 34, fontWeight: 400})}>{r.kind === 'symbols' ? String(r.drawings) : Number(r.drawings).toFixed(1)}</div>
              <div style={cell(COLS.diff, {textAlign: 'right', fontSize: 30, fontWeight: big ? 700 : 400, color: big ? C.cobalt : INK})}>
                {r.diff_pct === 0 ? '0%' : `${r.diff_pct > 0 ? '+' : '−'}${Math.abs(r.diff_pct).toFixed(1)}%`}
              </div>
            </div>
          );
        })}
        <div style={{marginTop: 18, fontSize: 19, opacity: 0.6 * ov(t, rowAt(3) + 0.8, rowAt(3) + 1.2), lineHeight: 1.45}}>The fire lane differs: a tree is drawn over it.<br />Nothing counts until a person confirms.</div>
      </div>
    </AbsoluteFill>
  );
};

const Findings: React.FC<{t: number}> = ({t}) => {
  const F = V2.findings;
  const a = win(t, F.at, B.type, 0.4);
  if (a <= 0) return null;
  const group = (title: string, dot: string, items: string[], x: number, delay: number) => (
    <div style={{position: 'absolute', left: x, top: 150, width: 540, color: INK}}>
      <div style={{fontFamily: serif, fontStyle: 'italic', fontSize: 56, marginBottom: 14, opacity: ov(t, F.at + delay, F.at + delay + 0.3)}}>{title}</div>
      {items.map((it, i) => (
        <div key={it} style={{padding: '9px 0', borderTop: '1px solid rgba(29,32,38,0.14)', fontFamily: FONT.sans, fontSize: 30, opacity: ov(t, F.at + delay + 0.3 + i * 0.2, F.at + delay + 0.55 + i * 0.2), whiteSpace: 'nowrap', ...NUM}}>
          {it}
        </div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: 'rgba(255,255,255,0.9)'}} />
      {group('Send back', 'red', ['Tree outside the site', 'Planter over the lift shaft', 'Sheet listed, not in the package', 'Scale bar 1:100, title 1:200', 'Paving code ≠ its hatch', 'Two sheets alike, 91%'], 96, 0)}
      {group('Fix before pricing', 'amber', ['Billed 12 trees, drawn 8', 'Hedge: 27 m, 182 plants', 'Pavers 65% over your list', 'Roof lawn 57% under it'], 700, 1.1)}
      {group('Building code', 'blue', ['Greenery 209.9 / 297', 'Roof soil 0.3 m, min. 0.4', 'Corridor 0.9 m, min. 1.2'], 1304, 2.0)}
      <div style={{position: 'absolute', left: 96, bottom: 190, fontFamily: serif, fontStyle: 'italic', fontSize: 72, color: C.cobalt, opacity: ov(t, F.at + 3.0, F.at + 3.4), ...NUM}}>{F.total}</div>
    </AbsoluteFill>
  );
};

/**
 * The split for the tree, both halves drawn flat at the same scale: the plan (one tree) on the left; on the right the
 * same twelve canopy segments, loose — each drifting a little and tilting about its own middle — fully inside the half.
 */
const Split: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 50.1, 52.8, 0.5);
  if (a <= 0) return null;
  const k = 110;
  const loose = EASE(clamp01((t - 50.4) / 1.4));
  const [cx, cy] = t08.centre;
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, width: 960, height: 1080, overflow: 'hidden', background: WHITE, opacity: a}}>
        <Img src={staticFile(L1_PNG)} style={{position: 'absolute', width: L1.w * k, height: L1.h * k, left: 480 - (T8.x - L1.x0) * k, top: 600 - (T8.z - L1.z0) * k}} />
        <div style={{position: 'absolute', left: 480 - k * (t08.radius + 0.4), top: 600 - k * (t08.radius + 0.4), width: 2 * k * (t08.radius + 0.4), height: 2 * k * (t08.radius + 0.4), borderRadius: '50%', border: `3px solid ${C.cobalt}`, boxSizing: 'border-box'}} />
      </div>
      <div style={{position: 'absolute', left: 960, top: 0, width: 960, height: 1080, background: WHITE, opacity: a}}>
        <svg width={960} height={1080}>
          {t08.canopy.map((seg, i) => {
            const [[x0, y0], [x1, y1]] = seg.points as number[][];
            const p0 = [480 + (x0 - cx) * k, 600 - (y0 - cy) * k];
            const p1 = [480 + (x1 - cx) * k, 600 - (y1 - cy) * k];
            const mx = (p0[0] + p1[0]) / 2;
            const my = (p0[1] + p1[1]) / 2;
            const dx = mx - 480;
            const dy = my - 600;
            const dl = Math.hypot(dx, dy) || 1;
            const out = 34 * loose;
            const rot = (i % 2 ? 1 : -1) * (6 + (i % 5) * 3) * loose;
            const tx = (dx / dl) * out;
            const ty = (dy / dl) * out;
            const na = EIN(clamp01((t - 50.7 - i * 0.05) / 0.4));
            return (
              <g key={seg.handle} transform={`translate(${tx} ${ty}) rotate(${rot} ${mx} ${my})`}>
                <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke={C.cobalt} strokeWidth={4} strokeLinecap="round" />
                <text x={mx + (dx / dl) * 26} y={my + (dy / dl) * 26 + 7} textAnchor="middle" fontFamily={FONT.sans} fontSize={20} fontWeight={600} fill={INK} opacity={0.7 * na}>{i + 1}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{position: 'absolute', left: 959, top: 80, width: 1, height: 920, background: INK, opacity: 0.16 * a}} />
      <Callout t={t} title="What you see" sub="one tree" a={a} at={[96, 92]} size={64} />
      <Callout t={t} title="What a computer sees" sub="twelve loose lines" a={a} at={[1056, 92]} size={64} />
    </>
  );
};

/**
 * Variant B — the console grammar (sparse): a top bar, a mode label in cobalt, one card with the finding's number, one
 * card with the four check groups and their counts (the product's own figures), a thin review-log scrubber with a tick
 * at every beat. Monospace small caps; it never reaches the caption's band.
 */
const BEAT_TICKS = [0, 14, ...Object.values(B), PART2_AT, CLOSE_AT, LOGO_AT];
const GROUPS: [string, number][] = [['send back', 7], ['fix before pricing', 9], ['building code', 4], ['ask the architect', 2]];
const Console: React.FC<{t: number}> = ({t}) => {
  const beat = CONSOLE_BEATS.find(([a, b]) => t >= a && t < b);
  if (!CONSOLE || !beat) return null;
  const [a0, b0, kind] = beat;
  const A = win(t, a0, b0, 0.5);
  const mono: React.CSSProperties = {fontFamily: FONT.mono, textTransform: 'uppercase', letterSpacing: 1.4};
  const typical = kind === 'typical';
  const sheet = typical ? 'L-103 · 8F' : 'L-102 · 5F';
  const rt = `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  const active = typical ? 'fix before pricing' : 'send back';
  const dur = V2.duration;
  const card: React.CSSProperties = {position: 'absolute', top: 150, width: 400, boxSizing: 'border-box', padding: '22px 26px', background: 'rgba(252,251,249,0.94)', border: '1px solid rgba(29,35,43,0.22)', borderRadius: 10, color: INK, boxShadow: '0 20px 50px -24px rgba(29,35,43,0.25)'};
  return (
    <AbsoluteFill style={{opacity: A, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 52, background: 'rgba(250,249,246,0.9)', borderBottom: '1px solid rgba(29,35,43,0.16)', display: 'flex', alignItems: 'center', gap: 22, padding: '0 60px', ...mono, fontSize: 17, color: INK}}>
        <span style={{fontWeight: 700}}>Landsight</span>
        <span style={{opacity: 0.5}}>·</span>
        <span>Review console</span>
        <span style={{opacity: 0.5}}>·</span>
        <span style={{opacity: 0.75}}>Greenfield Residences — Landscape Package</span>
        <span style={{opacity: 0.5}}>·</span>
        <span style={{opacity: 0.75}}>{sheet}</span>
        <span style={{marginLeft: 'auto', ...NUM}}>{rt}</span>
      </div>
      {/* the review-log scrubber: a tick at every beat, the playhead in cobalt */}
      <svg width={1920} height={30} style={{position: 'absolute', left: 0, top: 52}}>
        <line x1={60} y1={14} x2={1860} y2={14} stroke={INK} strokeOpacity={0.25} strokeWidth={1} />
        {BEAT_TICKS.map((b, i) => <line key={i} x1={60 + (b / dur) * 1800} y1={9} x2={60 + (b / dur) * 1800} y2={19} stroke={INK} strokeOpacity={0.45} strokeWidth={1} />)}
        <line x1={60} y1={14} x2={60 + (t / dur) * 1800} y2={14} stroke={C.cobalt} strokeWidth={2} />
        <circle cx={60 + (t / dur) * 1800} cy={14} r={4.5} fill={C.cobalt} />
      </svg>
      <div style={{position: 'absolute', left: 60, top: 100, ...mono, fontSize: 24, fontWeight: 700, color: C.cobalt}}>{typical ? 'Isolate · 8F · typical' : 'Isolate · 5F · core'}</div>
      <div style={{...card, left: 60}}>
        <div style={{...mono, fontSize: 16, opacity: 0.6}}>{typical ? 'Finding T06' : 'Finding T09'}</div>
        <div style={{fontFamily: FONT.mono, fontSize: 88, fontWeight: 600, lineHeight: 1.05, marginTop: 10, ...NUM}}>{typical ? '×4' : '3.0 m²'}</div>
        <div style={{fontFamily: FONT.sans, fontSize: 34, marginTop: 6, lineHeight: 1.15}}>{typical ? 'floors on one sheet' : 'planter over the shaft'}</div>
        <div style={{fontFamily: FONT.sans, fontSize: 24, marginTop: 10, opacity: 0.7, ...NUM}}>{typical ? 'billed 38.4 m² · 153.6 m² drawn' : 'B-10 · 7.5 m² on L-102'}</div>
      </div>
      <div style={{...card, left: 60, top: 560}}>
        <div style={{...mono, fontSize: 16, opacity: 0.6, ...NUM}}>Checks · 22 issues · $19,248</div>
        {GROUPS.map(([g, n]) => {
          const on = g === active;
          return (
            <div key={g} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, ...mono, fontSize: 19}}>
              <span style={{color: on ? C.cobalt : INK, fontWeight: on ? 700 : 500}}>{g}</span>
              <span style={{minWidth: 44, textAlign: 'center', padding: '2px 10px', borderRadius: 999, border: `1.5px solid ${on ? C.cobalt : INK}`, background: on ? C.cobalt : 'transparent', color: on ? '#fff' : INK, fontWeight: 700, ...NUM}}>{n}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Part 2: the app as a floating window on the white canvas, rounded, with a soft long shadow. */
const WIN = {w: 1500, h: 844, x: 210, y: 70, r: 18};
const Part2: React.FC<{fps: number; proxy: boolean; t: number}> = ({fps, proxy, t}) => {
  let at = PART2_AT;
  const rise = ov(t, PART2_AT, PART2_AT + 0.5);
  return (
    <AbsoluteFill style={{background: WHITE}}>
      <div style={{position: 'absolute', left: WIN.x, top: WIN.y + (1 - rise) * 16, width: WIN.w, height: WIN.h, borderRadius: WIN.r, overflow: 'hidden', background: '#0f1115', boxShadow: '0 50px 110px -20px rgba(18,22,32,0.38), 0 18px 40px -12px rgba(18,22,32,0.22), 0 0 0 1px rgba(18,22,32,0.08)'}}>
        {SEGMENTS.map(([f, to], k) => {
          const from = at;
          at += to - f;
          return (
            <Sequence key={k} from={Math.round(from * fps)} durationInFrames={Math.round(at * fps) - Math.round(from * fps)} name={`capture ${k + 1}`} layout="none">
              <OffthreadVideo src={staticFile(proxy ? 'v2/try-1080.mp4' : 'v2/try.mp4')} startFrom={Math.round(f * fps)} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
            </Sequence>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Caption: React.FC<{t: number}> = ({t}) => {
  const c = CAPS.find((x) => t >= x.start && t < x.end);
  if (!c) return null;
  const dip = 1 - ov(t, LOGO_AT - 0.35, LOGO_AT - 0.05);
  if (dip <= 0.002) return null;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 34, textAlign: 'center', opacity: dip}}>
      <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 40, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.2, color: INK, background: 'rgba(255,255,255,0.92)', padding: '8px 22px 10px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(18,22,32,0.14), 0 0 0 1px rgba(18,22,32,0.06)', ...NUM}}>{c.text}</span>
    </div>
  );
};

/** The editorial copy of each problem (the figures are the cards' own); severity is a word, never a coloured dot. */
const V3COPY: {title: string; sub: string; sev?: string; fix?: string; at?: [number, number]}[] = [
  {title: 'One sheet, four floors.', sub: 'The bill priced one: 38.4 m².', sev: 'fix before pricing', fix: 'Fix: price 4 floors · 153.6 m²', at: [96, 400]},
  {title: 'Roof soil 0.3 m.', sub: 'The rule asks 0.4 m.', sev: 'code', fix: 'Fix: soil 0.3 → 0.4 m · 35 m² counts'},
  {title: 'Two sheets, one drawing.', sub: 'L-102 and L-103 · 91% alike.', sev: 'send back', fix: 'Fix: confirm two floors, price each once'},
  {title: 'A planter over the lift shaft.', sub: 'B-10 · 3.0 m² over the shaft.', sev: 'send back', fix: 'Fix: move the planter off the core', at: [96, 690]},
  {title: 'Escape corridor 0.9 m.', sub: 'The code asks 1.2 m.', sev: 'code', fix: 'Fix: planters to the walls → 1.5 m'},
  {title: 'One tree, 95%.', sub: 'Twelve LINE entities · Muse Spark asks first.'},
  {title: 'Billed 12 trees. Drawn 8.', sub: 'Bill row 6 · camphor, cal. 10 cm.', sev: 'fix before pricing', fix: 'Fix: row 6 · 12 → 8 · −$516'},
  {title: 'Pavers $10,856 over your list.', sub: '$117/m² against your $71.', sev: 'fix before pricing', fix: 'Fix: reprice at $71/m²'},
];
/** Variant B (the console grammar) replaces the editorial callout on two beats: the exploded tower and the lift shaft. */
const CONSOLE_BEATS: [number, number, string][] = [
  [21.4, 27.4, 'typical'],
  [35.1, 39.3, 'lift'],
];
let CONSOLE = false;
const consoleOn = (t: number) => CONSOLE && CONSOLE_BEATS.some(([a, b]) => t >= a && t < b);
/** Where each problem's leader line goes, in the world, at time t. */
const CARD_TARGET: ((t: number) => P3)[] = [
  (t) => {
    const p = plateAt(t, '8');
    return [p[0] - 8, p[1], p[2] + 5];
  },
  (t) => {
    const p = plateAt(t, 'R');
    return [p[0] - 6, p[1], p[2] + 4];
  },
  (t) => {
    const p = plateAt(t, '5');
    return [p[0] - 6, p[1], p[2] + 5];
  },
  (t) => {
    const p = plateAt(t, '5');
    return [p[0] + SHAFT.x - SHAFT.s / 2, p[1], p[2] + SHAFT.z - SHAFT.s / 2];
  },
  (t) => corridorAt(t).a,
  () => [T8.x - 2.2, 0.1, T8.z - 1.0],
  () => [ROW[7].x, 0.1, ROW[7].z - 1.6],
  () => [PAVERS.x - PAVERS.w / 2, 0.1, PAVERS.z - PAVERS.d / 2],
];

export const FilmV3: React.FC<FilmV3Props> = ({sheets, proxy = false, timecode = false, sound = true, console: consoleMode = false}) => {
  CONSOLE = consoleMode;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const part1World = t >= B.land - 0.45 && t < B.type && !(t > B.raster + 0.5 && t < B.bills - 0.45);
  const endWorld = t >= CLOSE_AT;
  const duskU = clamp01((t - CLOSE_AT) / (LOGO_AT + END.hold - CLOSE_AT));
  return (
    <AbsoluteFill style={{background: WHITE, overflow: 'hidden'}}>
      {part1World && sheets ? <WorldV3 t={Math.max(t, B.push)} sheets={sheets} l1={L1_PNG} /> : null}
      {endWorld && sheets ? <WorldV3 t={200} sheets={sheets} l1={L1_PNG} dusk={duskU} /> : null}

      <Opening t={t} fps={fps} proxy={proxy} />
      {sound ? <Audio src={staticFile('v2/audio/mix.wav')} /> : null}

      {t >= 15.4 && t < 17.2 ? (() => {
          const p = projectAt(t, [plateAt(t, '1')[0] + 30, 40.5, plateAt(t, '1')[2] + 14]);
          return p.visible ? <Label x={p.x} y={p.y} text={`${FIRST} · tree pit detail`} a={win(t, 15.4, 17.2)} /> : null;
        })() : null}
      {t >= 19.0 && t < 21.3 ? (() => {
          const p = projectAt(t, [FOOT.podium.cx - FOOT.podium.w / 2, 0, FOOT.podium.cz + FOOT.podium.d / 2]);
          return p.visible ? <Label x={p.x} y={p.y} dx={-150} dy={50} text="L-1 · the tower's footprint" accent a={win(t, 19.0, 21.3)} /> : null;
        })() : null}

      {/* the typical floor, exploded: L-103 and the three floors it stands for, called out */}
      {t >= 21.8 && t < 27.2
        ? ['8', ...V2.typical.floors].map((f, k) => {
            const pl = plateAt(t, f);
            const p = projectAt(t, [pl[0] + 14, pl[1], pl[2] - 2]);
            const a = win(t, k === 0 ? 22.2 : V2.typical.lit + (k - 1) * V2.typical.step + 0.4, 27.2);
            return p.visible ? <Label key={f} x={p.x} y={p.y} dx={170} dy={-6} text={k === 0 ? '8F · L-103 · drawn once' : `${f}F · the same sheet`} accent={k === 0} a={a} /> : null;
          })
        : null}

      <RoofCut t={t} />

      {t >= 33.4 && t < 35.0 ? (() => {
          const p = projectAt(t, [plateAt(t, '8')[0] + 10, plateAt(t, '8')[1], plateAt(t, '8')[2] - 4]);
          return p.visible ? <Label x={p.x} y={p.y} dx={120} dy={-40} text="L-102 on L-103 · 91% the same" accent a={win(t, 33.6, 35.0)} /> : null;
        })() : null}

      {t >= 35.9 && t < 39.3 ? (() => {
          const pl = plateAt(t, '5');
          const shaft = projectAt(t, [pl[0] + SHAFT.x - SHAFT.s / 2, pl[1], pl[2] + SHAFT.z + SHAFT.s / 2]);
          const plan = projectAt(t, [pl[0] + SHAFT.x + 1.55 + (4.3 - 1.55) * planterSlide(t), pl[1] + 1.0, pl[2] + SHAFT.z - 1.2]);
          return (
            <>
              {shaft.visible ? <Label x={shaft.x} y={shaft.y} dx={170} dy={90} text="lift shaft · the car below" accent a={win(t, 36.0, 39.3)} /> : null}
              {plan.visible ? <Label x={plan.x} y={plan.y} dx={140} dy={-80} text="planter B-10" a={win(t, 36.3, 39.3)} /> : null}
              {shaft.visible ? <Check x={shaft.x - 30} y={shaft.y - 40} a={ov(t, 38.5, 38.9)} /> : null}
            </>
          );
        })() : null}

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
          const col = ok ? C.cobalt : INK;
          return (
            <>
              {p.visible ? (
                <div style={{position: 'absolute', left: p.x - 22, top: p.y - 22, opacity: pa}}>
                  <div style={{position: 'absolute', left: -14, top: 6, width: 72, height: 34, borderRadius: 17, background: '#fff', border: `3px solid ${INK}`, boxSizing: 'border-box'}} />
                  <div style={{position: 'absolute', left: 0, top: 0, width: 44, height: 44, borderRadius: 22, background: '#fff', border: `3px solid ${INK}`, boxSizing: 'border-box'}} />
                </div>
              ) : null}
              {ea.visible && eb.visible && dimA > 0 ? (
                <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: dimA}}>
                  <line x1={ea.x} y1={ea.y} x2={eb.x} y2={eb.y} stroke={col} strokeWidth={2.5} />
                  {[ea, eb].map((e, k) => (
                    <line key={k} x1={e.x - 16} y1={e.y} x2={e.x + 16} y2={e.y} stroke={col} strokeWidth={2.5} />
                  ))}
                </svg>
              ) : null}
              {ea.visible ? (
                <div style={{position: 'absolute', left: ea.x + 28, top: (ea.y + eb.y) / 2, transform: 'translateY(-50%)', opacity: dimA, fontFamily: serif, fontStyle: 'italic', fontSize: 56, color: col, ...NUM}}>
                  {`${clear.toFixed(1)} m`}
                  {pOut < 0.3 ? <div style={{fontFamily: FONT.sans, fontStyle: 'normal', fontSize: 20, opacity: 0.7, color: INK}}>the code asks 1.2 m</div> : null}
                </div>
              ) : null}
              {p.visible && t >= 42.5 && t < 43.4 ? <Label x={p.x} y={p.y + 20} dx={-80} dy={90} text="stopped" a={win(t, 42.5, 43.4, 0.15)} /> : null}
              {p.visible ? <Check x={p.x + 70} y={p.y - 50} a={ov(t, 45.0, 45.3)} /> : null}
            </>
          );
        })() : null}

      <Split t={t} />
      {false && riseAt(t) > 0.3 && t < 52.8
        ? t08.canopy.map((seg, i) => {
            const [a, b] = pieceEnds(i);
            const p = projectAt(t, [(a[0] + b[0]) / 2, 0.06 + pieceHeight(i) * riseAt(t), (a[1] + b[1]) / 2]);
            if (!p.visible || p.x < 1000 || p.y < 300) return null;
            return (
              <div key={seg.handle} style={{position: 'absolute', left: p.x + 18, top: p.y - 26, fontFamily: FONT.sans, fontSize: 18, fontWeight: 600, color: C.cobalt, opacity: ov(t, 50.6 + i * 0.06, 50.9 + i * 0.06)}}>{i + 1}</div>
            );
          })
        : null}
      {t >= 54.8 && t < 57.4 ? (() => {
          const p = projectAt(t, [T8.x + 2.7, 0, T8.z + 1.0]);
          const click = ov(t, 55.6, 56.0);
          return (
            <>
              <div style={{position: 'absolute', left: p.x, top: p.y, padding: '10px 22px', borderRadius: 999, background: C.cobalt, color: '#fff', fontFamily: FONT.sans, fontSize: 26, fontWeight: 600, boxShadow: '0 12px 30px rgba(36,87,255,0.3)', opacity: win(t, 54.8, 57.4)}}>{click > 0.6 ? 'Confirmed · 8 trees' : 'Confirm — one tree'}</div>
              <div style={{position: 'absolute', left: p.x + 60 - 14, top: p.y + 26 - 14, width: 28, height: 28, borderRadius: 14, border: '3px solid #fff', background: C.cobalt, transform: `scale(${1 + click * 2})`, opacity: t < 55.6 ? 0 : 1 - click}} />
            </>
          );
        })() : null}

      <Raster t={t} />

      {countedAt(t) > 0
        ? ROW.slice(0, countedAt(t)).map((r, i) => {
            const p = projectAt(t, [r.x, 0, r.z]);
            return <div key={r.id} style={{position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)', fontFamily: serif, fontStyle: 'italic', fontSize: 44, color: C.cobalt}}>{i + 1}</div>;
          })
        : null}

      {t >= 69.2 && t < 74.2 ? (() => {
          const H = V2.hedge;
          const a = win(t, 69.2, 74.2, 0.35);
          const n = Math.round(H.n * hedgeGrow(t));
          const lead = projectAt(t, [HEDGE.x, 0.3, HEDGE.z0 - (HEDGE.z0 - HEDGE.z1) * hedgeGrow(t)]);
          return (
            <>
              <div style={{position: 'absolute', left: 96, top: 92, opacity: a, color: INK}}>
                <div style={{fontFamily: FONT.sans, fontSize: 22, letterSpacing: 1, opacity: 0.6}}>{H.note}</div>
                <div style={{fontFamily: serif, fontStyle: 'italic', fontSize: 62, marginTop: 6, opacity: ov(t, 69.8, 70.3)}}>{H.decoded}</div>
                <div style={{display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT.sans, fontSize: 22, marginTop: 12, opacity: 0.78 * ov(t, 70.2, 70.6)}}>
                  <div style={{width: 9, height: 9, borderRadius: 5, background: C.amber}} />
                  {H.bill}
                </div>
                <div style={{fontFamily: FONT.sans, fontSize: 22, fontWeight: 600, marginTop: 10, color: C.cobalt, opacity: ov(t, 72.9, 73.3)}}>{H.card}</div>
              </div>
              {lead.visible && n > 0 ? <div style={{position: 'absolute', left: Math.min(lead.x, 1700), top: lead.y - 80, transform: 'translateX(-50%)', fontFamily: serif, fontStyle: 'italic', fontSize: 64, color: C.cobalt, opacity: a, ...NUM}}>{`${n}`}<span style={{fontFamily: FONT.sans, fontStyle: 'normal', fontSize: 22, marginLeft: 8}}>plants</span></div> : null}
            </>
          );
        })() : null}

      {t >= 77.8 && t < 87.0 ? (() => {
          const P = V2.pit;
          const pit = projectAt(t, [PT.x - 0.9, -0.9, PT.z + 0.9]);
          const can = projectAt(t, [PT.x, 3.6, PT.z]);
          const sh = pitShrink(t);
          const a = win(t, 78.0, 86.9);
          return (
            <>
              <Callout t={t} title="On the slab, a big tree counts as small." sub="Pit 1.5 × 1.5 m · soil 1.0 m (L-6)." sev="code" fix="Fix: +7 trees → 299.5" fixA={ov(t, P.pass, P.pass + 0.35)} a={a} at={[96, 92]} size={60} />
              {can.visible && sh > 0.4 ? <Label x={can.x} y={can.y} dx={-110} dy={-40} text="counts as small · Gi 1.5 → 1.0" a={win(t, 81.6, 83.6)} /> : null}
              {SEVEN.map((s, k) => {
                const p = projectAt(t, [s.x, 0, s.z]);
                return k === 3 && p.visible ? <Label key={k} x={p.x} y={p.y} dx={40} dy={-90} text="+7 trees on the plan" a={Math.min(sevenAt(t, 6), win(t, P.seven, 86.9))} /> : null;
              })}
            </>
          );
        })() : null}
      <Meter t={t} />

      <Findings t={t} />
      {t >= B.type - 0.2 && t < PART2_AT ? <TypeCard text="Two weeks → ten minutes." a={ov(t, B.type - 0.2, B.type)} /> : null}

      {/* the problems: the editorial callout, the fix in cobalt, a leader to the object */}
      {V2.cards.map((c, k) => {
        const a = win(t, c.at, c.until);
        if (a <= 0) return null;
        const f = c.fix ? ov(t, c.fix.at, c.fix.at + 0.35) : 0;
        const v = V3COPY[k];
        const to = CARD_TARGET[k] ? projectAt(t, CARD_TARGET[k](t)) : null;
        if (consoleOn(t)) return null;
        return <Callout key={c.title} t={t} title={v.title} sub={v.sub} sev={v.sev} fix={v.fix} fixA={f} a={a} to={to} at={v.at} size={66} />;
      })}

      {t >= PART2_AT - 0.1 && t < CLOSE_AT + 0.1 ? <Part2 fps={fps} proxy={proxy} t={t} /> : null}
      {BIG.map((b) => {
        const a = win(t, b.at, b.until, 0.3);
        return a > 0.002 ? (
          <AbsoluteFill key={b.text} style={{opacity: a, background: 'rgba(255,255,255,0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{fontFamily: serif, fontStyle: 'italic', fontSize: 96, color: INK, textAlign: 'center', transform: `translateY(${(1 - a) * 8}px)`}}>{b.text}</div>
          </AbsoluteFill>
        ) : null;
      })}

      {t >= CLOSE_AT ? (() => {
          const u = t - CLOSE_AT;
          // the end frame (and its caption) dips out first, then the logo comes in: never text over text
          const veil = ov(u, END.logo - 0.35, END.logo - 0.05);
          const logoIn = ov(u, END.logo, END.logo + 0.4);
          return (
            <>
              <AbsoluteFill style={{background: WHITE, opacity: 1 - ov(u, 0, 0.45)}} />
              <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.86) 44%, rgba(255,255,255,0) 76%)', opacity: 1 - veil}} />
              <div style={{position: 'absolute', left: 120, top: 250, opacity: 1 - veil, fontFamily: FONT.sans, color: INK, ...NUM}}>
                {END.bullets.map((b, k) => {
                  const a = ov(u, b.at, b.at + 0.35);
                  return (
                    <div key={k} style={{display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, opacity: a, transform: `translateX(${(1 - a) * -14}px)`}}>
                      <div style={{width: 8, height: 8, borderRadius: 4, background: C.cobalt, flex: 'none'}} />
                      <div style={{fontSize: 28, fontWeight: 400}}>
                        {b.text}
                        {b.by ? <span style={{opacity: 0.55}}>{` — ${b.by}`}</span> : null}
                      </div>
                    </div>
                  );
                })}
                <div style={{marginTop: 46, fontFamily: serif, fontStyle: 'italic', fontSize: 92, lineHeight: 1.0, letterSpacing: -0.5, opacity: ov(u, END.line, END.line + 0.4)}}>
                  Every number,<br />traced to the drawing.
                </div>
              </div>
              <AbsoluteFill style={{background: WHITE, opacity: veil, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                <Img src={staticFile('v2/logo-lockup-light.svg')} style={{height: 132, opacity: logoIn, transform: `scale(${lerp(0.97, 1, logoIn)})`}} />
                <div style={{fontFamily: FONT.sans, fontSize: 34, fontWeight: 500, marginTop: 46, color: INK, opacity: 0.85 * logoIn}}>github.com/eric2612115/landsight</div>
                <div style={{fontFamily: serif, fontStyle: 'italic', fontSize: 38, marginTop: 10, color: INK, opacity: 0.7 * logoIn}}>Built with Muse Spark 1.3 and SAM 3.1</div>
              </AbsoluteFill>
            </>
          );
        })() : null}

      <Console t={t} />
      <Caption t={t} />
      {timecode ? (
        <div style={{position: 'absolute', right: 18, top: 14, fontFamily: FONT.sans, fontSize: 18, fontWeight: 500, color: INK, background: 'rgba(255,255,255,0.7)', padding: '3px 9px', borderRadius: 6, ...NUM}}>
          {`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** The sheets in stacking order (white paper, v3/sheets). */
export const FILM_V3_SHEETS: WorldSheet[] = ['L-6', 'L-102', 'L-103', 'L-104', 'L-101', 'L-301', 'L-501', 'L-0', 'L-1-revB', 'L-1-revA', 'L-2', 'L-3', 'L-4', 'L-5', 'L-7', 'L-8', 'F-24-p1', 'F-25-p1', 'F-25-p2', 'F-25-p3', 'F-25-p4', 'F-25-p5', 'F-25-p6', 'F-25-p7', 'F-25-p8', 'F-25-p9', 'F-26-p1', 'L-3.filled', 'L-1-revB.filled'].map((id) => ({id, png: `v3/sheets/${id}.png`}));
