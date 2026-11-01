import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Caption as Cap} from '../data';
import {C, FONT, sourceColour} from '../theme';

export type CaptionPos = {left?: number; right?: number; top?: number; bottom?: number; maxWidth?: number; compact?: boolean};

/** One caption chip: the source in its colour, a line in Inter, the numbers in JetBrains Mono. ≥ 28 px. */
export const Caption: React.FC<{cap: Cap; pos: CaptionPos}> = ({cap, pos}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  if (t < cap.at || t > cap.until) return null;
  const a = Math.min(interpolate(t, [cap.at, cap.at + 0.28], [0, 1], {extrapolateRight: 'clamp'}), interpolate(t, [cap.until - 0.25, cap.until], [1, 0], {extrapolateLeft: 'clamp'}));
  const y = interpolate(a, [0, 1], [14, 0]);
  const {compact, ...box} = pos;
  if (compact) {
    // one line, for scenes that leave only a strip: the source in its colour, then the words
    return (
      <div style={{position: 'absolute', ...box, maxWidth: undefined, opacity: a, transform: `translateY(${y}px)`, background: 'rgba(16,18,22,0.92)', border: `1px solid ${C.line}`, borderRadius: 14, padding: '8px 20px', whiteSpace: 'nowrap', boxShadow: '0 12px 36px rgba(0,0,0,0.45)'}}>
        <span style={{fontFamily: FONT.sans, fontSize: 28, fontWeight: 600, color: sourceColour(cap.kicker)}}>{cap.kicker}</span>
        <span style={{fontFamily: FONT.sans, fontSize: 28, fontWeight: 500, color: C.white, marginLeft: 14}}>{cap.text}</span>
        {cap.mono ? <span style={{fontFamily: FONT.mono, fontSize: 28, color: C.soft, marginLeft: 14}}>{cap.mono.replace(/\n/g, ' · ')}</span> : null}
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        ...box,
        maxWidth: box.maxWidth ?? 560,
        opacity: a,
        transform: `translateY(${y}px)`,
        background: 'rgba(16,18,22,0.92)',
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: '16px 22px 18px',
        boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{fontFamily: FONT.sans, fontSize: 28, fontWeight: 600, color: sourceColour(cap.kicker), letterSpacing: -0.2}}>{cap.kicker}</div>
      <div style={{fontFamily: FONT.sans, fontSize: 32, fontWeight: 500, color: C.white, lineHeight: 1.22, marginTop: 4}}>{cap.text}</div>
      {cap.mono ? <div style={{fontFamily: FONT.mono, fontSize: 28, color: C.soft, lineHeight: 1.3, marginTop: 8, whiteSpace: 'pre-line'}}>{cap.mono}</div> : null}
    </div>
  );
};
