import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { BoundedOperationalLog } from "./operational-log.js";

let directory = "";
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("bounded operational log", () => {
  it("stores only schema-bounded operational fields", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "mac-agent-log-"));
    const pathname = path.join(directory, "agent.jsonl");
    const log = new BoundedOperationalLog(pathname);
    await log.record({
      category: "connection",
      event: "CONNECTION_ONLINE",
      detail: "Canonical API reachable.",
    });
    expect(await log.recent()).toHaveLength(1);
    expect(await readFile(pathname, "utf8")).not.toContain("token");
    await log.record({ category: "update", event: "UPDATE_CHECK_STARTED" });
    expect(await log.recent()).toHaveLength(2);
    await expect(
      log.record({ category: "auth", event: "bad event", detail: "x" }),
    ).rejects.toThrow();
  });
});
