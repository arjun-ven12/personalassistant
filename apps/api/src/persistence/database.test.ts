import { describe, expect, it } from "vitest";
import { PostgresDatabase } from "./database.js";

describe("database transport policy", () => {
  it.each([undefined, "require", "verify-full"] as const)("verifies remote TLS with mode %s", async (sslMode) => {
    const database = new PostgresDatabase("postgres://test:synthetic@db.example.test/test?sslmode=require&uselibpqcompat=true", sslMode ? { sslMode } : {});
    expect(database.pool.options.ssl).toEqual({ rejectUnauthorized: true });
    expect(database.pool.options.connectionString).not.toContain("sslmode");
    await database.close();
  });
  it("permits explicit loopback development plaintext but rejects remote downgrade", async () => {
    const local = new PostgresDatabase("postgres://localhost/test?sslmode=disable");
    expect(local.pool.options.ssl).toBe(false);
    await local.close();
    expect(() => new PostgresDatabase("postgres://db.example.test/test?sslmode=disable")).toThrow("DATABASE_TLS_CONFIGURATION_DENIED");
    expect(() => new PostgresDatabase("postgres://db.example.test/test?sslmode=no-verify")).toThrow("DATABASE_TLS_CONFIGURATION_DENIED");
    expect(() => new PostgresDatabase("postgres://db.example.test/test?ssl=false")).toThrow("DATABASE_TLS_URL_OVERRIDE_DENIED");
  });
});
