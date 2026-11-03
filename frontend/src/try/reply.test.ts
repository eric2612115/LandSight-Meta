/** /try Export: the reply to the developer against the recorded run (frontend-mock/run.json) — the change request's
 * numbers are the clouds' numbers, the money is formatted as on screen, only the selected changes are listed. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalise } from '../lib/api'
import { objectsOn } from '../lib/flags'
import { formatMoney } from '../lib/money'
import type { Run } from '../lib/types'
import { cloudBox, mergeClouds } from './cloud'
import { findingsOf, isMoney, type Finding } from './model'
import { changeLines, developerOf, emailText, mailtoOf, replyEmail, replyLine } from './reply'
import type { Mark } from './store'

const run = normalise(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'frontend-mock', 'run.json'), 'utf8')) as Run, 'repo')
const findings = findingsOf(run)
const sheetOf = (id?: string) => run.sheets.find((s) => s.sheet_id === id)
const money = (f: Finding) => (isMoney(f.money) ? formatMoney(f.money.twd, 'twd') : '')
const say = {
  finding: (f: Finding) => ({ sheetRef: sheetOf(f.sheetId), sheet: sheetOf(f.sheetId)?.number, what: `what ${f.id}`, change: `change ${f.id}`, money: money(f), evidence: '' }),
  mark: (m: Mark) => ({ sheetRef: sheetOf(m.sheetId), sheet: sheetOf(m.sheetId)?.number, what: m.note, change: `Asked: ${m.question}`, money: '', evidence: '' }),
}
const mark: Mark = { id: 'M1', sheetId: 'L-1-revB', objectIds: ['T-10'], note: 'Remove T-10', question: 'This tree is outside the site.' }
// selected in a different order than the list shows them; E10 stays unselected
const checked = { E14: true, 'E02.2': true, E08: true, E10: false }

describe('the change request lines', () => {
  const lines = changeLines(findings, checked, [mark], say)
  it('are the selected findings in the list’s order, then the marks, numbered from 1', () => {
    const order = findings.filter((f) => checked[f.id as keyof typeof checked]).map((f) => f.id)
    expect(lines.map((l) => l.f?.id ?? l.m?.id)).toEqual([...order, 'M1'])
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3, 4])
  })
  it('carry the numbers the clouds on their sheets carry', () => {
    for (const l of lines) {
      const s = l.sheetRef
      if (!s) continue
      const here = lines.filter((x) => x.sheetRef?.sheet_id === s.sheet_id)
      const clouds = mergeClouds(here.flatMap((x) => {
        const objs = x.f ? objectsOn(s, x.f.check) : s.objects.filter((o) => x.m!.objectIds.includes(o.object_id))
        const box = cloudBox(objs, 0.9)
        return box ? [{ box, n: x.n, id: x.f?.id ?? x.m!.id }] : []
      }))
      const labels = clouds.flatMap((c) => c.label.split('·').map(Number))
      if (cloudBox(l.f ? objectsOn(s, l.f.check) : s.objects.filter((o) => l.m!.objectIds.includes(o.object_id)), 0.9)) expect(labels).toContain(l.n)
    }
  })
})

describe('the reply to the developer', () => {
  const lines = changeLines(findings, checked, [mark], say)
  const reply = replyEmail({ to: 'Greenfield Development Co. (Sample)', project: 'Greenfield Residences', pkg: 'Greenfield Residences — Landscape Package', lines, total: formatMoney(16800, 'twd') })
  const body = reply.body.split('\n')
  it('has the developer, the subject with project and package, the attachment line last', () => {
    expect(reply.to).toBe('Greenfield Development Co. (Sample)')
    expect(reply.subject).toBe('Change request — Greenfield Residences — Greenfield Residences — Landscape Package')
    expect(body[0]).toBe('Dear Greenfield Development Co. (Sample),')
    expect(body[body.length - 1]).toBe('Attached: change-request.pdf')
  })
  it('lists only the selected changes, by their cloud numbers, each with its money formatted', () => {
    const numbered = body.filter((s) => /^\d+\. /.test(s))
    expect(numbered).toHaveLength(4)
    lines.forEach((l, i) => expect(numbered[i]).toBe(replyLine(l)))
    const e022 = lines.find((l) => l.f?.id === 'E02.2')!
    expect(e022.money).toBe('NT$16,800')
    expect(numbered[e022.n - 1]).toBe(`${e022.n}. [${e022.sheet}] what E02.2 — change E02.2 · NT$16,800`)
    expect(reply.body).not.toContain('E10')
    expect(numbered[3]).toBe('4. [L-1] Remove T-10 — Asked: This tree is outside the site.')
  })
  it('gives the money once when the change line already prints it', () => {
    expect(replyLine({ n: 2, sheet: 'L-1', what: 'Billed 12, drawn 8', change: 'Row 6: 12 → 8 Camphor · $516', money: '$516' })).toBe('2. [L-1] Billed 12, drawn 8 — Row 6: 12 → 8 Camphor · $516')
  })
  it('leaves To blank when no cover names a developer', () => {
    const r = replyEmail({ project: 'P', pkg: 'K', lines: [], total: 'NT$0' })
    expect(r.to).toBe('')
    expect(r.body.startsWith('Dear developer,')).toBe(true)
  })
  it('encodes the subject and body into the mailto link, and copies To, Subject, body', () => {
    const href = mailtoOf(reply)
    expect(href.startsWith('mailto:?subject=')).toBe(true)
    const q = new URLSearchParams(href.slice('mailto:?'.length))
    expect(q.get('subject')).toBe(reply.subject)
    expect(q.get('body')).toBe(reply.body)
    expect(emailText(reply).split('\n').slice(0, 2)).toEqual([`To: ${reply.to}`, `Subject: ${reply.subject}`])
  })
})

describe('the developer on the cover', () => {
  it('reads "DEVELOPER: …" or a DEVELOPER label, in title case', () => {
    expect(developerOf(['GREENFIELD RESIDENCES', 'DEVELOPER: GREENFIELD DEVELOPMENT CO. (SAMPLE)'])).toBe('Greenfield Development Co. (Sample)')
    expect(developerOf(['DEVELOPER', 'Acme Homes Ltd.'])).toBe('Acme Homes Ltd.')
    expect(developerOf(['LANDSCAPE CONSULTANT: SAMPLE LANDSCAPE STUDIO'])).toBeUndefined()
  })
})
