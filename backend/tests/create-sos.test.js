const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf75-local-test-secret-only";

const records = new Map();
const fixedTime = Timestamp.fromDate(
  new Date("2026-10-06T12:00:00.000Z"),
);

let sequence = 0;
let commitCount = 0;
let failCommit = false;
let failUserRead = false;
let lastBatch = [];

const users = {
  resident: { role: "resident", isActive: true },
  inactive: { role: "resident", isActive: false },
  admin: { role: "admin", isActive: true },
  rescue: { role: "rescue", isActive: true },
};

const db = {
  collection(collectionName) {
    return {
      doc(id = `test-${++sequence}`) {
        const key = `${collectionName}/${id}`;

        return {
          id,
          key,
          collectionName,
          async get() {
            if (collectionName === "users" && failUserRead) {
              throw new Error("Simulated user lookup failure");
            }

            const data =
              collectionName === "users"
                ? users[id]
                : records.get(key);

            return {
              id,
              exists: data !== undefined,
              data: () => data,
            };
          },
        };
      },
    };
  },

  batch() {
    const writes = [];

    return {
      create(ref, data) {
        writes.push({ ref, data });
        return this;
      },

      async commit() {
        commitCount += 1;
        lastBatch = writes;

        if (failCommit) {
          throw new Error("Simulated batch failure");
        }

        for (const { ref } of writes) {
          assert.ok(!records.has(ref.key));
        }

        for (const { ref, data } of writes) {
          const saved = { ...data };

          for (const field of [
            "createdAt",
            "updatedAt",
            "changedAt",
          ]) {
            if (Object.hasOwn(saved, field)) {
              saved[field] = fixedTime;
            }
          }

          records.set(ref.key, saved);
        }
      },
    };
  },
};

// Replace Firebase before loading routes and services.
const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const rescueRequestRoutes = require(
  "../src/routes/rescue-request.routes",
);
const { createSosWithHistory } = require(
  "../src/services/create-sos.service",
);

const app = express();
app.use(express.json());
app.use("/api/rescue-requests", rescueRequestRoutes);

function validBody() {
  return {
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    urgency: "high",
    numberOfPeople: 3,
    note: "  CCF75 simulated SOS  ",
  };
}

function tokenFor(id, role = "resident", expiresIn = "5m") {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn },
  );
}

async function runTests() {
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const url =
      `http://127.0.0.1:${server.address().port}` +
      "/api/rescue-requests";

    async function post(body, token) {
      const headers = {
        "Content-Type": "application/json",
      };

      if (token !== undefined) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    async function expectRejected(body, token, status) {
      const beforeSize = records.size;
      const beforeCommits = commitCount;
      const result = await post(body, token);

      assert.equal(result.status, status);
      assert.equal(result.body.success, false);
      assert.equal(records.size, beforeSize);
      assert.equal(commitCount, beforeCommits);

      return result;
    }

    const residentToken = tokenFor("resident");

    // Authentication and role checks.
    await expectRejected(validBody(), undefined, 401);
    await expectRejected(validBody(), "invalid-token", 401);
    await expectRejected(
      validBody(),
      tokenFor("resident", "resident", -1),
      401,
    );

    for (const role of ["admin", "rescue"]) {
      await expectRejected(
        validBody(),
        tokenFor(role, role),
        403,
      );
    }

    await expectRejected(
      validBody(),
      tokenFor("missing-user"),
      401,
    );
    await expectRejected(
      validBody(),
      tokenFor("inactive"),
      403,
    );

    // JWT still says resident, but current DB role is admin.
    await expectRejected(
      validBody(),
      tokenFor("admin", "resident"),
      403,
    );

    // Invalid inputs must never reach batch.commit().
    const invalidBodies = [
      {},
      [],
      { ...validBody(), numberOfPeople: 0 },
      { ...validBody(), numberOfPeople: 1.5 },
      { ...validBody(), numberOfPeople: "3" },
      { ...validBody(), urgency: "unknown" },
      { ...validBody(), note: 123 },
      { ...validBody(), residentId: "another-user" },
      { ...validBody(), status: "assisted" },
      { ...validBody(), location: null },
      {
        ...validBody(),
        location: { latitude: 91, longitude: 108.2022 },
      },
      {
        ...validBody(),
        location: { latitude: 16.0544, longitude: -181 },
      },
      {
        ...validBody(),
        location: { latitude: "16.0544", longitude: 108.2022 },
      },
    ];

    for (const body of invalidBodies) {
      await expectRejected(body, residentToken, 400);
    }

    // NaN and Infinity cannot be represented as JSON numbers.
    // Check the service directly for these inputs.
    for (const latitude of [NaN, Infinity, -Infinity]) {
      const beforeCommits = commitCount;

      await assert.rejects(
        () =>
          createSosWithHistory("resident", {
            ...validBody(),
            location: { latitude, longitude: 108.2022 },
          }),
        (error) => error.code === "INVALID_SOS_INPUT",
      );

      assert.equal(commitCount, beforeCommits);
    }

    // Successful creation and initial history.
    const success = await post(validBody(), residentToken);

    assert.equal(success.status, 201);
    assert.equal(success.body.success, true);

    const request = success.body.data.rescueRequest;

    assert.equal(request.residentId, "resident");
    assert.equal(request.status, "submitted");
    assert.equal(request.urgency, "high");
    assert.equal(request.numberOfPeople, 3);
    assert.deepEqual(request.location, validBody().location);
    assert.equal(request.note, "CCF75 simulated SOS");
    assert.equal(
      request.createdAt,
      fixedTime.toDate().toISOString(),
    );
    assert.equal(request.updatedAt, request.createdAt);

    assert.equal(commitCount, 1);
    assert.equal(lastBatch.length, 2);
    assert.deepEqual(
      lastBatch.map(({ ref }) => ref.collectionName).sort(),
      ["rescue_request_status_history", "rescue_requests"],
    );

    assert.ok(records.has(`rescue_requests/${request.id}`));

    const historyEntries = [...records.entries()].filter(
      ([key]) => key.startsWith("rescue_request_status_history/"),
    );

    assert.equal(historyEntries.length, 1);

    const history = historyEntries[0][1];

    assert.equal(history.requestId, request.id);
    assert.equal(history.oldStatus, null);
    assert.equal(history.newStatus, "submitted");
    assert.equal(history.changedBy, "resident");
    assert.equal(history.changedAt.toMillis(), fixedTime.toMillis());

    // Database failures must return 500, not 400.
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      failUserRead = true;
      await expectRejected(validBody(), residentToken, 500);
      failUserRead = false;

      failCommit = true;
      const beforeSize = records.size;
      const beforeCommits = commitCount;
      const failed = await post(validBody(), residentToken);

      assert.equal(failed.status, 500);
      assert.equal(failed.body.success, false);
      assert.equal(failed.body.message, "Internal server error");
      assert.equal(commitCount, beforeCommits + 1);
      assert.equal(records.size, beforeSize);
    } finally {
      failUserRead = false;
      failCommit = false;
      console.error = originalConsoleError;
    }

    console.log("Create SOS API tests passed");
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
  console.error("Create SOS API tests failed");
  console.error(error);
  process.exitCode = 1;
});