"""Cross-file and regulation checks of a package review, one module per category; each returns Check objects in the
shape of docs/API.md (evidence always; a citation on regulation checks). The bill's own checks (bill, price,
arithmetic, units, bill revisions) live in landsight.bill."""

from landsight.checks.base import CATEGORIES, Check, cell_ref, citation, obj_ref

__all__ = ["CATEGORIES", "Check", "cell_ref", "citation", "obj_ref"]
