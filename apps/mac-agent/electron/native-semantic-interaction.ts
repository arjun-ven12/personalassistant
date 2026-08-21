import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  NativeSemanticInteractionTargetSchema,
  type NativeSemanticInteractionTarget,
} from "@alexa-control/shared";
import { z } from "zod";

export const NativeSemanticBridgeOperationSchema = z.enum([
  "focus_semantic_control",
  "insert_text",
  "replace_selection",
  "activate_semantic_control",
  "submit_composer",
]);

export const NativeSemanticBridgeRequestSchema = z
  .object({
    operation: NativeSemanticBridgeOperationSchema,
    bundleIdentifier: z.string().min(3).max(255),
    target: NativeSemanticInteractionTargetSchema,
    text: z.string().min(1).max(8_000).nullable().default(null),
  })
  .strict();

export const NativeSemanticBridgeResultSchema = z
  .object({
    status: z.enum([
      "SUCCESS",
      "PERMISSION_DENIED",
      "APP_NOT_RUNNING",
      "TARGET_NOT_FOUND",
      "TARGET_AMBIGUOUS",
      "TARGET_STALE",
      "SECURE_TARGET_BLOCKED",
      "UNSUPPORTED",
      "FAILED",
    ]),
    semanticId: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    matchedCount: z.number().int().nonnegative().max(10_000),
  })
  .strict();

export type NativeSemanticBridgeRequest = z.infer<
  typeof NativeSemanticBridgeRequestSchema
>;
export type NativeSemanticBridgeResult = z.infer<
  typeof NativeSemanticBridgeResultSchema
>;

export const semanticTargetForBridge = (input: {
  role: string;
  label?: string | null;
  identifier?: string | null;
  semanticId: string;
  type: NativeSemanticInteractionTarget["type"];
  source: NativeSemanticInteractionTarget["source"];
  confidence: number;
  capturedAt: string;
  expiresAt: string;
}) => NativeSemanticInteractionTargetSchema.parse(input);

export class NativeSemanticInteractionBridge {
  constructor(
    private readonly appBundle = path.join(
      __dirname,
      "../dist-native/AlexaInteraction.app",
    ),
  ) {}

  async execute(input: unknown): Promise<NativeSemanticBridgeResult> {
    const request = NativeSemanticBridgeRequestSchema.parse(input);
    if (process.platform !== "darwin")
      return NativeSemanticBridgeResultSchema.parse({
        status: "UNSUPPORTED",
        semanticId: null,
        matchedCount: 0,
      });
    const directory = await mkdtemp(path.join(tmpdir(), "alexa-interaction-"));
    const stdinPath = path.join(directory, "request.json");
    const stdoutPath = path.join(directory, "response.json");
    const stderrPath = path.join(directory, "error.log");
    await Promise.all([
      writeFile(stdinPath, JSON.stringify(request), { mode: 0o600 }),
      writeFile(stdoutPath, "", { mode: 0o600 }),
      writeFile(stderrPath, "", { mode: 0o600 }),
    ]);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "/usr/bin/open",
          [
            "-n",
            "-g",
            "-W",
            "--stdin",
            stdinPath,
            "--stdout",
            stdoutPath,
            "--stderr",
            stderrPath,
            this.appBundle,
          ],
          { stdio: "ignore" },
        );
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error("Reviewed semantic interaction bridge timed out."));
        }, 10_000);
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(`Reviewed semantic interaction bridge exited with ${code}.`));
        });
      });
      const output = await readFile(stdoutPath, "utf8");
      return NativeSemanticBridgeResultSchema.parse(JSON.parse(output.trim()));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
