// The opening push lands here: L-6's drawn border on screen (px of 1920 × 1080) when the push lands (B.land), and the
// top-down camera over the sheet that puts it there. Pure numbers, shared by the simulator and FilmV4 (Remotion).
import l6 from '../src/scenes/l6-border.json' with {type: 'json'};

/** One lens for the whole film: vertical field of view, degrees. */
export const FOV = 30;
const [bx0, by0, bx1, by1] = l6.border;
/** The L-6 sheet in metres (83.2 m wide like the other sheets of its frame), at its drawing's aspect. */
export const L6 = {w: 83.2, h: (83.2 * l6.h) / l6.w};
const bw = (bx1 - bx0) * L6.w;
const bh = (by1 - by0) * L6.h;
const W = 1700;
const H = (W * bh) / bw;
/** TL, TR, BR, BL of the drawn border on screen at the landing. */
export const LAND_QUAD = [[960 - W / 2, 540 - H / 2], [960 + W / 2, 540 - H / 2], [960 + W / 2, 540 + H / 2], [960 - W / 2, 540 + H / 2]];
/** Camera height over the sheet: the visible width at distance D is 2 D tan(fov / 2) × 16 / 9. */
export const LAND_D = bw / (2 * Math.tan((FOV * Math.PI) / 360) * (16 / 9) * (W / 1920));
/** The border's centre from the sheet's centre, metres (x right, y up the sheet). */
export const L6_BORDER_C = [((bx0 + bx1) / 2 - 0.5) * L6.w, (0.5 - (by0 + by1) / 2) * L6.h];
