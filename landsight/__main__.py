"""Command line: `python -m landsight takeoff <dxf...> [--fixtures]`, `python -m landsight synth <dir>`,
`python -m landsight package <dir> [--tower]`, `python -m landsight review <package_dir> [--fixtures|--live]
[--scenario quote|regulation|design|format] [--json out.json]`, `python -m landsight db init|reset|stats`,
`python -m landsight ask "<question>" [--run id] [--live]` and `python -m landsight serve` (the API of docs/API.md on
http://127.0.0.1:8795; the screen is frontend/, http://localhost:5195)."""

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
    k.add_argument("--tower", action="store_true", help="write the tower package (docs/PACKAGE.md v2: six floor sheets, "
                                                         "the bill, answer key T01-T08) instead")
    k.add_argument("--layout", choices=["a", "b"], default="a",
                   help="b: the held-out package (another site layout, a seeded subset of the planted errors)")
    r = sub.add_parser("review", help="review a package folder: triage, sheets, take-off, checks, scoreboard")
    r.add_argument("package_dir", help="the package folder (or the folder `landsight package` wrote it into)")
    mode = r.add_mutually_exclusive_group()
    mode.add_argument("--fixtures", action="store_true", help="replay recorded Muse Spark answers (default, offline)")
    mode.add_argument("--live", action="store_true", help="call Muse Spark and record every answer as a fixture")
    r.add_argument("--json", dest="json_out", help="write the Run to this file")
    r.add_argument("--scenario", choices=["quote", "regulation", "design", "format", "info"],
                   help="print only this scenario's checks and its slice of the scoreboard")
    r.add_argument("--db", help="the database the run is written to (default: LANDSIGHT_DB or ./landsight.db)")
    r.add_argument("--no-db", action="store_true", help="do not write the run to a database (price list from the CSV)")
    r.add_argument("--fixture-dir", help="read and write recordings here instead of tests/fixtures/review")
    r.add_argument("--fresh", default="0", metavar="N|all",
                   help="with --live: re-ask N recorded Muse Spark calls (all: every Spark and SAM call); the answers "
                        "and their response ids go to fresh/ beside the recordings, which stay as they are")
    d = sub.add_parser("db", help="landsight.db: init (create and seed), reset (drop and seed), stats (row counts), "
                                  "calls (the Meta call table of a run: count, median seconds, tokens, cost)")
    d.add_argument("action", choices=["init", "reset", "stats", "calls"])
    d.add_argument("--db", help="the database file (default: LANDSIGHT_DB or ./landsight.db)")
    d.add_argument("--run", help="calls: the run id (default: the latest run)")
    a = sub.add_parser("ask", help="ask a reviewed package a question (Muse Spark answers from the package's own text)")
    a.add_argument("question")
    a.add_argument("--run", help="the run id (default: the latest run in the database)")
    a.add_argument("--live", action="store_true", help="call Muse Spark and record the answer")
    a.add_argument("--db", help="the database file (default: LANDSIGHT_DB or ./landsight.db)")
    args = ap.parse_args(argv)

    if args.cmd == "review":
        from landsight.review.cli import main as review_main
        from landsight.store import default_path

        db = None if args.no_db else (args.db or str(default_path()))
        try:
            fresh = -1 if str(args.fresh).lower() == "all" else max(0, int(args.fresh))
        except ValueError:
            print(f"landsight review: --fresh takes a number or 'all', not {args.fresh!r}", file=sys.stderr)
            return 2
        return review_main(args.package_dir, live=args.live, json_out=args.json_out, scenario=args.scenario, db=db,
                           fixture_dir=args.fixture_dir, fresh=fresh)

    if args.cmd == "db":
        from landsight.store import connect, default_path, init, reset, stats

        path = args.db or default_path()
        conn = connect(path, create=args.action != "reset")
        if args.action == "calls":
            from landsight.store import costs, service

            rid = args.run or service.latest_run_id(conn)
            rows = [r for r in service.meta_calls(conn, rid) if r["ask_id"] is None]
            print(f"run {rid}: {len(rows)} Meta calls, {sum(1 for r in rows if r['live'])} live\n")
            print(costs.markdown(rows))
            return 0
        out = {"init": init, "reset": reset, "stats": stats}[args.action](conn)
        if args.action == "init":
            from landsight.store.service import seed_samples

            out = seed_samples(conn) | {"tables": stats(conn)}
        print(json.dumps({"db": str(path), **out}, ensure_ascii=False, indent=1))
        return 0

    if args.cmd == "ask":
        from landsight.ask.cli import main as ask_main

        return ask_main(args.question, run_id=args.run, live=args.live, db=args.db)

    if args.cmd == "package":
        if args.layout == "b":
            from landsight.synth.heldout import write_heldout

            pk = write_heldout(args.out, seed=args.seed)
            print(json.dumps({"package": str(pk.root), "files": len(pk.files), "answer_key": str(pk.answer_key_path),
                              "price_list": str(pk.price_list_path), "planted": pk.key["package"]["planted"]},
                             ensure_ascii=False, indent=1))
            return 0
        if args.tower:
            from landsight.synth.tower import write_tower

            pk = write_tower(args.out, seed=args.seed)
            print(json.dumps({"package": str(pk.root), "files": len(pk.files), "answer_key": str(pk.answer_key_path),
                              "price_list": str(pk.price_list_path), "errors": len(pk.key["errors"])},
                             ensure_ascii=False, indent=1))
            return 0
        from landsight.synth.package import write_package

        pk = write_package(args.out, seed=args.seed)
        print(json.dumps({"package": str(pk.root), "files": len(pk.files), "answer_key": str(pk.answer_key_path),
                          "price_list": str(pk.price_list_path), "counted_trees": pk.key["counted_trees"],
                          "errors": len(pk.key["errors"])}, ensure_ascii=False, indent=1))
        return 0

    if args.cmd == "serve":
        from landsight.app.server import PORT, PortBusy, bind, serve

        try:
            sock = bind(args.host, args.port)
        except PortBusy as e:
            print(f"landsight serve: {e}", file=sys.stderr)
            return 2
        proxy = "" if args.port == PORT else f"VITE_API_PORT={args.port} "
        banner = (f"Landsight API on http://{args.host}:{args.port}/api/health (docs/API.md). The screen, in a second "
                  f"terminal: cd frontend && {proxy}npm run dev, then http://localhost:5195 (film: /?director=1&auto=1)")
        serve(args.host, args.port, sock=sock, on_ready=lambda: print(banner, flush=True))
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
