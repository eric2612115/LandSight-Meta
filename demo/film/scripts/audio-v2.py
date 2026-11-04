"""The sound of the v2 film, mixed in one pass (film seconds from audio/voice-v2/timeline.json; node film-v2-timeline.mjs).

  · Eric's own voice opens (audio/eric-live/b-voice.wav: B-cut, then light EQ).
  · Every narration line is the narration voice (scripts/voice-v2.py, with timestamps). Each line is tightened — pauses longer than
    0.28 s inside it are shortened to 0.2 s at their quiet middle — then placed at its cue, a little earlier when the line
    before has ended, and only if it still overruns its picture sped up (pitch kept, at most ×1.07). The character times
    follow every edit; src/scenes/voice-v2.json carries them so the captions are timed to the words.
  · Music: a calm bed under Part 1 (audio/music-v2/bed1.mp3), out under "Two weeks → ten minutes.";
    a lighter one under Part 2 and the end (bed2.mp3), its resolve landing on the logo. Voice ducks the music.
  · Effects (audio/sfx-v2): whooshes on the big transitions, soft clicks on the capture's clicks,
    a gentle hit under each big-type card.
  · Mix: −14 LUFS integrated, true peak ≤ −1 dBTP (gain, then a look-ahead limiter on the 4× oversampled signal).
Writes public/v2/audio/mix.wav (48 kHz, 24-bit stereo) and prints the schedule and the measured figures.

    uv run python demo/film/scripts/audio-v2.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

FFMPEG = '/opt/homebrew/bin/ffmpeg'
HERE = Path(__file__).resolve().parent.parent
A = HERE / 'audio'
SR = 48000
TL = json.loads((A / 'voice-v2' / 'timeline.json').read_text())
SPLIT = {24: ('and drafts', 'reply')}  # n → (the phrase that waits, for which picture)
PICK = {}  # n → take suffix ('' | 'b' | 'c'), when a take other than the first reads better


def load(path, sr=SR, mono=False, filters=None):
    cmd = [FFMPEG, '-v', 'error', '-i', str(path)]
    if filters:
        cmd += ['-af', filters]
    cmd += ['-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(sr), '-']
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)
    return x if mono else x.reshape(-1, 2)


def active_rms(x):
    m = x if x.ndim == 1 else x.mean(1)
    hop = SR // 20
    fr = m[: len(m) // hop * hop].reshape(-1, hop)
    r = np.sqrt((fr ** 2).mean(1) + 1e-12)
    act = r[r > 10 ** (-40 / 20) * r.max() * 10]
    return float(np.sqrt((act ** 2).mean())) if len(act) else float(r.mean())


def tighten(x, chars, st, en, keep=0.2, over=0.28):
    """Shortens the pauses inside a line; returns the audio, the new times and where the speech ends."""
    st, en = list(st), list(en)
    cuts = []
    for i, c in enumerate(chars[:-1]):
        d = en[i] - st[i]
        if not c.isalnum() and d > over:
            cut = d - keep
            mid = (st[i] + en[i]) / 2
            cuts.append((mid - cut / 2, mid + cut / 2))
    xf = int(0.008 * SR)
    out = x
    for a, b in sorted(cuts, reverse=True):
        ia, ib = int(a * SR), int(b * SR)
        if ib + xf >= len(out) or ia - xf <= 0:
            continue
        fade = np.linspace(1, 0, xf, dtype=np.float32)
        head = out[:ia].copy()
        tail = out[ib:].copy()
        head[-xf:] = head[-xf:] * fade + tail[:xf] * (1 - fade)
        out = np.concatenate([head, tail[xf:]])
        span = (ib - ia + xf) / SR
        st = [t - span if t >= b else (min(t, a) if t > a else t) for t in st]
        en = [t - span if t >= b else (min(t, a) if t > a else t) for t in en]
    last = len(chars) - 1
    while last > 0 and not chars[last].isalnum():
        last -= 1
    speech_end = en[last]
    out = out[: int((speech_end + 0.14) * SR)].copy()
    tailn = int(0.06 * SR)
    out[-tailn:] *= np.linspace(1, 0, tailn, dtype=np.float32)[:, None] if out.ndim == 2 else np.linspace(1, 0, tailn, dtype=np.float32)
    return out, st, en, speech_end


def tempo(x, k):
    if abs(k - 1) < 1e-3:
        return x
    p = subprocess.run([FFMPEG, '-v', 'error', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-i', '-', '-af', f'atempo={k:.4f}', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                       input=x.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32)


def schedule():
    lines = TL['lines']
    prev_end = TL['eric']['until'] - 0.1
    out = []
    eric = load(A / 'eric-live' / 'b-voice.wav', mono=True)
    ref = active_rms(eric)
    for i, ln in enumerate(lines):
        n = ln['n']
        take = PICK.get(n, '')
        meta = json.loads((A / 'voice-v2' / f'line-{n}{take}.json').read_text())
        al = meta['alignment']
        chars = al['characters']
        assert ''.join(chars) == ln['text'], f'line {n}: alignment text differs'
        x = load(A / 'voice-v2' / f'line-{n}{take}.mp3', mono=True)
        x, st, en, dur = tighten(x, chars, al['character_start_times_seconds'], al['character_end_times_seconds'])
        x = x * (ref / active_rms(x))
        nxt = lines[i + 1]['at'] if i + 1 < len(lines) else TL['duration'] - 0.5
        limit = min(nxt - 0.2, (ln['pictureUntil'] or 1e9) + 0.5)
        start = max(ln['at'], prev_end + 0.25)
        if start + dur > limit:
            start = max(prev_end + 0.25, ln['at'] - 0.5)
        k = 1.0
        if start + dur > limit:
            k = min(1.07, dur / max(0.1, limit - start))
        x = tempo(x, k)
        st = [start + t / k for t in st]
        en = [start + t / k for t in en]
        end = start + dur / k
        if n in SPLIT:
            # the line's last phrase waits for its own picture (it is cut out at its quiet gap and placed there)
            phrase, when = SPLIT[n]
            j = ln['text'].index(phrase)
            cut_t = st[j] - 0.06
            later = TL['big'][1] - 0.15 if when == 'reply' else float(when)
            shift = later - cut_t
            if shift > 0:
                ic = int(round((cut_t - start) * SR))
                x = np.concatenate([x[:ic], np.zeros(int(round(shift * SR)), np.float32), x[ic:]])
                st = [v + shift if q >= j else v for q, v in enumerate(st)]
                en = [v + shift if q >= j else v for q, v in enumerate(en)]
                end += shift
        out.append({'n': n, 'take': take, 'start': round(start, 3), 'end': round(end, 3), 'tempo': round(k, 3), 'audio': x, 'st': st, 'en': en, 'text': ln['text'],
                    'over_picture': round(max(0, end - (ln['pictureUntil'] or 1e9)), 2), 'gap_next': round(nxt - end, 2)})
        prev_end = end
    return eric, out


def place(buf, x, t, gain=1.0):
    i = int(round(t * SR))
    if i >= len(buf):
        return
    x = x if x.ndim == 2 else np.repeat(x[:, None], 2, 1)
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * gain


def envelope(x, attack=0.06, release=0.45):
    """A smooth 0–1 'voice is speaking' envelope."""
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
    N = int(TL['duration'] * SR) + SR
    voice = np.zeros((N, 2), np.float32)
    music = np.zeros((N, 2), np.float32)
    sfx = np.zeros((N, 2), np.float32)

    eric, lines = schedule()
    e = eric[int(TL['eric']['from'] * SR):]
    place(voice, e, TL['eric']['at'])
    for ln in lines:
        place(voice, ln['audio'], ln['start'])

    # music: bed 1 from the first frame (low under Eric), out under the big type; bed 2 from the cut to the end
    db = lambda d: 10 ** (d / 20)
    bed1 = load(A / 'music-v2' / 'bed1.mp3')
    bed2 = load(A / 'music-v2' / 'bed2.mp3')
    t1_end = TL['type']['at']
    seg = bed1[: int(t1_end * SR)].copy()
    ramp = np.ones(len(seg), np.float32)
    fi = int(1.2 * SR)
    ramp[:fi] = np.linspace(0, 1, fi)
    fo = int(0.9 * SR)
    ramp[-fo:] = np.linspace(1, 0, fo) ** 2
    # under Eric's own voice the bed sits lower still; it opens up at the pull-back into the world
    t = np.arange(len(seg)) / SR
    lift = np.clip((t - 13.6) / 1.8, 0, 1)
    seg *= (ramp * (db(-6) + (1 - db(-6)) * lift))[:, None]
    place(music, seg, 0, db(-7))
    seg2 = bed2.copy()
    end_at = TL['duration']
    start2 = TL['part2']
    seg2 = seg2[: int((end_at - start2) * SR)]
    r2 = np.ones(len(seg2), np.float32)
    r2[: int(0.25 * SR)] = np.linspace(0, 1, int(0.25 * SR))
    r2[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR))
    seg2 *= r2[:, None]
    place(music, seg2, start2, db(-9.5))

    duck = envelope(voice)
    music *= (1 - (1 - db(-8)) * duck)[:, None]

    # effects
    S = lambda name: load(A / 'sfx-v2' / f'{name}.mp3')
    whoosh, pull, click, hit, hit2 = S('whoosh'), S('pull'), S('click'), S('hit'), S('hit2')
    place(sfx, whoosh, TL['push']['land'] - 0.75, db(-10))   # the push lands on the sheet
    place(sfx, pull, TL['push']['pull'] - 0.1, db(-9))       # the pull-back into the world
    place(sfx, whoosh, TL['push']['stack'] + 0.1, db(-16))   # the sheets fly in
    place(sfx, whoosh, TL['raster'][0] - 0.5, db(-16))       # into the coloured plan
    place(sfx, hit, TL['type']['at'] - 0.02, db(-6))         # "Two weeks → ten minutes."
    place(sfx, hit2, TL['type']['cut'] - 0.02, db(-11))      # the hard cut into the product
    for c in TL['clicks']:
        place(sfx, click, c - 0.01, db(-17))
    for b in TL['big']:
        place(sfx, hit2, b - 0.05, db(-10))                  # the big-type cards over Part 2
    place(sfx, whoosh, TL['close'] - 0.6, db(-13))           # into the end
    place(sfx, whoosh, TL['logo'] - 0.5, db(-15))            # the logo

    mix = (voice + music + sfx)[: int(TL['duration'] * SR)]
    I0, _, _ = lufs(mix)
    g = db(-14.0 - I0)
    out = limit(mix * g, -1.4)
    I, tp, lra = lufs(out)
    # one small correction for what the limiter took
    if abs(I + 14.0) > 0.15:
        out = limit(mix * g * db(-14.0 - I), -1.4)
        I, tp, lra = lufs(out)
    dst = HERE / 'public' / 'v2' / 'audio' / 'mix.wav'
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-c:a', 'pcm_s24le', str(dst)], input=out.astype(np.float32).tobytes(), check=True)
    # stems for the record (and a later re-balance)
    for name, x in (('voice', voice), ('music', music), ('sfx', sfx)):
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-c:a', 'pcm_s16le', str(A / 'mix-v2' / f'{name}.wav')],
                       input=(x[: len(out)] * g).astype(np.float32).tobytes(), check=True)
    timing = {str(ln['n']): {'start': ln['start'], 'end': ln['end'], 'tempo': ln['tempo'], 'take': ln['take'], 'text': ln['text'],
                             'st': [round(v, 3) for v in ln['st']], 'en': [round(v, 3) for v in ln['en']]} for ln in lines}
    (HERE / 'src' / 'scenes' / 'voice-v2.json').write_text(json.dumps(timing) + '\n')
    for ln in lines:
        flag = (f"  over picture {ln['over_picture']}s" if ln['over_picture'] > 0 else '') + (f"  CLASH {ln['gap_next']}s" if ln['gap_next'] < 0.15 else '')
        print(f"{ln['n']:>2} {ln['start']:7.2f}–{ln['end']:7.2f}  ×{ln['tempo']:.3f}{flag}  {ln['text'][:56]}")
    print(f'mix: {I:.1f} LUFS integrated · true peak {tp:.1f} dBTP · LRA {lra:.1f} LU →', dst)


if __name__ == '__main__':
    (A / 'mix-v2').mkdir(exist_ok=True)
    main()
