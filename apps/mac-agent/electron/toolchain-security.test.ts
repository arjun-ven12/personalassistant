import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const local = createRequire(import.meta.url);
const fromLauncher = createRequire(local.resolve("concurrently"));
const dependency: unknown = fromLauncher("shell-quote");
const { quote } = z
  .object({
    quote: z.custom<(tokens: unknown[]) => string>(
      (value) => typeof value === "function",
    ),
  })
  .passthrough()
  .parse(dependency);

// Exercise the dependency reached by the actual Mac development launcher.
// Strings remain data: this test never starts a shell or executes quoted text.
describe("development launcher quoting security", () => {
  it.each(["\n", "\r", "\u2028", "\u2029"])(
    "rejects a line terminator after a comment token (%j)",
    (separator) => {
      expect(() =>
        quote(["literal", { comment: "fixture" }, `a${separator}UNTRUSTED_TOKEN;#`]),
      ).toThrow(TypeError);
    },
  );
});
