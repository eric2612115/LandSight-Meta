"""Regulation checks: a tree inside an area where greening cannot count (fire-truck space, §299), and the greening
requirement (§302) computed by landsight.rules with the site facts from the title block and the tree pit Muse Spark
read from the detail sheet (the §5 table 1 downgrade on artificial ground)."""

from __future__ import annotations

import copy
import re

from landsight.checks.base import Check, citation, obj_ref


def _en(name: str) -> str:
    try:
        from landsight.rules.species import lookup

        s = lookup(name)
        return s.en if s and s.en else name
    except Exception:
        return name


def greening_plantings(ctx, confirmed: bool | None = None) -> list:
    """The take-off's plantings as the greening rule counts them: lawn that paving on another sheet is drawn over
    (ctx.paved_lawn, from the overlap check) is left out of the lawn's area, and a tree Muse Spark proposed for an
    open outline is counted only once a person confirms it (landsight.review.pending): until then the item counts
    what geometry measured. `confirmed` None follows ctx.confirmed_view (the review computes both views)."""
    from landsight.rules import plantings_from_takeoff

    if confirmed is None:
        confirmed = bool(getattr(ctx, "confirmed_view", False))
    pending = getattr(ctx, "pending", None) or {}
    out = plantings_from_takeoff(ctx._takeoff)
    for p in out:
        hit = (getattr(ctx, "paved_lawn", None) or {}).get(p.item_id) if p.kind == "lawn" else None
        if hit:
            p.less_m2, p.less_why = hit["m2"], hit["why"]
        pend = pending.get(p.item_id) if p.kind == "tree" else None
        if pend and not confirmed:
            p.count = p.low_count = pend["counted"]
            p.source += (f"; {', '.join(pend['object_ids'])} (Muse Spark: one tree) is counted once a person confirms "
                         f"it: {pend['counted']:g} counted, {pend['proposed']:g} then")
        elif pend:
            p.confirmed = True
        factor = (getattr(ctx, "floor_factor", None) or {}).get(p.item_id)
        if factor:  # a typical-floor sheet stands for several floors (the tower)
            if p.count is not None:
                p.count = round(p.count * factor)
                p.low_count = round(p.low_count * factor) if p.low_count is not None else None
            if p.area_m2 is not None:
                p.area_m2 = round(p.area_m2 * factor, 2)
            p.source += f"; × {factor:g} floors (a typical-floor sheet)"
        for (iid, sid), f in (getattr(ctx, "soil_fail", None) or {}).items():
            if iid == p.item_id and p.area_m2 is not None:
                p.less_m2 = round(p.less_m2 + f["area_m2"], 2)
                p.less_why = ((p.less_why + "; ") if p.less_why else "") + (
                    f"{f['area_m2']:g} m² on {ctx.sheet(sid).number} sits on {f['depth']:g} m of soil, below the "
                    f"{f['need']:g} m minimum for {f['row']}")
    for p in getattr(ctx, "extra_plantings", None) or []:
        out.append(p)
    return out


def counted_note(ctx) -> str:
    """'7 Camphor counted (geometry); T-08 counts once confirmed' — or the confirmed wording."""
    pending = getattr(ctx, "pending", None) or {}
    if not pending:
        return ""
    if getattr(ctx, "confirmed_view", False):
        return " ".join(f"{p['proposed']:g} {p['label']} counted, {', '.join(p['object_ids'])} confirmed by a person."
                        for p in pending.values())
    return " ".join(f"{p['counted']:g} {p['label']} counted (closed outlines, geometry); {', '.join(p['object_ids'])}, "
                    f"which Muse Spark reads as one more tree, counts once a person confirms it ({p['proposed']:g} then)."
                    for p in pending.values())


def lane_as_ap(ctx, area_m2: float) -> dict | None:
    """The greening rule run again with Ap = the lane's measured area (D-43, resolved B): what the requirement and the
    tree fix would be IF the architect declares the strip fire-truck rescue space under §299. Nothing is subtracted in
    the main check (Ap = 0). None when the site facts or the take-off are missing."""
    if ctx.site is None or getattr(ctx, "_takeoff", None) is None:
        return None
    from landsight.rules import greening as G

    s2 = copy.copy(ctx.site)
    s2.hard_to_green_m2 = area_m2
    base = ctx.greening if ctx.greening is not None else G.check(ctx.site, greening_plantings(ctx), pit=ctx.pit)
    alt = G.check(s2, greening_plantings(ctx), pit=ctx.pit)
    if alt.required is None or base.required is None:
        return None
    fix0 = next((f for f in base.fixes if f.id == "a"), None)
    fix1 = next((f for f in alt.fixes if f.id == "a"), None)
    return {"required_ap0": round(base.required, 1), "required_with_lane_as_ap": round(alt.required, 1),
            "provided_with_lane_as_ap": round(alt.provided, 1), "still_fails": alt.status != "pass",
            "tree_fix_ap0": fix0.extra_trees if fix0 else 0, "tree_fix_with_lane_as_ap": fix1.extra_trees if fix1 else 0}


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
            numbers = {"zone_m2": z.area_m2} if z else {}
            ap_note = " The greening check keeps Ap = 0, as the drawings do not declare any hard-to-green area."
            try:
                alt = lane_as_ap(ctx, z.area_m2) if z is not None else None
            except Exception:  # noqa: BLE001 - the rules module is another owner's; the flag stands without the figure
                alt = None
            if alt is not None:
                numbers |= {k: v for k, v in alt.items() if not isinstance(v, bool)}
                numbers["with_lane_as_ap"] = "fail" if alt["still_fails"] else "pass"
                ap_note = (f" If the architect confirms this strip is fire-truck rescue space under §299, the requirement "
                           f"drops to {alt['required_with_lane_as_ap']:.1f} kgCO2e/yr — "
                           f"{'still a fail' if alt['still_fails'] else 'and the site passes'}"
                           + (f" — and the tree fix becomes +{alt['tree_fix_with_lane_as_ap']:g}" if alt["still_fails"]
                              and alt["tree_fix_with_lane_as_ap"] else "")
                           + f". Until then the greening check keeps Ap = 0 (required {alt['required_ap0']:.1f}), as the "
                           "drawings do not declare it.")
            refs = [obj_ref(sid, o["object_id"]) for o in (tree, zone) if o]
            out.append(Check(
                "regulation", f"{tree['object_id'] if tree else 'A tree'} is drawn inside the "
                f"{(ex.zone or 'exclusion zone').split('—')[0].strip().lower()} — not counted toward greening", "flag",
                ["geometry", "rule"],
                f"The canopy's centre lies inside the area labelled '{ex.zone}': a tree there blocks a lane the drawing "
                f"says to keep clear, so it is left out of the greening count until the designer moves it or the "
                f"architect accepts it.{ap_note}",
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
    keeps = keep_existing(ctx) if res.required is not None else []
    if keeps:
        sigma = next((tm.value for tm in res.terms if tm.symbol == "ΣGi·Ai"), None)
        alpha = next((tm.value for tm in res.terms if tm.symbol == "α"), None)
        if sigma is not None and alpha is not None:
            fixes += [keep_fix(k, sigma, alpha, res.required) for k in keeps]
    if res.required is not None:
        state = (f" ({before['provided']:.1f} before the tree-pit rule)" if before else "")
        species = sorted({_en(t['species']) for t in (after or before or {}).get("trees", [])}) or [it["label"] for it in trees]
        less = [p for p in greening_plantings(ctx) if p.less_m2] if getattr(ctx, "_takeoff", None) is not None else []
        why = (f"Required TCO2c = 0.5 × A′ {v.get('A′')} m² × β {v.get('β')} = {res.required:.1f}; provided (ΣGi·Ai "
               f"{v.get('ΣGi·Ai')}) × α {v.get('α')} = {res.provided:.1f} kgCO2e/yr. "
               + "".join(f"{_en(p.species)} counted as {p.area_m2 - p.less_m2:g} m², not {p.area_m2:g}: {p.less_why}. "
                         for p in less)
               + (f"One tree species ({', '.join(species)}), so ra = 0 and α = {v.get('α')}. " if len(species) == 1 else "")
               + ("Fixes: " + "; ".join(f"{f['label']} → {f['result']:g}" for f in fixes) + "." if fixes else ""))
        note = counted_note(ctx)
        pend = getattr(ctx, "pending", None) or {}
        tag = ""
        if pend:
            tag = (" · " + ", ".join(f"{p['proposed']:g} trees ({', '.join(p['object_ids'])} confirmed)"
                                     if getattr(ctx, "confirmed_view", False) else
                                     f"{p['counted']:g} trees counted, {', '.join(p['object_ids'])} to confirm"
                                     for p in pend.values()))
        why = (note + " " + why) if note else why
        out.append(Check(
            "regulation", f"Greening (Art. 302): required {res.required:.1f}, provided {res.provided:.1f}{state} — "
            f"{res.status.replace('_', ' ')}{tag}", sev.get(res.status, "review"), ["rule", "geometry"], why,
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
    elif pit is not None and after is not None and not after.get("review"):
        out.append(Check(
            "regulation", f"Tree pit {pit.area_m2:g} m² read from {detail.number}: large trees keep their class (≥ 4.0 m²)",
            "info", ["spark", "rule"], f"Muse Spark read the detail {detail.number}: {read.get('why', '')} On artificial "
            "ground a large tree needs a 4.0 m² pit and 1.0 m of soil; this pit meets both, so nothing is downgraded.",
            ev, citation=citation("STD-5-T1"), numbers=nums | {"pit_area_m2": pit.area_m2}, extra={"ok": True}))
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
        kind = "native species" if s.get("to_native", True) else "bird- or butterfly-attracting species"
        label = (f"Change {s['n']} {s.get('from_en') or _en(s['from'])} to {s.get('to_en') or _en(s['to'])}, a second "
                 f"{kind} (α → {f.alpha:.2f}); no extra trees")
    else:
        label = f"+{ch.get('add_shrub_m2')} m² of shrub bed (Gi 0.5)"
    return {"label": label, "result": f.provided, "passes": f.passes, "id": f.id, "extra_trees": f.extra_trees,
            "object_ids": list(f.tone_objects)}


# --------------------------------------------------------------------------------------------- the old-tree rule


def keep_existing(ctx) -> list[dict]:
    """The old-tree rule (point 3.6, table 2 note 2): every existing tree the plan removes that is an old tree (trunk at
    least 30 cm at 1 m; DBH stands in for it) and that the greening rule's species table knows, with what keeping it
    adds to Σ Gi·Ai: Gi × 2 × its canopy projection."""
    import math

    from landsight.checks.base import rules

    try:
        from landsight.rules.species import GI, TREE_CLASSES, lookup
    except Exception:  # noqa: BLE001
        return []
    old_cm = rules()["national"]["tree_ai_rules"]["old_tree_definition"]["min_trunk_diameter_at_1m_cm"]
    out = []
    for sid, pre in ctx.prepass.items():
        if not ctx.sheet(sid).counted:
            continue
        for ex in pre.existing:
            if not ex.to_be_removed or ex.dbh_m is None or ex.dbh_m * 100 < old_cm or not ex.canopy_r:
                continue
            words = [w for w in re.findall(r"[A-Za-z]+", ex.label or "") if w.upper() not in
                     ("EXISTING", "DBH", "CM", "TO", "BE", "REMOVED", "TREE")]
            sp = next((x for x in (lookup(" ".join(words)), *(lookup(w.capitalize()) for w in words)) if x), None)
            gi_class = sp.gi_class if sp and sp.gi_class in TREE_CLASSES else "small_tree"
            canopy = math.pi * ex.canopy_r ** 2
            gi = GI[gi_class][0]
            out.append({"tag": ex.tag, "sheet_id": sid, "dbh_cm": round(ex.dbh_m * 100), "canopy_r_m": ex.canopy_r,
                        "canopy_m2": round(canopy, 2), "gi": gi, "species": (sp.en if sp else " ".join(words).lower()),
                        "adds": round(gi * 2 * canopy, 1)})
    return out


def keep_fix(keep: dict, sum_gi_ai: float, alpha: float, required: float) -> dict:
    provided = round((sum_gi_ai + keep["adds"]) * alpha, 2)
    return {"label": f"Keep {keep['tag']} ({keep['species']}, DBH {keep['dbh_cm']} cm) instead of removing it: an old tree "
                     f"kept by the design counts 2 × its {keep['canopy_m2']:g} m² canopy (+{keep['adds']:g} to ΣGi·Ai), "
                     "if the basement leaves its root zone in natural ground",
            "result": provided, "passes": provided > required, "id": "d", "extra_trees": 0,
            "object_ids": [keep["tag"]], "adds": keep["adds"], "citation": citation("STD-OLD")}


# --------------------------------------------------------------------------------------------- Art. 305 water retention


def _permeable(label: str) -> bool:
    """Unit permeable paving by its name (landsight/data/paving.csv: permeable pavers, grass pavers and grids are
    permeable; washed-pebble finishes, concrete and granite on a rigid base are not)."""
    n = (label or "").lower()
    return any(w in n for w in ("permeable", "pervious", "grass paver", "grass grid", "honeycomb"))


def water_retention(ctx) -> list[Check]:
    """Art. 305: the water-retention index from what the take-off measured (planted areas, tree pits, permeable
    paving), computed with the specification's formulas. The drawings give neither the subsoil (f) nor the paving's
    base thickness (h) nor the beds' soil depth, so the check states what it assumed, computes the most favourable
    case the drawings allow, and asks for the rest (review)."""
    from landsight.checks.base import rules

    site = ctx.site
    if site is None or site.site_area_m2 is None or site.coverage_ratio is None or not ctx.items:
        return []
    spec = rules()["national"]["water_retention_spec"]
    a0, r = float(site.site_area_m2), min(float(site.coverage_ratio), 0.85)
    if a0 <= 300:
        return []
    t, f = float(spec["t_s"]), float(spec["f_defaults_m_per_s"]["backfill"])
    lam_c = 0.5 * (1 - r)
    q0 = a0 * f * t
    planted, paved, aggregate = 0.0, 0.0, []
    parts = []
    pend = getattr(ctx, "pending", None) or {}
    for it in ctx.items:
        if not it.get("_on_drawing", True):
            continue
        q = it.get("proposed_count") if it.get("proposed_count") is not None else it.get("geometry_count")
        if q is None:
            continue
        if it["kind"] in ("shrub_bed", "lawn"):
            less = (getattr(ctx, "paved_lawn", None) or {}).get(it["item_id"], {}).get("m2", 0.0)
            planted += float(q) - less
            parts.append(f"{it['label']} {float(q) - less:g} m²")
        elif it["kind"] == "hedge" and it.get("_row"):
            band = it["_row"]["length_m"] * 0.4
            planted += band
            parts.append(f"{it['label']} band {band:g} m²")
        elif it["kind"] == "tree" and ctx.pit is not None:
            n = pend.get(it["item_id"], {}).get("counted", q)
            pits = float(n) * ctx.pit.area_m2
            planted += pits
            parts.append(f"{n:g} tree pits × {ctx.pit.area_m2:g} m²")
        elif it["kind"] == "paving":
            if _permeable(it["label"]):
                paved += float(q)
                parts.append(f"{it['label']} {float(q):g} m² (permeable)")
            else:
                aggregate.append(f"{it['label']} {float(q):g} m²")
    h, depth = 0.25, 0.6  # the most favourable values the specification allows (h ≤ 0.25 m; soil counted to 0.6 m)
    q2_base = 0.05 * h * paved
    on_slab = bool(site.artificial_ground)
    q3 = 0.05 * planted * depth
    lam_slab = min(q3 + q2_base, q0) / q0
    q1 = planted * f * t
    q2 = 0.5 * paved * f * t + q2_base
    lam_ground = min(q1 + q2, q0) / q0
    lam = lam_slab if on_slab else lam_ground
    passes = lam > lam_c
    gov = [d.sheet_id for d in ctx.sheets if d.counted]
    where = "over the basement slab (the title block says ARTIFICIAL GROUND)" if on_slab else "on natural ground"
    why = (f"λ = Q′ / Q0 must exceed λc = 0.5 × (1 − {r:g}) = {lam_c:.2f}. Q0 = A0 {a0:,.0f} m² × f {f:g} m/s × t "
           f"{t:,.0f} s = {q0:,.0f} m³ (f: the subsoil is not on the drawings; fill soil's {f:g} m/s, table 2 note 1). "
           f"Measured: planted {planted:,.1f} m² ({'; '.join(p for p in parts if 'permeable' not in p)}), permeable "
           f"paving {paved:g} m²" + (f"; not permeable: {', '.join(aggregate)}" if aggregate else "") + ". "
           + (f"Planting {where}: Q3 = 0.05 × V3 = 0.05 × {planted:,.1f} m² × {depth:g} m = {q3:,.1f} m³ (soil counted "
              f"to the {depth:g} m maximum; the beds' depth is not on the drawings); the pavers' infiltration term needs "
              f"natural ground below, so only their base counts: 0.05 × h {h:g} m × {paved:g} m² = {q2_base:,.1f} m³ "
              f"(h at the 0.25 m maximum; no base thickness is drawn). λ = {lam_slab:.3f} — "
              f"{'above' if lam_slab > lam_c else 'below'} {lam_c:.2f} even in this most favourable reading. "
              if on_slab else "")
           + f"On natural ground the same areas would give Q1 = {q1:,.1f} m³ and Q2 = {q2:,.1f} m³, λ = {lam_ground:.3f}. "
           + ("Ask the architect for the subsoil report, the basement's extent under the landscape and the paving base; "
              "an over-slab site usually needs storage (a retention tank or an infiltration trench) to pass."
              if not passes else "Confirm the subsoil and the paving base with the architect."))
    return [Check(
        "regulation", f"Water retention (Art. 305): λ {lam:.3f} {'>' if passes else '<'} λc {lam_c:.2f} {where.split(' (')[0]} — "
        f"{'passes' if passes else 'fails'} on the drawings' own areas", "review", ["rule", "geometry"], why,
        {"sheet_ids": gov, "file_ids": ctx.files_of(gov)}, citation=citation("BTR-305"),
        numbers={"lambda": round(lam, 3), "lambda_c": round(lam_c, 3), "lambda_over_slab": round(lam_slab, 3),
                 "lambda_natural_ground": round(lam_ground, 3), "Q0_m3": round(q0, 1), "Q1_m3": round(q1, 1),
                 "Q2_m3": round(q2, 1), "Q2_base_m3": round(q2_base, 1), "Q3_m3": round(q3, 1), "A0": a0, "r": r,
                 "f_m_per_s": f, "t_s": t, "planted_m2": round(planted, 1), "permeable_m2": paved, "h_m": h,
                 "soil_depth_counted_m": depth, "on_slab": on_slab},
        extra={"citations": [citation("BTR-305"), citation("STD-WR")], "status": "pass" if passes else "fail",
               "unscored": True, "assumed": {"f_m_per_s": "fill soil default (table 2 note 1)",
                                              "h_m": "0.25, the maximum the specification counts",
                                              "soil_depth_m": "0.6, the maximum the specification counts"}})]
