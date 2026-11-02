"""A dropped folder, uploaded (D-81): POST /api/projects/{id}/packages/upload. Parity with the path-based review (the
outer folder with its answer key scores 30 · 28 · 2 · 0 · 0 from the recordings, no live call), the package folder
alone, content no recording knows, the same content twice, the path rules (one test each), the caps (counted while
the body streams), the empty and malformed bodies, and the feature flag."""

from __future__ import annotations

import os
import threading
import unicodedata
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.app import upload as UP

from conftest import SAMPLE

BOUNDARY = "LandsightTestBoundary7d2"


def tree(folder: Path, prefix: str) -> list[tuple[str, bytes]]:
    return [(f"{prefix}/{p.relative_to(folder).as_posix()}", p.read_bytes()) for p in sorted(folder.rglob("*"))
            if p.is_file() and not p.name.startswith(".")]


def multipart(parts: list[tuple[str, bytes]]) -> list:
    return [("files", (rel, data, "application/octet-stream")) for rel, data in parts]


def raw_body(filenames: list[bytes | str], data: bytes = b"x") -> bytes:
    out = b""
    for fn in filenames:
        fn = fn.encode() if isinstance(fn, str) else fn
        out += (f"--{BOUNDARY}\r\n".encode() + b'Content-Disposition: form-data; name="files"; filename="' + fn
                + b'"\r\nContent-Type: application/octet-stream\r\n\r\n' + data + b"\r\n")
    return out + f"--{BOUNDARY}--\r\n".encode()


@pytest.fixture(scope="module")
def client():
    c = TestClient(create_app())
    pid = c.post("/api/projects", json={"name": "Uploads"}).json()["project_id"]
    return c, pid


def post_raw(c, pid, body: bytes, ctype: str | None = None):
    return c.post(f"/api/projects/{pid}/packages/upload", content=body,
                  headers={"content-type": ctype or f"multipart/form-data; boundary={BOUNDARY}"})


def test_the_outer_folder_scores_as_the_path_review_does(client, sample_db):
    c, pid = client
    _, by_path = sample_db
    r = c.post(f"/api/projects/{pid}/packages/upload", files=multipart(tree(SAMPLE, "greenfield")))
    assert r.status_code == 200, r.text
    out = r.json()
    run, pk = out["run"], out["package"]
    e = run["errors"]
    assert (e["planted"], len(e["found"]), len(e["flagged"]), len(e["missed"]), len(e["false_alarms"])) == (30, 28, 2, 0, 0)
    verdicts = lambda r: {f["path"]: f["verdict"] for f in r["files"] if not f.get("parent")}  # noqa: E731
    assert verdicts(run) == verdicts(by_path) and len(verdicts(run)) == 30
    assert run["timing"]["recorded"] is True and not [x for x in run["timing"]["calls"] if x.get("recorded") is False]
    assert pk["name"] == "Greenfield Residences — Landscape Package" and pk["latest_run"]["id"] == run["run_id"]
    assert out["upload"]["files"] == 32 and out["upload"]["folder"].endswith(f"{out['upload']['id']}/greenfield")
    assert c.get("/api/run").json()["run_id"] == run["run_id"]  # the endpoints map onto it
    folder = Path(os.environ["LANDSIGHT_UPLOADS"]) / out["upload"]["id"]
    assert (folder / "greenfield" / "answer_key.json").is_file() and not list(Path(os.environ["LANDSIGHT_UPLOADS"]).glob(".staging-*"))
    again = c.post(f"/api/projects/{pid}/packages/upload", files=multipart(tree(SAMPLE, "greenfield"))).json()
    assert again["package"]["package_id"] == pk["package_id"] and again["upload"]["reused"] is True
    assert again["upload"]["id"] == out["upload"]["id"]


def test_the_package_folder_alone_has_verdicts_and_no_scoreboard(client):
    c, pid = client
    inner = next(d for d in SAMPLE.iterdir() if d.is_dir())
    parts = tree(inner, inner.name) + [(f"{inner.name}/.DS_Store", b"\x00\x01finder")]
    r = c.post(f"/api/projects/{pid}/packages/upload", files=multipart(parts))
    assert r.status_code == 200
    out = r.json()
    run = out["run"]
    assert run["package"]["file_count"] == 30 and len([f for f in run["files"] if not f.get("parent")]) == 30
    assert run["errors"]["planted"] == 0 and run["errors"]["found"] == []
    assert out["upload"]["skipped"] == [f"{inner.name}/.DS_Store"]


def test_content_no_recording_knows_gives_a_degraded_run(client, tmp_path):
    import ezdxf

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    msp.add_lwpolyline([(0, 0), (12, 0), (12, 7), (0, 7)], close=True)
    msp.add_text("UNSEEN SHEET 7341", height=0.5).set_placement((1, 1))
    doc.saveas(tmp_path / "x.dxf")
    parts = [("mystery/Unseen Plan.dxf", (tmp_path / "x.dxf").read_bytes()), ("mystery/notes.txt", b"hello"),
             ("mystery/sub/broken.pdf", b"%PDF-1.4 not really")]
    r = TestClient(create_app()).post(f"/api/projects/{client[1]}/packages/upload", files=multipart(parts))
    assert r.status_code == 200, r.text
    run = r.json()["run"]
    assert {f["name"]: f["verdict"] for f in run["files"]}["notes.txt"] == "unsupported"
    assert any("no recording" in n for n in run["notes"]) and run["errors"]["planted"] == 0


def test_a_run_in_progress_answers_202(client):
    c, pid = client
    from landsight.app import package as P

    fresh = TestClient(create_app())
    pid2 = fresh.post("/api/projects", json={"name": "Uploads"}).json()["project_id"]
    started, release, real = threading.Event(), threading.Event(), P.review

    def slow(*a, **k):
        started.set()
        release.wait(30)
        return real(*a, **k)

    P.review = slow
    try:
        t = threading.Thread(target=lambda: fresh.post(f"/api/projects/{pid2}/packages/upload",
                                                       files=multipart([("tiny/a.txt", b"a")])))
        t.start()
        assert started.wait(30)
        r = fresh.get("/api/run")
        assert r.status_code == 202 and r.json()["status"] == "running"
    finally:
        release.set()
        t.join(60)
        P.review = real


# --------------------------------------------------------------------------------------------- path rules, one each


@pytest.mark.parametrize("name, rule", [
    ("/etc/passwd", "absolute"),
    ("pkg/../../escape.txt", "dotdot"),
    ("../escape.txt", "dotdot"),
    ("pkg\\evil.txt", "backslash"),
    ("pkg/a\x00b.txt", "nul"),
    ("C:/Windows/evil.txt", "drive"),
    ("pkg//a.txt", "empty_segment"),
    ("pkg/a/", "empty_segment"),
    ("pkg/./a.txt", "dot"),
    ("", "empty"),
])
def test_each_unsafe_path_is_rejected(client, name, rule):
    c, pid = client
    r = post_raw(c, pid, raw_body([name]))
    assert r.status_code == 400 and r.json()["rule"] == rule, r.text
    assert not list(Path(os.environ["LANDSIGHT_UPLOADS"]).glob(".staging-*"))


def test_a_target_resolving_outside_is_rejected(tmp_path):
    inside, outside = tmp_path / "up", tmp_path / "elsewhere"
    inside.mkdir()
    outside.mkdir()
    (inside / "link").symlink_to(outside, target_is_directory=True)
    with pytest.raises(UP.UploadError) as e:
        UP.target_in(inside, "link/file.txt")
    assert e.value.status == 400 and e.value.extra["rule"] == "outside"


def test_names_are_normalised_to_nfc(client):
    c, pid = client
    nfd = unicodedata.normalize("NFD", "café/plan é.txt")
    r = post_raw(c, pid, raw_body([nfd]))
    assert r.status_code == 200
    folder = Path(os.environ["LANDSIGHT_UPLOADS"]) / r.json()["upload"]["id"]
    names = [p.name for p in folder.rglob("*")]
    assert unicodedata.normalize("NFC", "plan é.txt") in names and nfd.split("/")[1] not in names


def test_duplicate_and_conflicting_paths(client):
    c, pid = client
    assert post_raw(c, pid, raw_body(["p/a.txt", "p/a.txt"])).json()["rule"] == "duplicate"
    assert post_raw(c, pid, raw_body(["p/a", "p/a/b.txt"])).json()["rule"] == "conflict"


# --------------------------------------------------------------------------------------------- caps, empty, malformed


@pytest.mark.parametrize("caps, sizes, cap", [
    ({"files": 2, "per_file": 1000, "total": 10_000}, [10, 10, 10], "files"),
    ({"files": 10, "per_file": 1000, "total": 10_000}, [10, 1500], "per_file"),
    ({"files": 10, "per_file": 1000, "total": 1500}, [800, 800], "total"),
])
def test_caps_are_counted_while_streaming(client, monkeypatch, caps, sizes, cap):
    c, pid = client
    monkeypatch.setattr(UP, "CAPS", caps)
    parts = [(f"big/f{i}.bin", b"z" * n) for i, n in enumerate(sizes)]
    r = c.post(f"/api/projects/{pid}/packages/upload", files=multipart(parts))
    assert r.status_code == 413, r.text
    body = r.json()
    assert body["cap"] == cap and body["limit"] == caps[cap] and body["path"].startswith("big/f")
    assert not list(Path(os.environ["LANDSIGHT_UPLOADS"]).glob(".staging-*"))


def test_the_real_caps():
    assert UP.CAPS == {"files": 500, "per_file": 50 * 1024 * 1024, "total": 100 * 1024 * 1024}


def test_empty_and_malformed_bodies(client):
    c, pid = client
    empty = (f"--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"note\"\r\n\r\nhello\r\n--{BOUNDARY}--\r\n").encode()
    assert post_raw(c, pid, empty).status_code == 400
    assert post_raw(c, pid, f"--{BOUNDARY}--\r\n".encode()).status_code == 400
    assert post_raw(c, pid, b'{"path": "x"}', "application/json").status_code == 422
    assert post_raw(c, pid, b"garbage with no boundary at all").status_code == 422
    truncated = raw_body(["p/a.txt"])[:-30]
    assert post_raw(c, pid, truncated).status_code == 422
    assert c.post("/api/projects/9999/packages/upload", files=multipart([("p/a.txt", b"a")])).status_code == 404


def test_the_upload_feature_can_be_switched_off(monkeypatch):
    off = TestClient(create_app({"upload": False}))
    assert off.get("/api/health").json()["features"] == {"upload": False}
    pid = off.post("/api/projects", json={"name": "Uploads"}).json()["project_id"]
    r = off.post(f"/api/projects/{pid}/packages/upload", files=multipart([("p/a.txt", b"a")]))
    assert r.status_code == 404 and "LANDSIGHT_FEATURES_OFF=upload" in r.json()["detail"]
    monkeypatch.setenv("LANDSIGHT_FEATURES_OFF", "upload")
    assert TestClient(create_app()).get("/api/health").json()["features"]["upload"] is False
    monkeypatch.delenv("LANDSIGHT_FEATURES_OFF")
    assert TestClient(create_app()).get("/api/health").json()["features"]["upload"] is True
