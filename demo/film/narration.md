# Landsight demo film: narration (scratch read)

Source: demo/SCRIPT.md v4, "Voice" column. Live numbers filled in for this recording: schedule_count = 12,
file_count = 30. Gauge numbers for the captions: provided 266 → required 297; +2 trees → 304; after the pit detail
215; +7 trees, or one species change → 349. (The voice says "two more trees" and "seven". It speaks none of the
other gauge numbers.) Numbers are written out as words so the TTS reads them the same way every time.

## Voices (ElevenLabs, premade, model `eleven_v4`)

| Folder | Voice | voice_id |
|---|---|---|
| `audio/v1-brian/` | Brian: deep, resonant, middle-aged American male | `nPczCjzI2devNBz1zQrb` |
| `audio/v1-alice/` | Alice: clear, middle-aged British female | `Xb7hH8MSUJpSbSDYk0k2` |

voice_settings: stability 0.85, similarity_boost 0.75, style 0.0, use_speaker_boost true, speed 1.0.
Output mp3_44100_128. Every clip came from `eleven_v4`; the turbo fallback was not needed.

## Lines

| # | Window | Narration |
|---|---|---|
| 1 | 0:00–0:08 (8 s) | Four trees nobody drew. Somebody's paying for them. |
| 2 | 0:08–0:15 (7 s) | Design firms check this by hand. Weeks. Landsight does the mechanical part — and shows its work. |
| 3 | 0:15–0:34 (19 s) | This is what a developer's package looks like. Thirty files. Backups, an Excel 97 file, a zip, a slide deck, four revisions of the bill. Drop the folder. Every file gets a verdict — and a reason. |
| 4 | 0:34–0:56 (22 s) | Geometry closes every outline it can and measures the closed ones exactly. Seven camphors. The plant schedule says twelve. The eighth, it can't close. |
| 5 | 0:56–1:16 (20 s) | To a computer that's twelve lines. So Landsight shows Muse Spark exactly what it sees. Spark says: one tree — and why. It still doesn't count it. It asks. |
| 6 | 1:16–1:30 (14 s) | Every thirty centimetres, two rows, along twenty-seven metres: a hundred and eighty-two plants. Geometry measures. Spark reads. The legend isn't a tree. |
| 7 | 1:30–1:50 (20 s) | Often there's no CAD, just a coloured PDF. SAM sees nothing in lines. The same word on colour finds the beds and paving within about one percent. It finds the legend's swatch too — the app knows where the legend is. |
| 8 | 1:50–2:12 (22 s) | Then the building code. Short. Two more trees would fix it — until the tree-pit detail. On a slab, pits this size make every large tree count as small. Now it takes seven. Or one tree of a second native species. |
| 9 | 2:12–2:36 (24 s) | Now the bill. Twelve billed. Where from? The schedule — which the drawing contradicts. The hedge, billed in metres. A camphor at a hundred and thirty dollars; your own list says two hundred. And a sheet somebody hid. |
| 10 | 2:36–2:52 (16 s) | Twelve? Eight. The other sheet is the same eight trees, from the side. Counted once. Thirty errors were planted in this package. Here's the scoreboard — misses included. |
| 11 | 2:52–3:00 (8 s) | I don't trust a number I can't trace. Every number here traces back to the drawing. |

### Changes from SCRIPT.md v4

- **Beat 2** (overran its window): "Design firms check a developer's package by hand. Weeks." → "Design firms check this by hand. Weeks."
  The first read ran 7.9 s (Brian) and 8.5 s (Alice) in a 7 s window. Alice's overran by more than 1 s, so the
  line was shortened and both voices regenerated once. The on-screen card still names "a developer's package".
- **Beat 7** (42 words, over the 40-word cap): "no CAD file" → "no CAD"; "— and the app knows" → "— the app knows".
- **Beat 7, re-recorded 2026-11-02 (Brian only)**: "finds the beds and the paving within one percent" → "finds the beds and
  paving within about one percent". The recorded run measures beds and paving within 1.2% of CAD (the film's caption
  reads it from the run), so "within one percent" overstated it; "the" was dropped to keep the line at 40 words.
  Same voice, model and settings; 215 characters. Alice's `beat-07.mp3` still has the earlier wording.
- **Beat 8** (42 words, over the 40-word cap): "One tree of a second native species does it instead." → "Or one tree of a second native species."
- Beat 3: "{file_count} files" is spoken as "Thirty files".
- **Beat 9, re-recorded 2026-11-02 (Brian only)**: the film speaks USD (Eric). "A camphor at five thousand; your own
  list says fourteen" → "A camphor at a hundred and thirty dollars; your own list says two hundred" (the run's bill:
  NT$4,200 ≈ $131 against the firm's list of NT$6,200–7,200, D-25). 37 words, 216 characters, same voice, model and
  settings. Alice's `beat-09.mp3` still has the earlier wording and NT$ figures.

## Timing (ffprobe; window = beat duration)

| # | Words | Brian s | Alice s | Window s | ~110 wpm s | Fits (B / A) |
|---|---|---|---|---|---|---|
| 1 | 8 | 3.76 | 3.92 | 8 | 4.4 | yes / yes (lands after the thud, ~4 s in) |
| 2 | 16 | 6.88 | 7.60 | 7 | 8.7 | yes / yes (+0.6 s, under 1 s) |
| 3 | 36 | 14.48 | 14.80 | 19 | 19.6 | yes / yes |
| 4 | 24 | 10.88 | 11.44 | 22 | 13.1 | yes / yes |
| 5 | 28 | 12.16 | 13.36 | 20 | 15.3 | yes / yes |
| 6 | 22 | 11.44 | 12.40 | 14 | 12.0 | yes / yes |
| 7 | 40 | 14.32 | 15.04 | 20 | 21.8 | yes / yes (Brian: the re-recorded line) |
| 8 | 40 | 15.20 | 16.48 | 22 | 21.8 | yes / yes |
| 9 | 37 | 14.96 | 15.36 | 24 | 20.2 | yes / yes (Brian: the USD re-read) |
| 10 | 27 | 11.76 | 12.32 | 16 | 14.7 | yes / yes |
| 11 | 16 | 5.20 | 5.36 | 8 | 8.7 | yes / yes |

Both voices read at about 150 wpm, faster than the 110 wpm the script assumes, so most beats leave air for the
sound grammar. Concatenated with 0.6 s gaps: Brian 126.1 s, Alice 134.1 s, both inside the 180 s film.

Characters sent to TTS: 3,570 across both voices (1,672 per voice for the final lines, plus 226 for the first beat-2 read), plus 215 for Brian's beat-7 re-read and 216 for his beat-9 re-read.

## Files

- `audio/v1-brian/beat-01.mp3` … `beat-11.mp3`, `audio/v1-brian/all-beats.mp3`
- `audio/v1-alice/beat-01.mp3` … `beat-11.mp3`, `audio/v1-alice/all-beats.mp3`
- `audio/music/open.mp3`: 20 s, low sparse tense bed for beats 1–2 (ElevenLabs Music, `music_v1`, instrumental)
- `audio/music/close.mp3`: 20 s, warm resolving cue for beat 11 (same)
- `audio/sfx/tick.wav` (60 ms), `snap.wav` (120 ms), `thud.wav` (200 ms), `chime.wav` (500 ms): ffmpeg synthesis, 48 kHz
