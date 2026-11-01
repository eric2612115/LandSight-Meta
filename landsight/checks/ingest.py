"""Ingest checks: what the triage did with the files that are not measured drawings — raster PDFs (title block read,
nothing measured), unsupported formats, backups, archives and pasted images."""

from __future__ import annotations

from landsight.checks.base import Check
from landsight.ingest.triage import finish_code


def ingest(ctx) -> list[Check]:
    out = []
    numbers = {d.number for d in ctx.sheets if d.source == "dxf"}
    for f in ctx.files:
        if f.verdict == "drawing_raster":
            tb = (f.spark or {}).get("title_block") or {}
            dxf = f" The DXF of {tb['number']} is measured instead." if tb.get("number") in numbers else ""
            read = ", ".join(x for x in (tb.get("number"), tb.get("title"), f"Rev {tb['revision']}" if tb.get("revision")
                                         else "", tb.get("date")) if x)
            out.append(Check("ingest", f"{f.name}: raster only — no vectors, not measured", "info",
                             ["spark"] if f.spark else ["rule"],
                             (f"Every page is an image (pymupdf found no vector paths and no text). Muse Spark read the "
                              f"title block: {read}." if read else "Every page is an image; no title block was read.") + dxf,
                             {"file_ids": [f.file_id]}, numbers={"pages": len(f.pages)}))
        elif f.verdict == "unsupported":
            out.append(Check("ingest", f"{f.name}: unsupported — {f.why}", "info", ["rule"],
                             f"Not read: {f.why}. Ask the sender for a readable copy if its numbers matter.",
                             {"file_ids": [f.file_id]}))
        elif f.verdict == "backup_ignored":
            out.append(Check("ingest", f"{f.name}: {f.why}", "info", ["rule"],
                             "A backup is never counted; the drawing it copies is read once.", {"file_ids": [f.file_id]}))
        elif f.verdict == "archive_unpacked":
            kids = [ctx.file(c) for c in f.children]
            sheets = [d for d in ctx.sheets if d.file_id in f.children]
            desc = "; ".join(f"{k.name}: {next((f'{d.number} {d.title}, {d.not_counted_reason}' for d in sheets if d.file_id == k.file_id), k.why)}"
                             for k in kids)
            out.append(Check("ingest", f"{f.name}: unpacked, {len(kids)} file{'s' if len(kids) != 1 else ''} inside", "info",
                             ["rule"] + (["spark"] if any(d.kind_by == "spark" for d in sheets) else []),
                             f"Unpacked into a temporary folder (member names checked: no absolute paths, no '..'). {desc}.",
                             {"file_ids": [f.file_id] + list(f.children), "sheet_ids": [d.sheet_id for d in sheets]}))
        elif f.verdict == "drawing_image":
            sp = f.spark or {}
            if sp.get("kind") == "material_photo":
                code = finish_code(sp.get("matches_code"))
                c = ctx.book.get(code)
                title = f"{f.name}: material photo — {sp.get('material')}" + (
                    f" → {code} {c.name}" if c else (f" → {code}" if code.lower() != "none" else ", no finish code"))
                out.append(Check("ingest", title, "info", ["spark"],
                                 f"Muse Spark: {sp.get('why', '')} (confidence {float(sp.get('confidence') or 0):.2f}). "
                                 + (f"{code} is keyed on {', '.join(c.sources)}. " if c else "")
                                 + "An image is read, never measured.", {"file_ids": [f.file_id]},
                                 numbers={"confidence": sp.get("confidence")}, extra={"matches_code": code}))
            else:
                out.append(Check("ingest", f"{f.name}: image — read, not measured", "info",
                                 ["spark"] if sp else ["rule"], f.why, {"file_ids": [f.file_id]}))
    return out
