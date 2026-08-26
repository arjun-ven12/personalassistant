import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    database: "src/scripts/database.ts",
    "validate-environment": "src/scripts/validate-environment.ts",
  },
  format: ["esm"],
  target: "es2022",
  bundle: true,
  clean: true,
  outDir: "dist",
  noExternal: ["@alexa-control/config", "@alexa-control/shared"],
});
