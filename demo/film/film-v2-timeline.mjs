/**
 * Writes audio/voice-v2/timeline.json: what the sound of the v2 film is placed on (film seconds), read by
 * scripts/voice-v2.py (the lines), scripts/audio-v2.py (the mix): the narration lines and their windows, Eric's opening,
 * the capture's clicks as they land in the cut, the big-type cards and the big transitions.
 *
 *   node film-v2-timeline.mjs
 */
import {writeFileSync, readFileSync} from 'node:fs';
import {B, B_OFFSET, BIG, CAP, CLICK_NAMES, CLOSE_AT, END, LIVE, LOGO_AT, PART2_AT, PUSH, SEGMENTS, V2, capToFilm} from './src/scenes/film-v2-cues.js';

const cues = JSON.parse(readFileSync('src/scenes/try-v2-cues.json', 'utf8')).cues;
const inCut = (tc) => SEGMENTS.some(([f, t]) => tc >= f && tc <= t);
const clicks = cues.filter((c) => c.name === 'click' && inCut(c.t)).map((c) => +capToFilm(c.t).toFixed(3));
const lines = V2.voice.filter((v) => !v.spans).map((v) => ({n: v.n, text: v.text, at: +v.at.toFixed(3), pictureUntil: v.pictureUntil ? +v.pictureUntil.toFixed(3) : null}));
const out = {
  duration: +V2.duration.toFixed(3),
  eric: {at: 0, from: B_OFFSET, until: LIVE[2].end},
  lines,
  clicks,
  type: {at: B.type, cut: PART2_AT},
  big: BIG.map((b) => +b.at.toFixed(3)),
  push: {warp: PUSH.warp, land: B.land, pull: B.pull, stack: 16.0},
  raster: [B.raster, B.bills],
  close: +CLOSE_AT.toFixed(3),
  logo: +LOGO_AT.toFixed(3),
  part2: PART2_AT,
  segments: SEGMENTS.map(([f, t]) => [+f.toFixed(3), +t.toFixed(3)]),
  names: CLICK_NAMES,
};
writeFileSync('audio/voice-v2/timeline.json', JSON.stringify(out, null, 1) + '\n');
console.log('timeline:', out.duration, 's ·', lines.length, 'lines ·', clicks.length, 'clicks');
