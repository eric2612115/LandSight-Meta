# Plan v2 — the right order (Eric, 2026-11-02 09:00)

v1 (everything committed up to now) is the prototype: it proved the pipeline, the Meta calls, the data and the
film tooling. It was built in the wrong order — script before scenarios, film before design — and it looks like
software an AI drew. v2 follows the order Eric set:

1. **Scenarios** — four kinds of catch, each a reproducible run on the sample package, each with its own test:
   - **Quote errors** (報價抓錯): bill vs drawing quantities (12 vs 8; hedge 27 m vs 182 plants; azalea
     density), bill vs the firm's price list (camphor under, pavers over), bill arithmetic (subtotal skips a
     row), hidden sheet, four revisions, units.
   - **Regulation errors** (法規抓錯): §302 greening short; the podium pit downgrade; the fire lane (§299,
     conditional); the protected existing tree (a municipal tree protection ordinance, §3/§11); the green-building checklist; soil depths on
     artificial ground (roof/podium) — and, for the tower package, the typical-floor multiplier.
   - **Design errors** (設計抓錯): two revisions of one sheet; the enlarged plan repeating four trees; the title
     block's 1:200 vs the scale bar's 1:100; paving over lawn; label PV-1 vs hatch PV-2; the detail's pit vs
     the plan's note; the index listing a missing sheet; the elevation and background sheets.
   - **Format errors** (格式抓錯): .bak, Excel 97, zip, raster scan, pasted images, a slide deck, a corrupt
     file — every one with a verdict and a reason.
   Each scenario gets a `landsight review --scenario <name>` entry point that prints exactly its checks, and the
   product's screen groups flags by these four kinds.
   - **Ask the package** (Eric, 09:20): the owner can query the package itself — the PDFs the developer sends
     "for you to read yourself" (specs, review issues, standards, the green-building checklist), the regulations
     (rules.json + article glosses), prices and elements — and get an answer with the file, page and sentence it
     came from, plus actions: confirm the element, confirm the price, attach a regulation note. Muse Spark reads
     the package's own text and page renders; every answer is recorded and cited. This is the agentic layer.
2. **Stable data and models** — the firm's price list, species, rules and every run persisted in SQLite
   (`landsight.db`): projects → packages → runs → checks; a price-list page where the firm edits its own rates;
   every Meta call recorded with prompt, raw response, usage and seconds, replayable; `?live=1` exercised once end
   to end and its recording kept. The tower package (docs/PACKAGE.md v2) added as a second sample.
3. **Design** — not a restyle: a product designed for a landscape firm's owner. Benchmarks are named before a
   pixel is drawn (construction and CAD tools, not SaaS dashboards). Three directions as static mockups of the
   review screen and the flags board; Eric picks; then the app is rebuilt to that direction. The director mode
   becomes a presentation layer on top of the real screens, with camera moves (zoom, pan, dolly on the sheet)
   designed per scene, not a second UI.
4. **The tech stack, explained** — an architecture page (README + a diagram in the film): package → triage →
   sheets → geometry → Muse Spark (where and why) → SAM 3.1 (where and why) → cross-checks → rules → flags → the
   trace back to the drawing; the model table with call counts, seconds and cost; what is recorded and what is
   live.
5. **Script v5** — written from the four scenarios and the designed screens: cold open on the pain (the package
   as a folder of junk, the owner's week), the method in one line, then one scene per scenario, each with its
   own reveal, then the money and the trace, then the stack in fifteen seconds, then the close.
6. **Film v2** — captured from the designed app, cut in Remotion with the camera moves and effects the script
   calls for, narrated in USD, music and sound designed to the sound grammar.

## Checkpoints with Eric

- C1 Scenarios list confirmed (this file). Prices: Eric says use what we have; they are hypothetical by design.
- C2 Design direction picked from the three mockups.
- C3 Script v5 read before any capture.
- C4 Film v2 reviewed before submission.

## What stays from v1

The library (synth, dxf, geometry, meta, takeoff, rules, ingest, checks, bill, review), the fixtures, the
answer key, the tests, the research, the decisions, the narration pipeline, the capture pipeline. v1's film is
kept as `demo/film/landsight-v1.mp4` for reference.

## Addendum (Eric, 13:00): the project system

The product needs a folder/project system to be usable: Projects → packages (folders) → runs (history with
scoreboards). The backend has it (SQLite, D-61; endpoints in docs/API.md); the v2 frontend's home is the Projects
screen, and every review, Statement and ask-the-package answer is scoped to a run inside a project. The firm's
price list is shared across projects.
