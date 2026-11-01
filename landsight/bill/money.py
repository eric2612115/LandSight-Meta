"""Money: every stored price is TWD; USD is shown beside it at one dated public rate (landsight/data/currency.json:
the central bank's NTD/USD interbank closing rate). `currency()` is the Run's `currency` block; `add_usd()` puts a
`<key>_usd` beside every TWD figure in a check's `numbers`, and the price flags carry what the bill asks over the top
of the firm's list (`over_list_twd`, `over_list_usd`), so the screen formats money and never parses a string."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

CURRENCY = Path(__file__).resolve().parents[1] / "data" / "currency.json"
MONEY_KEYS = ("unit_price", "amount", "bill_price", "list_low", "list_high")


@lru_cache(maxsize=1)
def currency() -> dict:
    c = json.loads(CURRENCY.read_text())
    return {"base": c["base"], "usd_per_twd": round(1 / c["twd_per_usd"], 8), "twd_per_usd": c["twd_per_usd"],
            "as_of": c["as_of"], "read": c["read"], "source": c["source"], "source_name": c["source_name"]}


def usd(twd: float) -> float:
    """TWD -> USD at the Run's rate, to the cent."""
    return round(float(twd) * currency()["usd_per_twd"], 2)


def add_usd(check: dict) -> dict:
    """USD beside TWD in one check's numbers (in place); the price flags get the overcharge against the list's top."""
    n = check.get("numbers")
    if not n:
        return check
    for k in MONEY_KEYS:
        if isinstance(n.get(k), (int, float)) and not isinstance(n.get(k), bool):
            n[f"{k}_usd"] = usd(n[k])
    if check.get("category") == "price":
        price, high, qty = n.get("bill_price", n.get("unit_price")), n.get("list_high"), n.get("bill_qty")
        if all(isinstance(v, (int, float)) for v in (price, high, qty)) and price > high:
            over = round((price - high) * qty, 2)
            n["over_list_twd"], n["over_list_usd"] = over, usd(over)
    return check


def over_list(checks: list[dict]) -> dict:
    """Σ over the price flags of (bill unit price − list high) × bill quantity, where the bill is over the list."""
    flags = [c for c in checks if c.get("category") == "price" and "over_list_twd" in (c.get("numbers") or {})]
    twd = round(sum(c["numbers"]["over_list_twd"] for c in flags), 2)
    return {"twd": twd, "usd": usd(twd), "check_ids": [c["check_id"] for c in flags]}
