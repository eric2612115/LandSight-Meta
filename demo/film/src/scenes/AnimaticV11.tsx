import {AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {B, CAP, CLOSE_AT, COVER, END, LOGO_AT, PART2_AT, SEGMENTS, V11, filmToCap, timed} from './animatic-v11-cues.js';
import {FOOT, HEDGE, L1, PT, ROW, SEVEN, SHAFT, T8, WorldV11, corridorAt, countedAt, drawerAt, hedgeGrow, personAt, personWorld, pieceEnds, pieceHeight, pitShrink, plantersOut, planterSlide, plateAt, projectAt, riseAt, sevenAt} from './WorldV11';
import type {WorldSheet} from './WorldV11';
import t08 from './t08.json';
import sam from './sam-v11.json';

/**
 * Film v11 animatic (demo/SCRIPT-V11.md). Eric opens (three grey slots); the camera pushes into his monitor onto
 * L-101, holds, and pulls back into the world (WorldV11), where the sheets stack into the tower on L-1's footprint.
 * Every problem is a screen-space card with its green fix under it, and the scene shows it: the typical floor and the
 * three floors it stands for, the roof planter cut away, the open lift shaft, the corridor seen from above, the tree
 * as twelve lines, the coloured plan with SAM 3.1's real masks and the list, the bill's count, the hedge decoded, the
 * pit under the translucent paper with the greenery meter. Part 1 ends on black with the big type and cuts hard into
 * the /try capture (its holds cut by the cues file); the end is the project at dusk with the bullets, the line and the
 * logo. No sound: queued subtitles. No CSS blur anywhere.
 */
export type AnimaticV11Props = {sheets?: WorldSheet[]};

const GREY = '#8a8a8a';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const win = (t: number, a: number, b: number, f = 0.3) => Math.min(ov(t, a, a + f), 1 - ov(t, b - f, b));
const LINES = timed();
const DOT: Record<string, string> = {red: C.red, amber: C.amber, blue: C.cobaltLt, white: '#fff', green: C.greenLt};
const PANEL = 'rgba(20,22,26,0.92)';
const L1_PNG = 'v11/sheets/L-1.png';
const L101_PNG = 'v11/sheets/L-101.png';

const Card: React.FC<{dot: string; title: string; sub?: string; a: number; x?: number; y?: number; w?: number; size?: number; inline?: boolean; right?: boolean}> = ({dot, title, sub, a, x = 70, y = 70, w, size = 58, inline = false, right = false}) => (
  <div style={{position: inline ? 'relative' : 'absolute', left: inline || right ? undefined : x, right: right ? x : undefined, top: inline ? undefined : y, width: w, boxSizing: 'border-box', opacity: a, transform: `translateY(${(1 - a) * 12}px)`, borderRadius: 24, background: PANEL, border: '1.5px solid rgba(255,255,255,0.28)', padding: '20px 30px', color: '#fff', fontFamily: FONT.sans, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', whiteSpace: 'nowrap'}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
      <div style={{width: 20, height: 20, borderRadius: 10, background: DOT[dot], boxShadow: `0 0 16px ${DOT[dot]}`, flex: 'none'}} />
      <div style={{fontSize: size, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.12}}>{title}</div>
    </div>
    {sub ? <div style={{marginTop: 8, marginLeft: 38, fontSize: 32, opacity: 0.78, lineHeight: 1.3}}>{sub}</div> : null}
  </div>
);
const FixCard: React.FC<{text: string; a: number; y: number; x?: number}> = ({text, a, y, x = 70}) => (
  <div style={{position: 'absolute', left: x, top: y, opacity: a, transform: `translateY(${(1 - a) * 10}px)`, borderRadius: 18, background: 'rgba(31,157,85,0.95)', border: '1.5px solid rgba(255,255,255,0.35)', padding: '14px 26px', color: '#fff', fontFamily: FONT.sans, fontSize: 40, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 14px 40px rgba(0,0,0,0.3)'}}>
    <span style={{marginRight: 14}}>✓</span>
    {text}
  </div>
);
const Tag: React.FC<{x: number; y: number; text: string; colour?: string; size?: number; a?: number; bg?: string; anchor?: string}> = ({x, y, text, colour = '#fff', size = 36, a = 1, bg = 'rgba(0,0,0,0.72)', anchor = 'translate(-50%, -50%)'}) =>
  a <= 0.002 ? null : <div style={{position: 'absolute', left: x, top: y, transform: anchor, fontFamily: FONT.mono, fontSize: size, fontWeight: 700, color: colour, background: bg, padding: '6px 14px', borderRadius: 8, opacity: a, whiteSpace: 'nowrap'}}>{text}</div>;
const Check: React.FC<{x: number; y: number; a: number; r?: number}> = ({x, y, a, r = 40}) =>
  a <= 0.002 ? null : <div style={{position: 'absolute', left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: r, background: C.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.sans, fontSize: r * 1.25, fontWeight: 700, opacity: a, transform: `scale(${0.6 + 0.4 * a})`, boxShadow: '0 0 30px rgba(60,207,127,0.6)'}}>✓</div>;
const Leader: React.FC<{from: [number, number]; to: {x: number; y: number; visible: boolean}; a: number; colour?: string}> = ({from, to, a, colour = '#fff'}) =>
  to.visible && a > 0.002 ? (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: a}}>
      <line x1={from[0]} y1={from[1]} x2={to.x} y2={to.y} stroke={colour} strokeWidth={3} strokeDasharray="10 8" />
      <circle cx={to.x} cy={to.y} r={11} fill="none" stroke={colour} strokeWidth={4} />
    </svg>
  ) : null;
const TypeCard: React.FC<{text: string; a: number}> = ({text, a}) => (
  <AbsoluteFill style={{background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: a}}>
    <div style={{fontFamily: FONT.sans, fontSize: 140, fontWeight: 700, letterSpacing: -4, color: '#fff', textAlign: 'center'}}>{text}</div>
  </AbsoluteFill>
);
const Live: React.FC<{label: string}> = ({label}) => (
  <AbsoluteFill style={{background: 'rgba(40,40,44,0.96)'}}>
    <div style={{position: 'absolute', inset: 48, border: '3px dashed rgba(255,255,255,0.6)'}} />
    <div style={{position: 'absolute', left: 90, top: 70, fontFamily: FONT.mono, fontSize: 36, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '8px 16px'}}>{label}</div>
  </AbsoluteFill>
);

/** The push: his monitor (grey stand-in) showing L-101 grows until the sheet fills the frame; it holds; the world takes over. */
const Push: React.FC<{t: number}> = ({t}) => {
  if (t < B.push || t >= B.pull) return null;
  const u = ov(t, B.push, B.land);
  const w = lerp(820, 1920, u);
  const h = (w * 9) / 16;
  const bezel = lerp(18, 0, u);
  const a = 1 - ov(t, B.land + 0.05, B.pull);
  return (
    <AbsoluteFill style={{background: '#3a3a3e', opacity: a}}>
      <div style={{position: 'absolute', left: 90, top: 70, fontFamily: FONT.mono, fontSize: 36, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '8px 16px', opacity: 1 - u}}>LIVE · push into his monitor</div>
      <div style={{position: 'absolute', left: 960 - w / 2 - bezel, top: 540 - h / 2 - bezel + lerp(40, 0, u), width: w + 2 * bezel, height: h + 2 * bezel, background: '#1b1b1d', borderRadius: lerp(14, 0, u)}}>
        <div style={{position: 'absolute', left: bezel, top: bezel, width: w, height: h, overflow: 'hidden', background: '#f7f5f0'}}>
          <Img src={staticFile(L101_PNG)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </div>
      </div>
      <div style={{position: 'absolute', left: 960 - 60, top: 540 + h / 2 + bezel + lerp(40, 0, u), width: 120, height: lerp(90, 0, u), background: '#1b1b1d'}} />
    </AbsoluteFill>
  );
};

/** The roof planter, cut away: soil 0.3 m against the dashed 0.4 m line, a ruler, roots; the soil rises to 0.4 m. */
const RoofCut: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 28.2, 31.9, 0.4);
  if (a <= 0) return null;
  const fix = ov(t, 30.0, 30.8);
  const PX = 760; // px per metre
  const base = 560;
  const depth = lerp(0.3, 0.4, fix);
  const top = base - depth * PX;
  const line = base - 0.4 * PX;
  const ok = fix > 0.95;
  return (
    <svg width={920} height={584} viewBox="0 0 1040 660" style={{position: 'absolute', right: 50, top: 360, opacity: a, background: PANEL, borderRadius: 26, border: '1.5px solid rgba(255,255,255,0.28)'}}>
      <text x={40} y={62} fill="#fff" fontFamily={FONT.sans} fontSize={40} fontWeight={600}>Roof planter, cut away · L-104</text>
      {/* the ruler */}
      <line x1={110} y1={base} x2={110} y2={base - 0.5 * PX} stroke="#fff" strokeWidth={4} />
      {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((m) => (
        <g key={m}>
          <line x1={92} y1={base - m * PX} x2={128} y2={base - m * PX} stroke="#fff" strokeWidth={4} />
          <text x={80} y={base - m * PX + 11} fill="#fff" fontFamily={FONT.mono} fontSize={30} textAnchor="end">{m.toFixed(1)}</text>
        </g>
      ))}
      <text x={60} y={base + 56} fill="#fff" opacity={0.7} fontFamily={FONT.mono} fontSize={26}>m</text>
      {/* the planter: walls, the slab, the soil, the roots, the shrubs */}
      <rect x={160} y={base} width={600} height={30} fill="#a9a9a4" />
      <rect x={160} y={base - 0.5 * PX} width={26} height={0.5 * PX} fill="#c9c6bd" />
      <rect x={734} y={base - 0.5 * PX} width={26} height={0.5 * PX} fill="#c9c6bd" />
      <rect x={186} y={top} width={548} height={base - top} fill="#6b5a46" />
      {[240, 360, 480, 600, 690].map((x, k) => (
        <g key={x} stroke="#3b2a1a" strokeWidth={4} fill="none">
          <path d={`M${x} ${top} q ${k % 2 ? 18 : -18} ${(base - top) * 0.45} ${k % 2 ? -6 : 8} ${(base - top) * 0.85}`} />
          <path d={`M${x} ${top} q ${k % 2 ? -26 : 26} ${(base - top) * 0.35} ${k % 2 ? -34 : 30} ${(base - top) * 0.6}`} />
        </g>
      ))}
      {[230, 330, 430, 530, 630, 700].map((x, k) => (
        <g key={x}>
          <circle cx={x} cy={top - 38} r={44} fill={k % 2 ? '#3f9450' : '#2f7d44'} />
          <circle cx={x + 30} cy={top - 22} r={30} fill="#367f47" />
        </g>
      ))}
      {/* the 0.4 m line */}
      <line x1={140} y1={line} x2={800} y2={line} stroke={C.cobaltLt} strokeWidth={5} strokeDasharray="16 12" />
      <text x={812} y={line + 12} fill={C.cobaltLt} fontFamily={FONT.mono} fontSize={34} fontWeight={700}>0.4 m min.</text>
      {/* the soil's depth */}
      <line x1={800} y1={base} x2={800} y2={top} stroke={ok ? C.greenLt : C.amber} strokeWidth={5} />
      <line x1={786} y1={top} x2={814} y2={top} stroke={ok ? C.greenLt : C.amber} strokeWidth={5} />
      <text x={826} y={(base + top) / 2 + 30} fill={ok ? C.greenLt : C.amber} fontFamily={FONT.mono} fontSize={56} fontWeight={700}>{`${depth.toFixed(1)} m`}</text>
      <text x={40} y={630} fill="#fff" opacity={0.85} fontFamily={FONT.sans} fontSize={32}>{ok ? 'soil raised · 35 m² of orange jasmine counts again' : 'soil 0.3 m · the shrubs are not counted (T02)'}</text>
      {ok ? (
        <g opacity={ov(t, 30.8, 31.1)}>
          <circle cx={960} cy={120} r={46} fill={C.green} />
          <path d="M938 120 l15 16 l28 -32" stroke="#fff" strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
    </svg>
  );
};

/** The greenery meter (Art. 302) in the right third: 261.1 → 209.9 as the tree shrinks, → 299.5 with the seven trees. */
const Meter: React.FC<{t: number}> = ({t}) => {
  const P = V11.pit;
  const a = win(t, P.meter, 86.9, 0.4);
  if (a <= 0) return null;
  const down = ov(t, P.shrink[0], P.shrink[1]);
  const up = ov(t, P.seven, P.pass);
  const v = lerp(lerp(261.1, 209.9, down), 299.5, up);
  const pass = v >= 297;
  const W = 520;
  const px = (n: number) => (n / 330) * W;
  return (
    <div style={{position: 'absolute', right: 50, top: 250, width: W + 64, boxSizing: 'border-box', padding: '26px 32px', borderRadius: 24, background: PANEL, border: '1.5px solid rgba(255,255,255,0.28)', opacity: a, fontFamily: FONT.sans, color: '#fff'}}>
      <div style={{fontSize: 36, fontWeight: 600}}>Greenery · Art. 302</div>
      <div style={{fontSize: 26, opacity: 0.7, marginTop: 4}}>kgCO₂e / yr · local building code (E14)</div>
      <div style={{position: 'relative', height: 56, marginTop: 70, background: 'rgba(255,255,255,0.1)', borderRadius: 10}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: px(v), background: pass ? C.greenLt : C.red, borderRadius: 10}} />
        <div style={{position: 'absolute', left: px(297) - 2, top: -16, bottom: -16, width: 5, background: '#fff'}} />
        <div style={{position: 'absolute', left: px(297) - 200, top: -58, width: 200, textAlign: 'right', fontFamily: FONT.mono, fontSize: 28}}>required 297</div>
      </div>
      <div style={{marginTop: 26, fontFamily: FONT.mono, fontSize: 52, fontWeight: 700, color: pass ? C.greenLt : '#ff8a8a'}}>{v.toFixed(1)}</div>
      <div style={{fontSize: 32, marginTop: 4, color: pass ? C.greenLt : '#ff8a8a', fontWeight: 600}}>{pass ? 'pass · +7 trees' : down > 0.5 ? 'short · each big tree counts as small' : 'provided'}</div>
    </div>
  );
};

/** The coloured plan (a raster page, no CAD): SAM 3.1's real masks fill colour by colour; the list in the right third. */
const SAM_PLAN = (() => {
  const [x0, y0, x1, y1] = sam.crop;
  const k = 1220 / (x1 - x0);
  return {x0, y0, k, left: 30, top: 40, w: 1220, h: (y1 - y0) * k};
})();
const Raster: React.FC<{t: number}> = ({t}) => {
  const a = win(t, B.raster, B.bills, 0.45);
  if (a <= 0) return null;
  const S = SAM_PLAN;
  const rowAt = (k: number) => B.raster + 0.7 + k * 1.45;
  const fmt = (r: (typeof sam.rows)[number], v: number) => (r.kind === 'symbols' ? String(Math.round(v)) : v.toFixed(1));
  return (
    <AbsoluteFill style={{opacity: a, background: '#24262b'}}>
      <div style={{position: 'absolute', left: S.left, top: S.top, width: S.w, height: S.h, overflow: 'hidden', borderRadius: 10, background: '#fff'}}>
        <Img src={staticFile(sam.image)} style={{position: 'absolute', left: -S.x0 * S.k, top: -S.y0 * S.k, width: sam.w * S.k, height: sam.h * S.k}} />
        <svg width={S.w} height={S.h} style={{position: 'absolute', inset: 0}}>
          {sam.rows.map((r, k) => {
            const at = rowAt(k);
            const draw = ov(t, at, at + 0.6);
            const fill = ov(t, at + 0.45, at + 0.9);
            if (draw <= 0) return null;
            return (
              <g key={r.what}>
                {r.polys.map((ring, j) => (
                  <path key={j} d={'M' + ring.map(([x, y]) => `${((x - S.x0) * S.k).toFixed(1)} ${((y - S.y0) * S.k).toFixed(1)}`).join('L') + 'Z'} pathLength={1} fill={r.colour} fillOpacity={0.82 * fill} stroke={C.violet} strokeWidth={4} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{position: 'absolute', left: S.left + 14, top: S.top + 12, fontFamily: FONT.mono, fontSize: 24, color: '#fff', background: 'rgba(0,0,0,0.7)', padding: '4px 12px', borderRadius: 6}}>Presentation Plan (Colour).pdf · a raster page, no CAD</div>
      {/* the list */}
      <div style={{position: 'absolute', left: 1278, top: 50, width: 616, fontFamily: FONT.sans, color: '#fff'}}>
        <div style={{fontSize: 24, opacity: 0.7, marginBottom: 22}}>Colour words read from the legend by Muse Spark</div>
        <div style={{display: 'flex', alignItems: 'flex-end', fontSize: 24, opacity: 0.6, paddingBottom: 10, borderBottom: '1.5px solid rgba(255,255,255,0.25)'}}>
          <div style={{width: 286}} />
          <div style={{width: 112, textAlign: 'right', color: C.violetLt, opacity: 1}}>SAM 3.1</div>
          <div style={{width: 112, textAlign: 'right'}}>drawings</div>
          <div style={{width: 106, textAlign: 'right'}}>diff.</div>
        </div>
        {sam.rows.map((r, k) => {
          const ra = ov(t, rowAt(k) + 0.3, rowAt(k) + 0.8);
          const big = Math.abs(r.diff_pct) >= 10;
          return (
            <div key={r.what} style={{display: 'flex', alignItems: 'center', height: 150, borderBottom: '1.5px solid rgba(255,255,255,0.14)', opacity: ra}}>
              <div style={{width: 48, height: 48, borderRadius: r.kind === 'symbols' ? 24 : 8, background: r.colour, border: `4px solid ${C.violet}`, boxSizing: 'border-box', flex: 'none'}} />
              <div style={{width: 238, paddingLeft: 16, boxSizing: 'border-box', whiteSpace: 'nowrap'}}>
                <div style={{fontSize: 32, fontWeight: 600, lineHeight: 1.1}}>{r.what}</div>
                <div style={{fontFamily: FONT.mono, fontSize: 20, opacity: 0.7, marginTop: 8}}>{`“${r.prompt}” · ${r.kind === 'symbols' ? 'count' : 'm²'}`}</div>
              </div>
              <div style={{width: 112, textAlign: 'right', fontFamily: FONT.mono, fontSize: 34, fontWeight: 700, color: C.violetLt}}>{fmt(r, r.sam * ov(t, rowAt(k) + 0.3, rowAt(k) + 1.0))}</div>
              <div style={{width: 112, textAlign: 'right', fontFamily: FONT.mono, fontSize: 34, fontWeight: 600}}>{String(r.drawings)}</div>
              <div style={{width: 106, textAlign: 'right', fontFamily: FONT.mono, fontSize: 30, fontWeight: 700, color: big ? C.amber : C.greenLt}}>{r.diff_pct === 0 ? '0' : `${r.diff_pct > 0 ? '+' : '−'}${Math.abs(r.diff_pct).toFixed(1)}%`}</div>
            </div>
          );
        })}
        <div style={{marginTop: 16, fontSize: 24, opacity: 0.7 * ov(t, rowAt(3) + 0.8, rowAt(3) + 1.2), lineHeight: 1.35}}>The fire lane differs: a tree is drawn over it.<br />Nothing counts until a person confirms.</div>
      </div>
    </AbsoluteFill>
  );
};

const Findings: React.FC<{t: number}> = ({t}) => {
  const F = V11.findings;
  const a = win(t, F.at, B.type, 0.4);
  if (a <= 0) return null;
  const group = (title: string, dot: string, items: string[], x: number, delay: number) => (
    <div style={{position: 'absolute', left: x, top: 90, width: 590}}>
      <div style={{fontFamily: FONT.sans, fontSize: 46, fontWeight: 700, color: DOT[dot], marginBottom: 16, opacity: ov(t, F.at + delay, F.at + delay + 0.3)}}>{title}</div>
      {items.map((it, i) => (
        <div key={it} style={{marginBottom: 12}}>
          <Card dot={dot} title={it} a={ov(t, F.at + delay + 0.3 + i * 0.22, F.at + delay + 0.55 + i * 0.22)} w={590} size={26} inline />
        </div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: 'rgba(20,22,26,0.7)'}} />
      {group('Send back', 'red', F.sendBack, 40, 0)}
      {group('Fix before pricing', 'amber', F.fix, 665, 1.1)}
      {group('Building code', 'blue', F.code, 1290, 2.0)}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 230, textAlign: 'center', opacity: ov(t, F.at + 3.0, F.at + 3.4)}}>
        <span style={{fontFamily: FONT.sans, fontSize: 68, fontWeight: 700, color: '#fff', background: PANEL, padding: '14px 44px', borderRadius: 24, border: '1.5px solid rgba(255,255,255,0.28)'}}>{F.total}</span>
      </div>
    </AbsoluteFill>
  );
};

/** The split frame for the tree: the plan on the left (one tree), the world on the right (twelve lines). */
const Split: React.FC<{t: number}> = ({t}) => {
  const a = win(t, 50.1, 52.8, 0.35);
  if (a <= 0) return null;
  const k = 110; // px per metre on the plan crop
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, width: 960, height: 1080, overflow: 'hidden', background: '#fff', opacity: a}}>
        <Img src={staticFile(L1_PNG)} style={{position: 'absolute', width: L1.w * k, height: L1.h * k, left: 480 - (T8.x - L1.x0) * k, top: 560 - (T8.z - L1.z0) * k}} />
        <div style={{position: 'absolute', left: 480 - k * (t08.radius + 0.4), top: 560 - k * (t08.radius + 0.4), width: 2 * k * (t08.radius + 0.4), height: 2 * k * (t08.radius + 0.4), borderRadius: '50%', border: `8px solid ${C.cobalt}`, boxSizing: 'border-box'}} />
      </div>
      <div style={{position: 'absolute', left: 957, top: 0, width: 6, height: 1080, background: '#fff', opacity: a}} />
      <div style={{position: 'absolute', left: 70, top: 70, fontFamily: FONT.sans, fontSize: 64, fontWeight: 700, color: '#1d2026', opacity: a}}>What you see<div style={{fontSize: 38, opacity: 0.75, fontWeight: 500}}>one tree</div></div>
      <div style={{position: 'absolute', left: 1030, top: 70, fontFamily: FONT.sans, fontSize: 64, fontWeight: 700, color: '#fff', textShadow: '0 2px 20px rgba(0,0,0,0.7)', opacity: a}}>What a computer sees<div style={{fontSize: 38, opacity: 0.9, fontWeight: 500}}>twelve loose LINEs</div></div>
    </>
  );
};

export const AnimaticV11: React.FC<AnimaticV11Props> = ({sheets}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(frame % fps).padStart(2, '0')}`;
  const line = [...LINES].reverse().find((l) => t >= l.start && t < l.end);
  const part1World = t >= B.push && t < B.type && !(t > B.raster + 0.5 && t < B.bills - 0.45);
  const endWorld = t >= CLOSE_AT;
  const duskU = clamp01((t - CLOSE_AT) / (LOGO_AT + END.hold - CLOSE_AT));
  return (
    <AbsoluteFill style={{background: GREY, overflow: 'hidden'}}>
      {/* the world (Part 1) and the project at dusk (the end) */}
      {part1World && sheets ? <WorldV11 t={t} sheets={sheets} l1={L1_PNG} /> : null}
      {endWorld && sheets ? <WorldV11 t={200} sheets={sheets} l1={L1_PNG} dusk={duskU} /> : null}

      {/* the opening: Eric, three grey slots; the push through his monitor onto L-101 */}
      {V11.opening.map((o, k) => (t >= o.start && t < o.end ? <Live key={k} label={o.label} /> : null))}
      <Push t={t} />

      {/* the stack: L-101, then the footprint the tower lands on */}
      {t >= 15.4 && t < 17.2 ? (() => {
          const p = projectAt(t, [plateAt(t, '1')[0] + 30, 40.5, plateAt(t, '1')[2] + 14]);
          return p.visible ? <Tag x={p.x} y={p.y} text="L-101 · ground floor" size={34} a={win(t, 15.4, 17.2)} /> : null;
        })() : null}
      {t >= 19.0 && t < 21.3 ? (() => {
          const p = projectAt(t, [FOOT.podium.cx - FOOT.podium.w / 2, 0, FOOT.podium.cz + FOOT.podium.d / 2]);
          return p.visible ? <Tag x={Math.max(p.x - 30, 560)} y={Math.min(p.y, 860)} anchor="translate(-100%, -50%)" text="L-1 · the tower's footprint" colour="#9ab4ff" size={36} a={win(t, 19.0, 21.3)} /> : null;
        })() : null}

      {/* the typical floor: L-103 amber; 12F, 16F, 20F light green one by one */}
      {t >= 21.8 && t < 27.2
        ? ['8', ...V11.typical.floors].map((f, k) => {
            const d = drawerAt(t, f);
            if (d.out < 0.6) return null;
            const p = projectAt(t, [plateAt(t, f)[0] + 13.5, plateAt(t, f)[1], plateAt(t, f)[2] + 4]);
            return p.visible ? <Tag key={f} x={p.x} y={p.y} anchor="translate(0, -50%)" text={k === 0 ? '8F · L-103' : `${f}F`} colour={k === 0 ? '#1d2026' : '#0c2a18'} bg={k === 0 ? C.amber : C.greenLt} size={40} a={win(t, k === 0 ? 22.0 : V11.typical.lit + (k - 1) * V11.typical.step + 0.4, 27.2)} /> : null;
          })
        : null}
      {t >= 24.4 && t < 27.2 ? <Card dot="green" title="Landsight finds the other three floors" a={win(t, 24.4, 27.2)} x={70} y={770} size={50} /> : null}

      {/* the roof: the cut-away, with its leader to L-104's drawer */}
      {t >= 28.2 && t < 31.9 ? <Leader from={[950, 650]} to={projectAt(t, [plateAt(t, 'R')[0] + 6, plateAt(t, 'R')[1], plateAt(t, 'R')[2] + 3])} a={win(t, 28.4, 31.9) * 0.9} /> : null}
      <RoofCut t={t} />

      {/* the two alike sheets */}
      {t >= 33.4 && t < 35.0 ? (() => {
          const p = projectAt(t, [plateAt(t, '8')[0] + 12, plateAt(t, '8')[1] + 1, plateAt(t, '8')[2] - 6]);
          return p.visible ? <Tag x={Math.min(p.x, 1880)} y={p.y - 90} anchor="translate(-100%, -50%)" text="L-102 on L-103 · 91% the same" colour="#1d2026" bg={C.amber} size={40} a={win(t, 33.6, 35.0)} /> : null;
        })() : null}

      {/* the lift shaft: labels, the check */}
      {t >= 35.9 && t < 39.3 ? (() => {
          const pl = plateAt(t, '5');
          const shaft = projectAt(t, [pl[0] + SHAFT.x - 0.4, pl[1], pl[2] + SHAFT.z + 1.9]);
          const plan = projectAt(t, [pl[0] + SHAFT.x + 1.55 + (4.3 - 1.55) * planterSlide(t), pl[1] + 1.6, pl[2] + SHAFT.z - 0.4]);
          return (
            <>
              {shaft.visible ? <Tag x={shaft.x - 60} y={shaft.y + 40} anchor="translate(-100%, -50%)" text="lift shaft · the car below" size={36} a={win(t, 36.0, 39.3)} /> : null}
              {plan.visible ? <Tag x={plan.x} y={plan.y - 40} text="planter B-10" colour="#c9f5d8" size={34} a={win(t, 36.3, 39.3)} /> : null}
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
          const col = ok ? C.greenLt : '#ff6b6b';
          return (
            <>
              {p.visible ? (
                <div style={{position: 'absolute', left: p.x - 26, top: p.y - 26, opacity: pa}}>
                  <div style={{position: 'absolute', left: -16, top: 6, width: 84, height: 40, borderRadius: 20, background: '#fff', border: '5px solid #1d2026', boxSizing: 'border-box'}} />
                  <div style={{position: 'absolute', left: 0, top: 0, width: 52, height: 52, borderRadius: 26, background: '#fff', border: '5px solid #1d2026', boxSizing: 'border-box'}} />
                </div>
              ) : null}
              {ea.visible && eb.visible && dimA > 0 ? (
                <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: dimA}}>
                  <line x1={ea.x} y1={ea.y} x2={eb.x} y2={eb.y} stroke={col} strokeWidth={7} />
                  {[ea, eb].map((e, k) => (
                    <line key={k} x1={e.x - 20} y1={e.y} x2={e.x + 20} y2={e.y} stroke={col} strokeWidth={7} />
                  ))}
                </svg>
              ) : null}
              {ea.visible ? <Tag x={ea.x} y={Math.min(ea.y, eb.y) - 64} text={`${clear.toFixed(1)} m clear`} colour={col} size={48} a={dimA} /> : null}
              {ea.visible && pOut < 0.3 ? <Tag x={ea.x} y={Math.min(ea.y, eb.y) - 134} text="the code: 1.2 m" colour="#fff" size={36} a={dimA} /> : null}
              {p.visible && t >= 42.5 && t < 43.4 ? <Tag x={p.x - 40} y={p.y + 150} text="stopped" colour="#fff" bg={C.red} size={36} a={win(t, 42.5, 43.4, 0.15)} /> : null}
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
            if (!p.visible || p.x < 1000 || p.y < 230) return null;
            return <Tag key={seg.handle} x={p.x + 34} y={p.y - 20} text={String(i + 1)} size={30} colour="#fff" bg="rgba(36,87,255,0.9)" a={ov(t, 50.6 + i * 0.06, 50.9 + i * 0.06)} />;
          })
        : null}
      {t >= 54.8 && t < 57.4 ? (() => {
          const p = projectAt(t, [T8.x + 2.7, 0, T8.z + 1.0]);
          const click = ov(t, 55.6, 56.0);
          return (
            <>
              <div style={{position: 'absolute', left: p.x, top: p.y, padding: '16px 30px', borderRadius: 14, background: click > 0.6 ? C.green : C.cobalt, color: '#fff', fontFamily: FONT.sans, fontSize: 42, fontWeight: 600, opacity: win(t, 54.8, 57.4)}}>{click > 0.6 ? 'Confirmed · 8 trees' : 'Confirm — one tree'}</div>
              <div style={{position: 'absolute', left: p.x + 80 - 18, top: p.y + 40 - 18, width: 36, height: 36, borderRadius: 18, border: '5px solid #fff', background: C.cobalt, transform: `scale(${1 + click * 2})`, opacity: t < 55.6 ? 0 : 1 - click}} />
            </>
          );
        })() : null}

      {/* the coloured plan and SAM 3.1's masks */}
      <Raster t={t} />

      {/* the bill's count: 1…8 on the row */}
      {countedAt(t) > 0
        ? ROW.slice(0, countedAt(t)).map((r, i) => {
            const p = projectAt(t, [r.x, 0, r.z]);
            return <Tag key={r.id} x={p.x} y={p.y} text={String(i + 1)} colour="#fff" bg={i === 7 ? C.red : C.cobalt} size={48} />;
          })
        : null}
      {t >= 67.6 && t < 68.8 ? (() => {
          const p = projectAt(t, [ROW[7].x, 0, ROW[7].z - 3.4]);
          return <Tag x={p.x} y={p.y} text="bill 12 → 8" colour="#fff" bg={C.green} size={46} a={win(t, 67.6, 68.8, 0.2)} />;
        })() : null}

      {/* the hedge: the note decoded, the count along the line, the bill row */}
      {t >= 69.2 && t < 74.2 ? (() => {
          const H = V11.hedge;
          const a = win(t, 69.2, 74.2, 0.35);
          const n = Math.round(H.n * hedgeGrow(t));
          const lead = projectAt(t, [HEDGE.x, 0.3, HEDGE.z0 - (HEDGE.z0 - HEDGE.z1) * hedgeGrow(t)]);
          return (
            <>
              <div style={{position: 'absolute', left: 70, top: 70, opacity: a, borderRadius: 24, background: PANEL, border: '1.5px solid rgba(255,255,255,0.28)', padding: '22px 32px', color: '#fff'}}>
                <div style={{fontFamily: FONT.mono, fontSize: 38, fontWeight: 600, color: '#c3c8cf'}}>{H.note}</div>
                <div style={{fontFamily: FONT.sans, fontSize: 50, fontWeight: 600, marginTop: 10, opacity: ov(t, 69.8, 70.3)}}>{H.decoded}</div>
              </div>
              <div style={{position: 'absolute', right: 70, top: 300, opacity: win(t, 70.2, 74.2), borderRadius: 18, background: 'rgba(240,165,0,0.95)', padding: '16px 28px', color: '#1d2026', fontFamily: FONT.sans, fontSize: 40, fontWeight: 700}}>{H.bill}</div>
              {lead.visible && n > 0 ? <Tag x={Math.min(lead.x, 1880)} y={lead.y - 70} anchor={lead.x > 1640 ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)'} text={`${n} plants`} colour="#0c2a18" bg={C.greenLt} size={52} a={a} /> : null}
              {t >= 72.9 ? <Card dot="amber" title={H.card} a={win(t, 72.9, 74.2, 0.3)} x={70} y={770} size={50} /> : null}
            </>
          );
        })() : null}

      {/* the pit: the card, the labels on the cut-away under the paper, the meter, the seven trees */}
      {t >= 77.8 && t < 87.0 ? (() => {
          const P = V11.pit;
          const pit = projectAt(t, [PT.x - 0.9, -0.9, PT.z + 0.9]);
          const can = projectAt(t, [PT.x, 3.6, PT.z]);
          const sh = pitShrink(t);
          return (
            <>
              <Card dot="blue" title="On the slab, a big tree counts as small" sub="pit 1.5 × 1.5 m · soil 1.0 m on the concrete slab (L-6) · E12" a={win(t, 78.0, 86.9)} size={50} />
              <FixCard text="+7 trees → 299.5 · pass" a={Math.min(ov(t, P.pass, P.pass + 0.35), win(t, 78, 86.9))} y={270} />
              {pit.visible ? <Tag x={pit.x} y={pit.y} anchor="translate(-100%, -50%)" text="pit 1.5 × 1.5 m · on the slab" size={36} a={win(t, 79.4, 83.4)} /> : null}
              {can.visible && sh > 0.4 ? <Tag x={can.x + 120} y={can.y} anchor="translate(0, -50%)" text="counts as small · Gi 1.5 → 1.0" colour="#fff" bg={C.red} size={36} a={win(t, 81.6, 83.6)} /> : null}
              {SEVEN.map((s, k) => {
                const p = projectAt(t, [s.x, 0, s.z]);
                return k === 3 && p.visible ? <Tag key={k} x={p.x} y={p.y - 110} text="+7 trees on the plan" colour="#0c2a18" bg={C.greenLt} size={40} a={Math.min(sevenAt(t, 6), win(t, P.seven, 86.9))} /> : null;
              })}
            </>
          );
        })() : null}
      <Meter t={t} />

      {/* the findings; the big type on black; the hard cut */}
      <Findings t={t} />
      {t >= B.type - 0.2 && t < PART2_AT ? <TypeCard text="Two weeks → two minutes." a={ov(t, B.type - 0.2, B.type)} /> : null}

      {/* the cards, each with its fix */}
      {V11.cards.map((c) => {
        const a = win(t, c.at, c.until);
        if (a <= 0) return null;
        const f = c.fix ? Math.min(ov(t, c.fix.at, c.fix.at + 0.35), a) : 0;
        return (
          <div key={c.title}>
            <Card dot={c.dot} title={c.title} sub={c.sub} a={a} />
            {c.fix ? <FixCard text={c.fix.text} a={f} y={c.sub ? 270 : 200} /> : null}
          </div>
        );
      })}

      {/* Part 2: the capture, its holds cut; the old project line covered on the Choose screen */}
      {(() => {
        let at = PART2_AT;
        return SEGMENTS.map(([f, to], k) => {
          const from = at;
          at += to - f;
          return (
            <Sequence key={k} from={Math.round(from * fps)} durationInFrames={Math.round(at * fps) - Math.round(from * fps)} name={`capture ${k + 1}`} layout="none">
              <OffthreadVideo src={staticFile('v11/try.mp4')} startFrom={Math.round(f * fps)} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
            </Sequence>
          );
        });
      })()}
      {t >= PART2_AT && t < CLOSE_AT ? (() => {
          const tc2 = filmToCap(t);
          if (tc2 < COVER.from || tc2 > COVER.to) return null;
          const z = ov(tc2, COVER.zoomIn[0], COVER.zoomIn[1]) * (1 - ov(tc2, COVER.zoomOut[0], COVER.zoomOut[1]));
          const r = COVER.plain.map((v, i) => lerp(v, COVER.zoomed[i], z));
          return <div style={{position: 'absolute', left: r[0], top: r[1], width: r[2], height: r[3], background: COVER.colour}} />;
        })() : null}

      {/* the end: at dusk, the four bullets, the line, the logo */}
      {t >= CLOSE_AT ? (() => {
          const u = t - CLOSE_AT;
          const veil = ov(u, END.logo - 0.2, END.logo + 0.4);
          return (
            <>
              <AbsoluteFill style={{background: '#000', opacity: 1 - ov(u, 0, 0.45)}} />
              <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(10,12,18,0.82) 0%, rgba(10,12,18,0.55) 55%, rgba(10,12,18,0) 80%)', opacity: 1 - veil}} />
              <div style={{position: 'absolute', left: 110, top: 190, opacity: 1 - veil}}>
                {END.bullets.map((b, k) => {
                  const a = ov(u, b.at, b.at + 0.35);
                  return (
                    <div key={k} style={{display: 'flex', alignItems: 'baseline', gap: 26, marginBottom: 34, opacity: a, transform: `translateX(${(1 - a) * -20}px)`, fontFamily: FONT.sans, color: '#fff'}}>
                      <div style={{width: 18, height: 18, borderRadius: 9, background: k === 3 ? C.greenLt : C.cobaltLt, flex: 'none', transform: 'translateY(-8px)'}} />
                      <div style={{fontSize: 52, fontWeight: 600, letterSpacing: -0.8}}>
                        {b.text}
                        {b.by ? <span style={{fontWeight: 400, opacity: 0.7}}>{` — ${b.by}`}</span> : null}
                      </div>
                    </div>
                  );
                })}
                <div style={{marginTop: 40, fontFamily: FONT.sans, fontSize: 78, fontWeight: 700, letterSpacing: -2, color: '#fff', opacity: ov(u, END.line, END.line + 0.4)}}>Every number, traced to the drawing.</div>
              </div>
              <AbsoluteFill style={{background: '#0b0c0f', opacity: veil, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                <Img src={staticFile('v11/logo/landsight-b-canopy-dark-lockup.svg')} style={{height: 170, transform: `scale(${lerp(0.94, 1, veil)})`}} />
                <div style={{fontFamily: FONT.mono, fontSize: 38, marginTop: 44, color: '#fff', opacity: 0.85}}>github.com/eric2612115/landsight</div>
                <div style={{fontFamily: FONT.sans, fontSize: 34, marginTop: 16, color: '#fff', opacity: 0.65}}>Built with Muse Spark 1.3 and SAM 3.1</div>
              </AbsoluteFill>
            </>
          );
        })() : null}

      {/* subtitles (queued) and the timecode */}
      {line ? (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 40, textAlign: 'center'}}>
          <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 46, lineHeight: 1.25, color: '#fff', background: 'rgba(0,0,0,0.75)', padding: '10px 24px', borderRadius: 8, maxWidth: 1680}}>
            {line.who ? <span style={{opacity: 0.6}}>{line.who}: </span> : null}
            {line.text}
          </span>
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 20, top: 16, fontFamily: FONT.mono, fontSize: 22, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4}}>{tc}</div>
    </AbsoluteFill>
  );
};
