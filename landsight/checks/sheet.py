"""Sheet checks: sheets that are not counted and why (elevation, enlarged plan with a match line, background of
another trade, schedule, detail, cover, PDF copies), the legend on counted sheets, and the drawing index against the
sheets in the package."""

from __future__ import annotations

import re

from landsight.checks.base import Check, obj_ref

NUM = re.compile(r"^[A-Z]{1,2}-?\d{1,3}[A-Z]?$")


def not_counted(ctx) -> list[Check]:
    out = []
    pdfs: dict[str, list] = {}
    for d in ctx.sheets:
        if d.counted:
            continue
        if d.source != "dxf":
            pdfs.setdefault(d.file_id, []).append(d)
            continue
        if d.not_counted_reason.startswith("superseded"):
            continue  # the revision check says it
        objs = ctx.objects.get(d.sheet_id, [])
        shown = [o for o in objs if o["kind"] in ("tree", "match_line", "tree_pit")]
        kind = "enlarged plan" if "enlarged" in d.not_counted_reason else d.kind
        by = ["spark"] if d.kind_by == "spark" else ["rule"]
        if d.match_line:
            by.append("geometry")
        why = (f"{'Muse Spark' if d.kind_by == 'spark' else 'A title keyword rule'} classified the sheet as {d.kind}"
               + (f" ({d.discipline})" if d.discipline else "")
               + (f", confidence {d.kind_confidence:.2f}" if d.kind_by == "spark" else "") + f": {d.kind_why}")
        if d.match_line:
            why += f" Geometry found the match line ('{d.match_line['text']}')."
        trees = sum(1 for o in objs if o["kind"] == "tree")
        if trees:
            why += f" Its {trees} round outlines are not counted."
        out.append(Check(
            "sheet", f"{d.number or d.sheet_id} {d.title}: {kind} — not counted", "info", by, why,
            {"sheet_ids": [d.sheet_id], "file_ids": [d.file_id], "object_ids": [obj_ref(d.sheet_id, o["object_id"]) for o in shown]},
            numbers={"round_outlines": trees, "confidence": round(d.kind_confidence, 2)},
            extra={"reason": d.not_counted_reason}))
    for fid, ds in pdfs.items():
        f = ctx.file(fid)
        nums = ", ".join(d.number or d.sheet_id for d in ds)
        out.append(Check(
            "sheet", f"{f.name}: {len(ds)} vector page{'s' if len(ds) > 1 else ''} ({nums}) — read, not measured", "info",
            ["spark"] if all(d.kind_by == "spark" for d in ds) else ["rule"],
            "Each page was rendered and classified; the DXF of the same sheet is the one measured. Kinds: "
            + ", ".join(f"{d.number or d.sheet_id} {d.kind}" for d in ds) + ".",
            {"sheet_ids": [d.sheet_id for d in ds], "file_ids": [fid]}))
    return out


def legend(ctx) -> list[Check]:
    out = []
    for d in ctx.sheets:
        if not d.counted:
            continue
        objs = [o for o in ctx.objects.get(d.sheet_id, []) if o["kind"] == "legend"]
        symbols = [o for o in objs if o.get("label") != "legend box"]
        if not objs:
            continue
        out.append(Check(
            "sheet", f"{d.number} legend: {len(symbols)} symbol{'s' if len(symbols) != 1 else ''} not counted", "info",
            ["geometry"], "Geometry found the legend box (the smallest frame around the word LEGEND); the symbols and "
                          "swatches inside it are a key, not plants or paving.",
            {"sheet_ids": [d.sheet_id], "file_ids": [d.file_id], "object_ids": [obj_ref(d.sheet_id, o["object_id"]) for o in objs]},
            numbers={"symbols": len(symbols)}))
    return out


def _index_from_text(d) -> list[str]:
    """Sheet numbers in the DXF's drawing index: the column under 'SHEET NO.'."""
    head = next((t for t in d.model.texts if t.content.strip().upper().startswith("SHEET NO")), None)
    if head is None:
        return []
    col = [t for t in d.model.texts if abs(t.x - head.x) < 0.5 and t.y < head.y and NUM.match(t.content.strip())]
    return [t.content.strip() for t in sorted(col, key=lambda t: -t.y)]


def index(ctx) -> list[Check]:
    out = []
    present = {d.number for d in ctx.sheets if d.source == "dxf" and d.number}
    present |= {d.number for d in ctx.sheets if d.number}
    for d in ctx.sheets:
        if d.source != "dxf" or d.model is None:
            continue
        listed_text = _index_from_text(d)
        if d.kind != "cover" and not listed_text:
            continue
        listed_spark = [x.strip() for x in ((d.spark or {}).get("index") or []) if NUM.match(x.strip())]
        listed = listed_spark or listed_text
        if len(listed) < 2:
            continue
        missing = [n for n in listed if n not in present and n != d.number]
        by = (["spark"] if listed_spark else []) + (["geometry"] if listed_text else [])
        agree = "" if not (listed_spark and listed_text) else (
            " Muse Spark's read and the DXF text agree." if listed_spark == listed_text else
            f" The DXF text lists {', '.join(listed_text)}.")
        if missing:
            titles = _titles(d, missing)
            out.append(Check(
                "sheet", f"{', '.join(f'{n} {titles.get(n, '')}'.strip() for n in missing)}: on the drawing index, not in "
                         "the package", "flag", by,
                f"The index on {d.number} lists {len(listed)} sheets ({', '.join(listed)}); no DXF or PDF page in the "
                f"package carries {', '.join(missing)}.{agree} Ask for the missing sheet{'s' if len(missing) > 1 else ''}.",
                {"sheet_ids": [d.sheet_id], "file_ids": [d.file_id]},
                numbers={"listed": len(listed), "missing": len(missing)}, extra={"missing": missing, "listed": listed}))
        else:
            out.append(Check("sheet", f"Drawing index on {d.number}: all {len(listed)} sheets are in the package", "info",
                             by, f"Listed: {', '.join(listed)}.{agree}", {"sheet_ids": [d.sheet_id], "file_ids": [d.file_id]},
                             extra={"ok": True}))
    return out


def _titles(d, numbers) -> dict[str, str]:
    out = {}
    for n in numbers:
        t = next((t for t in d.model.texts if t.content.strip() == n), None)
        if t is None:
            continue
        row = sorted((u for u in d.model.texts if abs(u.y - t.y) < 0.1 and u.x > t.x), key=lambda u: u.x)
        if row:
            out[n] = row[0].content.strip()
    return out
