const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf116-local-test-secret-only";

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
      Object.entries(value).map(([key, item]) => [
        key,
        copy(item),
      ]),
    );
  }

  return value;
}

function forbidWrite() {
  writeAttempts++;
  throw new Error("Monitoring must not write data");
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

          return query(
            [...conditions, [field, value]],
            maximum,
          );
        },

        limit(value) {
          return query(conditions, value);
        },

        async get() {
          checkRead(collectionName);

          let docs = [...records.entries()]
            .filter(([key, data]) =>
              key.startsWith(`${collectionName}/`) &&
              conditions.every(
                ([field, value]) => data[field] === value,
              ),
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
  "../src/routes/admin-sos-monitoring.routes",
);

const {
  listSosRequestsForAdmin,
  getSosRequestDetailForAdmin,
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
      note: "TEST ONLY - CCF116 simulated SOS",
      createdAt,
      updatedAt: newerTime,
      internalField: "must-not-be-returned",
    });
  }

  records.set("rescue_assignments/request-high", {
    requestId: "request-high",
    rescueStaffId: "rescue-1",
    status: "accepted",
    note: null,
    assignedAt: newerTime,
    updatedAt: newerTime,
    internalField: "must-not-be-returned",
  });

  // Insert history in reverse chronological order.
  records.set("rescue_request_status_history/history-2", {
    requestId: "request-high",
    oldStatus: "submitted",
    newStatus: "received",
    changedBy: "rescue-1",
    note: "Accepted",
    changedAt: newerTime,
    internalField: "must-not-be-returned",
  });

  records.set("rescue_request_status_history/history-1", {
    requestId: "request-high",
    oldStatus: null,
    newStatus: "submitted",
    changedBy: "resident-2",
    note: null,
    changedAt: olderTime,
  });

  // Unrelated history must not appear in request-high.
  records.set("rescue_request_status_history/history-other", {
    requestId: "request-low",
    oldStatus: null,
    newStatus: "submitted",
    changedBy: "resident-1",
    note: null,
    changedAt: olderTime,
  });

  records.set("audit_logs/existing-log", {
    action: "existing.audit",
  });
}

function tokenFor(id, role = "admin", expiresIn = "5m") {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn,
    },
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
      "/api/admin/rescue-requests";

    async function request(
      path = "",
      token = tokenFor("admin"),
      method = "GET",
      body,
    ) {
      const before = copy([...records.entries()]);
      const writesBefore = writeAttempts;

      const headers = {};

      if (token !== null) {
        headers.Authorization = `Bearer ${token}`;
      }

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body) }),
      });

      const responseText = await response.text();
      const contentType =
        response.headers.get("content-type") || "";

      assert.deepEqual(
        [...records.entries()],
        before,
        "Monitoring requests must preserve all records",
      );
      assert.equal(
        writeAttempts,
        writesBefore,
        "Monitoring must not attempt any write",
      );

      return {
        status: response.status,
        body: contentType.includes("application/json")
          ? JSON.parse(responseText)
          : responseText,
      };
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

    // Missing, invalid and expired token.
    for (const path of ["", "/request-high"]) {
      await expectRejected(path, 401, null);
      await expectRejected(path, 401, "invalid-token");
      await expectRejected(
        path,
        401,
        tokenFor("admin", "admin", -1),
      );
    }

    // Check both middleware role and current Firestore role.
    for (const [id, role, expectedStatus] of [
      ["resident-1", "resident", 403],
      ["rescue-1", "rescue", 403],
      ["inactive", "admin", 403],
      ["deleted", "admin", 401],
      ["demoted", "admin", 403],
    ]) {
      for (const path of ["", "/request-high"]) {
        readCollections.length = 0;

        await expectRejected(
          path,
          expectedStatus,
          tokenFor(id, role),
        );

        assert.ok(
          readCollections.every(
            (collection) => collection === "users",
          ),
          "Unauthorized users must not trigger SOS reads",
        );
      }
    }

    // All residents' SOS and all statuses are visible to Admin.
    const list = await request();

    assert.equal(list.status, 200);
    assert.equal(list.body.success, true);

    const requests = list.body.data.rescueRequests;

    assert.equal(requests.length, 5);
    assert.equal(requests[0].id, "request-high");
    assert.ok(
      requests.some(
        (item) => item.residentId === "resident-2",
      ),
    );
    assert.ok(
      requests.some(
        (item) => item.status === "cancelled",
      ),
    );

    for (const item of requests) {
      assert.equal(Object.hasOwn(item, "internalField"), false);
      assert.equal(Object.hasOwn(item, "assignment"), false);
      assert.equal(Object.hasOwn(item, "passwordHash"), false);
      assert.equal(
        item.updatedAt,
        newerTime.toDate().toISOString(),
      );
    }

    // Each supported status filter.
    for (const status of [
      "submitted",
      "received",
      "in_progress",
      "assisted",
      "cancelled",
    ]) {
      const filtered = await request(`?status=${status}`);

      assert.equal(filtered.status, 200);
      assert.equal(
        filtered.body.data.rescueRequests.length,
        1,
      );
      assert.equal(
        filtered.body.data.rescueRequests[0].status,
        status,
      );
    }

    // Urgency, severity alias and combined filters.
    const high = await request("?urgency=high");
    assert.equal(high.status, 200);
    assert.equal(
      high.body.data.rescueRequests[0].id,
      "request-high",
    );

    const alias = await request("?severity=critical");
    assert.equal(alias.status, 200);
    assert.equal(
      alias.body.data.rescueRequests[0].id,
      "request-critical",
    );

    const combined = await request(
      "?status=received&urgency=high&severity=high",
    );

    assert.equal(combined.status, 200);
    assert.equal(
      combined.body.data.rescueRequests.length,
      1,
    );

    const noMatches = await request(
      "?status=submitted&urgency=critical",
    );

    assert.equal(noMatches.status, 200);
    assert.deepEqual(
      noMatches.body.data.rescueRequests,
      [],
    );

    // Preserve priority and chronological sorting.
    const priority = await request("?sort=priority");
    assert.equal(priority.status, 200);
    assert.deepEqual(
      priority.body.data.rescueRequests.map(
        (item) => item.urgency,
      ),
      ["critical", "high", "medium", "low", "low"],
    );

    const oldest = await request("?sort=oldest");
    assert.equal(oldest.status, 200);
    assert.equal(
      oldest.body.data.rescueRequests.at(-1).id,
      "request-high",
    );

    const newest = await request("?sort=newest");
    assert.equal(newest.status, 200);
    assert.equal(
      newest.body.data.rescueRequests[0].id,
      "request-high",
    );

    // Invalid and unsupported query parameters.
    for (const query of [
      "?status=unknown",
      "?urgency=unknown",
      "?severity=unknown",
      "?sort=unknown",
      "?urgency=high&severity=low",
      "?status=received&status=submitted",
      "?urgency=high&urgency=low",
      "?sort=priority&sort=newest",
      "?residentId=resident-1",
      "?page=1",
      "?search=test",
    ]) {
      await expectRejected(query, 400);
    }

    // Detail includes the matching assignment and ordered history.
    const detail = await request("/request-high");

    assert.equal(detail.status, 200);
    assert.equal(detail.body.success, true);

    const sos = detail.body.data.rescueRequest;

    assert.equal(sos.id, "request-high");
    assert.equal(sos.residentId, "resident-2");
    assert.equal(sos.assignment.id, "request-high");
    assert.equal(sos.assignment.rescueStaffId, "rescue-1");
    assert.equal(sos.assignment.status, "accepted");
    assert.equal(
      sos.assignment.assignedAt,
      newerTime.toDate().toISOString(),
    );
    assert.equal(
      Object.hasOwn(sos.assignment, "internalField"),
      false,
    );

    assert.deepEqual(
      sos.statusHistory.map((item) => item.id),
      ["history-1", "history-2"],
    );
    assert.equal(sos.statusHistory[0].oldStatus, null);
    assert.equal(
      sos.statusHistory[1].newStatus,
      "received",
    );
    assert.equal(
      sos.statusHistory[0].changedAt,
      olderTime.toDate().toISOString(),
    );
    assert.equal(
      Object.hasOwn(sos.statusHistory[1], "internalField"),
      false,
    );

    // Missing assignment and history have explicit empty values.
    const unassigned = await request("/request-assisted");

    assert.equal(unassigned.status, 200);
    assert.equal(
      unassigned.body.data.rescueRequest.assignment,
      null,
    );
    assert.deepEqual(
      unassigned.body.data.rescueRequest.statusHistory,
      [],
    );

    // Missing SOS must not trigger reads of related collections.
    readCollections.length = 0;
    await expectRejected("/missing-request", 404);

    assert.equal(
      readCollections.includes("rescue_assignments"),
      false,
    );
    assert.equal(
      readCollections.includes("rescue_request_status_history"),
      false,
    );

    await expectRejected("/request-high?status=received", 400);
    await expectRejected("/bad%2Fid", 400);

    // Invalid IDs at the service boundary.
    for (const id of ["", "bad/id", ".", "..", "x".repeat(1501)]) {
      await assert.rejects(
        () => getSosRequestDetailForAdmin("admin", id),
        (error) =>
          error.code === "INVALID_ADMIN_SOS_REQUEST_ID",
      );
    }

    await assert.rejects(
      () => listSosRequestsForAdmin(""),
      (error) => error.code === "ADMIN_SOS_AUTH_REQUIRED",
    );

    // No write endpoints exist under the Admin monitoring route.
    for (const [method, path, body] of [
      ["POST", "", {}],
      ["POST", "/request-high/accept", {}],
      ["PATCH", "/request-high/status", { status: "in_progress" }],
      ["DELETE", "/request-high", undefined],
    ]) {
      const result = await request(
        path,
        tokenFor("admin"),
        method,
        body,
      );

      assert.equal(result.status, 404);
    }

    // Database failures return 500 without writes.
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      failReadCollection = "rescue_requests";
      await expectRejected("", 500);
      await expectRejected("/request-high", 500);

      failReadCollection = "rescue_assignments";
      await expectRejected("/request-high", 500);

      failReadCollection = "rescue_request_status_history";
      await expectRejected("/request-high", 500);
    } finally {
      failReadCollection = null;
      console.error = originalConsoleError;
    }

    // Empty collection remains a successful empty list.
    for (const key of [...records.keys()]) {
      if (key.startsWith("rescue_requests/")) {
        records.delete(key);
      }
    }

    const emptyList = await request();

    assert.equal(emptyList.status, 200);
    assert.deepEqual(
      emptyList.body.data.rescueRequests,
      [],
    );
    assert.equal(writeAttempts, 0);
    assert.deepEqual(
      records.get("audit_logs/existing-log"),
      { action: "existing.audit" },
    );

    console.log("Admin SOS monitoring API tests passed");
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
  console.error("Admin SOS monitoring API tests failed");
  console.error(error);
  process.exitCode = 1;
});