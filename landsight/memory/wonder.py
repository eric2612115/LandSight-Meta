"""Muse Wonder (muse-wonder-1.0 on the Meta Model API) through the review's recorder: the recording discipline of every
Muse Spark call (a content key plus a hash of the prompt and schema; replayed by default, asked and recorded with
`live`), its own folder, tests/fixtures/memory/, and its own system prompt. Two calls: firm_habits (distil a firm's
habits from its decisions) and firm_reply (draft the reply to the developer in the firm's voice). The key is
MODEL_API_KEY, never logged or written.

On memory: Meta's Muse Wonder page lists "active memory" as a trait of the model (it carries important context through
a conversation); the Meta Model API has no memory store to write to. The Responses API can keep a conversation's turns
on the server (store: true, previous_response_id), which carries turns, not a firm's habits from one package to the
next. So the store is ours (landsight.db, table firm_memory: readable, editable and deletable by the firm) and Wonder
does the distilling."""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from landsight.review.spark import BASE_URL, ReviewSpark, SparkUnavailable

WONDER_MODEL = "muse-wonder-1.0"
FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "memory"
SYSTEM = ("You are the memory of a landscape design firm's estimating team. You learn how the firm works from the "
          "decisions its estimator made on past reviews, and you write the way the firm writes. Answer only from what "
          "you are shown; never invent a finding, a number or a price.")


class Wonder(ReviewSpark):
    """Record / replay Muse Wonder. `ask(call, content_key, prompt, schema)` returns the parsed JSON answer; `log`
    holds one entry per answer used (model, seconds, usage, response id, the recording, live or replayed)."""

    def __init__(self, mode: str = "fixtures", fixture_dir: Path | str = FIXTURES, timeout: float = 600.0,
                 transport: httpx.BaseTransport | None = None, effort: str = "low"):
        super().__init__(mode, fixture_dir, timeout=timeout, transport=transport, reader="api")
        self.model = WONDER_MODEL
        self.effort = effort

    def _chat(self, call: str, text: str, images: list[bytes], schema: dict) -> tuple[dict, dict, dict]:
        body = {"model": self.model, "reasoning_effort": self.effort,
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}],
                "response_format": {"type": "json_schema", "json_schema": {"name": call, "schema": schema}}}
        with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
            r = client.post(BASE_URL.rstrip("/") + "/chat/completions", json=body,
                            headers={"Authorization": f"Bearer {self.api_key}"})
        if r.status_code != 200:
            raise SparkUnavailable(f"{call}: HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        return json.loads(data["choices"][0]["message"]["content"]), data.get("usage") or {}, data

    def ask(self, call: str, content_key: str, prompt: str, schema: dict) -> dict:
        return self._custom(call, content_key, prompt, [], schema)
