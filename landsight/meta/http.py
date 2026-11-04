"""One POST to a model, with the retries a busy API calls for: up to three tries on HTTP 429, 5xx or a dropped
connection. A review runs six calls at once on whatever rate limit the key has, and a call that fails for good only
becomes a note on the run, so a passing limit must not cost a finding."""

from __future__ import annotations

import time

import httpx

WAITS = (2.0, 6.0)  # seconds before the second and the third try; a Retry-After of up to 30 s wins


def _wait(r: httpx.Response, default: float) -> float:
    try:
        return min(float(r.headers.get("retry-after", default)), 30.0)
    except ValueError:  # the date form of Retry-After
        return default


def post(url: str, *, json: dict, headers: dict, timeout: float, transport=None) -> httpx.Response:
    for wait in (*WAITS, None):
        try:
            with httpx.Client(timeout=timeout, transport=transport) as client:
                r = client.post(url, json=json, headers=headers)
        except httpx.TransportError:
            if wait is None:
                raise
        else:
            if wait is None or not (r.status_code == 429 or r.status_code >= 500):
                return r
            wait = _wait(r, wait)
        time.sleep(wait)
    raise AssertionError("unreachable")
