// Explicit safe suites only: use local HTTP + in-memory Firestore, no .env/key.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const suites = [
  "safe-location.service.test.js",
  "safe-location.controller.test.js",
  "nearby-safe-locations.test.js",
  "admin-safe-location-management.test.js",
  "safe-location-catalog-integration.test.js",
];
const result = spawnSync(
  process.execPath,
  ["--test", ...suites.map((name) => path.join("tests", name))],
  {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    shell: false,
  },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
