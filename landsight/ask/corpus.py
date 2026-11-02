"""The package as chunks a question can be scored against: the text of every PDF page (pymupdf), every bill row
(visible and hidden sheets), every drawing sheet's title block and its notes, the regulation table (landsight.db rules:
rules.json with the English article glosses), the firm's price list, and the Run's checks.

Each chunk carries `file_id` and `page` exactly as a citation must name them: a package file's id (F-12) and its page
(1-based; 0 when the source has no pages); "rules" for the regulation table, "price-list" for the firm's list, "run"
for a check. Nothing absolute or run-specific (run id, timing, folder) goes into a chunk's text, so the same package
gives the same chunks on any machine (the recordings are keyed on them)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

CJK = re.compile(r"[⺀-鿿豈-﫿　-〿＀-￯가-힯]+")
CHUNK_CHARS = 700


@dataclass
class Chunk:
    chunk_id: str
    kind: str  # pdf_text | pdf_raster | pdf_drawing | bill_row | bill_version | sheet | rule | price | check
    file_id: str
    page: int
    source: str  # a human name: the file name, "Regulation table", "Your price list", "Review check E19"
    text: str
    render: dict | None = None  # {"dxf": path} or {"pdf": path, "page": index}: a page image Spark may be shown
    extra: dict = field(default_factory=dict)

    def header(self, n: int) -> str:
        return f"[S{n}] file_id={self.file_id} page={self.page} · {self.source}" + (" [image attached]" if
                                                                                      self.extra.get("image") else "")


def _english(s: str) -> str:
    return re.sub(r"[ \t]{2,}", " ", CJK.sub(" ", s or "")).strip()


def _split(text: str, size: int = CHUNK_CHARS) -> list[str]:
    """Paragraph-ish pieces of at most `size` characters (lines are kept whole)."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out, cur = [], ""
    for ln in lines:
        if cur and len(cur) + 1 + len(ln) > size:
            out.append(cur)
            cur = ln
        else:
            cur = f"{cur}\n{ln}" if cur else ln
    if cur:
        out.append(cur)
    return out


def _n(v) -> str:
    if v is None:
        return "-"
    return f"{v:,.0f}" if float(v).is_integer() else f"{v:,.2f}"


def build_corpus(run: dict, folder: str | Path, rules: list[dict] | None = None,
                 prices: list[dict] | None = None) -> list[Chunk]:
    """`folder` is the package folder the Run was reviewed from; `rules` / `prices` are landsight.db rows (the tables
    rules and price_list); without them the regulation glosses come from landsight.checks.base."""
    from landsight.review.run import locate

    root, _, _ = locate(Path(folder))
    out: list[Chunk] = []
    files = {f["file_id"]: f for f in run["files"]}
    sheets_by_file: dict[str, list[dict]] = {}
    for s in run["sheets"]:
        sheets_by_file.setdefault(s["file_id"], []).append(s)

    bills = []
    for f in run["files"]:
        if f.get("parent"):
            continue
        path = root / f["path"]
        if f["ext"] == ".pdf" and path.is_file():
            out += _pdf_chunks(f, path, sheets_by_file.get(f["file_id"], []))
        elif f["verdict"] == "bill" and f["ext"] == ".xlsx" and path.is_file():
            chunks, bill = _bill_chunks(f, path)
            out += chunks
            if bill is not None:
                bills.append((f, bill))
    out += _bill_versions(bills)
    for s in run["sheets"]:
        if s.get("source") == "dxf":
            f = files.get(s["file_id"])
            if f is None:
                continue
            path = (root / f["path"]) if not f.get("parent") else None
            out.append(_sheet_chunk(s, f, path))
    out += _rule_chunks(rules)
    out += _price_chunks(prices)
    for c in run["checks"]:
        nums = c.get("numbers") or {}
        keep = {k: v for k, v in nums.items() if not k.endswith("_usd")}
        text = (f"Review check {c['check_id']} ({c.get('scenario', '')}, {c['severity']}, {c['category']}): {c['title']}. "
                f"{c['why']}" + (f" Numbers: {json.dumps(keep, ensure_ascii=False)}" if keep else ""))
        if c.get("citation"):
            text += f" Cites {c['citation']['article']}: {c['citation']['gloss']}"
        out.append(Chunk(f"check:{c['check_id']}", "check", "run", 0, f"Review check {c['check_id']}", _english(text),
                         extra={"check_id": c["check_id"], "item_ids": c.get("item_ids") or []}))
    return out


def _pdf_chunks(f: dict, path: Path, sheets: list[dict]) -> list[Chunk]:
    import pymupdf

    out = []
    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc):
            text = _english(page.get_text())
            sheet = next((s for s in sheets if s.get("page") == i + 1), None)
            if not text:
                out.append(Chunk(f"{f['file_id']}:p{i + 1}", "pdf_raster", f["file_id"], i + 1, f["name"],
                                 f"{f['name']} page {i + 1}: an image-only page with no text layer. Triage: {f['why']}",
                                 render={"pdf": str(path), "page": i}))
                continue
            kind = "pdf_drawing" if sheet is not None else "pdf_text"
            for k, piece in enumerate(_split(text)):
                head = f"{f['name']} page {i + 1}" + (f" (drawing {sheet['number']} {sheet['title']})" if sheet else "")
                out.append(Chunk(f"{f['file_id']}:p{i + 1}:{k + 1}", kind, f["file_id"], i + 1, f["name"],
                                 f"{head}:\n{piece}", render={"pdf": str(path), "page": i} if sheet else None))
    return out


def _bill_chunks(f: dict, path: Path) -> list[Chunk]:
    from landsight.bill.reader import read

    try:
        bill = read(path, f["path"], f["file_id"])
    except Exception:  # noqa: BLE001 - an unreadable bill is a triage matter, not a question's
        return [], None
    out = []
    for t in bill.tables:
        where = f"hidden sheet '{t.name}'" if t.hidden else f"sheet '{t.name}'"
        for r in t.rows:
            cells = {k: r.cell(k) for k in ("description", "qty", "price") if k in r.cols}
            text = (f"Bill {f['name']} (revision {bill.revision}, dated {bill.date}), {where}, row {r.row}: "
                    f"{r.description}" + (f" | {r.spec}" if r.spec else "") + f" | unit {r.unit} | qty {_n(r.qty)} | "
                    f"unit price NT${_n(r.price)} | amount NT${_n(r.amount)}" + (f" | section {r.section}" if r.section else ""))
            out.append(Chunk(f"{f['file_id']}:{t.name}!{r.row}", "bill_row", f["file_id"], 0, f["name"], _english(text),
                             extra={"cells": cells, "sheet": t.name, "row": r.row}))
        for ft in getattr(t, "footers", []) or []:
            out.append(Chunk(f"{f['file_id']}:{t.name}!{ft.row}", "bill_row", f["file_id"], 0, f["name"],
                             _english(f"Bill {f['name']} (revision {bill.revision}, dated {bill.date}), {where}, row "
                                      f"{ft.row}: {ft.label} = NT${_n(ft.value)} (formula {ft.formula})")))
    return out, bill


def _bill_versions(bills: list) -> list[Chunk]:
    """One chunk per bill version: its date, its total and what changed from the version before it (rows matched by
    description), oldest first; the newest by date is named as the latest."""
    from landsight.bill.compare import order

    if not bills:
        return []
    by_bill = {id(b): f for f, b in bills}
    seq = order([b for _, b in bills])
    out, prev = [], None
    for n, b in enumerate(seq):
        f = by_bill[id(b)]
        rows = {r.description.strip().lower(): r for r in b.main.rows}
        total = next((ft for ft in reversed(b.main.footers) if ft.label.lower().startswith("total")), None)
        changes = []
        if prev is not None:
            old = {r.description.strip().lower(): r for r in prev.main.rows}
            for k, r in rows.items():
                o = old.get(k)
                if o is None:
                    changes.append(f"added {r.description} ({_n(r.qty)} {r.unit} at NT${_n(r.price)})")
                    continue
                for name, a, z in (("qty", o.qty, r.qty), ("unit", o.unit, r.unit), ("unit price", o.price, r.price)):
                    if a != z:
                        changes.append(f"{r.description}: {name} {_n(a) if name != 'unit' else a} -> "
                                       f"{_n(z) if name != 'unit' else z}")
            changes += [f"removed {o.description}" for k, o in old.items() if k not in rows]
        latest = n == len(seq) - 1
        text = (f"Bill version {n + 1} of {len(seq)}: {f['name']}, revision {b.revision}, dated {b.date}"
                + (" (the latest by date)" if latest else "") + f"; {len(b.main.rows)} priced rows on sheet "
                f"'{b.main.name}'" + (f"; total NT${_n(total.value)}" if total else "")
                + (f"; hidden sheet(s): {', '.join(t.name for t in b.hidden)}" if b.hidden else "")
                + (f". Changes from {prev.revision}: " + "; ".join(changes) if prev is not None else ". The first version.")
                + ("" if changes or prev is None else "none found"))
        out.append(Chunk(f"{f['file_id']}:versions", "bill_version", f["file_id"], 0, f["name"], _english(text)))
        prev = b
    return out


def _sheet_chunk(s: dict, f: dict, path: Path | None) -> Chunk:
    texts: list[str] = []
    if path is not None and path.is_file():
        try:
            from landsight.dxf import load

            seen = set()
            for t in load(path).texts:
                c = _english(t.content)
                if c and c not in seen:
                    seen.add(c)
                    texts.append(c)
        except Exception:  # noqa: BLE001
            texts = []
    state = "counted" if s["counted"] else f"not counted ({s.get('not_counted_reason', '')})"
    head = (f"Drawing {s['number']} {s['title']} ({f['name']}): kind {s['kind']}, revision {s.get('revision') or '-'}, "
            f"date {s.get('date') or '-'}, title-block scale {s.get('scale_title') or '-'}, measured scale "
            f"{s.get('scale_measured') or '-'}; {state}.")
    if s.get("detail"):
        d = s["detail"]
        head += (f" Muse Spark read the detail: pit {d.get('pit_w_m')} x {d.get('pit_l_m')} m, soil "
                 f"{d.get('soil_depth_m')} m, on slab {d.get('on_slab')}.")
    body = " | ".join(texts)
    return Chunk(f"sheet:{s['sheet_id']}", "sheet", s["file_id"], 0, f["name"],
                 _english(f"{head} Text on the sheet: {body}")[:2400],
                 render={"dxf": str(path)} if path is not None else None, extra={"sheet_id": s["sheet_id"]})


def _rule_chunks(rules: list[dict] | None) -> list[Chunk]:
    if rules is None:
        from landsight.store.db import rule_rows

        rules = [dict(zip(("id", "kind", "jurisdiction", "article", "title", "gloss", "url", "value"), r))
                 for r in rule_rows()]
    out = []
    for r in rules:
        if r["kind"] == "glossary":
            text = f"Glossary: {r['title']}: {r['gloss']}"
        else:
            text = (f"Regulation {r['id']} ({r['jurisdiction']}): {r['title']} {r['article']}".strip()
                    + f": {r['gloss']}" + (f" Source: {r['url']}" if r.get("url") else ""))
        out.append(Chunk(f"rule:{r['id']}", "rule", "rules", 0, "Regulation table (rules.json)", _english(text),
                         extra={"rule_id": r["id"]}))
    return out


def _price_chunks(prices: list[dict] | None) -> list[Chunk]:
    out = []
    for p in prices or []:
        text = (f"Your price list, code {p['code']}: {p['name']}; {p.get('spec') or ''}; per {p.get('unit') or ''}; "
                f"installed range NT${_n(p['low'])}-{_n(p['high'])}; basis {p.get('basis') or ''}; source "
                f"{p.get('source') or ''}.")
        out.append(Chunk(f"price:{p['code']}", "price", "price-list", 0, "Your price list (landsight.db)",
                         _english(text), extra={"code": p["code"]}))
    return out
