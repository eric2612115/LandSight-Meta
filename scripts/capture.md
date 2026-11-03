# Capture notes: which run state gives each screen (script v3, beats 4, 5, 6, 8)

The frontend (frontend/, Vite + React on :5195) draws every screen; the backend gives each scene its data.
Start the backend with `uv run python -m landsight serve` (port 8795, recorded Muse Spark and SAM responses), then
`POST /api/package/open` (no body: the m4 synthetic site until the sample package exists). `GET /api/director`
lists the scenes in order; every id below is in that list. Re-open the package to start a take again (it clears
confirmations). Offline copies of every response and image: `frontend-mock/` (`uv run python scripts/frontend_mock.py`).

| Beat | Scene | State | What the run holds for it |
|---|---|---|---|
| 4 The drawing wakes up | `wake` | fresh open | sheet L-1 (`/api/sheets/L-1.svg`, `bounds`), objects T-01…T-07 closed by geometry, T-08 open (`closed: false`, `segments`, 12 `gaps`), H-01, B-01, L-01 with `tag_at`; tally row Camphor drawn 7 · Spark 8 · schedule 8, status flagged; check "T-08: open outline…" (flag) |
| 5 The eye | `eye` | fresh open, then `POST /api/items/I-01/confirm` on the click | `items[I-01].spark`: `crop_url` `/api/crops/I-01.png` (the exact image sent), `answer` (is_one_object true, kind tree, confidence 0.95, why, points), `facts`, `seconds` (the recorded call's time), `points` (12, each `norm` 0–1000, `px` on the crop, `m` on the sheet, `to_segment_m`), `points_note`; after confirm: item `confirmed`, quote 8, tally drawn 8 · Spark 8 · schedule 8 confirmed, the check turns info |
| 6 Hedge math | `hedge` | after the confirm | H-01 band outline and `length_m` 54.0 (two lines); check "Duranta: 27.0 m at 0.3 m, 2 rows = 182 plants" with `numbers.formula` "27.0 ÷ 0.3 + 1 = 91 · × 2 rows = 182"; the legend check (L-1, objects X-…) and the "'Camphor typ.' is a label, not one more tree" check |
| 8 The gauge | `gauge` | any | `/api/rules` first check: `before_downgrade` (provided 265.9; fixes a +2 Camphor → 304.32, b change ONE to Bischofia → 432.12) and `after_downgrade` (L-6 pit 1.5 × 1.5 m = 2.25 m², soil 1.0 m, on slab: provided 214.7; fix a re-priced to +7 → 304.32, b → 348.92, `object_ids` ["T-05"]); `numbers` and `fixes` are the after state; the check "L-6 tree pit: …" and `sheets[L-6].detail` carry Muse Spark's read; `gauge.sheet_ids` ["L-1", "L-6"] |

Beat 7 (`colour`) is backed too: per sheet, "Muse Spark read the L-3 legend: beige = Permeable pavers · …" (`legend`,
`prompts`, `numbers.crop_px` on `filled_png_url`), the line drawing's "0 masks for 'beige area'" with `control`
{prompt, masks_on_lines 0, masks_on_colour 2}, "SAM 3.1 on the coloured L-3: 3 prompts …" (`calls[]` with every mask,
its type and whether it is a legend swatch), and one area check per item; each says `prompt_source` (spark_legend or
manual). `run.timing.calls` lists every Meta call with its recorded seconds. Beat 9 (`bill`) has no checks until the bill reader lands.
The numbers in beats 8's script (268 / 306 / 436, "swap 2") differ from the run: see D-18, D-19 and D-37.
