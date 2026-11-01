"""Quantity checks on the governing take-off: open outlines Muse Spark looked at, the plant schedule against the
drawing (the drawing governs when a general note says so), group labels, rows counted along a line, and trees drawn
outside the site boundary."""

from __future__ import annotations

import re

from landsight.checks.base import Check, obj_ref

GOVERNS = re.compile(r"QUANTIT\w* ON (?:THE )?PLAN\w* (?:TAKE|TAKES) PRECEDENCE|PLAN GOVERNS|DRAWING GOVERNS", re.I)


def general_note(ctx) -> tuple[str, str] | None:
    """(sheet_id, text) of a note saying plan quantities govern over the schedule, from counted sheets first."""
    for d in sorted(ctx.sheets, key=lambda d: (not d.counted, d.source != "dxf")):
        if d.model is None:
            continue
        for t in d.model.texts:
            if GOVERNS.search(t.content):
                return d.sheet_id, t.content.strip()
    return None


def _num(v) -> str:
    return "-" if v is None else (f"{v:g}" if isinstance(v, (int, float)) else str(v))


def open_outlines(ctx) -> list[Check]:
    out = []
    for it in ctx.items:
        sp = it.get("spark")
        if not sp:
            continue
        o = ctx.object(sp["sheet_id"], sp["object_id"])
        refs = [obj_ref(sp["sheet_id"], sp["object_id"])]
        sheets = [sp["sheet_id"]]
        for sid, obj in ctx.same_object_elsewhere(sp["sheet_id"], sp["object_id"]):
            refs.append(obj_ref(sid, obj["object_id"]))
            sheets.append(sid)
        gaps = o.get("gap_sizes_m") or [0]
        out.append(Check(
            "quantity", f"{sp['object_id']}: open outline ({o.get('pieces', '?')} pieces, {len(o.get('gaps', []))} gaps up to "
            f"{max(gaps):.2f} m); Muse Spark says one {sp['answer'].get('kind')}", "flag", ["geometry", "spark"],
            f"Geometry could not close {sp['object_id']}'s line work; Muse Spark, shown the crop with the measured facts, "
            f"says one {sp['answer'].get('kind')} (confidence {float(sp.get('confidence') or 0):.2f}): "
            f"{sp['answer'].get('why', '')} It is counted only after a person confirms."
            + (f" The same open outline is on {', '.join(sheets[1:])}." if len(sheets) > 1 else ""),
            {"sheet_ids": sheets, "object_ids": refs, "file_ids": ctx.files_of(sheets)},
            numbers={"geometry": it["geometry_count"], "spark": it["spark_count"], "gaps": len(o.get("gaps", [])),
                     "max_gap_m": max(gaps), "confidence": sp.get("confidence")},
            extra={"item_ids": [it["item_id"]]}))
    return out


def schedule(ctx) -> list[Check]:
    note = general_note(ctx)
    out = []
    for it in ctx.items:
        if it.get("schedule_count") is None or it["kind"] not in ("tree", "hedge", "shrub_bed", "lawn"):
            continue
        drawn = it.get("proposed_count")
        sched = it["schedule_count"]
        same = drawn is not None and abs(float(drawn) - float(sched)) <= 0.01 * max(float(drawn), 1)
        unit = " m²" if it["unit"] == "m2" else ""
        sch_sheets = ctx.schedule_sheets()
        ev = {"sheet_ids": sorted(set(it["sheet_ids"]) | set(sch_sheets)),
              "object_ids": [obj_ref(s, o) for s, o in it["_refs"]] + ctx.schedule_objects(),
              "file_ids": ctx.files_of(set(it["sheet_ids"]) | set(sch_sheets))}
        src = it.get("_schedule_by", "spark")
        if same:
            out.append(Check("quantity", f"Schedule and drawing agree: {it['label']} {_num(drawn)}{unit}", "info",
                             ["geometry", "spark" if src == "spark" else "rule"],
                             "The plant schedule and the measured drawing give the same number.", ev,
                             numbers={"schedule": sched, "drawn": drawn}, extra={"item_ids": [it["item_id"]], "ok": True}))
            continue
        governs = (f" General note on {note[0]}: \"{note[1]}\" — the drawing governs." if note else
                   " Nothing on the sheets says which governs; the drawing is taken.")
        out.append(Check(
            "quantity", f"Schedule says {_num(sched)} {it['label']}, drawing shows {_num(drawn)}{unit}", "flag",
            ["geometry", "spark" if src == "spark" else "rule"],
            f"The plant schedule ({'read by Muse Spark' if src == 'spark' else 'read from the DXF text'}) and the measured "
            f"drawing disagree.{governs} Raise it with the developer.", ev,
            numbers={"schedule": sched, "drawn": drawn, "difference": round(float(sched) - float(drawn or 0), 2)},
            extra={"item_ids": [it["item_id"]], "governing_note": note[1] if note else None}))
    return out


def rows(ctx) -> list[Check]:
    out = []
    for it in ctx.items:
        if it["kind"] != "hedge" or not it.get("_row"):
            continue
        r = it["_row"]
        out.append(Check(
            "quantity", f"{it['label']}: {r['length_m']:g} m at {r['spacing_m']:g} m, {r['rows']} rows = "
            f"{_num(it['geometry_count'])} plants", "info", ["geometry"],
            f"Counted by geometry from the label '{r['label']}': floor(length ÷ spacing) + 1 on each drawn line.",
            {"sheet_ids": it["sheet_ids"], "object_ids": [obj_ref(s, o) for s, o in it["_refs"]]},
            numbers={"length_m": r["length_m"], "spacing_m": r["spacing_m"], "rows": r["rows"],
                     "count": it["geometry_count"]}, extra={"item_ids": [it["item_id"]], "ok": True}))
    return out


def boundary(ctx) -> list[Check]:
    out = []
    for sid, pre in ctx.prepass.items():
        if not ctx.sheet(sid).counted:
            continue
        for obj in ctx.objects.get(sid, []):
            ex = obj.get("excluded") or {}
            if obj["kind"] != "tree" or ex.get("rule") != "geometry: centre outside the site boundary":
                continue
            out.append(Check(
                "quantity", f"{obj['object_id']} is drawn outside the site boundary — not counted toward greening", "flag",
                ["geometry"],
                f"The canopy's centre ({obj['centre'][0]:g}, {obj['centre'][1]:g}) lies outside the site boundary (the "
                "property line on the sheet), in the road reserve. It is drawn but cannot be planted or counted on this "
                "site; ask whether it is a street tree by others.",
                {"sheet_ids": [sid], "object_ids": [obj_ref(sid, obj["object_id"])], "file_ids": ctx.files_of([sid])},
                numbers={"x": obj["centre"][0], "y": obj["centre"][1]}))
    return out
