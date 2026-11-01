import { lazy, Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Stage } from './components/Stage'
import { PlainApp } from './plain/PlainApp'

const Director = lazy(() => import('./director/Director'))

export default function App() {
  const director = new URLSearchParams(window.location.search).get('director') === '1'
  return (
    <Stage>
      <ErrorBoundary label={director ? 'Director mode' : 'The product'} className="m-6">
        {director ? (
          <Suspense fallback={null}>
            <Director />
          </Suspense>
        ) : (
          <PlainApp />
        )}
      </ErrorBoundary>
    </Stage>
  )
}
