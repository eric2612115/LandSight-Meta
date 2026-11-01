"""Naive baseline, each variant recorded once: one plain Muse Spark call (no schema, no geometry) with full-sheet
PNGs and the question "How many trees are on this site? Answer with a number and one sentence." Refuses to
overwrite an existing record: the film shows whatever it said, no retries.

  uv run python scripts/naive_probe.py                                  # L-1 + L-2, schedule on L-1
  uv run python scripts/naive_probe.py --no-schedule --out naive_count_no_schedule.json
  uv run python scripts/naive_probe.py --no-schedule --sheets L-1 --out naive_count_l1_only.json
  uv run python scripts/naive_probe.py --no-schedule --sheets L-2 --out naive_count_l2_only.json

--no-schedule generates the site with the 植栽表 on its own sheet L-4 and leaves L-4 out of the call.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from landsight.dxf import load, render_png  # noqa: E402
from landsight.meta.spark import FIXTURES, SparkClient  # noqa: E402
from landsight.synth import LEVELS, generate  # noqa: E402

PROMPT = "How many trees are on this site? Answer with a number and one sentence."


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheets", nargs="+", default=["L-1", "L-2"])
    ap.add_argument("--no-schedule", action="store_true", help="植栽表 on its own sheet L-4, not sent")
    ap.add_argument("--out", default="naive_count.json")
    args = ap.parse_args()
    out = FIXTURES / args.out
    if out.exists():
        sys.exit(f"{out} already exists; each baseline is recorded once")
    level = replace(LEVELS["m4"], schedule_on_own_sheet=args.no_schedule)
    with tempfile.TemporaryDirectory() as tmp:
        key = generate(tmp, level)
        pngs = [render_png(load(key["paths"][s])) for s in args.sheets]
    client = SparkClient()
    answer = client.ask(PROMPT, pngs)
    record = {
        "call": "naive_count", "model": client.model, "prompt": PROMPT, "schema": None, "site_level": level.tag,
        "schedule_in_view": not args.no_schedule and "L-1" in args.sheets,
        "images": [{"sheet": s, "sha256": hashlib.sha256(p).hexdigest(), "bytes": len(p)} for s, p in zip(args.sheets, pngs)],
        "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seconds": client.log[-1]["seconds"], "usage": client.log[-1]["usage"], "answer": answer,
        "truth": {"trees_on_site": 8, "naive_double_count_l1_l2": 16},
    }
    FIXTURES.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, ensure_ascii=False, indent=1))
    print(json.dumps({k: record[k] for k in ("recorded_at", "seconds", "answer")}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
