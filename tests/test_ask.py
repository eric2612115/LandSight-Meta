"""Ask the package (the agentic layer, docs/WIN-STRATEGY.md): the corpus is the package's own material, retrieval is
BM25, the six recorded questions replay with every citation found in the source it names, and the proposed actions
write confirmations, price rows, notes and flags to landsight.db and the Run."""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.ask import retrieve
from landsight.ask.service import ask_run, corpus_for
from landsight.store import service

QUESTIONS = {
    "What soil depth does the spec require for trees on the slab?": ["F-22", "F-16"],
    "Does Article 302 apply to this 1,500 m² site?": ["rules"],
    "Which bill revision is current and what changed?": ["F-28"],
    "Is PV-1 permeable paving?": ["F-16", "F-21"],
    "What does the green-building checklist require from landscape?": ["F-29"],
    "Why is the camphor row flagged?": ["run"],
}
CJK = re.compile(r"[⺀-鿿豈-﫿　-〿＀-￯가-힯]")


def test_corpus_is_the_package_and_english(sample_db):
    conn, run = sample_db
    corpus = corpus_for(conn, run["run_id"])
    kinds = {c.kind for c in corpus}
    assert {"pdf_text", "pdf_drawing", "pdf_raster", "bill_row", "bill_version", "sheet", "rule", "price", "check"} <= kinds
    assert not [c.chunk_id for c in corpus if CJK.search(c.text) or CJK.search(c.chunk_id)]
    latest = next(c for c in corpus if c.kind == "bill_version" and "the latest by date" in c.text)
    assert "20261014" in latest.text and "Permeable pavers (PV-1): qty 212 -> 236" in latest.text


def test_retrieval_finds_the_source(sample_db):
    conn, run = sample_db
    corpus = corpus_for(conn, run["run_id"])
    top = {c.chunk_id for _, c in retrieve("Is PV-1 permeable paving?", corpus)}
    assert {"F-21:p1:2", "check:E11", "price:PV-1"} <= top
    top = {c.chunk_id for _, c in retrieve("Which bill revision is current and what changed?", corpus)}
    assert {"F-28:versions", "check:E22"} <= top


@pytest.mark.parametrize("question", list(QUESTIONS))
def test_the_six_recorded_answers_replay_with_verified_citations(sample_db, question):
    conn, run = sample_db
    out = ask_run(conn, run["run_id"], question)
    assert out["call"]["recorded"] is True and out["answer"] and 0 <= out["confidence"] <= 1
    assert out["citations"] and all(c["verified"] for c in out["citations"]), out["citations"]
    assert {c["file_id"] for c in out["citations"]} & set(QUESTIONS[question])
    assert not CJK.search(out["answer"])
    row = conn.execute("SELECT question FROM asks WHERE id = ?", (out["ask_id"],)).fetchone()
    assert row[0] == question
    calls = service.meta_calls(conn, ask_id=out["ask_id"])
    assert len(calls) == 1 and calls[0]["call"] == "ask_package" and "Question: " + question in calls[0]["prompt"]


def test_what_the_answers_say(sample_db):
    conn, run = sample_db
    a = {q: ask_run(conn, run["run_id"], q) for q in QUESTIONS}
    assert "20261014" in a["Which bill revision is current and what changed?"]["answer"]
    assert a["Is PV-1 permeable paving?"]["answer"].startswith("Yes")
    assert "1.5 m" in a["What soil depth does the spec require for trees on the slab?"]["answer"]
    acts = a["Why is the camphor row flagged?"]["proposed_actions"]
    assert {"kind": "confirm_price", "target_id": "CC", "value": "6200-7200"}.items() <= acts[-1].items()


def test_api_ask_and_actions(sample_db):
    c = TestClient(create_app())
    run = c.post("/api/package/open").json()
    rid = run["run_id"]
    ans = c.post("/api/ask", json={"question": "Why is the camphor row flagged?", "run_id": rid}).json()
    assert ans["run_id"] == rid and ans["citations"][0]["verified"]
    assert c.post("/api/ask", json={"question": "What colour is the sky?"}).status_code == 404  # never recorded
    assert c.post("/api/ask", json={"question": ""}).status_code == 422
    price = next(x for x in ans["proposed_actions"] if x["kind"] == "confirm_price")
    out = c.post("/api/ask/actions", json={"run_id": rid, "action": price | {"value": "6300-7100"}}).json()
    assert out["price_row"]["low"] == 6300 and out["confirmation"]["kind"] == "confirm_price"
    assert c.get("/api/price-list").json()[0]["high"] == 7100
    c.put("/api/price-list/CC", json={"low": 6200, "high": 7200})
    note = c.post("/api/ask/actions", json={"run_id": rid, "kind": "regulation_note", "target_id": "E12",
                                            "value": "Deep standard asks 1.5 m for camphor", "why": "spec"}).json()
    e12 = next(x for x in note["run"]["checks"] if x["check_id"] == "E12")
    assert e12["notes"][0]["value"] == "Deep standard asks 1.5 m for camphor"
    flag = c.post("/api/ask/actions", json={"run_id": rid, "kind": "flag", "target_id": "E02.2",
                                            "value": "12 or 8 camphor?"}).json()
    assert next(x for x in flag["run"]["checks"] if x["check_id"] == "E02.2")["flags"][0]["value"] == "12 or 8 camphor?"
    done = c.post("/api/ask/actions", json={"run_id": rid, "kind": "confirm_element", "target_id": "I-01",
                                            "value": "8"}).json()
    assert done["item"]["confirmed"] is True
    green = next(x for x in done["run"]["checks"] if x["title"].startswith("Greening"))
    assert green["confirmed_state"] is True and "8 trees (T-08 confirmed)" in green["title"]
    assert c.post("/api/ask/actions", json={"run_id": rid, "kind": "confirm_element", "target_id": "I-99"}).status_code == 404
    assert c.post("/api/ask/actions", json={"run_id": rid, "kind": "teleport", "target_id": "I-01"}).status_code == 422
    stored = c.get(f"/api/runs/{rid}").json()
    assert [a["kind"] for a in stored["annotations"]] == ["confirm_price", "regulation_note", "flag", "confirm_element"]
