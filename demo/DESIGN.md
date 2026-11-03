# Design brief — the screens and the film (2026-11-02)

Eric's rule for this entry: the demo's effect comes first; everything else second. Judges watch a three-minute
film, then (top five) watch it again live. So the product's own screen has to be the film: every animation the
film needs is built into the app, and the film is a recording of the app plus captions and sound. No mock-ups,
no After Effects, nothing the live product cannot do.

## Director mode

`/?director=1` plays the pipeline as a sequence of **scenes**, each a state of the real result with a timed
reveal, advanced by the space bar (so a take can be re-done beat by beat) or auto-timed (`&auto=1`). Every scene
is also reachable by its own URL (`/#scene=eye`) for retakes. The same page without `director` is the plain
product: everything visible at once, no animation.

## Visual language

- **The drawing is the stage.** The sheet is rendered as it prints: near-white paper (#f7f5f0), black ink, true
  line weights, the legend, schedule and title block in place. Around it, a dark chrome (#14161a) so the paper
  glows. The sheet fills about 70% of a 1920 × 1080 frame; panels slide in from the right and never cover
  the frontage row of trees.
- **Four colours, each a source.** Geometry = graphite (#3a3f47); Muse Spark = cobalt (#2457ff); SAM 3.1 =
  violet (#7a3cff); flags = amber (#f0a500); confirmed = leaf green (#1f9d55). A viewer learns the code in beat 4
  and reads every later beat by colour.
- **Type.** Numbers in a monospace (JetBrains Mono); labels in Inter. Minimum 28 px for anything the film must
  read; the corner tally at 32 px. **English only, everywhere**: the site, the drawings, the bills, the film.
  Regulations are named in English with their article number ("Building Technical Regulations §302"); the
  citation link points at the original. Chinese plant names live only as a column in the species data file and
  are never rendered. No language toggle, no light/dark toggle (Eric, 2026-11-02).
- **Motion.** 220–400 ms, ease-out. One thing moves at a time. A sound for each kind of event: a soft tick when
  an ID lands, a snap when an outline closes, a low thud for a flag, a chime for a confirm. No music under the
  app beats; music only under beats 1, 3 and 11.

## The wow moments, in order

1. **The drawing wakes up** (beat 4). The file lands; a thin scan line sweeps left to right across the sheet;
   behind it closed outlines fill with a 10% graphite wash and sprout their ID tags (T-01 … T-07, H-01, B-01,
   L-01) with ticks; the corner tally counts up. The eighth tree stays white, then pulses amber.
2. **The eye** (beats 4–5). The sheet zooms to T-08 (300 ms). Its twelve segments turn red one by one; the gap
   points appear as red dots. Right panel: "What Muse Spark saw" — the exact crop sent, then its JSON typing
   itself, then the grounding points popping onto the crop. The outline snaps closed in cobalt. The panel shows
   `Geometry: open, 12 gaps · Muse Spark: one tree, 0.95 · Plant list: 8`. One button. Confirm → green.
3. **Hedge math** (beat 6). A measuring tape unrolls along the hedge line, the readout running to 27.0 m; the
   formula writes itself under it, `27.0 ÷ 0.3 + 1 = 91 · × 2 rows = 182`; 182 tiny plant dots sprout along the
   two lines, fast, with a rising tick.
4. **Lines to colour** (beat 7). The sheet desaturates to pure line work; a violet label reads `SAM 3.1 · 0
   masks`. Colour pours into the drawing (canopies, bed, lawn, paving, 600 ms); masks bloom from their centres
   like ink in water; each mask gets its m² and its % against the CAD figure.
5. **The gauge** (beat 8). A horizontal gauge fills to 268 of 297 and stops, red. Two chips below: `+2 trees` —
   the gauge climbs to 306, green; `swap 2 for a second native species` — the gauge jumps to 436, green, and
   two of the eight canopies on the sheet change tone.
6. **The bill** (beat 9). The developer's spreadsheet slides in beside the sheet; thin cobalt connectors draw
   from each bill row to its drawing item as Muse Spark aligns the names; three rows slam amber in turn; click a
   row and its objects light on the sheet while a NT$ counter runs the difference.
7. **The tally** (throughout). Bottom-left, always visible, every change credited to its source in its colour.

## What the film adds

Captions (source and model names, English glosses), the two paper beats (bill cell and highlighter; the close),
the sound design, and the cut. Nothing else. If a moment cannot be produced by the app, it is not in the film.

## Not in scope

Dark/light toggles, mobile layout, settings, auth, persistence. One site, one screen, every pixel for the film.
