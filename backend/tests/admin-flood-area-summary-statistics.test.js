const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf160-local-test-secret-only";

const records = new Map();
const readCollections = [];

let failReadCollection = null;
let writeAttempts = 0;

function forbidWrite() {
  writeAttempts++;
  throw new Error("Flood area statistics API must not write data");
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

// Replace Firebase before loading the real routes/services.
const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const routes = require("../src/routes/admin-flood-area.routes");

const app = express();

app.set("env", "test");
app.use(express.json());
app.use("/api/admin/flood-areas", routes);

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
      passwordHash: "private-password-hash",
    });
  }

  const createdAt = Timestamp.fromDate(new Date("2026-10-13T06:00:00.000Z"));

  const areas = [
    ["area-low", "low", "active"],
    ["area-medium", "medium", "inactive"],
    ["area-high", "high", "active"],
    ["area-critical", "critical", "inactive"],
    ["area-high-2", "high", "active"],
  ];

  for (const [id, severity, status] of areas) {
    records.set(`flood_areas/${id}`, {
      name: `Private area ${id}`,
      description: "Private area description",
      severity,
      status,
      source: "test",
      geometry: {
        type: "polygon",
        points: [
          { latitude: 16.01, longitude: 108.01 },
          { latitude: 16.02, longitude: 108.01 },
          { latitude: 16.02, longitude: 108.02 },
        ],
      },
      createdAt,
      updatedAt: createdAt,
    });
  }
}

function tokenFor(id, role = "admin") {
  return jwt.sign({ sub: id, role }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

function expectedSummary(total, byStatus = {}, bySeverity = {}) {
  return {
    total,
    byStatus: {
      active: 0,
      inactive: 0,
      ...byStatus,
    },
    bySeverity: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
      ...bySeverity,
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
      "/api/admin/flood-areas/summary";

    async function request(query = "", token = tokenFor("admin")) {
      const headers = {};
      const writesBefore = writeAttempts;

      if (token !== null) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}${query}`, { headers });

      const result = {
        status: response.status,
        body: await response.json(),
      };

      assert.equal(
        writeAttempts,
        writesBefore,
        "Statistics endpoint must not write to Firestore",
      );

      return result;
    }

    async function expectRejected(query, status, token) {
      const result = await request(query, token);

      assert.equal(result.status, status);
      assert.equal(result.body.success, false);
    }

    reset();

    // 1. Correct overall and grouped statistics.
    const all = await request();

    assert.equal(all.status, 200);
    assert.equal(all.body.success, true);

    assert.deepEqual(
      all.body.data,
      expectedSummary(
        5,
        { active: 3, inactive: 2 },
        { low: 1, medium: 1, high: 2, critical: 1 },
      ),
    );

    // No private details or polygon data in the response.
    const responseText = JSON.stringify(all.body);

    assert.equal(responseText.includes("Private area"), false);
    assert.equal(responseText.includes("geometry"), false);
    assert.equal(responseText.includes("points"), false);

    assert.ok(readCollections.includes("flood_areas"));

    // 2. Reject unsupported query parameters.
    await expectRejected("?unexpected=value", 400);
    await expectRejected("?from=2026-10-13", 400);

    // 3. Authentication and authorization.
    await expectRejected("", 401, null);

    await expectRejected("", 403, tokenFor("resident", "resident"));

    await expectRejected("", 403, tokenFor("inactive", "admin"));

    await expectRejected("", 403, tokenFor("demoted", "admin"));

    // 4. Empty collection returns zero counters.
    for (const key of [...records.keys()]) {
      if (key.startsWith("flood_areas/")) {
        records.delete(key);
      }
    }

    const empty = await request();

    assert.equal(empty.status, 200);

    assert.deepEqual(empty.body.data, expectedSummary(0));

    // 5. Firestore read failure returns HTTP 500.
    failReadCollection = "flood_areas";

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

    console.log("Admin flood area summary statistics API tests passed");
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
}

runTests().catch((error) => {
  console.error("Admin flood area summary statistics API tests failed");
  console.error(error);
  process.exitCode = 1;
});
