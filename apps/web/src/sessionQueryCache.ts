import type { QueryClient } from "@tanstack/react-query";

import { ApiClientError } from "./api.js";

/** A server authentication denial must replace cached authenticated UI state. */
export const expireSessionQueryCache = (client: QueryClient, error: unknown) => {
  if (!(error instanceof ApiClientError) || error.status !== 401) return;
  if (!client.getQueryData<{ authenticated: boolean }>(["auth-session"])?.authenticated) return;
  client.setQueryData(["auth-session"], { authenticated: false });
  const scoped = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "auth-session" };
  void client.cancelQueries(scoped);
  client.removeQueries(scoped);
};
