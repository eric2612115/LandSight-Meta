"""本市新建建築物綠化實施規則 (re-issued 114-07-31, in force 115-01-01), Art. 5: minimum green-cover ratio (綠覆率) and
green-volume ratio (綠容率) by site class. Municipal: applied only to municipal sites, skipped elsewhere.

綠覆率 = green-cover area ÷ legal open-space area (Art. 3). Shrubs, beds and lawn count by plan area. Trees count by
米高徑 and spacing through a 都發局 formula that was not retrieved (docs/research/regs.md, Unknowns), so trees are
counted here at the national 表2 Ai (16 m² each) and the result is "needs review" unless it passes without them.
"""

from __future__ import annotations

from landsight.rules.base import NEEDS_REVIEW, PASS, SKIPPED, Citation, Planting, RuleResult, SiteFacts, Term

CLASSES = {  # class: (綠覆率, 綠容率, β of Art. 6)
    1: (0.90, 2.0, 0.99),
    2: (0.80, 1.9, 0.83),
    3: (0.70, 1.8, 0.83),
    4: (0.60, 1.6, 0.66),
    5: (0.50, 1.4, 0.66),
}
TREE_PLACEHOLDER_M2 = 16.0

URL = "https://laws.gov.municipal/law/LawSearch/LawPrint/FL080927?type=0"
RULES_EN = "municipal City New Building Greening Rules"
CITATIONS = [
    Citation("Art. 3", "本市新建建築物綠化實施規則 第3條",
             "Green-cover ratio = green-cover area ÷ legal open-space area; green-volume ratio = equivalent green-cover "
             "area ÷ site area.", f"{RULES_EN}, Art. 3", URL),
    Citation("Art. 4", "本市新建建築物綠化實施規則 第4條",
             "Site classes 1–5, e.g. Class 1 new park land ≥ 1 ha; Class 4 sites of 500–1,000 m² or residential "
             "sites ≥ 300 m².", f"{RULES_EN}, Art. 4", URL),
    Citation("Art. 5", "本市新建建築物綠化實施規則 第5條",
             "Minimum green-cover ratio / green-volume ratio by class: 1: 90% / 2.0 · 2: 80% / 1.9 · 3: 70% / 1.8 · "
             "4: 60% / 1.6 · 5: 50% / 1.4.", f"{RULES_EN}, Art. 5", URL),
    Citation("Art. 6", "本市新建建築物綠化實施規則 第6條", "Stricter β: 0.99 (Class 1), 0.83 (Classes 2–3), 0.66 (Classes 4–5).",
             f"{RULES_EN}, Art. 6", URL),
    Citation("Art. 10", "本市新建建築物綠化實施規則 第10條",
             "Shrubs at ≥ 4 plants per m²; trees counted by trunk diameter and spacing with a formula of the Urban "
             "Development Department.", f"{RULES_EN}, Art. 10", URL),
]


def site_class(site: SiteFacts) -> int | None:
    if site.municipal_class:
        return site.municipal_class
    a0 = site.site_area_m2 or 0
    return 4 if 500 <= a0 <= 1000 else None


def check(site: SiteFacts, items: list[Planting]) -> RuleResult:
    res = RuleResult("municipal_green_cover", "municipal green-cover ratio (綠覆率)", f"municipal · municipal", SKIPPED,
                     unit="%", citations=list(CITATIONS))
    if not site.is_municipal:
        res.notes.append(f"municipal rule (本市新建建築物綠化實施規則); the site is in {site.city_en}, so it does not apply")
        return res
    cls = site_class(site)
    res.status = NEEDS_REVIEW
    if cls is None or site.site_area_m2 is None or site.coverage_ratio is None:
        res.notes.append("site class (Art. 4) not determined from the drawing; give it to run the check")
        return res
    cover_req, volume_req, beta = CLASSES[cls]
    open_space = site.site_area_m2 * (1 - site.coverage_ratio)
    areas = sum(p.area_m2 or 0 for p in items if p.kind in ("shrub_bed", "lawn", "hedge"))
    trees = sum(p.count or 0 for p in items if p.kind == "tree")
    tree_area = trees * TREE_PLACEHOLDER_M2
    ratio = (areas + tree_area) / open_space
    ratio_no_trees = areas / open_space
    res.required, res.provided = round(cover_req * 100, 1), round(ratio * 100, 1)
    res.terms += [
        Term("class", "基地類別", "site class", cls, "", "given" if site.municipal_class else "500–1,000 m² site", "", "Art. 4"),
        Term("open", "法定空地面積", "legal open-space area", round(open_space, 1), "m²",
             f"{site.site_area_m2:,.0f} × (1 − {site.coverage_ratio:.2f})", "site area and coverage ratio", "Art. 3"),
        Term("A_plants", "灌木、草坪綠覆面積", "shrub, hedge and lawn cover", round(areas, 1), "m²", "plan areas", "take-off",
             "Art. 3"),
        Term("A_trees", "喬木綠覆面積", "tree cover (placeholder)", round(tree_area, 1), "m²",
             f"{trees:g} × {TREE_PLACEHOLDER_M2:g} m² (national 表2 Ai; the municipal formula was not retrieved)", "take-off",
             "Art. 10"),
        Term("綠覆率", "綠覆率", "green-cover ratio", round(ratio * 100, 1), "%",
             f"({areas:.1f} + {tree_area:.1f}) ÷ {open_space:.1f}", "", "Art. 5"),
        Term("required", "最低綠覆率", "minimum green-cover ratio", cover_req * 100, "%", f"Class {cls}", "", "Art. 5"),
    ]
    if ratio_no_trees >= cover_req:
        res.status = PASS
        res.notes.append(f"{ratio_no_trees * 100:.1f}% without counting trees ≥ {cover_req * 100:.0f}%: passes")
    else:
        res.notes.append(f"estimate {ratio * 100:.1f}% vs {cover_req * 100:.0f}% (Class {cls}); the tree cover uses a "
                         "placeholder, so a person checks it with the 都發局 formula")
    res.notes.append(f"綠容率 (green-volume ratio) minimum {volume_req:g} for Class {cls}: not computed (needs the same "
                     f"tree formula); β for Class {cls} is {beta:g} (Art. 6), applied in the national check")
    return res
