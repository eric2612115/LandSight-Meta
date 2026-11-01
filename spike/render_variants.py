"""Spike 2: which rendering of the same messy DXF does SAM 3.1 respond to?

Variants: thin black lines (CAD print), thick lines, filled canopies (coloured plan), scanned look (grey paper,
blur). Labels are drawn with a CJK font. Then SAM is asked for 'tree' on each, and Muse Spark reads the labels.
Run: uv run python spike/render_variants.py
"""

from __future__ import annotations

import base64
import json
import math
import os
import sys
from pathlib import Path

import ezdxf
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from meta_probe import sam, spark  # noqa: E402

OUT = Path(__file__).parent / "out"
DXF = OUT / "messy.dxf"
plt.rcParams["font.family"] = "Heiti TC"

TREES = [((6, 9), 2.5), ((15, 9), 2.5), ((24, 9), 2.5)]  # same as messy_tree.py


def base_axes(fig):
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(-2, 32)
    ax.set_ylim(-2, 20)
    ax.set_aspect("equal")
    ax.axis("off")
    return ax


def draw_lines(ax, lw: float, color="black"):
    doc = ezdxf.readfile(DXF)
    for e in doc.modelspace().query("LINE"):
        ax.plot([e.dxf.start.x, e.dxf.end.x], [e.dxf.start.y, e.dxf.end.y], color=color, lw=lw, solid_capstyle="round")


def draw_labels(ax, size=11):
    for i, ((cx, cy), r) in enumerate(TREES):
        txt = ["樟樹 typ.", "樟樹 ×8", "小葉欖仁 @3m"][i]
        ax.text(cx - 1.4, cy + r + 0.6, txt, fontsize=size, color="black")
        ax.plot([cx - 0.2, cx - 1.2], [cy + r - 0.3, cy + r + 0.5], color="black", lw=0.8)  # leader


def variant_thin():
    fig = plt.figure(figsize=(12, 7.2), dpi=150)
    ax = base_axes(fig)
    draw_lines(ax, 0.8)
    draw_labels(ax)
    return fig


def variant_thick():
    fig = plt.figure(figsize=(12, 7.2), dpi=150)
    ax = base_axes(fig)
    draw_lines(ax, 3.0)
    draw_labels(ax, 13)
    return fig


def variant_filled():
    fig = plt.figure(figsize=(12, 7.2), dpi=150)
    ax = base_axes(fig)
    ax.add_patch(Rectangle((0, 0), 30, 18, facecolor="#e8e2d6", edgecolor="black", lw=1.5))  # paving
    for (cx, cy), r in TREES:
        ax.add_patch(Circle((cx, cy), r, facecolor="#8fbf7f", edgecolor="#2f6b2f", lw=2.0, alpha=0.9))
        ax.plot(cx, cy, marker="+", color="#2f6b2f", ms=12, mew=1.5)
    draw_lines(ax, 1.2, color="#2f6b2f")
    draw_labels(ax)
    return fig


def scanned(png: Path) -> Path:
    im = Image.open(png).convert("L")
    im = im.filter(ImageFilter.GaussianBlur(0.9)).point(lambda p: min(255, int(p * 0.92 + 18)))
    out = png.with_name(png.stem + "_scan.png")
    im.convert("RGB").save(out)
    return out


if __name__ == "__main__":
    key = os.environ.get("MODEL_API_KEY") or sys.exit("MODEL_API_KEY not set")
    paths = []
    for name, fn in [("thin", variant_thin), ("thick", variant_thick), ("filled", variant_filled)]:
        fig = fn()
        p = OUT / f"v_{name}.png"
        fig.savefig(p, facecolor="white")
        plt.close(fig)
        paths.append(p)
    paths.append(scanned(OUT / "v_thick.png"))

    results = {}
    for p in paths:
        b64 = base64.b64encode(p.read_bytes()).decode()
        row = {}
        for phrase in ("tree", "circle", "text label"):
            boxes, dt, note = sam(key, b64, phrase)
            row[phrase] = {"n": len(boxes), "s": round(dt, 1), "c": [b["c"] for b in boxes][:6]}
        results[p.name] = row
        print(p.name, json.dumps(row))

    b64 = base64.b64encode((OUT / "v_thin.png").read_bytes()).decode()
    out, dt, usage = spark(key, b64)
    print(f"SPARK on v_thin in {dt:.1f}s, tokens={usage.get('total_tokens')}")
    print(json.dumps(out, ensure_ascii=False, indent=1))
    (OUT / "variants.json").write_text(json.dumps({"sam": results, "spark": out}, ensure_ascii=False, indent=1))
