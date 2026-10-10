const assert = require("node:assert/strict");
const { FieldValue } = require("firebase-admin/firestore");

const records = new Map();
let sequence = 0;
let writeCount = 0;
let simulatedWriteError = null;

const db = {
  collection(collectionName) {
    assert.equal(collectionName, "audit_logs");

    return {
      doc() {
        const id = `audit-${++sequence}`;
        const key = `${collectionName}/${id}`;

        return {
          id,

          async create(data) {
            writeCount++;

            if (simulatedWriteError) {
              throw simulatedWriteError;
            }

            assert.equal(records.has(key), false);
            records.set(key, data);
          },
        };
      },
    };
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
  AUDIT_LOGS_COLLECTION,
  normalizeAuditLogData,
  createAuditLog,
} = require("../src/services/audit-log.service");

function validData() {
  return {
    actor: {
      id: "admin-1",
      role: "admin",
    },
    action: "user.update",
    target: {
      type: "user",
      id: "user-1",
    },
    metadata: {
      source: "api",
      outcome: "success",
      changedFields: ["role", "isActive"],
    },
  };
}

async function runTests() {
  assert.equal(AUDIT_LOGS_COLLECTION, "audit_logs");

  const input = validData();
  input.actor.id = "  admin-1  ";
  input.action = "  user.update  ";
  input.target.type = "  user  ";
  input.target.id = "  user-1  ";
  input.metadata.changedFields = [
    "role",
    "role",
    "isActive",
  ];

  const normalized = normalizeAuditLogData(input);

  assert.deepEqual(normalized, validData());

  // Normalization must not modify the caller's input.
  assert.equal(input.actor.id, "  admin-1  ");
  assert.equal(input.metadata.changedFields.length, 3);

  // Metadata is optional, and null becomes an empty object.
  for (const metadata of [undefined, null, {}]) {
    const data = validData();
    data.metadata = metadata;

    assert.deepEqual(
      normalizeAuditLogData(data).metadata,
      {},
    );
  }

  // Returned metadata must not share mutable arrays.
  const original = validData();
  const copied = normalizeAuditLogData(original);
  original.metadata.changedFields.push("status");

  assert.deepEqual(
    copied.metadata.changedFields,
    ["role", "isActive"],
  );

  const invalidCases = [
    ["missing data", () => undefined],
    ["null data", () => null],
    ["array data", () => []],
    ["string data", () => "invalid"],
    ["non-plain data", () => new Date()],

    ["missing actor", () => ({
      ...validData(),
      actor: undefined,
    })],
    ["invalid actor role", () => ({
      ...validData(),
      actor: { id: "admin-1", role: "owner" },
    })],
    ["empty actor ID", () => ({
      ...validData(),
      actor: { id: " ", role: "admin" },
    })],
    ["invalid actor ID", () => ({
      ...validData(),
      actor: { id: "users/admin-1", role: "admin" },
    })],

    ["missing target", () => ({
      ...validData(),
      target: undefined,
    })],
    ["empty target ID", () => ({
      ...validData(),
      target: { type: "user", id: "" },
    })],
    ["invalid target ID", () => ({
      ...validData(),
      target: { type: "user", id: ".." },
    })],
    ["oversized target ID", () => ({
      ...validData(),
      target: { type: "user", id: "a".repeat(1501) },
    })],
    ["invalid target type", () => ({
      ...validData(),
      target: { type: "user type", id: "user-1" },
    })],

    ["missing action", () => ({
      ...validData(),
      action: undefined,
    })],
    ["invalid action", () => ({
      ...validData(),
      action: "user update",
    })],
    ["oversized action", () => ({
      ...validData(),
      action: "a".repeat(81),
    })],

    ["array metadata", () => ({
      ...validData(),
      metadata: [],
    })],
    ["invalid source", () => ({
      ...validData(),
      metadata: { source: "unknown" },
    })],
    ["invalid outcome", () => ({
      ...validData(),
      metadata: { outcome: "unknown" },
    })],
    ["changedFields must be an array", () => ({
      ...validData(),
      metadata: { changedFields: "role" },
    })],
    ["unsupported changed field", () => ({
      ...validData(),
      metadata: { changedFields: ["unknownField"] },
    })],
  ];

  // Reject sensitive or unsupported fields at every level.
  const sensitiveKeys = [
    "password",
    "passwordHash",
    "secret",
    "token",
    "authorization",
    "serviceAccountKey",
  ];

  for (const key of sensitiveKeys) {
    invalidCases.push([
      `top-level ${key}`,
      () => ({ ...validData(), [key]: "sensitive-value" }),
    ]);

    invalidCases.push([
      `actor ${key}`,
      () => {
        const data = validData();
        data.actor[key] = "sensitive-value";
        return data;
      },
    ]);

    invalidCases.push([
      `target ${key}`,
      () => {
        const data = validData();
        data.target[key] = "sensitive-value";
        return data;
      },
    ]);

    invalidCases.push([
      `metadata ${key}`,
      () => ({
        ...validData(),
        metadata: { [key]: "sensitive-value" },
      }),
    ]);

    invalidCases.push([
      `changedFields ${key}`,
      () => ({
        ...validData(),
        metadata: { changedFields: [key] },
      }),
    ]);
  }

  // Clients/callers cannot choose the stored timestamp.
  invalidCases.push([
    "caller-controlled timestamp",
    () => ({
      ...validData(),
      timestamp: "2026-10-10T00:00:00.000Z",
    }),
  ]);

  // Do not accept raw request bodies or arbitrary snapshots.
  for (const key of ["body", "before", "after", "note"]) {
    invalidCases.push([
      `unsupported metadata ${key}`,
      () => ({
        ...validData(),
        metadata: {
          [key]: { password: "must-not-be-stored" },
        },
      }),
    ]);
  }

  for (const [label, buildData] of invalidCases) {
    const data = buildData();

    assert.throws(
      () => normalizeAuditLogData(data),
      (error) =>
        error.code === "INVALID_AUDIT_LOG_DATA",
      label,
    );

    const previousWriteCount = writeCount;

    await assert.rejects(
      () => createAuditLog(data),
      (error) =>
        error.code === "INVALID_AUDIT_LOG_DATA",
      label,
    );

    assert.equal(
      writeCount,
      previousWriteCount,
      `${label}: invalid data must not reach Firestore`,
    );
  }

  const created = await createAuditLog(validData());

  assert.deepEqual(Object.keys(created), ["id"]);

  const saved = records.get(
    `audit_logs/${created.id}`,
  );

  assert.ok(saved);
  assert.deepEqual(saved.actor, validData().actor);
  assert.equal(saved.action, "user.update");
  assert.deepEqual(saved.target, validData().target);
  assert.deepEqual(saved.metadata, validData().metadata);

  assert.deepEqual(
    Object.keys(saved).sort(),
    ["actor", "action", "target", "timestamp", "metadata"].sort(),
  );

  assert.ok(
    saved.timestamp.isEqual(
      FieldValue.serverTimestamp(),
    ),
    "timestamp must use the Firestore server timestamp",
  );

  // Every call creates a separate log, preserving older logs.
  const second = await createAuditLog(validData());

  assert.notEqual(second.id, created.id);
  assert.equal(records.size, 2);

  // The data helper propagates write failures.
  // CCF-168 will handle them at the shared logging boundary.
  const existingRecordCount = records.size;
  simulatedWriteError = new Error(
    "Simulated Firestore write failure",
  );

  await assert.rejects(
    () => createAuditLog(validData()),
    (error) => error === simulatedWriteError,
  );

  assert.equal(records.size, existingRecordCount);
  simulatedWriteError = null;

  console.log("Audit log data tests passed");
  console.log(
    `Invalid data cases checked: ${invalidCases.length}`,
  );
}

runTests().catch((error) => {
  console.error("Audit log data tests failed");
  console.error(error);
  process.exitCode = 1;
});