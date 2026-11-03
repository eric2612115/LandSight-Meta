import {AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {CLOSE_AT, LOCKUP_AT, PART2_AT, SEGMENTS, V10, timed} from './animatic-v10-cues.js';
import {HEDGE, ROW, T8, WorldV10, corridorAt, personAt, personWorld, pieceEnds, pieceHeight, pitShrink, plantersOut, plateAt, projectAt, riseAt, sevenAt, turnRate} from './WorldV10';
import type {WorldSheet} from './WorldV10';
import t08 from './t08.json';

/**
 * Film v10 animatic: Eric opens (three grey slots), the push through his monitor into the world (WorldV10), every
 * problem as a screen-space card followed by its small green fix card; the split human/computer view; the corridor's
 * walking person; the pit cut-away with the greenery meter; the findings in three groups; the bridge — the sheets
 * fly into a folder that becomes the folder the cursor drags on /try (an object match into Part 2); the capture with
 * its holds cut; the scoreboard; the lockup. Fast camera moves carry a motion blur. No sound: queued subtitles.
 */
export type AnimaticV10Data = {sheets: WorldSheet[]};
export type AnimaticV10Props = {data?: AnimaticV10Data};

const GREY = '#8a8a8a';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const LINES = timed();
const DOT: Record<string, string> = {red: C.red, amber: C.amber, blue: C.cobaltLt, white: '#fff', green: C.greenLt};
const PANEL = 'rgba(20,22,26,0.92)';

const Card: React.FC<{dot: string; title: string; sub?: string; a: number; x?: number; y?: number; w?: number; size?: number; inline?: boolean}> = ({dot, title, sub, a, x = 80, y = 100, w, size = 52, inline = false}) => (
  <div style={{position: inline ? 'relative' : 'absolute', left: inline ? undefined : x, top: inline ? undefined : y, width: w, boxSizing: 'border-box', opacity: a, transform: `translateY(${(1 - a) * 12}px)`, borderRadius: 24, background: PANEL, border: '1.5px solid rgba(255,255,255,0.28)', padding: '22px 30px', color: '#fff', fontFamily: FONT.sans, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', whiteSpace: 'nowrap'}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
      <div style={{width: 18, height: 18, borderRadius: 9, background: DOT[dot], boxShadow: `0 0 16px ${DOT[dot]}`, flex: 'none'}} />
      <div style={{fontSize: size, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.15}}>{title}</div>
    </div>
    {sub ? <div style={{marginTop: 8, marginLeft: 36, fontSize: 30, opacity: 0.75, lineHeight: 1.3}}>{sub}</div> : null}
  </div>
);
/** The small green fix card under a problem card. */
const FixCard: React.FC<{text: string; a: number; y?: number}> = ({text, a, y = 262}) => (
  <div style={{position: 'absolute', left: 80, top: y, opacity: a, transform: `translateY(${(1 - a) * 10}px)`, borderRadius: 18, background: 'rgba(31,157,85,0.92)', border: '1.5px solid rgba(255,255,255,0.35)', padding: '14px 24px', color: '#fff', fontFamily: FONT.sans, fontSize: 32, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 14px 40px rgba(0,0,0,0.3)'}}>
    <span style={{marginRight: 12}}>✓</span>
    {text}
  </div>
);
const Tag: React.FC<{x: number; y: number; text: string; colour?: string; size?: number; a?: number}> = ({x, y, text, colour = '#fff', size = 28, a = 1}) => (
  <div style={{position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', fontFamily: FONT.mono, fontSize: size, fontWeight: 700, color: colour, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6, opacity: a, whiteSpace: 'nowrap'}}>{text}</div>
);
const Check: React.FC<{x: number; y: number; a: number}> = ({x, y, a}) => (
  <div style={{position: 'absolute', left: x - 36, top: y - 36, width: 72, height: 72, borderRadius: 36, background: C.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.sans, fontSize: 46, fontWeight: 700, opacity: a, transform: `scale(${0.6 + 0.4 * a})`, boxShadow: '0 0 30px rgba(60,207,127,0.6)'}}>✓</div>
);
const Leader: React.FC<{from: [number, number]; to: {x: number; y: number; visible: boolean}; a: number}> = ({from, to, a}) =>
  to.visible ? (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: a}}>
      <line x1={from[0]} y1={from[1]} x2={to.x} y2={to.y} stroke="#fff" strokeWidth={2} strokeDasharray="8 8" />
      <circle cx={to.x} cy={to.y} r={9} fill="none" stroke="#fff" strokeWidth={3} />
    </svg>
  ) : null;
const TypeCard: React.FC<{text: string; at: number; until: number; t: number; dim?: boolean}> = ({text, at, until, t, dim = true}) => {
  if (t < at || t > until) return null;
  const a = Math.min(clamp01((t - at) / 0.2), clamp01((until - t) / 0.25));
  return (
    <AbsoluteFill style={{display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: a}}>
      {dim ? <div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)'}} /> : null}
      <div style={{position: 'relative', fontFamily: FONT.sans, fontSize: 112, fontWeight: 600, letterSpacing: -3, color: '#fff', textAlign: 'center', maxWidth: 1700, lineHeight: 1.05, textShadow: '0 4px 40px rgba(0,0,0,0.6)'}}>{text}</div>
    </AbsoluteFill>
  );
};
const Live: React.FC<{label: string; a?: number}> = ({label, a = 1}) => (
  <AbsoluteFill style={{opacity: a, background: 'rgba(40,40,44,0.92)'}}>
    <div style={{position: 'absolute', inset: 48, border: '3px dashed rgba(255,255,255,0.6)'}} />
    <div style={{position: 'absolute', left: 90, top: 70, fontFamily: FONT.mono, fontSize: 36, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '8px 16px'}}>{label}</div>
  </AbsoluteFill>
);

/** The roof planter, cut away: 0.3 m of soil against the 0.4 m line; the soil rises to 0.4 m as the fix. */
const RoofPlanter: React.FC<{a: number; fix: number}> = ({a, fix}) => {
  const soilTop = lerp(190, 170, fix);
  return (
    <svg width={680} height={392} viewBox="0 0 520 300" style={{position: 'absolute', right: 90, top: 340, opacity: a, background: PANEL, borderRadius: 24, border: '1.5px solid rgba(255,255,255,0.28)'}}>
      <text x={30} y={44} fill="#fff" fontFamily="Inter" fontSize={26} fontWeight={600}>roof planter, cut away · L-104</text>
      <rect x={60} y={120} width={360} height={130} fill="none" stroke="#ddd" strokeWidth={4} />
      <rect x={64} y={soilTop} width={352} height={246 - soilTop} fill="#6b5a46" />
      <text x={430} y={soilTop + 34} fill={fix > 0.5 ? '#3ccf7f' : '#f0a500'} fontFamily="JetBrains Mono" fontSize={22}>{fix > 0.5 ? '0.4 m' : '0.3 m'}</text>
      <line x1={40} y1={170} x2={440} y2={170} stroke="#6d8dff" strokeWidth={3} strokeDasharray="10 8" />
      <text x={448} y={166} fill="#6d8dff" fontFamily="JetBrains Mono" fontSize={22}>0.4 m</text>
      <text x={30} y={282} fill="#fff" fontFamily="Inter" fontSize={22} opacity={0.75}>{fix > 0.5 ? 'fixed · 35 m² of shrubs count again' : 'minimum on a roof · T02 · not counted'}</text>
    </svg>
  );
};

/** The greenery meter for the pit beat: 261.1 → 209.9 as the tree shrinks, then → 299.5 with the seven trees. */
const Meter: React.FC<{t: number}> = ({t}) => {
  const a = Math.min(ov(t, 86.0, 86.5), 1 - ov(t, 92.0, 92.5));
  const down = ov(t, 86.6, 88.2);
  const up = ov(t, 90.0, 91.4);
  const v = lerp(lerp(261.1, 209.9, down), 299.5, up);
  const pass = v >= 297;
  const W = 760;
  const px = (n: number) => (n / 360) * W;
  return (
    <div style={{position: 'absolute', right: 80, top: 330, width: W + 60, padding: '22px 30px', borderRadius: 24, background: PANEL, border: '1.5px solid rgba(255,255,255,0.28)', opacity: a, fontFamily: FONT.sans, color: '#fff'}}>
      <div style={{fontSize: 26, opacity: 0.8}}>greenery (Art. 302) · kgCO₂e/yr · E14</div>
      <div style={{position: 'relative', height: 44, marginTop: 44, background: 'rgba(255,255,255,0.08)', borderRadius: 8}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: px(v), background: pass ? C.greenLt : C.red, borderRadius: 8}} />
        <div style={{position: 'absolute', left: px(297), top: -14, bottom: -14, width: 4, background: '#fff'}} />
        <div style={{position: 'absolute', left: px(297) + 10, top: -44, fontFamily: FONT.mono, fontSize: 24}}>required 297.0</div>
        <div style={{position: 'absolute', left: Math.max(0, px(v) - 240), top: 54, fontFamily: FONT.mono, fontSize: 28, fontWeight: 700, color: pass ? C.greenLt : '#ff8a8a'}}>{`provided ${v.toFixed(1)} · ${pass ? 'pass' : 'fail'}`}</div>
      </div>
      <div style={{height: 60}} />
    </div>
  );
};

const Findings: React.FC<{t: number}> = ({t}) => {
  const F = V10.findings;
  const a = Math.min(ov(t, F.at, F.at + 0.4), 1 - ov(t, V10.beats.bridge - 0.3, V10.beats.bridge + 0.2));
  if (a <= 0) return null;
  const group = (title: string, dot: string, items: string[], x: number, delay: number) => (
    <div style={{position: 'absolute', left: x, top: 130, width: 590}}>
      <div style={{fontFamily: FONT.sans, fontSize: 40, fontWeight: 600, color: DOT[dot], marginBottom: 14, opacity: ov(t, F.at + delay, F.at + delay + 0.3)}}>{title}</div>
      {items.map((it, i) => (
        <div key={it} style={{marginBottom: 12}}>
          <Card dot={dot} title={it} a={ov(t, F.at + delay + 0.3 + i * 0.22, F.at + delay + 0.55 + i * 0.22)} w={590} size={27} inline />
        </div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: 'rgba(20,22,26,0.6)'}} />
      {group('Send back', 'red', F.sendBack, 60, 0)}
      {group('Fix before pricing', 'amber', F.fix, 665, 1.2)}
      {group('Building code', 'blue', F.code, 1270, 2.2)}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 110, textAlign: 'center', opacity: ov(t, F.at + 3.2, F.at + 3.6)}}>
        <span style={{fontFamily: FONT.sans, fontSize: 64, fontWeight: 700, color: '#fff', background: PANEL, padding: '14px 40px', borderRadius: 24, border: '1.5px solid rgba(255,255,255,0.28)'}}>{F.total}</span>
      </div>
    </AbsoluteFill>
  );
};

/** The folder: appears at the lens as the sheets arrive, then flies to where the capture's drag chip is. */
const Folder: React.FC<{t: number}> = ({t}) => {
  const a = ov(t, 97.0, 97.5);
  if (a <= 0 || t >= PART2_AT) return null;
  const m = ov(t, 97.7, PART2_AT); // to the chip
  const T = V10.folderTarget;
  const w = lerp(520, T.w, m);
  const h = lerp(360, T.h, m);
  const x = lerp(960, T.x + T.w / 2, m);
  const y = lerp(800, T.y + T.h / 2, m);
  return (
    <div style={{position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, opacity: a, borderRadius: lerp(28, 8, m), background: lerp(0, 1, m) > 0.6 ? 'rgba(36,87,255,0.35)' : '#2457ff', border: `${lerp(0, 2, m)}px solid rgba(109,141,255,0.9)`, boxShadow: '0 20px 60px rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.sans, fontSize: lerp(40, 16, m), fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: -lerp(26, 0, m), width: lerp(200, 0, m), height: lerp(26, 0, m), background: '#2457ff', borderRadius: '12px 12px 0 0'}} />
      Greenfield Residences
    </div>
  );
};

/** The coloured Presentation Plan (a raster PDF page, no CAD): Muse Spark reads its legend, SAM 3.1 masks every patch. */
const RASTER = {w: 1920, h: Math.round((1920 * 1140) / 2100), top: Math.round((1080 - (1920 * 1140) / 2100) / 2)};
const LEGEND: {words: string; name: string; sw: [number, number]; patches: [number, number, number, number][]; area?: number; count?: number}[] = [
  {words: 'green circle', name: 'CC CAMPHOR', sw: [0.733, 0.165], patches: [...Array.from({length: 8}, (_, k) => [0.082 + k * 0.0485, 0.675, 0.046, 0.085] as [number, number, number, number]), [0.145, 0.105, 0.09, 0.165], [0.016, 0.355, 0.04, 0.075], [0.49, 0.78, 0.045, 0.085]], count: 11},
  {words: 'light green area', name: 'LA LAWN', sw: [0.733, 0.165], patches: [[0.333, 0.265, 0.245, 0.235]], area: 195.0},
  {words: 'light green area', name: 'AZ AZALEA', sw: [0.733, 0.245], patches: [[0.108, 0.265, 0.185, 0.235]], area: 146.0},
  {words: 'grey area', name: 'FIRE TRUCK ACCESS LANE', sw: [0.733, 0.295], patches: [[0.044, 0.11, 0.044, 0.515]], area: 78.8},
];
const Raster: React.FC<{t: number}> = ({t}) => {
  const u = t - V10.beats.raster;
  const a = Math.min(ov(u, 0, 0.5), 1 - ov(u, 8.7, 9.0));
  if (a <= 0) return null;
  const fx = (x: number) => x * RASTER.w;
  const fy = (y: number) => RASTER.top + y * RASTER.h;
  return (
    <AbsoluteFill style={{opacity: a, background: '#5a5a5a'}}>
      <Img src={staticFile('v9/F-26-p1.png')} style={{position: 'absolute', left: 0, top: RASTER.top, width: RASTER.w, height: RASTER.h}} />
      <Tag x={560} y={RASTER.top + 36} text="Presentation Plan (Colour).pdf · a raster page, no CAD" size={24} />
      {LEGEND.map((e, i) => {
        const at = 0.7 + i * 0.75;
        const k = ov(u, at, at + 0.35);
        const fly = ov(u, at + 0.35, at + 0.85);
        if (k <= 0) return null;
        const [px, py, pw, ph] = e.patches[e.patches.length - 1];
        const x0 = fx(e.sw[0]) - 40;
        const y0 = fy(e.sw[1]);
        const x1 = fx(px + pw / 2) + (px < 0.1 ? 60 : 0);
        const y1 = fy(py + ph / 2) + (e.name === 'LA LAWN' ? -34 : e.name === 'AZ AZALEA' ? 34 : 0);
        const anchor = fly > 0.5 ? (px < 0.1 ? 'translate(0, -50%)' : 'translate(-50%, -50%)') : 'translate(-100%, -50%)';
        return (
          <div key={e.name}>
            <div style={{position: 'absolute', left: fx(e.sw[0]) - 36, top: fy(e.sw[1]) - 26, width: 72, height: 52, border: `4px solid ${C.cobalt}`, borderRadius: 10, opacity: k * (1 - fly)}} />
            <div style={{position: 'absolute', left: lerp(x0, x1, fly), top: lerp(y0, y1, fly), transform: anchor, opacity: k, fontFamily: FONT.mono, fontSize: 24, fontWeight: 700, color: '#fff', background: 'rgba(36,87,255,0.92)', padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap'}}>{`Muse Spark: "${e.words}" = ${e.name}`}</div>
          </div>
        );
      })}
      {LEGEND.map((e, i) => {
        const at = 3.6 + i * 0.85;
        const b = ov(u, at, at + 0.7);
        if (b <= 0) return null;
        const val = e.area !== undefined ? `${(e.area * b).toFixed(1)} m²` : `${Math.round((e.count ?? 0) * b)} symbols`;
        const [px, py, pw, ph] = e.patches[0];
        return (
          <div key={`m-${e.name}`}>
            {e.patches.map(([x, y, w, h], j) => (
              <div key={j} style={{position: 'absolute', left: fx(x + w / 2) - (fx(w) * b) / 2, top: fy(y + h / 2) - (h * RASTER.h * b) / 2, width: fx(w) * b, height: h * RASTER.h * b, background: 'rgba(122,60,255,0.45)', border: '3px solid #a684ff', borderRadius: w < 0.06 ? '50%' : 8}} />
            ))}
            <Tag x={fx(px + pw / 2)} y={fy(py) - 30 + (i === 0 ? -20 : 0)} text={`SAM 3.1 · ${e.name} · ${val}`} colour="#e4d8ff" size={24} a={b} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export const AnimaticV10: React.FC<AnimaticV10Props> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(frame % fps).padStart(2, '0')}`;
  const line = [...LINES].reverse().find((l) => t >= l.start && t < l.end);
  const push = ov(t, V10.push.from, V10.push.to);
  const monW = lerp(820, 1920, push);
  const monH = lerp(461, 1080, push);
  const inWorld = t >= V10.push.from - 0.5 && t < PART2_AT;
  const blur = inWorld ? Math.min(16, Math.max(0, (turnRate(t, fps) - 0.9) * 3)) : 0;
  const split = Math.min(ov(t, 59.5, 60.0), 1 - ov(t, 63.0, 63.5));
  const rise = riseAt(t);
  const counted = t >= 74.6 && t < 77.3 ? Math.min(8, Math.floor((t - 74.6) / 0.28) + 1) : 0;
  const hedgeN = t >= 77.4 && t < 80.1 ? Math.round(182 * clamp01((t - 77.4) / 2.2)) : -1;
  const drawerCard = t >= 21 && t < 47.5 ? (t < 26 ? '8' : t < 31 ? 'R' : t < 35.5 ? '5' : t < 40.5 ? '5' : '8') : null;
  const click = ov(t, 65.4, 65.9);
  const pOut = plantersOut(t);
  return (
    <AbsoluteFill style={{background: GREY, overflow: 'hidden'}}>
      {/* the world (14–89.5), blurred on the fast moves */}
      {t >= V10.push.from - 0.5 && t < PART2_AT && data ? (
        <AbsoluteFill style={{opacity: ov(t, V10.push.from - 0.3, V10.push.from + 0.5), filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined}}>
          <WorldV10 sheets={data.sheets} l1="v9/L-1.png" />
        </AbsoluteFill>
      ) : null}

      {/* the opening: Eric, three grey slots; the third ends in the push through his monitor */}
      {V10.opening.map((o, k) => (t >= o.start && t < o.end ? <Live key={k} label={o.label} /> : null))}
      {t >= V10.push.from && t < V10.push.to + 0.3 ? (
        <AbsoluteFill style={{opacity: 1 - ov(t, V10.push.to - 0.15, V10.push.to + 0.3), background: 'rgba(40,40,44,0.9)'}}>
          <div style={{position: 'absolute', left: 960 - monW / 2, top: 560 - monH / 2, width: monW, height: monH, background: '#d9d9d9', border: '3px solid #222', overflow: 'hidden'}}>
            <Img src={staticFile('v9/L-1.png')} style={{width: '100%', height: '100%', objectFit: 'cover', opacity: lerp(0.6, 1, push)}} />
            <div style={{position: 'absolute', left: '45%', top: '70%', width: '36%', height: '12%', border: '5px solid #e5484d', opacity: 1 - push}} />
          </div>
        </AbsoluteFill>
      ) : null}

      {/* the drawer cards point at their plate */}
      {drawerCard ? <Leader from={[110, 230]} to={projectAt(t, plateAt(t, drawerCard))} a={0.8} /> : null}
      {t >= 26.4 && t < 31 ? <RoofPlanter a={Math.min(ov(t, 26.6, 27.0), 1 - ov(t, 30.6, 31.0))} fix={ov(t, 29.2, 30.0)} /> : null}
      {/* the lift shaft: a check once the planter has moved off the core */}
      {t >= 39.4 && t < 40.5 ? (() => {
          const p = projectAt(t, [plateAt(t, '5')[0] + 7.6, plateAt(t, '5')[1] + 1.2, plateAt(t, '5')[2] + 2]);
          return p.visible ? <Check x={p.x} y={p.y} a={ov(t, 39.4, 39.8)} /> : null;
        })() : null}
      {/* the escape corridor: the walking person, the dimension, the fix */}
      {t >= 41.2 && t < 47.8 ? (() => {
          const pw = personWorld(t);
          const p = projectAt(t, pw);
          const pa = personAt(t).a;
          const c = corridorAt(t);
          const m = projectAt(t, [(c.a[0] + c.b[0]) / 2, c.a[1], (c.a[2] + c.b[2]) / 2]);
          const ea = projectAt(t, c.a);
          const eb = projectAt(t, c.b);
          const dimA = Math.min(ov(t, 43.2, 43.6), 1);
          const clear = lerp(0.9, 1.5, pOut);
          return (
            <>
              {p.visible ? (
                <div style={{position: 'absolute', left: p.x - 16, top: p.y - 16, opacity: pa}}>
                  <div style={{width: 32, height: 32, borderRadius: 16, background: '#fff', border: '3px solid #1d2026'}} />
                  <div style={{position: 'absolute', left: 4, top: 30, width: 24, height: 30, borderRadius: 8, background: '#fff', border: '3px solid #1d2026'}} />
                </div>
              ) : null}
              {ea.visible && eb.visible ? (
                <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: dimA}}>
                  <line x1={ea.x} y1={ea.y} x2={eb.x} y2={eb.y} stroke={pOut > 0.9 ? '#3ccf7f' : '#6d8dff'} strokeWidth={4} />
                  <line x1={ea.x - 12} y1={ea.y} x2={ea.x + 12} y2={ea.y} stroke={pOut > 0.9 ? '#3ccf7f' : '#6d8dff'} strokeWidth={4} />
                  <line x1={eb.x - 12} y1={eb.y} x2={eb.x + 12} y2={eb.y} stroke={pOut > 0.9 ? '#3ccf7f' : '#6d8dff'} strokeWidth={4} />
                </svg>
              ) : null}
              {m.visible ? <Tag x={m.x + 150} y={m.y} text={`${clear.toFixed(1)} m clear`} colour={pOut > 0.9 ? '#3ccf7f' : '#9ab4ff'} size={32} a={dimA} /> : null}
              {m.visible && pOut < 0.5 ? <Tag x={m.x + 150} y={m.y + 50} text="min 1.2 m · Art. 92" colour="#ff8a8a" size={26} a={dimA} /> : null}
              {t >= 47.0 && p.visible ? <Check x={p.x + 70} y={p.y - 60} a={ov(t, 47.0, 47.4)} /> : null}
            </>
          );
        })() : null}

      {/* the tree: the split frame, the LINE tags, the Confirm click */}
      {split > 0 ? (
        <>
          <div style={{position: 'absolute', left: 0, top: 0, width: 960, height: 1080, overflow: 'hidden', background: '#fff', opacity: split}}>
            <Img src={staticFile('v9/L-1.png')} style={{position: 'absolute', width: 83.2 * 96, height: 45.2 * 96, left: 480 - T8.x * 96, top: 540 - T8.z * 96}} />
            <div style={{position: 'absolute', left: 480 - 96 * (t08.radius + 0.35), top: 540 - 96 * (t08.radius + 0.35), width: 2 * 96 * (t08.radius + 0.35), height: 2 * 96 * (t08.radius + 0.35), borderRadius: '50%', border: `6px solid ${C.cobalt}`}} />
          </div>
          <div style={{position: 'absolute', left: 958, top: 0, width: 4, height: 1080, background: '#fff', opacity: split}} />
          <div style={{position: 'absolute', left: 80, top: 80, fontFamily: FONT.sans, fontSize: 56, fontWeight: 600, color: '#1d2026', opacity: split}}>What you see<div style={{fontSize: 30, opacity: 0.7, fontWeight: 400}}>the plan: one tree</div></div>
          <div style={{position: 'absolute', left: 1040, top: 80, fontFamily: FONT.sans, fontSize: 56, fontWeight: 600, color: '#fff', textShadow: '0 2px 20px rgba(0,0,0,0.6)', opacity: split}}>What a computer sees<div style={{fontSize: 30, opacity: 0.8, fontWeight: 400}}>twelve LINE entities, no tree</div></div>
        </>
      ) : null}
      {rise > 0.3 && t < 63.6
        ? t08.canopy.map((seg, i) => {
            const [a, b] = pieceEnds(i);
            const p = projectAt(t, [(a[0] + b[0]) / 2, 0.06 + pieceHeight(i) * rise, (a[1] + b[1]) / 2]);
            if (!p.visible || (split > 0.5 && p.x < 980) || p.y < 170) return null;
            return <Tag key={seg.handle} x={p.x + 60} y={p.y - 22} text={`LINE ${seg.handle}`} size={22} a={Math.min(ov(t, 58.6 + i * 0.12, 58.9 + i * 0.12), 1)} />;
          })
        : null}
      {click > 0 && t < 66.0
        ? (() => {
            const p = projectAt(t, [T8.x + 2.6, 0, T8.z + 1.4]);
            return (
              <>
                <div style={{position: 'absolute', left: p.x, top: p.y, padding: '12px 26px', borderRadius: 12, background: click > 0.6 ? C.green : C.cobalt, color: '#fff', fontFamily: FONT.sans, fontSize: 30, fontWeight: 600}}>{click > 0.6 ? 'Confirmed · 8 trees' : 'Confirm — one tree'}</div>
                <div style={{position: 'absolute', left: p.x + 60 - 16, top: p.y + 30 - 16, width: 32, height: 32, borderRadius: 16, border: '4px solid #fff', background: C.cobalt, transform: `scale(${1 + click * 2})`, opacity: 1 - click}} />
              </>
            );
          })()
        : null}

      {/* the coloured plan: Muse Spark reads the legend, SAM 3.1 masks the patches */}
      {t >= V10.beats.raster && t < V10.beats.bills ? <Raster t={t} /> : null}

      {/* the bill beats: the count (then 12 → 8), the hedge counter */}
      {counted > 0
        ? ROW.slice(0, counted).map((r, i) => {
            const p = projectAt(t, [r.x, 0, r.z]);
            return <Tag key={r.id} x={p.x} y={p.y} text={String(i + 1)} colour={i === 7 ? '#ff8a8a' : '#9ab4ff'} size={40} />;
          })
        : null}
      {t >= 76.4 && t < 77.3 ? (() => {
          const p = projectAt(t, [ROW[7].x + 4, 0, ROW[7].z]);
          return <Tag x={p.x + 60} y={p.y} text="bill 12 → 8" colour="#3ccf7f" size={40} a={ov(t, 76.4, 76.7)} />;
        })() : null}
      {hedgeN >= 0 ? (() => {
          const p = projectAt(t, [HEDGE.x, 0, (HEDGE.z0 + HEDGE.z1) / 2]);
          return <Tag x={p.x - 170} y={p.y} text={`${hedgeN} plants`} colour="#3ccf7f" size={40} />;
        })() : null}

      {/* the pit beat: the label on the cut-away, the meter, the check */}
      {t >= 83.8 && t < 92.4 ? (() => {
          const p = projectAt(t, [98, -0.5, 31.2]);
          const sh = pitShrink(t);
          return (
            <>
              {p.visible ? <Tag x={p.x} y={p.y + 44} text="pit 1.5 × 1.5 m on a concrete slab" colour="#fff" size={28} a={ov(t, 83.8, 84.2)} /> : null}
              {sh > 0.5 ? <Tag x={p.x} y={p.y - 240} text="counts as a small tree" colour="#ff8a8a" size={30} a={ov(t, 86.3, 86.7)} /> : null}
              {sevenAt(t, 6) > 0.9 ? <Check x={p.x - 420} y={p.y - 150} a={ov(t, 90.6, 91.0)} /> : null}
            </>
          );
        })() : null}
      {t >= 86 && t < 92.5 ? <Meter t={t} /> : null}

      {/* the findings; the bridge */}
      {t >= V10.findings.at && t < V10.beats.bridge + 0.3 ? <Findings t={t} /> : null}
      <Folder t={t} />

      {/* the cards, each with its fix */}
      {V10.cards.map((c) => {
        const a = Math.min(ov(t, c.at, c.at + 0.3), 1 - ov(t, c.until - 0.3, c.until));
        if (a <= 0) return null;
        const f = c.fix ? Math.min(ov(t, c.fix.at, c.fix.at + 0.35), a) : 0;
        return (
          <div key={c.title}>
            <Card dot={c.dot} title={c.title} sub={c.sub} a={a} />
            {c.fix ? <FixCard text={c.fix.text} a={f} y={c.sub ? 262 : 212} /> : null}
          </div>
        );
      })}

      {/* Part 2: the capture, its holds cut */}
      {(() => {
        let at = PART2_AT;
        return SEGMENTS.map(([f, to], k) => {
          const from = at;
          at += to - f;
          return (
            <Sequence key={k} from={Math.round(from * fps)} durationInFrames={Math.round((to - f) * fps)} name={`capture ${k + 1}`} layout="none">
              <OffthreadVideo src={staticFile('v9/try-v9.mp4')} startFrom={Math.round(f * fps)} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
            </Sequence>
          );
        });
      })()}

      {/* the close */}
      {t >= CLOSE_AT ? <AbsoluteFill style={{background: '#14161a', opacity: ov(t, CLOSE_AT, CLOSE_AT + 0.4)}} /> : null}
      {t >= LOCKUP_AT ? (
        <AbsoluteFill style={{background: '#0b0c0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: ov(t, LOCKUP_AT, LOCKUP_AT + 0.4), color: '#fff'}}>
          <div style={{fontFamily: FONT.sans, fontSize: 132, fontWeight: 700, letterSpacing: -4}}>Landsight</div>
          <div style={{fontFamily: FONT.mono, fontSize: 30, marginTop: 24, opacity: 0.8}}>github.com/eric2612115/landsight</div>
          <div style={{fontFamily: FONT.sans, fontSize: 28, marginTop: 14, opacity: 0.6}}>Built with Muse Spark 1.3 and SAM 3.1</div>
        </AbsoluteFill>
      ) : null}
      {V10.type.map((c, k) => (
        <TypeCard key={c.text} text={c.text} at={c.at} until={c.until} t={t} dim={k > 0} />
      ))}

      {/* subtitles (queued) and the timecode */}
      {line ? (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center'}}>
          <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 44, lineHeight: 1.25, color: '#fff', background: 'rgba(0,0,0,0.72)', padding: '10px 22px', borderRadius: 8, maxWidth: 1640}}>
            {line.who ? <span style={{opacity: 0.6}}>{line.who}: </span> : null}
            {line.text}
          </span>
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 20, top: 16, fontFamily: FONT.mono, fontSize: 22, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4}}>{tc}</div>
    </AbsoluteFill>
  );
};
