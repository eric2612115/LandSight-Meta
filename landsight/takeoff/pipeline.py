"""The take-off pipeline over a set of DXF sheets: load -> close -> exclude -> classify the sheet (Spark) -> read the
schedule (Spark; on plan sheets and on a schedule sheet) -> ask Spark about each open candidate on plan sheets (one crop per call, at most 10 per sheet) ->
merge. The Spark client is injected, so tests replay recorded responses offline."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

from landsight.dxf import load, render_png
from landsight.geometry import close, exclude, is_canopy
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


def _pad(bounds, margin, limit=None):
    x0, y0, x1, y1 = bounds
    w = (x0 - margin, y0 - margin, x1 + margin, y1 + margin)
    if limit:
        w = (max(w[0], limit[0]), max(w[1], limit[1]), min(w[2], limit[2]), min(w[3], limit[3]))
    return w


def candidate_crop(sg: SheetGeometry, c) -> bytes:
    """The candidate in red with its ID tag, inside a window that shows its neighbours and labels."""
    x0, y0, x1, y1 = c.bbox
    margin = max(6.0, 1.0 * max(x1 - x0, y1 - y0))
    window = _pad(c.bbox, margin, sg.model.bounds)
    return render_png(sg.model, window=window, width_in=8, highlight=c.lines, ids={c.id: ((x0 + x1) / 2, y1 + 1.0)})


def run(paths, spark, snap_tol_m: float = 0.25, max_calls_per_sheet: int = MAX_CALLS_PER_SHEET) -> Takeoff:
    started = time.monotonic()
    calls_before = len(spark.log)
    findings = SparkFindings()
    sheets: list[SheetGeometry] = []
    schedule_rows: list[dict] = []
    schedule = None
    crops: dict[str, bytes] = {}
    for path in paths:
        model = load(Path(path))
        key = model.signature()
        closed = close(model, snap_tol_m)
        regions = exclude(model, closed.shapes + closed.candidates)
        sg = SheetGeometry(model.name, model, closed, regions)
        sheets.append(sg)
        try:
            findings.sheet_kinds[model.name] = spark.classify_sheet(render_png(model), key=key)
        except Exception as e:  # a failed call must not decide the sheet silently: it stays a plan, and is noted
            findings.errors.append(f"{model.name}: classify_sheet failed: {e}")
            findings.sheet_kinds[model.name] = {"kind": "plan", "confidence": 0.0, "why": "classification failed"}
        kind = findings.sheet_kinds[model.name].get("kind")
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
            try:
                verdicts = spark.group_and_read(png, [{"id": c.id, "facts": candidate_facts(c, canopy_area)}],
                                                key=f"{key}:{c.signature()}")
            except Exception as e:
                findings.errors.append(f"{model.name}/{c.id}: group_and_read failed: {e}")
                verdicts = []
            calls += 1
            for v in verdicts:
                if v.get("id") == c.id or len(verdicts) == 1:
                    findings.candidates[f"{model.name}/{c.id}"] = v | {"id": c.id}
    items, notes = merge_with_notes(sheets, findings, schedule_rows)
    notes += findings.errors
    return Takeoff(items, notes, sheets, findings, schedule, len(spark.log) - calls_before,
                   round(time.monotonic() - started, 2), crops)
