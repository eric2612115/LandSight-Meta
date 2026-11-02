import {AbsoluteFill, Audio, Easing, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {ANIM} from './animatic-v7-cues.js';

/**
 * Film v7 animatic (3:00, 1920 × 1080, 30 fps; demo/SCRIPT-V7.md, Production: "the animatic first"). The whole film
 * in previz on a mid-grey field: rectangles for sheets and screens, circles for trees, a stack of thin boxes for the
 * building in a simple oblique drawing, arrows and dashed frames for every camera move, a mono label on every object
 * saying what the final will be, the type cards as plain white text at their real positions and times, the live
 * slots as dashed boxes, Part 2 as wireframe panes with a circle for the cursor. Corner: timecode, beat, part.
 * Sound: the voice only (Eric's clone, public/audio/v7-voice), subtitled; a 1 kHz tick at each music cue point.
 */
export type AnimaticData = {lines: {n: number; at: number; until: number; seconds: number | null; overrun: number | null; text: string}[]; ticks: string};
export type AnimaticV7Props = {data?: AnimaticData};

const FIELD = '#787878';
const INK = '#111';
const WHITE = '#fff';
const COBALT = C.cobalt;
const RED = '#d4201a';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const ease = Easing.inOut(Easing.cubic);
const ov = (t: number, a: number, b: number, fn: (u: number) => number = ease) => fn(clamp01((t - a) / (b - a)));
const mono: React.CSSProperties = {fontFamily: FONT.mono, fontSize: 20, lineHeight: 1.25};

// ---------------------------------------------------------------- previz primitives
const Lbl: React.FC<{x: number; y: number; text: string; colour?: string; size?: number; a?: number}> = ({x, y, text, colour = WHITE, size = 20, a = 1}) => (
  <div style={{position: 'absolute', left: x, top: y, ...mono, fontSize: size, color: colour, background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', opacity: a}}>{text}</div>
);
const Rect: React.FC<{x: number; y: number; w: number; h: number; label?: string; dashed?: boolean; stroke?: string; fill?: string; a?: number; children?: React.ReactNode; rot?: number}> = ({x, y, w, h, label, dashed, stroke = INK, fill = 'rgba(255,255,255,0.85)', a = 1, children, rot = 0}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, border: `2px ${dashed ? 'dashed' : 'solid'} ${stroke}`, background: fill, opacity: a, transform: `rotate(${rot}deg)`, boxSizing: 'border-box', overflow: 'visible'}}>
    {label ? <Lbl x={-2} y={-30} text={label} /> : null}
    {children}
  </div>
);
const Circ: React.FC<{cx: number; cy: number; r: number; stroke?: string; fill?: string; label?: string; a?: number; width?: number}> = ({cx, cy, r, stroke = INK, fill = 'none', label, a = 1, width = 2}) => (
  <div style={{position: 'absolute', left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: '50%', border: `${width}px solid ${stroke}`, background: fill, opacity: a, boxSizing: 'border-box'}}>
    {label ? <div style={{position: 'absolute', left: 0, right: 0, top: r - 12, textAlign: 'center', ...mono, fontSize: 18, color: stroke}}>{label}</div> : null}
  </div>
);
/** A camera move: an arrow with its label. */
const Arrow: React.FC<{x1: number; y1: number; x2: number; y2: number; label: string; a?: number; colour?: string}> = ({x1, y1, x2, y2, label, a = 1, colour = '#ffd400'}) => (
  <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: a, pointerEvents: 'none'}}>
    <defs>
      <marker id="ah" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
        <path d="M0,0 L12,6 L0,12 z" fill={colour} />
      </marker>
    </defs>
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth={4} markerEnd="url(#ah)" />
    <text x={(x1 + x2) / 2 + 14} y={(y1 + y2) / 2 - 10} fontFamily={FONT.mono} fontSize={22} fontWeight={700} fill={colour} stroke="rgba(0,0,0,0.7)" strokeWidth={5} paintOrder="stroke">{`camera: ${label}`}</text>
  </svg>
);
/** A dashed camera frame the view scales into. */
const Frame: React.FC<{x: number; y: number; w: number; h: number; label: string; a?: number}> = ({x, y, w, h, label, a = 1}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, border: '3px dashed #ffd400', opacity: a, boxSizing: 'border-box'}}>
    <div style={{position: 'absolute', left: -3, top: -32, ...mono, fontSize: 22, fontWeight: 700, color: '#ffd400', background: 'rgba(0,0,0,0.7)', padding: '2px 8px', whiteSpace: 'nowrap'}}>camera: {label}</div>
  </div>
);
/** A type card as plain white text at its real position and size (104 px at the 1080 base). */
const Card: React.FC<{text: string; at: number; until: number; t: number; place: 'low' | 'centre'}> = ({text, at, until, t, place}) => {
  if (t < at || t > until) return null;
  const a = Math.min(clamp01((t - at) / 0.2), clamp01((until - t) / 0.25));
  const pos: React.CSSProperties = place === 'centre' ? {top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'} : {bottom: 86};
  return (
    <div style={{position: 'absolute', left: 120, right: 120, textAlign: 'center', opacity: a, ...pos}}>
      <div style={{fontFamily: FONT.sans, fontSize: 104, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1.04, color: WHITE, textShadow: '0 2px 24px rgba(0,0,0,0.7)'}}>{text}</div>
    </div>
  );
};
const Live: React.FC<{title: string; lines: string[]; a?: number; warm?: number}> = ({title, lines, a = 1, warm = 0}) => (
  <AbsoluteFill style={{opacity: a, background: `rgb(${Math.round(lerp(0x40, 0x7a, warm))},${Math.round(lerp(0x40, 0x5a, warm))},${Math.round(lerp(0x48, 0x3a, warm))})`}}>
    <div style={{position: 'absolute', inset: 60, border: '4px dashed #ffd400', boxSizing: 'border-box'}} />
    <div style={{position: 'absolute', left: 120, top: 150, ...mono, color: '#ffd400'}}>
      <div style={{fontSize: 56, fontWeight: 700}}>{title}</div>
      {lines.map((l) => (
        <div key={l} style={{fontSize: 30, marginTop: 16, color: WHITE, maxWidth: 1500}}>{l}</div>
      ))}
    </div>
  </AbsoluteFill>
);
const Cursor: React.FC<{x: number; y: number; clicks: number[]; t: number}> = ({x, y, clicks, t}) => (
  <>
    {clicks.map((c) => {
      const u = (t - c) / 0.5;
      if (u < 0 || u > 1) return null;
      return <Circ key={c} cx={x} cy={y} r={14 + u * 50} stroke={COBALT} a={1 - u} width={3} />;
    })}
    <Circ cx={x} cy={y} r={14} stroke={WHITE} fill={COBALT} width={3} />
    <Lbl x={x + 18} y={y + 12} text="cursor" size={16} />
  </>
);

// ---------------------------------------------------------------- Part 1 pieces
type Slab = {i: number; w: number; d: number; x: number; y: number; floor: string};
const SLABS: Slab[] = [];
{
  const bx = 760;
  const by = 920;
  for (let k = 0; k < 4; k++) SLABS.push({i: SLABS.length, w: 400, d: 150, x: bx, y: by - k * 40, floor: String(k + 1)});
  for (let k = 0; k < 17; k++) SLABS.push({i: SLABS.length, w: 220, d: 90, x: bx + 60, y: by - 160 - k * 36, floor: String(k + 5)});
  SLABS.push({i: SLABS.length, w: 220, d: 90, x: bx + 60, y: by - 160 - 17 * 36, floor: 'R1'});
}
const SHEET_W = 230;
const SHEET_H = 125;
const slot = (k: number) => ({x: 130 + (k % 6) * 280, y: 120 + Math.floor(k / 6) * 165});
const SHEET_NAMES = ['L-101', 'L-102', 'L-103', 'L-104', 'L-301', 'L-501', 'L-0', 'L-1 B', 'L-1 A', 'L-2', 'L-3', 'L-4', 'L-5', 'L-6', 'L-7', 'L-8', 'D-01', 'F-15', 'F-16 p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'F-17', 'L-3 fill', 'L-1 fill'];
const sheetOfSlab = (s: Slab) => (s.floor === '1' ? 0 : s.floor === '4' ? 1 : s.floor === '6' ? 2 : s.floor === 'R1' ? 3 : 4 + (s.i > 3 ? s.i - (s.floor === 'R1' ? 1 : 0) : s.i) - (s.i >= 5 ? 1 : 0));
const LIT = ['6', '9', '12', '15', '18', '21'];

const Tower: React.FC<{t: number}> = ({t}) => {
  const restack = ov(t, 10, 12.4);
  const dark = ov(t, 16.9, 17.3);
  return (
    <>
      <Lbl x={640} y={60} text="3D tower, blue hour (three.js) · podium 1–4F + deck · tower 5–21F · roof garden" />
      {SLABS.map((s) => {
        const li = 3 + s.i * 0.12;
        const lift = ov(t, li, li + 0.5) * (1 - restack);
        const paper = ov(t, li + 0.25, li + 0.9) * (1 - restack);
        const fly = ov(t, li + 0.5, Math.max(6, li + 1.1)) * (1 - restack);
        const sheet = slot(sheetOfSlab(s) === 2 ? 14 : sheetOfSlab(s) === 14 ? 2 : sheetOfSlab(s));
        const x = lerp(s.x, sheet.x, fly);
        const y = lerp(s.y - lift * (8 + s.i * 12), sheet.y, fly);
        const w = lerp(s.w, SHEET_W, paper);
        const h = lerp(12, SHEET_H, paper);
        const litK = LIT.indexOf(s.floor);
        const lit = litK >= 0 ? ov(t, 12.6 + litK * 0.32, 12.6 + litK * 0.32 + 0.3) * (litK === 0 ? 1 : 1 - 0.85 * dark) : 0;
        const fill = lit > 0 ? `rgba(36,87,255,${0.3 + 0.7 * lit})` : paper > 0.5 ? 'rgba(255,255,255,0.9)' : '#d8d8d8';
        return (
          <div key={s.i}>
            {/* the slab: a thin box in oblique, or the sheet it becomes */}
            <div style={{position: 'absolute', left: x, top: y, width: w, height: h, background: fill, border: `2px solid ${INK}`, boxSizing: 'border-box', transform: paper < 0.5 ? `skewX(-30deg) translateX(${(s.d * (1 - paper)) / 2}px)` : 'none'}} />
            {paper > 0.5 && fly > 0.9 ? <Lbl x={x + 6} y={y + 6} text={SHEET_NAMES[sheetOfSlab(s)] ?? ''} size={16} /> : null}
            {lit > 0.5 ? <Lbl x={x + w + 70} y={y - 12} text={litK === 0 ? 'L-103 lit cobalt · 6F' : `copy · ${s.floor}F`} size={16} colour="#9ab4ff" /> : null}
          </div>
        );
      })}
      {/* the eight sheets that are not slabs fan in from behind */}
      {Array.from({length: 8}, (_, k) => {
        const idx = 22 + k;
        const u = ov(t, 4.3 + k * 0.14, 6) * (1 - restack);
        if (u <= 0) return null;
        const sl = slot(idx);
        return <Rect key={idx} x={lerp(sl.x + (k % 2 ? 500 : -500), sl.x, u)} y={lerp(1200, sl.y, u)} w={SHEET_W} h={SHEET_H} a={u} fill="rgba(255,255,255,0.9)" />;
      })}
      {t >= 6 && t < 10 ? <Lbl x={130} y={60} text="30 sheets: the tower's real renders + the greenfield sheets as paper" /> : null}
      {t >= 10.5 && t < 22 ? <Lbl x={1140} y={560} text="six lit plates: L-103 stands for 8, 12, 16, 20F (T01)" size={18} /> : null}
    </>
  );
};

const Hook: React.FC<{t: number}> = ({t}) => {
  // the real L-1 sheet, the row of eight, the eighth lifts; the orbit scatters its twelve pieces
  const u = t - 22;
  const sheetA = 1 - ov(u, 3.0, 3.6);
  const lift = ov(u, 3.0, 4.0);
  const orbit = ov(u, 5.0, 8.2) - ov(u, 12.0, 12.6);
  const theta = (orbit * Math.PI) / 2;
  const cx = lerp(1310, 960, lift);
  const cy = lerp(740, 540, lift);
  const R = lerp(28, 170, lift);
  const scan = ov(u, 1.0, 2.4, (x) => x);
  const refA = Math.min(ov(u, 3.6, 4.2), 1 - ov(u, 12.3, 12.8));
  return (
    <>
      <Rect x={160} y={110} w={1600} h={870} a={sheetA} label="real L-1 sheet (Rev B) · push 2.2× toward the frontage row">
        <Rect x={120} y={120} w={1150} h={660} dashed label="site boundary" fill="none" />
        {Array.from({length: 8}, (_, i) => (
          <Circ key={i} cx={360 + i * 100} cy={630} r={28} stroke={i === 7 ? COBALT : INK} label={i === 7 ? 'T-08' : ''} />
        ))}
        <div style={{position: 'absolute', left: lerp(200, 1150, scan), top: 560, width: 3, height: 140, background: COBALT, opacity: scan > 0 && scan < 1 ? 1 : 0}} />
      </Rect>
      {u < 3 ? <Arrow x1={700} y1={300} x2={1100} y2={620} label="push in 2.2× → the frontage row" /> : null}
      {/* the dashed reference: a grid in the sheet plane and the x, y, z axes, turning with the orbit */}
      {refA > 0 ? (
        <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: refA}}>
          {Array.from({length: 13}, (_, i) => i - 6).map((i) => {
            const k = i * 60;
            const xa = cx + k * Math.cos(theta);
            return <g key={i}>
              <line x1={xa - 360 * Math.sin(theta) * 0} y1={cy - 360} x2={xa} y2={cy + 360} stroke={WHITE} strokeOpacity={0.35} strokeDasharray="5 8" />
              <line x1={cx - 360 * Math.cos(theta)} y1={cy + k} x2={cx + 360 * Math.cos(theta)} y2={cy + k} stroke={WHITE} strokeOpacity={0.35} strokeDasharray="5 8" />
            </g>;
          })}
          <line x1={cx - 420 * Math.cos(theta)} y1={cy} x2={cx + 420 * Math.cos(theta)} y2={cy} stroke={WHITE} strokeWidth={2} strokeDasharray="10 10" />
          <line x1={cx} y1={cy - 420} x2={cx} y2={cy + 420} stroke={WHITE} strokeWidth={2} strokeDasharray="10 10" />
          <line x1={cx - 420 * Math.sin(theta)} y1={cy} x2={cx + 420 * Math.sin(theta)} y2={cy} stroke="#ffd400" strokeWidth={2} strokeDasharray="10 10" />
          <text x={cx + 430 * Math.cos(theta)} y={cy + 8} fontFamily={FONT.mono} fontSize={22} fill={WHITE}>x</text>
          <text x={cx - 8} y={cy - 430} fontFamily={FONT.mono} fontSize={22} fill={WHITE}>y</text>
          <text x={cx + 430 * Math.sin(theta) + 8} y={cy - 14} fontFamily={FONT.mono} fontSize={22} fill="#ffd400">z · depth</text>
        </svg>
      ) : null}
      {/* T-08: twelve pieces at their own depths, scattered by the orbit */}
      {lift > 0 ? (
        <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
          {Array.from({length: 12}, (_, i) => {
            const a0 = (i / 12) * Math.PI * 2;
            const a1 = ((i + 0.8) / 12) * Math.PI * 2;
            const z = ((i * 5) % 12) * 30 - 165;
            const px = (a: number) => cx + R * Math.cos(a) * Math.cos(theta * 0.6) + z * Math.sin(theta);
            const py = (a: number) => cy + R * Math.sin(a);
            const tagA = Math.min(ov(u, 9.2 + i * 0.2, 9.4 + i * 0.2), 1 - ov(u, 12, 12.3));
            return (
              <g key={i}>
                <line x1={px(a0)} y1={py(a0)} x2={px(a1)} y2={py(a1)} stroke={orbit > 0.1 ? C.cobaltLt : WHITE} strokeWidth={5} strokeLinecap="round" />
                {tagA > 0 ? <text x={Math.max(px(a0), px(a1)) + 12} y={(py(a0) + py(a1)) / 2} fontFamily={FONT.mono} fontSize={18} fill={WHITE} opacity={tagA}>{`LINE ${100 + i}`}</text> : null}
              </g>
            );
          })}
          {ov(u, 12.6, 13.1) > 0 ? <circle cx={cx} cy={cy} r={R + 30} fill="none" stroke={COBALT} strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ov(u, 12.6, 13.1)} transform={`rotate(-90 ${cx} ${cy})`} /> : null}
        </svg>
      ) : null}
      {u >= 5 && u < 8.2 ? <Arrow x1={1400} y1={300} x2={1600} y2={540} label="orbit 90° to the side" /> : null}
      {u >= 12 && u < 12.6 ? <Arrow x1={1600} y1={540} x2={1400} y2={300} label="back to plan · the strokes snap" /> : null}
      {lift > 0.5 ? <Lbl x={cx - 760} y={cy - 300} text="T-08 lifted ×6: the twelve LINE entities of the DXF" /> : null}
      {u >= 9.2 && u < 12 ? <Lbl x={1500} y={60} text={`${Math.min(12, Math.floor((u - 9.2) / 0.2) + 1)} entities · 0 trees`} size={28} /> : null}
    </>
  );
};

const Desk: React.FC<{t: number}> = ({t}) => {
  const phase = t < 42 ? 'camphor' : t < 46 ? 'hedge' : t < 50 ? 'pavers' : 'total';
  const counted = Math.max(0, Math.min(8, Math.floor((t - 37.8) / 0.3) + 1));
  const tape = ov(t, 42.6, 44.4, (x) => x);
  const rows = [
    ['6', 'Camphore tree, cal. 10 cm', 'EA', '12', '4,200', 'camphor'],
    ['7', 'Duranta hedge', 'm', '27', '950', 'hedge'],
    ['11', 'Permeable pavers (PV-1)', 'm²', '236', '3,800', 'pavers'],
  ];
  return (
    <>
      <Lbl x={60} y={60} text="paper desk (2D) · warm lamp" />
      <Rect x={60} y={130} w={760} h={260} label="the bill (BOQ 20261014, governs) · real rows from run.json" a={phase === 'total' ? 0.3 : 1}>
        {rows.map((r, i) => (
          <div key={r[0]} style={{position: 'absolute', left: 16, top: 20 + i * 70, width: 720, ...mono, fontSize: 22, color: INK, background: phase === r[5] ? 'rgba(240,165,0,0.35)' : 'none', padding: '8px 10px', display: 'flex', gap: 24}}>
            <span style={{width: 30}}>{r[0]}</span>
            <span style={{flex: 1}}>{r[1]}</span>
            <span style={{width: 40, outline: phase === 'hedge' && r[5] === 'hedge' ? `3px solid ${RED}` : 'none'}}>{r[2]}</span>
            <span style={{width: 50, textAlign: 'right', color: phase === 'camphor' && r[5] === 'camphor' ? RED : INK}}>{r[3]}</span>
            <span style={{width: 70, textAlign: 'right', color: phase === 'pavers' && r[5] === 'pavers' ? RED : INK}}>{r[4]}</span>
          </div>
        ))}
      </Rect>
      <Rect x={900} y={130} w={960} h={760} label={phase === 'hedge' ? 'real L-1 · pan → to the hedge H-01' : 'real L-1 · the frontage row'} a={phase === 'total' ? 0.3 : 1}>
        {Array.from({length: 8}, (_, i) => (
          <Circ key={i} cx={120 + i * 95} cy={560} r={38} stroke={i < counted ? (i === 7 ? RED : COBALT) : INK} label={i < counted ? String(i + 1) : ''} width={i < counted ? 4 : 2} />
        ))}
        {phase !== 'camphor' ? (
          <>
            <div style={{position: 'absolute', left: 820, top: 100, width: 4, height: 400, background: '#999'}} />
            <div style={{position: 'absolute', left: 816, top: 500 - 400 * tape, width: 12, height: 400 * tape, background: COBALT}} />
            <Lbl x={640} y={60} text="DU H0.6 @0.3m o.c. DOUBLE ROW" colour="#f0a500" size={18} />
            <Lbl x={840} y={490 - 400 * tape} text={`tape ${(27 * tape).toFixed(1)} m`} colour="#9ab4ff" size={18} />
            {t >= 44.6 ? <Lbl x={640} y={300} text="27.0 ÷ 0.3 + 1 = 91 · × 2 rows = 182 plants" size={18} /> : null}
          </>
        ) : null}
      </Rect>
      {phase === 'pavers' ? <Lbl x={60} y={470} text="$117/m² billed · your list: up to $71 · 236 m² × $46 = $10,856 (E20, D-73)" size={24} /> : null}
      {phase === 'total' ? (
        <div style={{position: 'absolute', left: 60, top: 450, ...mono, fontSize: 26, color: WHITE}}>
          {['$516 · Camphor billed 12, drawn 8', '$10,856 · pavers over your list', '27 m · hedge priced by the metre (182 plants)', '+ the rest of the bill', '——— $17,788 queried (the Statement)'].map((l, i) => (
            <div key={l} style={{opacity: ov(t, 50.2 + i * 0.18, 50.4 + i * 0.18), marginTop: 8}}>{l}</div>
          ))}
        </div>
      ) : null}
      {t >= 42 && t < 43 ? <Arrow x1={1300} y1={700} x2={1700} y2={400} label="pan → to the hedge" /> : null}
    </>
  );
};

const Gauge: React.FC<{t: number}> = ({t}) => {
  const fill = ov(t, 52.4, 54.6);
  const up = ov(t, 58.2, 59.4);
  const down = ov(t, 61.0, 62.2);
  const v = lerp(0, 209.9, fill) + (299.5 - 209.9) * up * (1 - down);
  const pass = v >= 297;
  const shrink = ov(t, 60.8, 61.4);
  const fixes = t >= 63;
  return (
    <>
      <Lbl x={60} y={60} text="dark desk · the greenery gauge (the product's design) · E14" />
      <div style={{position: 'absolute', left: 160, top: 160, width: 1600, opacity: fixes ? 0.3 : 1}}>
        <div style={{position: 'relative', height: 50, background: 'rgba(0,0,0,0.3)', border: `2px solid ${INK}`}}>
          <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(v / 360) * 100}%`, background: pass ? C.greenLt : RED}} />
          <div style={{position: 'absolute', left: `${(297 / 360) * 100}%`, top: -14, bottom: -14, width: 4, background: WHITE}} />
          <Lbl x={1600 * (297 / 360) + 10} y={-50} text="required 297.0" />
          <Lbl x={Math.max(0, 1600 * (v / 360) - 200)} y={60} text={`provided ${v.toFixed(1)} · ${pass ? 'pass' : 'fail'}`} colour={pass ? C.greenLt : '#ff8a8a'} />
        </div>
      </div>
      {t >= 57.2 && !fixes ? (
        <Rect x={160} y={360} w={900} h={300} label="real L-1 · the frontage row">
          {Array.from({length: 8}, (_, i) => (
            <Circ key={i} cx={80 + i * 90} cy={160} r={34} />
          ))}
          {[0, 1].map((k) => {
            const drop = ov(t, 57.6 + k * 0.35, 58.0 + k * 0.35);
            if (drop <= 0) return null;
            return <Circ key={k} cx={800 + k * 90 - 90} cy={lerp(-80, 160, drop)} r={34 * lerp(1, 0.6, shrink)} stroke={shrink > 0 ? RED : COBALT} width={4} label={k === 0 ? '+1' : '+1'} />;
          })}
          {t >= 58 ? <Lbl x={600} y={40} text={shrink > 0 ? '+2 trees · counted small on the slab' : '+2 trees → 299.5 if the pits were in the ground'} size={18} /> : null}
        </Rect>
      ) : null}
      {t >= 59.8 && !fixes ? <Rect x={1140} y={360} w={600} h={330} label="L-6 tree pit detail · 1.5 × 1.5 m · soil 1.0 m · on slab" a={ov(t, 59.8, 60.3)} /> : null}
      {fixes ? (
        <>
          <Rect x={300} y={420} w={600} h={160} label="glass card (green dot)" a={ov(t, 63.4, 63.8)} fill="rgba(0,0,0,0.35)" stroke={WHITE}>
            <div style={{position: 'absolute', left: 24, top: 40, ...mono, fontSize: 28, color: WHITE}}>+7 trees → 299.5 · pass</div>
          </Rect>
          <Rect x={1020} y={420} w={600} h={160} label="glass card (green dot)" a={ov(t, 64.4, 64.8)} fill="rgba(0,0,0,0.35)" stroke={WHITE}>
            <div style={{position: 'absolute', left: 24, top: 40, ...mono, fontSize: 28, color: WHITE}}>or change one tree's species → 341.1</div>
          </Rect>
        </>
      ) : null}
    </>
  );
};

const Pile: React.FC<{t: number}> = ({t}) => (
  <>
    <Lbl x={60} y={60} text="the 30 sheets fall into a pile (2D)" />
    {Array.from({length: 30}, (_, i) => {
      const u = ov(t, 66.1 + i * 0.045, 66.55 + i * 0.045, (x) => x * x);
      if (u <= 0) return null;
      return <Rect key={i} x={620 + ((i * 53) % 90)} y={lerp(-300, 420 - i * 2, u)} w={700} h={380} rot={(((i * 37) % 17) - 8) * u} fill="rgba(255,255,255,0.9)" />;
    })}
  </>
);

const Developer: React.FC<{t: number}> = ({t}) => {
  const z = ov(t, 69.2, 71.0);
  const scale = lerp(1, 3.2, z);
  const tx = 1380; // T-10 on the sheet (frame coords at scale 1)
  const ty = 860;
  const cloud = ov(t, 71.0, 72.2, (x) => x);
  const panel = ov(t, 76.5, 77.0);
  return (
    <>
      <div style={{position: 'absolute', inset: 0, transform: `translate(${lerp(0, 700 - tx, z)}px, ${lerp(0, 520 - ty, z)}px) scale(${scale})`, transformOrigin: `${tx}px ${ty}px`}}>
        <Rect x={160} y={110} w={1600} h={870} label="real L-1 sheet (Rev B)">
          <Rect x={120} y={120} w={1150} h={560} dashed label="site boundary" fill="none" />
          {Array.from({length: 8}, (_, i) => (
            <Circ key={i} cx={360 + i * 100} cy={620} r={28} />
          ))}
          <Circ cx={tx - 160} cy={ty - 110} r={34} label="T-10" stroke={INK} />
          {cloud > 0 ? <Rect x={tx - 160 - 70} y={ty - 110 - 70} w={140} h={140} stroke={RED} fill="none" a={cloud} label="" /> : null}
          {cloud > 0 ? <div style={{position: 'absolute', left: tx - 160 - 70, top: ty - 110 - 70, width: 140, height: 140, border: `4px dotted ${RED}`, borderRadius: 24, opacity: cloud}} /> : null}
        </Rect>
      </div>
      {z > 0 && z < 1 ? <Frame x={lerp(0, tx - 300, 1)} y={ty - 170} w={600} h={340} label="zoom in 3.2× → T-10 (outside the site)" a={1 - z} /> : null}
      {cloud >= 1 ? <Lbl x={760} y={330} text="red revision cloud · 'T-10 · off the site' (E08)" colour="#ff8a8a" /> : null}
      {t >= 72.6 ? (
        <Rect x={1130} y={150} w={690} h={150} label="glass card (red dot)" fill="rgba(0,0,0,0.5)" stroke={WHITE} a={ov(t, 72.6, 73.0) * (1 - panel)}>
          <div style={{position: 'absolute', left: 24, top: 30, ...mono, fontSize: 24, color: WHITE}}>
            Send back · A tree drawn outside the site
            <br />
            <span style={{opacity: 0.7, fontSize: 18}}>T-10 is drawn outside the site boundary — not counted toward greening</span>
          </div>
        </Rect>
      ) : null}
      {panel > 0 ? (
        <div style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: 760, background: 'rgba(0,0,0,0.6)', border: `2px dashed ${WHITE}`, opacity: panel, transform: `translateX(${(1 - panel) * 120}px)`, padding: 60, boxSizing: 'border-box'}}>
          <Lbl x={0} y={-10} text="glass side panel · four real findings" />
          {['Billed 12, drawn 8 · $516', 'Pavers over your list · $10,856', 'Greenery short · building code', 'Hedge priced by the metre · 182 plants'].map((r, i) => (
            <div key={r} style={{...mono, fontSize: 26, color: WHITE, marginTop: 40, opacity: ov(t, 76.9 + i * 0.4, 77.2 + i * 0.4)}}>
              <span style={{color: i === 2 ? '#9ab4ff' : '#f0a500'}}>● </span>
              {r}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------- Part 2: wireframe panes inside the screen
type View = {cx: number; cy: number; z: number; label: string};
/** The camera inside the screen: [t, view]; the view interpolates between keys. */
const VIEWS: [number, View][] = [
  [90, {cx: 850, cy: 478, z: 1, label: ''}],
  [95.3, {cx: 850, cy: 478, z: 1, label: ''}],
  [96.3, {cx: 560, cy: 520, z: 1.7, label: 'zoom in 1.7× · the bills'}],
  [97.0, {cx: 560, cy: 520, z: 1.7, label: ''}],
  [98.0, {cx: 1150, cy: 560, z: 1.7, label: 'pan → the junk'}],
  [98.5, {cx: 1150, cy: 560, z: 1.7, label: ''}],
  [99.3, {cx: 850, cy: 478, z: 1, label: 'zoom out'}],
  [101.5, {cx: 850, cy: 478, z: 1, label: ''}],
  [102.5, {cx: 500, cy: 330, z: 1.5, label: 'zoom in 1.5× · project card'}],
  [103.3, {cx: 500, cy: 330, z: 1.5, label: ''}],
  [104.2, {cx: 850, cy: 478, z: 1, label: 'zoom out'}],
  [108.0, {cx: 850, cy: 478, z: 1, label: ''}],
  [108.8, {cx: 850, cy: 250, z: 1.4, label: 'follow the active step 1.4×'}],
  [115.5, {cx: 850, cy: 650, z: 1.4, label: ''}],
  [116.5, {cx: 850, cy: 478, z: 1, label: 'zoom out'}],
  [118.0, {cx: 850, cy: 478, z: 1, label: ''}],
  [119.0, {cx: 1450, cy: 300, z: 1.5, label: 'zoom in · group headers'}],
  [119.8, {cx: 1450, cy: 300, z: 1.5, label: ''}],
  [120.6, {cx: 850, cy: 478, z: 1, label: 'zoom out'}],
  [122.3, {cx: 850, cy: 478, z: 1, label: ''}],
  [123.5, {cx: 950, cy: 760, z: 1.6, label: 'the drawing flies to T-10 · zoom 1.6×'}],
  [126.0, {cx: 950, cy: 760, z: 1.6, label: ''}],
  [127.0, {cx: 850, cy: 478, z: 1, label: 'zoom out'}],
  [128.3, {cx: 850, cy: 478, z: 1, label: ''}],
  [129.3, {cx: 760, cy: 600, z: 1.5, label: 'pan to the frontage row · 1.5×'}],
  [133.5, {cx: 760, cy: 600, z: 1.5, label: ''}],
  [134.5, {cx: 850, cy: 478, z: 1, label: 'zoom out'}],
  [136.3, {cx: 850, cy: 478, z: 1, label: ''}],
  [137.3, {cx: 760, cy: 520, z: 1.6, label: 'zoom in · the gauge'}],
  [139.0, {cx: 760, cy: 520, z: 1.6, label: ''}],
  [140.0, {cx: 850, cy: 478, z: 1, label: 'zoom out'}],
  [154.0, {cx: 850, cy: 478, z: 1, label: ''}],
  [155.2, {cx: 1000, cy: 420, z: 1.8, label: 'zoom in 1.8× · one cloud and its note'}],
  [157.0, {cx: 1000, cy: 420, z: 1.8, label: ''}],
  [158.3, {cx: 850, cy: 478, z: 1, label: 'zoom out'}],
  [167.8, {cx: 850, cy: 478, z: 1, label: ''}],
  [168.6, {cx: 1350, cy: 650, z: 1.6, label: 'zoom in · the chat'}],
  [169.8, {cx: 1350, cy: 650, z: 1.6, label: ''}],
  [170.8, {cx: 760, cy: 700, z: 1.6, label: 'then the drawing · T-10'}],
  [171.8, {cx: 760, cy: 700, z: 1.6, label: ''}],
  [173.0, {cx: 850, cy: 478, z: 1, label: 'zoom out to the whole screen'}],
  [180, {cx: 850, cy: 478, z: 1, label: ''}],
];
function viewAt(t: number): View & {moving: boolean; target: View} {
  for (let k = 1; k < VIEWS.length; k++) {
    if (t <= VIEWS[k][0]) {
      const [ta, a] = VIEWS[k - 1];
      const [tb, b] = VIEWS[k];
      const u = ease(clamp01((t - ta) / (tb - ta)));
      return {cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), z: lerp(a.z, b.z, u), label: b.label, moving: b.label !== '' && u < 1, target: b};
    }
  }
  const last = VIEWS[VIEWS.length - 1][1];
  return {...last, moving: false, target: last};
}
/** The cursor's waypoints inside the screen: [t, x, y, click]. */
const CUR: [number, number, number, boolean][] = [
  [90.5, 300, 760, false],
  [92.3, 850, 480, false],
  [92.5, 850, 480, true],
  [99.3, 1500, 880, false],
  [99.5, 1500, 880, true],
  [104.5, 400, 700, false],
  [106.5, 1500, 880, true],
  [117.5, 1450, 250, false],
  [122.0, 1450, 330, true],
  [128.3, 1450, 400, true],
  [132.5, 900, 560, true],
  [136.3, 1450, 520, true],
  [143.2, 1550, 220, true],
  [145.2, 1550, 380, true],
  [149.8, 1400, 900, true],
  [160.0, 1500, 900, false],
  [162.8, 1130, 870, false],
  [164.2, 1130, 870, true],
  [167.3, 1300, 880, true],
  [172.0, 1300, 880, false],
];
function cursorAt(t: number) {
  let x = CUR[0][1];
  let y = CUR[0][2];
  for (let k = 1; k < CUR.length; k++) {
    const [ta, xa, ya] = CUR[k - 1];
    const [tb, xb, yb] = CUR[k];
    if (t <= tb) {
      const u = ease(clamp01((t - Math.max(ta, tb - 0.8)) / Math.min(0.8, tb - ta)));
      return {x: lerp(xa, xb, u), y: lerp(ya, yb, u)};
    }
    x = xb;
    y = yb;
  }
  return {x, y};
}
const CLICKS = CUR.filter((c) => c[3]).map((c) => c[0]);

const Pane: React.FC<{x: number; y: number; w: number; h: number; label: string; children?: React.ReactNode; a?: number}> = ({x, y, w, h, label, children, a = 1}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, border: `2px solid ${INK}`, background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box', opacity: a}}>
    <div style={{position: 'absolute', left: 6, top: 4, ...mono, fontSize: 16, color: INK, fontWeight: 700}}>{label}</div>
    {children}
  </div>
);
const Row: React.FC<{y: number; text: string; a?: number; colour?: string; x?: number; w?: number}> = ({y, text, a = 1, colour = INK, x = 12, w = 420}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, ...mono, fontSize: 17, color: colour, opacity: a, borderBottom: '1px solid rgba(0,0,0,0.25)', padding: '4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{text}</div>
);
const Drawing: React.FC<{x: number; y: number; w: number; h: number; t: number; cloud?: boolean; confirmed?: boolean; hover?: boolean; marked?: boolean; numbered?: boolean}> = ({x, y, w, h, t, cloud, confirmed, hover, marked, numbered}) => (
  <Pane x={x} y={y} w={w} h={h} label="the drawing · real L-1">
    <Rect x={40} y={60} w={w - 180} h={h - 160} dashed fill="none" label="" />
    {Array.from({length: 8}, (_, i) => (
      <Circ key={i} cx={90 + i * ((w - 260) / 8)} cy={h - 150} r={20} stroke={confirmed && i === 7 ? COBALT : INK} fill={numbered && i === 7 ? 'rgba(212,32,26,0.3)' : 'none'} />
    ))}
    <Circ cx={w - 80} cy={h - 50} r={22} stroke={hover ? COBALT : INK} width={hover ? 4 : 2} label="" />
    <Lbl x={w - 140} y={h - 110} text="T-10" size={14} />
    {cloud || marked || numbered ? <div style={{position: 'absolute', left: w - 130, top: h - 100, width: 100, height: 100, border: `4px dotted ${RED}`, borderRadius: 20}} /> : null}
    {marked ? <div style={{position: 'absolute', left: w - 94, top: h - 76, ...mono, fontSize: 36, color: RED, fontWeight: 700}}>×</div> : null}
    {numbered ? [1, 2, 3].map((n, k) => <Lbl key={n} x={100 + k * 300} y={100} text={`cloud ${n}`} colour="#ff8a8a" size={14} />) : null}
    {hover ? <Lbl x={w - 180} y={h - 30} text="T-10 · tree (hover: cobalt outline)" colour="#9ab4ff" size={14} /> : null}
    <span style={{position: 'absolute', left: 12, top: 30, ...mono, fontSize: 14, color: INK}}>{confirmed ? 'counted: 8 trees' : 'counted: 7 trees'}</span>
    {void t}
  </Pane>
);

const Screen: React.FC<{t: number}> = ({t}) => {
  const W = 1700;
  const H = 956;
  const v = viewAt(t);
  const cur = cursorAt(t);
  const step = t < 100 ? 1 : t < 107 ? 2 : t < 117 ? 3 : t < 142 ? 4 : t < 149 ? 5 : t < 162 ? 6 : t < 172 ? 7 : 8;
  const flyIn = ov(t, 90, 90.6);
  const inner = (() => {
    switch (step) {
      case 1: {
        const drop = ov(t, 90.5, 92.3);
        const list = t >= 92.6;
        return (
          <>
            {!list ? <Rect x={400} y={300} w={900} h={360} dashed label="/try drop zone" fill="rgba(36,87,255,0.08)" stroke={COBALT} /> : null}
            {!list ? <Rect x={lerp(200, 700, drop)} y={lerp(700, 420, drop)} w={300} h={120} label="folder · Greenfield Residences (dragged)" fill="rgba(255,255,255,0.9)" /> : null}
            {list ? (
              <>
                {Array.from({length: 30}, (_, i) => {
                  const a = ov(t, 92.6 + i * 0.085, 92.75 + i * 0.085);
                  const kind = i < 11 ? 'drawing' : i < 15 ? (i === 14 ? 'bill · governs' : 'bill · earlier version') : i < 22 ? 'document' : i === 25 ? '.bak · ignored' : i === 26 ? '.xls · unsupported' : i === 27 ? 'zip · unpacked' : 'document';
                  return <Row key={i} x={i < 15 ? 60 : 900} y={70 + (i % 15) * 50} w={760} text={`file ${String(i + 1).padStart(2, '0')} · ${kind}`} a={a} colour={kind.includes('governs') ? COBALT : kind.includes('ignored') || kind.includes('unsupported') ? RED : INK} />;
                })}
                <Lbl x={60} y={840} text="30 files · 11 drawings · 4 bills · 7 documents …" colour={WHITE} a={ov(t, 95.3, 95.6)} />
                <Rect x={1400} y={840} w={220} h={70} label="" fill={COBALT} stroke={COBALT}>
                  <div style={{...mono, color: WHITE, fontSize: 22, padding: 18}}>Continue</div>
                </Rect>
              </>
            ) : null}
          </>
        );
      }
      case 2:
        return (
          <>
            <Pane x={60} y={80} w={880} h={500} label="project card · read from the title block · Muse Spark">
              {['Greenfield Residences', 'local · landscape over a basement slab', 'site area 1,500 m²', 'read from the title block · Muse Spark'].map((l, i) => (
                <Row key={l} y={60 + i * 60} w={820} text={l} a={ov(t, 100.2 + i * 0.3, 100.5 + i * 0.3)} />
              ))}
            </Pane>
            {['Quantities & quote', 'Building code', 'Drawing logic', 'Files'].map((l, i) => (
              <Rect key={l} x={1000 + (i % 2) * 330} y={80 + Math.floor(i / 2) * 200} w={300} h={160} label={i === 0 ? 'four toggle cards · all on' : ''} fill="rgba(36,87,255,0.15)">
                <div style={{...mono, fontSize: 20, padding: 16, color: INK}}>● {l}</div>
              </Rect>
            ))}
            <Lbl x={1000} y={520} text="currency: USD" />
            <Rect x={1400} y={840} w={220} h={70} label="" fill={COBALT} stroke={COBALT}>
              <div style={{...mono, color: WHITE, fontSize: 22, padding: 18}}>Analyze</div>
            </Rect>
          </>
        );
      case 3:
        return (
          <Pane x={200} y={60} w={1300} h={840} label="analyze · the steps tick top to bottom · model chips + counters from the run">
            {['Muse Spark · reading 22 sheets', 'Geometry · closing outlines, counting', 'SAM 3.1 · measuring colour areas', 'Bill · 4 versions aligned', 'Building code · greenery, fire lane, water'].map((l, i) => {
              const at = [108, 110, 112, 114, 115.5][i];
              const done = t >= at;
              return <Row key={l} y={80 + i * 150} w={1200} text={`${done ? '✓' : '○'} ${l}`} colour={done ? COBALT : INK} />;
            })}
            {t >= 116 ? <Lbl x={500} y={790} text="71 checks" colour={WHITE} size={26} /> : null}
          </Pane>
        );
      case 4: {
        const t10 = t >= 122.3 && t < 128.3;
        const row = t >= 128.3 && t < 136.3;
        const gauge = t >= 136.3;
        return (
          <>
            <Pane x={30} y={60} w={240} h={860} label="sheets">
              {Array.from({length: 11}, (_, i) => (
                <Row key={i} y={40 + i * 40} w={210} text={`L-${i}`} />
              ))}
            </Pane>
            <Drawing x={290} y={60} w={1000} h={860} t={t} cloud={t >= 123} confirmed={t >= 132.8} />
            <Pane x={1310} y={60} w={360} h={860} label={`findings · 4 groups · $17,788 queried`}>
              {[
                ['Send back · 2', 'A tree drawn outside the site', t10],
                ['Fix before pricing · 10', 'Billed 12, drawn 8 · $516', row],
                ['Building code · 5', 'Greenery short', gauge],
                ['Ask the architect · 4', 'Fire lane: T-09', false],
              ].map(([g, r, on], i) => (
                <div key={String(g)}>
                  <Row y={40 + i * 170} w={330} text={String(g)} colour={COBALT} />
                  <Row y={80 + i * 170} w={330} text={`▸ ${r}`} colour={on ? RED : INK} />
                </div>
              ))}
            </Pane>
            {row ? (
              <Pane x={700} y={300} w={560} h={300} label="T-08 card · the crop · 12 loose lines · Muse Spark: one tree, 95%" a={ov(t, 130, 130.3)}>
                <Circ cx={120} cy={170} r={60} stroke={COBALT} />
                <Rect x={300} y={200} w={200} h={60} fill={t >= 132.8 ? C.green : COBALT} stroke="none" label="">
                  <div style={{...mono, color: WHITE, padding: 14}}>{t >= 132.8 ? 'Confirmed · 8' : 'Confirm — 8 trees'}</div>
                </Rect>
                {t >= 132.8 ? <Lbl x={300} y={120} text="count flips 7 → 8" colour="#9ab4ff" size={16} /> : null}
              </Pane>
            ) : null}
            {gauge ? (
              <Pane x={400} y={360} w={720} h={300} label="greenery gauge · 209.9 / 297.0 · +7 trees · or change one species" a={ov(t, 136.6, 137)}>
                <div style={{position: 'absolute', left: 30, top: 120, width: 640, height: 40, border: `2px solid ${INK}`}}>
                  <div style={{width: `${(209.9 / 360) * 100}%`, height: '100%', background: RED}} />
                  <div style={{position: 'absolute', left: `${(297 / 360) * 100}%`, top: -10, width: 4, height: 60, background: INK}} />
                </div>
              </Pane>
            ) : null}
          </>
        );
      }
      case 5:
        return (
          <>
            <Pane x={30} y={60} w={240} h={760} label="sheets" />
            <Drawing x={290} y={60} w={1000} h={760} t={t} />
            <Pane x={1310} y={60} w={360} h={760} label="findings">
              {['Send back · 2', 'Fix before pricing · 10'].map((g, i) => (
                <div key={g}>
                  <Row y={40 + i * 160} w={330} text={g} colour={COBALT} />
                  <Rect x={200} y={30 + i * 160} w={140} h={40} label="" fill={t >= [143.2, 145.2][i] ? COBALT : 'rgba(255,255,255,0.9)'} stroke={COBALT}>
                    <div style={{...mono, fontSize: 14, padding: 10, color: t >= [143.2, 145.2][i] ? WHITE : COBALT}}>Select all</div>
                  </Rect>
                </div>
              ))}
            </Pane>
            <Rect x={30} y={840} w={1640} h={80} label="" fill="rgba(0,0,0,0.6)" stroke={WHITE} a={ov(t, 146, 146.3)}>
              <div style={{...mono, fontSize: 24, color: WHITE, padding: 22}}>bottom bar: Create change request · N items · $X (read off the screen at capture)</div>
            </Rect>
          </>
        );
      case 6: {
        const drawer = ov(t, 150, 151);
        return (
          <>
            <Drawing x={290} y={60} w={1000} h={760} t={t} />
            <Pane x={1310} y={60} w={360} h={760} label="findings" />
            <div style={{position: 'absolute', left: lerp(1700, 200, drawer), top: 40, width: 1480, height: 880, background: 'rgba(255,255,255,0.92)', border: `2px solid ${INK}`, boxSizing: 'border-box'}}>
              <Lbl x={0} y={-30} text="the report drawer · change request" />
              <Pane x={30} y={40} w={380} h={800} label="cover · project · N changes · $X · sheets affected" />
              <Pane x={440} y={40} w={700} h={800} label="L-1 with numbered red revision clouds">
                {[1, 2, 3].map((n, k) => (
                  <div key={n} style={{position: 'absolute', left: 80 + k * 200, top: 200 + (k % 2) * 250, width: 120, height: 120, border: `4px dotted ${RED}`, borderRadius: 20}}>
                    <Lbl x={0} y={-30} text={n === 1 ? `cloud ${n} · Row 6: 12 → 8 Camphor · $516` : `cloud ${n}`} colour="#ff8a8a" size={14} />
                  </div>
                ))}
              </Pane>
              <Pane x={1170} y={40} w={280} h={800} label="change list">
                {Array.from({length: 8}, (_, i) => (
                  <Row key={i} y={40 + i * 40} w={250} text={`${i + 1}. change`} />
                ))}
                <Rect x={20} y={700} w={240} h={60} label="" fill={t >= 160 && Math.floor(t * 2) % 2 === 0 ? C.cobaltLt : COBALT} stroke="none">
                  <div style={{...mono, color: WHITE, padding: 16}}>Download PDF {t >= 160 ? '(pulses)' : ''}</div>
                </Rect>
              </Pane>
            </div>
          </>
        );
      }
      case 7: {
        const typed = 'This tree is outside the site. Mark it for removal.';
        const n = Math.floor(ov(t, 164.6, 167, (x) => x) * typed.length);
        return (
          <>
            <Drawing x={30} y={60} w={1180} h={860} t={t} hover={t >= 162.8 && t < 164.2} marked={t >= 169.5} />
            <Pane x={1230} y={60} w={440} h={860} label="chat · Ask the package">
              {t >= 164.2 ? <Rect x={20} y={60} w={160} h={44} label="" fill="rgba(36,87,255,0.2)" stroke={COBALT}><div style={{...mono, fontSize: 16, padding: 10, color: COBALT}}>T-10 · tree</div></Rect> : null}
              {t >= 164.2 ? <Lbl x={190} y={64} text="chip dropped into the chat" size={14} /> : null}
              <div style={{position: 'absolute', left: 20, top: 130, width: 400, ...mono, fontSize: 18, color: INK}}>{typed.slice(0, n)}{t >= 164.6 && t < 167.3 ? '▌' : ''}</div>
              {t >= 168 ? (
                <div style={{position: 'absolute', left: 20, top: 260, width: 400, ...mono, fontSize: 17, color: INK, background: 'rgba(36,87,255,0.08)', padding: 12, opacity: ov(t, 168, 168.4)}}>
                  Muse Spark's recorded answer · with its citation (file · page · "the quoted line")
                </div>
              ) : null}
              {t >= 170 ? <Lbl x={20} y={420} text="Added to the change request" colour="#9ab4ff" size={16} /> : null}
              {t >= 169.5 ? <Lbl x={20} y={470} text="a red X and a cloud land on T-10" colour="#ff8a8a" size={16} /> : null}
            </Pane>
          </>
        );
      }
      default:
        return (
          <>
            <Drawing x={290} y={60} w={1000} h={860} t={t} />
            <Pane x={30} y={60} w={240} h={860} label="sheets" />
            <Pane x={1310} y={60} w={360} h={860} label="findings" />
            {t >= 173.5 && t < 178 ? (
              <Rect x={300} y={330} w={1100} h={220} label="glass card over the whole screen" fill="rgba(0,0,0,0.6)" stroke={WHITE} a={ov(t, 173.5, 174)}>
                <div style={{...mono, fontSize: 28, color: WHITE, padding: 40, lineHeight: 1.5}}>Tested on 30 planted errors · 28 found · 2 flagged for a person · 0 missed · 0 false alarms</div>
              </Rect>
            ) : null}
          </>
        );
    }
  })();
  if (t >= 178) {
    return (
      <AbsoluteFill style={{background: '#333'}}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...mono, color: WHITE}}>
          <div style={{fontFamily: FONT.sans, fontSize: 120, fontWeight: 700}}>Landsight</div>
          <div style={{fontSize: 30, marginTop: 20}}>github.com/eric2612115/landsight</div>
          <Lbl x={0} y={0} text="the lockup · music button · end" />
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <>
      <Lbl x={620} y={18} text={`PART 2 · the real product, recorded at /try (4K60 capture) · step ${step}`} />
      <div style={{position: 'absolute', left: 110, top: 62, width: W, height: H, borderRadius: 18, overflow: 'hidden', border: `3px solid ${INK}`, background: '#e8e8e8', transform: `translateY(${(1 - flyIn) * 900}px)`}}>
        <div style={{position: 'absolute', inset: 0, transform: `translate(${(W / 2 - v.cx) * v.z}px, ${(H / 2 - v.cy) * v.z}px) scale(${v.z})`, transformOrigin: `${v.cx}px ${v.cy}px`}}>
          {inner}
          <Cursor x={cur.x} y={cur.y} clicks={CLICKS} t={t} />
        </div>
        {v.moving ? <Frame x={v.target.cx - W / (2 * v.target.z) + (W / 2 - v.cx) * 0 - 0} y={v.target.cy - H / (2 * v.target.z)} w={W / v.target.z} h={H / v.target.z} label={v.label} /> : null}
      </div>
    </>
  );
};

// ---------------------------------------------------------------- the composition
export const AnimaticV7: React.FC<AnimaticV7Props> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const BEATS = ANIM.beats as [number, number, string, number][];
  const beat = BEATS.find(([a, b]) => t >= a && t < b) ?? BEATS[BEATS.length - 1];
  const part = beat[3] as number;
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(frame % fps).padStart(2, '0')}`;
  const line = ANIM.voice.find((v) => {
    const len = data?.lines.find((l) => l.n === v.n)?.seconds ?? v.text.length * 0.07;
    return t >= v.at && t < v.at + len;
  });
  const cue = (ANIM.music as [number, string][]).find(([at]) => t >= at && t < at + 1.2);
  const warm = ov(t, 85, 86); // the lamp clicks on
  return (
    <AbsoluteFill style={{background: FIELD, overflow: 'hidden', fontFamily: FONT.mono}}>
      {/* ---------------- Part 1 ---------------- */}
      {t < 22 ? (
        <>
          <Tower t={t} />
          {t < 3 ? <Arrow x1={620} y1={900} x2={620} y2={300} label="crane up the facade, low angle" /> : null}
          {t >= 3 && t < 6 ? <Arrow x1={300} y1={700} x2={200} y2={400} label="pull back as the floors lift apart (0.12 s stagger)" /> : null}
          {t >= 6 && t < 10 ? (
            <>
              <Frame x={lerp(130, 690, ov(t, 8, 10))} y={lerp(120, 450, ov(t, 8, 10))} w={lerp(1680, SHEET_W + 40, ov(t, 8, 10))} h={lerp(880, SHEET_H + 40, ov(t, 8, 10))} label="fallback: push in → L-103" />
              <Live title="LIVE L-PAIN (0:06–0:10)" lines={['dim room, lit by the monitor · over the shoulder, wide', 'the screen tiled with 6–8 open drawings (demo/props renders in Preview)', 'he draws a red box around the row of trees on L-1, then around a bill row', 'phone 4K 60 fps · exposure locked · 3 takes × 10 s']} a={0.88} />
            </>
          ) : null}
          {t >= 10 && t < 12.4 ? <Arrow x1={200} y1={200} x2={700} y2={600} label="the sheets fly back into the tower" /> : null}
          {t >= 12.4 ? <Arrow x1={300} y1={300} x2={450} y2={420} label="slow orbit, the tower left of frame" /> : null}
          {t >= 15 ? (
            <Rect x={lerp(1950, 1100, ov(t, 15, 15.5))} y={160} w={780} h={120} label="T06 bill row (the tower bill, row 13, B13)" fill="rgba(255,255,255,0.92)">
              <div style={{position: 'absolute', left: 20, top: 30, ...mono, fontSize: 26, color: INK}}>
                13 · Planter shrubs, typ. floor <span style={{position: 'relative', padding: '0 6px', border: t >= 16 ? `3px solid ${RED}` : 'none', borderRadius: 20}}>x 1</span> · m² · 20 · 620
              </div>
              {t >= 16 ? <Lbl x={400} y={-30} text="'x 1' circles red" colour="#ff8a8a" /> : null}
              {t >= 16.9 ? <Lbl x={520} y={-30} text="five plates go dark" colour="#9ab4ff" /> : null}
            </Rect>
          ) : null}
          {t >= 19 ? (
            <Rect x={1100} y={560} w={780} h={150} label="glass card (red dot) floats in" fill="rgba(0,0,0,0.5)" stroke={WHITE} a={ov(t, 19, 19.5)}>
              <div style={{position: 'absolute', left: 24, top: 26, ...mono, fontSize: 26, color: WHITE}}>
                Bill: 1 floor · Drawing: 6 floors
                <br />
                <span style={{fontSize: 18, opacity: 0.7}}>Planter shrubs, typ. floor x 1: bill 20 m², drawing 120 m² · $19/m² (T06)</span>
              </div>
            </Rect>
          ) : null}
        </>
      ) : null}
      {t >= 22 && t < 36 ? <Hook t={t} /> : null}
      {t >= 36 && t < 52 ? <Desk t={t} /> : null}
      {t >= 52 && t < 66 ? <Gauge t={t} /> : null}
      {t >= 66 && t < 69 ? <Pile t={t} /> : null}
      {t >= 69 && t < 79 ? <Developer t={t} /> : null}
      {t >= 79 && t < 82 ? (
        <>
          <Lbl x={60} y={60} text="black · huge type · two model chips rise · small 'by Meta'" />
          {['Muse Spark 1.3 — reads', 'SAM 3.1 — measures'].map((c, k) => (
            <Rect key={c} x={420 + k * 580} y={680} w={520} h={120} label={k === 0 ? 'model chips (glass)' : ''} fill="rgba(0,0,0,0.5)" stroke={WHITE} a={ov(t, 80.6 + k * 0.25, 81 + k * 0.25)}>
              <div style={{...mono, fontSize: 26, color: WHITE, padding: 40}}>{c}</div>
            </Rect>
          ))}
          {t >= 81.5 ? <Lbl x={900} y={880} text="by Meta" /> : null}
        </>
      ) : null}
      {t >= 82 && t < 90 ? (
        <>
          <Live
            title="LIVE L-TURN (1:22–1:30)"
            lines={['the same dim room · Finder on the sample package folder, list view: .bak, .xls, .zip, scans, four bill versions', 'he scrolls and leans back', `1:25 a lamp clicks on, the room warms ${warm > 0 ? '← lamp on' : ''}`, "he turns to the lens: “No more of this. Here's the real product.” (his own audio; the clone stands in here)", 'fallback: the folder as a screen capture, the light as a grade change, the card below']}
            warm={warm}
          />
          {t >= 86.6 ? <Lbl x={120} y={620} text="fallback card: The real product. Recorded, not mocked." size={24} /> : null}
          {t >= 88 ? <Arrow x1={960} y1={1050} x2={960} y2={760} label="the screen flies in (whoosh · M1 out, M2 in)" /> : null}
        </>
      ) : null}
      {/* ---------------- Part 2 ---------------- */}
      {t >= 90 ? <Screen t={t} /> : null}

      {/* the type cards as plain white text at their real positions and times */}
      {ANIM.cards.map((c) => (
        <Card key={c.text} text={c.text} at={c.at} until={c.until} t={t} place={c.place as 'low' | 'centre'} />
      ))}

      {/* subtitles of the voice */}
      {line ? (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 20, textAlign: 'center'}}>
          <span style={{display: 'inline-block', ...mono, fontSize: 26, color: WHITE, background: 'rgba(0,0,0,0.75)', padding: '8px 18px', borderRadius: 6, maxWidth: 1600}}>
            {line.n} · {line.text}
            {line.standIn ? <span style={{opacity: 0.6}}> · ({line.standIn})</span> : null}
          </span>
        </div>
      ) : null}

      {/* music cue labels */}
      {cue ? <Lbl x={1500} y={60} text={`♪ ${cue[1]}`} colour="#ffd400" size={24} /> : null}

      {/* corner overlay: timecode, beat, part */}
      <div style={{position: 'absolute', left: 24, top: 18, ...mono, fontSize: 24, color: WHITE, background: 'rgba(0,0,0,0.75)', padding: '8px 14px', borderRadius: 6}}>
        {tc} · PART {part} · {beat[2]}
      </div>

      {/* sound: the voice, one file per line at the script's start; the ticks at the music cues */}
      {ANIM.voice.map((v) => {
        const len = data?.lines.find((l) => l.n === v.n)?.seconds;
        if (!len) return null;
        return (
          <Sequence key={v.n} from={Math.round(v.at * fps)} durationInFrames={Math.ceil((len + 0.2) * fps)} name={`voice ${v.n}`}>
            <Audio src={staticFile(`audio/v7-voice/line-${String(v.n).padStart(2, '0')}.mp3`)} />
          </Sequence>
        );
      })}
      {data?.ticks ? <Audio src={staticFile(data.ticks)} name="music cue ticks" /> : null}
    </AbsoluteFill>
  );
};
