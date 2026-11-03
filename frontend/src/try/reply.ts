/** The change request's lines and the reply to the developer, as plain functions: the lines are numbered as the
 * clouded sheets number them (the selected findings in the list's order, then the marks the ask made), and the email
 * lists those same numbers with each line's money. No React and no store here; Export.tsx draws what these return. */
import { fill } from './i18n'
import type { Finding } from './model'
import type { Mark } from './store'

/** What one line of the change request says (the sheet's number, the plain title, the change, the money shown). */
export type LineText = { sheet?: string; what: string; change: string; money: string; evidence: string }
export type ChangeLine<S = unknown> = LineText & { n: number; sheetRef?: S; f?: Finding; m?: Mark }

/** The change request's lines: the selected findings in the order given (the list's), then every mark; numbered from
 * 1 in that order, the number each line's cloud carries on its sheet. */
export function changeLines<S>(
  findings: Finding[],
  checked: Record<string, boolean>,
  marks: Mark[],
  say: { finding: (f: Finding) => LineText & { sheetRef?: S }; mark: (m: Mark) => LineText & { sheetRef?: S } },
): ChangeLine<S>[] {
  const picked = findings.filter((f) => checked[f.id])
  return [
    ...picked.map((f, i) => ({ ...say.finding(f), n: i + 1, f })),
    ...marks.map((m, i) => ({ ...say.mark(m), n: picked.length + i + 1, m })),
  ]
}

/** A UI string in the screen's language (`t` in /try); English with `{n}` filled by default. */
export type Tr = (s: string, ...values: (string | number)[]) => string
const english: Tr = (s, ...values) => fill(s, values)

export type Reply = { to: string; subject: string; body: string }

/** One numbered line: "2. [L-1] Billed 12, drawn 8 — Row 6: 12 → 8 Camphor · $516" (the money once: a change line
 * that already prints it does not get it again). */
export function replyLine(l: Pick<ChangeLine, 'n' | 'sheet' | 'what' | 'change' | 'money'>): string {
  const money = l.money && !l.change.includes(l.money) ? ` · ${l.money}` : ''
  return `${l.n}. ${l.sheet ? `[${l.sheet}] ` : ''}${l.what} — ${l.change}${money}`
}

/** The package name without the project's name in front ("Greenfield Residences — Landscape Package" under the project
 * "Greenfield Residences" is "Landscape Package"), so the subject names the project once. */
export function packagePart(project: string, pkg: string): string {
  const p = project.trim()
  const rest = p && pkg.startsWith(p) ? pkg.slice(p.length).replace(/^\s*[—–-]\s*/, '').trim() : ''
  return rest || pkg
}

/** The reply to the developer: To (the developer the cover names, else blank), Subject "Change request — <project> —
 * <package without the project's name>", a short body with the numbered changes and their money, and the attachment
 * line last. */
export function replyEmail(o: { to?: string; project: string; pkg: string; lines: Pick<ChangeLine, 'n' | 'sheet' | 'what' | 'change' | 'money'>[]; total: string }, tr: Tr = english): Reply {
  const to = o.to?.trim() ?? ''
  const subject = tr('Change request — {0} — {1}', o.project, packagePart(o.project, o.pkg))
  const body = [
    to ? tr('Dear {0},', to) : tr('Dear developer,'), '',
    tr('We reviewed {0}. Please revise these {1} points before we price the job:', o.pkg, o.lines.length), '',
    ...o.lines.map(replyLine), '',
    tr('Queried: {0}.', o.total), '',
    tr('Regards'), '',
    tr('Attached: change-request.pdf'),
  ].join('\n')
  return { to, subject, body }
}

/** A `mailto:` link with the subject and body encoded (no address: the developer's name is not an address). */
export const mailtoOf = (r: Reply) => `mailto:?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.body)}`

/** The whole email as text for the clipboard: To, Subject, then the body. */
export const emailText = (r: Reply, tr: Tr = english) => [tr('To: {0}', r.to), tr('Subject: {0}', r.subject), '', r.body].join('\n')

const cap = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(]+)\S/g, (m) => m.toUpperCase()) : s)

/** The developer a cover names ("DEVELOPER: GREENFIELD DEVELOPMENT CO. (SAMPLE)", or a "DEVELOPER" label with its value
 * as the next text), in title case; undefined when no text names one. */
export function developerOf(texts: string[]): string | undefined {
  for (let i = 0; i < texts.length; i++) {
    const s = texts[i].trim()
    const m = /^DEVELOPER\s*[:：]\s*(.+)$/i.exec(s)
    if (m) return cap(m[1].trim())
    if (/^DEVELOPER$/i.test(s) && texts[i + 1]?.trim()) return cap(texts[i + 1].trim())
  }
  return undefined
}
