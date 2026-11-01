import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

const inter = loadInter('normal', {weights: ['300', '400', '500', '600', '700'], subsets: ['latin']});
const mono = loadMono('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin']});

export const FONT = {sans: inter.fontFamily, mono: mono.fontFamily};

/** demo/DESIGN.md: one colour per source; the app's chrome and paper. */
export const C = {
  chrome: '#14161a',
  chrome2: '#1a1d22',
  line: '#2b3038',
  mute: '#8a919c',
  soft: '#c3c8cf',
  white: '#e8eaed',
  paper: '#f7f5f0',
  ink: '#1d2026',
  graphite: '#3a3f47',
  graphiteLt: '#b5bcc6',
  cobalt: '#2457ff',
  cobaltLt: '#6d8dff',
  violet: '#7a3cff',
  violetLt: '#a684ff',
  amber: '#f0a500',
  green: '#1f9d55',
  greenLt: '#3ccf7f',
  red: '#e5484d',
  redInk: '#d92d20',
};

/** The kicker of a caption takes the colour of the source it names. */
export function sourceColour(kicker: string): string {
  if (/spark/i.test(kicker)) return C.cobaltLt;
  if (/sam/i.test(kicker)) return C.violetLt;
  if (/geometry|routing/i.test(kicker)) return C.graphiteLt;
  if (/rule|answer key|title block|prices/i.test(kicker)) return C.amber;
  return C.soft;
}
