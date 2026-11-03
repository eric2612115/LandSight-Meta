# Landsight · the review as a teardown (film v4)

Part 1 and the end of the demo film, redrawn as an interactive-machine teardown: the sample package is one machine
(the site on its basement slab, the 20-floor tower on its 28 × 18 m plate) under a console (the sheet, the current
finding's numbers, the four check groups, the operator's modes, the review log). The operator follows the narration
beat by beat: the sheets stack into the tower, the floors explode, sections cut the roof planter, the lift core and the
tree pits, a tree symbol is x-rayed into its twelve loose lines, SAM 3.1's masks bloom off the colour plan.
`render(t)` is a pure function of film time, recorded frame by frame at 1920 × 1080, 60 fps; Remotion
(`src/scenes/FilmV4.tsx`) puts it together with the opening footage, the product's own capture (Part 2), the captions
and the approved mix.

## One source for every number and every second

- Dimensions: `prep.mjs` reads them from `landsight/synth` (the generator that drew the sample DXFs) into
  `gen/package.json`; the model checks its own figures (38.4 m² a typical floor, 35 m² of roof planters, B-10's 7.5 m²
  with 3.0 m² over the lift shaft, the corridor's 1.5 m and 0.9 m) against the approved cards.
- Times: every beat comes from `src/scenes/film-v2-cues.js` (the beats, the cards, the narration's line starts);
  `cut.js` holds the two recorded stretches.
- Words on screen: the approved cut's cards, without em-dashes; the product's four groups.

## Build and record

```
node demo/film/teardown-v4/prep.mjs                      # gen/ and timeline.json
node "$TEARDOWN/sims/build.mjs" demo/film/teardown-v4     # → teardown-out/dist/teardown-v4.html
node "$TEARDOWN/sims/capture.mjs" teardown-v4 --size 1600x900 --dpr 1.2 --stills beats --timeline demo/film/teardown-v4/timeline.json --cols 6 --out teardown-out/v4-beats.png
node "$TEARDOWN/sims/capture.mjs" teardown-v4 --size 1600x900 --dpr 1.2 --from 14 --to 94.1 --out demo/film/public/v4/part1.mp4
node "$TEARDOWN/sims/capture.mjs" teardown-v4 --size 1600x900 --dpr 1.2 --from <CUT.end[0]> --to <CUT.end[1]> --out demo/film/public/v4/end.mp4
npx remotion render FilmV4 landsight-v4-review.mp4 --gl=angle      # from demo/film
```

`$TEARDOWN` is the teardown skill's folder. `--size 1600x900 --dpr 1.2` gives 1920 × 1080.

| File | Job |
|---|---|
| `data.js` | The package on L-1's frame, the storeys, the beats, the console's words. No three.js. |
| `model.js` | The machine built from those numbers; `update(state)` poses it (explode, drawers, cuts and their caps, the symbol, the masks). |
| `stage.js` | Studio, sun and soft shadows, GTAO, the ink pass; `frame(state, cam)`. |
| `console.js` | The 1600 × 900 overlay. Anything to read is at least 28.5 px (34 px on the 1080 frame). |
| `film.js` | The operator's `SCRIPT`, the views, the pose and the console at time t. |
| `land.js`, `look.js`, `cut.js` | Shared with FilmV4: where the push lands on L-6, the palette, the recorded stretches. |

## Credits

Built with the teardown skill (MIT, see `LICENSE-teardown`), whose kit, frame capture and review rules come from
[whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT). The ink shader in `stage.js` is adapted
from the kit's Strandbeest stage. The simulator imports the kit at build time (`teardown-kit/…`); no kit file is copied
here.
