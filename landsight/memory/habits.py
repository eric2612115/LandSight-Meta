"""A firm's habits: distilled by Muse Wonder from the decisions its estimator made (confirm: send it back to the
developer; dismiss: not worth raising; each with a note), stored per firm in landsight.db (table firm_memory), and
applied to the next run: its findings ordered and grouped the firm's way and the reply to the developer drafted in the
firm's voice.

- evidence(conn): every decided check (the latest decision per package and check), with the check's scenario,
  category, severity, title, reason and numbers and the estimator's note; no run ids or times, so the same decisions
  always make the same prompt (and replay the same recording).
- distil(conn, firm): one Muse Wonder call (firm_habits, JSON schema) turns the evidence into the habits; stored.
- arrange(habits, run): no model; each alarming finding (fail, flag, review; not dismissed) goes to the most specific
  habit group that matches it (categories, scenarios, severities, keywords in the title); a price inside the firm's
  tolerance is kept internal; a finding no habit names stays in the email, never hidden, in an "Other ... points"
  group placed after the firm's last group of the same scenario (so a new kind of regulation finding still comes
  where this firm puts regulation). The firm's plant substitutions are attached to the findings that name the plant.
- reply(...): the default email (the run's order, a neutral template) and the firm's email: one Muse Wonder call
  (firm_reply) with the habits and the grouped findings; every number in the draft is checked against what it was
  given. With no recording and no key, the firm's email falls back to a template built from the habits' own
  greeting, opening, closing and sign-off."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3

from landsight.checks.base import CATEGORIES, SEVERITIES
from landsight.memory.wonder import FIXTURES, WONDER_MODEL, Wonder
from landsight.review.scenarios import SCENARIOS

TABLE = """CREATE TABLE IF NOT EXISTS firm_memory (
  firm TEXT PRIMARY KEY, habits TEXT NOT NULL, evidence TEXT NOT NULL, model TEXT, call TEXT, updated_at TEXT NOT NULL)"""
ALARMS = ("fail", "flag", "review")
NUMBER_KEYS = ("bill_qty", "bill_unit", "drawn_qty", "drawn_unit", "unit_price", "bill_price", "list_low", "list_high",
               "amount", "required", "provided")


class NoMemory(KeyError):
    pass


# --------------------------------------------------------------------------------------------- the store


def ensure(conn: sqlite3.Connection) -> None:
    with conn:
        conn.execute(TABLE)


def get_memory(conn: sqlite3.Connection, firm: str) -> dict:
    ensure(conn)
    row = conn.execute("SELECT * FROM firm_memory WHERE firm = ?", (firm,)).fetchone()
    if row is None:
        raise NoMemory(f"no memory for firm {firm!r}: distil it first (landsight memory distil --firm {firm!r})")
    return {"firm": row["firm"], "habits": json.loads(row["habits"]), "evidence": json.loads(row["evidence"]),
            "model": row["model"], "call": json.loads(row["call"] or "{}"), "updated_at": row["updated_at"]}


def save_memory(conn: sqlite3.Connection, firm: str, habits: dict, evidence_rows: list[dict], call: dict) -> dict:
    from landsight.store.db import now

    ensure(conn)
    with conn:
        conn.execute("INSERT INTO firm_memory(firm, habits, evidence, model, call, updated_at) VALUES (?,?,?,?,?,?) "
                     "ON CONFLICT(firm) DO UPDATE SET habits = excluded.habits, evidence = excluded.evidence, "
                     "model = excluded.model, call = excluded.call, updated_at = excluded.updated_at",
                     (firm, _j(habits), _j(evidence_rows), call.get("model"), _j(call), now()))
    return get_memory(conn, firm)


def forget(conn: sqlite3.Connection, firm: str) -> bool:
    ensure(conn)
    with conn:
        return conn.execute("DELETE FROM firm_memory WHERE firm = ?", (firm,)).rowcount > 0


def firms(conn: sqlite3.Connection) -> list[str]:
    ensure(conn)
    return [r[0] for r in conn.execute("SELECT firm FROM firm_memory ORDER BY firm")]


# --------------------------------------------------------------------------------------------- the evidence


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def numbers_of(check: dict) -> dict:
    n = check.get("numbers") or {}
    if isinstance(n, str):
        try:
            n = json.loads(n)
        except ValueError:
            n = {}
    return n if isinstance(n, dict) else {}


def _short(s: str, n: int = 240) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def evidence(conn: sqlite3.Connection, run_ids: list[str] | None = None) -> list[dict]:
    """The firm's decided checks (confirm or dismiss; "open" is no decision), the latest per package and check id,
    sorted by package and check id."""
    q = ("SELECT d.run_id, d.check_id, d.decision, d.note, c.body, p.name AS package FROM decisions d "
         "JOIN checks c ON c.run_id = d.run_id AND c.check_id = d.check_id JOIN runs r ON r.id = d.run_id "
         "LEFT JOIN packages p ON p.id = r.package_id WHERE d.decision IN ('confirm', 'dismiss')")
    args: list = []
    if run_ids:
        q += " AND d.run_id IN (" + ",".join("?" * len(run_ids)) + ")"
        args += list(run_ids)
    latest: dict[tuple[str, str], dict] = {}
    for r in conn.execute(q + " ORDER BY d.decided_at, d.rowid", args):
        body = json.loads(r["body"])
        n = numbers_of(body)
        latest[(r["package"] or "", r["check_id"])] = {
            "package": r["package"] or "", "check_id": r["check_id"], "scenario": body.get("scenario"),
            "category": body.get("category"), "severity": body.get("severity"), "title": body.get("title", ""),
            "reason": _short(body.get("why", "")), "numbers": {k: n[k] for k in NUMBER_KEYS if k in n},
            "decision": r["decision"], "note": (r["note"] or "").strip()}
    return [latest[k] for k in sorted(latest)]


def _evidence_lines(rows: list[dict]) -> str:
    out = []
    for e in rows:
        nums = ", ".join(f"{k} {v}" for k, v in e["numbers"].items())
        out.append(f"- [{e['check_id']}] package: {e['package']} | {e['scenario']} | {e['category']} | {e['severity']} | "
                   f"\"{e['title']}\" | reason: {e['reason']}" + (f" | numbers: {nums}" if nums else "")
                   + f"\n  decision: {e['decision']}" + (f" | note: \"{e['note']}\"" if e["note"] else ""))
    return "\n".join(out)


# --------------------------------------------------------------------------------------------- distil (Muse Wonder)

MATCH = {"type": "object", "properties": {
    "categories": {"type": "array", "items": {"type": "string", "enum": list(CATEGORIES)}},
    "scenarios": {"type": "array", "items": {"type": "string", "enum": list(SCENARIOS)}},
    "severities": {"type": "array", "items": {"type": "string", "enum": list(SEVERITIES)}},
    "keywords": {"type": "array", "items": {"type": "string"}}},
    "required": ["categories", "scenarios", "severities", "keywords"], "additionalProperties": False}
GROUP = {"type": "object", "properties": {
    "name": {"type": "string"}, "match": MATCH, "why": {"type": "string"},
    "evidence": {"type": "array", "items": {"type": "string"}}},
    "required": ["name", "match", "why", "evidence"], "additionalProperties": False}
HABITS_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "send_back": {"type": "array", "items": GROUP},
        "handle_internally": {"type": "array", "items": GROUP},
        "pricing": {"type": "object", "properties": {
            "basis": {"type": "string"}, "tolerance_pct": {"type": "number"},
            "conventions": {"type": "array", "items": {"type": "string"}},
            "evidence": {"type": "array", "items": {"type": "string"}}},
            "required": ["basis", "tolerance_pct", "conventions", "evidence"], "additionalProperties": False},
        "species_substitutions": {"type": "array", "items": {"type": "object", "properties": {
            "from": {"type": "string"}, "to": {"type": "string"}, "when": {"type": "string"},
            "evidence": {"type": "array", "items": {"type": "string"}}},
            "required": ["from", "to", "when", "evidence"], "additionalProperties": False}},
        "reply": {"type": "object", "properties": {
            "tone": {"type": "string"}, "greeting": {"type": "string"}, "opening": {"type": "string"},
            "closing": {"type": "string"}, "sign_off": {"type": "string"},
            "rules": {"type": "array", "items": {"type": "string"}},
            "evidence": {"type": "array", "items": {"type": "string"}}},
            "required": ["tone", "greeting", "opening", "closing", "sign_off", "rules", "evidence"],
            "additionalProperties": False},
    },
    "required": ["summary", "send_back", "handle_internally", "pricing", "species_substitutions", "reply"],
    "additionalProperties": False,
}
DISTIL_PROMPT = (
    "Below are decisions a landscape design firm's estimator made on the findings of an automated review of "
    "developers' landscape packages (drawings, bills of quantities, documents). Each finding shows its id, package, "
    "scenario, category, severity, title, the reviewer's reason and its numbers; then the estimator's decision "
    "(confirm: raise it with the developer; dismiss: not worth raising) and the estimator's note. Distil the firm's "
    "habits, so that the next package can be handled the firm's way:\n"
    "- summary: two sentences on how this firm reviews a package.\n"
    "- send_back: the kinds of finding the firm always raises with the developer, in the order the firm wants them "
    "in its email, most important first. Define each kind as broadly as the decisions allow, so that it carries over "
    "to the next package, whose findings will be different ones: by categories and scenarios first; add severities "
    "or keywords only where the firm treats findings of the same category and scenario differently (for example it "
    "sends one kind of bill finding back and keeps another). Each: name (a short heading for the email to the "
    "developer), match (categories, scenarios and severities chosen from the lists below, and keywords: lower-case "
    "words from the titles; an empty list matches anything), why the firm raises it (from the notes), and evidence "
    "(the finding ids that show it).\n"
    "- handle_internally: the kinds of finding the firm notes but does not send back, in the same form.\n"
    "- pricing: basis (what the firm's rates include), tolerance_pct (how far, in percent, a developer's unit rate may "
    "sit outside the firm's list before the firm queries it; 0 if the decisions do not say), up to five conventions, "
    "and evidence.\n"
    "- species_substitutions: the plants the firm proposes instead of others: from, to, when, evidence.\n"
    "- reply: how the firm writes to a developer: tone (a few words), greeting, opening (one sentence), closing (one "
    "sentence), sign_off, up to five rules for wording the points, and evidence.\n"
    "Use only what the decisions show; leave a list empty rather than guess.\n"
    "Categories: " + ", ".join(CATEGORIES) + ". Scenarios: " + ", ".join(SCENARIOS) + ". Severities: "
    + ", ".join(SEVERITIES) + ".\n\nDecisions:\n"
)


def distil(conn: sqlite3.Connection, firm: str, live: bool = False, run_ids: list[str] | None = None,
           wonder: Wonder | None = None) -> dict:
    """Muse Wonder distils the firm's habits from its decisions; the habits are stored under `firm`."""
    rows = evidence(conn, run_ids)
    if not rows:
        raise ValueError("no decisions to learn from: confirm or dismiss some findings first (POST "
                         "/api/runs/{id}/checks/{check}/decision, or landsight memory seed-sample)")
    wonder = wonder or Wonder("live" if live else "fixtures")
    text = _evidence_lines(rows)
    key = "habits:" + hashlib.sha256(text.encode()).hexdigest()[:16]
    habits = wonder.ask("firm_habits", key, DISTIL_PROMPT + text, HABITS_SCHEMA)
    return save_memory(conn, firm, habits, rows, _call(wonder))


def _call(wonder: Wonder) -> dict:
    """The last Muse Wonder answer used: model, seconds, usage, response id, the recording, replayed or live."""
    from landsight.store.service import _fixture_ref

    e = wonder.log[-1] if wonder.log else {}
    rec_id = e.get("response_id")
    if not rec_id and e.get("fixture"):  # a replayed answer: the response id is in its recording
        try:
            from pathlib import Path

            rec_id = json.loads((Path(e.get("fixture_dir") or FIXTURES) / e["fixture"]).read_text()).get("response_id")
        except (OSError, ValueError):
            rec_id = None
    return {"model": e.get("model") or WONDER_MODEL, "seconds": e.get("seconds"), "usage": e.get("usage") or {},
            "response_id": rec_id, "recorded": bool(e.get("recorded")), "recorded_at": e.get("recorded_at"),
            "fixture": _fixture_ref(e) or None}


# --------------------------------------------------------------------------------------------- arrange (no model)


def matches(match: dict, check: dict) -> bool:
    title = (check.get("title") or "").lower()
    return ((not match.get("categories") or check.get("category") in match["categories"])
            and (not match.get("scenarios") or check.get("scenario") in match["scenarios"])
            and (not match.get("severities") or check.get("severity") in match["severities"])
            and (not match.get("keywords") or any(k.lower().strip() in title for k in match["keywords"] if k.strip())))


def specificity(match: dict) -> int:
    return (2 if any(k.strip() for k in match.get("keywords") or []) else 0) + sum(
        1 for k in ("categories", "scenarios", "severities") if match.get(k))


def price_deviation(check: dict) -> float | None:
    """How far, in percent, a price finding's unit rate sits outside the firm's list (None for other findings)."""
    if check.get("category") != "price":
        return None
    n = numbers_of(check)
    price, lo, hi = n.get("bill_price", n.get("unit_price")), n.get("list_low"), n.get("list_high")
    if not all(isinstance(v, (int, float)) for v in (price, lo, hi)) or not lo or not hi:
        return None
    if price < lo:
        return round((lo - price) / lo * 100, 1)
    if price > hi:
        return round((price - hi) / hi * 100, 1)
    return 0.0


def _plant_words(name: str) -> str:
    return re.sub(r"\(.*?\)", "", name or "").strip().lower()


def substitutions_for(habits: dict, check: dict) -> list[str]:
    title = (check.get("title") or "").lower()
    out = []
    for s in habits.get("species_substitutions") or []:
        w = _plant_words(s.get("from", ""))
        if w and w in title:
            out.append(f"the firm proposes {s.get('to', '').strip()} instead of {s.get('from', '').strip()}"
                       + (f" ({s['when'].strip()})" if s.get("when", "").strip() else ""))
    return out


SEVERITY_ORDER = {"fail": 0, "flag": 1, "review": 2}
OTHER_NAMES = {"regulation": "Other regulation points", "design": "Other drawing points",
               "quote": "Other bill and price points", "format": "Other file points", "info": "Other points"}


def _finding(c: dict) -> dict:
    return {k: c.get(k) for k in ("check_id", "severity", "scenario", "category", "title")}


def findings_of(run: dict) -> list[dict]:
    """The findings a reply can carry: alarming checks (fail, flag, review) a person has not dismissed."""
    return [c for c in run.get("checks", []) if c.get("severity") in ALARMS and c.get("decision") != "dismiss"]


def arrange(habits: dict, run: dict) -> dict:
    """{before: the findings in the run's order, groups: the firm's groups in the firm's order (send: true first,
    then the ones it keeps internal)}."""
    found = findings_of(run)
    rules = [("send", i, g) for i, g in enumerate(habits.get("send_back") or [])] + \
            [("keep", i, g) for i, g in enumerate(habits.get("handle_internally") or [])]
    tol = float((habits.get("pricing") or {}).get("tolerance_pct") or 0)
    placed: dict[tuple[str, int], list[dict]] = {}
    for c in found:
        f = _finding(c)
        dev = price_deviation(c)
        if dev is not None:
            f["outside_list_pct"] = dev
        notes = substitutions_for(habits, c)
        if notes:
            f["firm_notes"] = notes
        if tol and dev is not None and dev <= tol:
            target = ("tolerance", 0)
        else:
            hits = [(-specificity(g["match"]), 0 if kind == "send" else 1, i, kind) for kind, i, g in rules
                    if matches(g.get("match") or {}, c)]
            target = (min(hits)[3], min(hits)[2]) if hits else ("other", SCENARIOS.index(c.get("scenario"))
                                                                 if c.get("scenario") in SCENARIOS else len(SCENARIOS))
        placed.setdefault(target, []).append(f)
    groups = []

    def add(target, name, why, send):
        items = placed.get(target)
        if items:
            items.sort(key=lambda f: SEVERITY_ORDER.get(f["severity"], 9))  # stable: the run's order within a severity
            groups.append({"name": name, "why": why, "send": send, "checks": items})

    send_back = habits.get("send_back") or []
    last = {}  # scenario -> the firm's last send group that names it: unmatched findings of that scenario follow it
    for i, g in enumerate(send_back):
        for s in (g.get("match") or {}).get("scenarios") or []:
            last[s] = i
    other_why = "No habit names these yet; they go to the developer as the review found them, where the firm puts " \
                "this scenario."

    def add_others(at: int | None):
        for k, s in enumerate(SCENARIOS):
            if last.get(s) == at:
                add(("other", k), OTHER_NAMES.get(s, "Other points"), other_why, True)

    for i, g in enumerate(send_back):
        add(("send", i), g.get("name") or f"Group {i + 1}", g.get("why", ""), True)
        add_others(i)
    add_others(None)
    add(("other", len(SCENARIOS)), "Other points", other_why, True)
    for i, g in enumerate(habits.get("handle_internally") or []):
        add(("keep", i), g.get("name") or f"Internal {i + 1}", g.get("why", ""), False)
    add(("tolerance", 0), f"Within the firm's price tolerance ({tol:g}%)",
        "The firm lets a unit rate this close to its list go.", False)
    return {"before": [_finding(c) for c in found], "groups": groups}


# --------------------------------------------------------------------------------------------- the reply


def _project(run: dict) -> tuple[str, str]:
    from landsight.store.service import project_name

    pkg = run.get("package", {}).get("name", "the package")
    return project_name(pkg), pkg


def default_reply(run: dict) -> dict:
    """The neutral email: every finding in the run's order (what a reply looks like with no firm memory)."""
    project, pkg = _project(run)
    found = findings_of(run)
    rest = pkg[len(project):].lstrip(" —–-") if pkg.startswith(project) else pkg
    body = "\n".join(["Dear developer,", "",
                      f"We reviewed {pkg}. Please revise these {len(found)} points before we price the job:", ""]
                     + [f"{n}. {c['title']}" for n, c in enumerate(found, 1)] + ["", "Regards"])
    return {"subject": f"Change request — {project} — {rest or pkg}", "body": body, "by": "template",
            "order": [c["check_id"] for c in found]}


def _reason(run: dict, check_id: str) -> str:
    c = next((c for c in run.get("checks", []) if c["check_id"] == check_id), {})
    return _short(c.get("why", ""), 300)


def _findings_block(run: dict, groups: list[dict]) -> str:
    out = []
    for g in groups:
        if not g["send"]:
            continue
        out.append(f"## {g['name']}")
        for f in g["checks"]:
            line = f"- [{f['check_id']}] {f['title']} | reason: {_reason(run, f['check_id'])}"
            for note in f.get("firm_notes") or []:
                line += f" | firm note: {note}"
            out.append(line)
    return "\n".join(out)


REPLY_SCHEMA = {
    "type": "object",
    "properties": {"subject": {"type": "string"}, "body": {"type": "string"},
                   "order": {"type": "array", "items": {"type": "string"}}},
    "required": ["subject", "body", "order"],
    "additionalProperties": False,
}
REPLY_PROMPT = (
    "Draft the email a landscape design firm sends to a developer after reviewing the developer's landscape package, "
    "written the way this firm writes. The firm's habits, learned from its past decisions, are below as JSON: follow "
    "their reply section (tone, greeting, opening, closing, sign-off, rules) and their pricing conventions. Then the "
    "findings to send back, already grouped and ordered the firm's way; each has an id, its title, the reviewer's "
    "reason and, sometimes, a note from the firm.\n"
    "- subject: one line naming the project.\n"
    "- body: plain text: the greeting; the opening; the groups in the order given, each under a short heading, with "
    "the findings numbered 1, 2, 3 ... through the whole email, one or two sentences each saying what to change; then "
    "the closing and the sign-off. Keep numbers, ids, units and prices exactly as given; add no finding, number or "
    "price that is not given.\n"
    "- order: the finding ids in the order the body numbers them.\n\n"
)


def _numbers_in(text: str) -> set[str]:
    return {m.replace(",", "").rstrip(".") for m in re.findall(r"\d[\d,]*(?:\.\d+)?", text or "")}


def firm_reply(run: dict, habits: dict, groups: list[dict], live: bool = False, wonder: Wonder | None = None) -> dict:
    """Muse Wonder drafts the email in the firm's voice (recorded). Every number in the draft is checked against the
    findings, the habits and the package name it was given; ids the draft leaves out or adds are listed."""
    from landsight.review.spark import FixtureMissing, SparkUnavailable

    project, pkg = _project(run)
    sent = [f["check_id"] for g in groups if g["send"] for f in g["checks"]]
    block = _findings_block(run, groups)
    habits_json = json.dumps(habits, ensure_ascii=False, sort_keys=True)
    prompt = (REPLY_PROMPT + f"The firm's habits:\n{habits_json}\n\nThe package: {pkg} (project {project})\n\n"
              f"The findings to send back:\n{block}")
    wonder = wonder or Wonder("live" if live else "fixtures")
    key = "reply:" + hashlib.sha256(prompt.encode()).hexdigest()[:16]
    try:
        out = wonder.ask("firm_reply", key, prompt, REPLY_SCHEMA)
    except (FixtureMissing, SparkUnavailable) as e:
        return template_reply(run, habits, groups) | {"note": f"Muse Wonder not asked ({type(e).__name__}): the firm's "
                                                              "template from its habits"}
    given = _numbers_in(block + habits_json + pkg) | {str(i) for i in range(1, len(sent) + 6)}
    order = [i for i in out.get("order") or []]
    return {"subject": out.get("subject", ""), "body": out.get("body", ""), "order": order, "by": WONDER_MODEL,
            "missing": [i for i in sent if i not in order], "added": [i for i in order if i not in sent],
            "unverified_numbers": sorted(_numbers_in(out.get("body", "")) - given, key=lambda s: (len(s), s)),
            "call": _call(wonder)}


def template_reply(run: dict, habits: dict, groups: list[dict]) -> dict:
    """The firm's email without a model: its greeting, opening, closing and sign-off around the grouped findings."""
    project, pkg = _project(run)
    r = habits.get("reply") or {}
    lines = [r.get("greeting") or "Dear developer,", "", r.get("opening") or f"We reviewed {pkg}.", ""]
    n = 0
    order = []
    for g in groups:
        if not g["send"]:
            continue
        lines.append(g["name"])
        for f in g["checks"]:
            n += 1
            order.append(f["check_id"])
            lines.append(f"{n}. {f['title']}" + "".join(f" — {note}" for note in f.get("firm_notes") or []))
        lines.append("")
    lines += [r.get("closing") or "", "", r.get("sign_off") or "Regards"]
    return {"subject": f"Change request — {project}", "body": "\n".join(lines).replace("\n\n\n", "\n\n"),
            "order": order, "by": "template"}


def apply(conn: sqlite3.Connection, firm: str, run_id: str, live: bool = False, wonder: Wonder | None = None) -> dict:
    """The run as the firm would handle it: before (the run's order, the neutral email) and after (the firm's groups
    and order, the email in the firm's voice)."""
    from landsight.store import service

    mem = get_memory(conn, firm)
    run = service.get_run(conn, run_id)
    arranged = arrange(mem["habits"], run)
    after_order = [f["check_id"] for g in arranged["groups"] for f in g["checks"]]
    return {"firm": firm, "run_id": run_id, "package": run.get("package", {}).get("name"),
            "memory": {"model": mem["model"], "updated_at": mem["updated_at"], "decisions": len(mem["evidence"])},
            "before": {"order": [f["check_id"] for f in arranged["before"]], "findings": arranged["before"],
                       "reply": default_reply(run)},
            "after": {"order": after_order, "groups": arranged["groups"],
                      "sent": [f["check_id"] for g in arranged["groups"] if g["send"] for f in g["checks"]],
                      "kept_internal": [f["check_id"] for g in arranged["groups"] if not g["send"] for f in g["checks"]],
                      "reply": firm_reply(run, mem["habits"], arranged["groups"], live=live, wonder=wonder)}}


__all__ = ["FIXTURES", "NoMemory", "apply", "arrange", "default_reply", "distil", "evidence", "firm_reply", "firms",
           "forget", "get_memory", "save_memory", "template_reply"]
