"""The gauge's two states on the greening check (demo/SCRIPT.md beat 8, D-37): `before_downgrade` and
`after_downgrade`, each with its provided figure and its computed fixes, read from the rules result
(landsight.rules.greening.check). Both null, with the reason, when no pit applies."""

from __future__ import annotations

from landsight.checks.regulation import _en, _fix


def _fix_dict(f: dict, alpha0: float) -> dict:
    class F:  # the rules' Fix as an object, for regulation._fix
        pass

    o = F()
    for k, v in f.items():
        setattr(o, k, v)
    o.tone_objects = f.get("tone_objects") or []
    out = _fix(o)
    out["alpha"], out["alpha_before"], out["change"] = f.get("alpha"), alpha0, f.get("change")
    return out


def _state(st: dict) -> dict:
    return {"provided": st["provided"], "required": st["required"], "status": st["status"], "alpha": st["alpha"],
            "ra": st["ra"], "sum_gi_ai": st["sum_gi_ai"],
            "trees": [{"label": _en(t["species"]), "count": t["count"], "gi": t["gi"], "ai_per_tree": t["ai_per_tree"],
                       "product": t["product"], "pit_note": t["pit_note"]} for t in st["trees"]],
            "fixes": [_fix_dict(f, st["alpha"]) for f in st["fixes"]]}


def downgrade_states(res, sheet_of=lambda s: s) -> dict:
    if res is None or res.after_downgrade is None:
        return {"before_downgrade": None, "after_downgrade": None,
                "downgrade_note": "no tree pit on artificial ground was read from a detail sheet"}
    b, a = res.before_downgrade, res.after_downgrade
    pit = a["pit"]
    after = _state(a) | {
        "pit": {"sheet_id": sheet_of(pit["from_sheet"]), "width_m": pit["width_m"], "length_m": pit["length_m"],
                "area_m2": pit["area_m2"], "soil_depth_m": pit["soil_depth_m"], "on_slab": pit["on_slab"],
                "by": pit["by"], "why": pit["why"]},
        "artificial_ground": a["artificial_ground"], "rule": a["rule"], "review": a["review"],
        "downgraded": [{"label": _en(d["species"]), "count": d["count"], "from_gi": d["from_gi"], "to_gi": d["to_gi"]}
                       for d in a["downgraded"]],
        "repriced": {k: {"extra_trees": v["extra_trees"], "result": v["provided"]} for k, v in a["repriced"].items()}}
    return {"before_downgrade": _state(b), "after_downgrade": after}
