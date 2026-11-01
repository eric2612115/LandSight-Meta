"""Bill rows on the checks: every bill check that points at a row of the latest bill carries that row in `numbers`
(row, bill_text, bill_unit, bill_qty, unit_price, amount, item_id, drawn_qty, aligned_to, align_confidence, list_low,
list_high), and every latest-bill row that agrees with the drawing gets an `info` check of its own (`ok`, never matched
and never an alarm), so a reader can rebuild the developer's spreadsheet from the Run alone. The combined "rows that
agree" check from landsight.bill.compare is replaced by those per-row checks; nothing else changes."""

from __future__ import annotations

from landsight.bill import compare as BC
from landsight.bill.align import Match, row_key
from landsight.checks.base import Check, cell_ref

AGREE_PREFIX = "Bill rows that agree with the drawing"


def _n(v) -> str:
    return f"{v:,.0f}" if float(v).is_integer() else f"{v:,.2f}"


def _row_numbers(r, file_id: str, matches: dict, drawn: dict, prices: list[dict]) -> dict:
    m = matches.get(row_key(r)) or Match(None, 0.0, "", "")
    d = drawn.get(m.code) if m.code else None
    out = {"row": r.row, "bill_text": r.description, "bill_unit": r.unit, "bill_qty": r.qty, "unit_price": r.price,
           "amount": r.amount, "bill_file": file_id, "bill_cell": r.cell("description")}
    if m.code:
        out |= {"aligned_to": m.code, "align_confidence": round(m.confidence, 2), "align_by": m.by}
    if d is not None:
        out |= {"item_id": d["item_id"], "drawn_qty": d["qty"], "drawn_unit": d["unit"], "drawn_name": d["name"]}
        p = BC._price_row(prices, d["name"])
        if p is not None and BC.unit_of(p["unit"]) == BC.unit_of(r.unit):
            out |= {"list_low": p["low"], "list_high": p["high"]}
    return {k: v for k, v in out.items() if v is not None and v != ""}


def annotate(checks: list[Check], bills: list, matches: dict, drawn: dict, prices: list[dict]) -> list[Check]:
    """The bill checks with their rows; the per-row agreement checks in place of the combined one."""
    if not bills:
        return checks
    latest = BC.order(bills)[-1]
    table = latest.main
    by_cell: dict[str, object] = {}
    for r in table.rows:
        for f in r.cols:
            by_cell[cell_ref(latest.file_id, table.name, r.cell(f))] = r
    out: list[Check] = []
    for c in checks:
        if "bill" not in c.by:
            out.append(c)
            continue
        if (c.extra or {}).get("ok") and c.title.startswith(AGREE_PREFIX):
            out += _agree_rows(latest, matches, drawn, prices, c)
            continue
        row = next((by_cell[x] for x in c.evidence.get("cells", []) if x in by_cell), None)
        if row is not None:
            nums = _row_numbers(row, latest.file_id, matches, drawn, prices)
            c.numbers = {**nums, **(c.numbers or {})}
        out.append(c)
    return out


def _agree_rows(latest, matches: dict, drawn: dict, prices: list[dict], combined: Check) -> list[Check]:
    out = []
    for r in latest.main.rows:
        m = matches.get(row_key(r)) or Match(None, 0.0, "", "")
        d = drawn.get(m.code) if m.code else None
        if d is None or r.qty is None or d["qty"] is None:
            continue
        bu, du = BC.unit_of(r.unit), d["unit"]
        if bu != du or abs(r.qty - d["qty"]) > 0.01 * max(d["qty"], 1):
            continue
        word = BC.UNIT_WORD.get(du, du)
        cells = [cell_ref(latest.file_id, latest.main.name, r.cell("qty"))]
        out.append(Check(
            "quantity", f"Bill row {r.row}: {r.description} {_n(r.qty)} {word} = drawing {_n(d['qty'])}", "info",
            ["bill", "geometry"],
            f"The latest bill's row {r.row} aligned to {d['name']} ({m.code}, confidence {m.confidence:.2f}); same unit, "
            "same quantity (areas within 1%).",
            {"file_ids": [latest.file_id], "sheet_ids": d.get("sheet_ids", []), "object_ids": d.get("object_refs", []),
             "cells": cells},
            numbers=_row_numbers(r, latest.file_id, matches, drawn, prices),
            extra={"ok": True, "item_ids": [d["item_id"]]}))
    return out or [combined]
