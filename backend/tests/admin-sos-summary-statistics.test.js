const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf158-local-test-secret-only";

const records = new Map();
const readCollections = [];

let failReadCollection = null;
let writeAttempts = 0;

function time(value) {
  return Timestamp.fromDate(new Date(value));
}

const olderTime = time("2026-10-13T06:00:00.000Z");
const newerTime = time("2026-10-13T07:00:00.000Z");

function copy(value) {
  if (value instanceof Timestamp) return value;
  if (Array.isArray(value)) return value.map(copy);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copy(item)]),
    );
  }

  return value;
}

function forbidWrite() {
  writeAttempts++;
  throw new Error("Summary API must not write data");
}

function checkRead(collectionName) {
  readCollections.push(collectionName);

  if (failReadCollection === collectionName) {
    throw new Error("Simulated database read failure");
  }
}

function snapshot(key) {
  const data = records.get(key);

  return {
    id: key.slice(key.indexOf("/") + 1),
    exists: data !== undefined,
    data: () => copy(data),
  };
}

const db = {
  collection(collectionName) {
    function query(conditions = [], maximum = null) {
      return {
        where(field, operator, value) {
          assert.equal(operator, "==");

          return query([...conditions, [field, value]], maximum);
        },

        limit(value) {
          return query(conditions, value);
        },

        async get() {
          checkRead(collectionName);

          let docs = [...records.entries()]
            .filter(
              ([key, data]) =>
                key.startsWith(`${collectionName}/`) &&
                conditions.every(([field, value]) => data[field] === value),
            )
            .map(([key]) => snapshot(key));

          if (maximum !== null) {
            docs = docs.slice(0, maximum);
          }

          return {
            docs,
            empty: docs.length === 0,
            size: docs.length,
          };
        },
      };
    }

    return {
      ...query(),

      doc(id) {
        assert.equal(typeof id, "string");
        assert.ok(id.length > 0);
        assert.equal(id.includes("/"), false);

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

const routes = require("../src/routes/admin-sos-monitoring.routes");

const {
  getSosSummaryStatisticsForAdmin,
} = require("../src/services/admin-sos-monitoring.service");

const app = express();

app.set("env", "test");
app.use(express.json());
app.use("/api/admin/rescue-requests", routes);

function reset() {
  records.clear();
  readCollections.length = 0;
  failReadCollection = null;
  writeAttempts = 0;

  for (const [id, role, isActive] of [
    ["admin", "admin", true],
    ["resident-1", "resident", true],
    ["rescue-1", "rescue", true],
    ["inactive", "admin", false],
    ["demoted", "rescue", true],
  ]) {
    records.set(`users/${id}`, {
      role,
      isActive,
      passwordHash: "must-not-be-returned",
    });
  }

  const requests = [
    ["request-low", "resident-1", "submitted", "low", olderTime],
    ["request-high", "resident-2", "received", "high", newerTime],
    ["request-critical", "resident-3", "in_progress", "critical", olderTime],
    ["request-assisted", "resident-2", "assisted", "medium", olderTime],
    ["request-cancelled", "resident-3", "cancelled", "low", olderTime],
  ];

  for (const [id, residentId, status, urgency, createdAt] of requests) {
    records.set(`rescue_requests/${id}`, {
      residentId,
      status,
      urgency,
      location: {
        latitude: 16.0544,
        longitude: 108.2022,
      },
      numberOfPeople: 2,
      note: "TEST ONLY - CCF158",
      createdAt,
      updatedAt: newerTime,
      internalField: "must-not-be-returned",
    });
  }
}

function tokenFor(id, role = "admin", expiresIn = "5m") {
  return jwt.sign({ sub: id, role }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn,
  });
}

function expectedSummary(total, byStatus, byUrgency) {
  return {
    total,
    byStatus: {
      submitted: 0,
      received: 0,
      in_progress: 0,
      assisted: 0,
      cancelled: 0,
      ...byStatus,
    },
    byUrgency: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
      ...byUrgency,
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
      "/api/admin/rescue-requests/summary";

    async function request(path = "", token = tokenFor("admin")) {
      const before = copy([...records.entries()]);
      const writesBefore = writeAttempts;
      const headers = {};

      if (token !== null) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}${path}`, { headers });

      const result = {
        status: response.status,
        body: await response.json(),
      };

      assert.deepEqual(
        [...records.entries()],
        before,
        "Summary API must preserve all records",
      );

      assert.equal(
        writeAttempts,
        writesBefore,
        "Summary API must not attempt writes",
      );

      return result;
    }

    async function expectRejected(
      path,
      expectedStatus,
      token = tokenFor("admin"),
    ) {
      const result = await request(path, token);

      assert.equal(result.status, expectedStatus);
      assert.equal(result.body.success, false);
    }

    reset();

    // 1. All requests: total, status and urgency.
    const all = await request();

    assert.equal(all.status, 200);
    assert.equal(all.body.success, true);

    assert.deepEqual(
      all.body.data,
      expectedSummary(
        5,
        {
          submitted: 1,
          received: 1,
          in_progress: 1,
          assisted: 1,
          cancelled: 1,
        },
        {
          low: 2,
          medium: 1,
          high: 1,
          critical: 1,
        },
      ),
    );

    assert.equal(Object.hasOwn(all.body.data, "rescueRequests"), false);

    assert.equal(JSON.stringify(all.body).includes("residentId"), false);

    // 2. Inclusive lower boundary (from).
    const from = await request("?from=2026-10-13T07:00:00.000Z");

    assert.equal(from.status, 200);
    assert.deepEqual(
      from.body.data,
      expectedSummary(1, { received: 1 }, { high: 1 }),
    );

    // 3. Inclusive upper boundary (to).
    const to = await request("?to=2026-10-13T06:00:00.000Z");

    assert.equal(to.status, 200);
    assert.deepEqual(
      to.body.data,
      expectedSummary(
        4,
        {
          submitted: 1,
          in_progress: 1,
          assisted: 1,
          cancelled: 1,
        },
        {
          low: 2,
          medium: 1,
          critical: 1,
        },
      ),
    );

    // 4. Exact time window.
    const exact = await request(
      "?from=2026-10-13T07:00:00.000Z" + "&to=2026-10-13T07:00:00.000Z",
    );

    assert.equal(exact.status, 200);
    assert.equal(exact.body.data.total, 1);

    // 5. Timezone offsets are supported.
    const offset = await request(
      "?from=2026-10-13T14:00:00%2B07:00" + "&to=2026-10-13T14:00:00%2B07:00",
    );

    assert.equal(offset.status, 200);
    assert.deepEqual(offset.body.data, exact.body.data);

    // 6. No matching SOS.
    const noMatches = await request("?from=2026-10-14T00:00:00.000Z");

    assert.equal(noMatches.status, 200);
    assert.deepEqual(noMatches.body.data, expectedSummary(0, {}, {}));

    // 7. Missing, invalid and expired JWT.
    await expectRejected("", 401, null);
    await expectRejected("", 401, "invalid-token");
    await expectRejected("", 401, tokenFor("admin", "admin", -1));

    // 8. Role and account state.
    for (const [id, role, expectedStatus] of [
      ["resident-1", "resident", 403],
      ["rescue-1", "rescue", 403],
      ["inactive", "admin", 403],
      ["deleted", "admin", 401],
      ["demoted", "admin", 403],
    ]) {
      readCollections.length = 0;

      await expectRejected("", expectedStatus, tokenFor(id, role));

      assert.ok(
        readCollections.every((collection) => collection === "users"),
        "Unauthorized users must not read SOS",
      );
    }

    // 9. Invalid dates and unsupported queries.
    for (const path of [
      "?from=invalid",
      "?to=invalid",
      "?from=2026-02-30T00:00:00Z",
      "?from=2026-13-01T00:00:00Z",
      "?from=2026-10-13",
      "?from=2026-10-13T25:00:00Z",
      "?from=2026-10-14T00:00:00Z" + "&to=2026-10-13T00:00:00Z",
      "?status=submitted",
      "?urgency=high",
      "?page=1",
    ]) {
      await expectRejected(path, 400);
    }

    // 10. Service boundary validation.
    await assert.rejects(
      () => getSosSummaryStatisticsForAdmin(""),
      (error) => error.code === "ADMIN_SOS_AUTH_REQUIRED",
    );

    // 11. Firestore read failure returns HTTP 500.
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      failReadCollection = "rescue_requests";
      await expectRejected("", 500);
    } finally {
      failReadCollection = null;
      console.error = originalConsoleError;
    }

    // 12. Empty Firestore collection.
    for (const key of [...records.keys()]) {
      if (key.startsWith("rescue_requests/")) {
        records.delete(key);
      }
    }

    const empty = await request();

    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.data, expectedSummary(0, {}, {}));

    assert.equal(writeAttempts, 0);

    console.log("CCF-158 SOS summary statistics API tests passed");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });

      server.closeAllConnections();
    });
  }
}

runTests().catch((error) => {
  console.error("CCF-158 SOS summary statistics API tests failed");
  console.error(error);
  process.exitCode = 1;
});
