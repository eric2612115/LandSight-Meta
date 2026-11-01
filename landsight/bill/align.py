"""Bill rows ↔ drawing items. Muse Spark matches every distinct bill row (description, spec, unit) to a drawing item
code in one call, with a confidence; without Spark a plain rule matches codes in brackets and names."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from landsight.bill.reader import Bill, BillRow


@dataclass
class Match:
    code: str | None
    confidence: float
    why: str
    by: str  # spark | rule


def row_key(r: BillRow) -> str:
    return f"{r.description} | {r.spec} | {r.unit}"


def distinct_rows(bills: list[Bill]) -> list[BillRow]:
    seen, out = set(), []
    for b in bills:
        for t in b.tables:
            for r in t.rows:
                k = row_key(r)
                if k not in seen:
                    seen.add(k)
                    out.append(r)
    return out


def item_lines(items: list[dict]) -> list[str]:
    return [f"{i['code']} | {i['name']} | {i.get('botanical') or '-'} | {i['kind']} | {i['unit']}" for i in items]


def by_rule(rows: list[BillRow], items: list[dict], book) -> dict[str, Match]:
    out = {}
    codes = {i["code"] for i in items}
    for r in rows:
        c = book.resolve(r.description) if book is not None else None
        code = c.code if c is not None and c.code in codes else None
        if code is None:
            up = r.description.upper()
            code = next((i["code"] for i in items if i["name"].upper() in up), None)
        out[row_key(r)] = Match(code, 0.9 if code else 0.5, "name or code in the description" if code else "no drawn "
                                "item named", "rule")
    return out


def align(bills: list[Bill], items: list[dict], book, spark=None) -> tuple[dict[str, Match], str]:
    """{row_key: Match} for every distinct row, and a note ('' when Spark answered)."""
    rows = distinct_rows(bills)
    rule = by_rule(rows, items, book)
    if spark is None:
        return rule, "Muse Spark not asked: names matched by rule"
    ids = {f"R-{n:02d}": r for n, r in enumerate(rows, 1)}
    lines = [f"{rid} | {r.description} | {r.spec} | {r.unit}" for rid, r in ids.items()]
    key = hashlib.sha256(("\n".join(item_lines(items)) + "\n" + "\n".join(lines)).encode()).hexdigest()
    try:
        answer = spark.align(item_lines(items), lines, key=key)
    except Exception as e:  # missing recording or failed call: the rule stands, and says so
        return rule, f"Muse Spark alignment unavailable ({type(e).__name__}): names matched by rule"
    codes = {i["code"] for i in items}
    out = dict(rule)
    for a in answer.get("rows", []):
        r = ids.get(a.get("row_id"))
        if r is None:
            continue
        code = a.get("item_code")
        code = code if code in codes else None
        out[row_key(r)] = Match(code, float(a.get("confidence") or 0.0), a.get("why", ""), "spark")
    return out, ""
