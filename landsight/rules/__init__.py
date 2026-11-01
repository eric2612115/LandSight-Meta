"""Regulation check with article citations (法規檢核, not legal advice): the national greening rule (§302 via the
技術規範), municipal's protected-tree ordinance (§3) and municipal's green-cover ratio (municipal, skipped elsewhere)."""

from landsight.rules import greening, protected, municipal
from landsight.rules.base import Citation, Fix, Planting, RuleResult, SiteFacts, Term, site_facts
from landsight.rules.inputs import plantings_from_takeoff, site_from_takeoff
from landsight.rules.table import format_rules


def check_all(site: SiteFacts, plantings: list[Planting]) -> list[RuleResult]:
    return [greening.check(site, plantings), protected.check(plantings, site), municipal.check(site, plantings)]


def check_takeoff(takeoff, **site_overrides) -> tuple[SiteFacts, list[RuleResult]]:
    site = site_from_takeoff(takeoff, **site_overrides)
    return site, check_all(site, plantings_from_takeoff(takeoff))


__all__ = ["Citation", "Fix", "Planting", "RuleResult", "SiteFacts", "Term", "check_all", "check_takeoff",
           "format_rules", "greening", "plantings_from_takeoff", "protected", "site_facts", "site_from_takeoff",
           "municipal"]
