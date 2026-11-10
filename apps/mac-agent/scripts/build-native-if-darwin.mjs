import { spawnSync } from "node:child_process";

if (process.platform === "darwin") {
  const result = spawnSync("pnpm", ["run", "build:native"], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} else {
  console.log(
    "Native macOS helpers require macOS; portable Electron bundle completed.",
  );
}
