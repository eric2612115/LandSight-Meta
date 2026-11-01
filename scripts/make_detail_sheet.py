"""A minimal tree-pit detail sheet (L-6) until the package generator's L-6 exists: a square pit 1.5 x 1.5 m in plan,
a section with 1000 mm of planting soil on the structural slab, the notes "SOIL DEPTH 1000" and "ON SLAB", and a
title block (DRAWING NO. L-6). Writes tests/fixtures/detail/L-6.dxf and its render L-6.png (landsight.dxf.render),
the image Muse Spark's read_detail was recorded on.

  uv run python scripts/make_detail_sheet.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import ezdxf
from ezdxf import units

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from landsight.dxf import load, render_png  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "detail"
PIT_W, PIT_L, SOIL, SLAB = 1.5, 1.5, 1.0, 0.3  # metres; the dimensions are written in millimetres
H = 0.12  # text height, metres (1:20)


def build() -> ezdxf.document.Drawing:
    doc = ezdxf.new("R2010", setup=True)
    doc.units = units.M
    doc.header["$INSUNITS"] = 6
    msp = doc.modelspace()

    def rect(x0, y0, x1, y1, layer="0"):
        msp.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs={"layer": layer})

    def text(s, x, y, h=H, layer="TEXT"):
        msp.add_text(s, height=h, dxfattribs={"layer": layer, "insert": (x, y)})

    def hatch(pts, pattern, scale=0.02):
        h = msp.add_hatch(dxfattribs={"layer": "HATCH"})
        h.set_pattern_fill(pattern, scale=scale)
        h.paths.add_polyline_path(pts, is_closed=True)

    def dim(a, b, label, offset, vertical=False):
        """A dimension line with ticks and its text, `offset` metres off the measured edge."""
        if vertical:
            x = a[0] + offset
            msp.add_line((x, a[1]), (x, b[1]), dxfattribs={"layer": "DIM"})
            for y in (a[1], b[1]):
                msp.add_line((x - 0.06, y - 0.06), (x + 0.06, y + 0.06), dxfattribs={"layer": "DIM"})
            text(label, x + 0.08, (a[1] + b[1]) / 2 - H / 2)
        else:
            y = a[1] + offset
            msp.add_line((a[0], y), (b[0], y), dxfattribs={"layer": "DIM"})
            for x in (a[0], b[0]):
                msp.add_line((x - 0.06, y - 0.06), (x + 0.06, y + 0.06), dxfattribs={"layer": "DIM"})
            text(label, (a[0] + b[0]) / 2 - 0.15, y + 0.06)

    rect(-0.5, -1.9, 8.5, 3.6, "FRAME")  # sheet frame

    # plan: the square pit, the root ball, two dimensions
    px, py = 0.6, 0.6
    rect(px, py, px + PIT_W, py + PIT_L, "PIT")
    msp.add_circle((px + PIT_W / 2, py + PIT_L / 2), 0.15, dxfattribs={"layer": "PIT"})
    dim((px, py + PIT_L), (px + PIT_W, py + PIT_L), "1500", 0.25)
    dim((px + PIT_W, py), (px + PIT_W, py + PIT_L), "1500", 0.25, vertical=True)
    text("TREE PIT - PLAN", px, py - 0.4)

    # section: slab, planting soil 1000 deep, pit walls, the notes
    sx = 3.6
    rect(sx, 0.0, sx + 3.2, SLAB, "SLAB")
    hatch([(sx, 0.0), (sx + 3.2, 0.0), (sx + 3.2, SLAB), (sx, SLAB)], "ANSI31")
    wx0, wx1 = sx + 0.85, sx + 0.85 + PIT_W
    rect(wx0, SLAB, wx1, SLAB + SOIL, "PIT")
    hatch([(wx0, SLAB), (wx1, SLAB), (wx1, SLAB + SOIL), (wx0, SLAB + SOIL)], "EARTH", 0.03)
    dim((wx0, SLAB + SOIL), (wx1, SLAB + SOIL), "1500", 0.25)
    dim((wx1, SLAB), (wx1, SLAB + SOIL), "1000", 0.3, vertical=True)
    text("SOIL DEPTH 1000", wx1 + 0.9, SLAB + SOIL / 2 + 0.15)
    text("PLANTING SOIL", wx1 + 0.9, SLAB + SOIL / 2 - 0.1)
    msp.add_line((sx + 0.4, SLAB / 2), (sx + 0.1, -0.35), dxfattribs={"layer": "TEXT"})
    text("ON SLAB", sx - 0.3, -0.55)
    text("STRUCTURAL SLAB (BASEMENT ROOF)", sx + 0.9, -0.55)
    text("SECTION A-A", sx, SLAB + SOIL + 0.75)

    # title block: a two-column table
    tx0, ty0, cw = 4.9, -1.85, (1.1, 2.4)
    rows = [("TITLE", "TREE PIT DETAIL"), ("DRAWING NO.", "L-6"), ("SCALE", "1:20"), ("DATE", "2026-11-01")]
    rh = 0.28
    for i, (k, v) in enumerate(rows):
        y = ty0 + rh * (len(rows) - 1 - i)
        rect(tx0, y, tx0 + cw[0], y + rh, "FRAME")
        rect(tx0 + cw[0], y, tx0 + cw[0] + cw[1], y + rh, "FRAME")
        text(k, tx0 + 0.06, y + 0.08, 0.1, "FRAME")
        text(v, tx0 + cw[0] + 0.06, y + 0.08, 0.1, "FRAME")
    return doc


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "L-6.dxf"
    build().saveas(path)
    png = render_png(load(path), OUT / "L-6.png")
    print(f"{path}: {path.stat().st_size // 1024} KB; L-6.png {len(png) // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
