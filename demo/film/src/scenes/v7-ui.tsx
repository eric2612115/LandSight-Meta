import {AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, staticFile} from 'remotion';
import {C, FONT} from '../theme';

/** Shared pieces of film v7 (demo/SCRIPT-V7.md, Rules): the type card, the glass card, the live-shot slot. */
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const ease = Easing.inOut(Easing.cubic);
export const easeOut = Easing.out(Easing.cubic);
/** 0 → 1 over [a, b] with the cubic ease; clamped. */
export const over = (t: number, a: number, b: number, fn: (u: number) => number = ease) => fn(clamp01((t - a) / (b - a)));
export const FIELD = '#0b0c0f';
export const FPS = 60;

/** A type card: Inter Display-weight, 104 px at the 1080 base, ≤ 7 words, 6-frame fade + 12 px rise, one at a time. */
export const TypeCard: React.FC<{text: string; at: number; until: number; t: number; place?: 'centre' | 'low'; size?: number; colour?: string; scrim?: boolean}> = ({text, at, until, t, place = 'low', size = 104, colour = C.white, scrim = true}) => {
  if (t < at || t > until) return null;
  const inA = clamp01((t - at) / (6 / FPS));
  const outA = clamp01((until - t) / (8 / FPS));
  const a = Math.min(inA, outA);
  const rise = (1 - easeOut(inA)) * 12;
  const style: React.CSSProperties =
    place === 'centre'
      ? {position: 'absolute', left: 120, right: 120, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}
      : {position: 'absolute', left: 120, right: 120, bottom: 86, textAlign: 'center'};
  return (
    <div style={{...style, opacity: a, transform: `translateY(${rise}px)`, pointerEvents: 'none'}}>
      {/* a scrim so the card reads on paper and on the grid alike: radial behind a centred card, a bottom gradient under a low one */}
      {scrim && place === 'centre' ? <div style={{position: 'absolute', inset: -200, background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.5) 35%, rgba(0,0,0,0) 70%)'}} /> : null}
      {scrim && place === 'low' ? <div style={{position: 'absolute', left: -120, right: -120, top: -200, bottom: -86, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.62) 100%)'}} /> : null}
      <div style={{position: 'relative', fontFamily: FONT.sans, fontSize: size, fontWeight: 600, letterSpacing: -size * 0.028, lineHeight: 1.04, color: colour, textShadow: '0 4px 40px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.5)', textWrap: 'balance'} as React.CSSProperties}>{text}</div>
    </div>
  );
};

export type Dot = 'red' | 'amber' | 'cobalt' | 'green' | 'violet';
const DOT: Record<Dot, string> = {red: C.red, amber: C.amber, cobalt: C.cobaltLt, green: C.greenLt, violet: C.violetLt};

/** The Ambi glass card: radius 28, white 10 %, blur 24, 1.5 px border white 22 %, soft shadow; a coloured dot, title 34 semibold, sub 26 at 70 %. */
export const GlassCard: React.FC<{dot: Dot; title: string; sub?: string; x?: number; y?: number; width?: number; a?: number; rise?: number; tone?: 'light' | 'dark'; inline?: boolean; children?: React.ReactNode}> = ({dot, title, sub, x = 0, y = 0, width = 640, a = 1, rise = 0, tone = 'light', inline = false, children}) => (
  <div
    style={{
      position: inline ? 'relative' : 'absolute',
      left: inline ? undefined : x,
      top: inline ? undefined : y,
      width,
      opacity: a,
      transform: `translateY(${rise}px)`,
      borderRadius: 28,
      background: tone === 'dark' ? 'rgba(20,22,26,0.78)' : 'rgba(255,255,255,0.10)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1.5px solid rgba(255,255,255,0.22)',
      boxShadow: '0 24px 60px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
      padding: '26px 30px 26px 30px',
      fontFamily: FONT.sans,
      color: C.white,
    }}
  >
    <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
      <div style={{width: 16, height: 16, borderRadius: 8, background: DOT[dot], boxShadow: `0 0 18px ${DOT[dot]}`, flex: 'none'}} />
      <div style={{fontSize: 34, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1.2}}>{title}</div>
    </div>
    {sub ? <div style={{marginTop: 10, marginLeft: 32, fontSize: 26, fontWeight: 400, lineHeight: 1.35, opacity: 0.7}}>{sub}</div> : null}
    {children}
  </div>
);

/** A row of the glass side panel: dot, text, money. */
export const GlassRow: React.FC<{dot: Dot; text: string; money?: string; a: number}> = ({dot, text, money, a}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0', borderTop: '1px solid rgba(255,255,255,0.12)', opacity: a, transform: `translateX(${(1 - a) * 18}px)`}}>
    <div style={{width: 14, height: 14, borderRadius: 7, background: DOT[dot], boxShadow: `0 0 14px ${DOT[dot]}`, flex: 'none'}} />
    <div style={{fontSize: 28, fontWeight: 500, flex: 1, lineHeight: 1.25}}>{text}</div>
    {money ? <div style={{fontSize: 28, fontWeight: 600, fontVariantNumeric: 'tabular-nums', opacity: 0.9}}>{money}</div> : null}
  </div>
);

export type LiveClips = {L1?: string | null; L2?: string | null; L3?: string | null};
const SLOT_TEXT: Record<'L1' | 'L2' | 'L3', [string, string]> = {
  L1: ['LIVE L1 · overhead', 'hands flip printed A3 sheets · a highlighter stops on a row · phone 4K 60 fps'],
  L2: ['LIVE L2 · side angle', 'a thick stack of printed drawings dropped on the desk'],
  L3: ['LIVE L3 · medium close-up', 'window light, to the lens: “Here’s the real product.” · his own audio'],
};

/**
 * A live-shot slot: Eric's clip (public/<clip>, via `live.L1` etc.) under a warm grade, or until he shoots it a
 * placeholder still carrying the slot's name and the shot. Cards are positioned over it by the caller.
 */
export const LiveSlot: React.FC<{slot: 'L1' | 'L2' | 'L3'; clip?: string | null; a: number; startFrom?: number}> = ({slot, clip, a, startFrom = 0}) => {
  const [name, shot] = SLOT_TEXT[slot];
  return (
    <AbsoluteFill style={{opacity: a}}>
      {clip ? (
        <>
          <OffthreadVideo src={clip.startsWith('http') ? clip : staticFile(clip)} startFrom={startFrom} muted style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.22) saturate(1.12) contrast(1.06) brightness(0.96)'}} />
          {/* the warm grade: a lamp-coloured lift on the highlights, a cool crush in the shadows, a soft vignette */}
          <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(255,170,90,0.10), rgba(255,140,60,0.04) 50%, rgba(20,10,40,0.18))', mixBlendMode: 'soft-light'}} />
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.45) 100%)'}} />
        </>
      ) : (
        <>
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at 42% 38%, #5a3a1f 0%, #2a1a10 38%, #110a06 75%, #080503 100%)'}} />
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at 42% 38%, rgba(255,190,110,0.22) 0%, rgba(255,160,80,0) 45%)'}} />
          <div style={{position: 'absolute', left: 120, top: 560, fontFamily: FONT.mono, color: 'rgba(255,225,190,0.9)'}}>
            <div style={{fontSize: 44, fontWeight: 600, letterSpacing: 1}}>{name}</div>
            <div style={{fontSize: 24, marginTop: 12, opacity: 0.6, maxWidth: 900, lineHeight: 1.4}}>{shot}</div>
            <div style={{fontSize: 20, marginTop: 18, opacity: 0.4}}>placeholder · the clip drops in with props.live.{slot}</div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

/** A sheet render as paper: white, a hairline, a soft shadow. */
export const Paper: React.FC<{src: string; width: number; style?: React.CSSProperties}> = ({src, width, style}) => (
  <div style={{position: 'absolute', width, aspectRatio: '2100 / 1140', background: '#fff', boxShadow: '0 18px 50px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)', overflow: 'hidden', ...style}}>
    <Img src={src} style={{width: '100%', height: '100%', display: 'block'}} />
  </div>
);

/** A number with thousands separators. */
export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const fmt1 = (n: number) => n.toFixed(1);
