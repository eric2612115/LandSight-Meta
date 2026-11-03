"""Regulation check with article citations (法規檢核, not legal advice): the national greening rule (§302 via the
技術規範), the municipal tree protection ordinance (§3) and the municipal greening rule's green-cover ratio (skipped
outside that municipality)."""

from landsight.rules import greening, municipal, protected
from landsight.rules.base import Citation, Fix, PitFacts, Planting, RuleResult, SiteFacts, Term, site_facts
from landsight.rules.inputs import plantings_from_takeoff, site_from_takeoff
from landsight.rules.table import format_rules


def check_all(site: SiteFacts, plantings: list[Planting], pit: PitFacts | None = None) -> list[RuleResult]:
    return [greening.check(site, plantings, pit=pit), protected.check(plantings, site), municipal.check(site, plantings)]


def check_takeoff(takeoff, **site_overrides) -> tuple[SiteFacts, list[RuleResult]]:
    """The rules on a take-off; the tree pit comes from the take-off's detail-sheet read (takeoff.pit), if any."""
    site = site_from_takeoff(takeoff, **site_overrides)
    return site, check_all(site, plantings_from_takeoff(takeoff), getattr(takeoff, "pit", None))


__all__ = ["Citation", "Fix", "PitFacts", "Planting", "RuleResult", "SiteFacts", "Term", "check_all", "check_takeoff",
           "format_rules", "greening", "municipal", "plantings_from_takeoff", "protected", "site_facts",
           "site_from_takeoff"]
