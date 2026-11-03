"""A held-out package (gate run 2): a second site with its own layout and a seeded subset of the planted errors,
generated once and reviewed once live, never used to develop the checks.

`landsight package <dir> --seed 7 --layout b` writes

    out_dir/
      Riverside Court — Landscape Package/   L-0 cover, L-1 planting, L-3 paving, L-6 tree pit, a scan, the bill
      firm price list.csv                    the firm's list (the same as the sample's)
      answer_key.json                        the planted subset (H01 ...), each with its scenario

Layout b (46 × 32 m, 1,472 m², 45% coverage): six camphors at 5 m along the south frontage from x 14, a double Duranta
hedge on the west boundary, an Azalea bed (120 m²) east and a lawn (168 m²) west, paving PV-1 120 / PV-2 60 / PV-3
40 m², a 16 m planter. The error pool is the sample's catalogue that this layout can carry; `random.Random(seed)`
picks ten, plus the one every one-species site carries (§302 short, α 0.8). The generator reuses landsight.synth.site
with its layout constants swapped for the duration of the call (`_layout`), so the drawing conventions are the
sample's while every position, count and area is new."""

from __future__ import annotations

import contextlib
import json
import random
import shutil
from dataclasses import dataclass
from pathlib import Path

from landsight.synth import bills as B
from landsight.synth import documents as D
from landsight.synth import sheets as SH
from landsight.synth import site as S

ROOT = "Riverside Court — Landscape Package"
PRICE_LIST, ANSWER_KEY = "firm price list.csv", "answer_key.json"
POOL = ["open_outline", "schedule_mismatch", "outside_boundary", "fire_lane", "existing_tree", "label_hatch",
        "pit_downgrade", "azalea_density", "hedge_unit", "price_under", "subtotal_skip", "hidden_sheet", "raster_scan",
        "excel97", "backup", "index_missing"]
PICK = 10
CAD, PDF, BILL = "Drawings/CAD", "Drawings/PDF", "Bill"
FILES = {"L-0": f"{CAD}/L-0 Cover and Index.dxf", "L-1": f"{CAD}/L-1 Planting Plan.dxf",
         "L-3": f"{CAD}/L-3 Paving Plan.dxf", "L-6": f"{CAD}/L-6 Tree Pit Detail.dxf"}
SCAN, BAK, XLS = f"{PDF}/L-1 Planting Plan (scan).pdf", f"{CAD}/L-1 Planting Plan.bak", "Quotes/irrigation-quote.xls"
BOQ = f"{BILL}/BOQ - Riverside Court - Landscape.xlsx"

LAYOUT_B = {
    S: {"SITE_W": 46.0, "SITE_H": 32.0, "TREE_N": 6, "TREE_SPACING": 5.0, "TREE_X0": 14.0, "TREE_Y": 3.0,
        "HEDGE_X": (1.0, 1.4), "HEDGE_Y": (5.0, 25.0), "SHRUB_BOX": (26.0, 12.0, 38.0, 22.0),
        "LAWN_BOX": (6.0, 9.0, 18.0, 23.0),
        "PAVING": {"透水磚": ((20.0, 6.0, 44.0, 11.0), "BRICK"), "洗石子": ((40.0, 13.0, 44.0, 28.0), "AR-SAND"),
                   "植草磚": ((28.0, 24.0, 38.0, 28.0), "AR-B816")},
        "PLANTER_BOX": (2.0, 27.0, 7.0, 30.0), "EXISTING_TREE": (12.0, 27.0, 2.4), "ROAD_TREE": (40.0, -2.6),
        "FIRE_LANE_BOX": (44.0, 12.0, 46.0, 31.0), "LANE_TREE": (45.0, 20.0),
        "CALLOUTS_EN": {"透水磚": (14.5, 8.0, (20.5, 8.5)), "洗石子": (40.5, 29.5, (42.0, 27.0)),
                        "植草磚": (24.0, 29.5, (30.0, 27.0))},
        "PROJECT_EN_NAME": "Riverside Court", "PROJECT_EN_WORKS": "Landscape over basement slab",
        "PROJECT_EN": "Riverside Court — landscape over basement slab",
        "SITE_AREA_TEXT": "1,472 m²", "COVERAGE_TEXT": "45%"},
    B: {"PROJECT_EN_NAME": "Riverside Court"},
}
INDEX_B = [("L-1", "Planting Plan", "1:200"), ("L-3", "Paving Plan", "1:200"), ("L-5", "Planting Details", "1:50"),
           ("L-6", "Tree Pit Detail", "1:20")]


@contextlib.contextmanager
def _layout(gaps: tuple, pit_m: float):
    """Swap the site module's layout constants (and the L-6 pit) for layout b; restore them afterwards."""
    saved = []
    try:
        for mod, values in LAYOUT_B.items():
            for k, v in values.items():
                saved.append((mod, k, getattr(mod, k)))
                setattr(mod, k, v)
        for mod, k, v in ((S, "GAPS_CM", gaps), (SH, "PIT_M", pit_m),
                          (SH, "PIT_LABEL", f"TREE PIT {pit_m * 1000:.0f} × {pit_m * 1000:.0f} · SOIL DEPTH 1000 · ON SLAB")):
            saved.append((mod, k, getattr(mod, k)))
            setattr(mod, k, v)
        saved.append((S.TEXT["en"], "hedge_label_x", S.TEXT["en"]["hedge_label_x"]))
        S.TEXT["en"]["hedge_label_x"] = 3.0
        yield
    finally:
        for mod, k, v in reversed(saved):
            if isinstance(mod, dict):
                mod[k] = v
            else:
                setattr(mod, k, v)


def pick(seed: int) -> list[str]:
    return sorted(random.Random(seed).sample(POOL, PICK))


def _cover(planted: set) -> S._Sheet:
    sh = S._Sheet("L-0", "Cover and Index", "NTS", "en", S.REV_A)
    sh.rect(-3, -9, 77, 33, layer="FRAME")
    S._title_block(sh, 54, -7.5, "L-0")
    sh.text("RIVERSIDE COURT", 2.0, 27.5, 2.4)
    sh.text("LANDSCAPE PACKAGE", 2.0, 24.6, 1.4)
    sh.text("Landscape over basement slab", 2.0, 22.8, 0.8)
    index = INDEX_B if "index_missing" in planted else [r for r in INDEX_B if r[0] != "L-5"]
    rows = [["DRAWING INDEX"], ["SHEET NO.", "TITLE", "SCALE", "REV"]] + [[n, t, sc, "A"] for n, t, sc in index]
    box = S._table(sh, 2.0, 19.0, [4.5, 14.0, 4.0, 2.5], rows, 1.0, h=0.5)
    sh.add("sheet_index", "DRAWING INDEX", ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), 0)
    for i, (no, title, _) in enumerate(index):
        sh.add("index_entry", f"{no} {title}", (4.0, 19.0 - 1.0 * (i + 2.5)), 0,
               note="listed, not in the package" if no == "L-5" else "listed, in the package")
    sh.text("GENERAL", 30.0, 18.0, 0.6)
    sh.text("1. PLANT QUANTITIES ON PLAN TAKE PRECEDENCE OVER THE SCHEDULE.", 30.0, 16.8, 0.45)
    return sh


def _bill(planted: set, trees: int, hedge: int, shrub_m2: float, lawn_m2: float, pav: dict, planter_m: float,
          pit_m: float) -> B.Bill:
    sched_trees = 12 if "schedule_mismatch" in planted else trees
    hedge_row = (B.Row("duranta", "Duranta hedge", "Duranta erecta, H0.6 m, double row", "m", 20, 950)
                 if "hedge_unit" in planted else
                 B.Row("duranta", "Duranta", "Duranta erecta, H0.6 m, @0.3 m o.c., double row", "EA", hedge, 145))
    sections = [
        B.Section("A", "PLANTING", [
            B.Row("camphor", "Camphor tree, cal. 10 cm", "Cinnamomum camphora, H3.5 m, W1.5 m, root-balled", "EA",
                  sched_trees, 4000 if "price_under" in planted else 6500),
            hedge_row,
            B.Row("azalea", "Azalea", "Rhododendron spp., 4-5 in. pot, 4 plants/m²", "EA",
                  shrub_m2 * (3 if "azalea_density" in planted else 4), 155),
            B.Row("lawn", "Lawn", "Zoysia matrella, sod", "m²", lawn_m2, 280),
        ]),
        B.Section("B", "PAVING", [
            B.Row("pv1", "Permeable pavers (PV-1)", "concrete, 200 x 100 x 80 mm, on 30 mm sand", "m²", pav["PV-1"], 1800),
            B.Row("pv2", "Exposed aggregate (PV-2)", "100 mm, 6-10 mm aggregate", "m²", pav["PV-2"], 2000),
            B.Row("pv3", "Grass pavers (PV-3)", "concrete grid 400 x 400 x 80 mm, soil and sod", "m²", pav["PV-3"], 1250),
            B.Row("planter", "Planter edge", "precast concrete kerb, 150 mm", "m", planter_m, 1800),
        ]),
        B.Section("C", "TREE PITS AND SOIL", [
            B.Row("pit", "Tree pit on slab", f"{pit_m:g} x {pit_m:g} m, drainage layer 100 mm, filter fabric", "EA",
                  sched_trees, 6500),
            B.Row("soil", "Planting soil", "imported, 1.0 m deep in tree pits", "m³", round(sched_trees * pit_m * pit_m, 1),
                  750),
        ]),
        B.Section("D", "IRRIGATION", [B.Row("irrigation", "Irrigation system", "drip and bubblers", "LS", 1, 260000)]),
    ]
    bill = B.Bill("BOQ - Riverside Court - Landscape", "R1", "2026-10-20", sections,
                  subtotal_skips_last="subtotal_skip" in planted)
    if "hidden_sheet" in planted:
        import copy

        old = copy.deepcopy(bill)
        old.row("lawn").qty = round(lawn_m2 * 1.2)
        old.subtotal_skips_last = False
        bill.hidden_old = old
    return bill


@dataclass
class HeldOut:
    out_dir: Path
    root: Path
    answer_key_path: Path
    price_list_path: Path
    key: dict
    files: list[Path]


def write_heldout(out_dir: str | Path, seed: int = 7) -> HeldOut:
    out = Path(out_dir)
    root = out / ROOT
    if root.exists():
        shutil.rmtree(root)
    planted = set(pick(seed))
    gaps = (0, 0, 0, 40, 0, 0) if "open_outline" in planted else (0,) * 6
    pit_m = 1.6 if "pit_downgrade" in planted else 2.0
    m = S.Messiness(gap_cm=40 if "open_outline" in planted else 0, exploded="open_outline" in planted,
                    layer_chaos=False, label_style="typ", schedule_mismatch="schedule_mismatch" in planted,
                    schedule_on_own_sheet=False)
    opts = S.SiteOptions(lang="en", existing_tree_dbh_cm=88 if "existing_tree" in planted else None,
                         tree_outside_boundary="outside_boundary" in planted, tree_in_fire_lane="fire_lane" in planted,
                         paving_label_hatch_mismatch="label_hatch" in planted)
    rng = random.Random(100 + seed)
    with _layout(gaps, pit_m):
        sheets = {"L-0": _cover(planted), "L-1": S._sheet_l1(m, rng, opts), "L-3": S._sheet_l3(m, rng, opts),
                  "L-6": SH.sheet_l6(opts)}
        trees, hedge = S.TREE_N, S.hedge_count()
        shrub_m2, lawn_m2 = S._box_area(S.SHRUB_BOX), S._box_area(S.LAWN_BOX)
        pav = {S.PAVING_CODES[k]: S._box_area(box) for k, (box, _) in S.PAVING.items()}
        x0, y0, x1, y1 = S.PLANTER_BOX
        planter_m = 2 * ((x1 - x0) + (y1 - y0))
        for name, rel in FILES.items():
            (root / rel).parent.mkdir(parents=True, exist_ok=True)
            sheets[name].save(root / Path(rel).parent, Path(rel).name)
        key = S.site_key([sheets[n] for n in ("L-0", "L-1", "L-3", "L-6")], m, opts)
    from landsight.dxf import load

    if "raster_scan" in planted:
        (root / SCAN).parent.mkdir(parents=True, exist_ok=True)
        D.scan_pdf(load(root / FILES["L-1"]), root / SCAN, seed=seed)
    if "backup" in planted:
        shutil.copyfile(root / FILES["L-1"], root / BAK)
    if "excel97" in planted:
        (root / XLS).parent.mkdir(parents=True, exist_ok=True)
        B.write_irrigation_xls(root / XLS)
    bill = _bill(planted, trees, hedge, shrub_m2, lawn_m2, pav, planter_m, pit_m)
    (root / BOQ).parent.mkdir(parents=True, exist_ok=True)
    with _layout(gaps, pit_m):
        B.write_bill(bill, root / BOQ)
    D.scrub_cjk_fonts(root / BOQ)
    price = B.write_price_list(out / PRICE_LIST)
    key["package"] = {"name": ROOT, "seed": seed, "layout": "b", "basis": "synthetic, held out",
                      "planted": sorted(planted) + ["one_species"]}
    key["errors"] = _errors(key, planted, bill, trees)
    key["eval_line"] = f"planted {len(key['errors'])} · found N · flagged M · missed K · false alarms F"
    kp = out / ANSWER_KEY
    kp.write_text(json.dumps(key, ensure_ascii=False, indent=1))
    files = sorted(p for p in root.rglob("*") if p.is_file())
    return HeldOut(out, root, kp, price, key, files)


def _errors(key: dict, planted: set, bill: B.Bill, trees: int) -> list[dict]:
    objs = key["objects"]
    ids = lambda sheet, kind: [o["id"] for o in objs if o["sheet"] == sheet and o["kind"] == kind]  # noqa: E731
    counted = [o["id"] for o in objs if o["sheet"] == "L-1" and o["kind"] == "tree" and o["quote_count"]]
    odd = {o["kind"]: o["object_ids"] for o in key.get("odd_objects", [])}
    cell = lambda name: {"file": BOQ, "sheet": B.SHEET, "cell": bill.cells.get(name)}  # noqa: E731
    E = []  # (pool name, files, category, scenario, verdict, object ids, cells)
    if "open_outline" in planted:
        E.append(("open_outline", [FILES["L-1"]], "geometry", "design", "open outline; Muse Spark: one tree",
                  [counted[3]], []))
    if "schedule_mismatch" in planted:
        E.append(("schedule_mismatch", [FILES["L-1"], BOQ], "schedule", "quote",
                  f"schedule and bill say 12 Camphor, the plan draws {trees}", counted + ids("L-1", "schedule"),
                  [cell("camphor.qty")]))
    if "outside_boundary" in planted:
        E.append(("outside_boundary", [FILES["L-1"]], "geometry", "design", "a tree outside the site boundary",
                  odd.get("tree_outside_boundary", []), []))
    if "fire_lane" in planted:
        E.append(("fire_lane", [FILES["L-1"]], "rules", "regulation", "a tree in the fire-truck lane",
                  odd.get("tree_in_fire_lane", []), []))
    if "existing_tree" in planted:
        E.append(("existing_tree", [FILES["L-1"]], "rules", "regulation", "existing camphor DBH 88 cm to be removed: "
                  "may be protected", odd.get("existing_tree", []), []))
    if "label_hatch" in planted:
        E.append(("label_hatch", [FILES["L-3"]], "geometry", "design", "boxed PV-1, hatched as PV-2",
                  odd.get("label_hatch_mismatch", []), []))
    if "pit_downgrade" in planted:
        E.append(("pit_downgrade", [FILES["L-6"], BOQ], "rules", "regulation",
                  "pit 1.6 × 1.6 m = 2.56 m² on slab: large trees count as small", ids("L-6", "tree_pit"),
                  [cell("pit.description")]))
    if "azalea_density" in planted:
        E.append(("azalea_density", [BOQ], "bill", "quote", "azalea at 3 per m², the schedule says 4",
                  ids("L-1", "shrub_bed"), [cell("azalea.qty")]))
    if "hedge_unit" in planted:
        E.append(("hedge_unit", [BOQ], "bill", "quote", "hedge billed 20 m, drawn in plants", ids("L-1", "hedge"),
                  [cell("duranta.unit"), cell("duranta.qty")]))
    if "price_under" in planted:
        E.append(("price_under", [BOQ], "price", "quote", "camphor NT$4,000 under the firm's list", [],
                  [cell("camphor.price")]))
    if "subtotal_skip" in planted:
        E.append(("subtotal_skip", [BOQ], "bill", "quote", "the subtotal skips the last row", [], [cell("subtotal")]))
    if "hidden_sheet" in planted:
        E.append(("hidden_sheet", [BOQ], "bill", "quote", "hidden sheet 'old'", [],
                  [{"file": BOQ, "sheet": B.HIDDEN_SHEET, "cell": None}]))
    if "raster_scan" in planted:
        E.append(("raster_scan", [SCAN], "ingest", "format", "raster PDF: no vectors, not measured", [], []))
    if "excel97" in planted:
        E.append(("excel97", [XLS], "ingest", "format", "Excel 97: save as .xlsx", [], []))
    if "backup" in planted:
        E.append(("backup", [BAK], "ingest", "format", "AutoCAD backup: ignored", [], []))
    if "index_missing" in planted:
        E.append(("index_missing", [FILES["L-0"]], "ingest", "design", "L-5 Planting Details is on the index, not in "
                  "the package", [i for i in ids("L-0", "index_entry") if any(o["id"] == i and "L-5" in o["label"]
                                                                              for o in objs)], []))
    E.append(("one_species", [FILES["L-1"]], "rules", "regulation", "one tree species: α 0.8, §302 short", counted, []))
    return [{"id": f"H{n:02d}", "kind": k, "files": fs, "category": cat, "scenario": sc, "expected_verdict": v,
             "object_ids": o, "cells": c, "planted": True} for n, (k, fs, cat, sc, v, o, c) in enumerate(E, 1)]
