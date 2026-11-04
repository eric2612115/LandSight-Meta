"""Speaks every narration line of the v2 film with the narration voice (with timestamps), one file per line:
audio/voice-v2/line-<n>.mp3 and line-<n>.json (the character alignment). Lines already spoken with the same text and
settings are skipped. The key comes from the environment (SPEECH_API_KEY); it is never printed.

    set -a; . <env file>; set +a; uv run python demo/film/scripts/voice-v2.py [n ...] [--take b]
"""
import base64
import json
import os
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / 'audio' / 'voice-v2'
VOICE = Path(os.environ['VOICE_ID_FILE']).read_text().strip()
MODEL = os.environ['SPEECH_MODEL']
SETTINGS = {'stability': 0.65, 'similarity_boost': 0.9, 'style': 0.0}
FORMAT = 'mp3_44100_192'


def main(only: set[int], take: str = '') -> None:
    key = os.environ['SPEECH_API_KEY']
    lines = json.loads((OUT / 'lines.json').read_text())
    with httpx.Client(timeout=120) as http:
        for ln in lines:
            n = ln['n']
            if only and n not in only:
                continue
            meta = OUT / f'line-{n}{take}.json'
            want = {'text': ln['text'], 'voice': VOICE, 'model': MODEL, 'settings': SETTINGS, 'format': FORMAT}
            if meta.exists() and json.loads(meta.read_text()).get('request') == want and not only:
                continue
            r = http.post(f'{os.environ["SPEECH_API_BASE"].rstrip("/")}/v1/text-to-speech/{VOICE}/with-timestamps', params={'output_format': FORMAT},
                          headers={os.environ['SPEECH_API_HEADER']: key}, json={'text': ln['text'], 'model_id': MODEL, 'voice_settings': SETTINGS})
            if r.status_code != 200:
                print(n, 'HTTP', r.status_code, r.text[:300])
                continue
            d = r.json()
            (OUT / f'line-{n}{take}.mp3').write_bytes(base64.b64decode(d['audio_base64']))
            al = d.get('normalized_alignment') or d.get('alignment')
            meta.write_text(json.dumps({'request': want, 'alignment': d.get('alignment'), 'normalized_alignment': d.get('normalized_alignment')}, ensure_ascii=False) + '\n')
            end = al['character_end_times_seconds'][-1] if al else None
            print(n, f'{end:.2f}s' if end else '?', ln['text'][:60])


if __name__ == '__main__':
    # --take b: another take of the given lines, beside the first (line-<n>b.*); film-v2 picks per line in voice-v2.json
    args = sys.argv[1:]
    take = ''
    if '--take' in args:
        i = args.index('--take')
        take = args[i + 1]
        del args[i:i + 2]
    main({int(a) for a in args}, take)
