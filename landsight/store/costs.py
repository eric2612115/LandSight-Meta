"""The Meta call table of docs/STACK.md, from landsight.db's meta_calls: per call type, how many calls one review
makes, the median seconds, the tokens and what a full review costs at the Meta Model API's list prices
(docs/research/metaApi.md, read 2026-11-01: Muse Spark standard $1.25 / 1M input tokens, $0.15 / 1M cached input,
$4.25 / 1M output; SAM 3.1 images $2.50 / 1,000 calls)."""

from __future__ import annotations

import json
import statistics

SPARK_IN, SPARK_CACHED, SPARK_OUT = 1.25 / 1e6, 0.15 / 1e6, 4.25 / 1e6
SAM_CALL = 2.50 / 1000


def call_type(row: dict) -> str:
    if row["kind"] == "sam":
        return "sam-3.1 segment"
    return row["call"]


def table(rows: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(call_type(r), []).append(r)
    out = []
    for name, rs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        secs = [r["seconds"] for r in rs if r.get("seconds")]
        usage = [r["usage"] if isinstance(r["usage"], dict) else json.loads(r["usage"] or "{}") for r in rs]
        tin = sum(u.get("prompt_tokens") or 0 for u in usage)
        cached = sum((u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0 for u in usage)
        tout = sum(u.get("completion_tokens") or 0 for u in usage)
        cost = (SAM_CALL * len(rs) if rs[0]["kind"] == "sam" else
                (tin - cached) * SPARK_IN + cached * SPARK_CACHED + tout * SPARK_OUT)
        out.append({"call": name, "model": rs[0]["model"], "count": len(rs),
                    "median_s": round(statistics.median(secs), 2) if secs else None,
                    "seconds": round(sum(secs), 1), "input_tokens": tin, "output_tokens": tout,
                    "cost_usd": round(cost, 4), "live": sum(1 for r in rs if r["live"])})
    return out


def markdown(rows: list[dict]) -> str:
    t = table(rows)
    lines = ["| Call | Model | Calls | Median s | Input tok | Output tok | Cost (USD) |", "|---|---|---:|---:|---:|---:|---:|"]
    for r in t:
        lines.append(f"| {r['call']} | {r['model']} | {r['count']} | {r['median_s']} | {r['input_tokens']:,} | "
                     f"{r['output_tokens']:,} | {r['cost_usd']:.4f} |")
    lines.append(f"| **all** | | **{sum(r['count'] for r in t)}** | | {sum(r['input_tokens'] for r in t):,} | "
                 f"{sum(r['output_tokens'] for r in t):,} | **{sum(r['cost_usd'] for r in t):.4f}** |")
    return "\n".join(lines)
