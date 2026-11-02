"""The answer-key scoreboard (sample package only): every planted error matched to the checks that report it, by
category and evidence (files, drawing objects, bill cells); the rest are missed, honestly. A check that raises an
alarm (flag, fail, review) and matches no planted error is a false alarm. Checks that report agreement (`ok`) are
never matched and never alarms; nor are checks marked `unscored` (a computed index the answer key does not cover,
such as Art. 305 water retention, D-64): they are listed as "outside the answer key".

Matching rules, per (check, error): the categories must be compatible; the check must share a file (a DXF sheet's
revisions count as one sheet) or a bill cell with the error; when both name bill cells, one must be shared; when both
name drawing objects, one must be shared (objects are matched to the key's by sheet number and position, within 1 m).
Score = 3 × shared cells + 2 × shared objects + shared files; each check goes to its best error."""

from __future__ import annotations

import math

COMPAT = {
    "geometry": {"quantity", "area", "sheet", "scale"},
    "schedule": {"quantity"},
    "revision": {"revision"},
    "sheet": {"sheet", "scale"},
    "rules": {"regulation", "protected_tree"},
    "bill": {"bill", "quantity", "units", "arithmetic", "revision"},
    "price": {"price"},
    "ingest": {"ingest", "sheet"},
    "document": {"document"},
    "floors": {"quantity", "sheet"},  # the tower: one sheet for several floors, floors that look alike
}
ALARM = ("flag", "fail", "review")


def _cell(file_path: str, sheet: str | None, cell: str | None) -> tuple:
    return (file_path, sheet or "", cell or "*")


def _cells_overlap(a: set, b: set) -> int:
    n = 0
    for f, s, c in a:
        if any(f == f2 and s == s2 and (c == c2 or "*" in (c, c2)) for f2, s2, c2 in b):
            n += 1
    return n


def score(checks: list[dict], key: dict, files: dict, sheets: dict, objects: dict) -> tuple[dict, dict[int, str]]:
    """`files`: file_id -> {path, parent_path, number}; `sheets`: sheet_id -> {number, file_id}; `objects`: sheet_id ->
    [DrawingObject]. Returns (ErrorScore, {check index: error id})."""
    path_family = {}
    for f in files.values():
        if f.get("number"):
            path_family[f["path"]] = f"sheet:{f['number']}"

    def fam(paths: set) -> set:
        return paths | {path_family[p] for p in paths if p in path_family}

    key_objs = [o for o in key.get("objects", []) if o.get("centre")]

    def key_ids(sid: str, oid: str) -> set:
        sh = sheets.get(sid)
        o = next((x for x in objects.get(sid, []) if x["object_id"] == oid), None)
        if sh is None or o is None or not o.get("centre"):
            return set()
        num = sh.get("number") or ""
        return {k["id"] for k in key_objs if (k["sheet"] == num or k["sheet"].startswith(num + " "))
                and math.dist(k["centre"], o["centre"]) <= 1.0}

    errors = []
    for e in key.get("errors", []):
        errors.append({"id": e["id"], "cats": COMPAT.get(e["category"], {e["category"]}), "files": fam(set(e["files"])),
                       "objects": set(e.get("object_ids") or []),
                       "cells": {_cell(c["file"], c.get("sheet"), c.get("cell")) for c in e.get("cells") or []},
                       "planted": e.get("planted", True)})

    assigned: dict[int, str] = {}
    for i, c in enumerate(checks):
        if c.get("ok") or c.get("unscored"):
            continue
        ev = c.get("evidence") or {}
        paths = set()
        for fid in ev.get("file_ids") or []:
            f = files.get(fid)
            if f:
                paths.add(f["path"])
                if f.get("parent_path"):
                    paths.add(f["parent_path"])
        for sid in ev.get("sheet_ids") or []:
            sh = sheets.get(sid)
            if sh and files.get(sh["file_id"]):
                paths.add(files[sh["file_id"]]["path"])
        paths = fam(paths)
        cells = set()
        for ref in ev.get("cells") or []:
            fid, rest = ref.split(":", 1)
            sheet, cell = rest.split("!", 1)
            if fid in files:
                cells.add(_cell(files[fid]["path"], sheet, cell))
        objs = set()
        for ref in ev.get("object_ids") or []:
            sid, oid = ref.split("/", 1)
            objs |= key_ids(sid, oid)
        best = None
        for e in errors:
            if c["category"] not in e["cats"]:
                continue
            fo, co = len(paths & e["files"]), _cells_overlap(cells, e["cells"])
            oo = len(objs & e["objects"])
            if not (fo or co):
                continue
            if cells and e["cells"] and not co:
                continue
            if ev.get("object_ids") and e["objects"] and not oo:
                continue
            s = 3 * co + 2 * oo + fo
            if best is None or s > best[0]:
                best = (s, e["id"])
        if best:
            assigned[i] = best[1]

    found, flagged, missed, detail = [], [], [], {}
    for e in errors:
        mine = [i for i, eid in assigned.items() if eid == e["id"]]
        if not mine:
            missed.append(e["id"])
        elif any(checks[i]["severity"] != "review" for i in mine):
            found.append(e["id"])
        else:
            flagged.append(e["id"])
        detail[e["id"]] = mine
    false_alarms = [i for i, c in enumerate(checks) if c["severity"] in ALARM and not c.get("ok")
                    and not c.get("unscored") and i not in assigned]
    return ({"planted": len(errors), "found": found, "flagged": flagged, "missed": missed,
             "false_alarms": false_alarms, "_detail": detail}, assigned)
