"""The sample firm's decisions: what an estimator might confirm or dismiss, with a note, on the review of the sample
package (samples/greenfield, its recorded answers). Firm memory learns from these the way it would learn from a real
firm's decisions made on the screen (POST /api/runs/{id}/checks/{check}/decision). Invented for the demo; the check
ids are the sample review's (its answer key's error ids)."""

from __future__ import annotations

import sqlite3

from landsight.store.db import REPO

SAMPLE = REPO / "samples" / "greenfield"
SAMPLE_FIRM = "sample"
SAMPLE_DECISIONS = [  # check id, decision, the estimator's note
    ("E09", "confirm", "Fire lane first, before any money: the permit fails without it. Ask them to move the tree out "
                       "of the lane."),
    ("E14", "confirm", "A greening fail goes near the top. Offer the cheapest fix that passes (a second native "
                       "species), not more trees."),
    ("E15", "confirm", "We never price a tree removal without the city's tree survey. Ask for it."),
    ("E12", "confirm", "On slabs and roofs we propose shallow-rooted planting rather than more soil: Chinese ixora in "
                       "planters with less than 0.45 m of soil."),
    ("E21", "confirm", "Arithmetic always comes first among the money points: it moves their total. Ask politely, "
                       "'please check the subtotal', never 'error'."),
    ("E02.2", "confirm", "Row 6: reduce to the drawn quantity. The drawing governs; give both numbers."),
    ("E22.2", "confirm", "Same as the camphor row: a bill quantity that differs from the drawing always goes back, "
                         "with both numbers."),
    ("E17", "confirm", "We price hedges per plant, never per metre. If Duranta is short at the nursery we offer "
                       "Chinese ixora at the same spacing."),
    ("E13", "confirm", "Ask for 4 per m² as the schedule says. Where the spec only says azalea we propose Rhododendron "
                       "simsii, the native azalea."),
    ("E19", "confirm", "Under our installed list: we quote our own range (installed, 12 months of maintenance "
                       "included), never their number. Say it politely."),
    ("E20", "confirm", "More than 15% outside our list gets queried; inside 15% we let it go."),
    ("E29", "confirm", "Ask for every sheet the index lists before we price. Missing sheets go in the same email, "
                       "which we keep short and sign as the estimating team."),
    ("E23", "dismiss", "Hidden or old sheets are their housekeeping, not worth a line in the email."),
    ("E18", "dismiss", "A misspelt row does not change the price. Never raise spelling."),
    ("E16", "dismiss", "We measure off the scale bar ourselves; a wrong title-block scale is not worth their time."),
    ("E01", "dismiss", "Open outlines in the CAD we confirm on our side; the developer does not need to hear about "
                       "line work."),
]


def seed_sample(conn: sqlite3.Connection, folder=SAMPLE) -> dict:
    """Review the sample from its recorded answers (the Meta Model API reader, whatever LANDSIGHT_READER says) into
    this database and record the sample firm's decisions on that run."""
    from landsight.store import service

    pk = service.package_for_folder(conn, folder)
    run = service.review_package(conn, pk["package_id"], live=False, reader="api")
    ids = {c["check_id"] for c in run["checks"]}
    done, skipped = [], []
    for cid, decision, note in SAMPLE_DECISIONS:
        if cid in ids:
            service.set_decision(conn, run["run_id"], cid, decision, note, source="sample")
            done.append(cid)
        else:
            skipped.append(cid)
    return {"run_id": run["run_id"], "package": run["package"]["name"], "decisions": done, "skipped": skipped}
