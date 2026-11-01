const assert = require("node:assert/strict");
const { Timestamp } = require("firebase-admin/firestore");

const {
  evaluateFloodWarningNotification: evaluate,
} = require("../src/services/flood-warning-notification-rule.service");

const now = 1800000000000;

const alert = {
  title: "Flood warning",
  content: "Flood warning information",
  severity: "high",
  status: "active",
  areaId: "area_001",
  startAt: Timestamp.fromMillis(now - 1000),
  endAt: Timestamp.fromMillis(now + 1000),
};

const area = {
  name: "Area 001",
  description: "Monitored area",
  source: "approved-source",
};

let passed = 0;

function check(name, previous, current, targetArea, expected) {
  assert.equal(evaluate(previous, current, targetArea, now).reason, expected);
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

check("New active warning", null, alert, area, "ELIGIBLE");

assert.equal(evaluate(null, alert, area, now).eligible, true);

check("Identical update", { ...alert }, alert, area, "UNCHANGED");

check(
  "Timestamp-only metadata update",
  { ...alert, updatedAt: Timestamp.fromMillis(now - 500) },
  { ...alert, updatedAt: Timestamp.fromMillis(now) },
  area,
  "UNCHANGED",
);

for (const [field, value] of [
  ["title", "Updated warning"],
  ["content", "Updated information"],
  ["severity", "critical"],
  ["areaId", "area_002"],
  ["startAt", Timestamp.fromMillis(now - 2000)],
  ["endAt", Timestamp.fromMillis(now + 2000)],
]) {
  check(
    `Changed ${field}`,
    alert,
    { ...alert, [field]: value },
    area,
    "ELIGIBLE",
  );
}

check("Activation", { ...alert, status: "inactive" }, alert, area, "ELIGIBLE");

check(
  "Inactive warning",
  alert,
  { ...alert, status: "inactive" },
  area,
  "ALERT_INACTIVE",
);

check(
  "Future warning",
  null,
  {
    ...alert,
    startAt: Timestamp.fromMillis(now + 100),
  },
  area,
  "NOT_STARTED",
);

check(
  "Expired warning",
  null,
  {
    ...alert,
    startAt: Timestamp.fromMillis(now - 2000),
    endAt: Timestamp.fromMillis(now - 100),
  },
  area,
  "EXPIRED",
);

check(
  "Start boundary included",
  null,
  { ...alert, startAt: Timestamp.fromMillis(now) },
  area,
  "ELIGIBLE",
);

check(
  "End boundary included",
  null,
  { ...alert, endAt: Timestamp.fromMillis(now) },
  area,
  "ELIGIBLE",
);

check(
  "Invalid time window",
  null,
  { ...alert, endAt: alert.startAt },
  area,
  "INVALID_TIME_WINDOW",
);

check(
  "Missing timestamp",
  null,
  { ...alert, startAt: null },
  area,
  "INVALID_TIME_WINDOW",
);

check("Missing area", null, alert, null, "AREA_NOT_FOUND");

check(
  "TEST ONLY warning",
  null,
  { ...alert, title: "TEST ONLY - simulated warning" },
  area,
  "TEST_DATA",
);

check(
  "TEST ONLY area",
  null,
  alert,
  { ...area, source: "TEST ONLY - simulated source" },
  "TEST_DATA",
);

check(
  "Explicit test flag",
  null,
  { ...alert, isTest: true },
  area,
  "TEST_DATA",
);

check(
  "Invalid severity",
  null,
  { ...alert, severity: "unknown" },
  area,
  "INVALID_ALERT",
);

assert.throws(
  () => evaluate(null, alert, area, NaN),
  /Invalid notification evaluation time/,
);

console.log(`All ${passed} notification rule cases passed`);
console.log("Invalid evaluation time rejection also passed");
