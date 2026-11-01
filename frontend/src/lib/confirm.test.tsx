import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { SparkCrop } from '../components/SparkSaw'
import { applyConfirm, normalise, normaliseItem } from './api'
import { askedObject } from './model'
import type { Item, Run } from './types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The backend's real responses for the sample package (scripts/frontend_mock.py writes them from the API). */
const mock = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'frontend-mock', name), 'utf8'))

let host: HTMLDivElement | null = null
afterEach(() => {
  host?.remove()
  host = null
})

function render(el: ReturnType<typeof createElement>) {
  host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(el))
  return { root, host }
}

describe('confirm on the live backend', () => {
  it('normalises the POST /api/items/{id}/confirm Item like GET /api/run', () => {
    const raw = mock('confirm_I-01.json') as Item
    expect(Array.isArray(raw.spark!.points![0])).toBe(false) // the API sends { m, norm, px } objects
    const it = normaliseItem(raw, 'live')
    expect(it.spark!.points!.every((p) => Array.isArray(p) && p.length === 2)).toBe(true)
    expect(it.spark!.points_crop!.length).toBe(raw.spark!.points!.length)
    expect(it.spark!.points_crop!.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true)
  })

  it('merges the confirmed Item into the Run and SparkCrop renders it without throwing', () => {
    const run: Run = normalise(mock('run.json'), 'live')
    const raw = mock('confirm_I-01.json') as Item
    const next = applyConfirm(run, normaliseItem(raw, 'live'))
    const it = next.items.find((i) => i.item_id === 'I-01')!
    expect(it.confirmed).toBe(true)
    expect(next.tally[0].status).toBe('confirmed')
    const { obj } = askedObject(next, it)
    const { host } = render(createElement(SparkCrop, { spark: it.spark!, obj, showPoints: true }))
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/api/crops/I-01.png')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('a raw (unnormalised) Item still renders: the crop ignores points it cannot read', () => {
    const raw = mock('confirm_I-01.json') as Item
    const bad = { ...raw.spark!, points_crop: undefined, points: [{ m: 'x' }, 5] as unknown as [number, number][] }
    const { host } = render(createElement('div', null, createElement('p', null, 'still here'), createElement(SparkCrop, { spark: bad, showPoints: true })))
    expect(host.textContent).toContain('still here')
    expect(host.querySelector('img')).not.toBeNull()
  })

  it('a render error inside the boundary is a small inline note; the siblings stay', () => {
    const Boom = () => {
      throw new TypeError('object is not iterable')
    }
    const quiet = console.error
    console.error = () => {}
    try {
      const { host } = render(createElement('div', null, createElement('p', null, 'the rest'),
        createElement(ErrorBoundary, { label: "Muse Spark's crop" }, createElement(Boom))))
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("Muse Spark's crop could not be shown")
      expect(host.textContent).toContain('the rest')
    } finally {
      console.error = quiet
    }
  })
})
