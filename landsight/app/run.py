"""The backend half of docs/API.md: open a package (a folder of files), run the pipeline on every DXF, and shape the
result into a `Run` (files, sheets, items, checks, tally, timing) plus the director's scene list.

This is the m4 path (`POST /api/package/open?site=m4`): opening with no path generates the m4 synthetic site plus the
stand-in tree-pit detail L-6 (tests/fixtures/detail), files are triaged by extension only, and `errors` is an empty
scoreboard. The default path is the real package through landsight.review (landsight/app/package.py). Every string
the API returns is English (landsight/app/english.py).

Four features of the film's conditional builds each sit behind a flag (FEATURES; switch one off with
LANDSIGHT_FEATURES_OFF=grounding_points,... or RunState(features=...)), and each degrades to the plain run when its
recording is missing: grounding_points (Item.spark.points), spark_legend (Muse Spark reads the legend and writes
SAM's prompts; else the hand-typed probe prompts), sam_control (the same word on line work and on colour), and
pit_downgrade (the L-6 tree pit read by Muse Spark, and the greening check before and after the §5 downgrade)."""

from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import re
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Point, Polygon

from landsight.app.english import code, deep, en, label
from landsight.dxf import metres_per_pixel, render_png, render_svg, render_window
from landsight.geometry import is_canopy, title_block
from landsight.geometry.labels import expand
from landsight.meta.sam_plan import legend_crop, prompts_from_legend, type_masks
from landsight.meta.spark import MODEL as SPARK_MODEL
from landsight.meta.spark import ground_points
from landsight.rules.greening import fmt_n
from landsight.rules.species import lookup
from landsight.synth import LEVELS, generate

REPO = Path(__file__).resolve().parents[2]
M4_DIR = REPO / ".cache" / "sites" / "m4"
SAM_FIXTURES = REPO / "tests" / "fixtures" / "sam"  # the hand-typed probe (docs/research/sam-probe.md)
SAM_LEGEND_FIXTURES = SAM_FIXTURES / "spark_legend"  # SAM prompted with Muse Spark's legend words
STANDIN_DETAIL = REPO / "tests" / "fixtures" / "detail" / "L-6.dxf"  # until the package generator's L-6 exists
VERSION = "0.1.0"
FEATURES = ("grounding_points", "spark_legend", "sam_control", "pit_downgrade",
            "upload")  # upload: POST /api/projects/{id}/packages/upload, a dropped folder (D-81)
ON_SEGMENT_M = 0.3  # a grounding point within this distance of a red segment is "on" it
PAPER = "#f7f5f0"

UNIT = {"株": "plant", "棵": "plant", "m²": "m2", "m2": "m2", "m": "m"}
NOT_COUNTED = {"elevation": "elevation: the same plants drawn from the side", "detail": "detail sheet: not a quantity",
               "schedule": "schedule sheet: read for the plant list, not measured",
               "legend": "legend sheet: symbols, not plants"}
EXT_VERDICT = {  # extension triage until landsight/ingest exists: (verdict, why)
    ".dxf": ("drawing_vector", "DXF: vector drawing, measured by geometry"),
    ".bak": ("backup_ignored", "AutoCAD backup copy: ignored"),
    ".png": ("drawing_image", "image: kept for reference, not measured"),
    ".jpg": ("drawing_image", "image: kept for reference, not measured"),
    ".jpeg": ("drawing_image", "image: kept for reference, not measured"),
    ".xlsx": ("bill", "spreadsheet: read as a bill once the bill reader lands"),
    ".xls": ("unsupported", "Excel 97-2003: save as .xlsx"),
    ".pdf": ("unsupported", "PDF: not read yet (ingest pending)"),
    ".zip": ("unsupported", "archive: not unpacked yet (ingest pending)"),
    ".pptx": ("presentation", "slide deck: not a drawing"),
}
SKIP = {"answer_key.json", ".DS_Store"}
_RENDERS: dict[tuple[str, str], bytes] = {}  # (drawing content hash, kind) -> bytes, shared by every open
TITLE_KEYS = {"title": ("圖名", "TITLE"), "number": ("圖號", "DRAWING NO", "SHEET NO", "DWG NO"), "date": ("日期", "DATE"),
              "scale": ("比例", "SCALE"), "revision": ("版次", "REV")}


def features_from_env(**overrides) -> dict[str, bool]:
    """Every feature on, except those named in LANDSIGHT_FEATURES_OFF (comma-separated) or overridden."""
    off = {f.strip() for f in os.environ.get("LANDSIGHT_FEATURES_OFF", "").split(",") if f.strip()}
    return {f: f not in off for f in FEATURES} | {k: bool(v) for k, v in overrides.items() if k in FEATURES}


def _r(v) -> float:
    return round(float(v), 3)


def _ring(geom) -> list[list[float]]:
    return [[_r(x), _r(y)] for x, y, *_ in geom.coords]


def _field(fields: dict, names) -> str | None:
    for k, v in fields.items():
        if any(n in k.upper() for n in names):
            return v
    return None


def gap_points(candidate, eps: float = 0.6) -> list[tuple[list[float], float]]:
    """One point per pair of facing free ends of an open outline: (where, gap in metres)."""
    ends = []
    for k, ln in enumerate(candidate.lines):
        c = list(ln.coords)
        ends += [(k, c[0]), (k, c[-1])]
    used, out = set(), []
    for i, (ki, a) in enumerate(ends):
        if i in used:
            continue
        best = None
        for j, (kj, b) in enumerate(ends):
            if j != i and j not in used and kj != ki:
                d = math.dist(a, b)
                if d <= eps and (best is None or d < best[0]):
                    best = (d, j, b)
        if best and best[0] > 1e-3:
            d, j, b = best
            used |= {i, j}
            out.append(([_r((a[0] + b[0]) / 2), _r((a[1] + b[1]) / 2)], round(d, 2)))
    return out


def triage(folder: Path) -> tuple[list[dict], list[Path]]:
    files, dxfs = [], []
    for n, p in enumerate(sorted(x for x in folder.rglob("*") if x.is_file() and x.name not in SKIP
                                 and not x.name.startswith(".")), 1):
        verdict, why = EXT_VERDICT.get(p.suffix.lower(), ("unsupported", f"{p.suffix or 'no extension'}: not a format Landsight reads"))
        files.append({"file_id": f"F-{n:02d}", "path": str(p.relative_to(folder)), "name": p.name, "ext": p.suffix.lower(),
                      "size_bytes": p.stat().st_size, "verdict": verdict, "decided_by": "ext", "why": why})
        if verdict == "drawing_vector":
            dxfs.append(p)
    return files, dxfs


class RunState:
    """The last opened package, its take-off and the person's confirmations."""

    def __init__(self, features: dict[str, bool] | None = None):
        self.features = features_from_env(**(features or {}))
        self.spark = None  # the Muse Spark client of the last open (fixtures or live)
        self.takeoff = None
        self.pristine = None
        self.folder: Path | None = None
        self.files: list[dict] = []
        self.live = False
        self.run_id = ""
        self.confirmed: set[str] = set()
        self.sheet_ids: dict[str, str] = {}  # model name (file stem) -> sheet_id
        self.cache: dict[str, bytes] = {}
        self._sam: dict | None = None

    # ------------------------------------------------------------------------------------------ open
    def open(self, path: str | None = None, live: bool = False) -> dict:
        from landsight.meta import FixtureSpark, SparkClient
        from landsight.takeoff import run

        if path:
            folder = Path(path).expanduser().resolve()
            if not folder.is_dir():
                raise ValueError(f"not a folder: {path}")
        else:
            generate(M4_DIR, LEVELS["m4"])
            if STANDIN_DETAIL.is_file():  # the stand-in L-6 tree-pit detail (D-38)
                (M4_DIR / STANDIN_DETAIL.name).write_bytes(STANDIN_DETAIL.read_bytes())
            folder = M4_DIR
        if live and not os.environ.get("MODEL_API_KEY"):
            raise ValueError("live mode needs MODEL_API_KEY")
        files, dxfs = triage(folder)
        if not dxfs:
            raise ValueError(f"no DXF drawings in {folder}")
        started = time.monotonic()
        self.spark = SparkClient() if live else FixtureSpark()
        self.takeoff = run([str(p) for p in dxfs], self.spark, read_details=self.features["pit_downgrade"])
        self.takeoff.seconds = round(time.monotonic() - started, 2)
        self.pristine = copy.deepcopy(self.takeoff.items)
        self.folder, self.files, self.live = folder, files, live
        self.confirmed, self.cache, self._sam = set(), {}, None
        self.run_id = hashlib.sha256(f"{folder}{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest()[:12]
        self._assign_sheet_ids(dxfs)
        return self.run()

    def _assign_sheet_ids(self, dxfs: list[Path]):
        self.sheet_ids, taken = {}, set()
        for sg in self.takeoff.sheets:
            number = _field(title_block(sg.model, sg.regions), TITLE_KEYS["number"]) or sg.sheet
            sid = number if number not in taken else sg.sheet
            taken.add(sid)
            self.sheet_ids[sg.sheet] = sid
        for f in self.files:
            stem = Path(f["name"]).stem
            if stem in self.sheet_ids and f["verdict"] == "drawing_vector":
                f["sheet_id"] = self.sheet_ids[stem]

    def confirm(self, item_id: str) -> dict:
        item = next((it for it in self.takeoff.items if it.id == item_id), None) if self.takeoff else None
        if item is None:
            raise KeyError(item_id)
        if not item.agreed:
            item.agreed = True
            item.quote_count = item.proposed_count
            self.confirmed.add(item_id)
            self.takeoff.recheck()
        return next(i for i in self.run()["items"] if i["item_id"] == item_id)

    # ------------------------------------------------------------------------------------------ lookups
    def sheet_geometry(self, sheet_id: str):
        name = next((n for n, s in self.sheet_ids.items() if s == sheet_id), None)
        return next((sg for sg in self.takeoff.sheets if sg.sheet == name), None) if self.takeoff else None

    def _obj(self, ref: str):
        name, gid = ref.split("/", 1)
        sg = next((s for s in self.takeoff.sheets if s.sheet == name), None)
        obj = next((x for x in sg.closed.shapes + sg.closed.candidates if x.id == gid), None) if sg else None
        return sg, obj

    def render(self, sheet_id: str, kind: str) -> bytes | None:
        sg = self.sheet_geometry(sheet_id)
        if sg is None or kind not in ("svg", "png", "filled.png"):
            return None
        if f"sig:{sheet_id}" not in self.cache:
            self.cache[f"sig:{sheet_id}"] = sg.model.signature()
        key = (self.cache[f"sig:{sheet_id}"], kind)
        if key not in _RENDERS:
            if kind == "svg":
                _RENDERS[key] = render_svg(sg.model, paper=PAPER).encode()
            else:
                _RENDERS[key] = render_png(sg.model, filled=kind == "filled.png")
        return _RENDERS[key]

    def crop(self, item_id: str) -> bytes | None:
        it = next((i for i in self.takeoff.items if i.id == item_id), None) if self.takeoff else None
        if it is None:
            return None
        return next((self.takeoff.crops[r] for r in it.objects.values() if r in self.takeoff.crops), None)

    # ------------------------------------------------------------------------------------------ the Run
    def run(self) -> dict:
        t = self.takeoff
        objects_by_sheet, oid_of_ref = self._objects()
        items = [self._item(it, oid_of_ref) for it in t.items]
        sam = self._sam_results(objects_by_sheet)
        checks = self._checks(items, objects_by_sheet, sam)
        sheets = [self._sheet(sg, objects_by_sheet.get(self.sheet_ids[sg.sheet], []),
                              any(c["image"] == "filled" for c in sam.get(self.sheet_ids[sg.sheet], {}).get("calls", [])))
                  for sg in t.sheets]
        folder = self.folder
        shown = str(folder.relative_to(REPO)) if folder.is_relative_to(REPO) else str(folder)
        name = "m4 synthetic site" if folder == M4_DIR else folder.name
        out = {
            "run_id": self.run_id,
            "package": {"name": name, "folder": shown, "file_count": len(self.files)},
            "files": self.files,
            "sheets": sheets,
            "items": items,
            "checks": checks,
            "errors": {"planted": 0, "found": [], "flagged": [], "missed": [], "false_alarms": []},
            "tally": self._tally(items),
            "timing": self._timing(sam),
            "features": dict(self.features),
        }
        if folder == M4_DIR and STANDIN_DETAIL.is_file():
            out["package"]["note"] = "the m4 synthetic site, plus a stand-in tree-pit detail L-6 until the sample package exists"
        return deep(out)

    def _timing(self, sam) -> dict:
        """Wall time of this open, and every Meta call with its recorded time (fixtures carry the real call's seconds;
        nothing here is typed in)."""
        spark = [{"model": SPARK_MODEL, "call": c["call"], "seconds": c.get("seconds"), "recorded": bool(c.get("fixture"))}
                 for c in (self.spark.log if self.spark is not None else [])]
        sam_calls = [{"model": "sam-3.1", "call": f'"{c["prompt"]}" on {sid} {c["image"]}', "seconds": c["seconds"],
                      "recorded": True, "prompt_source": c["prompt_source"]}
                     for sid, entry in sam.items() for c in entry["calls"]]
        return {"total_s": self.takeoff.seconds, "spark_calls": len(spark), "sam_calls": len(sam_calls),
                "recorded": not self.live, "spark_s": round(sum(c["seconds"] or 0 for c in spark), 2),
                "sam_s": round(sum(c["seconds"] or 0 for c in sam_calls), 2), "calls": spark + sam_calls}

    def _sheet(self, sg, objects: list[dict], has_filled: bool) -> dict:
        sid = self.sheet_ids[sg.sheet]
        fields = title_block(sg.model, sg.regions)
        k = self.takeoff.spark.sheet_kinds.get(sg.sheet) or {}
        kind = k.get("kind", "plan")
        failed = k.get("why") == "classification failed"
        x0, y0, x1, y1 = render_window(sg.model)
        out = {"sheet_id": sid, "file_id": next((f["file_id"] for f in self.files if f.get("sheet_id") == sid), ""),
               "title": label(_field(fields, TITLE_KEYS["title"]) or sg.sheet), "number": _field(fields, TITLE_KEYS["number"]) or sid,
               "kind": kind, "kind_confidence": k.get("confidence", 0.0), "kind_by": "rule" if failed else "spark",
               "kind_why": en(k.get("why", "")), "date": _field(fields, TITLE_KEYS["date"]),
               "revision": _field(fields, TITLE_KEYS["revision"]), "scale_title": _field(fields, TITLE_KEYS["scale"]),
               "scale_measured": None, "counted": kind == "plan",
               "svg_url": f"/api/sheets/{sid}.svg", "png_url": f"/api/sheets/{sid}.png",
               "bounds": {"min_x": _r(x0), "min_y": _r(y0), "max_x": _r(x1), "max_y": _r(y1)},
               "objects": objects}
        if kind != "plan":
            out["not_counted_reason"] = NOT_COUNTED.get(kind, f"{kind} sheet")
        if has_filled:
            out["filled_png_url"] = f"/api/sheets/{sid}.filled.png"
        if sg.sheet in self.takeoff.details:
            d = self.takeoff.details[sg.sheet]
            out["detail"] = {k: d.get(k) for k in ("pit_w_m", "pit_l_m", "soil_depth_m", "on_slab", "why", "seconds")}
            out["detail"] |= {"by": "spark", "recorded": bool(d.get("fixture"))}
        return out

    def _objects(self) -> tuple[dict[str, list[dict]], dict[str, str]]:
        t = self.takeoff
        by_sheet: dict[str, list[dict]] = {}
        oid_of_ref: dict[str, str] = {}
        for it in t.items:
            for n, (oid, ref) in enumerate(it.objects.items()):
                sg, obj = self._obj(ref)
                if obj is None:
                    continue
                oid_of_ref[ref] = oid
                sid = self.sheet_ids[sg.sheet]
                is_open = ref.split("/")[1].startswith("C-")
                rec = {"object_id": oid, "item_id": it.id, "kind": it.kind if it.kind != "unresolved" else "tree",
                       "label": label(it.label), "species_code": code(it.label), "centre": [_r(v) for v in obj.centre],
                       "closed": not is_open, "by": "geometry"}
                if is_open:
                    rec["segments"] = [_ring(ln) for ln in obj.lines]
                    outline = obj.footprint
                    if it.kind == "hedge":
                        from landsight.geometry import hedge_bands

                        bands = [b for b in hedge_bands(sg.model) if b.intersects(obj.footprint)]
                        outline = bands[0] if bands else outline
                    else:
                        gaps = gap_points(obj)
                        rec["gaps"] = [g for g, _ in gaps]
                        rec["gap_sizes_m"] = [d for _, d in gaps]
                        rec["by"] = "spark" if ref in t.spark.candidates else "geometry"
                    rec["outline"] = _ring(outline.exterior)
                    rec["area_m2"] = round(outline.area, 2)
                    if it.kind == "hedge":
                        rec["length_m"] = round(sum(ln.length for ln in obj.lines if ln.length >= 1.0), 2)
                else:
                    rec["outline"] = _ring(obj.polygon.exterior)
                    rec["area_m2"] = round(obj.area, 2)
                    if it.kind == "planter_edge":
                        rec["length_m"] = round(obj.polygon.length, 2)
                rec["tag_at"] = self._tag_at(it.kind, obj.centre, n, rec["outline"])
                by_sheet.setdefault(sid, []).append(rec)
        x = 0
        for sg in t.sheets:
            sid = self.sheet_ids[sg.sheet]
            kind = (t.spark.sheet_kinds.get(sg.sheet) or {}).get("kind", "plan")
            region_kind = {"legend": "legend", "title": "title_block", "schedule": "schedule"}
            for r in sg.regions:
                x += 1
                by_sheet.setdefault(sid, []).append({
                    "object_id": f"X-{x:02d}", "kind": region_kind[r.kind], "label": f"{r.kind} box",
                    "outline": _ring(r.polygon.exterior), "closed": True, "by": "geometry",
                    "excluded": {"reason": f"sheet furniture ({'title block' if r.kind == 'title' else r.kind}): not counted",
                                 "rule": "geometry: smallest frame around the keyword (D-10)"}})
            for s in sg.closed.shapes:
                if s.excluded == "legend" and (is_canopy(s) or s.hatch_pattern):
                    x += 1
                    by_sheet[sid].append({"object_id": f"X-{x:02d}", "kind": "legend",
                                          "label": "legend symbol" if is_canopy(s) else "legend swatch",
                                          "centre": [_r(v) for v in s.centre], "area_m2": round(s.area, 2),
                                          "outline": _ring(s.polygon.exterior), "closed": True, "by": "geometry",
                                          "excluded": {"reason": "inside the legend box: a key, not a plant",
                                                       "rule": "geometry: legend region"}})
                elif kind != "plan" and not s.excluded and is_canopy(s):
                    x += 1
                    by_sheet.setdefault(sid, []).append({
                        "object_id": f"X-{x:02d}", "kind": "tree", "label": "round outline",
                        "centre": [_r(v) for v in s.centre], "area_m2": round(s.area, 2),
                        "outline": _ring(s.polygon.exterior), "closed": True, "by": "geometry",
                        "excluded": {"reason": f"{NOT_COUNTED.get(kind, kind + ' sheet')}; not counted",
                                     "rule": "Muse Spark: sheet kind"}})
        return by_sheet, oid_of_ref

    @staticmethod
    def _tag_at(kind, centre, index, outline) -> list[float]:
        cx, cy = centre
        if kind == "tree":
            ys = [p[1] for p in outline] or [cy]
            return [_r(cx), _r(max(ys) + 1.2 if index % 2 == 0 else min(ys) - 1.2)]
        if kind == "hedge":
            return [_r(min(p[0] for p in outline) - 1.8), _r(cy)]
        return [_r(cx), _r(cy + 1.8)]

    def _item(self, it, oid_of_ref) -> dict:
        t = self.takeoff
        sheets = sorted({self.sheet_ids[r.split("/")[0]] for r in it.objects.values()})
        out = {"item_id": it.id, "kind": it.kind, "label": label(it.label), "species_code": code(it.label),
               "unit": UNIT.get(it.unit, it.unit or "plant"), "geometry_count": it.geometry_count,
               "spark_count": it.spark_count, "schedule_count": it.schedule_count, "label_count": it.label_count,
               "agreed": it.agreed, "flagged_reason": None, "quote_count": it.quote_count,
               "proposed_count": it.proposed_count, "object_ids": list(it.objects), "sheet_ids": sheets,
               "confirmed": it.id in self.confirmed}
        sp = lookup(it.label)
        if sp and sp.botanical:
            out["botanical"] = sp.botanical
        reviewed = [(oid_of_ref.get(r), r) for r in it.objects.values() if r in t.spark.candidates]
        if reviewed:
            oid, ref = reviewed[0]
            v, req = t.spark.candidates[ref], t.requests.get(ref, {})
            answer = v if self.features["grounding_points"] else {k: x for k, x in v.items() if k != "points"}
            out["spark"] = {"crop_url": f"/api/crops/{it.id}.png", "object_id": oid, "answer": answer, "why": v.get("why", ""),
                            "confidence": v.get("confidence"), "facts": req.get("facts", ""),
                            "seconds": req.get("seconds"), "recorded": bool(req.get("fixture")),
                            "crop_px": req.get("crop_px"), "crop_window_m": req.get("window")}
            out["spark"] |= self._points(ref, v, req)
        if it.flagged_reason:
            out["flagged_reason"] = self._reason(it, reviewed, oid_of_ref)
        return out

    def _points(self, ref: str, verdict: dict, req: dict) -> dict:
        """Muse Spark's grounding points on the crop (0-1000) in crop pixels and drawing metres, each with its distance
        to the nearest red segment; null, with the reason, when the feature is off or Spark returned none."""
        if not self.features["grounding_points"]:
            return {"points": None, "points_status": "off", "points_note": "grounding points are switched off"}
        raw = verdict.get("points")
        if not raw or not req.get("window") or not req.get("crop_px"):
            return {"points": None, "points_status": "none_returned",
                    "points_note": "Muse Spark returned no grounding points for this candidate"}
        pts = ground_points(raw, req["crop_px"], req["window"])
        _, cand = self._obj(ref)
        for pt in pts:
            pt["to_segment_m"] = round(min(ln.distance(Point(pt["m"])) for ln in cand.lines), 3) if cand else None
        dists = [pt["to_segment_m"] for pt in pts if pt["to_segment_m"] is not None]
        on = sum(1 for d in dists if d <= ON_SEGMENT_M)
        worst = max(dists, default=None)
        return {"points": pts, "points_status": "returned",
                "points_note": (f"Muse Spark placed {len(pts)} points; {on} lie within {ON_SEGMENT_M} m of a red segment"
                                + (f", the farthest {worst:.2f} m" if worst is not None else "")),
                "points_on_segments": on, "points_max_to_segment_m": worst}

    def _reason(self, it, reviewed, oid_of_ref) -> str:
        parts = []
        for oid, ref in reviewed:
            _, c = self._obj(ref)
            v = self.takeoff.spark.candidates[ref]
            parts.append(f"{oid} is an open outline ({c.segment_count} pieces, {c.gap_count} gaps up to {c.max_gap:.2f} m); "
                         f"Muse Spark says {'one ' if v.get('is_one_object') else ''}{v.get('kind')} "
                         f"(confidence {float(v.get('confidence') or 0):.2f})")
        src = {"geometry": it.geometry_count, "Muse Spark": it.spark_count, "plant schedule": it.schedule_count,
               "group label": it.label_count}
        present = {k: v for k, v in src.items() if v is not None}
        if len(set(present.values())) > 1:
            parts.append("sources disagree: " + ", ".join(f"{k} {v}" for k, v in present.items()))
        if not parts:
            parts.append(en(it.flagged_reason))
        return "; ".join(parts)

    # ------------------------------------------------------------------------------------------ SAM (recorded)
    def _sam_results(self, objects_by_sheet) -> dict[str, dict]:
        """Per plan sheet, the SAM 3.1 calls replayed for this run's renders (filled, or line work), and which path
        wrote the prompts: "spark_legend" when Muse Spark read the sheet's legend and every prompt built from its words
        has a recorded SAM answer on this exact image, else "manual" (the hand-typed probe prompts)."""
        if self._sam is not None:
            return self._sam
        self._sam = {}

        def load_dir(d: Path) -> list[dict]:
            return [json.loads(f.read_text()) for f in sorted(d.glob("*.json"))] if d.is_dir() else []

        manual, from_legend = load_dir(SAM_FIXTURES), load_dir(SAM_LEGEND_FIXTURES)
        if not manual and not from_legend:
            return self._sam
        from landsight.meta.sam import decode

        for sg in self.takeoff.sheets:
            sid = self.sheet_ids[sg.sheet]
            if (self.takeoff.spark.sheet_kinds.get(sg.sheet) or {}).get("kind") != "plan":
                continue
            shas = {"filled": hashlib.sha256(self.render(sid, "filled.png")).hexdigest(),
                    "lines": hashlib.sha256(self.render(sid, "png")).hexdigest()}
            which = {rec["image_sha256"]: k for k, v in shas.items() for rec in manual + from_legend if v == rec["image_sha256"]}
            mine = [r for r in manual if r["image_sha256"] in which]
            filled = [r for r in mine if which[r["image_sha256"]] == "filled"]
            lines = [r for r in mine if which[r["image_sha256"]] == "lines"]
            source, legend = "manual", None
            if self.features["spark_legend"]:
                legend = self._read_legend(sg, sid)
                if legend and legend.get("prompts"):
                    recorded = {r["prompt"]: r for r in from_legend if r["image_sha256"] == shas["filled"]}
                    missing = [q["prompt"] for q in legend["prompts"] if q["prompt"] not in recorded]
                    if missing:
                        legend["note"] = (f"no recorded SAM answer for {', '.join(repr(m) for m in missing)} on this image: "
                                          "the hand-typed prompts ran instead")
                    else:
                        source, filled = "spark_legend", [recorded[q["prompt"]] for q in legend["prompts"]]
            if not filled and not lines:
                continue
            calls = []
            for rec in filled + lines:
                masks, _ = decode(rec["raw_output"])
                kind = which.get(rec["image_sha256"], "filled")
                calls.append({"prompt": rec["prompt"], "image": kind, "seconds": rec["seconds"],
                              "recorded_at": rec["recorded_at"],
                              "prompt_source": source if kind == "filled" else "manual",
                              "labels": (rec.get("legend") or {}).get("labels", []),
                              "masks": self._match_masks(sg, sid, masks, rec, objects_by_sheet)})
            self._sam[sid] = {"source": source, "legend": legend, "calls": calls}
        return self._sam

    def _read_legend(self, sg, sid) -> dict | None:
        """Muse Spark reads the legend box of the sheet's filled render; the prompts SAM gets are built from its words
        (meta.sam_plan). None when the sheet has no legend box; {error} when the call failed or was not recorded."""
        region = next((r for r in sg.regions if r.kind == "legend"), None)
        if region is None or self.spark is None:
            return None
        crop, box = legend_crop(self.render(sid, "filled.png"), region.polygon.bounds, render_window(sg.model))
        before = len(self.spark.log)
        try:
            rows = self.spark.read_legend(crop, key=f"{sg.model.signature()}:legend")
        except Exception as e:  # missing fixture or failed call: the hand-typed prompts stand
            return {"error": f"read_legend: {type(e).__name__}", "prompts": []}
        last = self.spark.log[-1] if len(self.spark.log) > before else {}
        prompts, skipped = prompts_from_legend(rows)
        return {"rows": rows, "prompts": prompts, "skipped": skipped, "crop_px": box, "seconds": last.get("seconds"),
                "recorded": bool(last.get("fixture"))}

    def _match_masks(self, sg, sid, masks, rec, objects_by_sheet) -> list[dict]:
        """Each mask typed by the outline it lies in (meta.sam_plan.type_masks), never by the prompt."""
        w, h = rec["image_px"]
        outlines = [{"object_id": o["object_id"], "label": o.get("label"), "kind": o["kind"],
                     "polygon": Polygon(o["outline"]), "excluded": bool(o.get("excluded"))}
                    for o in objects_by_sheet.get(sid, []) if len(o.get("outline", [])) >= 3]
        return type_masks(masks, outlines, render_window(sg.model), metres_per_pixel(sg.model, (w, h)))

    # ------------------------------------------------------------------------------------------ checks
    def _checks(self, items, objects_by_sheet, sam) -> list[dict]:
        t = self.takeoff
        checks: list[dict] = []

        def add(**c):
            c.setdefault("by", ["geometry"])
            c.setdefault("evidence", {})
            checks.append({"check_id": f"C-{len(checks) + 1:02d}", **c})
            return checks[-1]

        def sheets_of(oids):
            return sorted({s for s, objs in objects_by_sheet.items() for o in objs if o["object_id"] in oids})

        for it in items:  # open outlines Muse Spark looked at
            sp = it.get("spark")
            if not sp:
                continue
            oid = sp["object_id"]
            o = next((x for s in objects_by_sheet.values() for x in s if x["object_id"] == oid), {})
            done = it["agreed"]
            add(category="quantity", severity="info" if done else "flag", by=["geometry", "spark"],
                title=f"{oid}: open outline, Muse Spark says one {sp['answer'].get('kind')}" + (" — confirmed" if done else ""),
                why=(f"Geometry closed {it['geometry_count']} outlines; {oid}'s pieces leave {len(o.get('gaps', []))} gaps up to "
                     f"{max(o.get('gap_sizes_m') or [0]):.2f} m. Muse Spark, shown the crop, says one {sp['answer'].get('kind')} "
                     f"({float(sp['confidence'] or 0):.2f}). " + ("A person confirmed it." if done else
                                                                 "It is counted only after a person confirms.")),
                evidence={"sheet_ids": it["sheet_ids"], "object_ids": [oid]},
                numbers={"geometry": it["geometry_count"], "spark": it["spark_count"], "schedule": it["schedule_count"],
                         "gaps": len(o.get("gaps", [])), "max_gap_m": max(o.get("gap_sizes_m") or [0]),
                         "confidence": sp["confidence"]},
                item_ids=[it["item_id"]])
        for it in items:  # the plant schedule against the drawing
            if it["schedule_count"] is None or it["kind"] not in ("tree", "hedge", "shrub_bed", "lawn"):
                continue
            drawn = it["proposed_count"]
            same = drawn is not None and abs(float(drawn) - float(it["schedule_count"])) <= 0.01 * max(float(drawn), 1)
            unit = " m²" if it["unit"] == "m2" else ""
            add(category="quantity", severity="info" if same else "flag", by=["geometry", "spark"],
                title=(f"Schedule and drawing agree: {it['label']} {drawn}{unit}" if same else
                       f"Schedule says {it['schedule_count']} {it['label']}, drawing shows {drawn}{unit}"),
                why=("Muse Spark read the plant schedule; geometry measured the drawing." if same else
                     "The plant schedule and the drawing disagree; the drawing governs. Raise it with the developer."),
                evidence={"sheet_ids": it["sheet_ids"], "object_ids": it["object_ids"]},
                numbers={"schedule": it["schedule_count"], "drawn": drawn}, item_ids=[it["item_id"]])
        for sg in t.sheets:  # sheets that are not counted
            sid = self.sheet_ids[sg.sheet]
            k = t.spark.sheet_kinds.get(sg.sheet) or {}
            if k.get("kind", "plan") == "plan":
                continue
            xs = [o["object_id"] for o in objects_by_sheet.get(sid, []) if o["kind"] == "tree"]
            add(category="sheet", severity="info", by=["spark"],
                title=f"{sid} is {'an' if k['kind'][0] in 'aeiou' else 'a'} {k['kind']}: not counted",
                why=(f"Muse Spark classified the sheet as {k['kind']} (confidence {k.get('confidence')}): {en(k.get('why', ''))}"
                     + (f" Its {len(xs)} round outlines are the same plants seen from the side." if k["kind"] == "elevation"
                        else "")),
                evidence={"sheet_ids": [sid], "object_ids": xs},
                numbers={"round_outlines": len(xs), "confidence": k.get("confidence")})
            d = t.details.get(sg.sheet)
            if d is not None:
                w, ln, depth = d.get("pit_w_m"), d.get("pit_l_m"), d.get("soil_depth_m")
                area = round(w * ln, 2) if w and ln else None
                add(category="sheet", severity="info", by=["spark"],
                    title=(f"{sid} tree pit: {fmt_n(w)} × {fmt_n(ln)} m = {fmt_n(area)} m² · soil {fmt_n(depth or 0)} m"
                           + (" · on slab" if d.get("on_slab") else "") if area else f"{sid}: no tree pit read"),
                    why=f"Muse Spark read the detail sheet: {en(d.get('why', ''))}",
                    evidence={"sheet_ids": [sid]},
                    numbers={"pit_w_m": w, "pit_l_m": ln, "pit_area_m2": area, "soil_depth_m": depth,
                             "on_slab": d.get("on_slab"), "seconds": d.get("seconds")},
                    used_by_rules=bool(self.features["pit_downgrade"] and t.pit is not None))
        for sg in t.sheets:  # the legend, and "typ." labels, on counted sheets
            sid = self.sheet_ids[sg.sheet]
            if (t.spark.sheet_kinds.get(sg.sheet) or {}).get("kind", "plan") != "plan":
                continue
            legend = [o["object_id"] for o in objects_by_sheet.get(sid, []) if o["kind"] == "legend"]
            if legend:
                n = sum(1 for o in objects_by_sheet[sid] if o["kind"] == "legend" and o["label"] != "legend box")
                add(category="sheet", severity="info", title=f"{sid} legend: {n} symbols not counted",
                    why="Geometry found the legend box (the smallest frame around the word 'legend'); the symbols "
                        "inside it are a key, not plants.", evidence={"sheet_ids": [sid], "object_ids": legend},
                    numbers={"symbols": n})
            for ld in sg.closed.leaders:
                e = expand(ld.text.content)
                if not e.representative:
                    continue
                refs = [(oid, r) for it in t.items for oid, r in it.objects.items() if r.startswith(sg.sheet + "/")]
                target = next((oid for oid, r in refs if self._obj(r)[1] is not None
                               and self._obj(r)[1].footprint.distance(Point(ld.tip)) < 0.3), None)
                add(category="quantity", severity="info", title=f"'{label(ld.text.content)}' is a label, not one more tree",
                    why="'typ.' means the label applies to every identical symbol; it never multiplies.",
                    evidence={"sheet_ids": [sid], "object_ids": [target] if target else []},
                    numbers={"label_at_x": _r(ld.text.x), "label_at_y": _r(ld.text.y)})
        for it in items:  # rows counted along a line
            if it["kind"] != "hedge":
                continue
            src = next(x for x in t.items if x.id == it["item_id"])
            sg, cand = self._obj(next(iter(src.objects.values())))
            text = next((ld.text.content for ld in sg.closed.leaders if "@" in ld.text.content
                         and min(ln.distance(Point(ld.tip)) for ln in cand.lines) < 0.5), "")
            e = expand(text) if text else None
            lines = [ln for ln in cand.lines if ln.length >= 1.0]
            per = [math.floor(round(ln.length / e.spacing_m, 6)) + 1 for ln in lines] if e and e.spacing_m else []
            length = round(lines[0].length, 2) if lines else None
            add(category="quantity", severity="info",
                title=f"{it['label']}: {length} m at {e.spacing_m if e else '?'} m, {len(lines)} rows = {it['geometry_count']} plants",
                why=f"Counted by geometry from the label '{label(text)}': floor(length ÷ spacing) + 1 on each drawn line.",
                evidence={"sheet_ids": it["sheet_ids"], "object_ids": it["object_ids"]},
                numbers={"length_m": length, "spacing_m": e.spacing_m if e else None, "rows": len(lines),
                         "per_row": per[0] if per else None, "count": it["geometry_count"],
                         "formula": f"{length} ÷ {e.spacing_m if e else '?'} + 1 = {per[0] if per else '?'} · × {len(lines)} rows = {it['geometry_count']}"},
                item_ids=[it["item_id"]])
        self._sam_checks(add, items, objects_by_sheet, sam)
        for r in t.rules:
            add(**self._rule_check(r))
        return checks

    def _sam_checks(self, add, items, objects_by_sheet, sam):
        """The colour scene's checks, per plan sheet: Muse Spark's legend read (the words SAM was given), the line
        work (with the controlled test: the same word on lines and on colour), the coloured render's calls, and each
        item's SAM area against the CAD area. Every one says which path wrote the prompts (`prompt_source`)."""
        objs = {o["object_id"]: o for s in objects_by_sheet.values() for o in s}
        for sid, entry in sam.items():
            calls, source, legend = entry["calls"], entry["source"], entry["legend"]
            filled = [c for c in calls if c["image"] == "filled"]
            by_prompt = {c["prompt"]: c for c in filled}
            if legend and legend.get("rows"):
                pairs = " · ".join(f"{r['swatch_colour_word']} = {label(r['label'])}" for r in legend["rows"])
                add(category="area", severity="info", by=["spark"], prompt_source=source,
                    title=f"Muse Spark read the {sid} legend: {pairs}",
                    why=("Muse Spark looked at the legend box of the coloured render and named each swatch's colour; SAM "
                         "3.1 is prompted with those words (an area swatch becomes '<colour> area', a tree symbol "
                         "'<colour> circle'); lines are left to geometry. " + legend.get("note", "")).strip(),
                    evidence={"sheet_ids": [sid]},
                    numbers={"entries": len(legend["rows"]), "prompts": [q["prompt"] for q in legend["prompts"]],
                             "skipped": len(legend["skipped"]), "seconds": legend["seconds"],
                             "crop_px": legend["crop_px"]},  # the box of filled_png_url Muse Spark was sent
                    legend=[{"colour": r["swatch_colour_word"], "label": label(r["label"]), "kind": r["kind"]}
                            for r in legend["rows"]],
                    prompts=[{"prompt": q["prompt"], "labels": [label(x) for x in q["labels"]], "kind": q["kind"]}
                             for q in legend["prompts"]],
                    skipped=[{"label": label(x.get("label", "")), "kind": x.get("kind"), "why": x["why"]}
                             for x in legend["skipped"]],
                    recorded=legend["recorded"])
            control = None
            for c in calls:
                if c["image"] != "lines":
                    continue
                on_colour = by_prompt.get(c["prompt"])
                ctl = None
                if self.features["sam_control"] and on_colour is not None and on_colour["masks"]:
                    ctl = {"prompt": c["prompt"], "masks_on_lines": len(c["masks"]),
                           "masks_on_colour": len(on_colour["masks"]), "colour_prompt_source": on_colour["prompt_source"]}
                    control = control or ctl
                title = f"SAM 3.1 on the line drawing of {sid}: {len(c['masks'])} masks for '{c['prompt']}'"
                if ctl:
                    title += f"; on the coloured render the same words find {ctl['masks_on_colour']}"
                extra = {"control": ctl} if ctl else {}
                add(category="area", severity="info", by=["sam"], prompt_source="manual", title=title,
                    why=f"Asked for '{c['prompt']}' on the plain line work; SAM sees nothing in lines." +
                        (" The same words on the coloured render are the controlled test: one variable changes." if ctl else ""),
                    evidence={"sheet_ids": [sid]}, numbers={"masks": len(c["masks"]), "prompt": c["prompt"],
                                                            "seconds": c["seconds"]}, **extra)
            if filled:
                n = sum(len(c["masks"]) for c in filled)
                legend_hits = sum(1 for c in filled for m in c["masks"] if m["excluded"])
                by_whom = "Muse Spark's legend words" if source == "spark_legend" else "the hand-typed probe prompts"
                extra = {"control": control} if control else {}
                add(category="area", severity="info", by=["sam", "spark"] if source == "spark_legend" else ["sam"],
                    prompt_source=source,
                    title=f"SAM 3.1 on the coloured {sid}: {len(filled)} prompts from {by_whom}, {n} masks, "
                          f"{legend_hits} in the legend excluded",
                    why=("Each mask takes the type of the outline it lies in, not the prompt's; one prompt can return "
                         "several types, and masks on legend swatches are a key, not a quantity."),
                    evidence={"sheet_ids": [sid]},
                    numbers={"prompts": len(filled), "masks": n, "legend_excluded": legend_hits},
                    calls=[{"prompt": c["prompt"], "prompt_source": c["prompt_source"], "keyed_to": [label(x) for x in c["labels"]],
                            "masks": len(c["masks"]), "legend_excluded": sum(1 for m in c["masks"] if m["excluded"]),
                            "seconds": c["seconds"], "recorded_at": c["recorded_at"],
                            "mask_list": [{"box_px": m["box_px"], "score": round(m["score"], 3) if m["score"] is not None else None,
                                           "area_m2": m["area_m2"], "object_id": m["object_id"], "type": label(m["type"] or ""),
                                           "excluded": m["excluded"]} for m in c["masks"]]}
                           for c in filled], **extra)
            best: dict[str, tuple[float, dict, str]] = {}  # object -> (score, mask, prompt)
            for c in filled:
                for m in c["masks"]:
                    if m["object_id"] and not m["excluded"]:
                        if m["object_id"] not in best or (m["score"] or 0) > best[m["object_id"]][0]:
                            best[m["object_id"]] = (m["score"] or 0, m, c["prompt"])
            for it in items:
                hits = [(oid, best[oid]) for oid in it["object_ids"] if oid in best]
                if not hits:
                    continue
                sam_m2 = sum(m["area_m2"] for _, (_, m, _) in hits)
                cad_m2 = sum(objs[oid]["area_m2"] for oid, _ in hits)
                err = (sam_m2 - cad_m2) / cad_m2 * 100 if cad_m2 else 0.0
                n = f"{len(hits)} of {len(it['object_ids'])} " if len(it["object_ids"]) > 1 else ""
                prompts = sorted({p for _, (_, _, p) in hits})
                add(category="area", severity="info" if abs(err) <= 2 else "review", by=["sam", "geometry"],
                    prompt_source=source,
                    title=f"SAM 3.1: {n}{it['label']} {sam_m2:.1f} m² vs CAD {cad_m2:.1f} m² ({err:+.1f}%)",
                    why=(f"SAM 3.1 on the coloured render, asked for {' and '.join(repr(p) for p in prompts)}"
                         + (" (Muse Spark's words from the legend)" if source == "spark_legend" else "")
                         + f", returned a mask on {'each' if len(hits) > 1 else 'the'} outline; its area is set against "
                           "the geometry's."),
                    evidence={"sheet_ids": [sid], "object_ids": [oid for oid, _ in hits]},
                    numbers={"sam_m2": round(sam_m2, 2), "cad_m2": round(cad_m2, 2), "error_pct": round(err, 2),
                             "confidence": round(min(sc for _, (sc, _, _) in hits), 3), "prompt": prompts[0],
                             "masks": len(hits)},
                    item_ids=[it["item_id"]])

    def _rule_check(self, r) -> dict:
        sev = {"fail": "fail", "needs_review": "review", "pass": "info", "skipped": "info", "not_applicable": "info"}
        names = {"greening": "Building Technical Regulations §302 — greening carbon-fixation requirement",
                 "protected_trees": "municipal Tree Protection Ordinance §3 — protected existing trees",
                 "municipal_green_cover": "municipal New Building Greening Rules Art. 5 — green-cover ratio"}
        lead = {"greening": "§302", "protected_trees": "§3", "municipal_green_cover": "Art. 5"}[r.rule]
        c = next((c for c in r.citations if c.key == lead), r.citations[0])
        status = r.status.replace("_", " ")
        title = names.get(r.rule, r.title)
        if r.required is not None:
            title += f": required {r.required:g}, provided {r.provided:g} — {status}"
        else:
            title += f" — {status}"
        out = {"category": "regulation", "severity": sev[r.status], "by": ["rule", "geometry"], "title": title,
               "why": " ".join(en(n) for n in r.notes[:2]) or status,
               "citation": {"article": c.article_en, "url": c.url, "gloss": c.en},
               "jurisdiction": r.jurisdiction, "status": r.status,
               "citations": [{"key": en(x.key) if x.key[0] != "式" else x.article_en.split(", ")[-1], "article": x.article_en,
                              "url": x.url, "gloss": x.en} for x in r.citations],
               "rows": [{"symbol": tm.symbol, "label": tm.en, "value": tm.value, "unit": tm.unit,
                         "formula": en(tm.formula), "source": en(tm.source), "cite": self._cite_en(r, tm.cite)}
                        for tm in r.terms]}
        if r.rule == "greening" and r.required is not None:
            v = {tm.symbol: tm.value for tm in r.terms}
            out["numbers"] = {"required": r.required, "provided": r.provided, "A0": v.get("A0"), "Ap": v.get("Ap"),
                              "r": v.get("r"), "A_prime": v.get("A′"), "beta": v.get("β"), "alpha": v.get("α"),
                              "ra": v.get("ra"), "sum_gi_ai": v.get("ΣGi·Ai"), "terms": self._terms(r)}
            out["fixes"] = [self._fix(asdict(f), v.get("α", 0.8)) for f in r.fixes]
            out["evidence"] = {"object_ids": [oid for it in self.takeoff.items if it.kind == "tree" for oid in it.objects]}
            out |= self._downgrade_states(r)
        elif r.required is not None:
            out["numbers"] = {"required": r.required, "provided": r.provided}
        return out

    @staticmethod
    def _cite_en(r, keys: str) -> str:
        found = []
        for k in (keys or "").split(","):
            c = next((c for c in r.citations if c.key == k.strip()), None)
            if c:
                found.append(c.article_en)
        return "; ".join(found)

    def _terms(self, r) -> list[dict]:
        out = []
        for tm in r.terms:
            if tm.symbol != "Gi·Ai":
                continue
            # formula is "Gi × (count × Ai m²) = product" for trees, "Gi × area m² = product" otherwise
            nums = [float(x) for x in re.findall(r"[\d.]+", tm.formula.split("=")[0])]
            if len(nums) == 3:
                gi, count, ai = nums
                out.append({"label": tm.en, "count_or_area": count, "Ai": ai, "Gi": gi, "product": tm.value})
            elif len(nums) == 2:
                gi, area = nums
                out.append({"label": tm.en, "count_or_area": area, "Ai": area, "Gi": gi, "product": tm.value})
        return out

    @staticmethod
    def _fix(f: dict, alpha0: float) -> dict:
        """A fix (rules.Fix as a dict) in the API's shape; alpha0 is the native-tree bonus before the fix."""
        ch = f["change"]
        if "add_trees" in ch:
            sp, n = next(iter(ch["add_trees"].items()))
            text = f"+{n} {label(sp)}, the same species"
        elif "swap" in ch:
            s = ch["swap"]
            what = "Change ONE" if s["n"] == 1 else f"Change {s['n']}"
            kind = "a second native species" if s.get("to_native", True) else "a second, bird- or butterfly-attracting species"
            text = (f"{what} {label(s['from'])} to {s.get('to_en') or label(s['to'])}, {kind}: native-tree bonus "
                    f"{alpha0:.2f} → {f['alpha']:.2f}; no extra trees")
        else:
            text = f"+{ch.get('add_shrub_m2')} m² of shrub bed (Gi 0.5)"
        return {"label": text, "result": f["provided"], "passes": f["passes"], "id": f["id"], "change": deep(ch),
                "alpha": f["alpha"], "extra_trees": f["extra_trees"], "object_ids": f["tone_objects"]}

    def _downgrade_states(self, r) -> dict:
        """The gauge's two states (§5 table 1 pit downgrade on artificial ground), each with its computed fixes; both
        null when no pit applies (feature off, no detail sheet, or not on artificial ground)."""
        if r.after_downgrade is None:
            why = ("the pit downgrade is switched off" if not self.features["pit_downgrade"] else
                   "no tree pit read from a detail sheet" if self.takeoff.pit is None else
                   "the tree pit is not on artificial ground")
            return {"before_downgrade": None, "after_downgrade": None, "downgrade_note": why}

        def state(st: dict) -> dict:
            return {"provided": st["provided"], "required": st["required"], "status": st["status"],
                    "alpha": st["alpha"], "ra": st["ra"], "sum_gi_ai": st["sum_gi_ai"],
                    "trees": [{"label": label(t["species"]), "count": t["count"], "gi": t["gi"],
                               "ai_per_tree": t["ai_per_tree"], "product": t["product"], "pit_note": t["pit_note"]}
                              for t in st["trees"]],
                    "fixes": [self._fix(f, st["alpha"]) for f in st["fixes"]]}

        b, a = r.before_downgrade, r.after_downgrade
        pit = a["pit"]
        before, after = state(b), state(a)
        after |= {"pit": {"sheet_id": self.sheet_ids.get(pit["from_sheet"], pit["from_sheet"]),
                          "width_m": pit["width_m"], "length_m": pit["length_m"], "area_m2": pit["area_m2"],
                          "soil_depth_m": pit["soil_depth_m"], "on_slab": pit["on_slab"], "by": pit["by"],
                          "why": pit["why"]},
                  "artificial_ground": a["artificial_ground"], "rule": a["rule"], "review": a["review"],
                  "downgraded": [{"label": label(d["species"]), "count": d["count"], "from_gi": d["from_gi"],
                                  "to_gi": d["to_gi"]} for d in a["downgraded"]],
                  "repriced": {k: {"extra_trees": v["extra_trees"], "result": v["provided"]} for k, v in a["repriced"].items()}}
        return {"before_downgrade": before, "after_downgrade": after}

    # ------------------------------------------------------------------------------------------ tally, rules, director
    def _tally(self, items) -> list[dict]:
        rows = []
        for it in items:
            if it["kind"] not in ("tree", "hedge", "shrub_bed", "lawn"):
                continue
            drawn = it["quote_count"] if it["confirmed"] else it["geometry_count"]
            rows.append({"label": it["label"], "species_code": it["species_code"], "drawn": drawn,
                         "spark": it["spark_count"], "schedule": it["schedule_count"], "unit": it["unit"],
                         "status": "confirmed" if it["confirmed"] else ("agreed" if it["agreed"] else "flagged"),
                         "item_id": it["item_id"], "by": "spark" if it["spark_count"] is not None else "geometry"})
        return rows

    def rules(self) -> list[dict]:
        return [c for c in self.run()["checks"] if c["category"] == "regulation"]

    def director(self) -> list[dict]:
        run = self.run()
        items, checks, sheets = run["items"], run["checks"], run["sheets"]
        plan = next((s for s in sheets if s["counted"] and any(o["kind"] == "tree" and "excluded" not in o for o in s["objects"])),
                    sheets[0])
        other = next((s for s in sheets if s["kind"] == "elevation"), None)
        paving = next((s for s in sheets if s["counted"] and any(o["kind"] == "paving" for o in s["objects"])), None)
        flagged = next((i for i in items if i.get("spark")), None)
        hedge = next((i for i in items if i["kind"] == "hedge"), None)
        trees = next((i for i in items if i["kind"] == "tree"), None)
        cid = lambda pred: [c["check_id"] for c in checks if pred(c)]  # noqa: E731
        greening = cid(lambda c: c["category"] == "regulation" and c["title"].startswith("Building Technical"))
        fix_objs = next((f["object_ids"] for c in checks if c["check_id"] in greening for f in c.get("fixes", [])
                         if f["id"] == "b"), [])
        scenes = [
            {"id": "drop", "title": "The package lands", "focus": [f["file_id"] for f in run["files"]], "check_ids":
             cid(lambda c: c["category"] == "ingest"), "item_ids": [], "duration_s": 6},
            {"id": "wake", "title": "The drawing wakes up", "sheet_id": plan["sheet_id"],
             "focus": [o["object_id"] for o in plan["objects"] if "excluded" not in o],
             "check_ids": cid(lambda c: c["category"] == "quantity" and c["by"] == ["geometry", "spark"] and "open outline" in c["title"]),
             "item_ids": [i["item_id"] for i in items if plan["sheet_id"] in i["sheet_ids"]], "duration_s": 25},
        ]
        if flagged:
            scenes.append({"id": "eye", "title": "The eye", "sheet_id": plan["sheet_id"], "focus": [flagged["spark"]["object_id"]],
                           "check_ids": cid(lambda c: flagged["item_id"] in c.get("item_ids", []) and "open outline" in c["title"]),
                           "item_ids": [flagged["item_id"]], "duration_s": 22})
        if hedge:
            scenes.append({"id": "hedge", "title": "Hedge math", "sheet_id": plan["sheet_id"], "focus": hedge["object_ids"],
                           "check_ids": cid(lambda c: hedge["item_id"] in c.get("item_ids", []) and "rows" in c["title"])
                           + cid(lambda c: c["category"] == "sheet" and "legend" in c["title"]
                                 and plan["sheet_id"] in c["evidence"].get("sheet_ids", []))
                           + cid(lambda c: "label, not" in c["title"]),
                           "item_ids": [hedge["item_id"]], "duration_s": 18})
        sam_checks = cid(lambda c: c["category"] == "area")  # Spark's legend read, the line work, the coloured calls
        if sam_checks:  # the SAM probe (docs/research/sam-probe.md) says yes for beds and paving
            scenes.append({"id": "colour", "title": "Lines to colour", "sheet_id": plan["sheet_id"],
                           "sheet_ids": sorted({s for c in checks if c["check_id"] in sam_checks
                                                for s in c["evidence"].get("sheet_ids", [])}),
                           "focus": [o for c in checks if c["check_id"] in sam_checks for o in c["evidence"].get("object_ids", [])],
                           "check_ids": sam_checks,
                           "item_ids": [i for c in checks if c["check_id"] in sam_checks for i in c.get("item_ids", [])],
                           "duration_s": 22})
        detail = next((s for s in sheets if s.get("detail")), None)
        pit_checks = cid(lambda c: c["category"] == "sheet" and "tree pit" in c["title"])
        scenes.append({"id": "gauge", "title": "The gauge", "sheet_id": plan["sheet_id"], "focus": fix_objs,
                       "sheet_ids": [plan["sheet_id"]] + ([detail["sheet_id"]] if detail else []),
                       "check_ids": greening + pit_checks, "item_ids": [trees["item_id"]] if trees else [],
                       "duration_s": 22})
        scenes.append({"id": "bill", "title": "The bill", "sheet_id": plan["sheet_id"],
                       "focus": trees["object_ids"] if trees else [], "check_ids": cid(lambda c: c["category"] in ("bill", "price")),
                       "item_ids": [i["item_id"] for i in (trees, hedge) if i], "duration_s": 22,
                       "note": "bill checks arrive with the bill reader (landsight/checks); none in this run"})
        scenes.append({"id": "callback", "title": "Twelve, again", "sheet_id": (other or plan)["sheet_id"],
                       "sheet_ids": [s["sheet_id"] for s in (other, plan) if s],
                       "focus": ([o["object_id"] for o in other["objects"] if o["kind"] == "tree"] if other else [])
                       + (trees["object_ids"] if trees else []),
                       "check_ids": cid(lambda c: c["category"] == "sheet" and "not counted" in c["title"] and "legend" not in c["title"]
                                        and (other is None or other["sheet_id"] in c["evidence"].get("sheet_ids", [])))
                       + cid(lambda c: c["category"] == "quantity" and c["title"].startswith(("Schedule says", "Schedule and drawing"))
                             and trees and trees["item_id"] in c.get("item_ids", [])),
                       "item_ids": [trees["item_id"]] if trees else [], "duration_s": 18})
        return deep(scenes)
