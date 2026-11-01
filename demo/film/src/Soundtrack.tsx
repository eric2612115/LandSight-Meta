import {Audio, Sequence, interpolate, staticFile, useVideoConfig} from 'remotion';
import type {FilmData} from './data';
import {CLOSE, coldOpen, voicePlan} from './timing.js';

/**
 * The narrator's lines at their beats; the open music from the cold open's thud to the end of beat 2 and the close
 * music under beat 11, both ducked under the voice; one mixed effects track (prepare.mjs) for every cue.
 */
export const Soundtrack: React.FC<{data: FilmData; narrator: string}> = ({data, narrator}) => {
  const {fps} = useVideoConfig();
  const n = data.narration[narrator] ?? data.narration.brian;
  const durations: Record<number, number> = Object.fromEntries(Object.entries(n.clips).map(([k, v]) => [Number(k), v]));
  const co = coldOpen(data.paper.row.display.length, data.paper.canopies.length);
  const plan = voicePlan(data.beats, durations, co.voice);
  const duck = (t: number) => {
    // smooth: distance to the nearest line edge, in seconds
    let d = Infinity;
    for (const p of plan) {
      if (t >= p.at && t <= p.end) return 0;
      d = Math.min(d, Math.abs(t - p.at), Math.abs(t - p.end));
    }
    return Math.min(1, d / 0.35);
  };
  const musicOpenAt = co.card;
  const openEnd = 15;
  const closeEnd = CLOSE.roomTone + 0.2;
  return (
    <>
      {plan.map((p) => (
        <Sequence key={p.n} from={Math.round(p.at * fps)} durationInFrames={Math.ceil((p.seconds + 0.2) * fps)} name={`voice ${p.n}`}>
          <Audio src={staticFile(`${n.dir}/beat-${String(p.n).padStart(2, '0')}.${n.ext ?? 'mp3'}`)} volume={1} />
        </Sequence>
      ))}
      <Sequence from={Math.round(musicOpenAt * fps)} durationInFrames={Math.round((openEnd - musicOpenAt) * fps)} name="music open">
        <Audio
          src={staticFile('audio/music/open.mp3')}
          volume={(f) => {
            const t = musicOpenAt + f / fps;
            const fade = Math.min(interpolate(t, [musicOpenAt, musicOpenAt + 0.8], [0.2, 1], {extrapolateRight: 'clamp'}), interpolate(t, [openEnd - 1.6, openEnd], [1, 0], {extrapolateLeft: 'clamp'}));
            return fade * (0.13 + 0.22 * duck(t));
          }}
        />
      </Sequence>
      <Sequence from={Math.round(CLOSE.start * fps)} durationInFrames={Math.round((closeEnd - CLOSE.start) * fps)} name="music close">
        <Audio
          src={staticFile('audio/music/close.mp3')}
          volume={(f) => {
            const t = CLOSE.start + f / fps;
            const fade = Math.min(interpolate(t, [CLOSE.start, CLOSE.start + 0.6], [0, 1], {extrapolateRight: 'clamp'}), interpolate(t, [closeEnd - 1.4, closeEnd], [1, 0], {extrapolateLeft: 'clamp'}));
            return fade * (0.14 + 0.24 * duck(t));
          }}
        />
      </Sequence>
      <Audio src={staticFile('gen/sfx.wav')} volume={1} name="effects" />
    </>
  );
};
