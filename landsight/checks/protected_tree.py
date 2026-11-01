"""Existing trees: the trunk size written on the plan (DBH from the label) against the municipal tree-protection
thresholds of the site's city (local: Art. 3 and Art. 11, from landsight/data/rules.json). Always 'needs review':
designation is the city's, not the drawing's."""

from __future__ import annotations

from landsight.checks.base import Check, citation, obj_ref, local_dbh_threshold


def protected(ctx) -> list[Check]:
    out = []
    city = ctx.city
    for sid, pre in ctx.prepass.items():
        if not any(d.sheet_id == sid and d.counted for d in ctx.sheets):
            continue
        for ex in pre.existing:
            obj = ctx.object_at(sid, ex.centre, kinds=("existing_tree",), excluded=True)
            refs = [obj_ref(sid, obj["object_id"])] if obj else []
            ev = {"sheet_ids": [sid], "file_ids": ctx.files_of([sid]), "object_ids": refs}
            status = "marked TO BE REMOVED" if ex.to_be_removed else "shown as existing"
            if city == "local":
                dbh_min, girth_min = local_dbh_threshold()
                cite, extra = citation("TC-TREE-3"), [citation("TC-TREE-3"), citation("TC-TREE-11")]
                rule = f"local's tree-protection ordinance (Art. 3: DBH ≥ {dbh_min:g} m or girth ≥ {girth_min:g} m)"
            else:
                dbh_min, cite, extra = 0.8, None, []
                rule = f"a municipal tree-protection rule for {city or 'the site'} (not in the reference data)"
            if ex.dbh_m is None:
                out.append(Check("protected_tree", f"{ex.tag}: existing tree {status}, trunk size not on the plan", "review",
                                 ["geometry", "rule"], f"'{ex.label}': measure the trunk at 1.3 m before the permit; "
                                 f"{rule} may protect it.", ev, citation=cite, extra={"citations": extra}))
                continue
            if ex.dbh_m >= dbh_min:
                out.append(Check(
                    "protected_tree", f"{ex.tag} existing tree DBH {ex.dbh_m * 100:.0f} cm {status}: may be a protected "
                    "tree — needs review", "review", ["geometry", "rule"],
                    f"The label reads '{ex.label}'. DBH {ex.dbh_m:g} m reaches the {dbh_min:g} m threshold of {rule}. "
                    "Protection is the city's designation, not the drawing's: removal needs a tree record and a "
                    "protection or transplant plan approved before work starts (Art. 11). The dashed canopy (r "
                    f"{ex.canopy_r:g} m) and root protection zone" + (f" (r {ex.rpz_r:g} m)" if ex.rpz_r else "")
                    + " are not counted as planting.", ev, citation=cite,
                    numbers={"dbh_m": ex.dbh_m, "threshold_m": dbh_min, "canopy_r_m": ex.canopy_r, "rpz_r_m": ex.rpz_r},
                    extra={"citations": extra}))
            else:
                out.append(Check("protected_tree", f"{ex.tag} existing tree DBH {ex.dbh_m * 100:.0f} cm: below the "
                                 f"{dbh_min:g} m threshold", "info", ["geometry", "rule"], f"'{ex.label}'.", ev,
                                 citation=cite, numbers={"dbh_m": ex.dbh_m, "threshold_m": dbh_min}, extra={"ok": True}))
    return out
