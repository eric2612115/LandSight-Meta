"""The SAM 3.1 beat of animatic v11: the real masks on the coloured Presentation Plan, decoded from the recordings.

Renders the plan's page as the run does (landsight.ingest.pdf.render), picks the recordings made on exactly that image
(tests/fixtures/review/sam/presentation-plan-colour-pdf-p1__<prompt>__<sha256[:8]>.json: SAM 3.1's raw answers,
decoded with meta_sam_parser through landsight.meta.sam.decode), and reads the run's raster checks in
frontend-mock/run.json for the drawings' figures and the page's scale. For each row it keeps the masks outside the
legend box (every symbol for a count; for an area, the mask nearest the run's figure), measures them (pixels × the
scale), traces each outline, samples the plan colour under it, and writes demo/film/src/scenes/sam-v11.json.

    PYTHONPATH=. uv run python demo/film/scripts/sam-v11-prepare.py   (from the repo root)
"""

from __future__ import annotations

import json
from pathlib import Path

import contourpy
import numpy as np
from PIL import Image
from shapely.geometry import LinearRing

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from landsight.ingest import pdf as P  # noqa: E402
from landsight.meta.sam import decode  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
FILM = REPO / "demo" / "film"
SAM = REPO / "tests" / "fixtures" / "review" / "sam"
PDF = REPO / "samples" / "greenfield" / "Greenfield Residences — Landscape Package" / "Drawings" / "PDF" / "Presentation Plan (Colour).pdf"
LEGEND_X = 1500  # source px: masks whose box starts right of this are the legend's key swatches
# the rows in the order they fill: prompt file · the run check's label · what it is (Muse Spark's legend reading) ·
# the fill the film gives it (a deeper cut of the plan's own colour, so each category reads apart)
ROWS = [
    ("green-circle", "Camphor", "Camphor trees", "symbols", "#2f8f46"),
    ("light-green-area", "Azalea", "Azalea beds", "area", "#5fa83a"),
    ("light-green-area", "Lawn", "Lawn", "area", "#a9cf4c"),
    ("grey-area", "Fire truck access lane", "Fire-truck lane", "area", "#7d8794"),
]


def outline(mask: np.ndarray) -> list[list[list[float]]]:
    z = np.pad(mask.astype(float), 1)
    rings = []
    for ln in contourpy.contour_generator(z=z, name="serial").lines(0.5):
        if len(ln) < 4:
            continue
        r = LinearRing(ln).simplify(0.8)
        pts = np.asarray(r.coords)[:-1] - 1.0
        rings.append([[round(float(x), 1), round(float(y), 1)] for x, y in pts])
    return rings


def main() -> None:
    import hashlib
    import io

    png = P.render(PDF, 0)
    sha = hashlib.sha256(png).hexdigest()[:8]
    img = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))
    H, W = img.shape[:2]
    run = json.loads((REPO / "frontend-mock" / "run.json").read_text())
    checks = [c for c in run["checks"] if c.get("raster_sheet_id") == "F-26-p1"]
    rows = []
    for prompt, label, what, kind, colour in ROWS:
        exact = SAM / f"presentation-plan-colour-pdf-p1__{prompt}__{sha}.json"
        if exact.exists():
            rec = json.loads(exact.read_text())
        else:  # the samples were re-rendered after the recording: the newest recording of the same page size
            same = [f for f in SAM.glob(f"presentation-plan-colour-pdf-p1__{prompt}__*.json") if json.loads(f.read_text())["image_px"] == [W, H]]
            f = max(same, key=lambda f: f.stat().st_mtime)
            rec = json.loads(f.read_text())
            print(f"note: no recording on {sha} for '{prompt}'; using {f.name}")
        masks, diag = decode(rec["raw_output"])
        assert not diag, diag
        masks = [m for m in masks if m.box[0] < LEGEND_X]
        check = next(c for c in checks if label.lower() in c["title"].lower())
        n = check["numbers"]
        mpp2 = n["m_per_px"] ** 2
        if kind == "area":
            masks = [min(masks, key=lambda m: abs(m.area_px * mpp2 - n["sam"]))]
        full = np.zeros((H, W), dtype=bool)
        polys = []
        for m in masks:
            f = m.full(W, H)
            full |= f
            l, t, r, b = m.box
            for ring in outline(f[t - 1 : b + 1, l - 1 : r + 1]):
                polys.append([[x + l - 1, y + t - 1] for x, y in ring])
        plan_rgb = tuple(float(v) for v in np.median(img[full], axis=0))
        rows.append({
            "prompt": rec["prompt"],
            "what": what,
            "kind": kind,
            "masks": len(masks),
            "sam": len(masks) if kind == "symbols" else round(float(full.sum()) * mpp2, 1),
            "drawings": n["dxf"],
            "diff_pct": round(100 * ((len(masks) if kind == "symbols" else float(full.sum()) * mpp2) / n["dxf"] - 1), 1),
            "run_sam": n["sam"],
            "plan_colour": "#%02x%02x%02x" % tuple(round(v) for v in plan_rgb),
            "colour": colour,
            "area_m2": round(float(full.sum()) * mpp2, 1),
            "polys": polys,
            "check": check["check_id"],
        })
        r = rows[-1]
        print(f"{what}: {len(masks)} masks, SAM {r['sam']} (the run said {n['sam']}) vs {n['dxf']} ({r['diff_pct']}%), {sum(len(p) for p in polys)} points")
    out = {"image": "v11/sheets/F-26-p1.png", "image_sha256": sha, "w": W, "h": H, "crop": [60, 560, 1340, 1500], "m_per_px": checks[0]["numbers"]["m_per_px"], "rows": rows}
    (FILM / "src" / "scenes" / "sam-v11.json").write_text(json.dumps(out) + "\n")


if __name__ == "__main__":
    main()
