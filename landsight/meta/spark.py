"""Muse Spark 1.3 over the Meta Model API: chat completions, JSON-schema output, PNGs as data URLs.

Three calls the pipeline makes:
- classify_sheet(png) -> {kind: plan|elevation|detail|schedule|legend, confidence, why}
- group_and_read(png_with_ids, candidates) -> one verdict per candidate: {id, is_one_object, kind, label_text,
  label_meaning, implies_count, confidence, why}
- read_schedule(png) -> {rows: [{species, qty, unit, spec}], footer}
plus ask(text, pngs) -> str, a plain call without a schema (the naive baseline).

Every call takes an optional `key`: a content key (a hash of the DXF content, not of the pixels) that FixtureSpark
uses when the image hash does not match (another machine, another matplotlib build). RecordingSpark wraps a real
client and writes each response to tests/fixtures/spark/; FixtureSpark replays them offline. The API key is read
from MODEL_API_KEY and is never logged.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

BASE_URL = "https://api.meta.ai/v1"
MODEL = "muse-spark-1.3"
FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "spark"

SYSTEM = (
    "You read landscape construction drawings (local practice, labels in Traditional Chinese) for quantity "
    "take-off. Answer only from what is drawn. Conventions: 'typ.' on one symbol means every identical symbol is the "
    "same item; it never multiplies. 'N-name' on a leader (for example 8-樟樹) is the size of the group the leader "
    "points into. '×N' at a single symbol means N plants at that symbol. '@S m' along a line of length L means "
    "floor(L/S)+1 plants per drawn line."
)

SHEET_KINDS = ["plan", "elevation", "detail", "schedule", "legend"]
OBJECT_KINDS = ["tree", "existing_tree", "tree_row", "hedge", "shrub_bed", "lawn", "paving", "planter_edge",
                "annotation", "other"]

CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {"kind": {"type": "string", "enum": SHEET_KINDS}, "confidence": {"type": "number"},
                   "why": {"type": "string"}},
    "required": ["kind", "confidence", "why"],
    "additionalProperties": False,
}
GROUP_SCHEMA = {
    "type": "object",
    "properties": {"candidates": {"type": "array", "items": {
        "type": "object",
        "properties": {
            "id": {"type": "string"}, "is_one_object": {"type": "boolean"},
            "kind": {"type": "string", "enum": OBJECT_KINDS}, "label_text": {"type": "string"},
            "label_meaning": {"type": "string"}, "implies_count": {"type": "integer"},
            "confidence": {"type": "number"}, "why": {"type": "string"},
        },
        "required": ["id", "is_one_object", "kind", "label_text", "label_meaning", "implies_count", "confidence", "why"],
        "additionalProperties": False,
    }}},
    "required": ["candidates"],
    "additionalProperties": False,
}
SCHEDULE_SCHEMA = {
    "type": "object",
    "properties": {
        "rows": {"type": "array", "items": {
            "type": "object",
            "properties": {"species": {"type": "string"}, "qty": {"type": "number"}, "unit": {"type": "string"},
                           "spec": {"type": "string"}},
            "required": ["species", "qty", "unit", "spec"],
            "additionalProperties": False,
        }},
        "footer": {"type": "string"},
    },
    "required": ["rows", "footer"],
    "additionalProperties": False,
}

CLASSIFY_PROMPT = (
    "Classify this whole drawing sheet by its main view. plan: a top-down plan (planting plan, paving plan); a sheet "
    "whose main drawing is a plan is 'plan' even if it also carries a legend, a schedule table or a title block. "
    "elevation: a side view of plants or structures standing on a ground line. detail: an enlarged construction "
    "detail or section. schedule: a sheet that is mostly a table. legend: a sheet that is mostly symbols with names. "
    "Give your confidence from 0 to 1 and one sentence why."
)
GROUP_PROMPT = (
    "This image is a crop of a landscape plan (top-down view). Each candidate below is drawn in RED and tagged with "
    "its ID; it is a group of line segments that the CAD geometry could not join into one closed outline. Black line "
    "work is context (other symbols, outlines that did close, labels). For each candidate decide: is_one_object (do "
    "the red segments together form one object?), kind, label_text (the text that labels this candidate through a "
    "leader line or written right beside it, exactly as written, else empty), label_meaning, implies_count (how many "
    "plants or objects this candidate itself stands for after applying the conventions; one plant symbol with no "
    "multiplier is 1), confidence from 0 to 1, and why in one sentence.\n\nCandidates and facts measured from the "
    "CAD file:\n"
)
SCHEDULE_PROMPT = (
    "This is a plant schedule table (植栽表) cropped from a planting plan. Return one row per plant: species exactly "
    "as written, qty as a number, unit as written (株, m², m), and spec (the 規格 columns and the remarks joined into "
    "one short string). Skip the title row, the header rows and the totals line; copy the totals line into footer."
)


class SparkError(RuntimeError):
    pass


class FixtureMissing(KeyError):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def data_url(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode()


class SparkClient:
    """Real calls to Muse Spark. `transport` lets tests inject an httpx transport; nothing else is global."""

    def __init__(self, api_key: str | None = None, model: str = MODEL, base_url: str = BASE_URL,
                 timeout: float = 180.0, transport: httpx.BaseTransport | None = None):
        self.api_key = api_key or os.environ.get("MODEL_API_KEY", "")
        if not self.api_key:
            raise SparkError("MODEL_API_KEY is not set")
        self.model = model
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.timeout = timeout
        self.transport = transport
        self.log: list[dict] = []  # one entry per call: call, seconds, usage (never the key)

    def _post(self, call: str, body: dict) -> dict:
        started = time.monotonic()
        with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
            r = client.post(self.url, json=body, headers={"Authorization": f"Bearer {self.api_key}"})
        seconds = time.monotonic() - started
        if r.status_code != 200:
            raise SparkError(f"{call}: HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        self.log.append({"call": call, "seconds": round(seconds, 2), "usage": data.get("usage") or {}})
        return data

    def _chat(self, call: str, text: str, images: list[bytes], schema: dict | None) -> dict | str:
        content = [{"type": "text", "text": text}] + [{"type": "image_url", "image_url": {"url": data_url(p)}}
                                                       for p in images]
        body = {"model": self.model, "messages": [{"role": "user", "content": content}], "reasoning_effort": "low"}
        if schema is not None:
            body["messages"].insert(0, {"role": "system", "content": SYSTEM})
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": call, "schema": schema}}
        data = self._post(call, body)
        message = data["choices"][0]["message"]["content"]
        return json.loads(message) if schema is not None else message

    def classify_sheet(self, png: bytes, key: str = "") -> dict:
        return self._chat("classify_sheet", CLASSIFY_PROMPT, [png], CLASSIFY_SCHEMA)

    def group_and_read(self, png: bytes, candidates: list[dict], key: str = "") -> list[dict]:
        facts = "\n".join(f"- {c['id']}: {c['facts']}" for c in candidates)
        return self._chat("group_and_read", GROUP_PROMPT + facts, [png], GROUP_SCHEMA)["candidates"]

    def read_schedule(self, png: bytes, key: str = "") -> dict:
        return self._chat("read_schedule", SCHEDULE_PROMPT, [png], SCHEDULE_SCHEMA)

    def ask(self, text: str, pngs: list[bytes], key: str = "") -> str:
        return self._chat("ask", text, pngs, None)


class RecordingSpark:
    """Wraps a live API client; writes every response to `fixture_dir` as {call}__{key}.json for FixtureSpark."""

    def __init__(self, inner: SparkClient, fixture_dir: Path = FIXTURES):
        self.inner = inner
        self.dir = Path(fixture_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.log = inner.log

    def _record(self, call: str, images: list[bytes], key: str, result, extra: dict | None = None):
        image_sha = sha256(b"".join(sha256(p).encode() for p in images))
        name = f"{call}__{sha256((key or image_sha).encode())[:16]}.json"
        last = self.inner.log[-1] if self.inner.log else {}
        payload = {"call": call, "image_sha256": image_sha, "content_key": key, "model": self.inner.model,
                   "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "seconds": last.get("seconds"), "usage": last.get("usage"), **(extra or {}), "result": result}
        (self.dir / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1))
        return result

    def classify_sheet(self, png: bytes, key: str = "") -> dict:
        return self._record("classify_sheet", [png], key, self.inner.classify_sheet(png))

    def group_and_read(self, png: bytes, candidates: list[dict], key: str = "") -> list[dict]:
        return self._record("group_and_read", [png], key, self.inner.group_and_read(png, candidates),
                            {"candidates": candidates})

    def read_schedule(self, png: bytes, key: str = "") -> dict:
        return self._record("read_schedule", [png], key, self.inner.read_schedule(png))

    def ask(self, text: str, pngs: list[bytes], key: str = "") -> str:
        return self._record("ask", pngs, key, self.inner.ask(text, pngs), {"prompt": text})


class FixtureSpark:
    """Replays recorded responses, keyed on (call, image sha256) and, failing that, (call, content key)."""

    def __init__(self, fixture_dir: Path = FIXTURES):
        self.by_image: dict[tuple[str, str], dict] = {}
        self.by_key: dict[tuple[str, str], dict] = {}
        self.log: list[dict] = []
        for f in sorted(Path(fixture_dir).glob("*.json")):
            rec = json.loads(f.read_text())
            if "call" not in rec or "result" not in rec:
                continue
            self.by_image[(rec["call"], rec["image_sha256"])] = rec
            if rec.get("content_key"):
                self.by_key[(rec["call"], rec["content_key"])] = rec

    def _get(self, call: str, images: list[bytes], key: str):
        image_sha = sha256(b"".join(sha256(p).encode() for p in images))
        rec = self.by_image.get((call, image_sha)) or self.by_key.get((call, key))
        if rec is None:
            raise FixtureMissing(f"no fixture for {call} (image {image_sha[:12]}, key {key[:24]})")
        self.log.append({"call": call, "seconds": rec.get("seconds") or 0.0, "usage": rec.get("usage") or {},
                         "fixture": True})
        return rec["result"]

    def classify_sheet(self, png: bytes, key: str = "") -> dict:
        return self._get("classify_sheet", [png], key)

    def group_and_read(self, png: bytes, candidates: list[dict], key: str = "") -> list[dict]:
        return self._get("group_and_read", [png], key)

    def read_schedule(self, png: bytes, key: str = "") -> dict:
        return self._get("read_schedule", [png], key)

    def ask(self, text: str, pngs: list[bytes], key: str = "") -> str:
        return self._get("ask", pngs, key)
