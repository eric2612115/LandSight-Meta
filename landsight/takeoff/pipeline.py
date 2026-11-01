"""The take-off pipeline over a set of DXF sheets: load -> close -> exclude -> classify the sheet (Spark) -> read the
schedule (Spark; on plan sheets and on a schedule sheet) -> ask Spark about each open candidate on plan sheets (one crop
per call, at most 10 per sheet) -> read the tree pit of a detail sheet (Spark; PitFacts for the greening rule) ->
merge. The Spark client is injected, so tests replay recorded responses offline."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

import io

from PIL import Image

from landsight.dxf import load, render_png
from landsight.geometry import close, exclude, is_canopy
from landsight.meta.spark import GROUP_PROMPT
from landsight.rules.base import PitFacts
from landsight.takeoff.merge import (Item, SheetGeometry, SparkFindings, attach_labels, candidate_facts,
                                     merge_with_notes, needs_spark)

MAX_CALLS_PER_SHEET = 10


@dataclass
class Takeoff:
    items: list[Item]
    notes: list[str]
    sheets: list[SheetGeometry]
    spark: SparkFindings
    schedule: dict | None = None
    calls: int = 0
    seconds: float = 0.0
    crops: dict[str, bytes] = field(default_factory=dict)  # "L-1/C-03" -> the PNG Spark saw
    requests: dict[str, dict] = field(default_factory=dict)  # "L-1/C-03" -> {facts, prompt, seconds, window, crop_px}
    site: object | None = None  # rules.SiteFacts read from the title block
    rules: list = field(default_factory=list)  # rules.RuleResult, one per rule
    details: dict[str, dict] = field(default_factory=dict)  # detail sheet -> Spark's read_detail answer (+ seconds)
    pit: PitFacts | None = None  # the tree pit the greening rule uses (from the first detail sheet that shows one)

    def recheck(self, **site_overrides) -> None:
        """Run the regulation check again (after a confirmation, or with other site facts)."""
        from landsight.rules import check_takeoff

        try:
            self.site, self.rules = check_takeoff(self, **site_overrides)
        except Exception as e:  # the take-off stands without the rules; the failure is noted
            self.notes.append(f"rules: check failed: {e}")


def _pad(bounds, margin, limit=None):
    x0, y0, x1, y1 = bounds
    w = (x0 - margin, y0 - margin, x1 + margin, y1 + margin)
    if limit:
        w = (max(w[0], limit[0]), max(w[1], limit[1]), min(w[2], limit[2]), min(w[3], limit[3]))
    return w


def candidate_window(sg: SheetGeometry, c) -> tuple[float, float, float, float]:
    """The window (metres) of the candidate's crop: the candidate plus at least 6 m of neighbours and labels."""
    x0, y0, x1, y1 = c.bbox
    margin = max(6.0, 1.0 * max(x1 - x0, y1 - y0))
    return _pad(c.bbox, margin, sg.model.bounds)


def candidate_crop(sg: SheetGeometry, c) -> bytes:
    """The candidate in red with its ID tag, inside a window that shows its neighbours and labels."""
    x0, y0, x1, y1 = c.bbox
    return render_png(sg.model, window=candidate_window(sg, c), width_in=8, highlight=c.lines,
                      ids={c.id: ((x0 + x1) / 2, y1 + 1.0)})


def pit_from_detail(sheet: str, read: dict) -> PitFacts | None:
    """PitFacts from Spark's read_detail answer; None when the sheet shows no pit (both dimensions 0)."""
    try:
        w, ln = float(read.get("pit_w_m") or 0), float(read.get("pit_l_m") or 0)
        depth = float(read["soil_depth_m"]) if read.get("soil_depth_m") else None
    except (TypeError, ValueError):
        return None
    if w <= 0 or ln <= 0:
        return None
    return PitFacts(round(w * ln, 4), depth, sheet, read.get("on_slab"), w, ln, read.get("why", ""), "spark")


def run(paths, spark, snap_tol_m: float = 0.25, max_calls_per_sheet: int = MAX_CALLS_PER_SHEET,
        read_details: bool = True) -> Takeoff:
    """`read_details=False` skips the detail-sheet read (no PitFacts, so no pit downgrade)."""
    started = time.monotonic()
    calls_before = len(spark.log)
    findings = SparkFindings()
    sheets: list[SheetGeometry] = []
    schedule_rows: list[dict] = []
    schedule = None
    crops: dict[str, bytes] = {}
    requests: dict[str, dict] = {}
    details: dict[str, dict] = {}
    for path in paths:
        model = load(Path(path))
        key = model.signature()
        closed = close(model, snap_tol_m)
        regions = exclude(model, closed.shapes + closed.candidates)
        sg = SheetGeometry(model.name, model, closed, regions)
        sheets.append(sg)
        sheet_png = render_png(model)
        try:
            findings.sheet_kinds[model.name] = spark.classify_sheet(sheet_png, key=key)
        except Exception as e:  # a failed call must not decide the sheet silently: it stays a plan, and is noted
            findings.errors.append(f"{model.name}: classify_sheet failed: {e}")
            findings.sheet_kinds[model.name] = {"kind": "plan", "confidence": 0.0, "why": "classification failed"}
        kind = findings.sheet_kinds[model.name].get("kind")
        if kind == "detail" and read_details:  # the tree pit (size, soil, on a slab?) for the greening rule
            log_before = len(spark.log)
            try:
                read = spark.read_detail(sheet_png, key=f"{key}:detail")
                last = spark.log[-1] if len(spark.log) > log_before else {}
                details[model.name] = read | {"seconds": last.get("seconds"), "fixture": last.get("fixture") or ""}
            except Exception as e:
                findings.errors.append(f"{model.name}: read_detail failed: {e}")
        if kind not in ("plan", "schedule"):
            continue
        calls = 0
        region = next((r for r in regions if r.kind == "schedule"), None)
        if region is not None:  # the 植栽表 is read on plan sheets and on a schedule sheet of its own
            crop = render_png(model, window=_pad(region.polygon.bounds, 0.6), width_in=10, dpi=200)
            try:
                schedule = spark.read_schedule(crop, key=f"{key}:schedule")
                schedule_rows += schedule.get("rows", [])
            except Exception as e:
                findings.errors.append(f"{model.name}: read_schedule failed: {e}")
            calls += 1
        if kind != "plan":
            continue
        labels = attach_labels(sg)
        areas = sorted(s.area for s in closed.shapes if not s.excluded and is_canopy(s))
        canopy_area = areas[len(areas) // 2] if areas else None
        for c in needs_spark(sg, labels):
            if calls >= max_calls_per_sheet:
                findings.errors.append(f"{model.name}: Spark call budget reached; {c.id} not reviewed")
                continue
            png = candidate_crop(sg, c)
            crops[f"{model.name}/{c.id}"] = png
            crop_px = Image.open(io.BytesIO(png)).size
            facts = candidate_facts(c, canopy_area)
            log_before = len(spark.log)
            try:
                verdicts = spark.group_and_read(png, [{"id": c.id, "facts": facts}], key=f"{key}:{c.signature()}")
            except Exception as e:
                findings.errors.append(f"{model.name}/{c.id}: group_and_read failed: {e}")
                verdicts = []
            calls += 1
            last = spark.log[-1] if len(spark.log) > log_before else {}
            requests[f"{model.name}/{c.id}"] = {"id": c.id, "facts": facts, "prompt": GROUP_PROMPT + f"- {c.id}: {facts}",
                                                "seconds": last.get("seconds"), "fixture": bool(last.get("fixture")),
                                                "window": list(candidate_window(sg, c)), "crop_px": list(crop_px)}
            for v in verdicts:
                if v.get("id") == c.id or len(verdicts) == 1:
                    findings.candidates[f"{model.name}/{c.id}"] = v | {"id": c.id}
    items, notes = merge_with_notes(sheets, findings, schedule_rows)
    notes += findings.errors
    result = Takeoff(items, notes, sheets, findings, schedule, len(spark.log) - calls_before,
                     round(time.monotonic() - started, 2), crops, requests, details=details)
    result.pit = next((p for p in (pit_from_detail(s, d) for s, d in details.items()) if p), None)
    if details and result.pit is None:
        notes.append(f"{', '.join(details)}: Muse Spark read no tree pit on the detail sheet")
    result.recheck()
    return result
