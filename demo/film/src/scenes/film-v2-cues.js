/**
 * Film v2 (demo/SCRIPT-V11.md, as built in animatic v11, with Eric's footage and the final look): every time in seconds.
 * Eric opens (his face, his screen sped up under his voice, his face); the push continues digitally into the upper
 * monitor's drawing (L-6), lands on the same sheet in 3D, holds 0.3 s and pulls back into the world (WorldV2.tsx) where
 * the sheets stack into the tower; Part 1 as v11; "Two weeks → ten minutes." on black; Part 2 is the /try capture with
 * its holds cut (timed from its cues file); the end at dusk. Captions: one line at a time, phrase by phrase.
 */
import cues from './try-v2-cues.json' with {type: 'json'};
// the narration as spoken (scripts/voice-v3.py, D-93; the v2 narration is kept in voice-v2-old.json): each line's start
// and its characters' times in film seconds
import aligned from './voice-v2.json' with {type: 'json'};

export const WPS = 155 / 60;

/**
 * v6: the private-mode beat ("Confidential drawings? Run it on Meta's open weights, in a deployment you control.
 * Same result."), inserted before the type card: every cue from INSERT_AT on is INSERT_S later than in V2 (the type card
 * and its hit, Part 2, the night end, the closing lines, the logo, the end hold).
 */
export const INSERT_AT = 92.3;
export const INSERT_S = 6.0;

/** Part 1: the starts of the beats (as v11); the type card moves with the private-mode beat. */
export const B = {
  push: 14.0, land: 15.0, pull: 15.3, drawer103: 21.4, roof: 27.4, alike: 32.2, lift: 35.1, corridor: 39.3, ground: 45.6,
  tree: 48.6, confirm: 52.8, raster: 57.4, bills: 65.8, hedge: 68.8, pavers: 74.2, pit: 77.6, findings: 87.0, type: 92.6 + INSERT_S,
};
export const PART2_AT = 94.1 + INSERT_S;

/**
 * The opening (Eric's footage; film = B-cut − 0.9 for his voice). `src` time runs at `rate` from `from`.
 * B-cut word times: "Every building … like this" 1.38–3.6 · "A landscape … two weeks" 4.04–9.6 · "I'm Eric" 10.12–10.6 ·
 * "building Landsight … ten minutes" 11.0–14.5.
 */
export const B_OFFSET = 0.9;
// A is the stabilised screen shot (A-cut-stab40.mov, 7.94 s): 0–7.44 s at 1.3× under line 2, its last 0.5 s before the push
export const LIVE = [
  {start: 0, end: 2.95, clip: 'B', from: 0.9, rate: 1},
  {start: 2.95, end: 8.67, clip: 'A', from: 0.0, rate: 1.3},
  {start: 8.67, end: 13.7, clip: 'B', from: 9.57, rate: 1},
  {start: 13.7, end: 14.2, clip: 'A', from: 7.44, rate: 1},
];
/** The push: the screen shot's last frame, warped so the drawn border of L-6 on the monitor (4K px) lands on the 3D sheet. */
export const PUSH = {
  still: 14.2, warp: [13.78, B.land], fade: [14.86, B.land + 0.04],
  quad: [[730, 723], [2087, 714], [2083.7, 1491.3], [739.3, 1447.3]],
  size: [3840, 2160],
};

/** Part 2: the capture's clicks by name, in order. */
export const CLICK_NAMES = ['drop', 'continue', 'analyze', 'review', 'e08', 'e022', 'e01', 'confirm', 'e14', 'select1', 'select2', 'create', 'closeReport', 'ask', 'point', 'input', 'send', 'mark'];
const clicks = cues.cues.filter((c) => c.name === 'click').map((c) => c.t);
export const CAP = Object.fromEntries(CLICK_NAMES.map((n, i) => [n, clicks[i]]));
CAP.end = cues.duration_s;
/** The capture with its holds cut: [from, to] in capture seconds. */
export const SEGMENTS = [
  [CAP.drop - 0.5, CAP.drop + 5.8],
  [CAP.continue - 0.3, CAP.analyze + 5.0],
  [CAP.review - 2.4, CAP.e08 + 2.0],
  [CAP.e022 - 0.3, CAP.e01 + 1.6],
  [CAP.confirm - 0.5, CAP.confirm + 1.3],
  [CAP.e14 - 0.2, CAP.e14 + 3.7],
  [CAP.select1 - 0.3, CAP.select2 + 1.7],
  [CAP.create - 0.6, CAP.create + 4.4],
  [CAP.create + 7.95, CAP.closeReport - 0.01],
  [CAP.ask - 0.2, CAP.mark + 1.6],
];
export const PART2_S = SEGMENTS.reduce((a, [f, t]) => a + (t - f), 0);
export function capToFilm(tc) {
  let acc = PART2_AT;
  for (const [f, t] of SEGMENTS) {
    if (tc < f) return acc;
    if (tc <= t) return acc + (tc - f);
    acc += t - f;
  }
  return acc;
}
export function filmToCap(t) {
  let acc = PART2_AT;
  for (const [f, to] of SEGMENTS) {
    const d = to - f;
    if (t < acc + d) return f + (t - acc);
    acc += d;
  }
  return SEGMENTS[SEGMENTS.length - 1][1];
}
export const CLOSE_AT = PART2_AT + PART2_S;
/** Large type over the end of Part 2, one card at a time (the family of "Two weeks → ten minutes.", smaller). */
export const BIG = [
  {at: capToFilm(CAP.create - 0.6) + 0.25, until: capToFilm(CAP.create - 0.6) + 2.55, text: 'Change request — clouded, numbered, priced.'},
  {at: capToFilm(CAP.create + 7.95) + 0.15, until: capToFilm(CAP.create + 7.95) + 2.35, text: 'Reply to the developer — ready to send.'},
];
export const END = {
  bullets: [
    {at: 0.3, text: 'Reads every sheet, bill and PDF', by: 'Muse Spark 1.3'},
    {at: 1.0, text: 'Measures colour plans', by: 'SAM 3.1'},
    {at: 1.7, text: 'Checks quantities, prices, scales, legends and the local building code', by: ''},
    {at: 2.4, text: '30 planted errors: 28 found · 2 flagged · 0 missed', by: ''},
  ],
  line: 4.6,
  logo: 7.6,
  hold: 3.4,
};
export const LOGO_AT = CLOSE_AT + END.logo;

export const V2 = {
  width: 1920,
  height: 1080,
  duration: LOGO_AT + END.hold,

  /** Screen-space cards: the problem, then the fix Landsight asks for (it writes the change request; it never edits a drawing). */
  cards: [
    {at: 21.6, until: 27.2, dot: 'amber', title: 'One sheet, four floors. The bill priced one.', sub: 'L-103 · typical floor 8F · bill 38.4 m² of shrubs (T01, T06)', fix: {at: 25.4, text: 'Fix: price 4 floors · 153.6 m²'}},
    {at: 27.6, until: 31.8, dot: 'blue', title: 'Roof soil 0.3 m — the minimum is 0.4 m', sub: 'L-104 · orange jasmine not counted toward greening (T02)', fix: {at: 30.2, text: 'Fix: soil 0.3 → 0.4 m · 35 m² counts again'}},
    {at: 32.4, until: 35.0, dot: 'amber', title: 'Two sheets, one drawing, different titles', sub: 'L-102 and L-103 · 91% the same line work (T08)', fix: {at: 34.0, text: 'Fix: confirm two floors · price each once'}},
    {at: 35.3, until: 39.2, dot: 'red', title: 'A planter over the lift shaft — send back', sub: 'L-102 · planter B-10, 7.5 m² · 3.0 m² over the shaft (T09)', fix: {at: 37.9, text: 'Fix: move the planter off the core'}},
    {at: 39.5, until: 45.5, dot: 'blue', title: 'Escape corridor 0.9 m — the code asks 1.2 m', sub: 'local building code · on 8F, 12F, 16F, 20F (T10)', fix: {at: 43.6, text: 'Fix: move the planters to the walls → 1.5 m'}},
    {at: 54.0, until: 57.3, dot: 'blue', title: 'Muse Spark: one tree, 95%', sub: 'twelve LINE entities · it asks before it counts (E01)'},
    {at: 66.0, until: 68.7, dot: 'amber', title: 'Billed 12 trees. Drawn 8.', sub: 'bill row 6 · Camphor tree, cal. 10 cm (E02.2)', fix: {at: 67.6, text: 'Fix: row 6 · 12 → 8 trees · −$516'}},
    {at: 74.4, until: 77.5, dot: 'amber', title: 'Pavers $10,856 over your price list', sub: 'bill row 11 · $117/m² · your list up to $71 · 236 m² (E20)', fix: {at: 76.3, text: 'Fix: reprice at your list · $71/m²'}},
  ],

  typical: {lit: 23.0, step: 0.55, card: 23.2, floors: ['12', '16', '20']},
  hedge: {note: 'DU H0.6 @0.3m o.c. DOUBLE ROW', decoded: 'Duranta hedge · one plant every 0.3 m · two rows', bill: 'bill row 7 · Duranta hedge · 27 m', card: 'The bill prices metres; the drawing means 182 plants', grow: [70.4, 72.8], n: 182},
  pit: {tilt: 77.6, paper: [78.6, 79.4], shrink: [81.0, 82.0], meter: 80.2, seven: 83.2, pass: 85.0},

  findings: {
    at: 87.2,
    sendBack: ['A tree drawn outside the site (E08)', 'A planter over the lift shaft (T09)', 'A sheet on the index, not in the package (E29)', 'Title block 1:200, scale bar 1:100 (E16)', 'Legend: paving code and hatch disagree (E11)', 'Two sheets alike, 91% (T08)'],
    fix: ['Billed 12 trees, drawn 8 · $516', 'Hedge billed 27 m, drawn 182 plants', 'Pavers 65% over your list · $10,856', 'Roof lawn 57% under your list (T07)'],
    code: ['Greenery 209.9 / 297 (E14)', 'Roof soil 0.3 m, minimum 0.4 m (T02)', 'Escape corridor 0.9 m, minimum 1.2 m (T10)'],
    total: '$19,248 to query',
  },

  /**
   * The voice. Eric's lines carry `words`: [start, end] in film time for each phrase (from his transcript); the rest
   * are timed at 155 wpm from `at`. `pictureUntil` is the end of the line's picture.
   */
  voice: [
    // the opening, in the narration voice since he no longer appears on camera (scripts/opening-v3.py); timed from
    // voice-v2.json like the narration, its numbers a beat after the cold open's cards (5.1, 8.4, 13.0)
    {n: 1, at: 0.331, who: 'Eric', text: 'Every building gets approved on drawings like these.'},
    {n: 2, at: 3.78, who: 'Eric', text: 'A landscape package is thirty files, and checking it by hand takes about two weeks.'},
    {n: 3, at: 9.62, who: 'Eric', text: "I'm Eric. I built Landsight to do it in ten minutes."},
    {n: 4, at: 15.2, pictureUntil: B.drawer103, text: 'A building shows up as a stack of flat drawings. The mistakes hide between the floors.'},
    {n: 5, at: B.drawer103 + 0.1, pictureUntil: B.roof, text: 'One sheet covers four floors. The bill priced one. Landsight finds the other three.'},
    {n: 6, at: B.roof + 0.1, pictureUntil: B.alike, text: 'The roof has thirty centimetres of soil. The rule says forty.'},
    {n: 7, at: B.alike + 0.1, pictureUntil: B.lift, text: 'Two sheets? Same drawing, different titles.'},
    {n: 8, at: B.lift + 0.1, pictureUntil: B.corridor, text: 'A planter on the lift shaft? That goes back.'},
    {n: 9, at: B.corridor + 0.1, pictureUntil: B.ground, text: 'Here, planters squeeze the escape corridor down to ninety centimetres. The code wants one-twenty.'},
    {n: 10, at: B.ground + 0.1, pictureUntil: B.tree, text: 'On the ground, a row of trees.'},
    {n: 11, at: B.tree + 0.1, pictureUntil: B.confirm, text: 'You see a tree. A computer just sees twelve loose lines.'},
    {n: 12, at: B.confirm + 0.1, pictureUntil: B.raster, text: 'Muse Spark sees one tree, then asks you before it counts.'},
    {n: 13, at: B.raster + 0.1, pictureUntil: B.bills, text: "A coloured picture? SAM 3.1 measures every patch. The lawn's a hundred and ninety-five square metres. The drawings say two hundred."},
    {n: 14, at: B.bills + 0.1, pictureUntil: B.hedge, text: 'The bill says twelve. Eight are drawn.'},
    {n: 15, at: B.hedge + 0.1, pictureUntil: B.pavers, text: "One hedge label means a hundred and eighty-two plants. The bill's in metres."},
    {n: 16, at: B.pavers + 0.1, pictureUntil: B.pit, text: 'The pavers? Ten thousand over your price list.'},
    {n: 17, at: B.pit + 0.2, pictureUntil: B.findings, text: 'On the slab, the pits are too small. So big trees count as small, and the greenery falls short. Seven more trees fix it.'},
    {n: 18, at: B.findings - 0.3, pictureUntil: INSERT_AT, text: 'A developer told us: send the nonsense straight back, and flag the rest one by one.'},
    // the private-mode beat (scripts/private-v3.py), between Part 1 and the type card
    {n: 28, at: 92.424, pictureUntil: INSERT_AT + INSERT_S, text: "Confidential drawings? Run it on Meta's open weights, in a deployment you control. Same result."},
    {n: 19, at: PART2_AT + 0.15, pictureUntil: capToFilm(CAP.continue), text: 'Drop in the folder, as is. Every file gets a verdict, and it names the bill that counts.'},
    {n: 20, at: capToFilm(CAP.continue) + 0.3, pictureUntil: capToFilm(CAP.analyze), text: 'It reads the project straight off the title block. Your price list, your local rules. Hit analyze.'},
    {n: 21, at: capToFilm(CAP.analyze) + 0.2, pictureUntil: capToFilm(CAP.review), text: 'Muse Spark reads every sheet. SAM 3.1 measures the colour plans. Geometry counts. All in about two minutes.'},
    {n: 22, at: capToFilm(CAP.review) + 0.2, pictureUntil: capToFilm(CAP.e14 - 0.2), text: "On the right, it's sorted the way developers work: send back, fix before pricing, the code. Every item opens on the drawing, and nothing counts until you confirm."},
    {n: 23, at: capToFilm(CAP.e14) + 0.1, pictureUntil: capToFilm(CAP.select1 - 0.3), text: 'Short on greenery? It shows you the fixes that would pass.'},
    {n: 24, at: capToFilm(CAP.select1) + 0.1, pictureUntil: capToFilm(CAP.ask - 0.2), text: 'Pick what goes back. It writes the change request, clouded and priced right on the drawing, and drafts your reply to the developer, ready to send.'},
    {n: 25, at: capToFilm(CAP.ask) + 0.1, pictureUntil: CLOSE_AT, text: "Point at anything and ask. It answers from the package, and it'll tell you when you're wrong."},
    {n: 26, at: CLOSE_AT + 0.2, pictureUntil: CLOSE_AT + END.line, text: 'We planted thirty errors. It found twenty-eight, flagged two, missed none.'},
    {n: 27, at: CLOSE_AT + 5.45, pictureUntil: LOGO_AT + END.hold, text: 'Every number, traced to the drawing.'},
  ],
};

export const wordCount = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
export const MAX_CHARS = 42;

const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)(-(one|two|three|four|five|six|seven|eight|nine|twenty))?$|^\d[\d.,]*$/i;
/** For each word of a phrase, the number it belongs to ("a hundred and ninety-five" is one number), or -1. */
export function numberWords(words) {
  const bare = words.map((w) => w.replace(/[,;:.?!]+$/, '').toLowerCase());
  const isNum = (i) => i >= 0 && i < bare.length && NUMBER_WORD.test(bare[i]);
  const ids = bare.map(() => -1);
  let id = -1;
  for (let i = 0; i < bare.length; i++) {
    const glue = (bare[i] === 'a' && /^(hundred|thousand|million)$/.test(bare[i + 1] ?? '')) ||
      (bare[i] === 'and' && /^(hundred|thousand|million)$/.test(bare[i - 1] ?? '') && isNum(i + 1));
    if (!isNum(i) && !glue) continue;
    ids[i] = i > 0 && ids[i - 1] >= 0 && !/[,;:.?!]$/.test(words[i - 1]) ? ids[i - 1] : ++id;
  }
  return ids;
}

/**
 * Splits a line into one-line phrases (≤ MAX_CHARS), breaking at its pauses, then at the most balanced word gap; never
 * inside a number, nor between a number and the word it counts ("The lawn's / a hundred and ninety-five square metres.").
 */
export function phrases(text) {
  const clauses = [];
  let cur = '';
  for (const tok of text.split(/(\s+)/)) {
    cur += tok;
    if (/[,;:.?!]$|—$/.test(tok.trim()) && tok.trim()) {
      clauses.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) clauses.push(cur.trim());
  // a dash at the start of a clause belongs at its end ("files —" / "and checking")
  const split = (c) => {
    if (c.length <= MAX_CHARS) return [c];
    const words = c.split(' ');
    const num = numberWords(words);
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const inNumber = num[i - 1] >= 0 && (num[i] === num[i - 1] || !/[,;:.?!]$/.test(words[i - 1]));
      const score = Math.max(a.length, b.length) + (/^(and|or|the|a|to|of|in|on|for)$/i.test(words[i - 1]) ? 6 : 0) + (inNumber ? 100 : 0);
      if (!best || score < best.score) best = {a, b, score};
    }
    return [...split(best.a), ...split(best.b)];
  };
  const pieces = clauses.flatMap(split);
  // merge short neighbours that read as one phrase
  const out = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    if (prev && !/[.?!]$/.test(prev) && (prev + ' ' + p).length <= 30 && (prev.length < 14 || p.length < 14)) out[out.length - 1] = prev + ' ' + p;
    else out.push(p);
  }
  // a fragment too short to read on its own ("lawn,", "Pavers,") joins a neighbour, re-split evenly if that is too long
  for (let i = 0; i < out.length; i++) {
    if (out[i].length >= 10 || /^[A-Z].*[.?!]$/.test(out[i])) continue;
    const prev = out[i - 1];
    const next = out[i + 1];
    if (prev && !/[.?!]$/.test(prev) && (prev + ' ' + out[i]).length <= MAX_CHARS) (out.splice(i - 1, 2, prev + ' ' + out[i]), (i -= 1));
    else if (next) out.splice(i, 2, ...split(out[i] + ' ' + next));
  }
  return out;
}

/** Every caption chunk with its film times: one line on screen at a time, shown while it is spoken. */
export function captions() {
  const chunks = [];
  for (const v of V2.voice) {
    const ps = phrases(v.text);
    if (v.fixed) {
      for (const [text, start, end] of v.fixed) chunks.push({n: v.n, text, start, end});
      continue;
    }
    if (v.cuts) {
      // Eric's phrases at the pauses heard in his take (B-cut seconds where each phrase after the first begins)
      const starts = [v.spans[0][0], ...v.cuts].map((x) => x - B_OFFSET);
      const last = v.spans[v.spans.length - 1][1] - B_OFFSET;
      ps.forEach((p, i) => chunks.push({n: v.n, text: p, start: starts[i], end: starts[i + 1] ?? last}));
      continue;
    }
    if (v.spans) {
      // Eric: spread the phrases over his spoken spans, by their share of the words
      const spans = v.spans.map(([a, b]) => [a - B_OFFSET, b - B_OFFSET]);
      const total = spans.reduce((s, [a, b]) => s + (b - a), 0);
      const words = ps.map(wordCount);
      const all = words.reduce((a, b) => a + b, 0);
      // map a fraction of the speaking time onto the spans (gaps between spans are skipped)
      const at = (frac) => {
        let left = frac * total;
        for (const [a, b] of spans) {
          if (left <= b - a + 1e-6) return a + left;
          left -= b - a;
        }
        return spans[spans.length - 1][1];
      };
      // "I'm Eric." owns the first span on its own when the line has one
      let acc = 0;
      ps.forEach((p, i) => {
        let s = at(acc / all);
        acc += words[i];
        let e = at(acc / all);
        if (spans.length > 1 && i === 0 && /^I'm Eric\.$/.test(p)) (s = spans[0][0], e = spans[0][1], (acc = 0), (spans.shift()));
        chunks.push({n: v.n, text: p, start: s, end: e});
      });
      // after "I'm Eric." the remaining phrases share the remaining span
      continue;
    }
    const al = aligned[String(v.n)];
    if (al && al.text === v.text) {
      // timed to the words as spoken: a phrase shows from its first letter to its last
      let from = 0;
      for (const p of ps) {
        const i = v.text.indexOf(p, from);
        const j = i + p.length - 1;
        from = j + 1;
        let a = i;
        while (a < j && !/[A-Za-z0-9]/.test(v.text[a])) a++;
        let b = j;
        while (b > a && !/[A-Za-z0-9]/.test(v.text[b])) b--;
        chunks.push({n: v.n, text: p, start: al.st[a], end: al.en[b] + 0.12});
      }
      continue;
    }
    let t = v.at;
    for (const p of ps) {
      const d = wordCount(p) / WPS;
      chunks.push({n: v.n, text: p, start: t, end: t + d});
      t += d;
    }
  }
  // each chunk holds until the next starts when the gap is short, never past the next start
  for (let i = 0; i < chunks.length; i++) {
    const next = chunks[i + 1];
    if (next) {
      if (next.start - chunks[i].end < 0.35) chunks[i].end = next.start;
      chunks[i].end = Math.min(chunks[i].end, next.start);
    } else chunks[i].end += 0.4;
  }
  return chunks;
}

/** Overruns: lines whose speech outlasts their picture (at 155 wpm). */
export const timed = () =>
  V2.voice.map((v, i, all) => {
    const s = wordCount(v.text) / WPS;
    const next = all[i + 1];
    return {...v, start: v.at, seconds: s, end: v.at + s, overrun: v.pictureUntil ? Math.max(0, +(v.at + s - v.pictureUntil).toFixed(2)) : 0, clipped: next ? Math.max(0, +(v.at + s - next.at).toFixed(2)) : 0};
  });
