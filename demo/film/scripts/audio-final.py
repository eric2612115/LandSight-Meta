"""The final sound of Film v6: the narration voice from the first word, music C2 (Eric's pick: minimal electronic with hand
claps and finger snaps), and clap accents placed exactly on the cuts. Mixed in one pass.

  · Voice: the opening (audio/voice-v3/opening.wav, scripts/opening-v3.py) and the narration (audio/voice-v3/narration.wav).
  · Music: scripts/music-v4.py's C2 pieces, each on its cut as audio-v4.py places them (the cold open from 0, the build's
    first beat on the push at 14.9, Part 2 on 94.1, the night swell on 155.3, the final chord on the logo at 163.3).
  · Claps, placed (scripts/music-v4.py): one on each of the cold open's cards (5.1, 8.4, 13.0),
    each a beat before its number is spoken; a stomp and a group clap on the push (14.9); snaps, then claps, stacking up on
    the groove's own beat as the floors build, and one big clap on the materials sweep (20.0); a short clap fill into each
    new explanation beat where the voice leaves room for it.
  · V4's other effects, lighter where the claps now carry the accent: the risers into the numbers, the swell into the push
    and its impact, the swishes on the drawing-mode cross-fades, the card's hit, Part 2's clicks and big-type hits, the
    swell into the night, the logo's shimmer.
  · Under the voice: the music and the claps duck about 8 dB (120 ms look-ahead, as before), and the music's speech band
    (1–5 kHz) dips 4 dB more, so a clap never sits on a word.
  · The private-mode beat: 6 s inserted at 92.3 (scripts/private-v3.py), before the type card. The groove carries on calmer
    (C2-private: claps thinned, a low pulse) and fades just before the card; a lock click sits in the pause after
    "drawings?". Everything from 92.3 on is 6 s later than in V2: the card's hit (98.58), Part 2 (100.1), the night (161.32),
    the logo chord (169.3); the film is 172.322 s. (The 166 s mix before the beat is kept as mix-166s.wav.)
  · Mix: −14 LUFS integrated, true peak ≤ −1 dBTP.
Writes audio/mix-final/: mix.wav (48 kHz, 24-bit stereo), the stems before the mix gain (voice, music, claps, sfx; float),
levels.json and previewC2.mp3 (the opening's first 40 s). The film's public/v2/audio/mix.wav is not touched.

    uv run python demo/film/scripts/audio-final.py
"""
import importlib.util
import json
import subprocess
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('audio_v4', Path(__file__).with_name('audio-v4.py'))
v4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v4)
SR, TL, db, A, place, mono, lufs, limit, fade = v4.SR, v4.TL, v4.db, v4.A, v4.place, v4.mono, v4.lufs, v4.limit, v4.fade
OUT = A / 'mix-final'
VARIANT = 'C2'
CARDS = [5.1, 8.4, 13.0]  # the cold open's numbers
PUSH, SWEEP = 14.9, 20.0
BEATS = [21.6, 28.2, 32.4, 35.3, 39.5, 46.7, 50.1, 54.0, 57.4, 65.4, 68.6, 74.4, 77.6, 87.0]  # each explanation beat's first frame
SPEECH_BAND = (1000.0, 5000.0)
# the private-mode beat (scripts/private-v3.py), 6 s before the type card: every cue from INSERT_AT on is INSERT_S later
INSERT_AT, INSERT_S = 92.3, 6.0
sh = lambda t: t + INSERT_S if t >= INSERT_AT else t
DUR = v4.DUR + INSERT_S
# the music on the cuts (audio-v4.py's placement: at, trimmed at, align the first hit, level vs V2's music in dB): the build
# runs into the beat, where the light groove carries on calmer for 6 s (C2-private), fading just before the type card
v4.PIECES = {
    'cold': (0.0, 14.9, False, 0.0),
    'build': (14.9, INSERT_AT, True, 1.0),
    'private': (INSERT_AT, INSERT_AT + INSERT_S, True, -1.0),
    'product': (sh(94.1), sh(155.3), False, 1.0),
    'swell': (sh(155.3), sh(163.3), False, 5.0),
    'logo': (sh(163.3), DUR, True, 3.0),
}
v4.V2_WINDOWS['private'] = (21.0, 92.0)  # levelled like the explanations' groove (then 2 dB under the build)
LOCK = INSERT_AT + 2.0  # the switch or lock click; it goes in the pause after "drawings?" when that pause is near, to stay off the words


def onsets(x, thr=-30.0):
    """10 ms frames where a transient starts (a jump of 9 dB or more above the frame before, and loud enough)."""
    hop = SR // 100
    r = 20 * np.log10(np.sqrt((x[: len(x) // hop * hop].reshape(-1, hop) ** 2).mean(1)) + 1e-9)
    return [i / 100 for i in range(1, len(r)) if r[i] > thr and r[i] - r[i - 1] >= 9]


def beat_period(x):
    """The groove's beat period (s) from the autocorrelation of its onset envelope (0.4–0.7 s, i.e. 86–150 BPM)."""
    hop = SR // 200
    m = np.abs(x[: len(x) // hop * hop]).reshape(-1, hop).mean(1)
    flux = np.maximum(0, np.diff(m))
    flux -= flux.mean()
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
    lo, hi = int(0.4 * 200), int(0.7 * 200)
    return (lo + int(np.argmax(ac[lo:hi]))) / 200


def speech_dip(music, env):
    """The music's speech band, down 4 dB more while the voice speaks (smooth band edges, so it is transparent otherwise)."""
    out = np.empty_like(music)
    f = np.fft.rfftfreq(len(music), 1 / SR)
    lo, hi = SPEECH_BAND
    mask = np.clip((f - 0.7 * lo) / (0.3 * lo), 0, 1) * np.clip((1.3 * hi - f) / (0.3 * hi), 0, 1)
    dip = 1 - (1 - db(-4)) * env
    for c in range(2):
        band = np.fft.irfft(np.fft.rfft(music[:, c]) * mask, len(music)).astype(np.float32)
        out[:, c] = (music[:, c] - band) + band * dip
    return out


def clap_stack(clap):
    """A group clap from the single clap: six hands a few ms apart, each a touch higher or lower (the generated group clap
    and stomp came back as faint tails, audio/sfx-v4/groupclap-take*.mp3 and stomp-take*.mp3)."""
    out = np.zeros(int(len(clap) / 0.93) + int(0.05 * SR), np.float32)
    for dt, g, k in zip((0, 0.007, 0.013, 0.019, 0.026, 0.033), (0, -1.5, -2.5, -3.5, -4.5, -5.5), (1.0, 1.04, 0.96, 1.07, 0.93, 1.02)):
        n = int(len(clap) / k)
        y = np.interp(np.arange(n) * k, np.arange(len(clap)), clap).astype(np.float32)
        i = int(dt * SR)
        out[i:i + n] += y * db(g)
    return v4.peak_norm(out)


def claps_layer(N, voice, period, report):
    S = lambda name: v4.peak_norm(mono(A / 'sfx-v4' / f'{name}.mp3'))
    clap, snap, fill, big = S('clap'), S('snap'), S('clapfill'), S('bigclap')
    group = clap_stack(clap)
    stomp = S('impact')  # the low thud of the v4 set stands in for the stomp
    hit = lambda x: onsets(x, -20)[0] if onsets(x, -20) else 0.0  # where each sample's transient is
    cards, layer = np.zeros((N, 2), np.float32), np.zeros((N, 2), np.float32)
    put = lambda x, t, g: place(layer, x, t - hit(x), db(g))
    short = clap[: int((hit(clap) + 0.085) * SR)].copy()  # its tail faded from 45 ms, so it is gone before the number is spoken
    short[int((hit(clap) + 0.045) * SR):] *= np.linspace(1, 0, len(short) - int((hit(clap) + 0.045) * SR), dtype=np.float32)
    for t in CARDS:  # exactly on the cards, as briefed; each number is spoken 0.1 s after its clap
        place(cards, short, t - hit(clap), db(-9))
    put(stomp, PUSH, -5)  # the push falls in a pause of the voice; only its tail meets line 4, so it goes with the guarded rest
    put(group, PUSH, -6)
    # the floors: snaps on the groove's beats while the sheets fly in, claps join as the floors land (17.9–19.4), offbeat
    # snaps on top, each layer a little louder; then one big clap on the sweep
    beats = [PUSH + k * period for k in range(1, 40) if PUSH + k * period < SWEEP - 0.1]
    for b in beats:
        u = (b - PUSH) / (SWEEP - PUSH)
        put(snap, b, -15 + 4 * u)
        if b >= 17.9 - 0.05:
            put(clap, b, -13 + 4 * u)
            if b + period / 2 < SWEEP - 0.1:
                put(snap, b + period / 2, -17 + 4 * u)
    put(big, SWEEP, -7)
    put(group, SWEEP, -7)
    # a short fill into each explanation beat, in the silence just before the beat's line starts (never under a word): it
    # ends 0.05 s before the voice comes back; where that silence is shorter than 0.45 s the beat gets no fill
    fill_last = onsets(fill, -20)[-1] if onsets(fill, -20) else 0.5
    hop = SR // 100
    act = 20 * np.log10(np.sqrt((voice[: len(voice) // hop * hop].mean(1).reshape(-1, hop) ** 2).mean(1)) + 1e-9) > -50
    done = []
    for t in BEATS:
        i = int((t + 0.2) * 100)
        while i > 0 and not act[i]:  # the line may start just before its beat
            i -= 1
        while i > 0 and act[i]:
            i -= 1
        end = i + 1
        while i > 0 and not act[i]:
            i -= 1
        gap = (end - i - 1) / 100
        if gap >= 0.45 and end / 100 > t - 1.5:
            length = min(0.7, gap - 0.1)
            seg = fill[max(0, int((fill_last - length) * SR)):]
            place(layer, v4.fade(seg, 0.01, 0.0), end / 100 - 0.05 - (fill_last - max(0, fill_last - length)), db(-12))
            done.append(round(t, 2))
    report['beats'] = {'period_s': round(period, 4), 'bpm': round(60 / period, 1), 'floor_beats': [round(b, 3) for b in beats]}
    report['fills_at'] = done
    report['fills_skipped_for_voice'] = [t for t in BEATS if t not in done]
    return cards, layer


def keep_under(layer, voice, margin=6.0):
    """A clap never masks a word: in every 10 ms where the voice sounds, the layer is held `margin` dB under it (20 ms either
    side too, edges smoothed over 5 ms). Returns the layer and the most it was turned down."""
    hop = SR // 100
    n = len(layer) // hop
    lv = lambda x: 20 * np.log10(np.sqrt((x[: n * hop].mean(1).reshape(-1, hop) ** 2).mean(1)) + 1e-9)
    c, v = lv(layer), lv(voice)
    g = np.where((v > -40) & (c > -80), np.minimum(0.0, v - margin - c), 0.0)
    g = np.minimum.reduce([np.roll(g, k) for k in (-2, -1, 0, 1, 2)])
    gain = np.concatenate([np.repeat(10 ** (g / 20), hop), np.ones(len(layer) - n * hop)])
    w = int(0.005 * SR)
    cs = np.concatenate([[0.0], np.cumsum(gain)])
    sm = gain.copy()
    sm[w // 2: w // 2 + len(gain) - w + 1] = (cs[w:] - cs[:-w]) / w
    return (layer * sm[:, None]).astype(np.float32), float(-g.min())


def other_effects(N):
    S = lambda name: v4.peak_norm(mono(A / 'sfx-v4' / f'{name}.mp3'))
    V2S = lambda name: mono(A / 'sfx-v2' / f'{name}.mp3')
    sfx = np.zeros((N, 2), np.float32)
    riser = fade(S('riser')[: int(1.12 * SR)], 0, 0.04)
    for t in CARDS:
        place(sfx, riser, t - len(riser) / SR, db(-15))
    swell = S('swell')[: int(2.17 * SR)]
    place(sfx, swell, PUSH - len(swell) / SR, db(-13))
    place(sfx, S('push'), PUSH - 0.14, db(-13))
    place(sfx, S('whoosh'), 15.7 - 0.07, db(-20))
    place(sfx, S('shimmer'), SWEEP - 0.1, db(-17))
    for a, b in v4.CROSS:
        place(sfx, S('whoosh'), (a + b) / 2 - 0.07, db(-14))
    place(sfx, V2S('hit'), sh(TL['type']['at']) - 0.02, db(-6))
    place(sfx, V2S('hit2'), sh(TL['type']['cut']) - 0.02, db(-11))
    for c in TL['clicks']:
        place(sfx, V2S('click'), sh(c) - 0.01, db(-17))
    for b in TL['big']:
        place(sfx, V2S('hit2'), sh(b) - 0.05, db(-10))
    place(sfx, swell, sh(TL['close']) - len(swell) / SR, db(-11))
    place(sfx, S('shimmer'), sh(162.95) - 0.1, db(-19))
    return sfx


def main():
    OUT.mkdir(exist_ok=True)
    N = int(DUR * SR)
    voice = np.zeros((N, 2), np.float32)
    place(voice, mono(A / 'voice-v3' / 'opening.wav'), 0.0)
    place(voice, mono(A / 'voice-v3' / 'narration.wav'), 0.0)
    place(voice, mono(A / 'voice-v3' / 'private.wav'), 0.0)
    env = v4.v3.envelope(voice)
    duck = (1 - (1 - db(-8)) * env)[:, None]
    m2 = v4.v2_music()
    ref = {name: v4.lufs_of(m2[int(lo * SR):int(hi * SR)]) for name, (lo, hi) in v4.V2_WINDOWS.items()}
    report = {'v2_music_lufs': {k: round(x, 1) for k, x in ref.items()}}
    music = v4.score(VARIANT, N, ref, report)
    build = mono(A / 'music-v4' / f'{VARIANT}-build.mp3')
    period = beat_period(build[: int(20 * SR)])
    cards, rest = claps_layer(N, voice, period, report)
    words = json.loads((A / 'voice-v3' / 'private.json').read_text())['words']
    i = next(k for k, w in enumerate(words) if w['text'].startswith('drawings'))
    a, b = words[i]['end'], words[i + 1]['start']
    lock_at = a + 0.15 if b - a >= 0.35 and abs((a + b) / 2 - LOCK) <= 0.6 else LOCK  # its click-clack spans ~0.15 s
    lock = v4.peak_norm(mono(A / 'sfx-v4' / 'lock.mp3'))
    place(rest, lock, lock_at - (onsets(lock, -20)[0] if onsets(lock, -20) else 0.0), db(-8))  # ducked and kept under any word
    report['private'] = {'insert_at': INSERT_AT, 'seconds': INSERT_S, 'lock_click': round(lock_at, 3), 'type_card_hit': round(sh(TL['type']['at']) - 0.02, 3),
                         'part2': sh(TL['type']['cut']), 'night': round(sh(TL['close']), 3), 'logo_chord': sh(163.3), 'duration': round(DUR, 3)}
    rest, most = keep_under(rest * duck, voice)
    claps = cards * duck + rest
    report['claps_kept_under_words'] = {'margin_db': 6.0, 'most_turned_down_db': round(most, 1)}
    music = speech_dip(music * duck, env)
    sfx = other_effects(N)
    mix = voice + music + claps + sfx
    I0, _, _ = lufs(mix)
    g = db(-14.0 - I0)
    out = limit(mix * g, -1.4)
    I, tp, lra = lufs(out)
    if abs(I + 14.0) > 0.15:
        g *= db(-14.0 - I)
        out = limit(mix * g, -1.4)
        I, tp, lra = lufs(out)
    write = lambda path, x, codec='pcm_f32le': subprocess.run(
        [v4.FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-c:a', codec, str(path)], input=x.astype(np.float32).tobytes(), check=True)
    for name, x in (('voice', voice), ('music', music), ('claps', claps), ('sfx', sfx)):
        write(OUT / f'{name}.wav', x)
    write(OUT / 'mix.wav', out, 'pcm_s24le')
    subprocess.run([v4.FFMPEG, '-v', 'error', '-y', '-i', str(OUT / 'mix.wav'), '-t', '40', '-af', 'afade=t=out:st=39.0:d=1.0',
                    '-c:a', 'libmp3lame', '-b:a', '192k', str(OUT / f'preview{VARIANT}.mp3')], check=True)
    report['mix'] = {'lufs': I, 'true_peak_dbtp': tp, 'lra': lra, 'mix_gain_db': round(20 * np.log10(g), 2)}
    (OUT / 'levels.json').write_text(json.dumps(report, indent=1) + '\n')
    print(f'mix {VARIANT}: {I:.1f} LUFS integrated · true peak {tp:.1f} dBTP · LRA {lra:.1f} LU · mix gain {20 * np.log10(g):+.2f} dB')
    print(json.dumps({k: v for k, v in report.items() if k in ('beats', 'fills_at', 'fills_skipped_for_voice')}))


if __name__ == '__main__':
    main()
