"""Spark writes SAM's prompt: Muse Spark reads the legend box of a coloured plan (meta.spark.read_legend) and names
each swatch's colour; this module turns those words into SAM 3.1 concept prompts, calls SAM with exactly those
prompts, and types each mask by the outline (or legend swatch) it lies in, never by the prompt.

  legend_crop(filled_png, legend_bounds_m, window_m)  -> the legend box cut out of the image SAM sees
  prompts_from_legend(rows)                           -> [{prompt, colour, kind, labels}] (+ the rows it skips)
  run_prompts(png, prompts, call)                     -> one SAM call per prompt: [{prompt, text, seconds, error}]
  type_masks(masks, outlines, window_m, mpp)          -> each mask with its area, the outline it lies in and its type

The labels are data: whatever the legend says ("透水磚" on the m4 site, "PV-1 PERMEABLE PAVERS" on the English one)
travels with the prompt. Shape nouns come from the entry kind, the colour from Spark: area -> "<colour> area",
symbol -> "<colour> circle" (plan tree symbols are round); lines are skipped, because thin bands come back poorly
(docs/research/sam-probe.md: +33% on a 10 px hedge band) and hedges are counted along their line by geometry (D-20).
"""

from __future__ import annotations

import io
import re

import numpy as np
import shapely
from PIL import Image

SHAPE_NOUN = {"area": "area", "symbol": "circle"}
SKIP_WHY = {"line": "a line or strip: hedges are measured along their line by geometry, not by SAM (D-20)"}
MIN_INSIDE = 0.5  # a mask takes the type of the outline holding at least half its pixels


def colour_word(text: str) -> str:
    """Spark's colour word as a SAM-ready phrase head: lower case, letters and spaces, at most three words."""
    words = re.sub(r"[^a-z ]+", " ", (text or "").lower()).split()
    return " ".join(words[:3])


def prompts_from_legend(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """SAM prompts from Spark's legend read: one per distinct (colour, shape); returns (prompts, skipped rows)."""
    prompts: dict[str, dict] = {}
    skipped = []
    for row in rows or []:
        kind, colour = row.get("kind", ""), colour_word(row.get("swatch_colour_word", ""))
        if kind not in SHAPE_NOUN or not colour:
            skipped.append(row | {"why": SKIP_WHY.get(kind, "no colour word to prompt with")})
            continue
        phrase = f"{colour} {SHAPE_NOUN[kind]}"
        p = prompts.setdefault(phrase, {"prompt": phrase, "colour": colour, "kind": kind, "labels": []})
        p["labels"].append(row.get("label", ""))
    return list(prompts.values()), skipped


def legend_crop(filled_png: bytes, legend_bounds_m, window_m, pad_px: int = 6) -> tuple[bytes, list[int]]:
    """The legend box cut out of a filled render (the exact pixels SAM is prompted on): (PNG, [l, t, r, b] px)."""
    im = Image.open(io.BytesIO(filled_png))
    w, h = im.size
    x0, y0, x1, y1 = window_m
    mx, my = (x1 - x0) / w, (y1 - y0) / h
    bx0, by0, bx1, by1 = legend_bounds_m
    box = [max(0, int((bx0 - x0) / mx) - pad_px), max(0, int((y1 - by1) / my) - pad_px),
           min(w, int((bx1 - x0) / mx) + pad_px), min(h, int((y1 - by0) / my) + pad_px)]
    buf = io.BytesIO()
    im.crop(tuple(box)).save(buf, format="PNG")
    return buf.getvalue(), box


def run_prompts(png: bytes, prompts: list[dict], call) -> list[dict]:
    """One SAM call per prompt, exactly the phrase written (call(png, phrase) -> (text, seconds)); never retried."""
    out = []
    for p in prompts:
        try:
            text, seconds = call(png, p["prompt"])
            error = None
        except Exception as e:  # recorded, not retried
            text, seconds, error = "", 0.0, str(e)[:300]
        out.append({"prompt": p["prompt"], "text": text, "seconds": round(seconds, 2), "error": error})
    return out


def type_masks(masks, outlines: list[dict], window_m, mpp) -> list[dict]:
    """Each SAM mask (meta.sam.Mask, box-local raster) in drawing metres: its area, and the outline holding at least
    half of it. `outlines`: [{object_id, label, kind, polygon (shapely, metres), excluded}]. A mask in a legend swatch
    is typed "legend" and excluded; a mask in no single outline stays untyped."""
    x0, _, _, y1 = window_m
    mx, my = mpp
    out = []
    for m in masks:
        ys, xs = np.nonzero(m.raster)
        gx, gy = x0 + (xs + m.box[0] + 0.5) * mx, y1 - (ys + m.box[1] + 0.5) * my
        area = len(xs) * mx * my
        best, best_n = None, 0
        for o in outlines:
            n = int(shapely.contains_xy(o["polygon"], gx, gy).sum())
            if n > best_n:
                best, best_n = o, n
        match = best if best is not None and best_n * mx * my >= MIN_INSIDE * area else None
        out.append({"box_px": list(m.box), "score": m.score, "area_m2": round(area, 2),
                    "object_id": match["object_id"] if match else None,
                    "type": (match.get("label") or match.get("kind")) if match else None,
                    "excluded": bool(match and match.get("excluded"))})
    return out
