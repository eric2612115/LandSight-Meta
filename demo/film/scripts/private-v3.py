"""The private-mode beat's line, spoken by Eric's clone: inserted before the type card at INSERT_AT (scripts/voice-v3.py,
src/scenes/film-v2-cues.js), its first word 0.2 s in (as early as 0.1 s in if it needs to), ending inside the beat's 6 s
(0.05 s before it ends, before the type card fades in). The brief asked for about 5.6 s; no take is shorter than 5.83 s at
×1.05 (all three are listed in private.json).

Same voice, model, settings as the narration; context: narration line 18 before it, line 19 after it. Up to three takes:
the first that fits (sped up at most ×1.05) and passes the speech-to-text check (scribe_v1, every word heard) is used.
Writes audio/voice-v3/private.wav (the line's stem, 48 kHz mono, at the narration's level), audio/voice-v3/private.json and
entry 28 of src/scenes/voice-v3.json (the line, timed to its words like the narration).

    set -a; . <env file>; set +a; uv run python demo/film/scripts/private-v3.py
"""
import importlib.util
import json
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('voice_v3', Path(__file__).with_name('voice-v3.py'))
v3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v3)
SR, OUT = v3.SR, v3.OUT

N, KEY = 'p1', 28  # the takes' file names (line-p1*.mp3) and the line's number in the captions and the timing file
TEXT = "Confidential drawings? Run it on Meta's open weights, in a deployment you control. Same result."
FIRST, EARLIEST = v3.INSERT_AT + 0.2, v3.INSERT_AT + 0.1
LIMIT = v3.INSERT_AT + v3.INSERT_S - 0.05


def main():
    narr = v3.script()
    ref = v3.active_rms(v3.load(v3.HERE / 'audio' / 'eric-live' / 'b-voice.wav'))
    tried, pick = [], None
    for take in v3.TAKES:
        v3.generate(N, take, TEXT, narr[18], narr[19])
        for k in (1.0, 1.025, 1.05):
            p = v3.process(N, take, TEXT)
            x = v3.tempo(p['x'], k)
            ws = v3.heard(N, take, x)
            missing, extra = v3.check(TEXT, ws)
            if missing or extra:
                tried.append(f'{take or "a"} ×{k:.3f}: not heard {missing}, extra {extra}')
                break
            dur = p['off'] / k - ws[0]['start']  # first word to the end of the speech
            first = max(EARLIEST, min(FIRST, LIMIT - dur))
            start = first - ws[0]['start']
            end = start + p['off'] / k
            tried.append(f'{take or "a"} ×{k:.3f}: {dur:.2f} s, {first:.2f}–{end:.2f}' + ('' if end <= LIMIT + 1e-6 else ' (too long)'))
            if end <= LIMIT + 1e-6:
                pick = dict(p=p, x=x, ws=ws, k=k, take=take, start=start, end=end)
                break
        if pick:
            break
    if not pick:
        raise SystemExit(f'no take fits: {tried}')
    p, k = pick['p'], pick['k']
    st, en = [s / k for s in p['st']], [e / k for e in p['en']]
    v3.retime(TEXT, st, en, pick['ws'])
    y = pick['x'][: int((p['off'] / k + 0.12) * SR)].copy()
    y = v3.fade(y) * (ref / v3.active_rms(pick['x']))
    tl = json.loads((v3.HERE / 'audio' / 'voice-v2' / 'timeline.json').read_text())
    stem = np.zeros(int((tl['duration'] + v3.INSERT_S) * SR) + SR, np.float32)
    v3.place(stem, y, pick['start'])
    v3.save(OUT / 'private.wav', stem)
    words = [{'text': w['text'], 'start': round(pick['start'] + w['start'], 3), 'end': round(pick['start'] + w['end'], 3)} for w in pick['ws']]
    report = {'take': pick['take'] or 'a', 'tempo': round(k, 3), 'first_word': round(pick['start'] + pick['ws'][0]['start'], 3), 'end': round(pick['end'], 3), 'limit': round(LIMIT, 3),
              'pauses': [float(v) for v in p['pauses']], 'cuts': p['cuts'], 'tried': tried, 'words': words}
    (OUT / 'private.json').write_text(json.dumps(report, indent=1) + '\n')
    timing = json.loads((v3.SCENES / 'voice-v3.json').read_text())
    timing[str(KEY)] = {'start': round(pick['start'], 3), 'end': round(pick['end'], 3), 'tempo': round(k, 3), 'take': pick['take'],
                        'text': TEXT, 'st': [round(pick['start'] + v, 3) for v in st], 'en': [round(pick['start'] + v, 3) for v in en]}
    timing = {key: timing[key] for key in sorted(timing, key=int)}
    (v3.SCENES / 'voice-v3.json').write_text(json.dumps(timing) + '\n')
    print(f"take {report['take']} ×{k:.3f}: {report['first_word']:.2f}–{pick['end']:.2f} (limit {LIMIT:.2f}) | tried {tried}")
    print('heard:', ' '.join(w['text'] for w in words))


if __name__ == '__main__':
    main()
