import { createRegistryProxy } from "./registry-proxy.js";
if (process.platform !== "linux" || process.argv.length !== 2)
  throw Error("Isolated Linux proxy required.");
createRegistryProxy().listen(3128, "0.0.0.0");
