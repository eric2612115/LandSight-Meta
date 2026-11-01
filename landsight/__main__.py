"""Command line: `python -m landsight takeoff <dxf...> [--fixtures]`, `python -m landsight synth <dir>`,
`python -m landsight review <package_dir> [--fixtures|--live] [--json out.json]` and `python -m landsight serve` (the
API of docs/API.md on http://127.0.0.1:8795; the screen is frontend/, http://localhost:5195)."""

from __future__ import annotations

import argparse
import json
import sys

from landsight.synth import LEVELS, Messiness, generate


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="landsight")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("takeoff", help="print the take-off item table for DXF sheets")
    t.add_argument("dxf", nargs="+")
    t.add_argument("--fixtures", action="store_true", help="replay recorded Muse Spark responses (offline)")
    t.add_argument("--record", action="store_true", help="call Muse Spark and record the responses as fixtures")
    t.add_argument("--snap", type=float, default=0.25, help="gap snap tolerance in metres (default 0.25)")
    s = sub.add_parser("synth", help="write the synthetic site (three DXF sheets + answer_key.json)")
    s.add_argument("out")
    s.add_argument("--level", choices=sorted(LEVELS), default="m4")
    s.add_argument("--schedule-mismatch", action="store_true")
    s.add_argument("--coloured", action="store_true", help="also write the filled renders of L-1 and L-3")
    v = sub.add_parser("serve", help="serve the API (:8795) the frontend (:5195) reads; the sample package opens on first use")
    v.add_argument("--host", default="127.0.0.1")
    v.add_argument("--port", type=int, default=8795)
    k = sub.add_parser("package", help="write the sample developer's package (30 files), the price list and the answer key")
    k.add_argument("out")
    k.add_argument("--seed", type=int, default=0)
    r = sub.add_parser("review", help="review a package folder: triage, sheets, take-off, checks, scoreboard")
    r.add_argument("package_dir")
    mode = r.add_mutually_exclusive_group()
    mode.add_argument("--fixtures", action="store_true", help="replay recorded Muse Spark answers (default, offline)")
    mode.add_argument("--live", action="store_true", help="call Muse Spark and record every answer as a fixture")
    r.add_argument("--json", dest="json_out", help="write the Run to this file")
    args = ap.parse_args(argv)

    if args.cmd == "review":
        from landsight.review.cli import main as review_main

        return review_main(args.package_dir, live=args.live, json_out=args.json_out)

    if args.cmd == "package":
        from landsight.synth.package import write_package

        pk = write_package(args.out, seed=args.seed)
        print(json.dumps({"package": str(pk.root), "files": len(pk.files), "answer_key": str(pk.answer_key_path),
                          "price_list": str(pk.price_list_path), "counted_trees": pk.key["counted_trees"],
                          "errors": len(pk.key["errors"])}, ensure_ascii=False, indent=1))
        return 0

    if args.cmd == "serve":
        from landsight.app import serve

        print(f"Landsight API on http://{args.host}:{args.port}/api/health (docs/API.md); the screen is the frontend: "
              "cd frontend && npm run dev, then http://localhost:5195 (film: /?director=1&auto=1)")
        serve(args.host, args.port)
        return 0

    if args.cmd == "synth":
        m = LEVELS[args.level]
        if args.schedule_mismatch:
            m = Messiness(**{**m.__dict__, "schedule_mismatch": True})
        key = generate(args.out, m, coloured=args.coloured)
        print(json.dumps({"paths": key["paths"], "totals": key["totals"], "messiness": key["messiness"]["tag"]},
                         ensure_ascii=False, indent=1))
        return 0

    from landsight.meta import FixtureSpark, RecordingSpark, SparkClient
    from landsight.takeoff import format_items, run

    spark = FixtureSpark() if args.fixtures else SparkClient()
    if args.record:
        spark = RecordingSpark(spark)
    result = run(args.dxf, spark, snap_tol_m=args.snap)
    print(format_items(result.items, result.notes))
    if result.rules:
        from landsight.rules import format_rules

        print("\nRegulation check (法規檢核)\n")
        print(format_rules(result.rules))
    print(f"\n{result.calls} Muse Spark calls, {result.seconds:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
