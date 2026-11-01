"""Close loose line work into shapes and keep what stays open as candidate clusters.

Method: centre marks ("+") and leader lines are set aside first. The remaining lines are noded; every free end
(a node of degree one) is bridged to the nearest free end within `snap_tol_m` whose direction continues the line
(within 50 degrees at both ends), else to the nearest point on another line it points at (within 25 degrees, a
T-gap); gaps under 6 cm close whatever the directions. Bridges are new segments, so the original geometry is never moved. Then polygonize: faces become shapes
(shell area, layer set, the hatch that coincides with them); cut edges and dangles stay open and are grouped into
candidate clusters by proximity (buffer-union connected components, `cluster_eps_m`). The direction rule is what
keeps two canopies 13.6 cm apart from being bridged to each other while a 20 cm gap inside one canopy closes.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field

import shapely
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.strtree import STRtree

from landsight.dxf.model import Model, Text

COS_PAIR = math.cos(math.radians(50))
COS_TEE = math.cos(math.radians(25))
NEAR_M = 0.06


@dataclass
class Shape:
    id: str
    polygon: BaseGeometry  # shell (holes filled)
    area: float
    layers: set[str]
    handles: list[str]
    hatch_pattern: str | None = None
    hatch_layer: str | None = None
    source: str = "linework"  # linework | hatch | linework+hatch
    marks: int = 0  # "+" centre marks inside
    excluded: str | None = None

    @property
    def centre(self) -> tuple[float, float]:
        c = self.polygon.centroid
        return (round(c.x, 3), round(c.y, 3))

    @property
    def circularity(self) -> float:
        p = self.polygon.length
        return 4 * math.pi * self.polygon.area / (p * p) if p else 0.0

    @property
    def footprint(self) -> BaseGeometry:
        return self.polygon


@dataclass
class Candidate:
    id: str
    lines: list[LineString]
    handles: list[str]
    layers: set[str]
    linetypes: set[str]
    segment_count: int
    gap_count: int
    max_gap: float
    length: float
    marks: int = 0
    excluded: str | None = None

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        return tuple(round(v, 3) for v in unary_union(self.lines).bounds)

    @property
    def centre(self) -> tuple[float, float]:
        x0, y0, x1, y1 = self.bbox
        return (round((x0 + x1) / 2, 3), round((y0 + y1) / 2, 3))

    @property
    def footprint(self) -> BaseGeometry:
        return unary_union(self.lines).convex_hull

    def signature(self) -> str:
        import hashlib

        parts = sorted(";".join(f"{x:.3f},{y:.3f}" for x, y in ln.coords) for ln in self.lines)
        return hashlib.sha256("\n".join(parts).encode()).hexdigest()


@dataclass
class Leader:
    text: Text
    line: LineString
    tip: tuple[float, float]  # the end away from the text
    handle: str


@dataclass
class CloseResult:
    sheet: str
    shapes: list[Shape]
    candidates: list[Candidate]
    leaders: list[Leader]
    marks: list[tuple[float, float]]
    bridges: list[LineString] = field(default_factory=list)
    snap_tol: float = 0.0


def _key(pt) -> tuple[float, float]:
    return (round(pt[0], 6), round(pt[1], 6))


def _unit(a, b) -> tuple[float, float]:
    dx, dy = a[0] - b[0], a[1] - b[1]
    n = math.hypot(dx, dy) or 1.0
    return (dx / n, dy / n)


def _centre_marks(model: Model) -> tuple[list[tuple[float, float]], set[int]]:
    """Two short straight lines crossing at their midpoints at right angles: a '+' centre mark."""
    short = [i for i, e in enumerate(model.entities)
             if not e.closed and len(e.geometry.coords) == 2 and 0.1 <= e.geometry.length <= 1.5]
    used: set[int] = set()
    marks = []
    for n, i in enumerate(short):
        if i in used:
            continue
        a = model.entities[i].geometry
        for j in short[n + 1:]:
            if j in used:
                continue
            b = model.entities[j].geometry
            if abs(a.length - b.length) > 0.25 * max(a.length, b.length):
                continue
            ma, mb = a.interpolate(0.5, normalized=True), b.interpolate(0.5, normalized=True)
            if ma.distance(mb) > 0.1 * a.length:
                continue
            ua, ub = _unit(a.coords[1], a.coords[0]), _unit(b.coords[1], b.coords[0])
            if abs(ua[0] * ub[0] + ua[1] * ub[1]) > 0.2:
                continue
            marks.append((round((ma.x + mb.x) / 2, 3), round((ma.y + mb.y) / 2, 3)))
            used |= {i, j}
            break
    return marks, used


def _leaders(model: Model, skip: set[int]) -> tuple[list[Leader], set[int]]:
    """Open line work with one free end at a text: a leader (annotation, not an object)."""
    geoms = [e.geometry for e in model.entities]
    tree = STRtree(geoms)
    pads = [(t, t.footprint(pad=max(0.25, 0.5 * t.height))) for t in model.texts]
    leaders, used = [], set()
    for i, e in enumerate(model.entities):
        if i in skip or e.closed:
            continue
        c = list(e.geometry.coords)
        for end, other in ((c[0], c[-1]), (c[-1], c[0])):
            p = Point(end)
            text = next((t for t, fp in pads if fp.contains(p)), None)
            if text is None:
                continue
            touching = [j for j in tree.query(p, predicate="dwithin", distance=1e-4) if j != i]
            if touching:
                continue
            leaders.append(Leader(text, e.geometry, (other[0], other[1]), e.handle))
            used.add(i)
            break
    return leaders, used


def _bridges(lines: list[LineString], tol: float) -> list[LineString]:
    if tol <= 0 or not lines:
        return []
    noded = unary_union(lines)
    edges = [g for g in getattr(noded, "geoms", [noded]) if g.length > 0]
    degree: Counter = Counter()
    ends = []
    for k, e in enumerate(edges):
        c = e.coords
        for pt, prev in ((c[0], c[1]), (c[-1], c[-2])):
            degree[_key(pt)] += 1
            ends.append((_key(pt), (pt[0], pt[1]), _unit(pt, prev), k))
    free = [x for x in ends if degree[x[0]] == 1]
    if not free:
        return []
    near = min(NEAR_M, tol / 4)  # below this a gap closes whatever the directions (corner overshoots, 1-2 cm slips)
    pts = [Point(x[1]) for x in free]
    pt_tree = STRtree(pts)
    left, right = pt_tree.query(pts, predicate="dwithin", distance=tol)
    pairs = []
    for a, b in zip(left, right):
        if a >= b:
            continue
        (_, pa, da, ka), (_, pb, db, kb) = free[a], free[b]
        d = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
        if d == 0 or (ka == kb and edges[ka].length < 3 * d):
            continue
        v = ((pb[0] - pa[0]) / d, (pb[1] - pa[1]) / d)
        if d > near and (da[0] * v[0] + da[1] * v[1] < COS_PAIR or -(db[0] * v[0] + db[1] * v[1]) < COS_PAIR):
            continue
        pairs.append((d, a, b))
    used: set[int] = set()
    bridges = []
    for d, a, b in sorted(pairs):
        if a in used or b in used:
            continue
        used |= {a, b}
        bridges.append(LineString([free[a][1], free[b][1]]))
    edge_tree = STRtree(edges)
    for a, (_, pa, da, ka) in enumerate(free):
        if a in used:
            continue
        p = Point(pa)
        best = None
        for k in edge_tree.query(p, predicate="dwithin", distance=tol):
            if k == ka:
                continue
            q = edges[k].interpolate(edges[k].project(p))
            d = p.distance(q)
            if d == 0:
                continue
            v = ((q.x - pa[0]) / d, (q.y - pa[1]) / d)
            if d > near and da[0] * v[0] + da[1] * v[1] < COS_TEE:
                continue
            if best is None or d < best[0]:
                best = (d, q)
        if best:
            d, q = best
            over = 1e-4 / d  # overshoot a hair so the bridge crosses the target line and gets noded
            bridges.append(LineString([pa, (q.x + (q.x - pa[0]) * over, q.y + (q.y - pa[1]) * over)]))
    return bridges


def _iou(a: BaseGeometry, b: BaseGeometry) -> float:
    inter = a.intersection(b).area
    union = a.area + b.area - inter
    return inter / union if union else 0.0


def close(model: Model, snap_tol_m: float = 0.25, cluster_eps_m: float = 0.6) -> CloseResult:
    """Closed shapes and open candidate clusters of one sheet. See the module docstring for the method."""
    marks, mark_idx = _centre_marks(model)
    leaders, leader_idx = _leaders(model, mark_idx)
    work = [i for i in range(len(model.entities)) if i not in mark_idx and i not in leader_idx]
    lines = [model.entities[i].geometry for i in work]
    bridges = _bridges(lines, snap_tol_m)

    noded = unary_union(lines + bridges) if lines else None
    edges = [g for g in getattr(noded, "geoms", [noded])] if noded is not None else []
    polys, cuts, dangles, invalid = shapely.polygonize_full(edges) if edges else ([], [], [], [])
    faces = [f for f in getattr(polys, "geoms", []) if f.area > 1e-4]
    open_edges = [g for coll in (cuts, dangles, invalid) for g in getattr(coll, "geoms", []) if g.length > 1e-6]

    ent_tree = STRtree(lines) if lines else None
    shapes: list[Shape] = []
    for f in faces:
        shell = Polygon(f.exterior)
        ring = f.exterior.buffer(1e-4)
        layers, handles = set(), []
        for k in ent_tree.query(ring, predicate="intersects"):
            if lines[k].intersection(ring).length > 1e-2:
                e = model.entities[work[k]]
                layers.add(e.layer)
                handles.append(e.handle)
        shapes.append(Shape("", shell, round(shell.area, 3), layers, handles))

    for h in model.hatches:
        if h.solid and h.polygon.area < 0.01:
            continue
        match = max(shapes, key=lambda s: _iou(s.polygon, h.polygon), default=None)
        if match is not None and match.hatch_pattern is None and _iou(match.polygon, h.polygon) >= 0.95:
            match.hatch_pattern, match.hatch_layer, match.source = h.pattern.upper(), h.layer, "linework+hatch"
            match.layers.add(h.layer)
        else:
            shapes.append(Shape("", h.polygon, round(h.polygon.area, 3), {h.layer}, [h.handle], h.pattern.upper(),
                                h.layer, "hatch"))

    # open line work, per original entity
    open_tree = STRtree(open_edges) if open_edges else None
    open_parts: dict[int, list[LineString]] = defaultdict(list)
    if open_tree is not None:
        for k, g in enumerate(lines):
            env = g.buffer(1e-5)
            for j in open_tree.query(g, predicate="intersects"):
                if env.contains(open_edges[j]):
                    open_parts[k].append(open_edges[j])
    candidates: list[Candidate] = []
    if open_parts:
        keys = sorted(open_parts)
        parts = {k: unary_union(open_parts[k]) for k in keys}
        blobs = unary_union([parts[k].buffer(cluster_eps_m / 2) for k in keys])
        comps = list(getattr(blobs, "geoms", [blobs]))
        comp_tree = STRtree(comps)
        groups: dict[int, list[int]] = defaultdict(list)
        for k in keys:
            hit = comp_tree.query(parts[k].representative_point(), predicate="intersects")
            groups[int(hit[0]) if len(hit) else -1].append(k)
        for members in groups.values():
            candidates.append(_candidate(model, work, lines, ent_tree, members, parts, cluster_eps_m))

    # centre marks belong to the smallest shape or open cluster around them
    for x, y in marks:
        p = Point(x, y)
        holders = [(s.polygon.area, s) for s in shapes if s.hatch_pattern is None and s.polygon.contains(p)]
        holders += [(c.footprint.area, c) for c in candidates if c.footprint.contains(p)]
        if holders:
            min(holders, key=lambda t: t[0])[1].marks += 1

    order = lambda xy: (-round(xy[1], 0), xy[0])  # noqa: E731  (reading order: top to bottom, left to right)
    shapes.sort(key=lambda s: order(s.centre))
    candidates.sort(key=lambda c: order(c.centre))
    for n, s in enumerate(shapes, 1):
        s.id = f"G-{n:02d}"
    for n, c in enumerate(candidates, 1):
        c.id = f"C-{n:02d}"
    return CloseResult(model.name, shapes, candidates, leaders, marks, bridges, snap_tol_m)


def _candidate(model, work, lines, tree, members, parts, eps) -> Candidate:
    ents = [model.entities[work[k]] for k in members]
    geoms = [parts[k] for k in members]
    flat = [g for geom in geoms for g in getattr(geom, "geoms", [geom])]
    ends = []  # free ends: line ends that touch no other line of the sheet
    for k in members:
        c = lines[k].coords
        for pt in (c[0], c[-1]):
            if not [j for j in tree.query(Point(pt), predicate="dwithin", distance=1e-4) if j != k]:
                ends.append(pt)
    gaps = []
    for i, a in enumerate(ends):
        others = [math.hypot(a[0] - b[0], a[1] - b[1]) for j, b in enumerate(ends) if j != i]
        near = [d for d in others if d <= eps]
        if near:
            gaps.append(min(near))
    return Candidate("", flat, [e.handle for e in ents], {e.layer for e in ents}, {e.linetype for e in ents},
                     len(ents), len(gaps) // 2, round(max(gaps), 3) if gaps else 0.0,
                     round(sum(g.length for g in flat), 3))


# --------------------------------------------------------------------------------------------- shape kinds


def is_canopy(shape: Shape) -> bool:
    """A tree canopy in plan: round, unhatched, between 0.5 and 150 m2."""
    return shape.hatch_pattern is None and shape.circularity >= 0.85 and 0.5 <= shape.area <= 150


def canopy_shapes(model: Model) -> list[BaseGeometry]:
    """Canopy outlines for the coloured render: closed round shapes, plus open rings around a '+' (a coloured
    presentation plan fills every canopy, however the line work was drawn)."""
    r = close(model)
    hulls = []
    for c in r.candidates:
        hull = c.footprint
        if c.marks and hull.length and 4 * math.pi * hull.area / hull.length ** 2 >= 0.85:
            hulls.append(hull)
    return [s.polygon for s in r.shapes if is_canopy(s)] + hulls


def hedge_bands(model: Model, min_len: float = 2.0, max_sep: float = 1.0) -> list[BaseGeometry]:
    """Pairs of parallel straight lines with free ends, 0.1-1.0 m apart: a hedge drawn as a band."""
    geoms = [e.geometry for e in model.entities]
    tree = STRtree(geoms)

    def free(i, pt):
        return not [j for j in tree.query(Point(pt), predicate="dwithin", distance=1e-4) if j != i]

    straight = [i for i, e in enumerate(model.entities)
                if not e.closed and len(e.geometry.coords) == 2 and e.geometry.length >= min_len
                and all(free(i, pt) for pt in e.geometry.coords)]
    bands, used = [], set()
    for n, i in enumerate(straight):
        a = geoms[i]
        ua = _unit(a.coords[1], a.coords[0])
        for j in straight[n + 1:]:
            if i in used or j in used:
                continue
            b = geoms[j]
            ub = _unit(b.coords[1], b.coords[0])
            if abs(ua[0] * ub[0] + ua[1] * ub[1]) < 0.995 or not 0.1 <= a.distance(b) <= max_sep:
                continue
            if abs(a.length - b.length) > 0.2 * max(a.length, b.length):
                continue
            bands.append(MultiPoint(list(a.coords) + list(b.coords)).convex_hull)
            used |= {i, j}
    return bands

