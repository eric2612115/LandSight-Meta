import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {FilmData} from '../data';
import {C, FONT} from '../theme';
import {CLOSE} from '../timing.js';

/** Beat 11 (172–180 s): the close card, then the end card. */
export const Close: React.FC<{data: FilmData; narrator: string; repoUrl: string}> = ({data, narrator, repoUrl}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = CLOSE.start + frame / fps;
  if (t < CLOSE.endCard) {
    const a = interpolate(t, [CLOSE.start + 0.15, CLOSE.start + 0.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const b = interpolate(t, [CLOSE.start + 2.4, CLOSE.start + 2.9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return (
      <AbsoluteFill style={{background: '#050506', justifyContent: 'center', alignItems: 'center', padding: '0 200px'}}>
        <div style={{fontFamily: FONT.sans, fontSize: 64, fontWeight: 500, color: C.white, textAlign: 'center', opacity: a, lineHeight: 1.2}}>I don't trust a number I can't trace.</div>
        <div style={{fontFamily: FONT.sans, fontSize: 46, fontWeight: 300, color: C.soft, textAlign: 'center', marginTop: 34, opacity: b, lineHeight: 1.25}}>Every number here traces back to the drawing.</div>
      </AbsoluteFill>
    );
  }
  const voice = data.narration[narrator]?.voice ?? narrator;
  const row = (label: string, value: string, mono = false) => (
    <div style={{display: 'flex', gap: 28, alignItems: 'baseline'}}>
      <div style={{width: 300, textAlign: 'right', fontFamily: FONT.sans, fontSize: 28, color: C.mute}}>{label}</div>
      <div style={{fontFamily: mono ? FONT.mono : FONT.sans, fontSize: 32, color: C.white}}>{value}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{background: C.chrome, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{width: 1120, height: 240}} dangerouslySetInnerHTML={{__html: data.end.lockup.replace(/width="\d+" height="\d+"/, 'width="1120" height="240"')}} />
      <div style={{marginTop: 56, display: 'flex', flexDirection: 'column', gap: 18}}>
        {row('models', data.end.models.join(' · '))}
        {row('built', 'Nov 1–4, 2026')}
        {row('code', repoUrl, true)}
        {row('drawings', 'synthetic, answer key in repo')}
        {row('narration', `ElevenLabs · ${voice} (scratch read)`)}
      </div>
    </AbsoluteFill>
  );
};
