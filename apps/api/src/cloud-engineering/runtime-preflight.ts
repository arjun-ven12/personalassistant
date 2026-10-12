import { readFile, statfs, lstat } from "node:fs/promises";
import { availableParallelism, totalmem } from "node:os";
import { CLOUD_ENGINEERING_LIMITS } from "@alexa-control/shared";

export interface RuntimeEvidence {
  cpus: number;
  memoryBytes: number;
  processLimit: string;
  workspace: { type: number; bytes: number };
  docker: { type: number; bytes: number };
}
/** Check the reviewed VM image containment before presenting any workload identity. */
export function verifyCloudRuntimeEvidence(e: RuntimeEvidence) {
  const limits = CLOUD_ENGINEERING_LIMITS;
  // Dedicated tmpfs mounts bound writable task and container storage. Root image is immutable.
  if (
    !Number.isInteger(e.cpus) ||
    e.cpus < 1 ||
    e.cpus > limits.cpu ||
    e.memoryBytes <= 0 ||
    e.memoryBytes > limits.memoryMiB * 1024 * 1024 ||
    !/^\d+$/.test(e.processLimit.trim()) ||
    Number(e.processLimit) < 1 ||
    Number(e.processLimit) > limits.processes ||
    e.workspace.type !== 0x01021994 ||
    e.docker.type !== 0x01021994 ||
    e.workspace.bytes <= 0 ||
    e.docker.bytes <= 0 ||
    e.workspace.bytes + e.docker.bytes > limits.diskMiB * 1024 * 1024
  )
    throw Error("Reviewed cloud runtime resource containment unavailable.");
}
export async function verifyCloudRuntime() {
  const [workspace, docker, processLimit] = await Promise.all([
    statfs("/workspace"),
    statfs("/var/lib/docker"),
    readFile("/sys/fs/cgroup/pids.max", "utf8"),
  ]);
  verifyCloudRuntimeEvidence({
    cpus: availableParallelism(),
    memoryBytes: totalmem(),
    processLimit,
    workspace: { type: workspace.type, bytes: workspace.blocks * workspace.bsize },
    docker: { type: docker.type, bytes: docker.blocks * docker.bsize },
  });
}

/** AMI-owned marker, never a bootstrap/client/model attestation. */
export async function isEc2Runtime() {
  try {
    const info = await lstat("/etc/athena/provider");
    if (!info.isFile() || info.uid !== 0 || (info.mode & 0o022) !== 0 || info.size > 32)
      throw Error("Untrusted provider marker.");
    return (await readFile("/etc/athena/provider", "utf8")).trim() === "aws-ec2";
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return false;
    throw e;
  }
}
export function verifyEc2LocalEvidence(e: {
  cpus: number;
  memoryBytes: number;
  pidLimit: string;
  rootBytes: number;
}) {
  if (
    !Number.isInteger(e.cpus) ||
    e.cpus < 1 ||
    e.cpus > 2 ||
    e.memoryBytes <= 0 ||
    e.memoryBytes > 4096 * 1024 * 1024 ||
    !/^\d+$/.test(e.pidLimit.trim()) ||
    Number(e.pidLimit) < 1 ||
    Number(e.pidLimit) > 512 ||
    e.rootBytes <= 0 ||
    e.rootBytes > 10240 * 1024 * 1024
  )
    throw Error("Reviewed EC2 resource containment unavailable.");
}
export async function verifyEc2LocalRuntime() {
  const [root, pidLimit] = await Promise.all([
    statfs("/"),
    readFile("/proc/sys/kernel/pid_max", "utf8"),
  ]);
  verifyEc2LocalEvidence({
    cpus: availableParallelism(),
    memoryBytes: totalmem(),
    pidLimit,
    rootBytes: root.blocks * root.bsize,
  });
  // Detailed kernel watchdog/network/image evidence is additionally verified by the control plane through pinned SSM documents.
}
