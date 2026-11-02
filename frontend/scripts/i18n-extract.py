#!/usr/bin/env python3
"""i18n-extract.py — every user-visible English string the screen draws from the data, as a template.

Reads the recorded mock (frontend-mock/run.json, run_confirmed.json, package_runs.json, rules.json), the live runs
(GET /api/runs/{id}: the sample run and the latest run of the tower and held-out packages, from GET /api/projects) and
the recorded ask answers (tests/fixtures/ask/*.json); takes the fields the screen prints; turns each string into a
template by replacing every number, id, file name, run id, date and verbatim span (quoted drawing or bill text, Muse
Spark's own sentences) with ordered placeholders {0}, {1} …; dedupes; writes frontend/src/i18n/zh-TW.data.source.json
sorted by `where` then template, and prints the count.

    python3 frontend/scripts/i18n-extract.py                 # mock + API at http://127.0.0.1:8795 + fixtures
    python3 frontend/scripts/i18n-extract.py --no-api        # the files on disk only
    python3 frontend/scripts/i18n-extract.py --api http://host:port --run <id> --run <id>
    python3 frontend/scripts/i18n-extract.py --check         # the templates round-trip, and zh-TW.data.json covers them

Standard library only. The token patterns (TOKENS) are the regexes that re-extract the placeholders; `regex_of(template)`
builds the matcher of one template, and `fill(template_zh, values)` is how a translated template is rendered.

Citation quotes are not collected: they are verbatim from the documents and stay English on screen.
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOCK = ROOT / 'frontend-mock'
OUT = ROOT / 'frontend' / 'src' / 'i18n' / 'zh-TW.data.source.json'
DICT = ROOT / 'frontend' / 'src' / 'i18n' / 'zh-TW.data.json'
ASK_FIXTURES = ROOT / 'tests' / 'fixtures' / 'ask'

SAMPLE_RUN_ID = '0a45e5bfc345'  # package 1, greenfield, the recorded sample
LIVE_PACKAGE_FOLDERS = ('samples/tower', 'samples/heldout')  # their latest run, from /api/projects

FILE_EXT = r'(?:dxf|pdf|xlsx|xls|zip|bak|pptx|png)'

# ------------------------------------------------------------------------------------------------ the tokens
# Each token is (name, regex, group): the text of `group` becomes a placeholder. Earlier tokens win where they overlap.
# `keep` tokens are masked, not replaced: digits that are part of a name ("SAM 3.1") must never become a placeholder.
KEEP = re.compile(r'SAM 3\.1|Excel 97–2003|muse-spark-1\.3|sam-3\.1')

TOKENS: list[tuple[str, re.Pattern[str], int]] = [
    # verbatim spans the product quotes as written: drawing, bill and document text in quotes
    ('quote_single', re.compile(r"(?<![A-Za-z0-9])'([^'\n]{1,200}?)'(?![A-Za-z0-9])"), 1),
    ('quote_double', re.compile(r'"([^"\n]{1,240}?)"'), 1),
    # Muse Spark's own sentences, where the product's text frames them
    ('spark_classified', re.compile(r'classified the sheet as [a-z]+ \([a-z]+\), confidence \d\.\d\d: (.+?)(?= Its \d+ round outlines| Geometry found the match line|$)'), 1),
    ('spark_photo', re.compile(r'Muse Spark: (.+?) \(confidence \d\.\d\d\)\.'), 1),
    ('spark_detail', re.compile(r'Muse Spark read the detail \S+: (.+?)(?=\. On artificial ground)'), 1),
    ('spark_checklist', re.compile(r'Muse Spark read the checklist: (.+?)(?=\. Landsight)'), 1),
    ('spark_align', re.compile(r'Muse Spark: (.+?)(?=\. Confirm it is the same item)'), 1),
    ('spark_one_tree', re.compile(r'says one tree \(confidence \d\.\d\d\): (.+?)(?=\. (?:It is counted|A person confirmed))'), 1),
    ('spark_scale_bar', re.compile(r'found the legend box and the scale bar \((.+?)\); the bar was'), 1),
    ('spark_soil_text', re.compile(r'read the soil depths written on \S+ \((.+?)\); the artificial-ground'), 1),
    ('spark_key_facts', re.compile(r'Key facts: (.+)$'), 1),
    ('spark_summary', re.compile(r'^(?:document|spec|quote): (.+)$'), 1),
    # a legend entry as Muse Spark named it: "<colour> = <LEGEND TEXT>"
    ('legend_pair', re.compile(r'\b[a-z]+(?: [a-z]+)? = [A-Z][A-Z0-9][A-Z0-9 \-—.]*?(?= · |$)'), 0),
    # file names (the known ones first, then any bare name with a known extension), run ids, dates
    ('file_name', None, 0),  # filled in from the data: every files[].name, longest first
    ('file_bare', re.compile(r'\S+\.' + FILE_EXT + r'\b'), 0),
    ('run_id', re.compile(r'\b[0-9a-f]{12}\b'), 0),
    ('date', re.compile(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\+\d{2}:\d{2})?)?'), 0),
    # ids: planted errors, price-list sources, sheets and objects, hatch names, species codes in brackets, revisions
    ('error_id', re.compile(r'\bE\d{2}(?:\.\d+)?\b'), 0),
    ('source_code', re.compile(r'\bP\d{3}(?:-P\d{3})?\b'), 0),
    ('sheet_object_id', re.compile(r'\b[A-Z]{1,7}-\d+(?:\.\d+)?(?:-rev[A-Z]|-p\d+|-\d+)?\b'), 0),
    ('hatch', re.compile(r'\bAR-[A-Z0-9]+\b|\bANSI\d+\b'), 0),
    ('code_in_brackets', re.compile(r'(?<=\()[A-Z][A-Z0-9-]*(?=, confidence)|(?<=\()[A-Z]{2,3}(?=[,)])'), 0),
    ('revision', None, 0),  # filled in from the data: every bill revision name, longest first
    ('rev_letter', re.compile(r'(?<=\bRev )[A-Z](?![A-Za-z])'), 0),
    ('scale', re.compile(r'\b1:\d+\b'), 0),
    ('cell_range', re.compile(r'\b[A-Z]{1,2}\d+:[A-Z]{1,2}\d+\b'), 0),
    ('size_spec', re.compile(r'\b[HW]\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\b'), 0),
    # drawing text in capitals, two words or more ("TO BE REMOVED", "SITE AREA", "ARTIFICIAL GROUND")
    ('drawing_text', re.compile(r'\b[A-Z][A-Z0-9]+(?: [A-Z][A-Z0-9.]*)+\b'), 0),
    # numbers: integers, decimals, with thousands commas, 1e-05; a unit after them stays in the template
    ('number', re.compile(r'(?<![A-Za-z0-9_])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e-?\d+)?'), 0),
]

# Field-specific tokens, applied before the general ones: the two document checks print a document's own title.
FIELD_TOKENS: dict[tuple[str, str], list[tuple[str, re.Pattern[str], list[int]]]] = {
    ('check.title', 'document'): [
        ('doc_required', re.compile(r'^(.+?): required by (.+)$'), [1, 2]),
        ('doc_summary', re.compile(r'^(.+?): (.+)$'), [1, 2]),
    ],
}


def _alternation(names: list[str]) -> re.Pattern[str] | None:
    names = sorted({n for n in names if n}, key=len, reverse=True)
    if not names:
        return None
    return re.compile(r'(?<![\w-])(?:' + '|'.join(re.escape(n) for n in names) + r')(?![\w-])')


def bind_tokens(file_names: list[str], revisions: list[str]) -> list[tuple[str, re.Pattern[str], int]]:
    out = []
    for name, rx, g in TOKENS:
        if name == 'file_name':
            rx = _alternation(file_names)
        elif name == 'revision':  # a bare number ('3') is left to the number token
            rx = _alternation([r for r in revisions if not r.isdigit()])
        if rx is not None:
            out.append((name, rx, g))
    return out


def tokenise(s: str, tokens: list[tuple[str, re.Pattern[str], int]], field: tuple[str, str] | None = None) -> tuple[str, list[str], list[str]]:
    """The template of `s`, the placeholder values in order, and the token names they came from."""
    taken: list[tuple[int, int, str | None, str]] = []  # (start, end, token name or None for keep, text)

    def free(a: int, b: int) -> bool:
        return a < b and all(b <= s0 or a >= e0 for s0, e0, _, _ in taken)

    for m in KEEP.finditer(s):
        taken.append((m.start(), m.end(), None, m.group(0)))
    if field in FIELD_TOKENS:
        for name, rx, groups in FIELD_TOKENS[field]:
            m = rx.match(s)
            if m and all(free(*m.span(g)) for g in groups):
                for g in groups:
                    taken.append((m.start(g), m.end(g), name, m.group(g)))
                break
    for name, rx, g in tokens:
        for m in rx.finditer(s):
            a, b = m.span(g)
            if free(a, b):
                taken.append((a, b, name, m.group(g)))
    taken.sort()
    out, values, names, pos, n = [], [], [], 0, 0
    for a, b, name, text in taken:
        out.append(s[pos:a])
        if name is None:
            out.append(text)
        else:
            out.append('{%d}' % n)
            values.append(text)
            names.append(name)
            n += 1
        pos = b
    out.append(s[pos:])
    return ''.join(out), values, names


PLACEHOLDER = re.compile(r'\{(\d+)\}')

# What one placeholder may hold when a template is matched back against an English string: the exact tokens first
# (so "{4} {5} M" splits "PLANTING SOIL 1.0" as drawing text + number), any text last.
# … then a file name with spaces or brackets in it ("Landscape BOQ rev3 (paving update).xlsx"), up to its extension
_VALUE = '(?:' + '|'.join(rx.pattern for name, rx, g in TOKENS if rx is not None and g == 0 and name not in ('legend_pair',)) + r'|\w[^;:\n]*?\.' + FILE_EXT + r'\b|.+?)'


def regex_of(template: str) -> re.Pattern[str]:
    """The matcher that re-extracts a template's placeholders from an English string (group p0, p1 …)."""
    parts, pos = [], 0
    for m in PLACEHOLDER.finditer(template):
        parts.append(re.escape(template[pos:m.start()]))
        parts.append('(?P<p%s>%s)' % (m.group(1), _VALUE))
        pos = m.end()
    parts.append(re.escape(template[pos:]))
    return re.compile('^' + ''.join(parts) + '$', re.S)


def extract(template: str, s: str) -> list[str] | None:
    m = regex_of(template).match(s)
    if not m:
        return None
    return [m.group('p%d' % i) for i in range(len(PLACEHOLDER.findall(template)))]


def fill(template: str, values: list[str]) -> str:
    return PLACEHOLDER.sub(lambda m: values[int(m.group(1))], template)


# ------------------------------------------------------------------------------------------------ the sources
def read_json(p: Path):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def fetch(url: str, timeout: float = 20):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Accept': 'application/json'}), timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def live_run_ids(api: str, explicit: list[str]) -> list[str]:
    if explicit:
        return explicit
    ids = [SAMPLE_RUN_ID]
    try:
        projects = fetch(f'{api}/api/projects')
    except (urllib.error.URLError, OSError, ValueError) as e:
        print(f'warning: {api}/api/projects not read ({e}); only the sample run id is asked for', file=sys.stderr)
        return ids
    for p in projects:
        for k in p.get('packages', []):
            if k.get('folder') in LIVE_PACKAGE_FOLDERS and (k.get('latest_run') or {}).get('id'):
                ids.append(k['latest_run']['id'])
    return list(dict.fromkeys(ids))


class Collector:
    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}  # template → row
        self.raw: list[tuple[str, str, str | None]] = []  # (where, string, category) before tokenising
        self.file_names: list[str] = []
        self.revisions: list[str] = []
        self.skipped_quotes = 0

    def add(self, where: str, s, category: str | None = None) -> None:
        if isinstance(s, str) and s.strip():
            self.raw.append((where, s, category))

    # the Run (mock or live): checks, files, sheets, items, scenarios, mode
    def run(self, d: dict) -> None:
        for c in d.get('checks', []):
            cat = c.get('category')
            self.add('check.title', c.get('title'), cat)
            self.add('check.why', c.get('why'), cat)
            self.add('check.note', c.get('note'), cat)
            self.add('check.reason', c.get('reason'), cat)
            self.fixes('check.fixes.label', c.get('fixes'))
            for k in ('before_downgrade', 'after_downgrade'):
                g = c.get(k)
                if isinstance(g, dict):
                    self.fixes('check.fixes.label', g.get('fixes'))
            ic = c.get('if_confirmed')
            if isinstance(ic, dict):
                self.add('check.title', ic.get('title'), cat)
                self.add('check.why', ic.get('why'), cat)
            self.citation('check', c.get('citation'))
            for ci in c.get('citations') or []:
                self.citation('check', ci)
            for v in c.get('versions') or []:
                if isinstance(v, dict):
                    self.revisions.append(v.get('revision') or '')
            for h in c.get('history') or []:
                if isinstance(h, dict):
                    self.revisions.append(h.get('revision') or '')
            for ch in c.get('changes') or []:
                if isinstance(ch, dict):
                    self.revisions += [ch.get('from') or '', ch.get('to') or '']
        for f in d.get('files', []):
            self.add('file.verdict', f.get('verdict'))
            self.add('file.why', f.get('why'))
            why = f.get('why') or ''
            head = re.split(r'[:;]', why, maxsplit=1)[0]  # the package tree prints the part before ':' or ';'
            if head and head != why:
                self.add('file.why.head', head)
            self.file_names.append(f.get('name') or '')
        for s in d.get('sheets', []):
            self.add('sheet.title', s.get('title'))
            self.add('sheet.kind', s.get('kind'))
            r = s.get('not_counted_reason')
            self.add('sheet.not_counted_reason', r)
            head = re.split(r'[:(]', r or '', maxsplit=1)[0].strip()  # the statement's By sheet prints this part
            if head and head != r:
                self.add('sheet.not_counted_reason.head', head)
        for it in d.get('items', []):
            self.add('item.label', it.get('label'))
        for t in d.get('tally') or []:
            self.add('item.label', t.get('label'))
        for name in (d.get('scenarios') or {}):
            self.add('scenario.name', name)
        self.add('run.mode', (d.get('timing') or {}).get('mode'))

    def fixes(self, where: str, fixes) -> None:
        for f in fixes or []:
            if isinstance(f, dict):
                self.add(where, f.get('label'))

    def citation(self, prefix: str, c) -> None:
        if isinstance(c, dict):
            self.add(f'{prefix}.citation.article', c.get('article'))
            self.add(f'{prefix}.citation.gloss', c.get('gloss'))

    def package_runs(self, rows: list) -> None:
        for r in rows:
            self.add('run.mode', r.get('source'))
            for name in (r.get('by_scenario') or {}):
                self.add('scenario.name', name)

    def rules(self, rows: list) -> None:
        for c in rows:
            self.add('rule.title', c.get('title'), c.get('category'))
            ic = c.get('if_confirmed')
            if isinstance(ic, dict):
                self.add('rule.title', ic.get('title'), c.get('category'))
            self.citation('rule', c.get('citation'))
            for ci in c.get('citations') or []:
                self.citation('rule', ci)

    def ask(self, d: dict) -> None:
        r = d.get('result') or {}
        self.add('ask.answer', r.get('answer'))
        for a in r.get('proposed_actions') or []:
            self.add('ask.action.value', a.get('value'))
            self.add('ask.action.why', a.get('why'))
        self.skipped_quotes += len(r.get('citations') or [])
        for c in r.get('citations') or []:
            self.file_names.append(c.get('source') or '')
        m = re.search(r'Question: (.+)', d.get('prompt') or '')
        if m:
            self.add('ask.question', m.group(1).strip())

    def finish(self) -> list[dict]:
        tokens = bind_tokens(self.file_names, self.revisions)
        for where, s, cat in self.raw:
            field = (where, cat) if cat else None
            template, values, _ = tokenise(s, tokens, field)
            row = self.rows.get(template)
            if row is None:
                row = self.rows[template] = {'template': template, 'example': s, 'placeholders': len(values), 'where': set()}
            row['where'].add(where)
        out = []
        for row in self.rows.values():
            out.append({'template': row['template'], 'example': row['example'], 'placeholders': row['placeholders'], 'where': '|'.join(sorted(row['where']))})
        out.sort(key=lambda r: (r['where'], r['template']))
        return out


def collect(api: str | None, run_ids: list[str]) -> tuple[list[dict], Collector, list[tuple[str, str, str | None]]]:
    c = Collector()
    for name in ('run.json', 'run_confirmed.json'):
        c.run(read_json(MOCK / name))
    c.package_runs(read_json(MOCK / 'package_runs.json'))
    c.rules(read_json(MOCK / 'rules.json'))
    if api:
        for rid in live_run_ids(api, run_ids):
            try:
                c.run(fetch(f'{api}/api/runs/{rid}'))
                print(f'read {api}/api/runs/{rid}', file=sys.stderr)
            except (urllib.error.URLError, OSError, ValueError) as e:
                print(f'warning: run {rid} not read from {api} ({e})', file=sys.stderr)
    for p in sorted(glob.glob(str(ASK_FIXTURES / '*.json'))):
        c.ask(read_json(Path(p)))
    rows = c.finish()
    return rows, c, c.raw


# ------------------------------------------------------------------------------------------------ checks
def check(rows: list[dict], c: Collector) -> int:
    """Every example re-matches its template with the same placeholder values; zh-TW.data.json covers every template
    with the same placeholders. Returns the number of problems."""
    bad = 0
    tokens = bind_tokens(c.file_names, c.revisions)
    seen: dict[str, dict] = {r['template']: r for r in rows}
    for where, s, cat in c.raw:
        template, values, _ = tokenise(s, tokens, (where, cat) if cat else None)
        got = extract(template, s)
        if got != values:
            bad += 1
            print(f'round trip failed [{where}]: {s!r}\n  template {template!r}\n  tokenised {values}\n  re-extracted {got}')
    if DICT.exists():
        zh = read_json(DICT)
        for t in seen:
            if t not in zh:
                bad += 1
                print(f'missing in {DICT.name}: {t!r}')
            else:
                a = sorted(PLACEHOLDER.findall(t))
                b = sorted(PLACEHOLDER.findall(zh[t]))
                if a != b:
                    bad += 1
                    print(f'placeholders differ in {DICT.name}: {t!r} → {zh[t]!r}')
                if '{' in PLACEHOLDER.sub('', zh[t]) or '}' in PLACEHOLDER.sub('', zh[t]):
                    bad += 1
                    print(f'stray brace in {DICT.name}: {zh[t]!r}')
        for t in zh:
            if t not in seen:
                print(f'note: {DICT.name} has a template the data no longer carries: {t!r}')
        print(f'{len(zh)} translations, {len(seen)} templates, {bad} problems')
    else:
        print(f'{len(seen)} templates, {bad} round-trip problems ({DICT.name} not written yet)')
    return bad


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--api', default='http://127.0.0.1:8795', help='the Landsight API (GET /api/projects, /api/runs/{id})')
    ap.add_argument('--no-api', action='store_true', help='the recorded files only')
    ap.add_argument('--run', action='append', default=[], help='a live run id to read (repeatable; default: the sample run and the latest tower and held-out runs)')
    ap.add_argument('--out', default=str(OUT), help=f'where to write (default {OUT.relative_to(ROOT)})')
    ap.add_argument('--check', action='store_true', help='verify the round trip and the translation file instead of writing')
    a = ap.parse_args()
    rows, c, _ = collect(None if a.no_api else a.api, a.run)
    if a.check:
        return 1 if check(rows, c) else 0
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
        f.write('\n')
    by_where: dict[str, int] = {}
    for r in rows:
        for w in r['where'].split('|'):
            by_where[w] = by_where.get(w, 0) + 1
    print(f'{len(rows)} templates from {len(c.raw)} strings → {out.relative_to(ROOT)}')
    print('  ' + ', '.join(f'{w} {n}' for w, n in sorted(by_where.items())))
    print(f'  {c.skipped_quotes} citation quotes left in English (not collected)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
