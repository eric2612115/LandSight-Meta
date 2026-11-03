"""Writes the film's grade for Eric's footage as a 3D LUT (.cube): HLG / BT.2020 (the phone's HDR) → SDR BT.709 with a
soft highlight roll-off (BT.2408: HLG reference white 75% → SDR 100%), then the look: warm, slightly desaturated, a gentle
S-curve, so the live shots sit with the 3D world. Input to the LUT is full-range R'G'B' decoded with the BT.2020 matrix.

    uv run python demo/film/scripts/live-lut.py demo/film/live/work/live.cube [--exposure 1.0] [--warm 1.0] [--sat 0.84]
"""
import argparse

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--n', type=int, default=65)
ap.add_argument('--exposure', type=float, default=1.0)
ap.add_argument('--warm', type=float, default=1.0)
ap.add_argument('--sat', type=float, default=0.84)
ap.add_argument('--contrast', type=float, default=0.12)
args = ap.parse_args()

n = args.n
g = np.linspace(0, 1, n)
# .cube order: R fastest
B, G, R = np.meshgrid(g, g, g, indexing='ij')
E_ = np.stack([R, G, B], -1).reshape(-1, 3)

# The phone's HLG signal reads well as display-referred SDR as it is (HLG is built to be backward compatible); convert
# its BT.2020 primaries to BT.709 in a pseudo-linear domain, grade there, and roll the top off so screens keep detail.
L = np.power(E_, 2.4) * args.exposure
M = np.array([[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]])
L = L @ M.T
# the look, in linear light: warm (a touch more red, less blue) and a little less colour
L = L * np.array([1.0 + 0.05 * args.warm, 1.0 + 0.012 * args.warm, 1.0 - 0.075 * args.warm])
Y = L @ np.array([0.2126, 0.7152, 0.0722])
L = Y[:, None] + (L - Y[:, None]) * args.sat
L = np.maximum(L, 0)
V = np.power(L, 1 / 2.4)
# gentle S-curve around the middle; the top rolls off (screens), the black lifts a little (soft, never crushed)
s = args.contrast
V = V + s * (V - 0.5) * (1 - np.abs(2 * V - 1))
k = 0.86
V = np.where(V < k, V, k + (1 - k) * (1 - np.exp(-(V - k) / (1 - k) * 1.0)) * 0.97 / (1 - np.exp(-1.0 * (1 - k) / (1 - k) * 1.0)) * (1 - np.exp(-(1 - k) / (1 - k))) )
V = 0.015 + V * (1 - 0.015 - 0.01)
V = np.clip(V, 0, 1)

with open(args.out, 'w') as f:
    f.write(f'TITLE "landsight live grade"\nLUT_3D_SIZE {n}\n')
    for r, gg, bb in V:
        f.write(f'{r:.6f} {gg:.6f} {bb:.6f}\n')
print('wrote', args.out)
