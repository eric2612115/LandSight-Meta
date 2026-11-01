import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {FilmData} from '../data';
import {C, FONT} from '../theme';
import {coldOpen} from '../timing.js';
import {Sheet} from '../ui/Sheet';
import {RenderedTag} from '../ui/Tags';

/**
 * Beat 1, "Twelve" (0–8 s). Black: the bill row types itself; Enter greys it. Hard cut: the printed L-1 under a warm
 * overhead light, a highlighter ticks the canopies west to east while tally marks grow in the margin; the pen hovers
 * over empty paper where a ninth would be. Hard cut: 12 ≠ 8.
 */
export const ColdOpen: React.FC<{data: FilmData}> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const {paper} = data;
  const cue = coldOpen(paper.row.display.length, paper.canopies.length);
  if (t < cue.paper) return <TypedRow text={paper.row.display} t={t} cue={cue} />;
  if (t < cue.card) return <Overhead data={data} t={t} cue={cue} />;
  return <Card qty={paper.row.qty} drawn={paper.drawn} t={t - cue.card} />;
};

type Cue = ReturnType<typeof coldOpen>;

const TypedRow: React.FC<{text: string; t: number; cue: Cue}> = ({text, t, cue}) => {
  const typed = cue.keyTimes.filter((k) => k <= t).length;
  const entered = t >= cue.enter;
  const blink = Math.floor(t * 2.2) % 2 === 0;
  const parts = text.split(' · ');
  // the row as a spreadsheet would hold it: three cells, typed left to right
  let left = typed;
  const cells = parts.map((p, i) => {
    const sep = i < parts.length - 1 ? 3 : 0;
    const shown = p.slice(0, Math.max(0, left));
    left -= p.length + sep;
    return shown;
  });
  const widths = [920, 180, 380];
  return (
    <AbsoluteFill style={{background: '#050506', justifyContent: 'center', alignItems: 'center'}}>
      <div style={{fontFamily: FONT.mono, fontSize: 46, color: entered ? '#5d636c' : C.white}}>
        <div style={{display: 'flex', borderTop: '1px solid #24272d', borderBottom: '1px solid #24272d', height: 92, alignItems: 'center'}}>
          {cells.map((c, i) => (
            <div key={i} style={{width: widths[i], padding: '0 22px', borderLeft: i ? '1px solid #24272d' : 'none', textAlign: i ? 'right' : 'left', whiteSpace: 'pre'}}>
              {c}
              {!entered && typed < text.length && cells.findIndex((x, j) => x.length < parts[j].length) === i && blink ? <span style={{color: C.cobaltLt}}>▏</span> : null}
            </div>
          ))}
        </div>
        <div style={{display: 'flex', height: 92, borderBottom: '1px solid #1a1c20', alignItems: 'center'}}>
          {entered && blink ? <span style={{marginLeft: 22, color: C.cobaltLt}}>▏</span> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Overhead: React.FC<{data: FilmData; t: number; cue: Cue}> = ({data, t, cue}) => {
  const {paper} = data;
  const local = t - cue.paper;
  const span = cue.card - cue.paper;
  const push = interpolate(local, [0, span], [1.0, 1.07], {easing: Easing.inOut(Easing.quad)});
  const W = 1760;
  const [, , vw, vh] = paper.sheet.viewBox;
  const H = (W * vh) / vw;
  const first = paper.canopies[0];
  const last = paper.canopies[paper.canopies.length - 1];
  const step = paper.canopies.length > 1 ? (last.x - first.x) / (paper.canopies.length - 1) : 4;
  const empty = {x: last.x + step, y: last.y};
  // where the pen is: on each canopy at its tick, then over the empty paper
  const stops = [...cue.tickTimes.map((tt, i) => ({t: tt, x: paper.canopies[i].x, y: paper.canopies[i].y})), {t: cue.hover, x: empty.x, y: empty.y}];
  let pen = {x: first.x - step, y: first.y + 3};
  if (t >= stops[0].t - 0.2) {
    const i = stops.findIndex((s) => s.t > t);
    if (i < 0) pen = stops[stops.length - 1];
    else if (i === 0) pen = {x: stops[0].x - step * 0.6, y: stops[0].y + 1.2};
    else {
      const a = stops[i - 1];
      const b = stops[i];
      const p = Easing.inOut(Easing.cubic)(interpolate(t, [a.t + 0.05, b.t], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
      pen = {x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 0.9};
    }
  }
  const hovering = t >= cue.hover;
  const bob = hovering ? Math.sin((t - cue.hover) * 9) * 0.18 : 0;
  const ticked = cue.tickTimes.filter((tt) => tt <= t).length;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 40% 35%, #4a3a2a 0%, #2a2018 55%, #120d09 100%)', overflow: 'hidden'}}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{transform: `rotate(-1.4deg) scale(${push})`, transformOrigin: '30% 70%', boxShadow: '0 40px 90px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.35)', filter: 'sepia(0.16) saturate(1.05) brightness(0.97)'}}>
          <Sheet svg={paper.sheet.svg} viewBox={paper.sheet.viewBox} width={W}>
            {/* highlighter strokes, one per counted canopy */}
            {paper.canopies.map((c, i) => {
              const at = cue.tickTimes[i];
              if (t < at) return null;
              const p = interpolate(t, [at, at + 0.11], [0, 1], {extrapolateRight: 'clamp'});
              const len = c.r * 2.1;
              return (
                <line key={c.id} x1={c.x - len * 0.42} y1={c.y + len * 0.3} x2={c.x - len * 0.42 + len * 0.84 * p} y2={c.y + len * 0.3 - len * 0.6 * p}
                  stroke="#ffe23a" strokeOpacity={0.62} strokeWidth={c.r * 0.62} strokeLinecap="round" style={{mixBlendMode: 'multiply'}} />
              );
            })}
            {/* tally marks in the margin, in pen */}
            <Tally n={ticked} x={5.6} y={36.0} t={t} times={cue.tickTimes} />
            {/* the pen */}
            <Pen x={pen.x} y={pen.y + bob} lifted={hovering} />
          </Sheet>
        </div>
      </AbsoluteFill>
      {/* warm overhead light and a vignette */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 34% 28%, rgba(255,214,150,0.20) 0%, rgba(255,200,120,0.06) 40%, rgba(0,0,0,0) 62%)', mixBlendMode: 'soft-light'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)'}} />
      <RenderedTag dark />
    </AbsoluteFill>
  );
};

const Tally: React.FC<{n: number; x: number; y: number; t: number; times: number[]}> = ({n, x, y, t, times}) => {
  const marks = [];
  for (let i = 0; i < n; i++) {
    const group = Math.floor(i / 5);
    const k = i % 5;
    const p = interpolate(t, [times[i], times[i] + 0.09], [0, 1], {extrapolateRight: 'clamp'});
    const gx = x + group * 3.4;
    if (k < 4) {
      const mx = gx + k * 0.55 + Math.sin(i * 3.1) * 0.05;
      marks.push(<line key={i} x1={mx} y1={y} x2={mx + 0.08} y2={y + 2.0 * p} stroke="#23262b" strokeWidth={0.13} strokeLinecap="round" />);
    } else {
      marks.push(<line key={i} x1={gx - 0.35} y1={y + 1.6} x2={gx - 0.35 + 2.4 * p} y2={y + 1.6 - 1.3 * p} stroke="#23262b" strokeWidth={0.13} strokeLinecap="round" />);
    }
  }
  return <g>{marks}</g>;
};

/** A chisel highlighter seen from above, tip at (x, y). */
const Pen: React.FC<{x: number; y: number; lifted: boolean}> = ({x, y, lifted}) => (
  <g transform={`translate(${x} ${y}) rotate(-38) translate(0 ${lifted ? -0.5 : 0})`}>
    <ellipse cx={4.6} cy={1.4} rx={6.2} ry={1.0} fill="rgba(0,0,0,0.22)" />
    <polygon points="0,0 1.1,-0.55 1.1,0.55" fill="#f2c200" />
    <rect x={1.1} y={-0.75} width={2.0} height={1.5} rx={0.2} fill="#2b2b2b" />
    <rect x={3.1} y={-0.85} width={6.6} height={1.7} rx={0.45} fill="#ffd400" />
    <rect x={3.1} y={-0.85} width={6.6} height={0.5} rx={0.25} fill="rgba(255,255,255,0.35)" />
  </g>
);

const Card: React.FC<{qty: number; drawn: number; t: number}> = ({qty, drawn, t}) => {
  const line = interpolate(t, [0.5, 0.9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#050506', justifyContent: 'center', alignItems: 'center'}}>
      <div style={{fontFamily: FONT.mono, fontSize: 160, fontWeight: 600, color: C.white, letterSpacing: -2}}>
        {qty} <span style={{color: C.amber}}>≠</span> {drawn}
      </div>
      <div style={{fontFamily: FONT.sans, fontSize: 30, fontWeight: 300, fontStyle: 'italic', color: '#7d838c', marginTop: 34, opacity: line}}>
        synthetic drawing · answer key in the repo
      </div>
    </AbsoluteFill>
  );
};
