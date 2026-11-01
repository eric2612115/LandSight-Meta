"""Plain-text table of take-off items (for the terminal, the README and the tests' failure messages)."""

from __future__ import annotations

from landsight.takeoff.merge import Item


def _cell(v) -> str:
    return "-" if v is None else str(v)


def format_items(items: list[Item], notes: list[str] | None = None) -> str:
    head = ["ID", "kind", "label", "unit", "geometry", "Spark", "schedule", "label#", "agreed", "quote", "objects"]
    rows = [[it.id, it.kind, it.label, it.unit, _cell(it.geometry_count), _cell(it.spark_count),
             _cell(it.schedule_count), _cell(it.label_count), "yes" if it.agreed else "FLAG", _cell(it.quote_count),
             _objects(it)] for it in items]

    def width(s: str) -> int:
        return sum(2 if ord(c) > 0x2E80 else 1 for c in s)

    widths = [max(width(r[i]) for r in [head] + rows) for i in range(len(head))]
    line = lambda r: "  ".join(c + " " * (w - width(c)) for c, w in zip(r, widths)).rstrip()  # noqa: E731
    out = [line(head), line(["-" * w for w in widths])] + [line(r) for r in rows]
    flagged = [it for it in items if it.flagged_reason]
    if flagged:
        out.append("")
        out += [f"{it.id} {it.label}: {it.flagged_reason}" for it in flagged]
    if notes:
        out.append("")
        out += [f"note: {n}" for n in notes]
    return "\n".join(out)


def _objects(it: Item) -> str:
    ids = list(it.objects)
    if len(ids) > 3:
        return f"{ids[0]}..{ids[-1]}"
    return ",".join(ids) or "-"
