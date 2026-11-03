"""The opening, spoken by Eric's clone (he no longer appears on camera, so his recorded voice gives way to the voice of the
narration): four lines, placed so the key words land on the cold open's number cards, each a beat after the clap on the
card ("thirty" 5.1, "two" 8.4, "ten" 13.0; the word starts LAG after the card).

Same voice, model, settings and neighbouring-line context as the narration (scripts/voice-v3.py, whose functions this
uses); the last line's next_text is narration line 4. Up to three takes per line: the first take that can be placed (gaps
of at least 0.2 s between the lines, the briefed starts and ends kept) and passes the speech-to-text check (scribe_v1,
every word heard) is used; its word times (scribe's) place it. A line may be sped up (atempo ≤ 1.05), and the pause after
"I'm Eric." may be lengthened so the line starts near 9.2 s.

Writes audio/voice-v3/opening.wav (the opening's stem, 48 kHz mono, at the narration's level), audio/voice-v3/opening.json
(what was chosen), and entries 1–3 of src/scenes/voice-v3.json (the opening as captioned: 1; 2 = lines 2 and 3, one sentence;
3), timed to the words like the narration.

    set -a; . <env file>; set +a; uv run python demo/film/scripts/opening-v3.py
"""
import importlib.util
import json
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('voice_v3', Path(__file__).with_name('voice-v3.py'))
v3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v3)
SR, OUT = v3.SR, v3.OUT

LINES = [
    ('o1', 'Every building gets approved on drawings like these.'),
    ('o2', 'A landscape package is thirty files,'),
    ('o3', 'and checking it by hand takes about two weeks.'),
    ('o4', "I'm Eric. I built Landsight to do it in ten minutes."),
]
KEY = {'o2': ('thirty', 5.1), 'o3': ('two', 8.4), 'o4': ('ten', 13.0)}  # the card each key word lands on
LAG = 0.1  # the word starts this long after its card (and its clap), within the briefed ±0.2 s
FIRST = 0.5  # line 1's first word (it may start up to 0.2 s earlier to end in time)
# (first word no earlier, end no later): the brief's "about" times; with the key words anchored on the cards, "two weeks."
# cannot end by 8.8 nor "ten minutes." by 13.6 (their final "s" runs ~0.85 s past the number in every take), so those ends
# are 9.35 and 14.0 (the push's impact is at 14.9, the narration resumes at 15.2)
BRIEF = {'o1': (0.3, 2.85), 'o2': (3.0, None), 'o3': (None, 9.35), 'o4': (9.0, 14.0)}
GAP = 0.2
PAUSE_AFTER = {'o4': ('Eric.', 9.2)}  # the pause that may be lengthened (by up to MAX_PAUSE) so the line starts near that time
MAX_PAUSE = 0.8
CAPTIONED = {1: ['o1'], 2: ['o2', 'o3'], 3: ['o4']}


def word_start(ws, word):
    for w in ws:
        if v3.words(w['text']) and v3.words(w['text'])[0] == v3.words(word)[0]:
            return w['start']
    raise KeyError(word)


def lengthen(p, ws, after, extra):
    """Inserts `extra` seconds of silence in the pause after the word `after` (at its quietest point)."""
    i = next(k for k, w in enumerate(ws) if w['text'].rstrip(',.') == after.rstrip(',.'))
    a, b = ws[i]['end'], ws[i + 1]['start']
    db = v3.level(p['x'])
    lo, hi = int(a * 100), max(int(a * 100) + 1, int(b * 100))
    t = (lo + int(np.argmin(db[lo:hi]))) / 100
    j = int(t * SR)
    p['x'] = np.concatenate([p['x'][:j], np.zeros(int(extra * SR), np.float32), p['x'][j:]])
    p['st'] = [s + extra if s >= t else s for s in p['st']]
    p['en'] = [e + extra if e > t else e for e in p['en']]
    p['off'] += extra
    for w in ws:
        if w['start'] >= t:
            w['start'] += extra
            w['end'] += extra
    return t


def place(n, p, ws, prev_end):
    """Where the line starts (film s, its audio), from its key word or its first word, where it ends, and whether it meets
    the brief."""
    lo, hi = BRIEF[n]
    on = ws[0]['start']
    if n in KEY:
        word, card = KEY[n]
        start = card + LAG - word_start(ws, word)
    else:
        start = max(lo - on, min(FIRST - on, hi - p['off']))
    end = start + p['off']
    ok = (lo is None or start + on >= lo - 1e-6) and (hi is None or end <= hi + 1e-6) and (prev_end is None or start + on >= prev_end + GAP)
    return start, end, ok


def main():
    narr = v3.script()
    texts = [t for _, t in LINES]
    ref = v3.active_rms(v3.load(v3.HERE / 'audio' / 'eric-live' / 'b-voice.wav'))
    tl = json.loads((v3.HERE / 'audio' / 'voice-v2' / 'timeline.json').read_text())
    stem = np.zeros(int(tl['duration'] * SR) + SR, np.float32)
    chosen, prev_end, report = {}, None, {}
    for i, (n, text) in enumerate(LINES):
        ctx = (texts[i - 1] if i else None, texts[i + 1] if i + 1 < len(texts) else narr[4])
        tried, pick = [], None
        for take in v3.TAKES:
            v3.generate(n, take, text, *ctx)
            for k in (1.0, 1.025, 1.05):
                p = v3.process(n, take, text)
                x = v3.tempo(p['x'], k)
                p['x'], p['st'], p['en'], p['off'] = x, [s / k for s in p['st']], [e / k for e in p['en']], p['off'] / k
                ws = [dict(w) for w in v3.heard(n, take, x)]
                missing, extra = v3.check(text, ws)
                note = f'{take or "a"} ×{k:.3f}'
                if missing or extra:
                    tried.append(f'{note}: not heard {missing}, extra {extra}')
                    break
                inserted = 0.0
                start, end, ok = place(n, p, ws, prev_end)
                if n in PAUSE_AFTER:  # start near the briefed time by lengthening the pause after "I'm Eric."
                    after, near = PAUSE_AFTER[n]
                    want = max(near, (prev_end or 0) + GAP)
                    late = (start + ws[0]['start']) - want
                    if late > 0.25:
                        inserted = min(late, MAX_PAUSE)
                        lengthen(p, ws, after, inserted)
                        start, end, ok = place(n, p, ws, prev_end)
                tried.append(f'{note}: starts {start + ws[0]["start"]:.2f}, ends {end:.2f}' + (f', pause +{inserted:.2f}' if inserted else '') + ('' if ok else ' (outside the brief)'))
                if ok:
                    pick = dict(p=p, ws=ws, k=k, take=take, start=start, end=end, inserted=inserted)
                    break
            if pick:
                break
        if not pick:
            raise SystemExit(f'{n}: no take fits: {tried}')
        p, ws = pick['p'], pick['ws']
        st, en = list(p['st']), list(p['en'])
        v3.retime(text, st, en, ws)
        x = p['x'][: int((p['off'] + 0.12) * SR)].copy()
        x = v3.fade(x) * (ref / v3.active_rms(p['x']))
        v3.place(stem, x, pick['start'])
        chosen[n] = {'text': text, 'take': pick['take'] or 'a', 'tempo': round(pick['k'], 3), 'start': round(pick['start'], 3),
                     'end': round(pick['end'], 3), 'st': [round(pick['start'] + s, 3) for s in st], 'en': [round(pick['start'] + e, 3) for e in en]}
        key = {}
        if n in KEY:
            word, card = KEY[n]
            key = {'word': word, 'card': card, 'heard_at': round(pick['start'] + word_start(ws, word), 3)}
        report[n] = {'take': pick['take'] or 'a', 'tempo': round(pick['k'], 3), 'first_word': round(pick['start'] + ws[0]['start'], 3),
                     'end': round(pick['end'], 3), 'pause_added': round(pick['inserted'], 2), 'key': key, 'tried': tried,
                     'heard': ' '.join(w['text'] for w in ws)}
        prev_end = pick['end']
        print(f"{n} take {pick['take'] or 'a'} ×{pick['k']:.3f}: {report[n]['first_word']:.2f}–{pick['end']:.2f}"
              + (f" · {key['word']} at {key['heard_at']:.2f} (card {key['card']})" if key else '') + (f" · pause +{pick['inserted']:.2f}" if pick['inserted'] else '')
              + f" | tried {tried}")
    v3.save(OUT / 'opening.wav', stem)
    (OUT / 'opening.json').write_text(json.dumps(report, indent=1) + '\n')
    timing = json.loads((v3.SCENES / 'voice-v3.json').read_text())
    for cap, parts in CAPTIONED.items():
        c = [chosen[n] for n in parts]
        text, st, en = c[0]['text'], list(c[0]['st']), list(c[0]['en'])
        for d in c[1:]:  # one sentence over two lines: the space between them spans the pause
            text += ' ' + d['text']
            st, en = st + [en[-1]], en + [d['st'][0]]
            st, en = st + d['st'], en + d['en']
        timing[str(cap)] = {'start': c[0]['start'], 'end': c[-1]['end'], 'tempo': max(d['tempo'] for d in c),
                            'take': '+'.join(d['take'] for d in c), 'text': text, 'st': st, 'en': en}
    timing = {k: timing[k] for k in sorted(timing, key=int)}
    (v3.SCENES / 'voice-v3.json').write_text(json.dumps(timing) + '\n')
    print('wrote audio/voice-v3/opening.wav, audio/voice-v3/opening.json, entries 1–3 of src/scenes/voice-v3.json')


if __name__ == '__main__':
    main()
