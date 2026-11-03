"""The package review: a folder in, a `Run` out (docs/API.md).

triage (landsight.ingest) -> sheets (every DXF and vector PDF page; Muse Spark classifies each and reads the title
block) -> code book (schedule + legends) -> the take-off (landsight.takeoff, unchanged) on cleaned copies of the
counted sheets (landsight.review.prepass) -> checks (landsight.checks, landsight.bill) -> the answer-key scoreboard
when the package is the sample (landsight.review.score).

Muse Spark calls that need no rendering run in a thread pool; every render (matplotlib, pymupdf) and the take-off
stay on the calling thread."""

from __future__ import annotations

import concurrent.futures as cf
import hashlib
import json
import math
import re
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Point, Polygon

from landsight.bill import align as A
from landsight.bill import compare as BC
from landsight.bill import money
from landsight.bill.reader import read as read_bill
from landsight.checks import area, document, ingest as ingest_checks, protected_tree, quantity, regulation, revision
from landsight.checks import scale, sheet as sheet_checks
from landsight.checks import tower as TW
from landsight.checks.base import Check, cell_ref
from landsight.ingest import decide_document, decide_image, decide_raster, walk
from landsight.ingest import pdf as P
from landsight.review import bill_rows, gauge
from landsight.review import pending as PEND
from landsight.review import colour as COL
from landsight.review import prepass as PP
from landsight.review import raster as RAS
from landsight.review import scenarios as SC
from landsight.review import sheets as S
from landsight.review.score import score
from landsight.review.spark import FIXTURES, ReviewSpark, TakeoffSpark

ANSWER_KEY = "answer_key.json"
PRICE_LIST = "firm price list.csv"
VERSION = "review-0.1"
UNIT = {"\u682a": "plant", "\u68f5": "plant",  # the take-off's Chinese plant units
        "EA": "plant", "m²": "m2", "m2": "m2", "m": "m"}
CJK = re.compile(r"[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef\uac00-\ud7af]+")


# --------------------------------------------------------------------------------------------- context


@dataclass
class Context:
    """Everything a check may read. Helper methods resolve sheets, objects, files and bill cells."""

    files: list
    sheets: list
    objects: dict = field(default_factory=dict)
    items: list = field(default_factory=list)
    prepass: dict = field(default_factory=dict)  # counted / superseded sheet_id -> Prepass
    book: object = None
    bills: list = field(default_factory=list)
    prices: list = field(default_factory=list)
    greening: object = None
    pit: object = None
    site: object = None
    details: dict = field(default_factory=dict)  # detail sheet_id -> Spark's read_detail answer
    tree_counts: dict = field(default_factory=dict)
    paved_lawn: dict = field(default_factory=dict)  # lawn item_id -> {m2, why}: paving drawn over it on another sheet
    pending: dict = field(default_factory=dict)  # tree item_id -> what Muse Spark proposed, awaiting a person
    greening_confirmed: object = None  # the greening result once every pending item is confirmed
    confirmed_view: bool = False  # checks computed as if every pending item were confirmed
    extra_plantings: list = field(default_factory=list)

    def file(self, fid):
        return next(f for f in self.files if f.file_id == fid)

    def sheet(self, sid):
        return next((d for d in self.sheets if d.sheet_id == sid), None)

    def files_of(self, sheet_ids) -> list[str]:
        return sorted({d.file_id for d in self.sheets if d.sheet_id in set(sheet_ids)})

    def object(self, sid, oid) -> dict:
        return next((o for o in self.objects.get(sid, []) if o["object_id"] == oid), {})

    def object_at(self, sid, centre, kinds=(), excluded=None) -> dict | None:
        cands = [o for o in self.objects.get(sid, []) if o["kind"] in kinds and o.get("centre")
                 and (excluded is None or bool(o.get("excluded")) == excluded)]
        best = min(cands, key=lambda o: math.dist(o["centre"], centre), default=None)
        return best if best is not None and math.dist(best["centre"], centre) < 1.5 else None

    def same_object_elsewhere(self, sid, oid):
        """The same object (same kind, centre within 0.5 m) on another revision of the same sheet number."""
        d, o = self.sheet(sid), self.object(sid, oid)
        out = []
        for other in self.sheets:
            if other.sheet_id == sid or other.number != d.number or other.source != "dxf" or not o.get("centre"):
                continue
            hit = next((x for x in self.objects.get(other.sheet_id, []) if x["kind"] == o["kind"] and x.get("centre")
                        and math.dist(x["centre"], o["centre"]) < 0.5 and not x.get("closed", True)), None)
            if hit:
                out.append((other.sheet_id, hit))
        return out

    def schedule_sheets(self) -> list[str]:
        return [d.sheet_id for d in self.sheets if d.source == "dxf" and d.kind == "schedule"]

    def schedule_objects(self) -> list[str]:
        return [f"{sid}/{o['object_id']}" for sid in self.schedule_sheets() for o in self.objects.get(sid, [])
                if o["kind"] == "schedule"]

    def tree_count(self, sid) -> int | float:
        return self.tree_counts.get(sid, 0)

    def price(self, name: str) -> dict | None:
        n = (name or "").lower()
        return next((p for p in self.prices if n and p["item"].lower().startswith(n)), None)

    def bill_cells(self, pred, field_name) -> list[str]:
        return [cell_ref(b.file_id, b.main.name, r.cell(field_name)) for b in self.bills for r in b.main.rows if pred(r)]

    def bill_files(self) -> list[str]:
        return [b.file_id for b in self.bills]


# --------------------------------------------------------------------------------------------- helpers


def locate(path: Path) -> tuple[Path, Path | None, Path | None]:
    """(package folder, answer key, price list). Accepts the package folder itself or the folder that holds it next to
    the answer key and the price list (as `landsight package` writes them)."""
    p = Path(path).expanduser().resolve()
    if not p.is_dir():
        raise ValueError(f"not a folder: {path}")
    root = p
    subdirs = [d for d in p.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if ((p / ANSWER_KEY).is_file() or (p / PRICE_LIST).is_file()) and len(subdirs) == 1:
        root = subdirs[0]
    key = next((q for q in (root.parent / ANSWER_KEY,) if q.is_file()), None)
    price = next((q for q in (root.parent / PRICE_LIST, root / PRICE_LIST) if q.is_file()), None)
    return root, key, price


def _sha(*parts) -> str:
    return S.content_key(*parts)


def _r(v) -> float:
    return round(float(v), 3)


def _ring(coords) -> list[list[float]]:
    return [[_r(x), _r(y)] for x, y, *_ in coords]


def _scrub(obj, key=None):
    """No CJK character leaves the review (URLs excepted)."""
    if isinstance(obj, dict):
        return {k: (v if k.endswith("url") else _scrub(v, k)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_scrub(v, key) for v in obj]
    if isinstance(obj, str) and CJK.search(obj):
        return re.sub(r"\s{2,}", " ", CJK.sub(" ", obj)).strip()
    return obj


def _jobs(executor, jobs) -> list:
    """Submit (fn, on_ok, on_err) jobs; returns futures paired with callbacks (callbacks run on the caller's thread)."""
    return [(executor.submit(fn), ok, err) for fn, ok, err in jobs]


def _wait(pending) -> None:
    for fut, ok, err in pending:
        try:
            ok(fut.result())
        except Exception as e:  # noqa: BLE001 - every failure is recorded where the answer would have gone
            err(e)


# --------------------------------------------------------------------------------------------- the review


def review(package, mode: str = "fixtures", fixture_dir: Path | str | None = None, workers: int = 6,
           price_list: Path | None = None, answer_key: Path | None = None, spark=None, sam=None,
           keep: dict | None = None, prices: list[dict] | None = None, price_list_name: str | None = None,
           reader: str | None = None) -> dict:
    """Review a package folder. mode "fixtures" replays tests/fixtures/review/ (offline); "live" calls Muse Spark and
    SAM 3.1 and records every answer there. `spark` / `sam` inject clients (tests). `keep`, when a dict, receives what
    the API needs after the run to serve renders and crops (landsight.app.package): the context, the sheet drafts, the
    raster pages, the take-off and the coloured renders. `prices` (rows as landsight.bill.compare.load_price_list
    returns them) replaces the price list file, e.g. the firm's list in landsight.db; `price_list_name` is how the
    checks name it. `reader` (else LANDSIGHT_READER, else "api") picks the Muse Spark that reads: "open" sends every
    Spark call to Muse Spark Open (landsight.review.spark), with its recordings kept apart."""
    started = time.monotonic()
    root, key_path, price_path = locate(Path(package))
    key_path = Path(answer_key) if answer_key else key_path
    price_path = Path(price_list) if price_list else price_path
    spark = spark or ReviewSpark(mode, fixture_dir or FIXTURES, reader=reader)
    reader_used = getattr(spark, "reader", "api")
    notes: list[str] = []
    with tempfile.TemporaryDirectory(prefix="landsight-review-") as tmp:
        tmp = Path(tmp)
        records = walk(root, tmp / "unpacked")
        drafts, rasters = _drafts(records)
        with cf.ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            # phase 1: every sheet, raster page and text document
            jobs = []
            for d in drafts:
                jobs.append((lambda d=d: spark.classify_sheet(d.png, d.key),
                             lambda a, d=d: setattr(d, "spark", a),
                             lambda e, d=d: (setattr(d, "spark_error", type(e).__name__), notes.append(f"{d.sheet_id}: classify_sheet: {e}"))))
            for f, pg, png, k in rasters:
                jobs.append((lambda png=png, k=k: spark.classify_sheet(png, k),
                             lambda a, f=f: decide_raster(f, a) if f.spark is None else None,
                             lambda e, f=f: (decide_raster(f, None, type(e).__name__), notes.append(f"{f.name}: {e}"))))
            for d in drafts:  # a sheet tied to floors (a tower): which floors, where its planting sits, its soil
                if d.source == "dxf" and TW.FLOOR_TITLE.search(d.title or ""):
                    jobs.append((lambda d=d: spark.read_floor_sheet(d.png, d.key + ":floors"),
                                 lambda a, d=d: setattr(d, "floor_read", a),
                                 lambda e, d=d: notes.append(f"{d.sheet_id}: read_floor_sheet: {e}")))
            for f in records:
                if f.text and f.ext == ".pdf":
                    jobs.append((lambda f=f: spark.summarise(f.text, "doc:" + _sha(f.text)),
                                 lambda a, f=f: decide_document(f, a),
                                 lambda e, f=f: (decide_document(f, None, type(e).__name__), notes.append(f"{f.name}: {e}"))))
            _wait(_jobs(ex, jobs))
            _finish_sheets(drafts, records)
            book = _codebook(drafts)
            ctx = Context(records, drafts, book=book)
            # phase 2a: images (in the background while the take-off runs here)
            images = [f for f in records if f.data is not None]
            img_jobs = _jobs(ex, [(lambda f=f: spark.look_image(f.data, "image:" + _sha(f.data), book.finishes()),
                                   lambda a, f=f: decide_image(f, a),
                                   lambda e, f=f: (decide_image(f, None, type(e).__name__), notes.append(f"{f.name}: {e}")))
                                  for f in images])
            _takeoffs(ctx, spark, tmp / "takeoff", notes)
            TW.analyse(ctx)  # typical floors × n, soil below the artificial-ground minimum (the tower)
            ctx.bills = [read_bill(f.abs_path, f.path, f.file_id) for f in records if f.verdict == "bill" and f.ext == ".xlsx"]
            drawn = _drawn(ctx)
            align_items = [{"code": c, "name": d["name"], "botanical": d.get("botanical", ""), "kind": d["kind"],
                            "unit": d["unit"]} for c, d in drawn.items()]
            align_box = {}
            align_jobs = _jobs(ex, [(lambda: A.align(ctx.bills, align_items, book, spark),
                                     lambda a: align_box.update(result=a),
                                     lambda e: align_box.update(result=(A.by_rule(A.distinct_rows(ctx.bills), align_items, book),
                                                                        f"alignment failed: {e}")))])
            _wait(img_jobs)
            _wait(align_jobs)
        matches, align_note = align_box.get("result", ({}, "no bills"))
        if align_note and ctx.bills:  # Muse Spark's alignment fell back to the name rule: say so at run level too
            notes.append(f"bill alignment: {align_note}")
        ctx.prices = prices if prices is not None else BC.load_price_list(price_path)
        _greening(ctx, notes)
        sam = sam or (COL.review_sam(mode, "open", fixture_dir) if reader_used == "open"
                      else COL.ReviewSam(COL.mode_for(mode)))
        colour_checks, filled = COL.colour(ctx, spark, sam, notes)
        raster_items, raster_checks = RAS.measure(ctx, rasters, spark, sam, notes)  # SAM on the raster plan page

        checks: list[Check] = []
        checks += ingest_checks.ingest(ctx)
        checks += sheet_checks.index(ctx)
        checks += sheet_checks.not_counted(ctx)
        checks += revision.revisions(ctx)
        checks += sheet_checks.legend(ctx)
        checks += scale.scales(ctx)
        checks += quantity.open_outlines(ctx)
        checks += quantity.schedule(ctx)
        checks += quantity.rows(ctx)
        checks += quantity.boundary(ctx)
        checks += TW.checks(ctx)
        checks += _both_views(ctx, regulation.fire_lane)
        checks += area.overlaps(ctx)
        checks += area.hatch_labels(ctx)
        checks += colour_checks
        checks += raster_checks
        checks += protected_tree.protected(ctx)
        checks += _both_views(ctx, regulation.greening)
        checks += _both_views(ctx, regulation.water_retention)
        checks += bill_rows.annotate(BC.checks(ctx.bills, matches, drawn, ctx.prices, align_note,
                                               price_list_name or (price_path.name if price_path else PRICE_LIST)),
                                     ctx.bills, matches, drawn, ctx.prices)
        for n, c in enumerate(checks, 1):
            c.check_id = f"C-{n:02d}"
        green = next((c.api() for c in checks if c.category == "regulation" and c.title.startswith("Greening")), None)
        green_c = (dict(green, **green["if_confirmed"]) if green and green.get("if_confirmed") else None)
        docs = document.documents(ctx, green)
        if green_c is not None:
            for a, b in zip(docs, document.documents(ctx, green_c)):
                if (a.title, a.why) != (b.title, b.why):
                    a.extra |= {"pending_items": sorted(ctx.pending), "if_confirmed": PEND.variant(b.api())}
        for c in docs:
            c.check_id = f"C-{len(checks) + 1:02d}"
            checks.append(c)
        check_dicts = [money.add_usd(c.api()) for c in checks]  # USD beside every TWD figure (one dated rate)
        for c in check_dicts:  # the gauge's two states (before / after the tree-pit rule) on the greening check
            if c["category"] == "regulation" and c["title"].startswith("Greening"):
                c.update(_keep_in_states(ctx, gauge.downgrade_states(ctx.greening)))
                if c.get("if_confirmed"):
                    c["if_confirmed"].update(_keep_in_states(ctx, gauge.downgrade_states(ctx.greening_confirmed)))

        errors = {"planted": 0, "found": [], "flagged": [], "missed": [], "false_alarms": []}
        key = None
        if key_path is not None and key_path.is_file():
            key = json.loads(key_path.read_text())
            errors, assigned = _score(ctx, check_dicts, key)
        SC.assign(check_dicts, member_files={f.file_id for f in records if f.parent},
                  page_sheets={d.sheet_id for d in drafts if d.source != "dxf"})
        scenarios = SC.slices(check_dicts, errors, key["errors"] if key else None)
        sheets_api = [_sheet_api(d, ctx) for d in drafts if d.source in ("dxf", "pdf_vector")]
        items_api = [{k: v for k, v in it.items() if not k.startswith("_")} for it in ctx.items + raster_items]
        run = {
            "run_id": hashlib.sha256(f"{root}{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest()[:12],
            "package": {"name": root.name, "folder": str(root), "file_count": sum(1 for f in records if not f.parent)},
            "files": [f.api() for f in records],
            "sheets": sheets_api,
            "items": items_api,
            "checks": check_dicts,
            "errors": errors,
            "scenarios": scenarios,
            "tally": _tally(ctx.items),
            "timing": {"total_s": round(time.monotonic() - started, 2), "spark_calls": spark.calls,
                       "sam_calls": sam.calls, "spark_s": spark.seconds, "sam_s": sam.seconds,
                       "recorded": spark.recorded and sam.recorded, "mode": mode,
                       "calls": [{"call": e["call"], "model": e.get("model") or "muse-spark-1.3",
                                  "seconds": e.get("seconds"), "recorded": e.get("recorded")} for e in spark.log]
                       + [{"call": e["call"], "model": e["model"], "seconds": e["seconds"], "recorded": e["recorded"],
                           "prompt_source": e["prompt_source"]} for e in sam.log],
                       **({"reader": "open", "model": spark.model} if reader_used == "open" else {})},
            "notes": notes + spark.errors,
            "currency": money.currency(),
            "version": VERSION,
        }
        if keep is not None:
            keep.update(ctx=ctx, drafts=drafts, takeoff=ctx._takeoff, filled=filled, root=root,
                        rasters=[{"file_id": f.file_id, "page": pg.index, "png": png, "answer": f.spark,
                                  "path": f.path, "abs_path": f.abs_path, "why": f.why} for f, pg, png, _ in rasters])
    return _scrub(run)


def _keep_in_states(ctx: Context, states: dict) -> dict:
    """The old-tree fix (keep the existing tree) in each gauge state, priced with that state's ΣGi·Ai and α."""
    keeps = regulation.keep_existing(ctx)
    for k in ("before_downgrade", "after_downgrade"):
        st = states.get(k)
        if st and keeps:
            st["fixes"] = st["fixes"] + [regulation.keep_fix(x, st["sum_gi_ai"], st["alpha"], st["required"]) for x in keeps]
    return states


def _both_views(ctx: Context, fn) -> list[Check]:
    """fn(ctx) as the review counts (Muse Spark's proposals waiting) and, when something waits, again as if a person
    confirmed it; a check whose text changes carries `pending_items` and `if_confirmed` (landsight.review.pending)."""
    now = fn(ctx)
    if ctx.greening_confirmed is None:
        return now
    saved = ctx.greening
    ctx.greening, ctx.confirmed_view = ctx.greening_confirmed, True
    try:
        then = fn(ctx)
    finally:
        ctx.greening, ctx.confirmed_view = saved, False
    for a, b in zip(now, then):
        if (a.title, a.why, a.numbers) != (b.title, b.why, b.numbers):
            a.extra |= {"pending_items": sorted(ctx.pending), "if_confirmed": PEND.variant(b.api())}
    return now


# --------------------------------------------------------------------------------------------- sheets


def _drafts(records) -> tuple[list[S.SheetDraft], list]:
    from landsight.dxf import render_png, render_window

    drafts, rasters = [], []
    for f in records:
        if f.ext == ".dxf" and f.model is not None:
            d = S.SheetDraft("", f.file_id, "dxf", f.path, model=f.model)
            d.fields = S.title_fields(f.model)
            d.number = d.fields.get("number") or Path(f.name).stem
            d.title, d.revision = d.fields.get("title", ""), d.fields.get("revision", "")
            d.date, d.scale_title = d.fields.get("date", ""), d.fields.get("scale", "")
            d.png = render_png(f.model)
            d.key = "dxf:" + f.model.signature()
            d.bounds = render_window(f.model)
            d.match_line = S.match_line(f.model)
            drafts.append(d)
        elif f.ext == ".pdf" and f.pages:
            for pg in f.pages:
                if pg.kind == "vector":
                    d = S.SheetDraft(f"{f.file_id}-p{pg.index + 1}", f.file_id, "pdf_vector", f.path, page=pg.index)
                    d.fields = S.page_fields(pg.text)
                    d.png = P.render(f.abs_path, pg.index)
                    d.key = "pdfpage:" + _sha(pg.text, pg.index, f.name)
                    d.bounds = (0.0, 0.0, pg.width_pt, pg.height_pt)
                    d.title_by = "text"
                    drafts.append(d)
                    f.sheet_ids.append(d.sheet_id)
                elif pg.kind == "raster":
                    png = P.render(f.abs_path, pg.index)
                    rasters.append((f, pg, png, "raster:" + P.image_hash(f.abs_path, pg.index)))
    # sheet ids for DXF drafts: the drawing number, with the revision when two files share it
    numbers: dict[str, int] = {}
    for d in drafts:
        if d.source == "dxf":
            numbers[d.number] = numbers.get(d.number, 0) + 1
    taken = {d.sheet_id for d in drafts if d.sheet_id}
    for d in drafts:
        if d.source != "dxf":
            continue
        sid = d.number if numbers[d.number] == 1 else f"{d.number}-rev{d.revision or d.file_id}"
        while sid in taken:
            sid += "x"
        taken.add(sid)
        d.sheet_id = sid
        next(f for f in records if f.file_id == d.file_id).sheet_ids.append(sid)
    return drafts, rasters


def _finish_sheets(drafts, records) -> None:
    for d in drafts:
        S.decide_kind(d)
        tb = (d.spark or {}).get("title_block") or {}
        if d.source != "dxf":
            d.number = d.fields.get("number") or tb.get("number", "")
            d.title = d.fields.get("title") or tb.get("title", "")
            d.revision = d.fields.get("revision") or tb.get("revision", "")
            d.date = d.fields.get("date") or tb.get("date", "")
            d.scale_title = d.fields.get("scale") or tb.get("scale", "")
            d.title_by = "text" if d.fields.get("number") else ("spark" if tb else "none")
        else:
            for attr, k in (("title", "title"), ("revision", "revision"), ("date", "date"), ("scale_title", "scale")):
                if not getattr(d, attr) and tb.get(k):
                    setattr(d, attr, tb[k])
                    d.title_by = "spark"
    S.measure_scales(drafts)
    S.decide_counted(drafts)
    for f in records:  # a drawing inside an archive (a supplier's quote) is never a landscape quantity
        if f.parent:
            parent = next(p for p in records if p.file_id == f.parent)
            for d in drafts:
                if d.file_id == f.file_id:
                    d.counted = False
                    what = f"{d.discipline} {d.kind}" if d.discipline and d.discipline not in ("other", "general") else d.kind
                    d.not_counted_reason = f"{what} from {parent.name}: not a landscape quantity"


def _codebook(drafts) -> PP.CodeBook:
    models = {d.sheet_id: d.model for d in drafts if d.source == "dxf"}
    schedule = [d.sheet_id for d in drafts if d.source == "dxf" and (d.kind == "schedule" or PP.read_schedule_text(d.model))]
    legend = [d.sheet_id for d in drafts if d.source == "dxf" and d.kind == "plan"
              and (d.counted or d.not_counted_reason.startswith("superseded"))
              and any("LEGEND" in t.content.upper() for t in d.model.texts)]
    return PP.codebook(models, schedule, legend)


# --------------------------------------------------------------------------------------------- the take-off


def _takeoffs(ctx: Context, spark: ReviewSpark, out: Path, notes: list[str]) -> None:
    from landsight.dxf import load
    from landsight.takeoff import run as takeoff_run

    by_id = {d.sheet_id: d for d in ctx.sheets}
    counted = [d for d in ctx.sheets if d.counted]
    support = [d for d in ctx.sheets if d.source == "dxf" and not d.counted and not ctx.file(d.file_id).parent and
               (d.kind == "schedule" or (d.kind == "detail" and d.discipline != "metalwork"))]
    superseded = [d for d in ctx.sheets if d.source == "dxf" and d.kind == "plan"
                  and d.not_counted_reason.startswith("superseded")]
    kinds: dict[str, dict] = {}

    def clean(d) -> Path:
        src = ctx.file(d.file_id).abs_path
        if d in counted or d in superseded:
            pre = PP.analyse(d.sheet_id, d.model, ctx.book)
            ctx.prepass[d.sheet_id] = pre
        else:
            pre = PP.Prepass(d.sheet_id)
        path = PP.write_clean(src, pre, out / f"{d.sheet_id}.dxf")
        kinds[load(path).signature()] = {"kind": d.kind, "confidence": d.kind_confidence, "why": d.kind_why}
        return path

    gov_paths = [clean(d) for d in counted + support]
    ctx._takeoff = None
    if gov_paths:
        try:
            tk = takeoff_run([str(p) for p in gov_paths], TakeoffSpark(spark, kinds), read_details=True)
            ctx._takeoff = tk
            ctx.pit = tk.pit
            ctx.details = {name: read for name, read in tk.details.items()}
            notes += [f"take-off: {n}" for n in tk.notes if "failed" in n or "budget" in n or "no fixture" in n.lower()]
        except Exception as e:  # noqa: BLE001
            notes.append(f"take-off failed: {type(e).__name__}: {e}")
    ctx._superseded = {}
    for d in superseded:
        try:
            ctx._superseded[d.sheet_id] = takeoff_run([str(clean(d))], TakeoffSpark(spark, kinds), read_details=False)
        except Exception as e:  # noqa: BLE001
            notes.append(f"take-off of {d.sheet_id} failed: {type(e).__name__}: {e}")
    _objects(ctx, by_id)


def _item_label(it, book) -> tuple[str, str | None, str]:
    c = book.by_name(it.label) if it.label else None
    if c is not None:
        return c.name, c.code, c.botanical
    if it.kind == "planter_edge":
        return "Planter edge", None, ""
    words = (it.label or "").strip().split()
    if len(words) > 1 and (re.fullmatch(r"[A-Z]{1,3}-?\d{1,2}", words[0])
                           or (re.fullmatch(r"[A-Z]{1,3}", words[0]) and words[1].upper().startswith(words[0]))):
        words = words[1:]  # a legend code in front of the name ('LA LAWN', 'PV-1 PERMEABLE PAVERS'): the name only
    return " ".join(words).capitalize(), None, ""


def _objects(ctx: Context, by_id: dict) -> None:
    from landsight.geometry import close, exclude, is_canopy

    book = ctx.book
    takeoffs = {}
    if ctx._takeoff is not None:
        takeoffs.update({sg.sheet: (ctx._takeoff, sg) for sg in ctx._takeoff.sheets})
    for sid, tk in ctx._superseded.items():
        takeoffs.update({sg.sheet: (tk, sg) for sg in tk.sheets})
    for d in ctx.sheets:
        if d.source != "dxf":
            continue
        objs: list[dict] = []
        if d.sheet_id in takeoffs and (d.counted or d.sheet_id in ctx._superseded):
            tk, sg = takeoffs[d.sheet_id]
            objs += _takeoff_objects(tk, sg, book)
            ctx.tree_counts[d.sheet_id] = sum(it.proposed_count or 0 for it in tk.items if it.kind == "tree"
                                              and any(r.startswith(d.sheet_id + "/") for r in it.objects.values()))
            regions, shapes = sg.regions, sg.closed.shapes
        else:
            res = close(d.model)
            regions = exclude(d.model, res.shapes + res.candidates)
            shapes = res.shapes
            for s in shapes:
                if not s.excluded and is_canopy(s):
                    objs.append({"object_id": f"R-{len(objs) + 1:02d}", "kind": "tree", "label": "round outline",
                                 "centre": [_r(v) for v in s.centre], "area_m2": round(s.area, 2),
                                 "outline": _ring(s.polygon.exterior.coords), "closed": True, "by": "geometry",
                                 "excluded": {"reason": d.not_counted_reason, "rule": f"sheet kind: {d.kind} ({d.kind_by})"}})
        objs += _furniture(d, regions, shapes)
        pre = ctx.prepass.get(d.sheet_id)
        if pre is not None:
            objs += _prepass_objects(d, pre, objs)
        ctx.objects[d.sheet_id] = objs
    _items(ctx)


def _takeoff_objects(tk, sg, book) -> list[dict]:
    from landsight.geometry import hedge_bands

    out = []
    for it in tk.items:
        label, code, _ = _item_label(it, book)
        for oid, ref in it.objects.items():
            name, gid = ref.split("/", 1)
            if name != sg.sheet:
                continue
            obj = next((x for x in sg.closed.shapes + sg.closed.candidates if x.id == gid), None)
            if obj is None:
                continue
            is_open = gid.startswith("C-")
            rec = {"object_id": oid, "item_id": it.id, "kind": it.kind if it.kind != "unresolved" else "tree",
                   "label": label, "species_code": code, "centre": [_r(v) for v in obj.centre], "closed": not is_open,
                   "by": "geometry"}
            if is_open:
                rec["segments"] = [_ring(ln.coords) for ln in obj.lines]
                rec["pieces"] = obj.segment_count
                outline = obj.footprint
                if it.kind == "hedge":
                    bands = [b for b in hedge_bands(sg.model) if b.intersects(obj.footprint)]
                    outline = bands[0] if bands else outline
                    rec["length_m"] = round(sum(ln.length for ln in obj.lines if ln.length >= 1.0), 2)
                else:
                    gaps = _gap_points(obj)
                    rec["gaps"] = [g for g, _ in gaps]
                    rec["gap_sizes_m"] = [s for _, s in gaps]
                    rec["by"] = "spark" if ref in tk.spark.candidates else "geometry"
                rec["outline"] = _ring(outline.exterior.coords) if hasattr(outline, "exterior") else []
                rec["area_m2"] = round(outline.area, 2)
            else:
                rec["outline"] = _ring(obj.polygon.exterior.coords)
                rec["area_m2"] = round(obj.area, 2)
                if it.kind == "planter_edge":
                    rec["length_m"] = round(obj.polygon.length, 2)
            out.append(rec)
    return out


def _gap_points(c, eps: float = 0.6) -> list:
    ends = []
    for k, ln in enumerate(c.lines):
        cs = list(ln.coords)
        ends += [(k, cs[0]), (k, cs[-1])]
    used, out = set(), []
    for i, (ki, a) in enumerate(ends):
        if i in used:
            continue
        best = None
        for j, (kj, b) in enumerate(ends):
            if j != i and j not in used and kj != ki:
                dd = math.dist(a, b)
                if dd <= eps and (best is None or dd < best[0]):
                    best = (dd, j, b)
        if best and best[0] > 1e-3:
            dd, j, b = best
            used |= {i, j}
            out.append(([_r((a[0] + b[0]) / 2), _r((a[1] + b[1]) / 2)], round(dd, 2)))
    return out


def _furniture(d, regions, shapes) -> list[dict]:
    from landsight.geometry import is_canopy

    out = []
    kinds = {"legend": "legend", "title": "title_block", "schedule": "schedule"}
    for r in regions:
        c = r.polygon.centroid
        out.append({"object_id": f"X-{len(out) + 1:02d}", "kind": kinds[r.kind],
                    "label": {"legend": "legend box", "title": "title block", "schedule": "schedule"}[r.kind],
                    "centre": [_r(c.x), _r(c.y)], "outline": _ring(r.polygon.exterior.coords), "closed": True,
                    "by": "geometry", "excluded": {"reason": "sheet furniture: not counted",
                                                   "rule": "geometry: smallest frame around the keyword"}})
    for s in shapes:
        if s.excluded == "legend" and (is_canopy(s) or s.hatch_pattern):
            out.append({"object_id": f"X-{len(out) + 1:02d}", "kind": "legend",
                        "label": "legend symbol" if is_canopy(s) else f"legend swatch {s.hatch_pattern}",
                        "centre": [_r(v) for v in s.centre], "area_m2": round(s.area, 2),
                        "outline": _ring(s.polygon.exterior.coords), "closed": True, "by": "geometry",
                        "excluded": {"reason": "inside the legend box: a key, not a plant", "rule": "geometry: legend region"}})
        elif s.excluded == "building":
            out.append({"object_id": f"X-{len(out) + 1:02d}", "kind": "building", "label": "building outline",
                        "centre": [_r(v) for v in s.centre], "area_m2": round(s.area, 2),
                        "outline": _ring(s.polygon.exterior.coords), "closed": True, "by": "geometry",
                        "excluded": {"reason": "a building outline drawn for reference: not landscape, not counted",
                                     "rule": "geometry: building layer"}})
    if d.match_line:
        out.append({"object_id": f"X-{len(out) + 1:02d}", "kind": "match_line", "label": d.match_line["text"],
                    "centre": list(d.match_line["centre"]), "outline": _ring(d.match_line["line"]) if d.match_line["line"] else [],
                    "closed": False, "by": "geometry"})
    if d.scale_bar:
        out.append({"object_id": f"X-{len(out) + 1:02d}", "kind": "scale_bar",
                    "label": " ".join(d.scale_bar["labels"]), "centre": list(d.scale_bar["centre"]), "outline": [],
                    "closed": False, "by": "geometry"})
    if d.kind == "detail" and d.discipline != "metalwork":
        sq = [s for s in shapes if not s.hatch_pattern and 0.9 < (4 * math.pi * s.polygon.area / s.polygon.length ** 2) / (math.pi / 4) < 1.1
              and 0.5 <= s.area <= 25]
        for s in sq[:1]:
            out.append({"object_id": "PIT-01", "kind": "tree_pit", "label": "tree pit",
                        "centre": [_r(v) for v in s.centre], "area_m2": round(s.area, 2),
                        "outline": _ring(s.polygon.exterior.coords), "closed": True, "by": "geometry"})
    return out


def _prepass_objects(d, pre, existing) -> list[dict]:
    out = []
    tmax = max((int(o["object_id"][2:]) for o in existing if re.match(r"^T-\d+$", o["object_id"])), default=0)
    for ex in pre.excluded:
        tmax += 1
        rule = ("geometry: centre outside the site boundary" if ex.kind == "outside_boundary"
                else "geometry: centre inside an exclusion zone")
        out.append({"object_id": f"T-{tmax:02d}", "kind": "tree", "label": "proposed tree (excluded)",
                    "centre": [_r(v) for v in ex.centre], "area_m2": ex.area_m2, "outline": _ring(ex.outline), "closed": True,
                    "by": "geometry", "excluded": {"reason": ex.reason, "rule": rule}})
    for i, z in enumerate(pre.zones, 1):
        c = z.polygon.centroid
        out.append({"object_id": f"Z-{i:02d}", "kind": "fire_lane" if "FIRE" in z.label.upper() else "boundary",
                    "label": z.label, "centre": [_r(c.x), _r(c.y)], "area_m2": z.area_m2,
                    "outline": _ring(z.polygon.exterior.coords) if hasattr(z.polygon, "exterior") else [], "closed": True,
                    "by": "geometry", "excluded": {"reason": "fire-truck lane marked keep clear: no planting counted here; "
                                                             "hard-to-green area (Ap) only if the architect declares it",
                                                   "rule": "Building Technical Regulations, Art. 299 (if declared)"}})
    for ex in pre.existing:
        circle = Point(ex.centre).buffer(ex.canopy_r, quad_segs=16)
        out.append({"object_id": ex.tag, "kind": "existing_tree", "label": ex.label or "existing tree",
                    "centre": [_r(v) for v in ex.centre], "area_m2": round(circle.area, 2),
                    "outline": _ring(circle.exterior.coords), "closed": True, "by": "geometry",
                    "excluded": {"reason": "existing tree" + (" to be removed" if ex.to_be_removed else "")
                                 + ": not a proposed quantity", "rule": "dashed line work: an existing tree"}})
    if pre.boundary is not None:
        c = pre.boundary.centroid
        out.append({"object_id": f"X-{len(existing) + len(out) + 1:02d}", "kind": "boundary", "label": "site boundary",
                    "centre": [_r(c.x), _r(c.y)], "area_m2": round(pre.boundary.area, 2),
                    "outline": _ring(pre.boundary.exterior.coords), "closed": True, "by": "geometry"})
    # a revision cloud: a closed, scalloped outline around exactly one tree
    trees = [o for o in existing if o["kind"] == "tree"]
    for e in d.model.entities:
        if not e.closed or len(e.geometry.coords) < 40:
            continue
        poly = Polygon(e.geometry.coords)
        if not poly.is_valid or poly.area < 1.0:
            continue
        circ = 4 * math.pi * poly.area / poly.length ** 2
        inside = [t for t in trees if poly.contains(Point(t["centre"]))]
        if 0.35 < circ < 0.8 and len(inside) == 1 and poly.area < 3 * (inside[0].get("area_m2") or 1e9):
            c = poly.centroid
            out.append({"object_id": f"RC-{len([o for o in out if o['kind'] == 'revision_cloud']) + 1:02d}",
                        "kind": "revision_cloud", "label": f"revision cloud (Rev {d.revision})",
                        "centre": [_r(c.x), _r(c.y)], "outline": _ring(poly.exterior.coords), "closed": True,
                        "by": "geometry"})
    return out


def _items(ctx: Context) -> None:
    tk = ctx._takeoff
    if tk is None:
        return
    book = ctx.book
    items = []
    drawn_codes = {}
    for it in tk.items:
        label, code, botanical = _item_label(it, book)
        refs = [tuple(r.split("/", 1)) for r in it.objects.values()]
        oid_of = {r: oid for oid, r in it.objects.items()}
        rec = {"item_id": it.id, "kind": it.kind, "label": label, "species_code": code,
               "unit": UNIT.get(it.unit, it.unit or "plant"), "geometry_count": it.geometry_count,
               "spark_count": it.spark_count, "schedule_count": it.schedule_count, "label_count": it.label_count,
               "agreed": it.agreed, "flagged_reason": it.flagged_reason or None, "quote_count": it.quote_count,
               "proposed_count": it.proposed_count, "object_ids": list(it.objects),
               "sheet_ids": sorted({s for s, _ in refs}), "confirmed": False, "botanical": botanical or None,
               "_refs": [(s, oid_of[f"{s}/{g}"]) for s, g in refs], "_schedule_by": "spark", "_code": code,
               "_on_drawing": it.sheet != "schedule"}
        reviewed = [r for r in it.objects.values() if r in tk.spark.candidates]
        if reviewed:
            ref = reviewed[0]
            v, req = tk.spark.candidates[ref], tk.requests.get(ref, {})
            rec["spark"] = {"crop_url": f"/api/crops/{it.id}.png", "answer": v, "why": v.get("why", ""),
                            "confidence": v.get("confidence"), "object_id": oid_of[ref], "sheet_id": ref.split("/")[0],
                            "facts": req.get("facts", ""), "seconds": req.get("seconds")}
        if it.kind == "hedge" and code and book[code].remarks:
            sg = next((g for g in tk.sheets if g.sheet == refs[0][0]), None)
            cand = next((c for c in sg.closed.candidates if c.id == refs[0][1]), None) if sg else None
            m = re.search(r"@\s*(\d+(?:\.\d+)?)\s*m", book[code].remarks)
            if cand is not None and m:
                lines = [ln for ln in cand.lines if ln.length >= 1.0]
                rec["_row"] = {"length_m": round(lines[0].length, 2) if lines else 0, "spacing_m": float(m.group(1)),
                               "rows": len(lines), "label": book[code].label + " " + book[code].remarks}
        items.append(rec)
        if code and rec["_on_drawing"]:
            drawn_codes[code] = rec
    # schedule-only rows the take-off could not match: fold them into the drawn item of the same code
    kept = []
    for rec in items:
        if not rec["_on_drawing"] and rec["_code"] in drawn_codes:
            tgt = drawn_codes[rec["_code"]]
            if tgt["schedule_count"] is None:
                tgt["schedule_count"] = rec["schedule_count"]
            continue
        kept.append(rec)
    for rec in kept:  # no schedule read for a coded item: the schedule's own DXF text
        c = book.get(rec["_code"]) if rec["_code"] else None
        if rec["schedule_count"] is None and c is not None and c.qty is not None and rec["_on_drawing"]:
            rec["schedule_count"], rec["_schedule_by"] = c.qty, "rule"
            if rec["proposed_count"] is not None and abs(c.qty - rec["proposed_count"]) > 0.01 * max(c.qty, 1):
                rec["agreed"] = False
                rec["quote_count"] = None
                rec["flagged_reason"] = ((rec["flagged_reason"] + "; ") if rec["flagged_reason"] else "") + \
                    f"sources disagree: drawing {rec['proposed_count']}, schedule {c.qty:g}"
    ctx.items = kept


def _drawn(ctx: Context) -> dict[str, dict]:
    out = {}
    for it in ctx.items:
        if not it["_on_drawing"] or it["kind"] == "unresolved":
            continue
        code = it["_code"] or re.sub(r"[^A-Z0-9]+", "-", it["label"].upper()).strip("-")
        c = ctx.book.get(it["_code"]) if it["_code"] else None
        row = it.get("_row") or {}
        out[code] = {"code": code, "name": it["label"], "botanical": it.get("botanical") or "", "kind": it["kind"],
                     "unit": it["unit"], "qty": it["proposed_count"] if it["proposed_count"] is not None else it["geometry_count"],
                     "item_id": it["item_id"], "object_refs": [f"{s}/{o}" for s, o in it["_refs"]],
                     "sheet_ids": it["sheet_ids"], "length_m": row.get("length_m"), "rows": row.get("rows"),
                     "spacing_m": row.get("spacing_m"), "density_per_m2": c.density_per_m2 if c else None,
                     "schedule_qty": it["schedule_count"],
                     "related_rows": [{"match": lambda r: "pit" in r.description.lower()}] if it["kind"] == "tree" else []}
    return out


def _greening(ctx: Context, notes: list[str]) -> None:
    tk = ctx._takeoff
    if tk is None:
        return
    try:
        from landsight.rules import greening as G
        from landsight.rules import site_facts

        counted = [d for d in ctx.sheets if d.counted]
        fields = {d.sheet_id: {"SITE AREA": d.fields.get("site_area", ""), "BUILDING COVERAGE": d.fields.get("coverage", ""),
                               "PROJECT": d.fields.get("project", ""), "GROUND": d.fields.get("ground", "")}
                  for d in counted}
        fields = {s: {k: v for k, v in f.items() if v} for s, f in fields.items()}
        site = site_facts(fields)
        ctx.site = site
        from landsight.checks.area import paved_lawn
        from landsight.checks.regulation import greening_plantings

        ctx.paved_lawn = paved_lawn(ctx)  # paving drawn over lawn on another sheet: not counted as lawn
        ctx.pending = PEND.pending_trees(ctx.items)  # Muse Spark's proposals wait for a person (D-62)
        ctx.greening = G.check(site, greening_plantings(ctx, confirmed=False), pit=tk.pit)
        ctx.greening_confirmed = (G.check(site, greening_plantings(ctx, confirmed=True), pit=tk.pit)
                                  if ctx.pending else None)
    except Exception as e:  # noqa: BLE001 - the rules module is being edited elsewhere; the review stands without it
        notes.append(f"greening check unavailable: {type(e).__name__}: {e}")


# --------------------------------------------------------------------------------------------- shaping


def _sheet_api(d: S.SheetDraft, ctx: Context) -> dict:
    x0, y0, x1, y1 = d.bounds
    out = {"sheet_id": d.sheet_id, "file_id": d.file_id, "title": d.title, "number": d.number, "kind": d.kind,
           "kind_confidence": round(d.kind_confidence, 2), "kind_by": d.kind_by, "kind_why": d.kind_why,
           "revision": d.revision or None, "date": d.date or None, "scale_title": d.scale_title or None,
           "scale_measured": d.scale_measured or None, "counted": d.counted,
           "svg_url": f"/api/sheets/{d.sheet_id}.svg", "png_url": f"/api/sheets/{d.sheet_id}.png",
           "bounds": {"min_x": _r(x0), "min_y": _r(y0), "max_x": _r(x1), "max_y": _r(y1)},
           "objects": ctx.objects.get(d.sheet_id, []), "source": d.source, "discipline": d.discipline or None,
           "title_by": d.title_by}
    if not d.counted:
        out["not_counted_reason"] = d.not_counted_reason
    if d.page is not None:
        out["page"] = d.page + 1
    if d.units_per_m:
        out["scale_how"] = d.scale_how
    fi = getattr(ctx, "floor_info", {}).get(d.sheet_id)
    if fi:
        out |= {"floors": fi["floors"], "floor_count": fi["n"], "floor_label": fi["label"], "ground": fi["ground"]}
    if d.sheet_id in ctx.details:
        r = ctx.details[d.sheet_id]
        out["detail"] = {k: r.get(k) for k in ("pit_w_m", "pit_l_m", "soil_depth_m", "on_slab", "why")} | {"by": "spark"}
    return out


def _tally(items) -> list[dict]:
    rows = []
    for it in items:
        if it["kind"] not in ("tree", "hedge", "shrub_bed", "lawn") or not it.get("_on_drawing", True):
            continue
        # 'drawn' is what geometry measured until a person confirms the rest (D-62), as the API's tally shows it
        rows.append({"label": it["label"], "species_code": it["species_code"], "drawn": it["geometry_count"]
                     if it["geometry_count"] is not None else it["proposed_count"], "spark": it["spark_count"],
                     "schedule": it["schedule_count"], "unit": it["unit"],
                     "status": "agreed" if it["agreed"] else "flagged", "item_id": it["item_id"]})
    return rows


def _score(ctx: Context, checks: list[dict], key: dict) -> tuple[dict, dict]:
    files = {}
    for f in ctx.files:
        number = next((d.number for d in ctx.sheets if d.file_id == f.file_id and d.source == "dxf"), None)
        parent = next((p.path for p in ctx.files if p.file_id == f.parent), None) if f.parent else None
        files[f.file_id] = {"path": f.path, "parent_path": parent, "number": number}
    sheets = {d.sheet_id: {"number": d.number, "file_id": d.file_id} for d in ctx.sheets}
    errors, assigned = score(checks, key, files, sheets, ctx.objects)
    # check ids: the matched error's id (E02, E02.2 ...) for matched checks
    seen: dict[str, int] = {}
    for i, eid in sorted(assigned.items()):
        seen[eid] = seen.get(eid, 0) + 1
        checks[i]["check_id"] = eid if seen[eid] == 1 else f"{eid}.{seen[eid]}"
    detail = errors.pop("_detail")
    errors["false_alarms"] = [checks[i]["check_id"] for i in errors["false_alarms"]]
    errors["matches"] = {eid: [checks[i]["check_id"] for i in idx] for eid, idx in detail.items()}
    return errors, assigned
