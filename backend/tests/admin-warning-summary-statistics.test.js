const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf159-local-test-secret-only";

const records = new Map();
const readCollections = [];

let failReadCollection = null;
let writeAttempts = 0;

function time(value) {
  return Timestamp.fromDate(new Date(value));
}

const olderTime = time("2026-10-13T06:00:00.000Z");
const newerTime = time("2026-10-13T07:00:00.000Z");

function forbidWrite() {
  writeAttempts++;
  throw new Error("Warning statistics API must not write data");
}

function checkRead(collectionName) {
  readCollections.push(collectionName);

  if (failReadCollection === collectionName) {
    throw new Error("Simulated Firestore read failure");
  }
}

function snapshot(key) {
  const data = records.get(key);

  return {
    id: key.slice(key.indexOf("/") + 1),
    exists: data !== undefined,
    data: () => (data === undefined ? undefined : { ...data }),
  };
}

const db = {
  collection(collectionName) {
    return {
      doc(id) {
        const key = `${collectionName}/${id}`;

        return {
          id,
          async get() {
            checkRead(collectionName);
            return snapshot(key);
          },
          set: forbidWrite,
          create: forbidWrite,
          update: forbidWrite,
          delete: forbidWrite,
        };
      },

      async get() {
        checkRead(collectionName);

        const docs = [...records.keys()]
          .filter((key) => key.startsWith(`${collectionName}/`))
          .map(snapshot);

        return {
          docs,
          size: docs.length,
          empty: docs.length === 0,
        };
      },

      add: forbidWrite,
    };
  },

  runTransaction: forbidWrite,
  batch: forbidWrite,
};

const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const routes = require("../src/routes/admin-flood-alert.routes");

const app = express();

app.set("env", "test");
app.use(express.json());
app.use("/api/admin/flood-alerts", routes);

function reset() {
  records.clear();
  readCollections.length = 0;
  failReadCollection = null;
  writeAttempts = 0;

  const users = [
    ["admin", "admin", true],
    ["resident", "resident", true],
    ["inactive", "admin", false],
    ["demoted", "resident", true],
  ];

  for (const [id, role, isActive] of users) {
    records.set(`users/${id}`, {
      role,
      isActive,
      passwordHash: "must-not-be-returned",
    });
  }

  const alerts = [
    ["alert-low", "low", "active", olderTime],
    ["alert-medium", "medium", "inactive", olderTime],
    ["alert-high", "high", "active", newerTime],
    ["alert-critical", "critical", "inactive", olderTime],
    ["alert-high-2", "high", "active", olderTime],
  ];

  for (const [id, severity, status, createdAt] of alerts) {
    records.set(`flood_alerts/${id}`, {
      title: `Private title ${id}`,
      content: "Private warning content",
      severity,
      status,
      areaId: "area-1",
      startAt: olderTime,
      endAt: newerTime,
      createdAt,
      updatedAt: newerTime,
    });
  }
}

function tokenFor(id, role = "admin") {
  return jwt.sign({ sub: id, role }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

function expectedSummary(total, bySeverity = {}, byStatus = {}) {
  return {
    total,
    bySeverity: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
      ...bySeverity,
    },
    byStatus: {
      active: 0,
      inactive: 0,
      ...byStatus,
    },
  };
}

async function runTests() {
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const baseUrl =
      `http://127.0.0.1:${server.address().port}` +
      "/api/admin/flood-alerts/summary";

    async function request(query = "", token = tokenFor("admin")) {
      const headers = {};
      const writesBefore = writeAttempts;

      if (token !== null) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}${query}`, {
        headers,
      });

      const result = {
        status: response.status,
        body: await response.json(),
      };

      assert.equal(
        writeAttempts,
        writesBefore,
        "Statistics endpoint must never write to Firestore",
      );

      return result;
    }

    async function expectRejected(query, status, token) {
      const result = await request(query, token);

      assert.equal(result.status, status);
      assert.equal(result.body.success, false);
    }

    reset();

    // 1. Count all flood alerts by severity and status.
    const all = await request();

    assert.equal(all.status, 200);
    assert.equal(all.body.success, true);
    assert.deepEqual(
      all.body.data,
      expectedSummary(
        5,
        { low: 1, medium: 1, high: 2, critical: 1 },
        { active: 3, inactive: 2 },
      ),
    );

    assert.equal(
      JSON.stringify(all.body).includes("Private warning content"),
      false,
    );

    assert.ok(readCollections.includes("flood_alerts"));

    // 2. Inclusive lower date boundary.
    const from = await request("?from=2026-10-13T07:00:00.000Z");

    assert.equal(from.status, 200);
    assert.deepEqual(
      from.body.data,
      expectedSummary(1, { high: 1 }, { active: 1 }),
    );

    // 3. Inclusive upper date boundary.
    const to = await request("?to=2026-10-13T06:00:00.000Z");

    assert.equal(to.status, 200);
    assert.deepEqual(
      to.body.data,
      expectedSummary(
        4,
        { low: 1, medium: 1, high: 1, critical: 1 },
        { active: 2, inactive: 2 },
      ),
    );

    // 4. Both boundaries and timezone offset.
    const range = await request(
      "?from=2026-10-13T08:00:00%2B01:00" + "&to=2026-10-13T08:00:00%2B01:00",
    );

    assert.equal(range.status, 200);
    assert.deepEqual(
      range.body.data,
      expectedSummary(1, { high: 1 }, { active: 1 }),
    );

    // 5. Reject invalid query parameters.
    for (const query of [
      "?unexpected=value",
      "?from=invalid",
      "?from=2026-02-30T10:00:00Z",
      "?from=2026-10-13",
      "?from=2026-10-13T06:00:00",
      "?from=2026-10-13T06:00:00%2B15:00",
      "?from=2026-10-14T00:00:00Z" + "&to=2026-10-13T00:00:00Z",
    ]) {
      await expectRejected(query, 400);
    }

    // 6. Authentication and role-based access.
    await expectRejected("", 401, null);
    await expectRejected("", 403, tokenFor("resident", "resident"));
    await expectRejected("", 403, tokenFor("inactive", "admin"));
    await expectRejected("", 403, tokenFor("demoted", "admin"));

    // 7. Empty collection returns zero counters.
    for (const key of [...records.keys()]) {
      if (key.startsWith("flood_alerts/")) {
        records.delete(key);
      }
    }

    const empty = await request();

    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.data, expectedSummary(0));

    // 8. Database failure returns HTTP 500.
    failReadCollection = "flood_alerts";

    const originalConsoleError = console.error;

    try {
      console.error = () => {};

      const failed = await request();

      assert.equal(failed.status, 500);
      assert.equal(failed.body.success, false);
      assert.equal(failed.body.message, "Internal server error");
    } finally {
      console.error = originalConsoleError;
      failReadCollection = null;
    }

    assert.equal(writeAttempts, 0);

    console.log("Admin warning summary statistics API tests passed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
