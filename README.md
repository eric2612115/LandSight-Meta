# Landsight

**Landsight reviews a landscape developer's drawing package the way a design firm's estimator does: it reads every
file, counts what is drawn, reads what is written, measures what is exact, checks the bill and the building code
against the drawings, and shows where every number came from before it goes into a quote.**

**Try it in a browser, no install:** https://landsight.co/try (the sample package on its recorded
run) · **The 3-minute film:** https://www.youtube.com/watch?v=NSSqXng9zfg

| | |
| --- | --- |
| ![Every file in the package gets a verdict](docs/img/try-package.jpg) | ![Every finding opens on the drawing it came from](docs/img/try-review.jpg) |
| ![Ask the package: an answer with its sources](docs/img/try-ask.jpg) | ![The change request, clouded and priced on the drawing](docs/img/try-request.jpg) |

## Contents

- [The Meta engineering](docs/META.md): what is built around Muse Spark 1.3, SAM 3.1, Muse Spark Open and Muse Wonder,
  with the code paths.
- [Run it locally](docs/GUIDE.md#quick-start-try-it-in-the-browser), [accuracy](docs/GUIDE.md#accuracy),
  [limits](docs/GUIDE.md#limits), [repository layout](docs/GUIDE.md#layout) and
  [the synthetic drawings](docs/GUIDE.md#synthetic-drawings-answer-key-in-the-repository).
- [Status and roadmap](docs/ROADMAP.md): what works today, what doesn't yet, what comes next and what a prize would
  pay for.
- [Two opt-in modes](docs/NEW-MODES.md): the private reader on Muse Spark Open and firm memory on Muse Wonder.
- [The stack](docs/STACK.md): every Meta call, its cost and latency, recording and replay.
- [The API](docs/API.md), [the decision log](docs/DECISIONS.md) and [a judge's playbook](docs/JUDGE-PLAYBOOK.md).

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
- **The 3-minute film:** https://www.youtube.com/watch?v=NSSqXng9zfg

## Status and plan

- **Works today:** the whole review on a 30-file package, the hosted product at
  [/try](https://landsight.co/try), 239 tests, the private mode on Muse Spark Open and firm memory
  on Muse Wonder (CLI and API). **Not yet:** real packages from working firms (synthetic only), native DWG, the two modes on the
  screen.
- **Next:** pilots with landscape design firms in Taiwan on a private deployment of Muse Spark Open, then the
  architecture and MEP firms that review the same packages.
- **Why it continues:** Landsight is meant to become a company. A prize would go into building it: the company itself,
  pilots on private deployments and the product work in [docs/ROADMAP.md](docs/ROADMAP.md).
- **Get in touch:** to bring Landsight to your country, to talk about funding, or to try it on your own packages,
  email **eric2612115@gmail.com**.

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

Two terminals, both at the repository root (Python 3.13 with uv, Node 24), with the command-line review and the tests before `serve`.

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
`pytest` runs the Python tests, all passing (about 4 minutes on a laptop, longer on a busy machine; the frontend's are `npm test` in frontend/); `serve` answers `GET /api/health` and prints its address only once
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
- **Nov 3–4.** The film; on Nov 4, the two opt-in modes (the private reader on Muse Spark Open, firm memory on
  Muse Wonder) and the submission. The decision log (docs/DECISIONS.md) records every choice made along the way
  with its trade-off.

## Licence

Copyright (C) 2026 Eric Fang.

Landsight is free software under the GNU Affero General Public License v3.0 (see [LICENSE](LICENSE)). To use it
without the AGPL's obligations — for example inside a closed-source or hosted commercial product — a commercial
licence is available from the author: open an issue or contact Eric Fang on GitHub (eric2612115).
