"""The plant data the greening rule needs, read from landsight/data/species.csv (60 sourced species: the 技術規範 表1 Gi
class, native, bird- or butterfly-attracting, names and codes, each with its source) plus the 表1 Gi classes.

A tree counts toward ra (formula (6)) when it is native OR bird- or butterfly-attracting. Species not in the table are
counted conservatively (small tree, Gi 1.0, not counted toward ra) and the greening check says "needs review: species
not in table". The only rows written here are generic planting words that are not species (lawn, turf)."""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[1] / "data" / "species.csv"

# 建築基地綠化設計技術規範 表1: 固碳當量 Gi, kgCO2e/(m²·yr)
GI = {
    "eco_multilayer": (2.00, "生態複層", "mixed multilayer planting (tree spacing ≤ 3.5 m)"),
    "broadleaf_large": (1.50, "闊葉大喬木", "broadleaf large tree"),
    "small_tree": (1.00, "闊葉小喬木、針葉喬木、疏葉喬木", "small broadleaf, conifer or sparse-leaf tree"),
    "palm": (0.66, "棕櫚類", "palm"),
    "shrub": (0.50, "灌木", "shrub"),
    "vine": (0.40, "多年生蔓藤", "perennial vine"),
    "lawn": (0.30, "草花花圃、草坪", "flower bed or lawn"),
}
TREE_CLASSES = ("eco_multilayer", "broadleaf_large", "small_tree", "palm")
GI_BY_VALUE = {v[0]: k for k, v in GI.items()}

# The short English name the product already uses on screen for a few species (the CSV's own name_en otherwise).
SHORT_EN = {"CC": "Camphor", "BJ": "Bischofia", "KF": "Flamegold", "DE": "Duranta", "AZ": "Azalea"}
NOT_IN_TABLE = "needs review: species not in table"


@dataclass(frozen=True)
class Species:
    zh: str
    en: str
    botanical: str
    gi_class: str
    native: bool | None  # native (species.csv native); None: not a species
    attracting: bool | None = None  # bird or butterfly attracting (species.csv); None: unknown
    code: str = ""
    aliases_zh: tuple[str, ...] = ()
    names_en: tuple[str, ...] = field(default=())

    @property
    def is_tree(self) -> bool:
        return self.gi_class in TREE_CLASSES

    @property
    def counts_for_ra(self) -> bool:
        """Formula (6): a tree that is native or bird- or butterfly-attracting."""
        return self.is_tree and (self.native is True or self.attracting is True)


# generic planting words, not species: kept here because the CSV lists grasses by species
GENERIC = [Species("草皮", "Lawn", "", "lawn", None, None, "LN", ("草坪",), ("LAWN", "TURF", "GRASS"))]


def _flag(v: str) -> bool | None:
    v = (v or "").strip().lower()
    return True if v == "true" else False if v == "false" else None


def _gi_class(row: dict) -> str:
    try:
        return GI_BY_VALUE[float(row["gi_class"])]
    except (KeyError, ValueError):
        return {"large_tree": "broadleaf_large", "small_tree": "small_tree", "palm": "palm", "shrub": "shrub",
                "vine": "vine", "lawn": "lawn", "groundcover": "lawn"}.get(row.get("type", ""), "small_tree")


@lru_cache(maxsize=1)
def table() -> tuple[Species, ...]:
    """Every species of species.csv, in the file's order, then the generic rows."""
    out = []
    try:
        rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    except OSError:
        rows = []
    for r in rows:
        code = r["code"].strip()
        name_en = r["name_en"].strip()
        base = re.sub(r"\s*\(.*\)\s*$", "", name_en)
        inner = re.findall(r"\(([^)]*)\)", name_en)
        en = SHORT_EN.get(code, base or name_en)
        names = tuple(dict.fromkeys(n.upper() for n in (en, base, name_en, *inner, r["scientific"].strip()) if n))
        aliases = tuple(a.strip() for a in re.split(r"[,，]", r.get("aliases_zh") or "") if a.strip()
                        and "(" not in a)
        out.append(Species(r["name_zh"].strip(), en, r["scientific"].strip(), _gi_class(r),
                           _flag(r["native"]), _flag(r["bird_or_butterfly_attracting"]), code, aliases, names))
    return tuple(out + GENERIC)


SPECIES = {s.zh: s for s in table()}


def _words(alias: str, text: str) -> bool:
    return re.search(rf"(?<![A-Z]){re.escape(alias)}(?![A-Z])", text) is not None


def lookup(name: str) -> Species | None:
    """The species a drawing or schedule label names: exact Chinese name, alias, code, English or botanical name
    first, then the longest name contained in the label. None when the table does not know it."""
    key = (name or "").strip()
    if not key:
        return None
    up = key.upper()
    rows = table()
    for s in rows:
        if key == s.zh or key in s.aliases_zh or up in s.names_en or (s.code and key == s.code and len(key) <= 3):
            return s
    best, size = None, 0
    for s in rows:
        for zh in (s.zh, *s.aliases_zh):
            if zh in key and len(zh) > size:
                best, size = s, len(zh)
        for en in s.names_en:
            if len(en) > size and _words(en, up):
                best, size = s, len(en)
    return best


def second_species(main: str, planted: set[str]) -> list[Species]:
    """Candidates for the swap fix: trees that count toward ra (native or bird/butterfly-attracting), not the main
    species and not already planted, in the CSV's order (natives first)."""
    m = lookup(main)
    cands = [s for s in table() if s.counts_for_ra and s.zh != (m.zh if m else main) and s.zh not in planted]
    return sorted(cands, key=lambda s: s.native is not True)


def gloss(name: str) -> str:
    """'樟樹 (Camphor)'; an unknown name is returned as it is."""
    s = lookup(name)
    return f"{name} ({s.en})" if s and s.en and s.en != name else name
