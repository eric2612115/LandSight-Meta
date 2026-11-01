import {AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {AppBeat as App, Beat, FilmData} from '../data';
import {C, FONT} from '../theme';
import {Caption, type CaptionPos} from '../ui/Caption';
import {CornerTag} from '../ui/Tags';

/** Where a scene leaves room for a caption (1920 × 1080; the tally is bottom-left, panels come in on the right). */
const POS: Record<string, CaptionPos> = {
  drop: {left: 44, top: 520, maxWidth: 344},
  wake: {left: 712, bottom: 56, maxWidth: 760},
  eye: {left: 712, bottom: 56, maxWidth: 540},
  hedge: {left: 712, bottom: 56, maxWidth: 540},
  colour: {left: 40, top: 230, maxWidth: 520},
  gauge: {left: 100, top: 690, maxWidth: 600},
  bill: {left: 40, top: 100, maxWidth: 560},
  callback: {left: 712, bottom: 56, maxWidth: 760},
};

/** An app beat: the scene's capture, its captions (numbers from the run it was captured on), the corner tag. */
export const AppBeat: React.FC<{beat: Beat; app: App; data: FilmData; showSourceTag: boolean}> = ({beat, app, data, showSourceTag}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{background: C.chrome}}>
      {app.capture ? (
        <OffthreadVideo src={staticFile(app.capture)} muted />
      ) : (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', fontFamily: FONT.mono, fontSize: 40, color: C.amber}}>
          missing capture: captures/{beat.scene}.mp4 (node capture.mjs {beat.scene})
        </AbsoluteFill>
      )}
      {beat.scene === 'callback' ? <Callback qty={data.paper.row.qty} drawn={data.paper.drawn} t={t} /> : null}
      {app.captions.map((c, i) => (
        <Caption key={i} cap={c} pos={POS[beat.scene ?? ''] ?? {left: 712, bottom: 56}} />
      ))}
      <CornerTag mock={showSourceTag && app.source !== 'repo'} />
    </AbsoluteFill>
  );
};

/** Beat 10 opens on the cold open's card, small, beside the flag: the bill's 12 against the drawing's 8. */
const Callback: React.FC<{qty: number; drawn: number; t: number}> = ({qty, drawn, t}) => {
  if (t > 4.2) return null;
  const a = Math.min(interpolate(t, [0.2, 0.45], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), interpolate(t, [3.9, 4.2], [1, 0], {extrapolateLeft: 'clamp'}));
  return (
    <div style={{position: 'absolute', left: 712, bottom: 56, opacity: a, background: 'rgba(5,5,6,0.94)', border: `1px solid ${C.line}`, borderRadius: 18, padding: '12px 30px 16px'}}>
      <div style={{fontFamily: FONT.mono, fontSize: 84, fontWeight: 600, color: C.white, lineHeight: 1.1}}>
        {qty} <span style={{color: C.amber}}>≠</span> {drawn}
      </div>
      <div style={{fontFamily: FONT.sans, fontSize: 28, color: C.mute}}>billed · drawn</div>
    </div>
  );
};
