# Two opt-in modes: the open reader and firm memory (2026-11-04)

Both are off by default. With no key and no setting, the quick start, `/try`, the CLI and every recording behave
exactly as before. Each mode has its own recordings, kept apart from the default ones, and each replays offline with
no key. Times are in UTC, with UTC+8 in brackets.

| Mode | Meta model | What it adds | Switch |
|---|---|---|---|
| Open reader ("private mode") | Muse Spark Open, Meta's open weights (`meta-models/muse-spark-open-1026` on Baseten) | Every Muse Spark call of a review and of "ask the package" goes to an open-weight model on a server the firm chooses. That can be its own. | `LANDSIGHT_READER=open`, `--reader open`, `?reader=open` |
| Firm memory | Muse Wonder (`muse-wonder-1.0`, Meta Model API) | Learns a firm's habits from its estimator's decisions. On the next package it orders and groups the findings that firm's way and drafts the reply to the developer in its voice. | `landsight memory …`, `/api/firms/{firm}/memory`, `/api/runs/{id}/memory` |

## 1 The open reader: Muse Spark Open, on infrastructure the firm controls

**Why.** A developer's package is confidential: drawings, bills, prices. By default the reader is `muse-spark-1.3` on
the Meta Model API. With the open reader, the same prompts and JSON schemas go to Muse Spark Open, the open-weight
release of Muse Spark (816B parameters, mixture of experts, 42B active, Muse Model License). It can run in one of two
places:

- a hosted endpoint, Baseten here
- the firm's own GPUs, so the drawings never leave its network

The code does not care which: it speaks the OpenAI-compatible Chat Completions protocol to a base URL.

**Model id.** On 2026-11-04, `GET https://inference.baseten.co/v1/models` listed two entries:

- `meta-models/muse-spark-open-1026`, named "[HACKATHON] Muse Spark Open"
- the public `meta-models/muse-spark-open`

Both are `Muse-Spark-Open-816B-A42B-NVFP4`, with input modalities text and image, priced at $1.25 per 1M input tokens,
$0.15 per 1M cached input and $4.25 per 1M output. The hackathon requires `meta-models/muse-spark-open-1026`, and it is
what every recording here used.

**Vision and structured output, tested first** (2026-11-03, just before the parity run):

- **Text with a JSON schema:** `response_format: json_schema` was honoured: valid JSON, all fields present, in 1.6 s.
  Baseten's model list names `json_mode` but not `structured_outputs`, so the reader still unwraps an answer that comes
  back inside a code fence.
- **Image:** a 400 × 300 PNG went in as a data URL, with a schema. The model read both shapes, the filled one and the
  title text exactly, in 3.2 s.

**What is routed where.** Image input works, so every Muse Spark call type goes to the open model. The text-only
ones are included:

| Call | Input | Open reader |
|---|---|---|
| review_classify_sheet, review_read_floor_sheet, review_read_raster_plan, review_look_image | page or image renders | Muse Spark Open |
| group_and_read, read_schedule, read_legend, read_detail (the take-off) | crops and sheets | Muse Spark Open |
| review_summarise, review_align | text | Muse Spark Open |
| ask_package | text and up to two page renders | Muse Spark Open |
| SAM 3.1 segment | coloured renders, one noun phrase | stays on the Meta Model API (see Limits) |

**How it is built.** All of it is in `landsight/review/spark.py` and `landsight/meta/spark.py`.

- `reader_name()` reads `--reader` or `?reader=`, then `LANDSIGHT_READER`, and falls back to `api`.
- `open_endpoint()` gives the base URL, model and key:
  - `LANDSIGHT_OPEN_BASE_URL`, default `https://inference.baseten.co/v1`
  - `LANDSIGHT_OPEN_MODEL`, default `meta-models/muse-spark-open-1026`
  - the key is `LANDSIGHT_OPEN_API_KEY`, or else `BASETEN_API_KEY`, and the latter only for Baseten's own URL. A Baseten
    key is never sent to another host.
  - A self-hosted server may run with no key.
- Requests carry the same system message, prompts, JSON schemas and `reasoning_effort: "low"` as the API reader.
  - Muse Spark Open's own default is `xhigh`, so the level is always set.
  - A 429, a 5xx or a dropped connection is retried once.
- Recordings live apart:
  - `tests/fixtures/open/` holds the review calls. `tests/fixtures/open/ask/` holds the questions.
  - `tests/fixtures/open/sam/` gets a new SAM answer only if the open model writes a colour word that has no recording
    yet. The default SAM recordings are read but never written.
  - Each key ends in `|m=<model id>`, so the API reader never replays an open answer, and an open answer is never
    replayed as the API's.
- Run and API reporting:
  - The Run's `timing` gains `reader: "open"` and `model`.
  - Every call lands in `meta_calls` with the open model's id.
  - `landsight db calls` prices it at Baseten's list.
  - `/api/health` adds `reader` only when the open reader is on.

**Self-hosting.** Meta's "Run inference" page for Muse Spark Open serves the NVFP4 checkpoint on four B300 GPUs with
vLLM. This is a shortened form; the page adds a context length and speculative decoding, and also documents SGLang and
TensorRT-LLM:

```bash
vllm serve meta-models/Muse-Spark-Open-816B-A42B-NVFP4 --tensor-parallel-size 4 --enable-expert-parallel \
  --reasoning-parser muse --tool-call-parser muse --enable-auto-tool-choice
```

Then point Landsight at it. Nothing else changes:

```bash
LANDSIGHT_OPEN_BASE_URL=http://<your-server>:8000/v1 LANDSIGHT_OPEN_MODEL=meta-models/Muse-Spark-Open-816B-A42B-NVFP4 \
  uv run python -m landsight review samples/greenfield --reader open --live --db out/open.db
```

That server's answers are recorded under its own model id. The Baseten recordings will not replay for it, which is
intended.

### The parity run: one live review of the sample, open reader against the API reader

The open run was made on 2026-11-03 from 22:00:06 to 22:02:29 UTC (2026-11-04 06:00–06:02 UTC+8):

- It ran `landsight review samples/greenfield --reader open --live`, with a fresh database.
- All 39 Muse Spark calls were asked live on Baseten and recorded in `tests/fixtures/open/`.
- All 12 SAM 3.1 calls replayed. Every colour word the open model wrote already had a recording, so this run sent
  nothing to the Meta Model API.

The API reader's figures are its recordings, replayed into the same kind of fresh database. Its last all-live pass
(docs/STACK.md §4, 2026-11-02 09:16 UTC) is in brackets.

| | API reader (`muse-spark-1.3`) | Open reader (`meta-models/muse-spark-open-1026` on Baseten) |
|---|---|---|
| Scoreboard (planted · found · flagged · missed · false alarms) | 30 · 28 · 2 · 0 · 0 | **30 · 28 · 2 · 0 · 0** |
| Flagged for review | E15, E18 | E15, E18 |
| Checks / alarms (fail, flag, review) | 71 / 22 | 73 / 22 |
| Muse Spark calls | 39 | 39 (all live) |
| SAM 3.1 calls | 12 | 12 (replayed) |
| Spark call time, summed | 267.9 s as recorded (174.4 s) | 281.8 s |
| Wall time, six calls in parallel | (106.2 s) | 141.8 s |
| Input / output tokens | 105,896 / 28,133 (100,432 / 29,290) | 104,371 / 17,266 |
| Cost at list prices, SAM's $0.03 included | $0.2735 ($0.2324) | $0.2253 |

Median seconds per call type, API recordings then open live:

| Call type | API | Open |
|---|---:|---:|
| review_classify_sheet | 5.42 | 8.2 |
| review_summarise | 5.44 | 2.56 |
| review_look_image | 4.44 | 5.04 |
| group_and_read | 10.93 | 7.92 |
| read_legend | 8.72 | 4.21 |
| read_schedule | 7.1 | 7.63 |
| read_detail | 4.97 | 9.03 |
| review_align | 7.1 | 2.74 |
| review_read_raster_plan | 15.55 | 13.16 |

The open model writes about 40% fewer output tokens; Baseten reports cached prefixes, which the cost counts.

**What the open model read differently.** The scoreboard is the same, but the substance is weaker on one item:

- **T-08, the open outline of 12 pieces:** the open model read it as one object, as the API reader does. It typed the
  object `planter_edge`, not `tree`, although its own reason says "one tree symbol". So:
  - Camphor gets no proposed eighth tree. E02 reads "Schedule says 12 Camphor, drawing shows 7" where the API reader
    says "drawn 7, Muse Spark 8 (T-08 to confirm)".
  - The bill row says "drawing 7", not 8.
  - The greening check loses "T-08 to confirm".
  - Tree ids shift by one (E08 and E09 name T-09 and T-08).
  - SAM's canopy cross-check becomes a planter-edge one.
  - The take-off keeps an unresolved item I-09. The run-shape check reports one problem
    (`items[8].kind: … 'unresolved'`), so the CLI exits 1 on this run.
- **Pasted image #2 (grey brick):** recognised as a material photo, but matched no finish code. The API reader matches
  PV-1.
- **Raster Presentation Plan:** the fire lane was listed twice, which gives an extra raster item, S-05.
- **review_align:** the misspelt camphor row was aligned at confidence 0.90, against 0.85. E18 stays flagged either way.

Every planted error is still found or flagged by the same checks, with no false alarm.

**Ask the package, open reader** (2026-11-03 22:05 UTC). "Is PV-1 a permeable paver, and which sheet or document says
so?" was answered in 2.41 s with four citations, all verified against their sources, at confidence 0.98. It is
recorded in `tests/fixtures/open/ask/` and costs about $0.006.

### Commands (no key needed unless `--live`)

```bash
uv run python -m landsight review samples/greenfield --reader open --no-db        # replays the parity run
LANDSIGHT_READER=open uv run python -m landsight review samples/greenfield --no-db  # the same, by environment
uv run python -m landsight review samples/greenfield --reader open --db out/open.db
uv run python -m landsight db calls --db out/open.db                                # the call and cost table
uv run python -m landsight ask "Is PV-1 a permeable paver, and which sheet or document says so?" --reader open --db out/open.db
LANDSIGHT_READER=open uv run python -m landsight serve                               # the API and /try on the open reader
# live on Baseten (records new answers in tests/fixtures/open/; a recorded prompt replays):
BASETEN_API_KEY=… uv run python -m landsight review samples/greenfield --reader open --live --db out/open.db
```

In the API, `POST /api/packages/{id}/review?reader=open` and `POST /api/ask?reader=open` work alongside `live=1`. A
live call with the open reader and no key answers 400, naming `BASETEN_API_KEY`.

### Limits

- **SAM 3.1 is not routed.** Baseten does not serve it, and it is not a Muse Spark call. In open mode, SAM:
  - replays its recordings
  - asks the Meta Model API live only when `MODEL_API_KEY` is set and a colour word has no recording yet
  - for a strictly private run, leave `MODEL_API_KEY` unset; a missing SAM answer is then noted and that colour
    cross-check is skipped

  SAM 3.1's weights are open too (`facebook/sam3.1`), but this build does not call a self-hosted SAM.
- **Structured output is not listed** by Baseten for this model (`json_mode` is). The schema was honoured on every call
  of the parity run, and a fenced answer is unwrapped, but a malformed answer fails that one call. The review notes it
  and degrades.
- **One live pass.** These are the figures of one live pass. The API reader's live passes differ from each other in
  wording too (docs/STACK.md §5).
- **Self-hosting is not tested.** It was not run here (no GPUs). The path is the same code with another base URL.
- **Only the Greenfield sample has open recordings.** With `LANDSIGHT_READER=open`, the tower and the held-out package
  replay with a note for each call that has no recording, unless they are asked live.
- **The screen was not tried with the open reader.** That includes `/try`. The default screen is untouched.

## 2 Firm memory: Muse Wonder learns a firm's habits

**Why.** Every landscape firm answers a developer in its own way:

- what it always sends back, and what it fixes itself
- how it prices and what it lets go
- which plants it proposes instead
- how it words an email

Landsight already stores each decision an estimator makes on a finding: confirm or dismiss, with a note (`POST
/api/runs/{id}/checks/{check}/decision`). Firm memory turns those decisions into habits, and the next package is
handled that firm's way.

**Muse Wonder and memory** (Meta docs and API, read 2026-11-04):

- **Model id:** `muse-wonder-1.0`. It is listed by `GET https://api.meta.ai/v1/models`, is in preview, is Standard
  mode only on the API, and costs $4.00 per 1M input tokens, $0.20 cached and $20.00 output. The same Chat
  Completions request as Muse Spark works with a JSON schema. A first test call answered in 51 s, 3,713 of its 3,751
  output tokens being reasoning, at `reasoning_effort: "low"`.
- **Memory:** Meta's Muse Wonder page lists "active memory" as a trait of the model: it carries important context
  through a conversation. The API has no memory store. The Responses API can keep a conversation's turns on the server
  (`store: true`, `previous_response_id`), but that carries turns, not a firm's habits from one package to the next.
- **So the store is ours.** It is the table `firm_memory` in landsight.db, one row per firm, which the firm can read,
  edit and delete. Wonder does the distilling.

**How it works.** The code is in `landsight/memory/`.

1. **Evidence.** Every decided check is gathered (the latest decision per package and check): scenario, category,
   severity, title, reason, numbers, the decision and the note. No run ids or times go in, so the same decisions
   always make the same prompt and replay the same recording.
2. **Distil.** One Muse Wonder call, `firm_habits`, with a JSON schema, returns:
   - `send_back`: kinds of finding in the firm's order, each with a heading, a match (categories, scenarios,
     severities, keywords), a reason and the finding ids that show it
   - `handle_internally`
   - `pricing`: basis, tolerance in percent, conventions
   - `species_substitutions`
   - `reply`: tone, greeting, opening, closing, sign-off, rules

   The prompt asks Wonder to define each kind as broadly as the decisions allow, so that it carries over to another
   package. The result is stored under the firm's name.
3. **Arrange (no model).** Each alarming finding of the next run (fail, flag or review, and not dismissed) goes to the
   most specific habit that matches it. Then:
   - A price within the firm's tolerance is kept internal.
   - A finding that no habit names is never hidden. It goes to "Other … points", placed after the firm's last group of
     the same scenario, so a new kind of regulation finding still comes where this firm puts regulation.
   - Plant substitutions are attached to the findings that name the plant.
4. **Reply.** One Muse Wonder call, `firm_reply`, gets the habits and the grouped findings and drafts the email to the
   developer. The draft is checked:
   - every finding id must be in it, with none added
   - every number in it must appear in what Wonder was given

   With no recording and no key, a template is built from the habits' own greeting, opening, closing and sign-off.
5. **Recording.** Both calls are recorded in `tests/fixtures/memory/` with the review's recording discipline: a content
   key plus a hash of the prompt and schema, replayed by default, asked with `--live`.

### The example: learned on the Greenfield sample, applied to the tower

The sample firm's 16 decisions on the review of `samples/greenfield` are invented for the demo, in
`landsight/memory/sample.py`. The firm confirms 12 findings and dismisses 4:

| Finding | Decision | The estimator's note (shortened) |
|---|---|---|
| E09 tree in the fire lane | confirm | Fire lane first, before any money: the permit fails without it. |
| E14 greening fails (Art. 302) | confirm | Near the top; offer the cheapest fix that passes, not more trees. |
| E15 possible protected tree | confirm | Never price a removal without the city's tree survey. |
| E12 tree pit on a slab | confirm | On slabs and roofs, shallow-rooted planting rather than more soil (Chinese ixora under 0.45 m). |
| E21 subtotal skips a row | confirm | Arithmetic first among the money points; "please check", never "error". |
| E02.2, E22.2 bill vs drawing | confirm | The drawing governs; give both numbers. |
| E17 hedge billed per metre | confirm | Hedges per plant; Chinese ixora if Duranta is short. |
| E13 azalea density | confirm | 4 per m² as scheduled; Rhododendron simsii where the spec just says azalea. |
| E19, E20 rates outside the list | confirm | Quote our installed range (12 months of maintenance included); query beyond 15%. |
| E29 missing sheet L-9 | confirm | Ask for every indexed sheet; keep the email short, sign as the estimating team. |
| E23 hidden sheet, E18 misspelt row, E16 scale, E01 open outline | dismiss | Housekeeping, spelling, our own measuring, CAD line work: never raised. |

**Distilled live** on 2026-11-03 at 22:10 UTC (2026-11-04 06:10 UTC+8) in 21.4 s: 3,202 tokens in, 2,869 out, about
$0.07. The response is `chatcmpl-01a1a376-ed87-779c-b129-ca36e1e5bded`, recorded as
`tests/fixtures/memory/firm_habits__65453fd4a4e1fe71.json`. In Wonder's summary:

> The firm sends back permit-blocking regulation problems and missing information before money, then arithmetic,
> quantity, unit and price issues measured against the governing drawing, schedules and its own installed list. It
> handles drawing-production details, scale-bar measurement, spelling and workbook housekeeping internally, keeps the
> email short and polite, and favours practical planting substitutions over more expensive soil or tree additions.

What it learned:

- **Ten send-back groups, in this order:**
  1. fire lane
  2. greening fail
  3. protected tree
  4. tree pit on artificial ground
  5. missing indexed sheet
  6. bill arithmetic
  7. bill quantity vs drawing
  8. planting density
  9. hedge units
  10. rates outside the list
- **Four internal groups:** E01, E16, E18 and E23.
- **Pricing:** installed with 12 months of maintenance, a tolerance of 15%, "quote our range, never their number".
- **Three substitutions:** azalea to Rhododendron simsii, Duranta to Chinese ixora, large trees on slabs to Chinese
  ixora planters.
- **Reply:** polite and short, signed "the estimating team".

**Applied to `samples/tower`.** The memory was learned on another package. The review itself replays from recordings,
and the reply was drafted live on 2026-11-03 at 22:11 UTC in 13.0 s: 2,949 tokens in, 1,308 out, about $0.04. The
response is `chatcmpl-01a1a377-d3dd-7563-847c-155215b3186d`, recorded as
`tests/fixtures/memory/firm_reply__322ca5bae9e37be4.json`.

| # | Before: the run's order | After: the firm's groups |
|---:|---|---|
| 1 | T01 flag: L-103 stands for 4 floors: quantities × 4 | **Greening requirement failure:** T02 fail: roof Orange jasmine on 0.3 m soil |
| 2 | T02 fail: roof Orange jasmine on 0.3 m soil | **Other regulation points:** T10 fail: escape corridor narrowed to 0.9 m |
| 3 | T04 review: roof soil 0.6 m vs 0.3 m | T01 flag: L-103 stands for 4 floors |
| 4 | T08 review: L-102 and L-103 look alike | C-42 review: water retention (Art. 305) |
| 5 | T09 fail: planter over the lift shaft | **Other drawing points:** T09 fail: planter over the lift shaft |
| 6 | T10 fail: escape corridor narrowed to 0.9 m | T04 review: roof soil 0.6 m vs 0.3 m |
| 7 | C-42 review: water retention (Art. 305) | T08 review: L-102 and L-103 look alike |
| 8 | T06 flag: sky-garden shrubs, bill 38.40 vs drawing 153.60 | **Bill quantity differs from drawing:** T06 flag |
| 9 | T07 flag: roof lawn NT$280, 57% under the list | **Unit rate outside the firm's list:** T07 flag |

All nine are still sent. The tower has nothing the firm keeps internal: no open outline, hidden sheet, misspelling or
title-block scale. The regulation and drawing problems now come before the money, as this firm wants.

The reply before, the neutral template:

```
Subject: Change request — Greenfield Residences — Tower Landscape Package

Dear developer,

We reviewed Greenfield Residences — Tower Landscape Package. Please revise these 9 points before we price the job:

1. L-103 stands for 4 floors (Typical Sky Garden Plan, 8F, 12F, 16F, 20F): quantities × 4
2. L-104 (roof): Orange jasmine on 0.3 m soil, below the 0.4 m minimum — not counted toward greening
3. Soil on the roof: L-501 says 0.6 m, L-104 says 0.3 m — needs review
4. L-102 and L-103 look alike: 91% of their line work is the same
5. Planter drawn over the lift shaft (L-102)
6. Planters narrow the escape corridor on L-103 to 0.9 m, below the 1.2 m minimum
7. Water retention (Art. 305): λ 0.017 < λc 0.30 over the basement slab — fails on the drawings' own areas
8. Sky-garden planter shrubs, typ. floor x 1: bill 38.40, drawing 153.60
9. Roof lawn NT$280: about 57% under your installed list (650–850)

Regards
```

The reply after, drafted by Muse Wonder in the firm's voice:

```
Subject: Greenfield Residences

Hello,

Thank you for sending the Greenfield Residences landscape package for review.

Greening requirement failure
1. [T02] Please increase the Orange jasmine soil on L-104 (roof) from 0.3 m to at least the 0.4 m minimum so it can be counted toward greening.

Other regulation points
2. [T10] Please move the planters on L-103 so the escape corridor is no longer narrowed to 0.9 m and meets the 1.2 m minimum.
3. [T01] Please apply the L-103 quantities × 4, as the Typical Sky Garden Plan stands for 8F, 12F, 16F and 20F.
4. [C-42] Please revise the water retention (Art. 305), as λ 0.017 is below λc 0.30 over the basement slab.

Other drawing points
5. [T09] Please confirm where planter B-10 on L-102 should go, as it is drawn over the lift shaft.
6. [T04] Please confirm whether the roof soil is 0.6 m as shown on L-501 or 0.3 m as shown on L-104.
7. [T08] Please confirm that L-102 and L-103 are different floors and that neither is a copy left in by mistake, as 91% of their line work is the same.

Bill quantity differs from drawing
8. [T06] Please correct the sky-garden planter shrubs, typ. floor x 1, from the bill quantity of 38.40 m² to the drawing quantity of 153.60 m².

Unit rate outside the firm's list
9. [T07] Could you please check the roof lawn rate against our installed list range of 650–850, with 12 months of maintenance included?

Thank you.

the estimating team
```

The checks on the draft passed: all nine ids are present and none were added, and no number is absent from what
Wonder was given. The firm's habits show in it:

- "please" and "could you please check", never "error"
- its own installed range and maintenance basis instead of the developer's NT$280
- both numbers on the quantity line
- a short email signed "the estimating team"

### Commands

```bash
uv run python -m landsight memory seed-sample --db out/firm-memory.db           # review the sample, record the 16 decisions
uv run python -m landsight memory distil --firm sample --db out/firm-memory.db  # Muse Wonder (replays the recording)
uv run python -m landsight memory apply --firm sample --package samples/tower --db out/firm-memory.db   # before/after
uv run python -m landsight memory show --firm sample --db out/firm-memory.db
uv run python -m landsight memory forget --firm sample --db out/firm-memory.db
# live (MODEL_API_KEY): add --live to distil or apply; a prompt that already has a recording replays
```

`--json <file>` writes the full result. `--run <id>` applies the memory to a stored run, or limits `distil` to one
run's decisions. The recorded example replays only from a fresh database: other decisions make another prompt, and
that needs `--live`.

API, on the database the server uses:

| Endpoint | What it does |
|---|---|
| `GET /api/firms/{firm}/memory` | the stored habits, with the decisions they came from and the Wonder call |
| `POST /api/firms/{firm}/memory/distil` (`?live=1`; body `{"run_ids": [...]}` optional) | distil and store |
| `DELETE /api/firms/{firm}/memory` | forget the firm |
| `GET` or `POST /api/runs/{run_id}/memory?firm=…` (`&live=1`) | `before` (order, findings, neutral reply) and `after` (groups, sent, kept internal, the reply in the firm's voice, with its checks and call) |

No screen change was made. The endpoints are ready for one.

### Limits

- **Invented decisions.** The demo firm's 16 decisions are invented. A real firm's habits come from its own decisions
  on the screen.
- **Matching is literal.** Grouping matches categories, scenarios, severities and title keywords. A kind of finding
  the firm has never decided on lands in "Other … points", in the firm's scenario order, rather than in a named group.
  Wonder writes the reply from those groups but does not regroup them.
- **One substitution did not carry.** The tower's thin-soil roof planting (T02) did not get the firm's "Chinese ixora
  rather than more soil" habit: Wonder learned it as "large trees on artificial ground", which T02's title does not
  name. The draft asks for more soil instead.
- **One memory per firm.** A new distil replaces it, and the decisions it came from are kept beside it. The table is
  not cleared by `landsight db reset`; use `memory forget`.
- **Wonder is in preview.** It reasons at length even at `low`: 51 s on the first test call, 13 to 21 s on these.
- **Drafts only.** The reply is a draft for a person. Nothing a model writes is sent anywhere.

## Tests and spend

- **Tests.** `tests/test_open_reader.py` (7 tests) and `tests/test_memory.py` (5 tests) replay every new recording
  with no key. They also check:
  - the request shape against a mock transport: URL, model, header, schema, the retry and the fenced answer
  - that the API reader never replays an open answer
  - that a Baseten key never goes to another host
  - the arranging rules on their own
- **Spend on 2026-11-03/04 (UTC).**
  - Baseten, about $0.20: 39 review calls, one question and two probe calls.
  - Meta, about $0.26: four Muse Wonder calls (a test call, a first distillation replaced by the broader prompt, the
    distillation kept, the reply) and no SAM call.
