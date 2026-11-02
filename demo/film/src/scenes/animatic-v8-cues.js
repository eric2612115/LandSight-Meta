/**
 * Film v8 animatic (demo/SCRIPT-V8.md, "one journey"): every time in seconds. Part 1 is one three.js world
 * (WorldV8.tsx) under one camera path; Part 2 is the real /try capture (captures/try-test.mp4, 88 s) with the script's
 * lines timed to its director cues (captures/try-test.cues.json); the close. No sound: picture and timed subtitles.
 */
export const WPM = 155;
export const WPS = WPM / 60; // 2.58 words a second
export const CAPTURE_AT = 81; // Part 2 starts here; the capture's own clock is film time − CAPTURE_AT
export const CAPTURE_S = 88;
export const CLOSE_AT = CAPTURE_AT + CAPTURE_S; // 169
export const LOCKUP_AT = 179.2;

export const V8 = {
  fps: 30,
  duration: 181,
  width: 1920,
  height: 1080,

  /** The live slots: plain grey frames with one short label. */
  live: {
    pain: {start: 0, end: 6, label: "LIVE · Eric's screen, red boxes"},
    site: {start: 53, end: 55.5, label: 'LIVE · a tape across a real tree pit, 1.5 m'},
    turn: {start: 72, end: 78, label: 'LIVE · the junk folder, the lamp, to camera'},
  },
  /** The opening push and the laptop push. */
  push: {pain: {from: 2.0, to: 6.0}, laptop: {from: 78, to: 81}},

  /** The three big type cards. */
  cards: [
    {text: 'Two weeks → two minutes.', at: 78.6, until: 81.6},
    {text: '30 planted · 28 found · 2 flagged · 0 missed', at: CLOSE_AT + 0.4, until: LOCKUP_AT},
  ],

  /** The voice (subtitles; the clone later): `at` is the script's start, `pictureUntil` the end of the picture it sits on. */
  voice: [
    {n: 1, at: 0.3, pictureUntil: 6, text: 'This is how a landscape package gets checked today. Thirty files, two weeks, one person boxing errors by hand.'},
    {n: 2, at: 8.0, pictureUntil: 10, text: 'Because a building arrives as a stack of drawings —'},
    {n: 3, at: 11.7, pictureUntil: 18, text: 'and the errors hide between them. One sheet stands for six floors; the bill priced one.'},
    {n: 4, at: 18.3, pictureUntil: 24, text: 'Down on the ground, the drawing shows a row of trees. Look closer at the eighth.'},
    {n: 5, at: 24.3, pictureUntil: 30.7, text: "To a person, it's a tree. To a computer, it's twelve loose lines — no tree at all."},
    {n: 6, at: 30.7, pictureUntil: 34, text: 'Muse Spark reads it as one tree — and still asks you before it counts.'},
    {n: 7, at: 36.3, pictureUntil: 49, text: 'The bill charges for twelve; the drawing has eight. The hedge is one note — a hundred and eighty-two plants — priced by the metre. The pavers, ten thousand over your own price list.'},
    {n: 8, at: 49.4, pictureUntil: 63, text: "Underneath it all is a concrete slab. On a slab, a big tree counts as small — so the greenery falls short of the building code, and adding trees won't fix it. Landsight finds the fix that does."},
    {n: 9, at: 63.5, pictureUntil: 72, text: 'A developer told us how he reviews. Nonsense — a pool in mid-air, a tree off the site — goes straight back. Everything else, he wants flagged, one by one.'},
    {n: 10, at: 75.3, pictureUntil: 78, text: "No more of this. Here's the real product.", who: 'Eric'},
    {n: 11, at: 78.4, pictureUntil: 81, text: 'Two weeks — in about two minutes.'},
    // Part 2: at the director's cues (capture clock + CAPTURE_AT): drop 2.0 · Continue 9.26 · Analyze 16.96 · Review 26.82 · E08 30.89 · E02.2 35.52 · E01 38.12 · Confirm 43.9 · E14 47.36 · Select 53.06 · Create 59.26 · close report 71.16 · Ask 71.96–81.1
    {n: 12, at: CAPTURE_AT + 2.0, pictureUntil: CAPTURE_AT + 9.26, text: 'Drop the folder as it came — backups, scans, four versions of the bill. Every file gets a verdict, and the one that governs is named.'},
    {n: 13, at: CAPTURE_AT + 11.8, pictureUntil: CAPTURE_AT + 16.96, text: 'It reads the project off the title block. Pick what to check, and analyze.'},
    {n: 14, at: CAPTURE_AT + 17.2, pictureUntil: CAPTURE_AT + 26.82, text: 'Muse Spark reads every sheet and document, SAM 3.1 measures the colour plans, and the geometry does the counting.'},
    {n: 15, at: CAPTURE_AT + 26.9, pictureUntil: CAPTURE_AT + 43.9, text: "On the right, the developer's way: what to send back, what to fix before pricing, what the code says. Every item opens on the drawing with its evidence — and nothing counts until you confirm it."},
    {n: 16, at: CAPTURE_AT + 47.4, pictureUntil: CAPTURE_AT + 53.06, text: 'Short on greenery? It shows the fixes that pass.'},
    {n: 17, at: CAPTURE_AT + 53.1, pictureUntil: CAPTURE_AT + 71.16, text: 'Pick what goes back to the developer — and it writes the change request: every point clouded on the drawing, numbered and priced, ready to send.'},
    {n: 18, at: CAPTURE_AT + 72.0, pictureUntil: CAPTURE_AT + CAPTURE_S, text: "Point at anything and tell it what you think. It answers from the package — even when you're wrong — and marks the drawing with the right question."},
    {n: 19, at: CLOSE_AT + 0.3, pictureUntil: LOCKUP_AT, text: 'We hid thirty errors in a package. It found twenty-eight, flagged two for a person, and missed none. Every number traces back to the drawing.'},
  ],
};

export const wordCount = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
export const seconds = (text) => wordCount(text) / WPS;
/** Each line with its 155-wpm end and its overrun past the picture it sits on. */
export const timed = () =>
  V8.voice.map((v) => {
    const s = seconds(v.text);
    return {...v, seconds: s, end: v.at + s, overrun: Math.max(0, +(v.at + s - v.pictureUntil).toFixed(1))};
  });
