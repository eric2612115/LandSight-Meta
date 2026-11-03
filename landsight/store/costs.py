"""The Meta call table of docs/STACK.md, from landsight.db's meta_calls: per call type, how many calls one review
makes, the median seconds, the tokens and what a full review costs at the Meta Model API's list prices
(docs/research/metaApi.md, read 2026-11-01: Muse Spark standard $1.25 / 1M input tokens, $0.15 / 1M cached input,
$4.25 / 1M output; SAM 3.1 images $2.50 / 1,000 calls). Muse Spark Open on Baseten is priced by Baseten's model list
(GET https://inference.baseten.co/v1/models, read 2026-11-04: the same $1.25 / $0.15 / $4.25 per 1M tokens) and Muse
Wonder by the Meta Model API's (read 2026-11-04: $4.00 / 1M input, $0.20 / 1M cached, $20.00 / 1M output)."""

from __future__ import annotations

import json
import statistics

SPARK_IN, SPARK_CACHED, SPARK_OUT = 1.25 / 1e6, 0.15 / 1e6, 4.25 / 1e6
SAM_CALL = 2.50 / 1000
PRICES = {  # USD per token: input, cached input, output; a model not listed is priced as Muse Spark 1.3
    "muse-spark-1.3": (SPARK_IN, SPARK_CACHED, SPARK_OUT),
    "meta-models/muse-spark-open-1026": (1.25 / 1e6, 0.15 / 1e6, 4.25 / 1e6),
    "meta-models/muse-spark-open": (1.25 / 1e6, 0.15 / 1e6, 4.25 / 1e6),
    "muse-wonder-1.0": (4.00 / 1e6, 0.20 / 1e6, 20.00 / 1e6),
}


def token_cost(model: str, usage: dict) -> float:
    """One call's list-price cost in USD from its usage (prompt, cached and completion tokens)."""
    p_in, p_cached, p_out = PRICES.get(model, (SPARK_IN, SPARK_CACHED, SPARK_OUT))
    tin = usage.get("prompt_tokens") or 0
    cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
    return (tin - cached) * p_in + cached * p_cached + (usage.get("completion_tokens") or 0) * p_out


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
        p_in, p_cached, p_out = PRICES.get(rs[0]["model"], (SPARK_IN, SPARK_CACHED, SPARK_OUT))
        cost = (SAM_CALL * len(rs) if rs[0]["kind"] == "sam" else
                (tin - cached) * p_in + cached * p_cached + tout * p_out)
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
