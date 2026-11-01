"""Shared fixtures: the synthetic site generated once per messiness level into a temporary folder."""

from __future__ import annotations

import pytest

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
