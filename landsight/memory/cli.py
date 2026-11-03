"""`landsight memory seed-sample|distil|show|apply|forget [--firm f] [--run id] [--package dir] [--live] [--json f]
[--db f]`: firm memory from the command line (landsight.memory; docs/NEW-MODES.md)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from landsight.store import connect


def _print_call(call: dict) -> None:
    how = "recorded" if call.get("recorded") else "live"
    usage = call.get("usage") or {}
    print(f"  {call.get('model')} {how}, {call.get('seconds')} s, {usage.get('prompt_tokens', 0):,} in / "
          f"{usage.get('completion_tokens', 0):,} out tokens · response {call.get('response_id')} · {call.get('fixture')}")


def print_habits(mem: dict) -> None:
    h = mem["habits"]
    print(f"Firm {mem['firm']!r}: learned from {len(mem['evidence'])} decisions ({mem['updated_at']})")
    _print_call(mem.get("call") or {})
    print(f"\n{h.get('summary', '')}\n\nSends back, in this order:")
    for i, g in enumerate(h.get("send_back") or [], 1):
        m = g.get("match") or {}
        print(f"  {i}. {g['name']}  [{', '.join(m.get('categories') or [])} | {', '.join(m.get('scenarios') or [])} | "
              f"{', '.join(m.get('severities') or [])} | {', '.join(m.get('keywords') or [])}]  ({', '.join(g.get('evidence') or [])})")
    print("Keeps to itself:")
    for g in h.get("handle_internally") or []:
        print(f"  - {g['name']} ({', '.join(g.get('evidence') or [])})")
    p = h.get("pricing") or {}
    print(f"Pricing: {p.get('basis', '')}; tolerance {p.get('tolerance_pct', 0):g}%")
    for c in p.get("conventions") or []:
        print(f"  - {c}")
    print("Plant substitutions:")
    for s in h.get("species_substitutions") or []:
        print(f"  - {s['from']} -> {s['to']}: {s['when']}")
    r = h.get("reply") or {}
    print(f"Reply: {r.get('tone', '')}; \"{r.get('greeting', '')}\" ... \"{r.get('sign_off', '')}\"")
    for x in r.get("rules") or []:
        print(f"  - {x}")


def print_applied(out: dict) -> None:
    print(f"{out['package']} (run {out['run_id']}) with firm {out['firm']!r}'s memory "
          f"({out['memory']['decisions']} decisions, {out['memory']['model']})\n")
    print("BEFORE: the run's order")
    for n, f in enumerate(out["before"]["findings"], 1):
        print(f"  {n:>2}. {f['check_id']:<7} {f['severity']:<6} {f['title']}")
    print("\nAFTER: the firm's groups")
    n = 0
    for g in out["after"]["groups"]:
        print(f"  {'SEND' if g['send'] else 'KEEP'}  {g['name']}")
        for f in g["checks"]:
            n += 1
            extra = "".join(f"\n              note: {x}" for x in f.get("firm_notes") or [])
            print(f"      {n:>2}. {f['check_id']:<7} {f['severity']:<6} {f['title']}{extra}")
    for label, r in (("BEFORE", out["before"]["reply"]), ("AFTER", out["after"]["reply"])):
        print(f"\n---------------- reply {label} ({r.get('by')})\nSubject: {r['subject']}\n\n{r['body']}")
    r = out["after"]["reply"]
    if r.get("call"):
        print()
        _print_call(r["call"])
    if r.get("note"):
        print(f"  note: {r['note']}")
    for k, label in (("missing", "findings the draft left out"), ("added", "ids the draft added"),
                     ("unverified_numbers", "numbers not in what it was given")):
        if r.get(k):
            print(f"  {label}: {', '.join(r[k])}")


def main(action: str, firm: str = "default", run_id: str | None = None, package: str | None = None,
         live: bool = False, db: str | None = None, json_out: str | None = None) -> int:
    from landsight.memory import NoMemory, apply, distil, forget, get_memory, seed_sample
    from landsight.review.spark import FixtureMissing, SparkUnavailable, live_problem
    from landsight.store import service

    if live and live_problem("api"):
        print(f"landsight memory: {live_problem('api')}", file=sys.stderr)
        return 2
    conn = connect(db)
    out: dict
    try:
        if action == "seed-sample":
            out = seed_sample(conn)
            print(f"{out['package']}: run {out['run_id']} reviewed from its recordings; {len(out['decisions'])} "
                  f"decisions recorded ({', '.join(out['decisions'])})" + (f"; not in this run: {', '.join(out['skipped'])}"
                                                                          if out["skipped"] else ""))
        elif action == "distil":
            out = distil(conn, firm, live=live, run_ids=[run_id] if run_id else None)
            print_habits(out)
        elif action == "show":
            out = get_memory(conn, firm)
            print_habits(out)
        elif action == "forget":
            out = {"firm": firm, "forgotten": forget(conn, firm)}
            print(f"firm {firm!r}: {'memory deleted' if out['forgotten'] else 'no memory to delete'}")
        else:  # apply
            if package:
                pk = service.package_for_folder(conn, Path(package))
                run_id = service.review_package(conn, pk["package_id"], live=False)["run_id"]
            run_id = run_id or service.latest_run_id(conn)
            if not run_id:
                print("landsight memory: no run to apply the memory to; review a package first", file=sys.stderr)
                return 2
            out = apply(conn, firm, run_id, live=live)
            print_applied(out)
    except NoMemory as e:
        print(f"landsight memory: {e.args[0]}", file=sys.stderr)
        return 2
    except FixtureMissing as e:
        print(f"landsight memory: no recorded Muse Wonder answer for these decisions ({e}); add --live and "
              "MODEL_API_KEY to ask it", file=sys.stderr)
        return 2
    except (KeyError, ValueError, SparkUnavailable) as e:
        print(f"landsight memory: {e}", file=sys.stderr)
        return 2
    finally:
        conn.close()
    if json_out:
        Path(json_out).write_text(json.dumps(out, ensure_ascii=False, indent=1))
    return 0
