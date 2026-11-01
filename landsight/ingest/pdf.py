"""Open a PDF with pymupdf and say what each page is: a vector drawing (many paths), a raster drawing (an image and no
text), or text (words and only a few lines, such as table rules). Pages are rendered to PNG for Muse Spark."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pymupdf

VECTOR_MIN_PATHS = 20  # a drawing page has hundreds of paths; a text page's table has a handful
TEXT_MIN_WORDS = 30


@dataclass
class Page:
    index: int  # 0-based
    kind: str  # vector | raster | text | empty
    words: int
    paths: int
    images: int
    text: str
    width_pt: float
    height_pt: float


def pages(path: Path) -> list[Page]:
    out = []
    with pymupdf.open(path) as doc:
        for i, p in enumerate(doc):
            text = p.get_text()
            words, paths, images = len(text.split()), len(p.get_drawings()), len(p.get_images())
            if paths >= VECTOR_MIN_PATHS:
                kind = "vector"
            elif images and words < 5:
                kind = "raster"
            elif words >= TEXT_MIN_WORDS:
                kind = "text"
            elif images:
                kind = "raster"
            else:
                kind = "empty"
            out.append(Page(i, kind, words, paths, images, text, round(p.rect.width, 1), round(p.rect.height, 1)))
    return out


def render(path: Path, index: int, dpi: int = 150) -> bytes:
    with pymupdf.open(path) as doc:
        return doc[index].get_pixmap(dpi=dpi).tobytes("png")


def summary(pgs: list[Page]) -> str:
    kinds = [p.kind for p in pgs]
    if all(k == "vector" for k in kinds):
        return f"{len(pgs)} vector page{'s' if len(pgs) > 1 else ''}"
    if all(k == "raster" for k in kinds):
        return f"{len(pgs)} image-only page{'s' if len(pgs) > 1 else ''}, no vectors, no text"
    if all(k == "text" for k in kinds):
        return f"{len(pgs)} text page{'s' if len(pgs) > 1 else ''} ({sum(p.words for p in pgs)} words)"
    return ", ".join(f"p{p.index + 1} {p.kind}" for p in pgs)


def image_hash(path: Path, index: int) -> str:
    """sha256 of a page's embedded image streams (stable across renderers), or of its render when it has none."""
    import hashlib

    h = hashlib.sha256()
    with pymupdf.open(path) as doc:
        page = doc[index]
        imgs = page.get_images(full=True)
        for img in imgs:
            h.update(doc.extract_image(img[0])["image"])
        if not imgs:
            h.update(page.get_pixmap(dpi=72).tobytes("png"))
    return h.hexdigest()
