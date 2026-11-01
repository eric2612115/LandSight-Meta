"""`landsight review <package_dir> [--fixtures|--live] [--json out.json]`: run the review and print the file verdicts,
the sheets, the checks and the scoreboard."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from landsight.review.run import locate, review
from landsight.review.validate import validate

RASTER_REASON = "raster PDF page: no vectors, read for its title block only, not measured"


def scoreboard(errors: dict) -> str:
    """The one scoreboard line, exactly as the README and docs/JUDGE-PLAYBOOK.md quote it (tests keep them in sync)."""
    return (f"planted {errors['planted']} · found {len(errors['found'])} · flagged {len(errors['flagged'])} · missed "
            f"{len(errors['missed'])} · false alarms {len(errors['false_alarms'])}")


def raster_sheets(keep: dict) -> list[dict]:
    """The raster PDF pages as the API serves them (landsight.app.package): sheets read for their title block only."""
    out = []
    for r in keep.get("rasters", []):
        a = r.get("answer") or {}
        out.append({"sheet_id": f"{r['file_id']}-p{r['page'] + 1}", "kind": a.get("kind") or "plan", "counted": False,
                    "not_counted_reason": RASTER_REASON})
    return out


def main(package_dir: str, live: bool = False, json_out: str | None = None) -> int:
    try:
        locate(Path(package_dir))
    except (ValueError, OSError) as e:
        print(f"landsight review: {e} (give the package folder, e.g. the one `landsight package <dir>` wrote)",
              file=sys.stderr)
        return 2
    keep: dict = {}
    run = review(package_dir, mode="live" if live else "fixtures", keep=keep)
    if json_out:
        Path(json_out).write_text(json.dumps(run, ensure_ascii=False, indent=1))
    print(f"{run['package']['name']}: {run['package']['file_count']} files")
    for f in run["files"]:
        print(f"  {f['file_id']:<7} {f['verdict']:<17} {f['decided_by']:<8} {f['path']}")
    sheets = run["sheets"] + raster_sheets(keep)
    print(f"\n{len(sheets)} sheets ({len(run['sheets'])} DXF and vector PDF pages, {len(sheets) - len(run['sheets'])} "
          "raster pages)")
    for s in sheets:
        print(f"  {s['sheet_id']:<10} {s['kind']:<11} {'counted' if s['counted'] else 'not counted: ' + s.get('not_counted_reason', '')}")
    print(f"\n{len(run['items'])} items")
    for it in run["items"]:
        print(f"  {it['item_id']} {it['kind']:<12} {it['label']:<20} geometry {it['geometry_count']} spark "
              f"{it['spark_count']} schedule {it['schedule_count']} {'agreed' if it['agreed'] else 'FLAG'}")
    print(f"\n{len(run['checks'])} checks")
    for c in run["checks"]:
        print(f"  {c['check_id']:<7} {c['severity']:<6} {c['category']:<14} {c['title']}")
    e = run["errors"]
    if e.get("planted"):
        print("\n" + scoreboard(e))
        if e["flagged"]:
            print("  flagged for review: " + ", ".join(e["flagged"]))
        if e["missed"]:
            print("  missed: " + ", ".join(e["missed"]))
        if e["false_alarms"]:
            print("  false alarms: " + ", ".join(e["false_alarms"]))
    t = run["timing"]
    print(f"\n{t['spark_calls']} Muse Spark calls ({'recorded' if t['recorded'] else 'live'}), {t['spark_s']} s of calls, "
          f"{t['total_s']} s in all")
    problems = validate(run)
    if problems:
        print(f"\nRun shape: {len(problems)} problems, first: {problems[0]}")
    for n in run.get("notes", []):
        print(f"note: {n}")
    return 0 if not problems else 1
