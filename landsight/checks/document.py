"""Documents (text PDFs Muse Spark summarised): what a checklist requires, linked to the check that answers it (the
greening report to the Art. 302 result), and what a design review asked for."""

from __future__ import annotations

import re

from landsight.checks.base import Check

GREENING = re.compile(r"greening|green(ery)? quantity|TCO2|carbon", re.I)


def documents(ctx, greening_check: dict | None = None) -> list[Check]:
    out = []
    for f in ctx.files:
        sp = f.spark or {}
        if f.verdict not in ("document", "spec", "quote") or not sp:
            continue
        req = [r for r in sp.get("required") or [] if "required" in (r.get("status") or "").lower()
               or "if" in (r.get("status") or "").lower()]
        green = [r for r in req if GREENING.search(r.get("item", ""))]
        if green:
            g = greening_check or {}
            nums = g.get("numbers") or {}
            result = (f" Landsight's Art. 302 check ({g.get('check_id')}): required {nums.get('required')}, provided "
                      f"{nums.get('provided')} — {g.get('status', '').replace('_', ' ')}." if g else "")
            out.append(Check(
                "document", f"{green[0]['item']}: {green[0]['status']} by {sp.get('title') or f.name}", "flag",
                ["spark", "rule"],
                f"Muse Spark read the checklist: {sp.get('summary', '')}{result} The report must show the inputs read "
                "from the planting plan and the schedule; the same numbers are in the greening check.",
                {"file_ids": [f.file_id]}, numbers={"required_documents": len(req)},
                extra={"required": req, "links": [g["check_id"]] if g.get("check_id") else []}))
        elif f.verdict == "document" and sp.get("key_facts"):
            out.append(Check("document", f"{sp.get('title') or f.name}: {sp.get('summary', '')}"[:160], "info", ["spark"],
                             "Key facts: " + "; ".join(sp["key_facts"][:6]), {"file_ids": [f.file_id]}))
    return out
