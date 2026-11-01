"""Read a developer's bill of quantities from .xlsx with openpyxl, twice: once for values (data_only, the results the
saving program cached) and once for formulas. Handles a two-row merged header (a group heading such as 'Quantity'
merged over 'Unit' and 'Qty'), section rows, footer formulas (Subtotal, Overhead, Tax, Total) and hidden sheets."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter, range_boundaries

COLUMN_WORDS = {  # normalised header text -> field
    "item": "item", "no": "item", "no.": "item", "description": "description", "spec": "spec",
    "specification": "spec", "unit": "unit", "qty": "qty", "quantity": "qty", "unit price": "price",
    "rate": "price", "amount": "amount", "total": "amount", "remarks": "remarks",
}
SUM = re.compile(r"^=\s*SUM\(\s*([A-Z]+)(\d+)\s*:\s*([A-Z]+)(\d+)\s*\)\s*$", re.IGNORECASE)
REV = re.compile(r"Rev\s+([^·|]+?)\s*[·|]\s*(\d{4}-\d{2}-\d{2})")


@dataclass
class BillRow:
    sheet: str
    row: int  # Excel row number
    item: object
    description: str
    spec: str
    unit: str
    qty: float | None
    price: float | None
    amount: float | None  # cached value
    amount_formula: str
    section: str
    cols: dict[str, str]  # field -> column letter

    def cell(self, field_name: str) -> str:
        return f"{self.cols[field_name]}{self.row}"


@dataclass
class Footer:
    label: str
    row: int
    formula: str
    value: float | None
    cell: str


@dataclass
class Table:
    name: str
    hidden: bool
    header_rows: tuple[int, int]
    header_cells: str  # "A3:G4"
    merged_header: bool
    columns: dict[str, str]  # field -> column letter
    column_names: dict[str, str]  # field -> header text as read ("Quantity / Qty")
    rows: list[BillRow] = field(default_factory=list)
    footers: list[Footer] = field(default_factory=list)

    def footer(self, word: str) -> Footer | None:
        return next((f for f in self.footers if f.label.lower().startswith(word)), None)


@dataclass
class Bill:
    path: Path
    rel: str
    file_id: str
    revision: str
    date: str
    heading: str
    tables: list[Table]

    @property
    def main(self) -> Table:
        visible = [t for t in self.tables if not t.hidden and t.rows]
        return visible[0] if visible else self.tables[0]

    @property
    def hidden(self) -> list[Table]:
        return [t for t in self.tables if t.hidden]


def _norm(v) -> str:
    return re.sub(r"\s*\(.*?\)\s*", " ", str(v or "")).strip().lower()


def _num(v) -> float | None:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def _header(ws, merged) -> tuple[int, int, dict[str, str], dict[str, str], bool] | None:
    """(first header row, last header row, field -> column, field -> header text, merged?) for the first rows that
    name at least three known columns, reading a merged group heading over its sub-headings."""
    for r in range(1, min(ws.max_row, 20) + 1):
        texts = {c: ws.cell(r, c).value for c in range(1, ws.max_column + 1)}
        known = [c for c, v in texts.items() if _norm(v) in COLUMN_WORDS]
        if len(known) < 2:
            continue
        below = {c: ws.cell(r + 1, c).value for c in range(1, ws.max_column + 1)}
        cols, names, is_merged = {}, {}, False
        for c in range(1, ws.max_column + 1):
            top, sub = texts.get(c), below.get(c)
            span = next((m for m in merged if m.min_row == r and m.min_col <= c <= m.max_col), None)
            if span is not None and span.max_row > r:  # spans both header rows
                is_merged = True
                label = str(top or "")
            elif span is not None and span.max_col > span.min_col:  # a group heading over sub-headings
                is_merged = True
                group = ws.cell(r, span.min_col).value
                label = f"{group} / {sub}" if sub else str(group or "")
                top = sub or group
            else:
                label = str(top or sub or "")
                top = top or sub
            f = COLUMN_WORDS.get(_norm(top))
            if f and f not in cols:
                cols[f], names[f] = get_column_letter(c), label
        if {"description", "qty"} <= set(cols):
            last = r + 1 if is_merged else r
            return r, last, cols, names, is_merged
    return None


def read(path: Path, rel: str = "", file_id: str = "") -> Bill:
    values = openpyxl.load_workbook(path, data_only=True)
    formulas = openpyxl.load_workbook(path, data_only=False)
    heading, revision, date = "", "", ""
    tables = []
    for ws in values.worksheets:
        wf = formulas[ws.title]
        merged = list(ws.merged_cells.ranges)
        for r in range(1, 4):
            for c in range(1, ws.max_column + 1):
                v = ws.cell(r, c).value
                if isinstance(v, str) and REV.search(v) and not revision and ws.sheet_state == "visible":
                    m = REV.search(v)
                    heading, revision, date = v, m.group(1).strip(), m.group(2)
        found = _header(ws, merged)
        if found is None:
            continue
        r0, r1, cols, names, is_merged = found
        last_col = max(range_boundaries(f"{v}1")[0] for v in cols.values())
        t = Table(ws.title, ws.sheet_state != "visible", (r0, r1), f"A{r0}:{get_column_letter(last_col)}{r1}",
                  is_merged, cols, names)
        section = ""
        for r in range(r1 + 1, ws.max_row + 1):
            get = lambda f: ws[f"{cols[f]}{r}"].value if f in cols else None  # noqa: E731
            desc, qty = get("description"), _num(get("qty"))
            first = ws.cell(r, 1).value
            if desc and qty is not None:
                amount_cell = f"{cols['amount']}{r}" if "amount" in cols else ""
                t.rows.append(BillRow(ws.title, r, get("item"), str(desc).strip(), str(get("spec") or "").strip(),
                                      str(get("unit") or "").strip(), qty, _num(get("price")),
                                      _num(ws[amount_cell].value) if amount_cell else None,
                                      str(wf[amount_cell].value or "") if amount_cell else "", section, cols))
                continue
            label = first if isinstance(first, str) else desc
            if isinstance(label, str) and label.strip() and "amount" in cols:
                fcell = f"{cols['amount']}{r}"
                fv = wf[fcell].value
                if isinstance(fv, str) and fv.startswith("="):
                    t.footers.append(Footer(label.strip(), r, fv, _num(ws[fcell].value), fcell))
                    continue
            if desc and isinstance(first, str) and len(first) <= 3:
                section = f"{first} {desc}".strip()
        tables.append(t)
    if not date:  # fall back on the file name (YYYYMMDD) or the workbook's creation date
        m = re.search(r"(20\d{2})(\d{2})(\d{2})", path.stem)
        created = values.properties.created
        date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else (created.date().isoformat() if created else "")
    return Bill(path, rel or path.name, file_id, revision or path.stem, date, heading, tables)


def sum_range(formula: str) -> tuple[str, int, int] | None:
    """'=SUM(G6:G17)' -> ('G', 6, 17)."""
    m = SUM.match(formula or "")
    if not m or m.group(1).upper() != m.group(3).upper():
        return None
    return m.group(1).upper(), int(m.group(2)), int(m.group(4))
