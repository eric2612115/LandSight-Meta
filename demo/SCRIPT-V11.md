# Landsight — film v11 (target ≈2:35)

Built on animatic v10 (demo/film/src/scenes/WorldV10.tsx, AnimaticV10.tsx, animatic-v10-cues.js — read them; keep what
works). Eric's notes on v10, all taken:

1. **Opening.** 0:00–0:14 is Eric (face, his screen, face). His screen B-roll ends with one sheet shown full-screen on
   his monitor (L-101, the tower's ground floor, as a still image he opens from `demo/props/`); the camera **pushes into
   his monitor** until that sheet fills the frame; then **pulls back** to reveal the 3D space; only then do the other
   sheets fly in and stack into the tower. Until his footage arrives, the slots are grey frames; the monitor slot shows
   the sheet on a grey monitor so the push can be judged.
2. **No "broken image" moment** between the push and the stack: the push lands on the sheet, holds 0.3 s, pulls back.
3. **Typical floor (T01/T06):** the L-103 sheet glows amber; the three other floors it stands for light **green** one by
   one with labels "12F", "16F", "20F" and the card "Landsight finds the other three floors"; then the fix card.
4. **Roof soil (T02):** a large, obvious cut-away of the roof planter: soil layer with a ruler, 0.3 m against a dashed
   0.4 m line, roots; the soil rises to 0.4 m, green check.
5. **Lift shaft (T09):** the planter is a planter box filled with round shrubs (clusters of spheres), not a green cube;
   the shaft is a dark void with its lift car visible below.
6. **Escape corridor (T10):** a continuous camera move from the L-103 drawer down to top-down (no cut); the planters are
   plant clusters; the person walks, is stopped at 0.9 m, the planters move to the walls, 1.5 m, the person passes.
7. **The tower stands on the drawing:** L-1 will carry the tower's footprint (a product change in the sample, landing
   separately: the footprint drawn north of the landscape scope on the same sheet). The tower rises from that outline;
   the 3D trees stand on L-1's circles in front of it; there is one drawing, not a building beside a drawing.
8. **SAM 3.1 beat:** calm. The coloured plan on the left two-thirds; the masks fill in colour by colour from the **real
   SAM masks** in the recordings (tests/fixtures/review/sam/*.json, decoded with meta_sam_parser — the outline of each
   real mask, not hand-drawn boxes); the **right third is a clean list**, one row per colour as it fills: swatch ·
   what it is (from Muse Spark's legend reading) · SAM 3.1 area · drawings area · difference. "Colour words read from the
   legend by Muse Spark" appears once, small, above the list. No chips flying around, nothing popping in mid-frame.
9. **Hedge (E17):** the note "DU H0.6 @0.3m o.c. DOUBLE ROW" decoded in words on screen ("Duranta hedge · one plant every
   0.3 m · two rows"), two rows of plant dots grow along the 27 m line with a counter to 182; beside it the bill row
   "Duranta hedge · 27 m"; card "The bill prices metres; the drawing means 182 plants".
10. **Tree pit / greenery (E12/E14):** on the drawing itself — the camera tilts down at one drawn tree on L-1, the paper
    turns translucent and the pit is seen under that tree (1.5 × 1.5 m on the concrete slab, the L-6 detail's figures);
    the tree shrinks to "counts as small"; the greenery meter sits in the right third (not floating in an unknown
    place); seven trees appear on the plan; the meter passes. **No flicker:** no CSS blur for motion, no coplanar planes
    (offset the paper and the ground, or use polygonOffset).
11. **Into the product:** no folder fly-through. Part 1 ends on black with the big type **Two weeks → ten minutes.**
    (1.5 s), a clean hard cut on a sound hit to the product's first frame. Simple and deliberate.
12. **The end** (demo-video style): over the 3D project at dusk, four bullets appear one by one — "Reads every sheet, bill
    and PDF — Muse Spark 1.3" · "Measures colour plans — SAM 3.1" · "Checks quantities, prices and the building code" ·
    "30 planted errors: 28 found · 2 flagged · 0 missed" — then the line **"Every number, traced to the drawing."**, then
    the new Landsight logo with the name and `github.com/eric2612115/landsight` · "Built with Muse Spark 1.3 and SAM 3.1".
13. **Logo:** redesign (three options to pick from, SVG + PNG, light and dark): (a) a plan-view tree symbol (circle +
    centre cross) inside four viewfinder corner brackets — "sight on a land drawing"; (b) a canopy of twelve short arcs
    resolving into one closed circle, one arc in cobalt; (c) your own best idea. Ink + one cobalt; works at 16 px.

## Voice (≈155 wpm; shorter than v10 so nothing runs past its picture)

0:00 (Eric) Every building gets approved on drawings like these. · 0:03 (Eric) A landscape package is thirty files —
and checking it by hand takes about two weeks. · 0:10 (Eric) I'm Eric. I built Landsight to do it in ten minutes. ·
0:15 A building arrives as a stack of flat drawings — and the errors hide between the floors. · One sheet stands for
four floors. The bill priced one. Landsight finds the other three. · On the roof: thirty centimetres of soil; the rule
asks for forty. · Two sheets: the same drawing, different titles. · A planter on top of the lift shaft — sent back. ·
Planters squeeze the escape corridor to ninety centimetres. The code asks for one-twenty. · On the ground, a row of
trees. · You see a tree. A computer sees twelve loose lines. · Muse Spark reads one tree — and asks you before it
counts. · Only a coloured picture? SAM 3.1 measures every patch: lawn, a hundred and ninety-five square metres; the
drawings say two hundred. · The bill: twelve trees; eight are drawn. · A hedge note means a hundred and eighty-two
plants; the bill prices metres. · Pavers, ten thousand over your own price list. · On the slab, the pits are too
small — big trees count as small, and the greenery falls short. Seven more trees fix it. · A developer told us:
nonsense goes straight back; the rest, flag one by one. · [big type: Two weeks → ten minutes.]

Part 2 (timed to the capture): Drop the folder as it came. Every file gets a verdict; the bill that governs is named. ·
It reads the project off the title block — with your price list and your local rules. Analyze. · Muse Spark reads
every sheet, SAM 3.1 measures the colour plans, geometry counts — the reading takes about two minutes. · On the right, the developer's way: send back, fix
before pricing, the code. Every item opens on the drawing — and nothing counts until you confirm. · Short on
greenery? It shows the fixes that pass. · Pick what goes back — it writes the change request, clouded and priced on the
drawing. · Point at anything and say what you think. It answers from the package — even when you're wrong.
End: Thirty planted errors: twenty-eight found, two flagged, none missed. · Every number, traced to the drawing.

No sound until Eric approves the cut (ElevenLabs is ready then).


**Ten minutes, not two (Eric, 2026-11-03):** two minutes is the machine's reading (106–113 s live); a person's whole pass — reading the findings, confirming the ones that need judgement, selecting, exporting, replying — is about ten. The opening line and the big type say ten; the Analyze line says the reading takes about two.

**Scales and legends (Eric, 2026-11-03):** designers often draw them carelessly; the product already flags both (E16 the
scale bar against the title block, E11 the label against the hatch/legend). No new beat: they appear as two of the
cards in the "Send back" group of the findings layout, Part 2's review list shows them, and the end bullet reads
"Checks quantities, prices, scales, legends and the local building code".
