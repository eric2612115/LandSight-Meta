"""Narration v3 (D-93): Eric's clone speaks the script rewritten for speech (narration-v3.json), and every line is fitted
to its v2 window. What changed from v2, and why:

  · Each request carries the neighbouring lines (previous_text / next_text), so the intonation runs on from line to line.
  · The clone is less steady (stability 0.5, style 0.2, speaker boost).
  · Pauses stay as spoken. Only a pause longer than 0.6 s is shortened, to 0.45 s, and only in its silent stretches, so a
    breath at a sentence break stays. (v2 cut every pause to 0.2 s.)
  · Up to three takes per line (line-<n>.mp3, line-<n>b.mp3, line-<n>c.mp3, each beside its character alignment). The
    first take that fits its window as spoken and passes an ElevenLabs speech-to-text check (scribe_v1, every word
    recognised) is used; else the least-long passing take if it is at most 5 % long, sped up (atempo ≤ 1.05, pitch
    kept); else a line with a filler word ("Just", "Here,", "just", "right") drops it and gets three more takes (d, e, f).
    A line that still cannot meet every rule keeps its best take and is flagged in picks.json.
  · The character times are ElevenLabs' alignment, carried through every cut and tempo change. Its grid is coarse and can
    put a word beside a pause ~0.3 s off, so where the word heard by speech-to-text starts more than 0.15 s away, the
    heard times win (the captions are timed from these).

The windows: a line starts at its v2 start and ends at least 0.2 s before the next line starts; line 25 may run to the end
of Part 2 and line 27 stays in the end hold, as in v2. Line 24's last phrase ("and drafts your reply …") is cut at the
comma before it and waits for the reply card, where v2 placed it. The v2 times are frozen in audio/voice-v3/windows.json
on the first run (from src/scenes/voice-v2-old.json, or voice-v2.json before the swap).

Writes audio/voice-v3/narration.wav (the narration stem, 48 kHz mono, every line at the level of Eric's own voice),
audio/voice-v3/picks.json (what was chosen and why) and src/scenes/voice-v3.json (voice-v2.json's schema: each line's
start, end, tempo, take, text and its characters' times in film seconds). scripts/audio-v3.py mixes the stem.

The key comes from the environment (ELEVENLABS_API_KEY) and is never printed; requests go through curl (the key on
curl's stdin, never on its command line).

    set -a; . <env file>; set +a; uv run python demo/film/scripts/voice-v3.py
"""
import base64
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / 'audio' / 'voice-v3'
SCENES = HERE / 'src' / 'scenes'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
SR = 48000
API = 'https://api.elevenlabs.io'
VOICE = (HERE / 'audio' / 'eric-clone' / 'voice_id_v2.txt').read_text().strip()
MODEL = 'eleven_v4'
# as specified for v3; GET /v1/models lists style and speaker boost as unsupported by eleven_v4, so those two likely do nothing
SETTINGS = {'stability': 0.5, 'similarity_boost': 0.9, 'style': 0.2, 'use_speaker_boost': True}
FORMAT = 'mp3_44100_192'
OVER, KEEP = 0.6, 0.45  # a pause longer than OVER is shortened to KEEP; every shorter one stays as spoken
MAX_TEMPO = 1.05
GAP = 0.2  # a line ends at least this long before the next one starts
GAPS = {7: 0.25}  # lines that need a longer breath before the next one
INSERT_AT, INSERT_S = 92.3, 6.0  # the private-mode beat (scripts/private-v3.py): every line from INSERT_AT on is 6 s later
PREFER = {7: 1.03}  # lines whose tempo should stay lower if a take allows (else MAX_TEMPO)
TAKES = ['', 'b', 'c']
EDIT_TAKES = ['d', 'e', 'f']  # the takes of a line after one filler word was dropped (EDITS)
EDITS: dict[int, str] = {}  # n → the line with one filler word dropped, when none of its three takes could fit
ERIC_3 = "I'm Eric, building Landsight, which makes it in ten minutes."  # Eric's own words just before line 4
SPLIT = {24: 'and drafts'}  # the phrase that waits for the reply card


def script() -> dict[int, str]:
    lines = json.loads((HERE / 'narration-v3.json').read_text())['lines']
    return {int(n): EDITS.get(int(n), t) for n, t in lines.items()}


def curl(url: str, args: list[str]) -> dict:
    """One API call through curl; the key goes in on stdin as a config line."""
    cfg = 'header = "xi-api-key: %s"\n' % os.environ['ELEVENLABS_API_KEY']
    p = subprocess.run(['curl', '-sS', '-K', '-', '-w', '\n%{http_code}', *args, url], input=cfg.encode(), capture_output=True)
    body, _, code = p.stdout.decode().rpartition('\n')
    if p.returncode or code != '200':
        raise RuntimeError(f'{url.split("?")[0]} → curl {p.returncode} HTTP {code}: {body[:300]} {p.stderr.decode()[:200]}')
    return json.loads(body)


def generate(n: int, take: str, text: str, prev: str | None, nxt: str | None) -> dict:
    """Speaks one line (with its neighbours as context); writes line-<n><take>.mp3 and .json."""
    meta = OUT / f'line-{n}{take}.json'
    if meta.exists():
        m = json.loads(meta.read_text())
        if m['request']['text'] == text:
            return m
    body = {'text': text, 'model_id': MODEL, 'voice_settings': SETTINGS}
    if prev:
        body['previous_text'] = prev
    if nxt:
        body['next_text'] = nxt
    tmp = OUT / '.request.json'
    tmp.write_text(json.dumps(body))
    d = curl(f'{API}/v1/text-to-speech/{VOICE}/with-timestamps?output_format={FORMAT}',
             ['-H', 'Content-Type: application/json', '--data-binary', f'@{tmp}'])
    tmp.unlink()
    (OUT / f'line-{n}{take}.mp3').write_bytes(base64.b64decode(d['audio_base64']))
    m = {'request': {**body, 'voice': VOICE, 'format': FORMAT}, 'alignment': d.get('alignment'), 'normalized_alignment': d.get('normalized_alignment')}
    meta.write_text(json.dumps(m, ensure_ascii=False) + '\n')
    print(f'  generated {n}{take or "a"}', flush=True)
    return m



def load(path) -> np.ndarray:
    cmd = [FFMPEG, '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).copy()


def save(path, x: np.ndarray, codec='pcm_f32le') -> None:
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-i', '-', '-c:a', codec, str(path)],
                   input=x.astype(np.float32).tobytes(), check=True)


def active_rms(x: np.ndarray) -> float:
    """The level of the speech itself (as audio-v2.py measures it), so lines and Eric's own voice can be matched."""
    hop = SR // 20
    r = np.sqrt((x[: len(x) // hop * hop].reshape(-1, hop) ** 2).mean(1) + 1e-12)
    act = r[r > 10 ** (-40 / 20) * r.max() * 10]
    return float(np.sqrt((act ** 2).mean())) if len(act) else float(r.mean())


def level(x: np.ndarray) -> np.ndarray:
    """dB per 10 ms frame, relative to the line's speaking level."""
    hop = SR // 100
    r = np.sqrt((np.pad(x, (0, (-len(x)) % hop)).reshape(-1, hop) ** 2).mean(1) + 1e-12)
    act = np.sqrt(np.mean(r[r > r.max() * 0.1] ** 2))
    return 20 * np.log10(r / act)


EDGE = 0.045  # silence kept at each edge of a cut
SURE, SPEECH, END_DB = -25, -30, -35  # over SURE dB a frame is speech, under SPEECH it is not a word; a line ends where its
# last word decays under END_DB (the decoder's last frame can click, so the end is found from the last sure frame)


def splice(x, a, b, xf=int(0.008 * SR)):
    """Removes x[a:b] (samples) with a short crossfade (inside silence, so nothing is heard)."""
    head, tail = x[:a].copy(), x[b - xf:]
    f = np.linspace(1, 0, xf, dtype=np.float32)
    head[-xf:] = head[-xf:] * f + tail[:xf] * (1 - f)
    return np.concatenate([head, tail[xf:]])


def shorten_pauses(x, chars, st, en):
    """Shortens each pause longer than OVER to KEEP, cutting only its silent stretches: a pause is a run of frames under
    SPEECH dB, and two runs around a short burst with no word in it (a breath) count as one pause, the breath kept."""
    db = level(x)
    loud = np.where(db[:-3] > SURE)[0]
    word_starts = [st[i] for i, c in enumerate(chars) if c.isalnum() and (i == 0 or not chars[i - 1].isalnum())]
    runs, k = [], loud[0]
    while k < loud[-1]:
        if db[k] <= SPEECH:
            j = k
            while db[j] <= SPEECH:
                j += 1
            if j - k >= 8:
                runs.append([k / 100, j / 100])
            k = j
        else:
            k += 1
    pauses = []
    for r in runs:
        p = pauses[-1] if pauses else None
        if p and r[0] - p[-1][1] < 0.4 and db[int(p[-1][1] * 100):int(r[0] * 100)].max() < -12 \
                and not any(p[-1][1] + 0.04 < w < r[0] - 0.04 for w in word_starts):
            p.append(r)  # silence · breath · silence
        else:
            pauses.append([r])
    cuts, found = [], []
    for p in pauses:
        length = p[-1][1] - p[0][0]
        found.append(round(length, 2))
        need = length - KEEP
        if length <= OVER:
            continue
        for a, b in p:  # from the first silence first, so a breath stays just before the next words
            take = min(need, max(0.0, (b - a) - 2 * EDGE))
            if take > 0.005:
                mid = a + EDGE + ((b - a) - 2 * EDGE) / 2
                cuts.append((float(mid - take / 2), float(mid + take / 2)))
                need -= take
    for a, b in sorted(cuts, reverse=True):
        x = splice(x, int(a * SR), int(b * SR))
        st = [t - (b - a) if t >= b else (a if t > a else t) for t in st]
        en = [t - (b - a) if t >= b else (a if t > a else t) for t in en]
    return x, st, en, [(round(a, 2), round(b - a, 2)) for a, b in sorted(cuts)], found


def end_of(db, until=None):
    """Seconds where the speech ends (the last sure frame, then its decay down to END_DB), before `until` if given."""
    hi = len(db) - 3 if until is None else int(until * 100)
    i = np.where(db[:hi] > SURE)[0][-1]
    while i + 1 < hi and db[i + 1] > END_DB:
        i += 1
    return (i + 1) / 100


def onset(db):
    i = np.where(db > SURE)[0][0]
    while i > 0 and db[i - 1] > END_DB:
        i -= 1
    return i / 100


def settle(chars, st, en, lo, hi, end):
    """The alignment's last word often runs on into the silence after it: squeeze chars lo..hi so they end with the speech."""
    w = hi
    while w > lo and not (chars[w].isalnum() and not chars[w - 1].isalnum()):
        w -= 1
    t0 = st[w]
    last = max(en[i] for i in range(lo, hi + 1))
    if last <= end:
        return
    for i in range(lo, hi + 1):
        for arr in (st, en):
            arr[i] = t0 + (arr[i] - t0) * (end - t0) / (last - t0) if t0 < end and arr[i] > t0 else min(arr[i], end)


def process(n: int, take: str, text: str) -> dict:
    """One take, its long pauses shortened; where the speech ends, and line 24's cut."""
    m = json.loads((OUT / f'line-{n}{take}.json').read_text())
    al = m['alignment']
    chars = al['characters']
    assert ''.join(chars) == text, f'line {n}{take}: alignment text differs'
    x = load(OUT / f'line-{n}{take}.mp3')
    x = x[: len(x) - int(0.1 * SR)]  # the decoded file ends with a short glitch, after ≥ 0.4 s of silence
    x, st, en, cuts, pauses = shorten_pauses(x, chars, list(al['character_start_times_seconds']), list(al['character_end_times_seconds']))
    db = level(x)
    p = {'n': n, 'take': take, 'text': text, 'x': x, 'st': st, 'en': en, 'cuts': cuts, 'pauses': pauses, 'on': onset(db), 'off': end_of(db)}
    last = max(i for i, c in enumerate(chars) if c.isalnum())
    if n in SPLIT:
        j = text.index(SPLIT[n])
        g = max(i for i in range(j) if chars[i].isalnum())  # the last letter before the comma
        a, b = int((st[j] - 0.6) * 100), int((st[j] + 0.05) * 100)
        cut = (a + int(np.argmin(db[a:b]))) / 100 + 0.005  # the quietest moment before it (a breath stays with what follows)
        p.update(j=j, cut=cut, off1=end_of(db, cut))
        settle(chars, st, en, 0, g, p['off1'])
        settle(chars, st, en, j, len(chars) - 1, p['off'])
    else:
        settle(chars, st, en, 0, len(chars) - 1, p['off'])
    p['last'] = last
    return p


def fits(p: dict, w: dict) -> float:
    """How much too long the take is for its window (1.0 or less: it fits as spoken)."""
    if 'cut' in p:
        first = p['off1'] / (w['split_at'] - GAP - (p['st'][p['j']] - p['cut']) - w['start'])
        second = (p['off'] - p['st'][p['j']]) / (w['limit'] - w['split_at'])
        return max(first, second)
    return p['off'] / (w['limit'] - w['start'])


def tempo(x: np.ndarray, k: float) -> np.ndarray:
    if abs(k - 1) < 1e-4:
        return x
    cmd = [FFMPEG, '-v', 'error', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-i', '-', '-af', f'atempo={k:.4f}', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(cmd, input=x.astype(np.float32).tobytes(), capture_output=True, check=True).stdout, np.float32).copy()


# speech-to-text check: the words of the line against the words heard (numbers as digits, British spelling as American)
UNITS = {w: i for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen '
                                    'fifteen sixteen seventeen eighteen nineteen'.split())}
TENS = {w: 10 * i for i, w in enumerate('_ _ twenty thirty forty fifty sixty seventy eighty ninety'.split()) if i > 1}
HEARD_AS = {'landside': 'landsight', 'landsite': 'landsight', 'muspark': 'musespark'}  # speech-to-text spellings of the names, accepted


def number(toks, i):
    total, cur, j, seen = 0, 0, i, False
    while j < len(toks):
        t = toks[j]
        if t.isdigit():
            if seen:
                break
            if j + 1 < len(toks) and toks[j + 1] == 'thousand':
                return int(t) * 1000, j + 2
            return int(t), j + 1
        if t == 'a' and not seen and j + 1 < len(toks) and toks[j + 1] in ('hundred', 'thousand'):
            cur, seen = 1, True
        elif t in UNITS and t != 'zero':
            u = UNITS[t]
            if seen and not (cur % 100 == 0 or (u < 10 and cur % 10 == 0 and cur % 100 >= 20)):
                break
            cur, seen = cur + u, True
        elif t in TENS:
            if seen and cur % 100:
                break
            cur, seen = cur + TENS[t], True
        elif t == 'hundred' and seen and 0 < cur < 100:
            cur *= 100
        elif t == 'thousand' and seen:
            total, cur = total + cur * 1000, 0
        elif t == 'and' and seen and cur >= 100 and cur % 100 == 0 and j + 1 < len(toks) and (toks[j + 1] in UNITS or toks[j + 1] in TENS):
            pass
        else:
            break
        j += 1
    return (total + cur, j) if seen else (None, i)


def words(s: str) -> list[str]:
    s = s.lower().replace('’', "'").replace('colour', 'color').replace('metre', 'meter').replace('analyse', 'analyze')
    s = re.sub(r'(?<=\d)[,.:](?=\d)', '', s)  # 10,000 · 1.20 · 3.1
    s = re.sub(r'[.,;:?!]', ' | ', s)  # numbers never run together across punctuation ("twelve. Eight")
    toks = [t.strip("'") for t in re.findall(r"[a-z0-9']+|\|", s)]
    toks = [t for t in toks if t]
    out, i = [], 0
    while i < len(toks):
        v, j = number(toks, i)
        if v is None:
            out.append(toks[i])
            i += 1
            continue
        if out and out[-1].isdigit():
            out[-1] += str(v)  # one-twenty → 120, three point one → 31
        elif len(out) > 1 and out[-1] == 'point' and out[-2].isdigit():
            out.pop()
            out[-1] += str(v)
        else:
            out.append(str(v))
        i = j
    joined = []
    for t in (t for t in out if t != '|'):
        t = HEARD_AS.get(t, t)
        if joined and (joined[-1], t) in (('land', 'sight'), ('land', 'side'), ('muse', 'spark'), ('mu', 'spark')):
            joined[-1] = 'landsight' if joined[-1] == 'land' else 'musespark'
        else:
            joined.append(t)
    return joined


def heard(n: int, take: str, x: np.ndarray) -> list[dict]:
    """scribe_v1 on the line as it will be used (cached by its audio)."""
    h = hashlib.sha1(x.astype(np.float32).tobytes()).hexdigest()
    f = OUT / f'stt-{n}{take}.json'
    if f.exists() and json.loads(f.read_text()).get('sha1') == h:
        return json.loads(f.read_text())['words']
    tmp = OUT / f'.check-{n}{take}.flac'
    save(tmp, x, 'flac')
    d = curl(f'{API}/v1/speech-to-text', ['-F', 'model_id=scribe_v1', '-F', 'timestamps_granularity=word', '-F', 'tag_audio_events=false',
                                         '-F', 'language_code=en', '-F', f'file=@{tmp}'])
    tmp.unlink()
    ws = [{'text': w['text'], 'start': w['start'], 'end': w['end']} for w in d['words'] if w.get('type') == 'word']
    f.write_text(json.dumps({'sha1': h, 'text': d.get('text'), 'words': ws}, ensure_ascii=False) + '\n')
    return ws


def check(text: str, ws: list[dict]) -> tuple[list[str], list[str]]:
    """The script's words not heard, and words heard that are not in the script."""
    ref, hyp = words(text), words(' '.join(w['text'] for w in ws))
    missing, extra = [], []
    for op, a, b, c, d in difflib.SequenceMatcher(None, ref, hyp, autojunk=False).get_opcodes():
        if op != 'equal':
            missing += ref[a:b]
            extra += hyp[c:d]
    return missing, extra


def retime(text: str, st: list, en: list, ws: list[dict], tol=0.15) -> list[str]:
    """ElevenLabs' alignment runs on a coarse grid and can place a word beside a pause ~0.3 s off. Where the word heard
    by speech-to-text (in the same audio) starts more than `tol` away, the word's letters take the heard times; then every
    character is kept in order. Returns the words moved."""
    spans = [(m.start(), m.end()) for m in re.finditer(r'\S+', text)]
    norm = lambda w: re.sub(r"[^a-z0-9']", '', w.lower().replace('\u2019', "'")).strip("'")
    moved = []
    sm = difflib.SequenceMatcher(None, [norm(text[a:b]) for a, b in spans], [norm(w['text']) for w in ws], autojunk=False)
    for blk in sm.get_matching_blocks():
        for q in range(blk.size):
            a, b = spans[blk.a + q]
            w = ws[blk.b + q]
            idx = [i for i in range(a, b) if text[i].isalnum()]
            if not idx or abs(st[idx[0]] - w['start']) <= tol:
                continue
            moved.append(f"{text[a:b]} {w['start'] - st[idx[0]]:+.2f}s")
            step = (w['end'] - w['start']) / len(idx)
            for r, i in enumerate(idx):
                st[i], en[i] = w['start'] + r * step, w['start'] + (r + 1) * step
    for i in range(len(st) - 2, -1, -1):
        st[i] = min(st[i], st[i + 1])
    for i in range(len(st) - 1):
        en[i] = min(max(en[i], st[i]), st[i + 1])
    return moved


FILLERS = [(r'^Just (\w)', lambda m: m.group(1).upper()), (r'^Here, (\w)', lambda m: m.group(1).upper()), (r' just\b', ''), (r' right\b', '')]


def drop_filler(text: str) -> str | None:
    for pat, rep in FILLERS:
        new = re.sub(pat, rep, text, count=1)
        if new != text:
            return new
    return None


def windows() -> dict[int, dict]:
    """Each line's v2 start and how late it may end (frozen on the first run, before the v2 file is swapped)."""
    f = OUT / 'windows.json'
    if not f.exists():
        old = SCENES / 'voice-v2-old.json'
        v2 = json.loads((old if old.exists() else SCENES / 'voice-v2.json').read_text())
        assert v2['4']['text'] != script()[4], 'voice-v2.json already holds v3; restore voice-v2-old.json first'
        tl = json.loads((HERE / 'audio' / 'voice-v2' / 'timeline.json').read_text())
        ns = sorted(int(k) for k in v2)
        w = {}
        for i, n in enumerate(ns):
            start = v2[str(n)]['start']
            limit = v2[str(ns[i + 1])]['start'] - GAPS.get(n, GAP) if i + 1 < len(ns) else tl['duration'] - 0.5 - GAP  # 27: the end hold, as v2
            if n == 25:
                limit = tl['close']  # to the end of Part 2
            w[n] = {'start': start, 'limit': round(limit, 3)}
            if n in SPLIT:
                t = v2[str(n)]['text']
                w[n]['split_at'] = v2[str(n)]['st'][t.index(SPLIT[n])]  # where v2 placed "and drafts …"
        f.write_text(json.dumps(w, indent=1) + '\n')
    w = {int(k): v for k, v in json.loads(f.read_text()).items()}
    for n, x in w.items():  # the frozen v2 times, moved for the private-mode beat
        if x['start'] >= INSERT_AT:
            x['start'] = round(x['start'] + INSERT_S, 3)
            x['limit'] = round(x['limit'] + INSERT_S, 3)
            if 'split_at' in x:
                x['split_at'] = round(x['split_at'] + INSERT_S, 3)
        elif x['limit'] > INSERT_AT - GAP:
            x['limit'] = round(INSERT_AT - GAP, 3)  # the line before the beat ends before it
    return w


def choose(n: int, text: str, w: dict, ctx) -> dict:
    """The first take that fits as spoken and passes the speech-to-text check; else the least-long passing take if it
    is at most 5 % long (sped up); else, if the line has a filler word, the same with that word dropped. When no take
    meets every rule, the best one is used and reported: the least-long passing take at the tempo cap (it then ends
    less than GAP before the next line), or, when no take passes, the take with the fewest words not heard."""
    tried = []

    def stt(p, k):
        ws = heard(n, p['take'], tempo(p['x'], k))
        p['k'], p['ws'] = k, ws
        p['missing'], p['extra'] = check(p['text'], ws)
        p['heard'] = ' '.join(x['text'] for x in ws)
        p['verdict'] = ('fits' if p['over'] <= 1 else f'{p["over"]:.3f} long') + (f' · not heard {p["missing"]} · extra {p["extra"]}' if p['missing'] or p['extra'] else ' · heard')
        return not p['missing'] and not p['extra']

    for takes, t in ((TAKES, text), (EDIT_TAKES, drop_filler(text))):
        if t is None:
            break
        for take in takes:
            generate(n, take, t, *ctx)
            p = process(n, take, t)
            p['over'] = fits(p, w)
            p['verdict'] = 'fits' if p['over'] <= 1 else f'{p["over"]:.3f} long'
            tried.append(p)
            if p['over'] <= 1 and stt(p, 1.0):
                return {**p, 'tried': tried, 'why': 'fits as spoken'}
        for cap in sorted({PREFER.get(n, MAX_TEMPO), MAX_TEMPO}):
            near = sorted((p for p in tried if p['text'] == t and 1 < p['over'] <= cap and 'k' not in p), key=lambda p: p['over'])
            for p in near:
                if stt(p, min(cap, p['over'] * 1.002)):
                    return {**p, 'tried': tried, 'why': f'least-long take, sped up ×{p["k"]:.3f}'}
    for p in tried:
        if 'k' not in p:
            stt(p, min(MAX_TEMPO, max(1.0, p['over'] * 1.002)))
    passing = [p for p in tried if not p['missing'] and not p['extra']]
    if passing:
        p = min(passing, key=lambda p: p['over'])
        return {**p, 'tried': tried, 'why': f'NO TAKE FITS: least-long passing take at ×{p["k"]:.3f}', 'flag': True}
    p = min(tried, key=lambda p: (len(p['missing']) + len(p['extra']), max(1.0, p['over'])))
    return {**p, 'tried': tried, 'why': f'NO TAKE PASSES speech-to-text: fewest words not heard ({p["missing"]} heard as {p["extra"]})', 'flag': True}


def place(buf, x, t):
    i = int(round(t * SR))
    buf[i:i + len(x)] += x[: max(0, len(buf) - i)]


def fade(x, out=True, s=0.06):
    k = min(len(x), int(s * SR))
    r = np.linspace(1, 0, k, dtype=np.float32) if out else np.linspace(0, 1, k, dtype=np.float32)
    if out:
        x[-k:] *= r
    else:
        x[:k] *= r
    return x


def main() -> None:
    OUT.mkdir(exist_ok=True)
    s, W = script(), windows()
    ns = sorted(s)
    tl = json.loads((HERE / 'audio' / 'voice-v2' / 'timeline.json').read_text())
    ref = active_rms(load(HERE / 'audio' / 'eric-live' / 'b-voice.wav'))
    stem = np.zeros(int((tl['duration'] + INSERT_S) * SR) + SR, np.float32)  # the film is INSERT_S longer than V2's
    timing, picks = {}, {}
    for i, n in enumerate(ns):
        ctx = (s[ns[i - 1]] if i else ERIC_3, s[ns[i + 1]] if i + 1 < len(ns) else None)
        p = choose(n, s[n], W[n], ctx)
        for q in p['tried']:
            print(f"{n:>2}{q['take'] or 'a'}  {q['verdict']}  pauses {[float(v) for v in q['pauses']]}" + (f"  cut {q['cuts']}" if q['cuts'] else ''))
        print(f"   → {p['take'] or 'a'}: {p['why']}")
        k, w = p['k'], W[n]
        x = tempo(p['x'], k)
        x = x * (ref / active_rms(x))
        st = [t / k for t in p['st']]
        en = [t / k for t in p['en']]
        moved = retime(p['text'], st, en, p['ws'])
        if 'cut' in p:
            c, j = p['cut'] / k, p['j']
            a = fade(x[: int((min(p['off1'] / k + 0.12, c)) * SR)].copy())
            b = fade(fade(x[int(c * SR): int((p['off'] / k + 0.12) * SR)].copy(), out=False, s=0.01))
            shift = w['split_at'] - w['start'] - st[j]  # "and drafts" lands where v2 had it
            place(stem, a, w['start'])
            place(stem, b, w['start'] + c + shift)
            st = [v + (shift if q >= j else 0) for q, v in enumerate(st)]
            en = [v + (shift if q >= j else 0) for q, v in enumerate(en)]
            end = w['start'] + p['off'] / k + shift
            part1_end = w['start'] + p['off1'] / k
        else:
            x = fade(x[: int((p['off'] / k + 0.12) * SR)].copy())
            place(stem, x, w['start'])
            end = w['start'] + p['off'] / k
        st = [round(w['start'] + v, 3) for v in st]
        en = [round(w['start'] + v, 3) for v in en]
        timing[str(n)] = {'start': w['start'], 'end': round(end, 3), 'tempo': round(k, 3), 'take': p['take'], 'text': p['text'], 'st': st, 'en': en}
        picks[str(n)] = {'take': p['take'] or 'a', 'text': p['text'], 'edited': p['text'] != s[n], 'tempo': round(k, 3),
                         'spoken': round(p['off'], 2), 'window': round(w['limit'] - w['start'], 2), 'start': w['start'], 'end': round(end, 3),
                         'limit': w['limit'], 'past_limit': round(max(0.0, end - w['limit']), 3), 'why': p['why'], 'flag': p.get('flag', False),
                         'retimed': moved, 'pauses': [float(v) for v in p['pauses']], 'cuts': [(float(a), float(b)) for a, b in p['cuts']], 'heard': p['heard'],
                         'tried': [{'take': q['take'] or 'a', 'verdict': q['verdict']} for q in p['tried']]}
        if 'cut' in p:
            picks[str(n)].update(part1_end=round(part1_end, 3), part2_at=round(w['split_at'], 3))
    for n in ns:
        q = picks[str(n)]
        print(f"{n:>2} {q['take']}  spoken {q['spoken']:5.2f}s · window {q['window']:5.2f}s · ×{q['tempo']:.3f} · {q['start']:7.3f}–{q['end']:7.3f}"
              f" (limit {q['limit']:7.3f}{', PAST ' + str(q['past_limit']) + ' s' if q['past_limit'] else ''}){'  EDITED' if q['edited'] else ''}{'  FLAG' if q['flag'] else ''}")
    save(OUT / 'narration.wav', stem)
    (OUT / 'picks.json').write_text(json.dumps(picks, indent=1, ensure_ascii=False) + '\n')
    old = SCENES / 'voice-v3.json'
    if old.exists():  # the opening's entries (scripts/opening-v3.py) are kept
        timing = {**{k: v for k, v in json.loads(old.read_text()).items() if k not in timing}, **timing}
        timing = {k: timing[k] for k in sorted(timing, key=int)}
    (SCENES / 'voice-v3.json').write_text(json.dumps(timing) + '\n')
    print('wrote audio/voice-v3/narration.wav, audio/voice-v3/picks.json, src/scenes/voice-v3.json')


if __name__ == '__main__':
    main()
