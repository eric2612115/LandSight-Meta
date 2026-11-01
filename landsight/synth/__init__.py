"""Synthetic site generator: DXF sheets of one site plus an exact answer key (see site.py for the conventions), and
the sample developer's package built on it (package.py, docs/PACKAGE.md)."""

from landsight.synth.site import LEVELS, PACKAGE_OPTIONS, Messiness, SiteOptions, generate

__all__ = ["LEVELS", "PACKAGE_OPTIONS", "Messiness", "SiteOptions", "generate"]
