import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { startProbing } from './lib/source'
import { startTheme } from './lib/theme'

// /try, the quick review (demo/TRY-UI.md): its own front door on the same API and components
const TryApp = lazy(() => import('./try/TryApp'))
const isTry = window.location.pathname.startsWith('/try')

const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })
startTheme()
startProbing()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="Landsight" className="m-6">
      <QueryClientProvider client={client}>
        {isTry ? <Suspense fallback={null}><TryApp /></Suspense> : <App />}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
