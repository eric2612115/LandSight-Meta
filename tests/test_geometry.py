"""Geometry: closing loose canopies, keeping the 40 cm tree open, excluding sheet furniture, expanding labels."""

from __future__ import annotations

import pytest
from shapely.geometry import LineString

from landsight.dxf import load
from landsight.geometry import close, exclude, expand, is_canopy, spacing_count
from landsight.synth import Messiness


def _l1(site, **kw):
    model = load(site(Messiness(**kw))["paths"]["L-1"])
    result = close(model)
    regions = exclude(model, result.shapes + result.candidates)
    return model, result, regions


@pytest.mark.parametrize("gap_cm", [0, 5, 10, 20])
def test_all_eight_canopies_close_up_to_20cm(site, gap_cm):
    _, r, _ = _l1(site, gap_cm=gap_cm)
    canopies = [s for s in r.shapes if not s.excluded and is_canopy(s)]
    assert len(canopies) == 8
    assert all(s.marks == 1 for s in canopies)
    assert all(abs(s.area - 12.0) < 0.1 for s in canopies)
    assert not [c for c in r.candidates if not c.excluded and c.marks]


def test_polyline_canopies_close_too(site):
    _, r, _ = _l1(site, gap_cm=5, exploded=False, layer_chaos=False)
    assert len([s for s in r.shapes if not s.excluded and is_canopy(s)]) == 8


def test_the_40cm_tree_stays_an_open_candidate(site):
    _, r, _ = _l1(site, gap_cm=40)
    canopies = [s for s in r.shapes if not s.excluded and is_canopy(s)]
    assert len(canopies) == 7
    trees = [c for c in r.candidates if not c.excluded and c.marks]
    assert len(trees) == 1
    tree = trees[0]
    assert tree.segment_count == 12 and tree.gap_count == 12
    assert tree.max_gap == pytest.approx(0.40, abs=0.01)
    assert tree.centre == pytest.approx((33.0, 2.5), abs=0.01)


def test_neighbouring_canopies_are_never_bridged_to_each_other(site):
    # the 40 cm tree sits 13.6 cm from its closed neighbour: a direction-blind snap would join them
    _, r, _ = _l1(site, gap_cm=40)
    for b in r.bridges:
        assert b.length <= 0.25 + 1e-3
        (x0, _), (x1, _) = b.coords
        assert abs(x0 - x1) < 0.2  # no bridge spans the 13.6 cm gap between two trees horizontally at mid-height
    assert not any(s.area > 12.5 and is_canopy(s) for s in r.shapes)


def test_legend_title_and_schedule_are_excluded(site):
    _, r, regions = _l1(site)
    assert {g.kind for g in regions} == {"legend", "title", "schedule"}
    legend_symbols = [s for s in r.shapes if s.excluded == "legend" and is_canopy(s)]
    assert len(legend_symbols) == 1 and legend_symbols[0].marks == 1
    assert any(s.excluded == "legend" and s.hatch_pattern == "ANSI31" for s in r.shapes)
    assert any(c.excluded == "legend" for c in r.candidates)  # the legend's hedge line
    assert sum(1 for s in r.shapes if s.excluded == "schedule") > 20  # table cells
    assert sum(1 for s in r.shapes if s.excluded == "title") >= 14


def test_hatched_areas_and_hedge(site):
    _, r, _ = _l1(site)
    hatched = sorted(round(s.area, 3) for s in r.shapes if not s.excluded and s.hatch_pattern not in (None, "SOLID"))
    assert hatched == [150.0, 200.0]
    hedge = [c for c in r.candidates if not c.excluded and c.length > 50]
    assert len(hedge) == 1 and sorted(round(ln.length, 3) for ln in hedge[0].lines) == [27.0, 27.0]
    assert any("金露花" in ld.text.content and ld.tip == pytest.approx((48.8, 24.0)) for ld in r.leaders)


def test_elevation_sheet_has_eight_round_outlines(site):
    r = close(load(site("m4")["paths"]["L-2"]))
    assert len([s for s in r.shapes if not s.excluded and is_canopy(s)]) == 8


def test_spacing_count():
    assert spacing_count(27.0, 3) == 10
    assert spacing_count(LineString([(0, 0), (27, 0)]), 3) == 10
    assert spacing_count(27.0, 0.3) == 91  # 27.0 / 0.3 is 90.00000000000001 in floating point
    assert spacing_count(26.9999999, 0.3) == 91
    assert spacing_count(0, 3) == 0


@pytest.mark.parametrize("label, count, representative, species", [
    ("小葉欖仁 @3m", 10, False, "小葉欖仁"),
    ("樟樹 ×8", 8, False, "樟樹"),
    ("樟樹 x8", 8, False, "樟樹"),
    ("8-樟樹", 8, False, "樟樹"),
    ("樟樹 typ.", None, True, "樟樹"),
    ("樟樹 TYP", None, True, "樟樹"),
    ("樟樹 H3.5", None, False, "樟樹"),
    ("P.C.", None, False, "P.C."),
])
def test_label_expansion(label, count, representative, species):
    e = expand(label, LineString([(0, 0), (27, 0)]))
    assert (e.count, e.representative, e.species) == (count, representative, species)


def test_double_row_hedge_label():
    e = expand("金露花 H0.6 @0.3m 雙排", 27.0)
    assert (e.species, e.spacing_m, e.rows, e.count) == ("金露花", 0.3, 2, 91)
