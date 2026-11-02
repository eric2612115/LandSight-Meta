import {AbsoluteFill, Audio, Easing, interpolate, interpolateColors, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {Sheet} from '../ui/Sheet';
import {Burn} from './Scene1Tree';
import {SCENE2} from './scene2-cues.js';

/**
 * Scene 2, "The folder bursts" (9 s, 1920 × 1080, 30 fps). A folder slides in from the left edge of the dark field
 * and tips; the thirty real file names of the recorded Run (public/data/scene2.json, from frontend-mock/run.json
 * files[], plus the one zip member) pour out as cards with a little physics and scatter in the Open screen's five
 * groups. One cobalt scan line sweeps left to right; as it crosses a card the card is stamped with its verdict in
 * the product's own words (the Open screen's mapping) with a clack; the four "Not read" files grey and sink; the
 * four bills slide into one stack and only the newest, "bill · governs", stays lit. The survivors converge and fold
 * into one sheet, which becomes the real L-1 (Rev B).
 */
export type Scene2Card = {
  i: number;
  file_id: string;
  name: string;
  ext: string;
  parent: string | null;
  verdict: string;
  text: string;
  strong: boolean;
  reason: string;
  decided_by: string;
  group: 'drawings' | 'bills' | 'docs' | 'sets' | 'unread';
  junk: boolean;
  bill: boolean;
  governs: boolean;
  w: number;
  h: number;
  rot: number;
  x: number;
  y: number;
  row: number;
  pour: number;
  stamp: number;
  sink: number | null;
};
export type Scene2Data = {
  package: {name: string; file_count: number; run_id: string};
  layout: {rows: number; pitch: number; fontPx: number};
  stack: {at: number; top: number; under: number[]};
  cards: Scene2Card[];
  sheet: {svg: string; viewBox: number[]; id: string; source: string};
};
export type Scene2Props = {data?: Scene2Data};

const FIELD = '#0b0c0f';
const CARD_BG = '#1a1d22';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const easeOut = Easing.out(Easing.cubic);
const easeIn = Easing.in(Easing.quad);
const easeInOut = Easing.inOut(Easing.cubic);
const hash = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const CENTRE = {x: 960, y: 520};
const FOLDER = {left: 150, top: 440, w: 300, h: 220, tip: 68};

export const Scene2Folder: React.FC<Scene2Props> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  if (!data) return <AbsoluteFill style={{background: FIELD}} />;
  const F = (s: number) => Math.round(s * fps);
  const sp = (at: number, config: {damping: number; stiffness: number; mass?: number}) => (frame < F(at) ? 0 : spring({frame: frame - F(at), fps, config}));

  // ---------- the folder ----------
  const slideIn = sp(SCENE2.folder.in, {damping: 18, stiffness: 60});
  const tip = sp(SCENE2.folder.tipStart, {damping: 11, stiffness: 120});
  const folderX = lerp(-FOLDER.w - 80, FOLDER.left, slideIn);
  const folderA = 1 - clamp01((t - SCENE2.folder.fadeStart) / (SCENE2.folder.fadeEnd - SCENE2.folder.fadeStart));
  const [mx, my] = SCENE2.folder.mouth;

  // ---------- the scan line ----------
  const xs = interpolate(t, [SCENE2.sweep.start, SCENE2.sweep.end], [SCENE2.sweep.x0, SCENE2.sweep.x1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scanA = Math.min(clamp01((t - SCENE2.sweep.start) / 0.15), 1 - clamp01((t - SCENE2.sweep.end) / 0.25));

  // ---------- the stack: where the three earlier bills end up, under the one that governs ----------
  const top = data.cards[data.stack.top];
  const stackU = easeInOut(clamp01((t - data.stack.at) / SCENE2.stack.seconds));

  // ---------- the sheet ----------
  const [, , vw, vh] = data.sheet.viewBox;
  const sheetW = SCENE2.sheet.width;
  const sheetH = (sheetW * vh) / vw;
  const grow = easeOut(clamp01((t - SCENE2.sheet.start) / (SCENE2.sheet.grown - SCENE2.sheet.start)));
  const sheetScale = lerp(0.18, 1, grow);
  const sheetA = clamp01((t - SCENE2.sheet.start) / 0.12);
  const inkA = clamp01((t - SCENE2.sheet.inkStart) / (SCENE2.sheet.inkEnd - SCENE2.sheet.inkStart));

  return (
    <AbsoluteFill style={{background: FIELD, overflow: 'hidden'}}>
      {/* the dark field: a faint lift at the centre, as in scene 1 */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, #15181d 0%, #0e1013 45%, #0b0c0f 80%)'}} />

      {/* the folder: slides in on a spring, tips about its bottom-right corner, fades once the pour is done */}
      {folderA > 0 ? (
        <div style={{position: 'absolute', left: folderX, top: FOLDER.top, width: FOLDER.w, height: FOLDER.h, opacity: folderA, transformOrigin: '100% 100%', transform: `rotate(${FOLDER.tip * tip}deg)`}}>
          <svg width={FOLDER.w} height={FOLDER.h} viewBox={`0 0 ${FOLDER.w} ${FOLDER.h}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            {/* back */}
            <path d={`M8 34 Q8 22 20 22 H112 Q124 22 132 34 L140 46 H280 Q292 46 292 58 V200 Q292 212 280 212 H20 Q8 212 8 200 Z`} fill="#22262d" stroke={C.graphiteLt} strokeWidth={2} />
            {/* front, a shade lighter, so the mouth reads */}
            <path d={`M4 78 Q4 66 16 66 H284 Q296 66 296 78 V200 Q296 212 284 212 H16 Q4 212 4 200 Z`} fill="#2b3038" stroke={C.graphiteLt} strokeWidth={2} />
          </svg>
          <div style={{position: 'absolute', left: 0, right: 0, top: 118, textAlign: 'center', fontFamily: FONT.sans, fontSize: 26, fontWeight: 600, color: C.soft, letterSpacing: -0.2}}>Landscape Package</div>
          <div style={{position: 'absolute', left: 0, right: 0, top: 154, textAlign: 'center', fontFamily: FONT.mono, fontSize: 22, color: C.mute}}>{data.package.file_count} files</div>
        </div>
      ) : null}

      {/* the cards */}
      {data.cards.map((c) => {
        // the pour: a spring from the folder's mouth to the card's place, on a toss arc, turning as it flies
        const p = sp(c.pour, {damping: 14, stiffness: 90, mass: 1});
        if (p <= 0) return null;
        const pu = clamp01(p);
        const arcH = 90 + 170 * hash(c.i, 11);
        let x = lerp(mx + (hash(c.i, 12) - 0.5) * 40 - c.w / 2, c.x, p);
        let y = lerp(my + (hash(c.i, 13) - 0.5) * 30 - c.h / 2, c.y, p) - arcH * Math.sin(Math.PI * pu);
        let rot = lerp((hash(c.i, 14) - 0.5) * 50, c.rot, p);
        let scale = lerp(0.6, 1, pu);
        let alpha = clamp01(p * 5);
        let z = 10 + c.i;

        // the stamp: the verdict scales in as the scan line crosses the card's centre; the reason gives way to it
        const stamped = t >= c.stamp;
        const st = sp(c.stamp, {damping: 10, stiffness: 260});
        const stampScale = stamped ? lerp(1.35, 1, st) : 1.35;
        const stampA = stamped ? clamp01((frame - F(c.stamp) + 1) / 2) : 0;
        const reasonA = stamped ? 1 - clamp01((frame - F(c.stamp) + 1) / 3) : 1;
        const flash = stamped ? Math.exp(-(t - c.stamp) / 0.18) : 0;
        const pulse = c.governs ? Math.sin(Math.PI * clamp01((t - SCENE2.pulse) / 0.7)) : 0;

        // the junk: greys and sinks a beat after its stamp
        let grey = 0;
        if (c.sink !== null && t >= c.sink) {
          const q = clamp01((t - c.sink) / SCENE2.sink.seconds);
          grey = clamp01((t - c.sink) / 0.3);
          // gone before it reaches the caption band
          y += 520 * easeIn(q);
          rot += (hash(c.i, 15) - 0.5) * 30 * q;
          alpha *= 1 - clamp01(q / 0.45);
        }

        // the bills: the three earlier ones slide under the one that governs
        const under = data.stack.under.indexOf(c.i);
        if (under >= 0 && stackU > 0) {
          const k = under + 1;
          x = lerp(x, top.x + 10 * k, stackU);
          y = lerp(y, top.y + 9 * k, stackU);
          rot = lerp(rot, top.rot, stackU);
          alpha *= 1 - 0.5 * stackU;
          z = 100 - k;
        }
        if (c.i === data.stack.top) z = 100;

        // the survivors converge on the centre and fold into the sheet
        if (!c.junk) {
          const at = SCENE2.converge.start + SCENE2.converge.spread * hash(c.i, 16);
          const v = sp(at, {damping: 20, stiffness: 70});
          if (v > 0) {
            const vu = clamp01(v);
            const tx = CENTRE.x - (c.w * 0.3) / 2 + (hash(c.i, 17) - 0.5) * 60;
            const ty = CENTRE.y - (c.h * 0.3) / 2 + (hash(c.i, 18) - 0.5) * 40;
            x = lerp(x, tx, v);
            y = lerp(y, ty, v);
            rot = lerp(rot, 0, vu);
            scale = lerp(scale, 0.3, vu);
            alpha *= 1 - clamp01((vu - 0.6) / 0.35);
          }
        }
        if (alpha <= 0) return null;

        const border = interpolateColors(Math.max(flash, 0.9 * pulse), [0, 1], [grey > 0 ? interpolateColors(grey, [0, 1], [C.line, '#22252b']) : C.line, C.cobalt]);
        const nameCol = interpolateColors(grey, [0, 1], [C.white, C.mute]);
        const stampCol = c.junk ? interpolateColors(grey, [0, 1], [C.soft, '#6b7280']) : c.strong ? C.cobaltLt : C.soft;
        const stampBorder = c.junk ? 'transparent' : c.strong ? C.cobalt : 'transparent';
        const glow = pulse > 0 ? `0 0 ${34 * pulse}px rgba(36,87,255,${0.55 * pulse})` : flash > 0.02 ? `0 0 ${20 * flash}px rgba(36,87,255,${0.35 * flash})` : '0 10px 30px rgba(0,0,0,0.45)';
        return (
          <div
            key={c.file_id}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: c.w,
              height: c.h,
              zIndex: z,
              opacity: alpha,
              transform: `rotate(${rot}deg) scale(${scale})`,
              transformOrigin: '50% 50%',
              background: CARD_BG,
              border: `1.5px solid ${border}`,
              borderRadius: 12,
              boxShadow: glow,
              padding: '8px 14px',
              boxSizing: 'border-box',
              overflow: 'visible',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{fontFamily: FONT.sans, fontSize: data.layout.fontPx, fontWeight: 500, lineHeight: '30px', color: nameCol, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis'}}>{c.name}</div>
            <div style={{position: 'relative', height: 30}}>
              {/* what was read, until the verdict lands */}
              {reasonA > 0 ? (
                <div style={{position: 'absolute', left: 0, right: 0, top: 0, opacity: reasonA * 0.9, fontFamily: FONT.sans, fontSize: 22, lineHeight: '30px', color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis'}}>{c.reason}</div>
              ) : null}
              {/* the verdict, in the product's words, stamped */}
              {stampA > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: -6,
                    top: 0,
                    opacity: stampA,
                    transform: `scale(${stampScale}) rotate(${c.strong ? -1.5 : 0}deg)`,
                    transformOrigin: '12% 50%',
                    fontFamily: FONT.sans,
                    fontSize: data.layout.fontPx,
                    fontWeight: 600,
                    lineHeight: '26px',
                    color: stampCol,
                    padding: '1px 6px',
                    border: `1.5px solid ${stampBorder}`,
                    borderRadius: 7,
                  }}
                >
                  {c.text}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* the scan line */}
      {scanA > 0 ? <div style={{position: 'absolute', left: xs - 1.5, top: 0, width: 3, height: 1080, zIndex: 500, background: C.cobalt, opacity: scanA, boxShadow: `0 0 28px 4px rgba(36,87,255,0.55)`}} /> : null}

      {/* the sheet: a paper silhouette grows at the centre, then the real L-1 (Rev B) fades up on it */}
      {sheetA > 0 ? (
        <div style={{position: 'absolute', left: CENTRE.x - sheetW / 2, top: CENTRE.y - sheetH / 2, width: sheetW, height: sheetH, zIndex: 400, opacity: sheetA, transform: `scale(${sheetScale})`, transformOrigin: '50% 50%', background: C.paper, boxShadow: '0 30px 90px rgba(0,0,0,0.65)', overflow: 'hidden'}}>
          {inkA > 0 ? (
            <div style={{position: 'absolute', inset: 0, opacity: inkA}}>
              <Sheet svg={data.sheet.svg} viewBox={data.sheet.viewBox} width={sheetW} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* burned captions, bottom third, in scene 1's style */}
      <div style={{position: 'absolute', inset: 0, zIndex: 600}}>
        {SCENE2.captions.map((c) => (
          <Burn key={c.text} text={c.text} at={c.at} until={c.until} t={t} />
        ))}
      </div>

      {/* sound: the effects track (no voice in this prototype; the cards carry it) */}
      <Audio src={staticFile('gen/scene2-sfx.wav')} volume={1} name="effects" />
    </AbsoluteFill>
  );
};
