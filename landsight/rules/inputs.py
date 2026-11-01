"""From a take-off to what the rules need: the site facts (title block) and the plantings (items + geometry)."""

from __future__ import annotations

import statistics

from shapely.geometry import Point

from landsight.geometry import hedge_bands, title_block
from landsight.rules.base import Planting, SiteFacts, site_facts

PLANTING_KINDS = ("tree", "hedge", "shrub_bed", "lawn")


def site_from_takeoff(takeoff, **overrides) -> SiteFacts:
    fields = {sg.sheet: title_block(sg.model, sg.regions) for sg in takeoff.sheets}
    return site_facts(fields, **overrides)


def _object(sheets: dict, ref: str):
    sheet, gid = ref.split("/", 1)
    sg = sheets.get(sheet)
    if sg is None:
        return None, None
    found = next((x for x in sg.closed.shapes + sg.closed.candidates if x.id == gid), None)
    return sg, found


def _spacing(centres: list[tuple[float, float]]) -> float | None:
    """Median nearest-neighbour distance between tree centres (m), None for fewer than two trees."""
    if len(centres) < 2:
        return None
    pts = [Point(c) for c in centres]
    nn = [min(p.distance(q) for j, q in enumerate(pts) if j != i) for i, p in enumerate(pts)]
    return round(statistics.median(nn), 2)


def _hedge_area(sheets: dict, refs: list[str]) -> tuple[float | None, str]:
    """The band between the hedge's drawn lines (geometry.hedge_bands) that meets each hedge object."""
    total, parts = 0.0, []
    for ref in refs:
        sg, obj = _object(sheets, ref)
        if obj is None:
            continue
        for band in hedge_bands(sg.model):
            if band.intersects(obj.footprint):
                total += band.area
                x0, y0, x1, y1 = band.bounds
                long_side, short_side = max(x1 - x0, y1 - y0), min(x1 - x0, y1 - y0)
                parts.append(f"{long_side:.1f} m × {short_side:.2f} m band")
    return (round(total, 2), ", ".join(parts)) if parts else (None, "")


def _ids(item) -> str:
    ids = list(item.objects)
    return f"{ids[0]}..{ids[-1]}" if len(ids) > 2 else ", ".join(ids)


def plantings_from_takeoff(takeoff) -> list[Planting]:
    sheets = {sg.sheet: sg for sg in takeoff.sheets}
    out: list[Planting] = []
    for it in takeoff.items:
        if it.kind not in PLANTING_KINDS or it.proposed_count is None:
            continue
        refs = list(it.objects.values())
        source = f"take-off {it.id} {_ids(it)}"
        if it.kind == "tree":
            counts = [v for v in (it.geometry_count, it.spark_count, it.schedule_count, it.label_count) if v is not None]
            centres = [obj.centre for _, obj in (_object(sheets, r) for r in refs) if obj is not None]
            out.append(Planting("tree", it.label, it.proposed_count, None, it.id, list(it.objects), it.agreed,
                                min(counts) if counts else None, _spacing(centres), source=source))
        elif it.kind == "hedge":
            area, how = _hedge_area(sheets, refs)
            out.append(Planting("hedge", it.label, it.proposed_count, area, it.id, list(it.objects), it.agreed,
                                source=f"{source}: {how}, measured by geometry" if how else source))
        else:
            out.append(Planting(it.kind, it.label, None, float(it.proposed_count), it.id, list(it.objects), it.agreed,
                                source=f"{source} (hatched area, geometry)"))
    for ref, v in takeoff.spark.candidates.items():
        if v.get("kind") == "existing_tree":
            out.append(Planting("existing_tree", v.get("label_text") or "", 1, None, "", [ref],
                                source=f"{ref}: Muse Spark says existing tree"))
    return out
