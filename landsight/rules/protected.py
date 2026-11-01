"""本市樹木保護自治條例 §3: an existing tree is protected if its trunk at 1.3 m reaches the size thresholds (or it is
50 years old, rare, or of ecological or cultural value); §6: the developer needs an approved protection or
transplant plan before the building permit. Only existing trees on the plan are checked (new planting never is)."""

from __future__ import annotations

from landsight.rules.base import NEEDS_REVIEW, PASS, Citation, Planting, RuleResult, SiteFacts, Term

DBH_M = {"broadleaf": 0.8, "conifer": 0.6, "ficus": 1.1}  # diameter at 1.3 m
GIRTH_M = {"broadleaf": 2.5, "conifer": 1.8, "ficus": 3.4}
CONIFER_WORDS = ("松", "杉", "柏", "PINE", "CEDAR", "CYPRESS")
FICUS_WORDS = ("榕", "FICUS")

URL = "https://laws.gov.municipal/law/LawSearch/LawPrint/FL024478?type=0"
CITATIONS = [
    Citation("§3", "本市樹木保護自治條例 第3條",
             "Protected tree: diameter at 1.3 m ≥ 0.8 m broadleaf, 0.6 m conifer, 1.1 m Ficus (or girth 2.5 / 1.8 / "
             "3.4 m), or age ≥ 50 years, or rare, or of ecological or cultural value.",
             "municipal City Tree Protection Self-Government Ordinance, Art. 3", URL),
    Citation("§6", "本市樹木保護自治條例 第6條",
             "Before construction the developer submits tree records and a protection or transplant plan, approved "
             "before the building permit.", "municipal City Tree Protection Self-Government Ordinance, Art. 6", URL),
]


def _group(species: str) -> str:
    up = (species or "").upper()
    if any(w in up for w in FICUS_WORDS):
        return "ficus"
    if any(w in up for w in CONIFER_WORDS):
        return "conifer"
    return "broadleaf"


def check(items: list[Planting], site: SiteFacts | None = None) -> RuleResult:
    res = RuleResult("protected_trees", "Protected existing trees (受保護樹木)", "municipal · municipal", PASS,
                     citations=list(CITATIONS))
    if site is not None and not site.is_municipal:
        res.jurisdiction = f"municipal · municipal (reference; the site is in {site.city_en})"
    existing = [p for p in items if p.kind == "existing_tree"]
    if not existing:
        res.notes.append("no existing trees on the plan")
        return res
    for p in existing:
        g = _group(p.species)
        if p.dbh_m is None:
            res.status = NEEDS_REVIEW
            res.terms.append(Term("DBH", f"{p.species} 既有樹木", f"existing tree ({g})", None, "m",
                                  "trunk size not on the plan", p.source, "§3"))
            continue
        protected = p.dbh_m >= DBH_M[g]
        res.terms.append(Term("DBH", f"{p.species} 既有樹木", f"existing tree ({g})", p.dbh_m, "m",
                              f"{p.dbh_m:g} m {'≥' if protected else '<'} {DBH_M[g]:g} m", p.source, "§3"))
        if protected:
            res.status = NEEDS_REVIEW
            res.notes.append(f"{p.species} {', '.join(p.object_ids)}: protected size; needs a protection plan approved "
                             "before the building permit (§6)")
    if res.status == NEEDS_REVIEW and not res.notes:
        res.notes.append("existing trees without a trunk size: measure them before the permit")
    return res
