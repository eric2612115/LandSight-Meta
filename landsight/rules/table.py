"""Plain-text table of rule results (the second table of `landsight takeoff`)."""

from __future__ import annotations

from landsight.rules.base import RuleResult


def _w(s: str) -> int:
    return sum(2 if ord(c) > 0x2E80 else 1 for c in s)


def _pad(s: str, n: int) -> str:
    return s + " " * max(0, n - _w(s))


def _num(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, float) and not v.is_integer():
        return f"{v:,.2f}".rstrip("0").rstrip(".")
    return f"{v:,.0f}" if isinstance(v, (int, float)) else str(v)


def format_rules(results: list[RuleResult]) -> str:
    out = []
    for r in results:
        head = f"{r.title} · {r.jurisdiction} · {r.status.upper().replace('_', ' ')}"
        if r.required is not None:
            head += f" · required {r.required:g} · provided {r.provided:g} {r.unit}"
        out += [head, "-" * min(_w(head), 110)]
        rows = [[t.symbol, f"{t.zh} ({t.en})", f"{_num(t.value)} {t.unit}".strip(), t.formula or t.source, t.cite]
                for t in r.terms]
        if rows:
            widths = [max(_w(row[i]) for row in rows) for i in range(5)]
            widths[3] = min(widths[3], 70)
            out += ["  ".join(_pad(c, w) for c, w in zip(row, widths)).rstrip() for row in rows]
        for f in r.fixes:
            out.append(f"fix {f.id}: {f.action} → {f.provided:g} {'pass' if f.passes else 'still short'}")
        out += [f"note: {n}" for n in r.notes]
        if r.citations:
            out.append("cites: " + "; ".join(f"{c.key} {c.title}" for c in r.citations))
        out.append("")
    return "\n".join(out).rstrip()
