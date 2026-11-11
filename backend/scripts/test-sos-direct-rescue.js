// All selected tests install an in-memory Firebase substitute. No .env/key needed.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const files = [
  "sos-direct-integration.test.js",
  "create-sos.test.js",
  "sos-direct-contract.test.js",
  "sos-location.test.js",
  "update-rescue-status.test.js",
  "get-my-sos-requests.test.js",
  "get-sos-detail.test.js",
  "rescue-status-history.test.js",
  "accept-rescue-request.test.js",
  "rescue-request-filtering.test.js",
  "rescue-request-priority.test.js",
  "admin-sos-monitoring.test.js",
  "admin-sos-summary-statistics.test.js",
  "sos-validation.test.js",
  "rescue-assignment.service.test.js",
  "auth.middleware.test.js",
  "rbac.middleware.test.js",
  "notification-trigger.test.js",
  "notification-delivery-log.test.js",
  "notification-failure-policy.test.js",
];
const result = spawnSync(
  process.execPath,
  ["--test", ...files.map((file) => path.join("tests", file))],
  {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, JWT_SECRET: "sos-isolated-regression-only" },
  },
);
if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else process.exitCode = result.status ?? 1;
