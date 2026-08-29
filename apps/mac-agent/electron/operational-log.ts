import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const LogCategorySchema = z.enum([
  "connection",
  "auth",
  "device",
  "capability",
  "execution",
  "native-provider",
  "permission",
  "update",
  "error",
]);

const LogEntrySchema = z
  .object({
    at: z.iso.datetime(),
    category: LogCategorySchema,
    event: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/),
    detail: z.string().max(240).optional(),
  })
  .strict();

export type OperationalLogEntry = z.infer<typeof LogEntrySchema>;

export class BoundedOperationalLog {
  constructor(
    private readonly pathname: string,
    private readonly maximumBytes = 512 * 1024,
  ) {}

  async record(input: Omit<OperationalLogEntry, "at">) {
    const entry = LogEntrySchema.parse({ ...input, at: new Date().toISOString() });
    await mkdir(path.dirname(this.pathname), { recursive: true, mode: 0o700 });
    await this.rotateIfNeeded();
    await appendFile(this.pathname, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }

  async recent(limit = 100): Promise<OperationalLogEntry[]> {
    try {
      const content = await readFile(this.pathname, "utf8");
      return content
        .trim()
        .split("\n")
        .slice(-Math.max(1, Math.min(limit, 500)))
        .flatMap((line) => {
          try {
            const parsed = LogEntrySchema.safeParse(JSON.parse(line));
            return parsed.success ? [parsed.data] : [];
          } catch {
            return [];
          }
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async rotateIfNeeded() {
    try {
      if ((await stat(this.pathname)).size < this.maximumBytes) return;
      const rotated = `${this.pathname}.1`;
      await writeFile(rotated, "", { mode: 0o600 });
      await rename(this.pathname, rotated);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
