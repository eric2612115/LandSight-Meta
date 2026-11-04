# API contract between the FastAPI backend and the Vite + React frontend

Backend: `uv run python -m landsight serve` on **:8795**. Frontend: `frontend/` (Vite dev server on **:5195**,
proxying `/api` to :8795). Both sides build to this file; the frontend ships a `mock/` copy of every response so it
can be developed and filmed before the backend is complete, and switches to live data when `/api/health` answers.

All JSON, UTF-8, snake_case. Coordinates in drawing metres unless stated; the frontend maps them onto the SVG.

## GET /api/health → `{ "ok": true, "spark": "fixtures" | "live", "version": "…", "features": { "upload": true } }`

## POST /api/package/open → `Run`
Body `{ "path": "<folder>" }` or empty (opens the bundled sample package). Runs triage + pipeline + checks (with
fixtures by default, `?live=1` for real Muse Spark/SAM). Returns the full `Run` below.

## GET /api/run → `Run` (the last run)

```ts
type Run = {
  run_id: string
  package: { name: string; folder: string; file_count: number }
  files: FileVerdict[]            // one per file, in triage order
  sheets: Sheet[]                 // every drawing sheet that was read
  items: Item[]                   // the take-off (quantities), across sheets
  checks: Check[]                 // every cross-file / regulation check that ran
  errors: ErrorScore              // the answer-key scoreboard (sample package only)
  tally: TallyRow[]               // the corner tally, already computed
  timing: { total_s: number; spark_calls: number; sam_calls: number }
}

type FileVerdict = {
  file_id: string; path: string; name: string; ext: string; size_bytes: number
  verdict: "drawing_vector" | "drawing_raster" | "drawing_image" | "bill" | "quote" | "spec" | "presentation"
         | "backup_ignored" | "archive_unpacked" | "unsupported" | "unreadable"
  decided_by: "ext" | "content" | "spark"      // who decided
  why: string                                  // one line
  sheet_id?: string                            // when it became a sheet
  children?: string[]                          // file_ids unpacked from an archive
}

type Sheet = {
  sheet_id: string; file_id: string; title: string; number: string       // "L-1", "L-5"
  kind: "plan" | "elevation" | "detail" | "schedule" | "legend" | "cover" | "background"
  kind_confidence: number; kind_by: "spark" | "rule"; kind_why: string
  revision?: string; date?: string; scale_title?: string; scale_measured?: string
  counted: boolean; not_counted_reason?: string
  svg_url: string                 // GET /api/sheets/{sheet_id}.svg — the drawing as it prints
  png_url: string                 // GET /api/sheets/{sheet_id}.png
  bounds: { min_x: number; min_y: number; max_x: number; max_y: number }
  objects: DrawingObject[]
}

type DrawingObject = {
  object_id: string               // "T-08", "H-01", "B-01", "P-02", "X-01"
  kind: "tree" | "existing_tree" | "hedge" | "shrub_bed" | "lawn" | "paving" | "planter_edge" | "legend"
      | "title_block" | "schedule" | "fire_lane" | "boundary" | "match_line"
      | "building"                // a building outline (A-BLDG layers) shown for reference, excluded, never counted
  label?: string; species_code?: string
  centre?: [number, number]; area_m2?: number; length_m?: number
  outline: number[][]             // polygon or polyline vertices, metres
  closed: boolean; gaps?: [number, number][]      // gap points for open outlines
  by: "geometry" | "spark" | "sam"                // who produced the outline
  excluded?: { reason: string; rule?: string }    // legend, outside boundary, fire lane…
}

type Item = {
  item_id: string; kind: DrawingObject["kind"] | "unresolved"; label: string; species_code?: string; unit: "plant" | "m2" | "m"
  geometry_count?: number; spark_count?: number; schedule_count?: number; label_count?: number
  agreed: boolean; flagged_reason?: string; quote_count?: number
  object_ids: string[]; sheet_ids: string[]
  spark?: { crop_url: string; answer: object; why: string; confidence: number; points?: [number, number][] }
  confirmed?: boolean             // set by POST /api/items/{id}/confirm
}

type Check = {
  check_id: string                // "E02" when it matches a planted error, else "C-…"
  category: "quantity" | "revision" | "sheet" | "area" | "scale" | "bill" | "price" | "arithmetic"
          | "units" | "regulation" | "protected_tree" | "ingest" | "document"
  title: string                   // "Schedule says 12 camphor, drawing shows 8"
  severity: "flag" | "fail" | "review" | "info"
  by: ("geometry" | "spark" | "sam" | "rule" | "bill")[]
  why: string                     // one or two sentences
  evidence: { file_ids?: string[]; sheet_ids?: string[]; object_ids?: string[]; cells?: string[] }
  citation?: { article: string; url: string; gloss: string }       // regulation checks
  numbers?: Record<string, number | string>                          // e.g. required, provided, bill_qty, drawn_qty
  fixes?: { label: string; result: number | string; passes: boolean }[]
}

type ErrorScore = { planted: number; found: string[]; flagged: string[]; missed: string[]; false_alarms: string[] }

type TallyRow = { label: string; species_code?: string; drawn: number; spark: number; schedule: number; unit: string; status: "agreed" | "flagged" | "confirmed" }
```

## POST /api/items/{item_id}/confirm → `Item` (confirmed, quote_count set; the tally updates)

## GET /api/sheets/{sheet_id}.svg · .png — the sheet as rendered; GET /api/crops/{item_id}.png — what Spark saw
`?run=<run_id>` serves any stored run's sheet: its package is reviewed again from the recordings on first use (the last three kept); without it, the current run.
`?run=<run_id>` serves any stored run's crop the same way; every render and crop URL inside a Run already carries its own `?run=`.

## GET /api/rules → `Check[]` the regulation checks only, with `numbers` holding every term:
`required, A0, Ap, r, A_prime, beta, provided, alpha, ra, terms: [{label, count_or_area, Ai, Gi, product}]`

## GET /api/director → `Scene[]`
The scenes the film plays, each a pointer into the run, in order; the frontend owns the animation.
```ts
type Scene = { id: "drop" | "wake" | "eye" | "hedge" | "colour" | "gauge" | "bill" | "callback"
               title: string; sheet_id?: string; focus?: string[]; check_ids?: string[]; item_ids?: string[]
               duration_s: number }
```

## The sample package
`uv run python -m landsight package <dir>` writes it; `POST /api/package/open` with no body opens
`samples/greenfield/` (generated at build time into the repo, small). The answer key never leaves the backend
except as `errors` (the scoreboard).

---

# v2 (2026-11-02): scenarios, landsight.db, ask the package, SAM on the raster plan

Everything below is additive: every v1 endpoint and field above still answers as before (D-59 … D-69 in
docs/DECISIONS.md). The backend writes every review to **landsight.db** (SQLite; `LANDSIGHT_DB`, else `./landsight.db`).
`POST /api/package/open` and `POST /api/packages/{id}/review` both make "the current run", and every v1 endpoint
(`/api/run`, `/api/sheets/…`, `/api/crops/…`, `/api/items/{id}/confirm`, `/api/rules`, `/api/director`) maps onto it.

## Run — new fields

```ts
type Scenario = "quote" | "regulation" | "design" | "format" | "info"
// Run gains:
//   scenarios: Record<Scenario, ScenarioSlice>     the scoreboard per kind of catch
//   package_id?: number                            the landsight.db package the run belongs to (API only)
//   annotations?: Annotation[]                     confirmations, price confirmations, notes and flags (when any)
//   flags?: Annotation[]                           flags raised on a file or item rather than a check
//   timing.fresh?: FreshCall[]                     live re-asks of recorded calls (see ?fresh)
type ScenarioSlice = {
  planted: number          // planted errors of this scenario (answer key)
  found: string[]; flagged: string[]; missed: string[]   // error ids, whichever check matched them
  false_alarms: string[]   // check ids of this scenario's alarms that match no planted error
  checks: number; alarms: number                          // checks in this scenario; how many are flag|fail|review
}
type Annotation = { kind: "confirm_element" | "confirm_price" | "regulation_note" | "flag"; target_id: string
                    value: unknown; why: string; source: "screen" | "ask" | string; at: string }
type FreshCall = { call: string; response_id: string; fresh_of: string; same_as_recorded: boolean; seconds: number
                   fixture: string }
```

**Check** gains:
- `scenario: Scenario` — every check. quote = bill vs drawing / price list / itself; regulation = §299/§302/§305,
  pits, soil, protected trees, the green-building checklist; design = revisions, sheet kinds, scale, overlaps,
  label vs hatch, outlines, the index; format = what the files are; info = agreement (`ok`) and plain summaries.
- `pending_items?: string[]` and `if_confirmed?: {title, why, severity, numbers, fixes?, status?, before_downgrade?,
  after_downgrade?}` — a check that depends on what Muse Spark proposed (T-08) and a person has not confirmed. The
  check as served counts geometry only (7 Camphor); `if_confirmed` is the same check once every pending item is
  confirmed (8). After `POST /api/items/{id}/confirm` (or an ask action `confirm_element`) the server swaps it in and
  sets `confirmed_state: true`. Checks affected on the sample: E02, E09, E12, E14 (greening), E30, the §305 check.
- `notes?: Annotation[]`, `flags?: Annotation[]` — left by a person or by an accepted ask action.
- `unscored?: true` — a computed result the answer key does not cover (the Art. 305 water-retention check): never
  matched to a planted error, never a false alarm; the CLI lists it as "outside the answer key".
- Greening fixes gain `id: "d"`, keep the existing old tree: `{label, result, passes, id: "d", extra_trees: 0,
  object_ids: ["EX-01"], adds: 84.8, citation}` (in `fixes` and in both gauge states).

**ErrorScore** (`errors`) is unchanged. On the sample: planted 30 · found 28 · flagged 2 · missed 0 · false alarms 0;
by scenario quote 10 (9/1/0), regulation 5 (4/1/0), design 11 (11/0/0), format 4 (4/0/0).

**Item** gains (SAM on the raster Presentation Plan, ids `S-01…`): `source: "sam"`, `against: {item_id, label, dxf,
sam, diff_pct, unit, symbols?: {drawn, counted, excluded, existing}}`, `sam: {raster_sheet_id: "F-26-p1", file_id,
prompt, prompt_source: "spark_raster_plan", masks: [{box_px: [l, t, r, b], score, area_m2}], typed_by: string[],
m_per_px, area_m2}`. These items are `agreed: false`, `quote_count: null` until confirmed, never in `tally`, and have
`sheet_ids: []` (the raster page is a sheet only in the API's Run). The API's raster sheet `F-26-p1` carries one
object per SAM mask: `{object_id: "S-02-M01", kind, label, item_id, centre, area_m2, outline (pixels), closed: true,
by: "sam"}`.

**Tally**: `drawn` is geometry's count until a person confirms (7 for Camphor; the CLI's Run now agrees with the API's).

## GET /api/run?scenario=quote → `Run` as one scenario sees it
`checks` limited to that scenario, `errors` replaced by the slice (planted/found/flagged/missed/false_alarms of that
scenario, `matches` limited to its errors), `scenario: "quote"`. 400 for an unknown scenario.
The same `?scenario=` works on `GET /api/runs/{id}`.

## Stable data (landsight.db)

### GET /api/projects → `Project[]`
```ts
type Project = { project_id: number; name: string; created_at: string; packages: Package[] }
type Package = { package_id: number; project_id: number; name: string; folder: string   // repo-relative when inside
                 kind: "site" | "tower"; registered_at: string; runs: number
                 latest_run: null | { id: string; mode: "fixtures" | "live"; finished_at: string; planted: number
                                      found: number; flagged: number; missed: number; false_alarms: number
                                      spark_calls: number; total_s: number } }
```
### POST /api/projects `{name}` → `Project` (created or existing)
### POST /api/projects/{project_id}/packages `{path, name?}` → `Package`
Registers a folder (the package folder itself or the folder `landsight package` wrote). 404 unknown project, 400 not a
folder, 422 bad body. Registering the same folder twice returns the same package.
### POST /api/projects/{project_id}/packages/upload — a dropped folder (feature `upload`, D-81)
`multipart/form-data`, one part per file of the dropped folder. The part's **filename** is its path relative to the
dropped folder, top folder included (`greenfield/answer_key.json`, `greenfield/Greenfield Residences — Landscape
Package/Drawings/CAD/L-1 Planting Plan.dxf`); a part without a filename may carry the path in its field name;
parts without either are ignored. Field name for files: `files` (any name works). Drop the outer folder (the package
folder with `answer_key.json` and `firm price list.csv` beside it) and the run is scored; drop the package folder alone
and it is reviewed with an empty scoreboard.

The server streams the body (Content-Length is not trusted), writes each file under `out/uploads/<id>/` (never
under samples/), skips hidden files (`.DS_Store`, `._*`), names the upload by a hash of its sorted relative paths and
file contents (the same content twice → the same folder → the same package, `reused: true`), registers the dropped
folder under the project and reviews it by package id from the recordings — inside the same "opening" counter as
`/review`, so `GET /api/run` answers 202 while it runs. Response 200:
```ts
{ package: Package & { path: string }     // as GET /api/packages/{id}; latest_run is the run below
  run: Run | null                         // as POST /api/packages/{id}/review returns it (null only if the review
                                          // itself raised; then upload.review_error says why)
  upload: { id: string                    // 16 hex characters, the content hash
            folder: string                // the folder registered, repo-relative (out/uploads/<id>/greenfield)
            files: number; bytes: number  // written
            skipped: string[]             // hidden files not written
            reused: boolean               // that content was already uploaded
            review_error?: string } }
```
Paths (400, `{detail, rule, path}`): `rule` is `empty` (no path), `absolute` (/…), `backslash`, `nul`, `drive` (C:…),
`empty_segment` (// or a trailing /), `dotdot` (a `..` segment), `dot` (a `.` segment), `outside` (resolves outside the
upload folder), `duplicate` (the same path twice), `conflict` (a file and a folder of one name). Names are normalised
to NFC. Caps, counted as the bytes arrive (413, `{detail, cap, limit, path}` — `path` is the part that passed it):
`cap` is `files` (500 files), `per_file` (50 MB, 52,428,800 bytes) or `total` (100 MB, 104,857,600 bytes); the half-
written upload is deleted. 400 for an empty upload (no file parts); 422 for a body that is not multipart/form-data
or is malformed (truncated, no boundary); 404 for an unknown project, or when the feature is off
(`LANDSIGHT_FEATURES_OFF=upload`). `GET /api/health` says which: `features: {upload: boolean}`.

### GET /api/packages/{package_id} → `Package & {path}`
### POST /api/packages/{package_id}/review → `Run`
Runs the review (recorded calls; `?live=1` live with MODEL_API_KEY; `?live=1&fresh=N` re-asks N recorded Muse Spark
calls live, `fresh=all` (or `-1`) every Muse Spark and SAM 3.1 call, as the CLI's `--fresh N|all`; anything else is
422). The run, one row per check and every Meta call are written to the
database; prices come from the database's price list. The Run becomes the current run.
### GET /api/runs/{run_id} → `Run & {stored: true, package_id, current?: true}`
A stored run with its confirmations, notes and flags applied (`annotations`; checks swapped to `if_confirmed` when
their pending items are confirmed). 404 unknown.
### GET /api/runs/{run_id}/checks?scenario=&confirmed= → `Check[]`
The export listing: one row per check as stored, with its decision; checks a person dismissed are left out (open and
confirmed stay). `confirmed=1`: only the confirmed ones.

## A decision on each flag (the Confirm step and the Statement)

Every check in `GET /api/run`, `GET /api/runs/{id}` and the listing above carries:
```ts
decision: "confirm" | "dismiss" | "open"   // "open" until a person decides
note: string | null                        // the person's note, if any
decided_at: string | null                  // ISO time of the last decision
```
`GET /api/run` and `GET /api/runs/{id}` return every check (dismissed ones too, so the screen can show and reopen
them); add `?confirmed=1` for the Statement: only checks whose decision is "confirm" (combines with `?scenario=`).

### POST /api/runs/{run_id}/checks/{check_id}/decision `{decision: "confirm" | "dismiss" | "open", note?: string}` → `Check`
Saves a person's verdict on one check of a stored run (the current run included) and returns that check exactly as
the run's `checks` list serves it, with `decision`, `note` and `decided_at` set. The latest decision wins; "open"
reopens a check (a note sent with it is kept, an absent note clears it). Kept in landsight.db (table `decisions`), so it
survives a reload and another browser. 422 for another decision word, a note that is not a string or is longer than
2,000 characters, or a body that is not an object; 404 for an unknown run or check id. It does not confirm an item:
`POST /api/items/{item_id}/confirm` (T-08's count) is unchanged and separate.

## GET /api/packages/{package_id}/runs → `RunSummary[]` (newest first; 404 unknown package)
```ts
type Counts = { planted: number; found: number; flagged: number; missed: number; false_alarms: number }
type RunSummary = {
  run_id: string
  created_at: string; finished_at: string            // ISO, when the review started and finished
  source: "fixtures" | "live"                        // live: Meta calls asked (with or without ?fresh)
  scoreboard: Counts                                 // all zeros for a package without an answer key
  by_scenario: { quote: Counts; regulation: Counts; design: Counts; format: Counts }
  seconds: number                                    // total_s of the review
  calls: { spark: number; sam: number }
}
```
frontend-mock/package_runs.json holds this listing for the sample (scripts/frontend_mock.py now writes the mock from a
database of its own, so it holds exactly the run it opens).

### GET /api/price-list → `PriceRow[]`
```ts
type PriceRow = { code: string; name: string; spec: string; unit: string   // "EA" | "plant" | "m²" | "m"
                  low: number; high: number                                   // TWD, installed
                  basis: "published_budget" | "sample" | string; source: string; updated_at: string }
```
Seeded: CC, DU, AZ, LA, PV-1, PV-2, PV-3 (the sample's firm list) and RL, RI, IC, MP (the tower's rows).
### PUT /api/price-list/{code} `{low?, high?, name?, spec?, unit?, basis?, source?}` → `PriceRow`
Edits a rate (or adds a code, which then needs name, low and high). 422 when low > high, a value is not a number or a
field is unknown. The next review prices against it (a price flag can disappear: the scoreboard then reports the
planted error as missed, honestly).

### GET /api/meta-calls?run=&ask=&full=1 → `MetaCall[]`
```ts
type MetaCall = { id: number; run_id: string | null; ask_id: number | null
                  model: "muse-spark-1.3" | "sam-3.1"; call: string   // review_classify_sheet, read_detail, ask_package, '"beige area" on L-3 filled' …
                  kind: "spark" | "sam"; prompt: string                // the prompt as sent (SAM: the noun phrase)
                  response: string                                     // Spark: the parsed JSON; SAM: the raw token stream
                  usage: { prompt_tokens?, completion_tokens?, response_id?, … }; seconds: number
                  recorded_at: string; fixture: string                 // repo-relative recording
                  live: boolean; created_at: string }
```
`run` defaults to the current run; `full=0` trims prompt and response to 400 characters. A run's own calls have
`ask_id: null`; each question's call has its `ask_id`.

## Ask the package (the agentic layer)

### POST /api/ask `{question, run_id?, lang?}` → `Answer` (`?live=1` asks Muse Spark live and records it)
`lang`: `"en"` (default) or `"zh-TW"` — the answer in Traditional Chinese, recorded under its own key; 422 otherwise.
```ts
type Answer = {
  question: string; answer: string; confidence: number; run_id: string; ask_id: number
  citations: { file_id: string      // a package file (F-22), "rules" (regulation table), "price-list", "run" (a check)
               page: number         // 1-based PDF page; 0 when the source has no pages
               quote: string        // verbatim from that source (≤ 30 words)
               verified: boolean    // the quote was found in the chunk it cites
               source: string | null; chunk_id: string | null }[]
  proposed_actions: { kind: "confirm_element" | "confirm_price" | "regulation_note" | "flag"
                      target_id: string    // I-01 | a price-list code | a check id or regulation id | a check, item or file id
                      value: string; why: string }[]
  sources: { n: number; chunk_id: string; file_id: string; page: number; source: string
             kind: "pdf_text" | "pdf_raster" | "pdf_drawing" | "bill_row" | "bill_version" | "sheet" | "rule" | "price" | "check"
             score: number; image: boolean }[]     // what retrieval sent (BM25), in order; image: its page render went too
  images: string[]                                 // chunk ids whose page image was attached
  call: { model: string; seconds: number; recorded: boolean; fixture: string; usage: object }
}
```
Without `run_id` the current run (else the database's latest) is used. 404 when no run exists or when the question
has no recording and `live` is not set; 422 for an empty question. Recorded questions (sample package): "What soil
depth does the spec require for trees on the slab?", "Does Article 302 apply to this 1,500 m² site?", "Which bill
revision is current and what changed?", "Is PV-1 permeable paving?", "What does the green-building checklist require
from landscape?", "Why is the camphor row flagged?".

### POST /api/ask/actions `{run_id?, action: {kind, target_id, value, why}}` (or the four action fields at top level)
→ `{confirmation: Confirmation, price_row?: PriceRow, item?: Item, run: Run}`
- `confirm_element`: target an item id; the item is confirmed (as POST /api/items/{id}/confirm) and dependent checks
  swap to `if_confirmed`.
- `confirm_price`: target a price-list code; `value` "low-high" (NT$, e.g. "6200-7200") is written to the price list.
- `regulation_note`: target a check id or a regulation id; appears in that check's `notes`.
- `flag`: target a check id (its `flags`) or anything else (the Run's `flags`).
`run` is the Run with the action applied. 404 unknown target, 422 unknown kind or a price without numbers.
```ts
type Confirmation = { id: number; run_id: string; kind: Annotation["kind"]; target_id: string; value: unknown
                      why: string; source: string; created_at: string }
```

## Command line (same data)
`landsight review <dir> [--scenario quote|regulation|design|format] [--live [--fresh N|all]] [--db f | --no-db]
[--fixture-dir d]`, `landsight db init|reset|stats|calls [--run id]`, `landsight ask "<question>" [--run id] [--live]`,
`landsight package <dir> [--tower | --seed 7 --layout b]`.

## The tower (samples/tower, `landsight package <dir> --tower`)

**Sheet** gains, for a sheet whose title names floors (Muse Spark's `review_read_floor_sheet`): `floors: string[]`
(`["6", "9", "12", "15", "18", "21"]`, `["R1"]`), `floor_count: number` (6 for a typical sheet, else 1),
`floor_label: string` (as the title block writes it), `ground: "grade" | "over_basement" | "podium" | "balcony" |
"roof" | "mixed" | "unknown"`. The screen can group sheets by floor with these.

**Item** gains `floors?: {per_floor: number, factor: number, total: number, sheets: {sheet_id: string[]}}` when it is
drawn on a typical-floor sheet; its counts (`geometry_count`, `proposed_count`, `quote_count` …) are the totals.

**Check** (all with `scenario` set by the check):
- "L-103 stands for 4 floors (…): quantities × 4" — category quantity, scenario regulation, `per_floor: [{item_id,
  label, per_floor, floors, total, unit}]`, `floors: string[]`.
- "L-104 (roof): … on 0.3 m soil, below the 0.4 m minimum — not counted toward greening" — category regulation, fail;
  `soil_table: [{planting, soil_m, minimum_m, passes}]`, `ground`; a sheet that passes gets the same check as info
  with `ok`.
- "Soil on the roof: L-501 says 0.6 m, L-104 says 0.3 m — needs review" — category sheet, review, scenario design,
  `numbers: {detail_m, plan_m}`.
- "Duranta: the same symbol and label on 2 floors — counted on each (284 in all)" — category quantity, info, design.
- "L-102 and L-103 look alike: 91% of their line work is the same" — category sheet, review, design, `numbers.share`.
- "Planter drawn over the lift shaft (L-102)" — category area, fail, design: a planting polygon over a closed outline on
  a layer named for the lift (A-CORE-LIFT); `numbers: {overlap_m2, planter_m2, lift_m2}`, the planter in
  `evidence.object_ids`.
- "Planters narrow the escape corridor on L-103 to 0.9 m, below the 1.2 m minimum" — category regulation, fail,
  scenario regulation, `citation` Art. 92: the narrowest clear width between the walls on a layer named for egress
  (A-EGRESS) once the planters inside are taken out; `numbers: {clear_m, walls_m, minimum_m, floors}`, `floors:
  string[]` when the sheet stands for several floors.

# v3 (2026-11-04): the open reader and firm memory (both opt-in; docs/NEW-MODES.md)

## The open reader
`POST /api/packages/{package_id}/review?reader=open` and `POST /api/ask?reader=open` (with or without `live=1`) read
with Muse Spark Open (`meta-models/muse-spark-open-1026` on Baseten, or the server named by `LANDSIGHT_OPEN_BASE_URL`)
instead of `muse-spark-1.3`. `LANDSIGHT_READER=open` makes it the server's default. A Run read this way carries
`timing.reader: "open"` and `timing.model`; every call in `timing.calls` and `/api/meta-calls` names the open model.
`reader` other than `api` or `open` → 422; `live=1` with the open reader and no key → 400. `/api/health` adds
`reader: {name: "open", model}` only when `LANDSIGHT_READER=open`; otherwise its answer is unchanged.

## Firm memory (Muse Wonder)
### GET /api/firms/{firm}/memory → `FirmMemory` (404 when the firm has none)
`{firm, habits, evidence, model, call, updated_at}`: `habits` is Muse Wonder's distillation `{summary, send_back:
Group[], handle_internally: Group[], pricing: {basis, tolerance_pct, conventions, evidence}, species_substitutions:
[{from, to, when, evidence}], reply: {tone, greeting, opening, closing, sign_off, rules, evidence}}`, where `Group` is
`{name, match: {categories, scenarios, severities, keywords}, why, evidence: string[]}`; `evidence` lists the decisions
it was learned from; `call` is the Wonder call (model, seconds, usage, response_id, recorded, fixture).
### POST /api/firms/{firm}/memory/distil `{run_ids?: string[]}` → `FirmMemory` (`?live=1` asks Muse Wonder)
From every confirmed or dismissed check in landsight.db (or only those runs). 422 when there is nothing to learn from;
404 when no recording answers these decisions and `live` is off; 400 for `live=1` without `MODEL_API_KEY`.
### DELETE /api/firms/{firm}/memory → `{firm, forgotten: boolean}`
### GET or POST /api/runs/{run_id}/memory?firm=default → `Applied` (`&live=1` drafts the reply live)
`{firm, run_id, package, memory: {model, updated_at, decisions}, before: {order: string[], findings, reply},
after: {order, groups: [{name, why, send, checks: [{check_id, severity, scenario, category, title, outside_list_pct?,
firm_notes?}]}], sent: string[], kept_internal: string[], reply}}`. A `reply` is `{subject, body, order, by}`
(`by`: `template` or `muse-wonder-1.0`); Wonder's also carries `missing`, `added`, `unverified_numbers` (its checks)
and `call`. 404 for an unknown run or a firm with no memory.

CLI: `landsight review|ask … --reader open`; `landsight memory seed-sample|distil|show|apply|forget [--firm f] [--run
id] [--package dir] [--live] [--json f] [--db f]`.
