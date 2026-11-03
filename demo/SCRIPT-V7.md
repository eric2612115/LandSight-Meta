# Landsight — film v7 (3:00 · 3840×2160 · 60 fps)

Eric, 2026-11-03 03:00: the film is the priority; the product is polished only where the film needs it. Two parts:
**Part 1 (0:00–1:30) the problem, as a film** — one 3D building that falls apart into paper, the four problems a
reviewer meets (sheets that disagree, a tree that is not a tree, a bill that drifts, the building code), each answered
in one line; what a developer told us about how he reviews; the promise; the two Meta models. **Part 2 (1:30–3:00)
the real product, recorded** — the quick review at `/try` (docs: demo/TRY-UI.md) in seven steps, Screen-Studio style:
an in-page cursor, a zoom on every click and out again, captured frame-exact at 4K 60 fps.

v5.5 (demo/SCRIPT.md) and its ledger stay the source for every greenfield number; hook prototypes 1 and 4 are reused.

## What we take from the Ambi film (reference, 45 s)

22 cuts in 45 s (a cut every ~2 s); real hands and a face in warm light and shallow focus; the product appears only as
small glass cards floating over real life; one tagline at the end; no feature list. Theirs was a crew, actors, a
cinema camera, a colourist and a motion designer tracking glass UI into the footage. Ours: three optional phone shots
by Eric (below); every glass card, type card and 3D shot made in Remotion (three.js for the building); all sound from
ElevenLabs (D-83).

## Rules

- Every number on screen comes from a run: greenfield `frontend-mock/run.json` / `run_confirmed.json` (the v5.5 ledger),
  the tower run in landsight.db (`97e35639fb8d`, checks T01–T08), or docs/STACK.md. Part 2's numbers are read off the
  screen at capture.
- Part 1's 3D building is an illustration of real sheets and real findings; no card says the product renders 3D.
- Never "first" or "only". English on screen. Voice: Eric's cloned voice (ElevenLabs, voice id in
  `demo/film/audio/eric-clone/voice_id_v2.txt`, eleven_v4, stability 0.65, similarity 0.9, style 0), flat and unhurried.
- Part 1: something lands every 2–4 s. Part 2: every click is a landing.
- Type cards: Inter Display/Tight, 104 px at the 1080 base (208 px at 4K), ≤ 7 words, one at a time, 6-frame fade + 12 px
  rise. Glass cards (Ambi): radius 28, fill white 10%, backdrop blur 24, 1.5 px border white 22%, soft shadow; a
  coloured dot (red send back · amber fix · cobalt code), title 34 px semibold, sub 26 px at 70%.
- Sound: all from ElevenLabs — voice, two music cues, effects (sub hit, paper whoosh, sheet flip, stamp, soft UI click,
  tape zip, glass shimmer, whoosh, low chime). Mix −14 LUFS integrated, true peak −1 dB.

## Part 1 — the problem (0:00–1:30)

| t | Picture (how it is made) | Card | Voice (start) | Sound |
|---|---|---|---|---|
| 0:00–0:03 | Black, then the tower at blue hour: podium 1–5F with its landscaped deck, tower 6–20F, roof garden; glass, warm windows. Low angle, the camera cranes up the facade. (three.js, massing from the tower package's sheets) | — | — | sub hit 0:00.3; music M1 in |
| 0:03–0:06 | The floors lift apart from the bottom (0.12 s stagger); each slab tips flat and becomes a white sheet — the tower's real renders and the greenfield sheets as paper — fanning into a grid of 30 | — | 0:03.2 "Every building is approved on paper." | a paper whoosh per sheet |
| 0:06–0:10 | LIVE L-PAIN (Eric): a dim room lit by the monitor; over his shoulder, wide — the screen tiled with open drawings (the synthetic sheets), he drags a red box around an error, then another. Fallback: a push into the sheet grid onto L-103 | **30 files. Two weeks. By hand.** | — | room tone, a mouse click |
| 0:10–0:15 | The sheets fly back into the tower; L-103 lights cobalt and copies itself up to 8F, 12F, 16F, 20F — four lit plates | **One sheet. Four floors.** | 0:10.5 "One sheet stands for four floors." | four soft ticks |
| 0:15–0:19 | Beside the tower, the tower bill's row slides in (T06's real text: "Planter shrubs, typ. floor × 1"); "× 1" circles red; five of the six lit plates go dark | **The bill priced one.** | 0:15.5 "The bill priced one." | thud |
| 0:19–0:22 | A glass card floats in over the tower: red dot, "Bill: 1 floor · Drawing: 4 floors", sub: T06's own words and money from the run | — | — | glass shimmer |
| 0:22–0:36 | Hook 1 v3: the real L-1; the eighth canopy lights and lifts; a dashed grid in the sheet plane and dashed x, y, z axes turn with it as the camera orbits to the side, so the turn reads as a turn; the twelve LINE entities scatter in depth; tags; snap back, the ring closes | 0:29 **Twelve lines. No tree.** · 0:33.5 **One tree — confirmed by you.** | 0:23 "This is the tree a person reads." · 0:26.5 "But this — is the tree a computer sees." · 0:31.8 "Muse Spark reads one tree — and asks you first." | a rasp per line; snap; chime |
| 0:36–0:42 | Paper desk (2D): the bill's row 6 "Camphor tree, cal. 10 cm · 12 · NT$4,200" left; the drawing's frontage row right, its canopies counting 1…8 | **Billed 12. Drawn 8.** | 0:37.5 "The bill says twelve. The drawing has eight." | a tick per canopy; thud on 8 |
| 0:42–0:46 | The hedge note "DU H0.6 @0.3m o.c. DOUBLE ROW"; a tape runs 0.0 → 27.0 m along the line; "182 plants" | **A note. 182 plants. Billed: 27 m.** | 0:42.3 "A hedge priced by the metre." | tape zip |
| 0:46–0:50 | The pavers row: "$117/m² billed · your list: up to $71" | **$10,856 over your own price list.** | 0:46.3 "Pavers, ten thousand dollars over your own list." | — |
| 0:50–0:52 | The three lines stack into one total | **$17,788 to query.** | — | low chime |
| 0:52–0:57 | Dark desk: the greenery gauge (the product's design) fills to 209.9 against the line at 297.0 — red | **Building code: not enough greenery.** | 0:52.3 "And the building code: not enough greenery." | low tone |
| 0:57–1:03 | "Add two trees": two canopies drop onto L-1, the gauge rises; the tree-pit detail L-6 slides in, "1.5 × 1.5 m · on the slab"; the canopies shrink; the gauge falls back | **On a slab, a big tree counts as small.** | 0:57.3 "The easy fix fails — the tree pits sit on a concrete slab." | buzz |
| 1:03–1:06 | The fixes that pass, from the run: "+7 trees" · "or change one tree's species" | **It finds the fixes that work.** | — | chime |
| 1:06–1:09 | The 30 sheets fall into a pile (2D) | **We asked a developer how he reviews.** | 1:06.3 "A developer told us how he reviews." | paper thump |
| 1:09–1:16 | The real L-1: T-10 outside the site boundary, a red revision cloud around it; a glass card: red dot, "Send back · A tree drawn outside the site" (E08) | **Nonsense goes straight back.** | 1:09.5 "Nonsense — a pool in mid-air, a tree off the site — goes straight back." | stamp |
| 1:16–1:19 | A glass side panel slides over L-1 with four real findings and their money: "Billed 12, drawn 8 · $516" · "Pavers over your list · $10,856" · "Greenery short · building code" · "Hedge priced by the metre" | **The details: flagged, one by one.** | 1:16.2 "The details, flagged one by one." | a tick per row |
| 1:19–1:22 | Huge type; two model chips rise beneath it: "Muse Spark 1.3 — reads" · "SAM 3.1 — measures" · small "by Meta" | **Two weeks → two minutes.** | 1:19.3 "Two weeks — in about two minutes." | music drops to near silence |
| 1:22–1:30 | LIVE L-TURN (Eric): the same dim room; he opens the package folder in Finder — backups, an Excel 97 file, a zip, scans, four versions of the bill — and leans back. 1:25 a lamp clicks on and the room warms. He turns to the lens. Fallback: the folder as a screen capture, the light as a grade change, the card **The real product. Recorded, not mocked.** | — | 1:26.3 "No more of this. Here's the real product." (his own audio) | lamp click 1:25; whoosh; M1 out, M2 in |

Part 1 voice: 122 words, about 58 s of speech in 90 s.

## Part 2 — the real product (1:30–3:00), recorded at `/try`

The capture is frame-exact at 60 fps with deviceScaleFactor 2 (3840×2160). The in-page camera does the zooms (crisp at
any scale); the cursor is drawn above the camera layer at a constant size. Remotion places the capture on a deep
gradient with rounded corners and a soft shadow and adds the step chip (top left) and a one-line caption of the voice
(bottom, for muted viewing).

| t | Step | On screen (cursor · zoom) | Voice (start) |
|---|---|---|---|
| 1:30–1:40 | 1 Upload | The page flies in. The cursor drags a folder "Greenfield Residences" onto the drop zone; ripple. The 30 files cascade with their verdict chips; the counter "30 files · 11 drawings · 4 bills · 7 documents …". Zoom 1.7× on the bills: "4 versions · rev3 governs" (older three greyed). Pan to the junk: ".bak · ignored", ".xls · unsupported". Zoom out; click Continue | 1:30.5 "Drop the folder exactly as it came — backups, scans, four versions of the bill. Every file gets a verdict." |
| 1:40–1:47 | 2 Choose | The project card fills from the title block: name, landscape over a basement slab, site area, "read from the title block · Muse Spark". Zoom 1.5× on it, out. Four toggle cards, all on: Quantities & quote · Building code · Drawing logic · Files. Currency USD. Click Analyze | 1:40.2 "It reads the project off the title block. Choose what to check. Analyze." |
| 1:47–1:57 | 3 Analyze | The steps tick top to bottom with model chips and counters from the run: Muse Spark · reading 22 sheets — Geometry · closing outlines, counting — SAM 3.1 · measuring colour areas — Bill · 4 versions aligned — Building code · greenery, fire lane, water. The camera follows the active step at 1.4×. "71 checks" | 1:47.3 "Muse Spark reads every sheet and document. SAM measures the colours. Geometry does the counting." |
| 1:57–2:22 | 4 Review | The review: sheets left, the drawing centre, findings right in four groups with counts (Send back · Fix before pricing · Building code · Ask the architect) and "$17,788 queried". Zoom on the group headers, out. Click "Send back · A tree drawn outside the site": the drawing flies to T-10, red cloud, zoom 1.6×. Click "Billed 12, drawn 8 · $516": the drawing pans to the frontage row; T-08's card shows the crop and "12 loose lines · Muse Spark: one tree, 95%"; click Confirm; the count flips 7 → 8. Click "Greenery short": the gauge 209.9 / 297.0 with "+7 trees · or change one species"; zoom on it, out | 1:57.3 "On the right: what to send back, what to fix before pricing, what the code says." · 2:08 "Each opens on the drawing, with its evidence." · 2:14 "And nothing counts until you confirm it." |
| 2:22–2:29 | 5 Select | "Select all" on Send back, then on Fix before pricing; the bottom bar counts "Create change request · N items · $X" | 2:22.3 "Pick what goes back to the developer." |
| 2:29–2:42 | 6 Export | Click Create change request: the report drawer — cover (project, N changes, $X, sheets affected), L-1 with numbered red revision clouds, the change list. Zoom 1.8× on one cloud and its note ("Row 6: 12 → 8 Camphor · $516"); out; Download PDF pulses | 2:29.3 "It writes the change request — every point clouded on the drawing, numbered, priced, ready to send." |
| 2:42–2:52 | 7 Ask | Hover T-10 on the drawing: it outlines in cobalt, "T-10 · tree". Click: the chip drops into the chat. The question types: "This tree is outside the site. Mark it for removal." Enter. Muse Spark's recorded answer appears with its citation; a red X and cloud land on T-10; "Added to the change request". Zoom on the chat, then on the drawing | 2:42.0 "Or point at anything and tell it what's wrong. It answers from the package, and marks the drawing." |
| 2:52–2:58 | Close | Zoom out to the whole screen; a glass card over it: "Tested on 30 planted errors · 28 found · 2 flagged for a person · 0 missed · 0 false alarms" | 2:52.5 "Thirty planted errors: twenty-eight found, two flagged, none missed." |
| 2:58–3:00 | End | The Landsight lockup; "github.com/eric2612115/landsight"; music button | — |

Part 2 voice: 131 words. Music M2 under all of Part 2, ducked −8 dB under the voice.

## Live shots for Eric (two; each has a fallback)

Nobody reviews on paper any more: the pain is a screen full of drawings and a folder full of junk.

| | When | Shot | Spec |
|---|---|---|---|
| L-PAIN | 0:06–0:10 | A dim room lit only by the monitor. Over his shoulder, wide enough to read the screen: six to eight drawing windows tiled (open the renders in `demo/props/` in Preview), he draws a red box around the row of trees on L-1 with Preview's markup, then around a row of the bill in the spreadsheet | phone 4K **60 fps** standard video (Cinematic mode is 30), exposure locked for the lit room so the dim part stays moody; 3 takes × 10 s |
| L-TURN | 1:22–1:30 | The same set. Finder on `samples/greenfield/Greenfield Residences — Landscape Package` in list view (the junk is real: .bak, .xls, .zip, scans, four bill versions); he scrolls and leans back; a lamp clicks on (in frame or just off it) and the room warms; he turns to the lens: "No more of this. Here's the real product." | same; his own audio (phone mic close, or AirPods); 3 takes, flat delivery |

| L-SITE | 0:57–1:00 (the code beat) | A real street-tree pit on a sidewalk; his hand stretches a tape measure across it, the tape reading about 1.5 m; low angle, the tree trunk in frame. Match cut to L-6's "1.5 × 1.5 m · on the slab" — the same number on the drawing | same; tripod or a steady hand; 3 takes × 6 s |
| L-END (optional) | after 2:52 | The same room, lit: he drags the change-request PDF into an email to the developer and hits Send; he closes the laptop | same; 3 takes × 5 s |

The skin is ready before he shoots: the type card over L-PAIN, the grade, the slots; his clips drop in. Over L-PAIN, with
the phone on a tripod (no tracking needed), glass cards pop up beside the very errors he is boxing on his monitor —
"Billed 12. Drawn 8." beside his red box on the bill — the product catching what he is hunting for. Everything in the
film is English: the screen recordings use `/try?lang=en`.

## Production

**Order: the animatic first** (the whole 3:00 in simple shapes — boxes for sheets and screens, circles for trees, a stack for the building, arrows and frames for the camera, labels for every object, the cards as text, the voice from the clone, a timecode) → Eric approves or changes → only then the assets and the renders.

| Who | What | Out |
|---|---|---|
| Fable film builder | the animatic of the whole film | `demo/film/animatic-v7.mp4` |
| Opus builder | `/try` (demo/TRY-UI.md): the seven steps, EN/中, dark/light, the director timeline above with the in-page cursor and camera, a test capture | frontend/src/try/*, screenshots, `demo/film/captures/try-test.mp4` |
| Fable film builder (1) | Part 1: the three.js tower (lift, explode to sheets, restack, the typical plate × 6, the bill row), hook 1 v3 (dashed grid + axes), the bill/hedge/pavers desk, the gauge and the pit, the developer beat on the real L-1, the type and glass cards, the props PDF; Part 1 voice, music M1 and effects from ElevenLabs | `StoryV7` composition, a 1080p60 preview for Eric |
| Fable film builder (2) | Part 2: the 4K60 capture of `/try?director=1`, the frame and captions, voice and music M2, the join, the final 4K60 and 1080p60 renders, the 20 s X cut | `demo/film/landsight-v2.mp4` |
| Eric | the animatic's yes (Nov 3); L-PAIN and L-TURN by Nov 4 noon; the review of the cut (C4) Nov 4 evening; the form | — |

## Honesty

The 3D tower, the paper desk and the glass cards visualise real sheets and real findings; the voice's "a pool in
mid-air" is the developer's example of what he rejects, and the picture under it is the real finding (E08, the tree
off the site) — the product does not claim to have found a pool. Part 2 is the product as it runs on the recorded
sample run; the live run's time and cost (113 s, about $0.26) are in docs/STACK.md and are what "about two minutes"
means.
