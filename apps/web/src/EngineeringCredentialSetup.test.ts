import { describe, expect, it } from "vitest";
import { engineeringSetupRecordId } from "./EngineeringCredentialSetup.js";

describe("Engineering company setup claims", () => {
  it("reuses the same claim across retries and separates credential/binding records", async () => {
    const company = crypto.randomUUID();
    const a = await engineeringSetupRecordId(company, "github", "credential");
    expect(await engineeringSetupRecordId(company, "github", "credential")).toBe(a);
    expect(await engineeringSetupRecordId(company, "github", "binding")).not.toBe(a);
  });
  it("separates companies and providers", async () => {
    const company = crypto.randomUUID();
    const a = await engineeringSetupRecordId(company, "github", "credential");
    expect(
      await engineeringSetupRecordId(crypto.randomUUID(), "github", "credential"),
    ).not.toBe(a);
    expect(await engineeringSetupRecordId(company, "railway", "credential")).not.toBe(
      a,
    );
  });
  it("rejects unregistered providers and invalid company identity", async () => {
    await expect(
      engineeringSetupRecordId("unknown", "github", "credential"),
    ).rejects.toThrow();
    await expect(
      engineeringSetupRecordId(
        crypto.randomUUID(),
        "unknown" as "github",
        "credential",
      ),
    ).rejects.toThrow();
  });
});
