import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  lstat,
  realpath,
  readdir,
  statfs,
  unlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { DocumentScope } from "@alexa-control/shared";
export interface PrivateDocumentAssets {
  put(s: DocumentScope, bytes: Buffer, kind?: "image" | "pdf"): Promise<string>;
  read(s: DocumentScope, id: string, kind?: "image" | "pdf"): Promise<Buffer>;
}
/** Server-owned root only; all paths derive from hashed tenant IDs and UUIDs. No public URLs. */
export class FileDocumentAssets implements PrivateDocumentAssets {
  constructor(readonly root = path.resolve(".local/document-assets")) {}
  /** Fixed startup probe contains no user content and is removed after verification. */
  async verifyPrivateStorage() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw Error("DOCUMENT_PRIVATE_STORAGE_DENIED");
    const filename = path.join(this.root, `.readiness-${crypto.randomUUID()}`);
    const probe = Buffer.from("athena-document-storage-probe-v1");
    const file = await open(
      filename,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(probe);
      await file.sync();
      const check = Buffer.alloc(probe.length);
      const read = await file.read(check, 0, check.length, 0);
      if (read.bytesRead !== probe.length || !check.equals(probe))
        throw Error("DOCUMENT_PRIVATE_STORAGE_UNVERIFIED");
    } finally {
      await file.close();
      await unlink(filename);
    }
  }
  private async directory(s: DocumentScope) {
    z.string().uuid().parse(s.ownerId);
    z.string().uuid().parse(s.companyId);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink()) throw Error("ASSET_ROOT_DENIED");
    const root = await realpath(this.root);
    const dir = path.join(
      root,
      createHash("sha256")
        .update(s.ownerId + ":" + s.companyId)
        .digest("hex"),
    );
    await mkdir(dir, { mode: 0o700, recursive: true });
    if ((await lstat(dir)).isSymbolicLink()) throw Error("ASSET_SCOPE_DENIED");
    return dir;
  }
  async put(s: DocumentScope, bytes: Buffer, kind: "image" | "pdf" = "image") {
    if (bytes.length > (kind === "pdf" ? 32 : 6) * 1024 * 1024)
      throw Error("ASSET_QUOTA");
    const dir = await this.directory(s);
    const names = await readdir(dir);
    if (names.length >= 2000) throw Error("ASSET_SCOPE_QUOTA");
    let used = 0;
    for (const name of names) {
      const item = await lstat(path.join(dir, name));
      if (item.isFile()) used += item.size;
    }
    const space = await statfs(dir);
    if (
      used + bytes.length > 256 * 1024 * 1024 ||
      space.bavail * space.bsize < 50 * 1024 * 1024
    )
      throw Error("ASSET_STORAGE_QUOTA");
    const id = crypto.randomUUID();
    const file = await open(
      path.join(dir, id),
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    return id;
  }
  async read(s: DocumentScope, id: string, kind: "image" | "pdf" = "image") {
    z.string().uuid().parse(id);
    const file = await open(
      path.join(await this.directory(s), id),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > (kind === "pdf" ? 32 : 6) * 1024 * 1024)
        throw Error("ASSET_QUOTA");
      return await file.readFile();
    } finally {
      await file.close();
    }
  }
}
