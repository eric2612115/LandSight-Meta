"""Meta clients offline: SAM box parsing, fixture replay keys, and the HTTP request shape (mock transport)."""

from __future__ import annotations

import json

import httpx
import pytest

from landsight.meta import FixtureMissing, FixtureSpark, RecordingSpark, SparkClient
from landsight.meta.sam import decode, parse_boxes
from landsight.meta.spark import FIXTURES


def test_parse_boxes_reads_inclusive_corners_and_confidence():
    text = ("<0f>0<|box;x1=10;y1=20;x2=29;y2=59;w=100;h=200;c=0.95|><|mask;x=0;y=0;c=0.95;data=20,40,!!$x;y=1|>,"
            "1<|box;x1=50;y1=50;x2=99;y2=199;w=100;h=200|>\n")
    boxes = parse_boxes(text)
    assert boxes[0]["box"] == pytest.approx([0.10, 0.10, 0.30, 0.30])
    assert boxes[0]["score"] == pytest.approx(0.95)
    assert boxes[1]["box"] == pytest.approx([0.5, 0.25, 1.0, 1.0]) and boxes[1]["score"] == 1.0
    assert parse_boxes("") == [] and parse_boxes("<0f>0<|box;x1=5;y1=5;x2=5;y2=5;w=0;h=0|>") == []


def _fake_transport(seen: list):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        content = json.dumps({"kind": "plan", "confidence": 0.9, "why": "a plan"})
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}], "usage": {"total_tokens": 7}})
    return httpx.MockTransport(handler)


def test_spark_request_shape_and_record_replay(tmp_path):
    seen: list = []
    client = SparkClient(api_key="test-key", transport=_fake_transport(seen))
    rec = RecordingSpark(client, tmp_path)
    assert rec.classify_sheet(b"png-bytes", key="sheet-key")["kind"] == "plan"
    body = seen[0]
    assert body["model"] == "muse-spark-1.3" and body["reasoning_effort"] == "low"
    assert body["response_format"]["type"] == "json_schema"
    image = body["messages"][1]["content"][1]
    assert image["type"] == "image_url" and image["image_url"]["url"].startswith("data:image/png;base64,")
    assert "test-key" not in json.dumps(json.loads(next(tmp_path.glob("*.json")).read_text()))

    replay = FixtureSpark(tmp_path)
    assert replay.classify_sheet(b"png-bytes")["kind"] == "plan"  # by image hash
    assert replay.classify_sheet(b"other pixels", key="sheet-key")["kind"] == "plan"  # by content key
    with pytest.raises(FixtureMissing):
        replay.classify_sheet(b"other pixels", key="unknown")


SAM_FIXTURES = sorted((FIXTURES.parent / "sam").glob("*.json"))


@pytest.mark.parametrize("path", SAM_FIXTURES, ids=lambda p: p.stem)
def test_recorded_sam_masks_decode_to_the_recorded_areas(path):
    rec = json.loads(path.read_text())
    masks, diagnostics = decode(rec["raw_output"])
    assert diagnostics == [] and len(masks) == rec["n_masks"]
    assert [m.area_px for m in masks] == [m["area_px"] for m in rec["masks"]]
    mx, my = rec["metres_per_pixel"]
    for m, r in zip(masks, rec["masks"]):
        assert m.area_px * mx * my == pytest.approx(r["area_m2"], abs=0.01)


def test_sam_finds_the_coloured_beds_and_paving_within_one_and_a_half_percent():
    def matched(name):
        rec = json.loads((FIXTURES.parent / "sam" / f"{name}.json").read_text())
        return {m["match"]["label"]: (m["area_m2"], m["match"]["truth_m2"]) for m in rec["masks"] if m["match"]}

    found = matched("L-1_filled__green-rectangle") | matched("L-3_filled__grey-area") | matched("L-3_filled__beige-area")
    for label in ("杜鵑", "草皮", "透水磚", "洗石子", "植草磚"):
        area, truth = found[label]
        assert abs(area - truth) <= 0.015 * truth, label
    assert json.loads((FIXTURES.parent / "sam" / "L-3_lines__paving.json").read_text())["n_masks"] == 0


def test_metres_per_pixel_of_a_render(site):
    from landsight.dxf import load, metres_per_pixel, pixel_to_metres, render_window

    model = load(site("m4")["paths"]["L-1"])
    x0, y0, x1, y1 = render_window(model)
    assert (x0, x1) == pytest.approx((-4.6, 78.6)) and (y0, y1) == pytest.approx((-10.6, 34.6))
    mx, my = metres_per_pixel(model, (2100, 1140))
    assert mx == pytest.approx(83.2 / 2100) and my == pytest.approx(45.2 / 1140)
    assert pixel_to_metres(model, (2100, 1140), 0, 0) == pytest.approx((x0, y1))
