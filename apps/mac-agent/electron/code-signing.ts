import { spawnSync } from "node:child_process";

export const isDeveloperIdSignatureOutput = (output: string) =>
  /^Authority=Developer ID Application:/m.test(output);

export const isDeveloperIdSigned = (appPath: string) => {
  if (process.platform !== "darwin") return false;
  const result = spawnSync("/usr/bin/codesign", ["--display", "--verbose=4", appPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    timeout: 5_000,
  });
  if (result.status !== 0) return false;
  return isDeveloperIdSignatureOutput(`${result.stdout}\n${result.stderr}`);
};
