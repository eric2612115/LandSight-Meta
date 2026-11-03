# The stack, explained (2026-11-02)

One folder in, one Run out; every Meta call recorded, replayable and countable. Numbers below are from
`landsight.db` (`uv run python -m landsight db calls --run <id>`), the recordings in `tests/fixtures/`, the test runs of
2026-11-02 and the Meta Model API's list prices in docs/research/metaApi.md (Muse Spark 1.3 standard: $1.25 / 1M input
tokens, $0.15 / 1M cached, $4.25 / 1M output; SAM 3.1: $2.50 / 1,000 image calls). Times are given in UTC with local time
(UTC+8) in brackets.

## 1 Landsight in one paragraph

A landscape developer's folder goes in: CAD sheets in two revisions, a `.bak`, a scanned PDF, a coloured presentation
plan, four versions of the bill of quantities, an Excel 97 file, a zip of metal details, a slide deck (30 files in the
sample). One Run comes out: a verdict and a reason for every file, every sheet read and classified, the take-off (what
is drawn, counted by geometry, read by Muse Spark where geometry cannot close an outline, measured by SAM 3.1 where
there is colour and no CAD), the checks across files (schedule vs drawing, bill vs drawing, bill vs the firm's price
list, revisions, scale, the building code), each check in one of four scenarios (quote, regulation, design, format),
a scoreboard against the package's answer key, and a Statement that reconciles the bill as submitted with what the
drawings support. Every number traces back to a file, a sheet, an object or a bill cell, and nothing a model proposed
counts until a person confirms it. It is for a landscape design firm's estimator deciding whether to take a job and
what to price it at; questions about the package are answered from its own PDFs, bills, title blocks, rules and
prices, with verified quotes.

## 2 The architecture in one picture

```
 a developer's folder (DXF, PDF, XLSX, XLS, ZIP, BAK, PNG, PPTX …)
   │  by path (POST /api/package/open, POST /api/projects/{id}/packages) or dropped on the screen
   │  (POST /api/projects/{id}/packages/upload: multipart, streamed, path rules, caps 500 files · 50 MB · 100 MB,
   │   content-addressed under out/uploads/<hash>/, the same bytes twice → the same package; D-81, D-82)
   ▼  landsight/ingest        walk · unpack · verdict per file (ext / content / Muse Spark)
 triage ───────────────────────────────────────────────────────────────── format catches
   │
   ▼  landsight/review/sheets every DXF sheet and PDF page rendered
 sheets ── Muse Spark: review_classify_sheet (kind, discipline, title block, drawing index)        ┐
   │       Muse Spark: review_read_floor_sheet (floors, ground, soil) — sheets titled by floor     │ why Spark: it reads
   │       Muse Spark: review_summarise (text PDFs) · review_look_image (pasted photos)             │ what geometry cannot:
   ▼  landsight/geometry + landsight/takeoff (geometry before any model)                           │ titles, notes, tables,
 take-off ─ geometry closes outlines, measures areas, counts rows                                  │ loose line work
   │        Muse Spark: group_and_read (what geometry could not close, with measured facts),       │
   │        read_schedule, read_detail (the tree pit)                                              ┘
   │        × floors for a typical-floor sheet (landsight/checks/tower)
   ▼  landsight/review/colour + raster
 colour ── Muse Spark: read_legend / review_read_raster_plan → colour words → SAM 3.1 prompts      ┐ why SAM: areas on a
   │       SAM 3.1: masks on the coloured render (vs CAD) and on the raster Presentation Plan     ┘ picture with no CAD
   ▼  landsight/bill  (Muse Spark: review_align — bill rows to drawn items, with confidence)
 cross-checks: schedule vs drawing · bill vs drawing · bill vs the firm's price list (landsight.db) · arithmetic ·
   │           hidden sheets · revisions · overlaps · label vs hatch · scale · index · floors · soil · look-alikes
   ▼  landsight/rules + landsight/checks/regulation      rules.json, every constant cited
 rules: §299 fire lane (conditional) · §302 greening (pit downgrade, old-tree fix) · §305 water retention ·
   │    artificial-ground soil table · municipal tree protection · the green-building checklist
   ▼  landsight/review/pending      nothing a model proposed counts until a person confirms it
 flags: Check[] with scenario (quote · regulation · design · format), evidence (files, sheets, objects, bill cells)
   │    and the trace back to the drawing; the answer key scores them (landsight/review/score)
   ▼  landsight/store → landsight.db          projects · packages · runs · checks · decisions · confirmations ·
   │                                          price_list · species · rules · asks · meta_calls
   │   decisions: POST /api/runs/{id}/checks/{check}/decision (confirm · dismiss · open, a note; D-78)
   │   the runs listing: GET /api/packages/{id}/runs (scoreboard, scenario counts, seconds, calls per run)
 the API (landsight/app, :8795) ── the screen (frontend/, :5195): / projects · /open · /review · /statement · /prices
   │
   └─ ask the package (landsight/ask): BM25 over the package's own PDFs, bill rows, title blocks, rules, prices
      and checks → Muse Spark: ask_package (one call, page renders attached, JSON schema) → answer + cited quotes
      (each checked against its source) + actions (confirm element / price, regulation note, flag) → landsight.db
      the dock: a recorded answer replays; a question with no recording is re-sent with ?live=1 (D-80)
```

## 3 The Meta models — where, why and how

### Muse Spark 1.3 (`muse-spark-1.3`)

`POST https://api.meta.ai/v1/chat/completions` (landsight/meta/spark.py, landsight/review/spark.py, landsight/ask/ask.py).
Each schema call is a system message and one user message whose content is the prompt text plus every image as a data
URL (meta/spark.py writes `data:image/png;base64,…`; review/spark.py writes `image/jpeg` when the bytes say so). The
schema-less `ask` baseline sends the user message alone. The answer shape is forced with
`response_format: {type: "json_schema", json_schema: {name: <call>, schema}}`; every schema sets
`additionalProperties: false` and lists every field as required, with one exception (`group_and_read` leaves `points`
optional, as grounding), so a reply is parsed with `json.loads` and nothing else. `reasoning_effort` is `"low"` on every call; output tokens below include the reasoning. Grounding points:
`group_and_read` asks for up to 12 `{x, y}` points on the candidate's red segments, normalised 0–1000 on the crop (x
from the left, y from the top); `ground_points()` clamps out-of-range values, as the Meta docs ask, and maps them to crop
pixels and drawing metres (the screen draws them on the callout). The API key is read from `MODEL_API_KEY` and never
logged or written.

| Prompt (call name) | Module | What it is shown | What it returns | Where it is used |
|---|---|---|---|---|
| review_classify_sheet | review/spark.py | one whole sheet (PNG) | kind (plan · elevation · detail · schedule · legend · cover · background), discipline, enlarged_partial, match_line, title block (number, title, revision, date, scale), the drawing index, confidence, why | every DXF sheet and PDF page |
| review_read_floor_sheet | review/spark.py | a sheet whose title names floors | floors, typical, floor_label, ground (grade · over_basement · podium · balcony · roof · mixed · unknown), every soil depth written | the tower |
| review_summarise | review/spark.py | a text PDF's text (to 12,000 characters, no image) | spec · quote · bill · document, title, summary, up to six key facts, listed deliverables with status | every text PDF |
| review_look_image | review/spark.py | a pasted image | material_photo · drawing · document · other, the material, the finish code it matches | pasted PNGs |
| review_align | review/spark.py | the drawn items and the bill rows (text, no image) | one item code per bill row (or none) with confidence and why | the bill checks |
| review_read_raster_plan | review/spark.py | a coloured raster page | every area type and plant symbol with a colour word, labels' positions, the legend box, the scale bar's ends and its distance, the title scale | the Presentation Plan |
| group_and_read | meta/spark.py | a crop with each open candidate drawn in red and tagged, plus the facts geometry measured | per candidate: is_one_object, kind, label_text, label_meaning, implies_count, confidence, why, points | the take-off (T-08) |
| read_schedule | meta/spark.py | the plant schedule table | rows (species, qty, unit, spec) and the totals line | the take-off |
| read_legend | meta/spark.py | the legend box of a coloured render | per entry: swatch_colour_word, label, kind (area · symbol · line) | SAM's prompts |
| read_detail | meta/spark.py | the tree-pit detail sheet | pit_w_m, pit_l_m, soil_depth_m, on_slab, why | the §302 pit rule |
| ask_package | ask/ask.py | the question, the top 14 chunks, up to two page renders | answer, citations (file_id, page, verbatim quote ≤ 30 words), proposed_actions, confidence | the Ask dock and `landsight ask` |

meta/spark.py also holds `classify_sheet` (the take-off's own five-kind classifier; the review hands the take-off its own
classification instead, so no second call is made) and `ask` (a plain call without a schema: the naive baseline of
scripts/naive_probe.py).

### SAM 3.1 (`sam-3.1`)

`POST https://api.meta.ai/v1/responses` (landsight/meta/sam.py): one user message with an `input_text` (one noun
phrase) and an `input_image` (a data URL), `metadata: {include_confidence: "true", mask_encoding: "one_bit"}`. One
phrase per request, never retried; a miss is an empty text. The answer is a token stream in `output[].content[].text`,
one record per match: `<|box;x1=…;y1=…;x2=…;y2=…;w=…;h=…;c=…|>` (source pixels, x2/y2 inclusive, w/h the image size, c
the confidence) followed by `<|mask;…;data=H,W,!payload|>` (a box-local raster, base85; `!` one_bit, `~` lossless).
Masks are decoded with Meta's own parser package `meta_sam_parser` (`image_segmentation_format().create_parser()`,
`decode_mask_to_raster`), resampled nearest-neighbour onto the box when the raster size differs, and a mask's area is
its set pixels × the sheet's metres per pixel. Every recording from 2026-11-02 keeps the response envelope and its id
(`resp_…`).

Where it runs and why: on the coloured render of each counted DXF plan that has a legend box (L-1 Rev B, L-3 on the
sample) and on the raster Presentation Plan (a picture with no CAD behind it); never on line work. The 2026-11-01 spike
(D-03) returned no boxes for "tree", "tree symbol", "circle", "rectangle" or "text label" on a rendered CAD line
drawing at any line weight, nor on a simulated scan, while a filled render answered "circle" at 0.965. The review keeps
that as a controlled test in every run (D-48): the same phrase Spark wrote is sent to the coloured render and to the
plain line drawing, one variable changed. Recorded result (after the 2026-11-02 re-recording, where Spark named the azalea swatch "green"): "green area" 16 masks on L-1 colour, 0 on L-1 lines;
"beige area" 2 on L-3 colour, 0 on L-3 lines (docs/research/sam-probe.md). Spark writes the prompts
(landsight/meta/sam_plan.py): area → "<colour> area", symbol → "<colour> circle"; legend lines (hedges) are skipped
because a 10 px band came back +33% in the probe, and hedges are counted along their line by geometry (D-20). A mask is
typed by the CAD outline holding at least half its pixels (DXF renders) or by the label Spark saw written inside it
(the raster plan, D-67), never by the prompt; masks of overlapping colour words are pooled (IoU ≥ 0.8 is one region);
masks inside the legend box are a key and are dropped. On the sample the CAD governs every quantity and SAM's areas
are the cross-check: −0.3% to −1.2% on the three pavings, lawn and azalea, +2.3% on the planter edge, +4.5% on the
eight canopies (the dark edge line is inside the mask); on the raster plan the four items S-01…S-04 stay flagged
until a person confirms them (lawn 195.0 m², −2.5% against the DXF; azalea 146.0, −2.7%; the fire lane 78.8, −14.3%,
a canopy covers part of it; 11 tree symbols, as the DXF draws).

### What is Meta, what is ours

| Meta models | Ours (Python, no model) |
|---|---|
| Reading a sheet's kind, discipline, title block and index from its render | Geometry (ezdxf + shapely): closing loose line work (free ends bridged by direction, T-gaps, polygonize), areas, lengths, counts, legend and title-block regions, labels, the scale bar |
| Reading loose line work geometry could not close, with grounding points | The rules (landsight/rules, rules.json with every constant cited): §299, §302 with the §5 table 1 pit downgrade and the old-tree fix, §305, the artificial-ground soil table, municipal tree protection, the green-building checklist |
| Reading the schedule table, the legend colours, the tree-pit detail, the floor titles and soil notes | Reconciliation: three sources per item (geometry, Muse Spark, the schedule) and the rule that an item is agreed when they agree, pending when Spark proposed more than geometry drew (landsight/review/pending.py, D-63) |
| Classifying and summarising text PDFs and pasted images | The bill reader (openpyxl, values and formulas, merged headers, hidden sheets, SUM ranges, revision stamps) and bill vs drawing vs the firm's price list vs its own arithmetic |
| Aligning misspelt bill rows to drawn items, with confidence | The ingest verdicts (extension, then content: `.bak` vs the DXFs beside it, zip members, xlsx bill or quote, PDF vector / raster / text pages), with Spark deciding images and text PDFs |
| Segmenting coloured areas by a colour word (SAM 3.1), with confidence | The scoreboard (landsight/review/score.py), the scenarios, landsight.db, the API, the screen, the Statement, the director |
| Answering a question from the chunks retrieval sent, with quotes | BM25 retrieval over the package (no vector store), the citation check (a quote must be in the chunk it names), the actions applied to the run |

## 4 Every Meta call type, per full review

The sample package (samples/greenfield, 30 files), reviewed through the product API on 2026-11-02 at 09:16 UTC (17:16
UTC+8) with `POST /api/packages/{id}/review?live=1&fresh=all` (run `982d4843e6c9`; all 51 calls asked live, nothing
replayed):

| Call | Model | Calls | Median s | Input tok | Output tok | Cost (USD) |
|---|---|---:|---:|---:|---:|---:|
| review_classify_sheet | muse-spark-1.3 | 22 | 3.94 | 78,441 | 12,117 | 0.1187 |
| sam-3.1 segment | sam-3.1 | 12 | 1.79 | – | – | 0.0300 |
| review_summarise | muse-spark-1.3 | 7 | 4.19 | 4,542 | 6,962 | 0.0313 |
| review_look_image | muse-spark-1.3 | 2 | 4.33 | 818 | 1,314 | 0.0059 |
| group_and_read | muse-spark-1.3 | 2 | 5.64 | 4,936 | 2,278 | 0.0159 |
| read_legend | muse-spark-1.3 | 2 | 4.22 | 1,182 | 1,693 | 0.0076 |
| read_schedule | muse-spark-1.3 | 1 | 4.09 | 2,536 | 721 | 0.0036 |
| read_detail | muse-spark-1.3 | 1 | 3.79 | 3,416 | 459 | 0.0026 |
| review_align | muse-spark-1.3 | 1 | 5.45 | 771 | 1,324 | 0.0058 |
| review_read_raster_plan | muse-spark-1.3 | 1 | 12.30 | 3,790 | 2,422 | 0.0110 |
| **all** | | **51** | | **100,432** | **29,290** | **0.2324** |

39 Muse Spark calls (174.4 s of call time) and 12 SAM 3.1 calls (23.2 s), 106.2 s wall with six calls in parallel. The
same 51 calls in the earlier full passes:

| Pass | Run | Live calls | Wall s | Spark call s | SAM call s | Output tok | Cost (USD) |
|---|---|---:|---:|---:|---:|---:|---:|
| CLI, 04:18 UTC (12:18 UTC+8), `--live --fresh all` | 3151599bed27 | 51 | 113.0 | 184.9 | 24.4 | 28,273 | 0.2613 |
| product, 09:09 UTC (17:09 UTC+8), `?live=1&fresh=999` (Spark re-asked, SAM replayed) | d6cf61992d8d | 39 | 67.3 | 165.6 | 24.9 (replayed) | 28,726 | 0.2661 |
| product, 09:16 UTC (17:16 UTC+8), `?live=1&fresh=all` | 982d4843e6c9 | 51 | 106.2 | 174.4 | 23.2 | 29,290 | 0.2324 |

Input tokens are 100,432 in each pass (the same prompts and images). A full review of the 30-file package costs between
$0.23 and $0.27 at list prices.

Calls that other packages and the owner's questions add:

| Call | Model | Where | Calls | Median s | Cost (USD) |
|---|---|---|---:|---:|---:|
| review_read_floor_sheet | muse-spark-1.3 | the tower: one per sheet titled by floor | 5 | 5.27 | 0.0433 for five (≈ $0.0087 each) |
| ask_package | muse-spark-1.3 | one per question: six recorded 2026-11-01 22:37–22:38 UTC | 6 | 7.26 | 0.0622 for six (≈ $0.01 each) |
| ask_package, asked live through the dock | muse-spark-1.3 | two questions, 2026-11-02 05:13 UTC (13:13 UTC+8) | 2 | 8.56 and 7.34 | – |
| the tower, full review | both | samples/tower (18 Spark + 10 SAM, all asked live on 2026-11-02 21:12 UTC) | 28 | – | 0.1378 |
| the tower, L-102 and L-103 with the core | both | the redrawn sheets only (6 Spark + 4 SAM, asked live on 2026-11-03 07:37 UTC; the rest replayed) | 10 | – | 0.0471 |
| ask_package, re-asked | muse-spark-1.3 | two recorded questions whose retrieved sources moved when Art. 92 joined the rules table, 2026-11-03 | 2 | 11.56 and 14.37 | 0.0257 |
| the held-out package, full review | both | samples/heldout (11 Spark + 7 SAM; run d765d81741e8, 17 asked live, 1 replayed) | 18 | – | 0.0822 |

## 5 Recorded vs live

**The recordings.** Every answer the review and the questions use is a JSON file, committed, replayed by default:

| Folder | Files | What |
|---|---:|---|
| tests/fixtures/review/ | 69 | Muse Spark: review_classify_sheet 33, review_summarise 7, review_look_image 2, review_align 4, review_read_raster_plan 1, review_read_floor_sheet 5, group_and_read 3, read_schedule 3, read_legend 8, read_detail 3 (the three packages) |
| tests/fixtures/review/sam/ | 31 | SAM 3.1, named `<sheet>__<phrase>__<image hash>.json` (`l-3-filled__beige-area__9c3957ba.json`) |
| tests/fixtures/review/fresh/ | 99 | live re-asks of recorded Spark calls (`--fresh`), timestamped, never replayed |
| tests/fixtures/review/sam/fresh/ | 22 | live re-asks of recorded SAM calls |
| tests/fixtures/ask/ | 9 | ask_package: the six questions of the brief and the three the dock and the /try screen ask (all recorded 2026-11-02 21:14–21:15 UTC) |
| tests/fixtures/spark/, sam/, detail/ | 25, 13 (+5), 2 | the take-off's own recordings from the 2026-11-01 spike and scripts/eval.py (classify_sheet, group_and_read, read_legend, read_detail, the naive counts; SAM probes on L-1 and L-3; the L-6 detail sheet) |

A recording is `{call, image_sha256, content_key, model, recorded_at, seconds, usage, prompt, result, response_id,
raw}`. The key is a content hash (the DXF signature, the PDF text, the image bytes) plus a hash of the prompt as sent
and the schema (`…|p=<8 hex>`), for every Muse Spark call the review makes: its own (review_classify_sheet,
review_summarise, review_look_image, review_align, review_read_raster_plan, review_read_floor_sheet) and the
take-off's (group_and_read with the candidates' measured facts in its prompt, read_schedule, read_legend, read_detail),
with no fallback to the image hash, so a changed prompt is never answered by an old recording (the take-off's 17 were
re-recorded live on 2026-11-02 when their keys gained the tag, and the 15 untagged ones deleted; the scoreboards stayed
30/28/2/0/0, 8/6/2/0/0, 11/10/1/0/0). SAM's key is the image hash plus the phrase; a question's key is the question
plus the prompt hash. In `fixtures` mode a missing recording raises
`FixtureMissing` and the check notes it; nothing is invented. The review replays in 14.2–14.4 s on the CLI path
(4.9 s with SAM's decoding memo warm; 12.9–13.1 s in the gate runs; 10.4 s for the API open through the proxy in
GATE-RUN-2).

**Live.** `--live` (CLI) / `?live=1` (API) with `MODEL_API_KEY` asks Muse Spark and SAM 3.1 for every prompt that has
no recording and records it (one run per prompt; a prompt with a recording replays, so a second live pass on the same
package makes no new call). `--fresh N` / `?fresh=N` re-asks N recorded calls; `all` (or `-1`) every Spark and SAM
call. The new answers are used in that run and written to `fresh/` beside the recordings under a timestamped name with
`raw`, `response_id`, `fresh_of` (the recording re-asked) and `same_as_recorded`; the recording itself is never
replaced, so replays never change (D-62). The CLI prints each fresh call's response id; the Run carries them in
`timing.fresh`; every call lands in `meta_calls` with `live = 1`.

**Three live proofs on the sample**, each against the recorded replay (71 checks, 20 sheets, 12 items, 31 file
verdicts, planted 30 · found 28 · flagged 2 (E15, E18) · missed 0 · false alarms 0):

| | CLI 04:18 UTC | product 09:09 UTC | product 09:16 UTC |
|---|---|---|---|
| Run | 3151599bed27 | d6cf61992d8d | 982d4843e6c9 |
| How | `landsight review … --live --fresh all` | `?live=1&fresh=999` | `?live=1&fresh=all` |
| Asked live | 39 Spark + 12 SAM | 39 Spark (12 SAM replayed) | 39 Spark + 12 SAM |
| Written to fresh/ | 39 Spark + 10 SAM (2 SAM prompts were new recordings) | 39 Spark | 39 Spark + 12 SAM |
| The same answer as the recording (`same_as_recorded`: Spark compares the parsed result, SAM the raw text byte for byte) | 1 Spark (read_legend), 3 SAM | 2 Spark (read_legend ×2) | 3 Spark (read_legend ×2, read_schedule), 3 SAM |
| Scoreboard, check ids, scenario slices | the same | the same | the same |
| Check titles that differ from the replay | 9 | 2 (E18, C-70) | 4 (C-44, C-45, E18, C-70) |
| Example response ids | `chatcmpl-01a19a7b-6bd3-708a-95f6-92cb34cd7c45` (group_and_read), `resp_6ae80f538d83ee072ef74622` (SAM) | `chatcmpl-01a19b85-c50a-7764-93be-15ed368a9eeb` | `chatcmpl-01a19b8c-7d93-722e-aa93-d648b8a04402`, `resp_6ae8553a1cec261bb18b4481` |

What differed, in words: in the CLI pass Spark called the azalea swatch "green" instead of "light green", so SAM was
prompted "green area" on L-1 and found 16 masks where the recording has 15, the pavers photo matched no finish code,
and SAM's canopy area read 100.6 m² against 100.1 m². In both product passes review_align gave the misspelt camphor row
confidence 0.85 instead of 0.70 (E18 stays flagged either way) and review_summarise worded the design-review summary
differently (C-70); in the 09:16 pass review_read_raster_plan listed 9 area types instead of 10 (C-45) and the planter
edge read +2.4% instead of +2.3% (C-44). What stayed the same: every check id, every scoreboard figure, the four
scenario slices, the 12 items and their counts.

**The Ask dock's live fallback (D-80).** On the live API a question with no recording answers 404; the dock re-sends
it to `POST /api/ask?live=1`, Muse Spark reads the package once, and the server records the answer as a fixture, so the
same question replays next time. Two questions were asked this way on 2026-11-02 at 05:13 UTC (13:13 UTC+8), both
now in tests/fixtures/ask/:

| Question | s | Citations | Confidence |
|---|---:|---|---:|
| Which bill revision governs this package, and what changed from the previous revision? | 8.56 | 4, all verified | 0.98 |
| Is PV-1 a permeable paver, and which sheet or document says so? | 7.34 | 2, all verified | 0.99 |

The six recorded questions of the brief (2026-11-01 22:37–22:38 UTC, 2026-11-02 06:37–06:38 UTC+8; 6.73–10.9 s each; 20 citations, all verified): the soil depth
the spec requires on the slab, whether Art. 302 applies to a 1,500 m² site, which bill revision is current and what
changed, whether PV-1 is permeable, what the green-building checklist requires from landscape, why the camphor row
is flagged. Without `MODEL_API_KEY` the dock shows the server's reason.

## 6 Scoreboards

Answer keys are scored after the run; the checks never read them.

| Package | Files | Planted | Found | Flagged | Missed | False alarms | Quote | Regulation | Design | Format | How it was run |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| samples/greenfield (Greenfield Residences, the sample) | 30 | 30 | 28 | 2 (E15, E18) | 0 | 0 | 10 (9 found, 1 flagged) | 5 (4, 1) | 11 (11) | 4 (4) | recorded; live three times (§5), same result |
| samples/heldout (Riverside Court: layout b, seed 7, never used to develop the checks) | 6 | 11 | 10 | 1 (H04) | 0 | 0 | 3 (3) | 3 (2, 1) | 4 (4) | 1 (1) | live once, 2026-11-01 22:50 UTC (2026-11-02 06:50 UTC+8): 18 calls (11 Spark + 7 SAM), 17 asked live, one read_legend replayed from a recording of 18:14 UTC |
| samples/tower (Greenfield tower: 20 floors on six sheets) | 7 | 10 | 8 | 2 (T04, T08) | 0 | 0 | 2 (2) | 3 (3) | 5 (3, 2) | 0 | recorded; 28 calls (18 Spark + 10 SAM): the 10 on L-102 and L-103 (6 Spark + 4 SAM) asked live on 2026-11-03 07:37 UTC after those sheets gained the core, the other 18 on 2026-11-02 21:12 UTC |

E15 (the protected tree) and H04 are "needs review" by nature: designation is the city's. T04 and T08 are likewise
review items (D-69). The Art. 305 water-retention check is a computed result outside every answer key (D-65) and the
CLI lists it apart. On the tower, landsight.db also holds a live row from 04:16 UTC reading 8 · 8 · 0 · 0 · 0 from before
the sheets were redrawn with legends (D-69); the recorded replay is the figure above.

**What the answer keys are.** `samples/<package>/answer_key.json` is written by the generator (landsight/synth) beside
the package: the site, the schedule, the true totals, the counted trees per sheet, every object, and the planted
errors, each with an id (E01–E30, H01–H11, T01–T10), its scenario, and the files, drawing objects and bill cells it
touches. The scoreboard (landsight/review/score.py) matches each check to a planted error by compatible category and
shared evidence (a file or a bill cell; when both name bill cells one must be shared, when both name objects one must
be shared, objects matched by sheet number and position within 1 m), scoring 3 × shared cells + 2 × shared objects +
shared files; each check goes to its best error. A check that alarms (flag, fail, review) and matches no error is a
false alarm; `ok` checks and `unscored` checks are never matched. A matched error whose check says "review" is
flagged, not found.

## 7 The data layer

`landsight.db` is SQLite from the standard library at the repo root (`LANDSIGHT_DB` overrides; the tests use a
temporary file; `landsight db init|reset|stats|calls`). Schema in landsight/store/db.py:

| Table | Holds |
|---|---|
| projects | id, name, created_at |
| packages | a folder registered under a project (name, folder, kind site · tower, registered_at); unique per (project, folder) |
| runs | one row per review: mode, started_at, finished_at, total_s, spark_calls, spark_s, sam_calls, sam_s, the scoreboard, `scenarios` (json), `timing` (json, every call), `price_list` (the rows it priced against), `run` (the whole Run json) |
| checks | one row per check of a run: scenario, category, severity, title, why, by, evidence, numbers, body |
| decisions | a person's verdict on a flag: confirm · dismiss · open, a note, decided_at, source; one row per (run, check), the latest wins (D-78) |
| confirmations | a log, never edited, of confirmations, price edits, regulation notes and flags, from the screen or from an accepted ask action |
| price_list | the firm's rates in TWD: code, name, spec, unit, low, high, basis, source, updated_at; seeded with CC, DU, AZ, LA, PV-1, PV-2, PV-3 (the sample's list) and RL, RI, IC, MP (the tower's rows); `PUT /api/price-list/{code}` edits a row and the next review prices against it |
| species | landsight/data/species.csv (60 rows): native, bird- or butterfly-attracting, Gi class |
| rules | landsight/data/rules.json flattened (103 rows on this machine): cited articles with English glosses, constants, table rows, municipal rules, the glossary |
| asks | every question put to a package and its answer |
| meta_calls | every Muse Spark and SAM 3.1 answer a run or a question used: model, call, kind, the prompt as sent, the response, usage with the response id, seconds, recorded_at, the repo-relative recording, live or replayed |

Decisions and the runs listing: `POST /api/runs/{id}/checks/{check}/decision` writes the verdict and returns the check
as the run serves it; every served check carries `decision`, `note`, `decided_at`; `?confirmed=1` keeps the confirmed
ones for the Statement. `GET /api/packages/{id}/runs` lists a package's runs, latest at the top, with the scoreboard, the
scenario counts, seconds and calls. A decision never changes the scoreboard and never confirms an item
(`POST /api/items/{id}/confirm` stays separate).

Reference data in landsight/data/ (sources in SOURCES.md): species.csv 60 rows, unit_prices.csv 77 rows (73 sourced, 4
`sample`), paving.csv 12 rows (hatch names, permeable or not), rules.json (national and two municipal rule sets; every constant
with article, URL and read date), currency.json (32.478 TWD per USD, the central bank's closing rate of 2026-10-30,
read 2026-11-02).

In git: the three sample packages with their answer keys and price lists, every recording, frontend-mock/ (the API's
real responses for the sample). Ignored (.gitignore): `landsight.db` (the live-run rows stay on the author's machine;
the recordings are the portable proof and `landsight db init` + `landsight review` rebuild the file), `out/`
(uploads, scratch), `.env*` except `.env.example`, `.venv/`, `node_modules/`, `.cache/`, `spike/out/`.

## 8 The API surface

FastAPI on :8795 (`uv run python -m landsight serve`), every endpoint in docs/API.md with its types.

| Group | Endpoints |
|---|---|
| Health and the current run | `GET /api/health` (`ok`, `spark` fixtures · live, `version`, `features: {upload}`); `POST /api/package/open` (a path, or the sample; `?live=1`); `GET /api/run` (`?scenario=`, `?confirmed=1`); `GET /api/rules`; `GET /api/director` |
| Sheets, crops, confirm | `GET /api/sheets/{id}.svg` · `.png`; `GET /api/crops/{item}.png` (what Spark saw); `POST /api/items/{id}/confirm` |
| Projects and packages | `GET /api/projects`; `POST /api/projects`; `POST /api/projects/{id}/packages` (a folder); `POST /api/projects/{id}/packages/upload` (a dropped folder, multipart); `GET /api/packages/{id}`; `POST /api/packages/{id}/review` (`?live=1&fresh=N|all`); `GET /api/packages/{id}/runs` |
| Stored runs and decisions | `GET /api/runs/{id}` (`?scenario=`, `?confirmed=1`); `GET /api/runs/{id}/checks`; `POST /api/runs/{id}/checks/{check}/decision` |
| The firm's prices | `GET /api/price-list`; `PUT /api/price-list/{code}` |
| Meta calls | `GET /api/meta-calls?run=&ask=&full=1` (every call of a run or a question: prompt, response, usage, seconds, recording, live) |
| Ask the package | `POST /api/ask` (`?live=1`); `POST /api/ask/actions` (confirm_element · confirm_price · regulation_note · flag) |

The CLI covers the same data: `landsight review <dir> [--scenario …] [--live [--fresh N|all]] [--db f | --no-db]`,
`landsight db …`, `landsight ask "<question>" [--run id] [--live]`, `landsight package <dir> [--tower | --seed 7
--layout b]`.

## 9 The screen

frontend/ is Vite + React + TypeScript on :5195, proxying `/api` to :8795; without the API it falls back to
frontend-mock/ and the status bar says which. Declared in frontend/package.json (caret ranges): react 19.3.1,
react-dom 19.3.1, typescript ~7.0.2, vite 8.3.5, @vitejs/plugin-react 6.1.2, tailwindcss 4.3.3 (@tailwindcss/vite),
d3-zoom 3.0.0 with d3-selection 3.0.0, d3-transition 3.0.1 and d3-interpolate 3.0.1, zustand 5.0.16,
@tanstack/react-query 5.105.1, framer-motion 14.9.0, howler 2.2.4, lucide-react 1.66.0; tests with vitest 5.0.5 and
jsdom 30.1.3; lint with oxlint 1.89.0. Design: B's system (Inter / JetBrains Mono at 13 px, cool greys, cobalt as the
one accent, 48 px top bar, 28 px status bar, hairlines) on a fixed 1920 × 1080 stage scaled to the window (D-59,
D-71).

**Five routes.** `/` Projects (projects → packages → runs, Review, Open; never opens a package by itself, D-79);
`/open` (the drop zone, a folder path, or the sample; every file with its verdict and reason in five groups; the run's
facts); `/review` (the desk); `/statement` (the board); `/prices` (the firm's list, edited in place). `/review?run=<id>`
opens a stored run; deep links `flag`, `sheet`, `compare`, `colour`, `filter`, `ask` open a state.

**The review desk** (src/screens/Review.tsx, src/review/): the left pane is the package tree and every flag grouped by
scenario with the group's line, filters, money per flag and the pin number it has on the sheet shown (FlagList); the
right pane is the sheet bar, the sheet on an unbounded d3-zoom canvas with grid, scale bar and cursor readout, A's
numbered pins and paper callout next to the selected pin (the crop, the measured facts, Muse Spark's answer as
recorded with its grounding points, the three sources, Confirm / Leave open), the detail dock under the sheet (B's four
columns for most flags; the greening gauge in both states, before and after the tree-pit rule, for Art. 302; C's
inspector with the bill cells, the drawing, the money, related flags and a note for quote flags), and the filmstrip of
every sheet with its flag count. Compare lays Rev A over Rev B with each object matched to its nearest twin (D-74);
the coloured render shows SAM's masks over the fill with the controlled test's counts. Keyboard: ↑↓ move, ⏎ confirm,
⌫ dismiss. Confirm posts a decision to the live API (D-78) and, for the flag whose one object is what Spark was shown
(T-08), confirms the item too.

**Ask dock** (src/screens/AskDock.tsx): ⌘K or the top bar on every screen; the question, the answer, each citation as
the file, page and sentence it came from (click opens the file or sheet and lights it), the proposed actions as
buttons, recent questions; the live fallback of §5.

**Statement** (src/screens/Statement.tsx, src/lib/statement.ts): the reconciliation (the bill as submitted → less
billed-not-drawn, less rate over the list, plus what the bill left out, under-billed as its own line → as the drawings
support it), one ledger row per flag (basis · found · expected · Δ · state), the scoreboard, Art. 302, the sheets;
three exports built from the same data: the flags as CSV, the Statement as HTML, the query letter to the developer as
HTML (confirmed flags and their notes).

**Currency.** Every stored price is TWD; the Run carries the rate (32.478 TWD per USD, 2026-10-30, the central bank);
a TWD / USD toggle sits in the status bar with the rate and date beside it; every money line is n × the shown unit so
the arithmetic on screen holds, USD under $20 keeps its cents (D-55, D-73).

**Director mode** (`?director=1&auto=1`, src/director/): nine scenes as camera moves and reveals on the real screens,
nothing drawn apart: drop, wake, eye, hedge, colour, gauge, bill, ask, callback (SCENE_ORDER). A camera scales the
whole stage, the sheet keeps its own zoom; each reveal burns one caption whose every number is read from the Run
(`&captions=0` for a clean capture); Space steps, `#scene=eye` jumps.

**The drop zone and upload** (src/lib/upload.ts, src/screens/Open.tsx; D-81, D-82): a dropped folder's entries are
taken synchronously in the drop handler (`webkitGetAsEntry`), each directory read with `readEntries` until it answers
an empty batch (Chrome hands out at most 100 per call), hidden files left out, names in NFC, paths relative to the drop
with the top folder included; `<input webkitdirectory>` is the click path. The caps are checked before a byte is
sent (500 files, 50 MB per file, 100 MB in all) and again by the server while the body streams; the screen shows
"Uploading N files (X MB)…" then "Reading the package…"; on the repo mock it says the live API is needed. The server
registers the dropped folder and reviews it from the recordings: the outer sample folder uploaded scores 30 · 28 · 2 ·
0 · 0 with the same 30 verdicts and no live call; the package folder alone reviews with an empty scoreboard.

## 10 Tests and gates

**pytest** (`uv run pytest -q`): 224 passed in 482.9 s on 2026-11-03 (on a loaded machine), 19 test files under tests/ plus conftest.py;
collected cases per file (pytest's collection, parametrized cases counted apart): test_ask 11, test_app 7,
test_conditional 11, test_decisions 3, test_gate2 11, test_geometry 20, test_meta 26, test_money 3, test_package 17,
test_package_api 9, test_review 13, test_robustness 9, test_rules 21, test_scenarios 5, test_store 6,
test_synth_answer_key 13, test_takeoff 9, test_tower 7, test_upload 23. They run offline on the recordings
with `LANDSIGHT_DB` pointed at a temporary file; test_meta injects an httpx transport, so no key is needed.

**vitest** (`cd frontend && npx vitest run`): 36 passed in 6 files (confirm, decisions, money, projects, scenario,
upload).

**Fixtures:** §5's table; a missing recording fails a test rather than being invented.

**The README playbook:** two terminals, top to bottom: `uv sync`, `landsight package /tmp/greenfield`, `landsight
review … --fixtures`, `uv run pytest -q`, `landsight serve --port 8795`; `npm ci`, `npm run dev`; then
http://localhost:5195 and the director URL; a drag of the folder onto the drop zone as the alternative to the path.

**The AI-judge gate runs** (docs/GATE-RUN-1.md, GATE-RUN-2.md): a judge agent cloned the repo and ran the playbook as
written. Run 1 (2026-11-02 ~07:55): every step passed except `npm run dev` on a busy :5195 (strictPort at the time);
141 pytest passes; scoreboard as stated; three judges weighted 77, 69.75 and 70. Run 2 (~10:20, after the fixes and the
currency toggle): every command ran as written, Vite took :5196, 157 passes; three judges weighted 74.5, 77 and 78.
Both named the same limit: without a Meta key a
judge sees replays, and with one a second live pass replays what is recorded unless `--fresh` is used (hence D-62).

## 11 Repo layout

```
landsight/      the Python package: ingest, dxf, geometry, takeoff, review, checks, bill, rules, meta, ask, store, synth, app, data
frontend/       the screen: Vite + React + TypeScript, five routes, the Ask dock, director mode, vitest
frontend-mock/  the API's real responses for the sample package with every image (the screen's offline source)
samples/        greenfield/, heldout/, tower/: each a package folder with its answer key and firm price list
tests/          pytest (19 files) and fixtures/: every recorded Meta answer
scripts/        eval.py (the accuracy table), frontend_mock.py, sam_probe.py, naive_probe.py, make_detail_sheet.py,
                record_conditional.py, recording notes (capture.md, review_live.md)
docs/           API, DECISIONS (D-01…D-82), STACK, PLAN, PLAN-V2, PACKAGE, JUDGE-PLAYBOOK, GATE-RUN-1/2, OVERNIGHT,
                REPORT-2026-11-02, WIN-STRATEGY, research/
demo/           the film: SCRIPT, THESIS, JUDGES-v1, DESIGN, HOOKS, SUBMISSION, WRITERS-ROOM, writers-room-v5/, film/
                (the Remotion project and landsight-v1.mp4)
design/         explore/: the three design directions (a drawing room, b review desk, c ledger) the screen was built from
spike/          the 2026-11-01 probes that fixed the division of labour (D-03)
out/            git-ignored: uploads/<hash>/ and scratch renders
landsight.db    git-ignored: the local database (§7)
pyproject.toml, uv.lock, LICENSE (AGPL-3.0), README.md
```

## 12 Film tooling

The film is cut in Remotion 4.0.535 (demo/film: `Film.tsx`, beats from `beats.json`, every number read at render time
from the Run, never typed). The app's director scenes are captured by Playwright 1.56.1 under a frozen clock
(`lib/vclock.js` replaces setTimeout, requestAnimationFrame, performance.now and Date.now and steps 1/30 s per frame;
each frame a lossless screenshot piped to ffmpeg), with the app's sound cues logged at their virtual time and mixed on
those cues. Narration is ElevenLabs premade voices on `eleven_v4` (Brian default, Alice as a flag); the two music beds
are ElevenLabs Music (`music_v1`, instrumental). `landsight-v1.mp4` (3:00, script v4) exists; v2 waits for the script.

## 13 Limits

- The packages are synthetic, generated by landsight/synth, and the same author wrote the checks. The held-out package
  (layout b, seed 7, errors picked by a seeded draw, reviewed once live before any check was looked at against it) is
  the counter: the checks were not tuned on it; it is not independent data.
- SAM 3.1 returns nothing on line work; it runs on colour renders and the raster plan, with the line drawing kept as the
  control in every run. A real developer's coloured PDF (other colours, text over fills, hatch lines) has not been tried.
- The Art. 305 water-retention check is computed with stated assumptions and sits outside every answer key; the old-tree
  rule is fix d of the greening check and not a pass on its own. Neither is scored.
- The §299 fire lane is conditional: it is not subtracted without the architect's declaration, and both figures are
  shown.
- Prices are hypothetical by design: the firm's list cites published public budget figures row by row (four rows are
  marked `sample`), but no firm set them.
- The browser folder drop was verified in code (23 pytest cases from 12 test functions on path rules, caps and parity; the frontend's
  upload tests) and by a synthetic drop; a real mouse drag on a fresh clone is the owner's go/no-go before the cold open
  is shot (D-81).
- The tower's recorded scoreboard (10 · 8 · 2) comes from the replay of its recordings; the earlier live row in
  landsight.db, from before the sheets were redrawn with legends, reads 8 · 8 · 0.
- A second `--live` pass replays what is recorded; live proof needs `--fresh`, which costs about a quarter of a dollar
  per full pass.
