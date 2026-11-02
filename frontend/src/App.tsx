import { lazy, Suspense, useEffect } from 'react'
import { useRunDecisions } from './app/actions'
import { refs } from './app/refs'
import { isDirector, useNav, useUI } from './app/state'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Stage } from './components/Stage'
import { useResolvedSource, useRun, useRunSel } from './lib/api'
import { AskDock, askNow } from './screens/AskDock'
import { Open } from './screens/Open'
import { Prices } from './screens/Prices'
import { Projects } from './screens/Projects'
import { Review } from './screens/Review'
import { StatementScreen } from './screens/Statement'
import { Camera, Caption, StatusBar, TopBar } from './shell/Shell'

const Director = lazy(() => import('./director/Director'))

/** One app, five routes (/ projects, /open, /review, /statement, /prices), the Ask dock over all of them, and the
 * director layer playing the film on the same screens. */
export default function App() {
  const run = useRun()
  const route = useNav((s) => s.route)
  const director = isDirector()
  useRunDecisions(run.data)
  const src = useResolvedSource()

  // ?ask=<question>: the dock opens and asks it once the run is in
  const asked = run.data?.run_id
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('ask')
    if (asked && q && !director && run.data) void askNow(q, run.data, src === 'live')
    // once per run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked])

  // ⌘K / Ctrl-K opens the Ask dock from anywhere; Esc closes it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUI.setState((s) => ({ askOpen: !s.askOpen }))
      } else if (e.key === 'Escape' && useUI.getState().askOpen) useUI.setState({ askOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const needsRun = route === 'review' || route === 'statement'
  return (
    <Stage>
      <Camera>
        <TopBar run={run.data} />
        <ErrorBoundary label="This screen" className="m-6" resetKey={route}>
          {route === 'projects' && <Projects run={run.data} />}
          {route === 'open' && <Open run={run.data} />}
          {route === 'prices' && <Prices run={run.data} />}
          {needsRun && run.data && route === 'review' && <Review ref={(h) => { refs.review = h }} run={run.data} />}
          {needsRun && run.data && route === 'statement' && <StatementScreen run={run.data} />}
          {needsRun && !run.data && <NoRun error={run.error ? String((run.error as Error).message) : null} />}
        </ErrorBoundary>
        <StatusBar run={run.data} />
        <AskDock run={run.data} />
      </Camera>
      <Caption />
      {director && run.data && (
        <Suspense fallback={null}>
          <Director run={run.data} />
        </Suspense>
      )}
    </Stage>
  )
}

function NoRun({ error }: { error: string | null }) {
  const go = useNav((s) => s.go)
  const open = useRunSel((s) => s.open)
  return (
    <div className="flex h-[1004px] items-start bg-pane p-8">
      <div className="max-w-[640px]">
        <div className="text-[15px] font-semibold">{error ? 'This run could not be opened' : 'Reading the run…'}</div>
        {error && <p className="mt-2 text-ink-2">{error}</p>}
        {error && (
          <div className="mt-4 flex gap-2">
            <button className="btn primary" onClick={() => { open(undefined); go('review') }}>Open the current run</button>
            <button className="btn" onClick={() => go('projects')}>Projects</button>
          </div>
        )}
      </div>
    </div>
  )
}
