"""The four kinds of catch as a field (docs/PLAN-V2.md phase 1): every check and every planted error has a scenario,
a matched check sits in its error's scenario, the slices add up to the scoreboard, and `--scenario` prints one."""

from __future__ import annotations

import json

from landsight.review import scenarios as SC
from landsight.review.validate import validate

from conftest import SAMPLE


def test_every_check_and_error_has_a_scenario(sample_db):
    _, run = sample_db
    assert all(c["scenario"] in SC.SCENARIOS for c in run["checks"])
    key = json.loads((SAMPLE / "answer_key.json").read_text())
    assert all(e["scenario"] in SC.CATCHES for e in key["errors"])
    assert {e["id"]: e["scenario"] for e in key["errors"]} == {k: v for k, v in SC.ERROR_SCENARIO.items()
                                                               if k.startswith("E")}
    assert not validate(run)


def test_a_matched_check_sits_in_its_errors_scenario(sample_db):
    _, run = sample_db
    for c in run["checks"]:
        eid = c["check_id"].split(".")[0]
        if eid in SC.ERROR_SCENARIO:
            assert c["scenario"] == SC.ERROR_SCENARIO[eid], (c["check_id"], c["title"], c["scenario"])
    assert all(c["scenario"] == "info" for c in run["checks"] if c.get("ok"))


def test_the_slices_add_up_to_the_scoreboard(sample_db):
    _, run = sample_db
    s, e = run["scenarios"], run["errors"]
    got = {k: (v["planted"], len(v["found"]), len(v["flagged"]), len(v["missed"]), len(v["false_alarms"]))
           for k, v in s.items() if k in SC.CATCHES}
    assert got == {"quote": (10, 9, 1, 0, 0), "regulation": (5, 4, 1, 0, 0), "design": (11, 11, 0, 0, 0),
                   "format": (4, 4, 0, 0, 0)}
    assert sum(v["planted"] for v in s.values()) == e["planted"] == 30
    assert sorted(x for v in s.values() for x in v["flagged"]) == sorted(e["flagged"]) == ["E15", "E18"]
    assert sum(v["checks"] for v in s.values()) == len(run["checks"])


def test_run_slice_keeps_only_its_checks(sample_db):
    _, run = sample_db
    q = SC.run_slice(run, "quote")
    assert q["scenario"] == "quote" and q["checks"] and all(c["scenario"] == "quote" for c in q["checks"])
    assert q["errors"]["planted"] == 10 and q["errors"]["flagged"] == ["E18"]
    assert set(q["errors"]["matches"]) <= set(q["errors"]["found"]) | {"E18"}


def test_cli_prints_one_scenario(capsys, tmp_path):
    from landsight.__main__ import main

    assert main(["review", str(SAMPLE), "--scenario", "format", "--no-db"]) == 0
    out = capsys.readouterr().out
    assert "format: planted 4 · found 4 · flagged 0 · missed 0 · false alarms 0" in out
    rows = [ln for ln in out.splitlines() if ln.startswith("  ") and not ln.startswith("   ")]
    assert rows and all(" ingest " in r or " sheet " in r for r in rows)
    assert "E25" in out and "E14" not in out
