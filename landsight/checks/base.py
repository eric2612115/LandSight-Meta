"""The Check shape of docs/API.md and the citations regulation checks carry.

Citations: every URL comes from landsight/data/rules.json (where each constant carries its source); the article name
and the gloss are written here in English (rules.json keeps the official titles in their own language, and nothing
the API returns may)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

RULES = Path(__file__).resolve().parents[1] / "data" / "rules.json"
CATEGORIES = ("quantity", "revision", "sheet", "area", "scale", "bill", "price", "arithmetic", "units", "regulation",
              "protected_tree", "ingest", "document")
SEVERITIES = ("flag", "fail", "review", "info")
BY = ("geometry", "spark", "sam", "rule", "bill")


@dataclass
class Check:
    category: str
    title: str
    severity: str
    by: list[str]
    why: str
    evidence: dict = field(default_factory=dict)
    citation: dict | None = None
    numbers: dict | None = None
    fixes: list[dict] | None = None
    extra: dict = field(default_factory=dict)  # additive fields (item_ids, citations, rows, tag ...)
    check_id: str = ""

    def __post_init__(self):
        assert self.category in CATEGORIES, self.category
        assert self.severity in SEVERITIES, self.severity
        assert all(b in BY for b in self.by), self.by

    def api(self) -> dict:
        out = {"check_id": self.check_id, "category": self.category, "title": self.title, "severity": self.severity,
               "by": list(self.by), "why": self.why, "evidence": {k: v for k, v in self.evidence.items() if v}}
        if self.citation:
            out["citation"] = self.citation
        nums = {k: _plain(v) for k, v in (self.numbers or {}).items() if v is not None}
        if nums:
            out["numbers"] = nums
        if self.fixes:
            out["fixes"] = self.fixes
        out.update(self.extra)
        return out


def _plain(v):
    """numbers: number | string (docs/API.md): a bool reads yes / no, anything else its text."""
    if isinstance(v, bool):
        return "yes" if v else "no"
    return v if isinstance(v, (int, float, str)) else str(v)


def cell_ref(file_id: str, sheet: str, cell: str | None) -> str:
    """'F-20:BOQ!E6'; a whole sheet is 'F-20:old!*'."""
    return f"{file_id}:{sheet}!{cell or '*'}"


def obj_ref(sheet_id: str, object_id: str) -> str:
    return f"{sheet_id}/{object_id}"


@lru_cache(maxsize=1)
def rules() -> dict:
    return json.loads(RULES.read_text())


def _get(path: list):
    node = rules()
    for p in path:
        node = node[p]
    return node


# key -> (path to a cite object in rules.json, English article, English gloss)
CITES = {
    "BTR-299": (["national", "formulas", "cite", 0],
                "Building Technical Regulations, Design and Construction Part, Art. 299",
                "Minimum greening area = (site area − area where greening is impracticable) × the legal open-space "
                "ratio. An area counts as impracticable only when the architect declares it as one of the kinds the "
                "article names (fire-truck rescue space recognised by the fire authority, sports fields, arcades, "
                "private and in-site roads, existing lanes); a label on a landscape sheet does not make it one."),
    "BTR-302": (["national", "constants", "tco2c_factor", "cite"],
                "Building Technical Regulations, Design and Construction Part, Art. 302",
                "The planting's total carbon fixation must exceed ½ × minimum greening area × β (β 0.66 for an "
                "ordinary site)."),
    "STD-5-T1": (["national", "artificial_ground", "cite"],
                 "Technical Specification for Building-Site Greening Design, point 5, table 1 and its note",
                 "On artificial ground a large tree needs a pit of at least 4.0 m² and 1.0 m of soil; a large tree in "
                 "a pit of 1.5–4 m² counts as a small tree (Gi 1.5 → 1.0); planting below the minimums is not counted."),
    "STD-F": (["national", "formulas", "cite", 1],
              "Technical Specification for Building-Site Greening Design, formulas (1)–(6)",
              "TCO2 = (Σ Gi × Ai) × α; TCO2c = 0.5 × A′ × β; α = 0.8 + 0.5 × ra, and ra = 0 with fewer than two tree "
              "species."),
    "BTR-305": (["national", "water_retention", "cite"],
                "Building Technical Regulations, Design and Construction Part, Art. 305",
                "The site must keep the original ground's ability to hold and infiltrate rain: its water-retention index "
                "must exceed 0.5 × the legal open-space ratio (1 − building coverage)."),
    "STD-WR": (["national", "water_retention_spec", "cite"],
               "Technical Specification for Building-Site Water Retention Design, point 5.1 and table 1",
               "λ = Q′ / Q0, Q0 = A0 × f × t (t = 86,400 s). Green space on natural ground: Q1 = A1·f·t. Unit permeable "
               "pavers: Q2 = 0.5·A2·f·t + 0.05·h·A2 (h = graded base ≤ 0.25 m; 0 on a concrete base). Garden soil on "
               "artificial ground (roof, balcony, ground over a basement): Q3 = 0.05·V3, soil counted to 0.6 m deep."),
    "STD-OLD": (["national", "tree_ai_rules", "old_tree_definition", "cite"],
                "Technical Specification for Building-Site Greening Design, point 3.6 and table 2 note 2",
                "An old tree (trunk at least 30 cm across at 1 m, or 20 years old) kept in place by the design counts "
                "twice its actual canopy projection area; transplanted, it counts as a new tree."),
    "BTR-92": (["national", "corridor_width", "cite"],
               "Building Technical Regulations, Design and Construction Part, Art. 92",
               "A corridor in a building whose rooms on one floor total 200 m² or more (100 m² below ground) needs a "
               "clear width of at least 1.2 m, or 1.6 m where rooms open on both sides."),
    "TC-TREE-3": (["municipal", "protected_trees", "cite", 0],
                  "Municipal tree protection ordinance, Art. 3",
                  "A tree outside forestry land is protected if its diameter at 1.3 m is at least 0.8 m, its girth at "
                  "least 2.5 m, or it is at least 50 years old, or rare, or of ecological or cultural value."),
    "TC-TREE-11": (["municipal", "protected_trees", "cite", 0],
                   "Municipal tree protection ordinance, Art. 11",
                   "Development projects must submit tree records and a protection or transplant plan to the "
                   "city's agriculture bureau and have it approved before work starts; protected trees stay in place as a rule."),
}


def citation(key: str) -> dict:
    path, article, gloss = CITES[key]
    try:
        url = _get(path)["url"]
    except (KeyError, IndexError, TypeError):
        url = ""
    return {"article": article, "url": url, "gloss": gloss}


def municipal_dbh_threshold() -> tuple[float, float]:
    t = _get(["municipal", "protected_trees"])
    return float(t["dbh_min_m"]), float(t["girth_min_m"])
