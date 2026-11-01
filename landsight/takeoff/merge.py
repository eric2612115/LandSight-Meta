"""Merge the three sources into take-off items.

Per item (one species or material on the plan sheets):
- geometry_count: what geometry measured itself: closed canopies, hatched areas (m2), plants along a labelled line
  (floor(L/s)+1 per drawn line), planter perimeters (m).
- spark_count: geometry's closed count plus what Muse Spark said the open candidates of this item stand for; None
  when Spark reviewed no candidate for it.
- schedule_count: the plant schedule row read by Spark; label_count: a group leader such as 「8-樟樹」.
- agreed: every available source gives the same number (areas and lengths within 1%) and no member is open.
  Only agreed items get a quote_count; everything else is flagged with the reason (D-04: AI proposes, a person
  confirms). Elevation, detail and legend sheets contribute nothing; legend, title block and schedule regions are
  excluded on plan sheets. When the schedule and the drawing disagree, proposed_count follows the drawing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from shapely.geometry import Point

from landsight.dxf.model import Model, Text
from landsight.geometry import Candidate, CloseResult, Region, expand, is_canopy, spacing_count

PAVING_WORDS = ("磚", "石", "鋪", "混凝土", "P.C", "PC", "瀝青", "PAV")
LAWN_WORDS = ("草皮", "草坪", "LAWN", "TURF")
PLANTER_WORDS = ("花台", "花臺", "植穴", "PLANTER")
KIND_ORDER = ["tree", "hedge", "shrub_bed", "lawn", "paving", "planter_edge", "unresolved"]
OBJECT_PREFIX = {"tree": "T", "hedge": "H", "shrub_bed": "B", "lawn": "L", "paving": "P", "planter_edge": "E",
                 "unresolved": "U"}
UNITS = {"tree": "株", "hedge": "株", "shrub_bed": "m²", "lawn": "m²", "paving": "m²", "planter_edge": "m", "unresolved": ""}


@dataclass
class SheetGeometry:
    sheet: str
    model: Model
    closed: CloseResult
    regions: list[Region]


@dataclass
class SparkFindings:
    sheet_kinds: dict[str, dict] = field(default_factory=dict)  # sheet -> classify_sheet result
    candidates: dict[str, dict] = field(default_factory=dict)  # "L-1/C-03" -> group_and_read verdict
    errors: list[str] = field(default_factory=list)


@dataclass
class Item:
    id: str
    kind: str
    label: str
    unit: str
    sheet: str
    geometry_count: float | None
    spark_count: float | None
    schedule_count: float | None
    label_count: float | None
    agreed: bool
    flagged_reason: str
    quote_count: float | None
    proposed_count: float | None
    objects: dict[str, str] = field(default_factory=dict)  # object id (T-01...) -> geometry ref ("L-1/G-55")


@dataclass
class _Obs:
    kind: str
    species: str
    sheet: str
    ref: str
    geometry: float = 0.0  # this member's contribution to geometry_count
    spark: float | None = None  # this member's Spark contribution (None: Spark not asked)
    label_count: int | None = None
    flag: str = ""
    centre: tuple[float, float] = (0.0, 0.0)


# --------------------------------------------------------------------------------------------- label attachment


def _in_region(regions: list[Region], x: float, y: float) -> bool:
    p = Point(x, y)
    return any(r.polygon.contains(p) for r in regions)


def attach_labels(sg: SheetGeometry) -> dict[str, list[Text]]:
    """Texts that label each shape (G-..) or candidate (C-..): a leader's text goes to the smallest target its tip
    touches (within 0.3 m); an '@spacing' text to the nearest open cluster within 3 m; any other text to the
    smallest shape containing it. Texts inside legend / title / schedule regions are skipped."""
    shapes = [s for s in sg.closed.shapes if not s.excluded]
    cands = [c for c in sg.closed.candidates if not c.excluded]
    out: dict[str, list[Text]] = {}
    leader_texts = set()

    def smallest_at(p: Point, tol: float):
        hits = [(s.polygon.area, s.id) for s in shapes if s.polygon.distance(p) <= tol]
        hits += [(max(c.footprint.area, 1e-3), c.id) for c in cands if min(ln.distance(p) for ln in c.lines) <= tol]
        return min(hits)[1] if hits else None

    for ld in sg.closed.leaders:
        if _in_region(sg.regions, *ld.text.centre):
            continue
        target = smallest_at(Point(ld.tip), 0.3)
        leader_texts.add(id(ld.text))
        if target:
            out.setdefault(target, []).append(ld.text)
    for t in sg.model.texts:
        if id(t) in leader_texts or _in_region(sg.regions, *t.centre):
            continue
        p = Point(t.centre)
        if "@" in t.content and cands:
            d, c = min((min(ln.distance(p) for ln in c.lines), c) for c in cands)
            if d <= 3.0:
                out.setdefault(c.id, []).append(t)
                continue
        inside = [(s.polygon.area, s.id) for s in shapes if s.polygon.contains(p)]
        if inside:
            out.setdefault(min(inside)[1], []).append(t)
    return out


def _legend_entries(sg: SheetGeometry) -> list[tuple[str, str, float]]:
    """(symbol kind 'canopy' or hatch pattern, label, area) for each symbol inside the legend box."""
    legend = [r for r in sg.regions if r.kind == "legend"]
    if not legend:
        return []
    entries = []
    for s in sg.closed.shapes:
        if s.excluded != "legend" or s.area > 0.5 * legend[0].polygon.area:
            continue
        kind = "canopy" if is_canopy(s) else s.hatch_pattern
        if not kind:
            continue
        cx, cy = s.centre
        right = [t for t in sg.model.texts if legend[0].polygon.contains(Point(t.centre))
                 and 0 < t.x - cx < 9 and abs(t.centre[1] - cy) < 1.5]
        if right:
            entries.append((kind, min(right, key=lambda t: t.x).content.strip(), s.area))
    return entries


# --------------------------------------------------------------------------------------------- observations


def _area_kind(species: str) -> str:
    up = species.upper()
    if any(w in up for w in PAVING_WORDS):
        return "paving"
    if any(w in up for w in LAWN_WORDS):
        return "lawn"
    return "shrub_bed"


def candidate_facts(c: Candidate, neighbour_area: float | None) -> str:
    """The geometry facts sent to Muse Spark with a candidate."""
    x0, y0, x1, y1 = c.bbox
    parts = [f"{c.segment_count} separate straight pieces drawn with a solid (continuous) linetype"
             if all(lt.upper() in ("CONTINUOUS", "BYLAYER", "BYBLOCK") for lt in c.linetypes)
             else f"{c.segment_count} pieces, linetypes {sorted(c.linetypes)}"]
    if c.gap_count:
        parts.append(f"{c.gap_count} gaps between piece ends, the largest {c.max_gap:.2f} m")
    parts.append(f"overall {x1 - x0:.1f} m x {y1 - y0:.1f} m, total length {c.length:.1f} m")
    if c.marks:
        parts.append(f"{c.marks} '+' centre mark inside")
    if neighbour_area:
        parts.append(f"the closed round outlines near it are {neighbour_area:.1f} m2 each")
    return "; ".join(parts)


def needs_spark(sg: SheetGeometry, labels: dict[str, list[Text]]) -> list[Candidate]:
    """Open candidates Spark should look at: not excluded and not a labelled row (rows are counted by geometry)."""
    return [c for c in sg.closed.candidates
            if not c.excluded and not any("@" in t.content for t in labels.get(c.id, []))]


def _observe(sg: SheetGeometry, spark: SparkFindings) -> tuple[list[_Obs], list[str]]:
    labels = attach_labels(sg)
    notes: list[str] = []
    obs: list[_Obs] = []
    legend = _legend_entries(sg)
    legend_trees = [lab for kind, lab, _ in legend if kind == "canopy"]

    # trees: closed canopies, species from labels, propagated to identical symbols, else the legend
    canopies = [s for s in sg.closed.shapes if not s.excluded and is_canopy(s)]
    species: dict[str, str] = {}
    group_count: dict[str, int] = {}
    for s in canopies:
        for t in labels.get(s.id, []):
            e = expand(t.content)
            if e.species:
                species[s.id] = e.species
                if e.count and not e.representative:
                    group_count[s.id] = e.count
    seeds = [s for s in canopies if s.id in species]
    for s in canopies:
        if s.id in species:
            continue
        similar = [x for x in seeds if abs(x.area - s.area) <= 0.15 * x.area]
        if similar:
            near = min(similar, key=lambda x: Point(x.centre).distance(Point(s.centre)))
            species[s.id] = species[near.id]
        elif len(legend_trees) == 1:
            species[s.id] = legend_trees[0]
    canopy_area = sorted(s.area for s in canopies)[len(canopies) // 2] if canopies else None
    for s in canopies:
        obs.append(_Obs("tree", species.get(s.id, ""), sg.sheet, f"{sg.sheet}/{s.id}", geometry=1,
                        label_count=group_count.get(s.id), centre=s.centre))

    # open candidates: labelled rows by geometry, the rest by Muse Spark
    for c in sg.closed.candidates:
        if c.excluded:
            continue
        row_labels = [t for t in labels.get(c.id, []) if "@" in t.content]
        if row_labels:
            e = expand(row_labels[0].content)
            lines = [ln for ln in c.lines if ln.length >= 1.0]
            per_line = [spacing_count(ln, e.spacing_m) for ln in lines]
            total = sum(per_line) if len(lines) >= e.rows else max(per_line, default=0) * e.rows
            kind = "hedge" if (e.spacing_m or 0) < 1.0 else "tree"
            obs.append(_Obs(kind, e.species, sg.sheet, f"{sg.sheet}/{c.id}", geometry=total, centre=c.centre))
            notes.append(f"{sg.sheet}/{c.id}: {row_labels[0].content!r} on {len(lines)} line(s) of "
                         f"{', '.join(f'{ln.length:.2f}' for ln in lines)} m -> {total} ({e.rule}, per line)")
            continue
        v = spark.candidates.get(f"{sg.sheet}/{c.id}")
        ref = f"{sg.sheet}/{c.id}"
        if v is None:
            obs.append(_Obs("unresolved", "open outline", sg.sheet, ref, flag=f"{ref}: open line work "
                            f"({c.segment_count} pieces) not reviewed by Muse Spark", centre=c.centre))
            continue
        conf = float(v.get("confidence") or 0)
        said = (f"{ref} open outline ({c.segment_count} pieces, {c.gap_count} gaps up to {c.max_gap:.2f} m): "
                f"Muse Spark says {v['kind']}{' (one object)' if v.get('is_one_object') else ''}, "
                f"label {v.get('label_text') or 'none'!r}, counts {v.get('implies_count')}, confidence {conf:.2f}")
        if v["kind"] in ("tree", "existing_tree", "tree_row") and v.get("is_one_object"):
            sp = expand(v.get("label_text") or "").species
            known = set(species.values()) | set(legend_trees)
            if sp not in known:
                dxf_labels = [expand(t.content).species for t in labels.get(c.id, [])]
                sp = next((x for x in dxf_labels if x), "")
            if not sp and canopy_area and abs(c.footprint.area - canopy_area) <= 0.15 * canopy_area:
                sp = next((species[s.id] for s in canopies if s.id in species), "")
            if not sp and len(legend_trees) == 1:
                sp = legend_trees[0]
            count = 0 if v["kind"] == "existing_tree" else max(int(v.get("implies_count") or 1), 1)
            obs.append(_Obs("tree", sp, sg.sheet, ref, geometry=0, spark=count, flag=said, centre=c.centre))
        elif v["kind"] in ("annotation", "other") and v.get("is_one_object") is not None and conf >= 0.6:
            notes.append(said + " -> not counted")
        else:
            obs.append(_Obs("unresolved", v.get("label_text") or v["kind"], sg.sheet, ref, flag=said, centre=c.centre))

    # areas: hatched shapes with a label (or a legend swatch of the same pattern)
    swatches = {kind: lab for kind, lab, _ in legend if kind not in (None, "canopy")}
    for s in sg.closed.shapes:
        if s.excluded or is_canopy(s):
            continue
        names = [expand(t.content).species for t in labels.get(s.id, [])]
        name = next((n for n in names if n), "")
        if s.hatch_pattern and s.hatch_pattern != "SOLID":
            name = name or swatches.get(s.hatch_pattern, "")
            if not name:
                notes.append(f"{sg.sheet}/{s.id}: unlabelled hatched area {s.area:.1f} m2 ({s.hatch_pattern}) not counted")
                continue
            obs.append(_Obs(_area_kind(name), name, sg.sheet, f"{sg.sheet}/{s.id}", geometry=round(s.area, 2),
                            centre=s.centre))
        elif not s.hatch_pattern and any(w in name.upper() for w in PLANTER_WORDS):
            obs.append(_Obs("planter_edge", name, sg.sheet, f"{sg.sheet}/{s.id}", geometry=round(s.polygon.length, 1),
                            centre=s.centre))
    return obs, notes


# --------------------------------------------------------------------------------------------- merge


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s or "").upper()


def _unit_ok(kind: str, unit: str) -> bool:
    u = unit.replace("㎡", "m²").replace("m2", "m²").strip()
    return {"tree": u in ("株", "棵", "EA", "ea"), "hedge": u in ("株", "棵", "EA", "ea"),
            "planter_edge": u in ("m", "M")}.get(kind, "m²" in u)


def _same(a: float, b: float, kind: str) -> bool:
    if kind in ("tree", "hedge", "unresolved"):
        return round(a) == round(b)
    return abs(a - b) <= 0.01 * max(abs(a), abs(b), 1e-9)


def merge(geometry_result: list[SheetGeometry], spark_results: SparkFindings, schedule_rows: list[dict]) -> list[Item]:
    """Items from all sheets. Elevation / detail / schedule / legend sheets contribute nothing."""
    items, _ = merge_with_notes(geometry_result, spark_results, schedule_rows)
    return items


def merge_with_notes(geometry_result: list[SheetGeometry], spark_results: SparkFindings,
                     schedule_rows: list[dict]) -> tuple[list[Item], list[str]]:
    notes: list[str] = []
    obs: list[_Obs] = []
    for sg in geometry_result:
        kind = (spark_results.sheet_kinds.get(sg.sheet) or {}).get("kind", "plan")
        if kind != "plan":
            n = sum(1 for s in sg.closed.shapes if not s.excluded and is_canopy(s))
            conf = (spark_results.sheet_kinds.get(sg.sheet) or {}).get("confidence")
            notes.append(f"{sg.sheet}: {kind} sheet (Muse Spark, confidence {conf}); {n} round outlines seen, none counted")
            continue
        o, n = _observe(sg, spark_results)
        obs += o
        notes += n

    groups: dict[tuple[str, str], list[_Obs]] = {}
    for o in obs:
        groups.setdefault((o.kind, o.species), []).append(o)

    rows = list(schedule_rows)
    used_rows: set[int] = set()
    items: list[Item] = []
    counters: dict[str, int] = {}
    for (kind, sp), members in sorted(groups.items(), key=lambda kv: (KIND_ORDER.index(kv[0][0]), kv[0][1])):
        members.sort(key=lambda o: (o.sheet, -round(o.centre[1]), o.centre[0]))
        geometry = sum(o.geometry for o in members)
        spark_parts = [o for o in members if o.spark is not None]
        spark = (sum(o.geometry for o in members if o.spark is None) + sum(o.spark for o in spark_parts)
                 if spark_parts else None)
        label_counts = [o.label_count for o in members if o.label_count]
        label = max(label_counts) if label_counts else None
        sched = None
        for i, r in enumerate(rows):
            if i in used_rows or not _unit_ok(kind, r.get("unit", "")):
                continue
            rs = _norm(expand(r.get("species", "")).species or r.get("species", ""))
            if rs and (rs == _norm(sp) or (sp and (rs in _norm(sp) or _norm(sp) in rs))):
                sched = float(r["qty"])
                used_rows.add(i)
                break
        sources = {"geometry": geometry if kind != "unresolved" else None, "Muse Spark": spark, "schedule": sched,
                   "label": label}
        present = {k: v for k, v in sources.items() if v is not None}
        reasons = [o.flag for o in members if o.flag]
        values = list(present.values())
        if values and not all(_same(v, values[0], kind) for v in values):
            reasons.append("sources disagree: " + ", ".join(f"{k} {_fmt(v)}" for k, v in present.items()))
        if not sp and kind != "unresolved":
            reasons.append("species not identified")
        agreed = kind != "unresolved" and not reasons
        proposed = spark if spark is not None else (geometry if kind != "unresolved" else None)
        prefix = OBJECT_PREFIX[kind]
        objects = {}
        for o in members:
            counters[prefix] = counters.get(prefix, 0) + 1
            objects[f"{prefix}-{counters[prefix]:02d}"] = o.ref
        items.append(Item("", kind, sp, UNITS[kind], ",".join(sorted({o.sheet for o in members})),
                          _num(sources["geometry"]), _num(spark), _num(sched), _num(label), agreed,
                          "; ".join(reasons), _num(proposed) if agreed else None, _num(proposed), objects))
    for i, r in enumerate(rows):
        if i not in used_rows:
            kind = "tree" if _unit_ok("tree", r.get("unit", "")) else _area_kind(r.get("species", ""))
            items.append(Item("", kind, r.get("species", ""), r.get("unit", ""), "schedule", 0, None, _num(r["qty"]),
                              None, False, "on the schedule, not found on the drawing", None, 0))
    for n, it in enumerate(items, 1):
        it.id = f"I-{n:02d}"
    return items, notes


def _num(v):
    if v is None:
        return None
    return int(v) if float(v).is_integer() else round(float(v), 2)


def _fmt(v) -> str:
    return str(_num(v))


