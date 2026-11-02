"""The package review on a freshly generated sample package, replaying the recorded Muse Spark answers
(tests/fixtures/review/): file verdicts, sheet kinds, take-off quantities, the scoreboard against the answer key, the
Run's shape, plus unit tests of the ingest, bill and pre-pass pieces that need no model."""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

import pytest

from landsight.review import review
from landsight.review.validate import validate
from landsight.synth.package import write_package

VERDICT = {"drawing · vector": "drawing_vector", "drawing · raster": "drawing_raster", "drawing · image": "drawing_image",
           "bill": "bill", "quote": "quote", "spec": "spec", "document": "document", "presentation": "presentation",
           "backup": "backup_ignored", "archive": "archive_unpacked", "unsupported": "unsupported"}
CJK = re.compile(r"[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef\uac00-\ud7af]")
FIXTURES = Path(__file__).parent / "fixtures" / "review"


@pytest.fixture(scope="module")
def pkg(tmp_path_factory):
    return write_package(tmp_path_factory.mktemp("review_pkg"))


@pytest.fixture(scope="module")
def run(pkg):
    if not any(FIXTURES.glob("review_classify_sheet__*.json")):
        pytest.skip("no recorded Muse Spark answers yet (scripts/review_live.md)")
    return review(pkg.out_dir, mode="fixtures")


def test_every_answer_was_replayed(run):
    assert run["timing"]["recorded"] is True
    assert run["timing"]["spark_calls"] >= 30
    assert not [n for n in run["notes"] if "no recording" in n or "FixtureMissing" in n], run["notes"]


def test_thirty_file_verdicts_as_the_answer_key_says(run, pkg):
    top = [f for f in run["files"] if not f.get("parent")]
    assert len(top) == 30 == run["package"]["file_count"]
    got = {f["path"]: f["verdict"] for f in top}
    want = {f["path"]: VERDICT[f["verdict"]] for f in pkg.key["files"]}
    assert got == want
    assert all(f["why"] and f["decided_by"] in ("ext", "content", "spark") for f in run["files"])
    zipf = next(f for f in top if f["verdict"] == "archive_unpacked")
    child = next(f for f in run["files"] if f.get("parent") == zipf["file_id"])
    assert zipf["children"] == [child["file_id"]] and child["name"] == "drain-cover-detail.dxf"


def test_sheet_kinds_and_what_is_counted(run):
    dxf = {s["sheet_id"]: s for s in run["sheets"] if s["source"] == "dxf"}
    kinds = {sid: s["kind"] for sid, s in dxf.items()}
    assert kinds == {"L-0": "cover", "L-1-revA": "plan", "L-1-revB": "plan", "L-2": "elevation", "L-3": "plan",
                     "L-4": "schedule", "L-5": "plan", "L-6": "detail", "L-7": "background", "L-8": "background",
                     "D-01": "detail"}
    assert sorted(sid for sid, s in dxf.items() if s["counted"]) == ["L-1-revB", "L-3"]
    assert "superseded" in dxf["L-1-revA"]["not_counted_reason"]
    assert "enlarged" in dxf["L-5"]["not_counted_reason"]
    assert (dxf["L-5"]["scale_title"], dxf["L-5"]["scale_measured"]) == ("1:200", "1:100")
    assert (dxf["L-1-revB"]["revision"], dxf["L-1-revB"]["date"]) == ("B", "2026-10-14")
    pages = [s for s in run["sheets"] if s["source"] == "pdf_vector"]
    assert len(pages) == 9 and not any(s["counted"] for s in pages)


def test_take_off_quantities_match_the_answer_key(run, pkg):
    got = {(it["kind"], it["label"]): it["proposed_count"] for it in run["items"] if it.get("source") != "sam"}
    assert got[("tree", "Camphor")] == pkg.key["counted_trees"]["L-1 Rev B"] == 8
    assert got[("hedge", "Duranta")] == 182
    assert got[("shrub_bed", "Azalea")] == 150 and got[("lawn", "Lawn")] == 200
    assert got[("paving", "Permeable pavers")] == 212 and got[("paving", "Exposed aggregate")] == 48
    assert got[("paving", "Grass pavers")] == 36 and got[("planter_edge", "Planter edge")] == 22
    camphor = next(it for it in run["items"] if it["label"] == "Camphor")
    assert camphor["schedule_count"] == 12 and camphor["agreed"] is False


def test_scoreboard(run):
    e = run["errors"]
    assert e["planted"] == 30
    assert len(e["found"]) + len(e["flagged"]) >= 24, e
    assert e["false_alarms"] == [], e["false_alarms"]
    assert set(e["found"]) | set(e["flagged"]) | set(e["missed"]) == {f"E{i:02d}" for i in range(1, 31)}


def test_regulation_checks_cite_and_e30_names_the_greening_report(run):
    regs = [c for c in run["checks"] if c["category"] in ("regulation", "protected_tree")]
    assert regs and all(c.get("citation", {}).get("url", "").startswith("https://") for c in regs)
    e30 = [c for c in run["checks"] if c["check_id"].startswith("E30")]
    assert e30 and re.search(r"greening quantity report.*TCO2", e30[0]["title"], re.I)


def test_fire_lane_states_the_299_variant_as_a_condition(run):
    """D-43 (resolved B): the main greening check keeps Ap = 0; E09 states the §299 figure only as a condition, with
    the requirement and the tree fix computed by the greening rule run with Ap = the lane's measured area."""
    e09 = next(c for c in run["checks"] if c["check_id"] == "E09")
    n = e09["numbers"]
    a0, r, beta = 1500.0, 0.4, 0.66  # the title block's site facts; β for an ordinary site
    assert n["zone_m2"] == 92.0 and n["required_ap0"] == 297.0
    assert n["required_with_lane_as_ap"] == pytest.approx(round(0.5 * (a0 - n["zone_m2"]) * (1 - r) * beta, 1))
    # 7 Camphor counted until T-08 is confirmed (D-62): +8 / +7; once confirmed, the v1 figures +7 / +6
    assert (n["tree_fix_ap0"], n["tree_fix_with_lane_as_ap"], n["with_lane_as_ap"]) == (8, 7, "fail")
    assert ("If the architect confirms this strip is fire-truck rescue space under §299, the requirement drops to "
            "278.8 kgCO2e/yr — still a fail — and the tree fix becomes +7.") in e09["why"]
    c = e09["if_confirmed"]["numbers"]
    assert (c["tree_fix_ap0"], c["tree_fix_with_lane_as_ap"]) == (7, 6) and e09["pending_items"] == ["I-01"]
    assert "impracticable (Art. 299), so" not in e09["why"]
    green = next(c for c in run["checks"] if c["category"] == "regulation" and c["title"].startswith("Greening"))
    assert green["numbers"]["Ap"] == 0.0 and green["numbers"]["required"] == 297.0


def test_the_run_validates_and_is_english(run):
    assert validate(run) == []
    assert not CJK.search(json.dumps(run, ensure_ascii=False))


# --------------------------------------------------------------------------------------------- no model needed


def test_zip_members_cannot_escape(tmp_path):
    from landsight.ingest import UnsafeArchive, unpack_zip

    bad = tmp_path / "bad.zip"
    with zipfile.ZipFile(bad, "w") as z:
        z.writestr("../evil.txt", "x")
    with pytest.raises(UnsafeArchive):
        unpack_zip(bad, tmp_path / "out")
    assert not (tmp_path / "evil.txt").exists()
    ok = tmp_path / "ok.zip"
    with zipfile.ZipFile(ok, "w") as z:
        z.writestr("a/b.dxf", "0\nEOF\n")
    assert [p.name for p in unpack_zip(ok, tmp_path / "ok")] == ["b.dxf"]


def test_triage_without_the_model(pkg, tmp_path):
    from landsight.ingest import walk

    recs = {r.path: r for r in walk(pkg.root, tmp_path)}
    assert recs["Drawings/CAD/L-1 Planting Plan.bak"].verdict == "backup_ignored"
    assert "byte-identical to L-1 Planting Plan.dxf" in recs["Drawings/CAD/L-1 Planting Plan.bak"].why
    assert recs["Quotes/irrigation quote (old format).xls"].why == "Excel 97–2003, save as .xlsx"
    assert recs["Drawings/PDF/L-1 Planting Plan (scan).pdf"].verdict == "drawing_raster"
    full = recs["Drawings/PDF/Landscape Drawings (Full Set).pdf"]
    assert full.verdict == "drawing_vector" and [p.kind for p in full.pages] == ["vector"] * 9
    assert all(recs[p].verdict == "bill" for p in recs if p.endswith(".xlsx"))


def test_bill_reader(pkg):
    from landsight.bill.reader import read, sum_range

    b = read(pkg.root / "Bills/Landscape BOQ rev2.xlsx")
    t = b.main
    assert (b.revision, b.date) == ("2", "2026-02-19")
    assert t.merged_header and t.column_names["qty"] == "Quantity / Qty" and t.header_cells == "A3:G4"
    assert [h.name for h in b.hidden] == ["old"]
    camphor = t.rows[0]
    assert (camphor.description, camphor.qty, camphor.price, camphor.cell("qty")) == ("Camphore tree, cal. 10 cm", 12, 4200, "E6")
    col, lo, hi = sum_range(t.footer("subtotal").formula)
    assert (col, lo, hi) == ("G", 6, 17) and max(r.row for r in t.rows) == 19


def test_codes_resolve_through_the_schedule_and_legends(pkg):
    from landsight.dxf import load
    from landsight.review.prepass import codebook, relabel

    cad = pkg.root / "Drawings/CAD"
    models = {"L-1": load(cad / "L-1 Planting Plan.dxf"), "L-3": load(cad / "L-3 Paving Plan.dxf"),
              "L-4": load(cad / "L-4 Plant Schedule.dxf")}
    book = codebook(models, ["L-4"], ["L-1", "L-3"])
    assert (book["CC"].name, book["CC"].qty, book["CC"].kind) == ("Camphor", 12, "tree")
    assert book["AZ"].density_per_m2 == 4 and book["PV-2"].pattern == "AR-SAND" and book["PV-2"].kind == "paving"
    assert relabel("CC typ.", book) == "CC Camphor typ."
    assert relabel("8 CC", book) == "8-CC Camphor"
    assert relabel("DU H0.6 @0.3m o.c. DOUBLE ROW", book) == "DU Duranta H0.6 @0.3m DOUBLE ROW"
    assert relabel("PV-2 EXPOSED AGGREGATE", book) == "PV-2 Exposed aggregate paving"


def test_prepass_drops_dashed_trees_and_the_fire_lane(pkg):
    from landsight.dxf import load
    from landsight.review.prepass import analyse, codebook

    cad = pkg.root / "Drawings/CAD"
    models = {"L-1": load(cad / "L-1 Planting Plan (Rev B).dxf"), "L-3": load(cad / "L-3 Paving Plan.dxf"),
              "L-4": load(cad / "L-4 Plant Schedule.dxf")}
    book = codebook(models, ["L-4"], ["L-1", "L-3"])
    pre = analyse("L-1", models["L-1"], book)
    assert [(e.tag, e.dbh_m, e.to_be_removed) for e in pre.existing] == [("EX-01", 0.95, True)]
    assert [z.area_m2 for z in pre.zones] == [92.0]
    assert sorted(e.kind for e in pre.excluded) == ["in_zone", "outside_boundary"]
    l3 = analyse("L-3", models["L-3"], book)
    assert [(m.label_code, m.hatch_code, m.area_m2) for m in l3.mismatches] == [("PV-1", "PV-2", 48.0)]
