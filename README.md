# Landsight

**Landsight reviews a landscape developer's drawing package the way a design firm's estimator does: it reads every
file, counts what is drawn, reads what is written, measures what is exact, checks the bill and the building code
against the drawings, and shows where every number came from before it goes into a quote.**

## Quick start: try it in the browser

Python 3.13 with [uv](https://docs.astral.sh/uv/), Node 24. Two terminals, both starting at the repository root;
the last command in each keeps running, so leave both open.

**Terminal 1 — the API** (:8795):

```bash
uv sync
uv run python -m landsight serve --port 8795
```

**Terminal 2 — the frontend** (:5195):

```bash
cd frontend && npm ci && npm run dev
```

Open **http://localhost:5195/try**, then either:

- under "Try a sample:", click **Greenfield Residences** (site, 30 files) — or **Greenfield Tower**, which opens only
  while the API is running (on a fresh clone the first click reviews the sample from the recordings, about 10 s;
  later clicks open its latest run); or
- drop the package folder `samples/greenfield/Greenfield Residences — Landscape Package` (the inner folder, not
  `samples/greenfield`) onto the drop zone, or pick it with "Choose a folder…" (uploading needs terminal 1).

**No key needed** for the samples: their Muse Spark and SAM 3.1 answers are replayed from the recordings in
`tests/fixtures/review/`, `tests/fixtures/review/sam/` and `tests/fixtures/ask/`, offline, and so are the recorded
questions to the package. Dropping the sample folder replays the same recordings, because they are keyed by file
content. Without terminal 1 the Greenfield sample still opens, from the recorded copy in `frontend-mock/`.

**Needs `MODEL_API_KEY`** (the Meta Model API key, read from the API's environment only; set it in terminal 1
before `serve`, never in a file):

```bash
export MODEL_API_KEY=...        # never committed, never printed
uv run python -m landsight serve --port 8795
```

- a new package: a dropped folder is always reviewed from the recordings first, so on a package nobody recorded the
  model reads are missing; open the package at http://localhost:5195 and click `Review live` to ask Muse Spark and
  SAM 3.1 for them;
- a new question to the package (one with no recorded answer goes live and is recorded);
- `Review live` on any package, the sample included (it asks only what is not already recorded).

Without the key, these answer "live mode needs MODEL_API_KEY". More detail and troubleshooting:
[docs/JUDGE-PLAYBOOK.md](docs/JUDGE-PLAYBOOK.md).

## What it does

A developer sends a folder: CAD sheets in two revisions, a backup copy, a scanned PDF, a coloured presentation plan,
four versions of the bill of quantities, an Excel 97 file, a zip of metal details, a slide deck. A design firm checks
it by hand for weeks before it can price the job. Landsight drops the whole folder in, gives every file a verdict and
a reason, reads every sheet, takes the quantities off the CAD with geometry, asks Muse Spark only what geometry cannot
settle (an outline drawn as twelve loose lines, a plant schedule, a tree-pit detail, a misspelt bill row), lets SAM
3.1 find the coloured areas with words Muse Spark read off the legend, and then traces every disagreement: the bill
prices 12 camphor trees, the schedule says 12, the drawing shows 8.

Nothing a model says is counted until it agrees with the drawing or a person confirms it. The regulation check
(the national Building Technical Regulations §302 greening requirement, with the tree-pit rule for planting on a slab)
shows every term and the cheapest fixes, and stops at "the architect signs off". The sample package is synthetic,
built for this project with thirty planted errors and an answer key in the repository, so the result can be scored:

```
planted 30 · found 28 · flagged 2 · missed 0 · false alarms 0
```

(the two flagged for review are E15 and E18; the CLI prints them on the next line)

A held-out package, generated with another layout and a seeded subset of the errors (`landsight package <dir> --seed 7
--layout b`, samples/heldout) and reviewed once live before any check was looked at against it, scored:

```
planted 11 · found 10 · flagged 1 · missed 0 · false alarms 0
```

(H04, the protected-tree question, is the one flagged for review; nothing was missed). The tower package
(`--tower`, samples/tower: a 20-floor tower on six sheets) scores planted 10 · found 8 · flagged 2 · missed 0 · false alarms 0.
docs/STACK.md has the live pass, the calls and the cost.

## Meta models

| Model | What it does here | Calls on the sample package |
|---|---|---|
| **Muse Spark 1.3** (`muse-spark-1.3`) | Every reading call: each sheet's kind, discipline, title block and drawing index (`review_classify_sheet`, 22); each text PDF summarised and classified (`review_summarise`, 7); the two pasted images (`review_look_image`, 2); bill rows aligned to drawing items with a confidence (`review_align`, 1); the plant schedule (`read_schedule`, 1); the open outline T-08, with grounding points (`group_and_read`, 2); the tree-pit detail L-6 (`read_detail`, 1); the legend colours of L-1 and L-3 (`read_legend`, 2); the raster Presentation Plan's legend, labels and scale bar (`review_read_raster_plan`, 1); questions put to the package (`ask_package`, one per question) | 39, 144.9 s of call time |
| **SAM 3.1** (`sam-3.1`) | Colour prompts written from Muse Spark's legend read ("beige area" for PV-1 PERMEABLE PAVERS) on the coloured renders of L-1 and L-3, each mask typed by the outline it lies in; the controlled test: the same words on the line drawing (0 masks); the beds, lawn and lane measured on the raster Presentation Plan (no CAD behind it), each region typed by the label written inside it | 12, 24.9 s |
| **Recorded fixtures** | Every answer above was recorded from a real call (`tests/fixtures/review/`, `tests/fixtures/review/sam/`, `tests/fixtures/ask/`) and is replayed by default, offline, in about 10 s; `?live=1` (API) or `--live` (CLI) asks for what is not recorded; `--live --fresh N` (or `all`) re-asks recorded calls and prints the new response ids without touching the recordings (docs/STACK.md) | |

## Full walkthrough: CLI, tests and the review desk

The same two terminals as the quick start, with the command-line review and the tests before `serve`.

**Terminal 1 — the backend** (the last command keeps running; leave it open):

```bash
uv sync
uv run python -m landsight package /tmp/greenfield
uv run python -m landsight review "/tmp/greenfield/Greenfield Residences — Landscape Package" --fixtures
uv run pytest -q
uv run python -m landsight serve --port 8795
```

Or drag the folder onto the screen: `open /tmp/greenfield` (Finder hides /tmp), then drag `greenfield` onto the drop
zone at http://localhost:5195. The screen uploads its files to the API (out/uploads/, at most 100 MB and 500 files),
reviews them offline and shows the same scoreboard. Drag only the package folder and the scoreboard stays empty: the
answer key sits next to it.

**Terminal 2 — the frontend** (keeps running too):

```bash
cd frontend
npm ci
npm run dev
```

Then open:

- http://localhost:5195 — the product: the sheets, the take-off, the disagreement with its Confirm button, every
  check, the rules, the files and the scoreboard (the first load opens the sample package, about 10 s). Click
  Confirm on the camphor row; the tally turns green.
- http://localhost:5195/?director=1&auto=1 — the film's scenes played by the app itself, on the same Run: the drop,
  the drawing waking up, the eye, hedge math, lines to colour, the gauge (twice), the bill traced, twelve again.
  Space steps scene by scene; `#scene=eye` jumps to one.

What each step shows: `package` writes the 30-file package, the firm's price list and the answer key (it overwrites
an earlier copy in the same folder); `review` prints every file verdict, the 22 sheets it read (20 DXF and vector
PDF pages, 2 raster pages read for their title blocks), the 12 take-off items (8 from the CAD, 4 measured by SAM 3.1 on
the raster plan, awaiting confirmation), 71 checks and the scoreboard line above;
`pytest` runs the Python tests, all passing (about 1–2 minutes; the frontend's are `npm test` in frontend/); `serve` answers `GET /api/health` and prints its address only once
it is listening. Without the backend the screen falls back to `frontend-mock/` (the same Run, recorded); the corner
toggle says which (`live`, `repo mock`).

**Ports.** If 8795 is busy, `serve` says so in one line and exits; start it on another port and tell the frontend:
`uv run python -m landsight serve --port 8796` in terminal 1, `VITE_API_PORT=8796 npm run dev` in terminal 2. If
5195 is busy, Vite takes the next free port and prints it (or pin one: `npm run dev -- --port 5197`); open the URL it
prints.

**Live models.** `?live=1` needs `MODEL_API_KEY` in the backend's environment (terminal 1):

```bash
export MODEL_API_KEY=...                            # the Meta Model API key; never committed, never printed
uv run python -m landsight serve --port 8795
curl -X POST "http://localhost:8795/api/package/open?live=1"     # from another terminal; then reload the page
```

The CLI does the same with `uv run python -m landsight review <package> --live`. A live pass asks only what is not
already recorded for the same content and prompt; delete the recordings in `tests/fixtures/review/` to ask everything
again (about 46 calls, under a minute with six in parallel).

More detail and troubleshooting (ports, Node version, the key): [docs/JUDGE-PLAYBOOK.md](docs/JUDGE-PLAYBOOK.md).

## Accuracy

The take-off alone on the synthetic site at five messiness levels, from `uv run python scripts/eval.py --fixtures`
(recorded Muse Spark answers). Messiness: `g40` = gaps of up to 40 cm between a canopy's pieces, `x` = canopies as
exploded LINE entities, `chaos` = layers named at random, `typ` = one "typ." label for a row of trees, `mismatch` =
the schedule disagrees with the drawing. Trees and hedge are proposed / quoted (`-` = flagged, waiting for a person).

| level | messiness | Camphor (8) | Duranta (182) | count error | area error % | flagged | wrongly confident | Spark calls |
|---|---|---|---|---|---|---|---|---|
| m0 | g0-p-clean-typ | 8/8 | 182/182 | 0 | 0.0 | 0 | 0 | 4 |
| m1 | g5-x-clean-group | 8/8 | 182/182 | 0 | 0.0 | 0 | 0 | 4 |
| m2 | g10-x-chaos-typ | 8/8 | 182/182 | 0 | 0.0 | 0 | 0 | 4 |
| m3 | g20-x-chaos-none | 8/8 | 182/182 | 0 | 0.0 | 0 | 0 | 4 |
| m4 | g40-x-chaos-typ | 8/- | 182/182 | 0 | 0.0 | 1 | 0 | 5 |
| m4 + dispute | g40-x-chaos-typ-mismatch | 8/- | 182/182 | 0 | 0.0 | 1 | 0 | 5 |

"Wrongly confident" is the number that must stay 0: an item agreed and quoted with a quantity the answer key does
not have. On the full package the review scores 28 of 30 planted errors found, 2 flagged for review, none missed,
no false alarms. SAM 3.1's areas against the CAD on the coloured renders: −0.3% to −1.2% on the three pavings,
lawn and azalea; +4.5% on the eight canopies (the CAD area governs; SAM is the cross-check a coloured PDF without CAD
would need).

## Layout

```
landsight/
  ingest/      triage: every file a verdict and a reason (extension, content, Muse Spark), archives unpacked
  dxf/         DXF reading (ezdxf); renders: SVG as it prints, PNG for the models, the coloured render for SAM
  geometry/    loose segments joined and closed, areas and lengths, legend / title-block regions, labels
  takeoff/     geometry first; Muse Spark for what geometry cannot close; the schedule; three sources, one answer
  review/      the package review: sheets, pre-pass, take-off, colour (Spark legend → SAM), bill rows, scoreboard
  checks/      cross-file checks: quantity, revision, sheet, scale, area, regulation, protected tree, document
  bill/        the bill reader (openpyxl), Muse Spark alignment, bill against drawing and the firm's price list
  rules/       §302 greening with the §5 table 1 tree-pit rule, protected trees, with citations
  meta/        Muse Spark and SAM 3.1 clients, recording and replay
  synth/       the synthetic site and the sample package generator (30 files, 30 planted errors, answer key)
  app/         FastAPI on :8795, the API of docs/API.md
  data/        species, sourced unit prices, paving, rules.json with every constant's source
frontend/      Vite + React: projects (/), review, statement, price list, ask; director mode (/review?director=1)
frontend-mock/ the API's real responses for the sample package, with every image (the screen's offline source)
samples/       greenfield/: the sample package, the firm's price list and the answer key
tests/         pytest; fixtures/: the recorded Meta answers
scripts/       eval.py (the accuracy table), frontend_mock.py, recording scripts
docs/          API, DECISIONS, PLAN, PACKAGE, JUDGE-PLAYBOOK, research/
demo/          the film's script, design brief and Remotion project
spike/         the 2026-11-01 probes that fixed the division of labour (D-03)
```

## Built Nov 1–4, 2026

Everything in this repository was written during the Meta Global AI Developer Hackathon, November 1–4, 2026:

- **Nov 1.** Spikes: how geometry, Muse Spark and SAM 3.1 each see a messy planting plan (the division of labour,
  D-03); research on the national greening and tree-protection rules, drawing conventions and the Meta Model API; the
  plan and the first script.
- **Nov 2.** The core library (synthetic site, DXF reading, geometry, Muse Spark, take-off); the rules with real
  citations; the SAM 3.1 probe; data tables with sourced prices; the sample package generator (thirty files, thirty
  planted errors); the review (ingest, sheet reading, the pre-pass, checks, the bill reader, the scoreboard); grounding
  points, Muse Spark writing SAM's prompts, the controlled SAM test and the tree-pit downgrade; the FastAPI backend
  serving the sample package; the React product and director mode; the brand; the film pipeline (Remotion, narration,
  captures from the app).
- **Nov 3–4.** The film and the submission. The decision log (docs/DECISIONS.md) records every choice made along
  the way with its trade-off.

## Synthetic drawings, answer key in the repository

The drawings, bills and documents are synthetic: generated by `landsight/synth` for this project, in English, for an
invented project (Greenfield Residences). The answer key (`samples/greenfield/answer_key.json`) lists every
planted error and every true quantity; the scoreboard is computed against it, and the app never reads it for anything
else. The firm's price list (`samples/greenfield/firm price list.csv`) comes from published public budgets, each row
naming its source, except the row marked `sample`; the app tags every price check "prices from the firm's own list".

## Licence

Copyright (C) 2026 Eric Fang.

Landsight is free software under the GNU Affero General Public License v3.0 (see [LICENSE](LICENSE)). To use it
without the AGPL's obligations — for example inside a closed-source or hosted commercial product — a commercial
licence is available from the author: open an issue or contact Eric Fang on GitHub (eric2612115).
