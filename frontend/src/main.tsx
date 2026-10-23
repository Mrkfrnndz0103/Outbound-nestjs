import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { supabaseConfigError } from "./lib/supabase";
import { ApiError } from "./lib/api";
import "./lib/sentry";
import "./styles/tailwind.css";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (failures, error) => failures < 1 && (!(error instanceof ApiError) || error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500),
      retryDelay: (_attempt, error) => error instanceof ApiError && error.retryAfterMs ? error.retryAfterMs : 1000,
    },
    mutations: { retry: 0 },
  },
});
const root = ReactDOM.createRoot(document.getElementById("root")!);

if (supabaseConfigError) {
  root.render(
    <main className="p-12 text-center">
      <h1>Configuration error</h1>
      <p className="error text-[var(--color-danger)]">{supabaseConfigError}</p>
      <p>Contact support to finish deployment configuration.</p>
    </main>,
  );
} else {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={client}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </QueryClientProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
