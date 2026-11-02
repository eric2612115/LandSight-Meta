/**
 * Scene 4, "Six sheets, one building" (12 s, hook 4 of demo/OPENING-V6.md, ~1:40 of the film): every fixed cue in
 * seconds, shared by scene4-prepare.mjs (the Run, the sheet renders, the effects mix) and src/scenes/Scene4Tower.tsx
 * (which draws them). The per-sheet times (rise, exit, ghost) are derived from these and live in public/data/scene4.json.
 */

export const SCENE4 = {
  fps: 30,
  duration: 12,
  /** The tower's recorded run (landsight.db, runs.id) and the package it reviewed. */
  run: '97e35639fb8d',
  packageDir: 'samples/tower',
  /** 0–2 s: the six sheets lie flat, fanned, seen in plan; the camera is a little high (zoom < 1). */
  fan: {centre: [960, 470], zoom: 1.1, stepDeg: 7, stepX: 190, dy: 12},
  /** 2–4.2 s: the camera tilts to see the stack from above-front, moves to the building's spot and draws back. */
  camera: {start: 2.0, end: 4.2, tiltDeg: 58, centre: [720, 680], zoom: 1.0, perspective: 1800},
  /** 2–10.6 s: the slow orbit about the building's axis, about 35°, settling before the counter lands. */
  orbit: {start: 2.0, settle: 10.6, fromDeg: 3, toDeg: 38},
  /** 2.2–4.3 s: the four plan sheets rise one by one, each to its floor; a paper lift each. */
  rise: {start: 2.2, step: 0.7},
  /** 4.8–5.25 s: the two sheets the Run does not count leave the frame, tagged with the Run's words. */
  exit: {start: 4.8, step: 0.45, tagSeconds: 1.3, tagAt: [[1150, 400], [1150, 468]]},
  /** The building: sheet width in world px, one storey's height in world px (the roof sits one storey above 20F). */
  building: {width: 560, storey: 22},
  /** 6–10 s: the pins, in this order, 1.5 s apart; the typical sheet's five copies rise at the first pin. */
  pins: {start: 6.0, step: 1.5, checks: ['T01', 'T02', 'T08'], column: {x: 1150, maxWidth: 760, gap: 150}},
  ghosts: {start: 6.1, step: 0.15},
  /** 10.5 s: the Run's scoreboard lands in the caption band, with a low chime. */
  counter: {at: 10.5},
  captions: [
    {text: 'Six sheets. One building.', at: 0.5, until: 3.2},
    {text: 'One sheet says "typical". It counts six times.', at: 6.0, until: 10.1},
  ],
}
