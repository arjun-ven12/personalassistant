import { defineConfig } from "tsup";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
/** Portable Linux worker artifact. No backend entry point or owner credentials. */
export default defineConfig({
  entry: {
    "provisioned-engineering-worker": "src/cloud-engineering/provisioned-worker.ts",
    "ec2-helper": "src/cloud-engineering/ec2-helper-entry.ts",
    "registry-proxy": "src/cloud-engineering/registry-proxy-entry.ts",
  },
  format: ["esm"],
  target: "node24",
  bundle: true,
  splitting: false,
  metafile: true,
  noExternal: [/.*/],
  banner: {
    js: 'import { createRequire as workerCreateRequire } from "node:module"; import { fileURLToPath as workerFileURLToPath } from "node:url"; import { dirname as workerDirname } from "node:path"; const require = workerCreateRequire(import.meta.url); const __filename = workerFileURLToPath(import.meta.url); const __dirname = workerDirname(__filename);',
  },
  clean: true,
  outDir: "dist-worker",
  esbuildOptions(options) {
    options.alias = {
      zod: createRequire(import.meta.url).resolve("zod"),
      "@alexa-control/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
      "@alexa-control/config": fileURLToPath(
        new URL("../../packages/config/src/index.ts", import.meta.url),
      ),
    };
  },
});
