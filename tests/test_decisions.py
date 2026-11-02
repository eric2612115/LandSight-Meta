"""A person's verdict on each flag, kept in landsight.db (POST /api/runs/{id}/checks/{check_id}/decision), and the
runs of a package as the Projects screen lists them (GET /api/packages/{id}/runs)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from landsight.app import create_app

KEYS = {"run_id", "created_at", "finished_at", "source", "scoreboard", "by_scenario", "seconds", "calls"}


def test_a_decision_is_kept_and_read_back():
    c = TestClient(create_app())
    run = c.post("/api/package/open").json()
    rid = run["run_id"]
    assert {x["decision"] for x in run["checks"]} == {"open"} and all(x["note"] is None for x in run["checks"])
    r = c.post(f"/api/runs/{rid}/checks/E19/decision", json={"decision": "confirm", "note": "ask for the nursery rate"})
    assert r.status_code == 200
    e19 = r.json()
    assert (e19["check_id"], e19["decision"], e19["note"]) == ("E19", "confirm", "ask for the nursery rate")
    assert e19["decided_at"] and e19["title"].startswith("Camphor NT$4,200") and e19["scenario"] == "quote"
    c.post(f"/api/runs/{rid}/checks/E02.2/decision", json={"decision": "confirm"})
    d = c.post(f"/api/runs/{rid}/checks/C-05/decision", json={"decision": "dismiss", "note": "raster, fine"}).json()
    assert d["decision"] == "dismiss"
    checks = {x["check_id"]: x for x in c.get("/api/run").json()["checks"]}
    assert checks["E19"]["decision"] == "confirm" and checks["C-05"]["decision"] == "dismiss"
    assert checks["E01"]["decision"] == "open"
    statement = c.get(f"/api/runs/{rid}?confirmed=1").json()["checks"]
    assert [x["check_id"] for x in statement] == ["E02.2", "E19"]
    assert [x["check_id"] for x in c.get("/api/run?confirmed=1").json()["checks"]] == ["E02.2", "E19"]
    listing = [x["check_id"] for x in c.get(f"/api/runs/{rid}/checks").json()]
    assert "C-05" not in listing and "E19" in listing and "E01" in listing and len(listing) == len(run["checks"]) - 1
    assert [x["check_id"] for x in c.get(f"/api/runs/{rid}/checks?confirmed=1").json()] == ["E02.2", "E19"]
    reopened = c.post(f"/api/runs/{rid}/checks/E02.2/decision", json={"decision": "open"}).json()
    assert reopened["decision"] == "open" and reopened["note"] is None
    later = TestClient(create_app())  # another process: the database still has them
    kept = {x["check_id"]: x for x in later.get(f"/api/runs/{rid}").json()["checks"]}
    assert (kept["E19"]["decision"], kept["E19"]["note"]) == ("confirm", "ask for the nursery rate")
    assert kept["C-05"]["decision"] == "dismiss" and kept["E02.2"]["decision"] == "open"
    assert c.post(f"/api/items/I-01/confirm").json()["confirmed"] is True  # the item confirm stays as it was


def test_a_decision_rejects_what_it_cannot_keep():
    c = TestClient(create_app())
    rid = c.post("/api/package/open").json()["run_id"]
    url = f"/api/runs/{rid}/checks/E19/decision"
    assert c.post(url, json={"decision": "maybe"}).status_code == 422
    assert c.post(url, json={"decision": "confirm", "note": 7}).status_code == 422
    assert c.post(url, json=["confirm"]).status_code == 422
    assert c.post(url, json={"decision": "confirm", "note": "x" * 2001}).status_code == 422
    assert c.post(f"/api/runs/{rid}/checks/E99/decision", json={"decision": "confirm"}).status_code == 404
    assert c.post("/api/runs/nope/checks/E19/decision", json={"decision": "confirm"}).status_code == 404


def test_runs_of_a_package_newest_first():
    c = TestClient(create_app())
    first = c.post("/api/package/open").json()
    pid = first["package_id"]
    second = c.post(f"/api/packages/{pid}/review").json()
    runs = c.get(f"/api/packages/{pid}/runs").json()
    ids = [r["run_id"] for r in runs]
    assert ids.index(second["run_id"]) < ids.index(first["run_id"])
    r = next(x for x in runs if x["run_id"] == second["run_id"])
    assert set(r) == KEYS and r["source"] == "fixtures"
    assert r["scoreboard"] == {"planted": 30, "found": 28, "flagged": 2, "missed": 0, "false_alarms": 0}
    assert r["by_scenario"]["quote"] == {"planted": 10, "found": 9, "flagged": 1, "missed": 0, "false_alarms": 0}
    assert set(r["by_scenario"]) == {"quote", "regulation", "design", "format"}
    assert r["calls"] == {"spark": 39, "sam": 12} and r["seconds"] > 0
    assert c.get("/api/packages/999/runs").status_code == 404
