"""Regulation checks: a tree inside an area where greening cannot count (fire-truck space, §299), and the greening
requirement (§302) computed by landsight.rules with the site facts from the title block and the tree pit Muse Spark
read from the detail sheet (the §5 table 1 downgrade on artificial ground)."""

from __future__ import annotations

import copy

from landsight.checks.base import Check, citation, obj_ref


def _en(name: str) -> str:
    try:
        from landsight.rules.species import lookup

        s = lookup(name)
        return s.en if s and s.en else name
    except Exception:
        return name


def fire_lane(ctx) -> list[Check]:
    out = []
    for sid, pre in ctx.prepass.items():
        if not ctx.sheet(sid).counted:
            continue
        for ex in pre.excluded:
            if ex.kind != "in_zone":
                continue
            tree = ctx.object_at(sid, ex.centre, kinds=("tree",), excluded=True)
            zone = ctx.object_at(sid, ex.centre, kinds=("fire_lane",), excluded=True)
            z = next((z for z in pre.zones if z.label == ex.zone), None)
            numbers = {"zone_m2": z.area_m2 if z else None}
            ap_note = ""
            if ctx.site is not None and z is not None:
                try:
                    from landsight.rules import greening as G

                    req0 = 0.5 * G.a_prime(ctx.site)[0] * G.beta(ctx.site)[0]
                    s2 = copy.copy(ctx.site)
                    s2.hard_to_green_m2 = z.area_m2
                    req1 = 0.5 * G.a_prime(s2)[0] * G.beta(s2)[0]
                    numbers |= {"required_ap0": round(req0, 1), "required_with_lane_as_ap": round(req1, 1)}
                    ap_note = (f" Counted as hard-to-green area (Ap = {z.area_m2:g} m²) the lane also lowers the requirement "
                               f"from {req0:.1f} to {req1:.1f} kgCO2e/yr; the greening check keeps Ap = 0, as the "
                               "drawings do not declare it.")
                except Exception:
                    pass
            refs = [obj_ref(sid, o["object_id"]) for o in (tree, zone) if o]
            out.append(Check(
                "regulation", f"{tree['object_id'] if tree else 'A tree'} is drawn inside the "
                f"{(ex.zone or 'exclusion zone').split('—')[0].strip().lower()} — it cannot count toward greening", "flag",
                ["geometry", "rule"],
                f"The canopy's centre lies inside the area labelled '{ex.zone}'. Fire-truck space is named among the areas "
                f"where greening is impracticable (Art. 299), so the tree is left out of the greening count; it also "
                f"blocks a lane the drawing says to keep clear.{ap_note}",
                {"sheet_ids": [sid], "file_ids": ctx.files_of([sid]), "object_ids": refs},
                citation=citation("BTR-299"), numbers=numbers))
    return out


def greening(ctx) -> list[Check]:
    res = ctx.greening
    if res is None:
        return []
    sev = {"fail": "fail", "needs_review": "review", "pass": "info", "skipped": "info", "not_applicable": "info"}
    v = {tm.symbol: tm.value for tm in res.terms}
    trees = [it for it in ctx.items if it["kind"] == "tree"]
    tree_refs = [obj_ref(s, o) for it in trees for s, o in it["_refs"]]
    gov = [d.sheet_id for d in ctx.sheets if d.counted]
    out = []
    pit = ctx.pit
    detail = next((d for d in ctx.sheets if d.source == "dxf" and d.kind == "detail" and d.sheet_id in ctx.details), None)
    before = res.before_downgrade
    after = res.after_downgrade
    fixes = [_fix(f) for f in res.fixes]
    if res.required is not None:
        state = (f" ({before['provided']:.1f} before the tree-pit rule)" if before else "")
        species = sorted({_en(t['species']) for t in (after or before or {}).get("trees", [])}) or [it["label"] for it in trees]
        why = (f"Required TCO2c = 0.5 × A′ {v.get('A′')} m² × β {v.get('β')} = {res.required:.1f}; provided (ΣGi·Ai "
               f"{v.get('ΣGi·Ai')}) × α {v.get('α')} = {res.provided:.1f} kgCO2e/yr. "
               + (f"One tree species ({', '.join(species)}), so ra = 0 and α = {v.get('α')}. " if len(species) == 1 else "")
               + ("Fixes: " + "; ".join(f"{f['label']} → {f['result']:g}" for f in fixes) + "." if fixes else ""))
        out.append(Check(
            "regulation", f"Greening (Art. 302): required {res.required:.1f}, provided {res.provided:.1f}{state} — "
            f"{res.status.replace('_', ' ')}", sev.get(res.status, "review"), ["rule", "geometry"], why,
            {"sheet_ids": gov + ([detail.sheet_id] if detail else []), "file_ids": ctx.files_of(gov), "object_ids": tree_refs},
            citation=citation("BTR-302"),
            numbers={"required": res.required, "provided": res.provided, "A0": v.get("A0"), "Ap": v.get("Ap"),
                     "r": v.get("r"), "A_prime": v.get("A′"), "beta": v.get("β"), "alpha": v.get("α"), "ra": v.get("ra"),
                     "sum_gi_ai": v.get("ΣGi·Ai"), "provided_before_pit_rule": before["provided"] if before else None},
            fixes=fixes, extra={"citations": [citation("BTR-302"), citation("STD-F")], "status": res.status}))
    if detail is None:
        return out
    read = ctx.details.get(detail.sheet_id) or {}
    pit_refs = [obj_ref(detail.sheet_id, o["object_id"]) for o in ctx.objects.get(detail.sheet_id, []) if o["kind"] == "tree_pit"]
    sch = ctx.schedule_sheets()
    bill_cells = ctx.bill_cells(lambda r: "pit" in r.description.lower(), "description")
    ev = {"sheet_ids": [detail.sheet_id] + sch + gov, "file_ids": ctx.files_of([detail.sheet_id] + sch) + ctx.bill_files(),
          "object_ids": pit_refs + ctx.schedule_objects(), "cells": bill_cells}
    nums = {"pit_w_m": read.get("pit_w_m"), "pit_l_m": read.get("pit_l_m"), "soil_depth_m": read.get("soil_depth_m"),
            "on_slab": read.get("on_slab")}
    if after and after.get("downgraded"):
        down = after["downgraded"]
        n = sum(d["count"] for d in down)
        out.append(Check(
            "regulation", f"Tree pit {pit.width_m:g} × {pit.length_m:g} m = {pit.area_m2:g} m² on artificial ground: "
            f"{n:g} large trees count as small (Gi {down[0]['from_gi']:.1f} → {down[0]['to_gi']:.1f})", "flag", ["spark", "rule"],
            f"Muse Spark read the detail {detail.number}: {read.get('why', '')} On artificial ground a large tree needs a "
            f"4.0 m² pit; one of 1.5–4 m² counts as a small tree. The schedule and the bill call them large trees. "
            f"TCO2 {before['provided']:g} → {after['provided']:g}; the cheapest fix changes with it.",
            ev, citation=citation("STD-5-T1"),
            numbers=nums | {"pit_area_m2": pit.area_m2, "trees_downgraded": n, "provided_before": before["provided"],
                            "provided_after": after["provided"]},
            extra={"repriced": after.get("repriced")}))
    elif pit is not None:
        out.append(Check(
            "regulation", f"Tree pit {pit.area_m2:g} m² read from {detail.number}: the pit rule needs review", "review",
            ["spark", "rule"], f"Muse Spark read the detail: {read.get('why', '')} The rules module did not apply the "
            "artificial-ground pit table to this site; check the pit against 4.0 m² (large tree) and 1.5 m² (small tree).",
            ev, citation=citation("STD-5-T1"), numbers=nums | {"pit_area_m2": pit.area_m2}))
    else:
        out.append(Check("regulation", f"Detail {detail.number}: no tree pit read — the pit rule needs review", "review",
                         ["spark"], "Muse Spark did not return pit dimensions from the detail sheet.", ev,
                         citation=citation("STD-5-T1"), numbers=nums))
    return out


def _fix(f) -> dict:
    ch = f.change
    if "add_trees" in ch:
        sp, n = next(iter(ch["add_trees"].items()))
        label = f"+{n} {_en(sp)}, the same species"
    elif "swap" in ch:
        s = ch["swap"]
        label = (f"Change {s['n']} {s.get('from_en') or _en(s['from'])} to {s.get('to_en') or _en(s['to'])}, a second "
                 f"native species (α → {f.alpha:.2f}); no extra trees")
    else:
        label = f"+{ch.get('add_shrub_m2')} m² of shrub bed (Gi 0.5)"
    return {"label": label, "result": f.provided, "passes": f.passes, "id": f.id, "extra_trees": f.extra_trees,
            "object_ids": list(f.tone_objects)}
