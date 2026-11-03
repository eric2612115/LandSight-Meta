"""The sound of Film v6, in two variants of its score (A cinematic electronic, B cinematic minimal), mixed in one pass.

  · The voice is unchanged: Eric's own opening (audio/eric-live/b-voice.wav, as audio-v2.py placed it) and the v3 narration
    (audio/voice-v3/narration.wav).
  · The music is scripts/music-v4.py's pieces, each placed on its cut: the cold open from 0, the build on the push (its first
    beat on 14.9), Part 2 on its cut (94.1), the night swell on its cut (155.3), the final chord on the logo (163.3). A piece
    starts at its first sound (or its first hit), is trimmed at the next cut, and is levelled to V2's music at that point
    of the film (measured on audio/mix-v2/music.wav with its ducking undone). Ducking as before: about 8 dB down while the
    voice speaks, 120 ms look-ahead.
  · The effects follow Film v6's picture (stills/v6-transitions.md): risers that peak on the cold open's numbers (5.1, 8.4,
    13.0), a swell into the push's impact (14.9), a tick per floor as it lands (17.9–19.4), a shimmer on the materials
    sweep (20.0), swishes on the drawing-mode cross-fades, restrained impacts as the hero numbers land, V2's hit on the type
    card, V2's clicks in Part 2 and hits on its big type, a swell into the night, a shimmer as the logo comes in.
  · Mix: −14 LUFS integrated, true peak ≤ −1 dBTP (gain, then a look-ahead limiter on the 4× oversampled signal).
Writes audio/mix-v4/: mixA.wav and mixB.wav (48 kHz, 24-bit stereo), the stems before the mix gain (voice.wav, sfx.wav,
musicA.wav and musicB.wav, ducked; float), levels.json, and previewA.mp3 / previewB.mp3 (the opening's first 40 s).

    uv run python demo/film/scripts/audio-v4.py
"""
import importlib.util
import json
import subprocess
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent.parent
A = HERE / 'audio'
OUT = A / 'mix-v4'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
spec = importlib.util.spec_from_file_location('audio_v3', Path(__file__).with_name('audio-v3.py'))
v3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v3)
SR, TL, db, load, place, lufs, limit, duck_gain = v3.SR, v3.TL, v3.db, v3.load, v3.place, v3.lufs, v3.limit, v3.duck_gain
DUR = TL['duration']

# the music: piece → (placed at, trimmed at, 'hit' to align the first hit instead of the first sound, level vs V2's music in dB)
PIECES = {
    'cold': (0.0, 14.9, False, 0.0),
    'build': (14.9, 94.1, True, 1.0),
    'product': (94.1, 155.3, False, 1.0),
    'swell': (155.3, 163.3, False, 5.0),  # under lines 26–27 almost throughout, so it swells above the groove
    'logo': (163.3, DUR, True, 3.0),
}
STRETCH = {}  # (v, piece) to slow a piece (≤ 2.5 %) to reach its cut; B's Part 2 instead fades out ~154 s into the swell
V2_WINDOWS = {'cold': (15.4, 21.0), 'build': (21.0, 92.0), 'product': (94.1, 155.3), 'swell': (155.3, 163.3), 'logo': (155.3, 163.3)}

LAND = [17.9 + i / 20 * 1.5 for i in range(21)]  # WorldV6 landAt: each floor lands, bottom up
CROSS = [(22.0, 22.6), (45.6, 46.2), (48.9, 49.5), (57.4, 57.9), (65.35, 65.8), (87.0, 87.6)]  # drawAt and the raster plan
HERO = [28.4, 32.6, 35.5, 39.7, 54.2, 72.8, 74.6, 85.0, 90.2]  # hero numbers landing (roof, 91 %, 3.0 m², corridor, 95 %, 182, $10,856, pit passes, total)


def mono(path):
    return load(path, mono=True)


def peak_norm(x, to=-3.0):
    hop = SR // 100
    r = np.sqrt((x[: len(x) // hop * hop].reshape(-1, hop) ** 2).mean(1))
    return x * (db(to) / max(r.max(), 1e-9))


def first(x, thr_db):
    hop = SR // 100
    r = 20 * np.log10(np.sqrt((x[: len(x) // hop * hop].reshape(-1, hop) ** 2).mean(1)) + 1e-9)
    return max(0, np.where(r > thr_db)[0][0] - 1) / 100


def fade(x, a=0.0, b=0.0):
    x = x.copy()
    if a:
        n = int(a * SR)
        x[:n] *= np.linspace(0, 1, n, dtype=np.float32)[:, None] if x.ndim == 2 else np.linspace(0, 1, n, dtype=np.float32)
    if b:
        n = int(b * SR)
        x[-n:] *= np.linspace(1, 0, n, dtype=np.float32)[:, None] if x.ndim == 2 else np.linspace(1, 0, n, dtype=np.float32)
    return x


def lufs_of(x):
    return lufs(x if x.ndim == 2 else np.repeat(x[:, None], 2, 1))[0]


def stretch(x, k):
    cmd = [FFMPEG, '-v', 'error', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-af', f'atempo={k:.5f}', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(cmd, input=x.astype(np.float32).tobytes(), capture_output=True, check=True).stdout, np.float32).reshape(-1, 2).copy()


def v2_music():
    """V2's music before its ducking and gain (as audio-v3.py undoes them), to level the new pieces against."""
    old_voice, music = load(A / 'mix-v2' / 'voice.wav'), load(A / 'mix-v2' / 'music.wav')
    eric = np.zeros_like(old_voice)
    place(eric, mono(A / 'eric-live' / 'b-voice.wav')[int(TL['eric']['from'] * SR):], TL['eric']['at'])
    k = int(14.9 * SR)
    g = float((old_voice[:k] * eric[:k]).sum() / (eric[:k] ** 2).sum())
    return music / g / duck_gain(old_voice / g)[:, None]


def score(v, N, ref, report):
    music = np.zeros((N, 2), np.float32)
    for name, (at, until, hit, rel) in PIECES.items():
        x = load(A / 'music-v4' / f'{v}-{name}.mp3')
        lead = first(x.mean(1), -30 if hit else -50)
        x = x[int(lead * SR):]
        span = until - at
        if STRETCH.get((v, name)):
            hop = SR // 20
            r = 20 * np.log10(np.sqrt((x[: len(x) // hop * hop].mean(1).reshape(-1, hop) ** 2).mean(1)) + 1e-9)
            sound = (np.where(r > -40)[0][-1] + 1) / 20
            k = min(1.0, sound / span)
            if k < 0.975:
                raise SystemExit(f'{v}-{name}: would need more than 2.5 % stretch ({k:.3f})')
            x = stretch(x, k)
            report[f'{v}-{name} tempo'] = round(k, 4)
        x = x[: int((span + (0.0 if name == 'logo' else 0.15)) * SR)]
        x = fade(x, 0.0, 0.15 if name != 'logo' else 0.4)
        target = ref[name] + rel
        gain = target - lufs_of(x)
        place(music, x, at, db(gain))
        report[f'{v}-{name}'] = {'at': at, 'lead_trimmed_s': round(lead, 2), 'gain_db': round(gain, 1), 'target_lufs': round(target, 1)}
    return music


def effects(N):
    S = lambda name: peak_norm(mono(A / 'sfx-v4' / f'{name}.mp3'))
    V2S = lambda name: mono(A / 'sfx-v2' / f'{name}.mp3')
    sfx = np.zeros((N, 2), np.float32)
    riser = fade(S('riser')[: int(1.12 * SR)], 0, 0.04)  # rises for ~1 s and stops on its peak
    for t in (5.1, 8.4, 13.0):
        place(sfx, riser, t - len(riser) / SR, db(-12))
    swell = S('swell')[: int(2.17 * SR)]
    place(sfx, swell, 14.9 - len(swell) / SR, db(-13))  # into the push
    place(sfx, S('push'), 14.9 - 0.14, db(-9))  # the push's impact on 14.9
    place(sfx, S('whoosh'), 15.7 - 0.07, db(-20))  # the other sheets fly in
    tick = S('tick')
    rng = np.random.default_rng(6)
    for i, t in enumerate(LAND):  # one delicate tick per floor; alternate pitch a touch so it does not machine-gun
        k = (1.0, 1.04, 0.97)[i % 3]
        n = int(len(tick) / k)
        tk = np.interp(np.arange(n) * k, np.arange(len(tick)), tick).astype(np.float32)
        place(sfx, tk, t, db(-21 + rng.uniform(-1.5, 1.5)))
    place(sfx, S('shimmer'), 20.0 - 0.1, db(-13))  # the materials sweep (20.0–20.8)
    for a, b in CROSS:
        place(sfx, S('whoosh'), (a + b) / 2 - 0.07, db(-14))
    impact = S('impact')
    for t in HERO:
        place(sfx, impact, t - 0.01, db(-11))  # under the voice: felt, a few dB below V2's card hits
    place(sfx, V2S('hit'), TL['type']['at'] - 0.02, db(-6))  # "Two weeks → ten minutes."
    place(sfx, V2S('hit2'), TL['type']['cut'] - 0.02, db(-11))  # the hard cut into the product
    for c in TL['clicks']:
        place(sfx, V2S('click'), c - 0.01, db(-17))
    for b in TL['big']:
        place(sfx, V2S('hit2'), b - 0.05, db(-10))
    place(sfx, swell, TL['close'] - len(swell) / SR, db(-11))  # into the night
    place(sfx, S('shimmer'), 162.95 - 0.1, db(-19))  # the logo fades in
    return sfx


def main():
    OUT.mkdir(exist_ok=True)
    N = int(DUR * SR)
    voice = np.zeros((N, 2), np.float32)
    place(voice, mono(A / 'eric-live' / 'b-voice.wav')[int(TL['eric']['from'] * SR):], TL['eric']['at'])
    place(voice, mono(A / 'voice-v3' / 'narration.wav'), 0.0)
    duck = duck_gain(voice)[:, None]
    m2 = v2_music()
    ref = {name: lufs_of(m2[int(lo * SR):int(hi * SR)]) for name, (lo, hi) in V2_WINDOWS.items()}
    report = {'v2_music_lufs': {k: round(v, 1) for k, v in ref.items()}}
    sfx = effects(N)
    write = lambda path, x, codec='pcm_f32le': subprocess.run(
        [FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-c:a', codec, str(path)], input=x.astype(np.float32).tobytes(), check=True)
    write(OUT / 'voice.wav', voice)
    write(OUT / 'sfx.wav', sfx)
    for v in 'AB':
        music = score(v, N, ref, report) * duck
        write(OUT / f'music{v}.wav', music)
        mix = voice + music + sfx
        I0, _, _ = lufs(mix)
        g = db(-14.0 - I0)
        out = limit(mix * g, -1.4)
        I, tp, lra = lufs(out)
        if abs(I + 14.0) > 0.15:
            g *= db(-14.0 - I)
            out = limit(mix * g, -1.4)
            I, tp, lra = lufs(out)
        write(OUT / f'mix{v}.wav', out, 'pcm_s24le')
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', str(OUT / f'mix{v}.wav'), '-t', '40', '-af', 'afade=t=out:st=39.0:d=1.0',
                        '-c:a', 'libmp3lame', '-b:a', '192k', str(OUT / f'preview{v}.mp3')], check=True)
        report[f'mix{v}'] = {'lufs': I, 'true_peak_dbtp': tp, 'lra': lra, 'mix_gain_db': round(20 * np.log10(g), 2)}
        print(f'mix {v}: {I:.1f} LUFS integrated · true peak {tp:.1f} dBTP · LRA {lra:.1f} LU · mix gain {20 * np.log10(g):+.2f} dB')
    (OUT / 'levels.json').write_text(json.dumps(report, indent=1) + '\n')
    print(json.dumps({k: v for k, v in report.items() if not k.startswith('mix')}))


if __name__ == '__main__':
    main()
