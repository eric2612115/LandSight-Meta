import {AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {CLOSE_AT, LOCKUP_AT, PART2_AT, SEGMENTS, V9, timed} from './animatic-v9-cues.js';
import {HEDGE, ROW, T8, WorldV9, corridorAt, pieceEnds, pieceHeight, plateAt, projectAt, riseAt} from './WorldV9';
import type {WorldSheet} from './WorldV9';
import t08 from './t08.json';

/**
 * Film v9 animatic (demo/SCRIPT-V9.md): Part 1 is the grey-box world (WorldV9) with every card in screen space —
 * large, one line, a coloured dot (red send back · amber fix before pricing · blue building code); the tree's split
 * frame ("What you see" / "What a computer sees"); the tree-pit section diagram; the findings laid out on the frame
 * in two groups; the pipeline bridge and "Two weeks → two minutes."; Part 2 is the /try capture with its two long
 * holds cut; the scoreboard; the lockup. No sound: subtitles at 155 wpm and a small timecode.
 */
export type AnimaticV9Data = {sheets: WorldSheet[]};
export type AnimaticV9Props = {data?: AnimaticV9Data};

const GREY = '#8a8a8a';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const LINES = timed();
const DOT: Record<string, string> = {red: C.red, amber: C.amber, blue: C.cobaltLt, white: '#fff', green: C.greenLt};
const PANEL = 'rgba(20,22,26,0.86)';

/** A screen-space card: ≥ 44 px title, one line, a coloured dot, a 30 px sub-line with the evidence. */
const Card: React.FC<{dot: string; title: string; sub?: string; a: number; x?: number; y?: number; w?: number; size?: number; inline?: boolean}> = ({dot, title, sub, a, x = 80, y = 100, w, size = 52, inline = false}) => (
  <div style={{position: inline ? 'relative' : 'absolute', left: inline ? undefined : x, top: inline ? undefined : y, width: w, boxSizing: 'border-box', opacity: a, transform: `translateY(${(1 - a) * 12}px)`, borderRadius: 24, background: PANEL, border: '1.5px solid rgba(255,255,255,0.28)', padding: '22px 30px', color: '#fff', fontFamily: FONT.sans, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', whiteSpace: 'nowrap'}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
      <div style={{width: 18, height: 18, borderRadius: 9, background: DOT[dot], boxShadow: `0 0 16px ${DOT[dot]}`, flex: 'none'}} />
      <div style={{fontSize: size, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.15}}>{title}</div>
    </div>
    {sub ? <div style={{marginTop: 8, marginLeft: 36, fontSize: 30, opacity: 0.75, lineHeight: 1.3}}>{sub}</div> : null}
  </div>
);
const Tag: React.FC<{x: number; y: number; text: string; colour?: string; size?: number; a?: number}> = ({x, y, text, colour = '#fff', size = 28, a = 1}) => (
  <div style={{position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', fontFamily: FONT.mono, fontSize: size, fontWeight: 700, color: colour, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6, opacity: a, whiteSpace: 'nowrap'}}>{text}</div>
);
const Leader: React.FC<{from: [number, number]; to: {x: number; y: number; visible: boolean}; a: number}> = ({from, to, a}) =>
  to.visible ? (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: a}}>
      <line x1={from[0]} y1={from[1]} x2={to.x} y2={to.y} stroke="#fff" strokeWidth={2} strokeDasharray="8 8" />
      <circle cx={to.x} cy={to.y} r={9} fill="none" stroke="#fff" strokeWidth={3} />
    </svg>
  ) : null;
const TypeCard: React.FC<{text: string; at: number; until: number; t: number}> = ({text, at, until, t}) => {
  if (t < at || t > until) return null;
  const a = Math.min(clamp01((t - at) / 0.2), clamp01((until - t) / 0.25));
  return (
    <AbsoluteFill style={{display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: a}}>
      <div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)'}} />
      <div style={{position: 'relative', fontFamily: FONT.sans, fontSize: 112, fontWeight: 600, letterSpacing: -3, color: '#fff', textAlign: 'center', maxWidth: 1700, lineHeight: 1.05}}>{text}</div>
    </AbsoluteFill>
  );
};

/** The roof planter, cut away: 0.3 m of soil against the 0.4 m line (T02). */
const RoofPlanter: React.FC<{a: number}> = ({a}) => (
  <svg width={680} height={392} viewBox="0 0 520 300" style={{position: 'absolute', right: 90, top: 340, opacity: a, background: PANEL, borderRadius: 24, border: '1.5px solid rgba(255,255,255,0.28)'}}>
    <text x={30} y={44} fill="#fff" fontFamily="Inter" fontSize={26} fontWeight={600}>roof planter, cut away · L-104</text>
    <rect x={60} y={120} width={360} height={130} fill="none" stroke="#ddd" strokeWidth={4} />
    <rect x={64} y={190} width={352} height={56} fill="#6b5a46" />
    <text x={430} y={224} fill="#f0a500" fontFamily="JetBrains Mono" fontSize={22}>0.3 m</text>
    <line x1={40} y1={170} x2={440} y2={170} stroke="#6d8dff" strokeWidth={3} strokeDasharray="10 8" />
    <text x={448} y={176} fill="#6d8dff" fontFamily="JetBrains Mono" fontSize={22}>0.4 m</text>
    <text x={30} y={282} fill="#fff" fontFamily="Inter" fontSize={22} opacity={0.75}>minimum on a roof · T02 · not counted</text>
  </svg>
);

/** The tree-pit section (1:04–1:15): soil over the slab, a 1.5 × 1.5 m pit, the big tree shrinking; the gauge. */
const Section: React.FC<{t: number}> = ({t}) => {
  const a = Math.min(ov(t, 67.3, 67.9), 1 - ov(t, 78.0, 78.6));
  const shrink = ov(t, 70.0, 71.6);
  const r = lerp(120, 72, shrink);
  const fall = ov(t, 72.2, 74.2);
  const v = lerp(261.1, 209.9, fall);
  const gx = 1080;
  const gw = 720;
  const px = (n: number) => gx + (n / 360) * gw;
  const fixA = ov(t, 75.0, 75.5);
  const fixB = ov(t, 76.4, 76.9);
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: 'rgba(20,22,26,0.82)'}} />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {/* the section, left: ground, soil, slab, the pit */}
        <text x={120} y={300} fill="#fff" fontFamily="Inter" fontSize={30} fontWeight={600}>section · the planting plan over the basement</text>
        <rect x={120} y={560} width={860} height={110} fill="#6b5a46" />
        <rect x={120} y={670} width={860} height={60} fill="#9a9a9a" />
        <text x={130} y={708} fill="#1d2026" fontFamily="JetBrains Mono" fontSize={24} fontWeight={700}>the concrete slab</text>
        <text x={130} y={600} fill="#fff" fontFamily="JetBrains Mono" fontSize={24}>soil 1.0 m</text>
        <rect x={470} y={560} width={120} height={110} fill="#c8b48a" stroke="#fff" strokeWidth={3} />
        <text x={530} y={760} textAnchor="middle" fill="#fff" fontFamily="JetBrains Mono" fontSize={26}>tree pit 1.5 × 1.5 m · 2.25 m² · on the slab</text>
        <line x1={120} y1={560} x2={980} y2={560} stroke="#fff" strokeWidth={3} />
        {/* the tree */}
        <rect x={522} y={400 + (120 - r) * 0.6} width={16} height={160 - (120 - r) * 0.6} fill="#4a3b2a" />
        <circle cx={530} cy={400 - r * 0.55} r={r} fill="none" stroke={shrink > 0.5 ? '#e5484d' : '#3ccf7f'} strokeWidth={6} />
        <text x={530} y={400 - r * 0.55 + 10} textAnchor="middle" fill={shrink > 0.5 ? '#e5484d' : '#3ccf7f'} fontFamily="Inter" fontSize={28} fontWeight={600}>{shrink > 0.5 ? 'counts as small' : 'a large tree'}</text>
        <text x={530} y={248} textAnchor="middle" fill="#fff" fontFamily="JetBrains Mono" fontSize={24} opacity={shrink}>{`Gi 1.5 → 1.0 · a large tree needs a 4.0 m² pit (E12)`}</text>
        {/* the gauge, right */}
        <text x={gx} y={300} fill="#fff" fontFamily="Inter" fontSize={30} fontWeight={600}>greenery (Art. 302) · kgCO₂e/yr · E14</text>
        <rect x={gx} y={520} width={gw} height={56} fill="rgba(255,255,255,0.08)" stroke="#fff" strokeWidth={2} />
        <rect x={gx} y={520} width={(v / 360) * gw} height={56} fill={v >= 297 ? '#3ccf7f' : '#e5484d'} />
        <line x1={px(297)} y1={500} x2={px(297)} y2={596} stroke="#fff" strokeWidth={4} />
        <text x={px(297) + 12} y={490} fill="#fff" fontFamily="JetBrains Mono" fontSize={26}>required 297.0</text>
        <text x={px(v)} y={632} textAnchor="end" fill={v >= 297 ? '#3ccf7f' : '#ff8a8a'} fontFamily="JetBrains Mono" fontSize={30} fontWeight={700}>{`provided ${v.toFixed(1)} · ${v >= 297 ? 'pass' : 'fail'}`}</text>
        <text x={gx} y={680} fill="#fff" fontFamily="Inter" fontSize={24} opacity={0.75}>{fall < 0.5 ? '261.1 before the tree-pit rule (8 trees, T-08 confirmed)' : '209.9 after the pit rule · adding trees in the same pits will not pass'}</text>
      </svg>
      <Card dot="green" title="+7 trees → 299.5 · pass" a={fixA} x={gx} y={740} size={40} />
      <Card dot="green" title="or change one tree's species → 341.1 · pass" a={fixB} x={gx} y={860} size={40} />
    </AbsoluteFill>
  );
};

/** The findings on the frame, the developer's way: two groups, then the total. */
const Findings: React.FC<{t: number}> = ({t}) => {
  const F = V9.findings;
  const a = Math.min(ov(t, F.at, F.at + 0.4), 1 - ov(t, 85.0, 85.5));
  if (a <= 0) return null;
  const group = (title: string, dot: string, items: string[], x: number, delay: number) => (
    <div style={{position: 'absolute', left: x, top: 130, width: 590}}>
      <div style={{fontFamily: FONT.sans, fontSize: 40, fontWeight: 600, color: DOT[dot], marginBottom: 14, opacity: ov(t, F.at + delay, F.at + delay + 0.3)}}>{title}</div>
      {items.map((it, i) => (
        <div key={it} style={{marginBottom: 12}}>
          <Card dot={dot} title={it} a={ov(t, F.at + delay + 0.35 + i * 0.3, F.at + delay + 0.65 + i * 0.3)} w={590} size={27} inline />
        </div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: 'rgba(20,22,26,0.6)'}} />
      {group('Send back', 'red', F.sendBack, 60, 0)}
      {group('Fix before pricing', 'amber', F.fix, 665, 1.6)}
      {group('Building code', 'blue', F.code, 1270, 2.9)}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 110, textAlign: 'center', opacity: ov(t, F.at + 4.4, F.at + 4.8)}}>
        <span style={{fontFamily: FONT.sans, fontSize: 64, fontWeight: 700, color: '#fff', background: PANEL, padding: '14px 40px', borderRadius: 24, border: '1.5px solid rgba(255,255,255,0.28)'}}>{F.total}</span>
      </div>
    </AbsoluteFill>
  );
};

/** The bridge: the pipeline, left to right. */
const Pipeline: React.FC<{t: number}> = ({t}) => {
  const P = V9.pipeline;
  const a = Math.min(ov(t, P.at, P.at + 0.3), 1 - ov(t, 90.0, 90.4));
  if (a <= 0) return null;
  const n = P.nodes.length;
  const w = 268;
  const gap = 36;
  const x0 = (1920 - (n * w + (n - 1) * gap)) / 2;
  return (
    <AbsoluteFill style={{opacity: a}}>
      <AbsoluteFill style={{background: 'rgba(20,22,26,0.8)'}} />
      {P.nodes.map((label, i) => {
        const k = ov(t, P.at + i * P.step, P.at + i * P.step + 0.35);
        const x = x0 + i * (w + gap);
        return (
          <div key={label}>
            <div style={{position: 'absolute', left: x, top: 450, width: w, height: 180, borderRadius: 24, background: PANEL, border: `2px solid ${i === 1 ? C.cobaltLt : i === 2 ? C.violetLt : 'rgba(255,255,255,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 18, boxSizing: 'border-box', fontFamily: FONT.sans, fontSize: 30, fontWeight: 600, color: '#fff', opacity: k, transform: `translateY(${(1 - k) * 14}px)`}}>{label}</div>
            {i < n - 1 ? <div style={{position: 'absolute', left: x + w + 4, top: 530, width: gap - 8, height: 4, background: '#fff', opacity: ov(t, P.at + (i + 0.6) * P.step, P.at + (i + 1) * P.step)}} /> : null}
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, top: 330, textAlign: 'center', fontFamily: FONT.sans, fontSize: 40, fontWeight: 600, color: '#fff', opacity: ov(t, P.at, P.at + 0.4)}}>how Landsight reviews a package</div>
    </AbsoluteFill>
  );
};

export const AnimaticV9: React.FC<AnimaticV9Props> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(frame % fps).padStart(2, '0')}`;
  const line = LINES.find((l) => t >= l.at && t < l.end);
  const push = ov(t, V9.push.pain.from, V9.push.pain.to);
  const monW = lerp(820, 1920, push);
  const monH = lerp(461, 1080, push);
  const pp = ov(t, V9.push.product.from, V9.push.product.to);
  const split = Math.min(ov(t, 48.5, 49.0), 1 - ov(t, 52.8, 53.3));
  const rise = riseAt(t);
  const counted = t >= 56.4 && t < 60.2 ? Math.min(8, Math.floor((t - 56.4) / 0.3) + 1) : 0;
  const hedgeN = t >= 60.4 && t < 63.8 ? Math.round(182 * clamp01((t - 60.4) / 2.6)) : -1;
  const drawerCard = t >= 15 && t < 38 ? (t < 21 ? '8' : t < 26 ? 'R' : t < 31 ? '5' : t < 34.5 ? '5' : '8') : null;
  const click = ov(t, 55.6, 56.1);
  return (
    <AbsoluteFill style={{background: GREY, overflow: 'hidden'}}>
      {/* Part 1: the world (5–90) */}
      {t >= 5.0 && t < PART2_AT && data ? (
        <AbsoluteFill style={{opacity: ov(t, 5.0, 6.0)}}>
          <WorldV9 sheets={data.sheets} l1="v9/L-1.png" />
        </AbsoluteFill>
      ) : null}

      {/* the opening: one short grey frame, then the push through the monitor into the first sheet */}
      {t < 7.2 ? (
        <AbsoluteFill style={{opacity: 1 - ov(t, 6.6, 7.2), background: 'rgba(40,40,44,0.9)'}}>
          <div style={{position: 'absolute', inset: 48, border: '3px dashed rgba(255,255,255,0.6)'}} />
          <div style={{position: 'absolute', left: 90, top: 70, fontFamily: FONT.mono, fontSize: 36, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '8px 16px', opacity: 1 - push}}>{V9.live.pain.label}</div>
          <div style={{position: 'absolute', left: 960 - monW / 2, top: 560 - monH / 2, width: monW, height: monH, background: '#d9d9d9', border: '3px solid #222', overflow: 'hidden'}}>
            <Img src={staticFile('v9/L-1.png')} style={{width: '100%', height: '100%', objectFit: 'cover', opacity: lerp(0.6, 1, push)}} />
            <div style={{position: 'absolute', left: '45%', top: '70%', width: '36%', height: '12%', border: '5px solid #e5484d', opacity: 1 - push}} />
          </div>
        </AbsoluteFill>
      ) : null}

      {/* the drawer cards point at their plate */}
      {drawerCard ? <Leader from={[110, 230]} to={projectAt(t, plateAt(t, drawerCard))} a={0.8} /> : null}
      {t >= 21.4 && t < 26 ? <RoofPlanter a={Math.min(ov(t, 21.6, 22.0), 1 - ov(t, 25.6, 26.0))} /> : null}

      {/* the tree: the split frame, the LINE tags, the ring, the Confirm click */}
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
      {rise > 0.3 && t < 53.5
        ? t08.canopy.map((seg, i) => {
            const [a, b] = pieceEnds(i);
            const p = projectAt(t, [(a[0] + b[0]) / 2, 0.06 + pieceHeight(i) * rise, (a[1] + b[1]) / 2]);
            if (!p.visible || (split > 0.5 && p.x < 980)) return null;
            return <Tag key={seg.handle} x={p.x + 60} y={p.y - 22} text={`LINE ${seg.handle}`} size={22} a={Math.min(ov(t, 48.0 + i * 0.12, 48.3 + i * 0.12), 1)} />;
          })
        : null}
      {click > 0 && t < 56.6 ? (
        (() => {
          const p = projectAt(t, [T8.x + 2.6, 0, T8.z + 1.4]);
          return (
            <>
              <div style={{position: 'absolute', left: p.x, top: p.y, padding: '12px 26px', borderRadius: 12, background: click > 0.6 ? C.green : C.cobalt, color: '#fff', fontFamily: FONT.sans, fontSize: 30, fontWeight: 600}}>{click > 0.6 ? 'Confirmed · 8 trees' : 'Confirm — one tree'}</div>
              <div style={{position: 'absolute', left: p.x + 60 - 16, top: p.y + 30 - 16, width: 32, height: 32, borderRadius: 16, border: '4px solid #fff', background: C.cobalt, transform: `scale(${1 + click * 2})`, opacity: 1 - click}} />
            </>
          );
        })()
      ) : null}

      {/* the escape corridor's dimension: 0.9 m clear against the 1.2 m minimum (T10) */}
      {t >= 35.6 && t < 38.2 ? (() => {
          const c = corridorAt(t);
          const p = projectAt(t, [(c.a[0] + c.b[0]) / 2, c.a[1], (c.a[2] + c.b[2]) / 2]);
          const w = projectAt(t, c.wall);
          const a = ov(t, 35.8, 36.3);
          return p.visible ? (
            <>
              <Tag x={p.x - 150} y={p.y - 10} text="0.9 m clear" colour="#9ab4ff" size={32} a={a} />
              <Tag x={w.x + 170} y={w.y + 30} text="min 1.2 m · Art. 92" colour="#ff8a8a" size={28} a={a} />
            </>
          ) : null;
        })() : null}
      {/* the three beats on the plan: the count, the hedge counter */}
      {counted > 0
        ? ROW.slice(0, counted).map((r, i) => {
            const p = projectAt(t, [r.x, 0, r.z]);
            return <Tag key={r.id} x={p.x} y={p.y} text={String(i + 1)} colour={i === 7 ? '#ff8a8a' : '#9ab4ff'} size={40} />;
          })
        : null}
      {hedgeN >= 0 ? (() => {
          const p = projectAt(t, [HEDGE.x, 0, (HEDGE.z0 + HEDGE.z1) / 2]);
          return <Tag x={p.x - 170} y={p.y} text={`${hedgeN} plants`} colour="#3ccf7f" size={40} />;
        })() : null}

      {/* the section, the findings, the bridge */}
      {t >= 67.3 && t < 78.6 ? <Section t={t} /> : null}
      {t >= V9.findings.at && t < 85.5 ? <Findings t={t} /> : null}
      {t >= V9.pipeline.at && t < 90.4 ? <Pipeline t={t} /> : null}

      {/* the cards */}
      {V9.cards.map((c) => {
        const a = Math.min(ov(t, c.at, c.at + 0.3), 1 - ov(t, c.until - 0.3, c.until));
        if (a <= 0) return null;
        return <Card key={c.title} dot={c.dot} title={c.title} sub={c.sub} a={a} />;
      })}

      {/* the push into the product (88.6–90) */}
      {pp > 0 && t < PART2_AT ? (
        <div style={{position: 'absolute', left: 960 - lerp(760, 1920, pp) / 2, top: 540 - lerp(428, 1080, pp) / 2, width: lerp(760, 1920, pp), height: lerp(428, 1080, pp), background: '#111', border: '3px solid #222', overflow: 'hidden', borderRadius: lerp(16, 0, pp)}}>
          <Img src={staticFile('v9/try-first.png')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </div>
      ) : null}

      {/* Part 2: the capture, the two long holds cut */}
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
      {V9.type.map((c) => (
        <TypeCard key={c.text} text={c.text} at={c.at} until={c.until} t={t} />
      ))}

      {/* subtitles and the timecode */}
      {line ? (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center'}}>
          <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 44, lineHeight: 1.25, color: '#fff', background: 'rgba(0,0,0,0.72)', padding: '10px 22px', borderRadius: 8, maxWidth: 1640}}>{line.text}</span>
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 20, top: 16, fontFamily: FONT.mono, fontSize: 22, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4}}>{tc}</div>
    </AbsoluteFill>
  );
};
