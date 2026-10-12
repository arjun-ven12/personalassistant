import { describe, expect, it } from "vitest";
import { Ec2SsmInstallationSchema } from "@alexa-control/shared";
import { verifySsmImage, type SsmImageProbe } from "./ec2-ssm-image.js";
const hash = "a".repeat(64);
const snap = {
  strategy: "snap",
  runtimeVersion: "3.3.4793.0",
  revision: "13349",
  artifactSha256: hash,
  refreshHeld: true,
};
const deb = {
  strategy: "deb",
  runtimeVersion: "3.3.5390.0",
  packageVersion: "3.3.5390.0-1",
  artifactSha256: hash,
};
function probe(changes: Partial<SsmImageProbe> = {}): SsmImageProbe {
  return {
    exists: () => Promise.resolve(false),
    realpath: () => Promise.resolve("/snap/amazon-ssm-agent/13349"),
    sha256: () => Promise.resolve(hash),
    command: (path, args) => {
      if (path === "/usr/bin/systemctl")
        return Promise.resolve(args[0] === "is-enabled" ? "enabled" : "active");
      if (path === "/usr/bin/snap")
        return Promise.resolve(
          "Name Version Rev Tracking Publisher Notes\namazon-ssm-agent 3.3.4793.0 13349 latest/stable aws classic,held",
        );
      if (path === "/usr/bin/dpkg-query") return Promise.resolve("3.3.5390.0-1");
      return Promise.resolve(
        `SSM Agent version: ${path.startsWith("/snap/") ? snap.runtimeVersion : deb.runtimeVersion}`,
      );
    },
    ...changes,
  };
}
describe("sealed SSM installation", () => {
  it("supports the retained exact Snap and DEB release/package distinction", async () => {
    await expect(verifySsmImage(snap, probe())).resolves.toEqual(snap);
    await expect(verifySsmImage(deb, probe())).resolves.toEqual(deb);
    expect(
      Ec2SsmInstallationSchema.safeParse({ ...deb, packageVersion: "3.3.5390.0" })
        .success,
    ).toBe(false);
    expect(
      Ec2SsmInstallationSchema.safeParse({ ...deb, packageVersion: "3.3.4793.0-1" })
        .success,
    ).toBe(false);
    expect(
      Ec2SsmInstallationSchema.safeParse({ ...snap, runtimeVersion: "3.3.2000.0" })
        .success,
    ).toBe(false);
  });
  it.each([
    { exists: () => Promise.resolve(true) },
    { realpath: () => Promise.resolve("/snap/amazon-ssm-agent/13350") },
    { sha256: () => Promise.resolve("b".repeat(64)) },
    { command: () => Promise.resolve("inactive") },
    {
      command: async (path: string, args: string[]) =>
        path === "/usr/bin/snap"
          ? "Name Version Rev Tracking Publisher Notes\namazon-ssm-agent 3.3.4793.0 13349 latest/stable aws classic"
          : probe().command(path, args),
    },
    {
      command: async (path: string, args: string[]) =>
        path.startsWith("/snap/")
          ? "SSM Agent version: 3.3.5390.0"
          : probe().command(path, args),
    },
  ])(
    "rejects dual installation, revision/hash drift, unhealthy or unheld agents",
    async (change) => {
      await expect(verifySsmImage(snap, probe(change))).rejects.toThrow();
    },
  );
  it("rejects Debian package drift independently of runtime release", async () => {
    await expect(
      verifySsmImage(
        deb,
        probe({
          command: async (path, args) =>
            path === "/usr/bin/dpkg-query"
              ? "3.3.5390.0-2"
              : probe().command(path, args),
        }),
      ),
    ).rejects.toThrow("Debian package");
  });
});
