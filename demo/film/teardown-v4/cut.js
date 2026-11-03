// The two stretches of the film the simulator records (film seconds), on frame boundaries at 60 fps: Part 1 from the
// push to Part 2, and the end from the close to just past the logo's veil. capture.mjs --from/--to and FilmV4 read these.
import {B, CLOSE_AT, LOGO_AT, PART2_AT} from '../src/scenes/film-v2-cues.js';

export const FPS = 60;
const f = (t) => Math.round(t * FPS) / FPS;
export const CUT = {part1: [f(B.push), f(PART2_AT)], end: [Math.floor(CLOSE_AT * FPS) / FPS, f(LOGO_AT + 0.1)]};
