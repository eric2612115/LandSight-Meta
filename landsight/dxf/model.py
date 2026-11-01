"""Load a DXF into a simple model: line work as shapely LineStrings, TEXT/MTEXT with position and height, hatch
boundaries as polygons. Coordinates are converted to metres from $INSUNITS. Layers are kept but never trusted for
classification. Block references are expanded into their virtual entities."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

import ezdxf
from ezdxf import path as ezpath
from shapely import affinity
from shapely.geometry import LineString, Polygon, box
from shapely.geometry.base import BaseGeometry

LINEWORK = {"LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE", "ELLIPSE", "SPLINE"}
TO_METRES = {0: 1.0, 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1.0, 14: 0.1}  # $INSUNITS -> metres
FLATTEN_M = 0.01


@dataclass
class Entity:
    handle: str
    type: str
    layer: str
    geometry: LineString
    closed: bool
    linetype: str = "Continuous"


@dataclass
class Text:
    handle: str
    layer: str
    x: float
    y: float
    height: float
    content: str
    rotation: float = 0.0

    def footprint(self, pad: float = 0.0) -> Polygon:
        """Approximate box the text occupies (left-baseline insert), padded by `pad` metres."""
        w = self.height * sum(1.0 if ord(c) > 0x2E80 else 0.6 for c in self.content)
        b = box(self.x - pad, self.y - pad, self.x + w + pad, self.y + self.height + pad)
        return affinity.rotate(b, self.rotation, origin=(self.x, self.y)) if self.rotation else b

    @property
    def centre(self) -> tuple[float, float]:
        c = self.footprint().centroid
        return (c.x, c.y)


@dataclass
class Hatch:
    handle: str
    layer: str
    pattern: str
    polygon: BaseGeometry  # Polygon or MultiPolygon (even-odd of all boundary paths)

    @property
    def solid(self) -> bool:
        return self.pattern.upper() == "SOLID"


@dataclass
class Model:
    name: str
    path: str
    entities: list[Entity] = field(default_factory=list)
    texts: list[Text] = field(default_factory=list)
    hatches: list[Hatch] = field(default_factory=list)

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        xs, ys = [], []
        for e in self.entities:
            b = e.geometry.bounds
            xs += [b[0], b[2]]
            ys += [b[1], b[3]]
        for t in self.texts:
            b = t.footprint().bounds
            xs += [b[0], b[2]]
            ys += [b[1], b[3]]
        return (min(xs), min(ys), max(xs), max(ys)) if xs else (0.0, 0.0, 1.0, 1.0)

    def signature(self) -> str:
        """Content hash independent of file path, handles and timestamps (used as a fixture key)."""
        parts = sorted(f"{e.type}:{_r(e.geometry.coords)}" for e in self.entities)
        parts += sorted(f"T:{t.content}:{t.x:.3f}:{t.y:.3f}:{t.height:.3f}" for t in self.texts)
        parts += sorted(f"H:{h.pattern}:{h.polygon.area:.3f}:{_r(h.polygon.centroid.coords)}" for h in self.hatches)
        return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def _r(coords) -> str:
    return ";".join(f"{x:.3f},{y:.3f}" for x, y, *_ in coords)


_MTEXT_CODES = re.compile(r"\\[A-Za-z][^;\\]*;|\\P|[{}]")


def _flatten(entity, scale: float) -> tuple[list[tuple[float, float]], bool] | None:
    try:
        p = ezpath.make_path(entity)
    except (TypeError, ValueError):
        return None
    pts = [(v.x * scale, v.y * scale) for v in p.flattening(FLATTEN_M / max(scale, 1e-9))]
    if len(pts) < 2:
        return None
    closed = bool(getattr(entity, "closed", False)) or (
        entity.dxftype() in ("CIRCLE",) or (entity.dxftype() == "ELLIPSE" and abs(entity.dxf.end_param - entity.dxf.start_param) >= 6.28))
    if closed and pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts, closed


def _linetype(entity, doc) -> str:
    lt = entity.dxf.get("linetype", "BYLAYER")
    if lt.upper() == "BYLAYER" and entity.dxf.layer in doc.layers:
        lt = doc.layers.get(entity.dxf.layer).dxf.get("linetype", "Continuous")
    return lt


def _hatch_polygon(hatch, scale: float) -> BaseGeometry | None:
    shape = None
    for p in ezpath.from_hatch(hatch):
        pts = [(v.x * scale, v.y * scale) for v in p.flattening(FLATTEN_M / max(scale, 1e-9))]
        if len(pts) < 3:
            continue
        poly = Polygon(pts).buffer(0)
        shape = poly if shape is None else shape.symmetric_difference(poly)  # even-odd nesting
    return shape


def _walk(entities, doc, model: Model, scale: float, depth=0):
    for e in entities:
        t = e.dxftype()
        handle = e.dxf.get("handle", "") or f"v{len(model.entities) + len(model.texts)}"
        layer = e.dxf.get("layer", "0")
        if t in LINEWORK:
            got = _flatten(e, scale)
            if got:
                pts, closed = got
                model.entities.append(Entity(handle, t, layer, LineString(pts), closed, _linetype(e, doc)))
        elif t == "TEXT":
            align, p1, p2 = e.get_placement()
            model.texts.append(Text(handle, layer, p1.x * scale, p1.y * scale, e.dxf.height * scale, e.dxf.text,
                                    e.dxf.get("rotation", 0.0)))
        elif t == "MTEXT":
            ins = e.dxf.insert
            content = _MTEXT_CODES.sub("", e.text).strip()
            h = e.dxf.char_height * scale
            model.texts.append(Text(handle, layer, ins.x * scale, ins.y * scale - h, h, content, e.dxf.get("rotation", 0.0)))
        elif t == "HATCH":
            poly = _hatch_polygon(e, scale)
            if poly is not None and not poly.is_empty:
                pattern = "SOLID" if e.dxf.solid_fill else e.dxf.pattern_name
                model.hatches.append(Hatch(handle, layer, pattern, poly))
        elif t == "INSERT" and depth < 8:
            _walk(e.virtual_entities(), doc, model, scale, depth + 1)


def load(path: str | Path) -> Model:
    """Read a DXF file into a Model in metres. The sheet name is the file stem (e.g. 'L-1')."""
    path = Path(path)
    doc = ezdxf.readfile(path)
    scale = TO_METRES.get(doc.header.get("$INSUNITS", 6), 1.0)
    model = Model(name=path.stem, path=str(path))
    _walk(doc.modelspace(), doc, model, scale)
    return model
