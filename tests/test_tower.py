"""The tower package (docs/PACKAGE.md v2) and the held-out package (gate run 2), replayed from their recordings: the
generator is deterministic, the tower's ten planted errors are scored, the typical floor counts four times in the
take-off, the bill and the greening, a planter over the lift shaft and planters in the escape corridor are caught (and
a clean floor raises neither), and the held-out package keeps the scoreboard it got live."""

from __future__ import annotations

import json

from types import SimpleNamespace as NS

import pytest
from shapely.geometry import LineString

from landsight.checks import tower as TW
from landsight.dxf.model import Entity
from landsight.review import review
from landsight.review.validate import validate
from landsight.synth.heldout import pick, write_heldout
from landsight.synth import tower as ST
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
        [*FILES.values(), "Bills/Tower landscape BOQ.xlsx"])
    held = json.loads((REPO / "samples" / "tower" / "answer_key.json").read_text())
    assert [e["id"] for e in held["errors"]] == [f"T{i:02d}" for i in range(1, 11)] == [e["id"] for e in pk.key["errors"]]
    assert {e["scenario"] for e in pk.key["errors"]} == {"quote", "regulation", "design"}


def test_tower_scoreboard(tower):
    _, run = tower
    e = run["errors"]
    assert (e["planted"], len(e["found"]), len(e["flagged"]), len(e["missed"]), len(e["false_alarms"])) == (10, 8, 2, 0, 0)
    assert e["flagged"] == ["T04", "T08"] and run["timing"]["recorded"] is True
    assert not [n for n in run["notes"] if "no recording" in n]
    assert not validate(run)


def test_the_typical_floor_counts_four_times(tower):
    _, run = tower
    t01 = by_id(run, "T01")
    assert t01["numbers"]["floors"] == 4 and t01["scenario"] == "regulation"
    ixora = next(i for i in run["items"] if i["label"] == "Chinese ixora")
    assert ixora["floors"]["per_floor"] == 38.4 and ixora["floors"]["total"] == 153.6 == ixora["proposed_count"]
    typical = next(s for s in run["sheets"] if s["sheet_id"] == "L-103")
    assert typical["floor_count"] == 4 and typical["floors"] == ["8", "12", "16", "20"]
    t06 = by_id(run, "T06")
    assert (t06["numbers"]["bill_qty"], t06["numbers"]["drawn_qty"]) == (38.4, 153.6)


def test_roof_soil_detail_and_lookalikes(tower):
    _, run = tower
    t02 = by_id(run, "T02")
    assert t02["severity"] == "fail" and "Orange jasmine on 0.3 m soil" in t02["title"]
    green = next(c for c in run["checks"] if c["title"].startswith("Greening"))
    assert green["severity"] == "info" and "35 m² on L-104 sits on 0.3 m of soil" in green["why"]
    assert by_id(run, "T04")["numbers"] == {"detail_m": 0.6, "plan_m": 0.3}
    assert by_id(run, "T08")["numbers"]["share"] > 0.9
    assert "counted on each" in by_id(run, "T05")["title"]
    assert by_id(run, "T07")["numbers"]["list_low"] == 650
    sections = next(s for s in run["sheets"] if s["sheet_id"] == "L-301")
    assert not sections["counted"]


def test_planter_over_the_lift_and_the_narrowed_corridor(tower):
    _, run = tower
    t09 = by_id(run, "T09")
    assert (t09["category"], t09["severity"], t09["scenario"]) == ("area", "fail", "design")
    assert t09["title"] == "Planter drawn over the lift shaft (L-102)"
    assert t09["numbers"]["overlap_m2"] == 3.0 and "by 3.0 m²" in t09["why"] and "A-CORE-LIFT" in t09["why"]
    t10 = by_id(run, "T10")
    assert (t10["category"], t10["severity"], t10["scenario"]) == ("regulation", "fail", "regulation")
    assert t10["numbers"] == {"clear_m": 0.9, "walls_m": 1.5, "minimum_m": 1.2, "floors": 4}
    assert "repeats on 8F, 12F, 16F and 20F" in t10["why"]
    assert t10["citation"]["article"].endswith("Art. 92") and t10["citation"]["url"].endswith("flno=92")


def _floor(lift_planter, corridor_planters):
    """One plan sheet with the tower's core (lift shaft, corridor walls) and the planters given."""
    def ring(b):
        return [[x, y] for x, y in ST.S._box_pts(b)]

    ents = [Entity("1", "LWPOLYLINE", "A-CORE-LIFT", LineString(ST.S._box_pts(ST.LIFT)), True)]
    ents += [Entity(str(i), "LINE", "A-EGRESS", LineString([(ST.CORRIDOR[0], y), (ST.CORRIDOR[2], y)]), False)
             for i, y in ((2, ST.CORRIDOR[1]), (3, ST.CORRIDOR[3]))]
    beds = [b for b in [*ST.PLANTERS, lift_planter, *corridor_planters] if b]
    objs = [{"object_id": f"B-{i:02d}", "kind": "shrub_bed", "label": "Chinese ixora", "outline": ring(b)}
            for i, b in enumerate(beds, 1)]
    d = NS(sheet_id="L-103", number="L-103", source="dxf", counted=True, kind="plan", model=NS(entities=ents))
    return NS(sheets=[d], objects={"L-103": objs}, files_of=lambda s: ["F-01"],
              floor_info={"L-103": {"floors": ["8", "12", "16", "20"], "n": 4}})


def test_the_two_checks_hit_the_planted_floor_and_pass_a_clean_one():
    planted = _floor(ST.LIFT_PLANTER, ST.CORRIDOR_PLANTERS)
    [lift] = TW.lift_overlap(planted)
    assert lift.severity == "fail" and lift.numbers["overlap_m2"] == 3.0
    [corr] = TW.corridor_width(planted)
    assert corr.numbers["clear_m"] == 0.9 and corr.numbers["walls_m"] == 1.5 and corr.numbers["floors"] == 4
    assert "8F, 12F, 16F and 20F" in corr.why
    clean = _floor(None, [])
    assert TW.lift_overlap(clean) == [] and TW.corridor_width(clean) == []
    beside = _floor((19.0, 13.0, 22.0, 15.5), [(23.5, 19.8, 25.5, 20.0)])  # clear of the shaft; 1.3 m left clear
    assert TW.lift_overlap(beside) == [] and TW.corridor_width(beside) == []


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


def test_the_quick_reviews_tower_titles_name_the_checks_the_review_raises(tower):
    """frontend/src/try/plain.ts TOWER gives each of the ten planted errors a plain title, used only when the check on
    screen has that id and that category: every row's id and category is a check of the tower's review, and every
    alarm T-check the review raises has a row."""
    import re

    _, run = tower
    src = (REPO / "frontend" / "src" / "try" / "plain.ts").read_text(encoding="utf-8")
    table = src[src.index("export const TOWER"):]
    table = table[:table.index("\n}\n")]
    rows = dict(re.findall(r"^\s+(T\d\d): \{ group: '\w+', category: '(\w+)'", table, re.M))
    assert sorted(rows) == [f"T{i:02d}" for i in range(1, 11)]
    for cid, category in rows.items():
        assert by_id(run, cid)["category"] == category, cid
    alarms = {c["check_id"] for c in run["checks"] if re.fullmatch(r"T\d\d", c["check_id"])
              and c["severity"] in ("fail", "flag", "review") and not c.get("ok")}
    assert alarms <= set(rows)
