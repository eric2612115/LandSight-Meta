"""Shared fixtures: the synthetic site generated once per messiness level into a temporary folder, and a private
landsight.db for the whole session (LANDSIGHT_DB), so no test writes to the repo's database."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

os.environ["LANDSIGHT_DB"] = str(Path(tempfile.mkdtemp(prefix="landsight-test-db-")) / "landsight.db")
os.environ["LANDSIGHT_UPLOADS"] = tempfile.mkdtemp(prefix="landsight-test-uploads-")  # never out/uploads in tests

from landsight.synth import LEVELS, Messiness, generate


@pytest.fixture(scope="session")
def site(tmp_path_factory):
    cache: dict[str, dict] = {}

    def make(level: str | Messiness = "m4") -> dict:
        m = LEVELS[level] if isinstance(level, str) else level
        if m.tag not in cache:
            cache[m.tag] = generate(tmp_path_factory.mktemp(m.tag.replace(".", "_")), m)
        return cache[m.tag]

    return make


SAMPLE = Path(__file__).resolve().parents[1] / "samples" / "greenfield"


@pytest.fixture(scope="session")
def sample_db():
    """samples/greenfield reviewed once through landsight.db (recorded calls): (connection, Run)."""
    if not SAMPLE.is_dir():
        pytest.skip("samples/greenfield not generated")
    from landsight.store import connect, service

    conn = connect()
    pk = service.package_for_folder(conn, SAMPLE)
    run = service.review_package(conn, pk["package_id"])
    return conn, run
