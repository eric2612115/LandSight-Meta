"""Scale: the scale the title block states against the scale measured from the sheet's own scale bar (or a
dimension), with the paper size the package's other sheets agree on."""

from __future__ import annotations

import re

from landsight.checks.base import Check, obj_ref

RATIO = re.compile(r"1\s*:\s*(\d+)")


def scales(ctx) -> list[Check]:
    out = []
    for d in ctx.sheets:
        if d.source != "dxf" or not d.scale_measured:
            continue
        m, n = RATIO.search(d.scale_title or ""), RATIO.search(d.scale_measured)
        if not m or not n or m.group(1) == n.group(1):
            continue
        factor = int(m.group(1)) / int(n.group(1))
        objs = [o for o in ctx.objects.get(d.sheet_id, []) if o["kind"] in ("title_block", "scale_bar")]
        bar = d.scale_bar or {}
        out.append(Check(
            "scale", f"{d.number}: title block says {d.scale_title}, the {d.scale_how} measures {d.scale_measured}", "flag",
            ["geometry"],
            f"The {d.scale_how} ({' · '.join(bar.get('labels', [])) or 'dimension'}) puts {d.units_per_m:g} drawing units "
            f"in a metre; the frame and title block are the size of the package's other sheets, so the content plots at "
            f"{d.scale_measured}, not {d.scale_title}. Areas measured on this sheet as if it were 1 unit = 1 m would be "
            f"{d.units_per_m ** 2:g}× too large: this sheet is not measured.",
            {"sheet_ids": [d.sheet_id], "file_ids": [d.file_id], "object_ids": [obj_ref(d.sheet_id, o["object_id"]) for o in objs]},
            numbers={"scale_title": d.scale_title, "scale_measured": d.scale_measured, "units_per_m": d.units_per_m,
                     "factor": round(factor, 3)}))
    return out
