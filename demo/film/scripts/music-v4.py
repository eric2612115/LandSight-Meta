"""The score of Film v6 (two variants for Eric to choose) and its effects.

  · Music: one instrumental piece per variant, written from a composition plan whose sections
    follow the cut (the cold open's gates, the build, the explanations, the type card, Part 2, the night end, the logo).
    A: cinematic electronic. B: cinematic minimal (felt piano, strings, percussive hits).
  · Effects: risers into the cold open's numbers, the push's whoosh and impact, build ticks,
    the material shimmer, soft whooshes, restrained impacts, the swell into the night. Part 2's clicks and the card's hit
    are V2's (audio/sfx-v2).
Writes audio/music-v4/<variant>.mp3 (+ the request beside it) and audio/sfx-v4/<name>.mp3. Files already made with the
same request are kept. The key comes from the environment (SPEECH_API_KEY), on curl's stdin, and is never printed.

    set -a; . <env file>; set +a; uv run python demo/film/scripts/music-v4.py [A] [B] [sfx]
"""
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
MUSIC = HERE / 'audio' / 'music-v4'
SFX = HERE / 'audio' / 'sfx-v4'
API = os.environ['SPEECH_API_BASE'].rstrip('/')
END = 166.322  # the film's length (V2's timeline)
LOGO = 162.95  # the logo starts to fade in (LOGO_AT); sets the pieces' lengths only: audio-v4.py lands the final chord at 163.3, the logo fully in

# The pieces: one per stretch between hard cuts, each placed exactly at its cut, so the drop lands on the push (14.9), Part 2
# starts on its cut (94.1) and the night on its cut (155.3). A piece runs `over` seconds past its cut and is trimmed there.
# (One piece for the whole film was tried first, audio/music-v4/<v>-whole.mp3: its sections drift by seconds, e.g. A's beat
# drops near 16-20 s and its logo section is silent.) Sections are ≥ 3 s (the API's minimum), so the card's starts at 91.1.
# piece → (start, end, over, [(section, start, end)]) in film seconds
PIECES = {
    'cold': (0.0, 14.9, 1.0, [('Glide', 0.0, 3.0), ('Thirty files', 3.0, 9.0), ('Ten minutes', 9.0, 15.9)]),
    'build': (14.9, 94.1, 0.0, [('The build', 14.9, 21.0), ('Explanations', 21.0, 91.1), ('Card', 91.1, 94.1)]),
    'product': (94.1, 155.3, 4.3, [('Product', 94.1, 159.6)]),
    'swell': (155.3, LOGO, 0.55, [('Night end', 155.3, LOGO + 0.55)]),
    'logo': (LOGO, END, 0.68, [('Logo', LOGO, END + 0.68)]),
    # the private-mode beat (C2 only), 6 s from 92.3, before the type card: asked 8 s so its own ending falls after the cut
    'private': (92.3, 98.3, 2.0, [('Private', 92.3, 100.3)]),
}
# take 1 of product and night (…-take1.mp3) ended 4 s early or went silent before the logo, so Part 2 asks for 4 s more and
# the end is two pieces: a swell cut at the logo, and the final chord placed on the logo as it fades in

# take 2 of C2's cold open, Part 2 and night swell (take 1: …-take1.mp3) faded 1–3 s before their cuts: asked longer, so
# their own endings fall after the cut (seconds added to the piece's last section). Take 2 of the cold open still peaked
# near 12 s, so take 3 is longer again (its climax lands later); take 2 of Part 2 opened on 8 s of silence: take 3, same ask.
LONGER = {'C2': {'cold': 4.8, 'product': 3.2, 'swell': 2.95, 'private': 3.0}}  # private take 1 faded by 4.75 s of its 6

NEG = ['vocals', 'singing', 'choir', 'spoken word', 'busy lead melody', 'distortion', 'aggressive EDM drop', 'dubstep', 'cheesy', 'lo-fi']
GLOBAL = {
    'A': (['cinematic electronic', 'premium product film score', 'instrumental', 'pulsing synth arpeggio', 'warm analog synthesizers',
           'deep clean sub bass', 'modern, precise, confident', '104 BPM', 'key of D minor'], NEG),
    'B': (['cinematic minimal', 'felt piano', 'warm string ensemble', 'subtle percussive hits', 'premium product film score', 'instrumental',
           'intimate and modern', '92 BPM', 'key of D major'], NEG + ['electronic drums', 'epic trailer brass']),
    # C2 (Eric's pick of the clap-driven redo): minimal electronic with claps and finger snaps, like a keynote product film
    'C2': (['minimal electronic', 'crisp hand claps and finger snaps', 'tight clean kick', 'a simple synth motif', 'keynote product film',
            'crisp, clean, modern, premium', 'instrumental', '116 BPM', 'key of A minor'], NEG + ['vocal chops', 'busy hi-hats']),
}
SECTIONS = {
    'C2': {
        'Glide': (['a simple soft synth motif alone', 'one soft finger snap on each bar', 'airy and calm'], ['kick', 'claps', 'drums']),
        'Thirty files': (['finger snaps on every beat', 'the synth motif repeats', 'soft claps join', 'slowly building'], ['kick', 'full beat']),
        'Ten minutes': (['claps on every beat, building faster', 'a tight kick enters', 'rising energy, still building at the very end'],
                        ['ending', 'fade out', 'silence', 'breakdown']),
        'The build': (['starts at once on the downbeat with a tight kick and a big clap', 'the full kick, clap and snap pattern from the first bar',
                       'claps on beats 2 and 4', 'a simple synth motif', 'crisp and confident'], ['intro', 'fade in', 'silence']),
        'Explanations': (['a steady minimal groove', 'a tight kick on every beat', 'crisp claps on beats 2 and 4', 'finger snaps on the offbeats',
                          'a short clap fill every eight bars', 'a simple, sparse synth motif', 'leaves room for a voice-over', 'mid-range kept clear'],
                         ['busy', 'lead melody', 'loud', 'big build-ups', 'risers', 'breakdown', 'silence']),
        'Card': (['the beat stops', 'one sustained synth note', 'a breath'], ['claps', 'kick', 'snaps', 'drums']),
        'Private': (['starts at once on the downbeat', 'the same light groove carries on, calmer and confident', 'a low warm pulse',
                     'claps thinned out, only on beat 4', 'a soft synth pad', 'steady, keeps going to the very end'],
                    ['intro', 'fade in', 'busy', 'drop', 'build-up', 'risers', 'ending', 'fade out', 'silence']),
        'Product': (['starts at once', 'lighter', 'claps on beats 2 and 4 and finger snaps', 'soft plucked synths', 'no kick', 'bright and clean',
                     'keeps going to the very end'], ['intro', 'ending', 'fade out', 'heavy bass', 'busy lead', 'silence']),
        'Night end': (['starts softly at once', 'no claps, no snaps, no kick', 'an emotional swell of warm pads and synth strings that keeps rising to the very end',
                       'hopeful'], ['claps', 'snaps', 'drums', 'ending', 'fade out', 'silence', 'resolution']),
        'Logo': (['starts at once with one final warm sustained synth chord that resolves everything', 'the chord holds and slowly fades'],
                 ['intro', 'silence', 'new ideas', 'claps', 'drums']),
    },
    'A': {
        'Glide': (['soft warm pad', 'a gentle pulsing arpeggio, filtered', 'intimate, low energy'], ['drums']),
        'Thirty files': (['the arpeggio builds, filter slowly opening', 'light ticking percussion', 'rising tension'], ['full drums']),
        'Ten minutes': (['brighter arpeggio', 'suspended chords', 'anticipation building, still rising at the very end'], ['full beat', 'ending']),
        'The build': (['starts at once with a deep sub bass hit on the very first beat', 'the full beat is in from the first bar',
                       'driving mid-tempo electronic groove', 'wide shimmering synths', 'uplifting'], ['intro', 'fade in', 'harsh']),
        'Explanations': (['steady mid-tempo groove', 'minimal and warm', 'soft kick and light hats', 'muted bass pulse', 'sparse arpeggio',
                          'leaves room for a voice-over', 'slowly evolving textures'], ['lead melody', 'busy', 'loud drums', 'big build-ups']),
        'Card': (['the groove drops away', 'one sustained low note', 'a breath'], ['drums', 'melody']),
        'Product': (['starts at once', 'lighter and rhythmic', 'bright plucked synths', 'light percussion', 'airy, modern, curious',
                     'unobtrusive under a voice-over', 'keeps going to the very end'], ['intro', 'heavy bass', 'busy lead', 'ending', 'fade out']),
        'Night end': (['starts softly at once', 'an emotional swell that keeps rising to the very end', 'warm wide pads', 'soaring synth strings', 'hopeful'],
                      ['drums', 'silence', 'ending', 'fade out', 'resolution']),
        'Logo': (['starts at once with one final warm sustained chord that resolves everything', 'the chord holds and slowly fades'],
                 ['intro', 'silence', 'new ideas', 'drums']),
    },
    'B': {
        'Glide': (['solo felt piano', 'soft, warm, sparse notes'], ['drums', 'strings']),
        'Thirty files': (['a felt piano ostinato begins', 'low strings enter', 'soft percussive taps', 'gentle tension building'], ['loud']),
        'Ten minutes': (['strings swell', 'staccato strings', 'rising tension that keeps building to the very end'], ['full percussion', 'ending', 'fade out', 'silence']),
        'The build': (['starts at once with a deep percussive hit on the very first beat', 'pulsing staccato strings and piano from the first bar',
                       'soft low drum hits', 'forward momentum', 'uplifting'], ['intro', 'fade in', 'harsh']),
        'Explanations': (['steady gentle pulse', 'felt piano ostinato', 'soft string pads', 'light percussive ticks', 'minimal',
                          'leaves room for a voice-over'], ['lead melody', 'busy', 'loud percussion', 'big build-ups']),
        'Card': (['everything drops away', 'one sustained low string note', 'a breath'], ['percussion', 'melody']),
        'Product': (['starts at once', 'lighter and rhythmic', 'plucked strings and felt piano', 'light percussion', 'bright and curious',
                     'unobtrusive under a voice-over', 'keeps going to the very end'], ['intro', 'heavy', 'busy lead', 'ending', 'fade out']),
        'Night end': (['starts softly at once', 'an emotional swell that keeps rising to the very end', 'full warm strings', 'a simple piano melody', 'hopeful'],
                      ['percussion', 'silence', 'ending', 'fade out', 'resolution']),
        'Logo': (['starts at once with one final sustained chord of strings and piano that resolves everything', 'the chord holds and slowly fades'],
                 ['intro', 'silence', 'new ideas', 'percussion']),
    },
}

# name → (prompt, seconds, prompt influence)
EFFECTS = {
    'riser': ('Soft cinematic riser, airy filtered noise swelling up smoothly, ends cleanly at its peak, no impact', 1.8, 0.6),
    'push': ('Cinematic whoosh rushing forward into a deep sub bass impact boom, clean, premium, short tail', 2.4, 0.6),
    'tick': ('One delicate soft glassy tick, a tiny clean click, very short, close and dry', 0.5, 0.7),
    'shimmer': ('Soft magical shimmer sweeping upward, glassy sparkles, airy and light, gentle', 1.6, 0.6),
    'whoosh': ('Very soft airy whoosh, a gentle transition swish, smooth, no impact', 1.2, 0.6),
    'impact': ('Restrained soft cinematic impact, a low muted thud with a short warm tail, subtle', 1.5, 0.6),
    'swell': ('Reverse cymbal swell rising smoothly into a hard stop, soft and cinematic', 2.2, 0.6),
    # the clap accents on the cuts (C2)
    # take 1 of clap, groupclap, stomp and clapfill (…-take1.mp3) came back as faint tails with the attack cut at 0 s
    'clap': ('A short silence, then one single loud crisp hand clap, tight and dry, studio close-up', 1.0, 0.8),
    'snap': ('One crisp finger snap, close and dry, very short', 0.5, 0.7),
    'groupclap': ('A short silence, then one loud big group hand clap, many people clapping exactly together once, punchy', 1.0, 0.8),
    'stomp': ('A short silence, then one loud single foot stomp thump on a wooden floor, close microphone, dry, punchy low end', 1.0, 0.9),
    'clapfill': ('A short silence, then a quick hand clap fill: four fast tight claps accelerating, dry', 1.0, 0.8),
    'bigclap': ('One huge group hand clap with a bright shimmering reverb tail', 1.5, 0.6),
    'lock': ('A short silence, then one soft clean click of a small switch or padlock locking into place, close and dry', 1.0, 0.8),
}


def curl(url: str, body: dict, out: Path) -> None:
    cfg = 'header = "%s: %s"\n' % (os.environ['SPEECH_API_HEADER'], os.environ['SPEECH_API_KEY'])
    tmp = out.with_suffix('.request.tmp')
    tmp.write_text(json.dumps(body))
    p = subprocess.run(['curl', '-sS', '-K', '-', '-w', '%{http_code}', '-o', str(out), '-H', 'Content-Type: application/json',
                        '--data-binary', f'@{tmp}', url], input=cfg.encode(), capture_output=True)
    tmp.unlink()
    code = p.stdout.decode().strip()
    if p.returncode or code != '200':
        msg = out.read_bytes()[:600].decode(errors='replace') if out.exists() else p.stderr.decode()[:300]
        out.unlink(missing_ok=True)
        raise RuntimeError(f'{url.split("?")[0]} → HTTP {code}: {msg}')


def plan(v: str, piece: str) -> dict:
    pos, neg = GLOBAL[v]
    secs = [{'section_name': name, 'positive_local_styles': SECTIONS[v][name][0], 'negative_local_styles': SECTIONS[v][name][1],
             'duration_ms': int(round(b * 1000)) - int(round(a * 1000)), 'lines': []} for name, a, b in PIECES[piece][3]]
    secs[-1]['duration_ms'] += int(round(LONGER.get(v, {}).get(piece, 0) * 1000))
    return {'positive_global_styles': pos, 'negative_global_styles': neg, 'sections': secs}


def music(v: str) -> None:
    MUSIC.mkdir(parents=True, exist_ok=True)
    for piece in PIECES:
        if any(name not in SECTIONS[v] for name, _, _ in PIECES[piece][3]):
            continue  # a piece this variant has no sections for (the private beat is C2's only)
        body = {'composition_plan': plan(v, piece), 'model_id': os.environ['MUSIC_MODEL'], 'respect_sections_durations': True}
        meta = MUSIC / f'{v}-{piece}.json'
        if meta.exists() and json.loads(meta.read_text()) == body and (MUSIC / f'{v}-{piece}.mp3').exists():
            continue
        curl(f'{API}/v1/music?output_format=mp3_44100_192', body, MUSIC / f'{v}-{piece}.mp3')
        meta.write_text(json.dumps(body, indent=1) + '\n')
        print('music', v, piece, 'written', flush=True)


def effects() -> None:
    SFX.mkdir(parents=True, exist_ok=True)
    for name, (text, seconds, influence) in EFFECTS.items():
        body = {'text': text, 'duration_seconds': seconds, 'prompt_influence': influence}
        meta = SFX / f'{name}.json'
        if meta.exists() and json.loads(meta.read_text()) == body and (SFX / f'{name}.mp3').exists():
            continue
        curl(f'{API}/v1/sound-generation?output_format=mp3_44100_192', body, SFX / f'{name}.mp3')
        meta.write_text(json.dumps(body) + '\n')
        print('effect', name, 'written', flush=True)


if __name__ == '__main__':
    what = sys.argv[1:] or ['A', 'B', 'sfx']
    for w in what:
        effects() if w == 'sfx' else music(w)
