"""SAM 3.1 over the Meta Model API (Responses protocol): one noun phrase per request, every match returned.

Request: POST /v1/responses, model "sam-3.1", one user message with an input_text (the phrase) and an input_image
(a data URL); metadata include_confidence "true" (a string) and mask_encoding "one_bit". The answer is a line of
tokens in output[].content[].text, one record per match, for example

    <0f>0<|box;x1=491;y1=585;x2=828;y2=838;w=2400;h=1600;c=0.949|><|mask;...;data=H,W,!payload|>,1<|box;...

Boxes are source pixels with x2/y2 inclusive; w/h is the image size; c is present when asked for. No match is an
empty text. Masks are box-local rasters, base85 encoded (`!` one_bit, `~` lossless); they are decoded with Meta's
own parser package `meta_sam_parser`, and a mask's area is its set pixels scaled from the raster to its box.
"""

from __future__ import annotations

import base64
import os
import re
import time
from dataclasses import dataclass

import httpx
import numpy as np

SAM_URL = "https://api.meta.ai/v1/responses"
MODEL = "sam-3.1"
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


@dataclass
class Mask:
    object_id: str
    box: tuple[int, int, int, int]  # source pixels, half-open (left, top, right, bottom)
    score: float | None
    raster: np.ndarray  # bool, box-local, resampled to the box size (rows = box height)

    @property
    def area_px(self) -> int:
        return int(self.raster.sum())

    def full(self, width: int, height: int) -> np.ndarray:
        """The mask on the whole image (bool, height x width)."""
        out = np.zeros((height, width), dtype=bool)
        l, t, r, b = self.box
        out[t:b, l:r] = self.raster[: b - t, : r - l]
        return out


def decode(text: str) -> tuple[list[Mask], list[str]]:
    """Every mask in a SAM output text (decoded with meta_sam_parser), plus the parser's diagnostics."""
    from meta_sam_parser import (CompletedOutcome, SegmentationBoxRecord, SegmentationMaskRecord,
                                 decode_mask_to_raster, image_segmentation_format)

    parser = image_segmentation_format().create_parser()
    parser.push((text or "") + "\n")
    result = parser.finish(CompletedOutcome()).result
    scores = {r.object_id: r.confidence for r in result.records if isinstance(r, SegmentationBoxRecord)}
    masks = []
    for r in result.records:
        if not isinstance(r, SegmentationMaskRecord):
            continue
        m = r.mask
        raster = np.frombuffer(decode_mask_to_raster(m), dtype=np.uint8).reshape(m.height, m.width).astype(bool)
        l, t, rr, b = (int(v) for v in (r.bounds.left, r.bounds.top, r.bounds.right, r.bounds.bottom))
        bw, bh = rr - l, b - t
        if (m.width, m.height) != (bw, bh):  # nearest-neighbour resample of a box-local raster onto its box
            ys = np.minimum((np.arange(bh) + 0.5) * m.height / bh, m.height - 1).astype(int)
            xs = np.minimum((np.arange(bw) + 0.5) * m.width / bw, m.width - 1).astype(int)
            raster = raster[ys][:, xs]
        conf = r.confidence if r.confidence is not None else scores.get(r.object_id)
        masks.append(Mask(r.object_id, (l, t, rr, b), conf, raster))
    return masks, [f"{d.code}: {d.message}" for d in result.diagnostics]


def call(png: bytes, phrase: str, api_key: str | None = None, timeout: float = 120.0,
         transport: httpx.BaseTransport | None = None) -> tuple[str, float]:
    """One SAM 3.1 request for one noun phrase; returns (output text, seconds). The key is never logged."""
    key = api_key or os.environ.get("MODEL_API_KEY", "")
    body = {
        "model": MODEL,
        "input": [{"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": phrase},
            {"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(png).decode()},
        ]}],
        "metadata": {"include_confidence": "true", "mask_encoding": "one_bit"},
    }
    started = time.monotonic()
    with httpx.Client(timeout=timeout, transport=transport) as client:
        r = client.post(SAM_URL, json=body, headers={"Authorization": f"Bearer {key}"})
    seconds = time.monotonic() - started
    if r.status_code != 200:
        raise RuntimeError(f"sam-3.1: HTTP {r.status_code}: {r.text[:300]}")
    return output_text(r.json()), seconds


def sam(png: bytes, phrase: str, api_key: str | None = None, timeout: float = 60.0) -> tuple[list[dict], float]:
    """Segment every match of `phrase` in a PNG; returns (boxes, seconds)."""
    text, seconds = call(png, phrase, api_key, timeout)
    return parse_boxes(text), seconds
