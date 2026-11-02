"""`landsight ask "<question>" [--run id] [--live]`: ask the latest (or a given) run's package; prints the answer,
its citations and the proposed actions, and records the question and the call in landsight.db."""

from __future__ import annotations

import sys

from landsight.ask.service import ask_run
from landsight.store import connect, service


def main(question: str, run_id: str | None = None, live: bool = False, db: str | None = None) -> int:
    conn = connect(db)
    run_id = run_id or service.latest_run_id(conn)
    if run_id is None:
        print("landsight ask: no run in the database; review a package first (landsight review <dir>)", file=sys.stderr)
        return 2
    try:
        out = ask_run(conn, run_id, question, live=live)
    except (KeyError, ValueError) as e:
        print(f"landsight ask: {e}", file=sys.stderr)
        return 2
    print(f"Q: {out['question']}\nA: {out['answer']}  (confidence {out['confidence']})")
    for c in out["citations"]:
        print(f"  [{c['file_id']} p{c['page']}{'' if c['verified'] else ' · quote not found in the source'}] "
              f"{c.get('source') or ''}: \"{c['quote']}\"")
    for a in out["proposed_actions"]:
        print(f"  action {a['kind']} {a['target_id']} = {a['value']}: {a['why']}")
    call = out["call"]
    print(f"  Muse Spark {'recorded' if call.get('recorded') else 'live'}, {call.get('seconds')} s · ask {out['ask_id']}")
    return 0
