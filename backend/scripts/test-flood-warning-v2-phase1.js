// Safe local suite: only injected DB substitutes; no service-account configuration needed.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const files = [
  "tests/flood-warning-v2.lifecycle.test.js",
  "tests/flood-warning-v2.http.test.js",
  "tests/auth.middleware.test.js",
  "tests/rbac.middleware.test.js",
  "tests/notification-trigger.test.js",
  "tests/notification-transport.test.js",
  "tests/notification-failure-policy.test.js",
  "tests/audit-log.service.test.js",
  "tests/audit-logging.service.test.js",
  "tests/sos-direct-integration.test.js",
  "tests/safe-location-catalog-integration.test.js",
  "tests/flood-area.controller.test.js",
];
function run(testFiles = files) {
  const env = { ...process.env, JWT_SECRET: "warning-v2-suite-test-only", GCLOUD_PROJECT: "demo-floodguard-warning-v2" };
  for (const name of ["FIREBASE_SERVICE_ACCOUNT_BASE64", "GOOGLE_APPLICATION_CREDENTIALS", "FIRESTORE_EMULATOR_HOST"]) delete env[name];
  const result = spawnSync(process.execPath, ["--test", ...testFiles], { cwd: path.resolve(__dirname, ".."), env, stdio: "inherit" });
  if (result.error) console.error("Unable to start isolated Warning V2 tests");
  process.exitCode = result.status === null ? 1 : result.status;
}
if (require.main === module) run();
module.exports = { files, run };
