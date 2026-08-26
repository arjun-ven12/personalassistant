import { spawnSync } from "node:child_process";

const appBundle = process.argv[2];

if (!appBundle) {
  console.error("Usage: node scripts/sign-native-app.mjs <app bundle>");
  process.exit(1);
}

const identity = process.env.ALEXA_CODESIGN_IDENTITY?.trim() || "-";
if (identity === "-") {
  console.warn(
    "[mac-agent] Signing native helper ad-hoc. Set ALEXA_CODESIGN_IDENTITY to a stable Apple Development identity to preserve macOS Accessibility consent across rebuilds.",
  );
}

const result = spawnSync(
  "/usr/bin/codesign",
  ["--force", "--sign", identity, appBundle],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
