import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { ApiClientError } from "./api.js";
import { expireSessionQueryCache } from "./sessionQueryCache.js";

describe("expired session cache", () => {
  it("removes stale owner data and returns to unauthenticated state on 401", () => {
    const client = new QueryClient();
    client.setQueryData(["auth-session"], { authenticated: true, user: { id: "owner" } });
    client.setQueryData(["objectives"], { status: "ACTIVE" });
    expireSessionQueryCache(client, new ApiClientError(401, "AUTH_REQUIRED", "Sign in."));
    expect(client.getQueryData(["auth-session"])).toEqual({ authenticated: false });
    expect(client.getQueryData(["objectives"])).toBeUndefined();
    client.clear();
  });

  it("does not sign out for permission denial or provider errors", () => {
    const client = new QueryClient();
    client.setQueryData(["auth-session"], { authenticated: true });
    expireSessionQueryCache(client, new ApiClientError(403, "DENIED", "Denied."));
    expireSessionQueryCache(client, new Error("Provider failed."));
    expect(client.getQueryData(["auth-session"])).toEqual({ authenticated: true });
    client.clear();
  });
});
