"""建築技術規則 建築設計施工編 第十七章 綠建築基準 (§298–§304) via the 建築基地綠化設計技術規範: the planting's total
carbon fixation must exceed the legal minimum.

  式(1) TCO2 > TCO2c
  式(2) TCO2 = (Σ Gi × Ai) × α
  式(3) TCO2c = 0.5 × A′ × β
  式(4) A′ = (A0 − Ap) × (1 − r), A′ ≥ 0.15 × A0, r capped at 0.85
  式(5) α = 0.8 + 0.5 × ra
  式(6) ra = native or bird- and butterfly-attracting trees ÷ all trees (by count); ra = 0 with fewer than two tree
        species (native and attracting flags from landsight/data/species.csv)

Gi from 表1 by planting type, tree Ai from 表2 (16 m² per tree on an urban site; 25 / 36 m² on larger or park
sites; closer planting uses spacing²), β from §302 by site class. Sources: docs/research/regs.md (read 2026-11-01).

On artificial ground (人工地盤: the title block says ARTIFICIAL GROUND / ON SLAB, the detail sheet shows the pit on a
slab, or it is given) the 技術規範 §5 表1 minimums apply to the tree pit read from the detail sheet (PitFacts): a large
tree whose pit is 1.5-4 m² counts as a small tree (Gi 1.5 -> 1.0); a pit under 1.5 m² misses the small-tree minimum,
so the tree is not counted and the check needs review; soil shallower than the class minimum (1.0 m large tree,
0.7 m small tree or palm, 0.4 m shrub or vine, 0.1 m grass) likewise. The result then carries two states, before and
after the downgrade, each with its own fixes (the film's gauge plays both).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

from landsight.rules.base import (FAIL, NEEDS_REVIEW, NOT_APPLICABLE, PASS, Citation, Fix, PitFacts, Planting,
                                  RuleResult, SiteFacts, Term)
from landsight.rules.species import GI, NOT_IN_TABLE, TREE_CLASSES, gloss, lookup, second_species

UNIT = "kgCO2e/yr"
BETA = {"ordinary": 0.66, "school_park": 0.83, "commercial_industrial": 0.50}
BETA_EN = {"ordinary": "ordinary site", "school_park": "school or park land",
           "commercial_industrial": "commercial or industrial zone"}
municipal_BETA = {1: 0.99, 2: 0.83, 3: 0.83, 4: 0.66, 5: 0.66}  # 本市新建建築物綠化實施規則 Art. 6
MIN_SITE_M2 = 300.0  # §298: sites of 300 m² or less are exempt
R_CAP = 0.85
# 技術規範 §5 表1 and its note, artificial ground (屋頂、陽臺、露臺 column): pit areas and soil depths
PIT_SMALL_MIN_M2 = 1.5  # small tree / palm minimum pit; a large tree in [1.5, 4.0) counts as a small tree
PIT_LARGE_MIN_M2 = 4.0  # large tree / multilayer minimum pit
SOIL_MIN_M = {"eco_multilayer": 1.0, "broadleaf_large": 1.0, "small_tree": 0.7, "palm": 0.7, "shrub": 0.4,
              "vine": 0.4, "lawn": 0.1}
LARGE_CLASSES = ("eco_multilayer", "broadleaf_large")

BTR = "Building Technical Regulations, Building Design and Construction Chapter"
STD = "Green Building Site Greening Design Technical Standard"
BTR_URL = "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=D0070115&flno="
STD_URL = "https://www.nlma.gov.tw/uploads/files/570f0fafb4e7fc5fd174a4f184618467.pdf"

CITATIONS = [
    Citation("§298", "建築技術規則 建築設計施工編 第298條第1款",
             "Applicability: greening applies to new buildings; sites of 300 m² or less and individually built "
             "farmhouses are exempt.", f"{BTR}, Art. 298 (1)", BTR_URL + "298"),
    Citation("§299", "建築技術規則 建築設計施工編 第299條第1、2款",
             "Definitions: total carbon fixation = Σ each planting type's carbon fixation × its area; minimum greening "
             "area = (site area − area hard to green) × legal open-space ratio.", f"{BTR}, Art. 299 (1)(2)",
             BTR_URL + "299"),
    Citation("§302", "建築技術規則 建築設計施工編 第302條",
             "The inequality: TCO2 > ½ × minimum greening area × β; β = 0.83 school or park land, 0.50 commercial or "
             "industrial zone, 0.66 other sites, kgCO2e/(m²·yr).", f"{BTR}, Art. 302", BTR_URL + "302"),
    Citation("§304", "建築技術規則 建築設計施工編 第304條",
             "The calculation follows the Green Building Site Greening Design Technical Standard.", f"{BTR}, Art. 304",
             BTR_URL + "304"),
    Citation("式(2)", "建築基地綠化設計技術規範 式(2)", "TCO2 = (Σ Gi × Ai) × α", f"{STD}, formula (2)", STD_URL),
    Citation("式(3)", "建築基地綠化設計技術規範 式(3)", "TCO2c = 0.5 × A′ × β", f"{STD}, formula (3)", STD_URL),
    Citation("式(4)", "建築基地綠化設計技術規範 式(4)", "A′ = (A0 − Ap) × (1 − r), at least 0.15 × A0; r above 0.85 counts as 0.85",
             f"{STD}, formula (4)", STD_URL),
    Citation("式(5)", "建築基地綠化設計技術規範 式(5)", "α = 0.8 + 0.5 × ra, from 0.8 to 1.3 (the native-tree bonus)",
             f"{STD}, formula (5)", STD_URL),
    Citation("式(6)", "建築基地綠化設計技術規範 式(6)",
             "ra = native or bird- and butterfly-attracting trees ÷ all trees, by count; ra = 0 with fewer than two "
             "tree species", f"{STD}, formula (6)", STD_URL),
    Citation("表1", "建築基地綠化設計技術規範 表1",
             "Gi by planting type: multilayer planting 2.0, broadleaf large tree 1.5, small tree 1.0, palm 0.66, shrub "
             "0.5, lawn or flower bed 0.3 kgCO2e/(m²·yr)", f"{STD}, table 1", STD_URL),
    Citation("表2", "建築基地綠化設計技術規範 表2",
             "Tree Ai: 16 m² per tree (urban or small site, 4 m spacing), 25 m² (school, small park, industrial zone, "
             "site ≥ 1 ha), 36 m² (metropolitan or science park, site ≥ 5 ha); closer planting uses spacing²",
             f"{STD}, table 2", STD_URL),
    Citation("§5", "建築基地綠化設計技術規範 第5點 表1及註",
             "On artificial ground (roof, balcony, terrace, slab): soil at least 1.0 m for large trees and multilayer "
             "planting, 0.7 m for small trees and palms, 0.4 m for shrubs and vines, 0.1 m for grass and flowers; a "
             "tree pit of at least 4.0 m² for a large tree and 1.5 m² for a small tree; a large tree in a pit of "
             "1.5-4 m² counts as a small tree; planting that misses these minimums is not counted.",
             f"{STD}, point 5, table 1 and note", STD_URL),
]


def jurisdiction(site: SiteFacts) -> str:
    if site.is_municipal and site.municipal_class:
        return f"national rule + municipal β (Art. 6) · {site.city_en}"
    return f"national rule · {site.city_en}"


def tree_ai(site: SiteFacts) -> float:
    a0 = site.site_area_m2 or 0
    if a0 >= 50_000:
        return 36.0
    if a0 >= 10_000 or site.site_class == "school_park":
        return 25.0
    return 16.0


def beta(site: SiteFacts) -> tuple[float, str]:
    if site.is_municipal and site.municipal_class in municipal_BETA:
        return municipal_BETA[site.municipal_class], f"municipal Class {site.municipal_class} (本市新建建築物綠化實施規則 Art. 6)"
    return BETA[site.site_class], f"§302, {BETA_EN[site.site_class]}"


def a_prime(site: SiteFacts) -> tuple[float, str]:
    a0, ap, r = site.site_area_m2, site.hard_to_green_m2, site.coverage_ratio
    r_used = min(r, R_CAP)
    raw = (a0 - ap) * (1 - r_used)
    floor = 0.15 * a0
    value = max(raw, floor)
    formula = f"({a0:,.0f} − {ap:,.0f}) × (1 − {r_used:.2f}) = {raw:,.1f}; floor 0.15 × {a0:,.0f} = {floor:,.1f}"
    if r > R_CAP:
        formula += f"; r {r:.2f} capped at {R_CAP}"
    return value, formula


@dataclass
class _Line:
    kind: str
    species: str
    gi_class: str
    gi: float
    area: float  # Ai (for trees: count × per-tree Ai)
    count: float | None  # trees only
    native: bool  # counts toward ra: native or bird- or butterfly-attracting (formula (6))
    formula: str
    source: str
    item_id: str
    object_ids: list[str]
    pit_note: str = ""  # what the pit rule did to this line


def fmt_n(v: float) -> str:
    """1 -> '1.0', 2.25 -> '2.25', 1.5 -> '1.5': numbers in rule text keep one decimal at least."""
    t = f"{v:g}"
    return t if "." in t or "e" in t else t + ".0"


def soil_minimum(gi_class: str) -> float | None:
    """The minimum soil depth on artificial ground for a Gi class (技術規範 §5 表1)."""
    return SOIL_MIN_M.get(gi_class)


def pit_class(gi_class: str, pit: PitFacts) -> tuple[str, bool, str]:
    """A tree of `gi_class` in `pit` on artificial ground: (the class it counts as, counted?, why)."""
    a, d = pit.area_m2, pit.soil_depth_m
    if gi_class in LARGE_CLASSES:
        if a >= PIT_LARGE_MIN_M2:
            eff, why = gi_class, f"pit {fmt_n(a)} m² ≥ {fmt_n(PIT_LARGE_MIN_M2)} m²: a large tree"
        elif a >= PIT_SMALL_MIN_M2:
            eff = "small_tree"
            why = (f"pit {fmt_n(a)} m² in [{fmt_n(PIT_SMALL_MIN_M2)}, {fmt_n(PIT_LARGE_MIN_M2)}) m² on artificial ground: a "
                   f"large tree counts as a small tree (Gi {fmt_n(GI[gi_class][0])} → {fmt_n(GI[eff][0])})")
        else:
            return gi_class, False, (f"pit {fmt_n(a)} m² < {fmt_n(PIT_SMALL_MIN_M2)} m², below the small-tree minimum: not "
                                     "counted, needs review")
    else:
        if a < PIT_SMALL_MIN_M2:
            return gi_class, False, f"pit {fmt_n(a)} m² < {fmt_n(PIT_SMALL_MIN_M2)} m² minimum: not counted, needs review"
        eff, why = gi_class, f"pit {fmt_n(a)} m² ≥ {fmt_n(PIT_SMALL_MIN_M2)} m²"
    need = soil_minimum(eff)
    if d is None:
        return eff, True, why + "; soil depth not read"
    if need is not None and d < need - 1e-9:
        return eff, False, why + f"; soil {fmt_n(d)} m below the {fmt_n(need)} m minimum: not counted, needs review"
    return eff, True, why + f"; soil {fmt_n(d)} m ≥ {fmt_n(need)} m"


def _lines(plantings: list[Planting], ai_default: float, notes: list[str], use_low: bool = False,
           pit: PitFacts | None = None, review: list[str] | None = None) -> list[_Line]:
    lines = []
    for p in plantings:
        if p.kind == "existing_tree":
            continue
        sp = lookup(p.species)
        if p.kind == "tree":
            count = (p.low_count if use_low and p.low_count is not None else p.count) or 0
            gi_class = sp.gi_class if sp and sp.gi_class in TREE_CLASSES else "small_tree"
            if sp is None and not use_low:
                notes.append(f"{p.species}: {NOT_IN_TABLE}; counted as a small tree (Gi 1.0), neither native nor "
                             "bird- or butterfly-attracting")
            pit_note = ""
            if pit is not None:
                gi_class, counted, pit_note = pit_class(gi_class, pit)
                if not counted:
                    if review is not None:
                        review.append(f"{p.species} ({p.item_id}): {pit_note}")
                    continue
            ai = ai_default
            if p.spacing_m and p.spacing_m < math.sqrt(ai_default) - 0.05:
                ai = round(p.spacing_m ** 2, 2)
                if not use_low:
                    notes.append(f"{p.species}: trees {p.spacing_m:.2f} m apart, Ai = spacing² = {ai} m² (表2)")
            gi = GI[gi_class][0]
            lines.append(_Line("tree", p.species, gi_class, gi, count * ai, count, bool(sp and sp.counts_for_ra),
                               f"{gi:g} × ({count:g} × {ai:g} m²) = {gi * count * ai:.1f}", p.source, p.item_id,
                               p.object_ids, pit_note))
            continue
        if p.area_m2 is None:
            if not use_low:
                notes.append(f"{p.species} ({p.kind}): no measured area; not counted")
            continue
        gi_class = "lawn" if p.kind == "lawn" else (sp.gi_class if sp and sp.gi_class in GI else "shrub")
        gi = GI[gi_class][0]
        less = min(max(p.less_m2 or 0.0, 0.0), p.area_m2)
        area = round(p.area_m2 - less, 2)
        shown = f"({p.area_m2:g} − {less:g}) m²" if less else f"{p.area_m2:g} m²"
        if less and not use_low:
            notes.append(f"{p.species} ({p.kind}): {less:g} m² left out of the greening sum, {p.area_m2:g} → {area:g} m²"
                         + (f" ({p.less_why})" if p.less_why else ""))
        lines.append(_Line(p.kind, p.species, gi_class, gi, area, None, False,
                           f"{gi:g} × {shown} = {gi * area:.1f}",
                           "; ".join(x for x in (p.source, p.less_why) if x), p.item_id, p.object_ids))
    return lines


def _evaluate(lines: list[_Line]) -> tuple[float, float, int, float, float]:
    """(Σ Gi·Ai, ra, tree species, α, TCO2)."""
    sigma = sum(ln.gi * ln.area for ln in lines)
    trees = [ln for ln in lines if ln.count]
    total = sum(ln.count for ln in trees)
    species = len({ln.species for ln in trees})
    ra = sum(ln.count for ln in trees if ln.native) / total if total and species >= 2 else 0.0
    alpha = 0.8 + 0.5 * ra
    return sigma, ra, species, alpha, sigma * alpha


def _with_trees(lines: list[_Line], species: str, delta: float, ai: float, pit: PitFacts | None = None) -> list[_Line]:
    """A copy of the lines with `delta` trees of `species` added (negative removes). New trees stand in the same pit
    as the others, so the pit rule prices them too."""
    out, done = [], False
    for ln in lines:
        if ln.count and ln.species == species:
            per = ln.area / ln.count
            n = ln.count + delta
            done = True
            if n > 0:
                out.append(_Line(**{**ln.__dict__, "count": n, "area": n * per}))
            continue
        out.append(ln)
    if not done and delta > 0:
        sp = lookup(species)
        gi_class = sp.gi_class if sp and sp.gi_class in TREE_CLASSES else "small_tree"
        gi = GI[gi_class][0]
        if pit is not None:
            gi_class, counted, _ = pit_class(gi_class, pit)
            gi = GI[gi_class][0] if counted else 0.0
        out.append(_Line("tree", species, gi_class, gi, delta * ai, delta, bool(sp and sp.counts_for_ra), "", "fix", "",
                         []))
    return out


def _en(name: str) -> str:
    s = lookup(name)
    return s.en if s else ""


def _spread(ids: list[str], k: int) -> list[str]:
    n = len(ids)
    return [ids[min(n - 1, round((j + 0.5) * n / k - 0.5))] for j in range(k)] if n and k else []


def fixes(lines: list[_Line], required: float, ai: float, pit: PitFacts | None = None) -> list[Fix]:
    """The cheapest fixes: (a) more trees of the main species; (b) swap k of them for a second species that counts
    toward ra (native or bird/butterfly-attracting, from species.csv; the fewest swaps wins, natives first, then the
    file's order), no extra trees; (c) more shrub bed. With a pit, the added or swapped trees are priced by the pit
    rule too."""
    out: list[Fix] = []
    trees = sorted([ln for ln in lines if ln.count], key=lambda ln: -ln.count)
    main = trees[0].species if trees else "樟樹"
    for n in range(1, 501):
        trial = _with_trees(lines, main, n, ai, pit)
        *_, alpha, tco2 = _evaluate(trial)
        if tco2 > required:
            out.append(Fix("a", f"+{n} {gloss(main)}, the same species", {"add_trees": {main: n}}, round(tco2, 2),
                           True, n, round(alpha, 3)))
            break
    if trees:
        per = trees[0].area / trees[0].count
        best = None  # (k, candidate, alpha, tco2)
        for cand in second_species(main, {ln.species for ln in trees}):
            for k in range(1, int(trees[0].count) + 1):
                if best is not None and k >= best[0]:
                    break
                trial = _with_trees(_with_trees(lines, main, -k, ai, pit), cand.zh, k, per, pit)
                _, ra, _, alpha, tco2 = _evaluate(trial)
                if tco2 > required:
                    best = (k, cand, alpha, tco2)
                    break
        if best is not None:
            k, cand, alpha, tco2 = best
            second = cand.zh
            what = "a second native species" if cand.native else "a second, bird- or butterfly-attracting species"
            out.append(Fix("b", f"swap {k} of {trees[0].count:g} {gloss(main)} for {gloss(second)}, {what}: native-tree "
                                f"bonus α {_evaluate(lines)[3]:.2f} → {alpha:.2f}; no extra trees",
                           {"swap": {"from": main, "to": second, "n": k, "from_en": _en(main), "to_en": _en(second),
                                     "to_native": bool(cand.native)}},
                           round(tco2, 2), True, 0,
                           round(alpha, 3), _spread(trees[0].object_ids, k)))
    sigma, _, _, alpha, _ = _evaluate(lines)
    need = required / alpha - sigma
    if need > 0:
        extra = math.ceil(need / GI["shrub"][0] * 10 + 1e-9) / 10
        tco2 = (sigma + GI["shrub"][0] * extra) * alpha
        if tco2 <= required:
            extra = round(extra + 0.1, 1)
            tco2 = (sigma + GI["shrub"][0] * extra) * alpha
        out.append(Fix("c", f"+{extra:g} m² of shrub bed (灌木 shrub, Gi 0.5)", {"add_shrub_m2": extra}, round(tco2, 2),
                       tco2 > required, 0, round(alpha, 3)))
    return out


def _state(lines: list[_Line], required: float, ai: float, pit: PitFacts | None = None) -> dict:
    """One state of the check (before or after the pit downgrade): provided, status, the tree lines and the fixes."""
    sigma, ra, _, alpha, tco2 = _evaluate(lines)
    passes = tco2 > required
    return {"required": round(required, 1), "provided": round(tco2, 1), "status": PASS if passes else FAIL,
            "sum_gi_ai": round(sigma, 2), "ra": round(ra, 3), "alpha": round(alpha, 3),
            "trees": [{"species": ln.species, "count": ln.count, "gi_class": ln.gi_class, "gi": ln.gi,
                       "ai_per_tree": round(ln.area / ln.count, 2), "product": round(ln.gi * ln.area, 2),
                       "pit_note": ln.pit_note} for ln in lines if ln.count],
            "fixes": [] if passes else [asdict(f) for f in fixes(lines, required, ai, pit)]}


def artificial_ground(site: SiteFacts, pit: PitFacts | None) -> tuple[bool, str]:
    """Is the planting on artificial ground, and where does that come from?"""
    if site.artificial_ground:
        return True, site.sources.get("artificial_ground", "given")
    if pit is not None and pit.on_slab:
        return True, f"detail {pit.from_sheet}: the tree pit sits on a slab"
    return False, ""


def check(site: SiteFacts, items: list[Planting], tree_ai_m2: float | None = None,
          pit: PitFacts | None = None) -> RuleResult:
    """The §302 check on one site. `items` are Plantings (see rules.inputs.plantings_from_takeoff); `pit` is the tree
    pit read from a detail sheet: on artificial ground it triggers the §5 表1 downgrade and a before/after pair."""
    res = RuleResult("greening", "Greening: carbon fixation of the planting (綠化總固碳當量)", jurisdiction(site),
                     NEEDS_REVIEW, unit=UNIT, citations=list(CITATIONS))
    if not site.new_building:
        res.status = NOT_APPLICABLE
        res.notes.append("§298: applies to new buildings only")
        return res
    if site.site_area_m2 is None or site.coverage_ratio is None:
        res.notes.append("site area (基地面積) or building coverage ratio (建蔽率) not found in the title block")
        return res
    a0, r = site.site_area_m2, site.coverage_ratio
    src = site.sources
    res.terms += [
        Term("A0", "基地面積", "site area", a0, "m²", "", src.get("site_area_m2", "given"), "§299"),
        Term("r", "建蔽率", "building coverage ratio", r, "", "", src.get("coverage_ratio", "given"), "式(4)"),
        Term("Ap", "執行綠化有困難之面積", "area hard to green (fire lanes, in-site roads, arcades)", site.hard_to_green_m2,
             "m²", "", src.get("hard_to_green_m2", "not on the drawing: 0"), "§299"),
    ]
    if a0 <= MIN_SITE_M2:
        res.status = NOT_APPLICABLE
        res.notes.append(f"§298: site of {a0:,.0f} m² is not above 300 m²; exempt")
        return res
    ap_value, ap_formula = a_prime(site)
    b, b_why = beta(site)
    required = 0.5 * ap_value * b
    res.terms += [
        Term("A′", "最小綠化面積", "minimum greening area", round(ap_value, 2), "m²", ap_formula, "", "式(4)"),
        Term("β", "基準值", "base carbon fixation per m²", b, "kgCO2e/(m²·yr)", b_why, "", "§302"),
        Term("TCO2c", "最低固碳當量", "required carbon fixation", round(required, 2), UNIT,
             f"0.5 × {ap_value:,.1f} × {b:g} = {required:.1f}", "", "式(3)"),
    ]
    ai = tree_ai_m2 or tree_ai(site)
    lines = _lines(items, ai, res.notes)
    on_slab, slab_source = artificial_ground(site, pit)
    applied = pit if (pit is not None and on_slab) else None
    review: list[str] = []
    if applied is not None:
        before = _state(lines, required, ai)
        lines = _lines(items, ai, [], pit=applied, review=review)
        res.terms.append(Term("pit", "樹穴面積 · 覆土深度", "tree pit area · soil depth (artificial ground)",
                              round(applied.area_m2, 2), "m²",
                              (f"{fmt_n(applied.width_m)} m × {fmt_n(applied.length_m)} m = {fmt_n(applied.area_m2)} m²; "
                               if applied.width_m and applied.length_m else "")
                              + (f"soil {fmt_n(applied.soil_depth_m)} m" if applied.soil_depth_m is not None
                                 else "soil not read"),
                              f"detail {applied.from_sheet} ({applied.by}); artificial ground: {slab_source}", "§5"))
    elif pit is not None:
        res.notes.append(f"tree pit read from {pit.from_sheet} ({pit.area_m2:g} m²), but nothing says the planting is on "
                         "artificial ground: the §5 table 1 pit minimums are not applied")
    for ln in lines:
        zh_type, en_type = GI[ln.gi_class][1], GI[ln.gi_class][2]
        sp = lookup(ln.species)
        en = f"{sp.en if sp else ln.species} · {en_type}" + (" (hedge band)" if ln.kind == "hedge" else "")
        res.terms.append(Term("Gi·Ai", f"{ln.species} · {zh_type}", en, round(ln.gi * ln.area, 2), UNIT, ln.formula,
                              "; ".join(x for x in (ln.source, ln.pit_note) if x),
                              "表1" + (", 表2" if ln.count else "") + (", §5" if ln.pit_note else "")))
    sigma, ra, n_species, alpha, tco2 = _evaluate(lines)
    trees = [ln for ln in lines if ln.count]
    total = sum(ln.count for ln in trees)
    native = sum(ln.count for ln in trees if ln.native)
    ra_formula = (f"{n_species} tree species ({', '.join(gloss(ln.species) for ln in trees) or 'none'}): fewer than two, ra = 0"
                  if n_species < 2 else f"{native:g} native or bird/butterfly-attracting of {total:g} trees = {ra:.2f}")
    res.terms += [
        Term("ΣGi·Ai", "綠化固碳量合計", "sum of Gi × Ai", round(sigma, 2), UNIT,
             " + ".join(f"{ln.gi * ln.area:.1f}" for ln in lines) + f" = {sigma:.1f}", "", "式(2)"),
        Term("ra", "原生或誘鳥誘蝶樹種比例", "share of native or bird/butterfly-attracting trees", round(ra, 3), "",
             ra_formula, "species.csv (native_to_national, bird_or_butterfly_attracting)", "式(6)"),
        Term("α", "生態綠化優待係數", "native-tree bonus", round(alpha, 3), "", f"0.8 + 0.5 × {ra:.2f} = {alpha:.2f}", "",
             "式(5)"),
        Term("TCO2", "綠化總固碳當量", "provided carbon fixation", round(tco2, 2), UNIT,
             f"{sigma:.1f} × {alpha:.2f} = {tco2:.1f}", "", "式(2)"),
    ]
    res.required, res.provided = round(required, 1), round(tco2, 1)
    res.status = PASS if tco2 > required else FAIL
    verdict = "passes" if res.status == PASS else f"short by {required - tco2:.1f}"
    res.notes.insert(0, f"§302: TCO2 {tco2:.1f} {'>' if tco2 > required else '≤'} TCO2c {required:.1f}: {verdict}")

    pending = [p for p in items if p.kind != "existing_tree" and not p.confirmed]
    if pending:
        alt = _evaluate(_lines(items, ai, [], use_low=True, pit=applied))[4]
        flips = (alt > required) != (tco2 > required)
        names = ", ".join(f"{p.species} ({p.item_id})" for p in pending)
        res.notes.append(f"awaiting confirmation: {names}; with the lowest count any source gave, TCO2 = {alt:.1f}, "
                         + ("the result would change, so it needs review" if flips else "the result is the same"))
        if flips:
            res.status = NEEDS_REVIEW
    if review:
        res.status = NEEDS_REVIEW
        res.notes += [f"§5 table 1: {x}" for x in review]
    needs_fix = res.status != PASS
    unknown = sorted({p.species for p in items if p.kind == "tree" and lookup(p.species) is None})
    if unknown:  # its Gi class and ra flags are guessed: the result cannot stand without a person
        res.status = NEEDS_REVIEW
    if needs_fix:
        res.fixes = fixes(lines, required, ai, applied)
    if applied is not None:
        after = _state(lines, required, ai, applied)
        after["status"] = res.status
        drawn_class = {ln.species: ln.gi_class for ln in _lines(items, ai, []) if ln.count}
        down = [{"species": ln.species, "count": ln.count, "from_class": drawn_class[ln.species], "to_class": ln.gi_class,
                 "from_gi": GI[drawn_class[ln.species]][0], "to_gi": ln.gi}
                for ln in trees if drawn_class.get(ln.species, ln.gi_class) != ln.gi_class]
        after |= {"pit": asdict(applied), "artificial_ground": slab_source, "downgraded": down, "review": review,
                  "rule": (f"pit {fmt_n(PIT_SMALL_MIN_M2)}–{fmt_n(PIT_LARGE_MIN_M2)} m² on artificial ground → a large tree "
                           f"counts as a small tree (Gi {fmt_n(GI['broadleaf_large'][0])} → {fmt_n(GI['small_tree'][0])})"),
                  "repriced": _repriced(before["fixes"], after["fixes"])}
        res.before_downgrade, res.after_downgrade = before, after
        if down:
            res.notes.append(f"§5 table 1: {sum(d['count'] for d in down):g} large trees count as small trees "
                             f"(pit {fmt_n(applied.area_m2)} m² on artificial ground): TCO2 {before['provided']:g} → "
                             f"{after['provided']:g}")
    res.notes.append("regulation check, not legal advice: a licensed architect signs off")
    return res


def _repriced(before: list[dict], after: list[dict]) -> dict:
    """How each fix changed with the downgrade: {"a": {"extra_trees": [2, 7], "provided": [304.32, 304.32]}, ...}."""
    b = {f["id"]: f for f in before}
    out = {}
    for f in after:
        if f["id"] in b:
            out[f["id"]] = {"extra_trees": [b[f["id"]]["extra_trees"], f["extra_trees"]],
                            "provided": [b[f["id"]]["provided"], f["provided"]], "change": [b[f["id"]]["change"], f["change"]]}
    return out
