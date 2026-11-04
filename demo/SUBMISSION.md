# Submission form: drafts for every field (2026-11-04)

The form has 24 fields. The first nine are read by judges; the rest is Meta's developer survey (not scored; answer it
honestly). Nothing below has been submitted. Every number matches the README and was checked on 2026-11-04 against
the test run, the offline reviews of the sample and the held-out package, the live runs in landsight.db
(docs/STACK.md has the call tables) and the open-reader and firm-memory recordings (docs/NEW-MODES.md). The film is
https://www.youtube.com/watch?v=ObB8pePCIAo; replace X_POST_URL before pasting.

## Team Name
`Landsight`

## Track (Eric's call)
- **Indie Developer Track** (recommended): one person, built Nov 1–4, judged on "creativity, technical ambition,
  and whether it works".
- Startups Track only if the project is entered under a company that owns it.

## Problem statement
**Build for Your World**: "Solve a problem you know firsthand, free up time and mental space, and make something
possible that wasn't before."

## Most Viral Track: X post link
X_POST_URL

Draft post:

> A developer's landscape package: 30 files. Backups, an old-format Excel quote, a zip, a slide deck, four versions
> of the bill. The bill prices 12 camphor trees. The drawing has 8.
>
> Landsight measures what's drawn with geometry, has Muse Spark read what geometry can't, lets Spark write SAM 3.1's
> prompts for the colour plan, checks the building code, and traces every number back to the drawing.
>
> 30 errors planted: 28 found, 2 flagged for a person, 0 missed. 3-minute film ↓
>
> Built in four days for the Meta Global AI Developer Hackathon. Repo in thread.

Thread reply 1: the repo link and "synthetic drawings, answer key in the repo". Reply 2: the gauge twist (the
tree-pit detail turns every large tree into a small one under the building code; changing one camphor to a second
native species passes). Reply 3: the honest bit: asked plainly, Muse Spark counted the eight camphors right; the
product's job is the routing, the measuring, the cross-checks and the trace.

## Project Description (main field)

**Landsight reviews a property developer's landscape package the way a design firm's estimator does, and shows where
every number came from.**

A landscape design firm has to check a developer's package before it can price the job: CAD sheets in two revisions,
backups, a scan, a coloured presentation plan, four versions of the Excel bill, an old-format quote, a zip of
details, a slide deck. By hand that takes weeks, and the misses are expensive: a bill that prices twelve trees where
the drawing has eight, or a tree-pit detail that quietly turns every large tree into a small one under the local
building code.

Drop the folder in and every file gets a verdict and a reason. Then the engineering around Meta's models does the
review:

- **Geometry first.** ezdxf and shapely close and measure every outline they can; only what geometry cannot settle
  goes to Muse Spark 1.3, as a crop plus the facts geometry measured.
- **Eleven Muse Spark call types, each with its own instructions and a JSON-schema response:** sheets and title
  blocks, text PDFs, pasted images, the plant schedule, the tree-pit detail, legends, a raster colour plan, misspelt
  bill rows, questions to the package. Where Spark reads an outline, grounding points trace its answer back to
  the drawing.
- **Two models chained.** Spark reads a coloured plan's legend and writes SAM 3.1's prompts; on a CAD render each
  mask is typed by the outline it lies in, and the same words on the line drawing are the control in every run
  (0 masks).
- **Three sources decide each count** (geometry, Spark, the plant schedule); anything a model proposed waits for a
  person to confirm.
- **The local building code is deterministic code with article references;** the model reads the inputs, it does
  not judge.
- **Ask the package:** retrieval plus one Spark call; every citation (file, page, verbatim quote) is checked against
  its source.
- **Every call is recorded** under a hash of its content plus the prompt and schema, so the exact run replays offline
  with no key; `--live` and `--fresh` re-ask any call.

Results, with the synthetic packages and their answer keys in the repo: on the 30-file sample with 30 planted errors,
28 found, 2 flagged for a person, 0 missed, 0 false alarms; on a held-out package (another layout and seed, reviewed
once live before any check was looked at against it), 10 of 11 found, 1 flagged, 0 missed, 0 false alarms. One live
review of the sample is 51 Meta calls (39 Muse Spark, 12 SAM 3.1), 106 s and $0.23 at list prices. 239 tests
pass offline.

Two opt-in modes go further with Meta's models:

- **Private mode on open weights.** Every Muse Spark call, images included, can run on Muse Spark Open
  (`meta-models/muse-spark-open-1026` on Baseten, or the firm's own vLLM or SGLang server), so confidential drawings
  can stay on infrastructure the firm controls; SAM 3.1 stays on Meta's API. One live parity review of the sample
  gave the same scoreboard (30 · 28 · 2 · 0 · 0, the same ids) in 141.8 s for $0.2253. The honest limit: it typed the
  open outline T-08 as a planter edge, so the eighth camphor is left as an unresolved item; self-hosting is untested.
- **Firm memory with Muse Wonder.** Wonder has no memory API, so the store is Landsight's: one deletable row per firm.
  Wonder distils the firm's confirm and dismiss decisions into habits; the next review orders and groups its findings
  by them, and Wonder drafts the reply to the developer in the firm's terms, with every id and number checked against
  its input. In the demo, habits learned from 16 decisions written for the sample put the tower's regulation and
  drawing points before the money, and the reply quotes the firm's own installed range.

Next: the open reader on the firm's own GPUs, and a screen for firm memory.

Why me: twelve years in traditional finance and seven in quant trading taught me not to trust a number I can't
trace; this was built in four days with an agent toolkit I run daily.

## Project Description (short version, if the field is capped)

Landsight reviews a property developer's landscape package (DXF and PDF drawings, scans, Excel bills) the way an
estimator does. Geometry measures what is exact; Muse Spark 1.3 reads what geometry cannot (eleven call types, each
with its own JSON schema; grounding points where it reads an outline) and writes SAM 3.1's prompts for
coloured plans; three sources decide each count and a person confirms what a model proposed; deterministic code checks
the local building code with article numbers; every call is recorded and replayable. Answer key in the repo: 30
planted errors, 28 found, 2 flagged for a person, 0 missed; held-out package: 10 of 11 found, 1 flagged, 0 missed.
One live review: 51 Meta calls, 106 s, $0.23.

Opt-in: a private mode on Muse Spark Open, Meta's open weights (the same scoreboard on the sample), and firm memory,
where Muse Wonder learns a firm's habits from its decisions and drafts its reply to the developer.

## Public GitHub Repository
`https://github.com/eric2612115/landsight-meta` (public; AGPL-3.0; the README opens with the
results, the Meta engineering and a two-terminal quick start)

## 3-Minute Demo Video
https://www.youtube.com/watch?v=ObB8pePCIAo. Part 1 illustrates real findings; Part 2 is the real product, with the
sample's Analyze step replaying a recorded run.

## Describe your use of Meta products to build the submitted project

Four Meta models: Muse Spark 1.3 and SAM 3.1 through the Meta Model API by default, and Muse Spark Open and Muse
Wonder in two opt-in modes, with the engineering around them in the open repo:

- **Muse Spark 1.3** (`muse-spark-1.3`; chat completions with vision and `response_format: json_schema`) does every
  reading: each sheet's kind, discipline, title block and drawing index; text PDFs and pasted images; the plant
  schedule, the tree-pit detail, the legend colours and a raster colour plan; an open outline geometry could not
  close, with grounding points; misspelt bill rows aligned to drawn items; questions put to the package. Eleven call
  types, each with its own instructions and JSON schema (`landsight/review/spark.py`, `landsight/meta/spark.py`,
  `landsight/ask/ask.py`).
- **SAM 3.1** (`sam-3.1`; the responses endpoint with `include_confidence`, one-bit masks decoded with Meta's
  `meta_sam_parser`) measures coloured areas: on the coloured CAD renders as a cross-check (−0.1% to −1.2% against
  the CAD on the pavings, lawn and azalea) and on a raster colour plan with no CAD behind it (`landsight/meta/sam.py`).
- **Chained:** Spark reads the legend and writes SAM's prompts; on a CAD render each mask is typed by the outline it
  lies in, never by the prompt; the same words on the line drawing are the control in every run (0 masks)
  (`landsight/meta/sam_plan.py`, `landsight/review/colour.py`).
- **Geometry first:** only what geometry cannot settle goes to Spark, as a crop plus the measured facts, under a
  per-sheet call budget (`landsight/takeoff/`).
- **Three sources and a person:** geometry, Spark and the schedule decide each count; anything a model proposed waits
  for a person (`landsight/takeoff/merge.py`, `landsight/review/pending.py`).
- **The building code in code:** deterministic rules with article references; the model reads the inputs, it does not
  judge (`landsight/rules/`, `landsight/data/rules.json`).
- **Ask the package:** BM25 retrieval plus one Spark call with page renders; every citation (file, page, verbatim
  quote) is checked against its source; proposed actions apply only when a person accepts them (`landsight/ask/`).
- **Recorded and replayable:** every call is stored under a hash of content plus prompt and schema
  (`tests/fixtures/`), replays offline with no key, and `--live` / `--fresh` re-ask any call. One fully live review
  of the sample: 51 calls (39 Spark, 12 SAM), 106 s, $0.23 at list prices; every pass so far $0.23–$0.28.

In the two opt-in modes:

- **Muse Spark Open** (`meta-models/muse-spark-open-1026` on Baseten's OpenAI-compatible endpoint; opt-in with
  `LANDSIGHT_READER=open`, `--reader open` or `?reader=open`): every Muse Spark call type, images included, with the
  same prompts and schemas; `LANDSIGHT_OPEN_BASE_URL` points it at a self-hosted vLLM or SGLang server. Its recordings
  are keyed by model id too (`tests/fixtures/open/`). Parity on the sample: the same 30 · 28 · 2 · 0 · 0 in 141.8 s
  for $0.2253; it typed T-08 as a planter edge (an unresolved item); self-hosting is untested
  (`landsight/review/spark.py`).
- **Muse Wonder** (`muse-wonder-1.0`; chat completions with a JSON schema): `firm_habits` distils a firm's confirm
  and dismiss decisions into habits, which Landsight stores in a deletable `firm_memory` row because the API has no
  memory store; `firm_reply` drafts the reply to the developer from the habits and the next run's findings, grouped
  with no model, and every id and number in the draft is checked against the input. `landsight memory …` and
  `/api/firms/{firm}/memory` (`landsight/memory/`).

## Why are Meta's models important to your solution?

Muse Spark's structured vision lets one model read everything in a drawing package that geometry cannot: sheet
titles and title blocks, notes, schedules, details, legends, scans, misspelt bill rows and the estimator's own
questions, each call type with its own instructions and JSON schema, so the answers feed code rather than prose.
SAM 3.1's promptable segmentation turns a coloured plan with no CAD behind it into square metres. Chained, Spark reads
the legend and writes SAM's prompts, so neither needs a detector trained per symbol or colour. The honest findings are
in the repo too: SAM returns nothing on line work (the control in every run shows 0 masks), and asked plainly, Muse
Spark counted the eight camphors right in every setup. So Landsight's value is the routing (geometry first, Spark only
where geometry cannot settle it, SAM only on colour), the exact measurement, the cross-checks against the bill and the
building code, and a trace from every number back to the drawing, at about a quarter of a dollar per full review.
Meta's open weights make a private mode possible: the same prompts on Muse Spark Open gave the same scoreboard, so a
firm can keep confidential drawings on infrastructure it controls. And Muse Wonder turns an estimator's decisions into
the firm's habits for the next package.

## Provide feedback from your experience using partner technologies

**Baseten** served Muse Spark Open (`meta-models/muse-spark-open-1026`) for the private mode. It worked as a drop-in:
the same OpenAI-compatible Chat Completions request as the Meta Model API, images as data URLs and
`response_format: json_schema`; the schema was honoured on all 39 calls of the parity review, at the same list prices
as Meta's ($1.25 / $0.15 / $4.25 per 1M input, cached and output tokens). What would help: listing structured outputs
in the model list (it names `json_mode` only, so the reader also unwraps an answer that comes back in a code fence).

## Survey (not scored; Eric's honest answers; suggestions)
- Likely to build with Meta Model API: Very likely / Somewhat likely.
- Opinion: Somewhat favorable (the API is OpenAI-shaped and cheap; SAM's output grammar needs a parser; no
  documented image-size limits; SAM silent on line drawings).
- Permission checkbox: tick (it is the same licence as the waiver).
- Recommend Meta Model API: 4. Recommend Muse Code: not used → leave blank or 3.
- Biggest obstacle: "A model capability we needed was missing" (SAM on line work) or "Finding clear documentation
  or code examples" (SAM prompt grammar, image limits).
- Compared with other models: "About the same" for Spark vision; SAM has no equivalent elsewhere.
- What matters most: Quality of the answers and code; then Easy integration.
- Hardest to switch: Our product is tuned to our current model's behavior and prompts.
- Would stop production use: Not sure Meta will keep supporting the API long term / Rate limits.

## For the film and the description to agree
Keep these the same everywhere (checked against the 2026-11-04 offline review): thirty files, thirty planted errors,
28 found · 2 flagged · 0 missed · 0 false alarms; the bill's 12 camphors against 8 drawn; 182 hedge plants; greening
(Art. 302) with T-08 confirmed: required 297.0, provided 261.1 before the tree-pit rule and 209.9 after (fail); the
fixes that pass: +7 camphors, or one camphor changed to a second native species; prices from the firm's own list
(one row marked sample).
