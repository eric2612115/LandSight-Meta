"""The tower's checks (docs/PACKAGE.md v2): one sheet standing for several floors, soil depths on artificial ground
per sheet, the detail against the plan, the same symbol on two floors, and floors that look alike.

`analyse(ctx)` runs after the take-off and before the bill and greening: it reads each floor sheet's Muse Spark answer
(review_read_floor_sheet: floors, ground, soil depths), multiplies the items of a typical-floor sheet by its floor
count (per floor and total kept on the item), and marks the planting whose soil is below the artificial-ground minimum
(left out of the greening sum). The checks then report what it found."""

from __future__ import annotations

import re

import shapely

from landsight.checks.base import Check, citation, obj_ref, rules

FLOOR_TITLE = re.compile(r"\b\d{1,2}F\b|\bR\d?F\b|\bROOF\b|\bPODIUM\b|\bTYPICAL\b|\bGROUND FLOOR\b", re.I)
ROOF_COLUMN = ("roof", "balcony")  # table 1's roof, balcony, terrace and facade column
BOTH_COLUMNS = ("podium", "over_basement", "mixed", "unknown")  # not named by the text: both columns are shown
LOOKS_ALIKE = 0.9


def floor_sheets(ctx) -> dict[str, dict]:
    return {d.sheet_id: d.floor_read for d in ctx.sheets if getattr(d, "floor_read", None)}


def _n_floors(read: dict) -> int:
    fl = [f for f in (read.get("floors") or []) if str(f).strip()]
    return len(fl) if read.get("typical") and len(fl) > 1 else 1


def _minimum(planting: str) -> dict:
    """The table 1 row for a planting kind: {roof, other, row}."""
    rows = rules()["national"]["artificial_ground"]["rows"]
    i = {"tree": 0, "shrub": 2, "lawn": 3}.get(planting, 2)
    r = rows[i]
    return {"roof": r["soil_depth_roof_m"], "other": r["soil_depth_other_m"],
            "row": {0: "large tree", 2: "shrubs and vines", 3: "lawn and flower beds"}[i]}


def _kind_planting(kind: str) -> str:
    return {"tree": "tree", "lawn": "lawn"}.get(kind, "shrub")


def analyse(ctx) -> None:
    reads = floor_sheets(ctx)
    ctx.floor_info = {}
    ctx.floor_factor = {}
    ctx.soil_fail = {}
    if not reads:
        return
    for sid, r in reads.items():
        ctx.floor_info[sid] = {"floors": [str(f) for f in r.get("floors") or []], "n": _n_floors(r),
                               "label": r.get("floor_label") or "", "ground": r.get("ground") or "unknown",
                               "soil": r.get("soil") or [], "typical": bool(r.get("typical"))}
    objs = {(s, o["object_id"]): o for s, lst in ctx.objects.items() for o in lst}
    for it in ctx.items:
        refs = it.get("_refs") or []
        if not refs or not any(ctx.floor_info.get(s, {}).get("n", 1) > 1 for s, _ in refs):
            continue
        weights = []
        for s, oid in refs:
            o = objs.get((s, oid)) or {}
            w = 1.0 if it["kind"] == "tree" else (o.get("length_m") if it["kind"] == "hedge" else o.get("area_m2")) or 0.0
            weights.append((s, float(w)))
        tot = sum(w for _, w in weights) or 1.0
        factor = sum(w * ctx.floor_info.get(s, {}).get("n", 1) for s, w in weights) / tot
        if abs(factor - 1) < 1e-9:
            continue
        ctx.floor_factor[it["item_id"]] = factor
        per = it.get("proposed_count") if it.get("proposed_count") is not None else it.get("geometry_count")
        for k in ("geometry_count", "spark_count", "label_count", "proposed_count", "quote_count"):
            if it.get(k) is not None:
                it[k] = round(float(it[k]) * factor, 2) if it["unit"] != "plant" else round(float(it[k]) * factor)
        it["floors"] = {"per_floor": per, "factor": round(factor, 3), "total": it.get("proposed_count"),
                        "sheets": {s: ctx.floor_info[s]["floors"] for s, _ in refs if s in ctx.floor_info}}
    # soil below the artificial-ground minimum: the planting on that sheet is not counted toward greening
    for sid, info in ctx.floor_info.items():
        d = ctx.sheet(sid)
        if d is None or not d.counted or info["ground"] not in ROOF_COLUMN + BOTH_COLUMNS:
            continue
        for it in ctx.items:
            on = [(s, o) for s, o in it.get("_refs") or [] if s == sid]
            if not on:
                continue
            depth = _depth_for(info["soil"], _kind_planting(it["kind"]))
            if depth is None:
                continue
            m = _minimum(_kind_planting(it["kind"]))
            need = m["roof"] if info["ground"] in ROOF_COLUMN else max(m["roof"], m["other"])
            if depth < need - 1e-9:
                area = sum((objs.get((s, o)) or {}).get("area_m2") or 0.0 for s, o in on)
                ctx.soil_fail[(it["item_id"], sid)] = {"depth": depth, "need": need, "area_m2": round(area, 2),
                                                       "kind": it["kind"], "label": it["label"], "row": m["row"]}


def _depth_for(soil: list[dict], planting: str) -> float | None:
    exact = [s["depth_m"] for s in soil if s.get("planting") == planting and s.get("depth_m")]
    anyp = [s["depth_m"] for s in soil if s.get("planting") == "any" and s.get("depth_m")]
    vals = exact or anyp
    return min(vals) if vals else None


# --------------------------------------------------------------------------------------------- checks


def typical_floors(ctx) -> list[Check]:
    out = []
    for sid, info in getattr(ctx, "floor_info", {}).items():
        d = ctx.sheet(sid)
        if info["n"] <= 1 or d is None or not d.counted:
            continue
        items = [it for it in ctx.items if it.get("floors") and sid in it["floors"]["sheets"]]
        unit = lambda it: "" if it["unit"] == "plant" else (" m²" if it["unit"] == "m2" else " m")  # noqa: E731
        lines = [f"{it['label']} {it['floors']['per_floor']:g}{unit(it)} per floor × {info['n']} = "
                 f"{it['floors']['total']:g}{unit(it)}" for it in items]
        out.append(Check(
            "quantity", f"{d.number} stands for {info['n']} floors ({info['label'] or ', '.join(info['floors'])}): "
            f"quantities × {info['n']}", "flag", ["spark", "rule"],
            f"Muse Spark read the title block: floors {', '.join(info['floors'])} (typical). One drawing, {info['n']} "
            f"floors built: {'; '.join(lines) or 'no measured items on it'}. The take-off, the bill comparison and the "
            f"greening sum all use the {info['n']}-floor totals.",
            {"sheet_ids": [sid], "file_ids": ctx.files_of([sid])},
            numbers={"floors": info["n"], **({"per_floor": items[0]["floors"]["per_floor"],
                                              "total": items[0]["floors"]["total"]} if items else {})},
            extra={"item_ids": [it["item_id"] for it in items], "scenario": "regulation",
                   "floors": info["floors"], "per_floor": [{"item_id": it["item_id"], "label": it["label"],
                                                            "per_floor": it["floors"]["per_floor"], "floors": info["n"],
                                                            "total": it["floors"]["total"], "unit": it["unit"]}
                                                           for it in items]}))
    return out


def soil_depths(ctx) -> list[Check]:
    out = []
    fails = getattr(ctx, "soil_fail", {})
    for sid, info in getattr(ctx, "floor_info", {}).items():
        d = ctx.sheet(sid)
        if d is None or not d.counted or not info["soil"] or info["ground"] not in ROOF_COLUMN + BOTH_COLUMNS:
            continue
        col = "roof, balcony and terrace" if info["ground"] in ROOF_COLUMN else "both (podium over a basement is not named)"
        mine = {k: v for k, v in fails.items() if k[1] == sid}
        kinds = sorted({_kind_planting(it["kind"]) for it in ctx.items for s, _ in it.get("_refs") or [] if s == sid})
        rows = []
        for k in kinds:
            depth = _depth_for(info["soil"], k)
            if depth is None:
                continue
            m = _minimum(k)
            need = m["roof"] if info["ground"] in ROOF_COLUMN else max(m["roof"], m["other"])
            rows.append({"planting": k, "soil_m": depth, "minimum_m": need, "passes": depth >= need - 1e-9})
        if not rows:
            continue
        table = "; ".join(f"{r['planting']} {r['soil_m']:g} m {'≥' if r['passes'] else '<'} {r['minimum_m']:g} m"
                          for r in rows)
        sev = "fail" if mine else "info"
        lost = sum(v["area_m2"] for v in mine.values())
        title = (f"{d.number} ({info['ground']}): " + (", ".join(f"{v['label']} on {v['depth']:g} m soil, below the "
                 f"{v['need']:g} m minimum — not counted toward greening" for v in mine.values()) if mine else
                 f"soil depths meet the artificial-ground table ({table})"))
        out.append(Check(
            "regulation", title, sev, ["spark", "rule"],
            f"Muse Spark read the soil depths written on {d.number} ({'; '.join(s['text'] for s in info['soil'])}); "
            f"the artificial-ground table applies the {col} column: {table}."
            + (f" {lost:g} m² of planting is left out of the greening sum until the soil is deepened." if mine else ""),
            {"sheet_ids": [sid], "file_ids": ctx.files_of([sid])}, citation=citation("STD-5-T1"),
            numbers={"rows": len(rows), "failing": len(mine), "left_out_m2": lost},
            extra={"soil_table": rows, "ground": info["ground"], **({} if mine else {"ok": True})}))
    return out


def detail_vs_plan(ctx) -> list[Check]:
    out = []
    info = getattr(ctx, "floor_info", {})
    details = [(sid, i) for sid, i in info.items() if ctx.sheet(sid) is not None and ctx.sheet(sid).kind == "detail"]
    for sid, i in info.items():
        d = ctx.sheet(sid)
        if d is None or not d.counted:
            continue
        for s in i["soil"]:
            g = s.get("ground") if s.get("ground") not in (None, "unknown", "mixed") else i["ground"]
            for did, di in details:
                for t in di["soil"]:
                    if t.get("ground") != g or t.get("planting") not in (s.get("planting"), "any") and s.get("planting") != "any":
                        continue
                    if abs((t.get("depth_m") or 0) - (s.get("depth_m") or 0)) <= 0.05:
                        continue
                    dd = ctx.sheet(did)
                    out.append(Check(
                        "sheet", f"Soil on the {g}: {dd.number} says {t['depth_m']:g} m, {d.number} says "
                        f"{s['depth_m']:g} m — needs review", "review", ["spark"],
                        f"The detail ({dd.number}: '{t['text']}') and the plan ({d.number}: '{s['text']}') give different "
                        "soil depths for the same planting. The greening and the soil check use the plan's figure; ask "
                        "which is built (and priced).",
                        {"sheet_ids": [did, sid], "file_ids": ctx.files_of([did, sid])},
                        numbers={"detail_m": t["depth_m"], "plan_m": s["depth_m"]},
                        extra={"scenario": "design", "ground": g}))
    seen, uniq = set(), []
    for c in out:
        k = (c.title,)
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    return uniq


def same_symbol(ctx) -> list[Check]:
    out = []
    info = getattr(ctx, "floor_info", {})
    objs = {(s, o["object_id"]): o for s, lst in ctx.objects.items() for o in lst}
    for it in ctx.items:
        sheets = sorted({s for s, _ in it.get("_refs") or []})
        floors = {s: ",".join(info.get(s, {}).get("floors") or []) for s in sheets}
        if len(sheets) < 2 or len(set(floors.values())) < 2:
            continue
        parts = []
        for s in sheets:
            refs = [o for t, o in it["_refs"] if t == s]
            q = sum((objs.get((s, o)) or {}).get("length_m") or 0 for o in refs)
            parts.append(f"{ctx.sheet(s).number} ({floors[s] or '?'}F) {len(refs)} object{'s' if len(refs) > 1 else ''}"
                         + (f", {q:g} m of line" if it["kind"] == "hedge" else ""))
        out.append(Check(
            "quantity", f"{it['label']}: the same symbol and label on {len(sheets)} floors — counted on each "
                        f"({it['proposed_count']:g} in all)", "info", ["geometry", "spark"],
            f"{'; '.join(parts)}. Different floors are different planting: the take-off counts both and never merges "
            "them, even where the symbol, the label and the position repeat.",
            {"sheet_ids": sheets, "file_ids": ctx.files_of(sheets),
             "object_ids": [obj_ref(s, o) for s, o in it["_refs"]]},
            numbers={"sheets": len(sheets), "total": it["proposed_count"]},
            extra={"item_ids": [it["item_id"]], "scenario": "design"}))
    return out


def _segments(d, furniture) -> set:
    segs = set()
    for e in d.model.entities:
        if (e.layer or "").upper() in ("LEADER", "FRAME", "TEXT") or e.geometry is None:
            continue
        cs = list(e.geometry.coords) if hasattr(e.geometry, "coords") else []
        if e.closed and cs and cs[0] != cs[-1]:
            cs.append(cs[0])
        for a, b in zip(cs, cs[1:]):
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if any(shapely.contains_xy(f, *mid) for f in furniture):
                continue
            pa, pb = (round(a[0] * 20) / 20, round(a[1] * 20) / 20), (round(b[0] * 20) / 20, round(b[1] * 20) / 20)
            segs.add(tuple(sorted((pa, pb))))
    return segs


def looks_alike(ctx) -> list[Check]:
    from shapely.geometry import Polygon

    plans = [d for d in ctx.sheets if d.source == "dxf" and d.counted and d.kind == "plan" and d.model is not None]
    if len(plans) < 2:
        return []
    segs = {}
    for d in plans:
        furn = [Polygon(o["outline"]) for o in ctx.objects.get(d.sheet_id, [])
                if o["kind"] in ("title_block", "legend", "schedule") and len(o.get("outline") or []) >= 3]
        segs[d.sheet_id] = _segments(d, [f for f in furn if f.is_valid])
    out = []
    info = getattr(ctx, "floor_info", {})
    for i, a in enumerate(plans):
        for b in plans[i + 1:]:
            A, Bs = segs[a.sheet_id], segs[b.sheet_id]
            if min(len(A), len(Bs)) < 10:
                continue
            share = len(A & Bs) / min(len(A), len(Bs))
            if share <= LOOKS_ALIKE:
                continue
            fa = info.get(a.sheet_id, {}).get("label") or a.title
            fb = info.get(b.sheet_id, {}).get("label") or b.title
            out.append(Check(
                "sheet", f"{a.number} and {b.number} look alike: {share:.0%} of their line work is the same", "review",
                ["geometry"],
                f"{len(A & Bs)} of {min(len(A), len(Bs))} segments coincide (outline, core, columns, planters). Only the "
                f"title block tells them apart: {a.number} '{fa}', {b.number} '{fb}'. Check they are different floors "
                "before pricing both, and that neither is a copy left in by mistake.",
                {"sheet_ids": [a.sheet_id, b.sheet_id], "file_ids": ctx.files_of([a.sheet_id, b.sheet_id])},
                numbers={"share": round(share, 3), "shared_segments": len(A & Bs)},
                extra={"scenario": "design"}))
    return out


def checks(ctx) -> list[Check]:
    return typical_floors(ctx) + soil_depths(ctx) + detail_vs_plan(ctx) + same_symbol(ctx) + looks_alike(ctx)


def object_quantity(it: dict, obj: dict) -> float:
    """One object's share of an item: 1 per tree, its area for beds and lawn, its plants for a hedge row (floor(L/s)+1
    on each drawn line of 1 m or more)."""
    if it["kind"] == "tree":
        return 1.0
    if it["kind"] == "hedge":
        s = (it.get("_row") or {}).get("spacing_m")
        lines = [seg for seg in obj.get("segments") or [] if len(seg) >= 2]
        if s and lines:
            import math

            lens = [sum(math.dist(a, b) for a, b in zip(seg, seg[1:])) for seg in lines]
            return float(sum(math.floor(round(L / s, 6)) + 1 for L in lens if L >= 1.0))
        return 0.0
    return float(obj.get("area_m2") or 0.0)


def schedule_scope(ctx, it: dict) -> tuple[float, list[str]] | None:
    """When a schedule sits on one plan sheet and the item is drawn on other floors too, the schedule speaks for that
    sheet: (the item's quantity on the schedule's sheets, those sheets). None when that does not apply."""
    info = getattr(ctx, "floor_info", {}) or {}
    sheets = sorted({s for s, _ in it.get("_refs") or []})
    if len(sheets) < 2 or len({",".join(info.get(s, {}).get("floors") or []) for s in sheets}) < 2:
        return None
    with_schedule = [s for s in sheets if any(o["kind"] == "schedule" for o in ctx.objects.get(s, []))]
    if not with_schedule:
        return None
    objs = {(s, o["object_id"]): o for s, lst in ctx.objects.items() for o in lst}
    q = sum(object_quantity(it, objs.get((s, o)) or {}) for s, o in it["_refs"] if s in with_schedule)
    return q, with_schedule
