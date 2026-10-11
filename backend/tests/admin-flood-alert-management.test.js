const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const {
  Timestamp,
  FieldValue,
} = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf114-local-test-secret-only";

const originalTime = Timestamp.fromDate(
  new Date("2026-10-11T10:00:00.000Z"),
);

const fixedTime = Timestamp.fromDate(
  new Date("2026-10-11T11:00:00.000Z"),
);

const records = new Map();
const auditEvents = [];

let sequence = 0;
let failCommit = false;
let failAudit = false;

function snapshot(ref) {
  const data = records.get(ref.key);

  return {
    id: ref.id,
    exists: data !== undefined,
    data: () => (
      data === undefined ? undefined : { ...data }
    ),
  };
}

function resolveTimestamps(data) {
  const saved = { ...data };
  const sentinel = FieldValue.serverTimestamp();

  for (const [field, value] of Object.entries(saved)) {
    if (
      value &&
      typeof value.isEqual === "function" &&
      !(value instanceof Timestamp) &&
      value.isEqual(sentinel)
    ) {
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
        };

        ref.get = async () => snapshot(ref);
        return ref;
      },

      async get() {
        const prefix = `${collectionName}/`;

        return {
          docs: [...records.keys()]
            .filter((key) => key.startsWith(prefix))
            .map((key) => snapshot({
              key,
              id: key.slice(prefix.length),
            })),
        };
      },
    };
  },

  async runTransaction(callback) {
    const writes = [];
    let writesStarted = false;

    const transaction = {
      async get(ref) {
        assert.equal(
          writesStarted,
          false,
          "All transaction reads must precede writes",
        );

        return snapshot(ref);
      },

      create(ref, data) {
        writesStarted = true;
        writes.push({ type: "create", ref, data });
      },

      update(ref, data) {
        writesStarted = true;
        writes.push({ type: "update", ref, data });
      },
    };

    const result = await callback(transaction);

    if (failCommit) {
      throw new Error("Simulated commit failure");
    }

    // Validate all writes before applying any changes.
    for (const { type, ref } of writes) {
      assert.equal(
        records.has(ref.key),
        type === "update",
      );
    }

    for (const { type, ref, data } of writes) {
      const saved = resolveTimestamps(data);

      records.set(
        ref.key,
        type === "update"
          ? { ...records.get(ref.key), ...saved }
          : saved,
      );
    }

    return result;
  },
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

const {
  normalizeAuditLogData,
} = require("../src/services/audit-log.service");

const auditPath = require.resolve(
  "../src/services/audit-logging.service",
);

require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: {
    async logAuditEvent(data) {
      // Validate against the real audit schema.
      const normalized = normalizeAuditLogData(data);

      const saved = records.get(
        `flood_alerts/${normalized.target.id}`,
      );

      assert.ok(saved, "Audit must run after commit");
      assert.equal(
        saved.updatedAt.toMillis(),
        fixedTime.toMillis(),
      );

      if (failAudit) {
        return {
          success: false,
          code: "AUDIT_WRITE_FAILED",
        };
      }

      auditEvents.push(normalized);

      return {
        success: true,
        id: `audit-${auditEvents.length}`,
      };
    },
  },
};

const routes = require(
  "../src/routes/admin-flood-alert.routes",
);

const app = express();
app.set("env", "test");
app.use(express.json());
app.use("/api/admin/flood-alerts", routes);

// Normalize malformed JSON errors for test assertions.
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON",
    });
  }

  return next(error);
});

function reset() {
  records.clear();
  auditEvents.length = 0;
  failCommit = false;
  failAudit = false;

  for (const [id, role, isActive] of [
    ["admin", "admin", true],
    ["resident", "resident", true],
    ["rescue", "rescue", true],
    ["inactive", "admin", false],
  ]) {
    records.set(`users/${id}`, { role, isActive });
  }

  records.set("flood_areas/area-1", {
    name: "TEST ONLY area",
    status: "inactive",
  });

  records.set("flood_areas/area-2", {
    name: "TEST ONLY other area",
    status: "active",
  });

  records.set("flood_alerts/alert-1", {
    title: "TEST ONLY warning",
    content: "Simulated warning",
    severity: "low",
    status: "inactive",
    areaId: "area-1",
    startAt: Timestamp.fromDate(
      new Date("2026-10-12T08:00:00.000Z"),
    ),
    endAt: Timestamp.fromDate(
      new Date("2026-10-12T10:00:00.000Z"),
    ),
    createdAt: originalTime,
    updatedAt: originalTime,
    internalField: "preserve-me",
  });
}

function tokenFor(id, role = "admin", expiresIn = "5m") {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn },
  );
}

function validBody() {
  return {
    title: " TEST ONLY new warning ",
    content: " Simulated warning content ",
    severity: "low",
    status: "inactive",
    areaId: "area-1",
    startAt: "2026-10-12T08:00:00Z",
    endAt: "2026-10-12T10:00:00.000Z",
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
      "/api/admin/flood-alerts";

    async function request(
      method,
      path = "",
      body,
      token = tokenFor("admin"),
    ) {
      const headers = {};

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined
          ? undefined
          : JSON.stringify(body),
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    async function expectRejected(
      method,
      path,
      body,
      expectedStatus,
      token = tokenFor("admin"),
    ) {
      const beforeRecords = [...records.entries()];
      const beforeAudit = [...auditEvents];

      const result = await request(
        method,
        path,
        body,
        token,
      );

      assert.equal(
        result.status,
        expectedStatus,
        JSON.stringify(result.body),
      );
      assert.equal(result.body.success, false);
      assert.deepEqual([...records.entries()], beforeRecords);
      assert.deepEqual(auditEvents, beforeAudit);
    }

    reset();

    // Authentication and authorization on all endpoints.
    for (const [method, path, body] of [
      ["GET", "", undefined],
      ["GET", "/alert-1", undefined],
      ["POST", "", validBody()],
      ["PATCH", "/alert-1", { status: "active" }],
    ]) {
      await expectRejected(method, path, body, 401, null);
      await expectRejected(
        method, path, body, 401, "invalid-token",
      );
      await expectRejected(
        method, path, body, 401,
        tokenFor("admin", "admin", -1),
      );
      await expectRejected(
        method, path, body, 403,
        tokenFor("resident", "resident"),
      );
      await expectRejected(
        method, path, body, 403,
        tokenFor("rescue", "rescue"),
      );

      // A JWT claiming admin cannot override database role.
      await expectRejected(
        method, path, body, 403, tokenFor("resident"),
      );
      await expectRejected(
        method, path, body, 403, tokenFor("inactive"),
      );
      await expectRejected(
        method, path, body, 401, tokenFor("deleted"),
      );
    }

    // List/detail return explicit client fields.
    const list = await request("GET");
    assert.equal(list.status, 200);
    assert.equal(list.body.data.floodAlerts.length, 1);

    const detail = await request("GET", "/alert-1");
    assert.equal(detail.status, 200);

    const alert = detail.body.data.floodAlert;
    assert.equal(alert.id, "alert-1");
    assert.equal(
      alert.startAt,
      "2026-10-12T08:00:00.000Z",
    );
    assert.equal(
      alert.createdAt,
      originalTime.toDate().toISOString(),
    );
    assert.equal(Object.hasOwn(alert, "internalField"), false);
    assert.equal(auditEvents.length, 0);

    await expectRejected(
      "GET", "?status=active", undefined, 400,
    );
    await expectRejected(
      "GET", "/missing", undefined, 404,
    );
    await expectRejected(
      "GET", "/bad%2Fid", undefined, 400,
    );
    await expectRejected(
      "PATCH", "/missing", { status: "active" }, 404,
    );
    await expectRejected(
      "PATCH", "/bad%2Fid", { status: "active" }, 400,
    );

    // Invalid request shapes and unsupported fields.
    for (const body of [
      {},
      [],
      null,
      "invalid",
      { ...validBody(), actor: { id: "admin" } },
      { ...validBody(), createdAt: "client-time" },
      { ...validBody(), title: " " },
      { ...validBody(), content: 123 },
      { ...validBody(), severity: "unknown" },
      { ...validBody(), status: "submitted" },
      { ...validBody(), areaId: "bad/id" },
    ]) {
      await expectRejected("POST", "", body, 400);
    }

    // Every create field is required.
    for (const field of Object.keys(validBody())) {
      const body = validBody();
      delete body[field];
      await expectRejected("POST", "", body, 400);
    }

    // Strict client timestamps, including calendar validity.
    for (const value of [
      null,
      123,
      "not-a-date",
      "2026-10-12",
      "2026-10-12T08:00:00",
      "2026-02-30T08:00:00Z",
      "2026-10-12T24:00:00Z",
      "2026-13-12T08:00:00Z",
    ]) {
      for (const field of ["startAt", "endAt"]) {
        await expectRejected(
          "POST", "", { ...validBody(), [field]: value }, 400,
        );
        await expectRejected(
          "PATCH", "/alert-1", { [field]: value }, 400,
        );
      }
    }

    await expectRejected(
      "POST",
      "",
      { ...validBody(), endAt: validBody().startAt },
      400,
    );

    // Partial updates must validate the resulting interval.
    await expectRejected(
      "PATCH",
      "/alert-1",
      { startAt: "2026-10-12T11:00:00Z" },
      400,
    );
    await expectRejected(
      "PATCH",
      "/alert-1",
      { endAt: "2026-10-12T07:00:00Z" },
      400,
    );

    for (const body of [
      {},
      [],
      null,
      { severity: "unknown" },
      { status: "unknown" },
      { title: "" },
      { content: null },
      { updatedAt: "client-time" },
    ]) {
      await expectRejected("PATCH", "/alert-1", body, 400);
    }

    await expectRejected(
      "POST",
      "",
      { ...validBody(), areaId: "missing-area" },
      404,
    );
    await expectRejected(
      "PATCH",
      "/alert-1",
      { areaId: "missing-area" },
      404,
    );

    // Create against an existing inactive area is supported.
    const created = await request("POST", "", validBody());
    assert.equal(created.status, 201);
    assert.equal(created.body.success, true);

    const createdAlert = created.body.data.floodAlert;
    assert.equal(createdAlert.title, "TEST ONLY new warning");
    assert.equal(createdAlert.content, "Simulated warning content");
    assert.equal(createdAlert.areaId, "area-1");
    assert.equal(
      createdAlert.createdAt,
      fixedTime.toDate().toISOString(),
    );
    assert.equal(createdAlert.updatedAt, createdAlert.createdAt);
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, "flood_alert.create");
    assert.deepEqual(auditEvents[0].actor, {
      id: "admin",
      role: "admin",
    });
    assert.deepEqual(auditEvents[0].target, {
      type: "flood_alert",
      id: createdAlert.id,
    });
    assert.deepEqual(
      [...auditEvents[0].metadata.changedFields].sort(),
      [
        "title", "content", "severity", "status",
        "areaId", "startAt", "endAt",
      ].sort(),
    );

    // Partial update preserves original and unrelated fields.
    reset();

    const updated = await request("PATCH", "/alert-1", {
      severity: "medium",
      status: "active",
      areaId: "area-2",
    });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.floodAlert.severity, "medium");
    assert.equal(updated.body.data.floodAlert.status, "active");
    assert.equal(updated.body.data.floodAlert.areaId, "area-2");
    assert.equal(
      updated.body.data.floodAlert.createdAt,
      originalTime.toDate().toISOString(),
    );
    assert.equal(
      records.get("flood_alerts/alert-1").internalField,
      "preserve-me",
    );
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, "flood_alert.update");
    assert.deepEqual(
      [...auditEvents[0].metadata.changedFields].sort(),
      ["severity", "status", "areaId"].sort(),
    );

    // No-op timestamp values normalize to the same Timestamp.
    reset();
    const noOp = await request("PATCH", "/alert-1", {
      title: " TEST ONLY warning ",
      startAt: "2026-10-12T08:00:00Z",
    });

    assert.equal(noOp.status, 200);
    assert.equal(auditEvents.length, 0);
    assert.equal(
      records.get("flood_alerts/alert-1").updatedAt.toMillis(),
      originalTime.toMillis(),
    );

    // Updating both ends can move the complete interval.
    const moved = await request("PATCH", "/alert-1", {
      startAt: "2026-10-13T08:00:00Z",
      endAt: "2026-10-13T10:00:00Z",
    });

    assert.equal(moved.status, 200);
    assert.deepEqual(
      [...auditEvents[0].metadata.changedFields].sort(),
      ["startAt", "endAt"].sort(),
    );

    // Deactivation uses the same PATCH endpoint.
    reset();
    records.get("flood_alerts/alert-1").status = "active";

    const deactivated = await request("PATCH", "/alert-1", {
      status: "inactive",
    });

    assert.equal(deactivated.status, 200);
    assert.equal(
      deactivated.body.data.floodAlert.status,
      "inactive",
    );
    assert.deepEqual(
      auditEvents[0].metadata.changedFields,
      ["status"],
    );

    // Failed commits leave records and audit unchanged.
    reset();
    failCommit = true;

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      await expectRejected("POST", "", validBody(), 500);
      await expectRejected(
        "PATCH", "/alert-1", { severity: "high" }, 500,
      );
    } finally {
      console.error = originalConsoleError;
      failCommit = false;
    }

    // Best-effort audit failure does not undo the update.
    reset();
    failAudit = true;

    const auditFailure = await request("PATCH", "/alert-1", {
      severity: "high",
    });

    assert.equal(auditFailure.status, 200);
    assert.equal(
      records.get("flood_alerts/alert-1").severity,
      "high",
    );
    assert.equal(auditEvents.length, 0);

    // Empty list is a successful response.
    reset();
    records.delete("flood_alerts/alert-1");

    const emptyList = await request("GET");
    assert.equal(emptyList.status, 200);
    assert.deepEqual(emptyList.body.data.floodAlerts, []);

    console.log("Admin flood warning management API tests passed");
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
  console.error("Admin flood warning management API tests failed");
  console.error(error);
  process.exitCode = 1;
});