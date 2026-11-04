# Meta models: what is engineered around Muse Spark 1.3, SAM 3.1, Muse Spark Open and Muse Wonder

[← README](../README.md)

By default two models run through the Meta Model API. **Muse Spark 1.3** (`muse-spark-1.3`) does every reading: chat
completions with vision and a JSON schema. **SAM 3.1** (`sam-3.1`) segments coloured plans: the responses endpoint,
masks decoded with Meta's `meta_sam_parser`. Two opt-in modes add **Muse Spark Open** and **Muse Wonder** (after the
list). The calls are the small part; this is what is built around them, each with the code that does it:

- **The two models are chained: Spark writes SAM's prompts.** Muse Spark reads a coloured plan's legend box
  (`read_legend`) and names each swatch's colour; those words become SAM 3.1's prompts ("beige area" for PV-1
  PERMEABLE PAVERS), and on a CAD render each mask is typed by the outline it lies in, never by the prompt. The same
  words on the plain line drawing are the control in every run (0 masks).
  Code: [`landsight/meta/sam_plan.py`](../landsight/meta/sam_plan.py), [`landsight/review/colour.py`](../landsight/review/colour.py)
- **Every call type has its own instructions and a JSON-schema response.** Each of the eleven Muse Spark call types
  the review and Ask use, and Muse Wonder's two, has its own prompt and `response_format: json_schema`
  (`additionalProperties: false`; every field required except the optional grounding points), so a reply parses with
  `json.loads` and nothing else.
  Code: [`landsight/review/spark.py`](../landsight/review/spark.py), [`landsight/meta/spark.py`](../landsight/meta/spark.py), [`landsight/ask/ask.py`](../landsight/ask/ask.py), [`landsight/memory/habits.py`](../landsight/memory/habits.py)
- **Geometry runs first; the model sees only the crop it needs, plus measured facts.** ezdxf and shapely close and
  measure every outline they can. Only an outline geometry cannot close goes to Spark: a crop with that candidate
  drawn in red, sent with what geometry measured (pieces, gaps, size, length, the area of the closed canopies near
  it), under a per-sheet call budget.
  Code: [`landsight/takeoff/pipeline.py`](../landsight/takeoff/pipeline.py) (`candidate_crop`), [`landsight/takeoff/merge.py`](../landsight/takeoff/merge.py) (`needs_spark`, `candidate_facts`), [`landsight/geometry/`](../landsight/geometry/)
- **Grounding points trace each answer back to the drawing.** `group_and_read` returns up to 12 points (0–1000 on the
  crop); they are clamped, mapped to crop pixels and drawing metres, and drawn on the screen's callout.
  Code: [`landsight/meta/spark.py`](../landsight/meta/spark.py) (`ground_points`)
- **Three sources decide each count; pending items wait for a person.** Geometry, Muse Spark and the plant schedule
  are reconciled per item, and an item is agreed only when every source gives the same number. A tree Spark proposed
  for an open outline stays out of the greening sum and the schedule check until a person confirms it.
  Code: [`landsight/takeoff/merge.py`](../landsight/takeoff/merge.py), [`landsight/review/pending.py`](../landsight/review/pending.py)
- **Building-code checks are deterministic code with article references.** The greening formula, the tree-pit rule
  for planting on a slab, the fire lane, water retention and corridor widths are Python, each constant cited (article,
  source, date read) in `rules.json`. The model reads the inputs (the tree-pit detail, floor titles, soil notes); it
  does not judge.
  Code: [`landsight/rules/`](../landsight/rules/), [`landsight/checks/regulation.py`](../landsight/checks/regulation.py), [`landsight/data/rules.json`](../landsight/data/rules.json)
- **Ask the package.** BM25 retrieval over the package's own PDFs, bill rows, title blocks, rules and prices, then one
  Muse Spark call with the relevant page renders. Every citation (file, page, verbatim quote) is checked against its
  source; proposed actions (confirm an item or a price, a regulation note, a flag) apply only when a person accepts
  them.
  Code: [`landsight/ask/`](../landsight/ask/)
- **Every call is recorded and replayable.** A Spark answer is stored under a hash of its content (DXF signature, PDF
  text or image bytes) plus a hash of the prompt and schema as sent, so a changed prompt is never answered by an old
  recording; SAM's under the image hash plus the phrase. A missing recording fails; nothing is invented.
  Code: [`tests/fixtures/`](../tests/fixtures/), [`landsight/review/spark.py`](../landsight/review/spark.py) (`_prompt_tag`)
- **The live and fresh flags re-ask any call.** `--live` (CLI) or `?live=1` (API) asks what is not recorded;
  `--fresh N` or `--fresh all` re-asks recorded calls, uses the new answers in that run and saves them beside the
  recordings with their response ids, never over one.
  Code: [`landsight/review/cli.py`](../landsight/review/cli.py), [`landsight/review/spark.py`](../landsight/review/spark.py)

**Two opt-in modes**, off by default; each has its own recordings that replay offline with no key
([docs/NEW-MODES.md](NEW-MODES.md)):

- **Private mode on open weights: Muse Spark Open** (`meta-models/muse-spark-open-1026`, served by Baseten). Every
  Muse Spark call type, images included, goes to Meta's open-weight model with the same prompts and JSON schemas, so
  confidential drawings can stay on infrastructure the firm controls; SAM 3.1 stays on the Meta Model API. Switch it on
  with `LANDSIGHT_READER=open`, `--reader open` or `?reader=open`; `LANDSIGHT_OPEN_BASE_URL` points it at a
  self-hosted vLLM or SGLang server instead. Its recording keys end in the model id, so one model's answer never
  replays as another's. **Parity:** one live review of the sample (39 Spark calls on Baseten, 12 SAM calls replayed)
  gave the same scoreboard as the API reader, 30 · 28 · 2 · 0 · 0 with the same ids (E15, E18), in 141.8 s for
  $0.2253. It read one thing less well: it typed the open outline T-08 as a planter edge, so the eighth camphor is
  left as an unresolved item instead of a proposed tree.
  Code: [`landsight/review/spark.py`](../landsight/review/spark.py) (`reader_name`, `open_endpoint`), [`tests/fixtures/open/`](../tests/fixtures/open/)
- **Firm memory: Muse Wonder** (`muse-wonder-1.0`). Wonder has no memory API, so the store is Landsight's: one
  deletable `firm_memory` row per firm. Wonder distils the firm's confirm and dismiss decisions into habits (what to
  send back and in what order, what to keep internal, the pricing tolerance, plant substitutions, the reply's voice).
  The next review orders and groups its findings by those habits with no model, and Wonder drafts the reply to the
  developer in the firm's terms; every finding id and number in the draft is checked against Wonder's input. In the
  demo, 16 decisions written for the sample (distilled in 21.4 s, about $0.07) reorder the tower's nine findings so
  the regulation and drawing points come before the money, and the reply quotes the firm's own installed range
  (13.0 s, about $0.04). Use it with `landsight memory …` or `/api/firms/{firm}/memory`.
  Code: [`landsight/memory/`](../landsight/memory/)

Next: the open reader on the firm's own GPUs (the same code with another base URL, not yet tested) and a screen for
firm memory (its API is ready).

Every Meta call in one fully live review of the sample package with the default reader (run `982d4843e6c9`,
2026-11-02 09:16 UTC, through the product API with `?live=1&fresh=all`: all 51 calls asked live, nothing replayed;
[docs/STACK.md](STACK.md) §4):

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
