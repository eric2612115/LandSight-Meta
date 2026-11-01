"""Meta clients offline: SAM box parsing, fixture replay keys, and the HTTP request shape (mock transport)."""

from __future__ import annotations

import json

import httpx
import pytest

from landsight.meta import FixtureMissing, FixtureSpark, RecordingSpark, SparkClient
from landsight.meta.sam import parse_boxes


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
