const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf100-local-test-secret-only";

const records = new Map();
const originalTime = Timestamp.fromDate(
  new Date("2026-10-09T08:00:00.000Z"),
);

let sequence = 0;
let version = 0;
let commits = 0;
let failCommit = false;
let failRead = false;
let beforeCommit = null;

function snapshot(ref) {
  if (failRead) {
    throw new Error("Simulated read failure");
  }

  const stored = records.get(ref.key);
  const data = stored === undefined ? undefined : { ...stored };

  return {
    id: ref.id,
    exists: data !== undefined,
    data: () => data,
  };
}

const db = {
  collection(collectionName) {
    return {
      doc(id = `history-${++sequence}`) {
        return {
          id,
          key: `${collectionName}/${id}`,
          async get() {
            return snapshot(this);
          },
        };
      },
    };
  },

  async runTransaction(callback) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const readVersion = version;
      const writes = [];

      const result = await callback({
        async get(ref) {
          assert.equal(writes.length, 0, "Reads must precede writes");
          return snapshot(ref);
        },

        update(ref, data) {
          writes.push({ type: "update", ref, data });
        },

        create(ref, data) {
          writes.push({ type: "create", ref, data });
        },
      });

      if (beforeCommit) {
        const hook = beforeCommit;
        beforeCommit = null;
        hook();
      }

      if (version !== readVersion) {
        continue;
      }

      if (failCommit) {
        throw new Error("Simulated commit failure");
      }

      // Validate every write before applying any write.
      for (const write of writes) {
        if (write.type === "create") {
          assert.equal(records.has(write.ref.key), false);
        } else {
          assert.equal(records.has(write.ref.key), true);
        }
      }

      const commitTime = Timestamp.fromMillis(
        originalTime.toMillis() + (commits + 1) * 1000,
      );

      for (const write of writes) {
        const saved = write.type === "update"
          ? { ...records.get(write.ref.key), ...write.data }
          : { ...write.data };

        for (const field of ["updatedAt", "changedAt"]) {
          if (Object.hasOwn(write.data, field)) {
            saved[field] = commitTime;
          }
        }

        records.set(write.ref.key, saved);
      }

      commits += 1;
      version += 1;
      return result;
    }

    throw new Error("Simulated transaction retry limit");
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
  updateRescueStatusWithHistory,
} = require("../src/services/update-rescue-status.service");

const app = express();
app.set("env", "test");
app.use(express.json());
app.use("/api/rescue-requests", routes);

// Return JSON for body-parser failures in this test app.
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
    });
  }
  next(error);
});

function reset() {
  records.clear();
  version += 1;
  commits = 0;
  failCommit = false;
  failRead = false;
  beforeCommit = null;

  for (const [id, role, isActive] of [
    ["rescue-1", "rescue", true],
    ["rescue-2", "rescue", true],
    ["resident", "resident", true],
    ["admin", "admin", true],
    ["inactive", "rescue", false],
  ]) {
    records.set(`users/${id}`, { role, isActive });
  }

  records.set("rescue_requests/request-1", {
    residentId: "resident",
    location: { latitude: 16.0544, longitude: 108.2022 },
    urgency: "high",
    numberOfPeople: 1,
    note: "TEST ONLY",
    status: "received",
    createdAt: originalTime,
    updatedAt: originalTime,
  });

  records.set("rescue_assignments/request-1", {
    requestId: "request-1",
    rescueStaffId: "rescue-1",
    status: "accepted",
    note: "Original assignment note",
    assignedAt: originalTime,
    updatedAt: originalTime,
    auditField: "keep",
  });
}

function tokenFor(id, role = "rescue", expiresIn = "5m") {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn },
  );
}

function historyEntries() {
  return [...records.entries()]
    .filter(([key]) =>
      key.startsWith("rescue_request_status_history/"),
    )
    .map(([, data]) => data);
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

    async function patch(body, token, requestId = "request-1") {
      const headers = { "Content-Type": "application/json" };
      if (token !== undefined) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${baseUrl}/${encodeURIComponent(requestId)}/status`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
        },
      );

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    async function reject(body, token, status, requestId) {
      const before = [...records.entries()];
      const beforeCommits = commits;
      const result = await patch(body, token, requestId);

      assert.equal(result.status, status);
      assert.equal(result.body.success, false);
      assert.deepEqual([...records.entries()], before);
      assert.equal(commits, beforeCommits);
    }

    reset();
    const progress = { status: "in_progress" };
    const ownerToken = tokenFor("rescue-1");

    await reject(progress, undefined, 401);
    await reject(progress, "invalid-token", 401);
    await reject(progress, tokenFor("rescue-1", "rescue", "-1s"), 401);
    await reject(progress, tokenFor("missing"), 401);
    await reject(progress, tokenFor("inactive"), 403);
    await reject(progress, tokenFor("resident", "resident"), 403);
    await reject(progress, tokenFor("admin", "admin"), 403);
    await reject(progress, tokenFor("rescue-2"), 403);
    await reject(progress, ownerToken, 404, "missing-request");
    await reject(progress, ownerToken, 400, "invalid/id");

    // A JWT role cannot override the current Firestore role.
    records.get("users/rescue-1").role = "resident";
    await reject(progress, ownerToken, 403);
    reset();

    for (const body of [
      null,
      [],
      "invalid",
      {},
      { status: "received" },
      { status: "cancelled" },
      { status: "completed" },
      { status: 123 },
      { status: "in_progress", note: 123 },
      { status: "in_progress", rescueStaffId: "rescue-2" },
      { status: "in_progress", changedBy: "admin" },
      { status: "in_progress", updatedAt: "forged" },
    ]) {
      await reject(body, ownerToken, 400);
    }

    // Cannot skip the progress step.
    await reject({ status: "assisted" }, ownerToken, 409);

    records.delete("rescue_assignments/request-1");
    await reject(progress, ownerToken, 409);
    reset();

    records.get("rescue_assignments/request-1").requestId = "other";
    await reject(progress, ownerToken, 409);
    reset();

    records.get("rescue_assignments/request-1").status = "completed";
    await reject(progress, ownerToken, 409);
    reset();

    for (const status of ["submitted", "assisted", "cancelled"]) {
      records.get("rescue_requests/request-1").status = status;
      await reject(progress, ownerToken, 409);
      reset();
    }

    // Successful progress update.
    const first = await patch(
      { status: "in_progress", note: "  Team is on the way  " },
      ownerToken,
    );

    assert.equal(first.status, 200);
    assert.equal(first.body.success, true);
    assert.equal(first.body.data.rescueRequest.status, "in_progress");
    assert.equal(first.body.data.assignment.status, "in_progress");
    assert.equal(
      first.body.data.assignment.assignedAt,
      originalTime.toDate().toISOString(),
    );

    const savedAssignment = records.get(
      "rescue_assignments/request-1",
    );

    assert.equal(savedAssignment.rescueStaffId, "rescue-1");
    assert.equal(savedAssignment.auditField, "keep");
    assert.equal(savedAssignment.note, "Original assignment note");
    assert.equal(savedAssignment.assignedAt, originalTime);
    assert.equal(
      records.get("rescue_requests/request-1").note,
      "TEST ONLY",
    );

    let entries = historyEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].requestId, "request-1");
    assert.equal(entries[0].oldStatus, "received");
    assert.equal(entries[0].newStatus, "in_progress");
    assert.equal(entries[0].changedBy, "rescue-1");
    assert.equal(entries[0].note, "Team is on the way");
    assert.equal(
      entries[0].changedAt.toMillis(),
      savedAssignment.updatedAt.toMillis(),
    );

    await reject(progress, ownerToken, 409);

    // Successful completion.
    const second = await patch(
      { status: "assisted", note: "   " },
      ownerToken,
    );

    assert.equal(second.status, 200);
    assert.equal(second.body.data.rescueRequest.status, "assisted");
    assert.equal(second.body.data.assignment.status, "completed");

    entries = historyEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries[1].oldStatus, "in_progress");
    assert.equal(entries[1].newStatus, "assisted");
    assert.equal(entries[1].note, null);

    await reject({ status: "assisted" }, ownerToken, 409);
    await reject(progress, ownerToken, 409);

    // Read/commit failures must not partially save changes.
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      reset();
      failRead = true;
      await reject(progress, ownerToken, 500);
      failRead = false;

      failCommit = true;
      await reject(progress, ownerToken, 500);
    } finally {
      failRead = false;
      failCommit = false;
      console.error = originalConsoleError;
    }

    // Two competing identical updates: only one history entry.
    reset();
    const results = await Promise.allSettled([
      updateRescueStatusWithHistory("request-1", "rescue-1", progress),
      updateRescueStatusWithHistory("request-1", "rescue-1", progress),
    ]);

    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const rejected = results.find(
      (result) => result.status === "rejected",
    );
    assert.equal(rejected.reason.code, "STATUS_TRANSITION_CONFLICT");
    assert.equal(commits, 1);
    assert.equal(historyEntries().length, 1);

    // A concurrent reassignment triggers a retry and access rejection.
    reset();
    beforeCommit = () => {
      records.set("rescue_assignments/request-1", {
        ...records.get("rescue_assignments/request-1"),
        rescueStaffId: "rescue-2",
      });
      version += 1;
    };

    await assert.rejects(
      () => updateRescueStatusWithHistory(
        "request-1",
        "rescue-1",
        progress,
      ),
      (error) => error.code === "STATUS_STAFF_FORBIDDEN",
    );

    assert.equal(commits, 0);
    assert.equal(historyEntries().length, 0);
    assert.equal(
      records.get("rescue_requests/request-1").status,
      "received",
    );

    console.log("Update rescue status API tests passed");
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
  console.error("Update rescue status API tests failed");
  console.error(error);
  process.exitCode = 1;
});