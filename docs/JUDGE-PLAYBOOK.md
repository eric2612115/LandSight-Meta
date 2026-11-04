# Judge's playbook

Everything below was run in this order from a clean shell on macOS (Apple silicon) on 2026-11-05. Expect about five
minutes, most of it `uv sync` and `npm ci`.

## What you need

- Python 3.13 and [uv](https://docs.astral.sh/uv/) (`uv --version`; uv installs Python 3.13 itself if missing).
- Node 24 and npm (`node -v` → v24.x). With nvm: `nvm install 24 && nvm use 24`.
- Free ports 8795 (the API) and 5195 (the screen), or see "Ports" below.
- Two terminals, both starting at the repository root: **terminal 1** runs the backend, **terminal 2** the frontend.
- For live models only: your keys in `.env` (`cp .env.example .env`): `MODEL_API_KEY`, and `BASETEN_API_KEY` for Muse Spark
  Open. Nothing else needs a key.

## The commands

### Terminal 1 — the backend

```bash
uv sync
```
Creates `.venv` with the locked dependencies.

```bash
uv run python -m landsight package /tmp/greenfield
```
Writes the sample developer's package (30 files) to `/tmp/greenfield/Greenfield Residences — Landscape Package`, with
`answer_key.json` and `firm price list.csv` beside it, and prints `"files": 30, "errors": 30`. It overwrites an earlier
copy in the same folder. The same package is in the repository at `samples/greenfield/` (the API opens that one).

Or drag the folder onto the screen: `open /tmp/greenfield` (Finder hides /tmp), then drag `greenfield` onto the drop
zone at http://localhost:5195. The screen uploads its files to the API (out/uploads/, at most 100 MB and 500 files),
reviews them offline and shows the same scoreboard. Drag only the package folder and the scoreboard stays empty: the
answer key sits next to it.

```bash
uv run python -m landsight review "/tmp/greenfield/Greenfield Residences — Landscape Package" --fixtures
```
Replays the recorded Muse Spark and SAM 3.1 answers (offline, about 10 s) and prints every file verdict, the 22 sheets
read (20 DXF and vector PDF pages, 2 raster pages read for their title blocks), the 12 take-off items (8 from the CAD,
4 measured by SAM 3.1 on the raster plan), 71 checks and the scoreboard:

```
planted 30 · found 28 · flagged 2 · missed 0 · false alarms 0
  flagged for review: E15, E18
  outside the answer key: C-53 review Water retention (Art. 305)
  by scenario: quote 9/1/0 of 10 | regulation 4/1/0 of 5 | design 11/0/0 of 11 | format 4/0/0 of 4 (found/flagged/missed)

39 Muse Spark calls (recorded), 267.89 s of calls; 12 SAM 3.1 calls (recorded), 23.15 s; …
```

```bash
uv run pytest -q
```
The tests (4–8 minutes on a laptop), all passing.

```bash
uv run python -m landsight serve --port 8795
```
The API (docs/API.md) on http://127.0.0.1:8795; it prints its address once it is listening (a busy port is one line
and exit code 2, see "Ports"). `curl http://127.0.0.1:8795/api/health` answers
`{"ok":true,"spark":"fixtures","version":"0.1.0"}`. Leave it running.

### Terminal 2 — the frontend

```bash
cd frontend
npm ci
npm run dev
```
The screen on http://localhost:5195 (Vite proxies `/api` to :8795, or to `VITE_API_PORT`). Open:

- http://localhost:5195 — the product. The first load opens the sample package through the API (10–35 s; the
  corner toggle shows `live`). Click Confirm on the camphor row; the tally turns green. The header's TWD / USD toggle
  switches every money figure (`?currency=usd`).
- http://localhost:5195/?director=1&auto=1 — the film's eight scenes, played by the app on the same Run. Space steps;
  shift+space goes back; R retakes; `#scene=gauge` jumps to a scene; `&mute=1` silences it.

### Live models

```bash
cp .env.example .env            # fill in MODEL_API_KEY, and BASETEN_API_KEY for Muse Spark Open
uv run --env-file .env python -m landsight serve --port 8795
curl -X POST "http://localhost:8795/api/packages/1/review?live=1&fresh=all"     # from another terminal; then reload http://localhost:5195
```
This asks all 51 calls of the sample again (2–6 minutes). Without `fresh`, `?live=1` asks only what is not already
recorded for the same content and prompt, so on the sample it makes no calls. The new answers go under
`tests/fixtures/` (`git status` lists them), and the Run's `timing.recorded` is `false`. The
commands for each model, Muse Wonder and Muse Spark Open included, are in the
[README](../README.md#2-with-your-own-keys-real-model-calls).

## Troubleshooting

**Ports.** See who holds one: `lsof -nP -iTCP:8795 -sTCP:LISTEN` (or 5195). If 8795 is busy, `serve` prints one
line and exits with code 2; start it on another port and point the frontend at it:
`uv run python -m landsight serve --port 8796` in terminal 1, `VITE_API_PORT=8796 npm run dev` in terminal 2. If 5195
is busy, Vite takes the next free port and prints it (or pin one: `npm run dev -- --port 5197`); open the URL it
prints. With the API unreachable, the screen shows the recorded copy (`frontend-mock/`, the same Run); the corner
toggle says which (`live`, `repo mock`).

**The screen says "repo mock" although the API runs.** The screen probes `/api/health` every 5 s and switches to
`live` when it answers; `?source=live` pins it. `?source=repo` pins the recorded copy (what the film uses).

**Node version.** The frontend is built and tested on Node 24 (Vite 8, TypeScript 7); older Node versions may fail
in `npm ci` or when Vite starts. Check `node -v`, then `nvm use 24`. `npm run build` and `npm run lint` both pass on
Node 24.

**The key.** `MODEL_API_KEY` is read from the environment only (`uv run --env-file .env` puts it there); it is never written to a file, a log, a fixture or
the API's responses. Without it `?live=1` answers HTTP 400 "live mode needs MODEL_API_KEY"; everything else runs on
the recordings. If Python cannot verify the API's TLS certificate on macOS, set
`SSL_CERT_FILE=/etc/ssl/cert.pem`.

**Opening the API's root.** http://127.0.0.1:8795/ is the API, not the screen: it answers JSON pointing at
docs/API.md. The screen is the frontend on :5195.

**The older m4 site.** `POST /api/package/open?site=m4` opens the earlier single-site demo (three DXF sheets and a
stand-in detail), kept for its tests; the default is the package.
