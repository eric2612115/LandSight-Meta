"""The open reader (LANDSIGHT_READER=open, --reader open): every Muse Spark call goes to Muse Spark Open, Meta's
open-weight release (Baseten's hosted endpoint by default, or a firm's own server), with the same prompts and schemas
and its recordings kept apart in tests/fixtures/open/. Offline: the live parity run of 2026-11-03 (UTC) replays from
its recordings with no key; the request shape and the key rules are checked against a mock transport."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from landsight.review import spark as RS
from landsight.review.validate import validate

REPO = Path(__file__).resolve().parents[1]
GREENFIELD = REPO / "samples" / "greenfield"
OPEN_MODEL = "meta-models/muse-spark-open-1026"
PV1 = "Is PV-1 a permeable paver, and which sheet or document says so?"

pytestmark = pytest.mark.skipif(not GREENFIELD.is_dir(), reason="samples/greenfield not generated")


@pytest.fixture
def no_keys(monkeypatch):
    for k in ("MODEL_API_KEY", "BASETEN_API_KEY", "LANDSIGHT_READER", "LANDSIGHT_OPEN_BASE_URL", "LANDSIGHT_OPEN_MODEL",
              "LANDSIGHT_OPEN_API_KEY"):
        monkeypatch.delenv(k, raising=False)


@pytest.fixture(scope="module")
def open_run(tmp_path_factory):
    """samples/greenfield reviewed with the open reader from its recordings, into a fresh database (no key)."""
    import os

    saved = {k: os.environ.pop(k) for k in ("MODEL_API_KEY", "BASETEN_API_KEY", "LANDSIGHT_READER") if k in os.environ}
    try:
        from landsight.store import connect, service

        db = tmp_path_factory.mktemp("open") / "open.db"
        run = service.review_folder(GREENFIELD, db_path=db, reader="open")
        yield {"db": db, "run": run, "conn": connect(db)}
    finally:
        os.environ.update(saved)


def test_parity_run_replays_with_no_key(open_run):
    run = open_run["run"]
    e = run["errors"]
    assert (e["planted"], len(e["found"]), len(e["flagged"]), len(e["missed"]), len(e["false_alarms"])) == (30, 28, 2, 0, 0)
    assert e["flagged"] == ["E15", "E18"]
    assert validate(run) == []  # the run the open reader emits has the same shape as the default one
    t = run["timing"]
    assert t["reader"] == "open" and t["model"] == OPEN_MODEL and t["recorded"] is True
    assert t["spark_calls"] == 39 and t["sam_calls"] == 12
    spark = [c for c in t["calls"] if c["model"] != "sam-3.1"]
    assert len(spark) == 39 and {c["model"] for c in spark} == {OPEN_MODEL}
    # what the open model read differently, as recorded: T-08 is one object but a planter edge, not a tree
    checks = {c["check_id"]: c for c in run["checks"]}
    assert checks["E01"]["title"].endswith("Muse Spark says one planter_edge")
    assert checks["E02"]["title"] == "Schedule says 12 Camphor, drawing shows 7"
    # every Meta call is in the database with the open model id, and each Spark answer names its recording
    rows = [dict(x) for x in open_run["conn"].execute("SELECT model, kind, fixture, live FROM meta_calls WHERE run_id = ?",
                                                       (run["run_id"],))]
    assert len(rows) == 51 and not any(r["live"] for r in rows)
    assert all(r["fixture"].startswith("tests/fixtures/open/") for r in rows if r["kind"] == "spark")
    assert all(r["fixture"].startswith("tests/fixtures/review/sam/") for r in rows if r["kind"] == "sam")


def test_open_cost_table(open_run):
    from landsight.store import costs, service

    rows = [r for r in service.meta_calls(open_run["conn"], open_run["run"]["run_id"]) if r["ask_id"] is None]
    t = costs.table(rows)
    assert sum(r["count"] for r in t) == 51
    assert round(sum(r["cost_usd"] for r in t), 4) == 0.2253  # Baseten's list price, SAM 3.1 included


def test_open_ask_replays(open_run, no_keys):
    from landsight.ask.service import ask_run

    out = ask_run(open_run["conn"], open_run["run"]["run_id"], PV1, reader="open")
    assert out["call"]["model"] == OPEN_MODEL and out["call"]["recorded"] is True
    assert out["call"]["fixture"].startswith("ask_package__")
    assert out["citations"] and all(c["verified"] for c in out["citations"])
    assert "permeable" in out["answer"].lower()


def test_default_reader_and_folders(no_keys, monkeypatch):
    api = RS.ReviewSpark("fixtures")
    assert (api.reader, api.model, api.dir) == ("api", "muse-spark-1.3", RS.FIXTURES) and api._key_tag == ""
    monkeypatch.setenv("LANDSIGHT_READER", "open")
    o = RS.ReviewSpark("fixtures")
    assert (o.reader, o.model, o.dir) == ("open", OPEN_MODEL, RS.OPEN_FIXTURES)
    assert o._key_tag == f"|m={OPEN_MODEL}"
    assert RS.ReviewSpark("fixtures", RS.ASK_FIXTURES).dir == RS.OPEN_FIXTURES / "ask"
    assert RS.ReviewSpark("fixtures", "/somewhere/else").dir == Path("/somewhere/else")  # an explicit folder stays
    assert RS.ReviewSpark("fixtures", reader="api").reader == "api"
    with pytest.raises(ValueError):
        RS.reader_name("closed")
    # the default recordings are the Meta Model API's alone
    for f in RS.FIXTURES.glob("*.json"):
        assert json.loads(f.read_text()).get("model") in (None, "muse-spark-1.3"), f.name


def test_live_needs_a_key_and_never_sends_one_elsewhere(no_keys, monkeypatch):
    with pytest.raises(RS.SparkUnavailable, match="BASETEN_API_KEY"):
        RS.ReviewSpark("live", reader="open")
    monkeypatch.setenv("BASETEN_API_KEY", "bt-test")
    assert RS.open_endpoint() == (RS.OPEN_BASE_URL, OPEN_MODEL, "bt-test")
    monkeypatch.setenv("LANDSIGHT_OPEN_BASE_URL", "http://gpu-box:8000/v1/")
    monkeypatch.setenv("LANDSIGHT_OPEN_MODEL", "meta-models/Muse-Spark-Open-816B-A42B-NVFP4")
    base, model, key = RS.open_endpoint()
    assert (base, model, key) == ("http://gpu-box:8000/v1", "meta-models/Muse-Spark-Open-816B-A42B-NVFP4", "")
    assert RS.live_problem("open") is None  # a self-hosted server may run without a key
    monkeypatch.setenv("LANDSIGHT_OPEN_API_KEY", "own-key")
    assert RS.open_endpoint()[2] == "own-key"


def _reply(content: str, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json={"id": "chatcmpl-test", "model": OPEN_MODEL, "choices": [
        {"message": {"role": "assistant", "content": content}}], "usage": {"prompt_tokens": 10, "completion_tokens": 5}})


def test_open_request_shape_retry_and_recording(no_keys, monkeypatch, tmp_path):
    monkeypatch.setenv("BASETEN_API_KEY", "bt-test")
    monkeypatch.setenv("MODEL_API_KEY", "meta-test")  # must never reach the open endpoint
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if len(seen) == 1:
            return httpx.Response(503, text="busy")
        body = json.loads(request.content)
        if body["response_format"]["json_schema"]["name"] == "read_schedule":
            return _reply('{"rows": [], "footer": "total 0"}')
        return _reply('```json\n{"kind": "spec", "title": "T", "summary": "S", "key_facts": [], "required": [], '
                      '"confidence": 0.9, "why": "w"}\n```')

    sp = RS.ReviewSpark("live", tmp_path, reader="open", transport=httpx.MockTransport(handler))
    out = sp.summarise("A specification of tree pits.", "doc:test")
    assert out["kind"] == "spec" and len(seen) == 2  # one retry after the 503; the fenced answer unwrapped
    req = seen[-1]
    assert str(req.url) == "https://inference.baseten.co/v1/chat/completions"
    assert req.headers["authorization"] == "Bearer bt-test"
    body = json.loads(req.content)
    assert body["model"] == OPEN_MODEL and body["reasoning_effort"] == "low"
    assert body["response_format"]["type"] == "json_schema" and body["messages"][0]["role"] == "system"
    rec = json.loads(next(tmp_path.glob("review_summarise__*.json")).read_text())
    assert rec["model"] == OPEN_MODEL and rec["content_key"].endswith(f"|m={OPEN_MODEL}") and rec["response_id"] == "chatcmpl-test"
    # the take-off's calls go through landsight.meta.SparkClient with the same endpoint and key
    sp.read_schedule(b"\x89PNG fake", key="sched")
    assert str(seen[-1].url) == "https://inference.baseten.co/v1/chat/completions"
    assert seen[-1].headers["authorization"] == "Bearer bt-test"
    assert json.loads(seen[-1].content)["model"] == OPEN_MODEL
    # replay from what was just recorded, with no key at all
    monkeypatch.delenv("BASETEN_API_KEY")
    monkeypatch.delenv("MODEL_API_KEY")
    again = RS.ReviewSpark("fixtures", tmp_path, reader="open")
    assert again.summarise("A specification of tree pits.", "doc:test") == out
    with pytest.raises(RS.FixtureMissing):  # the API reader never replays an open answer
        RS.ReviewSpark("fixtures", tmp_path).summarise("A specification of tree pits.", "doc:test")


def test_cli_and_api_switch(no_keys, monkeypatch, tmp_path, capsys):
    from fastapi.testclient import TestClient

    from landsight.__main__ import main
    from landsight.app import create_app

    assert main(["review", str(GREENFIELD), "--reader", "open", "--live", "--no-db"]) == 2
    assert "BASETEN_API_KEY" in capsys.readouterr().err
    c = TestClient(create_app(db_path=tmp_path / "api.db"))
    assert "reader" not in c.get("/api/health").json()  # the default answer is unchanged
    monkeypatch.setenv("LANDSIGHT_READER", "open")
    assert c.get("/api/health").json()["reader"] == {"name": "open", "model": OPEN_MODEL}
    assert c.post("/api/packages/1/review?reader=closed").status_code == 422
    r = c.post("/api/ask?live=1&reader=open", json={"question": "Which bill governs?"})
    assert r.status_code == 400 and "BASETEN_API_KEY" in r.json()["detail"]
