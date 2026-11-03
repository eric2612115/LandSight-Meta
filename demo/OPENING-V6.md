# The v6 opening — four hooks, built in Remotion from real data (spec, 2026-11-02 19:20)

Eric's direction after reading v5.5: the first twenty seconds should be three or four "everyone gets it" hooks,
each a visual, each true, before the face and the 12 ≠ 8. v5.5's middle and end stay (verified, every number
sourced); its first minute is rebuilt around these. D-83 governs the tooling: Remotion / ffmpeg / Playwright for
every picture and caption, ElevenLabs for every sound, Meta only inside the product.

## Hook 1 — the tree a person reads, the tree a computer sees (0:00–0:15)

| s | picture | burned text | voice (ElevenLabs, Eric's cloned voice or Brian) | sound |
|---|---|---|---|---|
| 0–3 | the real L-1 planting plan in plan view; slow push toward the frontage row of eight canopies; a thin cobalt scan line passes the row; T-08 lights with a cobalt ring, the rest dim | — | — | room tone; one tick at the scan |
| 3–5 | the sheet falls to the dark field; T-08's geometry alone, centred, ×6 | `One tree.` | "This is the tree a person reads." | — |
| 5–9 | the camera orbits 90° to the side; each of the twelve segments sits at its own depth; the circle shears into twelve floating strokes | `Twelve lines. No tree.` | "But this — is the tree a computer sees." | a short rasp per stroke |
| 9–12 | each stroke tags itself with its real entity type (LINE / ARC …); a counter ticks `12 entities · 0 trees` | — | — | twelve ticks |
| 12–15 | back to plan view; the strokes snap together; the ring closes | `Landsight reads one tree — and asks you first.` | — | snap, soft chime |

Data: T-08's twelve pieces from the sample DXF (`samples/greenfield/…/L-1 Planting Plan (Rev B).dxf`; run.json E01
"open outline (12 pieces, 12 gaps up to 0.40 m)"). The depth is a film device; the captions say what the computer
has: twelve line entities. Technique: the twelve segments are 3D lines (x, y in the sheet plane, z their assigned
depth, scaled so the 0° view aligns to the original circle); a camera orbits 0° → 90° on a Remotion spring and every
endpoint is projected in JS with one perspective divide (distance 1400 px), then drawn as plain `<line>`s in one flat
1920 × 1080 SVG at 60 fps, 4 px round-capped strokes scaled by depth. No CSS 3D: the first cut (one SVG layer per
segment under `perspective` / `preserve-3d` / `rotateY`, 30 fps, 1.6 Mbit/s) shimmered as Chromium resampled each
layer. Prototype: `demo/film/src/scenes/Scene1Tree` → `demo/film/scene1-prototype-v2.mp4` (`npm run render:scene1`,
i.e. `npx remotion render src/index.ts Scene1Tree scene1-prototype-v2.mp4 --codec h264 --crf 16 --audio-codec aac`
in demo/film).

## Hook 2 — the folder bursts, every file answers (0:15–0:24)

- A folder icon is dragged in; the **thirty real file names** pour out with a little physics (DXF, PDF, XLSX, the
  `.bak`, the `.zip`, the Excel 97 `.xls`, the scans, the `.pptx`), scattering across the dark field.
- A scan line passes; each file is **stamped with its verdict** from the Run's `files[]`: `measured · governs`,
  `read, not counted`, `Rev A · superseded`, `backup · ignored — byte-identical`, `unsupported — Excel 97`, `zip ·
  unpacked`. Junk greys and drops away; the four BOQ revisions stack and the newest alone stays lit.
- The survivors gather into one sheet, which becomes the real L-1 — the cut into "the sheet wakes".
- Burned: `30 files. Every one gets a verdict.` then `The one that governs is named.` Voice: none (the cards carry it),
  or the v5.5 line "The landscape plans: thirty files." moved here.
- Data: `frontend-mock/run.json` → `files[]` (name, verdict, reason, decided_by). Nothing invented; the real Open
  screen shows the same list right after, so a judge who clicks sees what the film showed.
- Technique: Remotion with per-file springs (position, rotation, opacity), the verdict stamp as a scale-in with a
  clack; 30 elements, deterministic from the file index.

## Hook 3 — the tape measure (the regulation hook, mid-film, ~1:02)

- Eric on site, hands only: a tape measure across a fire-truck access lane, a tree standing inside it; one shot,
  4 s, locked phone on a tripod. Burned: `Found after it was planted?` → cut to the real Review screen with E09:
  `T-09 is drawn inside the fire truck access lane` → `Caught on the drawing.`
- Honesty: Landsight's rules are §299 (fire lane, conditional), §302 greening with the pit downgrade, the protected
  tree, soil depth, §305 — not "street tree to building distance". The tape measures the lane; the flag is E09.
- Replaces v5.5's hedge-tape beat (0:37–0:47), whose tape the film would otherwise show twice.
- Eric shoots it on 2026-11-03 or 11-04. If the shot cannot be had, the hook is a burned caption over the real
  E09 screen (`Found after it was planted? Caught on the drawing.`) — the beat survives without the footage.

## Hook 4 — six sheets, one building (the tower, ~1:40, replaces or precedes the bill beat)

- The tower package's six floor sheets (L-1F … L-6F, the typical-floor sheet, the roof garden) render as real
  sheet images stacked in perspective into one building (Remotion, `preserve-3d`, a slow orbit); pins light on the
  floors where the checks fired (T-04 the typical sheet × 6, the roof-garden soil, the look-alike sheets); a
  suggestion line per pin, read from the Run.
- Burned: `Six sheets. One building.` → `One sheet says "typical" — it counts six times.` → the real screen's tower
  flags (8 planted · 6 found · 2 flagged · 0 missed).
- Honesty: the product's screen is 2D; the stack is a film visualisation of real sheets and real flags; the caption
  never says the product renders 3D. Data: `samples/tower`, run `97e35639fb8d` (recorded), T01–T08.

## The v6 order (3:00)

0:00 hook 1 (tree → lines) · 0:15 hook 2 (the folder bursts) · 0:24 the face, one line · 0:27 `The bill: 12 trees
≠ The drawing: 8` on paper (the hands) · 0:31 the premise and the stake cards · 0:35 the sheet wakes (seven; you
counted eight) · 0:43 the eye, shortened (the open is already told; 8 s: Spark's why + the Confirm click) · 0:51
lines to colour, money first (v5.5 beat 7) · 1:02 hook 3 (the tape) → the gauge twice · 1:21 the bill, traced ·
1:40 hook 4 (the tower stack) · 1:52 ask the package · 2:03 the Statement, twelve again · 2:17 the scoreboard ·
2:33 the stack · 2:48 close.

Cuts from v5.5 to pay for the hooks: the hedge tape (10 s), the fire-lane beat merged into hook 3, the eye
shortened by 5 s, the bill beat trimmed by 4 s. Narration stays near 289 words; the hooks are mostly burned text.

## Voice

Eric's own voice, cloned on ElevenLabs (Instant Voice Clone from his 106 s Vexi demo; voice id in
`demo/film/audio/eric-clone/voice_id.txt`; five test lines in that folder, model eleven_v4) — pending his listen.
If he prefers, he records the two face lines himself; the clone reads the body. Brian stays the fallback.

## The shoot list for Eric

1. Hands on the desk (v5.5 §5): the printed L-1, the highlighter, the drag. 2. The tape across a lane with a tree
in it (hook 3). 3. The face, two takes of one line. Phone, 4K 30 fps, locked exposure and focus, window light.

## Plan after the rate limit (in order)

1. Finish/verify the hook-1 prototype (stills at 2 s, 7 s, 10 s; alignment of the twelve strokes in plan view);
   swap Brian for the clone if Eric approves.
2. Hook-2 prototype (the folder bursts) from run.json files[]; join hook 1 + hook 2 into one 24-s cut for Eric.
3. Script v6 = this spec's order on v5.5's verified body; recount the narration; one facts pass; the two outsider
   seats once (first 60 s only).
4. Hook-4 prototype (the tower stack) from the tower sheets; hook 3 waits for Eric's shot.
5. Capture the product scenes (frozen clock, repo source, USD), narration with the clone, music and sfx via
   ElevenLabs, the cut in Remotion; C4 with Eric; then README/SUBMISSION, repo public, the final gate.
