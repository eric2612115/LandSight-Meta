import {AbsoluteFill, Audio, Easing, Sequence, interpolate, interpolateColors, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {Sheet} from '../ui/Sheet';
import {SCENE1, voicePlan} from './scene1-cues.js';
import t08 from './t08.json';

/**
 * Scene 1, "One tree" (15 s, 1920 × 1080, 30 fps). The real L-1 (Rev B) in plan view, a slow push toward the frontage
 * row; a cobalt scan line crosses the row and the eighth canopy, T-08, lights. The sheet falls to the dark field and
 * only T-08's line work stays, centred at ×6: the twelve LINE entities of the DXF (src/scenes/t08.json, read with
 * ezdxf) and its centre cross. The camera orbits 90°; each piece sits at its own depth, so the circle shears apart
 * into twelve strokes; each gets its entity tag and the corner counts entities, not trees; then the camera returns,
 * the strokes snap back and the cobalt ring closes.
 */
export type Scene1Data = {
  sheet: {svg: string; viewBox: number[]; id: string; source: string};
  narration: {voice: string; dir: string; clips: Record<string, number>};
};
export type Scene1Props = {data?: Scene1Data};

const P = 1400; // perspective, px
const FIELD = '#0b0c0f';
const INK = '#000000';
const RING_PAD = 0.32; // m outside the canopy
const SX = (X: number) => X + t08.svg.offset_x; // sheet metres → svg units
const SY = (Y: number) => t08.svg.flip_y - Y;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const ease = Easing.inOut(Easing.cubic);

/** The piece (pieces are ordered by angle, counter-clockwise from east) at each depth rank, nearest last; spread
 * over 600 px. The order was searched so that at the 90° hold no two projected strokes cross and every tag box
 * clears every stroke and tag by at least 57 px (any order aligns exactly in plan view). */
const ORDER = [4, 9, 1, 8, 6, 10, 2, 11, 5, 0, 3, 7];
const DEPTH: number[] = [];
ORDER.forEach((piece, rank) => {
  DEPTH[piece] = -300 + (600 * rank) / (ORDER.length - 1);
});

const [cx, cy] = t08.centre;
/** A piece in px about the tree centre (y down), scaled by (P − z) / P so that, under `perspective: P` with its
 * origin at the centre, the plan view at 0° projects exactly onto the original circle. */
function piecePx(points: number[][], S: number, z: number): number[][] {
  const k = (P - z) / P;
  return points.map(([X, Y]) => [k * S * (X - cx), -k * S * (Y - cy)]);
}
/** Each piece turns back by this fraction of the parent's angle about the tree's axis at its own depth, so that at
 * 90° a stroke is still seen at 54° rather than edge-on (a flat line seen from the side is a dot). Zero at 0°, so
 * the plan view stays exact. */
const TWIST = 0.4;
/** Where a point of a piece lands on screen: the parent's rotateY(θ), the piece's translateZ(z) and rotateY(−TWIST·θ),
 * then the perspective divide. The net is R(θ(1 − TWIST))·p + z·(sin θ, 0, cos θ). */
function project(px: number, py: number, z: number, thetaDeg: number, Cx: number, Cy: number) {
  const th = (thetaDeg * Math.PI) / 180;
  const own = th * (1 - TWIST);
  const x1 = px * Math.cos(own) + z * Math.sin(th);
  const z1 = -px * Math.sin(own) + z * Math.cos(th);
  const f = P / (P - z1);
  return {x: Cx + x1 * f, y: Cy + py * f};
}

export const Scene1Tree: React.FC<Scene1Props> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  if (!data) return <AbsoluteFill style={{background: FIELD}} />;

  // ---------- the camera on the sheet (0–3 s), the lift (3–4 s) ----------
  const [, , vw, vh] = data.sheet.viewBox;
  const PX0 = 1920 / vw; // px per sheet unit at zoom 1
  const u = ease(clamp01(t / SCENE1.push.end));
  const zoom = lerp(1, SCENE1.push.zoom, u) * interpolate(t, [SCENE1.lift.start, SCENE1.lift.sheetOut], [1, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const row = t08.row;
  const fx = row.reduce((a, r) => a + r.centre[0], 0) / row.length;
  const fy = row.reduce((a, r) => a + r.centre[1], 0) / row.length;
  const anchor = {x: lerp(vw / 2, SX(fx), u), y: lerp(vh / 2, SY(fy), u)};
  const target = {x: 960, y: lerp(540, 600, u)};
  const ox = target.x - zoom * anchor.x * PX0;
  const oy = target.y - zoom * anchor.y * PX0;
  const sheetAlpha = interpolate(t, [SCENE1.lift.start, SCENE1.lift.sheetOut], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // T-08 on screen: on the sheet until the lift, then the centre at ×6
  const v = ease(clamp01((t - SCENE1.lift.start) / (SCENE1.lift.end - SCENE1.lift.start)));
  const Cx = lerp(ox + zoom * SX(cx) * PX0, 960, v);
  const Cy = lerp(oy + zoom * SY(cy) * PX0, 540, v);
  const S = lerp(zoom * PX0, 6 * PX0, v); // px per metre
  const sw = lerp(0.06, 0.075, v) * S; // the sheet's own line weight on the sheet, a touch heavier once lifted

  // ---------- the orbit (5–9 s) and the return (12 s) ----------
  const s1 = frame < SCENE1.orbit.start * fps ? 0 : spring({frame: frame - SCENE1.orbit.start * fps, fps, config: {damping: 200}, durationInFrames: SCENE1.orbit.frames});
  const s2 = frame < SCENE1.back.start * fps ? 0 : spring({frame: frame - SCENE1.back.start * fps, fps, config: {damping: 12, stiffness: 170, mass: 1}});
  const theta = 90 * (s1 - s2);
  const flat = theta === 0;

  // stroke colour: ink on paper → white on the dark field → cobalt as the strokes separate → white at the snap
  const col =
    t < SCENE1.orbit.start
      ? interpolateColors(clamp01((t - SCENE1.lift.start) / (SCENE1.lift.sheetOut - SCENE1.lift.start)), [0, 1], [INK, C.white])
      : t < SCENE1.back.start
        ? interpolateColors(clamp01((t - SCENE1.orbit.start) / 0.8), [0, 1], [C.white, C.cobaltLt])
        : interpolateColors(clamp01((t - (SCENE1.back.start + 0.3)) / 0.5), [0, 1], [C.cobaltLt, C.white]);
  const crossAlpha = t < SCENE1.back.start ? 1 - clamp01((t - SCENE1.orbit.start) / 0.6) : clamp01((t - (SCENE1.back.start + 0.4)) / 0.5);

  // ---------- the ring ----------
  const ringP = t < SCENE1.back.start ? clamp01((t - SCENE1.ring.open) / (SCENE1.ring.drawn - SCENE1.ring.open)) : clamp01((t - SCENE1.ring.closeStart) / (SCENE1.ring.closeEnd - SCENE1.ring.closeStart));
  const ringA = t < SCENE1.back.start ? 1 - clamp01((t - SCENE1.ring.fadeStart) / (SCENE1.ring.fadeEnd - SCENE1.ring.fadeStart)) : 1;
  const ringR = (t08.radius + RING_PAD) * S;

  // ---------- the scan line (svg units) ----------
  const xs = interpolate(t, [SCENE1.scan.start, SCENE1.scan.hit], [SCENE1.scan.x0, cx]);
  const scanA = Math.min(interpolate(t, [SCENE1.scan.start, SCENE1.scan.start + 0.12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), interpolate(t, [SCENE1.scan.hit + 0.05, SCENE1.scan.out], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const passTime = (X: number) => SCENE1.scan.start + ((X - SCENE1.scan.x0) / (cx - SCENE1.scan.x0)) * (SCENE1.scan.hit - SCENE1.scan.start);
  const dim = clamp01((t - SCENE1.scan.hit) / 0.4);

  // ---------- tags and the counter (9–12 s) ----------
  const tagAlpha = (rank: number) => {
    const at = SCENE1.tags.start + rank * SCENE1.tags.step;
    return Math.min(clamp01((t - at) / 0.15), 1 - clamp01((t - SCENE1.tags.out) / 0.3));
  };
  const shown = ORDER.filter((_, rank) => t >= SCENE1.tags.start + rank * SCENE1.tags.step).length;
  const counterA = Math.min(clamp01((t - SCENE1.tags.start) / 0.2), 1 - clamp01((t - SCENE1.tags.out) / 0.3));

  const plan = voicePlan(data.narration.clips['1'], data.narration.clips['2']);
  const L = 600; // half-size of each piece's own svg, px

  return (
    <AbsoluteFill style={{background: FIELD, overflow: 'hidden'}}>
      {/* the dark field: a faint lift at the centre */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, #15181d 0%, #0e1013 45%, #0b0c0f 80%)'}} />

      {/* the sheet, paper-white and ink, drawn at its on-screen size so the line work stays crisp under the push */}
      {sheetAlpha > 0 ? (
        <AbsoluteFill style={{opacity: sheetAlpha}}>
          <AbsoluteFill style={{background: C.paper}} />
          <Sheet svg={data.sheet.svg} viewBox={data.sheet.viewBox} width={1920 * zoom} style={{position: 'absolute', left: ox, top: oy}}>
            {/* the closed canopies: a cobalt flash as the scan passes, then they dim once T-08 has lit */}
            {row
              .filter((r) => r.id !== t08.object_id)
              .map((r) => {
                const tp = passTime(r.centre[0]);
                const bump = t >= tp ? Math.exp(-(t - tp) / 0.12) : 0;
                return (
                  <g key={r.id}>
                    <circle cx={SX(r.centre[0])} cy={SY(r.centre[1])} r={r.r + 0.35} fill={C.paper} opacity={0.62 * dim} />
                    <circle cx={SX(r.centre[0])} cy={SY(r.centre[1])} r={r.r + 0.2} fill={C.cobalt} opacity={0.25 * bump} />
                  </g>
                );
              })}
            {/* T-08 lit: a soft cobalt fill inside the ring */}
            <circle cx={SX(cx)} cy={SY(cy)} r={t08.radius + RING_PAD} fill={C.cobalt} opacity={0.07 * clamp01((t - SCENE1.scan.hit) / 0.3)} />
            {/* the scan line */}
            <line x1={SX(xs)} x2={SX(xs)} y1={SY(7.5)} y2={SY(-1.5)} stroke={C.cobalt} strokeWidth={0.08} opacity={scanA} />
          </Sheet>
        </AbsoluteFill>
      ) : null}

      {/* T-08: its twelve pieces (and the cross) in 3D about its centre; at 0° they sit exactly on the sheet's own lines */}
      <AbsoluteFill style={{perspective: P, perspectiveOrigin: `${Cx}px ${Cy}px`}}>
        <div style={{position: 'absolute', left: Cx, top: Cy, width: 0, height: 0, transformStyle: 'preserve-3d', transform: `rotateY(${theta}deg)`}}>
          {t08.canopy.map((seg, i) => {
            const z = DEPTH[i];
            const [a, b] = piecePx(seg.points, S, z);
            return (
              <div key={seg.handle} style={{position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate3d(0, 0, ${z}px) rotateY(${-TWIST * theta}deg)`}}>
                <svg width={2 * L} height={2 * L} viewBox={`${-L} ${-L} ${2 * L} ${2 * L}`} style={{position: 'absolute', left: -L, top: -L, overflow: 'visible'}}>
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col} strokeWidth={sw} strokeLinecap="round" />
                </svg>
              </div>
            );
          })}
          {crossAlpha > 0 ? (
            <div style={{position: 'absolute', left: 0, top: 0, width: 0, height: 0, opacity: crossAlpha}}>
              <svg width={2 * L} height={2 * L} viewBox={`${-L} ${-L} ${2 * L} ${2 * L}`} style={{position: 'absolute', left: -L, top: -L, overflow: 'visible'}}>
                {t08.cross.map((seg) => {
                  const [a, b] = piecePx(seg.points, S, 0);
                  return <line key={seg.handle} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col} strokeWidth={sw} strokeLinecap="round" />;
                })}
              </svg>
            </div>
          ) : null}
        </div>
      </AbsoluteFill>

      {/* the cobalt ring, drawn from the top, in the plan views only */}
      {ringP > 0 && ringA > 0 ? (
        <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: ringA}}>
          <circle cx={Cx} cy={Cy} r={ringR} fill="none" stroke={C.cobalt} strokeWidth={Math.max(3, Math.min(7, 0.07 * S))} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ringP} transform={`rotate(-90 ${Cx} ${Cy})`} />
        </svg>
      ) : null}

      {/* entity tags, one per stroke, in depth order */}
      {!flat || t >= SCENE1.tags.start
        ? ORDER.map((piece, rank) => {
            const a = tagAlpha(rank);
            if (a <= 0) return null;
            const seg = t08.canopy[piece];
            const z = DEPTH[piece];
            const [p0, p1] = piecePx(seg.points, S, z);
            const e0 = project(p0[0], p0[1], z, theta, Cx, Cy);
            const e1 = project(p1[0], p1[1], z, theta, Cx, Cy);
            // to the right of the stroke's rightmost end, centred on its height
            const m = {x: Math.max(e0.x, e1.x), y: (e0.y + e1.y) / 2};
            return (
              <div key={seg.handle} style={{position: 'absolute', left: m.x + 16, top: m.y - 28, opacity: a, transform: `translateX(${(1 - a) * -8}px)`, fontFamily: FONT.mono, lineHeight: 1.15, whiteSpace: 'nowrap'}}>
                <div style={{fontSize: 26, fontWeight: 600, color: C.soft, letterSpacing: 1}}>{seg.type}</div>
                <div style={{fontSize: 18, color: C.mute}}>{seg.handle}</div>
              </div>
            );
          })
        : null}

      {/* the counter */}
      {counterA > 0 ? (
        <div style={{position: 'absolute', right: 64, top: 46, opacity: counterA, fontFamily: FONT.mono, fontSize: 34, color: C.mute, fontVariantNumeric: 'tabular-nums'}}>
          <span style={{color: C.white, fontWeight: 600}}>{shown}</span> entities · <span style={{color: C.white, fontWeight: 600}}>0</span> trees
        </div>
      ) : null}

      {/* burned captions, bottom third */}
      {SCENE1.captions.map((c) => (
        <Burn key={c.text} text={c.text} at={c.at} until={c.until} t={t} />
      ))}

      {/* sound: the two lines, then the effects track */}
      {plan.map((p) => (
        <Sequence key={p.n} from={Math.round(p.at * fps)} durationInFrames={Math.ceil((p.seconds + 0.2) * fps)} name={`voice ${p.n}`}>
          <Audio src={staticFile(`${data.narration.dir}/line-0${p.n}.wav`)} volume={1} />
        </Sequence>
      ))}
      <Audio src={staticFile('gen/scene1-sfx.wav')} volume={1} name="effects" />
    </AbsoluteFill>
  );
};

/** A burned caption: Inter, centred in the bottom third, in and out on a short fade (shared with scene 2). */
export const Burn: React.FC<{text: string; at: number; until: number; t: number}> = ({text, at, until, t}) => {
  if (t < at || t > until) return null;
  const a = Math.min(interpolate(t, [at, at + 0.3], [0, 1], {extrapolateRight: 'clamp'}), interpolate(t, [until - 0.25, until], [1, 0], {extrapolateLeft: 'clamp'}));
  return (
    <div style={{position: 'absolute', left: 120, right: 120, top: 920, textAlign: 'center', opacity: a, transform: `translateY(${(1 - a) * 12}px)`, fontFamily: FONT.sans, fontSize: 54, fontWeight: 500, color: C.white, letterSpacing: -0.6, lineHeight: 1.2, textShadow: '0 2px 18px rgba(0,0,0,0.55)'}}>
      {text}
    </div>
  );
};
