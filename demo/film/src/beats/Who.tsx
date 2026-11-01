import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {FilmData} from '../data';
import {C, FONT} from '../theme';
import {who} from '../timing.js';
import {Sheet} from '../ui/Sheet';
import {CornerTag, RenderedTag} from '../ui/Tags';

/**
 * Beat 2, "Who" (8–15 s), absolute film time inside a Sequence starting at 8 s. The greyed plan zooms to the open
 * canopy; its pieces light one by one with a counter (the run's piece count); LANDSIGHT over it for four seconds;
 * then the line, and the corner tag that stays on every app beat.
 */
export const Who: React.FC<{data: FilmData}> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cue = who(data.paper.open.pieces);
  const t = cue.start + frame / fps;
  const {paper} = data;
  const o = paper.open;
  const W = 1760;
  const [, , vw, vh] = paper.sheet.viewBox;
  const H = (W * vh) / vw;
  const zoom = interpolate(t, [cue.start, cue.zoomEnd], [1.07, 3.0], {easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp'}) * interpolate(t, [cue.zoomEnd, cue.end], [1, 1.06]);
  // keep the open canopy at the centre-right of the frame as we zoom
  const px = (o.x / vw) * W;
  const py = (o.y / vh) * H;
  // where the open canopy sits on screen: right of centre, below the title
  const CX = 1180
  const CY = 690
  const lit = cue.pieceTimes.filter((x) => x <= t).length;
  const title = Math.min(interpolate(t, [cue.titleIn, cue.titleIn + 0.4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), interpolate(t, [cue.titleOut - 0.3, cue.titleOut], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const line = interpolate(t, [cue.lineIn, cue.lineIn + 0.35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // the pieces: arcs between the gaps the run measured
  const angles = o.gapAngles.length ? o.gapAngles : Array.from({length: o.pieces}, (_, i) => (i / o.pieces) * Math.PI * 2);
  const arcs = angles.map((a, i) => {
    const b = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
    const pad = 0.07;
    const a0 = a + pad;
    const a1 = b - pad;
    const r = o.r;
    // sheet y is flipped in the SVG: the angle was measured in sheet space with y up
    const p0 = [o.x + r * Math.cos(a0), o.y - r * Math.sin(a0)];
    const p1 = [o.x + r * Math.cos(a1), o.y - r * Math.sin(a1)];
    return `M ${p0[0]} ${p0[1]} A ${r} ${r} 0 0 0 ${p1[0]} ${p1[1]}`;
  });
  return (
    <AbsoluteFill style={{background: C.chrome, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: CX - px * zoom, top: CY - py * zoom, width: W, height: H, transform: `scale(${zoom})`, transformOrigin: '0 0'}}>
        <Sheet svg={paper.sheet.svg} viewBox={paper.sheet.viewBox} width={W} drawingStyle={{filter: 'grayscale(1) contrast(0.8) brightness(0.42)'}}>
          {arcs.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={i < lit ? C.red : 'rgba(0,0,0,0)'} strokeWidth={0.2} strokeLinecap="round" />
          ))}
        </Sheet>
      </div>
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(20,22,26,0.9) 0%, rgba(20,22,26,0.5) 30%, rgba(20,22,26,0.08) 58%, rgba(20,22,26,0.45) 100%)'}} />
      {lit > 0 ? (
        <div style={{position: 'absolute', left: CX + o.r * zoom * (W / vw) + 40, top: CY - 44, fontFamily: FONT.mono, fontSize: 64, fontWeight: 600, color: C.white}}>
          {lit}
          <span style={{fontSize: 30, fontWeight: 400, color: C.mute, marginLeft: 16}}>{lit === 1 ? 'piece' : 'pieces'}</span>
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 0, right: 0, top: 170, display: 'flex', justifyContent: 'center', opacity: title}}>
        <div style={{width: 840, height: 180}} dangerouslySetInnerHTML={{__html: data.end.lockup.replace(/width="\d+" height="\d+"/, 'width="840" height="180"')}} />
      </div>
      <div style={{position: 'absolute', left: 120, right: 120, top: 190, textAlign: 'center', opacity: line, fontFamily: FONT.sans, fontSize: 52, fontWeight: 500, color: C.white, lineHeight: 1.25}}>
        A design firm checks a developer's package by hand.
        <div style={{color: C.soft, fontWeight: 300, marginTop: 10}}>Weeks per project.</div>
      </div>
      <RenderedTag dark />
      {t >= cue.lineIn ? <div style={{opacity: line}}><CornerTag /></div> : null}
    </AbsoluteFill>
  );
};
