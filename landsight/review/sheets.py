"""Every DXF and every vector PDF page becomes a Sheet (docs/API.md): its title block (read from the DXF text, or by
Muse Spark from the render), its kind (Muse Spark; a keyword rule when Spark is unavailable), the scale the title
block states and the scale measured from the scale bar (or a dimension), and whether it is counted, with the reason
when it is not."""

from __future__ import annotations

import hashlib
import re
import statistics
from dataclasses import dataclass, field

from shapely.geometry import Point

from landsight.dxf.model import Model

TITLE_KEYS = {"project": ("PROJECT",), "works": ("WORKS",), "title": ("TITLE",),
              "number": ("DRAWING NO", "DWG NO", "SHEET NO"), "scale": ("SCALE",), "revision": ("REV",),
              "date": ("DATE",), "site_area": ("SITE AREA",), "coverage": ("BUILDING COVERAGE", "COVERAGE"),
              "ground": ("GROUND",)}
STANDARD_SCALES = (1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 1250, 2000, 2500, 5000)
NUMBER = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(m)?\s*$", re.IGNORECASE)
RATIO = re.compile(r"1\s*:\s*(\d+)")


@dataclass
class SheetDraft:
    sheet_id: str
    file_id: str
    source: str  # dxf | pdf_vector | pdf_raster
    path: str
    page: int | None = None
    model: Model | None = None
    png: bytes = b""
    key: str = ""  # content key for Muse Spark
    fields: dict = field(default_factory=dict)  # title block as read from the drawing's own text
    spark: dict | None = None  # Muse Spark's classify answer
    spark_error: str = ""
    kind: str = "plan"
    kind_confidence: float = 0.0
    kind_by: str = "rule"
    kind_why: str = ""
    discipline: str = ""
    number: str = ""
    title: str = ""
    revision: str = ""
    date: str = ""
    scale_title: str = ""
    scale_measured: str = ""
    units_per_m: float | None = None
    scale_how: str = ""
    frame_w: float | None = None
    match_line: dict | None = None  # {"centre", "text"} when geometry finds one
    scale_bar: dict | None = None
    counted: bool = False
    not_counted_reason: str = ""
    title_by: str = "geometry"
    floor_read: dict | None = None  # Muse Spark's read of the floors a sheet stands for and its soil depths (tower)
    bounds: tuple = (0.0, 0.0, 1.0, 1.0)


# --------------------------------------------------------------------------------------------- title block


def title_fields(model: Model) -> dict[str, str]:
    """The title block fields, by row: a key text and the nearest text to its right on the same row. The first match
    per field wins, searching from the bottom right (where title blocks sit), so a drawing index's 'TITLE' column
    header does not shadow the title block's."""
    from landsight.geometry import title_block

    out: dict[str, str] = {}
    try:
        tb = title_block(model)
    except Exception:
        tb = {}
    for field_name, keys in TITLE_KEYS.items():
        for k, v in tb.items():
            if any(k.upper().startswith(key) for key in keys) and field_name not in out:
                out[field_name] = v.strip()
    texts = [t for t in model.texts if not t.rotation]
    for field_name, keys in TITLE_KEYS.items():
        if field_name in out:
            continue
        cands = [t for t in texts if any(t.content.strip().upper().rstrip(".:") == key or
                                         t.content.strip().upper().startswith(key + ".") for key in keys)]
        for t in sorted(cands, key=lambda t: (-t.x, t.y)):
            row = [u for u in texts if u is not t and u.x > t.x and abs(u.centre[1] - t.centre[1]) < 0.6 * max(t.height, u.height)
                   and u.x - t.x < 40 * t.height]
            if row:
                out[field_name] = min(row, key=lambda u: u.x).content.strip()
                break
    return out


def page_fields(text: str) -> dict[str, str]:
    """Title block fields from a PDF page's extracted text, where a key line is followed by its value line."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out: dict[str, str] = {}
    for i, ln in enumerate(lines[:-1]):
        up = ln.upper().rstrip(".:")
        for field_name, keys in TITLE_KEYS.items():
            if field_name not in out and any(up == key or up == key + "." for key in keys):
                out[field_name] = lines[i + 1]
    return out


# --------------------------------------------------------------------------------------------- scale


def scale_bar(model: Model) -> dict | None:
    """A graphic scale: three or more number labels on one row, starting at 0, increasing, the last one ending in 'm'.
    Returns {units_per_m, labels, centre}; the label offsets cancel because every label is placed the same way."""
    nums = []
    for t in model.texts:
        m = NUMBER.match(t.content)
        if m and not t.rotation:
            nums.append((t, float(m.group(1)), bool(m.group(2))))
    best = None
    for t0, v0, _ in nums:
        if v0 != 0:
            continue
        row = sorted([(t, v, unit) for t, v, unit in nums if abs(t.y - t0.y) < 0.05 and t.x >= t0.x],
                     key=lambda r: r[0].x)
        vals = [v for _, v, _ in row]
        if len(row) < 3 or vals != sorted(vals) or len(set(vals)) != len(vals) or not row[-1][2]:
            continue
        span = row[-1][0].x - row[0][0].x
        u = span / (row[-1][1] - row[0][1])
        if u <= 0:
            continue
        cand = {"units_per_m": round(u, 4), "labels": [t.content for t, _, _ in row],
                "centre": (round((row[0][0].x + row[-1][0].x) / 2 + 0.15, 3), round(row[0][0].y + 0.6, 3))}
        if best is None or len(row) > len(best["labels"]):
            best = cand
    return best


def dimension_scale(model: Model) -> float | None:
    """Units per metre from dimensions: a number in millimetres ('1500') or metres ('4.0 M ...') written along a
    straight line with a tick at each end. The median over all dimensions found; None when there are none."""
    lines = [e.geometry for e in model.entities if len(e.geometry.coords) == 2 and not e.closed]
    ticks = [ln for ln in lines if ln.length < 1.0]
    found = []
    for t in model.texts:
        m = re.match(r"^\s*(\d{3,5})\s*$", t.content) or re.match(r"^\s*(\d+(?:\.\d+)?)\s*M\b", t.content)
        if not m:
            continue
        metres = float(m.group(1)) / (1000 if len(m.groups()) and t.content.strip().isdigit() else 1)
        if metres <= 0:
            continue
        c = Point(t.centre)
        for ln in lines:
            if ln.length < 4 * t.height or ln.distance(c) > 2.5 * t.height:
                continue
            ends = [Point(ln.coords[0]), Point(ln.coords[-1])]
            if all(any(tk.distance(e) < 1e-3 and tk is not ln for tk in ticks) for e in ends):
                found.append(ln.length / metres)
                break
    return round(statistics.median(found), 4) if found else None


def frame_width(model: Model) -> float:
    x0, _, x1, _ = model.bounds
    return x1 - x0


def snap_scale(denominator: float) -> str:
    best = min(STANDARD_SCALES, key=lambda s: abs(s - denominator) / s)
    return f"1:{best}" if abs(best - denominator) / best <= 0.06 else f"1:{denominator:.0f}"


def measure_scales(drafts: list[SheetDraft]) -> float | None:
    """Fill scale_measured on every DXF sheet with a scale bar or a dimension. The sheet's content scale is its frame
    width in metres of site (frame width ÷ units per metre) over the paper width the package's own sheets agree on
    (the median of frame width ÷ (units per metre × stated scale) over sheets that state a ratio and carry a scale
    bar). Returns that paper width in metres."""
    papers = []
    for d in drafts:
        if d.source != "dxf" or d.model is None:
            continue
        d.frame_w = frame_width(d.model)
        bar = scale_bar(d.model)
        if bar:
            d.scale_bar, d.units_per_m, d.scale_how = bar, bar["units_per_m"], "scale bar"
        else:
            u = dimension_scale(d.model)
            if u:
                d.units_per_m, d.scale_how = u, "dimension"
        m = RATIO.search(d.scale_title or "")
        if bar and m:
            papers.append(d.frame_w / (bar["units_per_m"] * int(m.group(1))))
    if not papers:
        return None
    paper = statistics.median(papers)
    for d in drafts:
        if d.units_per_m and d.frame_w:
            d.scale_measured = snap_scale(d.frame_w / d.units_per_m / paper)
    return paper


# --------------------------------------------------------------------------------------------- kinds and counting

RULE_KINDS = [("ELEVATION", "elevation"), ("SECTION", "detail"), ("DETAIL", "detail"), ("SCHEDULE", "schedule"),
              ("LEGEND", "legend"), ("COVER", "cover"), ("INDEX", "cover"), ("IRRIGATION", "background"),
              ("LIGHTING", "background"), ("DRAINAGE", "background")]


def rule_kind(title: str) -> str:
    up = (title or "").upper()
    return next((k for word, k in RULE_KINDS if word in up), "plan")


def match_line(model: Model) -> dict | None:
    """A match line: the words MATCH LINE beside a long centre-linetype (or plain) line."""
    t = next((t for t in model.texts if "MATCH LINE" in t.content.upper()), None)
    if t is None:
        return None
    c = Point(t.centre)
    lines = [e for e in model.entities if not e.closed and e.geometry.length > 5 and e.geometry.distance(c) < 2.0]
    line = min(lines, key=lambda e: e.geometry.distance(c), default=None)
    mid = line.geometry.interpolate(0.5, normalized=True) if line is not None else c
    return {"text": t.content, "centre": (round(mid.x, 3), round(mid.y, 3)),
            "linetype": line.linetype if line is not None else "", "line": list(line.geometry.coords) if line is not None else []}


def content_key(*parts) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p if isinstance(p, bytes) else str(p).encode())
    return h.hexdigest()


def decide_kind(d: SheetDraft) -> None:
    sp = d.spark
    if sp:
        d.kind, d.kind_by = sp.get("kind", "plan"), "spark"
        d.kind_confidence = float(sp.get("confidence") or 0.0)
        d.kind_why = sp.get("why", "")
        d.discipline = sp.get("discipline", "")
    else:
        d.kind, d.kind_by = rule_kind(d.title), "rule"
        d.kind_confidence = 0.5
        d.kind_why = f"title keyword rule ({d.spark_error or 'Muse Spark not asked'})"


def decide_counted(drafts: list[SheetDraft]) -> None:
    """Counted: a DXF plan sheet, the latest revision of its number, not an enlarged part plan. Everything else says
    why it is not counted."""
    dxf_numbers = {d.number for d in drafts if d.source == "dxf" and d.number}
    for d in drafts:
        d.counted = False
        if d.source != "dxf":
            same = f"the DXF of {d.number} is measured" if d.number in dxf_numbers else "a PDF is not measured"
            d.not_counted_reason = f"PDF page of {d.number or 'a sheet'}: {same}"
            continue
        if d.kind == "plan":
            later = [o for o in drafts if o is not d and o.source == "dxf" and o.number == d.number and o.kind == "plan"
                     and (o.date, o.revision) > (d.date, d.revision)]
            enlarged = bool(d.match_line) or bool((d.spark or {}).get("enlarged_partial")) or bool((d.spark or {}).get("match_line"))
            if later:
                newest = max(later, key=lambda o: (o.date, o.revision))
                d.not_counted_reason = f"superseded by Rev {newest.revision} ({newest.date}) of {d.number}"
            elif enlarged:
                d.not_counted_reason = ("enlarged plan of part of the site (match line" + (" found" if d.match_line else "")
                                        + "): its trees are already on the full plan")
            elif d.discipline in ("metalwork",):
                d.not_counted_reason = "a metalwork drawing: not a landscape quantity"
            elif d.discipline in ("irrigation", "lighting", "other"):
                d.not_counted_reason = f"{d.discipline} plan: the planting is background line work"
            else:
                d.counted = True
            continue
        d.not_counted_reason = {
            "elevation": "elevation: the same plants seen from the side",
            "detail": "detail sheet: read for the tree pit, not measured" if d.discipline != "metalwork"
            else "metalwork detail: not a landscape quantity",
            "schedule": "schedule sheet: read for the plant list, not measured",
            "legend": "legend sheet: symbols, not plants",
            "cover": "cover and drawing index: nothing to measure",
            "background": f"{d.discipline or 'other trade'} plan: the planting is background line work",
        }.get(d.kind, f"{d.kind} sheet")
