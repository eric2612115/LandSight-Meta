"""Sheet furniture that must not be counted: the legend box (圖例 / LEGEND), the title block (圖名 / 工程名稱 / 圖號 /
比例) and the plant schedule (植栽表 / 數量表 / SCHEDULE). A region is the smallest connected group of line work,
holes filled, that contains the keyword text and covers at most 30% of the sheet (so the sheet frame never is)."""

from __future__ import annotations

from dataclasses import dataclass

from shapely.geometry import Point, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from landsight.dxf.model import Model

KEYWORDS = {
    "legend": ("圖例", "LEGEND"),
    "schedule": ("植栽表", "數量表", "SCHEDULE"),
    "title": ("圖名", "工程名稱", "圖號", "比例", "TITLE"),
}


@dataclass
class Region:
    kind: str  # legend | title | schedule
    polygon: BaseGeometry
    text: str


def find_regions(model: Model) -> list[Region]:
    if not model.entities:
        return []
    blobs = unary_union([e.geometry.buffer(0.02) for e in model.entities])
    comps = [Polygon(p.exterior) for p in getattr(blobs, "geoms", [blobs])]
    x0, y0, x1, y1 = model.bounds
    max_area = 0.3 * (x1 - x0) * (y1 - y0)
    regions: list[Region] = []
    for kind, words in KEYWORDS.items():
        for t in model.texts:
            if not any(w in t.content.upper() for w in words):
                continue
            p = Point(t.centre)
            around = [c for c in comps if c.area <= max_area and c.contains(p)]
            if not around:
                continue
            best = min(around, key=lambda c: c.area)
            if any(r.polygon.equals(best) for r in regions):
                continue
            regions.append(Region(kind, best, t.content))
    return regions


def exclude(model: Model, items, regions: list[Region] | None = None) -> list[Region]:
    """Mark every item (shape or candidate, anything with .footprint and .excluded) lying inside a legend, title
    block or schedule region; return the regions found."""
    regions = find_regions(model) if regions is None else regions
    grown = [(r, r.polygon.buffer(0.05)) for r in regions]
    for item in items:
        fp = item.footprint
        for r, g in grown:
            if g.contains(fp):
                item.excluded = r.kind
                break
    return regions


def region_at(regions: list[Region], x: float, y: float) -> Region | None:
    p = Point(x, y)
    return next((r for r in regions if r.polygon.contains(p)), None)
