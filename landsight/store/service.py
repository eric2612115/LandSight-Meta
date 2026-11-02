"""What the CLI and the API do with landsight.db: register a package folder under a project, review it (the review
prices against the firm's list in the database and every Meta call it used is written to meta_calls), read runs
back with their confirmations, edit the price list, and record confirmations, notes and flags."""

from __future__ import annotations

import copy
import json
import sqlite3
from pathlib import Path

from landsight.store import db as D

PRICE_LIST_NAME = "your price list (landsight.db)"
CONFIRM_KINDS = ("confirm_element", "confirm_price", "regulation_note", "flag")


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def _folder_key(folder: Path) -> str:
    """How a folder is stored: relative to the repo when inside it (portable), absolute otherwise."""
    f = Path(folder).expanduser().resolve()
    return str(f.relative_to(D.REPO)) if f.is_relative_to(D.REPO) else str(f)


def _folder_path(key: str) -> Path:
    p = Path(key)
    return p if p.is_absolute() else D.REPO / p


def project_name(package_name: str) -> str:
    """'Greenfield Residences — Landscape Package' -> 'Greenfield Residences'."""
    return package_name.split(" — ")[0].strip() or package_name


# --------------------------------------------------------------------------------------------- projects and packages


def ensure_project(conn: sqlite3.Connection, name: str) -> int:
    with conn:
        conn.execute("INSERT OR IGNORE INTO projects(name, created_at) VALUES (?, ?)", (name, D.now()))
    return conn.execute("SELECT id FROM projects WHERE name = ?", (name,)).fetchone()[0]


def register_package(conn: sqlite3.Connection, project_id: int, folder: str | Path, name: str | None = None,
                     kind: str | None = None) -> dict:
    """Register a package folder (the package folder itself, or the folder `landsight package` wrote it into)."""
    from landsight.review.run import locate

    if not conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
        raise KeyError(f"no project {project_id}")
    root, key, _ = locate(Path(folder))
    outer = root.parent if key is not None else root
    fkey = _folder_key(outer)
    with conn:
        conn.execute("INSERT OR IGNORE INTO packages(project_id, name, folder, kind, registered_at) VALUES (?,?,?,?,?)",
                     (project_id, name or root.name, fkey, kind or ("tower" if "tower" in root.name.lower() else "site"),
                      D.now()))
    row = conn.execute("SELECT * FROM packages WHERE project_id = ? AND folder = ?", (project_id, fkey)).fetchone()
    return package_dict(conn, row)


def package_for_folder(conn: sqlite3.Connection, folder: str | Path) -> dict:
    """The package row for a folder, registered under the project its name gives when it is new."""
    from landsight.review.run import locate

    root, _, _ = locate(Path(folder))
    return register_package(conn, ensure_project(conn, project_name(root.name)), folder)


def package_dict(conn: sqlite3.Connection, row) -> dict:
    last = conn.execute("SELECT id, mode, finished_at, planted, found, flagged, missed, false_alarms, spark_calls, "
                        "total_s FROM runs WHERE package_id = ? ORDER BY finished_at DESC, rowid DESC LIMIT 1",
                        (row["id"],)).fetchone()
    runs = conn.execute("SELECT COUNT(*) FROM runs WHERE package_id = ?", (row["id"],)).fetchone()[0]
    return {"package_id": row["id"], "project_id": row["project_id"], "name": row["name"], "folder": row["folder"],
            "kind": row["kind"], "registered_at": row["registered_at"], "runs": runs,
            "latest_run": dict(last) if last else None}


def projects(conn: sqlite3.Connection) -> list[dict]:
    out = []
    for p in conn.execute("SELECT * FROM projects ORDER BY id"):
        pk = [package_dict(conn, r) for r in conn.execute("SELECT * FROM packages WHERE project_id = ? ORDER BY id",
                                                           (p["id"],))]
        out.append({"project_id": p["id"], "name": p["name"], "created_at": p["created_at"], "packages": pk})
    return out


def package(conn: sqlite3.Connection, package_id: int) -> dict:
    row = conn.execute("SELECT * FROM packages WHERE id = ?", (package_id,)).fetchone()
    if row is None:
        raise KeyError(f"no package {package_id}")
    return package_dict(conn, row) | {"path": str(_folder_path(row["folder"]))}


# --------------------------------------------------------------------------------------------- the price list


def price_rows(conn: sqlite3.Connection) -> list[dict]:
    return [dict(r) for r in conn.execute("SELECT * FROM price_list ORDER BY rowid")]


def review_prices(conn: sqlite3.Connection) -> list[dict]:
    """The price list as the review reads it (landsight.bill.compare.load_price_list's rows)."""
    return [{"item": r["name"], "spec": r["spec"] or "", "unit": r["unit"] or "", "low_ntd": r["low"],
             "high_ntd": r["high"], "basis": r["basis"] or "", "source": r["source"] or "", "low": float(r["low"]),
             "high": float(r["high"]), "code": r["code"]} for r in price_rows(conn)]


def update_price(conn: sqlite3.Connection, code: str, fields: dict) -> dict:
    """Edit (or add) one row of the firm's list. low/high in TWD; low ≤ high."""
    allowed = {"name", "spec", "unit", "low", "high", "basis", "source"}
    bad = set(fields) - allowed
    if bad:
        raise ValueError(f"unknown field(s) {', '.join(sorted(bad))}; allowed: {', '.join(sorted(allowed))}")
    row = conn.execute("SELECT * FROM price_list WHERE code = ?", (code,)).fetchone()
    cur = dict(row) if row else {"code": code, "name": None, "spec": "", "unit": "", "low": None, "high": None,
                                 "basis": "firm", "source": ""}
    for k in ("low", "high"):
        if k in fields:
            try:
                fields[k] = float(fields[k])
            except (TypeError, ValueError) as e:
                raise ValueError(f"{k} must be a number (TWD)") from e
            if fields[k] < 0:
                raise ValueError(f"{k} must not be negative")
    cur.update(fields)
    if not cur.get("name"):
        raise ValueError("a new row needs a name")
    if cur["low"] is None or cur["high"] is None:
        raise ValueError("a row needs low and high")
    if cur["low"] > cur["high"]:
        raise ValueError(f"low {cur['low']:g} is above high {cur['high']:g}")
    cur["updated_at"] = D.now()
    with conn:  # an UPDATE keeps the row's place in the list; a new code is appended
        if row:
            conn.execute("UPDATE price_list SET name = :name, spec = :spec, unit = :unit, low = :low, high = :high, "
                         "basis = :basis, source = :source, updated_at = :updated_at WHERE code = :code", cur)
        else:
            conn.execute("INSERT INTO price_list(code, name, spec, unit, low, high, basis, source, updated_at) "
                         "VALUES (:code, :name, :spec, :unit, :low, :high, :basis, :source, :updated_at)", cur)
    return dict(conn.execute("SELECT * FROM price_list WHERE code = ?", (code,)).fetchone())


# --------------------------------------------------------------------------------------------- reviews


def _recorders(live: bool, fixture_dir: str | Path | None, fresh: int):
    """Muse Spark and SAM 3.1 recorders. `fresh` (live only): re-ask that many recorded Spark calls, -1 every Spark
    and SAM call; the new answers go to fresh/ beside the recordings, which stay as they are."""
    from landsight.review.colour import SAM_FIXTURES, ReviewSam, mode_for
    from landsight.review.spark import FIXTURES, ReviewSpark

    mode = "live" if live else "fixtures"
    sdir = Path(fixture_dir) if fixture_dir else FIXTURES
    spark = ReviewSpark(mode, sdir, fresh=int(fresh or 0))
    sam = ReviewSam(mode_for(mode), sdir / "sam" if fixture_dir else SAM_FIXTURES, fresh=-1 if fresh == -1 else 0)
    return spark, sam


def review_package(conn: sqlite3.Connection, package_id: int, live: bool = False, keep: dict | None = None,
                   fixture_dir: str | Path | None = None, fresh: int = 0, review_fn=None) -> dict:
    """Review a registered package against the firm's price list in the database; the Run, its checks and every Meta
    call are written to the database. Returns the Run."""
    from landsight.review.run import review as default_review

    review = review_fn or default_review

    pk = package(conn, package_id)
    spark, sam = _recorders(live, fixture_dir, fresh)
    prices = review_prices(conn)
    started = D.now()
    run = review(pk["path"], mode="live" if live else "fixtures", spark=spark, sam=sam, keep=keep, prices=prices,
                 price_list_name=PRICE_LIST_NAME)
    save_run(conn, package_id, run, spark.log, sam.log, started, prices)
    fresh_ids = [{"call": e["call"], "response_id": e.get("response_id"), "fresh_of": e.get("fresh_of"),
                  "same_as_recorded": e.get("same_as_recorded"), "seconds": e.get("seconds"),
                  "fixture": _fixture_ref(e)} for e in spark.log + sam.log if e.get("fresh_of")]
    if fresh_ids:
        run["timing"]["fresh"] = fresh_ids
    return run


def review_folder(folder: str | Path, live: bool = False, db_path: str | Path | None = None, keep: dict | None = None,
                  fixture_dir: str | Path | None = None, fresh: int = 0) -> dict:
    conn = D.connect(db_path)
    try:
        pk = package_for_folder(conn, folder)
        return review_package(conn, pk["package_id"], live=live, keep=keep, fixture_dir=fixture_dir, fresh=fresh)
    finally:
        conn.close()


def full_prompt(entry: dict) -> str:
    """The prompt as sent. The take-off's calls are recorded with a pointer ('landsight.meta.spark.read_detail'); the
    text is the module's constant (plus the candidates' measured facts for group_and_read)."""
    p = entry.get("prompt") or ""
    if not p.startswith("landsight.meta.spark."):
        return p
    from landsight.meta import spark as M

    call = p.rsplit(".", 1)[1]
    if call == "group_and_read":
        return M.GROUP_PROMPT + "\n".join(f"- {c['id']}: {c['facts']}" for c in entry.get("candidates") or [])
    return {"read_schedule": M.SCHEDULE_PROMPT, "read_detail": M.DETAIL_PROMPT, "read_legend": M.LEGEND_PROMPT,
            "classify_sheet": M.CLASSIFY_PROMPT}.get(call, p)


def _fixture_ref(entry: dict) -> str:
    name = entry.get("fixture") or ""
    if not name:
        return ""
    p = Path(name) if Path(name).is_absolute() else Path(entry.get("fixture_dir") or "") / name
    try:
        return str(p.resolve().relative_to(D.REPO))
    except ValueError:
        return str(p)


def meta_rows(spark_log: list[dict], sam_log: list[dict]) -> list[dict]:
    from landsight.meta.sam import MODEL as SAM_MODEL
    from landsight.meta.spark import MODEL as SPARK_MODEL

    rows = []
    for e in spark_log:
        rows.append({"model": e.get("model") or SPARK_MODEL, "call": e["call"], "kind": "spark",
                     "prompt": full_prompt(e), "response": _j(e.get("response")),
                     "usage": _j((e.get("usage") or {}) | ({"response_id": e["response_id"]} if e.get("response_id") else {})),
                     "seconds": e.get("seconds"), "recorded_at": e.get("recorded_at"), "fixture": _fixture_ref(e),
                     "live": 0 if e.get("recorded") else 1})
    for e in sam_log:
        rows.append({"model": e.get("model") or SAM_MODEL, "call": e["call"], "kind": "sam", "prompt": e.get("prompt", ""),
                     "response": e.get("response") or "",
                     "usage": _j({k: e[k] for k in ("error", "response_id") if e.get(k)}),
                     "seconds": e.get("seconds"), "recorded_at": e.get("recorded_at"),
                     "fixture": _fixture_ref({"fixture": e.get("fixture")}), "live": 0 if e.get("recorded") else 1})
    return rows


def write_meta_calls(conn: sqlite3.Connection, run_id: str | None, rows: list[dict], ask_id: int | None = None) -> list[int]:
    ids = []
    with conn:
        for r in rows:
            cur = conn.execute("INSERT INTO meta_calls(run_id, ask_id, model, call, kind, prompt, response, usage, seconds, "
                               "recorded_at, fixture, live, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                               (run_id, ask_id, r["model"], r["call"], r["kind"], r["prompt"], r["response"], r["usage"],
                                r["seconds"], r["recorded_at"], r["fixture"], r["live"], D.now()))
            ids.append(cur.lastrowid)
    return ids


def save_run(conn: sqlite3.Connection, package_id: int | None, run: dict, spark_log: list[dict], sam_log: list[dict],
             started_at: str, prices: list[dict] | None = None) -> None:
    e, t = run["errors"], run["timing"]
    with conn:
        conn.execute("INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     (run["run_id"], package_id, t.get("mode"), started_at, D.now(), t.get("total_s"), t.get("spark_calls"),
                      t.get("spark_s"), t.get("sam_calls"), t.get("sam_s"), e.get("planted"), len(e.get("found", [])),
                      len(e.get("flagged", [])), len(e.get("missed", [])), len(e.get("false_alarms", [])),
                      _j(run.get("scenarios") or {}), _j(t), _j(prices or []), _j(run)))
        conn.execute("DELETE FROM checks WHERE run_id = ?", (run["run_id"],))
        conn.executemany("INSERT INTO checks VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                         [(run["run_id"], c["check_id"], c.get("scenario"), c["category"], c["severity"], c["title"],
                           c["why"], _j(c.get("by")), _j(c.get("evidence")), _j(c.get("numbers") or {}), _j(c))
                          for c in run["checks"]])
    write_meta_calls(conn, run["run_id"], meta_rows(spark_log, sam_log))


def run_row(conn: sqlite3.Connection, run_id: str):
    row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    if row is None:
        raise KeyError(f"no run {run_id}")
    return row


def get_run(conn: sqlite3.Connection, run_id: str) -> dict:
    """The stored Run with the database's confirmations, notes and flags applied."""
    row = run_row(conn, run_id)
    return apply_confirmations(json.loads(row["run"]), confirmations(conn, run_id)) | {
        "package_id": row["package_id"], "stored": True}


def latest_run_id(conn: sqlite3.Connection, package_id: int | None = None) -> str | None:
    q = "SELECT id FROM runs" + (" WHERE package_id = ?" if package_id is not None else "") + \
        " ORDER BY finished_at DESC, rowid DESC LIMIT 1"
    row = conn.execute(q, (package_id,) if package_id is not None else ()).fetchone()
    return row[0] if row else None


def checks(conn: sqlite3.Connection, run_id: str, scenario: str | None = None) -> list[dict]:
    q = "SELECT body FROM checks WHERE run_id = ?" + (" AND scenario = ?" if scenario else "") + " ORDER BY rowid"
    return [json.loads(r[0]) for r in conn.execute(q, (run_id, scenario) if scenario else (run_id,))]


def meta_calls(conn: sqlite3.Connection, run_id: str | None = None, ask_id: int | None = None,
               full: bool = True) -> list[dict]:
    q, args = "SELECT * FROM meta_calls", []
    where = []
    if run_id:
        where.append("run_id = ?")
        args.append(run_id)
    if ask_id is not None:
        where.append("ask_id = ?")
        args.append(ask_id)
    if where:
        q += " WHERE " + " AND ".join(where)
    out = []
    for r in conn.execute(q + " ORDER BY id", args):
        d = dict(r)
        d["usage"] = json.loads(d["usage"] or "{}")
        d["live"] = bool(d["live"])
        if not full:
            d["prompt"] = (d["prompt"] or "")[:400]
            d["response"] = (d["response"] or "")[:400]
        out.append(d)
    return out


# --------------------------------------------------------------------------------------------- confirmations


def confirmations(conn: sqlite3.Connection, run_id: str) -> list[dict]:
    out = []
    for r in conn.execute("SELECT * FROM confirmations WHERE run_id = ? ORDER BY id", (run_id,)):
        d = dict(r)
        try:
            d["value"] = json.loads(d["value"]) if d["value"] is not None else None
        except ValueError:
            pass
        out.append(d)
    return out


def add_confirmation(conn: sqlite3.Connection, run_id: str, kind: str, target_id: str, value=None, why: str = "",
                     source: str = "screen") -> dict:
    if kind not in CONFIRM_KINDS:
        raise ValueError(f"unknown kind {kind!r}: one of {', '.join(CONFIRM_KINDS)}")
    run_row(conn, run_id)
    with conn:
        cur = conn.execute("INSERT INTO confirmations(run_id, kind, target_id, value, why, source, created_at) "
                           "VALUES (?,?,?,?,?,?,?)", (run_id, kind, target_id, _j(value), why, source, D.now()))
    d = dict(conn.execute("SELECT * FROM confirmations WHERE id = ?", (cur.lastrowid,)).fetchone())
    d["value"] = value
    return d


def apply_confirmations(run: dict, rows: list[dict]) -> dict:
    """The Run as a person left it: confirmed elements, notes on checks, added flags, confirmed prices."""
    run = copy.deepcopy(run)
    items = {i["item_id"]: i for i in run.get("items", [])}
    checks_by = {c["check_id"]: c for c in run.get("checks", [])}
    for r in rows:
        k, tgt = r["kind"], r["target_id"]
        entry = {"kind": k, "target_id": tgt, "value": r.get("value"), "why": r.get("why") or "",
                 "source": r.get("source"), "at": r.get("created_at")}
        if k == "confirm_element" and tgt in items:
            it = items[tgt]
            if not it.get("agreed") and it.get("proposed_count") is not None:
                it.update(agreed=True, confirmed=True, quote_count=it["proposed_count"])
            else:
                it["confirmed"] = True
        elif k == "regulation_note" and tgt in checks_by:
            checks_by[tgt].setdefault("notes", []).append(entry)
        elif k == "flag":
            (checks_by[tgt].setdefault("flags", []) if tgt in checks_by else run.setdefault("flags", [])).append(entry)
        run.setdefault("annotations", []).append(entry)
    for t in run.get("tally", []):
        it = items.get(t.get("item_id"))
        if it and it.get("confirmed"):
            t["status"] = "confirmed"
            t["drawn"] = it.get("quote_count") if it.get("quote_count") is not None else t.get("drawn")
    from landsight.review.pending import apply_confirmed

    apply_confirmed(run, {i for i, it in items.items() if it.get("confirmed")})
    return run


def save_ask(conn: sqlite3.Connection, run_id: str, question: str, answer: dict, spark_log: list[dict]) -> int:
    with conn:
        cur = conn.execute("INSERT INTO asks(run_id, question, answer, created_at) VALUES (?,?,?,?)",
                           (run_id, question, _j(answer), D.now()))
    ask_id = cur.lastrowid
    write_meta_calls(conn, run_id, meta_rows(spark_log, []), ask_id=ask_id)
    return ask_id


SAMPLES = ("samples/greenfield", "samples/heldout", "samples/tower")


def seed_samples(conn: sqlite3.Connection) -> dict:
    """Register the bundled sample packages (those present under samples/) under their project."""
    out = []
    for rel in SAMPLES:
        folder = D.REPO / rel
        if folder.is_dir():
            out.append(package_for_folder(conn, folder))
    return {"packages": [{"package_id": p["package_id"], "name": p["name"], "folder": p["folder"]} for p in out]}
