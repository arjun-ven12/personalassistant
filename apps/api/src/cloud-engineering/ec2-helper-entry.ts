import { writeFile, rename, unlink } from "node:fs/promises";
import { CloudPreviewGrantSchema } from "./preview-gate.js";
import { Ec2WorkloadScopeSchema } from "@alexa-control/shared";
import {
  expireEc2Worker,
  measureEc2Evidence,
  startEc2Watchdog,
  sealEc2Image,
  trustedFile,
} from "./ec2-image-runtime.js";

async function run() {
  if (process.platform !== "linux" || process.getuid?.() !== 0) throw Error();
  const op = process.argv[2];
  if (process.argv.length !== 3) throw Error();
  if (op === "seal-image") {
    process.stdout.write(await sealEc2Image());
    return;
  }
  if (op === "watchdog") return startEc2Watchdog();
  if (op === "expire") return expireEc2Worker();
  if (op === "evidence") {
    process.stdout.write(JSON.stringify(await measureEc2Evidence()));
    return;
  }
  if (op !== "preview-grant") throw Error();
  const encoded = process.env.SSM_grant;
  if (!encoded || encoded.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw Error();
  delete process.env.SSM_grant;
  const grant = CloudPreviewGrantSchema.parse(
    JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as unknown,
  );
  const scope = Ec2WorkloadScopeSchema.parse(
    JSON.parse(await trustedFile("/run/athena/scope.json")) as unknown,
  );
  if (
    grant.workspaceId !== scope.workspaceId ||
    grant.companyId !== scope.companyId ||
    grant.generation !== scope.generation ||
    Date.parse(grant.expiresAt) > Date.now() + 3_600_000
  )
    throw Error();
  if (Date.parse(grant.expiresAt) <= Date.now()) {
    await unlink("/run/athena/preview.json").catch((e: unknown) => {
      if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
    });
    process.stdout.write('{"state":"REVOKED"}');
    return;
  }
  await writeFile("/run/athena/preview.json.next", JSON.stringify(grant), {
    mode: 0o600,
    flag: "wx",
  });
  await rename("/run/athena/preview.json.next", "/run/athena/preview.json");
  process.stdout.write('{"state":"READY"}');
}
run().catch(() => {
  // Never print caught error/SSM input/bootstrap contents.
  process.stderr.write("Trusted EC2 runtime failed closed.\n");
  process.exitCode = 1;
  if (process.argv[2] === "watchdog") void expireEc2Worker().catch(() => undefined);
});
