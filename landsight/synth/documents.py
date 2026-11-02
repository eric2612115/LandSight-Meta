"""Everything in the package that is not a DXF or a bill: the drawing PDFs (vector full set, grey scan, colour
presentation plan), short text PDFs (design review, specs, quote, green-building checklist), the pasted material
images, the slide deck and the metal subcontractor's zip. All content is generated and English; every text document
says in its footer that it is a synthetic sample.
"""

from __future__ import annotations

import datetime as dt
import io
import re
import textwrap
import zipfile
from contextlib import contextmanager
from pathlib import Path

import matplotlib
import numpy as np
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.lines import Line2D
from PIL import Image, ImageDraw, ImageFilter

import landsight.dxf.render as render
from landsight.dxf import Model, render_png

A4 = (8.27, 11.69)
FOOTER = "Sample document: synthetic, generated for the Landsight demo package. Not a real project record."
PDF_META = {"Creator": "landsight.synth", "Author": "Landsight (synthetic sample)", "CreationDate": None}
_CJK = re.compile(r"[⺀-鿿豈-﫿＀-￯　-〿가-힯]")


# --------------------------------------------------------------------------------------------- drawing PDFs


class _KeepFigures:
    """Stands in for pyplot inside landsight.dxf.render while we render: everything is forwarded to pyplot except
    close(), which keeps the figure so it can also be saved as a vector PDF page."""

    def __init__(self, pyplot):
        self._plt = pyplot
        self.figures = []

    def __getattr__(self, name):
        return getattr(self._plt, name)

    def close(self, fig=None):
        self.figures.append(fig)


@contextmanager
def _kept_figures():
    keeper = _KeepFigures(render.plt)
    render.plt = keeper
    try:
        yield keeper.figures
    finally:
        render.plt = keeper._plt


def vector_pdf(models: list[Model], path: Path, title: str) -> Path:
    """One vector page per sheet, drawn by render_png itself (render_png has no PDF output, so its figure is kept and
    saved to the PDF instead of being redrawn here). Text is embedded as TrueType so a PDF reader can extract it."""
    with matplotlib.rc_context({"pdf.fonttype": 42}), PdfPages(path, metadata=PDF_META | {"Title": title}) as pdf:
        for model in models:
            with _kept_figures() as figures:
                render_png(model, dpi=72)
            fig = figures[0]
            pdf.savefig(fig)
            render.plt.close(fig)
    return path


def _image_pdf(img: Image.Image, path: Path, title: str, dpi: int) -> Path:
    when = dt.datetime(2026, 9, 18, 9, 0, 0).timetuple()  # PIL writes struct_time as a PDF date
    img.save(path, "PDF", resolution=dpi, title=title, author="Landsight (synthetic sample)", creationDate=when,
             modDate=when)
    return path


def scan_pdf(model: Model, path: Path, seed: int = 0, dpi: int = 150) -> Path:
    """A grey scan of the plot: rotated 1.5 degrees, slightly blurred, with sensor noise. Image only, no text layer."""
    img = Image.open(io.BytesIO(render_png(model, dpi=dpi))).convert("L")
    img = img.rotate(1.5, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=255)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    a = np.asarray(img, dtype=np.float32)
    rng = np.random.default_rng(seed)
    a = 18 + 0.88 * a + rng.normal(0, 7, a.shape)  # paper grey, toner never quite black
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "L")
    return _image_pdf(img, path, "L-1 Planting Plan (scan)", dpi)


def presentation_pdf(model: Model, path: Path, dpi: int = 150) -> Path:
    """The coloured presentation plan (render_png filled=True) as an image page, as such plans usually come."""
    img = Image.open(io.BytesIO(render_png(model, filled=True, dpi=dpi))).convert("RGB")
    return _image_pdf(img, path, "Presentation Plan (Colour)", dpi)


# --------------------------------------------------------------------------------------------- text PDFs


def text_pdf(path: Path, title: str, subtitle: str, blocks: list[tuple]) -> Path:
    """A short A4 document. blocks: ("h", text) heading, ("p", text) paragraph, ("li", text) list item,
    ("table", [header, *rows], [column widths as fractions])."""
    with matplotlib.rc_context({"pdf.fonttype": 42, "font.family": "DejaVu Sans"}), \
            PdfPages(path, metadata=PDF_META | {"Title": title}) as pdf:
        state = {"fig": None, "y": 0.0, "page": 0}
        left, right, top, bottom = 0.09, 0.91, 0.93, 0.08

        def new_page():
            if state["fig"] is not None:
                _footer(state["fig"], state["page"])
                pdf.savefig(state["fig"])
                render.plt.close(state["fig"])
            state["fig"] = render.plt.figure(figsize=A4)
            state["page"] += 1
            state["y"] = top

        def need(dy):
            if state["fig"] is None or state["y"] - dy < bottom:
                new_page()

        def put(text, size=10, weight="normal", x=left, dy=None, color="black"):
            need(dy or size / 72 / A4[1] * 1.55)
            state["fig"].text(x, state["y"], text, fontsize=size, fontweight=weight, va="top", color=color)
            state["y"] -= dy or size / 72 / A4[1] * 1.55

        put(title, 16, "bold")
        for line in textwrap.wrap(subtitle, 90):
            put(line, 9.5, color="#444444")
        state["y"] -= 0.012
        for block in blocks:
            kind = block[0]
            if kind == "h":
                state["y"] -= 0.008
                put(block[1], 11.5, "bold")
            elif kind == "p":
                for line in textwrap.wrap(block[1], 98):
                    put(line, 10)
                state["y"] -= 0.006
            elif kind == "li":
                lines = textwrap.wrap(block[1], 92)
                for i, line in enumerate(lines):
                    put(("•  " if i == 0 else "   ") + line, 10)
            elif kind == "table":
                rows, widths = block[1], block[2]
                xs = [left]
                for w in widths[:-1]:
                    xs.append(xs[-1] + w * (right - left))
                for r, row in enumerate(rows):
                    # about 88 characters of 9 pt DejaVu Sans fit the text width
                    wrapped = [textwrap.wrap(str(c), max(4, int(w * 88))) or [""] for c, w in zip(row, widths)]
                    n = max(len(c) for c in wrapped)
                    dy = 9 / 72 / A4[1] * 1.5
                    need(dy * n + 0.004)
                    for c, (x, cell) in enumerate(zip(xs, wrapped)):
                        for k, line in enumerate(cell):
                            state["fig"].text(x, state["y"] - k * dy, line, fontsize=9, va="top",
                                              fontweight="bold" if r == 0 else "normal")
                    state["y"] -= dy * n + 0.004
                    if r == 0:
                        state["fig"].add_artist(Line2D([left, right], [state["y"] + 0.002] * 2, lw=0.6, color="black"))
                state["y"] -= 0.01
        _footer(state["fig"], state["page"])
        pdf.savefig(state["fig"])
        render.plt.close(state["fig"])
    return path


def _footer(fig, page: int) -> None:
    fig.text(0.09, 0.04, FOOTER, fontsize=7, color="#777777")
    fig.text(0.91, 0.04, f"page {page}", fontsize=7, color="#777777", ha="right")


# --------------------------------------------------------------------------------------------- images, deck, zip


def texture_png(kind: str, path: Path, seed: int, size: int = 256) -> Path:
    """A small procedural material photo: 'aggregate' (speckle), 'pavers' (running-bond grid) or 'grass_pavers'
    (concrete lattice with grass)."""
    rng = np.random.default_rng(seed)
    if kind == "aggregate":
        base = np.full((size, size, 3), (196, 186, 170), np.float32)
        img = Image.fromarray(base.astype(np.uint8))
        d = ImageDraw.Draw(img)
        for _ in range(2600):
            x, y = rng.uniform(0, size, 2)
            r = rng.uniform(1.0, 4.5)
            tone = rng.choice([(120, 112, 100), (232, 226, 214), (160, 150, 132), (90, 86, 80), (210, 196, 170)])
            d.ellipse([x - r, y - r * rng.uniform(0.6, 1.0), x + r, y + r], fill=tuple(int(t) for t in tone))
        img = img.filter(ImageFilter.GaussianBlur(0.6))
    elif kind == "pavers":
        img = Image.new("RGB", (size, size), (150, 140, 120))
        d = ImageDraw.Draw(img)
        bw, bh = 64, 32
        for j in range(size // bh + 1):
            off = (j % 2) * bw // 2
            for i in range(-1, size // bw + 1):
                g = int(rng.integers(92, 128))
                x0, y0 = i * bw + off, j * bh
                d.rectangle([x0 + 2, y0 + 2, x0 + bw - 2, y0 + bh - 2], fill=(g, g - 4, g - 10))
    elif kind == "grass_pavers":
        img = Image.new("RGB", (size, size), (170, 168, 160))
        d = ImageDraw.Draw(img)
        cell = 42
        for j in range(size // cell + 1):
            for i in range(size // cell + 1):
                x0, y0 = i * cell + 7, j * cell + 7
                g = int(rng.integers(100, 150))
                d.rectangle([x0, y0, x0 + cell - 14, y0 + cell - 14], fill=(60, g, 50))
    else:
        raise ValueError(kind)
    a = np.asarray(img, np.float32) + rng.normal(0, 6, (size, size, 3))
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(path, "PNG", optimize=False)
    return path


def planters_pptx(path: Path) -> Path:
    """A two-slide planter mood board: not a drawing, not part of the works."""
    from pptx import Presentation
    from pptx.util import Inches, Pt

    prs = Presentation()
    s1 = prs.slides.add_slide(prs.slide_layouts[0])
    s1.shapes.title.text = "Planter mood board"
    s1.placeholders[1].text = "Planter ideas for the entrance court · Greenfield Residences · September 2026"
    s2 = prs.slides.add_slide(prs.slide_layouts[5])
    s2.shapes.title.text = "Planter layout and schedule"
    rows = [("Planter", "Size", "Qty", "Planting"), ("P1 rectangular", "1.2 x 0.4 x 0.5 m", "6", "Duranta, 4 per planter"),
            ("P2 round", "Ø 0.8 m, 0.6 m high", "4", "Azalea, 5 per planter")]
    table = s2.shapes.add_table(len(rows), 4, Inches(0.5), Inches(1.6), Inches(9.0), Inches(1.2)).table
    for r, row in enumerate(rows):
        for c, text in enumerate(row):
            table.cell(r, c).text = text
            table.cell(r, c).text_frame.paragraphs[0].font.size = Pt(14)
    for i in range(6):
        s2.shapes.add_shape(1, Inches(0.7 + 1.45 * i), Inches(3.6), Inches(1.2), Inches(0.4))
    for i in range(4):
        s2.shapes.add_shape(9, Inches(1.8 + 1.9 * i), Inches(4.6), Inches(0.8), Inches(0.8))
    box = s2.shapes.add_textbox(Inches(0.5), Inches(5.8), Inches(9.0), Inches(0.8)).text_frame
    box.text = "For information only; not part of the landscape works or the bill of quantities."
    for s in (s1, s2):
        s.notes_slide.notes_text_frame.text = FOOTER
    cp = prs.core_properties
    cp.author, cp.title = "Greenfield Development Co. (sample)", "Planter mood board"
    cp.created = cp.modified = dt.datetime(2026, 9, 1, 9, 0, 0)
    cp.last_modified_by = "sample"
    prs.save(path)
    return scrub_cjk_fonts(path)


def zip_one(path: Path, member: str, data: bytes, date=(2026, 9, 5, 10, 0, 0)) -> Path:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        info = zipfile.ZipInfo(member, date_time=date)
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data)
    return path


def scrub_cjk_fonts(path: Path) -> Path:
    """Office themes list fallback typefaces for East Asian scripts by their native names; the package must contain
    no Chinese characters at all, so those entries are rewritten to an ASCII typeface name. Nothing visible changes
    (every text in our files is Latin)."""
    with zipfile.ZipFile(path) as z:
        items = [(info, z.read(info.filename)) for info in z.infolist()]
    changed = False
    out = []
    for info, data in items:
        if info.filename.endswith(".xml"):
            text = data.decode("utf-8")
            new = re.sub(r'typeface="([^"]*)"',
                         lambda m: 'typeface="Arial"' if _CJK.search(m.group(1)) else m.group(0), text)
            if new != text:
                data, changed = new.encode("utf-8"), True
        out.append((info, data))
    if changed:
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            for info, data in out:
                z.writestr(info, data)
    return path
