/**
 * Film v6: one hybrid look. Part 1 by day (a white, decisive stage; a low sun; a cloudy sky HDRI in the glass), the end at
 * night (a deep blue sky; rooms lit at random; uplights, garden lights, a subtle bloom). The cards are V2's dark ink
 * cards in both, with brand cobalt (#2F5FE8 on light, #4D7CFF on dark).
 */
import {LOOKS} from './v5-look';
import type {LookSpec} from './v5-look';

export type V6Spec = LookSpec & {sun: string; sunI: number; sunDir: [number, number, number]; bloom: number; sky: string; gain: number; warm?: string};

const INK = '#1D2026';
const UI: LookSpec['ui'] = {
  ...LOOKS.ink.ui,
  panel: 'rgba(29,32,38,0.94)', border: '1.5px solid rgba(232,234,237,0.22)', shadow: '0 16px 44px rgba(10,12,16,0.32)', accent: '#4D7CFF', dotGlow: false,
  cap: 'rgba(22,25,31,0.95)', capText: '#FFFFFF', capBorder: '1.5px solid rgba(232,234,237,0.16)', leader: INK,
};

/** v6.2 by day: no dark pill cards. Anything left on a card or a label is a quiet white pill with ink text and a hairline. */
const UI_DAY: LookSpec['ui'] = {
  ...UI,
  panel: 'rgba(255,255,255,0.94)', border: '1px solid rgba(29,32,38,0.12)', shadow: 'none', text: INK, sub: 0.72, accent: '#2F5FE8',
  cap: 'rgba(255,255,255,0.9)', capText: INK, capBorder: '1px solid rgba(29,32,38,0.1)', leader: INK,
};

export const DAY: V6Spec = {
  ...LOOKS.white,
  // the stage is lifted above 1 (gain), so the sky stays white through the tone curve; v6.2: the ground is the
  // horizon's faint cool grey (no step where they meet), so the white L-1 sheet reads on it and the frame is never a void
  top: '#FFFFFF', horizon: '#949598', ground: '#949598', gridA: 0, shadowA: 0.3, fog: [260, 640],
  hdr: 'studio', env: 1.0, hemiSky: '#ffffff', hemiGround: '#e9ebef', hemi: 0.75, key: '#fff8ef', keyI: 0, rim: '#dfe8ff', rimI: 0.25, exposure: 1.0,
  selfLit: 0.45, accent: '#2F5FE8', accentLt: '#5B82F0',
  // v6.2: a high sun (about 58°) from the front left: soft, short shadows, no long wedge across the stage
  sun: '#fff6ea', sunI: 2.4, sunDir: [-0.4, 0.85, 0.35], bloom: 0, sky: 'day', gain: 2.5,
  ui: UI_DAY,
};

export const NIGHT: V6Spec = {
  ...LOOKS.night,
  // v6.3: blue hour (deep blue overhead to a faint warm horizon) over a dark, wet ground; no grid, no white plinth
  top: '#061233', horizon: '#1E2F63', warm: '#8A6C76', ground: '#04060B', grid: '#4D7CFF', gridA: 0, shadowA: 0.5, fog: [420, 1150],
  hdr: 'night', env: 0.55, hemiSky: '#2a3f78', hemiGround: '#070b16', hemi: 0.45, key: '#9fb4ec', keyI: 0, rim: '#5d7fe0', rimI: 0.55, exposure: 1.0,
  selfLit: 0.22, accent: '#4D7CFF', accentLt: '#6D8DFF', windows: 1, garden: true,
  sun: '#a8bcf0', sunI: 0.45, sunDir: [0.5, 0.75, 0.45], bloom: 0.4, sky: 'night', gain: 1,
  ui: {...UI, leader: '#E8EAED'},
};
