/**
 * Film v7, Part 1 (0:00–1:30, 60 fps): every cue in seconds, shared by story-v7-prepare.mjs (voice, music, effects,
 * the mix, the data file) and src/scenes/StoryV7.tsx (the picture), so a thing you see land is the sound you hear.
 * Times follow demo/SCRIPT-V7.md, Part 1. Every number on screen is read from the runs in story-v7-prepare.mjs.
 */

export const V7 = {
  fps: 60,
  duration: 90,
  width: 1920,
  height: 1080,

  /** The 3D tower (0–22 s): the crane, the lift-apart, the grid, the push, the restack, the six plates, the bill row. */
  tower: {
    crane: {start: 0, end: 3.0},
    lift: {start: 3.0, stagger: 0.12, perSlab: 0.9}, // slab i lifts at start + i·stagger and is a sheet perSlab later
    grid: {settle: 6.0, hold: 8.0},
    push: {start: 8.0, end: 10.0}, // onto L-103 (the L1 fallback under the live slot)
    restack: {start: 10.0, end: 12.4},
    plates: {start: 12.6, step: 0.32}, // L-103 lights, then 9, 12, 15, 18, 21F
    bill: {rowIn: 15.0, circle: 16.0, dark: 16.9},
    card: {in: 19.0, out: 22.0},
    fade: {out: 22.0},
  },
  /** Hook 1 v3 plays its own clock from 1.0 s at 0:22 (the push is already under way), so its snap lands at 0:33.45. */
  hook: {start: 22.0, offset: 1.0, end: 36.0},
  desk: {
    start: 36.0,
    billRow: 36.4,
    canopies: {start: 37.8, step: 0.3}, // 1…8, the thud on 8
    hedge: {start: 42.0, tape: {from: 42.6, to: 44.4}, plants: 44.6},
    pavers: {start: 46.0, line: 46.4},
    total: {start: 50.0, stack: 50.2, sum: 51.0},
    end: 52.0,
  },
  gauge: {
    start: 52.0,
    fill: {from: 52.4, to: 54.6},
    trees: {drop: 57.6, step: 0.35, rise: {from: 58.2, to: 59.4}},
    pit: {in: 59.8, shrink: 60.8, fall: {from: 61.0, to: 62.2}},
    fixes: {start: 63.0, a: 63.4, b: 64.4},
    end: 66.0,
  },
  live: {
    L1: {start: 8.0, end: 10.0},
    L2: {start: 66.0, end: 69.0},
    L3: {start: 86.5, end: 90.0},
  },
  developer: {
    start: 69.0,
    zoom: {from: 69.2, to: 71.0},
    cloud: {from: 71.0, to: 72.2},
    card: 72.6,
    panel: {in: 76.5, rows: {start: 76.9, step: 0.4}},
    end: 79.5,
  },
  promise: {start: 79.5, chips: 81.6, meta: 83.0, end: 86.5},
  close: {start: 86.5, screenIn: 88.0},

  /** The type cards: Inter 104 px, ≤ 7 words, one at a time, 6-frame fade + 12 px rise. */
  cards: [
    {text: '30 files. Two weeks. By hand.', at: 6.2, until: 8.0, place: 'centre'},
    {text: 'One sheet. Six floors.', at: 12.6, until: 15.0, place: 'low'},
    {text: 'The bill priced one.', at: 16.9, until: 19.0, place: 'low'},
    {text: 'Twelve lines. No tree.', at: 29.0, until: 33.0, place: 'low'},
    {text: 'One tree — confirmed by you.', at: 33.5, until: 36.0, place: 'low'},
    {text: 'Billed 12. Drawn 8.', at: 40.2, until: 42.0, place: 'low'},
    {text: 'A note. 182 plants. Billed: 27 m.', at: 44.6, until: 46.0, place: 'low'},
    {text: '$10,856 over your own price list.', at: 47.4, until: 50.0, place: 'low'},
    {text: '$17,788 to query.', at: 51.0, until: 52.0, place: 'low'},
    {text: 'Building code: not enough greenery.', at: 54.6, until: 57.3, place: 'low'},
    {text: 'On a slab, a big tree counts as small.', at: 61.0, until: 63.0, place: 'low'},
    {text: 'It finds the fixes that work.', at: 64.8, until: 66.0, place: 'low'},
    {text: 'We asked a developer how he reviews.', at: 66.4, until: 69.0, place: 'low'},
    {text: 'Nonsense goes straight back.', at: 73.2, until: 76.3, place: 'low'},
    {text: 'The details: flagged, one by one.', at: 78.4, until: 79.5, place: 'low'},
    {text: 'Two weeks → two minutes.', at: 79.6, until: 86.4, place: 'centre', scrim: false},
    {text: 'The real product. Recorded, not mocked.', at: 86.6, until: 90.0, place: 'centre', scrim: false, fallbackL3: true},
  ],

  /** The voice, one ElevenLabs file per line (Eric's clone), at the script's start times. */
  voice: [
    {n: 1, at: 3.2, text: 'Every building is approved on paper.'},
    {n: 2, at: 10.5, text: 'One sheet stands for six floors.'},
    {n: 3, at: 15.5, text: 'The bill priced one.'},
    {n: 4, at: 23.0, text: 'This is the tree a person reads.'},
    {n: 5, at: 26.5, text: 'But this — is the tree a computer sees.'},
    {n: 6, at: 31.8, text: 'Muse Spark reads one tree — and asks you first.'},
    {n: 7, at: 37.5, text: 'The bill says twelve. The drawing has eight.'},
    {n: 8, at: 42.3, text: 'A hedge priced by the metre.'},
    {n: 9, at: 46.3, text: 'Pavers, ten thousand dollars over your own list.'},
    {n: 10, at: 52.3, text: 'And the building code: not enough greenery.'},
    {n: 11, at: 57.3, text: 'The easy fix fails — the tree pits sit on a concrete slab.'},
    {n: 12, at: 66.3, text: 'A developer told us how he reviews.'},
    {n: 13, at: 69.8, text: 'Nonsense — a pool in mid-air, a tree off the site — goes straight back.'},
    {n: 14, at: 76.5, text: 'The details, flagged one by one.'},
    {n: 15, at: 79.5, text: 'Two weeks of checking — in about two minutes, with Muse Spark and SAM 3.1.'},
    {n: 16, at: 86.5, text: "Here's the real product."},
  ],

  /** Music M1: one 90 s bed from ElevenLabs Music; the dip and return are shaped in the mix. */
  music: {
    file: 'audio/music/v7-m1.mp3',
    seconds: 90,
    prompt:
      'Cinematic minimal score, 90 seconds, no vocals. A felt piano, sparse and unhurried, over a low warm synth pulse. ' +
      'Starts almost silent and intimate; builds gently at 8 seconds; a second, fuller build at 52 seconds with a soft string pad; ' +
      'falls to near silence at 79 seconds; returns at 82 seconds; resolves on a held warm chord at 88 seconds. Slow tempo, about 70 BPM, in a minor key, reflective, modern, no drums.',
    duck: {from: 79.0, to: 82.0, db: -24},
    end: {fadeFrom: 88.6, fadeTo: 90.0},
  },

  /** The effects: a short ElevenLabs sound per kind, placed at the cue. */
  sfx: {
    kinds: {
      'sub-hit': {text: 'A single deep cinematic sub bass hit, clean and dry, short tail', seconds: 2.0},
      'paper-whoosh': {text: 'A single sheet of paper whipping through the air, quick soft whoosh, dry', seconds: 0.8},
      'sheet-flip': {text: 'One sheet of thick paper flipped over on a desk, close, dry', seconds: 0.8},
      stamp: {text: 'A rubber stamp pressed firmly once on paper, close, dry', seconds: 0.8},
      tick: {text: 'A single very soft interface tick, quiet, clean, short', seconds: 0.5},
      'tape-zip': {text: 'A measuring tape pulled out quickly, a short zip, close, dry', seconds: 1.4},
      'glass-shimmer': {text: 'A soft glass shimmer, a gentle bright transient with a short sparkle tail, subtle', seconds: 1.2},
      chime: {text: 'A single low soft chime, warm, short decay, subtle', seconds: 1.6},
      buzz: {text: 'A short low error buzz, muted, dry', seconds: 0.7},
      whoosh: {text: 'A smooth cinematic whoosh transition, air, medium length', seconds: 1.4},
      rasp: {text: 'A very short pencil scratch on paper, one stroke, close, dry', seconds: 0.5},
      thud: {text: 'A soft heavy thud, a book set down on a desk, close, dry', seconds: 1.0},
      'low-tone': {text: 'A low ominous sustained synth tone, soft, two seconds, fades', seconds: 2.5},
      'paper-thump': {text: 'A thick stack of paper dropped onto a wooden desk, heavy thump, close', seconds: 1.2},
      'room-tone': {text: 'Quiet room tone with faint paper rustling, soft, steady', seconds: 2.5},
    },
    /** [kind, at, gain]. */
    cues: [
      ['sub-hit', 0.3, 1.0],
      // a paper whoosh per sheet as the slabs become paper (22 slabs, every other one is heard)
      ...Array.from({length: 11}, (_, i) => ['paper-whoosh', 3.0 + i * 0.24 + 0.6, 0.35]),
      ['room-tone', 8.0, 0.5],
      ['sheet-flip', 8.6, 0.6],
      ['sheet-flip', 9.3, 0.6],
      ['whoosh', 10.0, 0.6],
      ...Array.from({length: 6}, (_, i) => ['tick', 12.6 + i * 0.32, 0.8]),
      ['thud', 16.9, 0.9],
      ['glass-shimmer', 19.0, 0.8],
      ['whoosh', 22.0, 0.5],
      ...Array.from({length: 12}, (_, i) => ['rasp', 22.0 - 1.0 + 5.15 + i * 0.14, 0.5]), // scene1's rasps on its own clock
      ['whoosh', 22.0 - 1.0 + 12.45, 0.4], // the snap
      ['chime', 22.0 - 1.0 + 12.95, 0.8],
      ['sheet-flip', 36.0, 0.7],
      ...Array.from({length: 8}, (_, i) => ['tick', 37.8 + i * 0.3, 0.7]),
      ['thud', 37.8 + 7 * 0.3 + 0.1, 0.9],
      ['tape-zip', 42.6, 0.9],
      ['tick', 44.6, 0.7],
      ['chime', 51.0, 0.8],
      ['low-tone', 52.4, 0.7],
      ['tick', 57.6, 0.6],
      ['tick', 57.95, 0.6],
      ['buzz', 60.8, 0.8],
      ['chime', 63.4, 0.7],
      ['paper-thump', 66.1, 1.0],
      ['whoosh', 69.0, 0.5],
      ['stamp', 72.6, 0.9],
      ['glass-shimmer', 76.5, 0.6],
      ...Array.from({length: 4}, (_, i) => ['tick', 76.9 + i * 0.4, 0.7]),
      ['sub-hit', 79.5, 0.7],
      ['tick', 81.6, 0.6],
      ['tick', 82.0, 0.6],
      ['whoosh', 88.0, 0.8],
    ],
  },
};
