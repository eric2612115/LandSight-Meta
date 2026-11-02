"""The tower package (docs/PACKAGE.md v2) and the held-out package (gate run 2), replayed from their recordings: the
generator is deterministic, the tower's eight planted errors are scored, the typical floor counts six times in the
take-off, the bill and the greening, and the held-out package keeps the scoreboard it got live."""

from __future__ import annotations

import json

import pytest

from landsight.review import review
from landsight.review.validate import validate
from landsight.synth.heldout import pick, write_heldout
from landsight.synth.tower import FILES, write_tower

from conftest import SAMPLE

REPO = SAMPLE.parents[1]


@pytest.fixture(scope="module")
def tower(tmp_path_factory):
    pk = write_tower(tmp_path_factory.mktemp("tower"))
    return pk, review(pk.out_dir, mode="fixtures")


def by_id(run, cid):
    return next(c for c in run["checks"] if c["check_id"] == cid)


def test_the_tower_package_is_what_the_repo_holds(tower):
    pk, _ = tower
    assert [p.relative_to(pk.root).as_posix() for p in pk.files] == sorted(
        [*FILES.values(), "Bills/BOQ - Tower Landscape.xlsx"])
    held = json.loads((REPO / "samples" / "tower" / "answer_key.json").read_text())
    assert [e["id"] for e in held["errors"]] == [f"T0{i}" for i in range(1, 9)] == [e["id"] for e in pk.key["errors"]]
    assert {e["scenario"] for e in pk.key["errors"]} == {"quote", "regulation", "design"}


def test_tower_scoreboard(tower):
    _, run = tower
    e = run["errors"]
    assert (e["planted"], len(e["found"]), len(e["flagged"]), len(e["missed"]), len(e["false_alarms"])) == (8, 6, 2, 0, 0)
    assert e["flagged"] == ["T04", "T08"] and run["timing"]["recorded"] is True
    assert not [n for n in run["notes"] if "no recording" in n]
    assert not validate(run)


def test_the_typical_floor_counts_six_times(tower):
    _, run = tower
    t01 = by_id(run, "T01")
    assert t01["numbers"]["floors"] == 6 and t01["scenario"] == "regulation"
    ixora = next(i for i in run["items"] if i["label"] == "Chinese ixora")
    assert ixora["floors"]["per_floor"] == 20 and ixora["floors"]["total"] == 120 == ixora["proposed_count"]
    lc1 = next(s for s in run["sheets"] if s["sheet_id"] == "L-103")
    assert lc1["floor_count"] == 6 and lc1["floors"] == ["6", "9", "12", "15", "18", "21"]
    t06 = by_id(run, "T06")
    assert (t06["numbers"]["bill_qty"], t06["numbers"]["drawn_qty"]) == (20, 120)


def test_roof_soil_detail_and_lookalikes(tower):
    _, run = tower
    t02 = by_id(run, "T02")
    assert t02["severity"] == "fail" and "Orange jasmine on 0.3 m soil" in t02["title"]
    green = next(c for c in run["checks"] if c["title"].startswith("Greening"))
    assert green["severity"] == "info" and "32 m² on L-104 sits on 0.3 m of soil" in green["why"]
    assert by_id(run, "T04")["numbers"] == {"detail_m": 0.6, "plan_m": 0.3}
    assert by_id(run, "T08")["numbers"]["share"] > 0.9
    assert "counted on each" in by_id(run, "T05")["title"]
    assert by_id(run, "T07")["numbers"]["list_low"] == 650
    sections = next(s for s in run["sheets"] if s["sheet_id"] == "L-301")
    assert not sections["counted"]


def test_heldout_is_seeded_and_replays_its_live_scoreboard(tmp_path):
    assert pick(7) == ["existing_tree", "hedge_unit", "index_missing", "label_hatch", "open_outline",
                       "outside_boundary", "pit_downgrade", "raster_scan", "schedule_mismatch", "subtotal_skip"]
    assert pick(8) != pick(7)
    pk = write_heldout(tmp_path, seed=7)
    held = json.loads((REPO / "samples" / "heldout" / "answer_key.json").read_text())
    assert [e["kind"] for e in held["errors"]] == [e["kind"] for e in pk.key["errors"]]
    run = review(pk.out_dir, mode="fixtures")
    e = run["errors"]
    assert (e["planted"], len(e["found"]), len(e["flagged"]), len(e["missed"]), len(e["false_alarms"])) == (11, 10, 1, 0, 0)
    assert e["flagged"] == ["H04"] and run["timing"]["recorded"] is True
