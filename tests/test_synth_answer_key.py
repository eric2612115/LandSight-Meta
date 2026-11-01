"""The synthetic site is one site with one answer key, whatever the messiness."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from shapely.geometry import box

from landsight.dxf import load
from landsight.synth import LEVELS, Messiness


def test_generated_files_exist(site):
    key = site("m4")
    for name in ("L-1", "L-2", "L-3"):
        assert Path(key["paths"][name]).is_file()
    assert (Path(key["paths"]["L-1"]).parent / "answer_key.json").is_file()


def test_answer_key_totals(site):
    totals = site("m4")["totals"]
    assert totals["tree"] == {"樟樹": 8}
    assert totals["hedge"] == {"金露花": 182}
    assert totals["shrub_bed"] == {"杜鵑": 150.0}
    assert totals["lawn"] == {"草皮": 200.0}
    assert totals["paving"] == {"透水磚": 212.0, "洗石子": 48.0, "植草磚": 36.0}


def test_answer_key_lists_every_object_with_the_required_fields(site):
    key = json.loads((Path(site("m4")["paths"]["L-1"]).parent / "answer_key.json").read_text())
    for o in key["objects"]:
        assert {"sheet", "kind", "label", "centre", "area_m2", "quote_count"} <= o.keys()
    kinds = [o["kind"] for o in key["objects"]]
    assert kinds.count("tree") == 8
    assert {"legend", "title", "schedule", "elevation_tree", "paving", "planter_edge", "hedge"} <= set(kinds)
    elevation = [o for o in key["objects"] if o["kind"] == "elevation_tree"]
    assert len(elevation) == 8 and all(o["quote_count"] == 0 and o["sheet"] == "L-2" for o in elevation)
    assert key["naive_tree_count_l1_l2"] == 16


def test_the_40cm_tree_is_the_eighth_camphor(site):
    key = site("m4")
    assert key["messiness"]["tree_gaps_cm"] == [0, 0, 5, 5, 10, 10, 20, 40]
    trees = [o for o in key["objects"] if o["kind"] == "tree"]
    assert trees[-1]["label"] == "樟樹" and "40 cm" in trees[-1]["note"]


@pytest.mark.parametrize("level", sorted(LEVELS))
def test_messiness_never_changes_the_answer(site, level):
    assert site(level)["totals"] == site("m4")["totals"]


def test_schedule_mismatch_changes_the_schedule_not_the_answer(site):
    key = site(Messiness(schedule_mismatch=True))
    assert key["schedule"]["樟樹"] == 12
    assert key["totals"]["tree"] == {"樟樹": 8}
    texts = [t.content for t in load(key["paths"]["L-1"]).texts]
    assert "12" in texts and any("喬木 12 株 / 圖面 8 株" in t for t in texts)


def test_drawn_quantities_match_the_key(site):
    m = load(site("m4")["paths"]["L-1"])
    site_box = box(0, 0, 50, 30)
    hedge = [e.geometry.length for e in m.entities if e.geometry.length > 20 and not e.closed and e.geometry.within(site_box)]
    assert sorted(round(v, 6) for v in hedge) == [27.0, 27.0]
    areas = sorted(round(h.polygon.area, 6) for h in m.hatches if h.polygon.area > 10 and not h.polygon.within(box(53, 0, 80, 40)))
    assert areas == [150.0, 200.0]
    l3 = load(site("m4")["paths"]["L-3"])
    assert sorted(round(h.polygon.area, 6) for h in l3.hatches if h.polygon.area > 10) == [36.0, 48.0, 212.0]


def test_dxf_units_and_layers(site):
    m = load(site("m4")["paths"]["L-1"])
    tree_layers = {e.layer for e in m.entities if e.type == "LINE" and 1.0 < e.geometry.length < 1.1}
    assert tree_layers <= {"TREES", "tree", "1", "$00100"} and len(tree_layers) > 1
    assert {h.layer for h in m.hatches if not h.solid} <= {"HATCH", "HATCH1", "00hatch"}
    clean = load(site("m0")["paths"]["L-1"])
    assert sum(1 for e in clean.entities if e.type == "LWPOLYLINE" and e.closed) >= 8
