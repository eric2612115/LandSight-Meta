"""Record the real Meta calls behind the film's conditional builds (demo/SCRIPT.md), once each:

  points   Muse Spark group_and_read on the m4 site's T-08 crop, with the grounding-points schema (1 call)
  legend   Muse Spark read_legend on the legend box of the L-1 and L-3 filled renders, then SAM 3.1 with exactly the
           prompts meta.sam_plan builds from Spark's colour words (2 Spark calls + 1 SAM call per prompt)
  detail   Muse Spark classify_sheet and read_detail on the L-6 tree-pit detail (tests/fixtures/detail, or --detail
           PATH for another detail sheet) (2 calls)

  set -a; . ../Meta/.env; set +a; uv run python scripts/record_conditional.py points legend detail

Spark answers go to tests/fixtures/spark/ (RecordingSpark), SAM answers to tests/fixtures/sam/spark_legend/. A step
whose fixtures already exist is not called again (one run per prompt, no fishing); --force re-records it.
The controlled SAM test ("beige area" on L-3 line work) is a probe: scripts/sam_probe.py --live --only.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import sam_probe  # noqa: E402

from landsight.dxf import load, render_png, render_window  # noqa: E402
from landsight.geometry import find_regions  # noqa: E402
from landsight.meta import sam as samlib  # noqa: E402
from landsight.meta.sam_plan import legend_crop, prompts_from_legend, run_prompts  # noqa: E402
from landsight.meta.spark import FIXTURES as SPARK_FIXTURES  # noqa: E402
from landsight.meta.spark import FixtureMissing, FixtureSpark, RecordingSpark, SparkClient  # noqa: E402
from landsight.synth import LEVELS, generate  # noqa: E402
from landsight.takeoff import run  # noqa: E402

SAM_LEGEND = ROOT / "tests" / "fixtures" / "sam" / "spark_legend"
DETAIL = ROOT / "tests" / "fixtures" / "detail" / "L-6.dxf"


def _recorded(call: str, png: bytes, key: str) -> bool:
    """A recording of this call on this image (or this content key) exists."""
    try:
        getattr(FixtureSpark(SPARK_FIXTURES), call)(png, key=key)
    except FixtureMissing:
        return False
    return True


class OnlyLive:
    """Replays every call from the fixtures except `live_calls`, which go to the recording client: the pipeline runs
    exactly as the product does, and only the calls being re-recorded reach the API."""

    def __init__(self, live: RecordingSpark, live_calls: set[str]):
        self.fixtures, self.live, self.live_calls, self.log = FixtureSpark(SPARK_FIXTURES), live, live_calls, []

    def __getattr__(self, name):
        target = self.live if name in self.live_calls else self.fixtures

        def call(*args, **kwargs):
            out = getattr(target, name)(*args, **kwargs)
            self.log.append(target.log[-1])
            return out
        return call


def points(site: dict, spark: RecordingSpark, force: bool) -> None:
    """Re-ask Muse Spark about the open candidates of L-1 (T-08) with the points prompt; the rest replays."""
    old = [json.loads(f.read_text()) for f in SPARK_FIXTURES.glob("group_and_read__*.json")]
    if any("points:" in r.get("prompt", "") for r in old) and not force:
        print("points: group_and_read already recorded with the points prompt: not called again")
        return
    result = run([site["paths"]["L-1"]], OnlyLive(spark, {"group_and_read"}))
    for ref, v in result.spark.candidates.items():
        req = result.requests[ref]
        print(f"points: {ref} -> {len(v.get('points') or [])} points, kind {v.get('kind')}, confidence "
              f"{v.get('confidence')}, {req['seconds']} s, crop {req['crop_px']}")


def legend(site: dict, spark: RecordingSpark, force: bool) -> None:
    SAM_LEGEND.mkdir(parents=True, exist_ok=True)
    for sheet in ("L-1", "L-3"):
        model = load(site["paths"][sheet])
        filled = render_png(model, filled=True)
        region = next(r for r in find_regions(model) if r.kind == "legend")
        crop, box = legend_crop(filled, region.polygon.bounds, render_window(model))
        key = f"{model.signature()}:legend"
        if _recorded("read_legend", crop, key) and not force:
            rows = FixtureSpark(SPARK_FIXTURES).read_legend(crop, key=key)
            print(f"legend {sheet}: read_legend already recorded: not called again")
        else:
            rows = spark.read_legend(crop, key=key)
            print(f"legend {sheet}: Spark read {len(rows)} entries in {spark.log[-1]['seconds']} s: "
                  + "; ".join(f"{r['swatch_colour_word']} ({r['kind']}) = {r['label']}" for r in rows))
        prompts, skipped = prompts_from_legend(rows)
        for s in skipped:
            print(f"legend {sheet}: skipped {s.get('label')!r} ({s.get('kind')}): {s['why']}")
        todo = [p for p in prompts if force or not (SAM_LEGEND / f"{sheet}_filled__{sam_probe.slug(p['prompt'])}.json").exists()]
        size = Image.open(io.BytesIO(filled)).size
        for p, call in zip(todo, run_prompts(filled, todo, samlib.call)):
            rec = sam_probe.record(filled, size, f"{sheet}_filled", sheet, p["prompt"], model, site, call["text"],
                                   call["seconds"], call["error"], prompt_source="spark_legend",
                                   legend={"colour": p["colour"], "kind": p["kind"], "labels": p["labels"],
                                           "crop_px": box, "spark_call": "read_legend"})
            (SAM_LEGEND / f"{sheet}_filled__{sam_probe.slug(p['prompt'])}.json").write_text(
                json.dumps(rec, ensure_ascii=False, indent=1))
            print(f"legend {sheet}: SAM {p['prompt']!r} -> {rec['n_masks']} masks, {call['seconds']} s {call['error'] or ''}")


def detail(spark: RecordingSpark, force: bool, path: Path = DETAIL) -> None:
    model = load(path)
    png = render_png(model)
    key = model.signature()
    for call, k in (("classify_sheet", key), ("read_detail", f"{key}:detail")):
        if _recorded(call, png, k) and not force:
            print(f"detail: {call} already recorded: not called again")
            continue
        out = getattr(spark, call)(png, key=k)
        print(f"detail: {call} -> {json.dumps(out, ensure_ascii=False)} ({spark.log[-1]['seconds']} s)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("steps", nargs="+", choices=["points", "legend", "detail"])
    ap.add_argument("--force", action="store_true", help="re-record a step whose fixtures exist")
    ap.add_argument("--detail", type=Path, default=DETAIL,
                    help="the detail sheet to read (default: the stand-in L-6; the sample package's L-6 when it lands)")
    args = ap.parse_args()
    spark = RecordingSpark(SparkClient())
    with tempfile.TemporaryDirectory() as tmp:
        site = generate(Path(tmp), LEVELS["m4"])
        if "points" in args.steps:
            points(site, spark, args.force)
        if "legend" in args.steps:
            legend(site, spark, args.force)
        if "detail" in args.steps:
            detail(spark, args.force, args.detail)
    return 0


if __name__ == "__main__":
    sys.exit(main())
