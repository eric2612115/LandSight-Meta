# Plan

Deadline: submission on the Cerebral Valley platform by 2026-11-04 21:00 ET = 2026-11-05 10:00 UTC+8. Judges
see the public repo, the three-minute film and the live product. Stage one is pass/fail on "fits a theme and
reasonably uses Meta Model API or open weights"; stage two scores Impact 30 / Meta tooling 25 / Depth 20 / Demo
25; the top five films per track are watched live. Bonus prizes we can reach: Most Viral on X ($20k), Best Build
on Open Weight Models ($10k, Muse Glimmer or Muse Spark Open), Best Agentic Use-Case ($5k).

Sources for every number below: `landsight/data/` (regulations and prices, with `SOURCES.md`), `docs/research/` (Meta
API facts and the SAM probe, read 2026-11-01) and `spike/` (what the models actually did on 2026-11-01).

## What is built (all of it Nov 1–4)

```
landsight/
  synth/      generates DXF planting + paving plans with an answer key (counts, areas, labels, sheets)
  dxf/        reads a DXF: entities, layers, text; renders SVG (browser) and PNG (models)
  geometry/   shapely: snap, polygonize, areas, lengths, spacing-along-line, legend/title-block exclusion
  meta/       Spark (chat completions, JSON schema, images), SAM 3.1 (responses), Glimmer (OpenAI-compatible)
  takeoff/    merges geometry, Spark and the schedule into items with IDs and a confidence; flags disagreements
  rules/      building-code checks with article citations
  bill/       reads the developer's Excel bill, aligns names (Spark), flags quantity and price deviations
  app/        FastAPI + one page: the plan as SVG, IDs, confirm, the disagreement panel, rules table, quote
tests/        answer-key tests for synth → takeoff; unit tests for geometry and rules
demo/         pitch spine, script, hooks, shot list, captured screens
```

## Division of labour (D-03, confirmed by the spike)

| Job | Tool | Why |
|---|---|---|
| Lengths, areas, closed-shape counts, gap snapping, spacing along a line | shapely | exact, instant, free |
| Decide whether loose segments are one object; read labels, "typ.", "×N", "@3m", leaders; read the plant schedule; classify a sheet (plan / elevation / legend / detail) | Muse Spark 1.3 (vision, JSON schema, grounding points 0–1000) | the spike read every CJK label and quoted 10 trees from 3 symbols in 7.7 s |
| Planting beds and paving areas on coloured plans, hatch fills, scans | SAM 3.1 (text concept prompt) | it found the filled canopies ("circle", c = 0.965) and nothing on line work; $2.50 per 1,000 calls |
| Same reading on open weights (bonus prize) | Muse Glimmer 30B via Together (`meta-models/Muse-Glimmer-30B`, has vision, Apache 2.0) | optional, one extra backend behind the same interface |

API facts that shape the code: SAM takes one noun phrase per request and returns every match, with boxes in
source pixels and masks as base85 (`meta_sam_parser`); box/point prompts exist but cannot be mixed with text.
Spark takes up to ~50 images per request, images only in user messages, coordinates normalised to 0–1000,
`response_format: json_schema` on chat completions, automatic prompt caching. Auth is a bearer `MODEL_API_KEY`
on `https://api.meta.ai/v1`.

## Who uses it (D-06)

The owner of a landscape design firm, reviewing a developer's package (CAD drawings + the developer's Excel bill
of quantities) to decide whether to take the job and what is wrong with it. By hand this takes two to three
weeks per project. Three questions, in this order: do the drawn quantities match the bill; do the unit prices
sit inside the firm's own price list; does the planting pass the building code. The firm's owner is a designer,
so the code fix (a species swap) is their own lever.

## The synthetic site (one site, three sheets, one answer key — v2 after the judges)

Modelled on a published municipal L-6 planting plan and a government CAD export's layer mess.
Locked so that every number in the film agrees: exactly 8 trees, one species, the elevation sheet is the only
source of a naive 16.

- **Title block (all sheets):** 工程名稱 綠邑社區景觀工程 (fictional), 圖名, 圖號, 比例 1:200, 基地面積
  1,500 m², 建蔽率 40%, 日期. A city without its own greening rule, so the national rule applies (β = 0.66). Legend box 圖例 with one tree
  symbol, one shrub swatch, one hedge line. Scale bar, north arrow.
- **L-1 植栽配置平面圖 (30 × 50 m):** 8 樟樹 (H3.5 W1.5 米徑10cm) in a frontage row along the south road at 4 m
  spacing, canopy radius 2.0 m drawn as 12 loose segments with per-tree gaps [0, 0, 5, 5, 10, 10, 20, 40] cm
  and a `+` centre; the 40 cm one is the tree geometry cannot close (the film's T-07). Labels: one leader
  「樟樹 typ.」 on the third tree (typ. = the label carries to every identical symbol, never a multiplier), or
  one group leader 「8-樟樹」. No dashed canopies (dashed means an existing tree). A hedge 金露花 H0.6 @0.3m 雙排
  as two parallel lines 0.4 m apart, exactly 27.0 m: 2 × (⌊27.0/0.3⌋ + 1) = 182 株, counted by geometry. A
  hatched shrub bed 杜鵑 150 m² (4 株/m²); lawn 200 m².
- **植栽表 on L-1:** 樟樹 8 株 H3.5 W1.5 米徑10 · 金露花 182 株 · 杜鵑 150 m² · 草皮 200 m², with the footer
  「植栽表合計 喬木 8 株 / 圖面 8 株」. A switch `schedule_mismatch` makes the list say 12 while the drawing has 8.
- **L-2 南向立面圖:** the same 8 樟樹 from the side; a naive count over L-1 + L-2 gives 16.
- **L-3 鋪面計畫圖:** 透水磚 212 m², 洗石子 48 m², 植草磚 36 m² as hatched closed areas with callouts; a
  planter edge as loose segments.
- **The developer's bill (synthetic .xlsx):** 樟樹(米徑10cm) 12 株 @ NT$5,000 · 金露花 150 株 · 透水磚 212 m² …
  with 規格, 損耗 and a 小計 / 管理費及利潤 / 營業稅 5% footer, as real bills have.
- **The firm's price list (CSV, "sample price list"):** 樟樹 米徑10 H3.5: NT$14,000–16,000, etc. No public
  unit-price source was found, so prices are labelled as the user's own list.
- **Answer key JSON:** every object with sheet, kind, label, centre, area_m2, quote_count (elevation trees: 0);
  the expected flags: camphor bill 12 vs drawn 8; hedge bill 150 vs drawn 182; camphor price 5,000 vs list.
- **The coloured version:** L-1 and L-3 rendered filled (canopies green, hedge band, beds hatched, lawn light
  green, each paving type its own tone) for SAM.

Messiness is parameterised (gap size, exploded or not, layer naming, label style, schedule mismatch) so the
tests can sweep it.

**The code numbers on this site (建築技術規則 §302 via the 技術規範):** A′ = (1,500 − 0) × (1 − 0.4) = 900 m²;
required = 0.5 × 900 × 0.66 = 297.0. Provided: trees 8 × 16 × 1.5 = 192; shrubs 150 × 0.5 = 75; hedge
≈ 16 m² × 0.5 = 8; lawn 200 × 0.3 = 60; Σ = 335; one species so α = 0.8 → 268.1: short. Fix A: +2 樟樹 →
383 × 0.8 = 306.5 ✓. Fix B: swap 2 樟樹 for 2 茄苳 (both native) → ra = 1, α = 1.3 → 435.6 ✓, no extra trees.

## Pipeline

1. `dxf.load` → entities per sheet, text with positions, layers (never trusted for class).
2. `geometry.close` → polygonize with snap tolerance; closed shapes get IDs and areas; open clusters are kept
   as candidates with their bounding boxes.
3. `geometry.exclude` → regions inside the legend box and title block are marked, not counted.
4. `meta.spark.classify_sheet` → plan / elevation / detail / schedule (one image per sheet).
5. `meta.spark.group_and_read` → for each open candidate cluster (rendered with its ID and neighbours): one
   object or not, its label, what the label implies (typ., ×N, @spacing), confidence, explanation.
6. `meta.spark.read_schedule` → the table as JSON.
7. `geometry.expand` → "@3m" along a measured line = floor(L / 3) + 1; "×8" = 8 at the symbol.
8. `meta.sam.areas` (coloured plans only) → bed and paving masks → m² via the scale bar.
9. `takeoff.merge` → per item: geometry count, Spark count, schedule count; agree → counted; disagree → flagged.
10. `rules.check` → see below.
11. `bill.read` (openpyxl) → the developer's bill rows; `meta.spark.align_names` → bill row ↔ drawing item
    (「樟樹(米徑10cm)」 ↔ 「樟樹 H3.5 W1.5 米徑10」); `bill.compare` → quantity flags (bill vs drawing) and price
    flags (bill vs the firm's price list); every flag carries the item IDs it came from.
12. `app` → confirm screen; nothing is reported before confirmation (D-04).

## Rules module (cited)

- **建築技術規則 建築設計施工編 第298, 299, 302–304條** and the **建築基地綠化設計技術規範**: TCO2 =
  (Σ Gi·Ai)·α must exceed TCO2c = 0.5·A′·β; A′ = (A0 − Ap)·(1 − r), A′ ≥ 0.15·A0; α = 0.8 + 0.5·ra, ra = 0
  with fewer than two tree species; Gi: 闊葉大喬木 1.5, 小喬木 1.0, 棕櫚 0.66, 灌木 0.5 (≥2/m²), 草坪 0.3;
  tree Ai = 16 m² (urban site, 4 m spacing); β = 0.66 ordinary sites, 0.83 school/park, 0.50 commercial/
  industrial. Applies to new buildings on sites > 300 m².
- **A local greening rule for new buildings** (in force 2026-01-01): 綠覆率 by class (Class 4: 60%, 綠容率 1.6); β
  0.99 / 0.83 / 0.66 by class; shrubs ≥ 4 per m²; soil depths. Flagged as municipal.
- **A local tree protection rule, Art. 3**: protected tree if DBH ≥ 0.8 m broadleaf (0.6 conifer, 1.1 Ficus) or
  age ≥ 50; existing trees on the plan above these sizes are flagged "needs a protection plan before the permit".
- Output per rule: article, inputs read from the drawing, result, pass / fail / needs review, and the cheapest
  fix (more trees, a second native species, more shrub area).

The synthetic site is sized so that L-1 fails 第302條 with eight trees of one species (α = 0.8) and passes with
either two more trees or two of them swapped for a second native species (α = 1.3): the film's beat 8. On
screen α is glossed as the native-tree bonus (needs at least two species), and the footer says the architect
signs off (D-05).

## Evaluation (the quant's credibility)

`tests/test_answer_key.py` runs the pipeline on the synthetic site at five messiness levels and reports, per
kind: count error, area error (%), items flagged, items wrongly confident. The README prints the table. Real
developer drawings are checked privately and never leave the machine (D-02).

## Order of work

1. **Nov 1 (tonight):** synth generator + answer key; dxf load + SVG/PNG render with CJK text; geometry close /
   exclude / expand; Spark group_and_read + read_schedule + classify_sheet; takeoff merge; tests at two
   messiness levels. Film: script v2 after the judges, shot list.
2. **Nov 2:** rules + bill (xlsx, name alignment, deviation flags); app page (SVG plan, IDs, confirm,
   disagreements, rules table, bill flags with click-to-highlight); SAM areas on the coloured render; Glimmer
   backend if cheap. Capture every app screen the script needs, plus the naive-Spark "16" capture.
3. **Nov 3:** cut the film; README with the error table and the Meta-model table; X post; repo public.
4. **Nov 4:** buffer; submit well before 10:00 UTC+8 on Nov 5.

Code goes fast at Eric's pace; the film iterations and the screen captures are the bottleneck, so the app's
screens are designed from the script, not the other way round.

## Risks, once

- SAM on a real coloured developer plan is untested; the spike only used our own filled render.
- Spark grouping on a dense plan (many candidates in one image) may confuse neighbours; mitigated by rendering
  one candidate with its neighbourhood at a time and by the schedule cross-check.
- The 建築基地綠化設計技術規範 edition date is unconfirmed; the article numbers are from the current 全國法規資料庫.
- No public unit-price database was found; quote prices are reference values, labelled as such.
