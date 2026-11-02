/** The six recorded questions on the sample package, as POST /api/ask answers them (docs/API.md, "Ask the package").
 * Answers, citations and proposed actions are copied from Muse Spark's recordings in tests/fixtures/ask/; the screen
 * uses them whenever the live backend is not answering. */
import type { Answer } from './ask'

type Seed = Omit<Answer, 'run_id' | 'ask_id'>

const call = (seconds: number, fixture: string) => ({ model: 'muse-spark-1.3', seconds, recorded: true, fixture: `tests/fixtures/ask/${fixture}`, usage: {} })

export const RECORDED: Seed[] = [
  {
    question: 'What soil depth does the spec require for trees on the slab?',
    answer:
      "Drawing L-6 specifies PLANTING SOIL 1000 mm (1.0 M) on the basement slab for all CC camphor on the podium, while the developer's deep standard for camphor-type large broadleaf trees requires 1.5 m on artificial ground and the regulation requires 1.0 m for broadleaf large trees. The sources therefore do not settle on a single compliant depth until the governing standard for camphor is confirmed.",
    confidence: 0.85,
    citations: [
      { file_id: 'F-16', page: 7, quote: 'PLANTING SOIL 1000 mm (SOIL DEPTH 1.0 M ON SLAB)', verified: true, source: 'Landscape Drawings (Full Set).pdf', chunk_id: null },
      { file_id: 'F-22', page: 1, quote: '1.5 m', verified: true, source: 'Tree pit guide - deep roots.pdf', chunk_id: null },
      { file_id: 'rules', page: 0, quote: 'soil on a roof, balcony, terrace or facade 1.0 m', verified: true, source: 'Regulation table', chunk_id: null },
    ],
    proposed_actions: [
      { kind: 'flag', target_id: 'E12', value: 'Confirm with developer whether 1.0 m soil for camphor on slab governs or 1.5 m deep standard applies', why: 'Drawing specifies 1.0 m for camphor but the deep standard requires 1.5 m on artificial ground.' },
    ],
    call: call(9.46, 'ask_package__9cb69dcba3006319.json'),
  },
  {
    question: 'Does Article 302 apply to this 1,500 m² site?',
    answer:
      'Yes. The title blocks show SITE AREA 1,500 m², which exceeds the 300 exempt maximum in Art. 298 item 1 for new buildings, so national Art. 302 with β 0.66 for an ordinary site applies. The package does not explicitly state new-build status, so that part is assumed.',
    confidence: 0.85,
    citations: [
      { file_id: 'F-16', page: 7, quote: 'SITE AREA 1,500 m²', verified: true, source: 'Landscape Drawings (Full Set).pdf', chunk_id: null },
      { file_id: 'rules', page: 0, quote: 'applicability: applies to: new buildings ; site area exempt max m2: 300', verified: true, source: 'Regulation table', chunk_id: null },
      { file_id: 'rules', page: 0, quote: 'national Art. 302 and the apply (β 0.66 for an ordinary site)', verified: true, source: 'Regulation table', chunk_id: null },
    ],
    proposed_actions: [],
    call: call(7.16, 'ask_package__a76c8d3ab22aec2f.json'),
  },
  {
    question: 'Which bill revision is current and what changed?',
    answer:
      'The current bill is Landscape BOQ rev3 (paving update).xlsx, revision rev3 (paving update) dated 2026-10-14, with 11 priced rows totaling NT$1,562,028. The change from rev2 is Permeable pavers (PV-1): qty 212 -> 236.',
    confidence: 0.98,
    citations: [
      { file_id: 'F-28', page: 0, quote: 'Bill version 4 of 4: Landscape BOQ rev3 (paving update).xlsx, revision rev3 (paving update), dated 2026-10-14', verified: true, source: 'Landscape BOQ rev3 (paving update).xlsx', chunk_id: null },
      { file_id: 'F-28', page: 0, quote: "11 priced rows on sheet 'BOQ'; total NT$1,562,028", verified: true, source: 'Landscape BOQ rev3 (paving update).xlsx', chunk_id: null },
      { file_id: 'F-28', page: 0, quote: 'Changes from rev2: Permeable pavers (PV-1): qty 212 -> 236', verified: true, source: 'Landscape BOQ rev3 (paving update).xlsx', chunk_id: null },
    ],
    proposed_actions: [],
    call: call(7.36, 'ask_package__954b44c68355cadb.json'),
  },
  {
    question: 'Is PV-1 permeable paving?',
    answer:
      'Yes. PV-1 is permeable paving: the L-3 legend keys PV-1 as permeable pavers, and the bill and procurement standard both describe Permeable pavers (PV-1) as concrete, 200 x 100 x 80 mm, on 30 mm sand.',
    confidence: 1,
    citations: [
      { file_id: 'F-16', page: 4, quote: 'PV-1 PERMEABLE PAVERS', verified: true, source: 'Landscape Drawings (Full Set).pdf', chunk_id: null },
      { file_id: 'F-28', page: 0, quote: 'Permeable pavers (PV-1) | concrete, 200 x 100 x 80 mm, on 30 mm sand', verified: true, source: 'Landscape BOQ rev3 (paving update).xlsx', chunk_id: null },
      { file_id: 'F-21', page: 1, quote: 'PV-1 Permeable pavers concrete, 200 x 100 x 80 mm, on 30 mm sand', verified: true, source: 'Planting procurement spec.pdf', chunk_id: null },
    ],
    proposed_actions: [],
    call: call(7.09, 'ask_package__ab55617c10ca5368.json'),
  },
  {
    question: 'What does the green-building checklist require from landscape?',
    answer:
      'The sample checklist for the Greenery indicator lists 6 documents: greening quantity report (TCO2 calculation), planting plan with every species named, plant schedule with species, quantities, soil depth and pit area, tree pit and soil depth details for artificial ground, and site plan showing areas excluded from greening (fire-truck space, driveways) are marked required, while existing tree survey and tree protection plan is needed if existing trees are affected. The greening quantity report shows TCO2 = (ΣGi × Ai) × α against TCO2c = 0.5 × A′ × β with the inputs read from the planting plan and the plant schedule. The source is marked as a synthetic sample, not a real project record.',
    confidence: 0.95,
    citations: [
      { file_id: 'run', page: 0, quote: 'Sample checklist listing the documents to submit with the Green Building Label application', verified: true, source: 'Review check E30', chunk_id: null },
      { file_id: 'F-29', page: 1, quote: 'Plant schedule with species, quantities, soil depth and pit', verified: true, source: 'Green Building Label - required documents.pdf', chunk_id: null },
      { file_id: 'F-29', page: 1, quote: 'with the inputs read from the planting plan and the plant schedule.', verified: true, source: 'Green Building Label - required documents.pdf', chunk_id: null },
      { file_id: 'F-29', page: 1, quote: 'Sample document: synthetic, generated for the Landsight demo package.', verified: true, source: 'Green Building Label - required documents.pdf', chunk_id: null },
    ],
    proposed_actions: [],
    call: call(10.9, 'ask_package__74fcb6dbc654be7e.json'),
  },
  {
    question: 'Why is the camphor row flagged?',
    answer:
      "The camphor row (bill 12 vs drawing 8) is flagged for quantity, price and identity: the latest bill has 12 plants but the governing drawing shows 8, with plan quantities taking precedence; the bill rate NT$4,200 is about 32% under your installed list (6,200–7,200); and 'Camphore' is aligned to Camphor (CC) at confidence 0.70 due to misspelling.",
    confidence: 0.92,
    citations: [
      { file_id: 'run', page: 0, quote: 'Camphore tree, cal. 10 cm: bill 12, drawing 8.', verified: true, source: 'Review check E02.2', chunk_id: null },
      { file_id: 'F-16', page: 2, quote: '1. PLANT QUANTITIES ON PLAN TAKE PRECEDENCE OVER THE SCHEDULE.', verified: true, source: 'Landscape Drawings (Full Set).pdf', chunk_id: null },
      { file_id: 'run', page: 0, quote: 'about 32% under your installed list (6,200–7,200).', verified: true, source: 'Review check E19', chunk_id: null },
      { file_id: 'run', page: 0, quote: "'Camphore tree, cal. 10 cm' aligned to Camphor (CC) at confidence 0.70.", verified: true, source: 'Review check E18', chunk_id: null },
    ],
    proposed_actions: [
      { kind: 'flag', target_id: 'E02.2', value: 'Bill shows 12 camphor vs 8 on governing drawing - confirm correct quantity with developer', why: 'Quantity mismatch determines whether to price 12 or 8 trees.' },
      { kind: 'confirm_price', target_id: 'CC', value: '6200-7200', why: 'Bill rate NT$4,200 is well below installed range and needs repricing.' },
    ],
    call: call(6.73, 'ask_package__8b757a15a27881a4.json'),
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
