const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf98-local-test-secret-only";

const fixedTime = Timestamp.fromDate(
  new Date("2026-10-08T12:00:00.000Z"),
);

const records = new Map();
const versions = new Map();

let sequence = 0;
let failCommit = false;
let failAuditWrite = false;
let auditWriteCount = 0;
let retryCount = 0;
let lastWrites = [];

function save(key, data) {
  records.set(key, { ...data });
  versions.set(key, (versions.get(key) || 0) + 1);
}

function snapshot(ref) {
  const data = records.get(ref.key);

  return {
    id: ref.id,
    exists: data !== undefined,
    data: () =>
      data === undefined ? undefined : { ...data },
  };
}

function resolveTimestamps(data) {
  const saved = { ...data };

  for (const field of [
    "assignedAt",
    "updatedAt",
    "changedAt",
    "timestamp",
  ]) {
    if (Object.hasOwn(saved, field)) {
      saved[field] = fixedTime;
    }
  }

  return saved;
}

const db = {
  collection(collectionName) {
    return {
      doc(id = `test-${++sequence}`) {
        const ref = {
          id,
          key: `${collectionName}/${id}`,
          collectionName,
        };

        ref.get = async () => snapshot(ref);

        ref.create = async (data) => {
          assert.equal(collectionName, "audit_logs");
          auditWriteCount++;

          // Audit must run after acceptance commits.
          assert.equal(
            records.get(
              `rescue_requests/${data.target.id}`,
            )?.status,
            "received",
          );

          assert.equal(
            records.has(
              `rescue_assignments/${data.target.id}`,
            ),
            true,
          );

          if (failAuditWrite) {
            throw new Error(
              "Simulated audit write failure",
            );
          }

          assert.equal(records.has(ref.key), false);
          save(ref.key, resolveTimestamps(data));
        };

        return ref;
      },
    };
  },

  async runTransaction(callback) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const reads = new Map();
      const writes = [];
      let writesStarted = false;

      const transaction = {
        async get(ref) {
          assert.equal(
            writesStarted,
            false,
            "Transaction must read before writing",
          );

          reads.set(
            ref.key,
            versions.get(ref.key) || 0,
          );

          return snapshot(ref);
        },

        create(ref, data) {
          writesStarted = true;
          writes.push({ type: "create", ref, data });
          return this;
        },

        update(ref, data) {
          writesStarted = true;
          writes.push({ type: "update", ref, data });
          return this;
        },
      };

      const result = await callback(transaction);

      const conflict = [...reads.entries()].some(
        ([key, version]) =>
          (versions.get(key) || 0) !== version,
      );

      if (conflict) {
        retryCount++;
        continue;
      }

      if (failCommit) {
        throw new Error(
          "Simulated transaction failure",
        );
      }

      // Validate all writes before applying any changes.
      for (const { type, ref } of writes) {
        if (type === "create") {
          assert.equal(records.has(ref.key), false);
        } else {
          assert.equal(records.has(ref.key), true);
        }
      }

      // Commit staged writes together without awaits.
      for (const { type, ref, data } of writes) {
        const saved = resolveTimestamps(data);

        save(
          ref.key,
          type === "update"
            ? { ...records.get(ref.key), ...saved }
            : saved,
        );
      }

      lastWrites = writes;
      return result;
    }

    throw new Error(
      "Simulated transaction retry limit",
    );
  },
};

// Replace Firebase before loading application modules.
const firebasePath = require.resolve(
  "../src/config/firebase",
);

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const routes = require(
  "../src/routes/rescue-request.routes",
);

const {
  acceptRescueRequestWithHistory,
} = require(
  "../src/services/accept-rescue-request.service",
);

const app = express();
app.set("env", "test");
app.use(express.json());
app.use("/api/rescue-requests", routes);

// Keep expected JSON parsing errors quiet during tests.
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
    });
  }

  return next(error);
});

function reset() {
  records.clear();
  versions.clear();
  failCommit = false;
  failAuditWrite = false;
  auditWriteCount = 0;
  retryCount = 0;
  lastWrites = [];

  for (const [id, role, isActive] of [
    ["rescue-1", "rescue", true],
    ["rescue-2", "rescue", true],
    ["resident", "resident", true],
    ["admin", "admin", true],
    ["inactive", "rescue", false],
  ]) {
    save(`users/${id}`, { role, isActive });
  }

  save("rescue_requests/request-1", {
    residentId: "resident",
    location: {
      latitude: 16.0544,
      longitude: 108.2022,
    },
    urgency: "high",
    numberOfPeople: 3,
    note: "CCF98 simulated SOS",
    status: "submitted",
    createdAt: fixedTime,
    updatedAt: fixedTime,
  });
}

function tokenFor(
  id,
  role = "rescue",
  expiresIn = "5m",
) {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn },
  );
}

function historyFor(requestId) {
  return [...records.entries()]
    .filter(
      ([key, data]) =>
        key.startsWith(
          "rescue_request_status_history/",
        ) &&
        data.requestId === requestId,
    )
    .map(([, data]) => data);
}

function auditFor(requestId) {
  return [...records.entries()]
    .filter(
      ([key, data]) =>
        key.startsWith("audit_logs/") &&
        data.target.type === "rescue_request" &&
        data.target.id === requestId,
    )
    .map(([, data]) => data);
}

function assertAcceptanceAudit(actorId) {
  const audit = auditFor("request-1");

  assert.equal(audit.length, 1);
  assert.equal(auditWriteCount, 1);

  assert.deepEqual(audit[0].actor, {
    id: actorId,
    role: "rescue",
  });

  assert.equal(
    audit[0].action,
    "rescue_request.accept",
  );

  assert.deepEqual(audit[0].target, {
    type: "rescue_request",
    id: "request-1",
  });

  assert.deepEqual(audit[0].metadata, {
    source: "api",
    outcome: "success",
    changedFields: ["status"],
  });

  assert.equal(
    audit[0].timestamp.toMillis(),
    fixedTime.toMillis(),
  );

  assert.deepEqual(
    Object.keys(audit[0]).sort(),
    [
      "actor",
      "action",
      "target",
      "metadata",
      "timestamp",
    ].sort(),
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

    async function post(
      token,
      body = {},
      requestId = "request-1",
    ) {
      const headers = {
        "Content-Type": "application/json",
      };

      if (token !== undefined) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${baseUrl}/${requestId}/accept`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        },
      );

      const responseText = await response.text();
      const contentType =
        response.headers.get("content-type") || "";

      return {
        status: response.status,
        body: contentType.includes("application/json")
          ? JSON.parse(responseText)
          : responseText,
      };
    }

    async function expectRejected(
      token,
      expectedStatus,
      body = {},
      requestId = "request-1",
    ) {
      const before = [...records.entries()];
      const auditWritesBefore = auditWriteCount;

      const result = await post(
        token,
        body,
        requestId,
      );

      assert.equal(result.status, expectedStatus);

      if (typeof result.body === "string") {
        assert.equal(result.status, 400);
      } else {
        assert.equal(result.body.success, false);
      }

      assert.deepEqual(
        [...records.entries()],
        before,
      );

      assert.equal(
        auditWriteCount,
        auditWritesBefore,
        "Rejected acceptance must not attempt an audit write",
      );
    }

    reset();

    // JWT authentication and role middleware.
    await expectRejected(undefined, 401);
    await expectRejected("invalid-token", 401);

    await expectRejected(
      tokenFor("rescue-1", "rescue", -1),
      401,
    );

    await expectRejected(
      tokenFor("resident", "resident"),
      403,
    );

    await expectRejected(
      tokenFor("admin", "admin"),
      403,
    );

    // Check database role, not only the JWT role.
    await expectRejected(
      tokenFor("resident"),
      403,
    );

    await expectRejected(tokenFor("admin"), 403);
    await expectRejected(tokenFor("inactive"), 403);
    await expectRejected(
      tokenFor("deleted-user"),
      401,
    );

    // Client cannot choose staff ID or status.
    for (const body of [
      { rescueStaffId: "rescue-2" },
      { status: "received" },
      { note: "Client-controlled note" },
      [],
      "invalid-body",
    ]) {
      await expectRejected(
        tokenFor("rescue-1"),
        400,
        body,
      );
    }

    await expectRejected(
      tokenFor("rescue-1"),
      404,
      {},
      "missing-request",
    );

    const writesBeforeInvalidId = auditWriteCount;

    await assert.rejects(
      () =>
        acceptRescueRequestWithHistory(
          "bad/request",
          "rescue-1",
        ),
      (error) =>
        error.code === "INVALID_ACCEPT_REQUEST_ID",
    );

    assert.equal(
      auditWriteCount,
      writesBeforeInvalidId,
    );

    // Successful acceptance.
    const success = await post(
      tokenFor("rescue-1"),
    );

    assert.equal(success.status, 200);
    assert.equal(success.body.success, true);

    const {
      rescueRequest,
      assignment,
    } = success.body.data;

    assert.equal(rescueRequest.id, "request-1");
    assert.equal(rescueRequest.status, "received");
    assert.equal(rescueRequest.residentId, "resident");
    assert.equal(rescueRequest.urgency, "high");
    assert.equal(rescueRequest.numberOfPeople, 3);

    assert.deepEqual(rescueRequest.location, {
      latitude: 16.0544,
      longitude: 108.2022,
    });

    assert.equal(assignment.id, "request-1");
    assert.equal(assignment.requestId, "request-1");
    assert.equal(
      assignment.rescueStaffId,
      "rescue-1",
    );
    assert.equal(assignment.status, "accepted");
    assert.equal(assignment.note, null);

    assert.equal(
      assignment.assignedAt,
      fixedTime.toDate().toISOString(),
    );

    assert.equal(
      assignment.updatedAt,
      assignment.assignedAt,
    );

    // Audit is separate from the three atomic SOS writes.
    assert.equal(lastWrites.length, 3);

    assert.deepEqual(
      lastWrites
        .map((write) => write.ref.collectionName)
        .sort(),
      [
        "rescue_assignments",
        "rescue_request_status_history",
        "rescue_requests",
      ],
    );

    const history = historyFor("request-1");

    assert.equal(history.length, 1);
    assert.equal(history[0].oldStatus, "submitted");
    assert.equal(history[0].newStatus, "received");
    assert.equal(history[0].changedBy, "rescue-1");

    assert.equal(
      history[0].changedAt.toMillis(),
      fixedTime.toMillis(),
    );

    assertAcceptanceAudit("rescue-1");

    // Repeated acceptance adds no history or audit.
    await expectRejected(
      tokenFor("rescue-1"),
      409,
    );

    await expectRejected(
      tokenFor("rescue-2"),
      409,
    );

    assert.equal(historyFor("request-1").length, 1);
    assertAcceptanceAudit("rescue-1");

    // Requests outside submitted are unavailable.
    for (const status of [
      "received",
      "in_progress",
      "assisted",
      "cancelled",
    ]) {
      reset();

      save("rescue_requests/request-1", {
        ...records.get("rescue_requests/request-1"),
        status,
      });

      await expectRejected(
        tokenFor("rescue-1"),
        409,
      );
    }

    // A submitted request cannot replace an assignment.
    reset();

    save("rescue_assignments/request-1", {
      requestId: "request-1",
      rescueStaffId: "rescue-2",
      status: "assigned",
      note: null,
      assignedAt: fixedTime,
      updatedAt: fixedTime,
    });

    await expectRejected(
      tokenFor("rescue-1"),
      409,
    );

    // Transaction failure leaves no changes or audit.
    reset();
    failCommit = true;

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      await expectRejected(
        tokenFor("rescue-1"),
        500,
      );
    } finally {
      console.error = originalConsoleError;
      failCommit = false;
    }

    assert.equal(auditWriteCount, 0);
    assert.equal(auditFor("request-1").length, 0);

    // Simulate competing transactions and a retry.
    reset();

    const results = await Promise.allSettled([
      acceptRescueRequestWithHistory(
        "request-1",
        "rescue-1",
      ),
      acceptRescueRequestWithHistory(
        "request-1",
        "rescue-2",
      ),
    ]);

    const fulfilled = results.filter(
      (result) => result.status === "fulfilled",
    );

    const rejected = results.filter(
      (result) => result.status === "rejected",
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    assert.equal(
      rejected[0].reason.code,
      "ACCEPT_REQUEST_UNAVAILABLE",
    );

    assert.ok(retryCount > 0);

    const storedAssignment =
      records.get("rescue_assignments/request-1");

    assert.equal(
      storedAssignment.rescueStaffId,
      fulfilled[0].value.assignment.rescueStaffId,
    );

    assert.equal(
      records.get("rescue_requests/request-1").status,
      "received",
    );

    assert.equal(historyFor("request-1").length, 1);

    assert.equal(
      historyFor("request-1")[0].changedBy,
      storedAssignment.rescueStaffId,
    );

    // Only the winner creates one audit record.
    assertAcceptanceAudit(
      storedAssignment.rescueStaffId,
    );

    // Logging failure must not change a successful
    // acceptance into an HTTP error.
    reset();
    failAuditWrite = true;

    const originalWarn = console.warn;
    const auditWarnings = [];
    let acceptedWithoutAudit;

    console.warn = (...args) => {
      auditWarnings.push(args);
    };

    try {
      acceptedWithoutAudit = await post(
        tokenFor("rescue-1"),
      );
    } finally {
      console.warn = originalWarn;
      failAuditWrite = false;
    }

    assert.equal(acceptedWithoutAudit.status, 200);
    assert.equal(
      acceptedWithoutAudit.body.success,
      true,
    );

    assert.equal(
      acceptedWithoutAudit.body.data.rescueRequest.status,
      "received",
    );

    assert.equal(
      acceptedWithoutAudit.body.data.assignment.status,
      "accepted",
    );

    assert.equal(
      records.get("rescue_requests/request-1").status,
      "received",
    );

    assert.equal(
      records.get("rescue_assignments/request-1").rescueStaffId,
      "rescue-1",
    );

    assert.equal(historyFor("request-1").length, 1);
    assert.equal(auditFor("request-1").length, 0);
    assert.equal(auditWriteCount, 1);

    assert.deepEqual(auditWarnings, [
      ["[Audit] AUDIT_WRITE_FAILED"],
    ]);

    // The committed acceptance still blocks another attempt.
    await expectRejected(
      tokenFor("rescue-2"),
      409,
    );

    console.log(
      "Accept rescue request API tests passed",
    );
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
  console.error(
    "Accept rescue request API tests failed",
  );
  console.error(error);
  process.exitCode = 1;
});