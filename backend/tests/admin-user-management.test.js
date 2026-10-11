const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Timestamp } = require("firebase-admin/firestore");

process.env.JWT_SECRET = "ccf112-local-test-secret-only";

const fixedTime = Timestamp.fromDate(
  new Date("2026-10-11T10:00:00.000Z"),
);

const records = new Map();
const auditEvents = [];

let failCommit = false;
let failAudit = false;

function documentSnapshot(ref) {
  const data = records.get(ref.key);

  return {
    id: ref.id,
    exists: data !== undefined,
    data: () => (
      data === undefined ? undefined : { ...data }
    ),
  };
}

function documentReference(collectionName, id) {
  const ref = {
    id,
    key: `${collectionName}/${id}`,
  };

  ref.get = async () => documentSnapshot(ref);

  return ref;
}

const db = {
  collection(collectionName) {
    return {
      doc(id) {
        return documentReference(collectionName, id);
      },

      async get() {
        const prefix = `${collectionName}/`;

        const docs = [...records.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => documentSnapshot(
            documentReference(
              collectionName,
              key.slice(prefix.length),
            ),
          ));

        return {
          docs,
          empty: docs.length === 0,
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
          "Transaction must read before writing",
        );

        return documentSnapshot(ref);
      },

      update(ref, data) {
        writesStarted = true;
        writes.push({ ref, data });
        return this;
      },
    };

    const result = await callback(transaction);

    if (failCommit) {
      throw new Error("Simulated transaction failure");
    }

    for (const { ref } of writes) {
      assert.ok(records.has(ref.key));
    }

    for (const { ref, data } of writes) {
      records.set(ref.key, {
        ...records.get(ref.key),
        ...data,
        updatedAt: fixedTime,
      });
    }

    return result;
  },
};

const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const auditPath = require.resolve(
  "../src/services/audit-logging.service",
);

require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: {
    async logAuditEvent(event) {
      const saved = records.get(
        `users/${event.target.id}`,
      );

      // Audit must run after the user update commits.
      assert.equal(saved.updatedAt, fixedTime);

      auditEvents.push(event);

      return failAudit
        ? { success: false, code: "AUDIT_WRITE_FAILED" }
        : { success: true, id: "test-audit" };
    },
  },
};

const routes = require("../src/routes/admin-user.routes");

const app = express();
app.use(express.json());
app.use("/api/admin/users", routes);

// Return predictable JSON for malformed request bodies.
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
  auditEvents.length = 0;
  failCommit = false;
  failAudit = false;

  for (const [id, role, isActive] of [
    ["admin-1", "admin", true],
    ["admin-2", "admin", true],
    ["resident-1", "resident", true],
    ["rescue-1", "rescue", true],
    ["inactive-admin", "admin", false],
  ]) {
    records.set(`users/${id}`, {
      fullName: `Test ${id}`,
      email: `${id}@floodguard.local`,
      phone: null,
      role,
      isActive,
      passwordHash: "PRIVATE-HASH-MUST-NOT-LEAK",
      internalField: "PRIVATE-INTERNAL-FIELD",
      createdAt: fixedTime,
      updatedAt: fixedTime,
    });
  }
}

function tokenFor(id, role = "admin", expiresIn = "5m") {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn },
  );
}

function assertPublicUser(user) {
  assert.deepEqual(Object.keys(user).sort(), [
    "createdAt",
    "email",
    "fullName",
    "id",
    "isActive",
    "phone",
    "role",
    "updatedAt",
  ].sort());

  assert.equal(
    user.createdAt,
    fixedTime.toDate().toISOString(),
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
      "/api/admin/users";

    async function request(
      method,
      path = "",
      token,
      body,
      rawBody,
    ) {
      const headers = {};

      if (token !== undefined) {
        headers.Authorization = `Bearer ${token}`;
      }

      if (body !== undefined || rawBody !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: rawBody !== undefined
          ? rawBody
          : body === undefined
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
      token,
      expectedStatus,
      body,
    ) {
      const before = [...records.entries()];
      const auditCount = auditEvents.length;

      const result = await request(
        method,
        path,
        token,
        body,
      );

      assert.equal(result.status, expectedStatus);
      assert.equal(result.body.success, false);
      assert.deepEqual([...records.entries()], before);
      assert.equal(auditEvents.length, auditCount);
    }

    reset();

    // Authentication and JWT role checks on every endpoint.
    for (const [method, path, body] of [
      ["GET", "", undefined],
      ["GET", "/resident-1", undefined],
      ["PATCH", "/resident-1", { isActive: false }],
    ]) {
      await expectRejected(method, path, undefined, 401, body);
      await expectRejected(method, path, "invalid-token", 401, body);
      await expectRejected(
        method, path, tokenFor("admin-1", "admin", -1), 401, body,
      );
      await expectRejected(
        method, path, tokenFor("resident-1", "resident"), 403, body,
      );
      await expectRejected(
        method, path, tokenFor("rescue-1", "rescue"), 403, body,
      );

      // A stale or forged role claim cannot override Firestore.
      await expectRejected(
        method, path, tokenFor("resident-1"), 403, body,
      );
      await expectRejected(
        method, path, tokenFor("inactive-admin"), 403, body,
      );
      await expectRejected(
        method, path, tokenFor("deleted-admin"), 401, body,
      );
    }

    const adminToken = tokenFor("admin-1");

    const list = await request("GET", "", adminToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.success, true);
    assert.equal(list.body.data.users.length, 5);

    for (const user of list.body.data.users) {
      assertPublicUser(user);
    }

    const detail = await request(
      "GET", "/resident-1", adminToken,
    );

    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.user.id, "resident-1");
    assertPublicUser(detail.body.data.user);
    assert.equal(auditEvents.length, 0);

    await expectRejected(
      "GET", "/missing-user", adminToken, 404,
    );
    await expectRejected(
      "GET", "/bad%2Fid", adminToken, 400,
    );
    await expectRejected(
      "PATCH", "/missing-user", adminToken, 404,
      { role: "rescue" },
    );

    // Only role and boolean isActive may be changed.
    for (const body of [
      {},
      [],
      null,
      { role: "owner" },
      { role: null },
      { role: "ADMIN" },
      { isActive: "false" },
      { isActive: 0 },
      { isActive: null },
      { fullName: "Changed name" },
      { passwordHash: "replacement" },
      { password: "replacement" },
      { email: "other@floodguard.local" },
      { updatedAt: "client-time" },
      { role: "rescue", actorId: "admin-2" },
    ]) {
      await expectRejected(
        "PATCH", "/resident-1", adminToken, 400, body,
      );
    }

    await expectRejected(
      "PATCH", "/resident-1", adminToken, 400,
    );

    const malformed = await request(
      "PATCH", "/resident-1", adminToken,
      undefined, '{"role":',
    );

    assert.equal(malformed.status, 400);
    assert.equal(auditEvents.length, 0);

    await expectRejected(
      "PATCH", "/admin-1", adminToken, 403,
      { isActive: false },
    );
    await expectRejected(
      "PATCH", "/admin-1", adminToken, 403,
      { role: "resident" },
    );

    // Update both allowed fields and preserve other stored data.
    const original = { ...records.get("users/resident-1") };

    const updated = await request(
      "PATCH", "/resident-1", adminToken,
      { role: "rescue", isActive: false },
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.success, true);
    assert.equal(updated.body.data.user.role, "rescue");
    assert.equal(updated.body.data.user.isActive, false);
    assertPublicUser(updated.body.data.user);

    const saved = records.get("users/resident-1");

    for (const field of [
      "fullName", "email", "phone",
      "passwordHash", "internalField", "createdAt",
    ]) {
      assert.equal(saved[field], original[field]);
    }

    assert.equal(auditEvents.length, 1);
    assert.deepEqual(auditEvents[0], {
      actor: { id: "admin-1", role: "admin" },
      action: "user.update",
      target: { type: "user", id: "resident-1" },
      metadata: {
        source: "api",
        outcome: "success",
        changedFields: ["role", "isActive"],
      },
    });

    // Repeating identical values must not produce another audit.
    const repeated = await request(
      "PATCH", "/resident-1", adminToken,
      { role: "rescue", isActive: false },
    );

    assert.equal(repeated.status, 200);
    assert.equal(auditEvents.length, 1);

    // A single-field update records only that field.
    const activated = await request(
      "PATCH", "/resident-1", adminToken,
      { isActive: true },
    );

    assert.equal(activated.status, 200);
    assert.equal(activated.body.data.user.role, "rescue");
    assert.equal(activated.body.data.user.isActive, true);
    assert.equal(auditEvents.length, 2);
    assert.deepEqual(
      auditEvents[1].metadata.changedFields,
      ["isActive"],
    );

    // Failed commit must leave user data unchanged and emit no audit.
    reset();
    failCommit = true;

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      await expectRejected(
        "PATCH", "/resident-1", adminToken, 500,
        { role: "rescue" },
      );
    } finally {
      console.error = originalConsoleError;
      failCommit = false;
    }

    // Best-effort audit failure must not undo a committed update.
    reset();
    failAudit = true;

    const auditFailure = await request(
      "PATCH", "/resident-1", adminToken,
      { role: "rescue" },
    );

    assert.equal(auditFailure.status, 200);
    assert.equal(auditFailure.body.data.user.role, "rescue");
    assert.equal(
      records.get("users/resident-1").role,
      "rescue",
    );
    assert.equal(auditEvents.length, 1);

    console.log("Admin user management API tests passed");
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
  console.error("Admin user management API tests failed");
  console.error(error);
  process.exitCode = 1;
});