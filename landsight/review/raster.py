"""SAM 3.1 on a package file that has no CAD behind it (gate run 2): the coloured Presentation Plan, a raster PDF page.

Muse Spark reads the page once (spark.read_raster_plan): every area type and plant symbol with the colour word SAM
can be prompted with, the legend box and the scale bar (normalised points). The scale bar is then measured in the
pixels themselves (the longest dark run on the bar's row between Spark's two ends), so metres per pixel come from
the drawing, not from a guess. SAM 3.1 is prompted with exactly Spark's words ('<colour> area', '<colour> circle').
Colour words overlap (a hatched green bed and a light green lawn answer both 'green area' and 'light green area'), so
the masks of all prompts are pooled into regions (IoU ≥ 0.8 is one region) and each region is typed the way a person
reads the plan: by the label Spark saw written inside it, else by the prompt SAM scored highest for it (never by a CAD
outline: there is none). Masks inside the legend box are a key and are dropped. Each label's regions become a take-off
item flagged for a person to confirm, set against the DXF item of the same name. Nothing here counts until it is
confirmed."""

from __future__ import annotations

import hashlib
import io

import numpy as np
from PIL import Image

from landsight.checks.base import Check
from landsight.meta.sam_plan import prompts_from_legend

COLOURED_SHARE = 0.02  # a raster page is a coloured render when this share of its pixels is saturated (S > 40/255)
CLOSE_PCT = 10.0  # SAM against the DXF within this: info; beyond it: worth a look (still info: the CAD governs)
_DECODED: dict[str, list] = {}


def saturated_share(png: bytes) -> float:
    im = Image.open(io.BytesIO(png)).convert("RGB")
    im.thumbnail((600, 600))
    return float((np.asarray(im.convert("HSV"))[..., 1] > 40).mean())


def bar_pixels(png: bytes, bar: dict) -> tuple[float, list[int]] | None:
    """The scale bar's length in pixels: the longest run of dark pixels on a row within ±2% of Spark's y that overlaps
    Spark's ends. Returns (length_px, [x0, x1, y]) or None."""
    im = np.asarray(Image.open(io.BytesIO(png)).convert("L"))
    h, w = im.shape
    xs, xe, yc = (bar.get(k) or 0 for k in ("x_start", "x_end", "y"))
    if not (xe > xs > -1 and yc > 0):
        return None
    x0, x1, y = xs / 1000 * w, xe / 1000 * w, yc / 1000 * h
    best = None
    for row in range(max(0, int(y - 0.02 * h)), min(h, int(y + 0.02 * h) + 1)):
        dark = im[row] < 100
        runs, start = [], None
        for x, d in enumerate(dark):
            if d and start is None:
                start = x
            elif not d and start is not None:
                runs.append((start, x))
                start = None
        if start is not None:
            runs.append((start, w))
        for a, b in runs:
            if b - a > 0.5 * (x1 - x0) and a < x0 + 0.1 * w and b > x1 - 0.1 * w:
                if best is None or b - a > best[1] - best[0]:
                    best = (a, b, row)
    if best is None:
        return None
    return float(best[1] - best[0]), [int(best[0]), int(best[1]), int(best[2])]


def _kind(label: str, book) -> str:
    c = book.by_name(label) if book is not None and label else None
    if c is not None and getattr(c, "kind", None):
        return c.kind
    u = (label or "").upper()
    if "LAWN" in u or "TURF" in u or "GRASS" in u and "PAVER" not in u:
        return "lawn"
    if any(w in u for w in ("PAVER", "PAVING", "AGGREGATE", "CONCRETE")):
        return "paving"
    if any(w in u for w in ("LANE", "ROAD", "DRIVEWAY")):
        return "fire_lane"
    return "shrub_bed"


def _name(label: str, book) -> tuple[str, str | None]:
    c = book.by_name(label) if book is not None and label else None
    if c is not None:
        return c.name, c.code
    words = (label or "").split()
    if len(words) > 1 and len(words[0]) <= 3 and words[0].isupper():
        return " ".join(words[1:]).capitalize(), words[0]
    return (label or "").capitalize(), None


def _iou(a, b) -> float:
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    inter = w * h
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter)


def measure(ctx, rasters: list, spark, sam, notes: list[str]) -> tuple[list[dict], list[Check]]:
    """Items and checks from every coloured raster plan page. `rasters`: [(file record, page, png, key)]."""
    from landsight.meta.sam import decode
    from landsight.review.colour import SamMissing

    items, checks = [], []
    for f, pg, png, key in rasters:
        a = f.spark or {}
        if a.get("kind") not in (None, "plan") or saturated_share(png) <= COLOURED_SHARE:
            continue
        sheet_id = f"{f.file_id}-p{pg.index + 1}"
        try:
            read = spark.read_raster_plan(png, key + ":plan")
        except Exception as e:  # noqa: BLE001 - no recording or a failed call: this page stays unmeasured
            notes.append(f"{sheet_id}: read_raster_plan: {type(e).__name__}: {e}")
            continue
        bar = read.get("scale_bar") or {}
        measured = bar_pixels(png, bar)
        w, h = Image.open(io.BytesIO(png)).size
        if measured is None or not bar.get("distance_m"):
            notes.append(f"{sheet_id}: no scale bar measured; areas not computed")
            continue
        px, bar_px = measured
        mpp = float(bar["distance_m"]) / px
        lb = read.get("legend_box") or {}
        legend_px = [lb.get("x0", 0) / 1000 * w, lb.get("y0", 0) / 1000 * h, lb.get("x1", 0) / 1000 * w,
                     lb.get("y1", 0) / 1000 * h]
        entries = read.get("entries") or []
        prompts, skipped = prompts_from_legend(entries)
        file_ids = [f.file_id]
        checks.append(Check(
            "area", f"Muse Spark read {f.name} (raster, no CAD): {len(entries)} area types, scale bar "
            f"{bar['distance_m']:g} m = {px:.0f} px ({mpp:.4f} m/px)", "info", ["spark", "geometry"],
            f"Muse Spark named each filled type with a colour word and found the legend box and the scale bar "
            f"({read.get('why', '')}); the bar was then measured in the page's own pixels between the ends Spark gave: "
            f"{px:.0f} px for {bar['distance_m']:g} m. Title block scale as written: {read.get('title_scale') or '-'}. "
            "SAM 3.1 is prompted with exactly Spark's words.",
            {"file_ids": file_ids},
            numbers={"entries": len(entries), "prompts": len(prompts), "bar_m": bar["distance_m"], "bar_px": round(px, 1),
                     "m_per_px": round(mpp, 5), "confidence": read.get("confidence")},
            extra={"ok": True, "raster_sheet_id": sheet_id, "prompt_source": "spark_raster_plan",
                   "legend": [{"label": e.get("label"), "colour": e.get("swatch_colour_word"), "kind": e.get("kind"),
                               "where": e.get("where")} for e in entries],
                   "prompts": [{"prompt": q["prompt"], "labels": q["labels"], "kind": q["kind"]} for q in prompts],
                   "scale_bar_px": bar_px, "legend_box_px": [round(v) for v in legend_px]}))
        drawn = {it["label"].lower(): it for it in ctx.items if it.get("_on_drawing", True)}
        regions: list[dict] = []  # {mask, cands: [(score, prompt)]}
        dropped = 0
        for q in prompts:
            q["labels"] = list(dict.fromkeys(q["labels"]))
            try:
                rec = sam.call(png, q["prompt"], f"{f.name} p{pg.index + 1}", sheet=sheet_id,
                               prompt_source="spark_raster_plan", legend={"labels": q["labels"], "kind": q["kind"]})
            except SamMissing as e:
                notes.append(f"{sheet_id}: {e}")
                continue
            text = rec.get("raw_output") or ""
            k = hashlib.sha256(text.encode()).hexdigest()
            if k not in _DECODED:
                _DECODED[k] = decode(text)[0]
            for m in _DECODED[k]:
                cx, cy = (m.box[0] + m.box[2]) / 2, (m.box[1] + m.box[3]) / 2
                if legend_px[2] > legend_px[0] and legend_px[0] <= cx <= legend_px[2] and legend_px[1] <= cy <= legend_px[3]:
                    dropped += 1
                    continue
                same = next((r for r in regions if _iou(r["mask"].box, m.box) >= 0.8), None)
                if same is None:
                    regions.append({"mask": m, "cands": [(m.score or 0.0, q["prompt"])]})
                else:
                    same["cands"].append((m.score or 0.0, q["prompt"]))
        by_prompt = {q["prompt"]: q for q in prompts}
        plan_labels = [(e["label"], e.get("x") or 0, e.get("y") or 0) for e in entries
                       if e.get("where") == "plan" and e.get("kind") == "area" and (e.get("x") or e.get("y"))]
        typed: dict[str, dict] = {}  # label -> {kind, prompt, masks, how}
        for r in regions:
            m = r["mask"]
            label, how = None, ""
            for lab, x, y in plan_labels:
                px_, py_ = int(x / 1000 * w) - m.box[0], int(y / 1000 * h) - m.box[1]
                if 0 <= py_ < m.raster.shape[0] and 0 <= px_ < m.raster.shape[1] and m.raster[py_, px_]:
                    label, how = lab, "label written inside it"
                    break
            score, prompt = max(r["cands"])
            q = by_prompt[prompt]
            if label is None:
                label, how = q["labels"][0] if len(q["labels"]) == 1 else " or ".join(q["labels"]), "highest SAM score"
                kind_q = q["kind"]
            else:
                kind_q = "area"
            t = typed.setdefault(label, {"kind": kind_q, "prompts": set(), "masks": [], "how": set()})
            t["prompts"].add(prompt)
            t["masks"].append(m)
            t["how"].add(how)
        for label, t in typed.items():
            kept = t["masks"]
            q = {"prompt": " / ".join(sorted(t["prompts"])), "kind": t["kind"]}
            area = sum(m.area_px for m in kept) * mpp * mpp
            name, code = _name(label, ctx.book)
            kind = "tree" if q["kind"] == "symbol" else _kind(label, ctx.book)
            twin = drawn.get(name.lower())
            unit = "plant" if kind == "tree" else "m2"
            value = len(kept) if kind == "tree" else round(area, 1)
            dxf = None if twin is None else (twin.get("proposed_count") if twin.get("proposed_count") is not None
                                              else twin.get("geometry_count"))
            symbols = zone = None
            gov = [d.sheet_id for d in ctx.sheets if d.counted and d.source == "dxf"]
            if kind == "tree":  # a picture shows every symbol drawn: the counted trees, the excluded ones, the existing
                objs = [o for sid in gov for o in ctx.objects.get(sid, []) if o["kind"] in ("tree", "existing_tree")]
                symbols = {"drawn": len(objs), "counted": dxf,
                           "excluded": sum(1 for o in objs if o["kind"] == "tree" and o.get("excluded")),
                           "existing": sum(1 for o in objs if o["kind"] == "existing_tree")}
                dxf = symbols["drawn"] or dxf
            elif twin is None and kind == "fire_lane":
                z = next((o for sid in gov for o in ctx.objects.get(sid, []) if o["kind"] == "fire_lane"), None)
                if z is not None and z.get("area_m2"):
                    zone, dxf = z, z["area_m2"]
            diff = round((value - float(dxf)) / float(dxf) * 100, 1) if dxf else None
            item_id = f"S-{len(items) + 1:02d}"
            boxes = [{"box_px": list(m.box), "score": round(m.score, 3) if m.score is not None else None,
                      "area_m2": round(m.area_px * mpp * mpp, 2)} for m in kept]
            items.append({
                "item_id": item_id, "kind": kind, "label": name, "species_code": code,
                "unit": unit, "geometry_count": None, "spark_count": None, "schedule_count": None, "label_count": None,
                "agreed": False, "quote_count": None, "proposed_count": value, "object_ids": [], "sheet_ids": [],
                "confirmed": False, "source": "sam",
                "flagged_reason": f"measured by SAM 3.1 on {f.name} page {pg.index + 1} (a raster page, no CAD) with Muse "
                                  f"Spark's words '{q['prompt']}'; a person confirms before it counts",
                "sam": {"raster_sheet_id": sheet_id, "file_id": f.file_id, "prompt": q["prompt"],
                        "prompt_source": "spark_raster_plan", "masks": boxes, "typed_by": sorted(t["how"]),
                        "m_per_px": round(mpp, 5), "area_m2": round(area, 2)},
                "against": ({"item_id": twin["item_id"] if twin else None, "label": twin["label"] if twin else
                             (zone or {}).get("label"), "dxf": dxf, "sam": value, "diff_pct": diff, "unit": unit,
                             **({"symbols": symbols} if symbols else {})} if (twin or zone) else None),
                "_on_drawing": False})
            what = (f"{len(kept)} {name} symbols" if kind == "tree" else f"{name} {area:,.1f} m²")
            if symbols:
                vs = (f" vs {symbols['drawn']} tree symbols on the DXF ({symbols['counted']:g} counted, "
                      f"{symbols['excluded']} excluded, {symbols['existing']} existing)")
            elif zone is not None:
                vs = f" vs the DXF's {zone['label'].lower()} {dxf:g} m² ({diff:+.1f}%; a tree is drawn over part of it)"
            else:
                vs = (f" vs the DXF's {dxf:g} m² ({diff:+.1f}%)" if diff is not None else " (no DXF item of that name)")
            checks.append(Check(
                "area", f"SAM 3.1 on {f.name} (raster): {what}{vs} — {item_id} awaits confirmation", "info", ["sam", "spark"],
                f"SAM 3.1, prompted with Muse Spark's words ('{q['prompt']}'), found {len(kept)} region"
                f"{'s' if len(kept) != 1 else ''} typed {label!r} by the {' and '.join(sorted(t['how']))}; masks inside "
                f"the legend box ({dropped} in all) were dropped as a key. Area = mask pixels × ({mpp:.4f} m/px)², the "
                f"scale from the page's own bar. The DXF governs; this measures a file the CAD does not cover"
                + (f", and differs from it by {diff:+.1f}%" if diff is not None and abs(diff) > CLOSE_PCT else "")
                + ". Counted only after a person confirms it.",
                {"file_ids": file_ids},
                numbers={"sam": value, "dxf": dxf, "diff_pct": diff, "masks": len(kept), "legend_dropped": dropped,
                         "m_per_px": round(mpp, 5)},
                extra={"item_ids": [item_id] + ([twin["item_id"]] if twin else []), "prompt_source": "spark_raster_plan",
                       "raster_sheet_id": sheet_id, "ok": diff is not None and abs(diff) <= CLOSE_PCT}))
    return items, checks
