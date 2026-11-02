"""The bill's checks: versions by date (which bill governs, what changed), the merged header, hidden sheets, formula
ranges that skip rows, quantities and units against the drawing, names aligned at low confidence, and unit prices
against the firm's own price list. Every check cites the bill cells (file_id:sheet!cell) in every version where the
same value appears, so a flag says how long the value has been in the bill."""

from __future__ import annotations

import csv
import difflib
import re
from pathlib import Path

from landsight.bill.align import Match, row_key
from landsight.bill.reader import Bill, BillRow, sum_range
from landsight.checks.base import Check, cell_ref

UNIT = {"ea": "plant", "no": "plant", "no.": "plant", "nr": "plant", "pcs": "plant", "plant": "plant", "plants": "plant",
        "m²": "m2", "m2": "m2", "sqm": "m2", "m": "m", "lm": "m", "m³": "m3", "m3": "m3", "ls": "ls"}
UNIT_WORD = {"plant": "plants", "m2": "m²", "m": "m", "m3": "m³", "ls": "lump sum"}


def unit_of(u: str) -> str:
    return UNIT.get((u or "").strip().lower(), (u or "").strip().lower())


def _n(v) -> str:
    return f"{v:,.0f}" if float(v).is_integer() else f"{v:,.2f}"


def order(bills: list[Bill]) -> list[Bill]:
    """Oldest first: by date, then by revision label (1 before 1a), then by file name."""
    return sorted(bills, key=lambda b: (b.date, len(b.revision), b.revision, b.rel))


def load_price_list(path: Path | None) -> list[dict]:
    if path is None or not Path(path).is_file():
        return []
    with Path(path).open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["low"], r["high"] = float(r["low_ntd"]), float(r["high_ntd"])
    return rows


def _same_value_cells(bills: list[Bill], matches: dict, code: str, field_name: str, value) -> list[str]:
    out = []
    for b in bills:
        t = b.main
        for r in t.rows:
            m = matches.get(row_key(r))
            if m is not None and m.code == code and getattr(r, field_name) == value:
                out.append(cell_ref(b.file_id, t.name, r.cell("unit" if field_name == "unit" else field_name)))
    return out


def _row(bill: Bill, matches: dict, code: str) -> BillRow | None:
    return next((r for r in bill.main.rows if (matches.get(row_key(r)) or Match(None, 0, "", "")).code == code), None)


def checks(bills: list[Bill], matches: dict[str, Match], drawn: dict[str, dict], prices: list[dict],
           align_note: str = "", price_list_name: str = "firm price list.csv") -> list[Check]:
    if not bills:
        return []
    bills = order(bills)
    latest = bills[-1]
    out: list[Check] = []
    files = [b.file_id for b in bills]

    # versions ------------------------------------------------------------------------------------------------
    changes = []
    latest_cells: list[str] = []
    for a, b in zip(bills, bills[1:]):
        diff = []
        old = {row_key(r): r for r in a.main.rows}
        old_by_code = {(matches.get(k) or Match(None, 0, "", "")).code or k: r for k, r in old.items()}
        for r in b.main.rows:
            code = (matches.get(row_key(r)) or Match(None, 0, "", "")).code or row_key(r)
            o = old_by_code.get(code)
            if o is None:
                diff.append(f"added {r.description}")
                continue
            for f, word in (("description", "name"), ("unit", "unit"), ("qty", "qty"), ("price", "price")):
                if getattr(o, f) != getattr(r, f):
                    diff.append(f"{o.description}: {word} {_fmt(getattr(o, f))} → {_fmt(getattr(r, f))}")
                    if b is latest:
                        latest_cells.append(cell_ref(b.file_id, b.main.name, r.cell(f)))
        changes.append({"from": a.revision, "to": b.revision, "date": b.date, "changes": diff})
    out.append(Check(
        "revision", f"{len(bills)} versions of the bill; the latest by date is {latest.rel.split('/')[-1]} ({latest.date})",
        "info", ["bill"],
        "Versions ordered by the date in each bill's heading: "
        + "; ".join(f"{c['from']} → {c['to']} ({c['date']}): {', '.join(c['changes']) or 'no row changed'}" for c in changes)
        + ". The latest governs the comparison with the drawings.",
        {"file_ids": files, "cells": latest_cells or [cell_ref(latest.file_id, latest.main.name, "A2")]},
        numbers={"versions": len(bills), "latest": latest.revision, "latest_date": latest.date},
        extra={"versions": [{"file_id": b.file_id, "revision": b.revision, "date": b.date} for b in bills],
               "changes": changes}))

    # merged header (robustness) ----------------------------------------------------------------------------
    merged = [b for b in bills if b.main.merged_header]
    if merged:
        t = merged[-1].main
        out.append(Check(
            "bill", f"Two-row merged header read in {len(merged)} bill{'s' if len(merged) > 1 else ''}", "info", ["bill"],
            "The header spans two rows with group headings merged over their sub-headings; columns read as "
            + ", ".join(f"{v}" for v in t.column_names.values()) + ".",
            {"file_ids": [b.file_id for b in merged], "cells": [cell_ref(b.file_id, b.main.name, b.main.header_cells)
                                                               for b in merged]}))

    # hidden sheets -----------------------------------------------------------------------------------------
    for b in bills:
        for h in b.hidden:
            vis, hid = b.main.footer("total"), h.footer("total")
            nums = {"visible_total": vis.value if vis else None, "hidden_total": hid.value if hid else None}
            out.append(Check(
                "bill", f"Hidden sheet '{h.name}' in {b.rel.split('/')[-1]}", "flag", ["bill"],
                f"The workbook hides a sheet '{h.name}' with {len(h.rows)} priced rows"
                + (f" totalling NT${_n(hid.value)}, against NT${_n(vis.value)} on the visible sheet" if vis and hid and
                   vis.value is not None and hid.value is not None else "")
                + ". Ask which one the developer priced from.",
                {"file_ids": [b.file_id], "cells": [cell_ref(b.file_id, h.name, None)]}, numbers=nums))

    # formulas that skip rows ----------------------------------------------------------------------------------
    skipped: dict[tuple, list[Bill]] = {}
    for b in bills:
        t = b.main
        sub = t.footer("subtotal")
        rng = sum_range(sub.formula) if sub else None
        if not rng or not t.rows:
            continue
        col, lo, hi = rng
        missing = [r for r in t.rows if not lo <= r.row <= hi]
        if missing:
            skipped.setdefault((sub.formula, tuple(r.description for r in missing)), []).append(b)
    for (formula, _), bs in skipped.items():
        b = bs[-1]
        t = b.main
        sub = t.footer("subtotal")
        missing = [r for r in t.rows if not sum_range(formula)[1] <= r.row <= sum_range(formula)[2]]
        short = sum(r.amount or 0 for r in missing)
        cells = [cell_ref(x.file_id, x.main.name, x.main.footer("subtotal").cell) for x in bs]
        cells += [cell_ref(x.file_id, x.main.name, r.cell("amount")) for x in bs for r in x.main.rows
                  if r.description in {m.description for m in missing}]
        out.append(Check(
            "arithmetic", f"The subtotal {formula.lstrip('=')} skips {', '.join(r.description for r in missing)}",
            "fail", ["bill"],
            f"The subtotal formula stops at row {sum_range(formula)[2]}; row{'s' if len(missing) > 1 else ''} "
            f"{', '.join(str(r.row) for r in missing)} ({', '.join(r.description for r in missing)}, NT${_n(short)}) "
            f"{'are' if len(missing) > 1 else 'is'} left out, so the bill does not add up"
            + (f" in {len(bs)} versions" if len(bs) > 1 else "") + ".",
            {"file_ids": [x.file_id for x in bs], "cells": cells},
            numbers={"subtotal": sub.value, "sum_of_rows": round(sum(r.amount or 0 for r in t.rows), 2),
                     "left_out": short, "formula": formula}))

    # quantities and units against the drawing -----------------------------------------------------------------
    agree, priced_ok, no_list = [], [], []
    primary: dict[str, tuple] = {}  # one row per drawn item: the one that names it, else the most confident
    for r in latest.main.rows:
        m = matches.get(row_key(r))
        if m is None or not m.code or m.code not in drawn:
            continue
        rank = (drawn[m.code]["name"].lower().split()[0][:5] in r.description.lower(), m.confidence)
        if m.code not in primary or rank > primary[m.code][0]:
            primary[m.code] = (rank, r)
    for r in latest.main.rows:
        m = matches.get(row_key(r)) or Match(None, 0, "", "")
        d = drawn.get(m.code) if m.code else None
        if d is None or primary.get(m.code, (None, None))[1] is not r:
            continue
        bu, du = unit_of(r.unit), d["unit"]
        cells = lambda f, v: _same_value_cells(bills, matches, m.code, f, v)  # noqa: E731
        ev_objects = d.get("object_refs", [])
        if du == "plant" and bu in ("m", "m2"):
            length, rows = d.get("length_m"), d.get("rows")
            out.append(Check(
                "units", f"{r.description}: billed {_n(r.qty)} {r.unit}, drawn {_n(d['qty'])} plants", "flag", ["bill", "geometry"],
                f"The drawing counts {d['name']} by plant ({_n(d['qty'])}"
                + (f": {rows} rows of {length:g} m at {d['spacing_m']:g} m" if length and rows and d.get("spacing_m") else "")
                + f"); the bill prices {_n(r.qty)} {r.unit}"
                + (f", one row's length" if length and abs(r.qty - length) < 0.05 else "")
                + ". Price per plant, as the procurement standard measures hedges.",
                {"file_ids": [latest.file_id], "sheet_ids": d.get("sheet_ids", []), "object_ids": ev_objects,
                 "cells": cells("unit", r.unit) + cells("qty", r.qty)},
                numbers={"bill_qty": r.qty, "bill_unit": r.unit, "drawn_qty": d["qty"], "drawn_unit": "plant",
                         "row_length_m": length, "rows": rows}))
            continue
        if d["kind"] == "shrub_bed" and bu == "plant" and d.get("density_per_m2"):
            per = r.qty / d["qty"] if d["qty"] else 0
            need = d["density_per_m2"] * d["qty"]
            if per < d["density_per_m2"] - 1e-6:
                out.append(Check(
                    "quantity", f"{r.description}: {_n(r.qty)} plants for {_n(d['qty'])} m² = {per:.1f} per m², below the "
                    f"schedule's {d['density_per_m2']:g} per m²", "flag", ["bill", "geometry"],
                    f"The schedule asks {d['density_per_m2']:g} plants per m²; the drawn bed is {_n(d['qty'])} m², so "
                    f"{_n(need)} plants. The bill has {_n(r.qty)}.",
                    {"file_ids": [latest.file_id], "sheet_ids": d.get("sheet_ids", []), "object_ids": ev_objects,
                     "cells": cells("qty", r.qty)},
                    numbers={"bill_qty": r.qty, "drawn_m2": d["qty"], "per_m2": round(per, 2),
                             "schedule_per_m2": d["density_per_m2"], "needed": need}))
            else:
                agree.append(f"{d['name']} {_n(r.qty)} plants ({per:.1f}/m²)")
        elif bu == du:
            if abs(r.qty - d["qty"]) <= 0.01 * max(d["qty"], 1):
                agree.append(f"{d['name']} {_n(r.qty)} {UNIT_WORD.get(du, du)}")
            else:
                history = [(b.revision, b.date, x.qty) for b in bills for x in [_row(b, matches, m.code)] if x is not None]
                changed = [h for h, prev in zip(history[1:], history) if h[2] != prev[2]]
                extra = {}
                why = (f"The latest bill has {_n(r.qty)} {UNIT_WORD.get(du, du)}; the governing drawing shows "
                       f"{_n(d['qty'])}")
                if d.get("schedule_qty") is not None and d["schedule_qty"] != d["qty"]:
                    why += f"; the plant schedule says {_n(d['schedule_qty'])}, and the drawing governs (general note)"
                if changed:
                    rev, date, q = changed[-1]
                    prev = next(p for h, p in zip(history[1:], history) if h == changed[-1])
                    why += f". Bill {rev} ({date}) changed it from {_n(prev[2])} to {_n(q)}; the drawing was not changed"
                    extra["history"] = [{"revision": h[0], "date": h[1], "qty": h[2]} for h in history]
                related = d.get("related_rows") or []
                for rel in related:
                    rr = next((x for x in latest.main.rows if rel["match"](x)), None)
                    if rr is not None and rr.qty == r.qty:
                        why += f"; {rr.description} {_n(rr.qty)} {rr.unit} follows the same {_n(r.qty)}"
                        extra.setdefault("related_cells", []).append(cell_ref(latest.file_id, latest.main.name, rr.cell("qty")))
                out.append(Check(
                    "quantity", f"{r.description}: bill {_n(r.qty)}, drawing {_n(d['qty'])}", "flag", ["bill", "geometry"],
                    why + ".",
                    {"file_ids": [latest.file_id], "sheet_ids": d.get("sheet_ids", []), "object_ids": ev_objects,
                     "cells": cells("qty", r.qty) + extra.pop("related_cells", [])},
                    numbers={"bill_qty": r.qty, "drawn_qty": d["qty"], "schedule_qty": d.get("schedule_qty")},
                    extra=extra))
        # price
        p = _price_row(prices, d["name"])
        if p is None or r.price is None:
            no_list.append(r.description)
            continue
        if unit_of(p["unit"]) != bu:
            no_list.append(f"{r.description} (billed per {r.unit}, listed per {p['unit']})")
            continue
        tag = "prices from the firm's own list" + (" · sample" if p["basis"] == "sample" else "")
        lo, hi = p["low"], p["high"]
        if lo <= r.price <= hi:
            priced_ok.append(f"{d['name']} {_n(r.price)}" + (" (sample)" if p["basis"] == "sample" else ""))
            continue
        if r.price < lo:
            # One basis for both the title and the reason: the low end of the firm's range.
            title = (f"{d['name']} NT${_n(r.price)}: about {round(100 * (1 - r.price / lo))}% under your installed list "
                     f"({_n(lo)}–{_n(hi)})")
            why = f"{round(100 * (1 - r.price / lo))}% below the list's low end"
        else:
            title = f"{d['name']} NT${_n(r.price)}: {round(100 * (r.price / hi - 1))}% over the top of your list ({_n(lo)}–{_n(hi)})"
            why = f"{round(100 * (r.price / hi - 1))}% above the list's high end"
        out.append(Check(
            "price", title, "flag", ["bill"],
            f"The bill's unit rate against the firm's own installed range in {price_list_name}: {why}. The list row "
            f"says: {p['spec']}; source {p['source']}.",
            {"file_ids": [latest.file_id], "cells": cells("price", r.price)},
            numbers={"bill_price": r.price, "list_low": lo, "list_high": hi, "unit": r.unit},
            extra={"tag": tag, "price_basis": p["basis"]}))
    if agree:
        out.append(Check("quantity", "Bill rows that agree with the drawing: " + ", ".join(agree), "info",
                         ["bill", "geometry"], "Each latest-bill row aligned to a drawn item, same unit, same quantity "
                         "(areas within 1%).", {"file_ids": [latest.file_id]}, extra={"ok": True}))
    if priced_ok:
        out.append(Check("price", "Unit rates inside your list: " + ", ".join(priced_ok), "info", ["bill"],
                         f"Against {price_list_name}; rows not on the list: {', '.join(no_list) or 'none'}.",
                         {"file_ids": [latest.file_id]}, extra={"tag": "prices from the firm's own list", "ok": True}))

    # names aligned at low confidence --------------------------------------------------------------------------
    for k, m in matches.items():
        if m.code is None or m.code not in drawn:
            continue
        name = drawn[m.code]["name"]
        desc = k.split(" | ")[0]
        words = re.findall(r"[A-Za-z]+", desc)
        if any(w.lower() == name.lower().split()[0] for w in words):
            continue
        near = difflib.get_close_matches(name.split()[0].lower(), [w.lower() for w in words], n=1, cutoff=0.75)
        if not near:
            continue
        cells = [cell_ref(b.file_id, b.main.name, r.cell("description")) for b in bills for r in b.main.rows
                 if row_key(r) == k]
        out.append(Check(
            "bill", f"'{desc}' aligned to {name} ({m.code}) at confidence {m.confidence:.2f}", "review",
            ["spark" if m.by == "spark" else "rule", "bill"],
            f"The bill spells it '{near[0]}'; "
            + (f"the drawing's schedule says {name}. " if drawn[m.code].get("schedule_qty") is not None
               else f"the drawing labels it {name} (no plant schedule was read). ")
            + (f"Muse Spark: {m.why}" if m.by == "spark" else "Matched by rule.") + " Confirm it is the same item.",
            {"file_ids": sorted({c.split(':')[0] for c in cells}), "cells": cells},
            numbers={"confidence": round(m.confidence, 2)}))
    if align_note:
        out.append(Check("bill", "Bill rows aligned without Muse Spark", "info", ["rule", "bill"], align_note,
                         {"file_ids": files}))
    return out


def _price_row(prices: list[dict], name: str) -> dict | None:
    n = name.lower()
    return next((p for p in prices if p["item"].lower().startswith(n)), None)


def _fmt(v) -> str:
    if isinstance(v, float):
        return _n(v)
    return str(v)
