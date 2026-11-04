"""A judge's own key: a wrong one stops with one line, a busy API is retried, a failed call does not pass as a result."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from landsight.__main__ import main
from landsight.meta import http as H
from landsight.review import spark as RS

GREENFIELD = Path(__file__).resolve().parents[1] / "samples" / "greenfield"


@pytest.fixture
def no_wait(monkeypatch):
    waits: list[float] = []
    monkeypatch.setattr(H.time, "sleep", waits.append)
    return waits


def answers(*codes, headers=None):
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(codes[min(len(seen) - 1, len(codes) - 1)], json={}, headers=headers or {})

    return httpx.MockTransport(handle), seen


def post(transport):
    return H.post("https://example.test/x", json={}, headers={}, timeout=5, transport=transport)


def test_a_busy_api_is_tried_again_and_says_how_long_to_wait(no_wait):
    transport, seen = answers(429, 200, headers={"retry-after": "11"})
    assert post(transport).status_code == 200
    assert len(seen) == 2 and no_wait == [11.0]


def test_three_tries_then_the_last_answer(no_wait):
    transport, seen = answers(503)
    assert post(transport).status_code == 503
    assert len(seen) == 3 and no_wait == [2.0, 6.0]


def test_a_wrong_key_is_not_tried_again(no_wait):
    transport, seen = answers(401)
    assert post(transport).status_code == 401
    assert len(seen) == 1 and not no_wait


def test_a_dropped_connection_is_tried_again(no_wait):
    tries = []

    def handle(request):
        tries.append(request)
        if len(tries) == 1:
            raise httpx.ConnectError("dropped")
        return httpx.Response(200, json={})

    assert post(httpx.MockTransport(handle)).status_code == 200 and len(tries) == 2


@pytest.mark.parametrize("status, stops", [(401, True), (200, False), (403, False), (404, False), (None, False)])
def test_only_a_401_stops_the_pass(monkeypatch, status, stops):
    monkeypatch.setenv("MODEL_API_KEY", "any")
    monkeypatch.setattr(RS, "_models_status", lambda base, key: status)
    assert bool(RS.rejected_key("api")) is stops


def test_the_message_names_the_key_and_never_shows_it(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "ok")
    monkeypatch.setenv("BASETEN_API_KEY", "secret-value")
    monkeypatch.delenv("LANDSIGHT_OPEN_BASE_URL", raising=False)
    monkeypatch.delenv("LANDSIGHT_OPEN_API_KEY", raising=False)
    monkeypatch.setattr(RS, "_models_status", lambda base, key: 401 if key == "secret-value" else 200)
    message = RS.rejected_key("open")
    assert "BASETEN_API_KEY" in message and "secret-value" not in message


def test_a_wrong_key_stops_a_live_review_before_any_work(monkeypatch, capsys):
    monkeypatch.setenv("MODEL_API_KEY", "wrong")
    monkeypatch.setattr(RS, "_models_status", lambda base, key: 401)
    assert main(["review", str(GREENFIELD), "--live", "--fresh", "all", "--no-db"]) == 2
    err = capsys.readouterr().err
    assert "MODEL_API_KEY was rejected" in err and "wrong" not in err.replace("wrong key", "")


def test_a_failed_call_does_not_pass_as_a_result(monkeypatch, capsys):
    from landsight.review import cli

    real = cli.review

    def with_a_failure(*a, **k):
        run = real(*a, **{**k, "mode": "fixtures"})
        run["notes"] = [*run.get("notes", []), "L-1: read_legend: HTTP 429: too many requests"]
        return run

    monkeypatch.setenv("MODEL_API_KEY", "ok")
    monkeypatch.setattr(cli, "review", with_a_failure)
    assert main(["review", str(GREENFIELD), "--live", "--no-db"]) == 3
    err = capsys.readouterr().err
    assert "not a full result" in err and "Run the same command again" in err


def test_a_key_turned_down_mid_run_says_to_check_the_key(monkeypatch, capsys):
    from landsight.review import cli

    real = cli.review

    def with_a_401(*a, **k):
        run = real(*a, **{**k, "mode": "fixtures"})
        run["notes"] = [*run.get("notes", []), "L-1: read_legend: HTTP 401: Authentication required."]
        return run

    monkeypatch.setenv("MODEL_API_KEY", "ok")
    monkeypatch.setattr(cli, "review", with_a_401)
    assert main(["review", str(GREENFIELD), "--live", "--no-db"]) == 3
    assert "Check the keys in .env" in capsys.readouterr().err


def test_a_model_failure_on_ask_is_an_answer_not_a_crash(monkeypatch):
    from fastapi.testclient import TestClient

    from landsight.app.server import create_app

    monkeypatch.setenv("MODEL_API_KEY", "ok")

    def refused(*a, **k):
        raise RS.SparkUnavailable("ask_package: HTTP 429: too many requests")

    monkeypatch.setattr("landsight.ask.service.ask_run", refused)
    c = TestClient(create_app())
    c.post("/api/package/open")
    r = c.post("/api/ask?live=1", json={"question": "A question nobody recorded?"})
    assert r.status_code == 502 and "HTTP 429" in r.json()["detail"]
