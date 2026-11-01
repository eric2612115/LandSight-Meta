"""Spike: a tree drawn the messy way (loose line segments + a text label), rendered to PNG,
then re-assembled into polygons with shapely. Not product code; it proves the two ends of the pipeline.

Run: uv run python spike/messy_tree.py  -> spike/out/messy.dxf, messy.png, polygons.txt
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import ezdxf
from ezdxf.addons.drawing import Frontend, RenderContext
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from shapely.geometry import LineString
from shapely.ops import polygonize, unary_union

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
random.seed(7)


def messy_circle(msp, cx: float, cy: float, r: float, segments: int = 12, gap: float = 0.0):
    """A canopy outline drawn as `segments` separate LINE entities, each shortened by `gap` at both ends."""
    pts = []
    for i in range(segments):
        a0 = 2 * math.pi * i / segments
        a1 = 2 * math.pi * (i + 1) / segments
        p0 = (cx + r * math.cos(a0), cy + r * math.sin(a0))
        p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
        if gap:
            dx, dy = p1[0] - p0[0], p1[1] - p0[1]
            L = math.hypot(dx, dy)
            p0 = (p0[0] + dx / L * gap, p0[1] + dy / L * gap)
            p1 = (p1[0] - dx / L * gap, p1[1] - dy / L * gap)
        msp.add_line(p0, p1, dxfattribs={"layer": "PLANT"})
        pts.append((p0, p1))
    return pts


def build() -> Path:
    doc = ezdxf.new("R2010")
    doc.layers.add("PLANT", color=3)
    doc.layers.add("PAVING", color=8)
    doc.layers.add("TEXT", color=7)
    msp = doc.modelspace()

    # Paving: a closed rectangle drawn as 4 separate lines (clean).
    for a, b in [((0, 0), (30, 0)), ((30, 0), (30, 18)), ((30, 18), (0, 18)), ((0, 18), (0, 0))]:
        msp.add_line(a, b, dxfattribs={"layer": "PAVING"})

    # Three trees: one clean (12 touching segments), one with 5 cm gaps, one with 20 cm gaps.
    trees = [((6, 9), 2.5, 0.0), ((15, 9), 2.5, 0.05), ((24, 9), 2.5, 0.20)]
    for (cx, cy), r, gap in trees:
        messy_circle(msp, cx, cy, r, gap=gap)
        msp.add_line((cx - 0.4, cy), (cx + 0.4, cy), dxfattribs={"layer": "PLANT"})  # centre mark
        msp.add_line((cx, cy - 0.4), (cx, cy + 0.4), dxfattribs={"layer": "PLANT"})
        msp.add_text("樹 typ.", dxfattribs={"layer": "TEXT", "height": 0.6}).set_placement((cx - 1.2, cy + 3.0))

    path = OUT / "messy.dxf"
    doc.saveas(path)
    return path


def render(dxf_path: Path) -> Path:
    doc = ezdxf.readfile(dxf_path)
    fig = plt.figure(figsize=(12, 7.2), dpi=150)
    ax = fig.add_axes([0, 0, 1, 1])
    ctx = RenderContext(doc)
    out = MatplotlibBackend(ax)
    Frontend(ctx, out).draw_layout(doc.modelspace(), finalize=True)
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")
    for line in ax.get_lines():
        line.set_color("black")
    png = OUT / "messy.png"
    fig.savefig(png, facecolor="white")
    plt.close(fig)
    return png


def polygonize_dxf(dxf_path: Path, snap_tol: float) -> list:
    """Loose LINEs -> polygons. Endpoints closer than snap_tol are joined (via a tiny buffer trick)."""
    doc = ezdxf.readfile(dxf_path)
    lines = [
        LineString([(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)])
        for e in doc.modelspace().query("LINE")
    ]
    merged = unary_union(lines)
    if snap_tol > 0:
        # Close small gaps: thicken, then take the hole boundaries.
        fat = merged.buffer(snap_tol / 2, join_style="mitre")
        polys = [p for p in getattr(fat, "geoms", [fat])]
        rings = []
        for p in polys:
            rings.extend(p.interiors)
        return [LineString(r).convex_hull for r in rings]
    return list(polygonize(merged))


if __name__ == "__main__":
    dxf = build()
    png = render(dxf)
    report = []
    for tol in (0.0, 0.1, 0.3):
        polys = polygonize_dxf(dxf, tol)
        areas = sorted(round(p.area, 2) for p in polys)
        report.append(f"snap_tol={tol}: {len(polys)} polygons, areas={areas}")
    (OUT / "polygons.txt").write_text("\n".join(report) + "\n")
    print("\n".join(report))
    print("wrote", dxf, png)
