/**
 * Every cue the film places itself (the paper beats, the voices), as plain numbers in seconds of film time.
 * Shared by prepare.mjs (which mixes the sound effects) and the Remotion composition (which draws them), so a
 * keystroke you see is the keystroke you hear. The app beats' cues come from the captures (captures/*.events.json).
 */

export const FPS = 30

/** Beat 1, "Twelve" (0–8 s): the typed row, Enter, the hard cut to paper, one squeak per canopy, the card. */
export function coldOpen(rowLength, ticks) {
  const typeStart = 0.35
  const keyTimes = Array.from({ length: rowLength }, (_, i) => typeStart + i * 0.031 + 0.006 * Math.sin(i * 1.7))
  const typeEnd = typeStart + rowLength * 0.031
  const enter = typeEnd + 0.14
  const paper = enter + 0.36
  const tickTimes = Array.from({ length: ticks }, (_, i) => paper + 0.24 + i * 0.17)
  const hover = tickTimes[ticks - 1] + 0.17
  const card = Math.max(4.0, hover + 0.32)
  return { keyTimes, typeEnd, enter, paper, tickTimes, hover, card, voice: card + 0.14 }
}

/** Beat 2, "Who" (8–15 s): the greyed plan zooms to the open canopy, its pieces light; the title; the line. */
export function who(pieces) {
  const start = 8
  return {
    start,
    zoomEnd: start + 0.9,
    pieceTimes: Array.from({ length: pieces }, (_, i) => start + 1.0 + i * 0.19),
    titleIn: start + 0.25,
    titleOut: start + 4.25,
    lineIn: start + 4.25,
    end: 15,
  }
}

/** Beat 11 (172–180 s): the close card, then the end card; room tone in the last second. */
export const CLOSE = { start: 172, endCard: 177.7, roomTone: 179, end: 180 }

/** Where each beat's line starts: its beat start plus a breath, never on top of the previous line. */
export function voicePlan(beats, durations, coldVoice) {
  const plan = []
  let prevEnd = -1
  for (const b of beats) {
    const d = durations[b.n]
    if (!d) continue
    const want = b.n === 1 ? coldVoice : b.n === 2 ? b.start + 0.05 : b.n === 11 ? b.start + 0.3 : b.start + 0.45
    const at = Math.max(want, prevEnd + 0.2)
    plan.push({ n: b.n, at, end: at + d, seconds: d })
    prevEnd = at + d
  }
  return plan
}
