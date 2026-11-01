"""The synthetic site (v2): one site, three sheets, one answer key.

Sheets (DXF R2010, units metres, origin at the site's south-west corner, x east, y north):

- L-1 植栽配置平面圖 (1:200): a 50 x 30 m site (1,500 m2) in 本市. Eight 樟樹 in a frontage row along the south
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
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path

import ezdxf
from ezdxf import units

GAPS_CM = (0, 0, 5, 5, 10, 10, 20, 40)
TREE_LAYERS = ("TREES", "tree", "1", "$00100")
HATCH_LAYERS = ("HATCH", "HATCH1", "00hatch")
LABEL_STYLES = ("typ", "group", "none")

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
PROJECT = "本市綠邑社區景觀工程"
DATE = "2026-11-01"
TEXT_H = 0.6


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


@dataclass
class _Sheet:
    """One DXF document plus the answer-key objects drawn on it."""

    name: str
    title: str
    scale: str
    doc: ezdxf.document.Drawing = field(init=False)
    objects: list[_Obj] = field(default_factory=list)

    def __post_init__(self):
        self.doc = ezdxf.new("R2010", setup=True)
        self.doc.units = units.M
        self.doc.header["$MEASUREMENT"] = 1
        self.doc.styles.add("CJK", font="msjh.ttc")
        for name in ("0", "2", "SITE", "FRAME", "TEXT", "LEADER", "PLANT", "PAVE", *TREE_LAYERS, *HATCH_LAYERS):
            if name not in self.doc.layers:
                self.doc.layers.add(name)
        self.msp = self.doc.modelspace()

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
        self.msp.add_text(s, height=h, rotation=rotation, dxfattribs={"layer": layer, "style": "CJK"}).set_placement((x, y))

    def hatch(self, pts, pattern, layer="HATCH", scale=0.05):
        h = self.msp.add_hatch(color=7, dxfattribs={"layer": layer})
        if pattern == "SOLID":
            h.set_solid_fill(color=7)
        else:
            h.set_pattern_fill(pattern, scale=scale)
        h.paths.add_polyline_path(pts, is_closed=True)

    def leader(self, s, x, y, target, h=TEXT_H):
        """Text at (x, y) with a shoulder under it and a line to `target`; the free end sits under the text's end."""
        w = text_width(s, h)
        self.text(s, x, y, h)
        right_side = target[0] >= x + w / 2
        start, elbow = ((x, y - 0.15), (x + w, y - 0.15)) if right_side else ((x + w, y - 0.15), (x, y - 0.15))
        self.poly([start, elbow, target], layer="LEADER")

    def add(self, kind, label, centre, quote_count, unit="", **kw):
        n = sum(1 for o in self.objects if o.kind == kind) + 1
        oid = f"{self.name}/{kind}-{n:02d}"
        self.objects.append(_Obj(oid, self.name, kind, label, [round(centre[0], 3), round(centre[1], 3)], quote_count, unit, **kw))

    def save(self, out_dir: Path) -> Path:
        path = out_dir / f"{self.name}.dxf"
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


def _edge_point(cx, cy, r, angle_deg):
    """A point on the canopy polygon (edge midpoints sit at multiples of 30 degrees)."""
    rr = r * math.cos(math.radians(15))
    return (cx + rr * math.cos(math.radians(angle_deg)), cy + rr * math.sin(math.radians(angle_deg)))


def _table(sh: _Sheet, x0, y_top, col_w, rows, row_h, layer="TEXT", h=0.42):
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
            sh.text(row[0], x0 + 0.3, y_next + (rh - h) / 2, h)
        else:
            for i, cell in enumerate(row):
                if i > 0 and cell is not None:
                    sh.line((xs[i], y), (xs[i], y_next), layer=layer)
                if cell:
                    sh.text(cell, xs[i] + 0.2, y_next + (rh - h) / 2, h)
        y = y_next
    return (x0, y, x0 + width, y_top)


def _title_block(sh: _Sheet, x0, y0, number):
    rows = [("工程名稱", PROJECT), ("圖名", sh.title), ("圖號", number), ("比例", sh.scale),
            ("基地面積", "1,500 m²"), ("建蔽率", "40%"), ("日期", DATE)]
    box = _table(sh, x0, y0 + 14.5, [4.5, 16.5], [list(r) for r in rows], 14.5 / len(rows), layer="FRAME", h=0.6)
    sh.add("title", sh.title, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), 0, note=f"圖號 {number}")


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
    sh.text("圖例", x0 + 1.0, y1 - 1.4, 0.8)
    sh.add("legend", "圖例", ((x0 + x1) / 2, (y0 + y1) / 2), 0, note="legend box")
    y = y1 - 2.4
    for kind, label, pattern in entries:
        if kind == "tree":
            cy = y - TREE_R
            cx = x0 + 3.5
            sh.poly(_canopy_vertices(cx, cy, TREE_R), layer="TREES", close=True)
            sh.line((cx - 0.4, cy), (cx + 0.4, cy), layer="TREES")
            sh.line((cx, cy - 0.4), (cx, cy + 0.4), layer="TREES")
            sh.text(label, x0 + 7.0, cy - 0.3)
            sh.add("legend", f"legend symbol {label}", (cx, cy), 0, note="tree symbol")
            y = cy - TREE_R - 0.8
        elif kind == "swatch":
            pts = [(x0 + 1.5, y - 1.4), (x0 + 5.5, y - 1.4), (x0 + 5.5, y), (x0 + 1.5, y)]
            sh.poly(pts, layer="FRAME", close=True)
            sh.hatch(pts, pattern, layer=HATCH_LAYERS[0])
            sh.text(label, x0 + 7.0, y - 1.0)
            sh.add("legend", f"legend swatch {label}", (x0 + 3.5, y - 0.7), 0, note="swatch")
            y -= 2.2
        elif kind == "hedge":
            for dy in (0.0, 0.4):
                sh.line((x0 + 1.5, y - 0.6 - dy), (x0 + 5.5, y - 0.6 - dy), layer="PLANT")
            sh.text(label, x0 + 7.0, y - 1.0)
            sh.add("legend", f"legend line {label}", (x0 + 3.5, y - 0.8), 0, note="hedge line")
            y -= 1.8


def _box_pts(b):
    x0, y0, x1, y1 = b
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def _box_centre(b):
    return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


def _box_area(b):
    return (b[2] - b[0]) * (b[3] - b[1])


# --------------------------------------------------------------------------------------------- the three sheets


def tree_centres() -> list[tuple[float, float]]:
    return [(TREE_X0 + TREE_SPACING * i, TREE_Y) for i in range(TREE_N)]


def hedge_count() -> int:
    return 2 * (math.floor(round((HEDGE_Y[1] - HEDGE_Y[0]) / HEDGE_SPACING, 6)) + 1)


def _sheet_l1(m: Messiness, rng: random.Random) -> _Sheet:
    sh = _Sheet("L-1", "植栽配置平面圖", "1:200")
    tree_layers = TREE_LAYERS if m.layer_chaos else TREE_LAYERS[:1]
    hatch_layer = (lambda: rng.choice(HATCH_LAYERS)) if m.layer_chaos else (lambda: "HATCH")

    sh.rect(-3, -9, 77, 33, layer="FRAME")
    sh.poly(_box_pts((0, 0, SITE_W, SITE_H)), layer="SITE", close=True, linetype="PHANTOM")
    sh.text("計畫道路 8M", 20.0, -2.2, 0.8)

    for i, ((cx, cy), gap) in enumerate(zip(tree_centres(), m.tree_gaps_m())):
        _draw_canopy(sh, cx, cy, TREE_R, gap, m.exploded, tree_layers, rng)
        sh.add("tree", "樟樹", (cx, cy), 1, "株", note=f"end gap {gap * 100:.0f} cm; spec {TREE_SPEC}")
    xs = [c[0] for c in tree_centres()]
    if m.label_style == "typ":
        cx, cy = tree_centres()[2]
        sh.leader("樟樹 typ.", cx + 1.0, cy + 4.6, _edge_point(cx, cy, TREE_R, 60))
    elif m.label_style == "group":
        cx, cy = tree_centres()[3]
        sh.leader(f"{TREE_N}-樟樹", cx + 1.0, cy + 4.6, _edge_point(cx, cy, TREE_R, 90))

    for x in HEDGE_X:
        sh.line((x, HEDGE_Y[0]), (x, HEDGE_Y[1]), layer="PLANT" if not m.layer_chaos else "2")
    hedge_label = "金露花 H0.6 @0.3m 雙排"
    sh.leader(hedge_label, 38.0, 25.2, (HEDGE_X[0], 24.0))
    sh.add("hedge", "金露花", (sum(HEDGE_X) / 2, sum(HEDGE_Y) / 2), hedge_count(), "株",
           length_m=2 * (HEDGE_Y[1] - HEDGE_Y[0]), note="H0.6 @0.3m 雙排: 2 x (floor(27.0/0.3)+1)")

    for box, label, pattern, kind in ((SHRUB_BOX, "杜鵑", SHRUB_PATTERN, "shrub_bed"), (LAWN_BOX, "草皮", LAWN_PATTERN, "lawn")):
        pts = _box_pts(box)
        sh.poly(pts, layer="PLANT", close=True)
        sh.hatch(pts, pattern, layer=hatch_layer())
        cx, cy = _box_centre(box)
        sh.text(label, cx - text_width(label, 0.8) / 2, cy - 0.4, 0.8)
        sh.add(kind, label, (cx, cy), _box_area(box), "m²", area_m2=_box_area(box))

    _legend(sh, 54, 19.5, 73, 31.5, [("tree", "樟樹", None), ("swatch", "杜鵑", SHRUB_PATTERN), ("hedge", "金露花", None)])

    if not m.schedule_on_own_sheet:
        _plant_schedule(sh, m, 54.0, 17.5)

    _title_block(sh, 54, -7.5, "L-1")
    _scale_bar_and_north(sh, 0.0, -5.0, 44.0)
    return sh


def _plant_schedule(sh: _Sheet, m: Messiness, x0: float, y_top: float):
    trees_on_schedule = 12 if m.schedule_mismatch else TREE_N
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
    sh.add("schedule", "植栽表", _box_centre(box), 0, note="schedule_mismatch" if m.schedule_mismatch else "")


def _sheet_l4(m: Messiness) -> _Sheet:
    """The plant schedule on a sheet of its own (schedule_on_own_sheet)."""
    sh = _Sheet("L-4", "植栽表", "NTS")
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    _plant_schedule(sh, m, 2.0, 28.0)
    _title_block(sh, 54, -7.5, "L-4")
    return sh


def _schedule_table(sh: _Sheet, x0, y_top, rows):
    """The plant schedule: a title row, a two-level header (規格 spans three columns), data rows and a total line."""
    col_w = [1.4, 2.8, 1.6, 1.4, 2.6, 2.2, 2.2, 4.8]
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
    for y in (ys[0], ys[1], ys[3], *ys[4:]):  # full-width horizontals (ys[2] spans 規格 only)
        sh.line((x0, y), (x0 + width, y), layer="TEXT")
    sh.line((xs[4], ys[2]), (xs[7], ys[2]), layer="TEXT")
    sh.line((x0, ys[0]), (x0, ys[-1]), layer="TEXT")
    sh.line((x0 + width, ys[0]), (x0 + width, ys[-1]), layer="TEXT")
    for i in range(1, len(col_w)):
        top = ys[2] if i in (5, 6) else ys[1]  # 規格 sub-columns start below the 規格 header
        sh.line((xs[i], top), (xs[i], ys[-2]), layer="TEXT")
    for r, row in enumerate(rows):
        y_base = ys[r + 1] + (heights[r] - h) / 2
        if len(row) == 1:
            sh.text(row[0], x0 + 0.3, y_base, 0.55 if r == 0 else h)
            continue
        for i, cell in enumerate(row):
            if not cell:
                continue
            if r == 1 and i < 4 or (r == 1 and i == 7):  # headers spanning both header rows
                y_base_cell = ys[3] + (heights[1] + heights[2] - h) / 2
            else:
                y_base_cell = y_base
            sh.text(cell, xs[i] + 0.15, y_base_cell, h)
    return (x0, ys[-1], x0 + width, ys[0])


def _sheet_l2(m: Messiness, rng: random.Random) -> _Sheet:
    sh = _Sheet("L-2", "南向立面圖", "1:100")
    sh.rect(-3, -9, 63, 9, layer="FRAME")
    sh.line((1.0, 0.0), (37.0, 0.0), layer="0")
    for cx, _ in tree_centres():
        for dx in (-0.12, 0.12):
            sh.line((cx + dx, 0.0), (cx + dx, 1.1), layer=rng.choice(TREE_LAYERS) if m.layer_chaos else "TREES")
        sh.msp.add_ellipse((cx, 2.3), major_axis=(0, 1.2), ratio=0.75, dxfattribs={"layer": "TREES"})
        label = "樟樹 H3.5"
        sh.text(label, cx - text_width(label, 0.35) / 2, 3.9, 0.35)
        sh.add("elevation_tree", "樟樹", (cx, 2.3), 0, "株", note="elevation: same tree as on L-1, not counted")
    sh.text("南向立面圖 S=1:100", 12.0, -2.0, 0.6)
    _title_block(sh, 40, -7.5, "L-2")
    return sh


def _sheet_l3(m: Messiness, rng: random.Random) -> _Sheet:
    sh = _Sheet("L-3", "鋪面計畫圖", "1:200")
    hatch_layer = (lambda: rng.choice(HATCH_LAYERS)) if m.layer_chaos else (lambda: "HATCH")
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    sh.poly(_box_pts((0, 0, SITE_W, SITE_H)), layer="SITE", close=True, linetype="PHANTOM")
    callouts = {"透水磚": (16.0, 13.0, (14.0, 9.0)), "洗石子": (44.5, 8.6, (42.0, 5.0)), "植草磚": (38.5, 16.6, (35.0, 13.0))}
    for label, (box, pattern) in PAVING.items():
        pts = _box_pts(box)
        sh.poly(pts, layer="PAVE", close=True)
        sh.hatch(pts, pattern, layer=hatch_layer())
        tx, ty, target = callouts[label]
        sh.leader(label, tx, ty, target)
        sh.add("paving", label, _box_centre(box), _box_area(box), "m²", area_m2=_box_area(box))

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
    sh.text("花台", (x0 + x1) / 2 - 0.6, (y0 + y1) / 2 - 0.3)
    sh.add("planter_edge", "花台", _box_centre(PLANTER_BOX), 2 * ((x1 - x0) + (y1 - y0)), "m",
           length_m=2 * ((x1 - x0) + (y1 - y0)), note="loose segments")

    _legend(sh, 54, 19.5, 73, 31.5, [("swatch", label, pattern) for label, (_, pattern) in PAVING.items()])
    _title_block(sh, 54, -7.5, "L-3")
    _scale_bar_and_north(sh, 0.0, -5.0, 44.0)
    return sh


def answer_totals(objects: list[_Obj]) -> dict:
    totals: dict[str, dict[str, float]] = {}
    for o in objects:
        if o.kind in ("legend", "title", "schedule", "elevation_tree") or not o.quote_count:
            continue
        group = totals.setdefault(o.kind, {})
        group[o.label] = round(group.get(o.label, 0) + o.quote_count, 3)
    return totals


def generate(out_dir: str | Path, messiness: Messiness | None = None, coloured: bool = False) -> dict:
    """Write L-1.dxf, L-2.dxf, L-3.dxf and answer_key.json into out_dir; return the answer key (with file paths)."""
    m = messiness or Messiness()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(7)
    sheets = [_sheet_l1(m, rng), _sheet_l2(m, rng), _sheet_l3(m, rng)]
    if m.schedule_on_own_sheet:
        sheets.append(_sheet_l4(m))
    paths = {sh.name: str(sh.save(out)) for sh in sheets}
    objects = [o for sh in sheets for o in sh.objects]
    key = {
        "site": {"name": PROJECT, "city": "本市", "width_m": SITE_W, "depth_m": SITE_H, "area_m2": SITE_W * SITE_H,
                 "units": "m", "sheets": {sh.name: sh.title for sh in sheets}},
        "messiness": asdict(m) | {"tag": m.tag, "tree_gaps_cm": [round(g * 100) for g in m.tree_gaps_m()]},
        "schedule": {"樟樹": 12 if m.schedule_mismatch else TREE_N, "金露花": hedge_count(), "杜鵑": 150.0, "草皮": 200.0},
        "totals": answer_totals(objects),
        "naive_tree_count_l1_l2": 2 * TREE_N,
        "objects": [asdict(o) for o in objects],
    }
    (out / "answer_key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1))
    if coloured:
        from landsight.dxf import load, render_png

        for name in ("L-1", "L-3"):
            render_png(load(paths[name]), out / f"{name}_filled.png", filled=True)
    return key | {"paths": paths}
