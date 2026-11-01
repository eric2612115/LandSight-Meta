"""`landsight review <package_dir> [--fixtures|--live] [--json out.json]`: run the review and print the file verdicts,
the sheets, the checks and the scoreboard."""

from __future__ import annotations

import json
from pathlib import Path

from landsight.review.run import review
from landsight.review.validate import validate


def main(package_dir: str, live: bool = False, json_out: str | None = None) -> int:
    run = review(package_dir, mode="live" if live else "fixtures")
    if json_out:
        Path(json_out).write_text(json.dumps(run, ensure_ascii=False, indent=1))
    print(f"{run['package']['name']}: {run['package']['file_count']} files")
    for f in run["files"]:
        print(f"  {f['file_id']:<7} {f['verdict']:<17} {f['decided_by']:<8} {f['path']}")
    print(f"\n{len(run['sheets'])} sheets")
    for s in run["sheets"]:
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
        print(f"\nplanted {e['planted']} · found {len(e['found'])} · flagged {len(e['flagged'])} · missed "
              f"{len(e['missed'])} · false alarms {len(e['false_alarms'])}")
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
