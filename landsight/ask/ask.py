"""One question, one Muse Spark call: the top chunks of the package (landsight.ask.retrieve) and, when a drawing or a
raster page is among the best of them, its page render, sent with a JSON schema that asks for the answer, the
citations (file_id, page, a verbatim quote), proposed actions and a confidence. The call goes through the review's
recorder (tests/fixtures/ask/), keyed on the question and the exact prompt, so an answer is asked once and replayed.

Every citation is checked against the chunk it names: `verified` is true when the quote is in that source's text.
Actions are applied by `apply_action`: a confirmed element, a confirmed price (the firm's list in landsight.db), a
regulation note or a flag, each written to the confirmations table of the run."""

from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path

from landsight.ask.corpus import Chunk
from landsight.ask.retrieve import retrieve

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "ask"
ACTION_KINDS = ["confirm_element", "confirm_price", "regulation_note", "flag"]
MAX_IMAGES = 2
IMAGE_MAX_PX = 1600

PROMPT = (
    "A landscape design firm's owner is reviewing a developer's package before pricing the job and asks the question "
    "below. Answer from the numbered sources only: extracts of the package's own PDFs, its bill rows, its drawings' "
    "title blocks and sheet text, the regulation table, the firm's own price list and the checks the firm's review "
    "tool already ran; page images, when attached, are renders of the sources marked [image attached], in the order "
    "listed.\n"
    "- answer: English, one to four sentences, numbers exactly as the sources write them; say plainly when the "
    "sources do not settle the question, and what is missing.\n"
    "- citations: one per fact you used: file_id and page exactly as in that source's header, and quote, a short "
    "passage copied verbatim from that source's text (at most 30 words, no ellipsis).\n"
    "- proposed_actions: only what the answer supports; an empty list is fine. kind confirm_element (target_id an "
    "item id such as I-01; value the quantity to confirm), confirm_price (target_id a price-list code such as CC; "
    "value the installed range as low-high in NT$), regulation_note (target_id a check id such as E12, or a regulation "
    "id; value the note to attach), flag (target_id a check id, item id or file id; value what to raise with the "
    "developer). why: one sentence.\n"
    "- confidence from 0 to 1.\n\n"
    "Question: {question}\n\nSources:\n{sources}"
)
SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "citations": {"type": "array", "items": {"type": "object", "properties": {
            "file_id": {"type": "string"}, "page": {"type": "integer"}, "quote": {"type": "string"}},
            "required": ["file_id", "page", "quote"], "additionalProperties": False}},
        "proposed_actions": {"type": "array", "items": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": ACTION_KINDS}, "target_id": {"type": "string"},
            "value": {"type": "string"}, "why": {"type": "string"}},
            "required": ["kind", "target_id", "value", "why"], "additionalProperties": False}},
        "confidence": {"type": "number"},
    },
    "required": ["answer", "citations", "proposed_actions", "confidence"],
    "additionalProperties": False,
}


def _norm(s: str) -> str:
    s = (s or "").lower().replace("’", "'").replace("–", "-").replace("—", "-").replace("×", "x")
    return re.sub(r"[\s|]+", " ", re.sub(r"[\"“”]", "", s)).strip(" .")


def _image(ch: Chunk) -> bytes | None:
    from PIL import Image

    r = ch.render or {}
    try:
        if r.get("dxf"):
            from landsight.dxf import load, render_png

            png = render_png(load(Path(r["dxf"])))
        elif r.get("pdf"):
            from landsight.ingest.pdf import render

            png = render(Path(r["pdf"]), int(r.get("page", 0)), dpi=110)
        else:
            return None
    except Exception:  # noqa: BLE001 - a page that will not render is simply not shown
        return None
    im = Image.open(io.BytesIO(png))
    if max(im.size) > IMAGE_MAX_PX:
        im.thumbnail((IMAGE_MAX_PX, IMAGE_MAX_PX))
        buf = io.BytesIO()
        im.convert("RGB").save(buf, format="PNG", optimize=True)
        png = buf.getvalue()
    return png


LANGS = ("en", "zh-TW")
ANSWER_EN = "- answer: English, one to four sentences"
ANSWER_ZH = ("- answer: Traditional Chinese as written in national (繁體中文), one to four sentences; ids, file names and "
             "quoted drawing text stay as written")


def build_prompt(question: str, top: list[tuple[float, Chunk]], lang: str = "en") -> tuple[str, list[Chunk], list[Chunk]]:
    """(prompt, the chunks in order, the chunks whose page image is attached). `lang` "zh-TW" asks for the answer in
    Traditional Chinese (national); the citations' quotes stay verbatim."""
    chunks = [c for _, c in top]
    shown: list[Chunk] = []
    seen_renders = set()
    for c in chunks[:6]:
        if c.render and c.kind in ("sheet", "pdf_raster", "pdf_drawing") and len(shown) < MAX_IMAGES:
            key = (c.render.get("dxf") or c.render.get("pdf"), c.render.get("page"))
            if key in seen_renders:
                continue
            seen_renders.add(key)
            shown.append(c)
    for c in chunks:
        c.extra["image"] = c in shown
    sources = "\n\n".join(f"{c.header(i)}\n{c.text}" for i, c in enumerate(chunks, 1))
    prompt = PROMPT if lang == "en" else PROMPT.replace(ANSWER_EN, ANSWER_ZH)
    return prompt.replace("{question}", question.strip()).replace("{sources}", sources), chunks, shown


def ask(question: str, corpus: list[Chunk], spark, k: int = 14, lang: str = "en") -> dict:
    """Ask the package. `spark` is a landsight.review.spark.ReviewSpark (fixtures or live) whose log records the call.
    `lang`: "en" (the default; its recordings keep their keys) or "zh-TW" (the answer in Traditional Chinese, recorded
    under its own key)."""
    question = (question or "").strip()
    if not question:
        raise ValueError("ask a question")
    if lang not in LANGS:
        raise ValueError(f"lang must be one of {', '.join(LANGS)}")
    top = retrieve(question, corpus, k=k)
    prompt, chunks, shown = build_prompt(question, top, lang)
    images = [img for img in (_image(c) for c in shown) if img]
    key = "ask:" + hashlib.sha256(question.encode()).hexdigest()[:16] + ("" if lang == "en" else f"|lang={lang}")
    result = spark._custom("ask_package", key, prompt, images, SCHEMA)
    by_file: dict[str, list[Chunk]] = {}
    for c in chunks:
        by_file.setdefault(c.file_id, []).append(c)
    cites = []
    for cit in result.get("citations") or []:
        cands = [c for c in by_file.get(cit.get("file_id", ""), []) if not cit.get("page") or c.page == cit.get("page")] \
            or by_file.get(cit.get("file_id", ""), [])
        q = _norm(cit.get("quote", ""))
        hit = next((c for c in cands if q and q in _norm(c.text)), None)
        src = hit or (cands[0] if cands else None)
        cites.append(cit | {"verified": hit is not None, "source": src.source if src else None,
                            "chunk_id": src.chunk_id if src else None})
    entry = spark.log[-1] if spark.log else {}
    return {"question": question, "answer": result.get("answer", ""), "citations": cites,
            "proposed_actions": result.get("proposed_actions") or [], "confidence": result.get("confidence"),
            "sources": [{"n": i, "chunk_id": c.chunk_id, "file_id": c.file_id, "page": c.page, "source": c.source,
                         "kind": c.kind, "score": s, "image": c.extra.get("image", False)}
                        for i, (s, c) in enumerate(top, 1)],
            "images": [c.chunk_id for c in shown],
            "call": {"model": entry.get("model"), "seconds": entry.get("seconds"), "recorded": entry.get("recorded"),
                     "fixture": entry.get("fixture"), "usage": entry.get("usage")}}


def _range(value) -> tuple[float, float]:
    nums = [float(x.replace(",", "")) for x in re.findall(r"\d[\d,]*(?:\.\d+)?", str(value or ""))]
    if not nums:
        raise ValueError(f"no price in {value!r}: give low-high in NT$")
    return (min(nums[:2]), max(nums[:2])) if len(nums) >= 2 else (nums[0], nums[0])


def apply_action(conn, run_id: str, action: dict, source: str = "ask") -> dict:
    """Write one proposed action to landsight.db: a confirmation row always; for confirm_price also the firm's price
    row (the next review prices against it). Returns {confirmation, price_row?}."""
    from landsight.store import service

    kind, target = action.get("kind"), str(action.get("target_id") or "").strip()
    if kind not in ACTION_KINDS:
        raise ValueError(f"unknown action kind {kind!r}: one of {', '.join(ACTION_KINDS)}")
    if not target:
        raise ValueError("the action needs a target_id")
    run = service.get_run(conn, run_id)
    out = {}
    value = action.get("value")
    if kind == "confirm_element":
        if target not in {i["item_id"] for i in run["items"]}:
            raise KeyError(f"no item {target} in run {run_id}")
    elif kind == "confirm_price":
        if not conn.execute("SELECT 1 FROM price_list WHERE code = ?", (target,)).fetchone():
            raise KeyError(f"no price-list code {target}")
        lo, hi = _range(value)
        out["price_row"] = service.update_price(conn, target, {"low": lo, "high": hi})
        value = {"low": lo, "high": hi}
    elif kind == "regulation_note":
        known = {c["check_id"] for c in run["checks"]} | {r[0] for r in conn.execute("SELECT id FROM rules")}
        if target not in known:
            raise KeyError(f"no check or regulation {target}")
    out["confirmation"] = service.add_confirmation(conn, run_id, kind, target, value, action.get("why") or "", source)
    return out
