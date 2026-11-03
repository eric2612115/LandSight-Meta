"""Renders the sheet textures of animatic v11 from the samples, with the repo's own renderers (what the API serves):
the DXF sheets through landsight.dxf.render.render_png (the coloured plans with filled=True), the PDF pages through
landsight.ingest.pdf.render. Writes demo/film/public/v11/sheets/<id>.png plus sheets.json ({id: [w, h]} in px).
L-1 (Rev B), the tower's floors and the coloured plan stay at 2100 px wide; the sheets that only fill the stack are
halved.

    uv run python demo/film/scripts/stage-v11-sheets.py   (from the repo root)
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
from landsight.dxf.model import load  # noqa: E402
from landsight.dxf.render import render_png  # noqa: E402
from landsight.ingest import pdf as P  # noqa: E402

OUT = REPO / "demo" / "film" / "public" / "v11" / "sheets"
GF = REPO / "samples" / "greenfield" / "Greenfield Residences — Landscape Package" / "Drawings"
TW = next((REPO / "samples" / "tower").glob("*/Drawings/CAD"), None) or next((REPO / "samples" / "tower").rglob("CAD"))
FULL = {"L-1", "L-1-revB", "L-1-revB.filled", "L-101", "L-102", "L-103", "L-104", "F-26-p1"}


def dxf(path: Path, filled: bool = False) -> bytes:
    return render_png(load(path), filled=filled)


def jobs():
    cad = GF / "CAD"
    yield "L-1", lambda: dxf(cad / "L-1 Planting Plan (Rev B).dxf")
    yield "L-1-revB", lambda: dxf(cad / "L-1 Planting Plan (Rev B).dxf")
    yield "L-1-revB.filled", lambda: dxf(cad / "L-1 Planting Plan (Rev B).dxf", filled=True)
    yield "L-1-revA", lambda: dxf(cad / "L-1 Planting Plan.dxf")
    for f in sorted(cad.glob("L-[0-9] *.dxf")):
        sid = f.name.split(" ")[0]
        if sid != "L-1":
            yield sid, (lambda f=f: dxf(f))
    yield "L-3.filled", lambda: dxf(next(cad.glob("L-3 *.dxf")), filled=True)
    for f in sorted(TW.glob("L-*.dxf")):
        yield f.name.split(" ")[0], (lambda f=f: dxf(f))
    pdfs = GF / "PDF"
    yield "F-24-p1", lambda: P.render(pdfs / "L-1 Planting Plan (scan).pdf", 0)
    full = pdfs / "Landscape Drawings (Full Set).pdf"
    for i in range(len(P.pages(full))):
        yield f"F-25-p{i + 1}", (lambda i=i: P.render(full, i))
    yield "F-26-p1", lambda: P.render(pdfs / "Presentation Plan (Colour).pdf", 0)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for sid, make in jobs():
        img = Image.open(io.BytesIO(make())).convert("RGB")
        if sid not in FULL:
            img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
        img.save(OUT / f"{sid}.png", optimize=True)
        sizes[sid] = [img.width, img.height]
        print(sid, img.size)
    (OUT / "sheets.json").write_text(json.dumps(sizes, indent=1) + "\n")


if __name__ == "__main__":
    main()
