import {AbsoluteFill, Audio, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {Burn} from './Scene1Tree';
import {SCENE4} from './scene4-cues.js';

/**
 * Scene 4, "Six sheets, one building" (12 s, 1920 × 1080, 30 fps; hook 4 of demo/OPENING-V6.md). The six sheets of
 * the tower package (public/tower/*.png, the repo's own renders of samples/tower's DXF files) lie flat and fanned on
 * the dark field. The camera tilts and the four plan sheets rise one by one, each to the floor its title block
 * names in the recorded Run (public/data/scene4.json, landsight.db run 97e35639fb8d), so the stack reads as a
 * building under a slow orbit; the two sheets the Run does not count leave, tagged with the Run's words. Cobalt pins
 * light on the floors where three checks fired, each with lines quoted from the check; at the first the typical sheet
 * gains its five copies (the Run: it stands for 6 floors). The orbit settles and the Run's scoreboard lands.
 *
 * The product's screen is 2D; this stack is a film visualisation of real sheets and real flags, nothing more.
 */
export type Scene4Sheet = {
  i: number;
  sheet_id: string;
  title: string;
  file: string;
  png: string;
  floors: string[];
  counted: boolean;
  level: number | null;
  label: string;
  not_counted: {check_id: string; text: string} | null;
  fan: {rot: number; dx: number; dy: number; dz: number};
  rise: number | null;
  exit: number | null;
};
export type Scene4Ghost = {sheet_id: string; floor: string; label: string; level: number; at: number};
export type Scene4Pin = {check_id: string; severity: string; sheet_ids: string[]; plates: string[]; id_line: string; head: string; line: string; title: string; at: number};
export type Scene4Data = {
  run: {run_id: string; package: string; folder: string};
  png: {size: number[]};
  sheets: Scene4Sheet[];
  ghosts: Scene4Ghost[];
  pins: Scene4Pin[];
  scoreboard: {planted: number; found: number; flagged: number; missed: number; text: string; terms: [number, string][]};
};
export type Scene4Props = {data?: Scene4Data};

const FIELD = '#0b0c0f';
const DEG = Math.PI / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const easeInOut = Easing.inOut(Easing.cubic);
const easeOrbit = Easing.inOut(Easing.quad);
const P = SCENE4.camera.perspective;
const W = SCENE4.building.width;

type Pose = {dx: number; dy: number; dz: number; rot: number};
type Cam = {tilt: number; orbit: number; zoom: number; cx: number; cy: number};

/** Where a point of a plate lands on screen: the plate's rotateZ(rot) and translate3d, the world's rotateZ(orbit),
 * rotateX(tilt) and scale3d(zoom), then the perspective divide — the same chain the CSS below declares. */
function project(u: number, v: number, pose: Pose, cam: Cam) {
  const f = pose.rot * DEG;
  const x0 = u * Math.cos(f) - v * Math.sin(f) + pose.dx;
  const y0 = u * Math.sin(f) + v * Math.cos(f) + pose.dy;
  const z0 = pose.dz;
  const o = cam.orbit * DEG;
  const x1 = x0 * Math.cos(o) - y0 * Math.sin(o);
  const y1 = x0 * Math.sin(o) + y0 * Math.cos(o);
  const a = cam.tilt * DEG;
  const x2 = x1 * cam.zoom;
  const y2 = (y1 * Math.cos(a) - z0 * Math.sin(a)) * cam.zoom;
  const z2 = (y1 * Math.sin(a) + z0 * Math.cos(a)) * cam.zoom;
  const s = P / (P - z2);
  return {x: cam.cx + x2 * s, y: cam.cy + y2 * s, s};
}

export const Scene4Tower: React.FC<Scene4Props> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  if (!data) return <AbsoluteFill style={{background: FIELD}} />;
  const F = (s: number) => Math.round(s * fps);
  const sp = (at: number, config: {damping: number; stiffness: number; mass?: number}) => (frame < F(at) ? 0 : spring({frame: frame - F(at), fps, config}));
  const H = (W * data.png.size[1]) / data.png.size[0];
  const storey = SCENE4.building.storey;

  // ---------- the camera: plan view over the fan, then tilted, closer and over the building's spot ----------
  const cu = easeInOut(clamp01((t - SCENE4.camera.start) / (SCENE4.camera.end - SCENE4.camera.start)));
  const ou = easeOrbit(clamp01((t - SCENE4.orbit.start) / (SCENE4.orbit.settle - SCENE4.orbit.start)));
  const cam: Cam = {
    tilt: SCENE4.camera.tiltDeg * cu,
    orbit: t < SCENE4.orbit.start ? 0 : lerp(SCENE4.orbit.fromDeg, SCENE4.orbit.toDeg, ou) * cu + 0,
    zoom: lerp(SCENE4.fan.zoom, SCENE4.camera.zoom, cu),
    cx: lerp(SCENE4.fan.centre[0], SCENE4.camera.centre[0], cu),
    cy: lerp(SCENE4.fan.centre[1], SCENE4.camera.centre[1], cu),
  };

  // ---------- the plates: each sheet's pose now ----------
  type Plate = {key: string; png: string; pose: Pose; alpha: number; label: string | null; labelA: number; ghost: boolean; sheet_id: string};
  const plates: Plate[] = [];
  const exitTags: {text: string; x: number; y: number; a: number}[] = [];
  for (const s of data.sheets) {
    const fan: Pose = {dx: s.fan.dx, dy: s.fan.dy, dz: s.fan.dz, rot: s.fan.rot};
    let pose = fan;
    let alpha = 1;
    let labelA = 0;
    if (s.rise !== null && s.level !== null) {
      const u = sp(s.rise, {damping: 14, stiffness: 50, mass: 1});
      const target: Pose = {dx: 0, dy: 0, dz: (s.level - 1) * storey, rot: 0};
      pose = {dx: lerp(fan.dx, target.dx, u), dy: lerp(fan.dy, target.dy, u), dz: lerp(fan.dz, target.dz, u), rot: lerp(fan.rot, target.rot, u)};
      labelA = clamp01((u - 0.55) / 0.3);
    } else if (s.exit !== null) {
      // away to the lower right, where the fan left them, clear of the stack
      const exitAt = s.exit;
      const u = sp(exitAt, {damping: 20, stiffness: 40, mass: 1});
      const target: Pose = {dx: 1500, dy: 640, dz: fan.dz, rot: fan.rot + 14};
      pose = {dx: lerp(fan.dx, target.dx, u), dy: lerp(fan.dy, target.dy, u), dz: fan.dz, rot: lerp(fan.rot, target.rot, u)};
      alpha = 1 - clamp01((u - 0.35) / 0.4);
      if (t >= exitAt && t < exitAt + SCENE4.exit.tagSeconds && s.not_counted) {
        // the tag takes a fixed slot beside the stack, so it can be read while the sheet goes
        const k = data.sheets.filter((x) => x.exit !== null && x.exit < exitAt).length;
        const [x, y] = SCENE4.exit.tagAt[Math.min(k, SCENE4.exit.tagAt.length - 1)];
        const a = Math.min(clamp01((t - exitAt) / 0.15), 1 - clamp01((t - exitAt - SCENE4.exit.tagSeconds + 0.3) / 0.3));
        exitTags.push({text: s.label, x, y, a});
      }
    }
    if (alpha <= 0) continue;
    plates.push({key: s.sheet_id, png: s.png, pose, alpha, label: s.counted ? s.label : null, labelA, ghost: false, sheet_id: s.sheet_id});
  }
  // the typical sheet's copies: rise from its plate to their floors
  const typical = data.sheets.find((s) => s.counted && s.floors.length > 1);
  if (typical && typical.level !== null) {
    for (const g of data.ghosts) {
      const u = sp(g.at, {damping: 15, stiffness: 70, mass: 1});
      if (u <= 0) continue;
      const pose: Pose = {dx: 0, dy: 0, dz: lerp((typical.level - 1) * storey, (g.level - 1) * storey, u), rot: 0};
      plates.push({key: `${g.sheet_id}@${g.floor}`, png: typical.png, pose, alpha: lerp(0.4, 0.86, clamp01(u)), label: g.label, labelA: clamp01((u - 0.7) / 0.25), ghost: true, sheet_id: g.sheet_id});
    }
  }

  // ---------- the pins ----------
  const lit = data.pins.filter((p) => t >= p.at);
  // each card's slot is fixed from the pin's position at the moment it lit (the orbit then moves the pin, not the card)
  const camAt = (at: number): Cam => {
    const cu0 = easeInOut(clamp01((at - SCENE4.camera.start) / (SCENE4.camera.end - SCENE4.camera.start)));
    const ou0 = easeOrbit(clamp01((at - SCENE4.orbit.start) / (SCENE4.orbit.settle - SCENE4.orbit.start)));
    return {tilt: SCENE4.camera.tiltDeg * cu0, orbit: lerp(SCENE4.orbit.fromDeg, SCENE4.orbit.toDeg, ou0) * cu0, zoom: lerp(SCENE4.fan.zoom, SCENE4.camera.zoom, cu0), cx: lerp(SCENE4.fan.centre[0], SCENE4.camera.centre[0], cu0), cy: lerp(SCENE4.fan.centre[1], SCENE4.camera.centre[1], cu0)};
  };
  const plateOf = (sid: string) => plates.find((p) => p.sheet_id === sid && !p.ghost);
  const ANCHOR = {u: W / 2 - 48, v: H / 2 - 36}; // the plate's front-right corner region, nearest the viewer
  const CARD = {h: 128, pad: 18};
  const col = SCENE4.pins.column;
  const slots: number[] = [];
  const cards = data.pins
    .map((p) => {
      const plate = plateOf(p.plates[0]);
      if (!plate) return null;
      const at0 = project(ANCHOR.u, ANCHOR.v, plate.pose, camAt(p.at));
      return {p, y0: at0.y - CARD.h / 2};
    })
    .filter((c): c is {p: Scene4Pin; y0: number} => c !== null)
    .sort((a, b) => a.y0 - b.y0)
    .map((c) => {
      let y = Math.max(40, Math.min(900 - CARD.h - 24, c.y0));
      for (const prev of slots) if (Math.abs(y - prev) < col.gap) y = prev + col.gap;
      slots.push(y);
      return {...c, y};
    });

  // ---------- the counter ----------
  const counterU = sp(SCENE4.counter.at, {damping: 13, stiffness: 160, mass: 1});

  return (
    <AbsoluteFill style={{background: FIELD, overflow: 'hidden'}}>
      {/* the dark field: a faint lift at the centre, as in scenes 1 and 2 */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, #15181d 0%, #0e1013 45%, #0b0c0f 80%)'}} />

      {/* the world: one container at the camera's centre; the plates are its children, sorted by depth */}
      <AbsoluteFill style={{perspective: P, perspectiveOrigin: `${cam.cx}px ${cam.cy}px`}}>
        <div style={{position: 'absolute', left: cam.cx, top: cam.cy, width: 0, height: 0, transformStyle: 'preserve-3d', transform: `scale3d(${cam.zoom}, ${cam.zoom}, ${cam.zoom}) rotateX(${cam.tilt}deg) rotateZ(${cam.orbit}deg)`}}>
          {plates.map((pl) => (
            <div
              key={pl.key}
              style={{
                position: 'absolute',
                left: -W / 2,
                top: -H / 2,
                width: W,
                height: H,
                transformOrigin: '50% 50%',
                transform: `translate3d(${pl.pose.dx}px, ${pl.pose.dy}px, ${pl.pose.dz}px) rotateZ(${pl.pose.rot}deg)`,
                opacity: pl.alpha,
                background: C.paper,
                outline: `1px solid ${pl.ghost ? 'rgba(36,87,255,0.55)' : 'rgba(29,32,38,0.45)'}`,
                overflow: 'hidden',
              }}
            >
              <Img src={staticFile(pl.png)} style={{position: 'absolute', inset: 0, width: W, height: H, mixBlendMode: 'multiply'}} />
            </div>
          ))}
        </div>
      </AbsoluteFill>

      {/* the plate outlines the pins light, and the leader lines, projected onto the screen */}
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        {lit.map((p) => {
          const age = t - p.at;
          const pulse = Math.exp(-age / 0.6);
          const hold = 0.55;
          return p.plates.map((sid) => {
            const plate = plateOf(sid);
            if (!plate) return null;
            const q = [project(-W / 2, -H / 2, plate.pose, cam), project(W / 2, -H / 2, plate.pose, cam), project(W / 2, H / 2, plate.pose, cam), project(-W / 2, H / 2, plate.pose, cam)];
            return <polygon key={`${p.check_id}-${sid}`} points={q.map((c) => `${c.x},${c.y}`).join(' ')} fill={C.cobalt} fillOpacity={0.12 * pulse} stroke={C.cobalt} strokeWidth={3} opacity={hold + (1 - hold) * pulse} />;
          });
        })}
        {cards.map(({p, y}) => {
          const plate = plateOf(p.plates[0]);
          if (!plate) return null;
          const dot = project(ANCHOR.u, ANCHOR.v, plate.pose, cam);
          const a = clamp01((t - p.at) / 0.2);
          const ring = 1 - clamp01((t - p.at) / 0.7);
          return (
            <g key={p.check_id} opacity={a}>
              <line x1={dot.x} y1={dot.y} x2={col.x - 14} y2={y + CARD.h / 2} stroke={C.cobalt} strokeWidth={2} opacity={0.75} />
              <circle cx={dot.x} cy={dot.y} r={8 + 26 * ring} fill="none" stroke={C.cobalt} strokeWidth={2} opacity={ring * 0.8} />
              <circle cx={dot.x} cy={dot.y} r={8} fill={C.cobalt} stroke={C.white} strokeWidth={2} />
            </g>
          );
        })}
      </svg>

      {/* the floor labels, at each plate's front-left corner */}
      {plates.map((pl) => {
        if (!pl.label || pl.labelA <= 0) return null;
        const c = project(-W / 2, H / 2, pl.pose, cam);
        // a copy's label sits a little lower on its corner, a sheet's a little higher, so RF and 20F clear each other
        return (
          <div key={`label-${pl.key}`} style={{position: 'absolute', left: c.x - 16 - 400, width: 400, top: c.y - (pl.ghost ? 10 : 25), textAlign: 'right', opacity: pl.labelA, transform: `translateX(${(1 - pl.labelA) * 10}px)`, fontFamily: FONT.mono, fontSize: 28, fontWeight: pl.ghost ? 400 : 600, color: pl.ghost ? C.mute : C.soft, whiteSpace: 'nowrap', letterSpacing: 0.5, textShadow: '0 2px 10px rgba(0,0,0,0.7)'}}>
            {pl.label}
          </div>
        );
      })}

      {/* the tags on the two sheets that leave: the Run's words */}
      {exitTags.map((g) => (
        <div key={g.text} style={{position: 'absolute', left: g.x, top: g.y, opacity: g.a, transform: `translateX(${(1 - g.a) * 10}px)`, padding: '8px 18px', borderLeft: `3px solid ${C.graphite}`, background: 'rgba(20,22,26,0.82)', borderRadius: '0 10px 10px 0', fontFamily: FONT.mono, fontSize: 28, lineHeight: '34px', fontWeight: 500, color: C.mute, whiteSpace: 'nowrap', letterSpacing: 0.5}}>
          {g.text}
        </div>
      ))}

      {/* the pin cards: the check id and its sheets, two lines in the check's own words */}
      {cards.map(({p, y}) => {
        const u = sp(p.at, {damping: 12, stiffness: 180});
        const a = clamp01((t - p.at) / 0.2);
        return (
          <div key={`card-${p.check_id}`} style={{position: 'absolute', left: col.x, top: y, maxWidth: col.maxWidth, opacity: a, transform: `translateX(${(1 - u) * 14}px)`, padding: `${CARD.pad - 4}px ${CARD.pad}px`, borderLeft: `3px solid ${C.cobalt}`, background: 'rgba(20,22,26,0.82)', borderRadius: '0 10px 10px 0', boxSizing: 'border-box'}}>
            <div style={{fontFamily: FONT.mono, fontSize: 28, lineHeight: '32px', color: C.cobaltLt, letterSpacing: 0.5, whiteSpace: 'nowrap'}}>{p.id_line}</div>
            <div style={{fontFamily: FONT.sans, fontSize: 32, lineHeight: '38px', fontWeight: 600, color: C.white, letterSpacing: -0.3, marginTop: 4, whiteSpace: 'nowrap'}}>{p.head}</div>
            <div style={{fontFamily: FONT.sans, fontSize: 28, lineHeight: '34px', fontWeight: 400, color: C.soft, letterSpacing: -0.2, marginTop: 2}}>{p.line}</div>
          </div>
        );
      })}

      {/* burned captions, bottom third, in scene 1's style */}
      <div style={{position: 'absolute', inset: 0, zIndex: 600}}>
        {SCENE4.captions.map((c) => (
          <Burn key={c.text} text={c.text} at={c.at} until={c.until} t={t} />
        ))}
        {/* the counter lands in the caption band: the Run's scoreboard, its numbers heavier than its words */}
        {counterU > 0 ? (
          <div style={{position: 'absolute', left: 120, right: 120, top: 920, textAlign: 'center', opacity: clamp01(counterU * 2), transform: `translateY(${(1 - Math.min(1, counterU)) * 14}px) scale(${lerp(1.06, 1, Math.min(1, counterU))})`, fontFamily: FONT.sans, fontSize: 54, fontWeight: 500, color: C.white, letterSpacing: -0.6, lineHeight: 1.2, textShadow: '0 2px 18px rgba(0,0,0,0.55)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'}}>
            {data.scoreboard.terms.map(([n, word], k) => (
              <span key={word}>
                {k > 0 ? <span style={{color: C.mute, padding: '0 14px'}}>·</span> : null}
                <span style={{fontWeight: 700}}>{n}</span> <span style={{color: C.soft}}>{word}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* sound: the effects track (no voice; the sheets and the pins carry it) */}
      <Audio src={staticFile('gen/scene4-sfx.wav')} volume={1} name="effects" />
    </AbsoluteFill>
  );
};
