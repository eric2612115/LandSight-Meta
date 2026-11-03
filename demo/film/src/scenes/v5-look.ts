/**
 * Film v5 looks: one parameter sets the stage, the light, the sheets, the accents and the cards. The materials are the
 * same real PBR set in every look (public/v5/textures, Poly Haven CC0); only the stage around them changes.
 * Brand: cobalt #2F5FE8 on light, #4D7CFF / #6D8DFF on dark; ink #1D2026; light #E8EAED. No beige anywhere.
 */
export type Look = 'white' | 'ink' | 'blueprint' | 'night';
export const LOOK_IDS: Look[] = ['white', 'ink', 'blueprint', 'night'];

export type LookSpec = {
  // the stage: a sky dome from `top` (overhead) to `horizon`; the ground fades into the horizon through the fog
  top: string; horizon: string; ground: string; grid: string; gridA: number; shadowA: number; fog: [number, number];
  // the light: an environment (a studio or a night HDRI), a soft sky, a key, a cool rim
  hdr: 'studio' | 'night'; env: number; hemiSky: string; hemiGround: string; hemi: number; key: string; keyI: number; rim: string; rimI: number; exposure: number;
  // the sheets: white paper (self-lit a little on a dark stage) or blueprint (white lines on blue)
  sheet: 'paper' | 'blueprint'; selfLit: number; blue: string; edge: string; edgeGlow: string | null;
  // accents in the scene; the line colour on the sheets; a halo on accents
  accent: string; accentLt: string; inkLine: string; glow: number;
  // the materials' tint (blueprint runs a little cooler); night: lit windows, garden lights
  matTint: string; foliageK: number; windows: number; garden: boolean;
  ui: {
    panel: string; border: string; shadow: string; text: string; sub: number; blur?: string; accent: string; dotGlow: boolean;
    cap: string; capText: string; capBorder: string; leader: string; veil: string; endText: string;
    logoBg: string; logo: 'dark' | 'light'; rasterBg: string; typeBg: string; typeText: string; plan: 'paper' | 'blueprint'; planBg: string; bigVeil: string;
  };
};

const INK = '#1D2026';
const LIGHT = '#E8EAED';

export const LOOKS: Record<Look, LookSpec> = {
  white: {
    top: '#FFFFFF', horizon: '#F5F6F8', ground: '#F5F6F8', grid: '#DADDE3', gridA: 0.0, shadowA: 0.2, fog: [320, 720],
    hdr: 'studio', env: 0.6, hemiSky: '#ffffff', hemiGround: '#e6e8ec', hemi: 1.05, key: '#ffffff', keyI: 1.7, rim: '#dce6ff', rimI: 0.45, exposure: 1.0,
    sheet: 'paper', selfLit: 0.1, blue: '#1D46C8', edge: '#e2e5ea', edgeGlow: null,
    accent: '#2F5FE8', accentLt: '#5B82F0', inkLine: INK, glow: 0,
    matTint: '#ffffff', foliageK: 1, windows: 0, garden: false,
    ui: {
      panel: '#FFFFFF', border: `1.5px solid ${LIGHT}`, shadow: '0 14px 40px rgba(29,32,38,0.16)', text: INK, sub: 0.7, accent: '#2F5FE8', dotGlow: false,
      cap: 'rgba(255,255,255,0.96)', capText: INK, capBorder: `1.5px solid ${LIGHT}`, leader: INK,
      veil: 'linear-gradient(90deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.9) 46%, rgba(255,255,255,0) 80%)', endText: INK,
      logoBg: '#FFFFFF', logo: 'light', rasterBg: '#FFFFFF', typeBg: '#FFFFFF', typeText: INK, plan: 'paper', planBg: '#FFFFFF', bigVeil: 'rgba(255,255,255,0.84)',
    },
  },
  ink: {
    top: '#0D1016', horizon: '#151922', ground: '#11141B', grid: '#4D7CFF', gridA: 0.26, shadowA: 0.6, fog: [200, 640],
    hdr: 'studio', env: 0.5, hemiSky: '#9fb0d6', hemiGround: '#141820', hemi: 0.6, key: '#fff6ec', keyI: 2.0, rim: '#7d9dff', rimI: 1.3, exposure: 1.0,
    sheet: 'paper', selfLit: 0.42, blue: '#1D46C8', edge: '#d3d8e0', edgeGlow: '#4D7CFF',
    accent: '#4D7CFF', accentLt: '#6D8DFF', inkLine: INK, glow: 1,
    matTint: '#ffffff', foliageK: 1, windows: 0, garden: false,
    ui: {
      panel: 'rgba(21,25,34,0.93)', border: '1.5px solid rgba(232,234,237,0.26)', shadow: '0 18px 50px rgba(0,0,0,0.55)', text: '#FFFFFF', sub: 0.74, accent: '#4D7CFF', dotGlow: true,
      cap: 'rgba(13,16,22,0.86)', capText: '#FFFFFF', capBorder: '1.5px solid rgba(232,234,237,0.22)', leader: LIGHT,
      veil: 'linear-gradient(90deg, rgba(13,16,22,0.95) 0%, rgba(13,16,22,0.86) 46%, rgba(13,16,22,0) 80%)', endText: LIGHT,
      logoBg: '#0D1016', logo: 'dark', rasterBg: '#0D1016', typeBg: '#000000', typeText: '#FFFFFF', plan: 'paper', planBg: '#FFFFFF', bigVeil: 'rgba(8,9,12,0.66)',
    },
  },
  blueprint: {
    top: '#071A5C', horizon: '#0E2A8A', ground: '#0C2580', grid: '#FFFFFF', gridA: 0.14, shadowA: 0.5, fog: [220, 660],
    hdr: 'studio', env: 0.45, hemiSky: '#cdd9ff', hemiGround: '#0a1d66', hemi: 0.75, key: '#f4f7ff', keyI: 1.7, rim: '#a9bdff', rimI: 1.0, exposure: 1.0,
    sheet: 'blueprint', selfLit: 0.38, blue: '#1B47CC', edge: '#e4ebff', edgeGlow: '#ffffff',
    accent: '#FFFFFF', accentLt: '#8FA9FF', inkLine: '#FFFFFF', glow: 0.7,
    matTint: '#e2eaff', foliageK: 0.92, windows: 0, garden: false,
    ui: {
      panel: 'rgba(255,255,255,0.14)', border: '1.5px solid rgba(255,255,255,0.5)', shadow: '0 18px 50px rgba(3,10,40,0.45)', text: '#FFFFFF', sub: 0.8, blur: 'blur(16px)', accent: '#FFFFFF', dotGlow: false,
      cap: 'rgba(255,255,255,0.16)', capText: '#FFFFFF', capBorder: '1.5px solid rgba(255,255,255,0.45)', leader: '#FFFFFF',
      veil: 'linear-gradient(90deg, rgba(7,26,92,0.95) 0%, rgba(7,26,92,0.86) 46%, rgba(7,26,92,0) 80%)', endText: '#FFFFFF',
      logoBg: '#071A5C', logo: 'dark', rasterBg: '#071A5C', typeBg: '#071A5C', typeText: '#FFFFFF', plan: 'blueprint', planBg: '#1B47CC', bigVeil: 'rgba(7,26,92,0.72)',
    },
  },
  night: {
    top: '#06080C', horizon: '#0D1016', ground: '#0A0C11', grid: '#4D7CFF', gridA: 0.1, shadowA: 0.55, fog: [180, 600],
    hdr: 'night', env: 0.9, hemiSky: '#3b4c78', hemiGround: '#0a0c10', hemi: 0.42, key: '#a9bce8', keyI: 0.55, rim: '#6d8dff', rimI: 0.7, exposure: 1.05,
    sheet: 'paper', selfLit: 0.26, blue: '#1D46C8', edge: '#9aa3b2', edgeGlow: null,
    accent: '#6D8DFF', accentLt: '#4D7CFF', inkLine: INK, glow: 1,
    matTint: '#ffffff', foliageK: 0.8, windows: 1, garden: true,
    ui: {
      panel: 'rgba(14,16,22,0.92)', border: '1.5px solid rgba(232,234,237,0.2)', shadow: '0 18px 50px rgba(0,0,0,0.6)', text: '#FFFFFF', sub: 0.74, accent: '#6D8DFF', dotGlow: true,
      cap: 'rgba(10,12,16,0.86)', capText: '#FFFFFF', capBorder: '1.5px solid rgba(232,234,237,0.18)', leader: LIGHT,
      veil: 'linear-gradient(90deg, rgba(8,10,14,0.95) 0%, rgba(8,10,14,0.84) 46%, rgba(8,10,14,0) 80%)', endText: LIGHT,
      logoBg: '#06080C', logo: 'dark', rasterBg: '#0D1016', typeBg: '#000000', typeText: '#FFFFFF', plan: 'paper', planBg: '#FFFFFF', bigVeil: 'rgba(8,9,12,0.66)',
    },
  },
};
