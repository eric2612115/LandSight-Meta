"""landsight.db (docs/PLAN-V2.md phase 2): the schema and its seeds, a review written to the database (run, checks,
every Meta call with its prompt and fixture), the firm's price list edited and used by the next review, and the API
that reads it all back."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.store import connect, init, reset, service, stats

from conftest import SAMPLE

REPO = Path(__file__).resolve().parents[1]


def test_init_seeds_and_reset(tmp_path):
    conn = connect(tmp_path / "x.db")
    st = stats(conn)
    assert st["price_list"] == 11 and st["species"] == 60 and st["rules"] >= 100 and st["runs"] == 0
    ids = {r[0] for r in conn.execute("SELECT id FROM rules")}
    assert {"BTR-299", "BTR-302", "BTR-305", "STD-WR", "STD-OLD", "TC-TREE-3"} <= ids
    assert all(not service.D.CJK.search(r[0] or "") for r in conn.execute("SELECT gloss FROM rules"))
    service.update_price(conn, "CC", {"low": 1, "high": 2})
    assert reset(conn)["price_list"] == 11
    assert conn.execute("SELECT low FROM price_list WHERE code='CC'").fetchone()[0] == 6200
    assert init(conn)["species"] == 60


def test_cli_db_commands(tmp_path, capsys):
    from landsight.__main__ import main

    db = str(tmp_path / "cli.db")
    assert main(["db", "init", "--db", db]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["tables"]["price_list"] == 11
    assert {p["folder"] for p in out["packages"]} == {"samples/greenfield", "samples/heldout", "samples/tower"}
    assert main(["db", "stats", "--db", db]) == 0
    assert json.loads(capsys.readouterr().out)["projects"] == 2  # Greenfield Residences (site + tower), Riverside Court


def test_a_review_is_written_with_every_meta_call(sample_db):
    conn, run = sample_db
    row = service.run_row(conn, run["run_id"])
    assert (row["planted"], row["found"], row["flagged"], row["missed"], row["false_alarms"]) == (30, 28, 2, 0, 0)
    assert json.loads(row["scenarios"])["quote"]["planted"] == 10
    assert conn.execute("SELECT COUNT(*) FROM checks WHERE run_id = ?", (run["run_id"],)).fetchone()[0] == len(run["checks"])
    calls = [c for c in service.meta_calls(conn, run["run_id"]) if c["ask_id"] is None]  # questions are counted apart
    t = run["timing"]
    assert len(calls) == t["spark_calls"] + t["sam_calls"]
    assert {c["kind"] for c in calls} == {"spark", "sam"} and not any(c["live"] for c in calls)
    for c in calls:
        assert c["fixture"] and (REPO / c["fixture"]).is_file(), c
        assert c["prompt"] and not c["prompt"].startswith("landsight.meta.spark.")
    detail = next(c for c in calls if c["call"] == "read_detail")
    assert "tree pit" in detail["prompt"] and "pit_w_m" in detail["response"]
    assert all(c["usage"].get("prompt_tokens") for c in calls if c["kind"] == "spark")


def test_the_next_review_prices_against_the_edited_list(tmp_path):
    conn = connect(tmp_path / "prices.db")
    pk = service.package_for_folder(conn, SAMPLE)
    try:
        service.update_price(conn, "CC", {"low": 3800, "high": 4600})
        run = service.review_package(conn, pk["package_id"])
        assert "E19" in run["errors"]["missed"]
        ok = next(c for c in run["checks"] if c["category"] == "price" and c.get("ok"))
        assert "Camphor 4,200" in ok["title"] and "landsight.db" in ok["why"]
        stored = json.loads(service.run_row(conn, run["run_id"])["price_list"])
        assert next(p for p in stored if p["code"] == "CC")["low"] == 3800
    finally:
        service.update_price(conn, "CC", {"low": 6200, "high": 7200})
    with pytest.raises(ValueError):
        service.update_price(conn, "CC", {"low": 9000, "high": 100})
    with pytest.raises(ValueError):
        service.update_price(conn, "CC", {"colour": "red"})


def test_api_reads_the_database(sample_db, tmp_path):
    c = TestClient(create_app())
    projects = c.get("/api/projects").json()
    pk = next(p for pr in projects for p in pr["packages"] if p["folder"] == "samples/greenfield")
    assert pk["latest_run"]["found"] == 28
    assert c.post(f"/api/projects/{pk['project_id']}/packages", json={"path": str(tmp_path / "nope")}).status_code == 400
    assert c.post("/api/projects/999/packages", json={"path": str(SAMPLE)}).status_code == 404
    assert c.post(f"/api/projects/{pk['project_id']}/packages", json=[]).status_code == 422
    run = c.post(f"/api/packages/{pk['package_id']}/review").json()
    assert run["package_id"] == pk["package_id"] and run["errors"]["planted"] == 30
    assert c.get("/api/run").json()["run_id"] == run["run_id"]  # the existing endpoints map onto the latest run
    assert c.get("/api/director").status_code == 200 and c.get("/api/rules").json()
    stored = c.get(f"/api/runs/{run['run_id']}").json()
    assert stored["stored"] is True and stored["run_id"] == run["run_id"]
    fmt = c.get(f"/api/runs/{run['run_id']}/checks?scenario=format").json()
    assert fmt and all(x["scenario"] == "format" for x in fmt)
    assert c.get(f"/api/runs/{run['run_id']}?scenario=quote").json()["errors"]["planted"] == 10
    assert c.get("/api/run?scenario=bogus").status_code == 400 and c.get("/api/runs/nope").status_code == 404
    calls = [x for x in c.get(f"/api/meta-calls?run={run['run_id']}&full=0").json() if x["ask_id"] is None]
    assert len(calls) == run["timing"]["spark_calls"] + run["timing"]["sam_calls"]
    assert all(len(x["prompt"]) <= 400 for x in calls)
    prices = c.get("/api/price-list").json()
    assert [p["code"] for p in prices][:7] == ["CC", "DU", "AZ", "LA", "PV-1", "PV-2", "PV-3"]
    assert c.put("/api/price-list/CC", json={"low": 7000, "high": 100}).status_code == 422
    assert c.put("/api/price-list/CC", json={"low": 6200, "high": 7200}).json()["low"] == 6200
    assert c.post("/api/items/I-01/confirm").json()["confirmed"] is True
    conn = connect()
    rows = service.confirmations(conn, run["run_id"])
    assert [(r["kind"], r["target_id"], r["source"]) for r in rows] == [("confirm_element", "I-01", "screen")]


def test_the_call_table_of_a_run(sample_db):
    from landsight.store import costs

    conn, run = sample_db
    rows = [r for r in service.meta_calls(conn, run["run_id"]) if r["ask_id"] is None]
    t = {r["call"]: r for r in costs.table(rows)}
    assert t["review_classify_sheet"]["count"] == 22 and t["sam-3.1 segment"]["count"] == 12
    assert t["sam-3.1 segment"]["cost_usd"] == pytest.approx(12 * 2.5 / 1000)
    assert 0.1 < sum(r["cost_usd"] for r in t.values()) < 1.0
    assert "| **all** | | **51** |" in costs.markdown(rows)


def test_serve_registers_the_samples_on_a_fresh_database(tmp_path):
    """A fresh clone has no landsight.db: `landsight serve` registers the bundled samples before it listens, so the
    screen's "Try a sample" finds samples/greenfield without `landsight db init` (seed_db is idempotent)."""
    from landsight.app.server import seed_db

    db = tmp_path / "fresh.db"
    assert TestClient(create_app(db_path=db)).get("/api/projects").json() == []
    seed_db(db)
    seed_db(db)
    folders = [p["folder"] for pr in TestClient(create_app(db_path=db)).get("/api/projects").json() for p in pr["packages"]]
    assert folders.count("samples/greenfield") == 1 and "samples/tower" in folders
