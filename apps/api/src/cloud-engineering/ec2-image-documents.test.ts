import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const Document = z
  .object({
    schemaVersion: z.literal("2.2"),
    parameters: z.record(z.string(), z.unknown()),
    mainSteps: z
      .array(
        z
          .object({
            action: z.literal("aws:runShellScript"),
            inputs: z
              .object({
                timeoutSeconds: z.literal("20"),
                runCommand: z.array(z.string()).length(1),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
const load = async (name: string) =>
  Document.parse(
    JSON.parse(
      await readFile(
        new URL(`../../../../deploy/engineering-worker/aws/${name}`, import.meta.url),
        "utf8",
      ),
    ) as unknown,
  );
describe("reviewed EC2 document authority", () => {
  it("cannot select executables, shell arguments or evidence paths", async () => {
    const doc = await load("evidence-document.json");
    expect(doc.parameters).toEqual({});
    expect(doc.mainSteps[0]!.inputs.runCommand).toEqual([
      "/usr/local/bin/node /opt/athena/ec2-helper.js evidence",
    ]);
    expect(JSON.stringify(doc)).not.toContain("seal-image");
  });
  it("never interpolates preview authorization into shell", async () => {
    const doc = await load("preview-grant-document.json");
    expect(Object.keys(doc.parameters)).toEqual(["grant"]);
    expect(doc.parameters.grant).toMatchObject({
      type: "String",
      interpolationType: "ENV_VAR",
    });
    expect(doc.mainSteps[0]!.inputs.runCommand).toEqual([
      "/usr/local/bin/node /opt/athena/ec2-helper.js preview-grant",
    ]);
    expect(JSON.stringify(doc.mainSteps)).not.toContain("{{");
  });
});
