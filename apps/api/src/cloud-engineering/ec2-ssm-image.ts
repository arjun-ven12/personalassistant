import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  Ec2SsmInstallationSchema,
  type Ec2SsmInstallation,
} from "@alexa-control/shared";

const execute = promisify(execFile);
export interface SsmImageProbe {
  command(path: string, args: string[]): Promise<string>;
  exists(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  sha256(path: string): Promise<string>;
}
const liveProbe: SsmImageProbe = {
  async command(path, args) {
    const result = await execute(path, args, {
      shell: false,
      timeout: 10_000,
      maxBuffer: 16_384,
      env: { PATH: "/usr/bin:/bin", HOME: "/var/empty", LANG: "C" },
    });
    return result.stdout.trim();
  },
  async exists(path) {
    try {
      await lstat(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  },
  realpath,
  async sha256(path) {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== 0 ||
      stat.mode & 0o022 ||
      stat.size > 128 * 1024 * 1024
    )
      throw Error("Untrusted SSM artifact");
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(path)) hash.update(bytes as Buffer);
    return hash.digest("hex");
  },
};
/** Fixed, read-only paths/commands selected from an image-sealed strategy only. */
export async function verifySsmImage(raw: unknown, probe: SsmImageProbe = liveProbe) {
  const installation = Ec2SsmInstallationSchema.parse(raw);
  const snap = installation.strategy === "snap";
  const unit = snap
    ? "snap.amazon-ssm-agent.amazon-ssm-agent.service"
    : "amazon-ssm-agent.service";
  const binary = snap
    ? "/snap/amazon-ssm-agent/current/amazon-ssm-agent"
    : "/usr/bin/amazon-ssm-agent";
  if (
    await probe.exists(
      snap ? "/usr/bin/amazon-ssm-agent" : "/snap/amazon-ssm-agent/current",
    )
  )
    throw Error("Multiple SSM installations are prohibited");
  if (
    (await probe.command("/usr/bin/systemctl", ["is-enabled", unit])) !== "enabled" ||
    (await probe.command("/usr/bin/systemctl", ["is-active", unit])) !== "active"
  )
    throw Error("SSM installation is not enabled and healthy");
  if (
    (await probe.command(binary, ["-version"])) !==
    `SSM Agent version: ${installation.runtimeVersion}`
  )
    throw Error("SSM runtime release differs from the sealed pin");
  if (snap) {
    await verifySnap(installation, probe);
  } else if (
    (await probe.command("/usr/bin/dpkg-query", [
      "-W",
      "-f=${Version}",
      "amazon-ssm-agent",
    ])) !== installation.packageVersion
  ) {
    throw Error("SSM Debian package differs from the sealed pin");
  }
  return installation;
}
async function verifySnap(
  installation: Extract<Ec2SsmInstallation, { strategy: "snap" }>,
  probe: SsmImageProbe,
) {
  if (
    (await probe.realpath("/snap/amazon-ssm-agent/current")) !==
    `/snap/amazon-ssm-agent/${installation.revision}`
  )
    throw Error("SSM Snap revision differs from the sealed pin");
  if (
    (await probe.sha256(
      `/var/lib/snapd/snaps/amazon-ssm-agent_${installation.revision}.snap`,
    )) !== installation.artifactSha256
  )
    throw Error("SSM Snap archive differs from the sealed pin");
  const lines = (
    await probe.command("/usr/bin/snap", [
      "list",
      "--unicode=never",
      "amazon-ssm-agent",
    ])
  ).split("\n");
  const row = lines[1]?.trim().split(/\s+/);
  if (
    lines.length !== 2 ||
    row?.[0] !== "amazon-ssm-agent" ||
    row[1] !== installation.runtimeVersion ||
    row[2] !== installation.revision ||
    !row.at(-1)?.split(",").includes("held")
  )
    throw Error("SSM Snap refresh is not held at the exact reviewed revision");
}
