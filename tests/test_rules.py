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

SITE = dict(site_area_m2=1500.0, coverage_ratio=0.4)


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
    assert (m4.site.site_area_m2, m4.site.coverage_ratio, m4.site.city_en) == (1500.0, 0.4, "unknown city")
    assert m4.site.sources["site_area_m2"].startswith("title block L-1")
    assert parse_area("0.15 ha") == 1500 and parse_ratio("0.4") == 0.4 and parse_ratio("40 %") == 0.4


def test_m4_site_fails_302_with_the_measured_numbers(m4):
    res = m4.rules[0]
    assert res.rule == "greening" and res.jurisdiction == "local building code"
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
    assert b.change["swap"] == {"from": "樟樹", "to": "茄苳", "n": 1, "from_en": "Camphor", "to_en": "Bischofia",
                                "to_native": True}
    assert b.extra_trees == 0
    assert b.provided == pytest.approx(432.12) and b.alpha == 1.3 and b.passes and len(b.tone_objects) == 1
    assert c.change == {"add_shrub_m2": 77.8} and c.passes and c.provided > 297.0


def test_plan_md_arithmetic_with_a_16_m2_hedge():
    res = greening.check(SiteFacts(**SITE), plantings(hedge_m2=16.0))
    assert res.provided == 268.0 and res.status == "fail"
    fixes = {f.id: f for f in res.fixes}
    assert fixes["a"].provided == pytest.approx(306.4) and fixes["b"].provided == pytest.approx(435.5)


def test_two_species_with_one_native_gets_half_the_bonus():
    # 小葉欖仁: not native, no bird/butterfly source, and a sparse-leaf tree (疏葉喬木, Gi 1.0) per species.csv
    res = greening.check(SiteFacts(**SITE), plantings({"樟樹": 4, "小葉欖仁": 4}))
    assert term(res, "ra").value == 0.5 and term(res, "α").value == 1.05
    assert term(res, "Gi·Ai", "小葉欖仁").value == 64.0 and term(res, "Gi·Ai", "樟樹").value == 96.0
    assert res.status == "pass" and res.provided == pytest.approx(315.4, abs=0.05) and not res.fixes


def test_sparse_leaf_row_counts_gi_1_and_the_swap_picks_a_native_from_the_table():
    res = greening.check(SiteFacts(**SITE), plantings({"小葉欖仁": 8}))
    assert term(res, "Gi·Ai", "小葉欖仁").value == 128.0 and res.provided == pytest.approx(214.7)
    b = next(f for f in res.fixes if f.id == "b")
    assert b.change["swap"]["to"] == "樟樹" and b.change["swap"]["to_native"] is True  # the fewest swaps, natives first
    assert b.change["swap"]["n"] == 4 and b.alpha == pytest.approx(1.05) and b.provided == pytest.approx(315.42)


def test_species_come_from_the_csv():
    from landsight.rules.species import lookup, table

    assert len([s for s in table() if s.code != "LN"]) == 60
    tm = lookup("小葉欖仁")
    assert (tm.gi_class, tm.native, tm.attracting, tm.code, tm.en) == ("small_tree", False, None, "TM", "Madagascar almond")
    assert lookup("Camphor").zh == lookup("CAMPHOR").zh == "樟樹" and lookup("茄冬").zh == "茄苳"
    assert lookup("Golden shower").zh == "阿勃勒" and lookup("Bombax ceiba").zh == "木棉"
    assert lookup("木棉").gi_class == "small_tree"  # 疏葉喬木 in the table
    assert lookup("小葉欖仁 H3.5m").zh == "小葉欖仁" and lookup("Lawn").gi_class == "lawn" and lookup("Ficus foo") is None


def test_ra_counts_bird_or_butterfly_attracting_trees():
    # 阿勃勒 (Cassia fistula) is not native but attracts birds and butterflies: formula (6) counts it
    res = greening.check(SiteFacts(**SITE), plantings({"樟樹": 4, "阿勃勒": 4}))
    assert term(res, "ra").value == 1.0 and term(res, "α").value == 1.3
    assert "native or bird/butterfly-attracting of 8 trees" in term(res, "ra").formula
    kapok = greening.check(SiteFacts(**SITE), plantings({"小葉欖仁": 4, "木棉": 4}))
    assert term(kapok, "ra").value == 0.5


def test_a_species_not_in_the_table_needs_review():
    res = greening.check(SiteFacts(**SITE), plantings({"樟樹": 4, "Ficus foo": 4}))
    assert res.status == "needs_review" and not res.fixes  # it would pass, but its class is a guess
    assert any(n.startswith("Ficus foo: needs review: species not in table") for n in res.notes)
    assert term(res, "Gi·Ai", "Ficus foo").value == 64.0 and term(res, "ra").value == 0.5


def test_municipal_site_runs_the_municipal_rules():
    site = SiteFacts(site_area_m2=1500.0, coverage_ratio=0.4, city="本市", municipal_class=4)
    green, prot, cover = check_all(site, plantings())
    assert green.jurisdiction == "local building code + municipal β (Art. 6)" and green.required == 297.0
    assert prot.jurisdiction == "local tree protection rule" and prot.notes == ["no existing trees on the plan"]
    assert cover.status == "needs_review" and cover.required == 60.0 and cover.provided == pytest.approx(54.3)
    class1 = greening.check(SiteFacts(site_area_m2=1500.0, coverage_ratio=0.4, city="本市", municipal_class=1), plantings())
    assert term(class1, "β").value == 0.99 and class1.required == pytest.approx(445.5)


def test_municipal_rule_is_skipped_outside_municipal(m4):
    cover = m4.rules[2]
    assert cover.rule == "municipal_green_cover" and cover.status == "skipped" and "does not apply" in cover.notes[0]


def test_protected_trees_only_flags_big_existing_trees():
    assert protected.check(plantings()).notes == ["no existing trees on the plan"]
    big = Planting("existing_tree", "樟樹", 1, dbh_m=0.9, object_ids=["L-1/C-09"])
    small = Planting("existing_tree", "樟樹", 1, dbh_m=0.5)
    ficus = Planting("existing_tree", "榕樹", 1, dbh_m=0.9)
    assert protected.check([big]).status == "needs_review" and "§6" in protected.check([big]).notes[0]
    assert protected.check([small]).status == "pass" and protected.check([ficus]).status == "pass"
    assert protected.check([Planting("existing_tree", "", 1)]).status == "needs_review"


def test_small_sites_are_exempt_and_the_open_space_floor_holds():
    assert greening.check(SiteFacts(site_area_m2=250.0, coverage_ratio=0.4), plantings()).status == \
        "not_applicable"
    dense = greening.check(SiteFacts(site_area_m2=1500.0, coverage_ratio=0.9), plantings())
    assert term(dense, "A′").value == 225.0 and "capped at 0.85" in term(dense, "A′").formula


def test_an_unconfirmed_count_that_would_flip_the_result_needs_review():
    res = greening.check(SiteFacts(**SITE), plantings({"樟樹": 10}, confirmed=False, low=7))
    assert res.status == "needs_review" and any("would change" in n for n in res.notes)


def test_rules_table_text(m4):
    text = format_rules(m4.rules)
    assert "FAIL · required 297 · provided 265.9" in text and "fix b: swap 1 of 8 樟樹 (Camphor)" in text
    assert "SKIPPED" in text and "no existing trees on the plan" in text


# ------------------------------------------------------------------------------ the pit downgrade (§5 table 1)
SLAB_PIT = dict(soil_depth_m=1.0, from_sheet="L-6", on_slab=True, width_m=1.5, length_m=1.5)


def test_pit_of_1_5_to_4_m2_on_a_slab_counts_large_trees_as_small():
    from landsight.rules import PitFacts

    res = greening.check(SiteFacts(**SITE), plantings(), pit=PitFacts(2.25, **SLAB_PIT))
    before, after = res.before_downgrade, res.after_downgrade
    assert before["provided"] == 265.9 and [f["extra_trees"] for f in before["fixes"][:1]] == [2]
    assert term(res, "Gi·Ai", "樟樹").value == 128.0 and "counts as a small tree (Gi 1.5 → 1.0)" in \
        term(res, "Gi·Ai", "樟樹").source
    assert (res.provided, after["provided"], res.status) == (214.7, 214.7, "fail")
    a, b = after["fixes"][0], after["fixes"][1]
    assert (a["id"], a["extra_trees"], a["provided"]) == ("a", 7, pytest.approx(304.32))  # each new tree is small too
    assert (b["id"], b["change"]["swap"]["n"], b["provided"], b["alpha"]) == ("b", 1, pytest.approx(348.92), 1.3)
    assert after["repriced"]["a"]["extra_trees"] == [2, 7] and term(res, "pit").value == 2.25


def test_a_pit_under_1_5_m2_fails_the_small_tree_minimum_and_needs_review():
    from landsight.rules import PitFacts

    res = greening.check(SiteFacts(**SITE), plantings(), pit=PitFacts(1.44, **SLAB_PIT | {"width_m": 1.2,
                                                                                              "length_m": 1.2}))
    assert res.status == "needs_review" and res.after_downgrade["review"]
    assert not [t for t in res.terms if t.symbol == "Gi·Ai" and t.zh.startswith("樟樹")]  # not counted
    assert any("below the small-tree minimum" in n for n in res.notes)


def test_a_4_m2_pit_keeps_large_trees_and_soil_minimums_are_checked():
    from landsight.rules import PitFacts
    from landsight.rules.greening import pit_class, soil_minimum

    big = greening.check(SiteFacts(**SITE), plantings(), pit=PitFacts(4.0, **SLAB_PIT))
    assert big.after_downgrade["provided"] == big.before_downgrade["provided"] == 265.9
    assert [soil_minimum(c) for c in ("broadleaf_large", "small_tree", "shrub", "lawn")] == [1.0, 0.7, 0.4, 0.1]
    shallow = PitFacts(2.25, **SLAB_PIT | {"soil_depth_m": 0.6})
    assert pit_class("broadleaf_large", shallow)[:2] == ("small_tree", False)  # 0.6 m < the 0.7 m small-tree minimum
    assert pit_class("broadleaf_large", PitFacts(4.0, **SLAB_PIT | {"soil_depth_m": 0.9}))[1] is False  # < 1.0 m
    assert pit_class("small_tree", PitFacts(1.5, **SLAB_PIT | {"soil_depth_m": 0.7}))[:2] == ("small_tree", True)
    res = greening.check(SiteFacts(**SITE), plantings(), pit=shallow)
    assert res.status == "needs_review" and any("below the 0.7 m minimum" in n for n in res.notes)


def test_no_downgrade_off_artificial_ground_and_title_block_says_artificial_ground():
    from landsight.rules import PitFacts, site_facts

    ground = greening.check(SiteFacts(**SITE), plantings(), pit=PitFacts(2.25, 1.0, "L-6", on_slab=False))
    assert ground.provided == 265.9 and ground.after_downgrade is None
    assert any("not applied" in n for n in ground.notes)
    site = site_facts({"L-1": {"SITE AREA": "1,500 m²", "BUILDING COVERAGE": "40%", "GROUND": "ARTIFICIAL GROUND"}})
    assert site.artificial_ground and site.sources["artificial_ground"] == "title block L-1: GROUND ARTIFICIAL GROUND"
    by_title = greening.check(site, plantings(), pit=PitFacts(2.25, 1.0, "L-6", on_slab=None))
    assert by_title.provided == 214.7 and by_title.after_downgrade["artificial_ground"].startswith("title block L-1")
    given = greening.check(SiteFacts(**SITE, artificial_ground=True), plantings(), pit=PitFacts(2.25, 1.0, "given"))
    assert given.provided == 214.7


def test_pipeline_reads_the_l6_detail_into_pit_facts(m4, tmp_path):
    from pathlib import Path

    detail = Path(__file__).parent / "fixtures" / "detail" / "L-6.dxf"
    paths = [sg.model.path for sg in m4.sheets] + [str(detail)]
    t = run(paths, FixtureSpark())
    assert t.spark.sheet_kinds["L-6"]["kind"] == "detail"
    assert (t.pit.width_m, t.pit.length_m, t.pit.area_m2, t.pit.soil_depth_m, t.pit.on_slab) == (1.5, 1.5, 2.25, 1.0, True)
    assert t.rules[0].provided == 214.7 and t.rules[0].before_downgrade["provided"] == 265.9
    skip = run(paths, FixtureSpark(), read_details=False)
    assert skip.pit is None and skip.rules[0].provided == 265.9 and skip.rules[0].after_downgrade is None


def test_every_btr_citation_links_its_own_article():
    import json
    import re
    from pathlib import Path

    from landsight.checks.base import CITES, citation

    assert citation("BTR-299")["url"].endswith("flno=299") and citation("BTR-302")["url"].endswith("flno=302")
    rules = json.loads((Path(__file__).resolve().parents[1] / "landsight" / "data" / "rules.json").read_text())
    seen = 0

    def walk(node):
        nonlocal seen
        if isinstance(node, dict):
            url, art = node.get("url", ""), node.get("article", "")
            if "law.moj.gov.tw" in url and "pcode=D0070115" in url and re.match(r"第\d+條", art or ""):
                seen += 1
                assert url.endswith("flno=" + re.match(r"第(\d+)條", art).group(1)), (art, url)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(rules)
    # the municipal tree protection ordinance is cited by name and article only (no city-named address)
    assert seen >= 7 and all(citation(k)["url"] for k in CITES if not k.startswith("TC-"))
    assert not citation("TC-TREE-3")["url"] and citation("TC-TREE-3")["article"].startswith("Municipal tree protection")
