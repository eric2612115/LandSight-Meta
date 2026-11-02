/**
 * Scene 1, "One tree" (15 s): every cue the scene places, in seconds, shared by scene1-prepare.mjs (which mixes the
 * effects) and src/scenes/Scene1Tree.tsx (which draws them), so a stroke you see separate is the rasp you hear.
 */

export const SCENE1 = {
  fps: 30,
  duration: 15,
  /** 0–3 s: the plan, a slow push toward the frontage row; the scan line crosses the row and hits T-08. */
  push: {end: 3.0, zoom: 2.2},
  scan: {start: 1.0, hit: 2.4, out: 2.75, x0: 1.5, xEnd: 36.0},
  /** 3–5 s: the sheet falls to the dark field; T-08 lifts to the centre at ×6. */
  lift: {start: 3.0, end: 4.0, sheetOut: 3.6},
  /** 5–9 s: the orbit to 90°; each stroke rasps as it separates. */
  orbit: {start: 5.0, frames: 96},
  rasps: Array.from({length: 12}, (_, i) => 5.15 + i * 0.14),
  /** 9–12 s: a tag per stroke, the counter in the corner. */
  tags: {start: 9.2, step: 0.2, out: 12.0},
  /** 12–15 s: back to plan view, the strokes snap, the ring closes. */
  back: {start: 12.0},
  snap: 12.45,
  chime: 12.95,
  ring: {open: 2.4, drawn: 2.75, fadeStart: 5.0, fadeEnd: 5.5, closeStart: 12.6, closeEnd: 13.1},
  captions: [
    {text: 'One tree.', at: 3.4, until: 5.3},
    {text: 'Twelve lines. No tree.', at: 6.6, until: 9.2},
    {text: 'Landsight reads one tree — and asks you first.', at: 13.3, until: 15.5},
  ],
  voice: {line1: 3.0, line2: 5.5},
}

/** Line 1 at its cue; line 2 at its cue but never before line 1 has ended (+0.2 s). */
export function voicePlan(d1, d2) {
  const at1 = SCENE1.voice.line1
  const at2 = Math.max(SCENE1.voice.line2, at1 + d1 + 0.2)
  return [
    {n: 1, at: at1, seconds: d1},
    {n: 2, at: at2, seconds: d2},
  ]
}
