"""Money in the Run: every stored price stays TWD; the Run carries one dated public rate (`currency`) and every TWD
figure in a check's numbers has a `_usd` twin; price flags over the list carry the overcharge against its top."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.app.package import SAMPLE
from landsight.bill.money import add_usd, currency, over_list, usd


def test_the_rate_is_dated_and_sourced():
    c = currency()
    assert c["base"] == "TWD" and c["twd_per_usd"] == 32.478 and c["as_of"] == "2026-10-30"
    assert c["source"].startswith("https://www.cbc.gov.tw/") and c["usd_per_twd"] == pytest.approx(1 / 32.478)
    assert usd(4200) == 129.32 and usd(0) == 0.0


def test_add_usd_keeps_twd_and_adds_twins():
    ch = add_usd({"category": "price", "numbers": {"bill_price": 3800.0, "list_low": 1300.0, "list_high": 2300.0,
                                                    "bill_qty": 236.0, "unit": "m²"}})
    n = ch["numbers"]
    assert n["bill_price"] == 3800.0 and n["bill_price_usd"] == 117.0 and n["list_high_usd"] == 70.82
    assert n["over_list_twd"] == 354000.0 and n["over_list_usd"] == usd(354000.0)
    under = add_usd({"category": "price", "numbers": {"bill_price": 4200.0, "list_high": 7200.0, "bill_qty": 12.0}})
    assert "over_list_twd" not in under["numbers"] and add_usd({"category": "area"}) == {"category": "area"}


@pytest.mark.skipif(not SAMPLE.is_dir(), reason="samples/greenfield not generated")
def test_the_api_run_carries_currency_and_usd_numbers():
    c = TestClient(create_app())
    run = c.post("/api/package/open").json()
    assert run["currency"]["base"] == "TWD" and run["currency"]["usd_per_twd"] == pytest.approx(1 / 32.478)
    prices = {ch["check_id"]: ch["numbers"] for ch in run["checks"] if ch["category"] == "price" and ch.get("numbers")}
    e19, e20 = prices["E19"], prices["E20"]
    assert (e19["bill_price"], e19["bill_price_usd"], e19["list_low_usd"], e19["list_high_usd"]) == \
        (4200.0, 129.32, 190.9, 221.69)
    assert "over_list_twd" not in e19 and e20["over_list_twd"] == 354000.0
    total = over_list(run["checks"])
    assert total["twd"] == 354000.0 and total["usd"] == pytest.approx(10899.68) and total["check_ids"] == ["E20"]
    rows = [ch["numbers"] for ch in run["checks"] if "unit_price" in ch.get("numbers", {})]
    assert rows and all("unit_price_usd" in n for n in rows)
