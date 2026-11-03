# Research: SAM 3.1 on the coloured renders (2026-11-02)

**Conclusion: yes — SAM 3.1 returns every bed and paving area of a coloured plan to within 1% when asked by colour
and shape ("green rectangle", "grey area", "beige area"), but it does not know the type: material words ("lawn",
"paving", "hatched area") return nothing, so the type has to come from the legend swatch or the label inside each
mask.**

## Method

- Site: the m4 synthetic site (`landsight synth --level m4 --coloured`), sheets L-1 (planting) and L-3 (paving)
  rendered filled by `dxf.render_png(filled=True)`: 2100 × 1140 px, 0.039619 m/px along x and 0.039649 m/px along y
  (`dxf.metres_per_pixel`: the render window is the sheet's bounds plus 2%, the axes fill the image).
- Model `sam-3.1` on `POST /v1/responses`, one noun phrase per call, `include_confidence: "true"`,
  `mask_encoding: "one_bit"`. Each prompt was sent once (no retries) on 2026-11-02; every call is recorded in
  `tests/fixtures/sam/<image>__<prompt>.json` with the raw output, boxes, scores, decoded areas and seconds.
- Masks decoded with Meta's `meta_sam_parser` 0.1.0 (PyPI). The masks came back at box resolution (box-local raster
  the size of the box). Area = set pixels × m/px (x) × m/px (y).
- Each mask is matched to the answer-key object it overlaps most (at least half of the mask inside one object);
  the answer key now carries each drawn object's filled footprint for this. Truth areas: shrub bed 150, lawn 200,
  paving 212 / 48 / 36 m² (the answer key); a canopy is the drawn 12-gon of radius 2 m, 12.0 m² (π·2² = 12.57 m²
  would put the eight trees at 100.5 m², and SAM's 99.2 within 1.3% of that); the hedge band is 0.4 × 27 = 10.8 m²
  of polygon, rendered with a 1 pt edge line on each side, which is most of the +33%.
- Control: the same L-3 sheet as plain line work (`render_png` without fill) with "paving".

## Results

| image | prompt | masks | confidence | matched to | SAM m² | truth m² | error % | s |
|---|---|---|---|---|---|---|---|---|
| L-1_filled | green circle | 9 | 0.89–0.92 | 8 × 樟樹 (tree) | 99.2 | 96.0 | +3.3 | 2.61 |
|  |  |  |  | 1 × legend: symbol 樟樹 | 12.6 | 12.0 | +4.7 |  |
| L-1_filled | tree canopy | 0 | - | - | - | - | - | 1.4 |
| L-1_filled | round green shape | 9 | 0.95 | 8 × 樟樹 (tree) | 99.1 | 96.0 | +3.2 | 1.92 |
|  |  |  |  | 1 × legend: symbol 樟樹 | 12.6 | 12.0 | +4.7 |  |
| L-1_filled | hatched area | 0 | - | - | - | - | - | 1.43 |
| L-1_filled | green rectangle | 4 | 0.80–0.93 | 1 × legend: line 金露花 | 2.0 | 1.6 | +23.1 | 1.69 |
|  |  |  |  | 1 × 草皮 (lawn) | 199.7 | 200.0 | -0.2 |  |
|  |  |  |  | 1 × legend: swatch 杜鵑 | 5.9 | 5.6 | +5.5 |  |
|  |  |  |  | 1 × 杜鵑 (shrub_bed) | 149.5 | 150.0 | -0.3 |  |
| L-1_filled | lawn | 0 | - | - | - | - | - | 1.63 |
| L-1_filled | dark green strip | 2 | 0.65–0.67 | 1 × legend: line 金露花 | 1.9 | 1.6 | +21.9 | 2.32 |
|  |  |  |  | 1 × 金露花 (hedge) | 14.4 | 10.8 | +33.4 |  |
| L-3_filled | grey area | 4 | 0.89–0.93 | 1 × legend: swatch 植草磚 | 5.8 | 5.6 | +3.9 | 1.25 |
|  |  |  |  | 1 × 植草磚 (paving) | 35.9 | 36.0 | -0.3 |  |
|  |  |  |  | 1 × 洗石子 (paving) | 47.8 | 48.0 | -0.5 |  |
|  |  |  |  | 1 × legend: swatch 洗石子 | 6.0 | 5.6 | +7.5 |  |
| L-3_filled | paving | 0 | - | - | - | - | - | 1.32 |
| L-3_filled | hatched rectangle | 0 | - | - | - | - | - | 1.09 |
| L-3_filled | beige area | 2 | 0.89–0.96 | 1 × 透水磚 (paving) | 209.9 | 212.0 | -1.0 | 1.37 |
|  |  |  |  | 1 × legend: swatch 透水磚 | 5.9 | 5.6 | +5.0 |  |
| L-3_lines | paving | 0 | - | - | - | - | - | 1.16 |
| L-3_lines | beige area | 0 | - | - | - | - | - | 1.64 |

"8 × 樟樹 (tree)" means eight masks, one on each of the eight canopies. Confidence is the range of the `c` values.
Error = (SAM − truth) / truth.

## What it means for the product and the film

- **Beat 7 can ship.** Line work: 0 masks. Coloured: masks on each bed and each paving area, areas within 1% of the
  CAD figures (−0.3% shrub bed, −0.2% lawn, −1.0% / −0.5% / −0.3% paving). The canopies: 8 of 8 plus the legend
  symbol, +3.3% (the dark edge line is inside the mask).
- **Ask by colour, not by meaning.** Five material or symbol phrases returned nothing on the coloured renders
  ("tree canopy", "hatched area", "lawn", "paving", "hatched rectangle"). Colour + shape words found everything.
  The prompts for a real plan should come from the legend: Muse Spark reads the legend and names each swatch's
  colour ("beige area" → 透水磚), then SAM gets one call per swatch colour.
- **Legend swatches come back too** (every colour prompt also hit the legend). They must be excluded, as the
  geometry already does on CAD (the legend box), or by Muse Spark's legend reading on a PDF.
- **One prompt can return two types** ("green rectangle" → shrub bed and lawn; "grey area" → 洗石子 and 植草磚). The
  type of each mask is decided by what is inside it (the label text) or its colour matched to a legend swatch, not
  by the prompt.
- **Thin features are poor**: the hedge band (0.4 m ≈ 10 px wide) came back at +33% and confidence 0.65; hedges
  stay with geometry ("@0.3m" along a measured line).
- Cost: 12 calls, 1.1–2.6 s each, $0.03 in all ($2.50 per 1,000 images).

## Spark writes the prompts (2026-11-02, second run)

Muse Spark (`read_legend`) was shown the legend box of each filled render and asked for each swatch's colour as a
word SAM can be prompted with; `meta.sam_plan.prompts_from_legend` made the prompts (area → "<colour> area", tree
symbol → "<colour> circle", the hedge line skipped) and SAM got exactly those, once each
(`tests/fixtures/sam/spark_legend/`, `tests/fixtures/spark/read_legend__*.json`).

| sheet | Spark read (colour = label) | s | prompt | masks | on outlines (SAM m² / CAD m²) | legend swatches | s |
|---|---|---|---|---|---|---|---|
| L-1 | light green = 樟樹 (symbol), light green = 杜鵑 (area), dark green = 金露花 (line, skipped) | 5.56 | light green circle | 9 | 8 canopies, conf 0.53–0.55 | 1 | 2.28 |
|  |  |  | light green area | 12 | 8 canopies, 杜鵑 149.3 / 150, 草皮 199.3 / 200 | 2 | 2.12 |
| L-3 | beige = 透水磚, light grey = 洗石子, medium grey = 植草磚 | 3.12 | beige area | 2 | 透水磚 209.9 / 212 | 1 | 1.08 |
|  |  |  | light grey area | 5 | 洗石子 48.0 / 48, 植草磚 36.0 / 36, the planter 24.6 / 24 | 2 | 1.48 |
|  |  |  | medium grey area | 4 | 植草磚 35.9 / 36, 洗石子 47.9 / 48 | 2 | 0.90 |

Every prompt Spark wrote found its swatch's areas, but none is specific to one type: "light green area" also returns
all eight canopies and the lawn (which the legend does not key), "light grey area" and "medium grey area" each return
both grey pavers. So the type still comes from the outline a mask lies in (or the label inside it), never from the
prompt; the legend swatches come back on every call and are excluded. The controlled test: "beige area" on the L-3
line work returned 0 masks (1.64 s), against 2 on the coloured render.

## Not tested

- A real developer's coloured PDF (scanned or exported): different colours, text over the fills, hatch lines drawn
  over colour. Our render is clean, flat colour with no texture.
- Overlapping fills (a tree canopy over a lawn) — the canopies here sit outside the beds.
