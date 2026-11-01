"""The sheets of the English package beyond L-1 to L-4 (docs/PACKAGE.md "The folder"), all on the same site:

- L-0 Cover and Index: the project, and a drawing index of nine sheets L-1 … L-9. L-9 Sections is listed but is
  not in the package [E29].
- L-1 Rev B: L-1 with tree 6 moved 2 m north (still 8 counted), a revision cloud around it and its neighbours, and
  the title block's revision table at B, 2026-10-14 [E03].
- L-5 Enlarged Plan - West: the four west trees again, with their tree pits, a dimension, "CC typ.", a key plan and
  "MATCH LINE — SEE L-1" between trees 4 and 5 [E05]. The content is drawn 2x in model space (half-metre units) so
  that it plots at 1:100 beside the 1:200 sheets, which is what offices do; the graphic scale says 1:100, and with
  `scale_mismatch` the title block says 1:200 [E16]. Model units on this sheet are therefore not metres.
- L-6 Tree Pit Detail (1:20, true metres, sheet furniture scaled to 1:20): pit 1.5 x 1.5 m (2.25 m2) in plan, and a
  section through the pit on the basement slab: drainage 100 mm, planting soil 1000 mm, kerbs, root ball, stakes.
  2.25 m2 sits in the greening standard's 1.5-4 m2 band, where a large tree on artificial ground counts as a small
  tree, while the schedule and the bill call the camphors large trees [E12].
- L-7 Irrigation Plan and L-8 Lighting Plan (1:200): the planting as thin grey background line work (the proposed
  canopies of L-1 Rev A, hedge, bed and lawn outlines) under irrigation or lighting symbols [E06].
- drain-cover-detail.dxf: a metal subcontractor's 1:10 detail, not a landscape quantity [E27].
"""

from __future__ import annotations

import math
import random

from landsight.synth.site import (FIRE_LANE_BOX, HEDGE_X, HEDGE_Y, LANE_TREE, LAWN_BOX, PROJECT_EN_NAME, REV_A, REV_B,
                                  ROAD_TREE, SHRUB_BOX, SITE_H, SITE_W, TREE, TREE_R, Messiness, SiteOptions, _box_pts,
                                  _canopy_vertices, _fp, _Sheet, _sheet_l1, _table, _title_block, text_width,
                                  tree_centres)

L5_UNITS_PER_M = 2.0  # L-5 content is drawn 2x in model space
L5_OFFSET_Y = 8.0  # model y of the site's south boundary on L-5
L5_TREES = 4  # the four west trees
MATCH_LINE_X = 19.0  # metres: between tree 4 (canopy to 18.93) and tree 5 (from 19.07)
PIT_M, SOIL_DEPTH_M, DRAINAGE_M = 1.5, 1.0, 0.1
PIT_LABEL = "TREE PIT 1500 × 1500 · SOIL DEPTH 1000 · ON SLAB"

INDEX = [("L-1", "Planting Plan", "1:200"), ("L-2", "South Elevation", "1:100"), ("L-3", "Paving Plan", "1:200"),
         ("L-4", "Plant Schedule", "NTS"), ("L-5", "Enlarged Plan - West", "1:100"), ("L-6", "Tree Pit Detail", "1:20"),
         ("L-7", "Irrigation Plan", "1:200"), ("L-8", "Lighting Plan", "1:200"), ("L-9", "Sections", "1:50")]
MISSING_SHEETS = ("L-9",)  # listed on L-0, not in the package


def _en(name: str, title: str, scale: str, revision=REV_A) -> _Sheet:
    return _Sheet(name, title, scale, "en", revision)


def _dims(sh: _Sheet, a, b, text: str, h: float, tick: float, offset_text: float, layer="TEXT"):
    """A dimension line from a to b with end ticks and its text above (horizontal) or left of it (vertical)."""
    sh.line(a, b, layer=layer)
    vertical = abs(a[0] - b[0]) < 1e-9
    for p in (a, b):
        if vertical:
            sh.line((p[0] - tick, p[1]), (p[0] + tick, p[1]), layer=layer)
        else:
            sh.line((p[0], p[1] - tick), (p[0], p[1] + tick), layer=layer)
    w = text_width(text, h)
    if vertical:
        sh.text(text, a[0] - offset_text, (a[1] + b[1]) / 2 - w / 2, h, rotation=90.0)
    else:
        sh.text(text, (a[0] + b[0]) / 2 - w / 2, a[1] + offset_text, h)


# --------------------------------------------------------------------------------------------- L-1 Rev B


def sheet_l1_rev_b(m: Messiness, opts: SiteOptions, seed: int = 0) -> _Sheet:
    """Rev B of L-1. It uses the same random layer assignment as Rev A, as a revision saved from Rev A would."""
    return _sheet_l1(m, random.Random(7 + seed), opts, revision=REV_B, name="L-1 Rev B")


# --------------------------------------------------------------------------------------------- L-0


def sheet_l0(opts: SiteOptions) -> _Sheet:
    sh = _en("L-0", "Cover and Index", "NTS", opts.revision)
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    _title_block(sh, 54, -7.5, "L-0")  # first, so a reader looking for the title block finds this one first
    sh.text("GREENFIELD RESIDENCES", 2.0, 27.5, 2.4)
    sh.text("LANDSCAPE PACKAGE", 2.0, 24.6, 1.4)
    sh.text("local, national — landscape over basement slab", 2.0, 22.8, 0.8)
    sh.text(f"{opts.revision.note} · REV {opts.revision.letter} · {opts.revision.date}", 2.0, 21.4, 0.7)
    sh.text("DEVELOPER: GREENFIELD DEVELOPMENT CO. (SAMPLE)", 40.0, 24.6, 0.6)
    sh.text("LANDSCAPE CONSULTANT: SAMPLE LANDSCAPE STUDIO", 40.0, 23.4, 0.6)
    rows = [["DRAWING INDEX"], ["SHEET NO.", "TITLE", "SCALE", "REV"]]
    rows += [[no, title, scale, opts.revision.letter] for no, title, scale in INDEX]
    box = _table(sh, 2.0, 19.0, [4.5, 14.0, 4.0, 2.5], rows, 1.0, h=0.5)
    sh.add("sheet_index", "DRAWING INDEX", ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), 0,
           note=f"lists {len(INDEX)} sheets: {', '.join(no for no, _, _ in INDEX)}")
    for i, (no, title, _) in enumerate(INDEX):
        y = 19.0 - 1.0 * (i + 2.5)
        sh.add("index_entry", f"{no} {title}", (4.0, y), 0,
               note="listed, not in the package" if no in MISSING_SHEETS else "listed, in the package")
    sh.text("GENERAL", 30.0, 18.0, 0.6)
    for i, line in enumerate(["1. ALL DIMENSIONS IN METRES UNLESS NOTED.",
                              "2. PLANT QUANTITIES ON PLAN TAKE PRECEDENCE OVER THE SCHEDULE.",
                              "3. READ WITH THE TREE PIT STANDARD AND THE PROCUREMENT STANDARD."]):
        sh.text(line, 30.0, 16.8 - 0.9 * i, 0.45)
    return sh


# --------------------------------------------------------------------------------------------- L-5


def _p5(x: float, y: float) -> tuple[float, float]:
    return (L5_UNITS_PER_M * x, L5_UNITS_PER_M * y + L5_OFFSET_Y)


def sheet_l5(opts: SiteOptions) -> _Sheet:
    sh = _en("L-5", "Enlarged Plan - West", "1:200" if opts.scale_mismatch else "1:100", opts.revision)
    k = L5_UNITS_PER_M
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    sh.poly([_p5(MATCH_LINE_X, 0.0), _p5(0.0, 0.0), _p5(0.0, 5.5)], layer="SITE", linetype="PHANTOM")
    sh.text("PLANNED ROAD 8 M", 12.0, 3.0, 0.8)
    for i, (cx, cy) in enumerate(tree_centres()[:L5_TREES]):
        px, py = _p5(cx, cy)
        sh.poly(_canopy_vertices(px, py, k * TREE_R), layer="TREES", close=True)
        sh.line((px - 0.8, py), (px + 0.8, py), layer="TREES")
        sh.line((px, py - 0.8), (px, py + 0.8), layer="TREES")
        half = k * PIT_M / 2
        sh.rect(px - half, py - half, px + half, py + half, layer="PLANT")
        sh.add("enlarged_tree", TREE.label("en"), (px, py), 0, "EA",
               note=f"enlarged plan: same tree as L-1/tree-{i + 1:02d}, not counted; model units are half-metres",
               footprint=_fp(_canopy_vertices(px, py, k * TREE_R)))
    x2, y2 = _p5(*tree_centres()[1])
    sh.leader(f"{TREE.code} typ. H3.5 W1.5 CAL. 10 cm", x2 + 2.0, y2 + 7.0, (x2 + 1.5, y2 + 3.7))
    x1, y1 = _p5(*tree_centres()[0])
    sh.leader("TREE PIT 1.5 × 1.5 M, SEE L-6", 1.0, 5.6, (x1 - k * PIT_M / 2, y1 - k * PIT_M / 2))
    _dims(sh, (x1, y1 + 5.6), (x2, y2 + 5.6), "4.0 M O.C. (TYP.)", 0.6, 0.3, 0.3)

    mx = k * MATCH_LINE_X
    sh.line((mx, 1.0), (mx, 26.0), layer=sh.layer("MATCHLINE"), linetype="CENTER")
    sh.text("MATCH LINE — SEE L-1", mx - 0.3, 18.0, 0.7, rotation=90.0)
    sh.add("match_line", "MATCH LINE — SEE L-1", (mx, 13.5), 0, note=f"x = {MATCH_LINE_X} m on the site, between trees 4 and 5")

    sh.text("ENLARGED PLAN — WEST", 1.0, 29.5, 1.0)
    sh.text("SCALE 1:100", 1.0, 28.0, 0.6)
    for i in range(5):  # graphic scale: 1 m = 2 model units
        pts = [(k * i, -5.0), (k * (i + 1), -5.0), (k * (i + 1), -4.6), (k * i, -4.6)]
        sh.poly(pts, layer="FRAME", close=True)
        if i % 2 == 0:
            sh.hatch(pts, "SOLID", layer="FRAME")
    for v in range(6):
        sh.text(f"{v}{' m' if v == 5 else ''}", k * v - 0.15, -5.9, 0.5, layer="FRAME")
    sh.text("1:100", 11.0, -5.0, 0.5, layer="FRAME")
    sh.add("scale_bar", "SCALE 1:100", (5.0, -4.8), 0, note="graphic scale: 5 m spans 10 model units (1:100)")
    sh.poly([(44.0, -6.0), (45.0, -3.0), (46.0, -6.0), (45.0, -5.1)], layer="FRAME", close=True)
    sh.text("N", 44.7, -2.6, 0.8, layer="FRAME")

    kx, ky, ks = 56.0, 15.5, 0.3  # key plan: the whole site at 0.3 units per metre
    sh.text("KEY PLAN", kx, ky + SITE_H * ks + 0.8, 0.6)
    sh.rect(kx, ky, kx + SITE_W * ks, ky + SITE_H * ks, layer="FRAME")
    sh.rect(kx, ky, kx + MATCH_LINE_X * ks, ky + 5.5 * ks, layer="FRAME")
    sh.text("L-5", kx + 0.3, ky + 0.3, 0.5)
    _title_block(sh, 54, -7.5, "L-5")
    return sh


# --------------------------------------------------------------------------------------------- L-6


def sheet_l6(opts: SiteOptions) -> _Sheet:
    """Tree pit detail at 1:20: plan and section in true metres; furniture at 1/10 of the 1:200 sheets."""
    sh = _en("L-6", "Tree Pit Detail", "1:20", opts.revision)
    k, h = 0.1, 0.06
    sh.rect(-0.3, -0.9, 7.7, 3.3, layer="FRAME")

    # plan
    p0x, p0y = 0.3, 1.2
    sh.rect(p0x, p0y, p0x + PIT_M, p0y + PIT_M, layer="PLANT")
    c = (p0x + PIT_M / 2, p0y + PIT_M / 2)
    sh.msp.add_circle(c, 0.3, dxfattribs={"layer": "PLANT"})
    sh.msp.add_circle(c, 0.06, dxfattribs={"layer": "PLANT"})
    mm = f"{PIT_M * 1000:.0f}"
    _dims(sh, (p0x, p0y + PIT_M + 0.12), (p0x + PIT_M, p0y + PIT_M + 0.12), mm, h, 0.03, 0.03)
    _dims(sh, (p0x - 0.12, p0y), (p0x - 0.12, p0y + PIT_M), mm, h, 0.03, 0.04)
    sh.leader("ROOT BALL Ø 0.6 M", p0x + PIT_M + 0.12, c[1] + 0.45, (c[0] + 0.21, c[1] + 0.21), h=h)
    area = round(PIT_M * PIT_M, 2)
    sh.text(PIT_LABEL, p0x, 0.95, h)
    sh.text(f"PIT AREA {area:g} m²", p0x, 0.84, h)
    sh.text("PLAN 1:20", p0x, 0.62, 0.08)
    sh.add("tree_pit", "TREE PIT", c, 0, "EA", area_m2=area,
           note=f"{PIT_LABEL}: pit {PIT_M} x {PIT_M} m = {area:g} m2; planting soil {SOIL_DEPTH_M} m on the basement "
                f"slab; drainage {DRAINAGE_M} m",
           footprint=_fp(_box_pts((p0x, p0y, p0x + PIT_M, p0y + PIT_M))))

    # section A-A
    x0, x1 = 2.9, 2.9 + PIT_M  # inside faces of the kerbs
    top = DRAINAGE_M + SOIL_DEPTH_M  # soil surface
    fl = top + 0.1  # kerb top and finished level
    slab = [(2.3, -0.3), (5.2, -0.3), (5.2, 0.0), (2.3, 0.0)]
    sh.poly(slab, layer="PLANT", close=True)
    sh.hatch(slab, "AR-CONC", layer="HATCH", scale=0.005)
    for kx in (x0 - 0.15, x1):
        kerb = _box_pts((kx, 0.0, kx + 0.15, fl))
        sh.poly(kerb, layer="PLANT", close=True)
        sh.hatch(kerb, "AR-CONC", layer="HATCH", scale=0.005)
    drain = _box_pts((x0, 0.0, x1, DRAINAGE_M))
    sh.poly(drain, layer="PLANT", close=True)
    sh.hatch(drain, "AR-SAND", layer="HATCH", scale=0.005)
    soil = _box_pts((x0, DRAINAGE_M, x1, top))
    sh.poly(soil, layer="PLANT", close=True)
    sh.hatch(soil, "EARTH", layer="HATCH", scale=0.005)
    for a, b in (((2.3, fl), (x0 - 0.15, fl)), ((x1 + 0.15, fl), (5.2, fl))):
        sh.line(a, b, layer="PLANT")
    tx = (x0 + x1) / 2
    sh.msp.add_ellipse((tx, top - 0.35), major_axis=(0.3, 0), ratio=0.9, dxfattribs={"layer": "PLANT"})
    for dx in (-0.06, 0.06):
        sh.line((tx + dx, top), (tx + dx, 2.65), layer="PLANT")
    sh.poly([(tx - 0.12, 2.65), (tx - 0.03, 2.72), (tx + 0.03, 2.62), (tx + 0.12, 2.7)], layer="PLANT")  # break line
    for sx in (-1, 1):
        sh.line((tx + sx * 0.55, top - 0.6), (tx + sx * 0.1, 2.1), layer="PLANT")
    _dims(sh, (x1 + 0.4, DRAINAGE_M), (x1 + 0.4, top), f"{SOIL_DEPTH_M * 1000:.0f}", h, 0.03, 0.04)
    _dims(sh, (x0, -0.5), (x1, -0.5), mm, h, 0.03, 0.03)
    notes = [("TIMBER STAKES ×3", (tx + 0.3, 1.6)), (f"MULCH 50 mm, FINISHED LEVEL +{fl:.2f}", (x1 + 0.5, fl)),
             ("CONCRETE KERB 150 mm", (x1 + 0.08, 0.9)),
             (f"PLANTING SOIL {SOIL_DEPTH_M * 1000:.0f} mm (SOIL DEPTH {SOIL_DEPTH_M:.1f} M ON SLAB)", (x1 - 0.1, 0.55)),
             ("FILTER FABRIC", (x1 - 0.3, DRAINAGE_M)), ("DRAINAGE LAYER 100 mm", (x1 - 0.1, 0.05)),
             ("BASEMENT SLAB (ARTIFICIAL GROUND), WATERPROOFED", (5.0, -0.15))]
    for i, (text, target) in enumerate(notes):
        sh.leader(text, 5.35, 2.4 - 0.22 * i, target, h=h)
    sh.text("SECTION A-A 1:20", 2.3, -0.75, 0.08)
    sh.text(PIT_LABEL, 2.3, 2.95, 0.07)
    sh.add("section", "SECTION A-A", (tx, 0.5), 0, note=f"soil depth {SOIL_DEPTH_M} m, drainage {DRAINAGE_M} m, on slab")

    sh.text("NOTES", 0.2, 0.35, 0.07)
    for i, line in enumerate([f"1. PIT {mm} × {mm} = {area:g} m².",
                              f"2. PLANTING SOIL {SOIL_DEPTH_M:.1f} M ON THE BASEMENT SLAB.",
                              f"3. FOR ALL {TREE.code} {TREE.label('en')} ON THE PODIUM (L-1)."]):
        sh.text(line, 0.2, 0.2 - 0.13 * i, h)
    _title_block(sh, 5.4, -0.75, "L-6", k=k)
    return sh


# --------------------------------------------------------------------------------------------- L-7, L-8


def _background(sh: _Sheet, opts: SiteOptions) -> None:
    """The planting of L-1 Rev A as a grey, thin background reference."""
    layer = sh.layer("X-PLANTING")
    attribs = {"layer": layer, "color": 8, "lineweight": 9}
    centres = list(tree_centres())
    if opts.tree_outside_boundary:
        centres.append(ROAD_TREE)
    if opts.tree_in_fire_lane:
        centres.append(LANE_TREE)
    for i, (cx, cy) in enumerate(centres):
        sh.msp.add_lwpolyline(_canopy_vertices(cx, cy, TREE_R), close=True, dxfattribs=attribs)
        sh.add("background_tree", TREE.label("en"), (cx, cy), 0, "EA",
               note=f"background: same tree as L-1/tree-{i + 1:02d}, not counted",
               footprint=_fp(_canopy_vertices(cx, cy, TREE_R)))
    for x in HEDGE_X:
        sh.msp.add_line((x, HEDGE_Y[0]), (x, HEDGE_Y[1]), dxfattribs=attribs)
    for box in (SHRUB_BOX, LAWN_BOX) + ((FIRE_LANE_BOX,) if opts.tree_in_fire_lane else ()):
        sh.msp.add_lwpolyline(_box_pts(box), close=True, dxfattribs=attribs)


def _symbol_legend(sh: _Sheet, title: str, entries) -> None:
    """entries: (draw(x, y) callable, label)."""
    x0, y0, x1, y1 = 54, 31.5 - 2.4 - 1.8 * len(entries), 73, 31.5
    sh.rect(x0, y0, x1, y1, layer="FRAME")
    sh.text(title, x0 + 1.0, y1 - 1.4, 0.8)
    sh.add("legend", title, ((x0 + x1) / 2, (y0 + y1) / 2), 0, note="legend box")
    for i, (draw, label) in enumerate(entries):
        y = y1 - 3.0 - 1.8 * i
        draw(x0 + 3.0, y)
        sh.text(label, x0 + 6.0, y - 0.3, 0.55)


def _frame_plan(sh: _Sheet, opts: SiteOptions) -> None:
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    sh.poly(_box_pts((0, 0, SITE_W, SITE_H)), layer="SITE", close=True, linetype="PHANTOM")
    _background(sh, opts)


def sheet_l7(opts: SiteOptions) -> _Sheet:
    sh = _en("L-7", "Irrigation Plan", "1:200", opts.revision)
    _frame_plan(sh, opts)
    irr = sh.layer("IRRIGATION")

    def head(x, y):
        sh.msp.add_circle((x, y), 0.25, dxfattribs={"layer": irr})

    def valve(x, y):
        sh.rect(x - 0.3, y - 0.3, x + 0.3, y + 0.3, layer=irr)

    def bubbler(x, y):
        sh.msp.add_circle((x, y), 0.15, dxfattribs={"layer": irr})

    def main(x, y):
        sh.line((x - 1.0, y), (x + 1.0, y), layer=irr, linetype="DASHED")

    def drip(x, y):
        sh.line((x - 1.0, y), (x + 1.0, y), layer=irr, linetype="DOT")

    sh.rect(46.0, 27.6, 47.4, 29.0, layer=irr)
    sh.text("IC", 46.25, 28.0, 0.6)
    sh.poly([(46.7, 27.6), (46.7, 23.2), (5.0, 23.2), (5.0, 6.2), (46.7, 6.2), (46.7, 23.2)], layer=irr, linetype="DASHED")
    for n, (x, y) in enumerate([(23.0, 23.2), (5.0, 17.0), (30.0, 6.2)], 1):
        valve(x, y)
        sh.text(f"V-{n}", x + 0.5, y + 0.4, 0.5)
    lawn_heads = [(x, y) for y in (12.0, 17.0, 22.0) for x in (24.0, 29.0, 34.0, 39.0, 44.0)]
    for x, y in lawn_heads:
        head(x, y)
    sh.leader("SPRAY HEAD (TYP.)", 30.0, 25.0, (29.2, 22.2))
    for cx, cy in tree_centres():
        bubbler(cx + 0.8, cy)
    sh.leader("TREE BUBBLER ×1 PER TREE", 14.0, 7.4, (13.8, 2.5))
    for y in (14.0, 17.0, 20.0):
        sh.line((6.5, y), (20.5, y), layer=irr, linetype="DOT")
    sh.text("DRIP LINE @0.4 M (AZALEA BED)", 7.0, 10.8, 0.5)
    sh.line((48.55, 1.5), (48.55, 28.5), layer=irr, linetype="DOT")
    sh.leader("DRIP LINE (HEDGE)", 36.0, 27.0, (48.55, 26.0))
    _symbol_legend(sh, "IRRIGATION LEGEND", [(head, "SPRAY HEAD, POP-UP"), (valve, "SOLENOID VALVE"),
                                             (bubbler, "TREE BUBBLER"), (main, "PE MAINLINE 32 mm"),
                                             (drip, "DRIP LINE 16 mm")])
    sh.add("irrigation", "IRRIGATION", (25.0, 15.0), 0,
           note=f"{len(lawn_heads)} spray heads, 3 valves, {len(tree_centres())} bubblers, controller IC")
    _title_block(sh, 54, -7.5, "L-7")
    return sh


def sheet_l8(opts: SiteOptions) -> _Sheet:
    sh = _en("L-8", "Lighting Plan", "1:200", opts.revision)
    _frame_plan(sh, opts)
    lt = sh.layer("LIGHTING")

    def bollard(x, y):
        sh.msp.add_circle((x, y), 0.25, dxfattribs={"layer": lt})

    def uplight(x, y):
        sh.poly([(x - 0.3, y - 0.2), (x + 0.3, y - 0.2), (x, y + 0.32)], layer=lt, close=True)

    def pole(x, y):
        sh.msp.add_circle((x, y), 0.45, dxfattribs={"layer": lt})
        sh.msp.add_circle((x, y), 0.15, dxfattribs={"layer": lt})

    def circuit(x, y):
        sh.line((x - 1.0, y), (x + 1.0, y), layer=lt, linetype="DASHED")

    bollards = [(8.0, 9.0), (14.0, 9.0), (20.0, 9.0), (26.0, 9.0), (24.0, 24.5), (34.0, 24.5), (44.0, 24.5)]
    for x, y in bollards:
        bollard(x, y)
    sh.leader("B1 BOLLARD 0.9 M (TYP.)", 9.0, 10.6, (8.2, 9.2))
    for cx, cy in tree_centres():
        uplight(cx, cy - 1.0)
    sh.leader("U1 TREE UPLIGHT (TYP.)", 22.0, 6.2, (21.0, 1.6))
    for x, y in ((47.0, 10.0), (47.0, 20.0)):
        pole(x, y)
        sh.text("P1", x - 1.6, y - 0.3, 0.5)
    sh.rect(45.8, 27.6, 47.4, 29.0, layer=lt)
    sh.text("LP-1", 45.95, 28.0, 0.5)
    sh.poly([(46.6, 27.6), (46.6, 24.5), (24.0, 24.5)], layer=lt, linetype="DASHED")
    sh.poly([(46.6, 24.5), (47.0, 20.0), (47.0, 10.0), (26.0, 9.0), (8.0, 9.0)], layer=lt, linetype="DASHED")
    _symbol_legend(sh, "LIGHTING LEGEND", [(bollard, "B1 BOLLARD"), (uplight, "U1 TREE UPLIGHT"),
                                           (pole, "P1 POLE LIGHT 4 M"), (circuit, "CIRCUIT")])
    sh.add("lighting", "LIGHTING", (25.0, 15.0), 0,
           note=f"{len(bollards)} bollards, {len(tree_centres())} uplights, 2 pole lights, panel LP-1")
    _title_block(sh, 54, -7.5, "L-8")
    return sh


# --------------------------------------------------------------------------------------------- the metal detail


def drain_cover_detail() -> _Sheet:
    """A metal subcontractor's detail (true metres, 1:10): grating plan and channel section. Not a landscape sheet."""
    sh = _Sheet("D-01", "Drain Cover Detail", "1:10", "en", None)
    h = 0.03
    sh.rect(-0.1, -0.45, 1.9, 0.9, layer="FRAME")
    sh.rect(0.05, 0.1, 0.65, 0.7, layer="0")
    sh.rect(0.1, 0.15, 0.6, 0.65, layer="0")
    for i in range(1, 12):
        x = 0.1 + i * 0.5 / 12
        sh.line((x, 0.15), (x, 0.65), layer="0")
    sh.text("GRATING 600 × 600, DUCTILE IRON, CLASS C250", 0.05, 0.75, h)
    sh.text("PLAN 1:10", 0.05, 0.02, 0.04)
    sh.poly([(1.0, 0.65), (1.0, 0.15), (1.5, 0.15), (1.5, 0.65)], layer="0")
    sh.poly([(1.05, 0.65), (1.05, 0.2), (1.45, 0.2), (1.45, 0.65)], layer="0")
    sh.rect(0.98, 0.62, 1.52, 0.67, layer="0")
    sh.text("CHANNEL 500 W, PRECAST", 1.0, 0.75, h)
    sh.text("SECTION 1:10", 1.0, 0.02, 0.04)
    rows = [["NORTHGATE METALWORK (SAMPLE)"], ["PROJECT", PROJECT_EN_NAME], ["TITLE", "Drain Cover Detail"],
            ["DWG NO.", "D-01"], ["SCALE", "1:10"], ["DATE", "2026-09-05"]]
    _table(sh, 0.0, -0.05, [0.25, 1.6], rows, 0.065, h=h, pad=0.02, span_pad=0.03)
    sh.add("detail", "DRAIN COVER 600 × 600", (0.35, 0.4), 0, note="metalwork detail, not a landscape quantity")
    return sh

