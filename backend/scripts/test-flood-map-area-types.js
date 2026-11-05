const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Only suites that replace Firebase with in-memory substitutes (or mock the
// data service) before loading application modules. No production data writes.
const suites = [
  "tests/flood-area.service.test.js",
  "tests/flood-area.controller.test.js",
  "tests/admin-flood-area-management.test.js",
  "tests/admin-flood-area-summary-statistics.test.js",
  "tests/admin-flood-alert-management.test.js",
  "tests/active-flood-alerts.test.js",
  "tests/flood-alert-filtering.test.js",
  "tests/flood-warning-notification-rule.test.js",
  "tests/audit-log.service.test.js",
  "tests/audit-logging.service.test.js",
];
const result = spawnSync(process.execPath, ["--test", ...suites], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  shell: false,
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
