import { parseApiEnvironment } from "@alexa-control/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const environment = parseApiEnvironment(process.env);
const keyPath = path.resolve(
  environment.SERVER_EXECUTION_SIGNING_KEY_PATH ?? ".local/server-execution-key.json",
);
const stored = z
  .object({
    publicKey: z.object({ x: z.string().min(32) }).passthrough(),
  })
  .passthrough()
  .parse(JSON.parse(await readFile(keyPath, "utf8")));
process.stdout.write(`${stored.publicKey.x}\n`);
