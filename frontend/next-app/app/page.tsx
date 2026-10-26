'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import App from '../../src/App'
import { ErrorBoundary } from '../../src/components/ErrorBoundary'
import { ApiError } from '../../src/lib/api'
import { supabaseConfigError } from '../../src/lib/supabase'
import '../../src/styles/tailwind.css'

export default function Page() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: (failures, error) => failures < 1 && (!(error instanceof ApiError) || error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500),
        retryDelay: (_attempt, error) => error instanceof ApiError && error.retryAfterMs ? error.retryAfterMs : 1000,
      },
      mutations: { retry: 0 },
    },
  }))

  if (supabaseConfigError) {
    return <main className="p-12 text-center"><h1>Configuration error</h1><p className="error text-[var(--color-danger)]">{supabaseConfigError}</p><p>Contact support to finish deployment configuration.</p></main>
  }

  return (
    <BrowserRouter>
      <QueryClientProvider client={client}>
        <ErrorBoundary><App /></ErrorBoundary>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
