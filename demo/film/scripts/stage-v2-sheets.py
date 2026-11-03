"""Stages the sheet textures of the v2 film: the same sheets as v11 (scripts/stage-v11-sheets.py, the repo's own
renderers), with the sheets the camera comes close to rendered sharper (L-1 at 400 dpi, L-6 — the sheet the opening
pushes into — and the tower floors L-102…L-104 at 300 dpi), then printed on paper: white → the film's paper, black →
its ink, with a faint, fixed paper grain. Writes demo/film/public/v2/sheets/<id>.png and sheets.json ({id: [w, h]}),
plus l6-border.json (the drawn border of L-6 as fractions of the image: the push lands on it).

    uv run python demo/film/scripts/stage-v2-sheets.py   (from the repo root)
    uv run python demo/film/scripts/stage-v2-sheets.py --v3   the restyle: crisp white paper, no grain → public/v3/sheets
"""

from __future__ import annotations

import importlib.util
import io
import sys
import json
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("v11", HERE / "stage-v11-sheets.py")
v11 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v11)

V3 = "--v3" in sys.argv
OUT = v11.REPO / "demo" / "film" / "public" / ("v3" if V3 else "v2") / "sheets"
DPI = {"L-1": 400, "L-6": 300, "L-102": 300, "L-103": 300, "L-104": 300, "L-101": 200}
PAPER = np.array([255, 255, 255] if V3 else [247, 245, 240], np.float32)
INK = np.array([29, 32, 38], np.float32)


def grain(h: int, w: int, seed: int) -> np.ndarray:
    """Paper grain: fine noise plus a soft, larger fibre, ±~2%."""
    rng = np.random.default_rng(seed)
    fine = rng.normal(0, 1, (h, w)).astype(np.float32)
    small = rng.normal(0, 1, (max(2, h // 48), max(2, w // 48))).astype(np.float32)
    coarse = np.asarray(Image.fromarray(small).resize((w, h), Image.BICUBIC), np.float32)
    return 0.009 * fine + 0.0045 * coarse


def paper(img: Image.Image, seed: int) -> Image.Image:
    a = np.asarray(img.convert("RGB"), np.float32) / 255.0
    # ink-ness per channel (black → 1, white → 0); coloured fills keep their hue, pulled toward the paper's warmth
    out = PAPER[None, None] * a + INK[None, None] * (1 - a)
    if not V3:
        out *= 1 + grain(a.shape[0], a.shape[1], seed)[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def border(img: Image.Image) -> list[float]:
    """The drawn sheet border: the outermost long dark lines."""
    g = np.asarray(img.convert("L"), np.float32)
    dark = g < 128
    rows = dark.mean(1)
    cols = dark.mean(0)
    ys = np.where(rows > 0.6)[0]
    xs = np.where(cols > 0.6)[0]
    h, w = g.shape
    return [float(xs.min() / w), float(ys.min() / h), float((xs.max() + 1) / w), float((ys.max() + 1) / h)]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    real = v11.dxf
    sizes = {}
    for k, (sid, make) in enumerate(v11.jobs()):
        dpi = DPI.get(sid.split(".")[0] if sid != "L-1" else "L-1")
        if sid == "L-1":
            dpi = DPI["L-1"]
        if dpi:
            v11.dxf = lambda path, filled=False, dpi=dpi: v11.render_png(v11.load(path), filled=filled, dpi=dpi)
        try:
            img = Image.open(io.BytesIO(make())).convert("RGB")
        finally:
            v11.dxf = real
        if not dpi and sid not in v11.FULL:
            img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
        if sid == "L-6":
            b = border(img)
            (OUT.parent / "l6-border.json").write_text(json.dumps({"w": img.width, "h": img.height, "border": b}, indent=1) + "\n")
            print("L-6 border", b)
        out = paper(img, 1000 + k)
        out.save(OUT / f"{sid}.png", optimize=False, compress_level=3)
        sizes[sid] = [out.width, out.height]
        print(sid, out.size)
    (OUT / "sheets.json").write_text(json.dumps(sizes, indent=1) + "\n")


if __name__ == "__main__":
    main()
