import { afterEach, expect, it, vi } from "vitest";
import { createApiClient } from "./api.js";

afterEach(() => vi.unstubAllGlobals());
it("sends one JSON media type, CSRF and exact company scope for credential registration", async () => {
  const companyId = "c2ac447f-0747-4b78-80f1-2cc4fff8d82f";
  const at = "2026-10-04T05:00:00.000Z";
  const input = {
    id: "9ac5fa8c-7442-4c76-a6bd-d407c9ca7478",
    provider: "github",
    secretLocator: "github-primary",
    status: "READY",
    lastVerifiedAt: at,
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          expiresAt: at,
        }),
        { status: 200 },
      ),
    )
    .mockImplementationOnce((_url, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("x-company-id")).toBe(companyId);
      expect(headers.get("x-csrf-token")).toBe(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
      expect(init.credentials).toBe("include");
      if (typeof init.body !== "string") throw new Error("Expected JSON request body");
      expect(JSON.parse(init.body)).toEqual(input);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ...input,
            secretLocator: undefined,
            ownerId: "dcba5742-5dc2-4d79-8de5-3c32f9e74902",
            companyId,
            createdAt: at,
            updatedAt: at,
          }),
          { status: 200 },
        ),
      );
    });
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    createApiClient("https://api.example").upsertCompanyCredentialReference(
      companyId,
      input,
    ),
  ).resolves.toMatchObject({ id: input.id, companyId });
});
