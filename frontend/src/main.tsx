import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { startProbing } from './lib/source'

const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })
startProbing()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="Landsight" className="m-6">
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
