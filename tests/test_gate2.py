"""Gate run 2's backend items: SAM 3.1 on the raster Presentation Plan, fresh re-asks that keep the recordings,
nothing a model says counted until confirmed, Art. 305 water retention, the old-tree rule, and two bugs."""

from __future__ import annotations

import json
import shutil

import httpx
import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.review import review
from landsight.review.spark import ReviewSpark

from conftest import SAMPLE

CAD = "Greenfield Residences — Landscape Package/Drawings/CAD"


def by_title(run, start):
    return next(c for c in run["checks"] if c["title"].startswith(start))


def test_sam_measures_the_raster_presentation_plan(sample_db):
    _, run = sample_db
    sam = {i["label"]: i for i in run["items"] if i.get("source") == "sam"}
    assert set(sam) == {"Camphor", "Lawn", "Azalea", "Fire truck access lane — keep clear"}
    assert (sam["Lawn"]["proposed_count"], sam["Lawn"]["against"]["diff_pct"]) == (195.0, -2.5)
    assert (sam["Azalea"]["proposed_count"], sam["Azalea"]["against"]["diff_pct"]) == (146.0, -2.7)
    assert sam["Camphor"]["proposed_count"] == 11 == sam["Camphor"]["against"]["symbols"]["drawn"]
    assert all(not i["agreed"] and i["quote_count"] is None and i["sam"]["prompt_source"] == "spark_raster_plan"
               for i in sam.values())
    assert "label written inside it" in sam["Lawn"]["sam"]["typed_by"]
    assert not [t for t in run["tally"] if t["item_id"].startswith("S-")]
    read = by_title(run, "Muse Spark read Presentation Plan")
    assert read["numbers"]["bar_px"] == 255 and read["numbers"]["m_per_px"] == pytest.approx(0.03922, abs=1e-4)
    calls = [c for c in run["timing"]["calls"] if "Presentation Plan" in c["call"]]
    assert len(calls) == 4 and all(c["model"] == "sam-3.1" for c in calls)


def test_the_api_serves_the_masks_on_the_raster_sheet():
    c = TestClient(create_app())
    run = c.post("/api/package/open").json()
    f17 = next(s for s in run["sheets"] if s["sheet_id"] == "F-17-p1")
    masks = [o for o in f17["objects"] if o["by"] == "sam"]
    assert len(masks) >= 4 and {o["item_id"] for o in masks} == {"S-01", "S-02", "S-03", "S-04"}


def _chat(n):
    return httpx.Response(200, json={"id": f"chatcmpl-test-{n}", "choices": [{"message": {"content": json.dumps(
        {"kind": "document", "title": "T", "summary": f"answer {n}", "key_facts": [], "required": [],
         "confidence": 0.5, "why": "test"})}}], "usage": {"prompt_tokens": 10, "completion_tokens": 5}})


def test_fresh_reasks_keep_the_recordings(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-key-not-real")
    n = {"i": 0}

    def handler(request):
        n["i"] += 1
        return _chat(n["i"])

    t = httpx.MockTransport(handler)
    first = ReviewSpark("live", tmp_path, transport=t)
    a = first.summarise("hello", "doc:x")
    rec = next(tmp_path.glob("review_summarise__*.json"))
    saved = rec.read_text()
    assert json.loads(saved)["response_id"] == "chatcmpl-test-1" and json.loads(saved)["raw"]["id"] == "chatcmpl-test-1"
    again = ReviewSpark("live", tmp_path, transport=t, fresh=1)
    b = again.summarise("hello", "doc:x")
    assert b["summary"] == "answer 2" and a["summary"] == "answer 1" and n["i"] == 2
    entry = again.log[-1]
    assert entry["response_id"] == "chatcmpl-test-2" and entry["fresh_of"] == rec.name and entry["recorded"] is False
    fresh = list((tmp_path / "fresh").glob("*.json"))
    assert len(fresh) == 1 and json.loads(fresh[0].read_text())["same_as_recorded"] is False
    assert rec.read_text() == saved  # the recording it re-asked is untouched
    replay = ReviewSpark("fixtures", tmp_path)
    assert replay.summarise("hello", "doc:x")["summary"] == "answer 1"
    budget = ReviewSpark("live", tmp_path, transport=t, fresh=1)
    budget.summarise("hello", "doc:x")
    budget.summarise("hello", "doc:y")  # not recorded: asked live and recorded normally
    assert n["i"] == 4 and len(list((tmp_path / "fresh").glob("*.json"))) == 2


def test_cli_fresh_needs_live(capsys):
    from landsight.__main__ import main

    assert main(["review", str(SAMPLE), "--fresh", "2", "--no-db"]) == 2
    assert main(["review", str(SAMPLE), "--live", "--fresh", "x", "--no-db"]) == 2


def test_nothing_spark_says_counts_until_confirmed(sample_db):
    _, run = sample_db
    green = by_title(run, "Greening")
    assert "7 trees counted, T-08 to confirm" in green["title"] and green["pending_items"] == ["I-01"]
    assert green["numbers"]["provided"] == 197.1 and green["if_confirmed"]["numbers"]["provided"] == 209.9
    assert green["before_downgrade"]["provided"] == 241.9 and green["if_confirmed"]["before_downgrade"]["provided"] == 261.1
    assert green["why"].startswith("7 Camphor counted (closed outlines, geometry)")
    e02 = next(c for c in run["checks"] if c["check_id"] == "E02")
    assert e02["title"] == "Schedule says 12 Camphor: drawn 7, Muse Spark 8 (T-08 to confirm)"
    assert (e02["numbers"]["drawn"], e02["numbers"]["spark"], e02["numbers"]["schedule"]) == (7, 8, 12)
    assert e02["if_confirmed"]["title"] == "Schedule says 12 Camphor, drawing shows 8 (T-08 confirmed)"
    e12 = next(c for c in run["checks"] if c["check_id"] == "E12")
    assert "7 large trees" in e12["title"] and "8 large trees" in e12["if_confirmed"]["title"]
    tally = next(t for t in run["tally"] if t["label"] == "Camphor")
    assert (tally["drawn"], tally["spark"], tally["schedule"]) == (7, 8, 12)


def test_confirm_swaps_the_checks_in_the_api():
    c = TestClient(create_app())
    c.post("/api/package/open")
    before = c.get("/api/rules").json()
    c.post("/api/items/I-01/confirm")
    after = c.get("/api/rules").json()
    g0, g1 = (next(x for x in r if x["title"].startswith("Greening")) for r in (before, after))
    assert (g0["numbers"]["provided"], g1["numbers"]["provided"]) == (197.1, 209.9) and g1["confirmed_state"]
    e02 = next(x for x in c.get("/api/run").json()["checks"] if x["check_id"] == "E02")
    assert e02["title"].endswith("drawing shows 8 (T-08 confirmed)")


def test_article_305_water_retention(sample_db):
    _, run = sample_db
    w = by_title(run, "Water retention (Art. 305)")
    n = w["numbers"]
    assert w["severity"] == "review" and w["unscored"] and w["scenario"] == "regulation"
    assert (n["lambda_c"], n["Q0_m3"], n["permeable_m2"]) == (0.3, 1296.0, 248)
    assert n["lambda_over_slab"] < 0.05 < 0.3 < n["lambda_natural_ground"]
    assert w["citation"]["url"].endswith("flno=305")
    assert {c["url"] for c in w["citations"]} >= {"https://www.nlma.gov.tw/uploads/files/0f741327224b557bd4f672ad1d610c46.pdf"}
    assert "Exposed aggregate 48 m²" in w["why"] and w["check_id"] not in run["errors"]["false_alarms"]


def test_the_old_tree_rule_prices_keeping_ex01(sample_db):
    _, run = sample_db
    green = by_title(run, "Greening")
    keep = next(f for f in green["fixes"] if f["id"] == "d")
    assert keep["adds"] == 84.8 and keep["result"] == pytest.approx((246.4 + 84.8) * 0.8, abs=0.01)
    assert "Keep EX-01" in keep["label"] and keep["passes"] is False
    assert any(f["id"] == "d" for f in green["after_downgrade"]["fixes"])


def test_director_answers_a_folder_without_sheets(tmp_path):
    (tmp_path / "notes.txt").write_text("nothing to draw")
    c = TestClient(create_app())
    assert c.post("/api/package/open", json={"path": str(tmp_path)}).status_code == 200
    r = c.get("/api/director")
    assert r.status_code == 200 and [s["id"] for s in r.json()] == ["drop"]


def test_e29_says_unreadable_when_the_sheet_file_is_there(tmp_path):
    folder = tmp_path / "pkg"
    folder.mkdir()
    shutil.copyfile(SAMPLE / CAD / "L-0 Cover and Index.dxf", folder / "L-0 Cover and Index.dxf")
    (folder / "L-9 Sections.dxf").write_bytes(b"\x00\x01 not a drawing \xff" * 40)
    run = review(folder, mode="fixtures")
    idx = next(c for c in run["checks"] if "drawing index" in c["title"])
    assert "L-9 Sections: on the drawing index, in the package but unreadable (L-9 Sections.dxf)" in idx["title"]
    assert idx["unreadable"] == ["L-9"] and "L-9" not in idx["missing"] and "readable copy" in idx["why"]
