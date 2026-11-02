"""The tower package (docs/PACKAGE.md, "Package v2 — the tower"): one landscape sheet per floor, and the floors look
alike. `landsight package <dir> --tower` writes

    out_dir/
      Greenfield Residences — Tower Landscape Package/
        Drawings/CAD/L-101 … L-501 (six sheets)      Bills/Tower landscape BOQ.xlsx
      firm price list.csv     the firm's list with the tower's rows (roof lawn, planter shrubs)
      answer_key.json         T01–T08, each with its scenario

A 20-floor tower. The ground floor L-101 is the v1 site drawn tidily (closed canopies, the schedule on the sheet, none
of v1's thirty errors), so the tower's eight are the only ones planted:

T01 L-103 is one typical sky-garden sheet for four floors ("8F, 12F, 16F, 20F"): its quantities × 4.
T02 L-104 roof (RF): lawn on 0.3 m soil (counts: the roof minimum is 0.1 m) and shrub planters on 0.3 m (below 0.4 m).
T03 L-301 sections repeat every floor's planters: not counted.
T04 L-501 says the roof planter has 0.6 m of soil; L-104 says 0.3 m.
T05 L-102 (the 5F podium roof garden) reuses L-101's hedge symbol and label (DU): the same item on two floors, counted on
    each.
T06 the bill prices the sky-garden planters for one floor.
T07 the roof lawn is billed at the ground lawn's price (a roof lawn needs a drainage layer).
T08 L-102 and L-103 share their whole floor plate (outline, core, columns, planters): only the title block tells them
    apart.

Floor plate (L-102, L-103, L-104): a 28 × 18 m tower block at (6, 9)–(34, 27) on the site's coordinates, a 7 × 6 m
core, 14 columns; four 6 × 1.5 m sky-garden planters along the south face."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path

from landsight.synth import bills as B
from landsight.synth import documents as D
from landsight.synth import site as S

ROOT = "Greenfield Residences — Tower Landscape Package"
PRICE_LIST, ANSWER_KEY = "firm price list.csv", "answer_key.json"
CAD = "Drawings/CAD"
TYPICAL = "8F, 12F, 16F, 20F"
FLOORS = [8, 12, 16, 20]
FILES = {"L-101": f"{CAD}/L-101 Ground Floor Landscape Plan.dxf", "L-102": f"{CAD}/L-102 5F Podium Roof Garden.dxf",
         "L-103": f"{CAD}/L-103 Typical Sky Garden ({TYPICAL}).dxf", "L-104": f"{CAD}/L-104 RF Roof Garden.dxf",
         "L-301": f"{CAD}/L-301 Landscape Sections.dxf", "L-501": f"{CAD}/L-501 Planter Details.dxf"}
TITLES = {"L-101": "1F Ground Floor Landscape Plan", "L-102": "5F Podium Roof Garden",
          "L-103": f"Typical Sky Garden Plan, {TYPICAL}", "L-104": "RF Roof Garden", "L-301": "Landscape Sections",
          "L-501": "5F-RF Planter Details"}
BOQ = "Bills/Tower landscape BOQ.xlsx"
PLATE = (6.0, 9.0, 34.0, 27.0)
CORE = (16.0, 14.0, 23.0, 20.0)
COLUMNS = [(x, y) for x in (7.0, 13.5, 20.0, 26.5, 33.0) for y in (10.0, 18.0, 26.0) if (x, y) != (20.0, 18.0)]  # 14
PLANTERS = [(x, 7.0, x + 6.0, 8.5) for x in (6.5, 13.5, 20.5, 27.5)]  # 4 × 9 m² on the south face
PODIUM_HEDGE_X, PODIUM_HEDGE_Y = (40.0, 40.4), (10.0, 25.0)  # 15 m, double row, east of the tower
ROOF_LAWN = (7.5, 11.0, 15.0, 25.0)  # 105 m²
ROOF_PLANTERS = [(25.0, 11.0, 32.0, 13.5), (25.0, 22.0, 32.0, 24.5)]  # 2 × 17.5 m²
SOIL = {"L-102": 1.0, "L-103": 0.6, "L-104": 0.3, "detail_roof": 0.6, "detail_typical": 0.6, "detail_podium": 1.0}
PIT_M, PIT_SOIL = 2.0, 1.2
CLEAN = S.Messiness(gap_cm=0, exploded=False, layer_chaos=False, label_style="typ", schedule_mismatch=False,
                    schedule_on_own_sheet=False)
PRICES = {"camphor": 6500, "duranta": 145, "azalea": 155, "lawn": 280, "podium": 620, "typical": 620,
          "roof_lawn": 280, "roof_shrub": 650, "pit": 6500, "soil": 750}


def _plate(sh: S._Sheet, columns: bool = True, planters: bool = True) -> None:
    sh.poly(S._box_pts(PLATE), layer="ARCH", close=True)
    sh.poly(S._box_pts(CORE), layer="ARCH", close=True)
    sh.text("CORE", CORE[0] + 2.0, CORE[1] + 2.7, 0.6)
    if columns:
        for x, y in COLUMNS:
            sh.poly(S._box_pts((x - 0.4, y - 0.4, x + 0.4, y + 0.4)), layer="ARCH", close=True)
    if planters:
        for b in PLANTERS:
            sh.poly(S._box_pts(b), layer="PLANT", close=True)


def _frame(sh: S._Sheet, number: str) -> None:
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    S._title_block(sh, 54, -7.5, number)
    S._scale_bar_and_north(sh, 0.0, -5.0, 44.0)


def _hatched(sh: S._Sheet, box, pattern: str, label: str, kind: str, note: str = "") -> None:
    pts = S._box_pts(box)
    sh.poly(pts, layer="PLANT", close=True)
    sh.hatch(pts, pattern, layer="HATCH")
    sh.add(kind, label, S._box_centre(box), S._box_area(box), "m²", area_m2=S._box_area(box), footprint=S._fp(pts),
           note=note)


def sheet_l101(rng) -> S._Sheet:
    opts = S.SiteOptions(lang="en")
    return S._sheet_l1(CLEAN, rng, opts, name="L-101")


PATTERNS = {"RI": "ANSI35", "IC": "ANSI36", "MP": "ANSI37", "RL": "HONEY"}


def sheet_l102() -> S._Sheet:
    sh = S._Sheet("L-102", TITLES["L-102"], "1:200", "en", S.REV_A)
    sh.layer("ARCH")
    _frame(sh, "L-102")
    _plate(sh)
    for b in PLANTERS:
        _hatched(sh, b, PATTERNS["RI"], "Yeddo hawthorn", "shrub_bed", "podium planter")
    sh.leader("RI typ.", 7.0, 4.6, (7.5, 7.3))
    S._legend(sh, 54, 21.5, 73, 31.5, [("swatch", "RI YEDDO HAWTHORN", PATTERNS["RI"]), ("hedge", "DU DURANTA", None)])
    for x in PODIUM_HEDGE_X:  # T05: the ground floor's hedge symbol and label, on the podium roof
        sh.line((x, PODIUM_HEDGE_Y[0]), (x, PODIUM_HEDGE_Y[1]), layer="PLANT")
    sh.leader(S.TEXT["en"]["hedge_label"], 36.0, 28.0, (PODIUM_HEDGE_X[1], PODIUM_HEDGE_Y[1]))
    n = 2 * (int(round((PODIUM_HEDGE_Y[1] - PODIUM_HEDGE_Y[0]) / S.HEDGE_SPACING, 6)) + 1)
    sh.add("hedge", "Duranta", (sum(PODIUM_HEDGE_X) / 2, sum(PODIUM_HEDGE_Y) / 2), n, "EA",
           length_m=2 * (PODIUM_HEDGE_Y[1] - PODIUM_HEDGE_Y[0]), note="L-101's symbol and label on 5F")
    sh.text(f"PODIUM PLANTER SOIL {SOIL['L-102']:.1f} M ON SLAB", 7.0, 1.0, 0.5)
    sh.text("5F PODIUM ROOF GARDEN — ARTIFICIAL GROUND", 7.0, 29.5, 0.7)
    return sh


def sheet_l103() -> S._Sheet:
    sh = S._Sheet("L-103", TITLES["L-103"], "1:200", "en", S.REV_A)
    sh.layer("ARCH")
    _frame(sh, "L-103")
    _plate(sh)
    for b in PLANTERS:
        _hatched(sh, b, PATTERNS["IC"], "Chinese ixora", "shrub_bed", f"sky-garden planter, typical for {TYPICAL}")
    sh.leader("IC typ.", 7.0, 4.6, (7.5, 7.3))
    S._legend(sh, 54, 25.5, 73, 31.5, [("swatch", "IC CHINESE IXORA", PATTERNS["IC"])])
    sh.text(f"SKY-GARDEN PLANTER SOIL {SOIL['L-103']:.1f} M", 7.0, 1.0, 0.5)
    sh.text(f"TYPICAL SKY GARDEN — {TYPICAL}", 7.0, 29.5, 0.7)
    return sh


def sheet_l104() -> S._Sheet:
    sh = S._Sheet("L-104", TITLES["L-104"], "1:200", "en", S.REV_A)
    sh.layer("ARCH")
    _frame(sh, "L-104")
    _plate(sh, columns=False, planters=False)
    _hatched(sh, ROOF_LAWN, PATTERNS["RL"], "Roof lawn", "lawn", "on 0.3 m soil")
    sh.text("RL ROOF LAWN", 8.0, 17.7, 0.6)
    for b in ROOF_PLANTERS:
        _hatched(sh, b, PATTERNS["MP"], "Orange jasmine", "shrub_bed", "roof planter on 0.3 m soil")
    sh.leader("MP typ.", 36.0, 17.0, (32.0, 23.0))
    S._legend(sh, 54, 23.3, 73, 31.5, [("swatch", "RL ROOF LAWN", PATTERNS["RL"]),
                                       ("swatch", "MP ORANGE JASMINE", PATTERNS["MP"])])
    sh.text(f"ROOF LAWN ON {SOIL['L-104']:.1f} M SOIL, DRAINAGE BOARD AND FILTER FABRIC", 7.0, 1.6, 0.5)
    sh.text(f"ROOF PLANTERS: SOIL {SOIL['L-104']:.1f} M", 7.0, 0.8, 0.5)
    sh.text("RF ROOF GARDEN — ARTIFICIAL GROUND", 7.0, 29.5, 0.7)
    return sh


def sheet_l301() -> S._Sheet:
    """Section A-A through the tower: a slab line per landscaped floor, a planter on each, the floor named at the left."""
    sh = S._Sheet("L-301", TITLES["L-301"], "1:200", "en", S.REV_A)
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    S._title_block(sh, 54, -7.5, "L-301")
    levels = [("1F", 0.0), ("5F", 3.0), *[(f"{f}F", 3.0 + 2.0 * (i + 1)) for i, f in enumerate(FLOORS)], ("RF", 13.5)]
    for name, y in levels:
        sh.line((6.0, y), (46.0, y), layer="0")
        sh.text(name, 2.0, y + 0.1, 0.45)
        if name != "1F":
            sh.poly(S._box_pts((38.0, y, 42.0, y + 0.6)), layer="PLANT", close=True)
            sh.msp.add_ellipse((40.0, y + 1.0), major_axis=(1.1, 0), ratio=0.45, dxfattribs={"layer": "PLANT"})
    sh.text("SECTION A-A THROUGH THE PODIUM ROOF, THE SKY GARDENS AND THE ROOF", 6.0, 16.5, 0.6)
    sh.text("PLANTERS SHOWN ON EVERY FLOOR FOR REFERENCE ONLY", 6.0, 15.6, 0.5)
    return sh


def sheet_l501() -> S._Sheet:
    """Planter sections per floor and the ground floor's tree pit, at 1:20 (furniture at 1/10)."""
    sh = S._Sheet("L-501", TITLES["L-501"], "1:20", "en", S.REV_A)
    k, h = 0.1, 0.07
    sh.rect(-0.3, -0.9, 7.7, 3.3, layer="FRAME")
    details = [("PODIUM PLANTER (5F)", SOIL["detail_podium"]), (f"SKY-GARDEN PLANTER ({TYPICAL})", SOIL["detail_typical"]),
               ("ROOF PLANTER (RF)", SOIL["detail_roof"])]
    for i, (name, soil) in enumerate(details):
        x0 = 0.2 + 1.45 * i
        sh.poly(S._box_pts((x0, 0.0, x0 + 1.2, 0.1)), layer="PLANT", close=True)  # drainage
        pts = S._box_pts((x0, 0.1, x0 + 1.2, 0.1 + soil))
        sh.poly(pts, layer="PLANT", close=True)
        sh.hatch(pts, "EARTH", layer="HATCH", scale=0.005)
        sh.text(name, x0, 1.55, h)
        sh.text(f"SOIL {soil * 1000:.0f} MM ({soil:.1f} M)", x0, 1.42, h)
        sh.text("DRAINAGE BOARD 100 MM", x0, 1.29, h)
    px, py = 4.6, 1.0
    sh.poly(S._box_pts((px, py, px + PIT_M / 2, py + PIT_M / 2)), layer="PLANT", close=True)
    sh.text(f"TREE PIT {PIT_M * 1000:.0f} × {PIT_M * 1000:.0f} (1F, CC CAMPHOR)", px, 2.45, h)
    sh.text(f"SOIL DEPTH {PIT_SOIL:.1f} M ON SLAB", px, 2.32, h)
    sh.text(f"PIT AREA {PIT_M * PIT_M:g} m²", px, 2.19, h)
    sh.add("tree_pit", "TREE PIT", (px + PIT_M / 4, py + PIT_M / 4), 0, "EA", area_m2=PIT_M * PIT_M,
           note=f"pit {PIT_M} x {PIT_M} m, soil {PIT_SOIL} m on slab (drawn at half size)")
    sh.text("PLANTER SECTIONS 1:20 · TREE PIT PLAN 1:40", 0.2, 2.6, 0.09)
    S._title_block(sh, 5.4, -0.75, "L-501", k=k)
    return sh


@dataclass
class Tower:
    out_dir: Path
    root: Path
    answer_key_path: Path
    price_list_path: Path
    key: dict
    files: list[Path]


def _bill(hedge_total: int) -> B.Bill:
    planter_m2 = sum(S._box_area(b) for b in PLANTERS)
    roof_lawn, roof_shrub = S._box_area(ROOF_LAWN), sum(S._box_area(b) for b in ROOF_PLANTERS)
    sections = [
        B.Section("A", "GROUND FLOOR 1F (L-101)", [
            B.Row("camphor", "Camphor tree, cal. 10 cm", "Cinnamomum camphora, H3.5 m, W1.5 m, root-balled", "EA",
                  S.TREE_N, PRICES["camphor"]),
            B.Row("duranta", "Duranta (1F and 5F)", "Duranta erecta, H0.6 m, @0.3 m o.c., double row", "EA", hedge_total,
                  PRICES["duranta"]),
            B.Row("azalea", "Azalea", "Rhododendron spp., 4-5 in. pot, 4 plants/m²", "EA",
                  4 * S._box_area(S.SHRUB_BOX), PRICES["azalea"]),
            B.Row("lawn", "Lawn", "Zoysia matrella, sod", "m²", S._box_area(S.LAWN_BOX), PRICES["lawn"]),
        ]),
        B.Section("B", "PODIUM ROOF GARDEN 5F (L-102)", [
            B.Row("podium", "Yeddo hawthorn, podium planters", "Rhaphiolepis indica, 1 gal., 4 plants/m²", "m²", planter_m2,
                  PRICES["podium"]),
        ]),
        B.Section("C", "TYPICAL SKY GARDENS (L-103)", [  # T06: one floor, not four
            B.Row("typical", "Sky-garden planter shrubs, typ. floor x 1", "Chinese ixora, 1 gal., 4 plants/m²", "m²", planter_m2,
                  PRICES["typical"]),
        ]),
        B.Section("D", "ROOF RF (L-104)", [
            B.Row("roof_lawn", "Roof lawn", "Zoysia matrella, sod", "m²", roof_lawn, PRICES["roof_lawn"]),  # T07
            B.Row("roof_shrub", "Orange jasmine, roof planters", "Murraya paniculata, 1 gal., 4 plants/m²", "m²",
                  roof_shrub, PRICES["roof_shrub"]),
        ]),
        B.Section("E", "TREE PITS AND SOIL", [
            B.Row("pit", "Tree pit on slab", f"{PIT_M:g} x {PIT_M:g} m, drainage layer 100 mm", "EA", S.TREE_N,
                  PRICES["pit"]),
            B.Row("soil", "Planting soil", f"imported, {PIT_SOIL:g} m deep in tree pits", "m³",
                  round(S.TREE_N * PIT_M * PIT_M * PIT_SOIL, 1), PRICES["soil"]),
        ]),
    ]
    return B.Bill("Tower landscape BOQ", "T1", "2026-10-20", sections)


def write_tower(out_dir: str | Path, seed: int = 0) -> Tower:
    import random

    from landsight.store.db import PRICE_SEED

    out = Path(out_dir)
    root = out / ROOT
    if root.exists():
        shutil.rmtree(root)
    rng = random.Random(7 + seed)
    titles = dict(S.TEXT["en"]["titles"])
    S.TEXT["en"]["titles"]["L-1"] = TITLES["L-101"]
    try:
        l101 = sheet_l101(rng)
    finally:
        S.TEXT["en"]["titles"].clear()
        S.TEXT["en"]["titles"].update(titles)
    sheets = {"L-101": l101, "L-102": sheet_l102(), "L-103": sheet_l103(), "L-104": sheet_l104(),
              "L-301": sheet_l301(), "L-501": sheet_l501()}
    for name, rel in FILES.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        sheets[name].save(root / Path(rel).parent, Path(rel).name)
    _renumber(root / FILES["L-101"])
    hedge_total = S.hedge_count() + next(o.quote_count for o in sheets["L-102"].objects if o.kind == "hedge")
    bill = _bill(int(hedge_total))
    (root / BOQ).parent.mkdir(parents=True, exist_ok=True)
    B.write_bill(bill, root / BOQ)
    D.scrub_cjk_fonts(root / BOQ)
    price = out / PRICE_LIST
    import csv

    with price.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["item", "spec", "unit", "low_ntd", "high_ntd", "basis", "source"])
        for _, name, spec, unit, lo, hi, basis, src in PRICE_SEED:
            w.writerow([name, spec, unit, lo, hi, basis, src])
    objects = [S.obj_dict(o) for sh in sheets.values() for o in sh.objects]
    key = {"site": {"name": S.PROJECT_EN + " — tower", "sheets": {n: {"file": FILES[n], "title": TITLES[n]}
                                                                for n in FILES}},
           "floors": {"L-101": [1], "L-102": [5], "L-103": FLOORS, "L-104": ["R"]},
           "objects": objects, "package": {"name": ROOT, "seed": seed, "basis": "synthetic", "kind": "tower"},
           "bills": {"T1": {"file": BOQ, "cells": bill.cells}}}
    key["errors"] = _errors(bill, objects)
    key["eval_line"] = "planted 8 · found N · flagged M · missed K · false alarms F"
    kp = out / ANSWER_KEY
    kp.write_text(json.dumps(key, ensure_ascii=False, indent=1))
    return Tower(out, root, kp, price, key, sorted(p for p in root.rglob("*") if p.is_file()))


def _renumber(path: Path) -> None:
    """L-101 is drawn by the v1 generator, whose title block says L-1: give it its own drawing number."""
    import ezdxf

    doc = ezdxf.readfile(path)
    for e in doc.modelspace().query("TEXT"):
        if e.dxf.text == "L-1":
            e.dxf.text = "L-101"
        elif "SEE DETAIL L-6" in e.dxf.text:
            e.dxf.text = e.dxf.text.replace("SEE DETAIL L-6", "SEE DETAIL L-501")
    doc.saveas(path)


def _errors(bill: B.Bill, objects: list[dict]) -> list[dict]:
    cell = lambda name: {"file": BOQ, "sheet": B.SHEET, "cell": bill.cells.get(name)}  # noqa: E731
    hedges = [o["id"] for o in objects if o["kind"] == "hedge" and o["sheet"] in ("L-101", "L-102")]
    beds = lambda *sheets: [o["id"] for o in objects if o["kind"] == "shrub_bed" and o["sheet"] in sheets]  # noqa: E731
    # Object ids keep a check about other drawing objects on the same sheet (a legend note) from standing in for these
    rows = [
        ("T01", [FILES["L-103"]], "floors", "regulation", f"one sheet for four floors ({TYPICAL}): quantities × 4",
         beds("L-103"), []),
        ("T02", [FILES["L-104"]], "rules", "regulation", "roof planters on 0.3 m soil, below the 0.4 m shrub minimum; the "
         "roof lawn on 0.3 m counts", [], []),
        ("T03", [FILES["L-301"]], "sheet", "design", "sections — not counted", [], []),
        # T04 names the plan (L-104) only: the detail sheet's own "not counted" note must not stand in for the catch
        ("T04", [FILES["L-104"]], "sheet", "design", "detail L-501 says 0.6 m roof soil, plan L-104 says 0.3 m",
         beds("L-104"), []),
        ("T05", [FILES["L-101"], FILES["L-102"]], "floors", "design", "the same hedge symbol and label on 1F and 5F: "
         "counted on both, never merged", hedges, []),
        ("T06", [BOQ, FILES["L-103"]], "bill", "quote", "bill prices one sky-garden floor; the drawing stands for four",
         beds("L-103"), [cell("typical.qty")]),
        ("T07", [BOQ], "price", "quote", "roof lawn billed at the ground lawn's rate", [], [cell("roof_lawn.price")]),
        ("T08", [FILES["L-102"], FILES["L-103"]], "floors", "design", "L-102 and L-103 share their floor plate: only the "
         "title block's floor tells them apart", beds("L-102", "L-103"), []),
    ]
    return [{"id": i, "files": fs, "category": cat, "scenario": sc, "expected_verdict": v, "object_ids": o, "cells": c,
             "planted": True} for i, fs, cat, sc, v, o, c in rows]
