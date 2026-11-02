import {AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {CAPTURE_AT, CAPTURE_S, CLOSE_AT, LOCKUP_AT, V8, timed} from './animatic-v8-cues.js';
import {WorldV8} from './WorldV8';
import type {WorldSheet} from './WorldV8';

/**
 * Film v8 animatic (≈3:01, 1920 × 1080, 30 fps; demo/SCRIPT-V8.md): one continuous journey. Part 1 is one three.js
 * world (WorldV8) under one camera path; the three live slots are plain grey frames with one label; the opening push
 * goes through a grey monitor into the first sheet, the closing push goes into the laptop and lands on /try; Part 2 is
 * the real capture (captures/try-test.mp4, 88 s) full-frame with the script's lines timed to its cues; the close is the
 * scoreboard as big type, then the lockup. No sound: subtitles for every line (155 wpm) and a small timecode.
 */
export type AnimaticV8Data = {sheets: WorldSheet[]};
export type AnimaticV8Props = {data?: AnimaticV8Data};

const GREY = '#8a8a8a';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => u * u * (3 - 2 * u);
const ov = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const LINES = timed();

const LiveFrame: React.FC<{label: string; a?: number; dark?: number}> = ({label, a = 1, dark = 0.45}) => (
  <AbsoluteFill style={{opacity: a, background: `rgba(40,40,44,${dark})`}}>
    <div style={{position: 'absolute', inset: 48, border: '3px dashed rgba(255,255,255,0.7)'}} />
    <div style={{position: 'absolute', left: 90, top: 80, fontFamily: FONT.mono, fontSize: 40, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '10px 18px'}}>{label}</div>
  </AbsoluteFill>
);

const TypeCard: React.FC<{text: string; at: number; until: number; t: number}> = ({text, at, until, t}) => {
  if (t < at || t > until) return null;
  const a = Math.min(clamp01((t - at) / 0.2), clamp01((until - t) / 0.25));
  return (
    <AbsoluteFill style={{display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: a, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)'}} />
      <div style={{position: 'relative', fontFamily: FONT.sans, fontSize: 112, fontWeight: 600, letterSpacing: -3, color: '#fff', textAlign: 'center', maxWidth: 1700, lineHeight: 1.05, transform: `translateY(${(1 - a) * 12}px)`}}>{text}</div>
    </AbsoluteFill>
  );
};

export const AnimaticV8: React.FC<AnimaticV8Props> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(frame % fps).padStart(2, '0')}`;
  const line = LINES.find((l) => t >= l.at && t < l.end);
  const P = V8.push;
  // the opening: a grey monitor rectangle the camera pushes into; at 6 s it is the first sheet, filling the frame
  const push = ov(t, P.pain.from, P.pain.to);
  const monW = lerp(820, 1920, push);
  const monH = lerp(461, 1080, push);
  // the laptop push (78–81): a rectangle grows to the frame and lands on /try
  const lp = ov(t, P.laptop.from, P.laptop.to);
  const lapW = lerp(760, 1920, lp);
  const lapH = lerp(428, 1080, lp);
  return (
    <AbsoluteFill style={{background: GREY, overflow: 'hidden'}}>
      {/* Part 1: the world (6–72) */}
      {t >= 5.0 && t < 72 && data ? (
        <AbsoluteFill style={{opacity: ov(t, 5.0, 6.0)}}>
          <WorldV8 sheets={data.sheets} l1="v8/L-1.png" />
        </AbsoluteFill>
      ) : null}

      {/* LIVE L-PAIN (0–6) with the digital push into the monitor, which becomes the first sheet */}
      {t < 6.2 ? (
        <AbsoluteFill style={{opacity: 1 - ov(t, 5.6, 6.2)}}>
          <LiveFrame label={V8.live.pain.label} dark={0.75} />
          <div style={{position: 'absolute', left: 960 - monW / 2, top: 560 - monH / 2, width: monW, height: monH, background: '#d9d9d9', border: '3px solid #222', overflow: 'hidden'}}>
            {/* the monitor: the drawings tiled; the L-1 render in the middle is what the push lands on */}
            <Img src={staticFile('v8/L-1.png')} style={{position: 'absolute', left: '0%', top: '0%', width: '100%', height: '100%', objectFit: 'cover', opacity: lerp(0.55, 1, push)}} />
            <div style={{position: 'absolute', left: '45%', top: '70%', width: '36%', height: '12%', border: `${lerp(3, 6, push)}px solid #e5484d`, opacity: 1 - push}} />
            <div style={{position: 'absolute', left: 16, top: 12, fontFamily: FONT.mono, fontSize: 22, color: '#222', opacity: 1 - push}}>his monitor · drawings tiled · a red box around the error</div>
          </div>
          {t >= 3 ? (
            <div style={{position: 'absolute', left: 1180, top: 300 + (1 - ov(t, 3, 3.4)) * 14, opacity: ov(t, 3, 3.4) * (1 - push), borderRadius: 28, background: 'rgba(20,22,26,0.82)', border: '1.5px solid rgba(255,255,255,0.3)', padding: '22px 28px', color: '#fff', fontFamily: FONT.sans}}>
              <div style={{fontSize: 34, fontWeight: 600}}>
                <span style={{color: C.amber}}>● </span>Billed 12 · Drawn 8
              </div>
              <div style={{fontSize: 24, opacity: 0.7, marginTop: 6}}>glass card: the product already sees what he is hunting</div>
            </div>
          ) : null}
          <div style={{position: 'absolute', left: 90, bottom: 140, fontFamily: FONT.mono, fontSize: 26, color: '#ffd400', opacity: push > 0 && push < 1 ? 1 : 0}}>camera: digital push into the monitor → through it into the drawing</div>
        </AbsoluteFill>
      ) : null}

      {/* LIVE L-SITE (53–55.5): the tape across a real pit, 1.5 m; a match cut back to the pit on the slab */}
      {t >= V8.live.site.start && t < V8.live.site.end ? (
        <>
          <LiveFrame label={V8.live.site.label} dark={0.85} />
          <div style={{position: 'absolute', left: 90, bottom: 140, fontFamily: FONT.mono, fontSize: 26, color: '#ffd400'}}>match cut: the tape's 1.5 m → the drawing's 1.5 × 1.5 m pit on the slab</div>
        </>
      ) : null}

      {/* LIVE L-TURN (72–78) */}
      {t >= V8.live.turn.start && t < V8.push.laptop.from + 0.01 ? <LiveFrame label={V8.live.turn.label} dark={lerp(0.85, 0.55, ov(t, 75, 76))} /> : null}

      {/* the laptop push (78–81): the opening's push, mirrored; it lands on /try */}
      {t >= P.laptop.from && t < CAPTURE_AT ? (
        <AbsoluteFill>
          <LiveFrame label="LIVE · the lit room, his laptop" dark={0.55} />
          <div style={{position: 'absolute', left: 960 - lapW / 2, top: 560 - lapH / 2, width: lapW, height: lapH, background: '#111', border: '3px solid #222', overflow: 'hidden'}}>
            <Img src={staticFile('v8/try-first.png')} style={{width: '100%', height: '100%', objectFit: 'cover', opacity: lerp(0.6, 1, lp)}} />
          </div>
          <div style={{position: 'absolute', left: 90, bottom: 140, fontFamily: FONT.mono, fontSize: 26, color: '#ffd400'}}>camera: push into the laptop's screen → /try</div>
        </AbsoluteFill>
      ) : null}

      {/* Part 2: the real /try capture, full-frame (81–169) */}
      {t >= CAPTURE_AT && t < CLOSE_AT + 0.5 ? (
        <Sequence from={Math.round(CAPTURE_AT * fps)} durationInFrames={Math.round((CAPTURE_S + 0.5) * fps)} name="the capture" layout="none">
          <OffthreadVideo src={staticFile('v8/try-test.mp4')} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
        </Sequence>
      ) : null}

      {/* the close: the scoreboard as big type over the dimmed last screen, then the lockup */}
      {t >= CLOSE_AT ? <AbsoluteFill style={{background: '#14161a', opacity: ov(t, CLOSE_AT, CLOSE_AT + 0.4)}} /> : null}
      {t >= LOCKUP_AT ? (
        <AbsoluteFill style={{background: '#0b0c0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: ov(t, LOCKUP_AT, LOCKUP_AT + 0.4), color: '#fff'}}>
          <div style={{fontFamily: FONT.sans, fontSize: 132, fontWeight: 700, letterSpacing: -4}}>Landsight</div>
          <div style={{fontFamily: FONT.mono, fontSize: 30, marginTop: 24, opacity: 0.8}}>github.com/eric2612115/landsight</div>
          <div style={{fontFamily: FONT.sans, fontSize: 28, marginTop: 14, opacity: 0.6}}>Built with Muse Spark 1.3 and SAM 3.1</div>
        </AbsoluteFill>
      ) : null}

      {/* the big type, three places only (the scoreboard and the hinge; the opening has none) */}
      {V8.cards.map((c) => (
        <TypeCard key={c.text} text={c.text} at={c.at} until={c.until} t={t} />
      ))}

      {/* subtitles: one line at a time, bottom-centre, 44 px, 155 wpm */}
      {line ? (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center'}}>
          <span style={{display: 'inline-block', fontFamily: FONT.sans, fontSize: 44, lineHeight: 1.25, color: '#fff', background: 'rgba(0,0,0,0.72)', padding: '10px 22px', borderRadius: 8, maxWidth: 1640}}>
            {line.who ? <span style={{opacity: 0.6}}>{line.who}: </span> : null}
            {line.text}
          </span>
        </div>
      ) : null}

      {/* the timecode, top-left, for review */}
      <div style={{position: 'absolute', left: 20, top: 16, fontFamily: FONT.mono, fontSize: 22, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4}}>{tc}</div>
    </AbsoluteFill>
  );
};
