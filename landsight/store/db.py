"""The SQLite schema of landsight.db and its seed data.

Tables
- projects(id, name, created_at); packages(id, project_id, name, folder, kind, registered_at): a folder registered
  under a project (the sample's folder is stored relative to the repo).
- runs(id = the Run's run_id, package_id, mode, started_at, finished_at, total_s, spark_calls, spark_s, sam_calls, sam_s,
  planted, found, flagged, missed, false_alarms, scenarios (json), timing (json), price_list (json: the rows the run
  priced against), run (the Run json)).
- checks(run_id, check_id, scenario, category, severity, title, why, by, evidence, numbers, body): one row per check.
- decisions(run_id, check_id, decision, note, decided_at, source): a person's verdict on a flag (confirm, dismiss or
  open again), one row per check, the latest wins (POST /api/runs/{id}/checks/{check_id}/decision).
- confirmations(id, run_id, kind, target_id, value, why, source, created_at): a person's confirmations, price edits,
  regulation notes and flags (from the screen or from an answer of POST /api/ask).
- price_list(code, name, spec, unit, low, high, basis, source, updated_at): the firm's own rates (TWD), seeded from the
  sample's list; PUT /api/price-list/{code} edits a row and the next review prices against it.
- species(code, name_en, name_zh, scientific, type, native, bird_butterfly, gi_class, row): landsight/data/species.csv.
- rules(id, kind, jurisdiction, article, title, gloss, url, value): landsight/data/rules.json flattened, with the
  English article glosses of landsight/checks/base.py and the glossary.
- meta_calls(id, run_id, ask_id, model, call, kind, prompt, response, usage, seconds, recorded_at, fixture, live,
  created_at): every Muse Spark and SAM 3.1 answer a run or a question used, live or replayed from its recording.
- asks(id, run_id, question, answer, created_at): every question put to a package and the answer it got.

The file is LANDSIGHT_DB when set, else landsight.db at the repo root."""

from __future__ import annotations

import csv
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "landsight" / "data"
CJK = re.compile(r"[⺀-鿿豈-﫿　-〿＀-￯가-힯]+")

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, folder TEXT NOT NULL, kind TEXT, registered_at TEXT NOT NULL, UNIQUE(project_id, folder));
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE, mode TEXT,
  started_at TEXT, finished_at TEXT, total_s REAL, spark_calls INTEGER, spark_s REAL, sam_calls INTEGER, sam_s REAL,
  planted INTEGER, found INTEGER, flagged INTEGER, missed INTEGER, false_alarms INTEGER,
  scenarios TEXT, timing TEXT, price_list TEXT, run TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checks (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, check_id TEXT NOT NULL, scenario TEXT,
  category TEXT, severity TEXT, title TEXT, why TEXT, by TEXT, evidence TEXT, numbers TEXT, body TEXT,
  PRIMARY KEY (run_id, check_id));
CREATE TABLE IF NOT EXISTS decisions (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, check_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('confirm', 'dismiss', 'open')), note TEXT, decided_at TEXT NOT NULL,
  source TEXT, PRIMARY KEY (run_id, check_id));
CREATE TABLE IF NOT EXISTS confirmations (
  id INTEGER PRIMARY KEY, run_id TEXT REFERENCES runs(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  target_id TEXT NOT NULL, value TEXT, why TEXT, source TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS price_list (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, spec TEXT, unit TEXT, low REAL, high REAL, basis TEXT, source TEXT,
  updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS species (
  code TEXT PRIMARY KEY, name_en TEXT, name_zh TEXT, scientific TEXT, type TEXT, native INTEGER,
  bird_butterfly TEXT, gi_class REAL, row TEXT);
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY, kind TEXT, jurisdiction TEXT, article TEXT, title TEXT, gloss TEXT, url TEXT, value TEXT);
CREATE TABLE IF NOT EXISTS asks (
  id INTEGER PRIMARY KEY, run_id TEXT REFERENCES runs(id) ON DELETE CASCADE, question TEXT NOT NULL, answer TEXT,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta_calls (
  id INTEGER PRIMARY KEY, run_id TEXT REFERENCES runs(id) ON DELETE CASCADE, ask_id INTEGER, model TEXT, call TEXT,
  kind TEXT, prompt TEXT, response TEXT, usage TEXT, seconds REAL, recorded_at TEXT, fixture TEXT, live INTEGER,
  created_at TEXT);
CREATE INDEX IF NOT EXISTS meta_calls_run ON meta_calls(run_id);
CREATE INDEX IF NOT EXISTS checks_scenario ON checks(run_id, scenario);
"""
TABLES = ("projects", "packages", "runs", "checks", "decisions", "confirmations", "price_list", "species", "rules", "asks",
          "meta_calls")

# The firm's own installed rates (TWD), the sample package's "firm price list.csv" with the firm's codes, plus the rows
# the tower package prices (docs/PACKAGE.md v2). Hypothetical by design (PLAN-V2 C1); each row names its source.
PRICE_SEED = [
    # code, name, spec, unit, low, high, basis, source
    ("CC", "Camphor (Cinnamomum camphora)", "cal. 10 cm, H3.0-3.5 m, installed", "EA", 6200, 7200, "published_budget",
     "P006 local 6,149 (2021); P002 municipal 7,036 (2022)"),
    ("DU", "Duranta (Duranta erecta)", "H0.6 m, installed", "plant", 130, 160, "published_budget", "P024 shrub planted 146"),
    ("AZ", "Azalea (Rhododendron spp.)", "4-5 in. pot, installed", "plant", 140, 170, "published_budget",
     "P026 150; P027 140"),
    ("LA", "Lawn (Zoysia matrella)", "sod, installed", "m²", 250, 300, "published_budget", "P030 sod installed 273"),
    ("PV-1", "Permeable pavers", "paver + bedding + base", "m²", 1300, 2300, "published_budget",
     "P048-P051 1,210-1,410; P052 2,120-2,340"),
    ("PV-2", "Exposed aggregate", "100 mm, washed-pebble finish", "m²", 1800, 2200, "sample",
     "no direct source; nearest P060 washed-pebble permeable paver 2,020"),
    ("PV-3", "Grass pavers", "concrete grid, 80 mm", "m²", 1150, 1350, "published_budget",
     "P063 1,150; P064 1,280; P065 1,320"),
    ("RL", "Roof lawn (Zoysia on drainage layer)", "sod on 0.3 m soil, filter fabric and drainage board, installed",
     "m²", 650, 850, "sample", "sample: lawn P030 273 plus drainage board, filter fabric and lifting (no direct source)"),
    ("RI", "Yeddo hawthorn (Rhaphiolepis indica)", "planter shrub, 1 gal., 4 plants/m², installed", "m²", 560, 700,
     "sample", "sample: 4 x shrub planted P024 146 (no direct source)"),
    ("IC", "Chinese ixora (Ixora chinensis)", "planter shrub, 1 gal., 4 plants/m², installed", "m²", 560, 700, "sample",
     "sample: 4 x shrub planted P024 146 (no direct source)"),
    ("MP", "Orange jasmine (Murraya paniculata)", "planter shrub, 1 gal., 4 plants/m², installed", "m²", 600, 760,
     "sample", "sample: 4 x shrub planted P024 146 plus 10% (no direct source)"),
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def default_path() -> Path:
    return Path(os.environ.get("LANDSIGHT_DB") or REPO / "landsight.db")


_READY: set[str] = set()


def connect(path: str | Path | None = None, create: bool = True) -> sqlite3.Connection:
    """A connection with the schema in place and the seed tables filled (idempotent; checked once per process)."""
    p = Path(path) if path else default_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = DELETE")  # one file, nothing beside it (the repo may keep it)
    key = str(p.resolve())
    if create and (key not in _READY or not conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta_calls'").fetchone()):
        init(conn)
        _READY.add(key)
    return conn


def init(conn: sqlite3.Connection) -> dict:
    """Create the tables and seed price_list, species and rules where empty. Returns the row counts."""
    conn.executescript(SCHEMA)
    with conn:
        if not conn.execute("SELECT 1 FROM price_list LIMIT 1").fetchone():
            conn.executemany("INSERT INTO price_list VALUES (?,?,?,?,?,?,?,?,?)",
                             [(*r, now()) for r in PRICE_SEED])
        if not conn.execute("SELECT 1 FROM species LIMIT 1").fetchone():
            conn.executemany("INSERT INTO species VALUES (?,?,?,?,?,?,?,?,?)", species_rows())
        if not conn.execute("SELECT 1 FROM rules LIMIT 1").fetchone():
            conn.executemany("INSERT INTO rules VALUES (?,?,?,?,?,?,?,?)", rule_rows())
    return stats(conn)


def reset(conn: sqlite3.Connection) -> dict:
    """Drop every table and seed again (the runs, confirmations and recorded calls in the file are lost)."""
    with conn:
        for t in reversed(TABLES):
            conn.execute(f"DROP TABLE IF EXISTS {t}")
    return init(conn)


def stats(conn: sqlite3.Connection) -> dict:
    return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}


# --------------------------------------------------------------------------------------------- seeds


def species_rows() -> list[tuple]:
    out = []
    with (DATA / "species.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            native = {"true": 1, "false": 0}.get((r.get("native_to_national") or "").lower())
            try:
                gi = float(r.get("gi_class") or "")
            except ValueError:
                gi = None
            out.append((r["code"], r["name_en"], r["name_zh"], r["scientific"], r["type"], native,
                        r.get("bird_or_butterfly_attracting"), gi, json.dumps(r, ensure_ascii=False)))
    return out


ARTICLE_WORDS = [(re.compile(r"第\s*(\d+(?:之\d+)?)\s*條"), r"Art. \1"), (re.compile(r"第\s*(\d+)\s*款"), r" item \1"),
                 (re.compile(r"第\s*(\d+)\s*項"), r" para. \1"), (re.compile(r"表\s*(\d+)"), r"table \1"),
                 (re.compile(r"式\s*\((\d+)\)"), r"formula (\1)"), (re.compile(r"註"), "note"),
                 (re.compile(r"公式"), "formula ")]


def _english(s) -> str:
    """English only: article numbers spelled out (第302條 -> Art. 302), every other CJK run dropped."""
    if not isinstance(s, str):
        return ""
    for pat, rep in ARTICLE_WORDS:
        s = pat.sub(rep, s)
    s = CJK.sub(" ", s)
    s = re.sub(r"\(\s*[,;]?\s*\)", "", s)
    return re.sub(r"\s{2,}", " ", s).strip(" ;,")


def rule_rows() -> list[tuple]:
    """rules.json flattened to rows: the cited articles with their English glosses, every constant, table row and
    municipal rule (with its citation), and the glossary (English side)."""
    from landsight.checks.base import CITES, citation

    data = json.loads((DATA / "rules.json").read_text())
    rows: dict[str, tuple] = {}

    def put(rid, kind, jur, article, title, gloss, url, value):
        rows[rid] = (rid, kind, jur, _english(article) or article, _english(title), _english(gloss), url or "",
                     json.dumps(value, ensure_ascii=False))

    for key, (path, article, gloss) in CITES.items():
        node = data
        try:
            for p in path:
                node = node[p]
        except (KeyError, IndexError, TypeError):
            node = {}
        put(key, "article", "local" if key.startswith("TC") else "national", article, article, gloss,
            citation(key)["url"], node)

    def cite_of(node):
        c = node.get("cite") if isinstance(node, dict) else None
        if isinstance(c, list):
            c = c[0] if c else None
        return c if isinstance(c, dict) else {}

    def describe(node) -> str:
        if not isinstance(node, dict):
            return str(node)
        parts = []
        for k, v in node.items():
            if k in ("cite", "read", "url"):
                continue
            if isinstance(v, (str, int, float)) and not isinstance(v, bool):
                parts.append(f"{k.replace('_', ' ')}: {v}")
            elif isinstance(v, dict) and k not in ("cite",):
                inner = ", ".join(f"{a.replace('_', ' ')} {b}" for a, b in v.items()
                                  if isinstance(b, (str, int, float)) and not isinstance(b, bool))
                if inner:
                    parts.append(f"{k.replace('_', ' ')}: {inner}")
        return "; ".join(parts)[:900]

    for jur in ("national", "municipal", "local"):
        sec = data.get(jur) or {}
        if not isinstance(sec, dict):
            continue
        for name, node in sec.items():
            if name.endswith("_cite") or name == "cite":
                continue
            if jur == "national" and name == "constants" and isinstance(node, dict):
                for k, v in node.items():
                    c = cite_of(v)
                    put(f"{jur}.constants.{k}", "constant", jur, c.get("article", ""), c.get("source", ""),
                        f"{k.replace('_', ' ')}: {describe(v)}", c.get("url", ""), v)
                continue
            if jur == "national" and name == "artificial_ground" and isinstance(node, dict):
                c = cite_of(node)
                for i, r in enumerate(node.get("rows") or [], 1):
                    put(f"{jur}.artificial_ground.row{i}", "table_row", jur, c.get("article", ""), c.get("source", ""),
                        f"Artificial ground minimums for {r.get('plant')}: soil on a roof, balcony, terrace or facade "
                        f"{r.get('soil_depth_roof_m')} m; soil on other ground {r.get('soil_depth_other_m')} m; minimum "
                        f"tree-pit area {r.get('min_pit_area_m2') if r.get('min_pit_area_m2') is not None else 'none'} m². "
                        f"{node.get('description', '')}", c.get("url", ""), r)
                put(f"{jur}.artificial_ground.downgrade", "rule", jur, c.get("article", ""), c.get("source", ""),
                    f"{(node.get('downgrade_rule') or {}).get('rule', '')}. {node.get('column_note', '')}",
                    c.get("url", ""), node.get("downgrade_rule"))
                continue
            if isinstance(node, list):
                c = cite_of(sec.get(f"{name}_cite") or {})
                for i, r in enumerate(node, 1):
                    put(f"{jur}.{name}.{i}", "table_row", jur, c.get("article", ""), c.get("source", ""),
                        f"{name.replace('_', ' ')}: " + ", ".join(f"{k} {v}" for k, v in (r.items() if isinstance(r, dict) else [])),
                        c.get("url", ""), r)
                continue
            c = cite_of(node)
            if not c and isinstance(node, dict):  # nested sections (protected_trees inside a city)
                c = next((cite_of(v) for v in node.values() if cite_of(v)), {})
            put(f"{jur}.{name}", "rule", jur, c.get("article", "") or (node.get("article", "") if isinstance(node, dict) else ""),
                c.get("source", ""), f"{name.replace('_', ' ')}: {describe(node)}", c.get("url", ""), node)
    for term, gloss in (data.get("glossary") or {}).items():
        latin = " ".join(re.findall(r"[A-Za-z′'0-9]+", term))
        slug = latin or re.sub(r"[^a-z0-9]+", "-", _english(gloss).lower().split("(")[0]).strip("-")[:40]
        put(f"glossary.{slug}", "glossary", "national", "", latin or _english(gloss).split("(")[0].strip(), gloss, "",
            {"term": term, "gloss": gloss})
    return list(rows.values())
