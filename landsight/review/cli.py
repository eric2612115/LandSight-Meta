"""`landsight review <package_dir> [--fixtures|--live] [--json out.json] [--scenario quote|regulation|design|format]`:
run the review and print the file verdicts, the sheets, the checks and the scoreboard; with --scenario, only that
scenario's checks and its slice of the scoreboard."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from landsight.review import scenarios as SC
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


def _spark(live: bool, fixture_dir: str | None, fresh: int):
    """None (the review's default recorder) unless the recordings go elsewhere or calls are asked again."""
    if not fixture_dir and not fresh:
        return None
    from landsight.review.spark import FIXTURES, ReviewSpark

    return ReviewSpark("live" if live else "fixtures", Path(fixture_dir) if fixture_dir else FIXTURES, fresh=fresh)


def _sam(live: bool, fixture_dir: str | None, fresh: int):
    if not fixture_dir and not fresh:
        return None
    from landsight.review.colour import SAM_FIXTURES, ReviewSam, mode_for

    return ReviewSam(mode_for("live" if live else "fixtures"),
                     Path(fixture_dir) / "sam" if fixture_dir else SAM_FIXTURES, fresh=-1 if fresh == -1 else 0)


def print_scenario(run: dict, scenario: str) -> None:
    """Only one scenario's checks and its slice of the scoreboard."""
    checks = [c for c in run["checks"] if c.get("scenario") == scenario]
    print(f"{run['package']['name']}: {scenario} — {len(checks)} of {len(run['checks'])} checks")
    for c in checks:
        print(f"  {c['check_id']:<7} {c['severity']:<6} {c['category']:<14} {c['title']}")
    sl = run["scenarios"][scenario]
    print("\n" + SC.line(scenario, sl))
    for k, label in (("flagged", "flagged for review"), ("missed", "missed"), ("false_alarms", "false alarms")):
        if sl[k]:
            print(f"  {label}: " + ", ".join(sl[k]))


def main(package_dir: str, live: bool = False, json_out: str | None = None, scenario: str | None = None,
         db: str | None = None, fixture_dir: str | None = None, fresh: int = 0) -> int:
    try:
        locate(Path(package_dir))
    except (ValueError, OSError) as e:
        print(f"landsight review: {e} (give the package folder, e.g. the one `landsight package <dir>` wrote)",
              file=sys.stderr)
        return 2
    if scenario is not None and scenario not in SC.SCENARIOS:
        print(f"landsight review: unknown scenario {scenario!r}; one of {', '.join(SC.CATCHES)}", file=sys.stderr)
        return 2
    if fresh and not live:
        print("landsight review: --fresh re-asks recorded calls live and needs --live", file=sys.stderr)
        return 2
    keep: dict = {}
    if db:
        from landsight.store import service

        run = service.review_folder(package_dir, live=live, db_path=db, keep=keep, fixture_dir=fixture_dir, fresh=fresh)
    else:
        run = review(package_dir, mode="live" if live else "fixtures", keep=keep,
                     spark=_spark(live, fixture_dir, fresh), sam=_sam(live, fixture_dir, fresh))
    if json_out:
        Path(json_out).write_text(json.dumps(run, ensure_ascii=False, indent=1))
    if scenario is not None:
        print_scenario(run, scenario)
        problems = validate(run)
        return 0 if not problems else 1
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
        outside = [c for c in run["checks"] if c.get("unscored")]
        if outside:
            print("  outside the answer key: " + "; ".join(f"{c['check_id']} {c['severity']} {c['title'].split(':')[0]}"
                                                          for c in outside))
        print("  by scenario: " + " | ".join(
            f"{k} {len(v['found'])}/{len(v['flagged'])}/{len(v['missed'])} of {v['planted']}"
            for k, v in run["scenarios"].items() if k in SC.CATCHES) + " (found/flagged/missed)")
    t = run["timing"]
    calls = t.get("calls", [])
    live_spark = sum(1 for c in calls if c.get("recorded") is False and c.get("model") != "sam-3.1")
    live_sam = sum(1 for c in calls if c.get("recorded") is False and c.get("model") == "sam-3.1")
    print(f"\n{t['spark_calls']} Muse Spark calls ({'recorded' if not live_spark else f'{live_spark} live'}), "
          f"{t['spark_s']} s of calls; {t['sam_calls']} SAM 3.1 calls ({'recorded' if not live_sam else f'{live_sam} live'}), "
          f"{t['sam_s']} s; {t['total_s']} s in all")
    for f in t.get("fresh", []):
        print(f"  fresh: {f['call']} -> response id {f['response_id']} ({'same answer as' if f['same_as_recorded'] else 'differs from'} "
              f"{f['fresh_of']}; {f['seconds']} s; {f['fixture']})")
    problems = validate(run)
    if problems:
        print(f"\nRun shape: {len(problems)} problems, first: {problems[0]}")
    for n in run.get("notes", []):
        print(f"note: {n}")
    return 0 if not problems else 1
