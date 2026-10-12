import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  lstat,
  readFile,
  writeFile,
  rename,
  mkdir,
  statfs,
  realpath,
  stat,
  readdir,
  chmod,
} from "node:fs/promises";
import { availableParallelism, totalmem } from "node:os";
import { z } from "zod";
import {
  Ec2LifetimeSchema,
  Ec2RuntimeEvidenceSchema,
  Ec2WorkloadScopeSchema,
} from "@alexa-control/shared";

import { verifySsmImage } from "./ec2-ssm-image.js";

const exec = promisify(execFile);
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const hex = z.string().regex(/^[a-f0-9]{64}$/);
// Paths and command names are image-owned constants, never API/model arguments.
export const EC2_IMAGE_FILES = [
  "/opt/athena/worker.js",
  "/opt/athena/ec2-helper.js",
  "/opt/athena/registry-proxy.js",
  "/etc/athena/task-firewall.rules",
  "/etc/docker/daemon.json",
  "/etc/systemd/system/athena-worker.service",
  "/etc/systemd/system/athena-watchdog.service",
  "/etc/systemd/system/athena-expire.service",
  "/etc/systemd/system/athena-deadline.timer",
  "/etc/systemd/system/athena-network.service",
  "/opt/athena/configure-network",
  "/etc/sysctl.d/90-athena.conf",
  "/etc/cloud/cloud.cfg.d/99-athena-private.cfg",
  "/etc/athena/provider",
  "/etc/athena/ssm-installation.json",
] as const;
export const Ec2ImageManifestSchema = z
  .object({
    schemaVersion: z.literal("1"),
    files: z.object(Object.fromEntries(EC2_IMAGE_FILES.map((p) => [p, hex]))).strict(),
    images: z
      .object({
        "alexa-engineering-node:1": hex,
        "alexa-engineering-python:1": hex.optional(),
        "alexa-engineering-gradle:1": hex.optional(),
        "athena-registry-proxy:1": hex,
      })
      .strict(),
  })
  .strict();
export const Ec2WatchdogStateSchema = z
  .object({
    scope: Ec2WorkloadScopeSchema,
    lifetime: Ec2LifetimeSchema,
    monotonicDeadline: z.number().positive(),
    lastWorkMonotonic: z.number().nonnegative(),
    updatedAt: z.iso.datetime(),
    pid: z.number().int().positive(),
  })
  .strict();
export type Ec2WatchdogState = z.infer<typeof Ec2WatchdogStateSchema>;

export async function trustedFile(file: string, maxBytes = 16_384) {
  const stat = await lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== 0 ||
    (stat.mode & 0o022) !== 0 ||
    stat.size > maxBytes
  )
    throw Error("Untrusted runtime file.");
  return readFile(file, "utf8");
}
async function atomic(file: string, value: unknown) {
  // Parent is a root-only runtime directory; no repository paths are accepted.
  const tmp = `${file}.next`;
  await writeFile(tmp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  await rename(tmp, file);
}
async function fixed(executable: string, args: string[]) {
  const result = await exec(executable, args, {
    env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty" },
    timeout: 5000,
    maxBuffer: 262_144,
    encoding: "utf8",
    shell: false,
  });
  if (result.stderr.trim()) throw Error("Runtime measurement failed.");
  return result.stdout.trim();
}
async function monotonic() {
  return z.coerce
    .number()
    .nonnegative()
    .parse((await readFile("/proc/uptime", "utf8")).split(" ")[0]);
}
export function watchdogDecision(
  state: Ec2WatchdogState,
  uptime: number,
  active: boolean,
  now: number,
) {
  if (uptime >= state.monotonicDeadline || now >= Date.parse(state.lifetime.expiresAt))
    return "EXPIRE";
  // Reserve 60s for bounded inspection/termination; never extend the 300s ceiling.
  if (
    !active &&
    uptime - state.lastWorkMonotonic >= Math.max(0, state.lifetime.idleSeconds - 60)
  )
    return "EXPIRE";
  return "CONTINUE";
}
export function deadlineTimer(secondsSinceBoot: number) {
  if (!Number.isFinite(secondsSinceBoot) || secondsSinceBoot <= 0)
    throw Error("Invalid deadline.");
  return `[Timer]\nOnBootSec=\nOnBootSec=${Math.floor(secondsSinceBoot)}s\nAccuracySec=1s\nRandomizedDelaySec=0\n`;
}
export async function verifyImage() {
  const manifest = Ec2ImageManifestSchema.parse(
    JSON.parse(await trustedFile("/etc/athena/image-manifest.json")) as unknown,
  );
  for (const p of EC2_IMAGE_FILES) {
    const contents = await trustedFile(p, 32 * 1024 * 1024);
    if (sha(contents) !== manifest.files[p]) throw Error("Runtime artifact changed.");
  }
  for (const [tag, digest] of Object.entries(manifest.images)) {
    if (!digest) continue;
    if (
      (await fixed("/usr/bin/docker", [
        "image",
        "inspect",
        "--format",
        "{{.Id}}",
        tag,
      ])) !== `sha256:${digest}`
    )
      throw Error("Task image changed.");
  }
  await verifySsmImage(
    JSON.parse(await trustedFile("/etc/athena/ssm-installation.json")) as unknown,
  );
  return sha(JSON.stringify(manifest));
}
/** Build-principal operation only. No SSM document or workload API exposes sealing. */
export async function sealEc2Image() {
  if (process.platform !== "linux" || process.getuid?.() !== 0)
    throw Error("Image builder required.");
  const files: Record<string, string> = {};
  for (const file of EC2_IMAGE_FILES)
    files[file] = sha(await trustedFile(file, 32 * 1024 * 1024));
  const images: Record<string, string> = {};
  for (const tag of ["alexa-engineering-node:1", "athena-registry-proxy:1"]) {
    const id = await fixed("/usr/bin/docker", [
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      tag,
    ]);
    if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw Error("Reviewed image unavailable.");
    images[tag] = id.slice(7);
  }
  const manifest = Ec2ImageManifestSchema.parse({ schemaVersion: "1", files, images });
  await writeFile("/etc/athena/image-manifest.json", JSON.stringify(manifest), {
    mode: 0o600,
    flag: "wx",
  });
  return verifyImage();
}
const Network = z
  .array(
    z
      .object({
        Name: z.string(),
        Internal: z.boolean(),
        EnableIPv6: z.literal(false),
        IPAM: z.object({
          Config: z.array(
            z
              .object({ Subnet: z.string(), Gateway: z.string().optional() })
              .passthrough(),
          ),
        }),
      })
      .passthrough(),
  )
  .length(1);
const Container = z
  .object({
    Id: z.string().regex(/^[a-f0-9]{64}$/),
    Image: z.string(),
    State: z
      .object({ Running: z.literal(true), Pid: z.number().int().positive() })
      .passthrough(),
    Config: z
      .object({
        User: z.literal("65532:65532"),
        Labels: z.record(z.string(), z.string()).nullable(),
      })
      .passthrough(),
    HostConfig: z
      .object({
        Privileged: z.literal(false),
        ReadonlyRootfs: z.literal(true),
        PidsLimit: z.number().int().min(1).max(256),
        Memory: z
          .number()
          .positive()
          .max(2 * 1024 ** 3),
        NanoCpus: z.number().positive().max(2e9),
        CapDrop: z.array(z.string()),
        CapAdd: z.array(z.string()).nullable(),
        SecurityOpt: z
          .array(z.enum(["no-new-privileges", "no-new-privileges:true"]))
          .length(1),
        PidMode: z.literal(""),
        IpcMode: z.literal("private"),
        ShmSize: z
          .number()
          .int()
          .positive()
          .max(64 * 1024 * 1024),
        NetworkMode: z.string(),
        Tmpfs: z.record(z.string(), z.string()).nullable(),
      })
      .passthrough(),
    Mounts: z.array(
      z
        .object({ Type: z.string(), Source: z.string(), Destination: z.string() })
        .passthrough(),
    ),
    NetworkSettings: z
      .object({
        Networks: z.record(
          z.string(),
          z.object({ IPAddress: z.string() }).passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();
export function validateTaskContainer(
  raw: unknown,
  repositoryId: string,
  images: string[],
) {
  const c = Container.parse(raw);
  const role = c.Config.Labels?.["athena.role"];
  if (
    !["task", "dependency", "proxy", "relay", "preview"].includes(role ?? "") ||
    !images.includes(c.Image) ||
    !c.HostConfig.CapDrop.includes("ALL") ||
    c.HostConfig.CapAdd?.length ||
    !c.HostConfig.SecurityOpt.some(
      (s) => s === "no-new-privileges" || s === "no-new-privileges:true",
    )
  )
    throw Error("Container isolation denied.");
  const networks = Object.keys(c.NetworkSettings.Networks);
  const expected =
    role === "task"
      ? ["none"]
      : role === "dependency"
        ? ["athena-dependencies"]
        : role === "preview"
          ? ["alexa-engineering-preview"]
          : role === "proxy"
            ? ["athena-dependencies", "athena-egress"]
            : ["alexa-engineering-preview", "athena-relay"];
  if (JSON.stringify(networks.sort()) !== JSON.stringify(expected.sort()))
    throw Error("Container network denied.");
  if (
    role === "proxy" &&
    (c.NetworkSettings.Networks["athena-dependencies"]?.IPAddress !== "172.30.0.2" ||
      c.NetworkSettings.Networks["athena-egress"]?.IPAddress !== "172.29.0.2")
  )
    throw Error("Proxy network binding denied.");
  if (role === "proxy" || role === "relay") {
    if (c.Mounts.length) throw Error("Infrastructure container mounts denied.");
  } else {
    if (
      c.Mounts.length !== 1 ||
      c.Mounts[0]?.Type !== "bind" ||
      c.Mounts[0]?.Destination !== "/workspace" ||
      !/^[a-f0-9-]{36}$/.test(repositoryId) ||
      !/^\/workspace\/worktrees\/ew-[a-f0-9-]{36}(?:\/[A-Za-z0-9._-]+)*$/.test(
        c.Mounts[0]?.Source ?? "",
      ) ||
      c.Mounts[0]?.Source.split("/").some((p) => p === "." || p === "..")
    )
      throw Error("Task mount denied.");
  }
  if (
    role !== "proxy" &&
    role !== "relay" &&
    (!c.HostConfig.Tmpfs ||
      Object.keys(c.HostConfig.Tmpfs).length !== 1 ||
      !/size=64m(?:,|$)/.test(c.HostConfig.Tmpfs["/tmp"] ?? "") ||
      !c.HostConfig.Tmpfs["/tmp"]?.split(",").includes("nosuid") ||
      !c.HostConfig.Tmpfs["/tmp"]?.split(",").includes("nodev"))
  )
    throw Error("Writable tmpfs denied.");
  return role === "task" || role === "dependency";
}
async function containers(scope: z.infer<typeof Ec2WorkloadScopeSchema>) {
  const manifest = Ec2ImageManifestSchema.parse(
    JSON.parse(await trustedFile("/etc/athena/image-manifest.json")) as unknown,
  );
  const ids = (await fixed("/usr/bin/docker", ["ps", "-q", "--no-trunc"]))
    .split("\n")
    .filter(Boolean);
  if (ids.length > 8 || ids.some((id) => !/^[a-f0-9]{64}$/.test(id)))
    throw Error("Container quota denied.");
  let active = false;
  let proxy = false;
  for (const id of ids) {
    try {
      const raw = z
        .array(z.unknown())
        .length(1)
        .parse(
          JSON.parse(await fixed("/usr/bin/docker", ["inspect", id])) as unknown,
        )[0];
      active =
        validateTaskContainer(
          raw,
          scope.repositoryId,
          Object.values(manifest.images)
            .filter(Boolean)
            .map((h) => `sha256:${h}`),
        ) || active;
      const measured = Container.parse(raw);
      const mounts = (await readFile(`/proc/${measured.State.Pid}/mountinfo`, "utf8"))
        .trim()
        .split("\n");
      const rootMount = mounts.find((line) => line.split(" ")[4] === "/");
      if (!rootMount?.split(" ")[5]?.split(",").includes("ro"))
        throw Error("Kernel task root filesystem is writable.");
      if (
        measured.Config.Labels?.["athena.role"] !== "proxy" &&
        measured.Config.Labels?.["athena.role"] !== "relay"
      ) {
        const scratch = await statfs(`/proc/${measured.State.Pid}/root/tmp`);
        if (
          scratch.type !== 0x01021994 ||
          scratch.blocks * scratch.bsize > 64 * 1024 * 1024
        )
          throw Error("Kernel scratch storage quota unavailable.");
      }
      const proc = await readFile(`/proc/${measured.State.Pid}/status`, "utf8");
      if (
        !/\nUid:\s+65532\s+65532\s+65532\s+65532\s/.test(proc) ||
        !/\nNoNewPrivs:\s+1\s/.test(proc) ||
        !/\nSeccomp:\s+2\s/.test(proc) ||
        !/\nCapEff:\s+0+\s/.test(proc)
      )
        throw Error("Kernel task privilege boundary unavailable.");
      const group = (
        await readFile(`/proc/${measured.State.Pid}/cgroup`, "utf8")
      ).trim();
      if (group !== `0::/system.slice/docker-${measured.Id}.scope`)
        throw Error("Reviewed cgroup v2 task boundary unavailable.");
      const prefix = `/sys/fs/cgroup${group.slice(3)}`;
      const [pids, memory, cpu] = await Promise.all(
        ["pids.max", "memory.max", "cpu.max"].map((f) =>
          readFile(`${prefix}/${f}`, "utf8"),
        ),
      );
      if (
        !/^\d+\s*$/.test(pids!) ||
        Number(pids) < 1 ||
        Number(pids) > 256 ||
        !/^\d+\s*$/.test(memory!) ||
        Number(memory) <= 0 ||
        Number(memory) > 2 * 1024 ** 3 ||
        !/^\d+ \d+\s*$/.test(cpu!)
      )
        throw Error("Kernel cgroup limits unavailable.");
      const [quota, period] = cpu!.trim().split(" ").map(Number);
      if (
        !quota ||
        !period ||
        !Number.isSafeInteger(quota) ||
        !Number.isSafeInteger(period) ||
        quota / period > 2
      )
        throw Error("Kernel CPU bound unavailable.");
      for (const mount of Container.parse(raw).Mounts)
        if ((await realpath(mount.Source)) !== mount.Source)
          throw Error("Task mount alias denied.");
      if (Container.parse(raw).Config.Labels?.["athena.role"] === "proxy") proxy = true;
    } catch (e) {
      // A --rm task can finish during inspection. Confirm its absence; uncertainty denies.
      const remaining = await fixed("/usr/bin/docker", [
        "ps",
        "-q",
        "--no-trunc",
        "--filter",
        `id=${id}`,
      ]);
      if (remaining) throw e;
    }
  }
  if (!proxy) throw Error("Dependency proxy unavailable.");
  return active;
}
export async function measureEc2Evidence() {
  const scope = Ec2WorkloadScopeSchema.parse(
    JSON.parse(await trustedFile("/run/athena/scope.json")) as unknown,
  );
  const state = Ec2WatchdogStateSchema.parse(
    JSON.parse(await trustedFile("/run/athena/watchdog.json")) as unknown,
  );
  const lifetime = Ec2LifetimeSchema.parse(
    JSON.parse(await trustedFile("/run/athena/lifetime.json")) as unknown,
  );
  const now = Date.now(),
    up = await monotonic();
  if (
    JSON.stringify(scope) !== JSON.stringify(state.scope) ||
    JSON.stringify(lifetime) !== JSON.stringify(state.lifetime) ||
    now - Date.parse(state.updatedAt) > 15_000 ||
    Date.parse(state.updatedAt) > now + 1000 ||
    state.monotonicDeadline <= up ||
    Date.parse(lifetime.expiresAt) <= now ||
    Date.parse(lifetime.expiresAt) > now + 3_500_000
  )
    throw Error("Watchdog evidence stale.");
  const uid = /\nUid:\s+(\d+)\s/.exec(
    await readFile(`/proc/${state.pid}/status`, "utf8"),
  )?.[1];
  const cmd = (await readFile(`/proc/${state.pid}/cmdline`, "utf8"))
    .replaceAll("\0", " ")
    .trim();
  if (uid !== "0" || cmd !== "/usr/local/bin/node /opt/athena/ec2-helper.js watchdog")
    throw Error("Watchdog identity denied.");
  for (const unit of [
    "athena-watchdog.service",
    "athena-deadline.timer",
    "athena-network.service",
  ])
    if (
      (await fixed("/usr/bin/systemctl", [
        "show",
        unit,
        "--property=ActiveState",
        "--value",
      ])) !== "active" ||
      (await fixed("/usr/bin/systemctl", [
        "show",
        unit,
        "--property=NeedDaemonReload",
        "--value",
      ])) !== "no"
    )
      throw Error("Required supervisor unit unavailable.");
  if (
    (await trustedFile("/run/systemd/system/athena-deadline.timer.d/deadline.conf")) !==
    deadlineTimer(state.monotonicDeadline)
  )
    throw Error("Deadline timer changed.");
  const timer = await fixed("/usr/bin/busctl", [
    "get-property",
    "org.freedesktop.systemd1",
    "/org/freedesktop/systemd1/unit/athena_2ddeadline_2etimer",
    "org.freedesktop.systemd1.Timer",
    "NextElapseUSecMonotonic",
  ]);
  if (
    !/^t \d+$/.test(timer) ||
    Math.abs(Number(timer.slice(2)) / 1e6 - Math.floor(state.monotonicDeadline)) > 2
  )
    throw Error("Effective kernel timer denied.");
  if (
    (await readFile("/proc/sys/net/ipv6/conf/all/disable_ipv6", "utf8")).trim() !== "1"
  )
    throw Error("IPv6 containment unavailable.");
  const runtimeDigest = await verifyImage();
  if (runtimeDigest !== lifetime.runtimeDigest) throw Error("Runtime digest denied.");
  for (const [name, subnet, internal] of [
    ["athena-dependencies", "172.30.0.0/24", true],
    ["alexa-engineering-preview", "172.31.0.0/24", true],
    ["athena-relay", "172.28.0.0/24", true],
    ["athena-egress", "172.29.0.0/24", false],
  ] as const) {
    const n = Network.parse(
      JSON.parse(
        await fixed("/usr/bin/docker", ["network", "inspect", name]),
      ) as unknown,
    )[0]!;
    if (
      n.Internal !== internal ||
      n.Name !== name ||
      n.IPAM.Config.length !== 1 ||
      n.IPAM.Config[0]?.Subnet !== subnet
    )
      throw Error("Internal network unavailable.");
  }
  // Exact reviewed rules are inspected in the live kernel, not asserted by the worker.
  const expectedRules = (await trustedFile("/etc/athena/task-firewall.rules")).trim();
  const actualRules = await fixed("/usr/sbin/iptables", ["-S", "ATHENA-TASKS"]);
  if (
    actualRules !== expectedRules ||
    !(await fixed("/usr/sbin/iptables", ["-S", "DOCKER-USER"])).startsWith(
      "-N DOCKER-USER\n-A DOCKER-USER -j ATHENA-TASKS\n",
    ) ||
    !(await fixed("/usr/sbin/iptables", ["-S", "INPUT"])).startsWith(
      "-P INPUT ACCEPT\n-A INPUT -s 172.16.0.0/12 -j DROP\n",
    )
  )
    throw Error("Task firewall unavailable.");
  await containers(scope);
  const root = await statfs("/");
  const rootDevice = (await stat("/")).dev;
  for (const path of ["/workspace", "/var/lib/docker"]) {
    const fs = await statfs(path);
    if (
      fs.type !== root.type ||
      fs.blocks !== root.blocks ||
      fs.bsize !== root.bsize ||
      (await stat(path)).dev !== rootDevice
    )
      throw Error("Unbounded writable storage denied.");
    if ((await lstat(path)).isSymbolicLink()) throw Error("Workspace mount denied.");
  }
  const pidLimit = Number((await readFile("/proc/sys/kernel/pid_max", "utf8")).trim());
  // Lowering pid_max after boot does not justify a bound if older high PIDs survive.
  for (const pid of (await readdir("/proc")).filter((p) => /^\d+$/.test(p))) {
    let tids: string[];
    try {
      tids = await readdir(`/proc/${pid}/task`);
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") continue;
      throw e;
    }
    if (Number(pid) >= pidLimit || tids.some((tid) => Number(tid) >= pidLimit))
      throw Error("Whole-VM process bound unavailable.");
  }
  if ((await readFile("/proc/swaps", "utf8")).trim().split("\n").length !== 1)
    throw Error("Unbounded swap denied.");
  return Ec2RuntimeEvidenceSchema.parse({
    ...scope,
    schemaVersion: "1",
    runtimeDigest,
    cpuCount: availableParallelism(),
    memoryBytes: totalmem(),
    writableDiskBytes: root.blocks * root.bsize,
    pidLimit,
    hardDeadline: lifetime.expiresAt,
    idleSeconds: lifetime.idleSeconds,
    supervisorUid: 0,
    executionUid: 65532,
    offlineValidation: true,
    dependencyProxyOnly: true,
    previewInternalNetwork: true,
    containersReadOnly: true,
    noHostSecretsMounted: true,
    kernelDeadlineArmed: true,
    instanceMetadataBlockedForTasks: true,
    controlPlaneBlockedForTasks: true,
  });
}
export async function expireEc2Worker() {
  // Fixed infrastructure operation only; never exposed as a model tool.
  await fixed("/usr/bin/systemctl", ["stop", "athena-worker.service"]).catch(
    () => undefined,
  );
  await fixed("/usr/bin/systemctl", ["poweroff", "--force", "--force"]);
}
export async function startEc2Watchdog() {
  if (process.platform !== "linux" || process.getuid?.() !== 0)
    throw Error("Trusted Linux supervisor required.");
  const directory = await lstat("/run/athena");
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== 0 ||
    (directory.mode & 0o022) !== 0
  )
    throw Error("Trusted runtime directory unavailable.");
  await chmod("/run/athena", 0o700);
  const bootstrap = z
    .object(Ec2WorkloadScopeSchema.shape)
    .passthrough()
    .parse(JSON.parse(await trustedFile("/run/athena/bootstrap.json")) as unknown);
  const scope = Ec2WorkloadScopeSchema.parse(
    Object.fromEntries(
      Object.keys(Ec2WorkloadScopeSchema.shape).map((k) => [k, bootstrap[k]]),
    ),
  );
  const lifetime = Ec2LifetimeSchema.parse(
    JSON.parse(await trustedFile("/run/athena/lifetime.json")) as unknown,
  );
  const remaining = (Date.parse(lifetime.expiresAt) - Date.now()) / 1000;
  if (
    remaining <= 0 ||
    remaining > 3500 ||
    (await verifyImage()) !== lifetime.runtimeDigest
  )
    throw Error("Lifetime denied.");
  const up = await monotonic();
  const state: Ec2WatchdogState = {
    scope,
    lifetime,
    monotonicDeadline: up + remaining - 2,
    lastWorkMonotonic: up,
    updatedAt: new Date().toISOString(),
    pid: process.pid,
  };
  await atomic("/run/athena/scope.json", scope);
  await mkdir("/run/systemd/system/athena-deadline.timer.d", {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    "/run/systemd/system/athena-deadline.timer.d/deadline.conf",
    deadlineTimer(state.monotonicDeadline),
    { mode: 0o600 },
  );
  await fixed("/usr/bin/systemctl", ["daemon-reload"]);
  await fixed("/usr/bin/systemctl", ["restart", "athena-deadline.timer"]);
  await atomic("/run/athena/watchdog.json", state);
  await fixed("/usr/bin/systemctl", ["start", "--no-block", "athena-worker.service"]);
  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    const current = await monotonic();
    const active = await containers(scope);
    try {
      const progress = z
        .object({ at: z.iso.datetime() })
        .strict()
        .parse(JSON.parse(await trustedFile("/run/athena/activity.json")) as unknown);
      const age = (Date.now() - Date.parse(progress.at)) / 1000;
      if (age >= 0 && age < 10) state.lastWorkMonotonic = current;
    } catch (e) {
      if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
    }
    if (active) state.lastWorkMonotonic = current;
    if (
      watchdogDecision(state, current, active, Date.now()) === "EXPIRE" ||
      (await fixed("/usr/bin/systemctl", [
        "show",
        "athena-worker.service",
        "--property=ActiveState",
        "--value",
      ])) !== "active"
    ) {
      await expireEc2Worker();
      return;
    }
    state.updatedAt = new Date().toISOString();
    await atomic("/run/athena/watchdog.json", state);
  }
}
