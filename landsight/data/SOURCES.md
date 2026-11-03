# Data tables: sources and columns

These are reference tables for the rules and bill modules. Everything was read or checked on 2026-11-01/02. Every number comes with a source and a date; a source address that names a place is not kept, and the source is described instead. A number with no source is labelled `sample` in its own column. Chinese names are kept as data. All files are UTF-8.

| File | Rows | What it is |
|---|---|---|
| `species.csv` | 60 | Landscape plants common on local sites, with native status, bird/butterfly status, Gi class and mature height |
| `unit_prices.csv` | 77 | Unit prices for planting and paving (NT$): 73 sourced, 4 `sample` |
| `rules.json` | — | Regulation constants with citations (national, and two municipal rule sets) |
| `paving.csv` | 12 | Paving types, with CAD hatch names, whether permeable, base layers, and links to price rows |

## species.csv

**Columns**

- `code`: short ID (e.g. `CC`).
- `name_en`, `name_zh`: English and Chinese names.
- `aliases_zh`: other Chinese names. For example, 月橘 and 七里香 are one species, so they share one row.
- `scientific`: the name used in the trade.
- `type`: one of `large_tree`, `small_tree`, `palm`, `shrub`, `groundcover`, `vine`, `lawn`.
- `native`: `true` only when TaiCOL's `alien_type` is `native`. Naturalized, cultured and invasive species are `false`.
- `taicol_status`: TaiCOL's own status value.
- `taicol_accepted_name`: the name TaiCOL accepts.
- `native_source_url`: the TaiCOL taxon page.
- `bird_or_butterfly_attracting`: `true` or `unknown`. No source said "not attracting", so `false` is never used.
- `bird_butterfly_detail`: bird, nectar or larval host, with the butterfly where the source names it.
- `bird_butterfly_basis`: `official` (agency, city, museum or national-park document) or `secondary` (an NGO-hosted personal list or a news article).
- `bird_butterfly_source_url`, `bird_butterfly_source_date`: where the bird/butterfly status comes from, and the document's date.
- `gi_class`: the Gi value from Table 1 of 建築基地綠化設計技術規範.
- `gi_category_zh`: the Table 1 category name.
- `gi_basis`: why the plant got that class. The values are:
  - "named in §6.4": the spec lists the species by name.
  - "§3.3 height rule": classified by height (a large tree reaches ≥10 m at maturity).
  - "borderline": the height range straddles 10 m, or the flora says "shrubs or trees".
  - "sample": no height source was found.
- `gi_source_url`: the spec PDF.
- `mature_height_m`: mature height, as stated by the source cited.
- `height_source_url`: where the height comes from.
- `accessed`: when the page was read.
- `notes`: anything else.

**Sources**

- **Native status: TaiCOL 物種名錄** (https://taicol.tw, API `api.taicol.tw/v2/taxon`, queried 2026-11-02). It reports the status given by the national red list (*Ed. Comm. Red List TW Plants, 2017*) and by the 林務局 2012 naturalization list.
  - The greening spec itself names two references for "native": ABRI's 「應用於綠建築設計之原生植物圖鑑」 and 特生中心's 「野生植物資料庫」. Neither can be queried online.
  - TaiCOL is the national checklist those databases feed. A reviewer may still question edge cases: 春不老 is naturalized per TaiCOL; 韓國草 is native only because TaiCOL merges *Zoysia tenuifolia* into *Z. matrella*; 地錦 sits under *Parthenocissus dalzielii*.
- **Bird/butterfly status.** 44 rows are `true`: 34 from official documents and 10 from secondary sources. 16 rows are `unknown`. The official sources are:
  - 林業保育署 原生樹木推廣及媒合平臺: the 「生態應用」 field on each species page (`nativetree.forest.gov.tw/Tree/Info/<id>`).
  - 林務局保育研究系列93-1 「國有林蝶類重要棲地及資源」 (2005).
  - A municipal parks department's list of butterfly- and bird-attracting boulevard trees (2014).
  - A municipal government's plant table (附表四).
  - The 陽明山國家公園 nectar-plant study (1997–98).
  - The 國立自然科學博物館 花果曆 page on 木棉.
  - The secondary source is 莊溪's 「蝴蝶食草與蜜源植物」 list, hosted by 山林復育協會. If you count only official sources, set the 10 `secondary` rows to `unknown`.
  - EEWH's own 「誘鳥誘蝶植栽參考表」 (表3-2) could not be found online.
- **Mature height.**
  - Flora of China on efloras.org: 45 rows.
  - NParks Flora & Fauna Web: 9 rows.
  - Flora of North America: 2 rows.
  - Missouri Botanical Garden: 2 rows.
  - Flora of Pakistan, PROSEA and NC State Extension: 1 row each.
  - 黃花風鈴木 has no height source.
  - These are botanical heights in the wild. Landscape trees are often smaller.
- **Gi class.** Table 1 and §3.3/§3.4/§6.4 of the spec. §6.4 names example species: 樟樹, 楓香 and 欒樹 are large trees (1.5); 阿勃勒 and 無患子 are small trees (1.0); 小葉欖仁, 木棉 and 相思樹 are sparse-leaf trees (1.0). Where the spec names a species, it overrides the height rule. That is why 小葉欖仁 is `large_tree` with Gi 1.0.

## unit_prices.csv

**Columns**

- The requested columns: `item_en`, `item_zh`, `spec`, `unit`, `price_low_twd`, `price_high_twd`, `basis`, `source_url`, `date`, `notes`.
- Extra columns:
  - `id`: stable row ID, e.g. P001. `paving.csv` refers to these.
  - `scope`: one of
    - `material_only`
    - `installed` (labour + material + overhead, as the unit-price analysis prints it)
    - `labour_only`
  - `species_code`: links to `species.csv`.
  - `source_title`, `accessed`.
- `unit` is usually 株, m² or m. Stakes are priced per 組 and soil and concrete per m³, exactly as the source states them.

**`basis` values**

- `published_budget`: 61 rows. These come from government 預算書, 詳細價目表, 單價分析表 or a city reference price book. All are budget (預算) prices; no 決標 (contract award) prices were found.
- `vendor_quote`: 12 rows. These are nursery retail catalogues and one manufacturer's price analysis.
- `sample`: 4 rows. None has a source; each has a plausible range, explained in its `notes`. The four are:
  - 樟樹 at 米徑 12 cm
  - 金露花 at exactly H0.6
  - 韓國草, installed
  - 花崗石 燒面 (flamed granite)
- `public_tender_db`: 0 rows. The 公共工程價格資料庫 has no public page with landscape items. Only one row quotes a 價格資料庫 survey figure, and only inside its own analysis: P075, ready-mix concrete 114/12.

**Derived rows.** Four rows are marked "DERIVED" in `notes`. P057, P058 and P063 are sums of the material, labour, equipment and sundry lines that a municipal unit-price table prints without a total. P043's per-tree soil cost is quantity × unit price, and appears in its notes only.

**How the price climbs with 米徑**

No government document prices 樟樹 at several 米徑 sizes. The municipal unit-price book uses a single band, "<10 cm", priced as 8 cm. The one-document ladder comes from a nursery catalogue:

| 米徑 | Price (NT$) | Ratio to previous size |
|---|---|---|
| 6 cm | 3,000 | — |
| 10 cm | 7,000 | ×2.33 |
| 15 cm | 15,000–18,000 | ×2.14–2.57 |
| 20 cm | 25,000 | ×1.67 |

- Price grows roughly as diameter^1.7–1.9.
- 茄苳 from the same catalogue: 8 → 10 cm is ×1.33, and 10 → 15 cm is ×3.33.
- Across government budgets, an installed 9–10 cm 樟樹 costs 6,149 (P006). A 米徑 ≥20 cm, H ≥5 m tree costs 46,540 (P013), about 7.6× as much for twice the diameter.
- Labour also rises with size: planting a <10 cm tree costs 3,660 and a 10–19 cm tree 7,300 (P021/P022).
- Prices drift upward over time. The municipal book's 8 cm material price went from 3,505 to 4,505 (+28.5%) between the 102 and 112 budget years.

**Wastage (損耗).** No national or municipal document found states a percentage wastage rate for plants or paving. Items are taken at 1.00 unit per unit, and wastage is assumed to sit inside the unit price. The rates that are stated:

- Plastic grass grid: 1.10 m²/m², "含損耗" (a municipal unit-price book).
- Geotextile: 1.05.
- Welded mesh: 1.10 (a municipal sidewalk standard).
- Graded stone, loose to compacted: 1.35 (the municipal 112 book).
- Plants: covered by maintenance or replanting lines, e.g. the municipal book's 植樹養護, or one project budget's "補植" at 50 per m².
- Percentage rates do exist in mainland-China quota standards. They were deliberately not used.

**Sources, in order of trust**

1. **A municipal public-works unit-price book, 112 budget year, and its 單價分析表** (2022-05). A city-wide official book with full material, labour and overhead breakdowns; it covers trees, shrubs, sod, stakes, soil, concrete, pavers and base course. The copy read was hosted on a school-procurement advisory site, not the municipality's own. The 102 edition (2012) is the same municipality's.
2. **Municipal project budgets** with item-level analyses (2019–2023), five projects of one city's housing, works and parking offices. They are mirrored on a third-party site, not the agency's own. A district office's 115年度 price list (P047) is on a gov domain; its URL is not kept here.
3. **A municipal public-works bureau's 115年1月 單價分析** (2026-01-22). The most recent prices found, but it covers concrete only.
4. A municipal maintenance-works office's sidewalk paper (2018), a municipal office's 112 budget, and a municipal education department's 114–116 參考單價.
5. Vendors: a nursery's online catalogue (undated, the only multi-size tree ladder), 永發園藝 (韓國草) and 尚美實業 (grass pavers).

**Implication for the demo.** docs/PLAN.md gives the firm's sample price list as 樟樹 米徑10 H3.5 at NT$14,000–16,000. The public anchors for an installed 9–10 cm, H3–3.5 樟樹 are 6,149 (one municipal budget, 2021) and 7,036 (another city's <10 cm band, 2022). Nursery retail for the tree alone at 10 cm is 7,000. The bill's NT$5,000 is about 70–80% of those installed anchors, and NT$14,000–16,000 is about twice them. Either keep the firm's list explicitly labelled "sample", or move it toward the public anchors.

Downloaded PDFs and extracted text (working copies, not part of the repo) are under the session scratchpad.

## rules.json

**Sections**

- `meta`
- `glossary`: an English gloss for every term.
- `national`:
  - `applicability`, `formulas`, `constants`
  - Gi: `gi_table`, `gi_layering`, `large_small_tree_definition` (with the species §6.4 names)
  - Trees: `tree_ai`, `tree_ai_rules` (old trees, closer spacing, the ≥1 ha shortcut)
  - `beta`
  - `artificial_ground`: soil depth and pit area per plant type, plus the rule that downgrades a large tree to a small tree.
  - `submission`, `water_retention`, `per_parcel`, `protected_trees_national`
  - `corridor_width`: the minimum clear width of a corridor (1.2 m, or 1.6 m with rooms on both sides).
- `municipal_reference`: a reference municipal greening rule and tree protection ordinance: 綠覆率/綠容率 by class, cooling coefficients, β by class, soil depths including podium and roof, shrubs ≥4/m², grass pavers counted at ⅓, and protected trees.
- `municipal`: the site's municipal tree protection ordinance, and a note that no municipal greening rule applies to the sample site.
- `amendments_2026`

Every constant carries `{source, article, url, read}`.

**Sources**

- **National greening.** 建築技術規則 建築設計施工編 第298, 299, 302–305條 (law.moj.gov.tw), and 建築基地綠化設計技術規範修正規定 (nlma.gov.tw PDF). Section numbers were re-checked against the PDF text on 2026-11-02:
  - Table 1 and its footnote sit in §5.
  - The definitions are §3.3–3.6.
  - The large/small tree examples are §6.4.
- **Corridor width.** 建築技術規則 建築設計施工編 第92條第1款 (law.moj.gov.tw, read 2026-11-03). The table sets the clear width by use:
  - D-3, D-4 and D-5 classrooms: 2.4 m with rooms on both sides, 1.8 m otherwise.
  - F-1, and other buildings whose rooms on one floor total 200 m² or more (100 m² below ground): 1.6 m with rooms on both sides, 1.2 m otherwise.
  - Other buildings below that: 1.2 m.

  The tower check uses the 1.2 m figure (`rooms_one_side_m`) and names the 1.6 m one.
- **National protected trees.** 森林法 §38-2 and 森林以外之樹木普查方法及受保護樹木認定標準 第2條 (105-05-27):
  - age ≥100 years
  - broadleaf: DBH ≥1.5 m or girth ≥4.7 m
  - conifer: DBH ≥0.75 m or girth ≥2.4 m
  - canopy ≥400 m²

  These are quoted from the 農業部 page; the law.moj.gov.tw text would not load.
- **Municipal reference set (`municipal_reference`).** Cited by law name and article only.
  - 新建建築物綠化實施規則, in force 2026-01-01.
  - 樹木保護自治條例 第3條. The in-force date of the 114-12-30 amendment is unconfirmed, so a `caution` field is included.
- **Municipal tree protection.** A municipal tree protection ordinance (樹木保護自治條例), promulgated 102-04-24, text read on the city's agriculture bureau page:
  - 第3條: DBH ≥0.8 m or girth ≥2.5 m (multi-stem trees combined), or age ≥50 years. There is no height test and no conifer or Ficus split.
  - 第11條: protection or transplant plans for development projects.

  The city's official law-search page returned a system error.
- **2026 amendments.**
  - 建築技術規則 was amended 115-02-23 (effective 115-07-01), but only Arts.140–142 and 144. Chapter 17 is untouched.
  - No 2026 amendment to the 技術規範 was found.
  - The reference municipality re-issued its greening rule (in force 115-01-01) and amended its tree ordinance.

## paving.csv

**Columns**

- `code`, `name_en`, `name_zh`.
- `cad_hatch_patterns`: typical AutoCAD standard pattern names (ANSI31, AR-B816, AR-HBONE, AR-CONC, AR-SAND, GRAVEL, GRASS, HONEY, …).
- `hatch_basis`: always "sample convention". The pattern names are real AutoCAD names, but which pattern a firm uses for which paving is its own drafting standard. Never classify paving by hatch alone; use the label or the legend (D-10).
- `permeable`: common practice. The 基地保水 calculation method has not been read.
- `permeable_basis`.
- `typical_base_layers`: as specified in the cited budgets and analyses.
- `base_source_url`.
- `price_ids`: the `unit_prices.csv` rows this paving type maps to.
- `notes`.
