"""The developer's bills of quantities, the irrigation quote in Excel 97 format and the firm's price list.

Four revisions of one bill (docs/PACKAGE.md E02, E13, E17-E24):

- Rev 1 (2026-01-21): the first revision. Camphor 12 @ NT$4,200 [E02, E19 from the start]; Duranta 150 plants.
- Rev 1a (same day): one row changed, Azalea 600 -> 450 plants (3 per m2 for a 150 m2 bed) [E13].
- Rev 2 (2026-02-19): "Camphore tree" [E18]; the hedge billed as 27 m [E17]; permeable pavers NT$3,800/m2 [E20]; the
  subtotal formula stops one row short [E21]; a hidden sheet "old" holds the Rev 1 bill with other totals [E23].
- Rev 3, the paving update (2026-10-14): the Rev 2 sheet with permeable pavers 212 -> 236 m2 [E22]; its other rows (and
  the short subtotal) are copied unchanged.

Every bill has a two-row merged header [E24]: Item / Description / Spec, then Quantity (Unit, Qty) and Price (Unit
price (NT$), Amount (NT$)). Amounts are formulas (=Qty*Unit price), followed by Subtotal, Overhead and profit 8%,
Business tax 5% and Total formulas. The workbooks are written with XlsxWriter so that every formula also stores its
cached result, as a bill saved by Excel does (openpyxl can write formulas but not their results).
"""

from __future__ import annotations

import csv
import datetime as dt
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path

import xlsxwriter
from xlsxwriter.utility import xl_rowcol_to_cell

from landsight.synth.site import PROJECT_EN_NAME

SHEET = "BOQ"
HIDDEN_SHEET = "old"
HEADER_ROWS = (3, 4)  # Excel rows of the two-row merged header
FIRST_ROW = 5  # Excel row of the first body row
COLUMNS = ["Item", "Description", "Spec", "Unit", "Qty", "Unit price (NT$)", "Amount (NT$)"]
OVERHEAD, TAX = 0.08, 0.05
NOTE = "Sample bill: synthetic, generated for the Landsight demo package."


@dataclass
class Row:
    key: str  # stable id across revisions: camphor, duranta, azalea, lawn, pv1, pv2, pv3, planter, pit, soil, irrigation
    description: str
    spec: str
    unit: str
    qty: float
    price: float


@dataclass
class Section:
    code: str
    title: str
    rows: list[Row]


@dataclass
class Bill:
    name: str  # file stem
    revision: str
    date: str
    sections: list[Section]
    subtotal_skips_last: bool = False
    hidden_old: Bill | None = None
    cells: dict[str, str] = field(default_factory=dict)  # filled when written: "camphor.qty" -> "E6", "subtotal" -> "G19"

    def row(self, key: str) -> Row:
        return next(r for s in self.sections for r in s.rows if r.key == key)


# the irrigation quote (Excel 97): item, spec, unit, qty, unit price
IRRIGATION_QUOTE = [
    ("Irrigation controller", "8 stations, outdoor cabinet", "EA", 1, 18000),
    ("Solenoid valve", "25 mm, with flow control", "EA", 3, 4500),
    ("PE mainline", "32 mm, PN10", "m", 120, 120),
    ("Pop-up spray head", "10 cm pop-up, adjustable arc", "EA", 15, 650),
    ("Drip line", "16 mm, emitters @0.3 m (azalea bed, hedge)", "m", 420, 45),
    ("Tree bubbler", "1 per tree", "EA", 8, 380),
    ("Valve box", "standard, 300 x 450 mm", "EA", 3, 1200),
    ("Installation and testing", "including trenching on the podium", "LS", 1, 36000),
]
IRRIGATION_TOTAL = sum(q * p for *_, q, p in IRRIGATION_QUOTE)
IRRIGATION_QUOTE_NO, IRRIGATION_DATE = "IQ-417", "2026-09-09"

# The firm's own price list, installed rates (NT$). `source` cites ids in landsight/data/unit_prices.csv; basis
# "published_budget" where city budget rows bracket the range, "sample" where no direct source exists.
PRICE_LIST = [  # item, spec, unit, low, high, basis, source
    ("Camphor (Cinnamomum camphora)", "cal. 10 cm, H3.0-3.5 m, installed", "EA", 6200, 7200, "published_budget",
     "P006 municipal budget 6,149 (2021); P002 municipal budget 7,036 (2022)"),
    ("Duranta (Duranta erecta)", "H0.6 m, installed", "plant", 130, 160, "published_budget", "P024 shrub planted 146"),
    ("Azalea (Rhododendron spp.)", "4-5 in. pot, installed", "plant", 140, 170, "published_budget",
     "P026 150; P027 140"),
    ("Lawn (Zoysia matrella)", "sod, installed", "m²", 250, 300, "published_budget", "P030 sod installed 273"),
    ("Permeable pavers", "paver + bedding + base", "m²", 1300, 2300, "published_budget",
     "P048-P051 1,210-1,410; P052 2,120-2,340"),
    ("Exposed aggregate", "100 mm, washed-pebble finish", "m²", 1800, 2200, "sample",
     "no direct source; nearest P060 washed-pebble permeable paver 2,020"),
    ("Grass pavers", "concrete grid, 80 mm", "m²", 1150, 1350, "published_budget", "P063 1,150; P064 1,280; P065 1,320"),
]
NURSERY_CAMPHOR = ("P001", 4505)  # the tree alone (material only), a municipal unit-price book, 2022


def _base_sections() -> list[Section]:
    return [
        Section("A", "PLANTING", [
            Row("camphor", "Camphor tree, cal. 10 cm", "Cinnamomum camphora, H3.5 m, W1.5 m, root-balled", "EA", 12, 4200),
            Row("duranta", "Duranta", "Duranta erecta, H0.6 m, @0.3 m o.c., double row", "EA", 150, 145),
            Row("azalea", "Azalea", "Rhododendron spp., 4-5 in. pot, 4 plants/m²", "EA", 600, 155),
            Row("lawn", "Lawn", "Zoysia matrella, sod", "m²", 200, 280),
        ]),
        Section("B", "PAVING", [
            Row("pv1", "Permeable pavers (PV-1)", "concrete, 200 x 100 x 80 mm, on 30 mm sand", "m²", 212, 1800),
            Row("pv2", "Exposed aggregate (PV-2)", "100 mm, 6-10 mm aggregate", "m²", 48, 2000),
            Row("pv3", "Grass pavers (PV-3)", "concrete grid 400 x 400 x 80 mm, soil and sod", "m²", 36, 1250),
            Row("planter", "Planter edge", "precast concrete kerb, 150 mm", "m", 22, 1800),
        ]),
        Section("C", "TREE PITS AND SOIL", [
            Row("pit", "Tree pit on slab", "1.5 x 1.5 m, drainage layer 100 mm, filter fabric", "EA", 12, 6500),
            Row("soil", "Planting soil", "imported, 1.0 m deep in tree pits", "m³", 27, 750),
        ]),
        Section("D", "IRRIGATION", [
            Row("irrigation", "Irrigation system", f"as quotation {IRRIGATION_QUOTE_NO}", "LS", 1, IRRIGATION_TOTAL),
        ]),
    ]


def bills() -> dict[str, Bill]:
    """The four revisions, keyed by file stem."""
    rev1 = Bill("Landscape BOQ rev1", "1", "2026-01-21", _base_sections())
    rev1a = Bill("Landscape BOQ rev1a", "1a", "2026-01-21", deepcopy(rev1.sections))
    rev1a.row("azalea").qty = 450
    rev2 = Bill("Landscape BOQ rev2", "2", "2026-02-19", deepcopy(rev1a.sections), subtotal_skips_last=True,
                hidden_old=rev1)
    r = rev2.row("camphor")
    r.description = "Camphore tree, cal. 10 cm"
    r = rev2.row("duranta")
    r.description, r.spec, r.unit, r.qty, r.price = "Duranta hedge", "Duranta erecta, H0.6 m, double row", "m", 27, 950
    rev2.row("pv1").price = 3800
    rev3 = Bill("Landscape BOQ rev3 (paving update)", "3", "2026-10-14", deepcopy(rev2.sections),
                subtotal_skips_last=True)
    rev3.row("pv1").qty = 236
    return {b.name: b for b in (rev1, rev1a, rev2, rev3)}


def totals(bill: Bill) -> dict[str, float]:
    """What the bill's formulas evaluate to (the subtotal as written, short range included), and the true sum."""
    rows = [r for s in bill.sections for r in s.rows]
    amounts = [r.qty * r.price for r in rows]
    subtotal = sum(amounts[:-1] if bill.subtotal_skips_last else amounts)
    overhead = round(subtotal * OVERHEAD)
    tax = round((subtotal + overhead) * TAX)
    return {"sum_of_amounts": sum(amounts), "subtotal": subtotal, "overhead": overhead, "tax": tax,
            "total": subtotal + overhead + tax}


# --------------------------------------------------------------------------------------------- writing


def _sheet(wb, ws, bill: Bill, fmt: dict) -> dict[str, str]:
    cells: dict[str, str] = {}
    ws.set_column(0, 0, 6)
    ws.set_column(1, 1, 30)
    ws.set_column(2, 2, 46)
    ws.set_column(3, 4, 8)
    ws.set_column(5, 6, 16)
    ws.merge_range(0, 0, 0, 6, f"{PROJECT_EN_NAME} — Landscape Works", fmt["title"])
    ws.merge_range(1, 0, 1, 6, f"Bill of Quantities · Rev {bill.revision} · {bill.date} · NT$, excluding tax", fmt["info"])
    h0, h1 = HEADER_ROWS[0] - 1, HEADER_ROWS[1] - 1
    for col, text in enumerate(COLUMNS[:3]):
        ws.merge_range(h0, col, h1, col, text, fmt["head"])
    ws.merge_range(h0, 3, h0, 4, "Quantity", fmt["head"])
    ws.merge_range(h0, 5, h0, 6, "Price", fmt["head"])
    for col, text in enumerate(COLUMNS[3:], 3):
        ws.write(h1, col, text, fmt["head"])
    cells["header"] = f"A{HEADER_ROWS[0]}:G{HEADER_ROWS[1]}"

    r = FIRST_ROW - 1
    item = 0
    amount_rows = []
    for section in bill.sections:
        ws.write(r, 0, section.code, fmt["section"])
        ws.merge_range(r, 1, r, 6, section.title, fmt["section"])
        r += 1
        for row in section.rows:
            item += 1
            ws.write_number(r, 0, item, fmt["cell"])
            ws.write(r, 1, row.description, fmt["cell"])
            ws.write(r, 2, row.spec, fmt["cell"])
            ws.write(r, 3, row.unit, fmt["cell"])
            ws.write_number(r, 4, row.qty, fmt["num"])
            ws.write_number(r, 5, row.price, fmt["num"])
            qty, price = xl_rowcol_to_cell(r, 4), xl_rowcol_to_cell(r, 5)
            ws.write_formula(r, 6, f"={qty}*{price}", fmt["num"], row.qty * row.price)
            for col, name in ((1, "description"), (3, "unit"), (4, "qty"), (5, "price"), (6, "amount")):
                cells[f"{row.key}.{name}"] = xl_rowcol_to_cell(r, col)
            amount_rows.append(r)
            r += 1
    t = totals(bill)
    last = amount_rows[-2] if bill.subtotal_skips_last else amount_rows[-1]
    rng = f"{xl_rowcol_to_cell(amount_rows[0], 6)}:{xl_rowcol_to_cell(last, 6)}"
    lines = [("Subtotal", f"=SUM({rng})", t["subtotal"]),
             (f"Overhead and profit {OVERHEAD:.0%}", f"=ROUND({xl_rowcol_to_cell(r, 6)}*{OVERHEAD},0)", t["overhead"]),
             (f"Business tax {TAX:.0%}", f"=ROUND(({xl_rowcol_to_cell(r, 6)}+{xl_rowcol_to_cell(r + 1, 6)})*{TAX},0)",
              t["tax"]),
             ("Total", f"={xl_rowcol_to_cell(r, 6)}+{xl_rowcol_to_cell(r + 1, 6)}+{xl_rowcol_to_cell(r + 2, 6)}",
              t["total"])]
    for name, formula, value in lines:
        ws.merge_range(r, 0, r, 5, name, fmt["foot"])
        ws.write_formula(r, 6, formula, fmt["footnum"], value)
        cells[name.split()[0].lower()] = xl_rowcol_to_cell(r, 6)
        r += 1
    cells["subtotal_range"] = rng
    ws.write(r + 1, 0, NOTE, fmt["note"])
    ws.freeze_panes(FIRST_ROW - 1, 0)
    return cells


def write_bill(bill: Bill, path: Path) -> Path:
    wb = xlsxwriter.Workbook(str(path))
    wb.set_properties({"title": f"BOQ {bill.revision}", "author": "Greenfield Development Co. (sample)",
                       "created": dt.datetime.fromisoformat(bill.date + "T09:00:00"), "comments": NOTE})
    fmt = {
        "title": wb.add_format({"bold": True, "font_size": 14}),
        "info": wb.add_format({"italic": True}),
        "head": wb.add_format({"bold": True, "border": 1, "align": "center", "valign": "vcenter", "bg_color": "#DDEBF7",
                               "text_wrap": True}),
        "section": wb.add_format({"bold": True, "border": 1, "bg_color": "#F2F2F2"}),
        "cell": wb.add_format({"border": 1}),
        "num": wb.add_format({"border": 1, "num_format": "#,##0"}),
        "foot": wb.add_format({"bold": True, "border": 1, "align": "right"}),
        "footnum": wb.add_format({"bold": True, "border": 1, "num_format": "#,##0"}),
        "note": wb.add_format({"italic": True, "font_color": "#808080"}),
    }
    ws = wb.add_worksheet(SHEET)
    bill.cells = _sheet(wb, ws, bill, fmt)
    if bill.hidden_old is not None:
        old = wb.add_worksheet(HIDDEN_SHEET)
        _sheet(wb, old, bill.hidden_old, fmt)
        old.hide()
    ws.activate()
    wb.close()
    return path


def write_price_list(path: Path) -> Path:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["item", "spec", "unit", "low_ntd", "high_ntd", "basis", "source"])
        for row in PRICE_LIST:
            w.writerow(row)
    return path


def write_irrigation_xls(path: Path) -> Path:
    """The irrigation subcontractor's quote as a real Excel 97-2003 (BIFF8) file."""
    import xlwt

    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet("Quote")
    bold = xlwt.easyxf("font: bold on")
    num = xlwt.easyxf(num_format_str="#,##0")
    ws.write(0, 0, "IRRIGATION QUOTATION", xlwt.easyxf("font: bold on, height 280"))
    ws.write(1, 0, "Riverbend Irrigation Co. (sample)")
    ws.write(2, 0, f"Project: {PROJECT_EN_NAME} — landscape irrigation")
    ws.write(3, 0, f"Quote {IRRIGATION_QUOTE_NO} · {IRRIGATION_DATE} · valid 60 days · NT$, excluding tax")
    head = ["No.", "Item", "Spec", "Unit", "Qty", "Unit price (NT$)", "Amount (NT$)"]
    for c, text in enumerate(head):
        ws.write(5, c, text, bold)
    r = 6
    for i, (item, spec, unit, qty, price) in enumerate(IRRIGATION_QUOTE, 1):
        for c, v in enumerate([i, item, spec, unit, qty, price]):
            ws.write(r, c, v, num if c in (4, 5) else xlwt.Style.default_style)
        ws.write(r, 6, xlwt.Formula(f"E{r + 1}*F{r + 1}"), num)
        r += 1
    ws.write(r, 5, "Subtotal", bold)
    ws.write(r, 6, xlwt.Formula(f"SUM(G7:G{r})"), num)
    ws.write(r + 1, 5, "Business tax 5%", bold)
    ws.write(r + 1, 6, xlwt.Formula(f"ROUND(G{r + 1}*0.05,0)"), num)
    ws.write(r + 2, 5, "Total", bold)
    ws.write(r + 2, 6, xlwt.Formula(f"G{r + 1}+G{r + 2}"), num)
    ws.write(r + 4, 0, "Sample quote: synthetic, generated for the Landsight demo package.")
    for c, w in enumerate([6, 26, 40, 8, 8, 16, 16]):
        ws.col(c).width = 256 * w
    wb.save(str(path))
    return path
