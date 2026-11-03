"""The synthetic site (v2): one site, three sheets, one answer key.

Sheets (DXF R2010, units metres, origin at the site's south-west corner, x east, y north):

- L-1 植栽配置平面圖 (1:200): a 50 x 30 m site (1,500 m2). Eight 樟樹 in a frontage row along the south
  road edge at 4 m spacing, each a canopy of radius 2.0 m drawn as 12 straight pieces plus a "+" centre; a double
  hedge of 金露花 (two parallel lines 0.4 m apart, 27.0 m long) along the east boundary; a hatched shrub bed of 杜鵑
  (150 m2); a hatched lawn of 草皮 (200 m2); a legend box (圖例) with one tree symbol, one shrub swatch and one hedge
  line; a plant schedule (植栽表) as a TEXT table; a title block; a scale bar; a north arrow.
- L-2 南向立面圖 (1:100): the same eight trees from the side (trunk + canopy ellipse), each labelled 樟樹 H3.5.
- L-3 鋪面計畫圖 (1:200): hatched closed areas of 透水磚 212 m2, 洗石子 48 m2 and 植草磚 36 m2 with leader callouts,
  and a planter edge (花台, 8 x 3 m) drawn as eight loose segments.

Conventions the answer key depends on:

- All eight trees are drawn, so the quote is 8 under every label style. A label never multiplies a symbol:
  「樟樹 typ.」 (label_style "typ") is a leader on the third tree only and says that the other identical symbols are
  the same species and spec; 「8-樟樹」 (label_style "group") is one leader into the row and states the size of the
  group, which equals the number of drawn canopies; label_style "none" leaves the trees unlabelled, so the species
  comes from the legend.
- Canopy polygons are rotated 15 degrees so that neighbours at 4 m spacing face each other flat side to flat side
  (13.6 cm apart) instead of touching at a vertex.
- The hedge count comes from geometry: 2 lines x (floor(27.0 / 0.3) + 1) = 182 plants.
- Messiness changes the drawing, never the answer key. `gap_cm` caps the per-tree end gaps
  (0, 0, 5, 5, 10, 10, 20, 40) cm from west to east, so gap_cm=40 is the full v2 site and its eighth (east-most)
  tree is the one geometry cannot close. A gap is the distance between the ends of two consecutive pieces.
- `schedule_mismatch` makes the schedule say 樟樹 12 株 while the drawing has 8 (the real-world dispute; the
  drawing governs, so the answer key stays 8).
- `schedule_on_own_sheet` moves the 植栽表 off L-1 onto a separate sheet L-4 (植栽表, with its own title block), as
  in packages where the schedule is a sheet of its own; the answer key is unchanged.

SiteOptions (D-16, docs/PACKAGE.md "The site"): `lang="en"` writes the same site in English ("Greenfield Residences —
landscape over basement slab": CAMPHOR, DURANTA, AZALEA, LAWN; a title block with SITE AREA,
BUILDING COVERAGE, ARTIFICIAL GROUND, REV and DATE; an English plant schedule with botanical names). The default
`lang="zh"` output is unchanged and exists for the original tests. The odd objects are English-only options, each
off by default, and none of them changes what is counted:

- `existing_tree_dbh_cm`: a dashed existing camphor canopy (r 3.5 m) labelled "TO BE REMOVED" (a protection
  question, not a quantity).
- `tree_outside_boundary`: a proposed camphor drawn in the road reserve south of the boundary (not counted).
- `tree_in_fire_lane`: a hatched fire-truck access lane along the west edge with a proposed camphor inside it (not
  counted: fire-truck space is hard-to-green area under §299).
- `paving_overlaps_lawn_m2`: the grass pavers on L-3 are reshaped (5 m wide, still 36 m2) so that they overlap the
  L-1 lawn by exactly this many m2. Note: in the plain site they already overlap it by 18 m2 (6 x 3 m).
- `paving_label_hatch_mismatch`: the exposed-aggregate area on L-3 (AR-SAND hatch, legend: exposed aggregate) is
  called out "PERMEABLE PAVERS". The answer key keeps the item the hatch and legend say.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path

import ezdxf
from ezdxf import units

from landsight.synth.species import HEDGE, LAWN, SHRUB, TREE, species_table

GAPS_CM = (0, 0, 5, 5, 10, 10, 20, 40)
TREE_LAYERS = ("TREES", "tree", "1", "$00100")
HATCH_LAYERS = ("HATCH", "HATCH1", "00hatch")
LABEL_STYLES = ("typ", "group", "none")
LANGS = ("zh", "en")

SITE_W, SITE_H = 50.0, 30.0
TREE_R, TREE_SPACING, TREE_Y, TREE_X0, TREE_N = 2.0, 4.0, 2.5, 5.0, 8
TREE_SPEC = "H3.5 W1.5 米徑10cm"
HEDGE_X, HEDGE_Y = (48.8, 49.2), (1.5, 28.5)
HEDGE_SPACING = 0.3
SHRUB_BOX = (6.0, 12.0, 21.0, 22.0)  # 150 m2
LAWN_BOX = (24.0, 12.0, 44.0, 22.0)  # 200 m2
PAVING = {  # label -> (box, hatch pattern); 212 / 48 / 36 m2
    "透水磚": ((2.0, 3.0, 28.5, 11.0), "BRICK"),
    "洗石子": ((31.0, 3.0, 43.0, 7.0), "AR-SAND"),
    "植草磚": ((31.0, 9.0, 37.0, 15.0), "AR-B816"),
}
PLANTER_BOX = (6.0, 16.0, 14.0, 19.0)  # perimeter 22 m
SHRUB_PATTERN, LAWN_PATTERN = "ANSI31", "GRASS"
PROJECT = "綠邑社區景觀工程"
DATE = "2026-11-01"
TEXT_H = 0.6

# English site (lang="en")
PROJECT_EN = "Greenfield Residences — landscape over basement slab"
PROJECT_EN_NAME, PROJECT_EN_WORKS = "Greenfield Residences", "Landscape over basement slab"
SITE_AREA_TEXT, COVERAGE_TEXT = "1,500 m²", "40%"  # the English title block (landsight.synth.heldout sets its own)
PAVING_EN = {"透水磚": "PERMEABLE PAVERS", "洗石子": "EXPOSED AGGREGATE", "植草磚": "GRASS PAVERS"}
PAVING_CODES = {"透水磚": "PV-1", "洗石子": "PV-2", "植草磚": "PV-3"}  # boxed finish codes keyed to the legend
GENERAL_NOTES = ["GENERAL NOTES",
                 "1. PLANT QUANTITIES ON PLAN TAKE PRECEDENCE OVER THE SCHEDULE.",
                 "2. TREE PITS ON THE BASEMENT SLAB: SEE DETAIL L-6.",
                 "3. EXISTING TREES ARE SHOWN DASHED, WITH THEIR ROOT PROTECTION ZONE."]

# the odd objects (English options)
EXISTING_TREE = (12.0, 26.8, 3.0)  # centre x, y and canopy radius of the existing camphor
RPZ_FACTOR = 1.5  # root protection zone radius = 1.5 x the canopy radius (dashed)
ROAD_TREE = (39.0, -2.6)  # in the road reserve, south of the boundary
FIRE_LANE_BOX = (0.0, 6.0, 4.0, 29.0)  # 4.0 m wide along the west edge, 92 m2
FIRE_LANE_PATTERN = "EARTH"
# the tower over the basement (landsight.synth.tower's 28 x 18 m floor plate), drawn north of the site on L-1 as a
# reference outline: outside the landscape scope, not planting, not counted
TOWER_ABOVE = (6.0, 32.5, 34.0, 50.5)
TOWER_ABOVE_LABEL = "TOWER ABOVE — see the tower package"
TOWER_ABOVE_LAYER, TOWER_ABOVE_PATTERN = "A-BLDG", "NET"
FRAME_TOP, FRAME_TOP_TOWER = 33.0, 52.5
LANE_TREE = (2.0, 17.0)

TEXT = {
    "zh": {
        "tree": TREE.name_zh, "hedge": HEDGE.name_zh, "shrub": SHRUB.name_zh, "lawn": LAWN.name_zh,
        "planter": "花台", "ea": "株", "spec": TREE_SPEC, "road": "計畫道路 8M", "typ": "樟樹 typ.", "group": "{n}-樟樹",
        "hedge_label": "金露花 H0.6 @0.3m 雙排", "hedge_label_x": 38.0, "hedge_note": "H0.6 @0.3m 雙排",
        "shrub_label": SHRUB.name_zh, "lawn_label": LAWN.name_zh, "legend_tree": TREE.name_zh,
        "legend_shrub": SHRUB.name_zh, "legend_hedge": HEDGE.name_zh,
        "legend": "圖例", "elev_label": "樟樹 H3.5", "elev_caption": "南向立面圖 S=1:100",
        "titles": {"L-1": "植栽配置平面圖", "L-2": "南向立面圖", "L-3": "鋪面計畫圖", "L-4": "植栽表"},
        "style": ("CJK", "msjh.ttc"),
    },
    "en": {  # objects in the answer key carry the common name; the drawing labels plants by code
        "tree": TREE.label("en"), "hedge": HEDGE.label("en"), "shrub": SHRUB.label("en"),
        "lawn": LAWN.label("en"), "planter": "PLANTER", "ea": "EA", "spec": "H3.5 W1.5 cal. 10 cm",
        "road": "PLANNED ROAD 8 M", "typ": f"{TREE.code} typ.", "group": f"{{n}} {TREE.code}",
        "hedge_label": f"{HEDGE.code} H0.6 @0.3m o.c. DOUBLE ROW", "hedge_label_x": 34.5,
        "shrub_label": f"{SHRUB.code} {SHRUB.label('en')}", "lawn_label": f"{LAWN.code} {LAWN.label('en')}",
        "legend_tree": f"{TREE.code} {TREE.label('en')}", "legend_shrub": f"{SHRUB.code} {SHRUB.label('en')}",
        "legend_hedge": f"{HEDGE.code} {HEDGE.label('en')}",
        "hedge_note": "H0.6 @0.3m o.c., double row", "legend": "LEGEND", "elev_label": f"{TREE.code} H3.5",
        "elev_caption": "SOUTH ELEVATION 1:100",
        "titles": {"L-1": "Planting Plan", "L-2": "South Elevation", "L-3": "Paving Plan", "L-4": "Plant Schedule"},
        "style": ("LABELS", "arial.ttf"),
    },
}


@dataclass(frozen=True)
class Messiness:
    """How untidy the drawing is. The answer key does not change with any of these."""

    gap_cm: int = 40  # cap on the per-tree end gaps GAPS_CM
    exploded: bool = True  # canopy pieces as LINE entities; False draws them as LWPOLYLINE
    layer_chaos: bool = True  # trees over TREES / tree / 1 / $00100, hatch over HATCH / HATCH1 / 00hatch
    label_style: str = "typ"  # "typ" | "group" | "none"
    schedule_mismatch: bool = False  # schedule says 樟樹 12 while the drawing has 8
    schedule_on_own_sheet: bool = False  # the 植栽表 moves from L-1 to a separate sheet L-4

    def __post_init__(self):
        if self.label_style not in LABEL_STYLES:
            raise ValueError(f"label_style must be one of {LABEL_STYLES}")

    def tree_gaps_m(self) -> list[float]:
        return [min(g, self.gap_cm) / 100 for g in GAPS_CM]

    @property
    def tag(self) -> str:
        return (f"g{self.gap_cm}-{'x' if self.exploded else 'p'}-{'chaos' if self.layer_chaos else 'clean'}-"
                f"{self.label_style}{'-mismatch' if self.schedule_mismatch else ''}"
                f"{'-L4schedule' if self.schedule_on_own_sheet else ''}")


LEVELS = {
    "m0": Messiness(gap_cm=0, exploded=False, layer_chaos=False, label_style="typ"),
    "m1": Messiness(gap_cm=5, exploded=True, layer_chaos=False, label_style="group"),
    "m2": Messiness(gap_cm=10, exploded=True, layer_chaos=True, label_style="typ"),
    "m3": Messiness(gap_cm=20, exploded=True, layer_chaos=True, label_style="none"),
    "m4": Messiness(gap_cm=40, exploded=True, layer_chaos=True, label_style="typ"),
}


@dataclass(frozen=True)
class Revision:
    """A revision of a sheet as its title block states it. `moves`: (tree index west to east, dx, dy) in metres;
    `added`: centres of proposed camphors added in this revision."""

    letter: str
    date: str
    note: str
    moves: tuple[tuple[int, float, float], ...] = ()
    added: tuple[tuple[float, float], ...] = ()


REV_A = Revision("A", "2026-09-18", "ISSUED FOR REVIEW")
REV_B = Revision("B", "2026-10-14", "TREE MOVED 2 M", moves=((5, 0.0, 2.0),))
REVISIONS = (REV_A, REV_B)  # the revision history a title block lists up to its own revision


@dataclass(frozen=True)
class SiteOptions:
    """Language and the odd objects. Unlike Messiness, the odd objects add things to the answer key (each with the
    reason it is not counted); the counted quantities stay the same."""

    lang: str = "zh"
    revision: Revision = REV_A  # the English title block's REV / DATE / REVISION rows
    existing_tree_dbh_cm: int | None = None  # dashed existing camphor "TO BE REMOVED"
    tree_outside_boundary: bool = False  # a proposed camphor in the road reserve
    tree_in_fire_lane: bool = False  # a hatched fire-truck access lane with a proposed camphor inside it
    paving_overlaps_lawn_m2: float = 0.0  # L-3 grass pavers overlap the L-1 lawn by this much
    paving_label_hatch_mismatch: bool = False  # L-3: the AR-SAND (aggregate) area is called out "PERMEABLE PAVERS"
    scale_mismatch: bool = False  # L-5 (synth.sheets): the title block says 1:200 on a 1:100 sheet

    def __post_init__(self):
        if self.lang not in LANGS:
            raise ValueError(f"lang must be one of {LANGS}")
        if self.lang == "zh" and self.odd:
            raise ValueError("the odd objects exist on the English site only (lang='en')")
        if self.paving_overlaps_lawn_m2 and not 13.5 <= self.paving_overlaps_lawn_m2 <= 36.0:
            raise ValueError("paving_overlaps_lawn_m2 must be 0 or between 13.5 and 36 m2 (grass pavers are 36 m2)")

    @property
    def odd(self) -> bool:
        return bool(self.existing_tree_dbh_cm or self.tree_outside_boundary or self.tree_in_fire_lane
                    or self.paving_overlaps_lawn_m2 or self.paving_label_hatch_mismatch or self.scale_mismatch)


PACKAGE_OPTIONS = SiteOptions(lang="en", existing_tree_dbh_cm=95, tree_outside_boundary=True, tree_in_fire_lane=True,
                              paving_overlaps_lawn_m2=20.0, paving_label_hatch_mismatch=True, scale_mismatch=True)


def text_width(s: str, h: float) -> float:
    """Approximate rendered width of a TEXT string: CJK glyphs are one height wide, others 0.6."""
    return h * sum(1.0 if ord(c) > 0x2E80 else 0.6 for c in s)


@dataclass
class _Obj:
    id: str
    sheet: str
    kind: str
    label: str
    centre: list[float]
    quote_count: float
    unit: str = ""
    area_m2: float | None = None
    length_m: float | None = None
    note: str = ""
    footprint: list[list[float]] | None = None  # the filled region in metres (trees, hedge band, areas, legend symbols)
    excluded: str | None = None  # why a drawn object is not counted (odd objects); omitted from the key when None


def obj_dict(o: _Obj) -> dict:
    d = asdict(o)
    if d["excluded"] is None:
        del d["excluded"]
    return d


@dataclass
class _Sheet:
    """One DXF document plus the answer-key objects drawn on it."""

    name: str
    title: str
    scale: str
    lang: str = "zh"
    revision: Revision | None = None  # None: no revision rows (the zh title block)
    doc: ezdxf.document.Drawing = field(init=False)
    objects: list[_Obj] = field(default_factory=list)

    def __post_init__(self):
        self.doc = ezdxf.new("R2010", setup=True)
        self.doc.units = units.M
        self.doc.header["$MEASUREMENT"] = 1
        self.style, font = TEXT[self.lang]["style"]
        self.doc.styles.add(self.style, font=font)
        for name in ("0", "2", "SITE", "FRAME", "TEXT", "LEADER", "PLANT", "PAVE", *TREE_LAYERS, *HATCH_LAYERS):
            if name not in self.doc.layers:
                self.doc.layers.add(name)
        self.msp = self.doc.modelspace()

    def layer(self, name: str) -> str:
        """A layer beyond the standard set, created on first use (so sheets without it keep their layer table)."""
        if name not in self.doc.layers:
            self.doc.layers.add(name)
        return name

    def line(self, a, b, layer="0", linetype=None):
        attribs = {"layer": layer}
        if linetype:
            attribs["linetype"] = linetype
        self.msp.add_line(a, b, dxfattribs=attribs)

    def poly(self, pts, layer="0", close=False, linetype=None):
        attribs = {"layer": layer}
        if linetype:
            attribs["linetype"] = linetype
        self.msp.add_lwpolyline(pts, close=close, dxfattribs=attribs)

    def rect(self, x0, y0, x1, y1, layer="0"):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], layer=layer, close=True)

    def text(self, s, x, y, h=TEXT_H, layer="TEXT", rotation=0.0):
        self.msp.add_text(s, height=h, rotation=rotation, dxfattribs={"layer": layer, "style": self.style}).set_placement((x, y))

    def hatch(self, pts, pattern, layer="HATCH", scale=0.05):
        h = self.msp.add_hatch(color=7, dxfattribs={"layer": layer})
        if pattern == "SOLID":
            h.set_solid_fill(color=7)
        else:
            h.set_pattern_fill(pattern, scale=scale)
        h.paths.add_polyline_path(pts, is_closed=True)

    def leader(self, s, x, y, target, h=TEXT_H):
        """Text at (x, y) with a shoulder under it and a line to `target`; the free end sits under the text's end."""
        w, d = text_width(s, h), h * 0.25  # the shoulder sits a quarter of the text height below the baseline
        self.text(s, x, y, h)
        right_side = target[0] >= x + w / 2
        start, elbow = ((x, y - d), (x + w, y - d)) if right_side else ((x + w, y - d), (x, y - d))
        self.poly([start, elbow, target], layer="LEADER")

    def add(self, kind, label, centre, quote_count, unit="", **kw):
        n = sum(1 for o in self.objects if o.kind == kind) + 1
        oid = f"{self.name}/{kind}-{n:02d}"
        self.objects.append(_Obj(oid, self.name, kind, label, [round(centre[0], 3), round(centre[1], 3)], quote_count, unit, **kw))
        return oid

    def save(self, out_dir: Path, filename: str | None = None) -> Path:
        path = out_dir / (filename or f"{self.name}.dxf")
        self.doc.saveas(path)
        return path


# --------------------------------------------------------------------------------------------- drawing helpers


def _canopy_vertices(cx, cy, r, n=12, rot_deg=15.0):
    return [(cx + r * math.cos(math.radians(rot_deg + 360 * i / n)), cy + r * math.sin(math.radians(rot_deg + 360 * i / n)))
            for i in range(n)]


def _draw_canopy(sh: _Sheet, cx, cy, r, gap, exploded, layers, rng):
    """12 pieces; each shortened so consecutive ends are `gap` apart. Centre '+' on the same layers."""
    verts = _canopy_vertices(cx, cy, r)
    n = len(verts)
    if gap == 0 and not exploded:
        sh.poly(verts, layer=layers[0], close=True)
    else:
        shorten = gap / (2 * math.cos(math.radians(180 / n)))  # the gap between two pieces meeting at 150 degrees
        for i in range(n):
            (x0, y0), (x1, y1) = verts[i], verts[(i + 1) % n]
            L = math.hypot(x1 - x0, y1 - y0)
            ux, uy = (x1 - x0) / L, (y1 - y0) / L
            a = (x0 + ux * shorten, y0 + uy * shorten)
            b = (x1 - ux * shorten, y1 - uy * shorten)
            layer = rng.choice(layers)
            if exploded:
                sh.line(a, b, layer=layer)
            else:
                sh.poly([a, b], layer=layer)
    arm = 0.4
    for a, b in (((cx - arm, cy), (cx + arm, cy)), ((cx, cy - arm), (cx, cy + arm))):
        if exploded:
            sh.line(a, b, layer=layers[0])
        else:
            sh.poly([a, b], layer=layers[0])


def _draw_closed_canopy(sh: _Sheet, cx, cy, r, layer, exploded=True, mark=True):
    """A proposed tree drawn the tidy way: one closed 12-gon (and a '+' centre)."""
    sh.poly(_canopy_vertices(cx, cy, r), layer=layer, close=True)
    if mark:
        for a, b in (((cx - 0.4, cy), (cx + 0.4, cy)), ((cx, cy - 0.4), (cx, cy + 0.4))):
            if exploded:
                sh.line(a, b, layer=layer)
            else:
                sh.poly([a, b], layer=layer)


def _edge_point(cx, cy, r, angle_deg):
    """A point on the canopy polygon (edge midpoints sit at multiples of 30 degrees)."""
    rr = r * math.cos(math.radians(15))
    return (cx + rr * math.cos(math.radians(angle_deg)), cy + rr * math.sin(math.radians(angle_deg)))


def _table(sh: _Sheet, x0, y_top, col_w, rows, row_h, layer="TEXT", h=0.42, pad=0.2, span_pad=0.3):
    """Grid of lines with TEXT cells. rows: list of lists; a row of one string spans the whole width.
    A cell value None merges into the cell on its left (no divider drawn)."""
    width = sum(col_w)
    xs = [x0]
    for w in col_w:
        xs.append(xs[-1] + w)
    y = y_top
    heights = row_h if isinstance(row_h, list) else [row_h] * len(rows)
    sh.line((x0, y_top), (x0 + width, y_top), layer=layer)
    for row, rh in zip(rows, heights):
        y_next = y - rh
        sh.line((x0, y_next), (x0 + width, y_next), layer=layer)
        sh.line((x0, y), (x0, y_next), layer=layer)
        sh.line((x0 + width, y), (x0 + width, y_next), layer=layer)
        if len(row) == 1:
            sh.text(row[0], x0 + span_pad, y_next + (rh - h) / 2, h)
        else:
            for i, cell in enumerate(row):
                if i > 0 and cell is not None:
                    sh.line((xs[i], y), (xs[i], y_next), layer=layer)
                if cell:
                    sh.text(cell, xs[i] + pad, y_next + (rh - h) / 2, h)
        y = y_next
    return (x0, y, x0 + width, y_top)


def _title_block(sh: _Sheet, x0, y0, number, k: float = 1.0):
    """The title block, 21 x 14.5 m at 1:200 (k scales it for sheets plotted at another scale)."""
    if sh.lang == "zh":
        rows = [("工程名稱", PROJECT), ("圖名", sh.title), ("圖號", number), ("比例", sh.scale),
                ("基地面積", "1,500 m²"), ("建蔽率", "40%"), ("日期", DATE)]
        box = _table(sh, x0, y0 + 14.5, [4.5, 16.5], [list(r) for r in rows], 14.5 / len(rows), layer="FRAME", h=0.6)
        sh.add("title", sh.title, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), 0, note=f"圖號 {number}")
        return
    rev = sh.revision or REV_A
    rows = [("PROJECT", PROJECT_EN_NAME), ("WORKS", PROJECT_EN_WORKS), ("TITLE", sh.title), ("DRAWING NO.", number),
            ("SCALE", sh.scale), ("SITE AREA", SITE_AREA_TEXT), ("BUILDING COVERAGE", COVERAGE_TEXT),
            ("GROUND", "ARTIFICIAL GROUND"),
            ("REV", rev.letter), ("DATE", rev.date)]
    history = [r for r in REVISIONS if r.letter <= rev.letter] if rev in REVISIONS else [rev]
    rev_rows = [["REVISIONS"]] + [[r.letter, r.date, r.note] for r in history]
    rev_rows += [["", "", ""]] * max(0, len(REVISIONS) - len(history))  # the table keeps its size
    height = 14.5 * k
    rh = height / (len(rows) + len(rev_rows))
    fmt = {"layer": "FRAME", "h": 0.45 * k, "pad": 0.2 * k, "span_pad": 0.3 * k}
    box = _table(sh, x0, y0 + height, [6.0 * k, 15.0 * k], [list(r) for r in rows], rh, **fmt)
    _table(sh, x0, box[1], [2.0 * k, 4.0 * k, 15.0 * k], rev_rows, rh, **fmt)
    sh.add("title", sh.title, (x0 + 10.5 * k, y0 + height / 2), 0,
           note=f"DRAWING NO. {number}; SCALE {sh.scale}; REV {rev.letter} {rev.date}")


def _scale_bar_and_north(sh: _Sheet, x0, y0, north_x):
    for i in range(4):
        pts = [(x0 + 2.5 * i, y0), (x0 + 2.5 * (i + 1), y0), (x0 + 2.5 * (i + 1), y0 + 0.4), (x0 + 2.5 * i, y0 + 0.4)]
        sh.poly(pts, layer="FRAME", close=True)
        if i % 2 == 0:
            sh.hatch(pts, "SOLID", layer="FRAME")
    for v, label in ((0, "0"), (5, "5"), (10, "10m")):
        sh.text(label, x0 + v - 0.15, y0 - 0.9, 0.5, layer="FRAME")
    sh.poly([(north_x, y0 - 1.0), (north_x + 1.0, y0 + 2.0), (north_x + 2.0, y0 - 1.0), (north_x + 1.0, y0 - 0.1)],
            layer="FRAME", close=True)
    sh.text("N", north_x + 0.7, y0 + 2.4, 0.8, layer="FRAME")


def _legend(sh: _Sheet, x0, y0, x1, y1, entries):
    """entries: list of (kind, label, pattern). kind: tree | swatch | hedge."""
    sh.rect(x0, y0, x1, y1, layer="FRAME")
    sh.text(TEXT[sh.lang]["legend"], x0 + 1.0, y1 - 1.4, 0.8)
    sh.add("legend", TEXT[sh.lang]["legend"], ((x0 + x1) / 2, (y0 + y1) / 2), 0, note="legend box")
    y = y1 - 2.4
    for kind, label, pattern in entries:
        if kind == "tree":
            cy = y - TREE_R
            cx = x0 + 3.5
            sh.poly(_canopy_vertices(cx, cy, TREE_R), layer="TREES", close=True)
            sh.line((cx - 0.4, cy), (cx + 0.4, cy), layer="TREES")
            sh.line((cx, cy - 0.4), (cx, cy + 0.4), layer="TREES")
            sh.text(label, x0 + 7.0, cy - 0.3)
            sh.add("legend", f"legend symbol {label}", (cx, cy), 0, note="tree symbol",
                   footprint=_fp(_canopy_vertices(cx, cy, TREE_R)))
            y = cy - TREE_R - 0.8
        elif kind == "swatch":
            pts = [(x0 + 1.5, y - 1.4), (x0 + 5.5, y - 1.4), (x0 + 5.5, y), (x0 + 1.5, y)]
            sh.poly(pts, layer="FRAME", close=True)
            sh.hatch(pts, pattern, layer=HATCH_LAYERS[0])
            sh.text(label, x0 + 7.0, y - 1.0)
            sh.add("legend", f"legend swatch {label}", (x0 + 3.5, y - 0.7), 0, note="swatch", footprint=_fp(pts))
            y -= 2.2
        elif kind == "hedge":
            for dy in (0.0, 0.4):
                sh.line((x0 + 1.5, y - 0.6 - dy), (x0 + 5.5, y - 0.6 - dy), layer="PLANT")
            sh.text(label, x0 + 7.0, y - 1.0)
            sh.add("legend", f"legend line {label}", (x0 + 3.5, y - 0.8), 0, note="hedge line",
                   footprint=_fp(_box_pts((x0 + 1.5, y - 1.0, x0 + 5.5, y - 0.6))))
            y -= 1.8


def _fp(pts) -> list[list[float]]:
    return [[round(x, 3), round(y, 3)] for x, y in pts]


def _box_pts(b):
    x0, y0, x1, y1 = b
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def _box_centre(b):
    return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


def _box_area(b):
    return (b[2] - b[0]) * (b[3] - b[1])


def _box_overlap(a, b) -> float:
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return round(max(w, 0.0) * max(h, 0.0), 6)


def _circle_pts(cx, cy, r, n=48):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


# --------------------------------------------------------------------------------------------- the three sheets


def tree_centres() -> list[tuple[float, float]]:
    return [(TREE_X0 + TREE_SPACING * i, TREE_Y) for i in range(TREE_N)]


def hedge_count() -> int:
    return 2 * (math.floor(round((HEDGE_Y[1] - HEDGE_Y[0]) / HEDGE_SPACING, 6)) + 1)


def paving_boxes(opts: SiteOptions | None = None) -> dict[str, tuple[tuple[float, float, float, float], str]]:
    """PAVING, with the grass pavers reshaped when `paving_overlaps_lawn_m2` asks for an exact lawn overlap."""
    boxes = dict(PAVING)
    if opts is not None and opts.paving_overlaps_lawn_m2:
        top = round(LAWN_BOX[1] + opts.paving_overlaps_lawn_m2 / 5.0, 6)
        boxes["植草磚"] = ((31.0, round(top - 7.2, 6), 36.0, top), PAVING["植草磚"][1])
    return boxes


def _legend_y0(n_extra: int) -> float:
    return 19.5 - 2.2 * n_extra


def _sheet_l1(m: Messiness, rng: random.Random, opts: SiteOptions | None = None, revision: Revision | None = None,
              name: str = "L-1", tower_above: bool = False) -> _Sheet:
    """tower_above: the tower's outline north of the site, on a sheet frame grown north to hold it (the title block,
    legend and site keep their places)."""
    opts = opts or SiteOptions()
    T = TEXT[opts.lang]
    rev = revision or opts.revision
    sh = _Sheet(name, T["titles"]["L-1"], "1:200", opts.lang, rev if opts.lang != "zh" else None)
    tree_layers = TREE_LAYERS if m.layer_chaos else TREE_LAYERS[:1]
    hatch_layer = (lambda: rng.choice(HATCH_LAYERS)) if m.layer_chaos else (lambda: "HATCH")

    sh.rect(-3, -9, 77, FRAME_TOP_TOWER if tower_above else FRAME_TOP, layer="FRAME")
    sh.poly(_box_pts((0, 0, SITE_W, SITE_H)), layer="SITE", close=True, linetype="PHANTOM")
    sh.text(T["road"], 20.0, -2.2, 0.8)
    if tower_above:
        _tower_above(sh)

    centres = tree_centres()
    moved = {i: (dx, dy) for i, dx, dy in rev.moves}
    centres = [(cx + moved[i][0], cy + moved[i][1]) if i in moved else (cx, cy) for i, (cx, cy) in enumerate(centres)]
    for i, ((cx, cy), gap) in enumerate(zip(centres, m.tree_gaps_m())):
        _draw_canopy(sh, cx, cy, TREE_R, gap, m.exploded, tree_layers, rng)
        note = f"end gap {gap * 100:.0f} cm; spec {T['spec']}"
        if i in moved:
            note += f"; Rev {rev.letter}: moved {math.hypot(*moved[i]):g} m"
        sh.add("tree", T["tree"], (cx, cy), 1, T["ea"], note=note, footprint=_fp(_canopy_vertices(cx, cy, TREE_R)))
    _odd_trees(sh, m, opts, tree_layers[0])
    for cx, cy in rev.added:
        _draw_closed_canopy(sh, cx, cy, TREE_R, tree_layers[0], m.exploded)
        sh.add("tree", T["tree"], (cx, cy), 1, T["ea"], note=f"end gap 0 cm; spec {T['spec']}; Rev {rev.letter}: added",
               footprint=_fp(_canopy_vertices(cx, cy, TREE_R)))
    if opts.lang == "en":
        for cx, cy in [centres[i] for i in moved] + list(rev.added):
            _revision_cloud(sh, (cx, cy), TREE_R + 0.15, rev.letter)
    xs = [c[0] for c in tree_centres()]
    if m.label_style == "typ":
        cx, cy = centres[2]
        sh.leader(T["typ"], cx + 1.0, cy + 4.6, _edge_point(cx, cy, TREE_R, 60))
    elif m.label_style == "group":
        cx, cy = centres[3]
        sh.leader(T["group"].format(n=TREE_N), cx + 1.0, cy + 4.6, _edge_point(cx, cy, TREE_R, 90))

    for x in HEDGE_X:
        sh.line((x, HEDGE_Y[0]), (x, HEDGE_Y[1]), layer="PLANT" if not m.layer_chaos else "2")
    sh.leader(T["hedge_label"], T["hedge_label_x"], 25.2, (HEDGE_X[0], 24.0))
    sh.add("hedge", T["hedge"], (sum(HEDGE_X) / 2, sum(HEDGE_Y) / 2), hedge_count(), T["ea"],
           length_m=2 * (HEDGE_Y[1] - HEDGE_Y[0]), note=f"{T['hedge_note']}: 2 x (floor(27.0/0.3)+1)",
           footprint=_fp(_box_pts((HEDGE_X[0], HEDGE_Y[0], HEDGE_X[1], HEDGE_Y[1]))))

    for box, label, drawn, pattern, kind in ((SHRUB_BOX, T["shrub"], T["shrub_label"], SHRUB_PATTERN, "shrub_bed"),
                                             (LAWN_BOX, T["lawn"], T["lawn_label"], LAWN_PATTERN, "lawn")):
        pts = _box_pts(box)
        sh.poly(pts, layer="PLANT", close=True)
        sh.hatch(pts, pattern, layer=hatch_layer())
        cx, cy = _box_centre(box)
        sh.text(drawn, cx - text_width(drawn, 0.8) / 2, cy - 0.4, 0.8)
        sh.add(kind, label, (cx, cy), _box_area(box), "m²", area_m2=_box_area(box), footprint=_fp(pts))

    _odd_areas(sh, opts)
    entries = [("tree", T["legend_tree"], None), ("swatch", T["legend_shrub"], SHRUB_PATTERN),
               ("hedge", T["legend_hedge"], None)]
    if opts.tree_in_fire_lane:
        entries.insert(2, ("swatch", "FIRE TRUCK ACCESS LANE", FIRE_LANE_PATTERN))
    legend_y0 = _legend_y0(len(entries) - 3)
    _legend(sh, 54, legend_y0, 73, 31.5, entries)

    if not m.schedule_on_own_sheet:
        _plant_schedule(sh, m, 54.0, legend_y0 - (2.0 if opts.lang == "zh" else 0.6))
    if opts.lang == "en":
        for i, line in enumerate(GENERAL_NOTES):
            sh.text(line, 14.0, -6.5 - 0.62 * i, 0.45 if i == 0 else 0.4)
        sh.add("notes", GENERAL_NOTES[0], (21.0, -7.5), 0, note=GENERAL_NOTES[1])

    _title_block(sh, 54, -7.5, "L-1")
    _scale_bar_and_north(sh, 0.0, -5.0, 44.0)
    return sh


def _tower_above(sh: _Sheet) -> None:
    """The tower's footprint as a closed outline on the building layer with a light hatch and one label."""
    layer = sh.layer(TOWER_ABOVE_LAYER)
    pts = _box_pts(TOWER_ABOVE)
    sh.poly(pts, layer=layer, close=True)
    sh.hatch(pts, TOWER_ABOVE_PATTERN, layer=layer, scale=0.5)
    cx, cy = _box_centre(TOWER_ABOVE)
    sh.text(TOWER_ABOVE_LABEL, cx - text_width(TOWER_ABOVE_LABEL, 0.8) / 2, cy - 0.4, 0.8)


def _revision_cloud(sh: _Sheet, centre, r: float, letter: str, arc: float = 0.5, bulge: float = 0.8):
    """A revision cloud around one changed tree: a closed LWPOLYLINE of deep outward arcs on a circle of radius r, and
    a triangle with the revision letter. The arcs reach about 0.2 m beyond r, so with r = canopy + 0.15 m the cloud
    clears its own canopy and the row neighbours (4 m apart) without crossing their line work; the deep scallops keep
    its circularity near 0.6, so geometry never takes it for a canopy."""
    cx, cy = centre
    n = max(12, round(2 * math.pi * r / arc))
    pts = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), bulge) for i in range(n)]
    layer = sh.layer("REVISION")
    sh.msp.add_lwpolyline(pts, format="xyb", close=True, dxfattribs={"layer": layer})  # CCW points: bulge > 0 = outward
    tx, ty = cx + r + 0.4, cy + r - 0.6
    sh.poly([(tx, ty), (tx + 1.2, ty), (tx + 0.6, ty + 1.04)], layer=layer, close=True)
    sh.text(letter, tx + 0.45, ty + 0.18, 0.45)
    sh.add("revision_cloud", f"REV {letter}", centre, 0, note=f"revision cloud: Rev {letter} change")


def _odd_trees(sh: _Sheet, m: Messiness, opts: SiteOptions, layer: str):
    """The proposed camphors that are drawn but not counted (road reserve, fire lane) and the existing camphor."""
    T = TEXT[opts.lang]
    if opts.tree_outside_boundary:
        cx, cy = ROAD_TREE
        _draw_closed_canopy(sh, cx, cy, TREE_R, layer, m.exploded)
        sh.add("tree", T["tree"], (cx, cy), 0, T["ea"], note="proposed camphor drawn in the road reserve",
               footprint=_fp(_canopy_vertices(cx, cy, TREE_R)),
               excluded="outside the site boundary (road reserve): drawn, not counted toward greening")
    if opts.tree_in_fire_lane:
        cx, cy = LANE_TREE
        _draw_closed_canopy(sh, cx, cy, TREE_R, layer, m.exploded)
        sh.add("tree", T["tree"], (cx, cy), 0, T["ea"], note="proposed camphor drawn inside the fire-truck access lane",
               footprint=_fp(_canopy_vertices(cx, cy, TREE_R)),
               excluded="inside the fire-truck access lane: fire-truck space is hard-to-green area "
                        "(Building Technical Regulations §299), so the tree cannot count toward greening")
    if opts.existing_tree_dbh_cm:
        cx, cy, r = EXISTING_TREE
        dbh = opts.existing_tree_dbh_cm
        layer = sh.layer("EX-TREE")
        sh.msp.add_circle((cx, cy), r, dxfattribs={"layer": layer, "linetype": "DASHED"})
        sh.msp.add_circle((cx, cy), RPZ_FACTOR * r, dxfattribs={"layer": layer, "linetype": "DASHED"})
        sh.line((cx - 0.4, cy), (cx + 0.4, cy), layer=layer)
        sh.line((cx, cy - 0.4), (cx, cy + 0.4), layer=layer)
        tag = "EX-01"
        w = text_width(tag, 0.5)
        sh.rect(cx - w / 2 - 0.15, cy + 0.65, cx + w / 2 + 0.15, cy + 1.45, layer=layer)
        sh.text(tag, cx - w / 2, cy + 0.8, 0.5)
        a = math.radians(20)
        sh.leader(f"EXISTING CAMPHOR DBH {dbh} cm — TO BE REMOVED", 18.0, 27.6,
                  (cx + r * math.cos(a), cy + r * math.sin(a)))
        sh.add("existing_tree", T["tree"], (cx, cy), 0, T["ea"],
               note=f"{tag}; dashed canopy r {r:g} m and dashed root protection zone r {RPZ_FACTOR * r:g} m; "
                    f"DBH {dbh} cm; TO BE REMOVED", footprint=_fp(_circle_pts(cx, cy, r)),
               excluded=f"existing tree marked to be removed: not a proposed quantity; DBH {dbh} cm is above the 80 cm "
                        "broadleaf threshold of the municipal tree-protection rule, so removal needs a protection review")


def _odd_areas(sh: _Sheet, opts: SiteOptions):
    if not opts.tree_in_fire_lane:
        return
    pts = _box_pts(FIRE_LANE_BOX)
    layer = sh.layer("FIRE")
    sh.poly(pts, layer=layer, close=True)
    sh.hatch(pts, FIRE_LANE_PATTERN, layer="HATCH")
    x = (FIRE_LANE_BOX[0] + FIRE_LANE_BOX[2]) / 2 + 0.45 / 2  # rotated text: glyphs sit left of the baseline
    sh.text("FIRE TRUCK ACCESS LANE — KEEP CLEAR", x, 19.4, 0.45, rotation=90.0)
    sh.text("W 4.0 M", x, 8.0, 0.45, rotation=90.0)
    sh.add("fire_lane", "FIRE TRUCK ACCESS LANE", _box_centre(FIRE_LANE_BOX), 0, "m²", area_m2=_box_area(FIRE_LANE_BOX),
           note=f"hatched {FIRE_LANE_PATTERN}; keep clear; hard-to-green area (§299)", footprint=_fp(pts))


SCHEDULE_COLS_ZH = ([1.4, 2.8, 1.6, 1.4, 2.6, 2.2, 2.2, 4.8], (4, 7))
SCHEDULE_COLS_EN = ([1.2, 3.1, 5.0, 1.1, 1.1, 1.9, 1.4, 2.2, 4.5], (5, 8))  # 21.5 m, widths measured at h 0.34


def _plant_schedule(sh: _Sheet, m: Messiness, x0: float, y_top: float):
    trees_on_schedule = 12 if m.schedule_mismatch else TREE_N
    if sh.lang == "zh":
        rows = [
            ["植栽表"],
            ["編號", "植物名稱", "數量", "單位", "規格", None, None, "備註"],
            [None, None, None, None, "米高徑(cm)", "樹高(m)", "冠幅(m)", None],
            ["T1", "樟樹", str(trees_on_schedule), "株", "10", "3.5", "1.5", ""],
            ["H1", "金露花", str(hedge_count()), "株", "-", "0.6", "-", "@0.3m 雙排"],
            ["S1", "杜鵑", "150", "m²", "-", "-", "-", "4株/m²"],
            ["G1", "草皮", "200", "m²", "-", "-", "-", ""],
            [f"植栽表合計 喬木 {trees_on_schedule} 株 / 圖面 {TREE_N} 株"],
        ]
        box = _schedule_table(sh, x0, y_top, rows)
    else:
        rows = [
            ["PLANT SCHEDULE"],
            ["CODE", "COMMON NAME", "BOTANICAL NAME", "QTY", "UNIT", "SPEC", None, None, "REMARKS"],
            [None, None, None, None, None, "CAL. (cm)", "HT (m)", "SPREAD (m)", None],
            ["TREES"],
            [TREE.code, TREE.name_en, TREE.scientific, str(trees_on_schedule), "EA", "10", "3.5", "1.5",
             "NATIVE, ROOT-BALLED"],
            ["SHRUBS"],
            [HEDGE.code, HEDGE.name_en, HEDGE.scientific, str(hedge_count()), "EA", "-", "0.6", "-",
             "@0.3m o.c., DOUBLE ROW"],
            [SHRUB.code, SHRUB.name_en, SHRUB.scientific, f"{_box_area(SHRUB_BOX):g}", "m²", "-", "0.3", "-",
             "4 PLANTS/m²"],
            ["GROUNDCOVERS"],
            [LAWN.code, LAWN.name_en, LAWN.scientific, f"{_box_area(LAWN_BOX):g}", "m²", "-", "-", "-", "SOD"],
            [f"TOTAL TREES: {trees_on_schedule}"],
        ]
        box = _schedule_table_en(sh, x0, y_top, rows, *SCHEDULE_COLS_EN)
    sh.add("schedule", rows[0][0], _box_centre(box), 0, note="schedule_mismatch" if m.schedule_mismatch else "")


def _schedule_table_en(sh: _Sheet, x0, y_top, rows, col_w, spec):
    """The English schedule: title, a two-level header (SPEC spans spec[0]..spec[1]-1), data rows grouped under
    one-cell section rows (TREES / SHRUBS / GROUNDCOVERS, no dividers) and a one-cell total line."""
    s0, s1 = spec
    xs = [x0]
    for w in col_w:
        xs.append(xs[-1] + w)
    width = xs[-1] - x0
    h, rh = 0.34, 0.75
    heights = [1.0] + [rh] * (len(rows) - 1)
    ys = [y_top]
    for hgt in heights:
        ys.append(ys[-1] - hgt)
    sh.line((x0, ys[0]), (x0, ys[-1]), layer="TEXT")
    sh.line((x0 + width, ys[0]), (x0 + width, ys[-1]), layer="TEXT")
    for r, y in enumerate(ys):
        if r == 2:  # between the two header rows only the SPEC header has a bottom
            sh.line((xs[s0], y), (xs[s1], y), layer="TEXT")
        else:
            sh.line((x0, y), (x0 + width, y), layer="TEXT")
    for i in range(1, len(col_w)):  # header dividers
        sh.line((xs[i], ys[2] if s0 < i < s1 else ys[1]), (xs[i], ys[3]), layer="TEXT")
    for r, row in enumerate(rows):
        y_base = ys[r + 1] + (heights[r] - h) / 2
        if len(row) == 1:
            sh.text(row[0], x0 + 0.3, y_base, 0.5 if r == 0 else h)
            continue
        if r >= 3:
            for i in range(1, len(col_w)):
                sh.line((xs[i], ys[r]), (xs[i], ys[r + 1]), layer="TEXT")
        for i, cell in enumerate(row):
            if not cell:
                continue
            y_cell = ys[3] + (heights[1] + heights[2] - h) / 2 if r == 1 and (i < s0 or i >= s1) else y_base
            sh.text(cell, xs[i] + 0.15, y_cell, h)
    return (x0, ys[-1], x0 + width, ys[0])


def _sheet_l4(m: Messiness, opts: SiteOptions | None = None) -> _Sheet:
    """The plant schedule on a sheet of its own (schedule_on_own_sheet)."""
    opts = opts or SiteOptions()
    sh = _Sheet("L-4", TEXT[opts.lang]["titles"]["L-4"], "NTS", opts.lang, opts.revision if opts.lang != "zh" else None)
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    _plant_schedule(sh, m, 2.0, 28.0)
    _title_block(sh, 54, -7.5, "L-4")
    return sh


def _schedule_table(sh: _Sheet, x0, y_top, rows, col_w=None, spec=(4, 7)):
    """The plant schedule: a title row, a two-level header (the spec header spans the columns spec[0]..spec[1]-1),
    data rows and a total line."""
    col_w = col_w or SCHEDULE_COLS_ZH[0]
    s0, s1 = spec
    xs = [x0]
    for w in col_w:
        xs.append(xs[-1] + w)
    width = xs[-1] - x0
    rh = 0.9
    heights = [1.1, rh, rh] + [rh] * (len(rows) - 4) + [rh]
    ys = [y_top]
    for hgt in heights:
        ys.append(ys[-1] - hgt)
    h = 0.42
    for y in (ys[0], ys[1], ys[3], *ys[4:]):  # full-width horizontals (ys[2] spans the spec header only)
        sh.line((x0, y), (x0 + width, y), layer="TEXT")
    sh.line((xs[s0], ys[2]), (xs[s1], ys[2]), layer="TEXT")
    sh.line((x0, ys[0]), (x0, ys[-1]), layer="TEXT")
    sh.line((x0 + width, ys[0]), (x0 + width, ys[-1]), layer="TEXT")
    for i in range(1, len(col_w)):
        top = ys[2] if s0 < i < s1 else ys[1]  # spec sub-columns start below the spec header
        sh.line((xs[i], top), (xs[i], ys[-2]), layer="TEXT")
    for r, row in enumerate(rows):
        y_base = ys[r + 1] + (heights[r] - h) / 2
        if len(row) == 1:
            sh.text(row[0], x0 + 0.3, y_base, 0.55 if r == 0 else h)
            continue
        for i, cell in enumerate(row):
            if not cell:
                continue
            if r == 1 and (i < s0 or i >= s1):  # headers spanning both header rows
                y_base_cell = ys[3] + (heights[1] + heights[2] - h) / 2
            else:
                y_base_cell = y_base
            sh.text(cell, xs[i] + 0.15, y_base_cell, h)
    return (x0, ys[-1], x0 + width, ys[0])


def _sheet_l2(m: Messiness, rng: random.Random, opts: SiteOptions | None = None) -> _Sheet:
    opts = opts or SiteOptions()
    T = TEXT[opts.lang]
    sh = _Sheet("L-2", T["titles"]["L-2"], "1:100", opts.lang, opts.revision if opts.lang != "zh" else None)
    sh.rect(-3, -9, 63, 9, layer="FRAME")
    sh.line((1.0, 0.0), (37.0, 0.0), layer="0")
    for cx, _ in tree_centres():
        for dx in (-0.12, 0.12):
            sh.line((cx + dx, 0.0), (cx + dx, 1.1), layer=rng.choice(TREE_LAYERS) if m.layer_chaos else "TREES")
        sh.msp.add_ellipse((cx, 2.3), major_axis=(0, 1.2), ratio=0.75, dxfattribs={"layer": "TREES"})
        label = T["elev_label"]
        sh.text(label, cx - text_width(label, 0.35) / 2, 3.9, 0.35)
        sh.add("elevation_tree", T["tree"], (cx, 2.3), 0, T["ea"], note="elevation: same tree as on L-1, not counted")
    sh.text(T["elev_caption"], 12.0, -2.0, 0.6)
    _title_block(sh, 40, -7.5, "L-2")
    return sh


CALLOUTS_ZH = {"透水磚": (16.0, 13.0, (14.0, 9.0)), "洗石子": (44.5, 8.6, (42.0, 5.0)), "植草磚": (38.5, 16.6, (35.0, 13.0))}
CALLOUTS_EN = CALLOUTS_ZH  # boxed codes are short, so they sit where the Chinese callouts sit


def _sheet_l3(m: Messiness, rng: random.Random, opts: SiteOptions | None = None) -> _Sheet:
    opts = opts or SiteOptions()
    en = opts.lang == "en"
    T = TEXT[opts.lang]
    sh = _Sheet("L-3", T["titles"]["L-3"], "1:200", opts.lang, opts.revision if en else None)
    hatch_layer = (lambda: rng.choice(HATCH_LAYERS)) if m.layer_chaos else (lambda: "HATCH")
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    sh.poly(_box_pts((0, 0, SITE_W, SITE_H)), layer="SITE", close=True, linetype="PHANTOM")
    callouts = CALLOUTS_EN if en else CALLOUTS_ZH
    boxes = paving_boxes(opts)
    for key, (box, pattern) in boxes.items():
        label = PAVING_EN[key] if en else key
        pts = _box_pts(box)
        sh.poly(pts, layer="PAVE", close=True)
        sh.hatch(pts, pattern, layer=hatch_layer())
        tx, ty, target = callouts[key]
        note = ""
        if not en:
            sh.leader(label, tx, ty, target)
        elif key == "洗石子" and opts.paving_label_hatch_mismatch:
            _boxed_callout(sh, PAVING_CODES["透水磚"], tx, ty, target)
            note = (f"boxed code reads {PAVING_CODES['透水磚']} ({PAVING_EN['透水磚']}) but the hatch is {pattern}, which "
                    f"the legend keys to {PAVING_CODES[key]} {label}: code and hatch disagree")
        else:
            _boxed_callout(sh, PAVING_CODES[key], tx, ty, target)
            note = f"finish code {PAVING_CODES[key]}"
        area = round(_box_area(box), 6)
        if en and key == "植草磚" and opts.paving_overlaps_lawn_m2:
            note += f"; overlaps the L-1 lawn by {_box_overlap(box, LAWN_BOX):g} m²"
        sh.add("paving", label, _box_centre(box), area, "m²", area_m2=area, footprint=_fp(pts), note=note)

    x0, y0, x1, y1 = PLANTER_BOX
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    gaps = [min(g, m.gap_cm) / 100 for g in (0, 2, 3, 5)]
    k = 0
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        for p, q in ((a, mid), (mid, b)):
            g = gaps[k % len(gaps)] / 2
            k += 1
            L = math.hypot(q[0] - p[0], q[1] - p[1])
            ux, uy = (q[0] - p[0]) / L, (q[1] - p[1]) / L
            sh.line((p[0] + ux * g, p[1] + uy * g), (q[0] - ux * g, q[1] - uy * g), layer="PLANT")
    if en:
        sh.text(T["planter"], (x0 + x1) / 2 - text_width(T["planter"], TEXT_H) / 2, (y0 + y1) / 2 - 0.3)
    else:
        sh.text("花台", (x0 + x1) / 2 - 0.6, (y0 + y1) / 2 - 0.3)
    sh.add("planter_edge", T["planter"], _box_centre(PLANTER_BOX), 2 * ((x1 - x0) + (y1 - y0)), "m",
           length_m=2 * ((x1 - x0) + (y1 - y0)), note="loose segments")

    _legend(sh, 54, 19.5, 73, 31.5, [("swatch", f"{PAVING_CODES[key]} {PAVING_EN[key]}" if en else key, pattern)
                                     for key, (_, pattern) in PAVING.items()])
    _title_block(sh, 54, -7.5, "L-3")
    _scale_bar_and_north(sh, 0.0, -5.0, 44.0)
    return sh


def _boxed_callout(sh: _Sheet, code: str, x: float, y: float, target, h: float = TEXT_H):
    """A finish code in a box with a leader to `target`. The leader starts just outside the box (inside the text's
    pick distance), so it reads as a leader and does not touch the box."""
    w = text_width(code, h)
    sh.rect(x - 0.15, y - 0.15, x + w + 0.15, y + h + 0.15, layer="LEADER")
    sh.text(code, x, y, h)
    start = (x + w / 2, y - 0.2) if target[1] < y else (x + w / 2, y + h + 0.2)
    sh.poly([start, target], layer="LEADER")


def answer_totals(objects: list[_Obj]) -> dict:
    totals: dict[str, dict[str, float]] = {}
    for o in objects:
        if o.kind in ("legend", "title", "schedule", "elevation_tree") or not o.quote_count:
            continue
        group = totals.setdefault(o.kind, {})
        group[o.label] = round(group.get(o.label, 0) + o.quote_count, 3)
    return totals


def build_site(m: Messiness, opts: SiteOptions | None = None, rng: random.Random | None = None) -> list[_Sheet]:
    """The sheets L-1, L-2, L-3 (and L-4 when the schedule has a sheet of its own), not yet written."""
    opts = opts or SiteOptions()
    rng = rng or random.Random(7)
    sheets = [_sheet_l1(m, rng, opts), _sheet_l2(m, rng, opts), _sheet_l3(m, rng, opts)]
    if m.schedule_on_own_sheet:
        sheets.append(_sheet_l4(m, opts))
    return sheets


def odd_objects(objects: list[_Obj], opts: SiteOptions) -> list[dict]:
    """Each odd object with its kind, the object IDs involved and the reason it is not counted (or is flagged)."""
    out = []
    by_id = {o.id: o for o in objects}
    for o in objects:
        if not o.excluded:
            continue
        kind = {"existing_tree": "existing_tree"}.get(o.kind) or (
            "tree_outside_boundary" if "boundary" in o.excluded else "tree_in_fire_lane")
        ids = [o.id] + ([i for i in by_id if by_id[i].kind == "fire_lane" and by_id[i].sheet == o.sheet]
                        if kind == "tree_in_fire_lane" else [])
        out.append({"kind": kind, "sheet": o.sheet, "object_ids": ids, "counted": False, "reason": o.excluded})
    l3 = [o for o in objects if o.sheet == "L-3" and o.kind == "paving"]
    lawn = [o for o in objects if o.sheet == "L-1" and o.kind == "lawn"]
    if opts.paving_overlaps_lawn_m2 and l3 and lawn:
        grass = l3[2]
        out.append({"kind": "paving_overlaps_lawn", "sheet": "L-3", "object_ids": [grass.id, lawn[0].id],
                    "overlap_m2": opts.paving_overlaps_lawn_m2, "counted": True,
                    "reason": f"the {grass.label.lower()} on L-3 overlap the lawn on L-1 by "
                              f"{opts.paving_overlaps_lawn_m2:g} m²: that area is counted twice"})
    if opts.paving_label_hatch_mismatch and l3:
        agg = l3[1]
        out.append({"kind": "label_hatch_mismatch", "sheet": "L-3", "object_ids": [agg.id],
                    "label": f"{PAVING_CODES['透水磚']} {PAVING_EN['透水磚']}", "hatch": PAVING["洗石子"][1],
                    "legend_says": f"{PAVING_CODES['洗石子']} {agg.label}", "counted": True,
                    "reason": f"the boxed code says {PAVING_CODES['透水磚']} (permeable pavers), the hatch is "
                              f"{PAVING_CODES['洗石子']}'s (exposed aggregate): which item, and which price? "
                              "The key counts it as the hatch and legend say"})
    return out


def site_key(sheets: list[_Sheet], m: Messiness, opts: SiteOptions | None = None) -> dict:
    opts = opts or SiteOptions()
    T = TEXT[opts.lang]
    zh = opts.lang == "zh"
    objects = [o for sh in sheets for o in sh.objects]
    naive = sum(1 for o in objects if (o.sheet, o.kind) in (("L-1", "tree"), ("L-1", "existing_tree"), ("L-2", "elevation_tree")))
    key = {
        "site": {"name": PROJECT if zh else PROJECT_EN, "width_m": SITE_W, "depth_m": SITE_H,
                 "area_m2": SITE_W * SITE_H, "units": "m", "sheets": {sh.name: sh.title for sh in sheets}},
        "messiness": asdict(m) | {"tag": m.tag, "tree_gaps_cm": [round(g * 100) for g in m.tree_gaps_m()]},
        "schedule": {T["tree"]: 12 if m.schedule_mismatch else TREE_N, T["hedge"]: hedge_count(), T["shrub"]: 150.0,
                     T["lawn"]: 200.0},
        "totals": answer_totals(objects),
        "naive_tree_count_l1_l2": naive,
        "objects": [obj_dict(o) for o in objects],
    }
    if opts != SiteOptions():
        key["site"] |= {"building_coverage": 0.4, "ground": "artificial (landscape over basement slab)",
                        "jurisdiction": "local building code"}
        key["options"] = asdict(opts)
        key["species"] = [{k: v for k, v in s.items() if k != "name_zh"} for s in species_table()]
        key["counted_trees"] = {sh.name: sum(o.quote_count for o in sh.objects if o.kind == "tree")
                                for sh in sheets if any(o.kind == "tree" for o in sh.objects)}
        key["odd_objects"] = odd_objects(objects, opts)
    return key


def generate(out_dir: str | Path, messiness: Messiness | None = None, coloured: bool = False,
             options: SiteOptions | None = None) -> dict:
    """Write L-1.dxf, L-2.dxf, L-3.dxf and answer_key.json into out_dir; return the answer key (with file paths)."""
    m = messiness or Messiness()
    opts = options or SiteOptions()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    sheets = build_site(m, opts)
    paths = {sh.name: str(sh.save(out)) for sh in sheets}
    key = site_key(sheets, m, opts)
    (out / "answer_key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1))
    if coloured:
        from landsight.dxf import load, render_png

        for name in ("L-1", "L-3"):
            render_png(load(paths[name]), out / f"{name}_filled.png", filled=True)
    return key | {"paths": paths}
