/** The six recorded questions on the sample package, as POST /api/ask answers them (docs/API.md, "Ask the package").
 * Answers, citations and proposed actions are copied from Muse Spark's recordings in tests/fixtures/ask/; the screen
 * uses them whenever the live backend is not answering. */
import type { Answer } from './ask'

type Seed = Omit<Answer, 'run_id' | 'ask_id'>

const call = (seconds: number, fixture: string) => ({ model: 'muse-spark-1.3', seconds, recorded: true, fixture: `tests/fixtures/ask/${fixture}`, usage: {} })

export const RECORDED: Seed[] = [
  {
    question: "What soil depth does the spec require for trees on the slab?",
    answer:
      "The developer guides require on artificial ground 1.5 m for deep-rooted trees including Cinnamomum camphora (camphor), 1.0 m for medium roots and 0.7 m for shallow roots, while the national greening standard requires 1.0 m for broadleaf large tree. Drawing L-6 for CC CAMPHOR ON THE PODIUM shows only PLANTING SOIL 1.0 M, below the 1.5 m guide for camphor.",
    confidence: 0.9,
    citations: [
      { file_id: "F-08", page: 1, quote: "Applies to large broadleaf trees, e.g. Cinnamomum camphora (camphor), Bischofia javanica, planted", verified: true, source: "Tree pit guide - deep roots.pdf", chunk_id: "F-08:p1:1" },
      { file_id: "F-08", page: 1, quote: "Deep-rooted 2.0 x 2.0 m (4.0 m²) 1.5 m 1.5 m 150 mm", verified: true, source: "Tree pit guide - deep roots.pdf", chunk_id: "F-08:p1:1" },
      { file_id: "F-09", page: 1, quote: "Medium 2.0 x 2.0 m (4.0 m²) 1.0 m 1.2 m 100 mm", verified: true, source: "Tree pit guide - medium roots.pdf", chunk_id: "F-09:p1:1" },
      { file_id: "F-10", page: 1, quote: "Shallow-rooted 1.5 x 1.5 m (2.25 m²) 0.7 m 1.0 m 100 mm", verified: true, source: "Tree pit guide - shallow roots.pdf", chunk_id: "F-10:p1:1" },
      { file_id: "rules", page: 0, quote: "broadleaf large tree): soil on a roof, balcony, terrace or facade 1.0 m", verified: true, source: "Regulation table (rules.json)", chunk_id: "rule:national.artificial_ground.row1" },
      { file_id: "F-25", page: 7, quote: "PLANTING SOIL 1000 mm (SOIL DEPTH 1.0 M ON SLAB)", verified: true, source: "Landscape Drawings (Full Set).pdf", chunk_id: "F-25:p7:1" },
    ],
    proposed_actions: [
      { kind: "flag", target_id: "E12", value: "L-6 podium camphor provides 1.0 M soil on slab vs guide 1.5 m for deep-rooted camphor; confirm required depth with developer.", why: "Drawing depth meets the 1.0 m regulation minimum but not the deep-root guide for the specified camphor." },
    ],
    call: call(15.07, "ask_package__638b4212548d9154.json"),
  },
  {
    question: "Does Article 302 apply to this 1,500 m² site?",
    answer:
      "Yes. The drawings show SITE AREA 1,500 m², which exceeds the 300 m2 exemption maximum for new buildings, and no local-specific greening rule was found so national Art. 302 with β 0.66 applies. The sources do not explicitly confirm this is a new building, which Art. 298 lists as the applicability trigger.",
    confidence: 0.85,
    citations: [
      { file_id: "F-19", page: 0, quote: "SITE AREA | 1,500 m² | BUILDING COVERAGE | 40% | GROUND | ARTIFICIAL GROUND", verified: true, source: "L-6 Tree Pit Detail.dxf", chunk_id: "sheet:L-6" },
      { file_id: "rules", page: 0, quote: "Art. 298 item 1: applicability: applies to: new buildings ; site area exempt max m2: 300", verified: true, source: "Regulation table (rules.json)", chunk_id: "rule:national.applicability" },
      { file_id: "rules", page: 0, quote: "No local-specific greening rule found (one search 2026-11-02); national Art. 302 and the apply (β 0.66 for an ordinary site).", verified: true, source: "Regulation table (rules.json)", chunk_id: "rule:local.greening" },
    ],
    proposed_actions: [],
    call: call(8.61, "ask_package__a7718b8c0f4599b0.json"),
  },
  {
    question: "Which bill revision is current and what changed?",
    answer:
      "The current bill is Landscape BOQ rev3 (paving update).xlsx, revision 3, dated 2026-10-14, with total NT$1,562,028. From 1 to 1a Azalea changed qty 600 → 450, from 1a to 2 Permeable pavers (PV-1) changed price 1,800 → 3,800 with Camphor/Duranta name/unit/qty/price changes, and from 2 to 3 Permeable pavers (PV-1) changed qty 212 → 236.",
    confidence: 0.98,
    citations: [
      { file_id: "F-04", page: 0, quote: "Landscape BOQ rev3 (paving update).xlsx, revision 3, dated 2026-10-14 (the latest by date)", verified: true, source: "Landscape BOQ rev3 (paving update).xlsx", chunk_id: "F-04:versions" },
      { file_id: "F-04", page: 0, quote: "total NT$1,562,028", verified: true, source: "Landscape BOQ rev3 (paving update).xlsx", chunk_id: "F-04:versions" },
      { file_id: "run", page: 0, quote: "1 → 1a (2026-01-21): Azalea: qty 600 → 450", verified: true, source: "Review check E22", chunk_id: "check:E22" },
      { file_id: "run", page: 0, quote: "Permeable pavers (PV-1): price 1,800 → 3,800", verified: true, source: "Review check E22", chunk_id: "check:E22" },
      { file_id: "run", page: 0, quote: "2 → 3 (2026-10-14): Permeable pavers (PV-1): qty 212 → 236", verified: true, source: "Review check E22", chunk_id: "check:E22" },
    ],
    proposed_actions: [],
    call: call(6.23, "ask_package__d2b4231142e2e16e.json"),
  },
  {
    question: "Is PV-1 permeable paving?",
    answer:
      "Yes. The L-3 legend keys PV-1 as permeable pavers, and both the BOQ and paving spec describe PV-1 as Permeable pavers concrete 200 x 100 x 80 mm. One 48 m² area on L-3 is labelled PV-1 but hatched as PV-2, so its material is not settled.",
    confidence: 0.95,
    citations: [
      { file_id: "F-25", page: 4, quote: "PV-1 PERMEABLE PAVERS", verified: true, source: "Landscape Drawings (Full Set).pdf", chunk_id: "F-25:p4:1" },
      { file_id: "F-04", page: 0, quote: "Permeable pavers (PV-1) | concrete, 200 x 100 x 80 mm, on 30 mm sand", verified: true, source: "Landscape BOQ rev3 (paving update).xlsx", chunk_id: "F-04:BOQ!11" },
      { file_id: "F-07", page: 1, quote: "PV-1 Permeable pavers concrete, 200 x 100 x 80 mm, on 30 mm sand", verified: true, source: "Planting procurement spec.pdf", chunk_id: "F-07:p1:2" },
      { file_id: "run", page: 0, quote: "The boxed code 'PV-1' points at a 48 m² area hatched AR-SAND", verified: true, source: "Review check E11", chunk_id: "check:E11" },
    ],
    proposed_actions: [
      { kind: "flag", target_id: "E11", value: "Confirm with developer whether 48 sqm area labelled PV-1 with PV-2 hatch is PV-1 or PV-2", why: "Drawing labels PV-1 but hatch and legend indicate PV-2, so pricing quantity is uncertain." },
    ],
    call: call(9.51, "ask_package__aa7e49ee2ee19b30.json"),
  },
  {
    question: "What does the green-building checklist require from landscape?",
    answer:
      "The Greenery indicator sample checklist lists 6 documents for the Green Building Label application: Greening quantity report (TCO2 calculation), planting plan with every species named, plant schedule with species quantities soil depth and pit area, tree pit and soil depth details for artificial ground, and site plan showing areas excluded from greening, all marked required, plus existing tree survey and protection plan if existing trees are affected. The greening quantity report shows TCO2 = (ΣGi × Ai) × α against TCO2c = 0.5 × A′ × β with inputs read from the planting plan and the plant schedule.",
    confidence: 0.95,
    citations: [
      { file_id: "F-06", page: 1, quote: "Greening quantity report (TCO2 calculation)", verified: true, source: "Green Building Label - required documents.pdf", chunk_id: "F-06:p1:1" },
      { file_id: "F-06", page: 1, quote: "Planting plan with every species named", verified: true, source: "Green Building Label - required documents.pdf", chunk_id: "F-06:p1:1" },
      { file_id: "F-06", page: 1, quote: "Plant schedule with species, quantities, soil depth and pit area", verified: true, source: "Green Building Label - required documents.pdf", chunk_id: "F-06:p1:1" },
      { file_id: "F-06", page: 1, quote: "Tree pit and soil depth details for artificial ground", verified: true, source: "Green Building Label - required documents.pdf", chunk_id: "F-06:p1:1" },
      { file_id: "F-06", page: 1, quote: "Site plan showing areas excluded from greening", verified: true, source: "Green Building Label - required documents.pdf", chunk_id: "F-06:p1:1" },
      { file_id: "F-06", page: 1, quote: "Existing tree survey and tree protection plan", verified: true, source: "Green Building Label - required documents.pdf", chunk_id: "F-06:p1:1" },
      { file_id: "F-06", page: 1, quote: "The greening quantity report shows TCO2 = (ΣGi × Ai) × α against TCO2c = 0.5 × A′ × β", verified: true, source: "Green Building Label - required documents.pdf", chunk_id: "F-06:p1:1" },
    ],
    proposed_actions: [],
    call: call(6.47, "ask_package__e7fcb977d090fc0f.json"),
  },
  {
    question: "Why is the camphor row flagged?",
    answer:
      "The camphor row is flagged because the bill lists 12 plants at NT$4,200 while the governing drawing shows 8, and the note says plan quantities take precedence over the schedule which says 12. It is also flagged because NT$4,200 is about 32% under your installed list of 6,200–7,200, and because 'Camphore' is aligned to Camphor (CC) at confidence 0.85 requiring confirmation.",
    confidence: 0.92,
    citations: [
      { file_id: "run", page: 0, quote: "Camphore tree, cal. 10 cm: bill 12, drawing 8.", verified: true, source: "Review check E02.2", chunk_id: "check:E02.2" },
      { file_id: "F-25", page: 2, quote: "1. PLANT QUANTITIES ON PLAN TAKE PRECEDENCE OVER THE SCHEDULE.", verified: true, source: "Landscape Drawings (Full Set).pdf", chunk_id: "F-25:p2:1" },
      { file_id: "run", page: 0, quote: "Camphor NT$4,200: about 32% under your installed list (6,200–7,200).", verified: true, source: "Review check E19", chunk_id: "check:E19" },
      { file_id: "run", page: 0, quote: "'Camphore tree, cal. 10 cm' aligned to Camphor (CC) at confidence 0.85.", verified: true, source: "Review check E18", chunk_id: "check:E18" },
    ],
    proposed_actions: [
      { kind: "flag", target_id: "E02.2", value: "Bill shows 12 but governing drawing shows 8; confirm billable quantity with developer", why: "Drawing governs per general note so the billable 12 versus 8 is unresolved." },
      { kind: "confirm_price", target_id: "CC", value: "6200-7200", why: "Bill rate NT$4,200 is about 32% below the installed list low end." },
    ],
    call: call(22.49, "ask_package__247ae41fa20d1310.json"),
  },
]

const words = (s: string) => new Set(s.toLowerCase().replace(/[’'?.,]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))
const STOP = new Set(['the', 'what', 'does', 'this', 'and', 'for', 'which', 'why', 'from', 'are', 'how'])

/** The recorded answer whose question shares the most words with this one (none under a third). */
export function matchRecorded(question: string): Seed | undefined {
  const q = words(question)
  let best: { s: Seed; score: number } | undefined
  for (const s of RECORDED) {
    const w = words(s.question)
    const inter = [...q].filter((x) => w.has(x)).length
    const score = inter / Math.max(1, Math.min(q.size, w.size))
    if (!best || score > best.score) best = { s, score }
  }
  return best && best.score >= 0.34 ? best.s : undefined
}
