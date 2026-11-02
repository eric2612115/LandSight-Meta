"""Render a Model: PNG through matplotlib (for Muse Spark and SAM) and SVG written directly (for the browser).

Text is drawn by us, not by ezdxf's drawing add-on, because that add-on dropped CJK glyphs in the spike. PNG output
is deterministic for a given model and matplotlib build (no timestamp metadata), so image hashes can key fixtures.
"""

from __future__ import annotations

import io

from html import escape
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import PathPatch  # noqa: E402
from matplotlib.path import Path as MplPath  # noqa: E402
from shapely.geometry import Polygon  # noqa: E402

from landsight.dxf.model import Model  # noqa: E402

plt.rcParams["font.family"] = "Heiti TC"
plt.rcParams["svg.fonttype"] = "none"

DASHES = {"DASHED": "--", "HIDDEN": "--", "CENTER": "-.", "PHANTOM": (0, (8, 2, 1, 2, 1, 2)), "DASHDOT": "-.", "DOT": ":"}
HATCH_MARKS = {"ANSI31": "///", "GRASS": "..", "DOTS": "..", "BRICK": "++", "AR-SAND": "...", "AR-B816": "xx",
               "AR-CONC": "oo", "EARTH": "\\\\", "ANSI35": "\\\\", "ANSI36": "--", "ANSI37": "||", "HONEY": "oo"}
# filled=True colours, by hatch pattern (the synthetic site's conventions; unknown patterns fall back to grey)
FILL_COLOURS = {"ANSI31": "#9ccc8a", "GRASS": "#d9efc2", "DOTS": "#d9efc2", "BRICK": "#e4d2b0", "AR-SAND": "#d8d6cf",
                "AR-B816": "#b9bcb4", "AR-CONC": "#cfcfcf", "SOLID": "#000000",
                # the tower's planters and roof lawn (landsight.synth.tower)
                "ANSI35": "#c9df8a", "ANSI36": "#a8d5ba", "ANSI37": "#e3c98a", "HONEY": "#cfe8b0"}
CANOPY_FILL, CANOPY_EDGE, HEDGE_FILL = "#8fbf7f", "#2f6b2f", "#2e6b3a"


def _linestyle(linetype: str):
    return DASHES.get(linetype.upper().rstrip("X2").rstrip("2"), "-")


def _poly_path(geom) -> MplPath:
    verts, codes = [], []
    polys = getattr(geom, "geoms", [geom])
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            xy = list(ring.coords)
            verts += xy
            codes += [MplPath.MOVETO] + [MplPath.LINETO] * (len(xy) - 2) + [MplPath.CLOSEPOLY]
    return MplPath(verts, codes)


def _window(model: Model, window):
    if window is not None:
        return window
    x0, y0, x1, y1 = model.bounds
    pad = 0.02 * max(x1 - x0, y1 - y0)
    return (x0 - pad, y0 - pad, x1 + pad, y1 + pad)


def render_window(model: Model, window=None) -> tuple[float, float, float, float]:
    """The (x0, y0, x1, y1) window in metres that render_png maps onto the full image."""
    return _window(model, window)


def metres_per_pixel(model: Model, png_size: tuple[int, int], window=None) -> tuple[float, float]:
    """(metres per pixel along x, along y) of a render_png image of `png_size` = (width, height) pixels.
    The axes fill the figure, so the mapping is linear; x and y differ only by the rounding of the pixel size."""
    x0, y0, x1, y1 = _window(model, window)
    return ((x1 - x0) / png_size[0], (y1 - y0) / png_size[1])


def pixel_to_metres(model: Model, png_size: tuple[int, int], px: float, py: float, window=None) -> tuple[float, float]:
    """Drawing coordinates (metres) of a pixel position (origin top-left, y down) in a render_png image."""
    x0, y0, x1, y1 = _window(model, window)
    mx, my = metres_per_pixel(model, png_size, window)
    return (x0 + px * mx, y1 - py * my)


def render_png(model: Model, path: str | Path | None = None, filled: bool = False, dpi: int = 150,
               ids: dict[str, tuple[float, float]] | None = None, window=None, highlight=None,
               width_in: float = 14.0) -> bytes:
    """Draw the model and return PNG bytes (also written to `path` when given).

    filled: canopies green, hedge bands dark green, hatched areas coloured by pattern (the coloured plan for SAM).
    ids: {"C-01": (x, y)} draws an ID tag at each position. window: (x0, y0, x1, y1) in metres to crop to.
    highlight: shapely geometries drawn in red on top (a candidate for Muse Spark).
    """
    x0, y0, x1, y1 = _window(model, window)
    w, h = x1 - x0, y1 - y0
    height_in = min(width_in * h / w, 20.0)
    width_in = height_in * w / h
    pt_per_m = width_in * 72 / w
    fig = plt.figure(figsize=(width_in, height_in), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("auto")
    ax.axis("off")
    fig.patch.set_facecolor("white")

    for hatch in model.hatches:
        pattern = hatch.pattern.upper()
        if hatch.solid:
            ax.add_patch(PathPatch(_poly_path(hatch.polygon), facecolor="black", edgecolor="none", lw=0))
        elif filled:
            ax.add_patch(PathPatch(_poly_path(hatch.polygon), facecolor=FILL_COLOURS.get(pattern, "#cccccc"),
                                   edgecolor="none", lw=0, hatch="///" if pattern == "ANSI31" else None,
                                   hatchcolor="#3f7f3f"))
        else:
            ax.add_patch(PathPatch(_poly_path(hatch.polygon), facecolor="none", edgecolor="none", lw=0,
                                   hatch=HATCH_MARKS.get(pattern, "//"), hatchcolor="#777777"))
    if filled:
        from landsight.geometry import canopy_shapes, hedge_bands

        for poly in hedge_bands(model):
            ax.add_patch(PathPatch(_poly_path(poly), facecolor=HEDGE_FILL, edgecolor=HEDGE_FILL, lw=1.0))
        for poly in canopy_shapes(model):
            ax.add_patch(PathPatch(_poly_path(poly), facecolor=CANOPY_FILL, edgecolor=CANOPY_EDGE, lw=1.5, alpha=0.95))

    for e in model.entities:
        xs, ys = e.geometry.xy
        ax.plot(xs, ys, color="black", lw=0.8,
                linestyle=_linestyle(e.linetype), solid_capstyle="butt")
    for t in model.texts:
        ax.text(t.x, t.y, t.content, fontsize=max(t.height * pt_per_m, 2.0), rotation=t.rotation,
                rotation_mode="anchor", ha="left", va="baseline", color="black", clip_on=True)
    for geom in highlight or []:
        for g in getattr(geom, "geoms", [geom]):
            xs, ys = (g.exterior.xy if isinstance(g, Polygon) else g.xy)
            ax.plot(xs, ys, color="#e00000", lw=2.2, solid_capstyle="round")
    for tag, (tx, ty) in (ids or {}).items():
        ax.text(tx, ty, tag, fontsize=11, color="#c00000", ha="center", va="center", clip_on=True,
                bbox={"boxstyle": "round,pad=0.25", "facecolor": "white", "edgecolor": "#c00000", "lw": 1.2})

    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor="white", metadata={"Software": None})
    plt.close(fig)
    data = buf.getvalue()
    if path is not None:
        Path(path).write_bytes(data)
    return data


def render_svg(model: Model, path: str | Path | None = None, ids: dict[str, tuple[float, float]] | None = None,
               px_per_m: float = 12.0, paper: str = "white") -> str:
    """Write the model as a standalone SVG (metres as user units, y flipped). Text stays text, so CJK renders in
    any browser with a CJK font; hatches become pattern fills. Returns the SVG string."""
    x0, y0, x1, y1 = _window(model, None)
    W, H = x1 - x0, y1 - y0

    def pt(x, y):
        return f"{x - x0:.3f},{y1 - y:.3f}"

    def ring_d(coords):
        c = list(coords)
        return "M" + " L".join(pt(x, y) for x, y, *_ in c) + " Z"

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.3f} {H:.3f}" width="{W * px_per_m:.0f}" '
           f'height="{H * px_per_m:.0f}" font-family="Heiti TC, PingFang TC, Noto Sans CJK TC, sans-serif">',
           '<defs><pattern id="hatch" width="0.6" height="0.6" patternUnits="userSpaceOnUse" '
           'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.6" stroke="#888" stroke-width="0.05"/>'
           '</pattern></defs>', f'<rect width="{W:.3f}" height="{H:.3f}" fill="{paper}"/>']
    for h in model.hatches:
        d = " ".join(ring_d(r.coords) for p in getattr(h.polygon, "geoms", [h.polygon])
                     for r in [p.exterior, *p.interiors])
        fill = "#000" if h.solid else "url(#hatch)"
        out.append(f'<path d="{d}" fill="{fill}" fill-rule="evenodd" data-handle="{h.handle}" data-layer="{escape(h.layer)}"/>')
    for e in model.entities:
        dash = ' stroke-dasharray="0.6 0.3"' if _linestyle(e.linetype) != "-" else ""
        pts = " ".join(pt(x, y) for x, y, *_ in e.geometry.coords)
        out.append(f'<polyline points="{pts}" fill="none" stroke="#000" stroke-width="0.06"{dash} '
                   f'data-handle="{e.handle}" data-layer="{escape(e.layer)}"/>')
    for t in model.texts:
        x, y = t.x - x0, y1 - t.y
        rot = f' transform="rotate({-t.rotation:.2f} {x:.3f} {y:.3f})"' if t.rotation else ""
        out.append(f'<text x="{x:.3f}" y="{y:.3f}" font-size="{t.height:.3f}"{rot}>{escape(t.content)}</text>')
    for tag, (tx, ty) in (ids or {}).items():
        x, y = tx - x0, y1 - ty
        out.append(f'<g class="id-tag" data-id="{escape(tag)}"><rect x="{x - 1.2:.3f}" y="{y - 0.5:.3f}" width="2.4" '
                   f'height="1.0" rx="0.2" fill="white" stroke="#c00000" stroke-width="0.08"/><text x="{x:.3f}" '
                   f'y="{y + 0.25:.3f}" font-size="0.7" text-anchor="middle" fill="#c00000">{escape(tag)}</text></g>')
    out.append("</svg>")
    svg = "\n".join(out)
    if path is not None:
        Path(path).write_text(svg)
    return svg


