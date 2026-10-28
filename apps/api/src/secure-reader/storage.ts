import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
export interface Objects {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}
const Key = z.string().regex(/^[a-f0-9-]{36}\.pdf$/);
export class LocalObjects implements Objects {
  constructor(private root: string) {}
  async put(key: string, data: Buffer) {
    Key.parse(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await writeFile(path.join(this.root, key), data, {
      mode: 0o600,
      flag: "wx",
    });
  }
  async get(key: string) {
    Key.parse(key);
    return readFile(path.join(this.root, key));
  }
}
export class S3Objects implements Objects {
  private client: S3Client;
  constructor(
    private bucket: string,
    region: string,
    endpoint?: string,
  ) {
    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }
  async put(key: string, data: Buffer) {
    Key.parse(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: "application/pdf",
        ServerSideEncryption: "AES256",
      }),
    );
  }
  async get(key: string) {
    Key.parse(key);
    const r = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!r.Body || !r.ContentLength || r.ContentLength > 5 * 1024 * 1024)
      throw Error("Invalid private object");
    return Buffer.from(await r.Body.transformToByteArray());
  }
}
