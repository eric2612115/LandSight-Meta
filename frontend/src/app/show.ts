/** What the director layer is revealing on the real screens. Every field is null when nothing is being played: the
 * screen then shows itself in full, exactly as the product does. */
import { create } from 'zustand'

export type Show = {
  caption?: { id?: string; text: string; key: number; top?: boolean }
  /** a control to pulse (the director's next click): 'drop' | 'review' | 'confirm' | 'colour' | 'ask' | 'action' | 'letter' */
  pulse?: string
  /** Open: file rows resolved so far */
  files: number | null
  /** Open: the run facts and the Review button */
  facts: boolean | null
  /** Review: pins dropped, list rows shown, the toolbar counts (0..1) */
  pins: number | null
  rows: number | null
  counted: number | null
  /** the callout: shown at all, Spark's recorded fields typed so far, its points, the three sources */
  callout: boolean | null
  typed: number | null
  points: boolean | null
  sources: number | null
  /** hedge: the tape (0..1), the formula lines, the plants placed */
  tape: number | null
  formula: number | null
  dots: number | null
  /** colour: the pour (0..1), masks bloomed, the control's lines */
  pour: number | null
  masks: number | null
  control: number | null
  /** gauge: the bar's value, the fixes shown */
  gauge: number | null
  fixes: number | null
  /** bill: the inspector's hops shown (1 the bill, 2 the drawing, 3 the money) */
  hop: number | null
  /** ask: the question typed so far, the answer's characters, the citation lit, the actions shown */
  asked: string | null
  answer: number | null
  cite: number | null
  actions: number | null
  /** statement: the count-up (0..1) and the scoreboard rows */
  count: number | null
  score: number | null
}

export const SHOW_NONE: Show = {
  files: null, facts: null, callout: null, pins: null, rows: null, counted: null, typed: null, points: null, sources: null, tape: null,
  formula: null, dots: null, pour: null, masks: null, control: null, gauge: null, fixes: null, hop: null, asked: null,
  answer: null, cite: null, actions: null, count: null, score: null,
}

export const useShow = create<Show>(() => ({ ...SHOW_NONE }))

export const show = (p: Partial<Show>) => useShow.setState(p)

let captionKey = 0
/** The burned-in line; `top` when the scene's subject is at the foot of the screen (the dock). */
export const caption = (text: string, id?: string, top = false) => useShow.setState({ caption: { text, id, key: ++captionKey, top } })
export const clearShow = () => useShow.setState({ ...SHOW_NONE, caption: undefined, pulse: undefined }, false)

/** n of `total` while playing, all of them otherwise. */
export const upto = (v: number | null, total: number) => (v === null ? total : Math.min(total, v))
