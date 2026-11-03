"""Hides the text of the macOS menu bar (system language, not English) on the screen shot's last frame, which the push
enlarges: the bar's band is replaced by a wide horizontal blur of itself, so its colour stays and its words go.

    uv run python demo/film/scripts/live-menubar.py demo/film/live/work/A-last.png demo/film/public/v2/live/A-last.png
"""
import sys

import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB'), np.float32)
# the band's top and bottom (4K px) at x0 and x1 on the stabilised shot's last frame (A-cut-stab40.mov); the camera is
# rolled a little. (On the original A-cut.mov: x 600–2010, top/bottom 603/630 → 586/613.)
x0, x1 = 505, 2135
top0, bot0, top1, bot1 = 574, 609, 554, 591
out = a.copy()
k = 151
pad = np.pad(a, ((0, 0), (k, k), (0, 0)), mode='edge')
cs = np.cumsum(pad, axis=1)
blur = (cs[:, 2 * k:] - cs[:, :-2 * k]) / (2 * k)
blur = blur[:, : a.shape[1]]
for x in range(x0, x1):
    u = (x - x0) / (x1 - x0)
    t = int(round(top0 + (top1 - top0) * u))
    b = int(round(bot0 + (bot1 - bot0) * u))
    out[t:b, x] = blur[t:b, x]
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst)
