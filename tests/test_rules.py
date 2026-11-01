"""The regulation check: the §302 numbers on the m4 site (the film's beat 8), the fixes, the two-species and
non-native variants, a municipal site, the protected-tree ordinance, and the title-block reading."""

from __future__ import annotations

import pytest

from landsight.dxf import load
from landsight.geometry import title_block
from landsight.meta import FixtureSpark
from landsight.rules import Planting, SiteFacts, check_all, format_rules, greening, protected, municipal
from landsight.rules.base import parse_area, parse_ratio
from landsight.takeoff import run

local = dict(site_area_m2=1500.0, coverage_ratio=0.4, city="本市")


def plantings(trees: dict[str, int] | None = None, hedge_m2: float = 10.8, confirmed: bool = True,
              low: int | None = None) -> list[Planting]:
    trees = trees or {"樟樹": 8}
    ids = iter(f"T-{n:02d}" for n in range(1, 100))
    out = [Planting("tree", sp, n, None, f"I-0{i}", [next(ids) for _ in range(n)], confirmed, low, 4.0)
           for i, (sp, n) in enumerate(trees.items(), 1)]
    return out + [Planting("hedge", "金露花", 182, hedge_m2), Planting("shrub_bed", "杜鵑", None, 150.0),
                  Planting("lawn", "草皮", None, 200.0)]


def term(res, symbol, zh_start=""):
    return next(t for t in res.terms if t.symbol == symbol and t.zh.startswith(zh_start))


@pytest.fixture(scope="module")
def m4(tmp_path_factory):
    from landsight.synth import LEVELS, generate

    key = generate(tmp_path_factory.mktemp("rules_m4"), LEVELS["m4"])
    return run([key["paths"][s] for s in ("L-1", "L-2", "L-3")], FixtureSpark())


def test_title_block_gives_site_area_coverage_and_city(m4):
    fields = title_block(load(m4.sheets[0].model.path))
    assert fields["基地面積"] == "1,500 m²" and fields["建蔽率"] == "40%" and fields["圖號"] == "L-1"
    assert (m4.site.site_area_m2, m4.site.coverage_ratio, m4.site.city_en) == (1500.0, 0.4, "local")
    assert m4.site.sources["site_area_m2"].startswith("title block L-1")
    assert parse_area("0.15 ha") == 1500 and parse_ratio("0.4") == 0.4 and parse_ratio("40 %") == 0.4


def test_m4_site_fails_302_with_the_measured_numbers(m4):
    res = m4.rules[0]
    assert res.rule == "greening" and res.jurisdiction == "national rule · local"
    assert res.status == "fail" and res.required == 297.0 and res.provided == 265.9
    assert term(res, "A′").value == 900 and term(res, "β").value == 0.66
    assert term(res, "Gi·Ai", "樟樹").value == 192.0
    assert term(res, "Gi·Ai", "杜鵑").value == 75.0 and term(res, "Gi·Ai", "草皮").value == 60.0
    hedge = term(res, "Gi·Ai", "金露花")  # the band between the two hedge lines, as geometry measures it
    assert hedge.value == 5.4 and "10.8 m²" in hedge.formula and "27.0 m × 0.40 m" in hedge.source
    assert term(res, "ra").value == 0 and term(res, "α").value == 0.8
    keys = {c.key for c in res.citations}
    assert {"§298", "§299", "§302", "§304", "式(2)", "式(3)", "式(4)", "式(5)", "式(6)", "表1", "表2"} <= keys
    assert any("T-08" not in n and "result is the same" in n for n in res.notes)  # T-08 pending, FAIL either way


def test_m4_fixes_more_trees_or_one_second_native_species(m4):
    fixes = {f.id: f for f in m4.rules[0].fixes}
    a, b, c = fixes["a"], fixes["b"], fixes["c"]
    assert a.change == {"add_trees": {"樟樹": 2}} and a.provided == pytest.approx(304.32) and a.passes
    assert b.change["swap"] == {"from": "樟樹", "to": "茄苳", "n": 1, "from_en": "Camphor", "to_en": "Bischofia"}
    assert b.extra_trees == 0
    assert b.provided == pytest.approx(432.12) and b.alpha == 1.3 and b.passes and len(b.tone_objects) == 1
    assert c.change == {"add_shrub_m2": 77.8} and c.passes and c.provided > 297.0


def test_plan_md_arithmetic_with_a_16_m2_hedge():
    res = greening.check(SiteFacts(**local), plantings(hedge_m2=16.0))
    assert res.provided == 268.0 and res.status == "fail"
    fixes = {f.id: f for f in res.fixes}
    assert fixes["a"].provided == pytest.approx(306.4) and fixes["b"].provided == pytest.approx(435.5)


def test_two_species_with_one_native_gets_half_the_bonus():
    res = greening.check(SiteFacts(**local), plantings({"樟樹": 4, "小葉欖仁": 4}))
    assert term(res, "ra").value == 0.5 and term(res, "α").value == 1.05
    assert res.status == "pass" and res.provided == pytest.approx(349.0, abs=0.05) and not res.fixes


def test_non_native_row_needs_two_swaps():
    res = greening.check(SiteFacts(**local), plantings({"小葉欖仁": 8}))
    b = next(f for f in res.fixes if f.id == "b")
    assert b.change["swap"]["n"] == 2 and b.alpha == pytest.approx(0.925) and b.provided == pytest.approx(307.47)


def test_municipal_site_runs_the_municipal_rules():
    site = SiteFacts(site_area_m2=1500.0, coverage_ratio=0.4, city="本市", municipal_class=4)
    green, prot, cover = check_all(site, plantings())
    assert green.jurisdiction == "national rule + municipal β (Art. 6) · municipal" and green.required == 297.0
    assert prot.jurisdiction == "municipal · municipal" and prot.notes == ["no existing trees on the plan"]
    assert cover.status == "needs_review" and cover.required == 60.0 and cover.provided == pytest.approx(54.3)
    class1 = greening.check(SiteFacts(site_area_m2=1500.0, coverage_ratio=0.4, city="本市", municipal_class=1), plantings())
    assert term(class1, "β").value == 0.99 and class1.required == pytest.approx(445.5)


def test_municipal_rule_is_skipped_outside_municipal(m4):
    cover = m4.rules[2]
    assert cover.rule == "municipal_green_cover" and cover.status == "skipped" and "local" in cover.notes[0]


def test_protected_trees_only_flags_big_existing_trees():
    assert protected.check(plantings()).notes == ["no existing trees on the plan"]
    big = Planting("existing_tree", "樟樹", 1, dbh_m=0.9, object_ids=["L-1/C-09"])
    small = Planting("existing_tree", "樟樹", 1, dbh_m=0.5)
    ficus = Planting("existing_tree", "榕樹", 1, dbh_m=0.9)
    assert protected.check([big]).status == "needs_review" and "§6" in protected.check([big]).notes[0]
    assert protected.check([small]).status == "pass" and protected.check([ficus]).status == "pass"
    assert protected.check([Planting("existing_tree", "", 1)]).status == "needs_review"


def test_small_sites_are_exempt_and_the_open_space_floor_holds():
    assert greening.check(SiteFacts(site_area_m2=250.0, coverage_ratio=0.4, city="本市"), plantings()).status == \
        "not_applicable"
    dense = greening.check(SiteFacts(site_area_m2=1500.0, coverage_ratio=0.9, city="本市"), plantings())
    assert term(dense, "A′").value == 225.0 and "capped at 0.85" in term(dense, "A′").formula


def test_an_unconfirmed_count_that_would_flip_the_result_needs_review():
    res = greening.check(SiteFacts(**local), plantings({"樟樹": 10}, confirmed=False, low=7))
    assert res.status == "needs_review" and any("would change" in n for n in res.notes)


def test_rules_table_text(m4):
    text = format_rules(m4.rules)
    assert "FAIL · required 297 · provided 265.9" in text and "fix b: swap 1 of 8 樟樹 (Camphor)" in text
    assert "SKIPPED" in text and "no existing trees on the plan" in text
