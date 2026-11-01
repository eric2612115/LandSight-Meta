"""SAM 3.1 over the Meta Model API (Responses protocol): one noun phrase per request, every match returned.

Request: POST /v1/responses, model "sam-3.1", one user message with an input_text (the phrase) and an input_image
(a data URL); metadata include_confidence "true" (a string) and mask_encoding "one_bit". The answer is a line of
tokens in output[].content[].text, one record per match, for example

    <0f>0<|box;x1=491;y1=585;x2=828;y2=838;w=2400;h=1600;c=0.949|><|mask;...;data=...|>,1<|box;...

Boxes are source pixels with x2/y2 inclusive; w/h is the image size; c is present when asked for. No match is an
empty text. Masks are ignored here; areas come from boxes or, later, from decoding the mask payload.
"""

from __future__ import annotations

import base64
import os
import re
import time

import httpx

SAM_URL = "https://api.meta.ai/v1/responses"
_BOX = re.compile(r"<\|box;((?:[a-z0-9]+=[-+0-9.eE]+;?)+)\|>")  # numeric fields only: mask data never matches


def parse_boxes(text: str) -> list[dict]:
    """Box tokens as {box: [x0, y0, x1, y1] as fractions of the image (edges, not inclusive pixels), score}."""
    found = []
    for m in _BOX.finditer(text or ""):
        f = {k: float(v) for k, v in (kv.split("=", 1) for kv in m.group(1).split(";") if kv)}
        w, h = f.get("w", 0.0), f.get("h", 0.0)
        if w <= 0 or h <= 0 or not {"x1", "y1", "x2", "y2"} <= f.keys():
            continue
        b = [f["x1"] / w, f["y1"] / h, (f["x2"] + 1) / w, (f["y2"] + 1) / h]
        b = [min(1.0, max(0.0, v)) for v in b]
        if b[2] > b[0] and b[3] > b[1]:
            found.append({"box": b, "score": f.get("c", 1.0)})
    return found


def output_text(response_json: dict) -> str:
    return "".join(part.get("text", "") for item in response_json.get("output", []) if item.get("type") == "message"
                   for part in item.get("content", []) if part.get("type") == "output_text")


def sam(png: bytes, phrase: str, api_key: str | None = None, timeout: float = 60.0) -> tuple[list[dict], float]:
    """Segment every match of `phrase` in a PNG; returns (boxes, seconds)."""
    key = api_key or os.environ.get("MODEL_API_KEY", "")
    body = {
        "model": "sam-3.1",
        "input": [{"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": phrase},
            {"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(png).decode()},
        ]}],
        "metadata": {"include_confidence": "true", "mask_encoding": "one_bit"},
    }
    started = time.monotonic()
    r = httpx.post(SAM_URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=timeout)
    seconds = time.monotonic() - started
    r.raise_for_status()
    return parse_boxes(output_text(r.json())), seconds
