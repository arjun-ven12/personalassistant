/** Unprivileged local input validation; no AWS calls or privileged execution. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ImageBuilderToolLockSchema } from "../cloud-engineering/image-builder-contract.js";

async function main() {
  const [lockFile, toolingFile, payloadFile, ...extra] = process.argv.slice(2);
  if (!lockFile || !toolingFile || !payloadFile || extra.length)
    throw new Error("Usage: image-builder-inputs.ts lock.json tools.tar payload.tar");
  const lockBytes = await readFile(lockFile);
  const lock = ImageBuilderToolLockSchema.parse(
    JSON.parse(lockBytes.toString()) as unknown,
  );
  const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  console.log(
    JSON.stringify(
      {
        BaseAmiId: lock.baseAmiId,
        LockSha256: sha(lockBytes),
        ToolingSha256: sha(await readFile(toolingFile)),
        PayloadSha256: sha(await readFile(payloadFile)),
        status: "INPUT_PINS_VALIDATED_NOT_RELEASED",
      },
      null,
      2,
    ),
  );
}
main().catch(() => {
  console.error(
    "Reviewed input validation failed; inspect non-secret lock and artifact files.",
  );
  process.exitCode = 1;
});
