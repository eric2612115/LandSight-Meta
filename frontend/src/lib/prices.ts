/** The firm's own price list: GET /api/price-list and PUT /api/price-list/{code} on the live backend; on the recorded
 * mock, the same seed the backend writes into landsight.db (landsight/store/db.py PRICE_SEED), edited in memory. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { useResolvedSource } from './api'

export type PriceRow = {
  code: string
  name: string
  spec: string
  unit: string
  low: number
  high: number
  basis: string
  source: string
  updated_at: string
}

const SEEDED = '2026-11-02T00:00:00+00:00'
const row = (code: string, name: string, spec: string, unit: string, low: number, high: number, basis: string, source: string): PriceRow =>
  ({ code, name, spec, unit, low, high, basis, source, updated_at: SEEDED })

export const PRICE_SEED: PriceRow[] = [
  row('CC', 'Camphor (Cinnamomum camphora)', 'cal. 10 cm, H3.0-3.5 m, installed', 'EA', 6200, 7200, 'published_budget', 'P006 municipal budget 6,149 (2021); P002 municipal budget 7,036 (2022)'),
  row('DU', 'Duranta (Duranta erecta)', 'H0.6 m, installed', 'plant', 130, 160, 'published_budget', 'P024 shrub planted 146'),
  row('AZ', 'Azalea (Rhododendron spp.)', '4-5 in. pot, installed', 'plant', 140, 170, 'published_budget', 'P026 150; P027 140'),
  row('LA', 'Lawn (Zoysia matrella)', 'sod, installed', 'm²', 250, 300, 'published_budget', 'P030 sod installed 273'),
  row('PV-1', 'Permeable pavers', 'paver + bedding + base', 'm²', 1300, 2300, 'published_budget', 'P048-P051 1,210-1,410; P052 2,120-2,340'),
  row('PV-2', 'Exposed aggregate', '100 mm, washed-pebble finish', 'm²', 1800, 2200, 'sample', 'no direct source; nearest P060 washed-pebble permeable paver 2,020'),
  row('PV-3', 'Grass pavers', 'concrete grid, 80 mm', 'm²', 1150, 1350, 'published_budget', 'P063 1,150; P064 1,280; P065 1,320'),
  row('RL', 'Roof lawn (Zoysia on drainage layer)', 'sod on 0.3 m soil, filter fabric and drainage board, installed', 'm²', 650, 850, 'sample', 'sample: lawn P030 273 plus drainage board, filter fabric and lifting (no direct source)'),
  row('RI', 'Yeddo hawthorn (Rhaphiolepis indica)', 'planter shrub, 1 gal., 4 plants/m², installed', 'm²', 560, 700, 'sample', 'sample: 4 x shrub planted P024 146 (no direct source)'),
  row('IC', 'Chinese ixora (Ixora chinensis)', 'planter shrub, 1 gal., 4 plants/m², installed', 'm²', 560, 700, 'sample', 'sample: 4 x shrub planted P024 146 (no direct source)'),
  row('MP', 'Orange jasmine (Murraya paniculata)', 'planter shrub, 1 gal., 4 plants/m², installed', 'm²', 600, 760, 'sample', 'sample: 4 x shrub planted P024 146 plus 10% (no direct source)'),
]

/** The recorded mock's list, edited in memory (a reload starts from the seed again). */
export const useMockPrices = create<{ rows: PriceRow[]; edited: Record<string, string> }>(() => ({ rows: PRICE_SEED, edited: {} }))

export type PriceEdit = Partial<Omit<PriceRow, 'code' | 'updated_at'>> & { code: string }

/** low ≤ high, both numbers, a name for a new code: the same rules as the server's 422. */
export function validate(rows: PriceRow[], e: PriceEdit): string | null {
  const cur = rows.find((r) => r.code === e.code)
  const low = e.low ?? cur?.low
  const high = e.high ?? cur?.high
  if (!e.code.trim()) return 'a row needs a code'
  if (!cur && !e.name) return 'a new row needs a name'
  if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high)) return 'low and high must be numbers (TWD)'
  if (low < 0 || high < 0) return 'rates must not be negative'
  if (low > high) return `low ${low} is above high ${high}`
  return null
}

export function applyEdit(rows: PriceRow[], e: PriceEdit): PriceRow[] {
  const now = new Date().toISOString().replace(/\.\d+Z$/, '+00:00')
  const i = rows.findIndex((r) => r.code === e.code)
  if (i < 0) return [...rows, { spec: '', unit: '', basis: 'firm', source: '', low: 0, high: 0, name: '', ...e, updated_at: now } as PriceRow]
  return rows.map((r, j) => (j === i ? { ...r, ...e, updated_at: now } : r))
}

export function usePriceList() {
  const src = useResolvedSource()
  const mock = useMockPrices((s) => s.rows)
  const live = useQuery({
    queryKey: ['price-list'],
    enabled: src === 'live',
    queryFn: async () => {
      const r = await fetch('/api/price-list', { cache: 'no-store' })
      if (!r.ok) throw new Error(`GET /api/price-list → ${r.status}`)
      return (await r.json()) as PriceRow[]
    },
  })
  if (src === 'live') return { rows: live.data ?? [], loading: live.isLoading, error: live.error ? String(live.error) : null, live: true }
  return { rows: mock, loading: false, error: null, live: false }
}

export function useSavePrice() {
  const src = useResolvedSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: PriceEdit): Promise<PriceRow> => {
      const { code, ...fields } = e
      if (src === 'live') {
        const r = await fetch(`/api/price-list/${encodeURIComponent(code)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
        })
        if (!r.ok) {
          let why = `${r.status}`
          try {
            const j = await r.json()
            why = typeof j?.detail === 'string' ? j.detail : JSON.stringify(j?.detail ?? j)
          } catch {
            /* keep the status */
          }
          throw new Error(why)
        }
        return (await r.json()) as PriceRow
      }
      const rows = useMockPrices.getState().rows
      const bad = validate(rows, e)
      if (bad) throw new Error(bad)
      const next = applyEdit(rows, e)
      useMockPrices.setState((s) => ({ rows: next, edited: { ...s.edited, [code]: new Date().toISOString() } }))
      return next.find((r) => r.code === code)!
    },
    onSuccess: (row) => {
      if (src === 'live') {
        qc.setQueryData<PriceRow[]>(['price-list'], (prev) => (prev ? applyEdit(prev, row) : prev))
        useMockPrices.setState((s) => ({ edited: { ...s.edited, [row.code]: row.updated_at } }))
      }
    },
  })
}
