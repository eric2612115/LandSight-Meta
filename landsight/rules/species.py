"""The plant data the greening rule needs: the 技術規範 表1 Gi classes and a small species table with native flags.
Species not in the table are counted conservatively (small tree, not native) and noted."""

from __future__ import annotations

from dataclasses import dataclass

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


@dataclass(frozen=True)
class Species:
    zh: str
    en: str
    botanical: str
    gi_class: str
    native: bool | None  # None: not a tree, or unknown


SPECIES = {s.zh: s for s in [
    Species("樟樹", "Camphor", "Cinnamomum camphora", "broadleaf_large", True),
    Species("茄苳", "Bischofia", "Bischofia javanica", "broadleaf_large", True),
    Species("國內欒樹", "national golden-rain tree", "Koelreuteria elegans subsp. formosana", "broadleaf_large", True),
    Species("小葉欖仁", "Madagascar almond", "Terminalia mantaly", "broadleaf_large", False),
    Species("金露花", "Duranta", "Duranta erecta", "shrub", None),
    Species("杜鵑", "Azalea", "Rhododendron spp.", "shrub", None),
    Species("草皮", "Lawn", "", "lawn", None),
]}
ALIASES = {"國內欒樹": "國內欒樹", "茄冬": "茄苳", "草坪": "草皮", "CAMPHOR": "樟樹", "BISCHOFIA": "茄苳",
           "DURANTA": "金露花", "AZALEA": "杜鵑", "LAWN": "草皮", "TURF": "草皮"}
SECOND_NATIVE = "茄苳"  # the species the swap fix proposes


def lookup(name: str) -> Species | None:
    key = (name or "").strip()
    if key in SPECIES:
        return SPECIES[key]
    for alias, target in ALIASES.items():
        if alias in key.upper() or alias == key:
            return SPECIES[target]
    return next((s for s in SPECIES.values() if s.zh in key or (s.botanical and s.botanical.upper() in key.upper())), None)


def gloss(name: str) -> str:
    """'樟樹 (Camphor)'; an unknown name is returned as it is."""
    s = lookup(name)
    return f"{name} ({s.en})" if s and s.en else name
