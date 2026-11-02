"""Muse Spark for the package review: the calls the review adds (sheet kind + title block, image triage, document
summary, bill-row alignment) plus the take-off's own calls, all recorded to and replayed from tests/fixtures/review/.

Modes:
- "fixtures": every answer is replayed; a missing recording raises FixtureMissing (the caller notes it and degrades).
- "live": every call goes to the Meta Model API and is recorded. With resume=True (default) a call whose recording
  already exists for the same content key and prompt is replayed instead of asked again (one run per prompt).

Each recording is {call, image_sha256, content_key, model, recorded_at, seconds, usage, prompt, result}, the format
landsight.meta.FixtureSpark reads. Keys are content hashes (DXF signature, PDF text, image bytes) plus a hash of the
prompt and schema, so editing a prompt never replays an answer to another prompt. The API key is read from
MODEL_API_KEY and is never logged or written.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

try:  # the meta module's constants, when present
    from landsight.meta.spark import BASE_URL, MODEL
except Exception:  # pragma: no cover - the other module is being edited; keep our own defaults
    BASE_URL, MODEL = "https://api.meta.ai/v1", "muse-spark-1.3"

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "review"

SYSTEM = ("You review landscape construction drawing packages (drawings, bills of quantities, specifications) for a "
          "landscape design firm that is deciding whether to take a job. Answer only from what you are shown; never "
          "guess values that are not visible.")

SHEET_KINDS = ["plan", "elevation", "detail", "schedule", "legend", "cover", "background"]
DISCIPLINES = ["planting", "paving", "irrigation", "lighting", "general", "metalwork", "other"]

CLASSIFY_PROMPT = (
    "This image is one whole sheet of a landscape drawing package. Return:\n"
    "- kind: 'plan' (a top-down plan whose own subject is planting or paving: a planting plan, a paving plan, or an "
    "enlarged plan of part of the site); 'elevation' (a side view of plants or structures standing on a ground line); "
    "'detail' (a construction detail or section of one element, such as a tree pit or a drain cover); 'schedule' (a "
    "sheet that is mostly a table, such as a plant schedule); 'legend' (mostly symbols with their names); 'cover' (a "
    "cover sheet with a drawing index or general notes); 'background' (a plan of another trade, such as irrigation, "
    "lighting or drainage, where trees and beds appear only as thin reference line work under that trade's symbols).\n"
    "- discipline: planting, paving, irrigation, lighting, general, metalwork or other.\n"
    "- enlarged_partial: true if the sheet shows only part of the site at a larger scale (for example it has a match "
    "line or a key plan); match_line: true if a match line is drawn.\n"
    "- title_block: the values written in the title block: number (the drawing number), title, revision, date, scale; "
    "an empty string for anything not shown.\n"
    "- index: if the sheet carries a drawing index, every sheet number it lists, in order; otherwise an empty list.\n"
    "- confidence from 0 to 1, and why in one sentence."
)
CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": SHEET_KINDS},
        "discipline": {"type": "string", "enum": DISCIPLINES},
        "enlarged_partial": {"type": "boolean"}, "match_line": {"type": "boolean"},
        "title_block": {"type": "object", "properties": {k: {"type": "string"} for k in
                                                          ("number", "title", "revision", "date", "scale")},
                        "required": ["number", "title", "revision", "date", "scale"], "additionalProperties": False},
        "index": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "number"}, "why": {"type": "string"},
    },
    "required": ["kind", "discipline", "enlarged_partial", "match_line", "title_block", "index", "confidence", "why"],
    "additionalProperties": False,
}

IMAGE_PROMPT = (
    "This image was found in a landscape drawing package, among the CAD files. Decide what it is: 'material_photo' (a "
    "close photo or texture of a surface material such as paving, stone, gravel or timber), 'drawing' (a plan, "
    "elevation, detail or diagram), 'document' (a scanned page of text or a table) or 'other'. If it is a material "
    "photo, name the material in a few plain words and say which of these finish codes from the package's legends it "
    "most likely shows, or 'none': {codes}. Give your confidence from 0 to 1 and why in one sentence about what you "
    "see."
)
IMAGE_SCHEMA = {
    "type": "object",
    "properties": {"kind": {"type": "string", "enum": ["material_photo", "drawing", "document", "other"]},
                   "material": {"type": "string"}, "matches_code": {"type": "string"},
                   "confidence": {"type": "number"}, "why": {"type": "string"}},
    "required": ["kind", "material", "matches_code", "confidence", "why"],
    "additionalProperties": False,
}

DOCUMENT_PROMPT = (
    "Below is the text of a document found in a landscape drawing package (extracted from a PDF). Classify it: 'spec' "
    "(a standard or specification that sets rules, dimensions or measurement methods), 'quote' (a supplier's priced "
    "quotation), 'bill' (a bill of quantities) or 'document' (anything else: meeting notes, review comments, "
    "checklists, letters). Give its title as written, a one-sentence summary, up to six key facts a reviewer pricing "
    "the landscape works must know (keep numbers exactly as written), and, if the document lists documents or "
    "deliverables, each one with its status as written (for example 'required'). Confidence from 0 to 1; why in one "
    "sentence.\n\n--- document text ---\n"
)
DOCUMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["spec", "quote", "bill", "document"]},
        "title": {"type": "string"}, "summary": {"type": "string"},
        "key_facts": {"type": "array", "items": {"type": "string"}},
        "required": {"type": "array", "items": {"type": "object", "properties": {
            "item": {"type": "string"}, "status": {"type": "string"}}, "required": ["item", "status"],
            "additionalProperties": False}},
        "confidence": {"type": "number"}, "why": {"type": "string"},
    },
    "required": ["kind", "title", "summary", "key_facts", "required", "confidence", "why"],
    "additionalProperties": False,
}

ALIGN_PROMPT = (
    "Match each row of a developer's bill of quantities to the item on the drawings that it prices.\n\nDrawing items "
    "(code | name | botanical name | kind | unit on the drawing):\n{items}\n\nBill rows (row id | description | spec | "
    "unit):\n{rows}\n\nFor every bill row return row_id, item_code (one code from the drawing items, or 'none' when the "
    "row prices something that is not a drawn item, such as tree pits, soil or irrigation), confidence from 0 to 1 "
    "(lower it when the description is misspelt, abbreviated or ambiguous), and why in one short sentence."
)
ALIGN_SCHEMA = {
    "type": "object",
    "properties": {"rows": {"type": "array", "items": {"type": "object", "properties": {
        "row_id": {"type": "string"}, "item_code": {"type": "string"}, "confidence": {"type": "number"},
        "why": {"type": "string"}}, "required": ["row_id", "item_code", "confidence", "why"],
        "additionalProperties": False}}},
    "required": ["rows"],
    "additionalProperties": False,
}


RASTER_PLAN_PROMPT = (
    "This image is one page of a landscape drawing package: a coloured plan delivered as a picture, with no CAD file "
    "behind it. Read what is needed to measure it:\n"
    "- entries: every filled area type and plant symbol the plan uses, from the legend box and from areas labelled "
    "directly on the plan (a bed or a lawn labelled in place is an entry too): label, the text exactly as written; "
    "swatch_colour_word, the fill colour you see, as one or two plain English colour words an image segmentation "
    "model can be prompted with (for example 'light green', 'grey'), never the material's name; kind, 'area' for a "
    "filled region, 'symbol' for a plant symbol such as a tree, 'line' for a line or strip such as a hedge; where, "
    "'legend' or 'plan'; x and y, for an entry labelled on the plan, the centre of its label text normalised to "
    "0-1000 (x from the left edge, y from the top edge of the image), 0 and 0 for a legend entry.\n"
    "- legend_box: the legend box's corners, x0 y0 (top left) and x1 y1 (bottom right), each normalised to 0-1000 "
    "with x from the left edge and y from the top edge of the image; all 0 when there is no legend box.\n"
    "- scale_bar: the graphic scale bar: x_start and x_end, the x of its zero end and of its far labelled end, y, the "
    "bar's centre line, all normalised to 0-1000 as above, and distance_m, the distance in metres its far label "
    "states; all 0 when there is none.\n"
    "- title_scale: the scale written in the title block (for example '1:200'), empty if none.\n"
    "- confidence from 0 to 1, and why in one sentence."
)
BOX = {"type": "object", "properties": {k: {"type": "number"} for k in ("x0", "y0", "x1", "y1")},
       "required": ["x0", "y0", "x1", "y1"], "additionalProperties": False}
RASTER_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "entries": {"type": "array", "items": {"type": "object", "properties": {
            "label": {"type": "string"}, "swatch_colour_word": {"type": "string"},
            "kind": {"type": "string", "enum": ["area", "symbol", "line"]},
            "where": {"type": "string", "enum": ["legend", "plan"]}, "x": {"type": "number"}, "y": {"type": "number"}},
            "required": ["label", "swatch_colour_word", "kind", "where", "x", "y"], "additionalProperties": False}},
        "legend_box": BOX,
        "scale_bar": {"type": "object", "properties": {k: {"type": "number"} for k in ("x_start", "x_end", "y",
                                                                                         "distance_m")},
                      "required": ["x_start", "x_end", "y", "distance_m"], "additionalProperties": False},
        "title_scale": {"type": "string"}, "confidence": {"type": "number"}, "why": {"type": "string"},
    },
    "required": ["entries", "legend_box", "scale_bar", "title_scale", "confidence", "why"],
    "additionalProperties": False,
}


FLOOR_PROMPT = (
    "This image is one sheet of a landscape drawing package for a building with several floors. Read the title block "
    "and the notes:\n"
    "- floors: every floor this sheet stands for, each as written without the 'F' ('3', '10', 'R' for a roof written "
    "'RF', '1' for the ground floor); a title such as '3F, 6F, 9F' stands for three floors; empty if the sheet is not "
    "tied to floors.\n"
    "- typical: true if this one sheet stands for several identical floors.\n"
    "- floor_label: the floor words exactly as the title block writes them.\n"
    "- ground: where this sheet's planting sits: 'grade' (natural ground), 'over_basement' (a ground floor over a "
    "basement slab), 'podium', 'balcony' (balconies or terraces of the typical floors), 'roof', 'mixed' (a detail "
    "sheet covering several), or 'unknown'.\n"
    "- soil: every soil depth written on the sheet: planting ('tree', 'shrub', 'lawn', or 'any' when a planter's "
    "soil is given without naming a plant); ground (as above, for that entry); applies_to, the place or floor it is "
    "written for, as written; depth_m in metres (1000 mm is 1.0); text, the words as written.\n"
    "- confidence from 0 to 1, and why in one sentence."
)
FLOOR_SCHEMA = {
    "type": "object",
    "properties": {
        "floors": {"type": "array", "items": {"type": "string"}}, "typical": {"type": "boolean"},
        "floor_label": {"type": "string"},
        "ground": {"type": "string", "enum": ["grade", "over_basement", "podium", "balcony", "roof", "mixed", "unknown"]},
        "soil": {"type": "array", "items": {"type": "object", "properties": {
            "planting": {"type": "string", "enum": ["tree", "shrub", "lawn", "any"]},
            "ground": {"type": "string", "enum": ["grade", "over_basement", "podium", "balcony", "roof", "mixed",
                                                  "unknown"]},
            "applies_to": {"type": "string"}, "depth_m": {"type": "number"}, "text": {"type": "string"}},
            "required": ["planting", "ground", "applies_to", "depth_m", "text"], "additionalProperties": False}},
        "confidence": {"type": "number"}, "why": {"type": "string"},
    },
    "required": ["floors", "typical", "floor_label", "ground", "soil", "confidence", "why"],
    "additionalProperties": False,
}


class FixtureMissing(KeyError):
    pass


class SparkUnavailable(RuntimeError):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _image_sha(images: list[bytes]) -> str:
    return sha256(b"".join(sha256(p).encode() for p in images))


def _prompt_tag(prompt: str, schema: dict | None) -> str:
    return sha256((prompt + json.dumps(schema or {}, sort_keys=True)).encode())[:8]


def _png_or_jpeg_url(data: bytes) -> str:
    mime = "image/jpeg" if data[:3] == b"\xff\xd8\xff" else "image/png"
    return f"data:{mime};base64," + base64.b64encode(data).decode()


class ReviewSpark:
    """Record / replay Muse Spark for the review. `log` holds one entry per answer used (live or replayed); answers
    reused inside one run (same call and key) are memoised and not logged twice."""

    def __init__(self, mode: str = "fixtures", fixture_dir: Path | str = FIXTURES, resume: bool = True,
                 timeout: float = 180.0, transport: httpx.BaseTransport | None = None, fresh: int = 0):
        if mode not in ("fixtures", "live"):
            raise ValueError(mode)
        self.mode, self.resume, self.timeout, self.transport = mode, resume, timeout, transport
        # live only: re-ask this many calls that already have a recording (-1: every one). The new answer is used in
        # this run and written to <fixture_dir>/fresh/ with its raw envelope and response id; the recording it
        # re-asked is left as it was, so replays never change.
        self.fresh_left = fresh if mode == "live" else 0
        if not resume and mode == "live":
            self.fresh_left = -1
        self.dir = Path(fixture_dir)
        self.log: list[dict] = []
        self.errors: list[str] = []
        self._lock = threading.Lock()
        self._memo: dict[tuple[str, str], object] = {}
        self.by_image: dict[tuple[str, str], dict] = {}
        self.by_key: dict[tuple[str, str], dict] = {}
        self._load()
        self.api_key = os.environ.get("MODEL_API_KEY", "") if mode == "live" else ""
        if mode == "live" and not self.api_key:
            raise SparkUnavailable("live mode needs MODEL_API_KEY")
        self._client = None  # landsight.meta.SparkClient for the take-off's calls, created on first use

    # ------------------------------------------------------------------------------------------ fixtures
    def _load(self) -> None:
        if not self.dir.is_dir():
            return
        for f in sorted(self.dir.glob("*.json")):
            try:
                rec = json.loads(f.read_text())
            except ValueError:
                continue
            if "call" not in rec or "result" not in rec:
                continue
            rec["fixture"] = f.name
            for index, k in ((self.by_image, rec.get("image_sha256")), (self.by_key, rec.get("content_key"))):
                if k:
                    old = index.get((rec["call"], k))
                    if old is None or (rec.get("recorded_at") or "") >= (old.get("recorded_at") or ""):
                        index[(rec["call"], k)] = rec

    def _lookup(self, call: str, image_sha: str, key: str, image_fallback: bool = True) -> dict | None:
        rec = self.by_key.get((call, key)) if key else None
        if rec is None and image_sha and image_fallback:
            rec = self.by_image.get((call, image_sha))
        return rec

    def _record(self, call: str, image_sha: str, key: str, prompt: str, result, seconds: float, usage: dict,
                extra: dict | None = None, raw: dict | None = None, fresh_of: dict | None = None) -> dict:
        """Write one recording: the parsed result, and (from 2026-11-02, D-61) the raw response envelope and its id. A
        fresh re-ask goes to fresh/ under a timestamped name and never replaces the recording it re-asked."""
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        base = f"{call}__{sha256((key or image_sha).encode())[:16]}"
        rec = {"call": call, "image_sha256": image_sha, "content_key": key, "model": MODEL, "recorded_at": stamp,
               "seconds": seconds, "usage": usage, "prompt": prompt, **(extra or {}), "result": result,
               "response_id": (raw or {}).get("id"), "raw": raw}
        if fresh_of is not None:
            name = f"fresh/{base}__{stamp.replace(':', '').replace('-', '')[:15]}.json"
            n = 2
            while (self.dir / name).exists():  # two re-asks in one second keep both
                name = f"fresh/{base}__{stamp.replace(':', '').replace('-', '')[:15]}_{n}.json"
                n += 1
            rec |= {"fresh_of": fresh_of.get("fixture"), "same_as_recorded": result == fresh_of.get("result")}
        else:
            name = f"{base}.json"
        (self.dir / name).parent.mkdir(parents=True, exist_ok=True)
        (self.dir / name).write_text(json.dumps(rec, ensure_ascii=False, indent=1))
        rec["fixture"] = name
        if fresh_of is None:
            with self._lock:
                self.by_key[(call, key)] = rec
                if image_sha:
                    self.by_image[(call, image_sha)] = rec
        return rec

    def _take_fresh(self) -> bool:
        with self._lock:
            if self.fresh_left == 0:
                return False
            if self.fresh_left > 0:
                self.fresh_left -= 1
            return True

    # ------------------------------------------------------------------------------------------ the one path
    def _answer(self, call: str, key: str, images: list[bytes], prompt: str, live, extra: dict | None = None,
                image_fallback: bool = True):
        image_sha = _image_sha(images) if images else ""
        memo_key = (call, key or image_sha)
        with self._lock:
            if memo_key in self._memo:
                return self._memo[memo_key]
        rec = self._lookup(call, image_sha, key, image_fallback)
        fresh = rec is not None and self.mode == "live" and self._take_fresh()
        if rec is not None and not fresh and (self.mode == "fixtures" or self.resume):
            entry = {"call": call, "seconds": rec.get("seconds") or 0.0, "usage": rec.get("usage") or {},
                     "fixture": rec["fixture"], "recorded": True, "key": key, "prompt": rec.get("prompt", ""),
                     "candidates": rec.get("candidates"), "recorded_at": rec.get("recorded_at"),
                     "model": rec.get("model") or MODEL, "fixture_dir": str(self.dir)}
            result = rec["result"]
        elif self.mode == "fixtures":
            raise FixtureMissing(f"no recording for {call} (key {key[:40]}, image {image_sha[:12]})")
        else:
            started = time.monotonic()
            result, usage, raw = live()
            seconds = round(time.monotonic() - started, 2)
            new = self._record(call, image_sha, key, prompt, result, seconds, usage, extra, raw,
                               fresh_of=rec if fresh else None)
            entry = {"call": call, "seconds": seconds, "usage": usage, "fixture": new["fixture"], "recorded": False,
                     "key": key, "prompt": prompt, "candidates": (extra or {}).get("candidates"),
                     "recorded_at": new["recorded_at"], "model": MODEL, "fixture_dir": str(self.dir),
                     "response_id": new.get("response_id"), "raw": raw}
            if fresh:
                entry |= {"fresh_of": rec["fixture"], "same_as_recorded": new.get("same_as_recorded")}
            result = new["result"]
        entry["response"] = result
        with self._lock:
            self.log.append(entry)
            self._memo[memo_key] = result
        return result

    def _chat(self, call: str, text: str, images: list[bytes], schema: dict) -> tuple[dict, dict, dict]:
        content = [{"type": "text", "text": text}] + [{"type": "image_url", "image_url": {"url": _png_or_jpeg_url(p)}}
                                                       for p in images]
        body = {"model": MODEL, "reasoning_effort": "low",
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": content}],
                "response_format": {"type": "json_schema", "json_schema": {"name": call, "schema": schema}}}
        with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
            r = client.post(BASE_URL.rstrip("/") + "/chat/completions", json=body,
                            headers={"Authorization": f"Bearer {self.api_key}"})
        if r.status_code != 200:
            raise SparkUnavailable(f"{call}: HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        return json.loads(data["choices"][0]["message"]["content"]), data.get("usage") or {}, data

    def _custom(self, call: str, content_key: str, prompt: str, images: list[bytes], schema: dict, extra=None):
        key = f"{content_key}|p={_prompt_tag(prompt, schema)}"
        return self._answer(call, key, images, prompt, lambda: self._chat(call, prompt, images, schema), extra,
                            image_fallback=False)  # the key carries the prompt; an image alone never does

    # ------------------------------------------------------------------------------------------ the review's calls
    def classify_sheet(self, png: bytes, key: str) -> dict:
        """Sheet kind, discipline, enlarged/match line, title block and drawing index, from the whole sheet."""
        return self._custom("review_classify_sheet", key, CLASSIFY_PROMPT, [png], CLASSIFY_SCHEMA)

    def look_image(self, data: bytes, key: str, codes: list[str]) -> dict:
        prompt = IMAGE_PROMPT.replace("{codes}", "; ".join(codes) if codes else "(no finish codes found)")
        return self._custom("review_look_image", key, prompt, [data], IMAGE_SCHEMA)

    def summarise(self, text: str, key: str) -> dict:
        return self._custom("review_summarise", key, DOCUMENT_PROMPT + text[:12000], [], DOCUMENT_SCHEMA)

    def read_floor_sheet(self, png: bytes, key: str) -> dict:
        """The floors a sheet stands for (title block), where its planting sits and every soil depth it states."""
        return self._custom("review_read_floor_sheet", key, FLOOR_PROMPT, [png], FLOOR_SCHEMA)

    def read_raster_plan(self, png: bytes, key: str) -> dict:
        """A coloured raster plan: its legend and labelled areas (with colour words), the legend box and the scale
        bar (normalised 0-1000), the title block's scale."""
        return self._custom("review_read_raster_plan", key, RASTER_PLAN_PROMPT, [png], RASTER_PLAN_SCHEMA)

    def align(self, items: list[str], rows: list[str], key: str) -> dict:
        prompt = ALIGN_PROMPT.replace("{items}", "\n".join(items)).replace("{rows}", "\n".join(rows))
        return self._custom("review_align", key, prompt, [], ALIGN_SCHEMA)

    # ------------------------------------------------------------------------------------------ the take-off's calls
    def _meta(self):
        if self._client is None:
            from landsight.meta import SparkClient

            self._client = SparkClient(api_key=self.api_key)
        return self._client

    def _via_meta(self, call: str, png: bytes, key: str, fn, extra=None, facts: str = ""):
        """A take-off call (landsight.meta.spark's prompt and schema), keyed like the review's own calls: the content
        key plus a hash of the prompt as sent (facts included) and the schema, with no fallback to the image hash, so
        a changed prompt is never answered by an old recording. The recording keeps the prompt text."""
        from landsight.meta import spark as M

        prompt, schema = {"group_and_read": (M.GROUP_PROMPT, M.GROUP_SCHEMA),
                          "read_schedule": (M.SCHEDULE_PROMPT, M.SCHEDULE_SCHEMA),
                          "read_detail": (M.DETAIL_PROMPT, M.DETAIL_SCHEMA),
                          "read_legend": (M.LEGEND_PROMPT, M.LEGEND_SCHEMA)}[call]
        prompt += facts
        content = key or "img:" + _image_sha([png])
        tagged = f"{content}|p={_prompt_tag(prompt, schema)}"

        def live():
            client = self._meta()
            before = len(client.log)
            result = fn(client)
            last = client.log[-1] if len(client.log) > before else {}
            return result, last.get("usage", {}), last.get("raw")

        return self._answer(call, tagged, [png], prompt, live, extra, image_fallback=False)

    def group_and_read(self, png: bytes, candidates: list[dict], key: str = "") -> list[dict]:
        return self._via_meta("group_and_read", png, key, lambda c: c.group_and_read(png, candidates),
                              {"candidates": candidates},
                              facts="\n".join(f"- {c['id']}: {c['facts']}" for c in candidates))

    def read_schedule(self, png: bytes, key: str = "") -> dict:
        return self._via_meta("read_schedule", png, key, lambda c: c.read_schedule(png))

    def read_detail(self, png: bytes, key: str = "") -> dict:
        return self._via_meta("read_detail", png, key, lambda c: c.read_detail(png))

    def read_legend(self, png: bytes, key: str = "") -> list[dict]:
        return self._via_meta("read_legend", png, key, lambda c: c.read_legend(png))

    # ------------------------------------------------------------------------------------------ bookkeeping
    @property
    def calls(self) -> int:
        return len(self.log)

    @property
    def seconds(self) -> float:
        return round(sum(e.get("seconds") or 0.0 for e in self.log), 2)

    @property
    def recorded(self) -> bool:
        return all(e.get("recorded") for e in self.log)


class TakeoffSpark:
    """What landsight.takeoff.run sees: the sheet kind comes from the review's own classification (no second call),
    every other call goes through ReviewSpark (recorded, replayable). `log` is the review's log."""

    def __init__(self, spark: ReviewSpark, kinds_by_signature: dict[str, dict]):
        self.spark = spark
        self.kinds = kinds_by_signature
        self.log = spark.log

    def classify_sheet(self, png: bytes, key: str = "") -> dict:
        k = self.kinds.get(key)
        if k is None:
            raise FixtureMissing(f"sheet {key[:12]} was not classified by the review")
        return k

    def group_and_read(self, png, candidates, key=""):
        return self.spark.group_and_read(png, candidates, key=key)

    def read_schedule(self, png, key=""):
        return self.spark.read_schedule(png, key=key)

    def read_detail(self, png, key=""):
        return self.spark.read_detail(png, key=key)

    def read_legend(self, png, key=""):
        return self.spark.read_legend(png, key=key)
