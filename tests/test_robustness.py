"""What a judge hits when the input or the request is wrong: a corrupt zip is one unreadable file (not an HTTP 500), a
non-string path is a 422, a missing folder is one line and exit 2, confirming an agreed item says so, GET /api/run
during an open says it is running; a Spark step that falls back to a rule is a run-level note, and the bill text does
not claim a schedule that was not read; the docs quote the CLI's own scoreboard line and sheet count."""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from landsight.app import create_app
from landsight.app.package import SAMPLE
from landsight.review.cli import scoreboard

REPO = Path(__file__).resolve().parents[1]
needs_sample = pytest.mark.skipif(not SAMPLE.is_dir(), reason="samples/greenfield not generated")


def test_a_corrupt_zip_is_one_unreadable_file(tmp_path):
    from landsight.ingest import walk

    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "details.zip").write_bytes(b"PK\x03\x04 this is not really a zip")
    (tmp_path / "pkg" / "empty.zip").write_bytes(b"")
    recs = {r.name: r for r in walk(tmp_path / "pkg", tmp_path / "work")}
    for name in ("details.zip", "empty.zip"):
        assert recs[name].verdict == "unreadable" and recs[name].why.startswith("not a valid zip"), recs[name].why


def test_open_rejects_a_path_that_is_not_a_string():
    c = TestClient(create_app())
    for body in ({"path": 123}, {"path": ["a"]}, [1, 2]):
        r = c.post("/api/package/open", json=body)
        assert r.status_code == 422, (body, r.text)
    assert c.post("/api/package/open", json={"path": "/no/such/folder"}).status_code == 400


def test_review_cli_with_a_missing_folder_is_one_line_and_exit_2(tmp_path):
    r = subprocess.run([sys.executable, "-m", "landsight", "review", str(tmp_path / "nope")], capture_output=True,
                       text=True, cwd=REPO, timeout=120)
    assert r.returncode == 2 and r.stdout == ""
    assert len(r.stderr.strip().splitlines()) == 1 and r.stderr.startswith("landsight review: not a folder")


def test_serve_on_a_busy_port_prints_no_banner():
    import socket

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    s.listen()
    port = s.getsockname()[1]
    try:
        r = subprocess.run([sys.executable, "-m", "landsight", "serve", "--port", str(port)], capture_output=True,
                           text=True, cwd=REPO, timeout=60)
    finally:
        s.close()
    assert r.returncode == 2 and "Landsight API on" not in r.stdout
    assert r.stderr.startswith(f"landsight serve: 127.0.0.1:{port} is in use")


@needs_sample
def test_package_with_a_corrupt_zip_and_no_schedule(tmp_path):
    """The judge's two experiments in one review: a corrupt zip beside the package (HTTP 200, one unreadable verdict)
    and the plant schedule removed (Muse Spark's bill alignment has no recording, so it falls back to the rule)."""
    pkg = tmp_path / "greenfield"
    shutil.copytree(SAMPLE, pkg)
    root = next(d for d in pkg.iterdir() if d.is_dir())
    for f in root.rglob("L-4*"):
        f.unlink()
    (root / "broken.zip").write_bytes(b"PK\x05\x06" + b"\x00" * 10)
    c = TestClient(create_app())
    r = c.post("/api/package/open", json={"path": str(pkg)})
    assert r.status_code == 200, r.text
    run = r.json()
    broken = next(f for f in run["files"] if f["name"] == "broken.zip")
    assert broken["verdict"] == "unreadable" and broken["why"].startswith("not a valid zip")
    assert any(n.startswith("bill alignment:") and "matched by rule" in n for n in run["notes"]), run["notes"]
    text = " ".join(ch["why"] for ch in run["checks"])
    assert "the drawing's schedule says" not in text and "no plant schedule was read" in text
    assert "Lawn" in [i["label"] for i in run["items"]]


@pytest.fixture(scope="module")
def api():
    if not SAMPLE.is_dir():
        pytest.skip("samples/greenfield not generated")
    c = TestClient(create_app())
    return c, c.post("/api/package/open").json()


def test_confirming_an_agreed_item_says_so(api):
    c, run = api
    agreed = next(i for i in run["items"] if i["agreed"])
    r = c.post(f"/api/items/{agreed['item_id']}/confirm")
    assert r.status_code == 200 and r.json()["confirmed"] is True and r.json()["note"] == "already agreed"


def test_run_during_a_reopen_is_marked(api):
    c, _ = api
    from landsight.app import package as P

    started, release = threading.Event(), threading.Event()
    real = P.review

    def slow(*a, **k):
        started.set()
        release.wait(30)
        return real(*a, **k)

    P.review = slow
    try:
        t = threading.Thread(target=lambda: c.post("/api/package/open"))
        t.start()
        assert started.wait(30)
        r = c.get("/api/run")
        assert r.status_code == 200 and r.json()["stale"] is True and r.json()["status"] == "running"
        assert r.json()["items"]  # the previous Run, marked
        release.set()
        t.join(60)
    finally:
        P.review = real
        release.set()
    assert "stale" not in c.get("/api/run").json()
    fresh = TestClient(create_app())
    P.review = slow
    started.clear()
    release.clear()
    try:
        t = threading.Thread(target=lambda: fresh.post("/api/package/open"))
        t.start()
        assert started.wait(30)
        r = fresh.get("/api/run")
        assert r.status_code == 202 and r.json()["status"] == "running"
    finally:
        release.set()
        t.join(60)
        P.review = real


def test_greening_leaves_the_paved_lawn_out(api):
    _, run = api
    green = next(ch for ch in run["checks"] if ch["category"] == "regulation" and ch["title"].startswith("Greening"))
    assert "Lawn counted as 180 m², not 200: 20 m² lies under Grass pavers on L-3" in green["why"]
    e10 = next(ch for ch in run["checks"] if ch["check_id"] == "E10")
    assert e10["numbers"]["greening_lawn_m2"] == 180.0 and "leaves the overlap out of the lawn" in e10["why"]
    assert green["numbers"]["sum_gi_ai"] == pytest.approx(246.4)  # 7 × 16 + 75 + 0.3 × 180 + 5.4 (T-08 unconfirmed)
    assert green["if_confirmed"]["numbers"]["sum_gi_ai"] == pytest.approx(262.4)  # 128 + 75 + 0.3 × 180 + 5.4


def test_the_docs_quote_the_cli(api):
    _, run = api
    line = scoreboard(run["errors"])
    assert line == "planted 30 · found 28 · flagged 2 · missed 0 · false alarms 0"
    sheets = len(run["sheets"])
    for doc in ("README.md", "docs/JUDGE-PLAYBOOK.md"):
        text = (REPO / doc).read_text()
        assert line in text, doc
        assert "needs review 2 (E15, E18)" not in text and "20 sheets" not in text, doc
        assert f"{sheets} sheets" in text, doc
        assert re.search(r"```bash[^`]*uv run pytest -q", text), doc
