"""The whole pipeline offline (recorded Muse Spark responses) on L-1 + L-2: the answer key comes back, the elevation
sheet is not counted, and the 40 cm tree is flagged rather than silently counted."""

from __future__ import annotations

import json
from dataclasses import replace

import pytest

from landsight.meta import FixtureSpark
from landsight.meta.spark import FIXTURES
from landsight.synth import LEVELS
from landsight.takeoff import format_items, run


def _run(site, level):
    m = LEVELS[level] if isinstance(level, str) else level
    key = site(m)
    result = run([key["paths"]["L-1"], key["paths"]["L-2"]], FixtureSpark())
    return key, result, {(it.kind, it.label): it for it in result.items}


@pytest.mark.parametrize("level", ["m1", "m4"])
def test_pipeline_reproduces_the_answer_key(site, level):
    key, result, items = _run(site, level)
    table = format_items(result.items, result.notes)
    for kind in ("tree", "hedge", "shrub_bed", "lawn"):
        for species, truth in key["totals"][kind].items():
            assert items[(kind, species)].proposed_count == truth, table
    assert items[("hedge", "金露花")].quote_count == 182 and items[("hedge", "金露花")].spark_count is None
    assert items[("shrub_bed", "杜鵑")].quote_count == 150
    assert items[("lawn", "草皮")].quote_count == 200
    assert all(it.sheet == "L-1" for it in result.items), table
    assert result.spark.sheet_kinds["L-1"]["kind"] == "plan"
    assert result.spark.sheet_kinds["L-2"]["kind"] == "elevation"
    assert any(n.startswith("L-2: elevation") for n in result.notes)


def test_clean_drawing_agrees_and_quotes_eight(site):
    _, result, items = _run(site, "m1")
    tree = items[("tree", "樟樹")]
    assert tree.agreed and tree.quote_count == 8
    assert (tree.geometry_count, tree.schedule_count, tree.label_count) == (8, 8, 8)  # 「8-樟樹」 group label
    assert not [it for it in result.items if not it.agreed]


def test_the_40cm_tree_is_flagged_not_silently_counted(site):
    _, result, items = _run(site, "m4")
    tree = items[("tree", "樟樹")]
    assert not tree.agreed and tree.quote_count is None
    assert (tree.geometry_count, tree.spark_count, tree.schedule_count) == (7, 8, 8)
    assert "C-03" in tree.flagged_reason and "0.40 m" in tree.flagged_reason
    assert tree.objects["T-08"] == "L-1/C-03"  # the east-most tree is the open one
    assert [it.label for it in result.items if not it.agreed] == ["樟樹"]


def test_schedule_dispute_is_flagged_and_the_drawing_governs(site):
    _, result, items = _run(site, replace(LEVELS["m4"], schedule_mismatch=True))
    tree = items[("tree", "樟樹")]
    assert tree.schedule_count == 12 and tree.proposed_count == 8 and tree.quote_count is None
    assert "schedule 12" in tree.flagged_reason


@pytest.mark.parametrize("name", ["naive_count", "naive_count_no_schedule", "naive_count_l1_only",
                                  "naive_count_l2_only"])
def test_naive_baselines_were_recorded_once(name):
    rec = json.loads((FIXTURES / f"{name}.json").read_text())
    assert rec["prompt"].startswith("How many trees are on this site?") and rec["schema"] is None
    assert rec["answer"] and rec["recorded_at"]
    assert rec.get("schedule_in_view", True) == (name == "naive_count")
