"""Nothing a model says is counted until a person confirms it (README, D-04). A tree Muse Spark proposes for an open
outline (T-08) stays out of the greening sum and out of the schedule comparison until it is confirmed: the review
computes the checks that depend on it twice, and each such check carries `pending_items` and `if_confirmed` (title,
why, severity, numbers, fixes, gauge states). `apply_confirmed` swaps a check to its confirmed state once every one of
its pending items is confirmed (the API after POST /api/items/{id}/confirm, landsight.store after a stored
confirmation)."""

from __future__ import annotations

SWAP = ("title", "why", "severity", "numbers", "fixes", "status", "before_downgrade", "after_downgrade",
        "downgrade_note", "counted_trees")


def pending_trees(items: list[dict]) -> dict[str, dict]:
    """item_id -> {counted, proposed, object_ids}: tree items whose count includes what Muse Spark proposed for open
    line work geometry could not close (not agreed by every source)."""
    out = {}
    for it in items:
        if it.get("kind") != "tree" or it.get("agreed") or not it.get("spark"):
            continue
        g, p = it.get("geometry_count"), it.get("proposed_count")
        if g is None or p is None or float(p) <= float(g):
            continue
        out[it["item_id"]] = {"counted": g, "proposed": p, "object_ids": [it["spark"].get("object_id")],
                              "label": it.get("label", "")}
    return out


def variant(check_dict: dict) -> dict:
    return {k: check_dict[k] for k in SWAP if k in check_dict}


def apply_confirmed(run: dict, confirmed: set[str]) -> dict:
    """Swap every check whose pending items are all confirmed to its confirmed state (in place; returns run)."""
    for c in run.get("checks", []):
        pend = c.get("pending_items") or []
        alt = c.get("if_confirmed")
        if not pend or not alt or c.get("confirmed_state"):
            continue
        if all(i in confirmed for i in pend):
            c.update(alt)
            c["confirmed_state"] = True
    return run
