const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf101-local-test-secret-only";

const users = {
  resident: { role: "resident", isActive: true },
  other: { role: "resident", isActive: true },
  rescue: { role: "rescue", isActive: true },
  admin: { role: "admin", isActive: true },
  inactive: { role: "resident", isActive: false },
};

const requests = {
  "request-1": { residentId: "resident" },
  "request-empty": { residentId: "resident" },
};

const historyRecords = new Map();
let historyReads = 0;
let failUserRead = false;
let failRequestRead = false;
let failHistoryRead = false;

function history(requestId, changedAt, oldStatus, newStatus) {
  return {
    requestId,
    changedAt,
    oldStatus,
    newStatus,
    changedBy: "rescue",
    note: null,
  };
}

const early = new Timestamp(1791532800, 100);
const later = new Timestamp(1791532800, 200);
const latest = new Timestamp(1791532801, 0);

// Insert deliberately out of chronological order.
// The early and later timestamps share the same millisecond.
historyRecords.set(
  "history-z",
  history("request-1", latest, "received", "in_progress"),
);
historyRecords.set(
  "history-b",
  history("request-1", later, "submitted", "received"),
);
historyRecords.set(
  "history-a",
  history("request-1", early, null, "submitted"),
);
historyRecords.set(
  "history-c",
  history("request-1", later, "submitted", "received"),
);
historyRecords.set(
  "history-other",
  history("another-request", early, null, "submitted"),
);

const db = {
  collection(collectionName) {
    return {
      doc(id) {
        return {
          id,
          async get() {
            let data;

            if (collectionName === "users") {
              if (failUserRead) {
                throw new Error("Simulated user read failure");
              }
              data = users[id];
            } else if (collectionName === "rescue_requests") {
              if (failRequestRead) {
                throw new Error("Simulated request read failure");
              }
              data = requests[id];
            }

            return {
              id,
              exists: data !== undefined,
              data: () => data,
            };
          },
        };
      },

      where(field, operator, value) {
        assert.equal(
          collectionName,
          "rescue_request_status_history",
        );
        assert.equal(field, "requestId");
        assert.equal(operator, "==");

        return {
          async get() {
            historyReads += 1;

            if (failHistoryRead) {
              throw new Error("Simulated history read failure");
            }

            const docs = [...historyRecords.entries()]
              .filter(([, data]) => data.requestId === value)
              .map(([id, data]) => ({
                id,
                data: () => data,
              }));

            return {
              docs,
              empty: docs.length === 0,
            };
          },
        };
      },
    };
  },
};

const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const routes = require("../src/routes/rescue-request.routes");
const {
  getRescueRequestStatusHistoryByRequestId,
} = require("../src/services/rescue-request-status-history.service");

const app = express();
app.set("env", "test");
app.use(express.json());
app.use("/api/rescue-requests", routes);

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

    const baseUrl =
      `http://127.0.0.1:${server.address().port}` +
      "/api/rescue-requests";

    async function get(requestId, token) {
      const headers = {};

      if (token !== undefined) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${baseUrl}/${encodeURIComponent(requestId)}/history`,
        { headers },
      );

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    async function expectRejected(requestId, token, status) {
      const result = await get(requestId, token);
      assert.equal(result.status, status);
      assert.equal(result.body.success, false);
      return result;
    }

    // Authentication and access failures must not read history.
    const beforeDeniedReads = historyReads;

    await expectRejected("request-1", undefined, 401);
    await expectRejected("request-1", "invalid-token", 401);
    await expectRejected(
      "request-1",
      tokenFor("resident", "resident", "-1s"),
      401,
    );
    await expectRejected(
      "request-1",
      tokenFor("missing-user"),
      401,
    );
    await expectRejected(
      "request-1",
      tokenFor("inactive"),
      403,
    );
    await expectRejected(
      "request-1",
      tokenFor("other"),
      403,
    );
    await expectRejected(
      "missing-request",
      tokenFor("resident"),
      404,
    );
    await expectRejected(
      "invalid/id",
      tokenFor("resident"),
      400,
    );

    assert.equal(historyReads, beforeDeniedReads);

    // Check the current Firestore role, even with an allowed JWT role.
    users.resident.role = "unsupported";

    try {
      await expectRejected(
        "request-1",
        tokenFor("resident", "resident"),
        403,
      );
    } finally {
      users.resident.role = "resident";
    }

    assert.equal(historyReads, beforeDeniedReads);

    // Owner, Rescue and Admin may read the timeline.
    for (const [id, role] of [
      ["resident", "resident"],
      ["rescue", "rescue"],
      ["admin", "admin"],
    ]) {
      const result = await get("request-1", tokenFor(id, role));

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.data.requestId, "request-1");

      const timeline = result.body.data.statusHistory;

      assert.deepEqual(
        timeline.map((entry) => entry.id),
        ["history-a", "history-b", "history-c", "history-z"],
      );

      assert.equal(timeline[0].oldStatus, null);
      assert.equal(timeline[0].newStatus, "submitted");
      assert.equal(timeline[1].changedBy, "rescue");
      assert.equal(timeline[1].note, null);
      assert.equal(
        timeline[0].changedAt,
        early.toDate().toISOString(),
      );
      assert.equal(
        timeline[3].changedAt,
        latest.toDate().toISOString(),
      );

      assert.ok(
        timeline.every((entry) => entry.id !== "history-other"),
      );
    }

    const empty = await get(
      "request-empty",
      tokenFor("resident"),
    );

    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.data.statusHistory, []);

    // Service validates IDs before querying Firestore.
    const beforeInvalidReads = historyReads;

    for (const id of [
      undefined,
      null,
      "",
      "   ",
      ".",
      "..",
      "invalid/id",
      "x".repeat(1501),
    ]) {
      await assert.rejects(
        () => getRescueRequestStatusHistoryByRequestId(id),
        /Invalid rescue request ID/,
      );
    }

    assert.equal(historyReads, beforeInvalidReads);

    const trimmed =
      await getRescueRequestStatusHistoryByRequestId(
        "  request-1  ",
      );

    assert.deepEqual(
      trimmed.map((entry) => entry.id),
      ["history-a", "history-b", "history-c", "history-z"],
    );

    // Unexpected database failures return 500.
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      failUserRead = true;
      await expectRejected("request-1", tokenFor("resident"), 500);
      failUserRead = false;

      failRequestRead = true;
      await expectRejected("request-1", tokenFor("resident"), 500);
      failRequestRead = false;

      failHistoryRead = true;
      const failed = await expectRejected(
        "request-1",
        tokenFor("resident"),
        500,
      );

      assert.equal(
        failed.body.message,
        "Internal server error",
      );
    } finally {
      failUserRead = false;
      failRequestRead = false;
      failHistoryRead = false;
      console.error = originalConsoleError;
    }

    console.log("Rescue status history API tests passed");
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
  console.error("Rescue status history API tests failed");
  console.error(error);
  process.exitCode = 1;
});