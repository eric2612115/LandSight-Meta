# Landsight

**Landsight reviews a landscape developer's drawing package the way a design firm's estimator does: it reads every
file, counts what is drawn, reads what is written, measures what is exact, checks the bill and the building code
against the drawings, and shows where every number came from before it goes into a quote.**

## At a glance

- **What and for whom:** a review desk for landscape design firms that price a property developer's landscape package
  (DXF and PDF drawings, scans, Excel bills). It counts and measures what is drawn, cross-checks the bill against the
  drawings and the firm's price list, checks the local building code, and traces every number to the drawing.
- **Answer key** (synthetic packages, keys in the repository): of 30 errors planted in the 30-file sample package,
  **28 found, 2 flagged for a person, 0 missed**, 0 false alarms.
- **Held-out package** (another layout and seed, reviewed once live before any check was looked at against it):
  11 planted, **10 found, 1 flagged for a person, 0 missed**, 0 false alarms.
- **One live review** of the sample: 51 Meta calls (39 Muse Spark 1.3 + 12 SAM 3.1) in **106 s** with six calls in
  parallel, **$0.23** at list prices (every pass on the sample so far: $0.23–$0.28).
- **Two opt-in modes:** a private mode that runs every Muse Spark call on **Muse Spark Open**, Meta's open weights
  (the same scoreboard on the sample, $0.2253 for the review), and **firm memory**, where **Muse Wonder** learns a
  firm's habits from its estimator's decisions and drafts the next reply to the developer in the firm's terms.
- **Offline by default:** every Meta answer is recorded and replays with no key; **239 Python tests pass**
  offline (`uv run pytest -q`).
- **The 3-minute film:** FILM_URL

## Meta models: what is engineered around Muse Spark 1.3, SAM 3.1, Muse Spark Open and Muse Wonder

By default two models run through the Meta Model API. **Muse Spark 1.3** (`muse-spark-1.3`) does every reading: chat
completions with vision and a JSON schema. **SAM 3.1** (`sam-3.1`) segments coloured plans: the responses endpoint,
masks decoded with Meta's `meta_sam_parser`. Two opt-in modes add **Muse Spark Open** and **Muse Wonder** (after the
list). The calls are the small part; this is what is built around them, each with the code that does it:

- **The two models are chained: Spark writes SAM's prompts.** Muse Spark reads a coloured plan's legend box
  (`read_legend`) and names each swatch's colour; those words become SAM 3.1's prompts ("beige area" for PV-1
  PERMEABLE PAVERS), and on a CAD render each mask is typed by the outline it lies in, never by the prompt. The same
  words on the plain line drawing are the control in every run (0 masks).
  Code: [`landsight/meta/sam_plan.py`](landsight/meta/sam_plan.py), [`landsight/review/colour.py`](landsight/review/colour.py)
- **Every call type has its own instructions and a JSON-schema response.** Each of the eleven Muse Spark call types
  the review and Ask use, and Muse Wonder's two, has its own prompt and `response_format: json_schema`
  (`additionalProperties: false`; every field required except the optional grounding points), so a reply parses with
  `json.loads` and nothing else.
  Code: [`landsight/review/spark.py`](landsight/review/spark.py), [`landsight/meta/spark.py`](landsight/meta/spark.py), [`landsight/ask/ask.py`](landsight/ask/ask.py), [`landsight/memory/habits.py`](landsight/memory/habits.py)
- **Geometry runs first; the model sees only the crop it needs, plus measured facts.** ezdxf and shapely close and
  measure every outline they can. Only an outline geometry cannot close goes to Spark: a crop with that candidate
  drawn in red, sent with what geometry measured (pieces, gaps, size, length, the area of the closed canopies near
  it), under a per-sheet call budget.
  Code: [`landsight/takeoff/pipeline.py`](landsight/takeoff/pipeline.py) (`candidate_crop`), [`landsight/takeoff/merge.py`](landsight/takeoff/merge.py) (`needs_spark`, `candidate_facts`), [`landsight/geometry/`](landsight/geometry/)
- **Grounding points trace each answer back to the drawing.** `group_and_read` returns up to 12 points (0–1000 on the
  crop); they are clamped, mapped to crop pixels and drawing metres, and drawn on the screen's callout.
  Code: [`landsight/meta/spark.py`](landsight/meta/spark.py) (`ground_points`)
- **Three sources decide each count; pending items wait for a person.** Geometry, Muse Spark and the plant schedule
  are reconciled per item, and an item is agreed only when every source gives the same number. A tree Spark proposed
  for an open outline stays out of the greening sum and the schedule check until a person confirms it.
  Code: [`landsight/takeoff/merge.py`](landsight/takeoff/merge.py), [`landsight/review/pending.py`](landsight/review/pending.py)
- **Building-code checks are deterministic code with article references.** The greening formula, the tree-pit rule
  for planting on a slab, the fire lane, water retention and corridor widths are Python, each constant cited (article,
  source, date read) in `rules.json`. The model reads the inputs (the tree-pit detail, floor titles, soil notes); it
  does not judge.
  Code: [`landsight/rules/`](landsight/rules/), [`landsight/checks/regulation.py`](landsight/checks/regulation.py), [`landsight/data/rules.json`](landsight/data/rules.json)
- **Ask the package.** BM25 retrieval over the package's own PDFs, bill rows, title blocks, rules and prices, then one
  Muse Spark call with the relevant page renders. Every citation (file, page, verbatim quote) is checked against its
  source; proposed actions (confirm an item or a price, a regulation note, a flag) apply only when a person accepts
  them.
  Code: [`landsight/ask/`](landsight/ask/)
- **Every call is recorded and replayable.** A Spark answer is stored under a hash of its content (DXF signature, PDF
  text or image bytes) plus a hash of the prompt and schema as sent, so a changed prompt is never answered by an old
  recording; SAM's under the image hash plus the phrase. A missing recording fails; nothing is invented.
  Code: [`tests/fixtures/`](tests/fixtures/), [`landsight/review/spark.py`](landsight/review/spark.py) (`_prompt_tag`)
- **The live and fresh flags re-ask any call.** `--live` (CLI) or `?live=1` (API) asks what is not recorded;
  `--fresh N` or `--fresh all` re-asks recorded calls, uses the new answers in that run and saves them beside the
  recordings with their response ids, never over one.
  Code: [`landsight/review/cli.py`](landsight/review/cli.py), [`landsight/review/spark.py`](landsight/review/spark.py)

**Two opt-in modes**, off by default; each has its own recordings that replay offline with no key
([docs/NEW-MODES.md](docs/NEW-MODES.md)):

- **Private mode on open weights: Muse Spark Open** (`meta-models/muse-spark-open-1026`, served by Baseten). Every
  Muse Spark call type, images included, goes to Meta's open-weight model with the same prompts and JSON schemas, so
  confidential drawings can stay on infrastructure the firm controls; SAM 3.1 stays on the Meta Model API. Switch it on
  with `LANDSIGHT_READER=open`, `--reader open` or `?reader=open`; `LANDSIGHT_OPEN_BASE_URL` points it at a
  self-hosted vLLM or SGLang server instead. Its recording keys end in the model id, so one model's answer never
  replays as another's. **Parity:** one live review of the sample (39 Spark calls on Baseten, 12 SAM calls replayed)
  gave the same scoreboard as the API reader, 30 · 28 · 2 · 0 · 0 with the same ids (E15, E18), in 141.8 s for
  $0.2253. It read one thing less well: it typed the open outline T-08 as a planter edge, so the eighth camphor is
  left as an unresolved item instead of a proposed tree.
  Code: [`landsight/review/spark.py`](landsight/review/spark.py) (`reader_name`, `open_endpoint`), [`tests/fixtures/open/`](tests/fixtures/open/)
- **Firm memory: Muse Wonder** (`muse-wonder-1.0`). Wonder has no memory API, so the store is Landsight's: one
  deletable `firm_memory` row per firm. Wonder distils the firm's confirm and dismiss decisions into habits (what to
  send back and in what order, what to keep internal, the pricing tolerance, plant substitutions, the reply's voice).
  The next review orders and groups its findings by those habits with no model, and Wonder drafts the reply to the
  developer in the firm's terms; every finding id and number in the draft is checked against Wonder's input. In the
  demo, 16 decisions written for the sample (distilled in 21.4 s, about $0.07) reorder the tower's nine findings so
  the regulation and drawing points come before the money, and the reply quotes the firm's own installed range
  (13.0 s, about $0.04). Use it with `landsight memory …` or `/api/firms/{firm}/memory`.
  Code: [`landsight/memory/`](landsight/memory/)

Next: the open reader on the firm's own GPUs (the same code with another base URL, not yet tested) and a screen for
firm memory (its API is ready).

Every Meta call in one fully live review of the sample package with the default reader (run `982d4843e6c9`,
2026-11-02 09:16 UTC, through the product API with `?live=1&fresh=all`: all 51 calls asked live, nothing replayed;
[docs/STACK.md](docs/STACK.md) §4):

| Call | Model | What it reads | Calls | Median s | Cost (USD) |
|---|---|---|---:|---:|---:|
| `review_classify_sheet` | Muse Spark 1.3 | each sheet: kind, discipline, title block, drawing index | 22 | 3.94 | 0.1187 |
| SAM segment | SAM 3.1 | coloured areas, prompted with Spark's colour words; the line-drawing control; the raster plan | 12 | 1.79 | 0.0300 |
| `review_summarise` | Muse Spark 1.3 | each text PDF: kind, summary, key facts, deliverables | 7 | 4.19 | 0.0313 |
| `review_look_image` | Muse Spark 1.3 | each pasted image: material photo or drawing, the finish code | 2 | 4.33 | 0.0059 |
| `group_and_read` | Muse Spark 1.3 | an outline geometry could not close, with measured facts; grounding points | 2 | 5.64 | 0.0159 |
| `read_legend` | Muse Spark 1.3 | a coloured render's legend: colour word, label, kind | 2 | 4.22 | 0.0076 |
| `read_schedule` | Muse Spark 1.3 | the plant schedule table | 1 | 4.09 | 0.0036 |
| `read_detail` | Muse Spark 1.3 | the tree-pit detail: pit size, soil depth, on a slab or not | 1 | 3.79 | 0.0026 |
| `review_align` | Muse Spark 1.3 | misspelt bill rows to drawn items, with confidence | 1 | 5.45 | 0.0058 |
| `review_read_raster_plan` | Muse Spark 1.3 | the raster colour plan: area types, labels, legend, scale bar | 1 | 12.30 | 0.0110 |
| **all** | | | **51** | | **0.2324** |

39 Muse Spark calls (174.4 s of call time) and 12 SAM 3.1 calls (23.2 s): 106.2 s wall with six calls in parallel;
100,432 input and 29,290 output tokens. Every pass on the sample has cost $0.23–$0.28: the CLI's fully live pass took
113.0 s for $0.2613, and the recordings replayed by default (most recorded on Nov 3) total $0.2735. Other packages
add `review_read_floor_sheet` (one call per sheet titled by floor, about $0.008), and each question to the package
is one `ask_package` call (about $0.01).

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

(Port 8795 or 5195 already taken? See **Ports** under the full walkthrough: `serve --port 8796` in terminal 1,
`VITE_API_PORT=8796 npm run dev` in terminal 2, and open the URL Vite prints.)

Open **http://localhost:5195/try**, then either:

- under "Try a sample:", click **Greenfield Residences** (site, 30 files) — or **Greenfield Tower**, which opens only
  while the API is running (on a fresh clone the first click reviews the sample from the recordings, about 10 s;
  later clicks open its latest run); or
- drop the package folder `samples/greenfield/Greenfield Residences — Landscape Package` (the inner folder, not
  `samples/greenfield`) onto the drop zone, or pick it with "Choose a folder…" (uploading needs terminal 1).

**No key needed** for the samples: their Muse Spark and SAM 3.1 answers are replayed from the recordings in
`tests/fixtures/review/`, `tests/fixtures/review/sam/` and `tests/fixtures/ask/`, offline, and so are the recorded
questions to the package. Dropping the sample folder replays the same recordings, because they are keyed by file
content. In Review, the Ask tab lists the six recorded questions on the Greenfield package; click one for an answer
with its sources. Without terminal 1 the Greenfield sample still opens, from the recorded copy in `frontend-mock/`.

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
(the local building code's greening requirement, Art. 302, with the tree-pit rule for planting on a slab)
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
`pytest` runs the Python tests, all passing (about 2–4 minutes; the frontend's are `npm test` in frontend/); `serve` answers `GET /api/health` and prints its address only once
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
already recorded for the same content and prompt; add `--fresh all` to ask everything again (51 calls on the sample,
106–113 s with six in parallel): the new answers go to `fresh/` beside the recordings, which are never overwritten.

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
no false alarms. SAM 3.1's areas against the CAD on the coloured renders: −0.1% to −1.2% on the three pavings,
lawn and azalea; +5.3% on the eight canopies (the CAD area governs; SAM is the cross-check a coloured PDF without CAD
would need).

## Limits

- **Validated on synthetic packages plus one held-out package.** The sample, the tower and the held-out package are
  generated by `landsight/synth`, and the same author wrote the checks. The held-out package (another layout and seed,
  reviewed once live before any check was looked at against it) is the counter: the checks were not tuned on it, but
  it is not independent real-world data.
- **DWG must be converted to DXF first.** A `.dwg` file gets the verdict "save as DXF to be read"; Landsight reads DXF,
  PDF (vector, raster and text), pasted images and `.xlsx` bills, and unpacks zips.
- **Only the implemented articles of the local building code are checked:** greening (Art. 302) with the tree-pit rule
  for planting on a slab, the fire-lane deduction (Art. 299, only when the architect declares it), water retention
  (Art. 305, computed but outside every answer key), corridor widths (Art. 92), the soil-depth table for planting on
  a slab, protected trees and the green-building document checklist. A regulation result is a review, not legal
  advice: a licensed architect signs off.
- **The price list is a sample.** The firm's list for the sample has seven rows: six cite a published public
  budget, one (marked `sample`) is estimated from the nearest published item; no firm set these prices.
- **The film:** Part 1 illustrates real findings; Part 2 is the real product, and the sample's Analyze step replays a
  recorded run (asked live, the same review takes about two minutes).
- **Private mode was checked by one live pass on the sample.** It found and flagged the same planted errors but read
  T-08 as a planter edge, which leaves an unresolved item (the CLI exits 1 on that run). Only the sample has open
  recordings. SAM 3.1 still runs on the Meta Model API: for a strictly private run leave `MODEL_API_KEY` unset, and a
  colour cross-check with no SAM recording is skipped. Self-hosting is untested.
- **Firm memory's demo decisions are invented.** The sample firm's 16 decisions were written for the demo. Grouping
  matches categories, scenarios and title keywords literally, so a kind of finding the firm never decided on goes to
  "Other … points"; one substitution habit did not carry to the tower. Muse Wonder is in preview, and its reply is a
  draft for a person: nothing is sent.
- **"Fix" items are suggestions.** Landsight lists the cheapest ways to pass the greening check (more trees, a species
  swap, more shrub bed) with what each one provides; it does not edit drawings.

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
  memory/      firm memory: Muse Wonder distils a firm's decisions into habits; grouping; the reply's checks
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
