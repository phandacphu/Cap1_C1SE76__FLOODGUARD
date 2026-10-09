const assert = require("node:assert/strict");
const { Timestamp } = require("firebase-admin/firestore");

const records = new Map();
const versions = new Map();

const baseMillis = Date.parse("2026-10-09T08:00:00.000Z");

let sequence = 0;
let commitCount = 0;
let retryCount = 0;
let failCommit = false;
let failRead = false;
let beforeCommit = null;

function save(key, data) {
  records.set(key, { ...data });
  versions.set(key, (versions.get(key) || 0) + 1);
}

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
            "All reads must precede writes",
          );

          if (failRead) {
            throw new Error("Simulated read failure");
          }

          reads.set(ref.key, versions.get(ref.key) || 0);
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

      if (beforeCommit) {
        const hook = beforeCommit;
        beforeCommit = null;
        hook();
      }

      const conflict = [...reads.entries()].some(
        ([key, version]) =>
          (versions.get(key) || 0) !== version,
      );

      if (conflict) {
        retryCount++;
        continue;
      }

      if (failCommit) {
        throw new Error("Simulated commit failure");
      }

      // Validate every write before applying any write.
      for (const { type, ref } of writes) {
        assert.equal(
          records.has(ref.key),
          type === "update",
        );
      }

      commitCount++;
      const commitTime = Timestamp.fromMillis(
        baseMillis + commitCount * 1000,
      );

      // Commit synchronously after conflict validation.
      for (const { type, ref, data } of writes) {
        const saved = { ...data };

        for (const field of ["assignedAt", "updatedAt"]) {
          if (Object.hasOwn(saved, field)) {
            saved[field] = commitTime;
          }
        }

        save(
          ref.key,
          type === "update"
            ? { ...records.get(ref.key), ...saved }
            : saved,
        );
      }

      return result;
    }

    throw new Error("Simulated retry limit");
  },
};

const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const {
  RESCUE_ASSIGNMENTS_COLLECTION,
  ALLOWED_ASSIGNMENT_STATUSES,
  createRescueAssignment,
  setRescueAssignmentById,
  getRescueAssignmentById,
  getRescueAssignmentByRequestId,
  normalizeRescueAssignmentData,
} = require("../src/services/rescue-assignment.service");

function reset() {
  records.clear();
  versions.clear();

  commitCount = 0;
  retryCount = 0;
  failCommit = false;
  failRead = false;
  beforeCommit = null;

  for (const [id, role, isActive] of [
    ["staff-1", "rescue", true],
    ["staff-2", "rescue", true],
    ["resident", "resident", true],
    ["admin", "admin", true],
    ["inactive", "rescue", false],
  ]) {
    save(`users/${id}`, { role, isActive });
  }

  for (const requestId of ["request-1", "request-2"]) {
    save(`rescue_requests/${requestId}`, {
      residentId: "resident",
      status: "submitted",
    });
  }
}

function input(overrides = {}) {
  return {
    requestId: "request-1",
    rescueStaffId: "staff-1",
    status: "accepted",
    note: "  simulated assignment  ",
    ...overrides,
  };
}

async function expectRejectedWithoutWrites(action, code) {
  const before = [...records.entries()];
  const beforeCommits = commitCount;

  await assert.rejects(
    action,
    (error) => error.code === code,
  );

  assert.deepEqual([...records.entries()], before);
  assert.equal(commitCount, beforeCommits);
}

async function runTests() {
  assert.equal(
    RESCUE_ASSIGNMENTS_COLLECTION,
    "rescue_assignments",
  );

  assert.deepEqual(ALLOWED_ASSIGNMENT_STATUSES, [
    "assigned",
    "accepted",
    "in_progress",
    "completed",
    "cancelled",
  ]);

  assert.deepEqual(
    normalizeRescueAssignmentData({
      requestId: "  request-1  ",
      rescueStaffId: "  staff-1  ",
      note: "  assignment note  ",
    }),
    {
      requestId: "request-1",
      rescueStaffId: "staff-1",
      status: "assigned",
      note: "assignment note",
    },
  );

  for (const note of [undefined, null, "", "   "]) {
    assert.equal(
      normalizeRescueAssignmentData(input({ note })).note,
      null,
    );
  }

  for (const data of [
    null,
    [],
    "invalid",
    {},
    input({ requestId: "" }),
    input({ requestId: "bad/id" }),
    input({ requestId: "." }),
    input({ requestId: ".." }),
    input({ requestId: "a".repeat(1501) }),
    input({ rescueStaffId: "" }),
    input({ rescueStaffId: "bad/id" }),
    input({ rescueStaffId: 123 }),
    input({ status: "invalid" }),
    input({ note: 123 }),
  ]) {
    assert.throws(() => normalizeRescueAssignmentData(data));
  }

  reset();

  assert.equal(
    await getRescueAssignmentById("missing"),
    null,
  );

  await expectRejectedWithoutWrites(
    () => createRescueAssignment(
      input({ requestId: "missing" }),
    ),
    "RESCUE_REQUEST_NOT_FOUND",
  );

  for (const [staffId, code] of [
    ["missing", "RESCUE_STAFF_NOT_FOUND"],
    ["resident", "INVALID_RESCUE_STAFF_ROLE"],
    ["admin", "INVALID_RESCUE_STAFF_ROLE"],
    ["inactive", "RESCUE_STAFF_INACTIVE"],
  ]) {
    await expectRejectedWithoutWrites(
      () => createRescueAssignment(
        input({ rescueStaffId: staffId }),
      ),
      code,
    );
  }

  for (const status of [
    "received",
    "in_progress",
    "assisted",
    "cancelled",
  ]) {
    reset();

    save("rescue_requests/request-1", {
      residentId: "resident",
      status,
    });

    await expectRejectedWithoutWrites(
      () => createRescueAssignment(input()),
      "RESCUE_REQUEST_UNAVAILABLE",
    );
  }

  reset();

  // Input timestamps cannot override server timestamps.
  const created = await createRescueAssignment(input({
    assignedAt: "client-time",
    updatedAt: "client-time",
  }));

  assert.equal(created.id, "request-1");
  assert.equal(created.requestId, "request-1");
  assert.equal(created.rescueStaffId, "staff-1");
  assert.equal(created.status, "accepted");
  assert.equal(created.note, "simulated assignment");
  assert.equal(created.assignedAt.toMillis(), baseMillis + 1000);
  assert.equal(created.updatedAt.toMillis(), baseMillis + 1000);

  const byId = await getRescueAssignmentById("request-1");
  const byRequest =
    await getRescueAssignmentByRequestId("request-1");

  assert.equal(byId.rescueStaffId, "staff-1");
  assert.equal(byRequest.id, "request-1");

  for (const staffId of ["staff-1", "staff-2"]) {
    await expectRejectedWithoutWrites(
      () => createRescueAssignment(
        input({ rescueStaffId: staffId }),
      ),
      "RESCUE_ASSIGNMENT_ALREADY_EXISTS",
    );
  }

  const second = await createRescueAssignment({
    requestId: "request-2",
    rescueStaffId: "staff-2",
  });

  assert.equal(second.status, "assigned");

  // Updating must preserve identity, time, and extra fields.
  save("rescue_assignments/request-1", {
    ...records.get("rescue_assignments/request-1"),
    extraAuditField: "preserve-me",
  });

  const originalAssignedAt = created.assignedAt.toMillis();

  const updated = await setRescueAssignmentById(
    "request-1",
    input({
      status: "in_progress",
      note: "  processing  ",
      assignedAt: "forged-time",
    }),
  );

  assert.equal(updated.status, "in_progress");
  assert.equal(updated.note, "processing");
  assert.equal(updated.rescueStaffId, "staff-1");
  assert.equal(updated.requestId, "request-1");
  assert.equal(updated.assignedAt.toMillis(), originalAssignedAt);
  assert.ok(updated.updatedAt.toMillis() > originalAssignedAt);
  assert.equal(updated.extraAuditField, "preserve-me");

  await expectRejectedWithoutWrites(
    () => setRescueAssignmentById(
      "request-1",
      input({ rescueStaffId: "staff-2" }),
    ),
    "RESCUE_ASSIGNMENT_STAFF_MISMATCH",
  );

  await expectRejectedWithoutWrites(
    () => setRescueAssignmentById(
      "request-1",
      input({ requestId: "request-2" }),
    ),
    "RESCUE_ASSIGNMENT_REQUEST_MISMATCH",
  );

  await expectRejectedWithoutWrites(
    () => setRescueAssignmentById(
      "missing",
      input({ requestId: "missing" }),
    ),
    "RESCUE_ASSIGNMENT_NOT_FOUND",
  );

  for (const [userData, code] of [
    [{ role: "resident", isActive: true }, "INVALID_RESCUE_STAFF_ROLE"],
    [{ role: "rescue", isActive: false }, "RESCUE_STAFF_INACTIVE"],
  ]) {
    const originalUser = records.get("users/staff-1");
    save("users/staff-1", userData);

    await expectRejectedWithoutWrites(
      () => setRescueAssignmentById("request-1", input()),
      code,
    );

    save("users/staff-1", originalUser);
  }

  // Reject corrupt links or missing original timestamps.
  const originalAssignment =
    records.get("rescue_assignments/request-1");

  save("rescue_assignments/request-1", {
    ...originalAssignment,
    requestId: "request-2",
  });

  await expectRejectedWithoutWrites(
    () => setRescueAssignmentById("request-1", input()),
    "RESCUE_ASSIGNMENT_REQUEST_MISMATCH",
  );

  save("rescue_assignments/request-1", {
    ...originalAssignment,
    assignedAt: null,
  });

  await expectRejectedWithoutWrites(
    () => setRescueAssignmentById("request-1", input()),
    "RESCUE_ASSIGNMENT_TIMESTAMP_MISSING",
  );

  save("rescue_assignments/request-1", originalAssignment);

  const originalRequest = records.get("rescue_requests/request-1");
  records.delete("rescue_requests/request-1");

  await expectRejectedWithoutWrites(
    () => setRescueAssignmentById("request-1", input()),
    "RESCUE_REQUEST_NOT_FOUND",
  );

  save("rescue_requests/request-1", originalRequest);

  // Database failures must leave assignment unchanged.
  const beforeFailure = [...records.entries()];

  failCommit = true;

  await assert.rejects(
    () => setRescueAssignmentById("request-1", input()),
    /Simulated commit failure/,
  );

  assert.deepEqual([...records.entries()], beforeFailure);
  failCommit = false;

  reset();
  failCommit = true;

  await assert.rejects(
    () => createRescueAssignment(input()),
    /Simulated commit failure/,
  );

  assert.equal(records.has("rescue_assignments/request-1"), false);
  failCommit = false;

  failRead = true;

  await assert.rejects(
    () => createRescueAssignment(input()),
    /Simulated read failure/,
  );

  assert.equal(records.has("rescue_assignments/request-1"), false);
  failRead = false;

  // Two competing creates: one winner, one rejected retry.
  reset();

  const results = await Promise.allSettled([
    createRescueAssignment(input()),
    createRescueAssignment(input({ rescueStaffId: "staff-2" })),
  ]);

  const winners = results.filter(
    (result) => result.status === "fulfilled",
  );
  const losers = results.filter(
    (result) => result.status === "rejected",
  );

  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(
    losers[0].reason.code,
    "RESCUE_ASSIGNMENT_ALREADY_EXISTS",
  );
  assert.ok(retryCount > 0);
  assert.equal(commitCount, 1);
  assert.equal(
    records.get("rescue_assignments/request-1").rescueStaffId,
    winners[0].value.rescueStaffId,
  );

  // A role change during the transaction must be rechecked.
  reset();

  beforeCommit = () => {
    save("users/staff-1", {
      role: "resident",
      isActive: true,
    });
  };

  await assert.rejects(
    () => createRescueAssignment(input()),
    (error) => error.code === "INVALID_RESCUE_STAFF_ROLE",
  );

  assert.ok(retryCount > 0);
  assert.equal(commitCount, 0);
  assert.equal(records.has("rescue_assignments/request-1"), false);

  console.log("Rescue assignment logic tests passed");
}

runTests().catch((error) => {
  console.error("Rescue assignment logic tests failed");
  console.error(error);
  process.exitCode = 1;
});