"""The sample developer's package (docs/PACKAGE.md): thirty files, thirty planted errors, one answer key.

`write_package(out_dir)` writes

    out_dir/
      Greenfield Residences — Landscape Package/   the thirty files (FILES below)
      firm price list.csv                          the reviewing firm's own sample price list (not in the package)
      answer_key.json                              the site key, the thirty errors and every file's triage verdict

Everything is generated and in English; no file in the package contains a Chinese character. Dates follow one 2026
timeline: bills 2026-01-21 (rev1, rev1a) and 2026-02-19 (rev2), quotes 2026-09-09, design review 2026-09-10,
drawings Rev A 2026-09-18, Rev B and the budget file 2026-10-14. The answer key is the same for a given seed; the
DXF files themselves carry ezdxf's creation timestamps.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path

from landsight.dxf import load
from landsight.synth import bills as B
from landsight.synth import documents as D
from landsight.synth import sheets as S
from landsight.synth.site import (PACKAGE_OPTIONS, PROJECT_EN, PROJECT_EN_NAME, REV_A, REV_B, Messiness, SiteOptions,
                                  _sheet_l1, _sheet_l2, _sheet_l3, _sheet_l4, answer_totals, obj_dict, site_key)

ROOT = "Greenfield Residences — Landscape Package"
PRICE_LIST = "firm price list.csv"
ANSWER_KEY = "answer_key.json"
PACKAGE_MESSINESS = Messiness(gap_cm=40, exploded=True, layer_chaos=True, label_style="typ", schedule_mismatch=True,
                              schedule_on_own_sheet=True)

CAD, PDF = "Drawings/CAD", "Drawings/PDF"
SHEET_FILES = {  # sheet name in the answer key -> file in the package
    "L-0": f"{CAD}/L-0 Cover and Index.dxf",
    "L-1": f"{CAD}/L-1 Planting Plan.dxf",
    "L-1 Rev B": f"{CAD}/L-1 Planting Plan (Rev B).dxf",
    "L-2": f"{CAD}/L-2 South Elevation.dxf",
    "L-3": f"{CAD}/L-3 Paving Plan.dxf",
    "L-4": f"{CAD}/L-4 Plant Schedule.dxf",
    "L-5": f"{CAD}/L-5 Enlarged Plan - West.dxf",
    "L-6": f"{CAD}/L-6 Tree Pit Detail.dxf",
    "L-7": f"{CAD}/L-7 Irrigation Plan.dxf",
    "L-8": f"{CAD}/L-8 Lighting Plan.dxf",
}
BAK = f"{CAD}/L-1 Planting Plan.bak"
IMAGES = {f"{CAD}/pasted image #1.png": ("aggregate", "exposed aggregate", "PV-2 EXPOSED AGGREGATE"),
          f"{CAD}/pasted image #2.png": ("pavers", "permeable concrete pavers", "PV-1 PERMEABLE PAVERS")}
FULL_SET = f"{PDF}/Landscape Drawings (Full Set).pdf"
SCAN = f"{PDF}/L-1 Planting Plan (scan).pdf"
PRESENTATION = f"{PDF}/Presentation Plan (Colour).pdf"
REVIEW = f"{PDF}/Design review notes.pdf"
BOQ = {"rev1": "Bills/Landscape BOQ rev1.xlsx", "rev1a": "Bills/Landscape BOQ rev1a.xlsx",
       "rev2": "Bills/Landscape BOQ rev2.xlsx",
       "20261014": "Other/Landscape BOQ rev3 (paving update).xlsx"}
PIT_SPECS = {"shallow-rooted": "Bills/Tree pit guide - shallow roots.pdf",
             "medium": "Bills/Tree pit guide - medium roots.pdf", "deep": "Bills/Tree pit guide - deep roots.pdf"}
PROCUREMENT = "Bills/Planting procurement spec.pdf"
IRRIGATION_XLS = "Quotes/Irrigation/irrigation quote (old format).xls"
FURNITURE_QUOTE = "Quotes/Metal/street-furniture-quote.pdf"
METAL_ZIP = "Quotes/Metal/metal-details.zip"
ZIP_MEMBER = "drain-cover-detail.dxf"
GREEN_BUILDING = "Green Building Label - required documents.pdf"
PPTX = "Planter mood board.pptx"

FILES = [SHEET_FILES["L-0"], SHEET_FILES["L-1"], SHEET_FILES["L-1 Rev B"], BAK, *[SHEET_FILES[f"L-{i}"] for i in range(2, 9)],
         *IMAGES, FULL_SET, SCAN, PRESENTATION, REVIEW, BOQ["rev1"], BOQ["rev1a"], BOQ["rev2"], *PIT_SPECS.values(),
         PROCUREMENT, IRRIGATION_XLS, FURNITURE_QUOTE, METAL_ZIP, BOQ["20261014"], GREEN_BUILDING, PPTX]
assert len(FILES) == len(set(FILES)) == 30

VERDICTS = ("drawing · vector", "drawing · raster", "drawing · image", "bill", "quote", "spec", "document",
            "presentation", "backup", "archive", "unsupported")
CHIPS = {"backup": "backup — ignored", "archive": "archive — unpacked", "unsupported": "unsupported — .xls",
         "drawing · image": "image — read, not measured"}

TREE_PIT_TABLE = [["Standard", "Pit (min.)", "Soil on artificial ground", "Soil on grade", "Drainage layer"],
                  ["Shallow-rooted", "1.5 x 1.5 m (2.25 m²)", "0.7 m", "1.0 m", "100 mm"],
                  ["Medium", "2.0 x 2.0 m (4.0 m²)", "1.0 m", "1.2 m", "100 mm"],
                  ["Deep-rooted", "2.0 x 2.0 m (4.0 m²)", "1.5 m", "1.5 m", "150 mm"]]
PIT_SPECIES = {"shallow-rooted": "small trees and palms, e.g. Lagerstroemia indica, Livistona chinensis",
               "medium": "medium trees, e.g. Koelreuteria elegans subsp. formosana",
               "deep": "large broadleaf trees, e.g. Cinnamomum camphora (camphor), Bischofia javanica"}


@dataclass
class PackageKey:
    out_dir: Path
    root: Path  # the package folder
    answer_key_path: Path
    price_list_path: Path
    key: dict

    @property
    def files(self) -> list[Path]:
        return [self.root / f for f in FILES]


# --------------------------------------------------------------------------------------------- sheets


def package_sheets(opts: SiteOptions = PACKAGE_OPTIONS, m: Messiness = PACKAGE_MESSINESS, seed: int = 0) -> dict:
    """Every DXF sheet of the package (not yet written), keyed by answer-key sheet name, plus the zip's detail."""
    import random

    rng = random.Random(7 + seed)
    sheets = {"L-1": _sheet_l1(m, rng, opts), "L-2": _sheet_l2(m, rng, opts), "L-3": _sheet_l3(m, rng, opts),
              "L-4": _sheet_l4(m, opts), "L-1 Rev B": S.sheet_l1_rev_b(m, opts, seed), "L-0": S.sheet_l0(opts),
              "L-5": S.sheet_l5(opts), "L-6": S.sheet_l6(opts), "L-7": S.sheet_l7(opts), "L-8": S.sheet_l8(opts),
              "D-01": S.drain_cover_detail()}
    return sheets


def package_key(sheets: dict, opts: SiteOptions = PACKAGE_OPTIONS, m: Messiness = PACKAGE_MESSINESS,
                seed: int = 0, bill_cells: dict | None = None) -> dict:
    rev_a = [sheets[n] for n in ("L-0", "L-1", "L-2", "L-3", "L-4", "L-5", "L-6", "L-7", "L-8")]
    key = site_key(rev_a, m, opts)
    rev_b_objects = sheets["L-1 Rev B"].objects
    key["objects"] += [obj_dict(o) for o in rev_b_objects]
    key["objects"] += [obj_dict(o) for o in sheets["D-01"].objects]
    rev_b_set = [o for sh in rev_a if sh.name != "L-1" for o in sh.objects] + rev_b_objects
    key["totals_by_revision"] = {"A": key["totals"], "B": answer_totals(rev_b_set)}
    key["counted_trees"] = {"L-1": sum(o.quote_count for o in sheets["L-1"].objects if o.kind == "tree"),
                            "L-1 Rev B": sum(o.quote_count for o in rev_b_objects if o.kind == "tree")}
    key["site"]["sheets"] = {name: {"file": SHEET_FILES[name], "title": sh.title, "scale": sh.scale,
                                    "revision": (sh.revision or REV_A).letter, "date": (sh.revision or REV_A).date,
                                    "model_units_per_metre": S.L5_UNITS_PER_M if name == "L-5" else 1.0}
                             for name, sh in sheets.items() if name in SHEET_FILES}
    key["site"]["sheets_listed_not_in_package"] = list(S.MISSING_SHEETS)
    key["tree_pit"] = {"sheet": "L-6", "width_m": S.PIT_M, "length_m": S.PIT_M, "area_m2": round(S.PIT_M ** 2, 2),
                       "soil_depth_m": S.SOIL_DEPTH_M, "drainage_m": S.DRAINAGE_M, "ground": "artificial",
                       "label": S.PIT_LABEL}
    key["package"] = {"name": ROOT, "seed": seed, "basis": "synthetic", "file_count": len(FILES),
                      "price_list": f"../{PRICE_LIST}", "project": PROJECT_EN}
    key["bills"] = _bill_summary(bill_cells or {})
    key["price_list"] = [{"item": i, "spec": s, "unit": u, "low_ntd": lo, "high_ntd": hi, "basis": b, "source": src}
                         for i, s, u, lo, hi, b, src in B.PRICE_LIST]
    key["images"] = {Path(p).name: {"material": mat, "matches": code} for p, (_, mat, code) in IMAGES.items()}
    key["errors"] = errors(key)
    key["files"] = files()
    key["eval_line"] = "planted 30 · found N · flagged M · missed K · false alarms F"
    return key


def _bill_summary(cells: dict) -> dict:
    out = {}
    for short, path in BOQ.items():
        bill = next(b for b in B.bills().values() if Path(path).stem == b.name)
        out[short] = {"file": path, "revision": bill.revision, "date": bill.date, "sheet": B.SHEET,
                      "hidden_sheets": [B.HIDDEN_SHEET] if bill.hidden_old else [],
                      "rows": [{"key": r.key, "description": r.description, "unit": r.unit, "qty": r.qty,
                                "unit_price": r.price} for s in bill.sections for r in s.rows],
                      "totals": B.totals(bill), "cells": cells.get(short, {})}
    out["latest_by_date"] = "20261014"
    return out


# --------------------------------------------------------------------------------------------- the thirty errors


def _ids(key: dict, sheet: str, kind: str) -> list[str]:
    return [o["id"] for o in key["objects"] if o["sheet"] == sheet and o["kind"] == kind]


def errors(key: dict) -> list[dict]:
    """The thirty planted errors of docs/PACKAGE.md, with the files, objects and bill cells involved."""
    trees = _ids(key, "L-1", "tree")
    counted = [i for i in trees if next(o for o in key["objects"] if o["id"] == i)["quote_count"]]
    cells = {k: v["cells"] for k, v in key["bills"].items() if isinstance(v, dict)}

    def cell(bill, name):
        return {"file": BOQ[bill], "sheet": B.SHEET, "cell": cells.get(bill, {}).get(name)}

    fm = BOQ["rev2"]
    both = [fm, BOQ["20261014"]]  # row-level errors the budget file copied
    pit = key["tree_pit"]
    legend_tree = [o["id"] for o in key["objects"] if o["sheet"] == "L-1" and o["kind"] == "legend"
                   and o["note"] == "tree symbol"]
    E = [
        ("E01", [SHEET_FILES["L-1"]], "geometry", "open outline; Muse Spark: one tree; asks", [trees[7]], [],
         "geometry + Spark", "T-08 drawn as 12 loose pieces with 40 cm gaps"),
        ("E02", [SHEET_FILES["L-1"], SHEET_FILES["L-4"], *both], "schedule",
         "schedule ≠ drawing (12 vs 8); drawing governs (general note 1 on L-1); raise with the developer",
         counted + _ids(key, "L-4", "schedule"), [cell("rev2", "camphor.qty")], "geometry + Spark",
         "the schedule on L-4 and the bill say Camphor 12; the plan draws 8"),
        ("E03", [SHEET_FILES["L-1"], SHEET_FILES["L-1 Rev B"]], "revision",
         "two revisions of one sheet; Rev B (2026-10-14) is newer than Rev A (2026-09-18); counts shown for both: "
         "8 and 8, one tree moved 2 m", [trees[5], "L-1 Rev B/tree-06", "L-1 Rev B/revision_cloud-01"], [],
         "Spark (title block)", "Rev B moves tree 6 by 2 m; still 8 trees"),
        ("E04", [SHEET_FILES["L-2"]], "sheet", "elevation — not counted", _ids(key, "L-2", "elevation_tree"), [],
         "Spark (classify)", "L-2 shows the eight trees from the side"),
        ("E05", [SHEET_FILES["L-5"]], "sheet", "enlarged plan — not counted, match line found",
         _ids(key, "L-5", "enlarged_tree") + _ids(key, "L-5", "match_line"), [], "Spark + geometry",
         "L-5 repeats the four west trees at 1:100"),
        ("E06", [SHEET_FILES["L-7"], SHEET_FILES["L-8"]], "sheet", "irrigation / lighting — not a planting sheet",
         _ids(key, "L-7", "background_tree") + _ids(key, "L-8", "background_tree"), [], "Spark",
         "the canopies are grey background line work under irrigation and lighting symbols"),
        ("E07", [SHEET_FILES["L-1"]], "geometry", "legend — not counted", legend_tree, [], "geometry (box)",
         "the legend's tree symbol is a canopy outline inside the legend box"),
        ("E08", [SHEET_FILES["L-1"]], "geometry", "outside the site — drawn, not counted toward greening",
         _odd(key, "tree_outside_boundary"), [], "geometry", "a proposed camphor in the road reserve"),
        ("E09", [SHEET_FILES["L-1"]], "rules", "inside an area where greening cannot count (§299) — flagged",
         _odd(key, "tree_in_fire_lane"), [], "geometry + rules", "a proposed camphor inside the fire-truck access lane"),
        ("E10", [SHEET_FILES["L-3"], SHEET_FILES["L-1"]], "geometry",
         "areas overlap between sheets — 20 m² counted twice", _odd(key, "paving_overlaps_lawn"), [], "geometry",
         "PV-3 grass pavers on L-3 overlap the L-1 lawn by 20 m²"),
        ("E11", [SHEET_FILES["L-3"]], "geometry", "hatch pattern and label disagree (box PV-1, hatch PV-2) — which price?",
         _odd(key, "label_hatch_mismatch"), [], "geometry + Spark",
         "the 48 m² area's boxed code says PV-1 permeable pavers, its hatch is PV-2 exposed aggregate's"),
        ("E12", [SHEET_FILES["L-6"], SHEET_FILES["L-4"], *both], "rules",
         f"large trees count as small (Gi 1.5 → 1.0): pit {pit['width_m']} x {pit['length_m']} m = {pit['area_m2']} m² "
         "on artificial ground is inside the standard's 1.5–4 m² band; schedule and bill call them large trees",
         _ids(key, "L-6", "tree_pit") + _ids(key, "L-4", "schedule"), [cell("rev2", "pit.description")],
         "Spark (detail) + rules", pit["label"]),
        ("E13", both + [SHEET_FILES["L-4"]], "bill", "Azalea 450 plants for 150 m² = 3 per m² — below the schedule's 4 per m²",
         _ids(key, "L-1", "shrub_bed"), [cell("rev2", "azalea.qty")], "bill vs schedule",
         "changed from 600 to 450 in rev1a and carried on"),
        ("E14", [SHEET_FILES["L-1"]], "rules", "one tree species → α 0.8; §302 short; two fixes (+2 trees, or swap 2 for "
         "a second native species)", counted, [], "rules", "eight camphors, nothing else"),
        ("E15", [SHEET_FILES["L-1"]], "rules", "may be a protected tree (DBH 95 cm) — needs review; municipal rule",
         _odd(key, "existing_tree"), [], "Spark + rules", "EX-01 existing camphor DBH 95 cm TO BE REMOVED"),
        ("E16", [SHEET_FILES["L-5"]], "sheet", "scale mismatch (title block 1:200, scale bar 1:100); areas on this sheet "
         "unreliable", _ids(key, "L-5", "title") + _ids(key, "L-5", "scale_bar"), [], "geometry + Spark",
         "L-5 is drawn 2x in model space and its title block was not updated"),
        ("E17", both, "bill", "unit mismatch: hedge billed 27 m, drawn 182 plants", _ids(key, "L-1", "hedge"),
         [cell("rev2", "duranta.unit"), cell("rev2", "duranta.qty")], "bill", "Duranta hedge, m, 27"),
        ("E18", both, "bill", "\"Camphore tree\" aligned to Camphor at lower confidence", [],
         [cell("rev2", "camphor.description")], "Spark (align)", "Camphore tree, cal. 10 cm"),
        ("E19", both, "price", _price_verdict("camphor", "Camphor"), [], [cell("rev2", "camphor.price")],
         "bill vs price list", f"unit price {B.bills()[Path(fm).stem].row('camphor').price:,.0f}"),
        ("E20", both, "price", _price_verdict("pv1", "Permeable pavers"), [], [cell("rev2", "pv1.price")],
         "bill vs price list", f"unit price {B.bills()[Path(fm).stem].row('pv1').price:,.0f} per m²"),
        ("E21", both, "bill", "the subtotal formula skips the last row (irrigation): the bill does not add up", [],
         [cell("rev2", "subtotal")], "bill", f"SUM({cells.get('rev2', {}).get('subtotal_range')})"),
        ("E22", list(BOQ.values()), "bill", "four versions (rev1, rev1a, rev2, 20261014); latest by date is the "
         "budget file (2026-10-14); paving 212 → 236 m²", [], [cell("20261014", "pv1.qty")], "bill",
         "rev1a changes Azalea; rev2 changes four rows; the budget file changes PV-1"),
        ("E23", [fm], "bill", "hidden sheet found (\"old\": the rev1 bill with other totals)", [],
         [{"file": fm, "sheet": B.HIDDEN_SHEET, "cell": None}], "bill", "sheet 'old' is hidden"),
        ("E24", list(BOQ.values()), "bill", "merged two-row header parsed (robustness, not an error)", [],
         [cell("rev2", "header")], "bill", "Quantity and Price span two columns over a second header row"),
        ("E25", [SCAN], "ingest", "raster PDF — no vectors; Spark read the title block; not measured", [], [], "ingest",
         "image-only PDF, grey, rotated 1.5°"),
        ("E26", [IRRIGATION_XLS], "ingest", "unsupported — Excel 97: save as .xlsx", [], [], "ingest", "BIFF8 .xls"),
        ("E27", [BAK, METAL_ZIP], "ingest", "backup ignored (same content as Rev A); zip unpacked, one DXF inside, not a "
         "landscape quantity", _ids(key, "D-01", "detail"), [], "ingest", f"{METAL_ZIP} holds {ZIP_MEMBER}"),
        ("E28", list(IMAGES), "ingest", "material photo: exposed aggregate → matched to PV-2 (and pavers → PV-1)", [], [],
         "Spark (vision)", "pasted material photos in the CAD folder"),
        ("E29", [SHEET_FILES["L-0"]], "ingest", "L-9 Sections is listed on the index but missing from the package",
         [i for i in _ids(key, "L-0", "index_entry") if i.endswith("-09")], [], "Spark + ingest",
         "the drawing index lists L-1 … L-9"),
        ("E30", [GREEN_BUILDING], "document", "the greening report (TCO2 calculation) is required; link to the §302 "
         "result", [], [], "Spark (text)", "Greening quantity report (TCO2 calculation) — required"),
    ]
    out = []
    for eid, fs, cat, verdict, oids, cs, source, detail in E:
        row = {"id": eid, "files": fs, "category": cat, "expected_verdict": verdict, "object_ids": oids,
               "cells": cs, "source": source, "detail": detail, "planted": eid != "E24"}
        out.append(row)
    return out


def _price_verdict(row_key: str, item: str) -> str:
    """The expected price flag, computed from the rev2 bill and the firm's list."""
    price = B.bills()[Path(BOQ["rev2"]).stem].row(row_key).price
    _, _, unit, lo, hi, _, _ = next(r for r in B.PRICE_LIST if r[0].startswith(item))
    per = "" if unit == "EA" else f"/{unit}"
    if price < lo:
        mid = (lo + hi) / 2
        out = (f"{item} NT${price:,.0f}{per} — about {round(100 * (1 - price / mid))}% under your installed list "
               f"({lo:,}–{hi:,}; {round(100 * (1 - price / lo))}% below its low end)")
        if row_key == "camphor":
            out += f", below even the nursery price of the tree alone (NT${B.NURSERY_CAMPHOR[1]:,}, {B.NURSERY_CAMPHOR[0]})"
        return out
    return f"{item} NT${price:,.0f}{per} — {round(100 * (price / hi - 1))}% over the top of your list ({lo:,}–{hi:,})"


def _odd(key: dict, kind: str) -> list[str]:
    return next(o["object_ids"] for o in key["odd_objects"] if o["kind"] == kind)


def files() -> list[dict]:
    """Every file of the package with its expected triage verdict and one line why."""
    why = {
        SHEET_FILES["L-0"]: ("drawing · vector", "cover and drawing index (lists L-1 … L-9)"),
        SHEET_FILES["L-1"]: ("drawing · vector", "planting plan, Rev A 2026-09-18"),
        SHEET_FILES["L-1 Rev B"]: ("drawing · vector", "planting plan, Rev B 2026-10-14 (newer)"),
        BAK: ("backup", "AutoCAD backup of L-1 Rev A, same content"),
        SHEET_FILES["L-2"]: ("drawing · vector", "south elevation"),
        SHEET_FILES["L-3"]: ("drawing · vector", "paving plan"),
        SHEET_FILES["L-4"]: ("drawing · vector", "plant schedule sheet"),
        SHEET_FILES["L-5"]: ("drawing · vector", "enlarged plan of the west trees"),
        SHEET_FILES["L-6"]: ("drawing · vector", "tree pit detail"),
        SHEET_FILES["L-7"]: ("drawing · vector", "irrigation plan"),
        SHEET_FILES["L-8"]: ("drawing · vector", "lighting plan"),
        FULL_SET: ("drawing · vector", "the full set as a vector PDF, nine pages L-0 … L-8"),
        SCAN: ("drawing · raster", "a grey scan of L-1, image only"),
        PRESENTATION: ("drawing · raster", "the coloured presentation plan (for SAM)"),
        REVIEW: ("document", "design review: three issues"),
        PROCUREMENT: ("spec", "procurement and measurement standard"),
        IRRIGATION_XLS: ("unsupported", "Excel 97 — save as .xlsx"),
        FURNITURE_QUOTE: ("quote", "street furniture and metalwork quotation"),
        METAL_ZIP: ("archive", "zip with one metalwork detail DXF"),
        GREEN_BUILDING: ("document", "green-building checklist of required documents"),
        PPTX: ("presentation", "a slide deck about site office planters, not a drawing"),
    }
    for p, (_, mat, _) in IMAGES.items():
        why[p] = ("drawing · image", f"material photo pasted into the CAD: {mat}")
    for short, p in BOQ.items():
        why[p] = ("bill", f"bill of quantities, revision {short}")
    for kind, p in PIT_SPECS.items():
        why[p] = ("spec", f"tree pit standard, {kind}")
    out = []
    for f in FILES:
        verdict, line = why[f]
        entry = {"path": f, "verdict": verdict, "chip": CHIPS.get(verdict, verdict), "why": line}
        if f == METAL_ZIP:
            entry["contains"] = [{"path": ZIP_MEMBER, "verdict": "drawing · vector",
                                  "why": "metalwork detail (drain cover), not a landscape quantity"}]
        out.append(entry)
    assert all(e["verdict"] in VERDICTS for e in out)
    return out


# --------------------------------------------------------------------------------------------- text documents


def _write_documents(root: Path) -> None:
    D.text_pdf(root / REVIEW, "Design Review — Issues",
               f"{PROJECT_EN_NAME} — landscape package · review meeting 2026-09-10 · drawings reviewed: previous issue "
               "(before Rev A) · reviewer: sample reviewer", [
                   ("table", [["No.", "Sheet", "Issue", "Action"],
                              ["1", "L-1, L-6", "Trees on the podium: confirm the tree pit size and the soil depth on the "
                               "basement slab against the greening standard before the permit set.", "Designer, Rev A"],
                              ["2", "L-1", "Fire-truck access lane along the west boundary: keep the lane clear of "
                               "planting; show its extent on the planting plan.", "Designer, Rev A"],
                              ["3", "L-4, bill", "Plant schedule and bill quantities must agree with the planting plan; "
                               "the plan governs.", "Developer"]], [0.07, 0.13, 0.58, 0.22]),
                   ("p", "Please respond in writing with the next issue of the drawings."),
               ])
    for kind, path in PIT_SPECS.items():
        D.text_pdf(root / path, f"Tree pit guide — {kind}",
                   f"Developer's standard for tree pits, {kind} species · document TPS-{list(PIT_SPECS).index(kind) + 1:02d}"
                   " · 2026 edition (sample)", [
                       ("h", "1. Scope"),
                       ("p", f"Applies to {PIT_SPECIES[kind]}, planted on grade or on artificial ground (podium over a "
                             "basement slab, roof)."),
                       ("h", "2. Minimum dimensions"),
                       ("table", [TREE_PIT_TABLE[0], next(r for r in TREE_PIT_TABLE[1:]
                                                          if r[0].lower().startswith(kind.split("-")[0][:4]))],
                        [0.18, 0.22, 0.24, 0.18, 0.18]),
                       ("h", "3. Construction"),
                       ("li", "Drainage layer on the waterproofed slab, filter fabric, then planting soil to the depth "
                              "above."),
                       ("li", "Root ball top level with the finished soil surface; three timber stakes per tree."),
                       ("li", "On artificial ground the greening standard counts a large tree in a pit of 1.5–4 m² as a "
                              "small tree (Gi 1.0 instead of 1.5)."),
                       ("h", "4. All standards"),
                       ("table", TREE_PIT_TABLE, [0.18, 0.22, 0.24, 0.18, 0.18]),
                   ])
    D.text_pdf(root / PROCUREMENT, "Planting procurement spec — Landscape Works",
               f"{PROJECT_EN_NAME} · supply, measurement and pricing rules for the bill of quantities · 2026 (sample)", [
                   ("h", "1. Plant material"),
                   ("li", "Nursery grown, root-balled, true to the botanical name on the plant schedule."),
                   ("li", "Trees: caliper measured 1.0 m above ground; height and spread within 10% of the schedule."),
                   ("li", "Substitutions only with the designer's written approval."),
                   ("h", "2. Measurement"),
                   ("li", "Quantities are measured net from the drawings; plant quantities on plan take precedence over "
                          "the schedule."),
                   ("li", "Trees and shrubs by number of plants; hedges by number of plants at the stated spacing, not "
                          "by length."),
                   ("li", "Beds, lawn and paving by area in m²; edges by length in m."),
                   ("h", "3. Pricing"),
                   ("li", "Unit rates include supply, planting and 12 months of establishment maintenance."),
                   ("li", "Prices in NT$, excluding the 5% business tax; overhead and profit stated separately."),
                   ("h", "4. Paving"),
                   ("table", [["Code", "Material", "Specification"],
                              ["PV-1", "Permeable pavers", "concrete, 200 x 100 x 80 mm, on 30 mm sand"],
                              ["PV-2", "Exposed aggregate", "100 mm, 6-10 mm aggregate"],
                              ["PV-3", "Grass pavers", "concrete grid 400 x 400 x 80 mm, soil and sod"]],
                    [0.12, 0.3, 0.58]),
                   ("p", "Material samples and photos are submitted for approval before ordering."),
               ])
    items = [("Bench, steel and timber, 1.8 m", "EA", 4, 28000), ("Litter bin, 60 L", "EA", 3, 9500),
             ("Bollard, fixed, steel", "EA", 6, 6800), ("Drain cover 600 x 600, ductile iron (detail D-01)", "EA", 5, 7200),
             ("Bicycle rack, 5 bays", "EA", 2, 14500)]
    sub = sum(q * p for _, _, q, p in items)
    tax = round(sub * 0.05)
    D.text_pdf(root / FURNITURE_QUOTE, "Quotation — Street Furniture and Metalwork",
               f"Northgate Metalwork (sample) · quote MQ- · 2026-09-09 · {PROJECT_EN_NAME} · valid 60 days", [
                   ("table", [["Item", "Unit", "Qty", "Unit price (NT$)", "Amount (NT$)"]]
                    + [[d, u, str(q), f"{p:,}", f"{q * p:,}"] for d, u, q, p in items]
                    + [["Subtotal", "", "", "", f"{sub:,}"], ["Business tax 5%", "", "", "", f"{tax:,}"],
                       ["Total", "", "", "", f"{sub + tax:,}"]], [0.46, 0.08, 0.08, 0.19, 0.19]),
                   ("p", "Excludes drainage channels and installation. Drain cover detail D-01: see metal-details.zip."),
               ])
    D.text_pdf(root / GREEN_BUILDING, "Green Building Label — Required Documents",
               "Greenery indicator · checklist of documents to submit with the application · sample checklist", [
                   ("table", [["Document", "Status"],
                              ["Greening quantity report (TCO2 calculation)", "required"],
                              ["Planting plan with every species named", "required"],
                              ["Plant schedule with species, quantities, soil depth and pit area", "required"],
                              ["Tree pit and soil depth details for artificial ground", "required"],
                              ["Site plan showing areas excluded from greening (fire-truck space, driveways)", "required"],
                              ["Existing tree survey and tree protection plan", "if existing trees are affected"]],
                    [0.72, 0.28]),
                   ("p", "The greening quantity report shows TCO2 = (ΣGi × Ai) × α against TCO2c = 0.5 × A′ × β "
                         "(Building Technical Regulations, Design and Construction, §302), with the inputs read from the "
                         "planting plan and the plant schedule."),
               ])


# --------------------------------------------------------------------------------------------- write


def write_package(out_dir: str | Path, seed: int = 0) -> PackageKey:
    out = Path(out_dir)
    root = out / ROOT
    if root.exists():
        shutil.rmtree(root)
    for f in FILES:
        (root / f).parent.mkdir(parents=True, exist_ok=True)

    sheets = package_sheets(seed=seed)
    for name, path in SHEET_FILES.items():
        sheets[name].save(root / Path(path).parent, Path(path).name)
    shutil.copyfile(root / SHEET_FILES["L-1"], root / BAK)
    detail = sheets["D-01"].save(out, "_drain-cover-detail.tmp.dxf")
    D.zip_one(root / METAL_ZIP, ZIP_MEMBER, detail.read_bytes())
    detail.unlink()

    models = {name: load(root / path) for name, path in SHEET_FILES.items()}
    D.vector_pdf([models[f"L-{i}"] for i in range(9)], root / FULL_SET, "Landscape Drawings (Full Set)")
    D.scan_pdf(models["L-1"], root / SCAN, seed=seed)
    D.presentation_pdf(models["L-1"], root / PRESENTATION)
    for i, (path, (kind, _, _)) in enumerate(IMAGES.items()):
        D.texture_png(kind, root / path, seed=seed * 100 + i)

    bill_cells = {}
    for short, path in BOQ.items():
        bill = next(b for b in B.bills().values() if Path(path).stem == b.name)
        B.write_bill(bill, root / path)
        bill_cells[short] = bill.cells
    for path in BOQ.values():
        D.scrub_cjk_fonts(root / path)
    B.write_irrigation_xls(root / IRRIGATION_XLS)
    _write_documents(root)
    D.planters_pptx(root / PPTX)

    price_list = B.write_price_list(out / PRICE_LIST)
    key = package_key(sheets, seed=seed, bill_cells=bill_cells)
    key_path = out / ANSWER_KEY
    key_path.write_text(json.dumps(key, ensure_ascii=False, indent=1))
    return PackageKey(out, root, key_path, price_list, key)
