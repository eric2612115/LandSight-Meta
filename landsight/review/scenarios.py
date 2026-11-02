"""The four kinds of catch (docs/PLAN-V2.md, phase 1) as a field on every check and every planted error, and the
scoreboard sliced by them.

- quote (報價抓錯): the bill against the drawing, against the firm's price list, against itself (arithmetic, hidden
  sheets, revisions, units).
- regulation (法規抓錯): greening (§302), the pit downgrade, the fire lane (§299), protected trees, the green-building
  checklist, soil depths on artificial ground, the typical-floor multiplier.
- design (設計抓錯): revisions of a sheet, enlarged / elevation / background sheets, scale, overlaps, label vs hatch,
  open outlines, legends, the index, detail vs plan, sheets that look alike.
- format (格式抓錯): what the files are (backups, Excel 97, archives, raster scans, pasted images, decks, corrupt
  files) and the drawings that came out of them (archive members, PDF pages of a DXF).
- info: checks that report agreement (`ok`) and plain document summaries; never a catch.

A check states its scenario when its author knows better than its category (e.g. a tower check); otherwise
`scenario_of` maps category + sources. Planted errors carry `scenario` in the answer key; keys written before the
field existed fall back to ERROR_SCENARIO. A slice counts the planted errors of its scenario (found / flagged /
missed, whichever check found them) and the false alarms among its own checks."""

from __future__ import annotations

SCENARIOS = ("quote", "regulation", "design", "format", "info")
CATCHES = ("quote", "regulation", "design", "format")

ERROR_SCENARIO = {
    **dict.fromkeys(("E02", "E13", "E17", "E18", "E19", "E20", "E21", "E22", "E23", "E24"), "quote"),
    **dict.fromkeys(("E09", "E12", "E14", "E15", "E30"), "regulation"),
    **dict.fromkeys(("E01", "E03", "E04", "E05", "E06", "E07", "E08", "E10", "E11", "E16", "E29"), "design"),
    **dict.fromkeys(("E25", "E26", "E27", "E28"), "format"),
    # the tower package (docs/PACKAGE.md v2); T01 sits with regulation as PLAN-V2 lists it
    **dict.fromkeys(("T01", "T02"), "regulation"),
    **dict.fromkeys(("T03", "T04", "T05", "T08"), "design"),
    **dict.fromkeys(("T06", "T07"), "quote"),
}
CATEGORY = {"bill": "quote", "price": "quote", "arithmetic": "quote", "units": "quote",
            "regulation": "regulation", "protected_tree": "regulation",
            "sheet": "design", "scale": "design", "area": "design",
            "ingest": "format"}
ALARM = ("flag", "fail", "review")


def scenario_of(check: dict, member_files: set[str] | frozenset = frozenset(),
                page_sheets: set[str] | frozenset = frozenset()) -> str:
    """The scenario of one Check dict. `member_files`: file ids unpacked from an archive; `page_sheets`: sheet ids
    that are PDF pages (a drawing that is only a copy of another file is a format matter)."""
    if check.get("scenario") in SCENARIOS:
        return check["scenario"]
    if check.get("ok"):
        return "info"
    cat, by = check.get("category", ""), set(check.get("by") or [])
    ev = check.get("evidence") or {}
    if cat == "document":
        return "regulation" if check.get("severity") in ALARM else "info"
    if cat == "revision":
        return "quote" if "bill" in by else "design"
    if cat == "quantity":
        return "quote" if ("bill" in by or "schedule" in (check.get("title") or "").lower()) else "design"
    if cat == "sheet":
        files, sheets = set(ev.get("file_ids") or []), set(ev.get("sheet_ids") or [])
        if (files and files <= set(member_files)) or (sheets and sheets <= set(page_sheets)):
            return "format"
    return CATEGORY.get(cat, "design")


def error_scenario(error: dict) -> str:
    return error.get("scenario") or ERROR_SCENARIO.get(error["id"].split(".")[0], "design")


def slices(checks: list[dict], errors: dict, key_errors: list[dict] | None) -> dict:
    """{scenario: {planted, found, flagged, missed, false_alarms, checks, alarms}} for the four catches and info.
    `errors` is the Run's ErrorScore (ids); `key_errors` the answer key's errors (None for a package without one)."""
    of = {e["id"]: error_scenario(e) for e in key_errors or []}
    out = {}
    for s in SCENARIOS:
        mine = [c for c in checks if c.get("scenario") == s]
        row = {"planted": sum(1 for v in of.values() if v == s),
               "found": [e for e in errors.get("found", []) if of.get(e) == s],
               "flagged": [e for e in errors.get("flagged", []) if of.get(e) == s],
               "missed": [e for e in errors.get("missed", []) if of.get(e) == s],
               "false_alarms": [c["check_id"] for c in mine if c["check_id"] in set(errors.get("false_alarms", []))],
               "checks": len(mine), "alarms": sum(1 for c in mine if c.get("severity") in ALARM and not c.get("ok"))}
        out[s] = row
    return out


def assign(checks: list[dict], member_files=frozenset(), page_sheets=frozenset()) -> None:
    for c in checks:
        c["scenario"] = scenario_of(c, member_files, page_sheets)


def line(name: str, row: dict) -> str:
    """One scoreboard line for a slice, in the CLI's form."""
    return (f"{name}: planted {row['planted']} · found {len(row['found'])} · flagged {len(row['flagged'])} · missed "
            f"{len(row['missed'])} · false alarms {len(row['false_alarms'])}")


def run_slice(run: dict, scenario: str) -> dict:
    """The Run as one scenario sees it: only its checks, and `errors` limited to its planted errors (the full
    scoreboard stays in `scenarios`)."""
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario {scenario!r}: one of {', '.join(SCENARIOS)}")
    out = dict(run)
    out["checks"] = [c for c in run["checks"] if c.get("scenario") == scenario]
    sl = (run.get("scenarios") or {}).get(scenario) or {}
    e = dict(run.get("errors") or {})
    ids = set(sl.get("found", [])) | set(sl.get("flagged", [])) | set(sl.get("missed", []))
    e.update(planted=sl.get("planted", 0), found=sl.get("found", []), flagged=sl.get("flagged", []),
             missed=sl.get("missed", []), false_alarms=sl.get("false_alarms", []))
    if "matches" in e:
        e["matches"] = {k: v for k, v in e["matches"].items() if k in ids}
    out["errors"] = e
    out["scenario"] = scenario
    return out
