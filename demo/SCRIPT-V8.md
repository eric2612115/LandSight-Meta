# Landsight — film v8: one journey (≈2:50 · 3840×2160 · 60 fps)

Eric on animatic v7 (2026-11-03): the pauses are too long and the voice stops when the picture stops; the voice is too
slow; the tree and its grid turn out of step; the problems arrive like slides ("problem one, problem two") with boards
between them — no product film is built like that; no sound until the very end (the cut keeps changing), so judge the
picture and timed subtitles only; the timeline must hold his live shots.

## How v8 is built

- **One continuous journey, no sections.** The camera starts on Eric's screen, pushes through it into the drawings,
  which stack into the building; it descends the building to the ground, glides along the row of trees, closes on one
  tree, sinks into the slab beneath, rises over the whole site, cuts to his room as the lamp comes on, and pushes into
  his laptop — where the product does the same journey in two minutes. Each problem is a place the camera passes, not
  a numbered slide. Transitions are camera moves and match cuts (through a screen, through the ground, a tape's 1.5 m to
  the drawing's 1.5 m).
- **The voice never stops** for more than a second, except two designed beats (the Confirm click, the lamp). It reads
  at about 155 words a minute. Subtitles always on.
- **The picture never stops** under the voice; something moves every second.
- **Big type three times only:** none in the opening (the glass card is the hook), "Two weeks → two minutes" at the
  hinge, the scoreboard at the end. Everything else is subtitles and in-world glass cards (the Ambi look).
- **Part 1 is one three.js world** (grey boxes in the animatic, the real look later on the same skeleton): sheet planes
  textured with the real renders, floor plates, the tower, the ground plane with L-1, trees, the twelve LINE entities,
  the slab, the pits, the bill rows as floating sheets, glass cards as translucent planes. One camera path, keyframed.
  The tree's turn happens inside this world, so the tree, its grid and its axes are one scene and cannot drift apart.
- **Part 2 is the real `/try` screen**, captured from its director (frontend/src/try/director.ts), captions timed to
  its cues (`try-*.cues.json`). No step chips.
- **No sound now.** Picture + subtitles with timestamps. Voice (Eric's clone), music and effects (ElevenLabs) are made
  last, once the cut is locked.

## The journey (voice at ~155 wpm; times are starts)

| t | Picture | Voice | In-world card |
|---|---|---|---|
| 0:00–0:06 | LIVE L-PAIN: dim room, his monitor tiled with drawings, he boxes an error in red; a slow digital push toward the monitor | 0:00.3 "This is how a landscape package gets checked today. Thirty files, two weeks, one person boxing errors by hand." | 0:03 a glass card pops beside his red box: "Billed 12 · Drawn 8" — the product already sees what he is hunting |
| 0:06–0:10 | The push goes through the monitor; the drawing on it fills the frame and becomes the clean render; it tilts back into 3D and the other sheets slide in under and over it into a stack | 0:08.0 "Because a building arrives as a stack of drawings —" | — |
| 0:10–0:18 | The stack becomes the tower at blue hour (the plates are its floors); the camera orbits; the typical-floor plate lights and copies itself up four floors; the bill row floats beside it, "typ. floor × 1", the × 1 circled | 0:11.7 "and the errors hide between them. One sheet stands for four floors; the bill priced one." | "Bill: 1 floor · Drawing: 4 floors" |
| 0:18–0:24 | The camera descends the facade; the ground unfolds as L-1; it glides low along the frontage row of eight canopies; one looks broken | 0:18.3 "Down on the ground, the drawing shows a row of trees. Look closer at the eighth." | — |
| 0:24–0:34 | The camera closes on the eighth canopy and orbits it 90°: the ground grid and axes turn with it; the canopy is twelve loose lines floating at different heights; they snap back, a cobalt ring closes; a cursor clicks Confirm | 0:24.3 "To a person, it's a tree. To a computer, it's twelve loose lines — no tree at all." · 0:30.7 "Muse Spark reads it as one tree — and still asks you before it counts." | "Muse Spark: one tree · 95% · Confirm?" |
| 0:34–0:49 | Pull back along the row: the canopies count 1…8; the bill sheet rises beside the row like a billboard, row 6 lit "Camphor tree · 12"; then along the boundary a tape runs 0 → 27 m and the double row of 182 plants appears; then the paving lights: "$117/m²" against "your list: $71" | 0:36.3 "The bill charges for twelve; the drawing has eight. The hedge is one note — a hundred and eighty-two plants — priced by the metre. The pavers, ten thousand over your own price list." | "$516 for trees that aren't drawn" · "$10,856 over your list" |
| 0:49–1:03 | The camera tilts down through the ground: soil, then the concrete slab beneath; the tree pits are small boxes on it; LIVE L-SITE (2.5 s): a real tape across a real tree pit, 1.5 m; match cut to the pit on the slab, "1.5 × 1.5 m"; the big canopies shrink; a greenery bar in the scene falls below the code line | 0:49.4 "Underneath it all is a concrete slab. On a slab, a big tree counts as small — so the greenery falls short of the building code, and adding trees won't fix it. Landsight finds the fix that does." | "Greenery 209.9 / 297 — +7 trees, or change one species" |
| 1:03–1:12 | The camera rises to a high view of the whole site; T-10 sits beyond the dashed site boundary, turns red, a revision cloud draws round it; glass cards stack on the right of the frame — the findings, forming the product's side panel in the world | 1:03.5 "A developer told us how he reviews. Nonsense — a pool in mid-air, a tree off the site — goes straight back. Everything else, he wants flagged, one by one." | "Send back · a tree off the site" and a column of findings with their money |
| 1:12–1:18 | LIVE L-TURN: his dim room; he scrolls the junk folder, leans back; the lamp clicks on; he turns to the lens | 1:15.3 (Eric) "No more of this. Here's the real product." | — |
| 1:18–1:21 | The camera pushes into his laptop's screen (the opening's push, mirrored) and lands on `/try` | 1:18.4 "Two weeks — in about two minutes." | big type: **Two weeks → two minutes.** |
| 1:21–2:49 | The real `/try` director run (88 s): drop the folder, the files and their verdicts, the project read from the title block, Analyze, the four groups, T-10 sent back, 12 vs 8 and the Confirm, the greenery fixes, select, the change request with its clouds, then ask: "This tree is outside the site. Mark it for removal." — Muse Spark pushes back: ask whether it is a street tree by others; the cloud and that note go on the drawing | timed to the director's cues: "Drop the folder as it came — backups, scans, four versions of the bill. Every file gets a verdict, and the one that governs is named." · "It reads the project off the title block. Pick what to check, and analyze." · "Muse Spark reads every sheet and document, SAM 3.1 measures the colour plans, and the geometry does the counting." · "On the right, the developer's way: what to send back, what to fix before pricing, what the code says. Every item opens on the drawing with its evidence — and nothing counts until you confirm it." · (silence for the Confirm click) · "Short on greenery? It shows the fixes that pass." · "Pick what goes back to the developer — and it writes the change request: every point clouded on the drawing, numbered and priced, ready to send." · "Point at anything and tell it what you think. It answers from the package — even when you're wrong — and marks the drawing with the right question." | — |
| 2:49–2:55 | (LIVE L-END, optional: the lit room, he sends the PDF and closes the laptop.) Then a glass card over the screen; then the Landsight lockup, the repo URL, "Built with Muse Spark 1.3 and SAM 3.1" | "We hid thirty errors in a package. It found twenty-eight, flagged two for a person, and missed none. Every number traces back to the drawing." | big type: **30 planted · 28 found · 2 flagged · 0 missed** |

About 380 words. If the director's 88 s plus the live shots run past 3:00, the director's report hold (12 s) and the
Analyze step are tightened first.

## Honesty

Unchanged from v7: the 3D world visualises real sheets and real findings (T06, E01, E02.2, E17, E20, E12/E14, E08);
"a pool in mid-air" is the developer's example; the picture under it is the real E08. Part 2 is the product.
