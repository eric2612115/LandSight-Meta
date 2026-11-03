"""Traces the Landsight wordmark (rendered in Inter 600 by logo-v11.mjs) into one SVG path, so the logo files carry
no live text. Reads the high-resolution render (black on white) and its metrics, writes src/logo/wordmark.json:
{d, width, ascent, descent, baseline} in units where the font size is 100.

    uv run python demo/film/scripts/trace-wordmark.py <render.png> <metrics.json>
"""

import json
import sys
from pathlib import Path

import contourpy
import numpy as np
from PIL import Image
from shapely.geometry import LinearRing

png, metrics = sys.argv[1], json.loads(Path(sys.argv[2]).read_text())
img = np.asarray(Image.open(png).convert("L"), dtype=float) / 255.0
ink = 1.0 - img  # 1 inside the glyphs
ink = np.pad(ink, 2)
gen = contourpy.contour_generator(z=ink, name="serial")
lines = gen.lines(0.5)
scale = 100.0 / metrics["font_px"]
rings = []
for ln in lines:
    if len(ln) < 4:
        continue
    ring = LinearRing(ln).simplify(0.35)  # px at font size 1000: invisible
    pts = np.asarray(ring.coords)[:-1]
    pts = (pts - 2.0) * scale  # undo the pad; to font-size-100 units
    pts[:, 1] -= metrics["baseline_px"] * scale  # y = 0 on the baseline
    rings.append(pts)
allp = np.vstack(rings)
x0 = allp[:, 0].min()  # the ink's left edge at x = 0
parts = ["M" + "L".join(f"{x - x0:.2f} {y:.2f}" for x, y in r) + "Z" for r in rings]
out = {
    "d": "".join(parts),
    "width": round(float(allp[:, 0].max() - x0), 2),
    "ascent": round(float(-allp[:, 1].min()), 2),
    "descent": round(float(allp[:, 1].max()), 2),
    "note": "Inter 600, letter-spacing -2.5 at size 100, traced from a 1000 px render; y = 0 is the baseline.",
}
dest = Path(__file__).resolve().parent.parent / "src" / "logo" / "wordmark.json"
dest.write_text(json.dumps(out) + "\n")
print(f"{len(parts)} contours, {len(out['d'])} chars → {dest}")
