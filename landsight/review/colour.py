"""Lines to colour, on the package (demo/SCRIPT.md beat 7; D-35, D-36 on the m4 site): for each counted DXF plan with a
legend box, Muse Spark reads the legend of the coloured render and names each swatch's colour; SAM 3.1 is prompted with
exactly those words on the coloured render (landsight.meta.sam_plan), and the first prompt is also run on the plain line
work as the controlled test (one variable changes: the image). Each mask takes the type of the outline it lies in.

The CAD geometry governs every quantity here; SAM's areas are a cross-check (what the colour path would give on a
coloured PDF with no CAD), so these checks are `info`, and those that agree with the CAD carry `ok`.

SAM answers are recorded to and replayed from tests/fixtures/review/sam/ (key: image hash + prompt), like the review's
Muse Spark answers: "fixtures" replays (a missing recording is noted, never invented), "live" asks only what is not yet
recorded and records it. The API key is read from MODEL_API_KEY and never logged."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from shapely.geometry import Polygon

from landsight.checks.base import Check, obj_ref
from landsight.meta.sam_plan import legend_crop, prompts_from_legend, type_masks
from landsight.review.spark import FIXTURES

SAM_FIXTURES = FIXTURES / "sam"
SAM_MODEL = "sam-3.1"
NOT_OUTLINES = {"boundary", "revision_cloud", "title_block", "scale_bar", "match_line", "schedule"}
AGREE_PCT = 2.0


class SamMissing(LookupError):
    pass


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


class ReviewSam:
    """Record / replay SAM 3.1 for the review; `log` holds one entry per answer used."""

    def __init__(self, mode: str = "fixtures", fixture_dir: Path | str = SAM_FIXTURES, resume: bool = True,
                 fresh: int = 0):
        self.mode, self.dir = mode, Path(fixture_dir)
        # live only: re-ask this many recorded prompts (-1: all); answers go to fresh/, the recordings stay as they are
        self.fresh_left = (-1 if not resume else fresh) if mode == "live" else 0
        self.log: list[dict] = []
        self.recs: dict[tuple[str, str], dict] = {}
        if self.dir.is_dir():
            for f in sorted(self.dir.glob("*.json")):
                try:
                    rec = json.loads(f.read_text())
                except ValueError:
                    continue
                if rec.get("image_sha256") and rec.get("prompt") is not None:
                    rec["fixture"] = f.name
                    self.recs[(rec["image_sha256"], rec["prompt"])] = rec

    def call(self, png: bytes, prompt: str, image: str, **extra) -> dict:
        sha = hashlib.sha256(png).hexdigest()
        rec = self.recs.get((sha, prompt))
        fresh = (rec is not None and self.mode == "live" and not rec.get("_fresh") and self.fresh_left != 0)
        if fresh and self.fresh_left > 0:
            self.fresh_left -= 1
        if rec is None and self.mode != "live":
            raise SamMissing(f"no SAM recording for {prompt!r} on {image} ({sha[:12]})")
        if rec is None or fresh:
            from landsight.meta import sam as samlib

            try:
                text, seconds, env = samlib.call_envelope(png, prompt)
                error = None
            except Exception as e:  # recorded, never retried
                text, seconds, error, env = "", 0.0, str(e)[:300], {}
            size = Image.open(io.BytesIO(png)).size
            stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
            new = {"image": image, "prompt": prompt, "model": SAM_MODEL, "recorded_at": stamp,
                   "seconds": round(seconds, 2), "image_sha256": sha, "image_px": list(size), "error": error,
                   "raw_output_chars": len(text), "raw_output": text, "response_id": env.get("id"), "envelope": env,
                   **extra}
            name = f"{_slug(image)}__{_slug(prompt)}__{sha[:8]}.json"
            if fresh:
                base = f"fresh/{name[:-5]}__{stamp.replace(':', '').replace('-', '')[:15]}"
                name, n = f"{base}.json", 2
                while (self.dir / name).exists():
                    name, n = f"{base}_{n}.json", n + 1
                new |= {"fresh_of": rec["fixture"], "same_as_recorded": text == rec.get("raw_output")}
            (self.dir / name).parent.mkdir(parents=True, exist_ok=True)
            (self.dir / name).write_text(json.dumps(new, ensure_ascii=False, indent=1))
            new["fixture"], new["_live"], new["_fresh"] = name, True, True
            self.recs[(sha, prompt)] = rec = new
        live = rec.pop("_live", False)
        self.log.append({"call": f'"{prompt}" on {image}', "model": SAM_MODEL, "seconds": rec.get("seconds") or 0.0,
                         "recorded": not live, "prompt_source": rec.get("prompt_source", ""), "prompt": prompt,
                         "fixture": str(self.dir / rec["fixture"]) if rec.get("fixture") else "",
                         "recorded_at": rec.get("recorded_at"), "error": rec.get("error"),
                         "response": rec.get("raw_output", ""), "image": image, "kind": "sam",
                         "response_id": rec.get("response_id"), "fresh_of": rec.get("fresh_of") if live else None})
        return rec

    @property
    def calls(self) -> int:
        return len(self.log)

    @property
    def seconds(self) -> float:
        return round(sum(e["seconds"] for e in self.log), 2)

    @property
    def recorded(self) -> bool:
        return all(e["recorded"] for e in self.log)


def mode_for(spark_mode: str) -> str:
    return "live" if spark_mode == "live" and os.environ.get("MODEL_API_KEY") else "fixtures"


def _bounds(outline) -> tuple[float, float, float, float]:
    xs, ys = [p[0] for p in outline], [p[1] for p in outline]
    return min(xs), min(ys), max(xs), max(ys)


_DECODED: dict[str, list] = {}  # sha256 of a SAM answer -> its decoded masks (the parser is slow; answers are fixed)


def _masks(rec: dict, outlines, window, mpp) -> list[dict]:
    from landsight.meta.sam import decode

    text = rec.get("raw_output") or ""
    key = hashlib.sha256(text.encode()).hexdigest()
    if key not in _DECODED:
        _DECODED[key] = decode(text)[0]
    return type_masks(_DECODED[key], outlines, window, mpp)


def colour(ctx, spark, sam: ReviewSam, notes: list[str]) -> tuple[list[Check], dict[str, bytes]]:
    """The colour checks for every counted plan with a legend box, and the coloured renders by sheet id."""
    from landsight.dxf import metres_per_pixel, render_png, render_window

    checks: list[Check] = []
    renders: dict[str, bytes] = {}
    items = {it["item_id"]: it for it in ctx.items}
    for d in ctx.sheets:
        if d.source != "dxf" or not d.counted or d.kind != "plan":
            continue
        objs = ctx.objects.get(d.sheet_id, [])
        box = next((o for o in objs if o["kind"] == "legend" and o.get("label") == "legend box"), None)
        if box is None:
            continue
        filled = render_png(d.model, filled=True)
        renders[d.sheet_id] = filled
        window = render_window(d.model)
        crop, crop_px = legend_crop(filled, _bounds(box["outline"]), window)
        before = len(spark.log)
        try:
            rows = spark.read_legend(crop, key=f"{d.model.signature()}:legend")
        except Exception as e:  # noqa: BLE001 - a missing recording or a failed call: no colour checks for this sheet
            notes.append(f"{d.sheet_id}: read_legend: {type(e).__name__}: {e}")
            continue
        read_s = spark.log[-1].get("seconds") if len(spark.log) > before else None
        prompts, skipped = prompts_from_legend(rows)
        size = Image.open(io.BytesIO(filled)).size
        mpp = metres_per_pixel(d.model, size)
        outlines = [{"object_id": o["object_id"], "label": o.get("label"), "kind": o["kind"],
                     "polygon": Polygon(o["outline"]), "excluded": bool(o.get("excluded"))}
                    for o in sorted(objs, key=lambda o: o.get("area_m2") or 1e9)
                    if len(o.get("outline") or []) >= 3 and o["kind"] not in NOT_OUTLINES and o is not box]
        outlines = [o for o in outlines if o["polygon"].is_valid and o["polygon"].area > 0]
        calls = []
        for p in prompts:
            try:
                rec = sam.call(filled, p["prompt"], f"{d.number} filled", sheet=d.sheet_id, prompt_source="spark_legend",
                               legend={"colour": p["colour"], "kind": p["kind"], "labels": p["labels"],
                                       "crop_px": crop_px, "spark_call": "read_legend"})
            except SamMissing as e:
                notes.append(f"{d.sheet_id}: {e}")
                continue
            calls.append({"prompt": p["prompt"], "kind": p["kind"], "labels": p["labels"], "seconds": rec.get("seconds"),
                          "recorded_at": rec.get("recorded_at"), "error": rec.get("error"),
                          "masks": _masks(rec, outlines, window, mpp)})
        if not calls:
            continue
        sid, num = d.sheet_id, d.number
        files = [d.file_id]
        pairs = " · ".join(f"{r.get('swatch_colour_word')} = {r.get('label')}" for r in rows)
        checks.append(Check(
            "area", f"Muse Spark read the {num} legend: {pairs}", "info", ["spark"],
            "Muse Spark looked at the legend box of the coloured render and named each swatch's colour; SAM 3.1 is "
            "prompted with exactly those words (an area swatch becomes '<colour> area', a tree symbol '<colour> circle'); "
            "line entries are left to geometry.",
            {"sheet_ids": [sid], "file_ids": files, "object_ids": [obj_ref(sid, box["object_id"])]},
            numbers={"entries": len(rows), "prompts": len(prompts), "skipped": len(skipped), "seconds": read_s},
            extra={"ok": True, "prompt_source": "spark_legend", "crop_px": crop_px,
                   "legend": [{"colour": r.get("swatch_colour_word"), "label": r.get("label"), "kind": r.get("kind")}
                              for r in rows],
                   "prompts": [{"prompt": q["prompt"], "labels": q["labels"], "kind": q["kind"]} for q in prompts],
                   "skipped": [{"label": x.get("label", ""), "kind": x.get("kind"), "why": x["why"]} for x in skipped]}))
        first = next((c for c in calls if c["kind"] == "area"), calls[0])
        control = None
        try:
            rec = sam.call(d.png, first["prompt"], f"{num} lines", sheet=sid, prompt_source="spark_legend",
                           control_of=f"{num} filled")
            on_lines = _masks(rec, outlines, window, mpp)
            control = {"prompt": first["prompt"], "masks_on_lines": len(on_lines), "masks_on_colour": len(first["masks"]),
                       "colour_prompt_source": "spark_legend", "sheet_id": sid, "seconds": rec.get("seconds")}
            checks.append(Check(
                "area", f"SAM 3.1 on the line drawing of {num}: {len(on_lines)} masks for '{first['prompt']}'; on the "
                f"coloured render the same words find {len(first['masks'])}", "info", ["sam"],
                f"The controlled test: the same words Muse Spark wrote, '{first['prompt']}', on the plain line work and on "
                "the coloured render of the same sheet; only the image changes. SAM 3.1 segments filled regions, not "
                "line work.",
                {"sheet_ids": [sid], "file_ids": files},
                numbers={"masks": len(on_lines), "masks_on_colour": len(first["masks"]), "prompt": first["prompt"],
                         "seconds": rec.get("seconds")},
                extra={"ok": True, "prompt_source": "spark_legend", "control": control}))
        except SamMissing as e:
            notes.append(f"{sid}: {e}")
        n = sum(len(c["masks"]) for c in calls)
        legend_hits = sum(1 for c in calls for m in c["masks"] if m["excluded"])
        checks.append(Check(
            "area", f"SAM 3.1 on the coloured {num}: {len(calls)} prompts from Muse Spark's legend words, {n} masks, "
            f"{legend_hits} in the legend excluded", "info", ["sam", "spark"],
            "Each mask takes the type of the outline it lies in, not the prompt's; one prompt can return several types, "
            "and masks on legend swatches are a key, not a quantity.",
            {"sheet_ids": [sid], "file_ids": files},
            numbers={"prompts": len(calls), "masks": n, "legend_excluded": legend_hits},
            extra={"ok": True, "prompt_source": "spark_legend", **({"control": control} if control else {}),
                   "calls": [{"prompt": c["prompt"], "prompt_source": "spark_legend", "keyed_to": c["labels"],
                              "masks": len(c["masks"]), "legend_excluded": sum(1 for m in c["masks"] if m["excluded"]),
                              "seconds": c["seconds"], "recorded_at": c["recorded_at"],
                              "mask_list": [{"box_px": m["box_px"], "score": round(m["score"], 3) if m["score"] is not None
                                             else None, "area_m2": m["area_m2"], "object_id": m["object_id"],
                                             "type": m["type"], "excluded": m["excluded"]} for m in c["masks"]]}
                             for c in calls]}))
        best: dict[str, tuple[float, dict, str]] = {}
        for c in calls:
            for m in c["masks"]:
                if m["object_id"] and not m["excluded"] and (m["object_id"] not in best or (m["score"] or 0) > best[m["object_id"]][0]):
                    best[m["object_id"]] = (m["score"] or 0, m, c["prompt"])
        by_oid = {o["object_id"]: o for o in objs}
        for it in items.values():
            oids = [oid for s, oid in it["_refs"] if s == sid]
            hits = [(oid, best[oid]) for oid in oids if oid in best]
            if not hits:
                continue
            sam_m2 = sum(m["area_m2"] for _, (_, m, _) in hits)
            cad_m2 = sum(by_oid[oid].get("area_m2") or 0 for oid, _ in hits)
            err = (sam_m2 - cad_m2) / cad_m2 * 100 if cad_m2 else 0.0
            share = f"{len(hits)} of {len(oids)} " if len(oids) > 1 else ""
            used = sorted({p for _, (_, _, p) in hits})
            agree = abs(err) <= AGREE_PCT
            checks.append(Check(
                "area", f"SAM 3.1: {share}{it['label']} {sam_m2:.1f} m² vs CAD {cad_m2:.1f} m² ({err:+.1f}%)", "info",
                ["sam", "geometry"],
                f"SAM 3.1 on the coloured render, asked for {' and '.join(repr(p) for p in used)} (Muse Spark's words from "
                f"the legend), returned a mask on {'each' if len(hits) > 1 else 'the'} outline; its area is set against "
                "the geometry's. The CAD area governs the quantity"
                + ("." if agree else f"; SAM is {abs(err):.1f}% off, outside the {AGREE_PCT:g}% a coloured PDF alone "
                   "would need."),
                {"sheet_ids": [sid], "file_ids": files, "object_ids": [obj_ref(sid, oid) for oid, _ in hits]},
                numbers={"sam_m2": round(sam_m2, 2), "cad_m2": round(cad_m2, 2), "error_pct": round(err, 2),
                         "confidence": round(min(sc for _, (sc, _, _) in hits), 3), "prompt": used[0],
                         "masks": len(hits)},
                extra={"item_ids": [it["item_id"]], "prompt_source": "spark_legend", **({"ok": True} if agree else {})}))
    return checks, renders
