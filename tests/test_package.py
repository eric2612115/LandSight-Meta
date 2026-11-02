"""The sample developer's package: thirty files, thirty planted errors, one answer key (docs/PACKAGE.md)."""

from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from pathlib import Path

import openpyxl
import pymupdf
import pytest

from landsight.dxf import load
from landsight.synth import PACKAGE_OPTIONS, SiteOptions, generate
from landsight.synth.package import ANSWER_KEY, PRICE_LIST, ROOT, package_key, package_sheets, write_package

EXPECTED_FILES = sorted([
    "Drawings/CAD/L-0 Cover and Index.dxf",
    "Drawings/CAD/L-1 Planting Plan.dxf",
    "Drawings/CAD/L-1 Planting Plan (Rev B).dxf",
    "Drawings/CAD/L-1 Planting Plan.bak",
    "Drawings/CAD/L-2 South Elevation.dxf",
    "Drawings/CAD/L-3 Paving Plan.dxf",
    "Drawings/CAD/L-4 Plant Schedule.dxf",
    "Drawings/CAD/L-5 Enlarged Plan - West.dxf",
    "Drawings/CAD/L-6 Tree Pit Detail.dxf",
    "Drawings/CAD/L-7 Irrigation Plan.dxf",
    "Drawings/CAD/L-8 Lighting Plan.dxf",
    "Drawings/CAD/pasted image #1.png",
    "Drawings/CAD/pasted image #2.png",
    "Drawings/PDF/Landscape Drawings (Full Set).pdf",
    "Drawings/PDF/L-1 Planting Plan (scan).pdf",
    "Drawings/PDF/Presentation Plan (Colour).pdf",
    "Bills/Landscape BOQ rev1.xlsx",
    "Bills/Landscape BOQ rev1a.xlsx",
    "Bills/Landscape BOQ rev2.xlsx",
    "Bills/Landscape BOQ rev3 (paving update).xlsx",
    "Documents/Design review notes.pdf",
    "Documents/Tree pit guide - shallow roots.pdf",
    "Documents/Tree pit guide - medium roots.pdf",
    "Documents/Tree pit guide - deep roots.pdf",
    "Documents/Planting procurement spec.pdf",
    "Documents/Green Building Label - required documents.pdf",
    "Quotes/irrigation quote (old format).xls",
    "Quotes/street-furniture-quote.pdf",
    "Quotes/metal-details.zip",
    "Other/Planter mood board.pptx",
])
CJK = re.compile(r"[⺀-鿿豈-﫿＀-￯　-〿가-힯]")


@pytest.fixture(scope="session")
def pkg(tmp_path_factory):
    return write_package(tmp_path_factory.mktemp("package"))


def _rel(pkg) -> list[str]:
    return sorted(str(p.relative_to(pkg.root)) for p in pkg.root.rglob("*") if p.is_file())


def test_the_folder_has_exactly_the_expected_files(pkg):
    assert pkg.root.name == ROOT
    assert _rel(pkg) == EXPECTED_FILES
    assert len(EXPECTED_FILES) == 30


def test_price_list_and_answer_key_sit_next_to_the_package(pkg):
    assert pkg.price_list_path == pkg.root.parent / PRICE_LIST
    assert pkg.answer_key_path == pkg.root.parent / ANSWER_KEY
    rows = list(csv.DictReader(pkg.price_list_path.open(encoding="utf-8")))
    camphor = next(r for r in rows if r["item"].startswith("Camphor"))
    assert (camphor["low_ntd"], camphor["high_ntd"]) == ("6200", "7200") and "P006" in camphor["source"]
    assert all(r["source"] and r["basis"] in ("published_budget", "sample") for r in rows)
    assert json.loads(pkg.answer_key_path.read_text()) == json.loads(json.dumps(pkg.key))


def test_answer_key_counts_eight_trees_in_both_revisions(pkg):
    key = pkg.key
    assert key["counted_trees"] == {"L-1": 8, "L-1 Rev B": 8}
    assert key["totals"]["tree"] == {"CAMPHOR": 8}
    assert key["totals_by_revision"]["B"]["tree"] == {"CAMPHOR": 8}
    assert key["totals"]["hedge"] == {"DURANTA": 182}
    assert key["totals"]["paving"] == {"PERMEABLE PAVERS": 212.0, "EXPOSED AGGREGATE": 48.0, "GRASS PAVERS": 36.0}
    moved = [o for o in key["objects"] if o["sheet"] == "L-1 Rev B" and "moved" in o["note"]]
    assert [o["centre"] for o in moved] == [[25.0, 4.5]]


def test_odd_objects_are_drawn_listed_and_excluded_with_reasons(pkg):
    odd = {o["kind"]: o for o in pkg.key["odd_objects"]}
    assert set(odd) == {"existing_tree", "tree_outside_boundary", "tree_in_fire_lane", "paving_overlaps_lawn",
                        "label_hatch_mismatch"}
    for kind in ("existing_tree", "tree_outside_boundary", "tree_in_fire_lane"):
        assert odd[kind]["counted"] is False and len(odd[kind]["reason"]) > 30
    assert "§299" in odd["tree_in_fire_lane"]["reason"] and "DBH 95 cm" in odd["existing_tree"]["reason"]
    assert odd["paving_overlaps_lawn"]["overlap_m2"] == 20.0
    by_id = {o["id"]: o for o in pkg.key["objects"]}
    for oid in odd["tree_outside_boundary"]["object_ids"] + odd["tree_in_fire_lane"]["object_ids"][:1]:
        assert by_id[oid]["quote_count"] == 0 and by_id[oid]["excluded"]


def test_thirty_errors_each_point_at_files_and_objects(pkg):
    errors = pkg.key["errors"]
    assert [e["id"] for e in errors] == [f"E{i:02d}" for i in range(1, 31)]
    ids = {o["id"] for o in pkg.key["objects"]}
    files = set(EXPECTED_FILES)
    for e in errors:
        assert e["files"] and set(e["files"]) <= files, e["id"]
        assert set(e["object_ids"]) <= ids, e["id"]
        assert e["expected_verdict"] and e["category"]
        assert all(c["cell"] for c in e["cells"] if c["sheet"] == "BOQ"), e["id"]
    assert sum(e["planted"] for e in errors) == 29  # E24 is robustness, not an error
    e = {x["id"]: x for x in errors}
    assert "4,200" in e["E19"]["expected_verdict"] and "3,800" in e["E20"]["expected_verdict"]
    assert "2.25 m²" in e["E12"]["expected_verdict"]


def test_every_file_has_a_verdict(pkg):
    verdicts = {f["path"]: f for f in pkg.key["files"]}
    assert sorted(verdicts) == EXPECTED_FILES
    assert verdicts["Drawings/CAD/L-1 Planting Plan.bak"]["verdict"] == "backup"
    assert verdicts["Quotes/irrigation quote (old format).xls"]["verdict"] == "unsupported"
    assert verdicts["Drawings/PDF/L-1 Planting Plan (scan).pdf"]["verdict"] == "drawing · raster"
    assert verdicts["Quotes/metal-details.zip"]["contains"][0]["path"] == "drain-cover-detail.dxf"
    for p in ("Documents/Green Building Label - required documents.pdf", "Documents/Planting procurement spec.pdf"):
        assert verdicts[p]["verdict"] in ("spec", "document")


def test_every_dxf_loads(pkg):
    cad = pkg.root / "Drawings/CAD"
    for p in sorted(cad.glob("*.dxf")) + [cad / "L-1 Planting Plan.bak"]:
        m = load(p)
        assert m.entities and m.texts, p.name
    assert (cad / "L-1 Planting Plan.bak").read_bytes() == (cad / "L-1 Planting Plan.dxf").read_bytes()


def test_sheets_say_what_the_key_says(pkg):
    cad = pkg.root / "Drawings/CAD"
    l5 = [t.content for t in load(cad / "L-5 Enlarged Plan - West.dxf").texts]
    assert "MATCH LINE — SEE L-1" in l5 and "SCALE 1:100" in l5 and "1:200" in l5
    l6 = [t.content for t in load(cad / "L-6 Tree Pit Detail.dxf").texts]
    assert "TREE PIT 1500 × 1500 · SOIL DEPTH 1000 · ON SLAB" in l6
    l0 = [t.content for t in load(cad / "L-0 Cover and Index.dxf").texts]
    assert "L-9" in l0 and "Sections" in l0
    l1b = [t.content for t in load(cad / "L-1 Planting Plan (Rev B).dxf").texts]
    assert "2026-10-14" in l1b and "TREE MOVED 2 M" in l1b
    l1 = [t.content for t in load(cad / "L-1 Planting Plan.dxf").texts]
    assert "PLANT QUANTITIES ON PLAN TAKE PRECEDENCE OVER THE SCHEDULE." in " ".join(l1)
    assert "CC typ." in l1 and "EX-01" in l1


def test_full_set_pdf_has_nine_vector_pages(pkg):
    doc = pymupdf.open(pkg.root / "Drawings/PDF/Landscape Drawings (Full Set).pdf")
    assert len(doc) == 9
    assert all(page.get_drawings() and not page.get_images() for page in doc)
    assert "Cover and Index" in doc[0].get_text() and "Lighting Plan" in doc[8].get_text()


def test_scan_and_presentation_are_image_only(pkg):
    for name in ("L-1 Planting Plan (scan).pdf", "Presentation Plan (Colour).pdf"):
        doc = pymupdf.open(pkg.root / "Drawings/PDF" / name)
        assert len(doc) == 1 and len(doc[0].get_images()) == 1 and not doc[0].get_text().strip()


def test_text_documents_say_what_they_must(pkg):
    text = pymupdf.open(pkg.root / "Documents/Green Building Label - required documents.pdf")[0].get_text()
    assert "Greening quantity report (TCO2 calculation)" in text
    review = pymupdf.open(pkg.root / "Documents/Design review notes.pdf")[0].get_text()
    assert "2026-09-10" in review and "Fire-truck access lane" in review


def test_bills(pkg):
    boq = {p.name: p for p in (pkg.root / "Bills").glob("*.xlsx")}
    assert len(boq) == 4
    for p in boq.values():
        wb = openpyxl.load_workbook(p)
        merged = {str(r) for r in wb["BOQ"].merged_cells.ranges}
        assert {"A3:A4", "B3:B4", "C3:C4", "D3:E3", "F3:G3"} <= merged, p.name
        values = openpyxl.load_workbook(p, data_only=True)["BOQ"]
        assert all(c.value is not None for row in values.iter_rows(min_row=6, max_row=19, min_col=7, max_col=7)
                   for c in row if values.cell(c.row, 5).value is not None)  # cached formula results are stored
        assert not any(c.value == 5000 for row in values.iter_rows() for c in row)
    fm = openpyxl.load_workbook(boq["Landscape BOQ rev2.xlsx"])
    assert fm["old"].sheet_state == "hidden" and fm["BOQ"].sheet_state == "visible"
    cells = pkg.key["bills"]["rev2"]["cells"]
    ws = fm["BOQ"]
    assert ws[cells["camphor.description"]].value == "Camphore tree, cal. 10 cm"
    assert ws[cells["camphor.price"]].value == 4200 and ws[cells["pv1.price"]].value == 3800
    assert ws[cells["duranta.unit"]].value == "m" and ws[cells["duranta.qty"]].value == 27
    assert ws[cells["subtotal"]].value == "=SUM(G6:G17)" and ws[cells["irrigation.amount"]].row == 19
    rev3 = openpyxl.load_workbook(boq["Landscape BOQ rev3 (paving update).xlsx"])["BOQ"]
    assert rev3[pkg.key["bills"]["rev3"]["cells"]["pv1.qty"]].value == 236
    assert rev3["A2"].value.startswith("Bill of Quantities · Rev 3 · 2026-10-14")


def test_irrigation_quote_is_excel_97(pkg):
    p = pkg.root / "Quotes/irrigation quote (old format).xls"
    assert p.read_bytes()[:8] == bytes.fromhex("D0CF11E0A1B11AE1")  # OLE2 compound file
    xlrd = pytest.importorskip("xlrd")
    sheet = xlrd.open_workbook(p).sheet_by_index(0)
    assert sheet.cell_value(0, 0) == "IRRIGATION QUOTATION"


def test_zip_holds_one_dxf(pkg):
    with zipfile.ZipFile(pkg.root / "Quotes/metal-details.zip") as z:
        assert z.namelist() == ["drain-cover-detail.dxf"]
        data = z.read("drain-cover-detail.dxf")
    import ezdxf

    doc = ezdxf.read(io.StringIO(data.decode("utf-8")))
    assert any("DRAIN COVER" in e.dxf.text.upper() for e in doc.modelspace().query("TEXT"))


def test_no_chinese_character_anywhere(pkg):
    found = []
    for p in [*pkg.root.rglob("*"), pkg.price_list_path, pkg.answer_key_path]:
        if not p.is_file():
            continue
        if CJK.search(str(p)):
            found.append((p.name, "name"))
        suffix = p.suffix.lower()
        if suffix in (".dxf", ".bak", ".csv", ".json"):
            texts = [p.read_bytes().decode("utf-8")]
        elif suffix in (".xlsx", ".pptx", ".zip"):
            with zipfile.ZipFile(p) as z:
                texts = [z.read(n).decode("utf-8", "replace") for n in z.namelist()]
        elif suffix == ".pdf":
            doc = pymupdf.open(p)
            texts = [page.get_text() for page in doc] + [str(doc.metadata)]
        elif suffix == ".xls":
            xlrd = pytest.importorskip("xlrd")
            s = xlrd.open_workbook(p).sheet_by_index(0)
            texts = [str(s.cell_value(r, c)) for r in range(s.nrows) for c in range(s.ncols)]
        else:
            continue
        found += [(p.name, CJK.search(t).group()) for t in texts if CJK.search(t)]
    assert found == []


def test_answer_key_is_deterministic(pkg):
    cells = {k: v["cells"] for k, v in pkg.key["bills"].items() if isinstance(v, dict)}
    again = package_key(package_sheets(seed=0), seed=0, bill_cells=cells)
    assert json.dumps(again, sort_keys=True) == json.dumps(pkg.key, sort_keys=True)


def test_english_site_from_generate(tmp_path):
    key = generate(tmp_path, options=SiteOptions(lang="en"))
    assert key["site"]["name"].startswith("Greenfield Residences")
    assert key["totals"]["tree"] == {"CAMPHOR": 8} and key["totals"]["lawn"] == {"LAWN": 200.0}
    assert "odd_objects" in key and key["odd_objects"] == []
    texts = [t.content for t in load(key["paths"]["L-1"]).texts]
    assert not any(CJK.search(t) for t in texts) and "CC typ." in texts
    odd = generate(tmp_path / "odd", options=PACKAGE_OPTIONS)
    assert odd["totals"] == key["totals"] and len(odd["odd_objects"]) == 5
    with pytest.raises(ValueError):
        SiteOptions(tree_in_fire_lane=True)  # the odd objects are English only
