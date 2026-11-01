"""Label expansion: what a drawing label says about how many objects a symbol or a line stands for.

- "@3m" along a line of length L -> floor(L / 3) + 1 plants; "雙排" (double row) is reported, the caller counts
  each drawn line.
- "x8", "×8", "X8", "*8" at a symbol -> 8 at that symbol.
- "8-樟樹" (a group leader) -> the group the leader points into has 8 members.
- "typ." / "TYP" / 「同」 -> this symbol is the representative; the label applies to every identical symbol and
  never multiplies.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from shapely.geometry.base import BaseGeometry

_SPACING = re.compile(r"@\s*(\d+(?:\.\d+)?)\s*(m|cm|M)?(?![a-zA-Z])")
_TIMES = re.compile(r"[x×X*]\s*(\d+)\b")
_GROUP = re.compile(r"^\s*(\d+)\s*[-－–]\s*(\S.*)$")
_TYP = re.compile(r"\btyp\.?|\bTYP\b|\(typ\)|同", re.IGNORECASE)
_SPEC = re.compile(r"\b[HWC]\s*\d+(?:\.\d+)?\s*(?:m|cm)?\b|米徑\s*\d+\s*(?:cm)?|米高徑\s*\d+\s*(?:cm)?")
_DOUBLE = re.compile(r"雙排|double row", re.IGNORECASE)


@dataclass
class Expansion:
    species: str  # the label with counts, spacing, spec and typ. removed
    count: int | None  # how many objects the label implies, when it implies a number
    representative: bool = False  # "typ.": the label applies to all identical symbols
    spacing_m: float | None = None
    rows: int = 1  # 2 for "雙排"
    rule: str = ""  # which reading produced the count


def spacing_count(line, spacing_m: float) -> int:
    """Plants along a line (or a length in metres) at a given spacing, both ends planted: floor(L / s) + 1."""
    length = line.length if isinstance(line, BaseGeometry) else float(line)
    if spacing_m <= 0 or length <= 0:
        return 0
    return math.floor(round(length / spacing_m, 6)) + 1


def _species(text: str) -> str:
    s = _SPACING.sub(" ", text)
    s = _TIMES.sub(" ", s)
    s = _TYP.sub(" ", s)
    s = _SPEC.sub(" ", s)
    s = _DOUBLE.sub(" ", s)
    g = _GROUP.match(s)
    if g:
        s = g.group(2)
    return re.sub(r"\s+", " ", s).strip(" ,:;-")


def expand(label: str, geometry: BaseGeometry | float | None = None) -> Expansion:
    """Read a label. With a line (or its length) and an "@" spacing, count the plants along it (per drawn line)."""
    text = label.strip()
    species = _species(text)
    rows = 2 if _DOUBLE.search(text) else 1
    m = _SPACING.search(text)
    if m:
        spacing = float(m.group(1)) / (100 if (m.group(2) or "").lower() == "cm" else 1)
        count = spacing_count(geometry, spacing) if geometry is not None else None
        return Expansion(species, count, False, spacing, rows, f"@{spacing:g}m: floor(L/{spacing:g})+1")
    m = _TIMES.search(text)
    if m:
        return Expansion(species, int(m.group(1)), False, None, rows, f"x{m.group(1)} at the symbol")
    m = _GROUP.match(text)
    if m:
        return Expansion(species, int(m.group(1)), False, None, rows, f"group leader of {m.group(1)}")
    if _TYP.search(text):
        return Expansion(species, None, True, None, rows, "typ.: label applies to every identical symbol")
    return Expansion(species, None, False, None, rows, "")
