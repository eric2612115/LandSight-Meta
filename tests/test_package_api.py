"""The API on the real sample package (samples/greenfield through landsight.review, recorded Muse Spark and SAM 3.1
calls): the Run and its counts, English everywhere (every string and every text node of every rendered SVG), the
renders and the crop, the bill rows on the bill checks, confirm, the rules with both gauge states, and the director's
scenes pointing at ids that exist in this Run. The older m4 path stays at ?site=m4 (tests/test_app.py)."""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.app.package import SAMPLE

CJK = re.compile(r"[⺀-鿿豈-﫿　-〿＀-￯가-힯]")
URL_KEYS = {"url", "svg_url", "png_url", "filled_png_url", "crop_url"}
ROW_FIELDS = {"row", "bill_text", "bill_qty", "unit_price", "item_id", "drawn_qty"}

pytestmark = pytest.mark.skipif(not SAMPLE.is_dir(), reason="samples/greenfield not generated")


@pytest.fixture(scope="module")
def api():
    c = TestClient(create_app())
    run = c.post("/api/package/open").json()
    return {"c": c, "run": run, "director": c.get("/api/director").json(), "rules": c.get("/api/rules").json()}


def strings(obj, key=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from strings(k)
            if k not in URL_KEYS:
                yield from strings(v, k)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings(v, key)
    elif isinstance(obj, str):
        yield obj


def checks_by_id(run):
    return {c["check_id"]: c for c in run["checks"]}


def test_open_serves_the_package(api):
    run = api["run"]
    assert run["package"]["name"] == "Greenfield Residences — Landscape Package" and run["package"]["file_count"] == 30
    dxf = [i for i in run["items"] if i.get("source") != "sam"]
    assert [i["item_id"] for i in dxf] == [f"I-0{n}" for n in range(1, 9)]
    assert [i["label"] for i in dxf] == ["Camphor", "Duranta", "Azalea", "Lawn", "Permeable pavers",
                                         "Exposed aggregate", "Grass pavers", "Planter edge"]
    assert [i["item_id"] for i in run["items"] if i.get("source") == "sam"] == ["S-01", "S-02", "S-03", "S-04"]
    tree = run["items"][0]
    assert (tree["geometry_count"], tree["spark_count"], tree["schedule_count"], tree["agreed"]) == (7, 8, 12, False)
    assert tree["spark"]["crop_url"] == "/api/crops/I-01.png" and tree["spark"]["object_id"] == "T-08"
    assert tree["spark"]["points_status"] == "returned" and len(tree["spark"]["points"]) == 12
    e = run["errors"]
    assert (e["planted"], len(e["found"]), len(e["flagged"]), len(e["missed"]), len(e["false_alarms"])) == (30, 28, 2, 0, 0)
    assert run["tally"][0] | {} == {"label": "Camphor", "species_code": "CC", "drawn": 7, "spark": 8, "schedule": 12,
                                    "unit": "plant", "status": "flagged", "item_id": "I-01", "by": "spark"}
    assert run["timing"]["sam_calls"] == 12 and run["timing"]["recorded"] is True  # 8 on the DXF renders, 4 on F-26
    filled = sorted(s["sheet_id"] for s in run["sheets"] if s.get("filled_png_url"))
    assert filled == ["F-26-p1", "L-1-revB", "L-3"]  # L-1, L-3 and the Presentation Plan page


def test_every_string_and_every_svg_text_node_is_english(api):
    c, run = api["c"], api["run"]
    bad = [s for part in (run, api["director"], api["rules"]) for s in strings(part) if CJK.search(s)]
    assert not bad, bad[:5]
    texts = 0
    for s in run["sheets"]:
        svg = c.get(s["svg_url"]).text
        nodes = re.findall(r"<text\b[^>]*>(.*?)</text>", svg, re.S)
        texts += len(nodes)
        assert not [n for n in nodes if CJK.search(n)], s["sheet_id"]
        assert not CJK.search(svg), s["sheet_id"]
    assert texts > 200
    assert "Planting Plan" in c.get("/api/sheets/L-1-revB.svg").text


def test_every_sheet_renders_and_the_crop_is_served(api):
    c, run = api["c"], api["run"]
    for s in run["sheets"]:
        r = c.get(s["svg_url"])
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg+xml") and b"<svg" in r.content
        for k in ("png_url", "filled_png_url"):
            if s.get(k):
                r = c.get(s[k])
                assert r.status_code == 200 and r.content[:4] == b"\x89PNG", s[k]
    assert c.get("/api/crops/I-01.png").content[:4] == b"\x89PNG"
    assert c.get("/api/crops/I-02.png").status_code == 404 and c.get("/api/sheets/L-9.svg").status_code == 404
    assert c.get("/api/sheets/L-2.filled.png").status_code == 404


def test_bill_checks_carry_their_rows(api):
    rows = [c for c in api["run"]["checks"] if "row" in c.get("numbers", {})]
    assert {c["numbers"]["row"] for c in rows} >= {6, 7, 8, 9, 11, 12, 13, 14, 19}
    for c in rows:
        if c["numbers"]["row"] != 19:
            assert ROW_FIELDS <= set(c["numbers"]), c["check_id"]
    camphor = next(c for c in rows if c["category"] == "quantity" and c["numbers"]["row"] == 6)
    n = camphor["numbers"]
    assert (n["bill_text"], n["bill_qty"], n["drawn_qty"], n["unit_price"], n["item_id"]) == \
        ("Camphore tree, cal. 10 cm", 12, 8, 4200, "I-01")
    pavers = next(c for c in rows if c["category"] == "price" and c["numbers"]["row"] == 11)
    assert (pavers["numbers"]["unit_price"], pavers["numbers"]["list_low"], pavers["numbers"]["list_high"]) == (3800, 1300, 2300)
    agree = [c for c in rows if c["severity"] == "info" and c.get("ok")]
    assert [c["numbers"]["row"] for c in agree] == [9, 12, 13, 14]
    assert not [c for c in api["run"]["checks"] if c["title"].startswith("Bill rows that agree")]


def test_confirm_flips_the_open_outline(api):
    c = api["c"]
    item = c.post("/api/items/I-01/confirm").json()
    assert item["agreed"] and item["confirmed"] and item["quote_count"] == 8
    run = c.get("/api/run").json()
    assert run["tally"][0]["drawn"] == 8 and run["tally"][0]["status"] == "confirmed"
    e01 = checks_by_id(run)["E01"]
    assert e01["severity"] == "info" and e01["title"].endswith("confirmed")
    assert c.post("/api/items/I-99/confirm").status_code == 404
    reopened = c.post("/api/package/open").json()
    assert not reopened["items"][0]["agreed"]


def test_rules_and_both_gauge_states(api):
    rules = api["rules"]
    assert all(r["category"] == "regulation" and r["citation"]["url"].startswith("https://") for r in rules)
    g = next(r for r in rules if r["title"].startswith("Greening"))
    n = g["numbers"]
    # 7 Camphor until a person confirms T-08 (D-62); the lawn without the 20 m² under grass pavers (E10)
    assert (n["required"], n["provided"], n["A0"], n["Ap"], n["r"], n["A_prime"], n["beta"], n["alpha"]) == \
        (297.0, 197.1, 1500.0, 0.0, 0.4, 900.0, 0.66, 0.8)
    before, after = g["before_downgrade"], g["after_downgrade"]
    assert before["provided"] == 241.9 and after["provided"] == 197.1
    fa = {f["id"]: f for f in before["fixes"]}
    fb = {f["id"]: f for f in after["fixes"]}
    assert fa["a"]["extra_trees"] == 3 and fb["a"]["extra_trees"] == 8
    assert fb["b"]["extra_trees"] == 0 and fb["b"]["object_ids"] == ["T-05"] and fb["b"]["result"] == pytest.approx(320.32)
    assert fb["d"]["object_ids"] == ["EX-01"] and fb["d"]["result"] == pytest.approx(264.96)  # keep the old tree
    assert after["pit"]["sheet_id"] == "L-6" and after["pit"]["area_m2"] == 2.25 and after["downgraded"][0]["to_gi"] == 1.0
    conf = g["if_confirmed"]  # once T-08 is confirmed: the v1 figures
    assert (conf["numbers"]["provided"], conf["before_downgrade"]["provided"], conf["after_downgrade"]["provided"]) == \
        (209.9, 261.1, 209.9)
    cb = {f["id"]: f for f in conf["after_downgrade"]["fixes"]}
    assert cb["a"]["extra_trees"] == 7 and cb["b"]["result"] == pytest.approx(341.12)


def test_director_points_at_real_ids(api):
    run, scenes = api["run"], api["director"]
    assert [s["id"] for s in scenes] == ["drop", "wake", "eye", "hedge", "colour", "gauge", "bill", "callback"]
    by = {s["id"]: s for s in scenes}
    checks = checks_by_id(run)
    sheets = {s["sheet_id"]: s for s in run["sheets"]}
    assert all(cid in checks for s in scenes for cid in s["check_ids"])
    for s in scenes:
        sheet = sheets.get(s.get("sheet_id"))
        if s["id"] in ("wake", "eye", "hedge", "colour", "gauge") and sheet:
            ids = {o["object_id"] for o in sheet["objects"]}
            assert set(s["focus"]) <= ids, s["id"]
    assert len(by["drop"]["focus"]) == 30
    assert (by["eye"]["sheet_id"], by["eye"]["focus"], by["eye"]["item_ids"]) == ("L-1-revB", ["T-08"], ["I-01"])
    assert by["hedge"]["focus"] == ["H-01"]
    colour = [checks[c] for c in by["colour"]["check_ids"]]
    assert colour and all(c["category"] == "area" and c["prompt_source"] == "spark_legend" for c in colour)
    assert {s for c in colour for s in c["evidence"]["sheet_ids"]} == {"L-1-revB", "L-3"}
    control = checks[by["colour"]["control_check_id"]]["control"]
    assert (control["prompt"], control["masks_on_lines"], control["sheet_id"]) == ("beige area", 0, "L-3")
    assert control["masks_on_colour"] > 0
    gauge = checks[by["gauge"]["check_ids"][0]]
    assert gauge["before_downgrade"] and gauge["after_downgrade"] and by["gauge"]["focus"] == ["T-05"]
    amber = [checks[c] for c in by["bill"]["amber_check_ids"]]
    assert [c["category"] for c in amber] == ["quantity", "units", "price"] and by["bill"]["check_ids"][:3] == by["bill"]["amber_check_ids"]
    assert amber[0]["numbers"]["unit_price"] == 4200 and amber[2]["numbers"]["list_low"] == 1300
    assert by["callback"]["sheet_id"] == "L-2" and "L-5" in by["callback"]["sheet_ids"]
    assert any(checks[c]["category"] == "scale" for c in by["callback"]["check_ids"])


def test_m4_site_is_still_reachable():
    c = TestClient(create_app())
    run = c.post("/api/package/open?site=m4").json()
    assert run["package"]["name"] == "m4 synthetic site" and len(run["items"]) == 8
    assert c.post("/api/package/open?site=elsewhere").status_code == 400
