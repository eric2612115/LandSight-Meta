"""The sound of the v2 film with the v3 narration (D-93), mixed in one pass from stems (film seconds).

  · Eric's own voice opens, unchanged (audio/eric-live/b-voice.wav, placed exactly as audio-v2.py placed it).
  · The narration is the v3 stem (audio/voice-v3/narration.wav, from scripts/voice-v3.py).
  · Music and effects are the v2 stems, unchanged (audio/mix-v2/music.wav, sfx.wav). audio-v2.py wrote every stem after
    the gain it gave the whole mix, and the music after its ducking under the v2 voice. Both are undone here: the gain is
    read off Eric's voice in audio/mix-v2/voice.wav, and the v2 ducking is recomputed from that stem. The music then ducks
    under the new voice the same way (about 8 dB down while the voice speaks, 120 ms look-ahead).
  · Mix: −14 LUFS integrated, true peak ≤ −1 dBTP (gain, then a look-ahead limiter on the 4× oversampled signal).
Writes audio/mix-v3/mix.wav (48 kHz, 24-bit stereo) and the stems beside it, and prints the measured figures. The film
plays public/v2/audio/mix.wav; the mix is moved there by hand, the v2 mix kept as public/v2/audio/mix-v2-old.wav.

    uv run python demo/film/scripts/audio-v3.py
"""
import json
import re
import subprocess
from pathlib import Path

import numpy as np

FFMPEG = '/opt/homebrew/bin/ffmpeg'
HERE = Path(__file__).resolve().parent.parent
A = HERE / 'audio'
SR = 48000
TL = json.loads((A / 'voice-v2' / 'timeline.json').read_text())
DUCK_DB = -8.0
db = lambda d: 10 ** (d / 20)


def load(path, mono=False):
    cmd = [FFMPEG, '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(SR), '-']
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)
    return x.copy() if mono else x.reshape(-1, 2).copy()


def write(path, x, codec):
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-c:a', codec, str(path)],
                   input=x.astype(np.float32).tobytes(), check=True)


def place(buf, x, t, gain=1.0):
    i = int(round(t * SR))
    if i >= len(buf):
        return
    x = x if x.ndim == 2 else np.repeat(x[:, None], 2, 1)
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * gain


def envelope(x, attack=0.06, release=0.45):
    """A smooth 0–1 'voice is speaking' envelope (as audio-v2.py)."""
    m = np.abs(x if x.ndim == 1 else x.mean(1))
    hop = SR // 100
    r = np.sqrt(np.pad(m, (0, (-len(m)) % hop)).reshape(-1, hop).__pow__(2).mean(1))
    on = (r > 0.01).astype(np.float32)
    g = np.zeros_like(on)
    a = 1 - np.exp(-1 / (attack * 100))
    b = 1 - np.exp(-1 / (release * 100))
    v = 0.0
    # look ahead 120 ms so the music dips just before a word
    on = np.maximum(on, np.concatenate([on[12:], np.zeros(12, np.float32)]))
    for i, o in enumerate(on):
        v += (o - v) * (a if o > v else b)
        g[i] = v
    return np.repeat(g, hop)[: len(m)]


def duck_gain(voice):
    return 1 - (1 - db(DUCK_DB)) * envelope(voice)


def lufs(x):
    p = subprocess.run([FFMPEG, '-hide_banner', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       input=x.astype(np.float32).tobytes(), capture_output=True)
    s = p.stderr.decode()
    I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', s)[-1])
    tp = float(re.findall(r'Peak:\s+(-?[\d.]+|-inf) dBFS', s)[-1])
    lra = float(re.findall(r'LRA:\s+(-?[\d.]+) LU', s)[-1])
    return I, tp, lra


def limit(x, ceiling_db):
    """A look-ahead peak limiter on the 4× oversampled signal (so inter-sample peaks are caught), then back to 48 kHz."""
    c = 10 ** (ceiling_db / 20)
    p = subprocess.run([FFMPEG, '-v', 'error', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-af',
                        f'aresample=192000,alimiter=limit={c:.5f}:attack=1:release=60:level=false,aresample={SR}', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                       input=x.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32).reshape(-1, 2)


def main():
    old_voice = load(A / 'mix-v2' / 'voice.wav')
    music = load(A / 'mix-v2' / 'music.wav')
    sfx = load(A / 'mix-v2' / 'sfx.wav')
    N = len(old_voice)

    # Eric's opening, placed as audio-v2.py placed it
    eric = np.zeros((N, 2), np.float32)
    place(eric, load(A / 'eric-live' / 'b-voice.wav', mono=True)[int(TL['eric']['from'] * SR):], TL['eric']['at'])

    # the gain audio-v2.py gave its stems, read off Eric's voice (nothing else speaks before the first line)
    k = int(14.9 * SR)
    g_old = float((old_voice[:k] * eric[:k]).sum() / (eric[:k] ** 2).sum())
    resid = np.sqrt(((old_voice[:k] - g_old * eric[:k]) ** 2).mean()) / np.sqrt(((g_old * eric[:k]) ** 2).mean())
    assert resid < 1e-3, f'the v2 voice stem does not start with Eric as placed here (residual {resid:.2e})'

    # undo the v2 gain and the v2 ducking
    music = music / g_old / duck_gain(old_voice / g_old)[:, None]
    sfx = sfx / g_old

    # the new voice: Eric, then the v3 narration
    voice = eric.copy()
    place(voice, load(A / 'voice-v3' / 'narration.wav', mono=True), 0.0)
    duck = duck_gain(voice)
    music = music * duck[:, None]

    mix = voice + music + sfx
    I0, _, _ = lufs(mix)
    g = db(-14.0 - I0)
    out = limit(mix * g, -1.4)
    I, tp, lra = lufs(out)
    # one small correction for what the limiter took
    if abs(I + 14.0) > 0.15:
        g *= db(-14.0 - I)
        out = limit(mix * g, -1.4)
        I, tp, lra = lufs(out)
    dst = A / 'mix-v3'
    dst.mkdir(exist_ok=True)
    write(dst / 'mix.wav', out, 'pcm_s24le')
    for name, x in (('voice', voice), ('music', music), ('sfx', sfx)):
        write(dst / f'{name}.wav', x[: len(out)] * g, 'pcm_s16le')

    # how far the music sits under the voice while it speaks (frames where the voice is on)
    on = envelope(voice) > 0.9
    print(f'v2 stem gain {20 * np.log10(g_old):+.2f} dB (Eric residual {resid:.1e}) · music ducked {20 * np.log10(duck[on].mean()):.1f} dB while the voice speaks')
    print(f'mix: {I:.1f} LUFS integrated · true peak {tp:.1f} dBTP · LRA {lra:.1f} LU · {len(out) / SR:.3f} s →', dst / 'mix.wav')


if __name__ == '__main__':
    main()
