"""The API on a real developer's package: `POST /api/package/open` runs landsight.review on a folder (the bundled
sample, samples/greenfield, when no path is given) and serves that Run, plus what the screen needs and the review does
not keep: every sheet rendered (SVG and PNG for DXF sheets, vector PDF pages and raster PDF pages; the coloured render
SAM 3.1 saw as `filled_png_url`), the exact crop Muse Spark was shown, the grounding points in drawing metres, a
person's confirmations, the regulation checks and the director's scenes, each a pointer into this Run.

Fixtures by default (recordings of real Muse Spark and SAM 3.1 calls, tests/fixtures/review/); live calls with
`live=True` (MODEL_API_KEY). Every string is English: the review scrubs, and landsight.app.english.deep runs last."""

from __future__ import annotations

import base64
import copy
import io
import os
from pathlib import Path

from shapely.geometry import Point

from landsight.app.english import deep
from landsight.review import review

REPO = Path(__file__).resolve().parents[2]
SAMPLE = REPO / "samples" / "greenfield"
SAMPLE_CACHE = REPO / ".cache" / "greenfield"  # written on first open when samples/ was removed
PAPER = "#f7f5f0"
ON_SEGMENT_M = 0.3
COLOURED_SHARE = 0.02  # a raster page is a coloured render when this share of its pixels is saturated (S > 40/255)
RASTER_REASON = "raster PDF page: no vectors, read for its title block only, not measured"


ASSET_PATHS = ("/api/sheets/", "/api/crops/")


def tag_urls(obj, run_id: str):
    """Every sheet render and crop URL in a Run (or an Item) carries its own `?run=<run_id>`, so the image stays
    reachable after another package becomes the current run. In place; returns `obj`."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if (k.endswith("_url") and isinstance(v, str) and v.startswith(ASSET_PATHS) and "?" not in v and run_id):
                obj[k] = f"{v}?run={run_id}"
            elif isinstance(v, (dict, list)):
                tag_urls(v, run_id)
    elif isinstance(obj, list):
        for v in obj:
            tag_urls(v, run_id)
    return obj


def _review(*a, **k):
    """landsight.review.review, looked up when called (a test slows a reopen down by replacing `review` here)."""
    return review(*a, **k)


def _saturated_share(png: bytes) -> float:
    import numpy as np
    from PIL import Image

    im = Image.open(io.BytesIO(png)).convert("RGB")
    im.thumbnail((600, 600))
    return float((np.asarray(im.convert("HSV"))[..., 1] > 40).mean())


def _png_size(png: bytes) -> tuple[int, int]:
    from PIL import Image

    return Image.open(io.BytesIO(png)).size


class PackageState:
    """The last opened package: its Run (from landsight.review), the drafts it was read from, and confirmations."""

    def __init__(self, db_path: str | Path | None = None):
        self.base: dict | None = None
        self.keep: dict = {}
        self.live = False
        self.confirmed: set[str] = set()
        self._renders: dict[tuple[str, str], bytes] = {}
        self._raster: dict[str, dict] = {}
        self.db = db_path  # landsight.db: runs, checks and Meta calls are written there; prices come from there
        self.package_id: int | None = None

    def _conn(self):
        from landsight.store import connect

        return connect(self.db)

    @property
    def opened(self) -> bool:
        return self.base is not None

    # ------------------------------------------------------------------------------------------ open
    def open(self, path: str | None = None, live: bool = False, package_id: int | None = None,
             fresh: int = 0) -> dict:
        """Review a folder (or a registered package) and serve its Run. With a database the run, its checks and every
        Meta call are written there and the firm's price list is read from there. `fresh` (live only) re-asks that
        many recorded calls (landsight.review.spark, D-61)."""
        if live and not os.environ.get("MODEL_API_KEY"):
            raise ValueError("live mode needs MODEL_API_KEY")
        keep: dict = {}
        if package_id is not None:
            if self.db is None:
                raise ValueError("no database")
            from landsight.store import service

            conn = self._conn()
            try:
                self.base = service.review_package(conn, package_id, live=live, keep=keep, fresh=fresh,
                                                   review_fn=_review)
            finally:
                conn.close()
        else:
            if path:
                folder = Path(path).expanduser().resolve()
                if not folder.is_dir():
                    raise ValueError(f"not a folder: {path}")
            else:
                folder = SAMPLE if SAMPLE.is_dir() else self._sample_cache()
            if self.db is not None:
                from landsight.store import service

                conn = self._conn()
                try:
                    package_id = service.package_for_folder(conn, folder)["package_id"]
                    self.base = service.review_package(conn, package_id, live=live, keep=keep, fresh=fresh,
                                                       review_fn=_review)
                finally:
                    conn.close()
            else:
                self.base = review(folder, mode="live" if live else "fixtures", keep=keep)
        self.package_id = package_id
        self.keep, self.live, self.confirmed, self._renders = keep, live, set(), {}
        self._raster = {}
        for r in keep.get("rasters", []):
            sid = f"{r['file_id']}-p{r['page'] + 1}"
            self._raster[sid] = r | {"coloured": _saturated_share(r["png"]) > COLOURED_SHARE}
        return self.run()

    @staticmethod
    def _sample_cache() -> Path:
        if not SAMPLE_CACHE.is_dir():
            from landsight.synth.package import write_package

            write_package(SAMPLE_CACHE)
        return SAMPLE_CACHE

    # ------------------------------------------------------------------------------------------ lookups
    def _draft(self, sheet_id: str):
        return next((d for d in self.keep.get("drafts", []) if d.sheet_id == sheet_id), None)

    def _takeoff_ref(self, item: dict) -> str | None:
        sp = item.get("spark") or {}
        if sp.get("sheet_id") and (sp.get("answer") or {}).get("id"):
            return f"{sp['sheet_id']}/{sp['answer']['id']}"
        return None

    def render(self, sheet_id: str, kind: str) -> bytes | None:
        if self.base is None or kind not in ("svg", "png", "filled.png"):
            return None
        key = (sheet_id, kind)
        if key in self._renders:
            return self._renders[key]
        data = self._render(sheet_id, kind)
        if data is not None:
            self._renders[key] = data
        return data

    def _render(self, sheet_id: str, kind: str) -> bytes | None:
        d = self._draft(sheet_id)
        if d is not None and d.source == "dxf":
            from landsight.dxf import render_svg

            if kind == "svg":
                return render_svg(d.model, paper=PAPER).encode()
            if kind == "png":
                return d.png
            return self.keep.get("filled", {}).get(sheet_id)
        if d is not None and d.source == "pdf_vector":
            if kind == "png":
                return d.png
            if kind == "svg":
                import pymupdf

                f = next(r for r in self.keep["ctx"].files if r.file_id == d.file_id)
                with pymupdf.open(f.abs_path) as doc:
                    return doc[d.page].get_svg_image(text_as_path=False).encode()
            return None
        r = self._raster.get(sheet_id)
        if r is not None:
            from PIL import Image

            im = Image.open(io.BytesIO(r["png"]))
            if kind == "filled.png" and r["coloured"]:
                return r["png"]
            if kind == "png":  # a grey scan is served as a grey PNG (half the bytes, the same pixels)
                if r["coloured"]:
                    return r["png"]
                buf = io.BytesIO()
                im.convert("L").save(buf, format="PNG", optimize=True)
                return buf.getvalue()
            if kind == "svg":  # the page as an image inside an SVG (JPEG inside: a scan has no line work to keep)
                w, h = im.size
                buf = io.BytesIO()
                im.convert("RGB").save(buf, format="JPEG", quality=82)
                b64 = base64.b64encode(buf.getvalue()).decode()
                return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
                        f'<image width="{w}" height="{h}" href="data:image/jpeg;base64,{b64}"/></svg>').encode()
        return None

    def crop(self, item_id: str) -> bytes | None:
        tk = self.keep.get("takeoff")
        item = next((i for i in (self.base or {}).get("items", []) if i["item_id"] == item_id), None)
        ref = self._takeoff_ref(item) if item else None
        return tk.crops.get(ref) if tk is not None and ref else None

    # ------------------------------------------------------------------------------------------ the Run
    def run(self) -> dict:
        run = copy.deepcopy(self.base)
        root = Path(run["package"]["folder"])
        if root.is_relative_to(REPO):
            run["package"]["folder"] = str(root.relative_to(REPO))
        for s in run["sheets"]:
            if (s["sheet_id"], "filled.png") in self._renders or s["sheet_id"] in self.keep.get("filled", {}):
                s["filled_png_url"] = f"/api/sheets/{s['sheet_id']}.filled.png"
        run["sheets"] += self._raster_sheets(run["files"])
        for it in run["items"]:
            self._spark_view(it)
            if it["item_id"] in self.confirmed:
                it.update(agreed=True, confirmed=True, quote_count=it["proposed_count"])
        from landsight.review.pending import apply_confirmed

        apply_confirmed(run, self.confirmed)  # the greening, E02 and the rest count T-08 once it is confirmed
        for c in run["checks"]:
            done = [i for i in c.get("item_ids", []) if i in self.confirmed]
            if done and c["category"] == "quantity" and "open outline" in c["title"] and c["severity"] != "info":
                c["severity"] = "info"
                c["title"] += " — confirmed"
                c["why"] = c["why"].replace("It is counted only after a person confirms.", "A person confirmed it.")
                c["confirmed"] = True
        run["tally"] = self._tally(run["items"])
        run["timing"]["total_s"] = self.base["timing"]["total_s"]
        if self.db is not None:  # notes, flags and confirmations a person (or an answer) left on this run
            from landsight.store import service

            conn = self._conn()
            try:
                stored = conn.execute("SELECT 1 FROM runs WHERE id = ?", (run["run_id"],)).fetchone()
                rows = service.confirmations(conn, run["run_id"]) if stored else []
                verdicts = service.decisions(conn, run["run_id"]) if stored else {}
            finally:
                conn.close()
            if rows:
                run = service.apply_confirmations(run, rows)
            service.apply_decisions(run, verdicts)  # each check's decision: confirm, dismiss or open
            run["package_id"] = self.package_id
        return tag_urls(deep(run), run["run_id"])

    def _raster_sheets(self, files: list[dict]) -> list[dict]:
        out = []
        for sid, r in self._raster.items():
            a = r.get("answer") or {}
            tb = a.get("title_block") or {}
            w, h = _png_size(r["png"])
            kind = a.get("kind") if a.get("kind") in ("plan", "elevation", "detail", "schedule", "legend", "cover",
                                                     "background") else "plan"
            name = Path(r["path"]).stem
            s = {"sheet_id": sid, "file_id": r["file_id"], "title": tb.get("title") or name,
                 "number": tb.get("number") or name, "kind": kind,
                 "kind_confidence": round(float(a.get("confidence") or 0.0), 2), "kind_by": "spark" if a else "rule",
                 "kind_why": a.get("why") or "no Muse Spark read of this page", "revision": tb.get("revision") or None,
                 "date": tb.get("date") or None, "scale_title": tb.get("scale") or None, "scale_measured": None,
                 "counted": False, "not_counted_reason": RASTER_REASON,
                 "svg_url": f"/api/sheets/{sid}.svg", "png_url": f"/api/sheets/{sid}.png",
                 "bounds": {"min_x": 0.0, "min_y": 0.0, "max_x": float(w), "max_y": float(h)}, "objects": [],
                 "source": "pdf_raster", "page": r["page"] + 1, "title_by": "spark" if tb else "none",
                 "units": "px"}
            if r["coloured"]:
                s["filled_png_url"] = f"/api/sheets/{sid}.filled.png"
            for it in (self.base or {}).get("items", []):  # SAM 3.1's masks on this page, in pixels
                sam = it.get("sam") or {}
                if sam.get("raster_sheet_id") != sid:
                    continue
                for n, m in enumerate(sam.get("masks") or [], 1):
                    l, t, rr, b = m["box_px"]
                    s["objects"].append({"object_id": f"{it['item_id']}-M{n:02d}", "kind": it["kind"],
                                         "label": f"{it['label']} (SAM 3.1 mask)", "item_id": it["item_id"],
                                         "centre": [(l + rr) / 2, (t + b) / 2], "area_m2": m["area_m2"],
                                         "outline": [[l, t], [rr, t], [rr, b], [l, b]], "closed": True, "by": "sam"})
            out.append(s)
            f = next((f for f in files if f["file_id"] == r["file_id"]), None)
            if f is not None:
                f.setdefault("sheet_ids", []).append(sid)
                f.setdefault("sheet_id", sid)
        return out

    def _spark_view(self, it: dict) -> None:
        """Muse Spark's view of an open outline, as the screen draws it: the crop window, its pixel size and the
        grounding points in crop pixels and drawing metres, each with its distance to the nearest red segment."""
        sp = it.get("spark")
        tk = self.keep.get("takeoff")
        ref = self._takeoff_ref(it)
        if not sp or tk is None or ref is None:
            return
        from landsight.meta.spark import ground_points

        req = tk.requests.get(ref, {})
        sp |= {"crop_px": req.get("crop_px"), "crop_window_m": req.get("window"),
               "recorded": not self.live}
        raw = (sp.get("answer") or {}).get("points")
        if not raw or not req.get("window") or not req.get("crop_px"):
            sp |= {"points": None, "points_status": "none_returned",
                   "points_note": "Muse Spark returned no grounding points for this candidate"}
            return
        pts = ground_points(raw, req["crop_px"], req["window"])
        sheet_name, gid = ref.split("/", 1)
        sg = next((g for g in tk.sheets if g.sheet == sheet_name), None)
        cand = next((c for c in sg.closed.candidates if c.id == gid), None) if sg else None
        for p in pts:
            p["to_segment_m"] = round(min(ln.distance(Point(p["m"])) for ln in cand.lines), 3) if cand else None
        dists = [p["to_segment_m"] for p in pts if p["to_segment_m"] is not None]
        on = sum(1 for d in dists if d <= ON_SEGMENT_M)
        worst = max(dists, default=None)
        sp |= {"points": pts, "points_status": "returned", "points_on_segments": on,
               "points_max_to_segment_m": worst,
               "points_note": f"Muse Spark placed {len(pts)} points; {on} lie within {ON_SEGMENT_M} m of a red segment"
                              + (f", the farthest {worst:.2f} m" if worst is not None else "")}

    @staticmethod
    def _tally(items: list[dict]) -> list[dict]:
        """The corner tally: 'drawn' is what geometry closed until a person confirms the rest."""
        rows = []
        for it in items:
            if it["kind"] not in ("tree", "hedge", "shrub_bed", "lawn") or it.get("source") == "sam":
                continue
            drawn = it["quote_count"] if it.get("confirmed") else it["geometry_count"]
            rows.append({"label": it["label"], "species_code": it["species_code"], "drawn": drawn,
                         "spark": it["spark_count"], "schedule": it["schedule_count"], "unit": it["unit"],
                         "status": "confirmed" if it.get("confirmed") else ("agreed" if it["agreed"] else "flagged"),
                         "item_id": it["item_id"], "by": "spark" if it["spark_count"] is not None else "geometry"})
        return rows

    # ------------------------------------------------------------------------------------------ actions
    def confirm(self, item_id: str) -> dict:
        item = next((i for i in (self.base or {}).get("items", []) if i["item_id"] == item_id), None)
        if item is None:
            raise KeyError(item_id)
        if not item["agreed"] and item.get("proposed_count") is not None:
            self.confirmed.add(item_id)
        self._record_confirmation(item_id)
        out = next(i for i in self.run()["items"] if i["item_id"] == item_id)
        if item["agreed"]:  # every source already agreed: nothing to confirm, and the answer says so
            out |= {"confirmed": True, "note": "already agreed"}
        return out

    def _record_confirmation(self, item_id: str, source: str = "screen") -> None:
        if self.db is None or self.base is None:
            return
        from landsight.store import service

        conn = self._conn()
        try:
            run_id = self.base["run_id"]
            if conn.execute("SELECT 1 FROM runs WHERE id = ?", (run_id,)).fetchone():
                done = conn.execute("SELECT 1 FROM confirmations WHERE run_id = ? AND kind = 'confirm_element' AND "
                                    "target_id = ?", (run_id, item_id)).fetchone()
                if not done:
                    item = next(i for i in self.base["items"] if i["item_id"] == item_id)
                    service.add_confirmation(conn, run_id, "confirm_element", item_id, item.get("proposed_count"),
                                             "confirmed on the screen", source)
        finally:
            conn.close()

    def rules(self) -> list[dict]:
        return [c for c in self.run()["checks"] if c["category"] == "regulation"]

    def director(self) -> list[dict]:
        return deep(scenes(self.run()))


# ---------------------------------------------------------------------------------------------- the director


def _bare(ref: str) -> str:
    return ref.split("/", 1)[1] if "/" in ref else ref


def scenes(run: dict) -> list[dict]:
    """The film's scenes (demo/SCRIPT.md v4), each a pointer into this Run: ids that exist in it, nothing typed."""
    items, checks, sheets, files = run["items"], run["checks"], run["sheets"], run["files"]
    if not sheets:  # a folder with no drawing at all: the drop is the whole film (no sheet to point at)
        top = [f["file_id"] for f in files if not f.get("parent")]
        return [{"id": "drop", "title": "The package lands", "focus": top, "file_count": len(top),
                 "check_ids": [c["check_id"] for c in checks if c["category"] in ("ingest", "sheet")], "item_ids": [],
                 "duration_s": 19}]
    by_id = {s["sheet_id"]: s for s in sheets}
    cid = lambda pred: [c["check_id"] for c in checks if pred(c)]  # noqa: E731
    on = lambda c, sid: sid in c["evidence"].get("sheet_ids", [])  # noqa: E731
    plan = next((s for s in sheets if s["counted"] and s.get("source") == "dxf"
                 and any(o["kind"] == "tree" and not o.get("excluded") for o in s["objects"])), sheets[0])
    pid = plan["sheet_id"]
    flagged = next((i for i in items if i.get("spark") and i["kind"] == "tree"), None)
    hedge = next((i for i in items if i["kind"] == "hedge"), None)
    trees = next((i for i in items if i["kind"] == "tree"), None)
    paving = next((s for s in sheets if s["counted"] and any(o["kind"] == "paving" for o in s["objects"])), None)
    elevation = next((s for s in sheets if s["kind"] == "elevation" and s.get("source") == "dxf"), None)
    enlarged = next((c for c in checks if c["category"] == "scale" and c["severity"] != "info"), None)
    detail = next((s for s in sheets if s.get("detail")), None)
    out = []

    top = [f["file_id"] for f in files if not f.get("parent")]
    out.append({"id": "drop", "title": "The package lands", "focus": top, "file_count": len(top),
                "check_ids": cid(lambda c: c["category"] == "ingest")
                + cid(lambda c: c["category"] == "sheet" and c["severity"] != "info")
                + cid(lambda c: c["category"] == "revision" and "bill" in c["by"]),
                "item_ids": [], "duration_s": 19})

    wake_objs = [o["object_id"] for o in plan["objects"] if not o.get("excluded")
                 and o["kind"] in ("tree", "hedge", "shrub_bed", "lawn", "paving", "planter_edge")]
    open_check = cid(lambda c: c["category"] == "quantity" and "open outline" in c["title"])
    out.append({"id": "wake", "title": "The drawing wakes up", "sheet_id": pid, "focus": wake_objs,
                "check_ids": open_check + cid(lambda c: c["category"] == "quantity" and c["title"].startswith("Schedule says")),
                "item_ids": [i["item_id"] for i in items if pid in i["sheet_ids"]], "duration_s": 22})

    if flagged:
        sp = flagged["spark"]
        eye_sheet = sp.get("sheet_id") or pid
        out.append({"id": "eye", "title": "The eye", "sheet_id": eye_sheet, "focus": [sp["object_id"]],
                    "check_ids": cid(lambda c: flagged["item_id"] in c.get("item_ids", []) and "open outline" in c["title"]),
                    "item_ids": [flagged["item_id"]], "duration_s": 20})
    if hedge:
        hsheet = hedge["sheet_ids"][0] if hedge["sheet_ids"] else pid
        out.append({"id": "hedge", "title": "Hedge math", "sheet_id": hsheet, "focus": hedge["object_ids"],
                    "check_ids": cid(lambda c: c["category"] == "quantity" and hedge["item_id"] in c.get("item_ids", [])
                                     and "rows" in c["title"])
                    + cid(lambda c: c["category"] == "sheet" and "legend" in c["title"] and on(c, hsheet)),
                    "item_ids": [hedge["item_id"]], "duration_s": 14})

    colour_checks = [c for c in checks if c["category"] == "area" and c.get("prompt_source")]
    if colour_checks:
        controls = [c for c in colour_checks if c.get("control")]
        first = next((c for c in controls if paving and on(c, paving["sheet_id"])), controls[0] if controls else None)
        csheet = first["evidence"]["sheet_ids"][0] if first else colour_checks[0]["evidence"]["sheet_ids"][0]
        order = sorted({s for c in colour_checks for s in c["evidence"].get("sheet_ids", [])}, key=lambda s: s != csheet)
        out.append({"id": "colour", "title": "Lines to colour", "sheet_id": csheet, "sheet_ids": order,
                    "focus": [_bare(o) for c in colour_checks if on(c, csheet) for o in c["evidence"].get("object_ids", [])],
                    "check_ids": [c["check_id"] for s in order for c in colour_checks if on(c, s)],
                    "control_check_id": first["check_id"] if first else None,
                    "item_ids": sorted({i for c in colour_checks for i in c.get("item_ids", [])}), "duration_s": 20})

    greening = next((c for c in checks if c["category"] == "regulation" and c.get("numbers", {}).get("required") is not None
                     and "before_downgrade" in c), None)
    if greening:
        pit = cid(lambda c: c["category"] == "regulation" and "pit" in c["title"].lower() and c is not greening)
        swap = next((f for f in (greening.get("after_downgrade") or greening).get("fixes", []) if f.get("id") == "b"), {})
        out.append({"id": "gauge", "title": "The gauge, twice", "sheet_id": pid,
                    "sheet_ids": [pid] + ([detail["sheet_id"]] if detail else []),
                    "focus": swap.get("object_ids", []), "check_ids": [greening["check_id"]] + pit,
                    "item_ids": [trees["item_id"]] if trees else [], "duration_s": 22})

    amber = []
    for pred in (lambda c: c["category"] == "quantity" and trees and c.get("numbers", {}).get("item_id") == trees["item_id"]
                 and c["severity"] != "info",
                 lambda c: c["category"] == "units",
                 lambda c: c["category"] == "price" and c["severity"] != "info"
                 and c.get("numbers", {}).get("bill_price", 0) > c.get("numbers", {}).get("list_high", 1e18)):
        hit = next((c["check_id"] for c in checks if "bill" in c["by"] and pred(c) and c["check_id"] not in amber), None)
        if hit:
            amber.append(hit)
    tail = cid(lambda c: c["category"] == "bill" and c["severity"] == "flag") + cid(lambda c: c["category"] == "arithmetic")
    rows = cid(lambda c: "row" in c.get("numbers", {}) and c["check_id"] not in amber + tail)
    out.append({"id": "bill", "title": "The bill, traced", "sheet_id": pid,
                "focus": [o for o in (trees["object_ids"] if trees else [])],
                "check_ids": amber + tail + rows, "amber_check_ids": amber,
                "item_ids": [i["item_id"] for i in (trees, hedge) if i], "duration_s": 24})

    call_sheets = [s["sheet_id"] for s in (elevation, plan) if s] + (enlarged["evidence"]["sheet_ids"] if enlarged else [])
    out.append({"id": "callback", "title": "Twelve, again", "sheet_id": (elevation or plan)["sheet_id"],
                "sheet_ids": call_sheets,
                "focus": ([o["object_id"] for o in elevation["objects"] if o["kind"] == "tree"] if elevation else [])
                + (trees["object_ids"] if trees else []),
                "check_ids": (cid(lambda c: c["category"] == "sheet" and elevation and on(c, elevation["sheet_id"])
                                  and "not counted" in c["title"]))
                + ([enlarged["check_id"]] if enlarged else [])
                + cid(lambda c: c["category"] == "quantity" and c["title"].startswith("Schedule says")
                      and trees and trees["item_id"] in c.get("item_ids", [])),
                "item_ids": [trees["item_id"]] if trees else [], "duration_s": 16})
    for s in out:
        s["check_ids"] = [x for x in dict.fromkeys(s["check_ids"]) if x]
    return out
