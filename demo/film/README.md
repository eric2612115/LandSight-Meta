# Landsight demo film

The 3:00 film of demo/SCRIPT.md v4, cut in [Remotion](https://remotion.dev): the eight director scenes recorded from
the running frontend, the paper beats rendered here (until Eric films his hand), captions, narration, music and the
sound grammar. The beat table in SCRIPT.md is the edit; `beats.json` holds its times and is the one place the
capture and the composition read them from.

Every number on screen is read at render time, never typed: `prepare.mjs` reads `<repo>/frontend-mock/run.json` and
`rules.json` (the backend's run) for scenes captured from it, and `frontend/public/mock/run.json` and `rules.json`
for scenes still captured from the frontend's built-in mock; `captures/manifest.json` says which. The cold open's
bill row comes from the repo run's bill checks when they exist, else from the bill generator
(`landsight/synth/bills.py`, the camphor row, NT$4,200 per D-25).

## Pinned

- remotion, @remotion/cli, @remotion/google-fonts **4.0.535**; react / react-dom 19.1.1; typescript 5.8.3
- playwright 1.56.1 (its Chromium headless shell, `npx playwright install chromium`)
- Node 24 (via nvm), ffmpeg / ffprobe at `/opt/homebrew/bin`
- Fonts (Inter, JetBrains Mono) come from Google at render time via `@remotion/google-fonts`.

```sh
# with nvm: nvm use 24
cd demo/film && npm install && npx playwright install chromium
```

## Files

| path | what |
|---|---|
| `beats.json` | SCRIPT v4's beat table: times, temperature, scene per app beat, `lead` (see below) |
| `capture.mjs`, `lib/vclock.js`, `lib/vite-client-stub.js` | records the director scenes → `captures/<scene>.mp4`, `.events.json`, `.contact.png`, `manifest.json` |
| `prepare.mjs`, `lib/wav.mjs` | gathers the data and links the media into `public/`, mixes the effects track `public/gen/sfx.wav` |
| `src/` | the composition: `Film.tsx` (the cut), `beats/` (ColdOpen, Who, AppBeat, Close), `Soundtrack.tsx`, `timing.js` (every cue the film places itself) |
| `stills.mjs` | ffprobe a render and pull evenly spaced frames into `stills/` with a contact sheet |
| `audio/` | the narration (`v1-brian`, `v1-alice`), `music/`, `sfx/` (see `narration.md`) |

`public/`, `stills/` and the renders are build output.

## Re-capture after the real run lands

The frontend dev server must be up on :5195 (`npm run dev` in `frontend/`); the capture drives
`/?director=1&auto=1&hold=1&scale=1&mute=1&source=<repo|mock>#scene=<id>`.

```sh
node capture.mjs                               # all eight from the repo run (frontend-mock/)
node capture.mjs --source repo --no-fallback   # fail instead of falling back if the director skips a scene
node capture.mjs eye gauge                     # just these scenes (others keep their clips)
node capture.mjs --mock drop,bill              # force scenes onto the built-in mock (a stand-in repo run)
node capture.mjs --source mock                 # everything from the built-in mock
node capture.mjs --mode video eye              # Playwright recordVideo instead (see below)
node capture.mjs --currency usd bill           # money in USD (`&currency=usd`); recorded per clip in the manifest
```

- A scene the director skips on the repo run (its data missing) falls back to the frontend's built-in mock unless
  `--no-fallback`; `--mock` forces scenes onto it. The film stamps every mock-sourced app beat **MOCK DATA ·
  RE-CAPTURE** in the corner (render with `--props '{"showSourceTag":false}'` to hide it). The source of each clip is
  in `captures/manifest.json`, and the captions of that beat read the same run.
- During a take Vite's `/@vite/client` is replaced by a stub (`lib/vite-client-stub.js`: styles only, no HMR
  socket), so an edit to the frontend cannot hot-swap or reload the page mid-scene; a lost take is retried.
  Re-capture after frontend changes you want in the film.
- **Frame mode (default)** is frame-exact: `lib/vclock.js` is injected before the app loads and replaces
  `setTimeout`, `setInterval`, `requestAnimationFrame`, `performance.now` and `Date.now` with a clock that moves only
  when the capture steps it, 1/30 s per frame; CSS animations are seeked to it and framer-motion is kept on its JS
  driver. Each frame is a lossless screenshot piped to ffmpeg (x264, crf 14), so the clip is sharp and its timing is
  the app's own whatever the machine does (about 1.2 s of wall time per second of film). The app's `play()` calls
  are logged with their virtual time into `captures/<scene>.events.json`; `prepare.mjs` mixes the film's effects on
  exactly those cues (tick, snap, thud, chime, stamp, whoosh, with the app's rate and volume).
- `--mode video` uses Playwright's `recordVideo`: real time, but fixed at 25 fps VP8 ~1 Mbit/s with JPEG frames,
  visibly soft on line work at 1080p, and no sound cues. Kept as a fallback.
- Each clip is cut to its beat window from `beats.json` (and padded by holding the last frame if the scene ends
  early). `lead` skips a scene's first fraction of a second: on a direct `#scene=` load the sheet fades in, which a
  continuous take would not show.
- Check `captures/<scene>.contact.png` (first / middle / last frame) before accepting a clip.

## Swap the narrator

Brian (`audio/v1-brian`) is the default; Alice is one flag:

```sh
npm run render:alice        # → landsight-v1-alice.mp4, i.e. --props '{"narrator":"alice"}'
```

Each line starts at its beat (+0.45 s; beat 1 after the thud, beat 2 at once), and never before the previous line
has ended (+0.2 s), so a longer read shifts the next line rather than overlapping it. A new take (Eric's own) goes in
a new folder `audio/<name>/beat-01.mp3 … beat-11.mp3`; add it to the narrator list in `prepare.mjs` and the
`narrator` union in `src/data.ts`. The end card credits the voice by name.

## Render

```sh
npm run render              # prepare.mjs, then remotion render → landsight-v1.mp4 (H.264 + AAC, 1920×1080, 30 fps, 3:00)
npm run stills              # ffprobe it and pull 12 frames into stills/
npm run studio              # scrub the cut in the browser
npx remotion still src/index.ts Film still.png --frame=1680
```

Props: `narrator` (`brian` | `alice`), `repoUrl` (the end card; default `https://github.com/eric2612115/landsight-meta`, to be confirmed),
`showSourceTag` (the mock stamp).

## State of v1 (2026-11-02)

- All eight clips were captured on `source=repo` (the 30-file Greenfield run) from the committed frontend
  (4a33f8b, "Integration: the sample package through the API and every director scene"); no scene fell back to the
  mock. After any frontend or run change: `node capture.mjs`, check the contact sheets, `npm run render`.
- Narration: Brian's beats 7 ("within about one percent") and 9 (USD: "a hundred and thirty dollars … two hundred")
  were re-read; Alice's two lines still have the earlier wording (see `narration.md`).
- `landsight-v1.mp4` is tracked; `captures/` (clips, cues, contact sheets, manifest), `public/` and `stills/` are
  build output and stay out of git.

## Not realised (see SCRIPT v4)

- The highlighter beat is rendered, not filmed: Eric's hand on a printed L-1 replaces `ColdOpen`'s overhead section.
- Beat 2 shows the zoom to the open canopy (its pieces lit one by one with a counter) under the title, inside the
  7 s window, so the title holds 4 s over a moving plan rather than a still one.
- The callback's error board (E01…E30 with threads) is not in the app's callback scene; the scoreboard numbers are
  a caption from `run.errors`, and the app's drop scene already shows its own scoreboard at ~11 s.
- Room tone, keys, the Enter tone and the highlighter squeak are synthesised (`lib/wav.mjs`), as are the stamp and
  whoosh the app plays; the clack and the cobalt breath of the script's sound grammar have no app cue yet.

The v1 film, its narration files and the old screenshots are not included in this repository; film v2 supersedes them.
