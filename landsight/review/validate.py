"""A tiny validator for the shapes of docs/API.md (Run, FileVerdict, Sheet, DrawingObject, Item, Check, ErrorScore,
TallyRow). Returns a list of problems; empty means valid. Additive fields are allowed (D-22); the additive enum values
this review emits are listed here and proposed in docs/DECISIONS.md."""

from __future__ import annotations

VERDICTS = {"drawing_vector", "drawing_raster", "drawing_image", "bill", "quote", "spec", "presentation",
            "backup_ignored", "archive_unpacked", "unsupported", "unreadable"} | {"document"}
DECIDED_BY = {"ext", "content", "spark"}
SHEET_KINDS = {"plan", "elevation", "detail", "schedule", "legend", "cover", "background"}
OBJECT_KINDS = {"tree", "existing_tree", "hedge", "shrub_bed", "lawn", "paving", "planter_edge", "legend", "title_block",
                "schedule", "fire_lane", "boundary", "match_line"} | {"scale_bar", "tree_pit", "revision_cloud"}
OBJECT_BY = {"geometry", "spark", "sam"}
UNITS = {"plant", "m2", "m"}
CATEGORIES = {"quantity", "revision", "sheet", "area", "scale", "bill", "price", "arithmetic", "units", "regulation",
              "protected_tree", "ingest", "document"}
SEVERITIES = {"flag", "fail", "review", "info"}
CHECK_BY = {"geometry", "spark", "sam", "rule", "bill"}
TALLY_STATUS = {"agreed", "flagged", "confirmed"}
SCENARIOS = {"quote", "regulation", "design", "format", "info"}


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


class _V:
    def __init__(self):
        self.problems: list[str] = []

    def need(self, obj: dict, where: str, key: str, test, what: str, optional: bool = False):
        if key not in obj:
            if not optional:
                self.problems.append(f"{where}: missing {key}")
            return
        v = obj[key]
        if optional and v is None:
            return
        if not test(v):
            self.problems.append(f"{where}.{key}: expected {what}, got {v!r:.60}")


def validate(run: dict) -> list[str]:
    v = _V()
    for k, test, what in (("run_id", lambda x: isinstance(x, str), "string"), ("package", lambda x: isinstance(x, dict), "object"),
                          ("files", lambda x: isinstance(x, list), "list"), ("sheets", lambda x: isinstance(x, list), "list"),
                          ("items", lambda x: isinstance(x, list), "list"), ("checks", lambda x: isinstance(x, list), "list"),
                          ("errors", lambda x: isinstance(x, dict), "object"), ("tally", lambda x: isinstance(x, list), "list"),
                          ("timing", lambda x: isinstance(x, dict), "object")):
        v.need(run, "Run", k, test, what)
    if v.problems:
        return v.problems
    p = run["package"]
    v.need(p, "package", "name", lambda x: isinstance(x, str), "string")
    v.need(p, "package", "folder", lambda x: isinstance(x, str), "string")
    v.need(p, "package", "file_count", lambda x: isinstance(x, int), "int")
    ids = set()
    for i, f in enumerate(run["files"]):
        w = f"files[{i}]"
        for k in ("file_id", "path", "name", "ext"):
            v.need(f, w, k, lambda x: isinstance(x, str), "string")
        v.need(f, w, "size_bytes", lambda x: isinstance(x, int), "int")
        v.need(f, w, "verdict", lambda x: x in VERDICTS, "a verdict")
        v.need(f, w, "decided_by", lambda x: x in DECIDED_BY, "ext|content|spark")
        v.need(f, w, "why", lambda x: isinstance(x, str) and x.strip(), "one line")
        v.need(f, w, "sheet_id", lambda x: isinstance(x, str), "string", optional=True)
        v.need(f, w, "children", lambda x: isinstance(x, list) and all(isinstance(c, str) for c in x), "list of ids", True)
        ids.add(f.get("file_id"))
    sheet_ids = set()
    for i, s in enumerate(run["sheets"]):
        w = f"sheets[{i}]"
        for k in ("sheet_id", "file_id", "title", "number", "kind_why", "svg_url", "png_url"):
            v.need(s, w, k, lambda x: isinstance(x, str), "string")
        v.need(s, w, "kind", lambda x: x in SHEET_KINDS, "a sheet kind")
        v.need(s, w, "kind_confidence", _num, "number")
        v.need(s, w, "kind_by", lambda x: x in ("spark", "rule"), "spark|rule")
        for k in ("revision", "date", "scale_title", "scale_measured"):
            v.need(s, w, k, lambda x: isinstance(x, str), "string", optional=True)
        v.need(s, w, "counted", lambda x: isinstance(x, bool), "bool")
        if s.get("counted") is False:
            v.need(s, w, "not_counted_reason", lambda x: isinstance(x, str) and x, "a reason")
        v.need(s, w, "bounds", lambda b: isinstance(b, dict) and all(_num(b.get(k)) for k in ("min_x", "min_y", "max_x", "max_y")),
               "{min_x,min_y,max_x,max_y}")
        v.need(s, w, "objects", lambda x: isinstance(x, list), "list")
        if s.get("file_id") not in ids:
            v.problems.append(f"{w}: file_id {s.get('file_id')} is not a file")
        sheet_ids.add(s.get("sheet_id"))
        for j, o in enumerate(s.get("objects") or []):
            ow = f"{w}.objects[{j}]"
            v.need(o, ow, "object_id", lambda x: isinstance(x, str), "string")
            v.need(o, ow, "kind", lambda x: x in OBJECT_KINDS, "an object kind")
            v.need(o, ow, "outline", lambda x: isinstance(x, list) and all(isinstance(q, list) and len(q) == 2 and all(map(_num, q))
                                                                          for q in x), "list of [x, y]")
            v.need(o, ow, "closed", lambda x: isinstance(x, bool), "bool")
            v.need(o, ow, "by", lambda x: x in OBJECT_BY, "geometry|spark|sam")
            v.need(o, ow, "centre", lambda x: isinstance(x, list) and len(x) == 2 and all(map(_num, x)), "[x, y]", True)
            v.need(o, ow, "area_m2", _num, "number", True)
            v.need(o, ow, "excluded", lambda x: isinstance(x, dict) and isinstance(x.get("reason"), str), "{reason}", True)
    if len(sheet_ids) != len(run["sheets"]):
        v.problems.append("sheets: sheet_id not unique")
    for i, it in enumerate(run["items"]):
        w = f"items[{i}]"
        for k in ("item_id", "label"):
            v.need(it, w, k, lambda x: isinstance(x, str), "string")
        v.need(it, w, "kind", lambda x: x in OBJECT_KINDS, "an object kind")
        v.need(it, w, "unit", lambda x: x in UNITS, "plant|m2|m")
        for k in ("geometry_count", "spark_count", "schedule_count", "label_count", "quote_count"):
            v.need(it, w, k, _num, "number", optional=True)
        v.need(it, w, "agreed", lambda x: isinstance(x, bool), "bool")
        v.need(it, w, "object_ids", lambda x: isinstance(x, list) and all(isinstance(c, str) for c in x), "list of ids")
        v.need(it, w, "sheet_ids", lambda x: isinstance(x, list) and set(x) <= sheet_ids, "list of sheet ids")
        v.need(it, w, "spark", lambda x: isinstance(x, dict) and isinstance(x.get("answer"), dict) and "crop_url" in x,
               "{crop_url, answer, why, confidence}", True)
    check_ids = set()
    for i, c in enumerate(run["checks"]):
        w = f"checks[{i}]"
        for k in ("check_id", "title", "why"):
            v.need(c, w, k, lambda x: isinstance(x, str) and x, "string")
        v.need(c, w, "category", lambda x: x in CATEGORIES, "a category")
        v.need(c, w, "severity", lambda x: x in SEVERITIES, "flag|fail|review|info")
        v.need(c, w, "by", lambda x: isinstance(x, list) and x and set(x) <= CHECK_BY, "list of sources")
        v.need(c, w, "evidence", lambda e: isinstance(e, dict) and all(k in ("file_ids", "sheet_ids", "object_ids", "cells")
                                                                      and isinstance(x, list) for k, x in e.items()),
               "{file_ids?, sheet_ids?, object_ids?, cells?}")
        v.need(c, w, "citation", lambda x: isinstance(x, dict) and all(isinstance(x.get(k), str) for k in ("article", "url", "gloss")),
               "{article, url, gloss}", True)
        v.need(c, w, "numbers", lambda x: isinstance(x, dict) and all(_num(n) or isinstance(n, str) for n in x.values()),
               "{name: number | string}", True)
        v.need(c, w, "fixes", lambda x: isinstance(x, list) and all(isinstance(f.get("label"), str) and isinstance(f.get("passes"), bool)
                                                                   and (_num(f.get("result")) or isinstance(f.get("result"), str))
                                                                   for f in x), "list of {label, result, passes}", True)
        v.need(c, w, "scenario", lambda x: x in SCENARIOS, "quote|regulation|design|format|info", True)
        if c.get("category") == "regulation" and "citation" not in c:
            v.problems.append(f"{w}: a regulation check without a citation")
        check_ids.add(c.get("check_id"))
        ev = c.get("evidence") or {}
        for fid in ev.get("file_ids") or []:
            if fid not in ids:
                v.problems.append(f"{w}: evidence file {fid} is not a file")
        for sid in ev.get("sheet_ids") or []:
            if sid not in sheet_ids:
                v.problems.append(f"{w}: evidence sheet {sid} is not a sheet")
    if len(check_ids) != len(run["checks"]):
        v.problems.append("checks: check_id not unique")
    e = run["errors"]
    v.need(e, "errors", "planted", _num, "number")
    for k in ("found", "flagged", "missed", "false_alarms"):
        v.need(e, "errors", k, lambda x: isinstance(x, list) and all(isinstance(s, str) for s in x), "list of ids")
    for name, sl in (run.get("scenarios") or {}).items():
        w = f"scenarios.{name}"
        if name not in SCENARIOS:
            v.problems.append(f"{w}: not a scenario")
            continue
        v.need(sl, w, "planted", lambda x: isinstance(x, int), "int")
        for k in ("found", "flagged", "missed", "false_alarms"):
            v.need(sl, w, k, lambda x: isinstance(x, list) and all(isinstance(s, str) for s in x), "list of ids")
    for i, t in enumerate(run["tally"]):
        w = f"tally[{i}]"
        v.need(t, w, "label", lambda x: isinstance(x, str), "string")
        v.need(t, w, "drawn", _num, "number")
        v.need(t, w, "spark", _num, "number", optional=True)
        v.need(t, w, "schedule", _num, "number", optional=True)
        v.need(t, w, "unit", lambda x: isinstance(x, str), "string")
        v.need(t, w, "status", lambda x: x in TALLY_STATUS, "agreed|flagged|confirmed")
    tm = run["timing"]
    v.need(tm, "timing", "total_s", _num, "number")
    v.need(tm, "timing", "spark_calls", lambda x: isinstance(x, int), "int")
    v.need(tm, "timing", "sam_calls", lambda x: isinstance(x, int), "int")
    return v.problems
