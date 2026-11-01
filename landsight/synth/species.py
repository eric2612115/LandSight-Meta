"""The plants on the synthetic site, as data: drawing code, English and Chinese names, botanical name and the native
flag the greening rule's native-tree bonus needs (trees only; None for shrubs and lawn, where it is not used).

English drawings label plants by code and the schedule resolves it ("CC" is Camphor · Cinnamomum camphora). name_zh
is a data column for the zh site only; nothing generated in English uses it."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Species:
    code: str
    name_en: str
    name_zh: str
    scientific: str
    native: bool | None
    form: str  # tree | shrub | lawn

    def label(self, lang: str) -> str:
        """The name as the drawing writes it: upper-case English, or the Chinese name."""
        return self.name_zh if lang == "zh" else self.name_en.upper()


SPECIES = {s.code: s for s in [
    Species("CC", "Camphor", "樟樹", "Cinnamomum camphora", True, "tree"),
    Species("BJ", "Bischofia", "茄苳", "Bischofia javanica", True, "tree"),  # the second native species of the swap fix
    Species("DU", "Duranta", "金露花", "Duranta erecta", None, "shrub"),
    Species("AZ", "Azalea", "杜鵑", "Rhododendron spp.", None, "shrub"),
    Species("LA", "Lawn", "草皮", "Zoysia matrella", None, "lawn"),
]}

TREE, HEDGE, SHRUB, LAWN = SPECIES["CC"], SPECIES["DU"], SPECIES["AZ"], SPECIES["LA"]


def species_table() -> list[dict]:
    return [asdict(s) for s in SPECIES.values()]
