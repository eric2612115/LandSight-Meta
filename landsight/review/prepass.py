"""The review's own layer between the drawings and landsight.takeoff (D-32): what the English package's drafting
conventions need before geometry counts anything. Nothing in landsight.takeoff is changed; the take-off runs on a
cleaned copy of each counted sheet, written here.

- CodeBook: plant and finish codes resolved through the plant schedule (CODE | COMMON NAME | BOTANICAL NAME | QTY |
  UNIT ... read from the schedule sheet's DXF text) and the legends ("CC CAMPHOR", "PV-1 PERMEABLE PAVERS", with the
  hatch pattern of each swatch).
- Labels: a leading code gains its name ("CC typ." -> "CC Camphor typ."); a group label written with a space ("8 CC")
  becomes the take-off's group form ("8-CC Camphor"); a paving name gains the word the take-off keys paving on.
- Dashed line work is dropped before geometry: existing trees are drawn dashed with their root protection zone, and
  would otherwise read as two canopies. Each dashed concentric pair becomes an existing-tree object (tag, DBH, status).
- Labelled exclusion zones (a hatch labelled FIRE TRUCK ACCESS LANE, a driveway, a road) are dropped with their labels:
  they are hard-to-green areas, not shrub beds.
- Trees drawn outside the site boundary or inside an exclusion zone are taken out of the take-off and reported as
  excluded objects (drawn, not counted toward greening).
- A boxed finish code that disagrees with the hatch under it (the legend keys the hatch to another code) is recorded;
  the copy follows the hatch and the legend, and the check says which price is in doubt.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from landsight.dxf.model import Model, Text
from landsight.geometry import close, exclude, is_canopy

CONTINUOUS = {"CONTINUOUS", "BYLAYER", "BYBLOCK", ""}
KEEP_LINETYPES = ("PHANTOM", "CENTER", "DIVIDE", "BORDER")  # property lines, match lines: not object outlines
BOUNDARY_LINETYPES = ("PHANTOM", "DIVIDE", "BORDER")
ZONE_WORDS = ("FIRE", "ACCESS LANE", "DRIVEWAY", "ROAD", "PARKING", "LOADING")
LEGEND_CODE = re.compile(r"^\s*([A-Z]{1,3}(?:-\d{1,2})?)\s+(\S.*?)\s*$")
GROUP_SPACE = re.compile(r"^\s*(\d+)\s+([A-Z]{1,3}(?:-\d{1,2})?)\b(.*)$")
LEAD_CODE = re.compile(r"^\s*([A-Z]{1,3}(?:-\d{1,2})?)(?=\s|$)(.*)$")
DBH = re.compile(r"DBH\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b", re.IGNORECASE)
EX_TAG = re.compile(r"^\s*(EX-?\d+)\s*$", re.IGNORECASE)
PAVING_WORDS = ("PAVER", "PAVING", "AGGREGATE", "CONCRETE", "STONE", "GRAVEL", "ASPHALT", "DECK")
LAWN_WORDS = ("LAWN", "TURF", "GRASS", "SOD")


@dataclass
class Code:
    code: str
    name: str  # as the schedule or legend writes it, title case: "Camphor", "Permeable pavers"
    kind: str = ""  # tree | hedge | shrub_bed | lawn | paving | ""
    botanical: str = ""
    qty: float | None = None
    unit: str = ""
    remarks: str = ""
    section: str = ""
    pattern: str | None = None  # the legend swatch's hatch pattern
    sources: list[str] = field(default_factory=list)

    @property
    def takeoff_name(self) -> str:
        """The name written into the take-off's copy: the take-off keys paving on 'PAV' and lawn on 'LAWN'."""
        up = self.name.upper()
        if self.kind == "paving" and "PAV" not in up:
            return f"{self.name} paving"
        if self.kind == "lawn" and not any(w in up for w in ("LAWN", "TURF")):
            return f"{self.name} lawn"
        return self.name

    @property
    def label(self) -> str:
        return f"{self.code} {self.takeoff_name}"

    @property
    def density_per_m2(self) -> float | None:
        m = re.search(r"(\d+(?:\.\d+)?)\s*PLANTS?\s*/\s*m", self.remarks, re.IGNORECASE)
        return float(m.group(1)) if m else None


def _title(s: str) -> str:
    s = s.strip()
    return s[:1].upper() + s[1:].lower() if s.isupper() else s


class CodeBook(dict):
    """code -> Code."""

    def resolve(self, text: str) -> Code | None:
        """The code a label or a bill description names: a leading code ("CC typ."), a code in brackets ("(PV-1)") or a
        name ("Camphor tree")."""
        m = LEAD_CODE.match(text or "")
        if m and m.group(1) in self:
            return self[m.group(1)]
        m = re.search(r"\(([A-Z]{1,3}(?:-\d{1,2})?)\)", text or "")
        if m and m.group(1) in self:
            return self[m.group(1)]
        up = (text or "").upper()
        hits = [c for c in self.values() if c.name and c.name.upper() in up]
        return max(hits, key=lambda c: len(c.name)) if hits else None

    def by_name(self, name: str) -> Code | None:
        """The code whose take-off label, name or code is `name` (an item label after the take-off)."""
        n = (name or "").strip().upper()
        for c in self.values():
            if n in (c.label.upper(), c.takeoff_name.upper(), c.name.upper(), c.code.upper()):
                return c
        return self.resolve(name)

    def finishes(self) -> list[str]:
        """Legend entries keyed to a hatch (area finishes and beds), for the image prompt."""
        return [f"{c.code} {c.name.upper()}" for c in self.values() if c.pattern]


# --------------------------------------------------------------------------------------------- reading


def _rows(texts: list[Text], tol: float = 0.15) -> list[list[Text]]:
    rows: list[list[Text]] = []
    for t in sorted(texts, key=lambda t: -t.y):
        if rows and abs(rows[-1][0].y - t.y) <= tol:
            rows[-1].append(t)
        else:
            rows.append([t])
    return [sorted(r, key=lambda t: t.x) for r in rows]


def read_schedule_text(model: Model) -> list[dict]:
    """The plant schedule as the DXF writes it: one dict per plant row (code, name, botanical, qty, unit, remarks,
    section). Empty when the sheet has no 'CODE' header."""
    texts = [t for t in model.texts if not t.rotation]
    header = next((t for t in texts if t.content.strip().upper() == "CODE"), None)
    if header is None:
        return []
    heads = [t for t in texts if abs(t.y - header.y) <= 0.6 and t.x >= header.x - 0.1]
    names = {"CODE": "code", "COMMON NAME": "name", "BOTANICAL NAME": "botanical", "QTY": "qty", "UNIT": "unit",
             "REMARKS": "remarks", "SPEC": "spec"}
    cols = sorted(((t.x, names[t.content.strip().upper()]) for t in heads if t.content.strip().upper() in names))
    if len(cols) < 4:
        return []
    out, section = [], ""
    for row in _rows([t for t in texts if t.y < header.y - 0.3 and t.x >= header.x - 0.3]):
        if len(row) == 1:
            word = row[0].content.strip()
            if word.isupper() and not word.startswith("TOTAL") and len(word) > 3:
                section = word
            continue
        cells: dict[str, str] = {}
        for t in row:
            col = max((c for c in cols if c[0] <= t.x + 0.2), default=cols[0])[1]
            cells[col] = (cells.get(col, "") + " " + t.content.strip()).strip()
        if not cells.get("code") or not cells.get("name"):
            continue
        try:
            qty = float(cells.get("qty", "").replace(",", ""))
        except ValueError:
            qty = None
        remarks = cells.get("remarks", "")
        if not remarks and len(row) > 6:  # remarks sit right of the spec columns
            remarks = row[-1].content.strip()
        out.append({"code": cells["code"], "name": cells["name"], "botanical": cells.get("botanical", ""), "qty": qty,
                    "unit": cells.get("unit", ""), "remarks": remarks, "section": section})
    return out


def _schedule_kind(row: dict) -> str:
    sec, name, unit = row["section"].upper(), row["name"].upper(), row["unit"].replace("m2", "m²")
    if sec.startswith("TREE"):
        return "tree"
    if any(w in name for w in LAWN_WORDS) or "ZOYSIA" in row["botanical"].upper():
        return "lawn"
    if "@" in row["remarks"] and "m²" not in unit:
        return "hedge"
    return "shrub_bed" if "m²" in unit else "shrub"


def legend_entries(model: Model) -> list[tuple[str, str, str | None, str]]:
    """(code, name, hatch pattern or None, symbol kind) for every coded entry inside the sheet's legend box."""
    result = close(model)
    regions = exclude(model, result.shapes + result.candidates)
    legends = [r for r in regions if r.kind == "legend"]
    out = []
    for lg in legends:
        box = lg.polygon.buffer(0.05)
        symbols = [s for s in result.shapes if s.excluded == "legend" and s.area < 0.5 * lg.polygon.area]
        for t in model.texts:
            if not box.contains(Point(t.centre)):
                continue
            m = LEGEND_CODE.match(t.content)
            if not m:
                continue
            cy = t.centre[1]
            left = [s for s in symbols if s.centre[0] < t.x and abs(s.centre[1] - cy) < 1.2]
            sym = max(left, key=lambda s: s.centre[0]) if left else None
            kind = "canopy" if sym is not None and is_canopy(sym) else ("swatch" if sym is not None and sym.hatch_pattern
                                                                         else "line")
            out.append((m.group(1), m.group(2), sym.hatch_pattern if sym is not None else None, kind))
    return out


def codebook(models: dict[str, Model], schedule_sheets: list[str], legend_sheets: list[str]) -> CodeBook:
    book = CodeBook()
    for sid in schedule_sheets:
        for row in read_schedule_text(models[sid]):
            c = book.setdefault(row["code"], Code(row["code"], _title(row["name"])))
            c.name, c.botanical, c.qty, c.unit = _title(row["name"]), row["botanical"], row["qty"], row["unit"]
            c.remarks, c.section, c.kind = row["remarks"], row["section"], _schedule_kind(row)
            c.sources.append(f"{sid} schedule")
    for sid in legend_sheets:
        for code, name, pattern, symbol in legend_entries(models[sid]):
            c = book.get(code)
            if c is None:
                c = book[code] = Code(code, _title(name))
                up = name.upper()
                c.kind = ("tree" if symbol == "canopy" else
                          "paving" if code.startswith("PV") or any(w in up for w in PAVING_WORDS) else
                          "lawn" if any(w in up for w in LAWN_WORDS) else
                          "hedge" if symbol == "line" else "shrub_bed")
            if pattern and not c.pattern:
                c.pattern = pattern.upper()
            c.sources.append(f"{sid} legend")
    return book


# --------------------------------------------------------------------------------------------- one sheet


@dataclass
class ExistingTree:
    tag: str
    centre: tuple[float, float]
    canopy_r: float
    rpz_r: float | None
    label: str
    dbh_m: float | None
    to_be_removed: bool
    handles: list[str]


@dataclass
class Exclusion:
    kind: str  # outside_boundary | in_zone
    centre: tuple[float, float]
    outline: list[tuple[float, float]]
    area_m2: float
    reason: str
    zone: str = ""  # the zone's label
    handles: list[str] = field(default_factory=list)


@dataclass
class Zone:
    label: str
    polygon: object
    area_m2: float
    pattern: str
    handles: list[str]


@dataclass
class HatchMismatch:
    label: str  # the boxed code as written
    label_code: str
    hatch: str
    hatch_code: str
    centre: tuple[float, float]
    area_m2: float
    outline: list[tuple[float, float]]


@dataclass
class Prepass:
    sheet: str
    boundary: object | None = None  # shapely Polygon of the site
    existing: list[ExistingTree] = field(default_factory=list)
    zones: list[Zone] = field(default_factory=list)
    excluded: list[Exclusion] = field(default_factory=list)
    mismatches: list[HatchMismatch] = field(default_factory=list)
    dropped_dashed: int = 0
    relabelled: dict[str, tuple[str, str]] = field(default_factory=dict)  # text handle -> (before, after)
    drop: set[str] = field(default_factory=set)  # entity handles left out of the take-off's copy
    notes: list[str] = field(default_factory=list)


def _dashed(lt: str) -> bool:
    up = (lt or "").upper()
    return up not in CONTINUOUS and not up.startswith(KEEP_LINETYPES)


def _boundary(model: Model):
    rings = [Polygon(e.geometry.coords) for e in model.entities
             if e.closed and (e.linetype or "").upper().startswith(BOUNDARY_LINETYPES) and len(e.geometry.coords) >= 4]
    rings = [r for r in rings if r.is_valid and r.area > 10]
    return max(rings, key=lambda r: r.area) if rings else None


def _ring(poly) -> list[tuple[float, float]]:
    return [(round(x, 3), round(y, 3)) for x, y, *_ in poly.exterior.coords]


def analyse(sheet: str, model: Model, book: CodeBook) -> Prepass:
    """Everything the cleaned copy leaves out or relabels, and why (see the module docstring)."""
    from landsight.takeoff.merge import SheetGeometry, attach_labels

    out = Prepass(sheet)
    result = close(model)
    regions = exclude(model, result.shapes + result.candidates)
    furniture = [r.polygon.buffer(0.05) for r in regions]

    def in_furniture(x, y) -> bool:
        p = Point(x, y)
        return any(f.contains(p) for f in furniture)

    out.boundary = _boundary(model)

    # existing trees: dashed concentric closed curves
    dashed = [e for e in model.entities if _dashed(e.linetype)]
    circles = []
    for e in dashed:
        if e.closed and len(e.geometry.coords) >= 8:
            poly = Polygon(e.geometry.coords)
            if poly.is_valid and poly.area > 0.5 and 4 * math.pi * poly.area / poly.length ** 2 > 0.85:
                circles.append((poly, e))
    used = set()
    for i, (poly, e) in enumerate(sorted(circles, key=lambda pe: pe[0].area)):
        if e.handle in used:
            continue
        c = poly.centroid
        ring = [(q, f) for q, f in circles if f.handle not in used and q.centroid.distance(c) < 0.5]
        handles = [f.handle for _, f in ring]
        used |= set(handles)
        radii = sorted(math.sqrt(q.area / math.pi) for q, _ in ring)
        canopy = Polygon(poly.exterior)
        tag = next((t.content.strip().upper() for t in model.texts
                    if EX_TAG.match(t.content) and canopy.contains(Point(t.centre))), "")
        label = ""
        for ld in result.leaders:
            if any(Point(ld.tip).distance(q.exterior) < 0.3 for q, _ in ring):
                label = ld.text.content
                break
        if not label:
            near = [t for t in model.texts if ("EXISTING" in t.content.upper() or DBH.search(t.content))
                    and Point(t.centre).distance(c) < 12]
            label = min(near, key=lambda t: Point(t.centre).distance(c)).content if near else ""
        m = DBH.search(label)
        dbh = None
        if m:
            v, unit = float(m.group(1)), m.group(2).lower()
            dbh = v / 100 if unit == "cm" else v / 1000 if unit == "mm" else v
        out.existing.append(ExistingTree(tag or f"EX-{len(out.existing) + 1:02d}", (round(c.x, 3), round(c.y, 3)),
                                         round(radii[0], 2), round(radii[-1], 2) if len(radii) > 1 else None, label,
                                         dbh, "REMOVE" in label.upper(), handles))
    out.drop |= {e.handle for e in dashed}
    out.dropped_dashed = len(dashed)

    # exclusion zones: hatches labelled as fire lanes, driveways, roads (by a text inside or by their legend swatch)
    swatch_names = {c.pattern: c.name for c in book.values() if c.pattern}
    legend_words = {}
    for t in model.texts:  # uncoded legend entries, such as "FIRE TRUCK ACCESS LANE"
        if in_furniture(*t.centre) and any(w in t.content.upper() for w in ZONE_WORDS):
            legend_words[t.content.strip()] = t
    for h in model.hatches:
        if h.solid or in_furniture(*h.polygon.centroid.coords[0]):
            continue
        inside = [t for t in model.texts if h.polygon.contains(Point(t.centre))]
        label = next((t.content for t in inside if any(w in t.content.upper() for w in ZONE_WORDS)), "")
        if not label and h.pattern.upper() not in swatch_names:
            for word, t in legend_words.items():  # the legend's swatch to the left of an uncoded zone label
                sw = [s for s in result.shapes if s.excluded == "legend" and s.hatch_pattern == h.pattern.upper()
                      and abs(s.centre[1] - t.centre[1]) < 1.2]
                if sw:
                    label = word
                    break
        if not label:
            continue
        out.zones.append(Zone(label, h.polygon, round(h.polygon.area, 2), h.pattern.upper(), [h.handle]))
        out.drop.add(h.handle)
        out.drop |= {t.handle for t in inside if not book.resolve(t.content) or any(w in t.content.upper() for w in ZONE_WORDS)}

    # trees outside the boundary or inside a zone
    targets = [(s.polygon, s.handles, s.centre) for s in result.shapes if not s.excluded and is_canopy(s)]
    targets += [(c.footprint, c.handles, c.centre) for c in result.candidates if not c.excluded]
    for poly, handles, (cx, cy) in targets:
        p = Point(cx, cy)
        if any(set(handles) & set(x.handles) for x in out.existing):
            continue
        zone = next((z for z in out.zones if z.polygon.contains(p)), None)
        if out.boundary is not None and not out.boundary.buffer(0.01).contains(p):
            out.excluded.append(Exclusion("outside_boundary", (cx, cy), _ring(poly.convex_hull), round(poly.area, 2),
                                          "outside the site boundary: drawn, not counted toward greening",
                                          handles=list(handles)))
        elif zone is not None:
            out.excluded.append(Exclusion("in_zone", (cx, cy), _ring(poly.convex_hull), round(poly.area, 2),
                                          f"inside the {zone.label.split('—')[0].strip().lower()}: an area where "
                                          "greening cannot count", zone.label, list(handles)))
        else:
            continue
        out.drop |= set(handles)

    # labels: codes resolved; hatch vs boxed code
    sg = SheetGeometry(sheet, model, result, regions)
    labels = attach_labels(sg)
    for s in result.shapes:
        if s.excluded or not s.hatch_pattern or s.hatch_pattern == "SOLID":
            continue
        hatch_code = next((c for c in book.values() if c.pattern == s.hatch_pattern), None)
        for t in labels.get(s.id, []):
            lab = book.resolve(t.content)
            if lab is None or hatch_code is None or lab.code == hatch_code.code or not lab.pattern:
                continue
            out.mismatches.append(HatchMismatch(t.content.strip(), lab.code, s.hatch_pattern, hatch_code.code,
                                                s.centre, round(s.area, 2), _ring(s.polygon)))
            out.relabelled[t.handle] = (t.content, hatch_code.label)
    for t in model.texts:
        if t.handle in out.relabelled or t.handle in out.drop:
            continue
        if any(r.kind in ("title", "schedule") and r.polygon.buffer(0.05).contains(Point(t.centre)) for r in regions):
            continue
        new = relabel(t.content, book)
        if new != t.content:
            out.relabelled[t.handle] = (t.content, new)
    return out


def relabel(text: str, book: CodeBook) -> str:
    """'CC typ.' -> 'CC Camphor typ.'; '8 CC' -> '8-CC Camphor'; 'DU H0.6 @0.3m o.c. DOUBLE ROW' -> 'DU Duranta H0.6
    @0.3m DOUBLE ROW'; 'AZ AZALEA' -> 'AZ Azalea'; 'PV-2 EXPOSED AGGREGATE' -> 'PV-2 Exposed aggregate paving'."""
    m = GROUP_SPACE.match(text)
    if m and m.group(2) in book:
        return f"{m.group(1)}-{book[m.group(2)].label}{_rest(m.group(3), book[m.group(2)])}"
    m = LEAD_CODE.match(text)
    if m and m.group(1) in book:
        return f"{book[m.group(1)].label}{_rest(m.group(2), book[m.group(1)])}"
    return text


def _rest(rest: str, code: Code) -> str:
    r = re.sub(r"\bo\.?c\.?(?=\s|$)", "", rest, flags=re.IGNORECASE)
    for word in sorted({code.name.upper(), code.takeoff_name.upper()}, key=len, reverse=True):
        r = re.sub(rf"^\s*{re.escape(word)}\b", "", r, flags=re.IGNORECASE)
    r = re.sub(r"\s{2,}", " ", r).rstrip()
    return (" " + r.strip()) if r.strip() else ""


def write_clean(src: Path, pre: Prepass, dest: Path) -> Path:
    """The take-off's copy of a sheet: the original DXF without the dropped entities and with the labels relabelled."""
    import ezdxf

    doc = ezdxf.readfile(src)
    msp = doc.modelspace()
    for e in list(msp):
        h = e.dxf.get("handle", "")
        if h in pre.drop:
            msp.delete_entity(e)
        elif h in pre.relabelled:
            new = pre.relabelled[h][1]
            if e.dxftype() == "TEXT":
                e.dxf.text = new
            elif e.dxftype() == "MTEXT":
                e.text = new
    dest.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(dest)
    return dest


def zone_union(pre: Prepass):
    return unary_union([z.polygon for z in pre.zones]) if pre.zones else None
