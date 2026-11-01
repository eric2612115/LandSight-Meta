"""Shared shapes of the regulation check: the site facts read from the title block, the plantings read from the
take-off, and the result of one rule (terms, citations, fixes). Every Chinese term carries an English gloss."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

PASS, FAIL, NEEDS_REVIEW, NOT_APPLICABLE, SKIPPED = "pass", "fail", "needs_review", "not_applicable", "skipped"

CITY_EN = {"本市": "municipal", "本市": "municipal", "鄰市市": "New municipal", "本市市": "municipal", "本市": "local",
           "本市": "local", "本市市": "municipal", "本市市": "municipal", "本市市": "municipal", "本市市": "municipal",
           "本市市": "municipal", "本市市": "municipal"}
SITE_CLASSES = ("ordinary", "school_park", "commercial_industrial")


@dataclass
class SiteFacts:
    """What the rules need about the site. `sources` says where each fact was read (e.g. 'title block L-1')."""

    site_area_m2: float | None  # A0 基地面積
    coverage_ratio: float | None  # r 建蔽率, as a fraction
    hard_to_green_m2: float = 0.0  # Ap 執行綠化有困難之面積 (0 unless given)
    city: str = ""  # as written, e.g. 本市
    site_class: str = "ordinary"  # ordinary | school_park | commercial_industrial (sets β and tree Ai)
    municipal_class: int | None = None  # 本市新建建築物綠化實施規則 Art. 4 class 1-5, when known
    new_building: bool = True  # §298: the rule applies to new buildings
    project: str = ""
    artificial_ground: bool | None = None  # 人工地盤: planting on a slab (title block "ARTIFICIAL GROUND" / "ON SLAB")
    sources: dict[str, str] = field(default_factory=dict)

    @property
    def city_en(self) -> str:
        return CITY_EN.get(self.city, self.city or "unknown city")

    @property
    def is_municipal(self) -> bool:
        return self.city_en == "municipal"


@dataclass
class PitFacts:
    """The tree pit the trees stand in, read from a detail sheet (Muse Spark's read_detail) or given."""

    area_m2: float  # pit plan area, width × length
    soil_depth_m: float | None
    from_sheet: str  # the detail sheet it was read from (L-6), or "given"
    on_slab: bool | None = None  # the detail shows the pit on a slab (artificial ground)
    width_m: float | None = None
    length_m: float | None = None
    why: str = ""  # what the reader read each value from
    by: str = "spark"  # spark | given


@dataclass
class Planting:
    """One planted item as the rules see it: trees and hedges by count, beds and lawn (and the hedge band) by area."""

    kind: str  # tree | existing_tree | hedge | shrub_bed | lawn
    species: str
    count: float | None = None
    area_m2: float | None = None
    item_id: str = ""  # the take-off item (I-01)
    object_ids: list[str] = field(default_factory=list)  # T-01..T-08
    confirmed: bool = True  # every source agreed, or a person confirmed it
    low_count: float | None = None  # the lowest count any source gave (for "would the result flip?")
    spacing_m: float | None = None  # measured tree spacing (Ai uses spacing² when closer than the table)
    dbh_m: float | None = None  # trunk diameter at breast height, existing trees
    source: str = ""  # how the number was measured
    less_m2: float = 0.0  # area left out of the greening sum (paving drawn over this bed or lawn on another sheet)
    less_why: str = ""  # why, in one line (the overlap check it comes from)


@dataclass
class Term:
    symbol: str  # A0, r, Gi·Ai, α ...
    zh: str  # 基地面積
    en: str  # site area
    value: float | None
    unit: str = ""
    formula: str = ""  # how it was computed, with the inputs written out
    source: str = ""  # where the input came from (title block L-1, take-off I-01 T-01..T-08, assumed)
    cite: str = ""  # short citation key, e.g. "§302" or "式(4)"


@dataclass
class Citation:
    key: str  # §302
    title: str  # the official title, as published: 建築技術規則 建築設計施工編 第302條
    en: str  # what it says, in English only
    article_en: str = ""  # the article's name in English
    url: str = ""


@dataclass
class Fix:
    id: str  # a, b, c
    action: str  # English, with Chinese names glossed
    change: dict
    provided: float  # TCO2 after the fix
    passes: bool
    extra_trees: int = 0
    alpha: float | None = None
    tone_objects: list[str] = field(default_factory=list)  # objects the fix changes (for the sheet)


@dataclass
class RuleResult:
    rule: str  # greening | protected_trees | municipal_green_cover
    title: str
    jurisdiction: str  # e.g. "national rule · local"
    status: str  # pass | fail | needs_review | not_applicable | skipped
    required: float | None = None
    provided: float | None = None
    unit: str = ""
    terms: list[Term] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)
    fixes: list[Fix] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    before_downgrade: dict | None = None  # greening on artificial ground: the state before the pit rule
    after_downgrade: dict | None = None  # ... and after it (provided, re-priced fixes); None when no pit applies

    def to_dict(self) -> dict:
        return asdict(self)


_NUM = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")


def parse_area(text: str) -> float | None:
    """'1,500 m²' / '1500㎡' / '1,500.5 M2' / '0.15 ha' -> square metres."""
    m = _NUM.search(text or "")
    if not m:
        return None
    v = float(m.group(0).replace(",", ""))
    return v * 10_000 if re.search(r"\bha\b|公頃", text, re.IGNORECASE) else v


def parse_ratio(text: str) -> float | None:
    """'40%' / '40 %' / '0.4' -> 0.4."""
    m = _NUM.search(text or "")
    if not m:
        return None
    v = float(m.group(0).replace(",", ""))
    return v / 100 if "%" in text or v > 1 else v


def city_of(project: str) -> str:
    """The city named at the start of a project title (本市綠邑社區景觀工程 -> 本市)."""
    return next((c for c in CITY_EN if c in (project or "")), "")


SITE_AREA_FIELDS = ("基地面積", "SITE AREA")
COVERAGE_FIELDS = ("建蔽率", "BUILDING COVERAGE", "COVERAGE")
PROJECT_FIELDS = ("工程名稱", "PROJECT")
GROUND_FIELDS = ("GROUND", "人工地盤")
ARTIFICIAL_WORDS = ("ARTIFICIAL GROUND", "ON SLAB", "PODIUM", "人工地盤")


def site_facts(fields_by_sheet: dict[str, dict[str, str]], **overrides) -> SiteFacts:
    """SiteFacts from title blocks ({sheet: {field: value}}): the first sheet that states the site area wins."""
    def pick(names):
        for sheet, fields in fields_by_sheet.items():
            for k, v in fields.items():
                if any(n in k.upper() for n in names):
                    return v, sheet, k
        return None, None, None

    area, a_sheet, a_key = pick(SITE_AREA_FIELDS)
    cov, c_sheet, c_key = pick(COVERAGE_FIELDS)
    project, p_sheet, _ = pick(PROJECT_FIELDS)
    sources = {}
    if area:
        sources["site_area_m2"] = f"title block {a_sheet}: {a_key} {area}"
    if cov:
        sources["coverage_ratio"] = f"title block {c_sheet}: {c_key} {cov}"
    facts = SiteFacts(parse_area(area) if area else None, parse_ratio(cov) if cov else None,
                      city=city_of(project or ""), project=project or "", sources=sources)
    if project:
        sources["city"] = f"title block {p_sheet}: {project}"
    ground = next(((sheet, k, v) for sheet, fields in fields_by_sheet.items() for k, v in fields.items()
                   if any(n in k.upper() for n in GROUND_FIELDS) or any(w in f"{k} {v}".upper() for w in ARTIFICIAL_WORDS)),
                  None)
    if ground and any(w in f"{ground[1]} {ground[2]}".upper() for w in ARTIFICIAL_WORDS):
        facts.artificial_ground = True
        sources["artificial_ground"] = f"title block {ground[0]}: {ground[1]} {ground[2]}"
    for k, v in overrides.items():
        setattr(facts, k, v)
        facts.sources[k] = "given"
    return facts
