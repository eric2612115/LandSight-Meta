"""SAM 3.1 on the coloured renders of the m4 site: one call per text concept, masks decoded, areas in m2 against the
answer key. Every call is recorded to tests/fixtures/sam/<sheet>__<prompt>.json; without --live the table is rebuilt
from those fixtures (offline).

  set -a; . ../Meta/.env; set +a; uv run python scripts/sam_probe.py --live   # real calls, one per prompt
  uv run python scripts/sam_probe.py                                          # offline: print the table again
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import shapely
from PIL import Image
from shapely.geometry import Polygon

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from landsight.dxf import load, metres_per_pixel, render_png, render_window  # noqa: E402
from landsight.meta import sam as samlib  # noqa: E402
from landsight.synth import LEVELS, generate  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "sam"
PROBES = [  # (image, prompt): one call each, never retried
    ("L-1_filled", "green circle"), ("L-1_filled", "tree canopy"), ("L-1_filled", "round green shape"),
    ("L-1_filled", "hatched area"), ("L-1_filled", "green rectangle"), ("L-1_filled", "lawn"),
    ("L-1_filled", "dark green strip"),
    ("L-3_filled", "grey area"), ("L-3_filled", "paving"), ("L-3_filled", "hatched rectangle"),
    ("L-3_filled", "beige area"),
    ("L-3_lines", "paving"),  # control: the same sheet as line work (the film's "0 masks" shot)
]


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def truth_objects(key: dict, sheet: str) -> list[dict]:
    out = []
    for o in key["objects"]:
        if o["sheet"] != sheet or not o.get("footprint"):
            continue
        poly = Polygon(o["footprint"])
        name = o["label"] if o["kind"] != "legend" else o["label"].replace("legend ", "legend: ")
        out.append({"kind": o["kind"], "label": name, "id": o["id"], "poly": poly,
                    "area_m2": o.get("area_m2") or round(poly.area, 2)})
    return out


def measure(masks, size, window, mpp, truths) -> list[dict]:
    w, h = size
    x0, _, _, y1 = window
    rows = []
    for m in masks:
        full = m.full(w, h)
        ys, xs = np.nonzero(full)
        mx, my = x0 + (xs + 0.5) * mpp[0], y1 - (ys + 0.5) * mpp[1]
        area = len(xs) * mpp[0] * mpp[1]
        overlaps = []
        for t in truths:
            n = int(shapely.contains_xy(t["poly"], mx, my).sum())
            if n:
                overlaps.append((n * mpp[0] * mpp[1], t))
        overlaps.sort(key=lambda p: -p[0])
        match = None
        if overlaps and overlaps[0][0] >= 0.5 * area:
            ov, t = overlaps[0]
            match = {"id": t["id"], "kind": t["kind"], "label": t["label"], "truth_m2": round(t["area_m2"], 2),
                     "overlap_m2": round(ov, 2), "iou": round(ov / (area + t["area_m2"] - ov), 3)}
        rows.append({"object_id": m.object_id, "box_px": list(m.box), "score": m.score, "area_px": len(xs),
                     "area_m2": round(area, 2),
                     "centroid_m": [round(float(mx.mean()), 2), round(float(my.mean()), 2)] if len(xs) else None,
                     "match": match, "touches": [t["id"] for _, t in overlaps[:6]]})
    return rows


def run_live(out: Path) -> None:
    key = generate(out, LEVELS["m4"], coloured=True)
    render_png(load(key["paths"]["L-3"]), out / "L-3_lines.png")
    FIXTURES.mkdir(parents=True, exist_ok=True)
    for image, prompt in PROBES:
        sheet = image.split("_")[0]
        png = (out / f"{image}.png").read_bytes()
        size = Image.open(out / f"{image}.png").size
        model = load(key["paths"][sheet])
        window, mpp = render_window(model), metres_per_pixel(model, size)
        try:
            text, seconds = samlib.call(png, prompt)
            error = None
        except Exception as e:  # recorded, not retried
            text, seconds, error = "", 0.0, str(e)[:300]
        masks, diags = samlib.decode(text)
        rec = {"image": f"{image}.png", "sheet": sheet, "prompt": prompt, "model": samlib.MODEL,
               "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "seconds": round(seconds, 2),
               "image_sha256": hashlib.sha256(png).hexdigest(), "image_px": list(size),
               "metres_per_pixel": [round(v, 6) for v in mpp], "window_m": list(window), "error": error,
               "n_masks": len(masks), "masks": measure(masks, size, window, mpp, truth_objects(key, sheet)),
               "diagnostics": diags, "raw_output_chars": len(text), "raw_output": text}
        (FIXTURES / f"{image}__{slug(prompt)}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1))
        print(f"{image:11s} {prompt!r:22s} masks={len(masks):2d} {seconds:5.1f} s {error or ''}", flush=True)


def table() -> str:
    lines = ["| image | prompt | masks | confidence | matched to | SAM m² | truth m² | error % | s |",
             "|---|---|---|---|---|---|---|---|---|"]
    for image, prompt in PROBES:
        f = FIXTURES / f"{image}__{slug(prompt)}.json"
        if not f.exists():
            lines.append(f"| {image} | {prompt} | not run | | | | | | |")
            continue
        rec = json.loads(f.read_text())
        masks = rec["masks"]
        scores = sorted({round(m["score"], 2) for m in masks if m["score"] is not None})
        conf = (f"{scores[0]:.2f}" if len(scores) == 1 else f"{scores[0]:.2f}–{scores[-1]:.2f}") if scores else "-"
        if not masks:
            lines.append(f"| {image} | {prompt} | 0 | - | - | - | - | - | {rec['seconds']} |")
            continue
        groups: dict[str, list[dict]] = {}
        for m in masks:
            g = m["match"]
            name = (f"{g['label']} ({g['kind']})" if g["kind"] != "legend" else g["label"]) if g else \
                f"no single object (touches {', '.join(x.split('/')[-1] for x in m['touches']) or 'nothing'})"
            groups.setdefault(name, []).append(m)
        first = True
        for name, ms in groups.items():
            sam_m2 = sum(m["area_m2"] for m in ms)
            ids = {m["match"]["id"] for m in ms if m["match"]}
            truth = sum(next(m["match"]["truth_m2"] for m in ms if m["match"] and m["match"]["id"] == i) for i in ids)
            n = f"{len(ms)}" if len(ms) == len(ids) or not ids else f"{len(ms)} on {len(ids)}"
            err = f"{(sam_m2 - truth) / truth * 100:+.1f}" if truth else "-"
            truth_s = f"{truth:.1f}" if truth else "-"
            lines.append(f"| {image if first else ''} | {prompt if first else ''} | {len(masks) if first else ''} | "
                         f"{conf if first else ''} | {n} × {name} | {sam_m2:.1f} | {truth_s} | {err} | "
                         f"{rec['seconds'] if first else ''} |")
            first = False
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="call SAM 3.1 once per prompt and record the fixtures")
    args = ap.parse_args()
    if args.live:
        with tempfile.TemporaryDirectory() as tmp:
            run_live(Path(tmp))
    print(table())
    return 0


if __name__ == "__main__":
    sys.exit(main())
