"""Firm memory (Muse Wonder), offline: the sample firm's decisions on samples/greenfield, distilled by Muse Wonder
(recorded 2026-11-03 UTC in tests/fixtures/memory/), applied to samples/tower (the reply recorded the same way): the
before/after order and the reply in the firm's voice replay with no key. The arranging rules are checked on their own."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from landsight.memory import habits as H

REPO = Path(__file__).resolve().parents[1]
GREENFIELD, TOWER = REPO / "samples" / "greenfield", REPO / "samples" / "tower"
BEFORE = ["T01", "T02", "T04", "T08", "T09", "T10", "C-42", "T06", "T07"]
AFTER = ["T02", "T10", "T01", "C-42", "T09", "T04", "T08", "T06", "T07"]

pytestmark = pytest.mark.skipif(not (GREENFIELD.is_dir() and TOWER.is_dir()), reason="samples not generated")


@pytest.fixture(scope="module")
def firm(tmp_path_factory):
    """A fresh database: the sample reviewed and decided, the habits distilled (recorded), the tower reviewed."""
    saved = {k: os.environ.pop(k) for k in ("MODEL_API_KEY", "BASETEN_API_KEY", "LANDSIGHT_READER") if k in os.environ}
    try:
        from landsight.memory import distil, seed_sample
        from landsight.store import connect, service

        db = tmp_path_factory.mktemp("memory") / "firm.db"
        conn = connect(db)
        seeded = seed_sample(conn)
        mem = distil(conn, "sample")
        tower = service.review_folder(TOWER, db_path=db)
        yield {"db": db, "conn": conn, "seeded": seeded, "memory": mem, "tower": tower}
    finally:
        os.environ.update(saved)


def test_seed_and_distil_replay(firm):
    from landsight.memory import SAMPLE_DECISIONS

    assert firm["seeded"]["skipped"] == [] and len(firm["seeded"]["decisions"]) == len(SAMPLE_DECISIONS) == 16
    mem = firm["memory"]
    assert len(mem["evidence"]) == 16 and mem["model"] == "muse-wonder-1.0"
    assert mem["call"]["recorded"] is True and mem["call"]["fixture"].startswith("tests/fixtures/memory/firm_habits__")
    assert mem["call"]["response_id"].startswith("chatcmpl-")
    h = mem["habits"]
    recorded = json.loads((REPO / mem["call"]["fixture"]).read_text())["result"]
    assert h == recorded
    assert h["pricing"]["tolerance_pct"] == 15
    assert [g["name"] for g in h["send_back"]][:2] == ["Tree blocking fire truck access", "Greening requirement failure"]
    assert {e for g in h["handle_internally"] for e in g["evidence"]} == {"E01", "E16", "E18", "E23"}
    assert any(s["from"].lower().startswith("duranta") and "ixora" in s["to"].lower() for s in h["species_substitutions"])
    # the evidence never carries run ids or times, so the same decisions make the same prompt
    assert all(set(e) == {"package", "check_id", "scenario", "category", "severity", "title", "reason", "numbers",
                          "decision", "note"} for e in mem["evidence"])


def test_tower_before_after_and_reply(firm):
    from landsight.memory import apply

    out = apply(firm["conn"], "sample", firm["tower"]["run_id"])
    assert out["before"]["order"] == BEFORE and out["after"]["order"] == AFTER
    assert out["after"]["sent"] == AFTER and out["after"]["kept_internal"] == []
    names = [g["name"] for g in out["after"]["groups"]]
    assert names == ["Greening requirement failure", "Other regulation points", "Other drawing points",
                     "Bill quantity differs from drawing", "Unit rate outside the firm's list"]
    before, after = out["before"]["reply"], out["after"]["reply"]
    assert before["by"] == "template" and before["body"].startswith("Dear developer,")
    assert after["by"] == "muse-wonder-1.0" and after["call"]["recorded"] is True
    assert after["order"] == AFTER and after["missing"] == after["added"] == after["unverified_numbers"] == []
    assert "estimating team" in after["body"] and "650–850" in after["body"]  # the firm's range, not the developer's
    assert "NT$280" not in after["body"]


def test_api_and_cli(firm, capsys, monkeypatch):
    from fastapi.testclient import TestClient

    from landsight.__main__ import main
    from landsight.app import create_app

    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    c = TestClient(create_app(db_path=firm["db"]))
    assert c.get("/api/firms/sample/memory").json()["habits"] == firm["memory"]["habits"]
    assert c.get("/api/firms/nobody/memory").status_code == 404
    r = c.get(f"/api/runs/{firm['tower']['run_id']}/memory?firm=sample").json()
    assert r["after"]["order"] == AFTER and r["after"]["reply"]["by"] == "muse-wonder-1.0"
    assert c.post(f"/api/runs/{firm['tower']['run_id']}/memory?firm=sample&live=1").status_code == 400
    assert c.get("/api/runs/nope/memory?firm=sample").status_code == 404
    assert c.post("/api/firms/sample/memory/distil", json={"run_ids": "x"}).status_code == 422
    assert main(["memory", "apply", "--firm", "sample", "--run", firm["tower"]["run_id"], "--db", str(firm["db"])]) == 0
    printed = capsys.readouterr().out
    assert "BEFORE: the run's order" in printed and "reply AFTER (muse-wonder-1.0)" in printed
    assert main(["memory", "show", "--firm", "nobody", "--db", str(firm["db"])]) == 2
    assert main(["memory", "distil", "--firm", "sample", "--live", "--db", str(firm["db"])]) == 2  # no key


def test_forget(tmp_path):
    from landsight.memory import forget, get_memory, save_memory
    from landsight.store import connect

    conn = connect(tmp_path / "f.db")
    save_memory(conn, "f", {"send_back": []}, [], {"model": "muse-wonder-1.0"})
    assert get_memory(conn, "f")["habits"] == {"send_back": []}
    assert forget(conn, "f") is True and forget(conn, "f") is False
    with pytest.raises(H.NoMemory):
        get_memory(conn, "f")
    with pytest.raises(ValueError, match="no decisions"):
        H.distil(conn, "f")


def _check(cid, scenario, category, severity, title, **extra):
    return {"check_id": cid, "scenario": scenario, "category": category, "severity": severity, "title": title,
            "why": "", **extra}


def test_arrange_rules():
    m = lambda **k: {"categories": [], "scenarios": [], "severities": [], "keywords": [], **k}  # noqa: E731
    habits = {
        "send_back": [
            {"name": "Safety", "match": m(categories=["regulation"], scenarios=["regulation"], keywords=["corridor"])},
            {"name": "Money", "match": m(scenarios=["quote"])},
        ],
        "handle_internally": [{"name": "Spelling", "match": m(categories=["bill"], severities=["review"])}],
        "pricing": {"tolerance_pct": 15},
        "species_substitutions": [{"from": "Duranta", "to": "Chinese ixora", "when": "short at the nursery"}],
    }
    run = {"checks": [
        _check("A", "quote", "price", "flag", "Lawn NT$290", numbers={"bill_price": 290, "list_low": 250, "list_high": 270}),
        _check("B", "quote", "price", "flag", "Pavers NT$3,800", numbers={"bill_price": 3800, "list_low": 1300,
                                                                          "list_high": 2300}),
        _check("C", "quote", "bill", "review", "misspelt row"),
        _check("D", "regulation", "regulation", "fail", "Planters narrow the escape corridor"),
        _check("E", "regulation", "regulation", "flag", "Soil below the minimum"),
        _check("F", "design", "sheet", "fail", "Planter over the lift shaft"),
        _check("G", "quote", "units", "flag", "Duranta hedge: billed 27 m, drawn 182 plants"),
        _check("H", "quote", "quantity", "flag", "dismissed one", decision="dismiss"),
        _check("I", "info", "area", "info", "an info check"),
    ]}
    out = H.arrange(habits, run)
    assert [f["check_id"] for f in out["before"]] == ["A", "B", "C", "D", "E", "F", "G"]
    groups = {g["name"]: [f["check_id"] for f in g["checks"]] for g in out["groups"]}
    assert [g["name"] for g in out["groups"]] == ["Safety", "Other regulation points", "Money", "Other drawing points",
                                                  "Spelling", "Within the firm's price tolerance (15%)"]
    assert groups["Safety"] == ["D"] and groups["Other regulation points"] == ["E"]
    assert groups["Money"] == ["B", "G"] and groups["Spelling"] == ["C"] and groups["Other drawing points"] == ["F"]
    assert groups["Within the firm's price tolerance (15%)"] == ["A"]  # 7.4% over the list: let go
    money = next(g for g in out["groups"] if g["name"] == "Money")["checks"]
    assert money[0]["outside_list_pct"] == 65.2
    assert money[1]["firm_notes"] == ["the firm proposes Chinese ixora instead of Duranta (short at the nursery)"]
    t = H.template_reply({"package": {"name": "P — Landscape"}, "checks": run["checks"]},
                         habits | {"reply": {"greeting": "Hello,", "sign_off": "The team"}}, out["groups"])
    assert t["by"] == "template" and t["order"] == ["D", "E", "B", "G", "F"]
    assert t["body"].startswith("Hello,") and t["body"].rstrip().endswith("The team")
