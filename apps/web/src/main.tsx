import { parseWebEnvironment } from "@alexa-control/config";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { createApiClient } from "./api.js";
import { expireSessionQueryCache } from "./sessionQueryCache.js";
import "./styles.css";

declare global {
  interface Window {
    __ALEXA_RUNTIME_CONFIG__?: { apiBaseUrl?: string };
  }
}

const runtimeApiBaseUrl = window.__ALEXA_RUNTIME_CONFIG__?.apiBaseUrl;
const environment = parseWebEnvironment({
  ...import.meta.env,
  ...(runtimeApiBaseUrl ? { VITE_API_BASE_URL: runtimeApiBaseUrl } : {}),
});
const apiClient = createApiClient(environment.VITE_API_BASE_URL);
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error) => expireSessionQueryCache(queryClient, error) }),
  mutationCache: new MutationCache({ onError: (error) => expireSessionQueryCache(queryClient, error) }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
    },
  },
});

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) {
  throw new Error("Application root is missing");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App apiClient={apiClient} />
    </QueryClientProvider>
  </StrictMode>,
);
