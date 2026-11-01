"""Area checks: areas counted twice because sheets overlap (paving on one sheet over planting on another), and a
boxed finish code that disagrees with the hatch it points at (the legend keys the hatch to another code)."""

from __future__ import annotations

from shapely.geometry import Polygon

from landsight.checks.base import Check, obj_ref

PAVING = ("paving",)
PLANTING = ("lawn", "shrub_bed")


def overlap_pairs(ctx, min_m2: float = 0.5) -> list[tuple]:
    """(paving sheet, planting sheet, paving object, planting object, shared polygon) for every paving outline on one
    counted sheet that covers planting on another by at least `min_m2`."""
    out = []
    counted = [d for d in ctx.sheets if d.counted]
    for a in counted:
        for b in counted:
            if a.sheet_id == b.sheet_id:
                continue
            pav = [o for o in ctx.objects.get(a.sheet_id, []) if o["kind"] in PAVING and len(o.get("outline", [])) >= 3]
            pla = [o for o in ctx.objects.get(b.sheet_id, []) if o["kind"] in PLANTING and len(o.get("outline", [])) >= 3]
            for p in pav:
                for q in pla:
                    inter = Polygon(p["outline"]).intersection(Polygon(q["outline"]))
                    if inter.area >= min_m2:
                        out.append((a, b, p, q, inter))
    return out


def paved_lawn(ctx, min_m2: float = 0.5) -> dict[str, dict]:
    """{lawn item_id: {"m2", "why"}}: the lawn that paving on another sheet is drawn over (the overlap check). The
    greening sum leaves it out until the designer says which one is built (paving does not fix carbon)."""
    from shapely.ops import unary_union

    owner = {(s, o): it["item_id"] for it in getattr(ctx, "items", []) for s, o in it.get("_refs", [])}
    shared: dict[str, list] = {}
    where: dict[str, list[str]] = {}
    for a, b, p, q, inter in overlap_pairs(ctx, min_m2):
        if q["kind"] != "lawn" or (b.sheet_id, q["object_id"]) not in owner:
            continue
        iid = owner[(b.sheet_id, q["object_id"])]
        shared.setdefault(iid, []).append(inter)
        where.setdefault(iid, []).append(f"{p['label']} on {a.number}")
    out = {}
    for iid, polys in shared.items():
        m2 = round(unary_union(polys).area, 1)
        out[iid] = {"m2": m2, "why": f"{m2:g} m² lies under {', '.join(dict.fromkeys(where[iid]))} (the overlap check): "
                                     "left out of the greening sum until the designer says which is built"}
    return out


def overlaps(ctx, min_m2: float = 0.5) -> list[Check]:
    out = []
    green_note = {}
    if getattr(ctx, "greening", None) is not None:
        green_note = {iid: v["m2"] for iid, v in getattr(ctx, "paved_lawn", {}).items()}
    owner = {(s, o): it["item_id"] for it in getattr(ctx, "items", []) for s, o in it.get("_refs", [])}
    for a, b, p, q, inter in overlap_pairs(ctx, min_m2):
        x0, y0, x1, y1 = inter.bounds
        why = (f"{p['object_id']} ({p['area_m2']:g} m²) and {q['object_id']} ({q['area_m2']:g} m²) share "
               f"{inter.area:.1f} m² ({x1 - x0:g} × {y1 - y0:g} m): the same ground is counted twice, once as "
               "paving and once as planting. Which one is built?")
        iid = owner.get((b.sheet_id, q["object_id"]))
        if q["kind"] == "lawn" and iid in green_note:
            why += (f" Until then the greening check (Art. 302) leaves the overlap out of the lawn: "
                    f"{q['area_m2']:g} − {inter.area:.1f} = {q['area_m2'] - inter.area:.1f} m² at Gi 0.3.")
        out.append(Check(
            "area", f"{p['label']} on {a.number} overlaps {q['label']} on {b.number} by {inter.area:.0f} m²",
            "flag", ["geometry"], why,
            {"sheet_ids": [a.sheet_id, b.sheet_id], "file_ids": ctx.files_of([a.sheet_id, b.sheet_id]),
             "object_ids": [obj_ref(a.sheet_id, p["object_id"]), obj_ref(b.sheet_id, q["object_id"])]},
            numbers={"overlap_m2": round(inter.area, 2), "paving_m2": p["area_m2"], "planting_m2": q["area_m2"]}
            | ({"greening_lawn_m2": round(q["area_m2"] - inter.area, 2)} if q["kind"] == "lawn" and iid in green_note
               else {})))
    return out


def hatch_labels(ctx) -> list[Check]:
    out = []
    for sid, pre in ctx.prepass.items():
        if not ctx.sheet(sid).counted:
            continue
        for m in pre.mismatches:
            lab, hat = ctx.book.get(m.label_code), ctx.book.get(m.hatch_code)
            obj = ctx.object_at(sid, m.centre, kinds=("paving", "shrub_bed", "lawn"))
            pl, ph = ctx.price(lab.name if lab else ""), ctx.price(hat.name if hat else "")
            price = ""
            if pl and ph:
                price = (f" Your list: {lab.name} NT${pl['low']:,.0f}–{pl['high']:,.0f}, {hat.name} "
                         f"NT${ph['low']:,.0f}–{ph['high']:,.0f} per m².")
            out.append(Check(
                "area", f"Box says {m.label_code} ({lab.name if lab else '?'}), hatch is {m.hatch_code}'s "
                f"({hat.name if hat else '?'}): which item, which price?", "flag", ["geometry"],
                f"The boxed code '{m.label}' points at a {m.area_m2:g} m² area hatched {m.hatch}, which the legend keys to "
                f"{m.hatch_code} {hat.name if hat else ''}. The take-off follows the hatch and the legend ({m.hatch_code}); "
                f"the bill may price it as {m.label_code}.{price}",
                {"sheet_ids": [sid], "file_ids": ctx.files_of([sid]),
                 "object_ids": [obj_ref(sid, obj["object_id"])] if obj else []},
                numbers={"area_m2": m.area_m2, "label_code": m.label_code, "hatch_code": m.hatch_code, "hatch": m.hatch}))
    return out
