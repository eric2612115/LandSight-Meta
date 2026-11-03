# The sample package: thirty files, thirty planted errors

Eric's call (2026-11-02): a developer's package is not a drawing, it is a folder — PDFs, DWGs, backups,
font files, pasted images, three revisions of the bill in three folders, a quote in Excel 97 format, a RAR, a
SketchUp model, a slide deck. Nothing in it is "ready for engineering software". So the demo's first wow is the
whole folder dropped in at once: every file gets a verdict, the readable ones feed the pipeline, and the errors
planted across them are found and traced. This file is the contract for `landsight/synth/package.py` (the
generator), `landsight/ingest/` (the triage) and `landsight/checks/` (the cross-file checks).

The shape follows habits common to developer packages (backups, several bill revisions, scans, junk), with
everything invented, generated and in English (D-02).

## The folder

```
Greenfield Residences — Landscape Package/
  Drawings/
    CAD/
      L-0 Cover and Index.dxf            index lists nine sheets; L-9 Sections is not in the package     [E29]
      L-1 Planting Plan.dxf              Rev A, 2026-09-18
      L-1 Planting Plan (Rev B).dxf      Rev B, 2026-10-14: one tree moved 2 m (revision cloud), still 8    [E03]
      L-1 Planting Plan.bak              a copy of Rev A with the AutoCAD backup extension                 [E27]
      L-2 South Elevation.dxf            the eight trees from the side                                     [E04]
      L-3 Paving Plan.dxf
      L-4 Plant Schedule.dxf             the schedule as its own sheet
      L-5 Enlarged Plan - West.dxf       1:100, four of the trees again, match line; title says 1:200    [E05][E16]
      L-6 Tree Pit Detail.dxf            pit 1.5 × 1.5 m (2.25 m²), soil 1.0 m, on the slab              [E12]
      L-7 Irrigation Plan.dxf            canopies as background                                            [E06]
      L-8 Lighting Plan.dxf              canopies as background                                            [E06]
      pasted image #1.png, #2.png        material photos pasted into the CAD: aggregate, pavers           [E28]
    PDF/
      Landscape Drawings (Full Set).pdf  vector, nine pages (L-0 … L-8)
      L-1 Planting Plan (scan).pdf       raster only, rotated 1.5°, grey                                   [E25]
      Presentation Plan (Colour).pdf     the filled rendering for SAM
  Bills/
      Landscape BOQ rev1.xlsx            first revision
      Landscape BOQ rev1a.xlsx           same day, one row changed
      Landscape BOQ rev2.xlsx            the errors below live here                                        [E02][E13][E17]–[E24]
      Landscape BOQ rev3 (paving update).xlsx   latest by date; paving 212 → 236 m²                       [E22]
  Documents/
      Design review notes.pdf            text: three issues the reviewer raised
      Tree pit guide - shallow roots.pdf, - medium roots.pdf, - deep roots.pdf   guides TPG-S, TPG-M, TPG-D, text
      Planting procurement spec.pdf
      Green Building Label - required documents.pdf   checklist naming the greening report                  [E30]
  Quotes/
      irrigation quote (old format).xls  Excel 97-2003                                                     [E26]
      street-furniture-quote.pdf
      metal-details.zip                  holds drain-cover-detail.dxf, not a landscape quantity           [E27]
  Other/
      Planter mood board.pptx            a slide deck, not a drawing
```

Exactly thirty files (two of them pasted images); no DWG, SHX, RAR or SKP, because none can be generated honestly.
The verdicts "AutoCAD backup — ignored", "Excel 97 — save as .xlsx", "image — read, not measured", "raster PDF —
no vectors", "zip — unpacked" cover the same ground.

## The site

As docs/PLAN.md "The synthetic site" but in English and on a podium: "Greenfield Residences —
landscape over basement slab". Eight Camphor (CC) in a frontage row; a Duranta hedge @0.3 m o.c., two rows, 27.0
m; an Azalea bed 150 m²; lawn 200 m²; pavers 212 / 48 / 36 m²; one existing camphor DBH 95 cm marked "TO BE
REMOVED" [E15]; one proposed tree drawn in the road reserve outside the boundary [E08]; one proposed tree inside
the hatched fire-truck access lane [E09]; on L-3 the paver hatch overlaps the lawn by 20 m² [E10] and one area is
labelled "permeable pavers" but hatched with the exposed-aggregate pattern [E11]. Title block: SITE AREA 1,500 m²,
BUILDING COVERAGE 40%, ARTIFICIAL GROUND. The answer key counts eight trees toward greening: the road-reserve tree
and the fire-lane tree are drawn but excluded, the existing tree is a protection question, not a quantity.

## The thirty errors

| # | Where | What is wrong | What Landsight says | Source |
|---|---|---|---|---|
| E01 | L-1 | T-08 drawn as loose segments, 40 cm gaps | open outline; Muse Spark: one tree; asks | geometry + Spark |
| E02 | L-1 / L-4 | schedule says Camphor 12, drawn 8 | schedule ≠ drawing; drawing governs; raise with the developer | geometry + Spark |
| E03 | L-1 Rev A vs Rev B | two revisions, B dated later, one tree moved | two revisions of one sheet; B is newer; counts agree, position differs | Spark (title block) + geometry |
| E04 | L-2 | elevation shows the eight trees | elevation — not counted | Spark (classify) |
| E05 | L-5 | enlarged plan repeats four trees | enlarged plan — not counted, match line found | Spark + geometry |
| E06 | L-7, L-8 | canopies as background | irrigation / lighting — not a planting sheet | Spark |
| E07 | L-1 | legend symbol | legend — not counted | geometry (box) |
| E08 | L-1 | tree outside the site boundary | outside the site — drawn, not counted toward greening | geometry |
| E09 | L-1 | tree in the fire-truck lane | inside an area where greening cannot count (§299) — flagged | geometry + rules |
| E10 | L-3 vs L-1 | paving overlaps lawn 20 m² | areas overlap between sheets — 20 m² counted twice | geometry |
| E11 | L-3 | label says permeable, hatch says aggregate | hatch pattern and label disagree — which price? | geometry + Spark |
| E12 | L-6 | pit 2.25 m² (1.5–4 m² band), soil 1.0 m, on slab | large trees count as small (Gi 1.5 → 1.0) per the greening standard's podium table | Spark (detail) + rules |
| E13 | bill | Azalea 450 plants for 150 m² | 3 per m² — below the schedule's 4 per m² | bill vs schedule |
| E14 | site | one species → α 0.8 | §302 short; two fixes | rules |
| E15 | L-1 | existing camphor DBH 95 cm "to be removed" | may be a protected tree — needs review; municipal rule | Spark + rules |
| E16 | L-5 | title block 1:200, scale bar 1:100 | scale mismatch; areas on this sheet unreliable | geometry + Spark |
| E17 | bill | hedge billed in m (27), drawn in plants (182) | unit mismatch | bill |
| E18 | bill | "Camphore tree" | aligned to Camphor at lower confidence | Spark (align) |
| E19 | bill | Camphor NT$4,200 | about 35% under the firm's installed range (6,200–7,200, sourced) | bill vs price list |
| E20 | bill | permeable pavers NT$3,800/m² | about 65% over the firm's range (1,300–2,300) | bill vs price list |
| E21 | bill | subtotal formula skips a row | the bill does not add up | bill |
| E22 | bill revisions | Rev 1 / Rev 1a / Rev 2 / Rev 3 differ | four versions; latest by date is Rev 3, the paving update (2026-10-14); paving 212 → 236 | bill |
| E23 | bill | hidden sheet with other totals | hidden sheet found | bill |
| E24 | bill | merged two-row header | parsed (robustness, not an error) | bill |
| E25 | scan PDF | raster only | no vectors — Spark read the title block; not measured | ingest |
| E26 | .xls | Excel 97 | unsupported — save as .xlsx | ingest |
| E27 | .bak, .zip | backup; archive | backup ignored (same content as Rev A); zip unpacked, one DXF inside, not a landscape quantity | ingest |
| E28 | pasted PNGs | material photos | material photo: exposed aggregate → matched to the paving type | Spark (vision) |
| E29 | L-0 | index lists L-9 | L-9 Sections is missing from the package | Spark + ingest |
| E30 | green-building PDF | checklist | the greening report is required; link to the §302 result | Spark (text) |

The answer key (`answer_key.json`) lists every error with its id, file, expected verdict and the object IDs
involved, so the eval prints: planted 30 · found N · flagged M · missed K · false alarms F.

## Triage verdicts (one chip per file in the "drop" scene)

`drawing · vector` · `drawing · raster` · `drawing · image` · `bill` · `quote` · `spec` · `presentation` ·
`backup — ignored` · `archive — unpacked` · `unsupported — .xls` · `unreadable`. Each chip carries the model that
decided (Spark for anything it had to look at) and one line why.

## Order of work

1. Generator + answer key (all files above), English site with the podium and the four odd trees.
2. Ingest: walk, classify, unpack, render PDFs/images, route DXFs to the pipeline, say why for the rest.
3. Checks: revisions, index vs sheets, enlarged/elevation/background sheets, overlaps, scale, bill reader,
   name alignment, price deviation, arithmetic, hidden sheets, units, greening with pit/soil downgrade,
   exclusions, protected tree, green-building checklist.
4. The "drop" director scene: thirty chips resolving, then the error board.

## Package v2 — the tower

Towers are buildings, not gardens: one landscape sheet per floor, the floors look alike, and a typical-floor sheet
often stands for several floors. The sample is a 20-floor tower; the errors that follow are the ones estimators
commonly make. L-102 and L-103 draw the building core as plans show it (the lift shaft as a box with an X on
A-CORE-LIFT, the lift lobby, the escape stair with its treads), and L-103 adds the escape corridor from the lobby to the
stair:

```
Drawings/CAD/
  L-101 Ground Floor Landscape Plan.dxf               1F: the site from v1 (frontage row, hedge, beds)
  L-102 5F Podium Roof Garden.dxf                     5F: planters on the podium roof, ARTIFICIAL GROUND; one over the lift shaft [T09]
  L-103 Typical Sky Garden (8F, 12F, 16F, 20F).dxf    ONE sheet, FOUR floors; planters in the escape corridor [T01, T10]
  L-104 RF Roof Garden.dxf                            RF: roof lawn and planters on 0.3 m soil          [T02]
  L-301 Landscape Sections.dxf                        sections through the podium roof, the sky gardens and the roof [T03]
  L-501 Planter Details.dxf                           planter sections, soil depths per floor          [T04]
Bills/
  Tower landscape BOQ.xlsx
```

| # | Where | What is wrong | What Landsight says | Source |
|---|---|---|---|---|
| T01 | L-103 | "8F, 12F, 16F, 20F" in the title: the sheet is typical for four floors | quantities × 4 (floors read from the title block by Muse Spark); shown per floor and in total | Spark + rule |
| T02 | L-104 | roof lawn on 0.3 m soil counts (the roof minimum for lawn is 0.1 m); planters < 0.4 m fail the shrub minimum | podium/roof soil-depth table applied per sheet | Spark (detail) + rules |
| T03 | L-301 | sections repeat every floor's planters | section — not counted | Spark |
| T04 | L-501 | the roof planter detail says 0.6 m soil; L-104 says 0.3 m | detail vs plan disagree — needs review | Spark + checks |
| T05 | L-102 vs L-101 | the podium roof reuses the ground floor's hedge symbol and label | same symbol, different floor: counted on both, never merged | geometry per sheet |
| T06 | bill | the bill lists "Sky-garden planter shrubs, typ. floor x 1" — forgot the × 4 | bill 1 floor · drawing 4 floors | bill vs drawing |
| T07 | bill | roof lawn billed at the ground lawn's price | spec mismatch (a roof lawn needs a drainage layer) — price row | bill vs list |
| T08 | L-102, L-103 | the title block's floor is the only thing that tells the sheets apart | a "looks alike" warning when two sheets share > 90% of their line work | geometry |
| T09 | L-102 | a planter and its shrubs drawn over the lift shaft (layer A-CORE-LIFT): 3 m² of the 7.5 m² planter sits in the shaft | "Planter drawn over the lift shaft (L-102)" — fail, design; the why names the overlap | geometry |
| T10 | L-103 | two planters inside the escape corridor (walls on A-EGRESS, 1.5 m apart) leave 0.9 m clear | the narrowest clear width against the 1.2 m minimum of Art. 92 (1.6 m with rooms on both sides) — fail, regulation; repeats on 8F, 12F, 16F and 20F | geometry + rule |

Film: one beat if it fits — "Four floors on one sheet" — the typical sky-garden sheet fans out into four copies and
the tally multiplies, then the bill row that forgot the × 4 turns amber.
