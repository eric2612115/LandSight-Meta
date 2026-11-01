"""Run the take-off on the synthetic site at five messiness levels (plus the schedule dispute) and print the error
table for the README.

  uv run python scripts/eval.py              # real Muse Spark calls (MODEL_API_KEY)
  uv run python scripts/eval.py --record     # real calls, saved as test fixtures
  uv run python scripts/eval.py --fixtures   # offline replay

Columns: trees and hedge as proposed / quoted ('-' = flagged, waiting for a person); count error = |proposed -
truth| summed over counted items; area error = worst |proposed - truth| / truth over area items; flagged = items
not agreed; wrongly confident = items agreed with a quote that differs from the answer key (the number that must
stay 0).
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from landsight.meta import FixtureSpark, RecordingSpark, SparkClient  # noqa: E402
from landsight.synth import LEVELS, generate  # noqa: E402
from landsight.takeoff import format_items, run  # noqa: E402

ROWS = [(name, m) for name, m in LEVELS.items()] + [("m4+dispute", replace(LEVELS["m4"], schedule_mismatch=True))]
AREA_KINDS = ("shrub_bed", "lawn", "paving")


def score(result, key) -> dict:
    by = {(it.kind, it.label): it for it in result.items}
    count_err, area_err, wrong = 0.0, 0.0, 0
    for kind, species in key["totals"].items():
        for sp, truth in species.items():
            it = by.get((kind, sp))
            got = it.proposed_count if it and it.proposed_count is not None else 0
            if kind in AREA_KINDS:
                area_err = max(area_err, abs(got - truth) / truth * 100)
            elif kind != "planter_edge":
                count_err += abs(got - truth)
            if it and it.agreed and abs((it.quote_count or 0) - truth) > max(0.01 * truth, 0.5):
                wrong += 1
    truth_keys = {(k, sp) for k, d in key["totals"].items() for sp in d}
    wrong += sum(1 for it in result.items if it.agreed and (it.kind, it.label) not in truth_keys and it.quote_count)

    def pq(kind, sp):
        it = by.get((kind, sp))
        return f"{it.proposed_count}/{it.quote_count if it.quote_count is not None else '-'}" if it else "0/-"

    return {"trees": pq("tree", "樟樹"), "hedge": pq("hedge", "金露花"), "count_err": count_err,
            "area_err": area_err, "flagged": sum(1 for it in result.items if not it.agreed), "wrong": wrong}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", action="store_true")
    ap.add_argument("--record", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true", help="print each level's item table")
    args = ap.parse_args()
    spark = FixtureSpark() if args.fixtures else SparkClient()
    if args.record:
        spark = RecordingSpark(spark)
    head = ["level", "messiness", "樟樹 (8)", "金露花 (182)", "count err", "area err %", "flagged", "wrongly confident",
            "Spark calls", "s"]
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    with tempfile.TemporaryDirectory() as tmp:
        for name, m in ROWS:
            key = generate(Path(tmp) / name, m)
            result = run([key["paths"][s] for s in ("L-1", "L-2", "L-3")], spark)
            s = score(result, key)
            if args.verbose:
                print(f"\n## {name} ({m.tag})\n{format_items(result.items, result.notes)}\n")
            lines.append(f"| {name} | {m.tag} | {s['trees']} | {s['hedge']} | {s['count_err']:g} | {s['area_err']:.1f} | "
                         f"{s['flagged']} | {s['wrong']} | {result.calls} | {result.seconds:.1f} |")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
