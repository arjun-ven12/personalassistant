import { open } from "node:fs/promises";
import { TextDecoder } from "node:util";

import { resolveWorkspace, resolveWorkspaceFile } from "./path-policy.js";
import { CapabilityError } from "./errors.js";

const redactions: Array<[string, RegExp]> = [
  [
    "private-key",
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  ],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi],
  [
    "database-url-password",
    /\b(postgres(?:ql)?|mysql|mongodb):\/\/([^:\s]+):([^@\s]+)@/gi,
  ],
  ["github-token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["cookie-header", /\bCookie:\s*[^\r\n]+/gi],
];

export const readWorkspaceFile = async (input: {
  workspaceId: string;
  rootPath: string;
  relativePath: string;
  blockedPatterns: string[];
  maxBytes: number;
  signal?: AbortSignal;
}) => {
  input.signal?.throwIfAborted();
  const workspace = await resolveWorkspace(input.rootPath);
  const target = await resolveWorkspaceFile(
    workspace,
    input.relativePath,
    input.blockedPatterns,
  );
  if (target.info.size > input.maxBytes)
    throw new CapabilityError("FILE_TOO_LARGE", "The file exceeds the read limit.");
  const handle = await open(target.canonicalTarget, "r");
  try {
    const buffer = Buffer.alloc(target.info.size);
    const read = await handle.read(buffer, 0, buffer.length, 0);
    input.signal?.throwIfAborted();
    const bytes = buffer.subarray(0, read.bytesRead);
    if (bytes.includes(0))
      throw new CapabilityError(
        "FILE_BINARY_UNSUPPORTED",
        "Binary files are not supported.",
      );
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new CapabilityError(
        "FILE_ENCODING_INVALID",
        "The file is not valid UTF-8.",
      );
    }
    const redactionsApplied: string[] = [];
    for (const [name, pattern] of redactions) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        redactionsApplied.push(name);
        pattern.lastIndex = 0;
        content = content.replace(pattern, "[REDACTED]");
      }
    }
    return {
      workspaceId: input.workspaceId,
      relativePath: input.relativePath,
      canonicalRelativePath: target.canonicalRelativePath,
      sizeBytes: target.info.size,
      returnedBytes: Buffer.byteLength(content),
      encoding: "utf-8" as const,
      content,
      truncated: false,
      redactionsApplied,
      modifiedAt: target.info.mtime.toISOString(),
    };
  } finally {
    await handle.close();
  }
};
