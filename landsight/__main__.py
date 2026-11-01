"""Command line: `python -m landsight takeoff <dxf...> [--fixtures]` and `python -m landsight synth <dir>`."""

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
    args = ap.parse_args(argv)

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
    print(f"\n{result.calls} Muse Spark calls, {result.seconds:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
