import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {B, BIG, CAP, CLOSE_AT, END, LIVE, LOGO_AT, PART2_AT, PUSH, SEGMENTS, V2, captions} from './film-v2-cues.js';
import {FIRST, FOOT, HEDGE, L1, PAL, PKG, PT, ROW, SEVEN, SHAFT, T8, TX, TZ, WorldV6, B10_H, COLD_END, b10At, coldSheetAt, drawerScale, levelAt, corridorAt, countedAt, drawerAt, firstBorderAt, hedgeGrow, personAt, personWorld, pieceEnds, pieceHeight, pitShrink, plantersOut, planterSlide, plateAt, projectAt, riseAt, sevenAt} from './WorldV6';
import type {WorldSheet} from './WorldV6';
import {LOOKS} from './v5-look';
import type {LookSpec} from './v5-look';
import {DAY} from './v6-look';
import t08 from './t08.json';
import sam from './sam-v11.json';
import l6 from './l6-border.json';

/**
 * Film v6: the hybrid of V2 and V4 over WorldV6 (an architectural tower; day in Part 1, night at the end). V2's timing,
 * captions, cards and mix; V4's explode (floor tags with a sheet thumbnail), lift-shaft section and corridor plan; V5's
 * roof cut-away. V2's dark ink cards; nothing to read under 34 px; caption pills opaque.
 *
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
export type FilmV6Props = {sheets?: WorldSheet[]; proxy?: boolean; timecode?: boolean; sound?: boolean; endCard?: 'default' | 'extended'; previewBeat?: boolean};
/** The look's cards (one look per render). */
let U: LookSpec['ui'] = LOOKS.ink.ui;
const INK = '#1D2026';
const onLight = () => U.text === INK;
const line = (a: number) => (onLight() ? `rgba(29,32,38,${a * 0.8})` : `rgba(255,255,255,${a})`);
// v6.2: one accent; red only for the lift-shaft clash
const dotColour = (d: string) => ({red: U.accent, amber: U.accent, blue: U.accent, cobalt: U.accent, green: U.accent, none: 'transparent'})[d] ?? d;
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
const Card: React.FC<{dot: string; title: string; sub?: string; a: number; x?: number; y?: number; w?: number; size?: number; inline?: boolean; wrap?: boolean}> = ({dot, title, sub, a, x = 64, y = 64, w, size = 50, inline = false, wrap = false}) =>
  a <= 0.002 ? null : (
    <div style={{position: inline ? 'relative' : 'absolute', left: inline ? undefined : x, top: inline ? undefined : y, width: w, boxSizing: 'border-box', opacity: a, transform: `translateY(${(1 - a) * 10}px)`, borderRadius: 20, background: U.panel, backdropFilter: U.blur, border: U.border, padding: `${Math.round(size * (wrap ? 0.26 : 0.34))}px ${Math.round(size * 0.52)}px`, color: U.text, fontFamily: FONT.sans, boxShadow: U.shadow, whiteSpace: wrap ? 'normal' : 'nowrap', ...NUM}}>
      <div style={{display: 'flex', alignItems: 'center', gap: Math.round(size * 0.32)}}>
        <div style={{width: Math.round(size * 0.32), height: Math.round(size * 0.32), borderRadius: '50%', background: dotColour(dot), boxShadow: dotGlow(dot), flex: 'none'}} />
        <div style={{fontSize: size, fontWeight: 600, letterSpacing: -0.02 * size, lineHeight: 1.15}}>{title}</div>
      </div>
      {sub ? <div style={{marginTop: Math.round(size * 0.14), marginLeft: Math.round(size * 0.64), fontSize: Math.max(34, Math.round(size * 0.6)), fontWeight: 400, opacity: U.sub, lineHeight: 1.3}}>{sub}</div> : null}
    </div>
  );
/** An exploded floor's tag (V4): a thumbnail of its sheet (the plan's lower edge: lift, columns, the three planters), the floor, a status dot; anchored on its left middle. */
const SheetTag: React.FC<{x: number; y: number; text: string; dot: string; a: number}> = ({x, y, text, dot, a}) =>
  a <= 0.002 ? null : (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(0, -50%) translateX(${(1 - a) * -12}px)`, opacity: a, display: 'flex', alignItems: 'center', gap: 14, padding: '8px 18px 8px 8px', borderRadius: 16, background: U.panel, border: U.border, boxShadow: U.shadow, fontFamily: FONT.sans, fontSize: 36, fontWeight: 600, color: U.text, whiteSpace: 'nowrap', ...NUM}}>
      <div style={{width: 118, height: 66, borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#fff', border: '1.5px solid rgba(255,255,255,0.55)', flex: 'none'}}>
        <Img src={staticFile('v2/sheets/L-103.png')} style={{position: 'absolute', width: 560, left: -78, top: -121, filter: 'url(#v5-neutral) contrast(1.6)'}} />
      </div>
      <div style={{width: 12, height: 12, borderRadius: 6, background: dotColour(dot)}} />
      {text}
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
      <circle cx={r} cy={r} r={r - 2} fill={DAYC.accent} stroke="#fff" strokeWidth={3} />
      <path d={`M${r * 0.52} ${r * 1.02} l${r * 0.32} ${r * 0.32} l${r * 0.62} ${r * -0.66}`} stroke="#fff" strokeWidth={r * 0.18} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
const Leader: React.FC<{from: [number, number]; to: {x: number; y: number; visible: boolean}; a: number}> = ({from, to, a}) =>
  to.visible && a > 0.002 ? (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: a}}>
      <line x1={from[0]} y1={from[1]} x2={to.x} y2={to.y} stroke={U.leader} strokeOpacity={0.5} strokeWidth={2} />
      <circle cx={to.x} cy={to.y} r={7} fill={U.accent} />
    </svg>
  ) : null;
/** v6.5 a card in the deck's typography on dark: a small eyebrow, big type, left-aligned with the deck's margins. */
const DeckCard: React.FC<{eyebrow: string; a: number; solid?: boolean; children: React.ReactNode}> = ({eyebrow, a, solid, children}) => (
  <AbsoluteFill style={{opacity: a, background: solid ? '#0A0E18' : 'linear-gradient(90deg, rgba(6,9,16,0.94) 0%, rgba(6,9,16,0.86) 60%, rgba(6,9,16,0.7) 100%)'}}>
    <div style={{position: 'absolute', left: 110, top: '50%', transform: `translateY(-50%) translateY(${(1 - a) * 10}px)`, fontFamily: FONT.sans, color: '#FFFFFF', ...NUM}}>
      <div style={{fontSize: 30, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: NIGHTC.accent}}>{eyebrow}</div>
      <div style={{marginTop: 22, fontSize: 112, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.04, whiteSpace: 'nowrap'}}>{children}</div>
    </div>
  </AbsoluteFill>
);
const TypeCard: React.FC<{text: string; a: number}> = ({text, a}) => (
  <AbsoluteFill style={{background: U.typeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: a}}>
    <div style={{fontFamily: FONT.sans, fontSize: 140, fontWeight: 700, letterSpacing: -4, color: U.typeText, textAlign: 'center'}}>{text}</div>
  </AbsoluteFill>
);


// ---------------------------------------------------------------- v6.2: on-screen text in the grammar of Eric's deck
// No dark cards: text on clean space, ink on the white day stage, white on the night navy; left-aligned, wide margins.
// An eyebrow (small spaced capitals in the one accent), a short bold headline, a hero number when the beat has one,
// at most one supporting line with its key words bold. Red only for the lift-shaft clash.
const DAYC = {ink: INK, accent: '#2F5FE8', rule: 'rgba(29,32,38,0.16)'};
const NIGHTC = {ink: '#FFFFFF', accent: '#4D7CFF', rule: 'rgba(255,255,255,0.22)'};
// v6.3: one text colour. Every emphasis is the accent; no red anywhere
const RED = DAYC.accent;
/** Mix two #rrggbb colours (k 0 → a, 1 → b). */
class THREE_COLOR {
  c: number[];
  constructor(hex: string) {
    this.c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  mix(hex: string, k: number) {
    const d = new THREE_COLOR(hex).c;
    return `rgb(${this.c.map((v, i) => Math.round(v + (d[i] - v) * k)).join(',')})`;
  }
}
/** "plain **bold** plain" as spans. */
const rich = (s: string) => s.split('**').map((p, i) => (i % 2 ? <b key={i} style={{fontWeight: 700}}>{p}</b> : <span key={i}>{p}</span>));
const EYEBROW: React.CSSProperties = {fontSize: 26, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap'};
type CopySpec = {eyebrow: string; head?: string; chip?: string; num?: string; numLabel?: string; numColour?: string; support?: string};
const Copy: React.FC<CopySpec & {a: number; x?: number; y?: number; w?: number; night?: boolean; headSize?: number; numSize?: number}> = ({eyebrow, head, chip, num, numLabel, numColour, support, a, x = 96, y = 84, w = 900, night = false, headSize = 60, numSize = 132}) => {
  if (a <= 0.002) return null;
  const c = night ? NIGHTC : DAYC;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, opacity: a, transform: `translateY(${(1 - a) * 12}px)`, fontFamily: FONT.sans, color: c.ink, ...NUM}}>
      <div style={{...EYEBROW, color: c.accent}}>{eyebrow}</div>
      {head ? (
        <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 22, rowGap: 10, marginTop: 14}}>
          <div style={{fontSize: headSize, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.08}}>{head}</div>
          {chip ? <div style={{flex: 'none', fontSize: 26, fontWeight: 700, letterSpacing: '0.02em', color: '#FFFFFF', background: c.accent, borderRadius: 999, padding: '6px 18px 8px'}}>{chip}</div> : null}
        </div>
      ) : null}
      {num ? (
        <div style={{display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 24, marginTop: 28}}>
          <div style={{fontSize: numSize, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 0.9, color: numColour ?? c.accent}}>{num}</div>
          {numLabel ? <div style={{fontSize: 36, fontWeight: 500, whiteSpace: 'nowrap'}}>{numLabel}</div> : null}
        </div>
      ) : null}
      {support ? <div style={{marginTop: num ? 28 : 20, fontSize: 36, fontWeight: 400, lineHeight: 1.3}}>{rich(support)}</div> : null}
    </div>
  );
};
/** Clean space for the text: a white wash from the left, or a white column with a hairline at its edge. */
const Page: React.FC<{a: number; kind: 'wash' | 'panel'; w?: number}> = ({a, kind, w = 1000}) =>
  a <= 0.002 ? null : kind === 'panel' ? (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: w, background: '#FFFFFF', opacity: a}} />
      <div style={{position: 'absolute', left: w, top: 0, bottom: 0, width: 1.5, background: DAYC.rule, opacity: a}} />
    </>
  ) : (
    <div style={{position: 'absolute', inset: 0, opacity: a, background: `linear-gradient(90deg, rgba(255,255,255,0.95) 0px, rgba(255,255,255,0.85) ${Math.round(w * 0.6)}px, rgba(255,255,255,0) ${w}px)`}} />
  );
/** A name on a hairline: the eyebrow's voice on a thin ink rule to a point in the scene. */
const Pin: React.FC<{x: number; y: number; dx: number; dy: number; text: string; a: number; colour?: string}> = ({x, y, dx, dy, text, a, colour}) => {
  if (a <= 0.002) return null;
  const ex = x + dx;
  const ey = y + dy;
  return (
    <>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: a, pointerEvents: 'none'}}>
        <line x1={x} y1={y} x2={ex} y2={ey} stroke={INK} strokeOpacity={0.6} strokeWidth={2} />
        <circle cx={x} cy={y} r={6} fill={colour ?? DAYC.accent} stroke="#fff" strokeWidth={2} />
      </svg>
      <div style={{position: 'absolute', left: ex, top: ey, transform: `translate(${dx < 0 ? 'calc(-100% - 12px)' : '12px'}, -50%)`, opacity: a, fontFamily: FONT.sans, ...EYEBROW, color: colour ?? DAYC.accent, textShadow: '0 0 8px #fff, 0 0 3px #fff, 0 0 2px #fff'}}>{text}</div>
    </>
  );
};
/** V2's cards at their times, in the deck's grammar; `fix` replaces the support line when the fix lands. The roof is RoofCut. */
type Card6 = CopySpec & {at: number; until: number; fixAt?: number; fix?: string; numAt?: (t: number) => string; page?: 'wash' | 'panel'; pageW?: number; x?: number; y?: number; w?: number; headSize?: number};
const CARDS6: Card6[] = [
  {at: 21.6, until: 27.2, eyebrow: 'Typical floors · L-103', head: '1 sheet, 4 floors', support: 'The bill priced **1 floor**.', fixAt: 25.4, fix: 'Fix: price **4 floors, 153.6 m²**', x: 1130, y: 84, w: 740, headSize: 58},
  {at: 32.4, until: 35.0, eyebrow: 'L-102 and L-103', head: '2 sheets, 1 drawing', num: '91%', numLabel: 'same line work', fixAt: 34.4, fix: 'Fix: confirm **2 floors**, price each once'},
  {at: 35.3, until: 39.2, eyebrow: 'Podium garden · L-102', head: 'Planter on the lift shaft', chip: 'Send back', num: '3.0 m²', numLabel: 'over the shaft', fixAt: 37.9, fix: 'Fix: move planter **B-10** off the core', page: 'wash', w: 820},
  {at: 39.5, until: 45.5, eyebrow: 'Escape corridor · 8F to 20F', head: 'Planters narrow the escape route', numAt: (t) => `${lerp(0.9, 1.5, plantersOut(t)).toFixed(1)} m`, numLabel: 'minimum 1.2 m', fixAt: 43.6, fix: 'Fix: **halve the planters**', page: 'panel', pageW: 760, w: 600, headSize: 56},
  {at: 54.0, until: 57.3, eyebrow: 'Muse Spark 1.3 · E01', head: '12 lines, 1 tree', num: '95%', numLabel: 'sure, so it asks you', page: 'wash'},
  {at: 66.0, until: 68.7, eyebrow: 'Bill row 6 · camphor trees', head: 'Billed 12 trees, drawn 8', fixAt: 67.6, fix: 'Fix: row 6 to **8 trees, −$516**', page: 'wash'},
  {at: 74.4, until: 77.5, eyebrow: 'Bill row 11 · pavers', head: 'Pavers over your price list', num: '$10,856', numLabel: 'over your list', fixAt: 76.3, fix: 'Fix: reprice at **$71/m²**', page: 'wash'},
];
/** Convex hull (monotone chain) of screen points. */
function hull(ps: [number, number][]): [number, number][] {
  const p = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

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
/** v6.4: the cold open is 3D until 0:09; then the stabilised screen shot (A) only, ending in its last 0.5 s and the push. */
const LIVE6 = [
  {start: 10.0, end: 13.7, clip: 'A', from: 3.74, rate: 1},
  {start: 13.7, end: 14.2, clip: 'A', from: 7.44, rate: 1},
];
const Opening: React.FC<{t: number; fps: number; proxy: boolean}> = ({t, fps, proxy}) => {
  if (t < 10.0 || t >= B.land + 0.1) return null;
  const pushing = t >= PUSH.warp[0];
  // v6.10: no brightness step at the landing: a 0.34 s linear cross-fade, and the photo brightened toward the sheet's white
  const fade = 1 - clamp01((t - 14.72) / 0.34);
  const lift = ov(t, 14.3, 14.95);
  const xf = pushing ? pushMatrix(t) : undefined;
  const big = {position: 'absolute' as const, left: 0, top: 0, width: PUSH.size[0], height: PUSH.size[1], transformOrigin: '0 0', transform: xf, filter: lift > 0.001 ? `brightness(${(1 + 0.2 * lift).toFixed(3)}) contrast(${(1 - 0.08 * lift).toFixed(3)})` : undefined};
  // the margins outside the drawn border turn to paper as the push lands, so the hand-over to the 3D sheet is clean
  const pm = ov(t, B.land - 0.35, B.land - 0.08);
  const [tl, , br] = LAND_QUAD;
  return (
    <AbsoluteFill style={{opacity: fade, background: '#000'}}>
      {LIVE6.map((s, k) => (
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

// ---------------------------------------------------------------- v6.4 the cold open's overlays
/** The deck's hero numbers, huge in cobalt with an ink label, landing on the spoken word. */
const BIGS = [
  {at: 5.1, until: 6.3, num: '30', label: 'files', wash: 900},
  {at: 8.2, until: 10.0, num: '2 weeks', label: 'by hand'},
  {at: 13.0, until: 14.0, num: '10 min', label: 'with Landsight', dark: true},
];
const BigNum: React.FC<{t: number}> = ({t}) => {
  const b = BIGS.find((x) => t >= x.at - 0.2 && t < x.until) as {at: number; until: number; num: string; label: string; dark?: boolean; wash?: number} | undefined;
  if (!b) return null;
  const a = Math.min(ov(t, b.at - 0.18, b.at + 0.1), 1 - ov(t, b.until - 0.22, b.until));
  if (a <= 0.002) return null;
  // on Eric's dark shot: white type with the number in cobalt, over a soft dark gradient only (no white wash)
  const [n0, ...rest] = b.num.split(' ');
  return (
    <>
      {b.dark ? <div style={{position: 'absolute', inset: 0, opacity: a, background: 'linear-gradient(90deg, rgba(6,8,12,0.55) 0px, rgba(6,8,12,0.32) 760px, rgba(6,8,12,0) 1250px)'}} /> : <Page a={a * 0.92} kind="wash" w={b.wash ?? 1300} />}
      <div style={{position: 'absolute', left: 96, top: 300, opacity: a, transform: `scale(${0.93 + 0.07 * a})`, transformOrigin: '0 50%', fontFamily: FONT.sans, whiteSpace: 'nowrap', ...NUM}}>
        <div style={{fontSize: 260, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 0.9, color: b.dark ? '#FFFFFF' : DAYC.accent, textShadow: b.dark ? '0 2px 30px rgba(0,0,0,0.35)' : undefined}}>
          {b.dark ? (
            <>
              <span style={{color: NIGHTC.accent}}>{n0}</span>
              {rest.length ? ` ${rest.join(' ')}` : ''}
            </>
          ) : (
            b.num
          )}
        </div>
        <div style={{fontSize: 54, fontWeight: 500, color: b.dark ? '#FFFFFF' : INK, marginTop: 30, textShadow: b.dark ? '0 1px 18px rgba(0,0,0,0.4)' : undefined}}>{b.label}</div>
      </div>
    </>
  );
};
/** A reviewer's pen on the top sheet of the pile (L-1): ticks, a ring, a cross, a squiggle, a query; drawn one after another. */
const MARKS: {at: number; dur: number; pts: [number, number][]}[] = (() => {
  const out: {at: number; dur: number; pts: [number, number][]}[] = [];
  const tick = (x: number, z: number, k = 1): [number, number][] => [[x - 0.9 * k, z - 0.1 * k], [x - 0.25 * k, z + 0.75 * k], [x + 1.2 * k, z - 1.1 * k]];
  [-31.9, -28.0, -24.1, -20.2, -16.4, -12.0, -8.1, -4.3].forEach((x, i) => out.push({at: 7.8 + i * 0.09, dur: 0.12, pts: tick(x + 1.4, 15.6, 0.9)}));
  out.push({at: 8.55, dur: 0.38, pts: Array.from({length: 40}, (_, k) => {
    const a = -0.3 + (k / 39) * (Math.PI * 2 + 0.55);
    const w = 1 + 0.05 * Math.sin(3 * a);
    return [-23.6 + Math.cos(a) * 9.8 * w, 4.65 + Math.sin(a) * 6.6 * w] as [number, number];
  })});
  out.push({at: 8.98, dur: 0.12, pts: [[-26.6, -6.6], [-23.4, -3.4]]});
  out.push({at: 9.1, dur: 0.12, pts: [[-23.4, -6.6], [-26.6, -3.4]]});
  out.push({at: 9.25, dur: 0.18, pts: tick(-2.5, 4.4, 2.2)});
  out.push({at: 9.45, dur: 0.3, pts: Array.from({length: 14}, (_, k) => [13.6 + (k % 2 ? 0.8 : -0.4), -7 + k * 2.0] as [number, number])});
  out.push({at: 9.7, dur: 0.14, pts: [[24, 10.2], [31, 10.0], [38.5, 10.4]]});
  return out;
})();
const ReviewMarks: React.FC<{t: number}> = ({t}) => {
  if (t < 7.7 || t >= 10.0) return null;
  const s = coldSheetAt(t, 29);
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  const P = (x: number, z: number) => projectAt(t, [s.p.x + x * cy + z * sy, s.p.y + 0.08, s.p.z - x * sy + z * cy]);
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      {MARKS.map((m, k) => {
        const u = clamp01((t - m.at) / m.dur);
        if (u <= 0) return null;
        const q = m.pts.map(([x, z]) => P(x, z));
        let len = 0;
        for (let i = 1; i < q.length; i++) len += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y);
        const d = q.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        return <path key={k} d={d} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - u)} opacity={0.92} />;
      })}
    </svg>
  );
};

// ---------------------------------------------------------------- v6.9 the cold open's files (2D, 3.0–10.0)
/** The Greenfield sample package (samples/greenfield): its 30 real files, a thumbnail for the drawings. L-1 last (on top). */
const FILES: {name: string; ext: string; img?: string; kind?: 'sheet' | 'doc' | 'grid' | 'zip' | 'slides' | 'image'}[] = [
  {name: 'L-0 Cover and Index', ext: 'DXF', img: 'L-0'}, {name: 'L-2 South Elevation', ext: 'DXF', img: 'L-2'}, {name: 'Landscape BOQ rev1', ext: 'XLSX', kind: 'grid'},
  {name: 'street-furniture-quote', ext: 'PDF', kind: 'doc'}, {name: 'L-3 Paving Plan', ext: 'DXF', img: 'L-3'}, {name: 'irrigation quote (old format)', ext: 'XLS', kind: 'grid'},
  {name: 'Planter mood board', ext: 'PPTX', kind: 'slides'}, {name: 'L-4 Plant Schedule', ext: 'DXF', img: 'L-4'}, {name: 'metal-details', ext: 'ZIP', kind: 'zip'},
  {name: 'Landscape BOQ rev2', ext: 'XLSX', kind: 'grid'}, {name: 'Design review notes', ext: 'PDF', kind: 'doc'}, {name: 'L-5 Enlarged Plan - West', ext: 'DXF', img: 'L-5'},
  {name: 'pasted image #1', ext: 'PNG', kind: 'image'}, {name: 'Landscape BOQ rev3 (paving update)', ext: 'XLSX', kind: 'grid'}, {name: 'L-6 Tree Pit Detail', ext: 'DXF', img: 'L-6'},
  {name: 'Planting procurement spec', ext: 'PDF', kind: 'doc'}, {name: 'L-7 Irrigation Plan', ext: 'DXF', img: 'L-7'}, {name: 'Tree pit guide - shallow roots', ext: 'PDF', kind: 'doc'},
  {name: 'Landscape BOQ rev1a', ext: 'XLSX', kind: 'grid'}, {name: 'L-8 Lighting Plan', ext: 'DXF', img: 'L-8'}, {name: 'Green Building Label - required documents', ext: 'PDF', kind: 'doc'},
  {name: 'pasted image #2', ext: 'PNG', kind: 'image'}, {name: 'Tree pit guide - medium roots', ext: 'PDF', kind: 'doc'}, {name: 'L-1 Planting Plan', ext: 'BAK', img: 'L-1-revA'},
  {name: 'Presentation Plan (Colour)', ext: 'PDF', img: 'F-26-p1'}, {name: 'Tree pit guide - deep roots', ext: 'PDF', kind: 'doc'}, {name: 'Landscape Drawings (Full Set)', ext: 'PDF', img: 'F-25-p1'},
  {name: 'L-1 Planting Plan (Rev B)', ext: 'DXF', img: 'L-1-revB'}, {name: 'L-1 Planting Plan (scan)', ext: 'PDF', img: 'L-1-revA'}, {name: 'L-1 Planting Plan', ext: 'DXF', img: 'L-1'},
];
const CARD = {w: 228, h: 150, gx: 18, gy: 18, x0: 430, y0: 180};
/** A card's grid cell (L-1, the last file, sits in the middle). */
const cellOf = (i: number) => (i === FILES.length - 1 ? 14 : i >= 14 ? i + 1 : i);
const cellXY = (c: number) => ({x: CARD.x0 + (c % 6) * (CARD.w + CARD.gx), y: CARD.y0 + Math.floor(c / 6) * (CARD.h + CARD.gy)});
/** The pile: overlapping on purpose, each card turned a little; L-1 on top. */
const PILE = FILES.map((_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const r1 = a - Math.floor(a);
  const b = Math.sin(i * 78.233) * 12345.678;
  const r2 = b - Math.floor(b);
  const top = i === FILES.length - 1;
  return {x: top ? 1330 : 1290 + (r1 - 0.5) * 300, y: top ? 400 : 470 + (r2 - 0.5) * 200, rot: top ? -4 : (r1 - 0.5) * 50, s: top ? 2.3 : 1.35};
});
const FileGlyph: React.FC<{f: (typeof FILES)[number]}> = ({f}) => {
  if (f.img) return <Img src={staticFile(`v2/sheets/${f.img}.png`)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '30% 40%', filter: 'url(#v5-neutral) contrast(1.3)'}} />;
  const ink = 'rgba(29,32,38,0.42)';
  if (f.kind === 'grid')
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
        {[8, 16, 24, 32].map((y) => <line key={y} x1={4} x2={96} y1={y} y2={y} stroke={ink} strokeWidth={0.6} />)}
        {[30, 55, 75].map((x) => <line key={x} x1={x} x2={x} y1={4} y2={36} stroke={ink} strokeWidth={0.6} />)}
      </svg>
    );
  if (f.kind === 'zip') return <svg width="100%" height="100%" viewBox="0 0 100 40"><rect x={44} y={6} width={12} height={28} fill="none" stroke={ink} strokeWidth={1.2} />{[10, 16, 22, 28].map((y) => <line key={y} x1={46} x2={54} y1={y} y2={y} stroke={ink} strokeWidth={1.4} />)}</svg>;
  if (f.kind === 'slides') return <svg width="100%" height="100%" viewBox="0 0 100 40"><rect x={22} y={6} width={56} height={28} fill="none" stroke={ink} strokeWidth={1.2} /><rect x={30} y={12} width={18} height={14} fill={ink} opacity={0.5} /><line x1={54} x2={70} y1={15} y2={15} stroke={ink} strokeWidth={1.4} /><line x1={54} x2={66} y1={21} y2={21} stroke={ink} strokeWidth={1.4} /></svg>;
  if (f.kind === 'image') return <svg width="100%" height="100%" viewBox="0 0 100 40"><rect x={22} y={5} width={56} height={30} fill="#E4E7EB" /><path d="M24 33 L42 18 L54 27 L62 21 L76 33 Z" fill="rgba(29,32,38,0.25)" /><circle cx={64} cy={13} r={3.5} fill="rgba(29,32,38,0.25)" /></svg>;
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 40">
      {[8, 13, 18, 23, 28, 33].map((y, k) => <line key={y} x1={30} x2={k % 3 === 2 ? 58 : 70} y1={y} y2={y} stroke={ink} strokeWidth={1.1} />)}
    </svg>
  );
};
const FileCard: React.FC<{f: (typeof FILES)[number]; marks?: number}> = ({f, marks = 0}) => (
  <div style={{width: CARD.w, height: CARD.h, background: '#FFFFFF', borderRadius: 10, boxShadow: '0 6px 18px rgba(20,24,32,0.14), 0 1px 3px rgba(20,24,32,0.10)', overflow: 'hidden', fontFamily: FONT.sans, position: 'relative'}}>
    <div style={{position: 'absolute', left: 0, top: 0, right: 0, height: 88, background: '#F3F4F6', overflow: 'hidden'}}>
      <FileGlyph f={f} />
      {marks > 0 ? <PenMarks u={marks} /> : null}
    </div>
    <div style={{position: 'absolute', left: 10, top: 96, right: 10, fontSize: 15, fontWeight: 600, lineHeight: 1.18, color: INK, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'}}>{f.name}</div>
    <div style={{position: 'absolute', right: 8, top: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: INK, background: 'rgba(255,255,255,0.92)', border: '1.5px solid rgba(29,32,38,0.55)', borderRadius: 5, padding: '1px 6px'}}>{f.ext}</div>
  </div>
);
/** A reviewer's pen on the top card's drawing: ticks, a ring, a cross; u 0–1 draws them in turn. */
const PenMarks: React.FC<{u: number}> = ({u}) => {
  const P = [
    'M18 64 l6 7 l12 -14', 'M44 64 l6 7 l12 -14', 'M70 64 l6 7 l12 -14',
    'M120 20 c26 -10 60 -6 62 12 c2 18 -40 26 -60 16 c-14 -7 -12 -22 4 -27',
    'M150 58 l18 18 M168 58 l-18 18', 'M196 66 l5 6 l11 -13',
  ];
  return (
    <svg width={CARD.w} height={88} viewBox={`0 0 ${CARD.w} 88`} style={{position: 'absolute', inset: 0}}>
      {P.map((d, k) => {
        const v = clamp01(u * P.length - k);
        return v > 0 ? <path key={k} d={d} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - v} /> : null;
      })}
    </svg>
  );
};
/** 3.0–10.0: the file cards burst out of the first card into a 6 × 5 grid (tilted a little), then tumble into a pile. */
const ColdFiles: React.FC<{t: number}> = ({t}) => {
  if (t < 3.0 || t >= 10.0) return null;
  const n = FILES.length;
  const centre = cellXY(14);
  return (
    <AbsoluteFill style={{background: '#F4F5F7', overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, perspective: 2000, perspectiveOrigin: '60% 40%'}}>
        <div style={{position: 'absolute', inset: 0, transform: 'rotateX(16deg)', transformOrigin: '60% 55%', transformStyle: 'preserve-3d'}}>
          {FILES.map((f, i) => {
            const top = i === n - 1;
            const c = cellXY(cellOf(i));
            // the first card (L-1) comes in big, as the drawing the glide was on, and settles into the middle cell
            const k = top ? 0 : 1 + ((i * 7) % (n - 1));
            const pop = top ? smooth(clamp01((t - 3.0) / 0.55)) : smooth(clamp01((t - (3.35 + k * 0.05)) / 0.4));
            if (!top && pop <= 0) return null;
            const fall = clamp01((t - (6.0 + (top ? 0.9 : (i % 15) * 0.04))) / 0.65);
            const pf = smooth(fall);
            const P = PILE[i];
            let x = top ? lerp(850, centre.x, pop) : lerp(centre.x, c.x, pop);
            let y = top ? lerp(420, centre.y, pop) : lerp(centre.y, c.y, pop);
            let sc = top ? lerp(6.5, 1, pop) : lerp(0.35, 1, pop);
            let rot = 0;
            x = lerp(x, P.x, pf);
            y = lerp(y, P.y, pf) - Math.sin(fall * Math.PI) * 40;
            sc = lerp(sc, P.s, pf);
            rot = lerp(rot, P.rot, pf);
            const marks = top ? clamp01((t - 7.3) / 2.4) : 0;
            return (
              <div key={f.name + i} style={{position: 'absolute', left: x, top: y, transform: `scale(${sc}) rotate(${rot}deg)`, transformOrigin: '50% 50%', zIndex: top ? 100 : i}}>
                <FileCard f={f} marks={marks} />
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- v6.9 the private-mode beat (92.3–98.3): from the findings' light stage to the dark
/** The new beat's start; everything after it in the cues moves +6.0 s (the voice agent's READY2). */
const INSERT_AT = 92.3;
const PrivateMode: React.FC<{t: number}> = ({t}) => {
  const u = t - INSERT_AT;
  if (u < 0 || u >= 6.3) return null;
  const inA = clamp01(u / 0.4);
  const words = 1;
  const dim = ov(u, 0.7, 2.6);
  const out = 1;
  const mixc = (a: string, b: string, k: number) => {
    const ca = new THREE_COLOR(a);
    return ca.mix(b, k);
  };
  const ink = mixc('#1D2026', '#FFFFFF', dim);
  const acc = mixc('#2F5FE8', '#4D7CFF', dim);
  const rule = dim > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(29,32,38,0.18)';
  const flip = ov(u, 2.0, 2.35);
  const lock = ov(u, 3.4, 3.7);
  const res = ov(u, 4.0, 4.4);
  const box = {x: 1180, y: 300, w: 560, h: 400};
  return (
    <AbsoluteFill style={{opacity: inA * out}}>
      <AbsoluteFill style={{background: '#FFFFFF'}} />
      <AbsoluteFill style={{background: '#0A0E18', opacity: dim}} />
      <div style={{position: 'absolute', left: 110, top: 120, fontFamily: FONT.sans, opacity: words, ...NUM}}>
        <div style={{...EYEBROW, fontSize: 28, color: acc}}>Private mode · Muse Spark Open</div>
        <div style={{marginTop: 16, fontSize: 70, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.06, color: ink}}>Your drawings stay with you</div>
      </div>
      {/* the switch: Meta Model API → Muse Spark Open (open weights) */}
      <div style={{position: 'absolute', left: 110, top: 360, display: 'flex', alignItems: 'center', gap: 26, fontFamily: FONT.sans, fontSize: 34, opacity: words, ...NUM}}>
        <div style={{color: ink, opacity: lerp(1, 0.45, flip), fontWeight: flip < 0.5 ? 700 : 500}}>Meta Model API</div>
        <div style={{position: 'relative', width: 104, height: 54, borderRadius: 27, background: flip > 0.5 ? acc : mixc('#C9CDD3', '#3A4152', dim), transition: 'none'}}>
          <div style={{position: 'absolute', top: 5, left: lerp(5, 55, flip), width: 44, height: 44, borderRadius: 22, background: '#FFFFFF', boxShadow: '0 2px 6px rgba(0,0,0,0.25)'}} />
        </div>
        <div style={{color: ink, opacity: lerp(0.45, 1, flip), fontWeight: flip > 0.5 ? 700 : 500}}>Muse Spark Open (open weights)</div>
      </div>
      <div style={{position: 'absolute', left: 110, top: 446, fontFamily: FONT.sans, fontSize: 28, color: ink, opacity: words * lerp(0, 0.75, flip), ...NUM}}>
        Runs on Baseten · <span style={{fontFamily: FONT.mono, fontSize: 26}}>meta-models/muse-spark-open-1026</span>
      </div>
      {/* the drawings slide into the firm's box; the lock closes */}
      <div style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 28, border: `2.5px solid ${ink}`, boxSizing: 'border-box'}}>
        <div style={{position: 'absolute', left: 28, bottom: 22, display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT.sans, fontSize: 32, fontWeight: 700, color: ink}}>
          <svg width={30} height={36} viewBox="0 0 30 36">
            <path d={`M8 ${16 - 4 * (1 - lock)} v-5 a7 7 0 0 1 14 0 v${5 + 4 * (1 - lock)}`} fill="none" stroke={ink} strokeWidth={3} transform={`translate(0 ${-3 * (1 - lock)})`} />
            <rect x={4} y={16} width={22} height={17} rx={3} fill={ink} />
          </svg>
          Your firm
        </div>
      </div>
      {[0, 1, 2, 3, 4].map((k) => {
        const v = smooth(clamp01((u - (0.9 + k * 0.32)) / 0.7));
        const x = lerp(560 + k * 30, box.x + 120 + k * 14, v);
        const y = lerp(560 + k * 26, box.y + 70 + k * 16, v);
        return (
          <div key={k} style={{position: 'absolute', left: x, top: y, width: 300, height: 180, background: '#FFFFFF', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.22)', overflow: 'hidden', opacity: k === 0 ? 1 : ov(u, 0.6 + k * 0.32, 0.9 + k * 0.32), transform: `rotate(${(k - 2) * 2}deg)`}}>
            <Img src={staticFile(`v2/sheets/${['L-1', 'L-3', 'L-6', 'L-102', 'L-103'][k]}.png`)} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'url(#v5-neutral) contrast(1.25)'}} />
          </div>
        );
      })}
      {/* the result: the same */}
      <div style={{position: 'absolute', left: 110, right: 110, top: 830, opacity: res, fontFamily: FONT.sans, ...NUM}}>
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderTop: `1.5px solid ${rule}`, borderBottom: `1.5px solid ${rule}`, padding: '22px 0 20px'}}>
          <div style={{fontSize: 40, color: ink}}>
            <b style={{fontWeight: 700}}>30</b> planted · <b style={{fontWeight: 700}}>28</b> found · <b style={{fontWeight: 700}}>2</b> flagged · <b style={{fontWeight: 700}}>0</b> missed
          </div>
          <div style={{fontSize: 40, fontWeight: 700, color: acc}}>same result</div>
        </div>
      </div>
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
  // v6.2: no panel. The eyebrow, the headline and the depth as the hero number; the section under it on the white stage
  return (
    <>
      <Copy eyebrow="Roof garden · L-104" head="Roof soil too shallow" num={`${depth.toFixed(1)} m`} numLabel="minimum 0.4 m" support={t >= 30.2 ? 'Fix: raise the soil to **0.4 m**' : undefined} a={a} x={1130} y={84} w={740} headSize={58} />
      <svg width={740} height={333} viewBox="40 110 1000 450" style={{position: 'absolute', left: 1112, top: 560, opacity: a}}>
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
        <line x1={110} y1={base} x2={110} y2={base - 0.5 * PX} stroke={INK} strokeOpacity={0.7} strokeWidth={2.5} />
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((m) => (
          <g key={m}>
            <line x1={98} y1={base - m * PX} x2={122} y2={base - m * PX} stroke={INK} strokeOpacity={0.7} strokeWidth={2.5} />
            <text x={86} y={base - m * PX + 11} fill={INK} fillOpacity={0.75} fontFamily={F} fontSize={32} textAnchor="end">{m.toFixed(1)}</text>
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
        <line x1={140} y1={line} x2={800} y2={line} stroke={DAYC.accent} strokeWidth={4} strokeDasharray="14 10" />
        <text x={814} y={line + 12} fill={DAYC.accent} fontFamily={F} fontSize={36} fontWeight={700}>0.4 m</text>
        <line x1={800} y1={base} x2={800} y2={top} stroke={ok ? DAYC.accent : INK} strokeWidth={4} />
        <line x1={788} y1={top} x2={812} y2={top} stroke={ok ? DAYC.accent : INK} strokeWidth={4} />
        <line x1={788} y1={base} x2={812} y2={base} stroke={ok ? DAYC.accent : INK} strokeWidth={4} />
      </svg>
    </>
  );
};

/** v6.2 the pit: the greenery as the hero number (261.1 → 209.9 as the tree shrinks, → 299.5 with the seven trees). */
const Pit: React.FC<{t: number}> = ({t}) => {
  const P = V2.pit;
  const a = win(t, 78.0, 86.9, 0.4);
  if (a <= 0.002) return null;
  const down = ov(t, P.shrink[0], P.shrink[1]);
  const up = ov(t, P.seven, P.pass);
  const v = lerp(lerp(261.1, 209.9, down), 299.5, up);
  const pass = t >= P.pass;
  return (
    <>
      <Page a={a} kind="wash" w={820} />
      <Copy eyebrow="Greenery · tree pits · L-6" head="Big trees count as small" num={v.toFixed(1)} numLabel="of 297 required" support={pass ? 'Fix: **+7 trees**, and it passes.' : 'Pits **1.5 × 1.5 m** on the concrete slab.'} a={a} />
    </>
  );
};

/** The coloured plan (a raster page, no CAD): SAM 3.1's real masks fill one by one; the list in the right third. */
const SAM_PLAN = (() => {
  const [x0, y0, x1, y1] = sam.crop;
  const k = 900 / (x1 - x0);
  return {x0, y0, k, left: 48, top: 60, w: 900, h: (y1 - y0) * k};
})();
// v6: every word at 34 px or more, so the plan is narrower and the table wider
const COLS = {swatch: 48, what: 400, sam: 130, dwg: 156, diff: 150};
const Raster: React.FC<{t: number}> = ({t}) => {
  const a = win(t, B.raster, B.bills, 0.45);
  if (a <= 0) return null;
  const S = SAM_PLAN;
  const rowAt = (k: number) => B.raster + 0.7 + k * 1.45;
  const fmt = (r: (typeof sam.rows)[number], v: number) => (r.kind === 'symbols' ? String(Math.round(v)) : v.toFixed(1));
  const cell = (w: number, extra: React.CSSProperties = {}): React.CSSProperties => ({width: w, flex: 'none', boxSizing: 'border-box', ...extra});
  // v6.5: the deck's grammar on white: the colour plan as a sheet with SAM's masks; beside it a short table, numbers in cobalt
  return (
    <AbsoluteFill style={{opacity: a, background: '#FFFFFF', color: INK, fontFamily: FONT.sans, ...NUM}}>
      <div style={{position: 'absolute', left: S.left, top: S.top, width: S.w, height: S.h, overflow: 'hidden', background: '#ffffff', border: `1.5px solid ${DAYC.rule}`}}>
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
                  <path key={j} d={'M' + ring.map(([x, y]) => `${((x - S.x0) * S.k).toFixed(1)} ${((y - S.y0) * S.k).toFixed(1)}`).join('L') + 'Z'} pathLength={1} fill={DAYC.accent} fillOpacity={0.28 * fill} stroke={DAYC.accent} strokeWidth={3.5} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{position: 'absolute', left: 1010, top: 84, width: 860}}>
        <div style={{...EYEBROW, color: DAYC.accent}}>SAM 3.1 · colour plan</div>
        <div style={{fontSize: 58, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.08, marginTop: 14}}>SAM 3.1 measures every patch</div>
        <div style={{display: 'flex', alignItems: 'flex-end', marginTop: 48, paddingBottom: 12, fontSize: 30, fontWeight: 600, color: INK, opacity: 0.62, borderBottom: `1.5px solid ${DAYC.rule}`}}>
          <div style={cell(470)}>What</div>
          <div style={cell(190, {textAlign: 'right'})}>SAM 3.1</div>
          <div style={cell(200, {textAlign: 'right'})}>Drawings</div>
        </div>
        {sam.rows.map((r, k) => {
          const ra = ov(t, rowAt(k) + 0.3, rowAt(k) + 0.8);
          return (
            <div key={r.what} style={{display: 'flex', alignItems: 'center', height: 96, borderBottom: `1.5px solid ${DAYC.rule}`, opacity: ra}}>
              <div style={cell(470, {display: 'flex', alignItems: 'center', gap: 18, whiteSpace: 'nowrap'})}>
                <div style={{width: 26, height: 26, borderRadius: 5, background: r.plan_colour, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)', flex: 'none'}} />
                <div style={{fontSize: 38, fontWeight: 600}}>{r.what}</div>
                <div style={{fontSize: 30, opacity: 0.55}}>{r.kind === 'symbols' ? 'count' : 'm²'}</div>
              </div>
              <div style={cell(190, {textAlign: 'right', fontSize: 44, fontWeight: 700, color: DAYC.accent})}>{fmt(r, r.sam * ov(t, rowAt(k) + 0.3, rowAt(k) + 1.0))}</div>
              <div style={cell(200, {textAlign: 'right', fontSize: 44, fontWeight: 500})}>{r.kind === 'symbols' ? String(r.drawings) : Number(r.drawings).toFixed(1)}</div>
            </div>
          );
        })}
        <div style={{marginTop: 28, fontSize: 36, lineHeight: 1.3, opacity: ov(t, rowAt(3) + 0.8, rowAt(3) + 1.2)}}>
          Fire lane: <b style={{fontWeight: 700}}>a tree is drawn over it.</b>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Findings: React.FC<{t: number}> = ({t}) => {
  const F = V2.findings;
  const a = win(t, F.at, Math.min(B.type, INSERT_AT + 0.4), 0.4);
  if (a <= 0) return null;
  // v6.2: a short three-group table (thin rules, accent left, ink right) and the total as the hero number
  const rows: [string, string, string, number][] = [
    ['Send back', '6', 'drawing errors', 0],
    ['Fix before pricing', '4', 'bill errors', 1.1],
    ['Building code', '3', 'rules missed', 2.0],
  ];
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: 'rgba(255,255,255,0.94)'}} />
      <Copy eyebrow="Findings · one package" head="Send the nonsense back" a={1} />
      <div style={{position: 'absolute', left: 96, top: 330, width: 900, fontFamily: FONT.sans, ...NUM}}>
        {rows.map(([g, n, what, d], k) => (
          <div key={g} style={{display: 'flex', alignItems: 'baseline', padding: '26px 0 24px', borderTop: `1.5px solid ${DAYC.rule}`, borderBottom: k === rows.length - 1 ? `1.5px solid ${DAYC.rule}` : undefined, opacity: ov(t, F.at + d, F.at + d + 0.3)}}>
            <div style={{width: 470, fontSize: 42, fontWeight: 700, letterSpacing: '-0.01em', color: DAYC.accent}}>{g}</div>
            <div style={{fontSize: 42, color: INK}}>
              <b style={{fontWeight: 700}}>{n}</b> {what}
            </div>
          </div>
        ))}
      </div>
      <div style={{position: 'absolute', left: 1130, top: 330, opacity: ov(t, F.at + 3.0, F.at + 3.4), fontFamily: FONT.sans, ...NUM}}>
        <div style={{fontSize: 150, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 0.9, color: DAYC.accent}}>{F.total.replace(' to query', '')}</div>
        <div style={{fontSize: 38, fontWeight: 500, color: INK, marginTop: 22}}>to query</div>
      </div>
    </AbsoluteFill>
  );
};

/** v6.2: one large L-103 sheet beside the explode, a leader from it to each of the four typical floors. */
const SHEET_CARD = {x: 1130, y: 300, w: 740, h: Math.round((740 * 2281) / 4200)};
const OneSheet: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 22.0, 27.2);
  if (a <= 0.002) return null;
  const C = SHEET_CARD;
  const from: [number, number] = [C.x - 3, C.y + C.h / 2];
  const ends = ['8', ...V2.typical.floors].map((f, k) => {
    const d = drawerAt(t, f);
    const sc = drawerScale(t, f);
    const pl = plateAt(t, f);
    const p = projectAt(t, [pl[0] + 14 * sc, pl[1] - 0.5 + 1.7 * sc, pl[2] + sc]);
    const fa = Math.min(clamp01((d.out - 0.2) / 0.4), win(t, k === 0 ? 22.0 : V2.typical.lit + (k - 1) * V2.typical.step + 0.2, 27.2));
    return {f, p, fa};
  });
  return (
    <>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        {ends.map(({f, p, fa}) =>
          p.visible && fa > 0.002 ? (
            <g key={f} opacity={fa * a}>
              <line x1={from[0]} y1={from[1]} x2={p.x} y2={p.y} stroke={DAYC.accent} strokeWidth={2.5} />
              <circle cx={p.x} cy={p.y} r={8} fill={DAYC.accent} stroke="#fff" strokeWidth={2.5} />
            </g>
          ) : null,
        )}
        <circle cx={from[0]} cy={from[1]} r={7} fill={DAYC.accent} opacity={a} />
      </svg>
      {ends.map(({f, p, fa}) =>
        p.visible && fa > 0.002 ? (
          <div key={f} style={{position: 'absolute', left: p.x + 18, top: p.y - 40, opacity: fa * a, fontFamily: FONT.sans, fontSize: 32, fontWeight: 700, color: INK, textShadow: '0 0 8px #fff, 0 0 3px #fff', ...NUM}}>{`${f}F`}</div>
        ) : null,
      )}
      <div style={{position: 'absolute', left: C.x, top: C.y, width: C.w, height: C.h, opacity: a, background: '#FFFFFF', border: `1.5px solid ${DAYC.rule}`, overflow: 'hidden'}}>
        <Img src={staticFile('v2/sheets/L-103.png')} style={{width: '100%', height: '100%', display: 'block', filter: 'url(#v5-neutral)'}} />
      </div>
    </>
  );
};

/** v6.3 the lift on L-102's drawer (V2): the shaft and the planter named, in the eyebrow's voice. */
const LiftPins: React.FC<{t: number}> = ({t}) => {
  const d = drawerAt(t, '5');
  if (d.out < 0.3) return null;
  const y0 = levelAt(t, '5') + 0.45;
  const hx = TX + d.dx + SHAFT.x;
  const hz = TZ + d.dz + SHAFT.z;
  const hole = projectAt(t, [hx - 0.7, y0 - 1.2, hz + 0.9]);
  const pl = projectAt(t, [hx + lerp(1.55, 4.3, planterSlide(t)) + 1.0, y0 + 0.9, hz + 1.0]);
  return (
    <>
      {hole.visible ? <Pin x={hole.x} y={hole.y} dx={-190} dy={110} text="Lift shaft" a={win(t, 36.0, 39.3)} /> : null}
      {pl.visible ? <Pin x={pl.x} y={pl.y} dx={170} dy={-90} text="Planter B-10" a={win(t, 36.3, 39.3)} /> : null}
      {pl.visible ? <Check x={pl.x} y={pl.y - 70} a={ov(t, 38.5, 38.9)} /> : null}
    </>
  );
};

/**
 * v6.3 the stair at the end of the corridor, drawn as a floor plan does (inside its footprint, 3 × 6 m): a dog-leg of two
 * flights side by side with a landing at the north end and a wall between them, treads at 0.28 m, a handrail along each
 * flight, a diagonal break line across the upper flight, the UP arrow from the first tread, the enclosure in thick ink.
 * Every line at one plan cut (1.2 m), so walls, treads and rails line up.
 */
const StairPlan: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 39.7, 45.8, 0.4);
  if (a <= 0.002) return null;
  const y = levelAt(t, '8');
  const [sx0, sz0, sx1, sz1] = PKG.stair;
  const P = (x: number, z: number, h = 1.2) => {
    const p = projectAt(t, [TX + x, y + h, TZ + z]);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  };
  const L = (x0: number, z0: number, x1: number, z1: number, h = 1.2) => `M${P(x0, z0, h)} L${P(x1, z1, h)}`;
  const mid = sx0 + 1.5;
  const land = sz0 + 1.4;
  const treads: string[] = [];
  for (let z = land + 0.28; z < sz1 - 0.05; z += 0.28) {
    treads.push(L(sx0 + 0.1, z, mid - 0.1, z));
    treads.push(L(mid + 0.1, z, sx1 - 0.1, z));
  }
  // the break: a zig-zag diagonal across the upper (east) flight
  const bz = land + 2.3;
  const brk = `M${P(mid + 0.1, bz + 0.5)} L${P(mid + 0.6, bz + 0.15)} L${P(mid + 0.75, bz + 0.45)} L${P(sx1 - 0.1, bz - 0.05)}`;
  const ink = INK;
  const ax = sx0 + 0.75;
  const arrow = `M${P(ax, sz1 - 0.3)} L${P(ax, land + 0.4)} L${P(mid + 0.75, land + 0.4)} L${P(mid + 0.75, bz + 0.6)}`;
  const tip = projectAt(t, [TX + mid + 0.75, y + 1.2, TZ + bz + 0.6]);
  const tip0 = projectAt(t, [TX + mid + 0.75, y + 1.2, TZ + bz + 0.2]);
  const up = projectAt(t, [TX + ax + 0.32, y + 1.2, TZ + sz1 - 0.55]);
  const ang = Math.atan2(tip.y - tip0.y, tip.x - tip0.x);
  const hd = (s: number) => `${(tip.x + Math.cos(ang + s) * 18).toFixed(1)},${(tip.y + Math.sin(ang + s) * 18).toFixed(1)}`;
  const wallH = 1.2;
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: a, pointerEvents: 'none'}}>
      <path d={`M${P(sx0, sz0, wallH)} L${P(sx1, sz0, wallH)} L${P(sx1, sz1, wallH)} L${P(sx0, sz1, wallH)}`} fill="none" stroke={ink} strokeWidth={8} strokeLinejoin="miter" />
      <path d={`M${P(sx0 + 0.02, sz0, wallH)} L${P(sx0 + 0.02, sz0 + 0.9, wallH)}`} stroke={ink} strokeWidth={8} />
      <path d={L(mid, land, mid, sz1)} stroke={ink} strokeWidth={5} />
      <path d={treads.join(' ')} stroke={ink} strokeWidth={1.5} />
      <path d={L(sx0 + 0.1, land, sx1 - 0.1, land)} stroke={ink} strokeWidth={1.5} />
      <path d={`${L(mid - 0.22, land + 0.05, mid - 0.22, sz1 - 0.05)} ${L(mid + 0.22, land + 0.05, mid + 0.22, sz1 - 0.05)}`} stroke={ink} strokeWidth={1.5} />
      <path d={brk} fill="none" stroke={ink} strokeWidth={2.5} />
      <path d={arrow} fill="none" stroke={DAYC.accent} strokeWidth={2.5} />
      <path d={`M${hd(Math.PI - 0.45)} L${tip.x.toFixed(1)},${tip.y.toFixed(1)} L${hd(Math.PI + 0.45)}`} fill="none" stroke={DAYC.accent} strokeWidth={2.5} />
      <text x={up.x} y={up.y} fill={DAYC.accent} fontFamily={FONT.sans} fontSize={26} fontWeight={700} letterSpacing="0.12em">UP</text>
    </svg>
  );
};

/** v6.8 the two alike sheets as paper (no building): side by side, L-102 slides onto L-103, the shared linework lights cobalt, the titles circled. */
const ALIKE = {w: 900, h: Math.round((900 * 2281) / 4200), y: 400, xL: 40, xR: 980};
const AlikeSheets: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 31.95, 35.0, 0.35);
  if (a <= 0.002) return null;
  const A = ALIKE;
  const slide = ov(t, 32.7, 33.6);
  const lit = ov(t, 33.6, 34.1);
  const ring = ov(t, 33.9, 34.6);
  const x2 = lerp(A.xL, A.xR, slide);
  // once overlapped, the pair moves to the middle and grows (about 1.4×), so the cobalt lines and the rings read on a phone
  const grow = ov(t, 33.65, 34.15);
  // the lines are thin at this size: darkened first (contrast) so the shared cobalt reads
  const img = (src: string, cobalt = false): React.CSSProperties => ({position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', filter: cobalt ? 'url(#v5-neutral) contrast(3) url(#cobaltize)' : 'url(#v5-neutral) contrast(1.4)'});
  const box: React.CSSProperties = {position: 'absolute', top: A.y, width: A.w, height: A.h};
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: '#FFFFFF'}} />
      <AbsoluteFill style={{transform: `translate(${lerp(0, -140, grow)}px, ${lerp(0, 40, grow)}px) scale(${lerp(1, 1.22, grow)})`, transformOrigin: `${A.xR + A.w / 2}px ${A.y + A.h / 2}px`}}>
      {/* L-103 stays; L-102 slides over it (multiply: both drawings show; where they match the lines coincide) */}
      <div style={{...box, left: A.xR, background: '#fff', border: `1.5px solid ${DAYC.rule}`, boxShadow: '0 10px 28px rgba(29,32,38,0.10)', overflow: 'hidden', isolation: 'isolate'}}>
        <Img src={staticFile('v2/sheets/L-103.png')} style={{...img(''), opacity: 1 - 0.75 * lit}} />
      </div>
      <div style={{...box, left: x2, overflow: 'hidden', mixBlendMode: 'multiply', border: slide < 0.98 ? `1.5px solid ${DAYC.rule}` : undefined, background: '#fff'}}>
        <Img src={staticFile('v2/sheets/L-102.png')} style={{...img(''), opacity: 1 - 0.75 * lit}} />
      </div>
      {/* the shared linework: both drawings in cobalt, lightened together (only lines in both survive), laid on with darken */}
      {lit > 0.01 ? (
        <div style={{...box, left: A.xR, overflow: 'hidden', isolation: 'isolate', mixBlendMode: 'darken', opacity: lit}}>
          <Img src={staticFile('v2/sheets/L-103.png')} style={img('', true)} />
          <Img src={staticFile('v2/sheets/L-102.png')} style={{...img('', true), mixBlendMode: 'lighten'}} />
        </div>
      ) : null}
      {/* the two titles, different, circled in the title block */}
      {ring > 0.01 ? (
        <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
          {[[0.245, 0.105, 0.135, 0.05], [0.83, 0.68, 0.145, 0.045]].map(([x, y, rx, ry], k) => (
            <ellipse key={k} cx={A.xR + A.w * x} cy={A.y + A.h * y} rx={A.w * rx} ry={A.h * ry} fill="none" stroke={INK} strokeWidth={4} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - clamp01(ring * 2 - k)} transform={`rotate(-3 ${A.xR + A.w * x} ${A.y + A.h * y})`} />
          ))}
        </svg>
      ) : null}
      <div style={{position: 'absolute', left: A.xL, top: A.y + A.h + 14, opacity: 1 - slide, fontFamily: FONT.sans, ...EYEBROW, color: DAYC.accent}}>L-102</div>
      <div style={{position: 'absolute', left: A.xR, top: A.y + A.h + 14, opacity: 1 - grow, fontFamily: FONT.sans, ...EYEBROW, color: DAYC.accent}}>{slide > 0.98 ? 'L-102 on L-103' : 'L-103'}</div>
      </AbsoluteFill>
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
      <Card dot="none" title="What you see" sub="1 tree" a={a} x={64} y={64} size={46} />
      <Card dot="blue" title="What a computer sees" sub="12 loose lines" a={a} x={1024} y={64} size={46} />
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

/** v6.7 captions show numbers as digits (display only: captions() keeps aligning to the spoken words). */
const NUMERALS: [RegExp, string][] = [
  [/thirty files/g, '30 files'], [/two weeks/g, '2 weeks'], [/ten minutes/g, '10 min'], [/two minutes/g, '2 min'],
  [/One sheet covers four floors/g, '1 sheet covers 4 floors'], [/The bill priced one\./g, 'The bill priced 1.'], [/the other three/g, 'the other 3'],
  [/thirty centimetres/g, '0.3 m'], [/The rule says forty\./g, 'The rule says 0.4 m.'], [/Two sheets\?/g, '2 sheets?'], [/ninety centimetres/g, '0.9 m'],
  [/one-twenty/g, '1.2 m'], [/twelve loose lines/g, '12 loose lines'], [/sees one tree/g, 'sees 1 tree'], [/a hundred and ninety-five square metres/g, '195 m²'],
  [/say two hundred/g, 'say 200'], [/The bill says twelve\./g, 'The bill says 12.'], [/Eight are drawn/g, '8 are drawn'], [/One hedge label/g, '1 hedge label'],
  [/a hundred and eighty-two plants/g, '182 plants'], [/Ten thousand over/g, '$10,000 over'], [/Seven more trees/g, '7 more trees'], [/thirty errors/g, '30 errors'],
  [/twenty-eight/g, '28'], [/flagged two, missed none/g, 'flagged 2, missed 0'],
];
const numerals = (text: string) => NUMERALS.reduce((s, [re, to]) => s.replace(re, to), text);
const Caption: React.FC<{t: number}> = ({t}) => {
  const c = CAPS.find((x) => t >= x.start && t < x.end);
  if (!c) return null;
  // v6.2: one line, a clean, small, quiet pill: white with ink by day (and over the footage), navy at night
  const night = t >= CLOSE_AT;
  const dip = 1 - ov(t, LOGO_AT - 0.35, LOGO_AT - 0.05);
  if (dip <= 0.002) return null;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 40, textAlign: 'center', opacity: dip}}>
      <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 38, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.2, color: night ? '#FFFFFF' : INK, background: night ? 'rgba(8,16,40,0.62)' : 'rgba(255,255,255,0.9)', border: night ? '1px solid rgba(255,255,255,0.16)' : '1px solid rgba(29,32,38,0.1)', padding: '8px 22px 9px', borderRadius: 999, whiteSpace: 'nowrap', ...NUM}}>{numerals(c.text)}</span>
    </div>
  );
};

export const FilmV6: React.FC<FilmV6Props> = ({sheets, proxy = false, timecode = false, sound = true, endCard = 'default', previewBeat = false}) => {
  const ext = endCard === 'extended';
  U = DAY.ui;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  // check stills only: before the cues move +6 s (READY2), hide what the old timing puts over the new beat
  const beatOnly = previewBeat && t >= INSERT_AT && t < INSERT_AT + 6.3;
  const part1World = t >= B.land - 0.45 && t < Math.min(B.type, INSERT_AT + 0.6) && !(t > B.raster + 0.5 && t < B.bills - 0.45);
  const endWorld = t >= CLOSE_AT;
  const duskU = clamp01((t - CLOSE_AT) / (LOGO_AT + END.hold - CLOSE_AT));
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      {/* the scans' cream paper, neutralised to white for the 2D plans */}
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id="v5-neutral" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1.032 0 0 0 0 0 1.041 0 0 0 0 0 1.0625 0 0 0 0 0 1 0" />
        </filter>
        {/* v6.8: a drawing's ink as cobalt on white (white stays white, the darkest line becomes #2F5FE8) */}
        <filter id="cobaltize" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.1735 0.5836 0.0589 0 0.184  0.1333 0.4484 0.0453 0 0.373  0.0191 0.0644 0.0065 0 0.910  0 0 0 1 0" />
        </filter>
      </svg>
      {t < 3.0 && sheets ? <WorldV6 t={t} sheets={sheets} l1={L1_PNG} cold /> : null}
      <ColdFiles t={t} />
      {part1World && sheets ? <WorldV6 t={Math.max(t, B.push)} sheets={sheets} l1={L1_PNG} /> : null}
      {endWorld && sheets ? <WorldV6 t={200} sheets={sheets} l1={L1_PNG} dusk={duskU} /> : null}

      {/* the opening: Eric's footage, his voice; the push into his monitor */}
      <Opening t={t} fps={fps} proxy={proxy} />
      <BigNum t={t} />
      {sound ? <Audio src={staticFile('v2/audio/mix.wav')} /> : null}

      {/* the stack: the first sheet, then the footprint the tower lands on */}
      {/* v6.3: the opening carries no labels: the glide, the build, the site in context */}

      {/* the typical floors: one L-103 sheet, four leaders (v6.2) */}
      {t >= 21.8 && t < 27.2 ? <OneSheet t={t} /> : null}

      {/* the roof: the cut-away, with its leader to L-104's drawer */}
      {t >= 28.2 && t < 31.9 ? <Leader from={[1112, 726]} to={projectAt(t, [plateAt(t, 'R')[0] + 8.5, plateAt(t, 'R')[1] + 0.3, plateAt(t, 'R')[2] + 5.75])} a={win(t, 28.4, 31.9) * 0.9} /> : null}
      <RoofCut t={t} />

      {/* the two alike sheets: the text says it (v6.4: the old pill label is gone) */}

      {/* the escape corridor from above: the person, the dimension, the fix */}
      {t >= 41.0 && t < 45.9 ? (() => {
          const p = projectAt(t, personWorld(t));
          const pa = personAt(t).a;
          const c = corridorAt(t);
          const ea = projectAt(t, c.a);
          const eb = projectAt(t, c.b);
          const dimA = win(t, 42.3, 45.9);
          const pOut = plantersOut(t);
          const ok = pOut > 0.95;
          // v6.4: the gap is annotation, so its dimension line is cobalt (the planters stay green)
          const col = DAYC.accent;
          return (
            <>
              {p.visible ? (() => {
                // v6.11: seen from above the person faces the way they walk (east, along the corridor): the shoulders across
                // the path, the head a little forward with a nose; the heading is the path's direction on screen, also when stopped
                const w = personWorld(t);
                const q = projectAt(t, [w[0] + 1, w[1], w[2]]);
                const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
                return (
                  <div style={{position: 'absolute', left: p.x, top: p.y, width: 0, height: 0, opacity: pa, transform: `rotate(${ang.toFixed(2)}deg)`}}>
                    <div style={{position: 'absolute', left: -20, top: -42, width: 40, height: 84, borderRadius: 20, background: '#fff', border: `5px solid ${PAL.ink}`, boxSizing: 'border-box'}} />
                    <div style={{position: 'absolute', left: -20, top: -26, width: 52, height: 52, borderRadius: 26, background: '#fff', border: `5px solid ${PAL.ink}`, boxSizing: 'border-box'}} />
                    <div style={{position: 'absolute', left: 30, top: -7, width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: `11px solid ${PAL.ink}`}} />
                  </div>
                );
              })() : null}
              {ea.visible && eb.visible && dimA > 0 ? (
                <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: dimA}}>
                  <line x1={ea.x} y1={ea.y} x2={eb.x} y2={eb.y} stroke={col} strokeWidth={6} />
                  {[ea, eb].map((e, k) => (
                    <line key={k} x1={e.x - 20} y1={e.y} x2={e.x + 20} y2={e.y} stroke={col} strokeWidth={6} />
                  ))}
                </svg>
              ) : null}
              {p.visible ? <Check x={p.x + 90} y={p.y - 70} a={ov(t, 45.0, 45.3)} /> : null}
            </>
          );
        })() : null}

      {t >= 39.5 && t < 45.8 ? <StairPlan t={t} /> : null}

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
              <div style={{position: 'absolute', left: p.x, top: p.y, padding: '14px 28px', borderRadius: 14, background: click > 0.6 ? '#1F46B8' : solid(), color: '#fff', fontFamily: FONT.sans, fontSize: 38, fontWeight: 600, boxShadow: U.shadow, opacity: win(t, 54.8, 57.4)}}>{click > 0.6 ? 'Confirmed · 8 trees' : 'Confirm 1 tree'}</div>
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
          void lead;
          // v6.5: eyebrow, headline, the count as the hero number, one support line (the old cards and the pill are gone)
          return (
            <>
              <Page a={a} kind="wash" w={1100} />
              <Copy eyebrow="Hedge · L-1" head="1 note, 182 plants" num={String(Math.max(n, 0))} numLabel="plants" support={t >= 70.2 ? 'The bill prices **27 m**.' : undefined} a={a} />
            </>
          );
        })() : null}

      {/* the pit (v6.2): the greenery as the hero number */}
      {t >= 77.8 && t < 87.0 ? <Pit t={t} /> : null}

      {/* the findings; the private-mode beat (the day-to-night bridge); the big type on black; the hard cut */}
      <Findings t={t} />
      <PrivateMode t={t} />
      {!beatOnly && t >= B.type - 0.2 && t < PART2_AT ? <DeckCard eyebrow="1 landscape package" a={ov(t, B.type - 0.2, B.type)} solid>
          <span style={{color: NIGHTC.accent}}>2</span> weeks → <span style={{color: NIGHTC.accent}}>10</span> min
        </DeckCard> : null}

      <AlikeSheets t={t} />

      {/* the cards (v6.2) in the deck's grammar at V2's times: eyebrow, headline, a hero number; the fix swaps the support */}
      {CARDS6.map((c) => {
        const a = win(t, c.at, c.until);
        if (a <= 0) return null;
        const fixed = c.fixAt !== undefined && t >= c.fixAt;
        return (
          <div key={c.eyebrow}>
            {c.page ? <Page a={a} kind={c.page} w={c.pageW} /> : null}
            <Copy {...c} num={c.numAt ? c.numAt(t) : c.num} support={fixed ? c.fix : c.support} a={a} />
          </div>
        );
      })}

      {/* the lift shaft (v6.2): the shaft alone, the car in it, B-10 on top; the overlap outlined in red (over the wash) */}
      {t >= 35.6 && t < 39.3 ? <LiftPins t={t} /> : null}

      {/* Part 2: the capture, its holds cut, full-bleed */}
      {!beatOnly && t >= PART2_AT - 0.1 && t < CLOSE_AT + 0.1 ? <Part2 fps={fps} proxy={proxy} /> : null}

      {/* large type over the end of Part 2, one card at a time */}
      {BIG.map((b) => {
        // v6.5: the deck's typography: the subject as the eyebrow, the rest as the big line (no em-dash)
        const a = win(t, b.at, b.until, 0.3);
        const [head, rest] = b.text.split(' — ');
        const line = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : head;
        return a > 0.002 ? (
          <DeckCard key={b.text} eyebrow={rest ? head : 'Landsight'} a={a}>
            {line}
          </DeckCard>
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
              {/* v6.2: white on the night navy, the deck's grammar; about fifteen words before the closing line */}
              <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(5,11,30,0.9) 0%, rgba(5,11,30,0.74) 38%, rgba(5,11,30,0) 64%)', opacity: 1 - veil}} />
              <div style={{position: 'absolute', left: 110, top: 236, width: 1240, opacity: 1 - veil, fontFamily: FONT.sans, color: '#FFFFFF', ...NUM}}>
                <div style={{...EYEBROW, color: NIGHTC.accent, opacity: ov(u, 0.3, 0.65)}}>Landsight</div>
                <div style={{marginTop: 18, fontSize: 58, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, maxWidth: 1180, opacity: ov(u, 0.8, 1.15), transform: `translateX(${(1 - ov(u, 0.8, 1.15)) * -14}px)`}}>
                  {ext ? 'Muse Spark 1.3 reads. SAM 3.1 measures. Muse Wonder remembers.' : 'Muse Spark 1.3 reads. SAM 3.1 measures.'}
                </div>
                {ext ? <div style={{marginTop: 12, fontSize: 34, fontWeight: 500, opacity: 0.82 * ov(u, 1.3, 1.65)}}>Private mode on Muse Spark Open, running on Baseten.</div> : null}
                <div style={{marginTop: 26, fontSize: 40, fontWeight: 400, lineHeight: 1.3, opacity: ov(u, 2.2, 2.55)}}>
                  <b style={{fontWeight: 700, color: NIGHTC.accent}}>30</b> planted errors · <b style={{fontWeight: 700, color: NIGHTC.accent}}>28</b> found · <b style={{fontWeight: 700, color: NIGHTC.accent}}>0</b> missed
                </div>
                <div style={{width: 120, height: 2, background: NIGHTC.rule, marginTop: 52, opacity: ov(u, END.line, END.line + 0.4)}} />
                <div style={{marginTop: 40, fontSize: 70, fontWeight: 700, letterSpacing: -1.8, lineHeight: 1.08, whiteSpace: 'nowrap', opacity: ov(u, END.line, END.line + 0.4)}}>Every number, traced to the drawing.</div>
              </div>
              <AbsoluteFill style={{background: U.logoBg, opacity: veil, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                <Img src={staticFile(`v2/logo-lockup-${U.logo}.svg`)} style={{height: 160, opacity: logoIn, transform: `scale(${lerp(0.95, 1, logoIn)})`}} />
                <div style={{fontFamily: FONT.sans, fontSize: 36, fontWeight: 500, marginTop: 48, color: U.endText, opacity: 0.88 * logoIn}}>landsight.co</div>
                <div style={{fontFamily: FONT.sans, fontSize: 34, marginTop: 14, color: U.endText, opacity: 0.6 * logoIn}}>{ext ? "Built with Meta's Muse Spark 1.3, SAM 3.1, Muse Wonder and Muse Spark Open" : 'Built with Muse Spark 1.3 and SAM 3.1'}</div>
              </AbsoluteFill>
            </>
          );
        })() : null}

      {!beatOnly ? <Caption t={t} /> : null}
      {timecode ? (
        <div style={{position: 'absolute', right: 18, top: 14, fontFamily: FONT.sans, fontSize: 18, fontWeight: 500, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '3px 9px', borderRadius: 6, ...NUM}}>
          {`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** The sheets in stacking order: L-6 first (the opening lands on it), then as v11. */
export const FILM_V6_SHEETS: WorldSheet[] = ['L-6', 'L-102', 'L-103', 'L-104', 'L-101', 'L-301', 'L-501', 'L-0', 'L-1-revB', 'L-1-revA', 'L-2', 'L-3', 'L-4', 'L-5', 'L-7', 'L-8', 'F-24-p1', 'F-25-p1', 'F-25-p2', 'F-25-p3', 'F-25-p4', 'F-25-p5', 'F-25-p6', 'F-25-p7', 'F-25-p8', 'F-25-p9', 'F-26-p1', 'L-3.filled', 'L-1-revB.filled'].map((id) => ({id, png: `v2/sheets/${id}.png`}));
export {CAP};
