"""The API of docs/API.md, offline (recorded Muse Spark and SAM 3.1 responses): health, opening the package (the m4
site plus the stand-in L-6 detail until the sample package exists) gives the 8 items, confirming flips the flagged row,
the rules numbers, the director's scenes, the rendered sheets and crops, and English everywhere outside citation URLs.
The film's conditional builds (grounding points, Spark writing SAM's prompt, the controlled SAM test, the pit
downgrade) are in tests/test_conditional.py."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.app.english import has_cjk


@pytest.fixture(scope="module")
def client():
    c = TestClient(create_app())
    c.post("/api/package/open?site=m4")
    return c


def strings(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from strings(k, path)
            if k != "url":
                yield from strings(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from strings(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj


def test_health_and_cors():
    c = TestClient(create_app())
    assert c.get("/api/health").json() == {"ok": True, "spark": "fixtures", "version": "0.1.0",
                                           "features": {"upload": True}}
    r = c.options("/api/health", headers={"Origin": "http://localhost:5195", "Access-Control-Request-Method": "GET"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5195"
    assert c.get("/api/run").status_code == 404


def test_open_gives_the_eight_items(client):
    run = client.post("/api/package/open?site=m4").json()
    assert [i["item_id"] for i in run["items"]] == [f"I-0{n}" for n in range(1, 9)]
    tree = run["items"][0]
    assert (tree["label"], tree["species_code"], tree["unit"]) == ("Camphor", "CC", "plant")
    assert (tree["geometry_count"], tree["spark_count"], tree["schedule_count"], tree["agreed"]) == (7, 8, 8, False)
    assert tree["spark"]["crop_url"] == "/api/crops/I-01.png" and tree["spark"]["confidence"] == 0.95
    assert [i["label"] for i in run["items"][1:]] == ["Duranta", "Azalea", "Lawn", "Grass pavers", "Exposed aggregate",
                                                      "Permeable pavers", "Planter edge"]
    assert [s["sheet_id"] for s in run["sheets"]] == ["L-1", "L-2", "L-3", "L-6"]
    l1, l2 = run["sheets"][0], run["sheets"][1]
    assert l1["counted"] and l1["title"] == "Planting Plan" and not l2["counted"] and l2["kind"] == "elevation"
    t08 = next(o for o in l1["objects"] if o["object_id"] == "T-08")
    assert not t08["closed"] and len(t08["gaps"]) == 12 and t08["by"] == "spark" and len(t08["segments"]) == 12
    assert any(o.get("excluded") and o["kind"] == "legend" for o in l1["objects"])
    assert run["tally"][0] == {"label": "Camphor", "species_code": "CC", "drawn": 7, "spark": 8, "schedule": 8,
                               "unit": "plant", "status": "flagged", "item_id": "I-01", "by": "spark"}
    titles = [c["title"] for c in run["checks"]]
    assert "T-08: open outline, Muse Spark says one tree" in titles and "L-2 is an elevation: not counted" in titles
    assert "L-1 legend: 2 symbols not counted" in titles and "Schedule and drawing agree: Camphor 8" in titles
    assert "SAM 3.1: Azalea 149.2 m² vs CAD 150.0 m² (-0.5%)" in titles  # prompted with Muse Spark's legend word
    assert "L-6 is a detail: not counted" in titles
    # 3 classify + schedule + T-08 on L-1..L-3; classify + read_detail on L-6; two legend reads
    assert run["timing"]["spark_calls"] == 9 and run["errors"]["planted"] == 0


def test_every_string_is_english_except_citation_urls(client):
    bad = [(p, s) for p, s in strings(client.get("/api/run").json()) if has_cjk(s)]
    bad += [(p, s) for p, s in strings(client.get("/api/director").json()) if has_cjk(s)]
    bad += [(p, s) for p, s in strings(client.get("/api/rules").json()) if has_cjk(s)]
    assert not bad, bad[:5]


def test_confirm_flips_agreed_and_updates_the_tally(client):
    client.post("/api/package/open?site=m4")
    item = client.post("/api/items/I-01/confirm").json()
    assert item["agreed"] and item["confirmed"] and item["quote_count"] == 8
    run = client.get("/api/run").json()
    assert run["tally"][0]["drawn"] == 8 and run["tally"][0]["status"] == "confirmed"
    assert run["checks"][0]["severity"] == "info" and run["checks"][0]["title"].endswith("confirmed")
    assert client.post("/api/items/I-99/confirm").status_code == 404
    assert not client.post("/api/package/open?site=m4").json()["items"][0]["agreed"]


def test_rules_numbers(client):
    rules = client.get("/api/rules").json()
    g = rules[0]
    assert g["category"] == "regulation" and g["severity"] == "fail" and g["status"] == "fail"
    n = g["numbers"]  # the L-6 pit (2.25 m² on a slab) applies: the eight camphors count as small trees
    assert (n["required"], n["provided"], n["A0"], n["r"], n["A_prime"], n["beta"], n["alpha"]) == \
        (297.0, 214.7, 1500.0, 0.4, 900.0, 0.66, 0.8)
    assert [t["product"] for t in n["terms"]] == [128.0, 5.4, 75.0, 60.0]
    passing = [f for f in g["fixes"] if f["passes"]]
    assert [f["id"] for f in passing][:2] == ["a", "b"]
    assert passing[0]["result"] == pytest.approx(304.32) and passing[1]["result"] == pytest.approx(348.92)
    assert passing[0]["extra_trees"] == 7
    assert passing[1]["extra_trees"] == 0 and passing[1]["object_ids"] == ["T-05"]
    assert g["before_downgrade"]["provided"] == 265.9 and g["after_downgrade"]["provided"] == 214.7
    assert g["citation"]["article"].endswith("Art. 302") and "flno=302" in g["citation"]["url"]
    assert {r["status"] for r in rules[1:]} == {"pass", "skipped"}


def test_director_scenes_point_into_the_run(client):
    scenes = client.get("/api/director").json()
    ids = [s["id"] for s in scenes]
    assert len(scenes) >= 6 and ids == ["drop", "wake", "eye", "hedge", "colour", "gauge", "bill", "callback"]
    by = {s["id"]: s for s in scenes}
    assert by["eye"]["focus"] == ["T-08"] and by["eye"]["item_ids"] == ["I-01"]
    assert by["hedge"]["focus"] == ["H-01"] and by["callback"]["sheet_id"] == "L-2"
    checks = {c["check_id"]: c for c in client.get("/api/run").json()["checks"]}
    assert all(cid in checks for s in scenes for cid in s["check_ids"])
    assert checks[by["gauge"]["check_ids"][0]]["category"] == "regulation"


def test_sheets_and_crops_render(client):
    svg = client.get("/api/sheets/L-1.svg")
    assert svg.status_code == 200 and svg.headers["content-type"].startswith("image/svg+xml") and b"<svg" in svg.content
    for path in ("/api/sheets/L-1.png", "/api/sheets/L-3.filled.png", "/api/crops/I-01.png"):
        r = client.get(path)
        assert r.status_code == 200 and r.content[:4] == b"\x89PNG", path
    assert client.get("/api/sheets/L-9.svg").status_code == 404 and client.get("/api/crops/I-02.png").status_code == 404
