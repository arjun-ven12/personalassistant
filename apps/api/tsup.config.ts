import { cp } from "node:fs/promises";
import { defineConfig } from "tsup";
import { fileURLToPath } from "node:url";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "mcp-fixture": "src/mcp/fixture-server.ts",
    "secure-reader-pdf-worker": "src/secure-reader/pdf-worker.ts",
    "secure-reader-bootstrap-admin": "src/secure-reader/bootstrap-admin.ts",
    "engineering-worker": "src/cloud-engineering/worker-entry.ts",
    "provisioned-engineering-worker": "src/cloud-engineering/provisioned-worker.ts",
    database: "src/scripts/database.ts",
    "validate-environment": "src/scripts/validate-environment.ts",
  },
  // Bundled reviewed runtime dependencies include CommonJS Node modules.
  banner: {
    js: 'import { createRequire as workerCreateRequire } from "node:module"; import { fileURLToPath as workerFileURLToPath } from "node:url"; import { dirname as workerDirname } from "node:path"; const require = workerCreateRequire(import.meta.url); const __filename = workerFileURLToPath(import.meta.url); const __dirname = workerDirname(__filename);',
  },
  format: ["esm"],
  target: "es2022",
  bundle: true,
  clean: true,
  async onSuccess() {
    await cp("assets/documents", "dist/assets/documents", { recursive: true });
  },
  outDir: "dist",
  noExternal: ["@alexa-control/config", "@alexa-control/shared"],
  // Reviewed runtime sources are copied without installing the Mac application.
  // Resolve workspace contracts independently of Mac-local pnpm symlinks.
  esbuildOptions(options) {
    options.alias = {
      "@alexa-control/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
      "@alexa-control/config": fileURLToPath(
        new URL("../../packages/config/src/index.ts", import.meta.url),
      ),
    };
  },
});
