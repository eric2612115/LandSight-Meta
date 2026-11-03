"""The film's conditional builds (demo/SCRIPT.md), offline on recorded Meta calls, each also with its flag off:

1. grounding points in the eye: Muse Spark's 0-1000 points on the T-08 crop, in crop pixels and drawing metres;
2. Spark writes SAM's prompt: the legend read -> colour words -> the exact SAM prompts, and which path ran;
3. the controlled SAM test: "beige area" on line work (0 masks) against the same words on colour;
4. the pit downgrade: the L-6 tree pit read by Muse Spark, the greening check before and after (§5 table 1);
plus the call times read from the fixtures (never a typed-in figure)."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.meta.spark import FIXTURES

ALL_OFF = {"grounding_points": False, "spark_legend": False, "sam_control": False, "pit_downgrade": False}


def _open(features=None) -> dict:
    c = TestClient(create_app(features))
    run = c.post("/api/package/open?site=m4").json()
    return {"client": c, "run": run, "rules": c.get("/api/rules").json(), "director": c.get("/api/director").json()}


@pytest.fixture(scope="module")
def on():
    return _open()


@pytest.fixture(scope="module")
def off():
    return _open(ALL_OFF)


def _checks(run, sheet_id, category="area"):
    return [c for c in run["checks"] if c["category"] == category and sheet_id in c["evidence"].get("sheet_ids", [])]


# ------------------------------------------------------------------------------------------- 1. grounding points
def test_grounding_points_land_on_the_t08_crop(on):
    sp = on["run"]["items"][0]["spark"]
    assert sp["points_status"] == "returned" and len(sp["points"]) == 12 and len(sp["answer"]["points"]) == 12
    (w, h), (x0, y0, x1, y1) = sp["crop_px"], sp["crop_window_m"]
    for p in sp["points"]:  # 0-1000 -> pixels -> metres, all inside the crop window
        nx, ny = p["norm"]
        assert p["px"] == pytest.approx([nx / 1000 * w, ny / 1000 * h], abs=0.05)
        assert x0 <= p["m"][0] <= x1 and y0 <= p["m"][1] <= y1
    # the points ring T-08 (centre 33.0, 2.5; radius 2 m): every one within 0.75 m of a red segment, at least half within 0.3 m
    assert sp["points_on_segments"] >= 6 and sp["points_max_to_segment_m"] < 0.75
    assert "12 points" in sp["points_note"]


def test_grounding_points_off_is_null_and_says_so(off):
    sp = off["run"]["items"][0]["spark"]
    assert sp["points"] is None and sp["points_status"] == "off" and "points" not in sp["answer"]


# ------------------------------------------------------------------------------------------- 2. Spark writes SAM's prompt
def test_spark_reads_the_legend_and_writes_sams_prompts(on):
    run = on["run"]
    legend = next(c for c in _checks(run, "L-3") if c["title"].startswith("Muse Spark read the L-3 legend"))
    assert legend["prompt_source"] == "spark_legend" and legend["by"] == ["spark"]
    assert [(x["colour"], x["label"]) for x in legend["legend"]] == [
        ("beige", "Permeable pavers"), ("light grey", "Exposed aggregate"), ("medium grey", "Grass pavers")]
    assert legend["numbers"]["prompts"] == ["beige area", "light grey area", "medium grey area"]
    colour = next(c for c in _checks(run, "L-3") if c["title"].startswith("SAM 3.1 on the coloured L-3"))
    assert [(k["prompt"], k["masks"], k["legend_excluded"]) for k in colour["calls"]] == [
        ("beige area", 2, 1), ("light grey area", 5, 2), ("medium grey area", 4, 2)]
    assert all(c["prompt_source"] == "spark_legend" for c in _checks(run, "L-3") if "sam" in c["by"] and "line" not in c["title"])
    pavers = next(c for c in _checks(run, "L-3") if c["title"].startswith("SAM 3.1: Permeable pavers"))
    assert pavers["numbers"]["error_pct"] == pytest.approx(-1.0, abs=0.05) and pavers["numbers"]["prompt"] == "beige area"
    l1 = next(c for c in _checks(run, "L-1") if c["title"].startswith("Muse Spark read the L-1 legend"))
    assert l1["numbers"]["prompts"] == ["light green circle", "light green area"]
    assert l1["skipped"][0]["label"] == "Duranta" and l1["skipped"][0]["kind"] == "line"  # hedges stay with geometry


def test_without_spark_legend_the_hand_typed_prompts_run(off):
    run = off["run"]
    sam = [c for c in run["checks"] if c["category"] == "area"]
    assert sam and all(c["prompt_source"] == "manual" for c in sam)
    assert not any(c["title"].startswith("Muse Spark read") for c in sam)
    assert "SAM 3.1: Azalea 149.5 m² vs CAD 150.0 m² (-0.3%)" in [c["title"] for c in sam]  # "green rectangle"


def test_prompts_from_legend_are_data():
    from landsight.meta.sam_plan import prompts_from_legend

    rows = [{"swatch_colour_word": "Beige", "label": "PV-1 PERMEABLE PAVERS", "kind": "area"},
            {"swatch_colour_word": "light grey", "label": "PV-2 EXPOSED AGGREGATE", "kind": "area"},
            {"swatch_colour_word": "light-grey", "label": "PV-3 GRASS PAVERS", "kind": "area"},
            {"swatch_colour_word": "green", "label": "CC CAMPHOR", "kind": "symbol"},
            {"swatch_colour_word": "dark green", "label": "DE DURANTA", "kind": "line"}]
    prompts, skipped = prompts_from_legend(rows)
    assert [(p["prompt"], p["labels"]) for p in prompts] == [
        ("beige area", ["PV-1 PERMEABLE PAVERS"]), ("light grey area", ["PV-2 EXPOSED AGGREGATE", "PV-3 GRASS PAVERS"]),
        ("green circle", ["CC CAMPHOR"])]
    assert [s["label"] for s in skipped] == ["DE DURANTA"] and "geometry" in skipped[0]["why"]


def test_spark_legend_sam_calls_used_exactly_sparks_words():
    legend = sorted((FIXTURES.parent / "sam" / "spark_legend").glob("*.json"))
    recs = [json.loads(f.read_text()) for f in legend]
    reads = {json.dumps(json.loads(f.read_text())["result"]) for f in FIXTURES.glob("read_legend__*.json")}
    words = {f"{r['swatch_colour_word']} {'circle' if r['kind'] == 'symbol' else 'area'}"
             for read in reads for r in json.loads(read) if r["kind"] != "line"}
    assert {r["prompt"] for r in recs} == words and all(r["prompt_source"] == "spark_legend" for r in recs)


# ------------------------------------------------------------------------------------------- 3. controlled SAM test
def test_controlled_test_same_words_on_lines_and_on_colour(on):
    want = {"prompt": "beige area", "masks_on_lines": 0, "masks_on_colour": 2, "colour_prompt_source": "spark_legend"}
    colour = next(c for c in _checks(on["run"], "L-3") if c["title"].startswith("SAM 3.1 on the coloured L-3"))
    lines = next(c for c in _checks(on["run"], "L-3") if c.get("control"))
    assert colour["control"] == want and lines["control"] == want
    assert lines["title"] == ("SAM 3.1 on the line drawing of L-3: 0 masks for 'beige area'; on the coloured render "
                              "the same words find 2")
    rec = json.loads((FIXTURES.parent / "sam" / "L-3_lines__beige-area.json").read_text())
    assert rec["n_masks"] == 0 and rec["raw_output"] == ""


def test_control_off_has_no_control_field(off):
    assert not any(c.get("control") for c in off["run"]["checks"])


# ------------------------------------------------------------------------------------------- 4. the pit downgrade
def test_l6_is_read_by_spark_and_the_rules_return_both_states(on):
    l6 = next(s for s in on["run"]["sheets"] if s["sheet_id"] == "L-6")
    assert l6["kind"] == "detail" and not l6["counted"]
    assert {k: l6["detail"][k] for k in ("pit_w_m", "pit_l_m", "soil_depth_m", "on_slab")} == \
        {"pit_w_m": 1.5, "pit_l_m": 1.5, "soil_depth_m": 1.0, "on_slab": True}
    g = on["rules"][0]
    before, after = g["before_downgrade"], g["after_downgrade"]
    assert (before["provided"], before["status"]) == (265.9, "fail")
    assert [(f["id"], f["extra_trees"], f["result"]) for f in before["fixes"][:2]] == [("a", 2, 304.32), ("b", 0, 432.12)]
    assert (after["provided"], after["status"], after["pit"]["area_m2"]) == (214.7, "fail", 2.25)
    a, b = after["fixes"][0], after["fixes"][1]
    assert a["label"] == "+7 Camphor, the same species" and a["result"] == pytest.approx(304.32)
    assert b["label"].startswith("Change ONE Camphor to Bischofia") and b["result"] == pytest.approx(348.92)
    assert b["alpha"] == 1.3 and b["extra_trees"] == 0
    assert after["downgraded"] == [{"label": "Camphor", "count": 8, "from_gi": 1.5, "to_gi": 1.0}]
    assert after["repriced"]["a"]["extra_trees"] == [2, 7]
    gauge = next(s for s in on["director"] if s["id"] == "gauge")
    assert gauge["sheet_ids"] == ["L-1", "L-6"]
    titles = {c["check_id"]: c["title"] for c in on["run"]["checks"]}
    assert "L-6 tree pit: 1.5 × 1.5 m = 2.25 m² · soil 1.0 m · on slab" in [titles[c] for c in gauge["check_ids"]]


def test_pit_downgrade_off_keeps_the_plain_check(off):
    g = off["rules"][0]
    assert g["numbers"]["provided"] == 265.9 and g["before_downgrade"] is None and g["after_downgrade"] is None
    assert g["downgrade_note"] == "the pit downgrade is switched off"
    assert "detail" not in next(s for s in off["run"]["sheets"] if s["sheet_id"] == "L-6")


# ------------------------------------------------------------------------------------------- timing
def test_call_times_come_from_the_recordings(on):
    timing = on["run"]["timing"]
    spark_calls = [c for c in timing["calls"] if c["model"] == "muse-spark-1.3"]
    t08 = json.loads((FIXTURES / "group_and_read__16a1ce64e6e05504.json").read_text())
    assert on["run"]["items"][0]["spark"]["seconds"] == t08["seconds"]
    assert t08["seconds"] in [c["seconds"] for c in spark_calls if c["call"] == "group_and_read"]
    assert all(c["recorded"] for c in timing["calls"]) and 7.7 not in [c["seconds"] for c in timing["calls"]]
    assert timing["spark_s"] == pytest.approx(sum(c["seconds"] for c in spark_calls), abs=0.01)
    assert timing["sam_calls"] == len([c for c in timing["calls"] if c["model"] == "sam-3.1"]) == 7
