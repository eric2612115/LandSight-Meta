import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT} from '../theme';
import {B, BIG, END, LIVE, LOGO_AT, PART2_AT, PUSH, SEGMENTS, CLOSE_AT, captions} from './film-v2-cues.js';
import {LAND_QUAD} from '../../teardown-v4/land.js';
import {LOOK, plain} from '../../teardown-v4/look.js';
import {CUT} from '../../teardown-v4/cut.js';

/**
 * Film v4: the approved cut's narration, music and timing (film-v2-cues.js, mix.wav, captions()) with Part 1 and the end
 * redrawn as a teardown: the sample package as one machine under a console (demo/film/teardown-v4, recorded frame by
 * frame to public/v4/part1.mp4 and public/v4/end.mp4). Eric's opening and the push are the approved cut's, landing on
 * the simulator's L-6 (LAND_QUAD); Part 2 is the real product's capture, framed under the console's top bar; captions
 * stay one line at a time from the same cues. No timecode.
 */
export type FilmV4Props = {sound?: boolean};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const win = (t: number, a: number, b: number, f = 0.3) => Math.min(ov(t, a, a + f), 1 - ov(t, b - f, b));
const CAPS = captions();
const NUM = {fontVariantNumeric: 'tabular-nums' as const};
const PAPER = '#f4f2ed'; // L-6's own paper, where the push lands

// ---------------------------------------------------------------- the opening: Eric's footage and the push (as v2)
/** Solves the 2D homography mapping four points onto four (TL, TR, BR, BL), as a CSS matrix3d. */
function homography(src: number[][], dst: number[][]): string {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  const [a, bb, c, d, e, f, g, hh] = h;
  return `matrix3d(${a},${d},0,${g},${bb},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
}
const area = (q: number[][]) => Math.abs(q.reduce((s, p, i) => s + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0)) / 2;
const SRC = PUSH.quad;
const HALF = SRC.map(([x, y]: number[]) => [x * (1920 / PUSH.size[0]), y * (1080 / PUSH.size[1])]);
const ZOOM = Math.sqrt(area(LAND_QUAD) / area(HALF));
function pushMatrix(t: number): string {
  const e = ov(t, PUSH.warp[0], PUSH.warp[1]);
  const v = (Math.pow(ZOOM, e) - 1) / (ZOOM - 1);
  return homography(SRC, HALF.map((p: number[], i: number) => [lerp(p[0], LAND_QUAD[i][0], v), lerp(p[1], LAND_QUAD[i][1], v)]));
}
const Opening: React.FC<{t: number; fps: number}> = ({t, fps}) => {
  if (t >= B.land + 0.1) return null;
  const pushing = t >= PUSH.warp[0];
  const fade = 1 - ov(t, PUSH.fade[0], PUSH.fade[1]);
  const xf = pushing ? pushMatrix(t) : undefined;
  const big = {position: 'absolute' as const, left: 0, top: 0, width: PUSH.size[0], height: PUSH.size[1], transformOrigin: '0 0', transform: xf};
  // the margins outside the drawn border turn to paper as the push lands, so the hand-over to the 3D sheet is clean
  const pm = ov(t, B.land - 0.35, B.land - 0.08);
  const [tl, , br] = LAND_QUAD;
  return (
    <AbsoluteFill style={{opacity: fade, background: '#000'}}>
      {LIVE.map((s: {start: number; end: number; clip: string; from: number; rate: number}, k: number) => (
        <Sequence key={k} from={Math.round(s.start * fps)} durationInFrames={Math.round(s.end * fps) - Math.round(s.start * fps)} layout="none" name={`live ${k + 1} · ${s.clip}`}>
          <OffthreadVideo src={staticFile(`v2/live/${s.clip}.mp4`)} startFrom={Math.round((s.from / s.rate) * fps)} playbackRate={s.rate} muted style={pushing && s.clip === 'A' ? big : {position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
        </Sequence>
      ))}
      {t >= PUSH.still ? <Img src={staticFile('v2/live/A-last.png')} style={big} /> : null}
      {pm > 0 ? (
        <>
          <div style={{position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(0, tl[1]), background: PAPER, opacity: pm}} />
          <div style={{position: 'absolute', left: 0, top: br[1], right: 0, bottom: 0, background: PAPER, opacity: pm}} />
          <div style={{position: 'absolute', left: 0, top: tl[1], width: Math.max(0, tl[0]), height: br[1] - tl[1], background: PAPER, opacity: pm}} />
          <div style={{position: 'absolute', left: br[0], top: tl[1], right: 0, height: br[1] - tl[1], background: PAPER, opacity: pm}} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the simulator's recordings
const Recorded: React.FC<{src: string; range: number[]; fps: number}> = ({src, range, fps}) => (
  <Sequence from={Math.round(range[0] * fps)} durationInFrames={Math.round((range[1] - range[0]) * fps)} layout="none" name={src}>
    <OffthreadVideo src={staticFile(src)} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
  </Sequence>
);

// ---------------------------------------------------------------- Part 2: the real product, framed under the top bar
const BAR = 60;
const K = (1080 - BAR) / 1080;
const TopBar: React.FC = () => (
  <div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: BAR, background: LOOK.panel, borderBottom: `1px solid ${LOOK.line}`, display: 'flex', alignItems: 'center', fontFamily: FONT.sans, color: LOOK.ink}}>
    <Img src={staticFile('v2/logo-lockup-light.svg')} style={{height: 34, marginLeft: 48}} />
    <div style={{width: 1, height: 36, background: LOOK.line, margin: '0 28px'}} />
    <div style={{fontSize: 34, fontWeight: 650, letterSpacing: -0.4}}>Greenfield Residences</div>
    <div style={{marginLeft: 'auto', marginRight: 48, fontFamily: FONT.mono, fontSize: 15, fontWeight: 600, letterSpacing: 2, color: LOOK.mute}}>THE PRODUCT · SCREEN RECORDING</div>
  </div>
);
const Part2: React.FC<{fps: number}> = ({fps}) => {
  let at = PART2_AT;
  return (
    <AbsoluteFill style={{background: LOOK.bg}}>
      <TopBar />
      <div style={{position: 'absolute', left: (1920 - 1920 * K) / 2, top: BAR, width: 1920 * K, height: 1080 * K, overflow: 'hidden', borderRadius: 4, boxShadow: '0 10px 30px rgba(40,34,26,0.18)'}}>
        {SEGMENTS.map(([f, to]: number[], k: number) => {
          const from = at;
          at += to - f;
          return (
            <Sequence key={k} from={Math.round(from * fps)} durationInFrames={Math.round(at * fps) - Math.round(from * fps)} name={`capture ${k + 1}`} layout="none">
              <OffthreadVideo src={staticFile('v2/try.mp4')} startFrom={Math.round(f * fps)} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
            </Sequence>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Caption: React.FC<{t: number}> = ({t}) => {
  const c = CAPS.find((x: {start: number; end: number}) => t >= x.start && t < x.end);
  if (!c) return null;
  const dip = 1 - ov(t, LOGO_AT - 0.35, LOGO_AT - 0.05);
  if (dip <= 0.002) return null;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 42, textAlign: 'center', opacity: dip}}>
      <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 44, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.3, color: '#fff', background: 'rgba(20,22,27,0.8)', padding: '9px 24px 11px', borderRadius: 12, whiteSpace: 'nowrap', ...NUM}}>{plain(c.text)}</span>
    </div>
  );
};

export const FilmV4: React.FC<FilmV4Props> = ({sound = true}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const u = t - CLOSE_AT;
  return (
    <AbsoluteFill style={{background: LOOK.bg, overflow: 'hidden'}}>
      {/* Part 1 in the teardown: from the push's landing on L-6 to the findings */}
      {t >= CUT.part1[0] && t < CUT.part1[1] ? <Recorded src="v4/part1.mp4" range={CUT.part1} fps={fps} /> : null}
      {/* the opening: Eric's footage, his voice; the push into his monitor lands on the simulator's L-6 */}
      <Opening t={t} fps={fps} />
      {sound ? <Audio src={staticFile('v2/audio/mix.wav')} /> : null}

      {/* the big type on black, the hard cut into the product */}
      {t >= B.type - 0.2 && t < PART2_AT ? (
        <AbsoluteFill style={{background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: ov(t, B.type - 0.2, B.type)}}>
          <div style={{fontFamily: FONT.sans, fontSize: 140, fontWeight: 700, letterSpacing: -4, color: '#fff', textAlign: 'center'}}>Two weeks → ten minutes.</div>
        </AbsoluteFill>
      ) : null}

      {/* Part 2: the capture, its holds cut, under the console's top bar */}
      {t >= PART2_AT - 0.1 && t < CLOSE_AT + 0.1 ? <Part2 fps={fps} /> : null}
      {BIG.map((b: {at: number; until: number; text: string}) => {
        const a = win(t, b.at, b.until, 0.3);
        return a > 0.002 ? (
          <AbsoluteFill key={b.text} style={{opacity: a, background: 'rgba(8,9,12,0.66)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{fontFamily: FONT.sans, fontSize: 76, fontWeight: 700, letterSpacing: -2, color: '#fff', textAlign: 'center', transform: `translateY(${(1 - a) * 8}px)`}}>{plain(b.text)}</div>
          </AbsoluteFill>
        ) : null;
      })}

      {/* the end: the whole package checked, the scoreboard, the line; then the logo */}
      {t >= CUT.end[0] ? (
        <>
          <Recorded src="v4/end.mp4" range={CUT.end} fps={fps} />
          <AbsoluteFill style={{background: '#000', opacity: 1 - ov(u, 0, 0.45)}} />
          {(() => {
            const veil = ov(u, END.logo - 0.35, END.logo - 0.05);
            const logoIn = ov(u, END.logo, END.logo + 0.4);
            return veil > 0 ? (
              <AbsoluteFill style={{background: LOOK.paper, opacity: veil, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                <Img src={staticFile('v2/logo-lockup-light.svg')} style={{height: 160, opacity: logoIn, transform: `scale(${lerp(0.95, 1, logoIn)})`}} />
                <div style={{fontFamily: FONT.sans, fontSize: 36, fontWeight: 500, marginTop: 48, color: LOOK.ink, opacity: 0.9 * logoIn}}>github.com/eric2612115/landsight</div>
                <div style={{fontFamily: FONT.sans, fontSize: 30, marginTop: 14, color: LOOK.mute, opacity: logoIn}}>Built with Muse Spark 1.3 and SAM 3.1</div>
              </AbsoluteFill>
            ) : null;
          })()}
        </>
      ) : null}

      <Caption t={t} />
    </AbsoluteFill>
  );
};
