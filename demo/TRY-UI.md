# `/try` — the quick review (spec, 2026-11-03)

**Why.** The review desk (`/review`) shows everything at once — tree, flags, sheet, dock, filmstrip, status bar. A
first-time viewer (a hackathon judge, a developer's owner) cannot tell where to look. `/try` is the product's front
door and the film's Part 2: one task per screen, findings in plain words grouped by what you do with them, the drawing
as the hero, evidence on demand, one primary button per screen. The desk stays for the expert ("Open the full review
desk →"). It reuses the API, the recorded runs and the components; it adds no backend except `lang` on the ask.

## The seven steps (a stepper on top: Upload · Choose · Analyze · Review)

1. **Upload.** A large drop zone ("Drop the developer's package") and "Try a sample: Greenfield Residences (site, 30
   files) · Greenfield Tower (20 floors)". A real drop or folder pick uses `lib/upload.ts` and the upload endpoint; a
   sample uses its stored run. The file list cascades from the run's `files[]` (rows ~70 ms apart, the verdict chip
   stamps in, groups: Drawings · Bills · Documents · Scans & photos · Not read; the governing bill lit; junk grey) with
   a summary line. Continue.
2. **Choose.** The project card, filled from the run (package name, location, ground, site area — from the title block
   fields the run holds), marked "read from the title block · Muse Spark". Four toggle cards with one line each:
   Quantities & quote · Building code · Drawing logic · Files (they choose which findings are shown; the run holds
   all). Currency USD/TWD. **Analyze.**
3. **Analyze.** For a sample: the run's own calls replayed on a compressed clock (~8 s): steps with model chips and
   counters from `timing.calls` and the run (Muse Spark sheets read, geometry sheets measured, SAM calls, bill versions,
   rules), ending "N checks". A badge: "Recorded run — live, this takes about two minutes". For an upload: the real
   review progress (GET /api/run answers 202 while it runs), then the same list.
4. **Review.** Left: sheet thumbnails with counts. Centre: the drawing (pan/zoom; numbered markers; hover highlights
   objects; selected findings drawn as red revision clouds). Right: summary chips ("N issues · $X queried") and four
   groups — **Send back** (the drawing or document is wrong or incomplete: e.g. E08 tree off the site, E10 paving over
   lawn, E16 scale, E29 missing sheet, E21 subtotal, E23 hidden sheet) · **Fix before pricing** (quantities and money:
   E02.2, E02, E17, E13, E19, E20, E22.2, E18 …) · **Building code** (E14, E12, E30, C-53 …) · **Ask the architect**
   (E09 fire lane, E15 protected tree, conditionals). The mapping is an explicit table for the sample's ids, checked
   against run.json, with a fallback by scenario/severity for other packages. Each card: checkbox, a plain title (a
   `plain.ts` table, EN + 中, fallback to the backend title), money chip, sheet chip, one line of evidence; expand for
   the why and the evidence (bill row, counts, Muse Spark's reasoning and crop for E01); Confirm / Dismiss post the
   decision on the live source (D-78). Click a card: the drawing flies to it.
5. **Select.** Checkboxes and "Select all" per group; a sticky bar "Create change request · N items · $X".
6. **Export.** A drawer with the report: a cover (project, N changes, $X, sheets affected); one page per affected sheet
   — the sheet render with numbered red revision clouds (scalloped path around each finding's object boxes) and a
   legend; the change list (no., sheet, what is wrong, what to change, money, evidence). Download PDF (a print
   stylesheet) and "Copy email to the developer".
7. **Ask.** A chat tab in the right panel. Hover an object on the drawing → it outlines with its id and kind; click →
   a chip drops into the input. Send → POST /api/ask with the question prefixed by the object's context ("About T-10, a
   tree on L-1: …") and `lang`; the answer shows with its citations; actions: **Mark on drawing** (a red cloud + X +
   note, added to the change request) and **Add to change request**. A new question goes live (D-80) and the server
   records it.

## Look

Dark by default, light by toggle. Background #0B0D10; surfaces #12161B / #171C22; lines #232A33; text #E8EDF2 / #9AA4AF;
accent cobalt #4D7CFF; red #FF5A4F send back; amber #F5A524 fix; cobalt code; grey ask. Inter, tabular numbers; radius
16–20; 48 px primary buttons; generous space; the paper sheet stays white on the dark desk. EN / 中 toggle using
`frontend/src/i18n` (new strings added to `zh-TW.ui.json`; data strings through the templates in `zh-TW.data.json`).

## The director (the film's Part 2)

`/try?director=1&sample=greenfield` plays the film's Part 2 timeline on a virtual clock: an in-page
cursor above the camera layer (eased moves ~0.35 s, a click ripple, a folder ghost for the drag), a camera wrapper that
zooms 1.4–1.8× to the target's rect and back (ease in-out 0.6 s, hold, ease out), typing at ~18 chars/s, deterministic
waits on data readiness; it emits sound cues (`click`, `stamp`, `whoosh`, `type`) with timestamps to `window.__cues`
and exposes `window.__director = {duration, ready}`. The film's capture tool records it
frame-exact at 60 fps, viewport 1920×1080, deviceScaleFactor 2.
