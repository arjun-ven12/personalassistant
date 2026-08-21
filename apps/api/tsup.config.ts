import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  bundle: true,
  clean: true,
  outDir: "dist",
  noExternal: ["@alexa-control/config", "@alexa-control/shared"],
});
