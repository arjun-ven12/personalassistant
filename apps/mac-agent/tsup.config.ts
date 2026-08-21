import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["electron/main.ts", "electron/preload.ts"],
  format: ["cjs"],
  target: "es2022",
  bundle: true,
  clean: true,
  outDir: "dist-electron",
  external: ["electron"],
  noExternal: ["@alexa-control/config", "@alexa-control/shared", "typescript", "zod"],
});
