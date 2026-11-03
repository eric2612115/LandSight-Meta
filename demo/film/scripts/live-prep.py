"""Grades Eric's footage for the film and hides the brand marks on his equipment (the film never shows a company name).

Each clip is decoded with the BT.2020 matrix, graded through the film's LUT (scripts/live-lut.py), and every listed mark
is tracked (normalised cross-correlation on a context patch, frame to frame, backwards from the reference frame) and
painted over with the surface around it (a Coons-patch fill from the box's border, feathered, with matching grain). A mark
that loses its own track (Eric's head passing over it) follows its anchor mark rigidly. Writes a 4K H.264 at the clip's
own frame rate, and the clip's last frame as a 16-bit PNG (the push into the monitor starts from it).

    uv run python demo/film/scripts/live-prep.py A   (or B)
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from PIL import Image

FFMPEG = '/opt/homebrew/bin/ffmpeg'
HERE = Path(__file__).resolve().parent.parent
LIVE = HERE / 'live'
WORK = LIVE / 'work'
W, H = 3840, 2160
VF = f"scale=in_color_matrix=bt2020:in_range=tv:out_range=pc,format=gbrpf32le,lut3d={WORK / 'live.cube'}:interp=tetrahedral,format=rgb48le"

# marks in 4K px at the reference frame (the last): centre x, y, box w, h; `anchor` follows another mark when lost
CLIPS = {
    'A': {'src': LIVE / 'A-cut.mov', 'marks': {
        'philips': {'c': (2872, 1180), 'box': (170, 52), 'ctx': (220, 80), 'slope': 0.12},
        'asus': {'c': (1275, 1466), 'box': (170, 54), 'ctx': (200, 70), 'anchor': 'philips'},
        'apple': {'c': (1345, 1518), 'box': (110, 130), 'anchor': 'asus', 'rigid': True},
    }},
    'B': {'src': LIVE / 'B-cut.mov', 'marks': {
        'asus': {'c': (2843, 1390), 'box': (110, 50), 'ctx': (260, 110), 'slope': 0.38},
    }},
}


# Where the matcher cannot hold a mark (the ASUS bezel's lines are horizontal, so the match slides along them while
# the camera whips past), its centre is keyed by hand on the raw frames (4K px) and interpolated; before the first key
# the mark is behind Eric's head and chair and nothing is painted. The Apple mark rides under it at a keyed offset.
MANUAL = {
    'A': {
        'asus': {'keys': {60: (1880, 1450), 70: (1820, 1450), 80: (1760, 1450), 86: (1720, 1460), 90: (1700, 1467), 100: (1645, 1480),
                          110: (1605, 1488), 120: (1590, 1485), 130: (1555, 1540), 140: (1550, 1578), 150: (1555, 1587), 160: (1560, 1588),
                          170: (1535, 1580), 176: (1530, 1573)}, 'from': 56},
        'apple': {'offset': {60: (-20, 50), 100: (15, 55), 140: (40, 47), 176: (40, 52), 248: (70, 52)}, 'of': 'asus', 'from': 56},
    },
}


def interp_keys(keys, f):
    ks = sorted(keys)
    if f <= ks[0]:
        return keys[ks[0]]
    if f >= ks[-1]:
        return keys[ks[-1]]
    for a, b in zip(ks, ks[1:]):
        if a <= f <= b:
            u = (f - a) / (b - a)
            return tuple(keys[a][i] + (keys[b][i] - keys[a][i]) * u for i in range(2))


def apply_manual(name, tr, n):
    man = MANUAL.get(name, {})
    for m, c in man.items():
        if 'keys' in c:
            last = max(c['keys'])
            for f in range(n):
                if f < c['from']:
                    tr[m]['pos'][f] = None
                elif f <= last:
                    tr[m]['pos'][f] = interp_keys(c['keys'], f)
    for m, c in man.items():
        if 'offset' in c:
            for f in range(n):
                base = tr[c['of']]['pos'][f]
                if f < c['from'] or base is None:
                    tr[m]['pos'][f] = None
                else:
                    o = interp_keys(c['offset'], f)
                    tr[m]['pos'][f] = (base[0] + o[0], base[1] + o[1])


def frames(src, scale=None, fmt='rgb48le'):
    vf = VF + (f',scale={scale[0]}:{scale[1]}:flags=area,format=gray' if scale else '')
    p = subprocess.Popen([FFMPEG, '-v', 'error', '-i', str(src), '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'gray' if scale else fmt, '-'], stdout=subprocess.PIPE)
    w, h = scale or (W, H)
    n = w * h * (1 if scale else 6)
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield np.frombuffer(b, np.uint8 if scale else np.uint16).reshape(h, w, *(() if scale else (3,)))
    p.wait()


def ncc_search(img, tpl, cx, cy, r):
    th, tw = tpl.shape
    x0, y0 = int(round(cx - tw / 2 - r)), int(round(cy - th / 2 - r))
    reg = img[max(0, y0):y0 + th + 2 * r, max(0, x0):x0 + tw + 2 * r].astype(np.float32)
    if reg.shape[0] < th + 2 * r or reg.shape[1] < tw + 2 * r or x0 < 0 or y0 < 0:
        return None, 0.0
    win = sliding_window_view(reg, (th, tw))
    t = tpl.astype(np.float32) - tpl.mean()
    tn = np.sqrt((t * t).sum()) + 1e-6
    m = win.mean(axis=(2, 3), keepdims=True)
    num = np.einsum('ijkl,kl->ij', win, t)
    den = np.sqrt(np.maximum(((win - m) ** 2).sum(axis=(2, 3)), 1e-6)) * tn
    s = num / den
    j, i = np.unravel_index(np.argmax(s), s.shape)
    dx, dy = float(i), float(j)
    if 0 < i < s.shape[1] - 1:
        a, b, c = s[j, i - 1], s[j, i], s[j, i + 1]
        dx += 0.5 * (a - c) / (a - 2 * b + c + 1e-9)
    if 0 < j < s.shape[0] - 1:
        a, b, c = s[j - 1, i], s[j, i], s[j + 1, i]
        dy += 0.5 * (a - c) / (a - 2 * b + c + 1e-9)
    return (x0 + dx + tw / 2, y0 + dy + th / 2), float(s[j, i])


def track(name, cfg):
    """A fixed template of each mark (cut from the reference frame) matched at a few scales around the last scale, in a
    window around the last position, frame by frame backwards: no drift. Lost (occluded, off frame): follow the anchor."""
    k = 2  # analysis at half resolution
    gray = list(frames(cfg['src'], scale=(W // k, H // k)))
    n = len(gray)
    marks = cfg['marks']
    pos = {m: [None] * n for m in marks}
    scl = {m: [1.0] * n for m in marks}
    score = {m: [0.0] * n for m in marks}
    tpls = {}
    ref = gray[n - 1]
    for m, c in marks.items():
        pos[m][n - 1] = (c['c'][0] / k, c['c'][1] / k)
        score[m][n - 1] = 1.0
        if 'ctx' in c:
            tw, th = c['ctx'][0] // k, c['ctx'][1] // k
            x0, y0 = int(round(pos[m][n - 1][0] - tw / 2)), int(round(pos[m][n - 1][1] - th / 2))
            tpls[m] = Image.fromarray(ref[y0:y0 + th, x0:x0 + tw])
    order = [m for m in marks if 'anchor' not in marks[m]] + [m for m in marks if 'anchor' in marks[m]]
    pad = 80
    for f in range(n - 2, -1, -1):
        img = np.pad(gray[f], pad, mode='edge')
        for m in order:
            c = marks[m]
            px, py = pos[m][f + 1]
            s0 = scl[m][f + 1]
            if 'anchor' in c and not c.get('rigid'):
                # predict from the anchor's motion (one rigid desk), then search close to the prediction
                a = c['anchor']
                px += pos[a][f][0] - pos[a][f + 1][0]
                py += pos[a][f][1] - pos[a][f + 1][1]
            if c.get('rigid'):
                a = c['anchor']
                ax, ay = pos[a][n - 1]
                rx, ry = pos[m][n - 1][0] - ax, pos[m][n - 1][1] - ay
                sa = scl[a][f]
                pos[m][f] = (pos[a][f][0] + rx * sa, pos[a][f][1] + ry * sa)
                scl[m][f] = sa
                continue
            best = (None, -1.0, s0)
            for ds in (0.96, 0.98, 1.0, 1.02, 1.04):
                sc = min(1.08, max(0.8, s0 * ds))
                T = tpls[m]
                t = np.asarray(T.resize((max(8, round(T.width * sc)), max(6, round(T.height * sc))), Image.BILINEAR))
                p, sv = ncc_search(img, t, px + pad, py + pad, 12 if 'anchor' in c else 22)
                if p is not None and sv > best[1]:
                    best = ((p[0] - pad, p[1] - pad), sv, sc)
            if best[0] is not None and best[1] > 0.55:
                pos[m][f], score[m][f], scl[m][f] = best
            elif 'anchor' in c:
                a = c['anchor']
                pos[m][f] = (px, py)
                scl[m][f] = s0 * scl[a][f] / scl[a][f + 1]
                score[m][f] = -best[1]
            else:
                pos[m][f], scl[m][f], score[m][f] = (px, py), s0, -best[1]
    out = {m: {'pos': [(x * k, y * k) for x, y in pos[m]], 'scale': scl[m], 'score': score[m]} for m in marks}
    (WORK / f'{name}-track.json').write_text(json.dumps(out))
    return out, n


def fill(img, cx, cy, bw, bh, rng, slope=0.0):
    """Paints the box with the surface either side of it: each pixel blends the left and right borders along the bezel's
    own lines (`slope`, dy/dx), so the lines carry straight through; feathered, with grain."""
    x0, x1 = int(cx - bw / 2), int(cx + bw / 2)
    y0, y1 = int(cy - bh / 2), int(cy + bh / 2)
    x0, y0 = max(x0, 6), max(y0, 4)
    x1, y1 = min(x1, W - 7), min(y1, H - 5)
    if x1 <= x0 + 2 or y1 <= y0 + 2:
        return
    reg = img[y0:y1, x0:x1].astype(np.float32)
    h, w = reg.shape[:2]
    lcol = img[:, x0 - 5:x0 - 1].astype(np.float32).mean(1)
    rcol = img[:, x1 + 1:x1 + 5].astype(np.float32).mean(1)
    xs = np.arange(x0, x1)[None, :]
    ys = np.arange(y0, y1)[:, None]
    yl = np.clip(ys - (xs - (x0 - 3)) * slope, 0, H - 1.001)
    yr = np.clip(ys + ((x1 + 3) - xs) * slope, 0, H - 1.001)

    def samp(col, yy):
        i = np.floor(yy).astype(int)
        f = (yy - i)[..., None]
        return col[i] * (1 - f) + col[i + 1] * f

    u = ((xs - x0) / max(1, w - 1))[..., None]
    patch = (1 - u) * samp(lcol, yl) + u * samp(rcol, yr)
    patch = patch + rng.normal(0, 1, (h, w, 1)) * 0.010 * np.maximum(patch.mean(-1, keepdims=True), 2500)
    fu = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
    fv = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]
    a = np.clip(np.minimum(fu / 8.0, fv / 5.0), 0, 1)[..., None]
    img[y0:y1, x0:x1] = np.clip(reg * (1 - a) + patch * a, 0, 65535).astype(np.uint16)


def main(name):
    cfg = CLIPS[name]
    tr, n = track(name, cfg)
    apply_manual(name, tr, n)
    rate = '30000/1001'
    out = WORK / f'{name}-graded.mp4'
    enc = subprocess.Popen([FFMPEG, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-r', rate, '-i', '-',
                            '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-g', '15',
                            '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', str(out)], stdin=subprocess.PIPE)
    rng = np.random.default_rng(7)
    last = None
    for f, img in enumerate(frames(cfg['src'])):
        img = img.copy()
        for m, c in cfg['marks'].items():
            if tr[m]['pos'][f] is None:
                continue
            x, y = tr[m]['pos'][f]
            sc = max(0.6, tr[m]['scale'][f])
            fill(img, x, y, c['box'][0] * sc + 16, c['box'][1] * sc + 8, rng, c.get('slope', 0.0))
        # 16 → 8 bit happens in the encoder; a little dither first so the walls do not band
        img = np.clip(img.astype(np.float32) + rng.uniform(-128, 128, img.shape), 0, 65535).astype(np.uint16)
        enc.stdin.write(img.tobytes())
        last = img
    enc.stdin.close()
    enc.wait()
    Image.fromarray((last >> 8).astype(np.uint8)).save(WORK / f'{name}-last.png')
    print(name, n, 'frames →', out)


if __name__ == '__main__':
    main(sys.argv[1])
