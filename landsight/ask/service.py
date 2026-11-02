"""Ask a stored run's package: the corpus from the package folder, the run's checks, landsight.db's rules and price
list; the answer and the Muse Spark call are written to asks and meta_calls."""

from __future__ import annotations

import json
from pathlib import Path

from landsight.ask.ask import FIXTURES, ask
from landsight.ask.corpus import build_corpus
from landsight.store import service

_CORPUS: dict[tuple, list] = {}


def corpus_for(conn, run_id: str) -> list:
    """The chunks for a run's package (memoised per run and price-list state)."""
    row = service.run_row(conn, run_id)
    run = json.loads(row["run"])
    prices = service.price_rows(conn)
    key = (run_id, json.dumps([(p["code"], p["low"], p["high"], p["name"]) for p in prices]))
    if key not in _CORPUS:
        folder = Path(run["package"]["folder"])
        if not folder.is_absolute():
            folder = service.D.REPO / folder
        rules = [dict(r) for r in conn.execute("SELECT * FROM rules ORDER BY rowid")]
        _CORPUS.clear()
        _CORPUS[key] = build_corpus(run, folder, rules=rules, prices=prices)
    return _CORPUS[key]


def ask_run(conn, run_id: str, question: str, live: bool = False, spark=None) -> dict:
    from landsight.review.spark import ReviewSpark

    spark = spark or ReviewSpark("live" if live else "fixtures", FIXTURES)
    out = ask(question, corpus_for(conn, run_id), spark)
    out["run_id"] = run_id
    out["ask_id"] = service.save_ask(conn, run_id, question, out, spark.log[-1:])
    return out
