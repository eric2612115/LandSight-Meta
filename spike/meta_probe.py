"""Spike: does Meta's SAM 3.1 see a 'tree' in a CAD line drawing, and can Muse Spark read the label?

Reads MODEL_API_KEY from the environment (never printed). Request shapes follow Meta's Responses / Chat
Completions protocols. Run: uv run python spike/meta_probe.py spike/out/messy.png
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

SAM_URL = "https://api.meta.ai/v1/responses"
SPARK_URL = "https://api.meta.ai/v1/chat/completions"
_BOX = re.compile(r"<\|box;((?:[a-z0-9]+=[-+0-9.eE]+;?)+)\|>")


def sam(key: str, b64: str, phrase: str) -> tuple[list[dict], float, str]:
    body = {
        "model": "sam-3.1",
        "input": [{"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": phrase},
            {"type": "input_image", "image_url": f"data:image/png;base64,{b64}"},
        ]}],
        "metadata": {"include_confidence": "true", "mask_encoding": "one_bit"},
    }
    t = time.monotonic()
    r = httpx.post(SAM_URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=60)
    dt = time.monotonic() - t
    if r.status_code != 200:
        return [], dt, f"HTTP {r.status_code}: {r.text[:300]}"
    text = "".join(p.get("text", "") for it in r.json().get("output", []) if it.get("type") == "message"
                   for p in it.get("content", []) if p.get("type") == "output_text")
    boxes = []
    for m in _BOX.finditer(text):
        f = {k: float(v) for k, v in (kv.split("=", 1) for kv in m.group(1).split(";") if kv)}
        boxes.append({"x1": f["x1"], "y1": f["y1"], "x2": f["x2"], "y2": f["y2"], "c": round(f.get("c", -1), 3)})
    return boxes, dt, f"{len(text)} chars of output"


def spark(key: str, b64: str) -> tuple[dict, float, dict]:
    schema = {
        "type": "object",
        "properties": {
            "labels": {"type": "array", "items": {"type": "object", "properties": {
                "text": {"type": "string"}, "means": {"type": "string"},
                "implies_count": {"type": "string"}}, "required": ["text", "means", "implies_count"]}},
            "tree_symbols_drawn": {"type": "integer"},
            "trees_to_quote": {"type": "integer"},
            "reasoning": {"type": "string"},
        },
        "required": ["labels", "tree_symbols_drawn", "trees_to_quote", "reasoning"],
        "additionalProperties": False,
    }
    body = {
        "model": "muse-spark-1.3",
        "messages": [
            {"role": "system", "content": "You read landscape construction drawings for quantity take-off. "
             "Answer only from what is drawn. 'typ.' means typical: the symbol stands for every instance of that item."},
            {"role": "user", "content": [
                {"type": "text", "text": "This is a planting plan fragment. List every text label, what it means, "
                 "how many tree symbols are drawn, and how many trees should be quoted."},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
            ]},
        ],
        "response_format": {"type": "json_schema", "json_schema": {"name": "takeoff", "schema": schema}},
        "reasoning_effort": "low",
    }
    t = time.monotonic()
    r = httpx.post(SPARK_URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=120)
    dt = time.monotonic() - t
    if r.status_code != 200:
        return {"error": f"HTTP {r.status_code}: {r.text[:300]}"}, dt, {}
    data = r.json()
    return json.loads(data["choices"][0]["message"]["content"]), dt, data.get("usage") or {}


if __name__ == "__main__":
    key = os.environ.get("MODEL_API_KEY")
    if not key:
        sys.exit("MODEL_API_KEY not set")
    png = Path(sys.argv[1])
    b64 = base64.b64encode(png.read_bytes()).decode()
    for phrase in ("tree", "tree symbol", "circle", "rectangle"):
        boxes, dt, note = sam(key, b64, phrase)
        print(f"SAM '{phrase}': {len(boxes)} boxes in {dt:.1f}s ({note})")
        for b in boxes:
            print("   ", b)
    out, dt, usage = spark(key, b64)
    print(f"SPARK in {dt:.1f}s, usage={usage}")
    print(json.dumps(out, ensure_ascii=False, indent=1))
