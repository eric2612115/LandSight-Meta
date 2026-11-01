"""Revisions of one drawing: two DXF files with the same sheet number, their title-block revision and date, which one
is newer, the counts each gives and the objects that moved between them."""

from __future__ import annotations

import math

from landsight.checks.base import Check, obj_ref


def revisions(ctx) -> list[Check]:
    out = []
    by_number: dict[str, list] = {}
    for d in ctx.sheets:
        if d.source == "dxf" and d.number and d.kind == "plan" and not ("enlarged" in d.not_counted_reason):
            by_number.setdefault(d.number, []).append(d)
    for number, ds in by_number.items():
        if len(ds) < 2:
            continue
        ds = sorted(ds, key=lambda d: (d.date, d.revision))
        new = ds[-1]
        counts = {d.sheet_id: ctx.tree_count(d.sheet_id) for d in ds}
        trees = {d.sheet_id: [o for o in ctx.objects.get(d.sheet_id, []) if o["kind"] == "tree" and not o.get("excluded")]
                 for d in ds}
        moved, refs = [], []
        for old in ds[:-1]:
            for o in trees[old.sheet_id]:
                near = min(trees[new.sheet_id], key=lambda n: math.dist(n["centre"], o["centre"]), default=None)
                if near is None:
                    continue
                dist = math.dist(near["centre"], o["centre"])
                if 0.3 < dist < 6.0 and not any(math.dist(x["centre"], o["centre"]) < 0.3 for x in trees[new.sheet_id]):
                    moved.append((old, o, near, dist))
                    refs += [obj_ref(old.sheet_id, o["object_id"]), obj_ref(new.sheet_id, near["object_id"])]
        clouds = [o for o in ctx.objects.get(new.sheet_id, []) if o["kind"] == "revision_cloud"]
        refs += [obj_ref(new.sheet_id, c["object_id"]) for c in clouds]
        agree = len(set(counts.values())) == 1
        by = ["geometry"] + (["spark"] if all(d.kind_by == "spark" for d in ds) else [])
        title_reads = "; ".join(f"{d.sheet_id}: Rev {d.revision} {d.date}" + (
            f" (Muse Spark read Rev {(d.spark or {}).get('title_block', {}).get('revision', '?')} "
            f"{(d.spark or {}).get('title_block', {}).get('date', '?')})" if d.spark else "") for d in ds)
        why = (f"{len(ds)} files carry sheet {number}: {title_reads}. Rev {new.revision} is the newer and governs; "
               f"trees counted: " + ", ".join(f"Rev {d.revision} {counts[d.sheet_id]}" for d in ds)
               + (" (they agree)." if agree else " (they differ).")
               + ("" if not moved else " Moved: " + "; ".join(
                   f"{o['object_id']} by {dist:.1f} m (Rev {old.revision} {o['centre'][0]:g},{o['centre'][1]:g} → Rev "
                   f"{new.revision} {n['centre'][0]:g},{n['centre'][1]:g})" for old, o, n, dist in moved) + ".")
               + (f" A revision cloud marks the change." if clouds else ""))
        out.append(Check(
            "revision", f"Two revisions of {number}: Rev {new.revision} ({new.date}) is newer; trees "
            + (f"{counts[new.sheet_id]} in both" if agree else " / ".join(str(counts[d.sheet_id]) for d in ds))
            + (f", {len(moved)} moved" if moved else ""), "info", by, why,
            {"sheet_ids": [d.sheet_id for d in ds], "file_ids": [d.file_id for d in ds], "object_ids": refs},
            numbers={**{f"trees_rev_{d.revision}": counts[d.sheet_id] for d in ds}, "moved": len(moved),
                     "moved_m": round(max((m[3] for m in moved), default=0.0), 2)},
            extra={"governing_sheet_id": new.sheet_id}))
    return out
