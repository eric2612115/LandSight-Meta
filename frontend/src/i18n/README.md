# i18n — Traditional Chinese (zh-TW) for the Landsight screen

Two dictionaries let the screen switch to Chinese for a property developer's owner (建商業主), with local
construction and landscape vocabulary. Nothing in `frontend/src` reads them yet; they are data for the switch.

| File | What it holds | Keys |
| --- | --- | --- |
| `zh-TW.data.json` | every user-visible English string the screen draws **from the data** (the Run, the rules, the ask answers), as a template | the English template |
| `zh-TW.ui.json` | the screen's own chrome: buttons, headings, column heads, status-bar words, step names, empty states, tooltips, the director's captions, the Statement's export headings | the exact English string the component draws |
| `zh-TW.data.source.json` | the extractor's output: one row per data template with an example, its placeholder count and the fields (`where`) it came from — the list `zh-TW.data.json` must cover | — |

## The template convention

A template is the English string with every variable part replaced by an ordered placeholder `{0}`, `{1}` …
numbered left to right. The Chinese template keeps the same set of placeholders (in whatever order Chinese
needs) and the units next to them:

```
"Schedule says {0} Camphor: drawn {1}, Muse Spark {2} ({3} to confirm)"
  → "植栽表載明樟樹 {0} 株：圖上 {1} 株、Muse Spark 判讀 {2} 株（{3} 待確認）"
"Camphor NT${0}: about {1}% under your installed list ({2}–{3})"
  → "樟樹 NT${0}：低於貴公司單價表約 {1}%（{2}–{3}）"
```

What becomes a placeholder (the order is the extractor's priority where tokens overlap):

1. **verbatim spans** — text in single or double quotes (drawing labels, bill cells, general notes, the words
   Muse Spark gave SAM 3.1), legend entries as Spark named them (`light green = CC CAMPHOR`), capitalised drawing
   text (`TO BE REMOVED`, `ARTIFICIAL GROUND`), and Muse Spark's own sentences where the product's text frames
   them (`classified the sheet as … confidence 0.98: <sentence>`, `document: <summary>`, `Key facts: …`)
2. **file names** — every `files[].name` the data carries, plus any bare name ending in
   `.dxf .pdf .xlsx .xls .zip .bak .pptx .png`
3. **run ids** (12 hex), **dates** and timestamps
4. **ids** — planted errors (`E02.2`), price-list sources (`P006`, `P048-P051`), sheets and objects (`L-1`,
   `L-1-revB`, `F-25-p7`, `T-08`, `C-36`, `PV-1`, `TPG-D`), hatch names (`AR-SAND`, `ANSI31`), species codes in
   brackets (`(CC)`, `(PLANTER-EDGE, confidence …)`), bill revision names other than a bare number (`1a`, `T1`),
   `Rev B`, scale ratios (`1:200`), cell ranges (`G6:G17`), size specs (`H3.0-3.5`)
5. **numbers** — integers, decimals, thousands commas, `1e-05`; the unit after a number stays in the template
   (`{0} m²`, `NT${0}`, `{0}%`, `cal. {0} cm`, `DBH {0} cm`, `Art. {0}`), so Chinese can put the unit where it
   belongs (`第{0}條`, `米高徑 {0} cm`, `胸徑 {0} cm`)

Digits that are part of a name never become placeholders: `SAM 3.1`, `Excel 97–2003`, `TCO2`, `Q0`, `A′`.
A sign before a number stays in the template (`+{0} Camphor`, `(-{2}%)`), so `+` and `−` variants are
separate templates.

The matcher that re-extracts a template's values from a live English string is `regex_of(template)` in
`frontend/scripts/i18n-extract.py` (each placeholder matches one of the token patterns above, then any text);
`fill(template_zh, values)` renders the Chinese. `--check` proves every example round-trips.

Two fields are also templated as the **head** the screen prints: `file.why.head` is the part of a file's `why`
before the first `:` or `;` (the review's package tree), `sheet.not_counted_reason.head` the part before the
first `:` or `(` (the Statement's *By sheet*).

## Where the strings come from

`frontend-mock/run.json`, `run_confirmed.json`, `package_runs.json`, `rules.json`; the live runs
`GET /api/runs/{id}` for the latest run of the greenfield, tower and held-out packages
(their ids from `GET /api/projects → packages[].latest_run.id`); `tests/fixtures/ask/*.json`. The fields:

- checks: `title`, `why` (and `if_confirmed.title` / `why`), `note`, `reason`, `fixes[].label` (also the fixes of
  `before_downgrade` / `after_downgrade`), `citation.article` / `gloss` (and `citations[]`)
- files: `verdict`, `why`; sheets: `title`, `kind`, `not_counted_reason`; items (and the tally): `label`
- the scenario names and the run mode (`fixtures` / `live`)
- rules.json: `title`, `article`, `gloss`
- ask answers: `answer`, `proposed_actions[].value` / `why`, and the question

## Re-running the extractor

```
python3 frontend/scripts/i18n-extract.py            # mock + API at http://127.0.0.1:8795 + fixtures → zh-TW.data.source.json
python3 frontend/scripts/i18n-extract.py --no-api   # the files on disk only
python3 frontend/scripts/i18n-extract.py --api http://host:8795 --run <id> --run <id>
python3 frontend/scripts/i18n-extract.py --check    # every example round-trips; zh-TW.data.json covers every template
```

Standard library only; it prints the template count. After a re-run, `--check` lists the templates
`zh-TW.data.json` is missing (a new species, a new sheet title, a new phrasing from the backend) — add those
translations by hand; templates the data no longer carries are reported as notes and can stay.

## What stays English by design

- **citation quotes** (`citations[].quote` of an ask answer): copied verbatim from the documents; not collected
- **drawing text**: object labels on the sheets, legend entries, title-block text and anything the product quotes
  from a drawing (`'FIRE TRUCK ACCESS LANE — KEEP CLEAR'`, `PLANTING SOIL`): placeholders, shown as written
- **bill text** where its spelling is the finding: `Camphore tree, cal. 10 cm` stays as the bill spells it; the
  bill's column heads (`Item, Description, Spec …`) and the workbook's own heading (`Bill of Quantities`) are
  kept; the sheet names `'BOQ'` and `'old'` are placeholders
- **file names, ids, run ids, revision names, hatch names, cell references, formulas** (`SUM(G6:G17)`): placeholders
- **model names and their words**: `Muse Spark`, `SAM 3.1`, the prompt words Spark wrote (`'green area'`), and
  Muse Spark's own sentences as recorded (sheet classifications, photo descriptions, document summaries, the
  answer's recorded JSON fields in the callout): the product shows the model's words as recorded, so they are
  placeholders
- **ask answers and the recorded questions**: translated per string for the recorded fixtures (their numbers and
  ids are placeholders); a new live answer is prose from the model and shows in English until added
- **codes, units and symbols**: `NT$`, `m²`, `kgCO₂e/yr`, `Gi`, `α β λ`, `A′`, `TCO2`, `ΣGi·Ai`, `EA`, `DXF`,
  `PDF`, `CAD`, `BOQ`, `USD` / `TWD`, `landsight.db`, API paths, the CSV column heads of *Flags with evidence*,
  the project and sample names (`Greenfield Residences`, `Tower`, `Held-out`)
- **`Rev A` / `Rev B`** is kept as the drawings mark it; the word *revision* / *version* is 版次

## Vocabulary

bill of quantities / bill 數量表（BOQ）· developer 建商 · the owner 景觀公司老闆 · package 發包資料 · run 審閱紀錄 ·
drawing / plan 圖面 / 平面圖 · sheet 圖紙 · planting plan 植栽平面圖 · plant schedule 植栽表 · legend 圖例 · title block 圖框 ·
revision 版次 · superseded 已被取代 · governs 以此為準 · verdict 判定 · flag 標記 · confirm 確認 · dismiss 排除 ·
query letter 查詢函 · price list 單價表 · unit rate 單價 · over-billed 多計 · under-billed 少計 · billed, not drawn 有計價、圖上沒有 ·
hedge 綠籬 · canopy 樹冠 · tree pit 樹穴 · artificial ground / slab 人工地盤 / 樓板 · greening (Art. 302) 綠化（建築技術規則第302條）·
required / provided 應達 / 現有 · fire truck access lane 消防車道 · protected tree 受保護樹木 · DBH 胸徑 · soil depth 覆土深度 ·
water retention (Art. 305) 保水（第305條）· permeable pavers 透水鋪面 · exposed aggregate 洗石子 · grass pavers 植草磚 ·
planter edge 花台收邊 · shrub bed 灌木花床 · lawn 草坪 · typical floor 標準層 · podium 裙樓平台 · roof garden 屋頂花園 ·
look-alike sheets 相似圖紙 · scan / raster 掃描檔 / 點陣圖 · backup 備份檔 · unsupported 不支援的格式 · zip unpacked 壓縮檔已解開 ·
read, not counted 已讀取、未計數 · measured 已量測 · Need you 待您處理 · Noted 備註 · Statement 核對表 ·
species: Camphor 樟樹 · Azalea 杜鵑 · Duranta 金露花 · Bischofia 茄苳 · Chinese ixora 仙丹花 · Orange jasmine 月橘 ·
Yeddo hawthorn 石斑木 · Lawn 草坪 · Roof lawn 屋頂草坪 (the standard local names, as in `landsight/data/species.csv`)
