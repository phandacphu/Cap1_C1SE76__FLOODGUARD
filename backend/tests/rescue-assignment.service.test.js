const assert = require("node:assert/strict");

const records = new Map();
let sequence = 0;

function createDocument(collectionName, id) {
  const key = `${collectionName}/${id}`;

  return {
    id,
    key,
    collectionName,

    async get() {
      const data = records.get(key);

      return {
        id,
        exists: data !== undefined,
        data: () => data,
      };
    },

    async create(data) {
      if (records.has(key)) {
        const error = new Error(
          "Document already exists",
        );

        error.code = 6;
        throw error;
      }

      records.set(key, { ...data });
    },

    async set(data) {
      records.set(key, { ...data });
    },
  };
}

const db = {
  collection(collectionName) {
    return {
      doc(id = `test-${++sequence}`) {
        return createDocument(collectionName, id);
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
  RESCUE_ASSIGNMENTS_COLLECTION,
  ALLOWED_ASSIGNMENT_STATUSES,
  createRescueAssignment,
  setRescueAssignmentById,
  getRescueAssignmentById,
  getRescueAssignmentByRequestId,
  normalizeRescueAssignmentData,
} = require("../src/services/rescue-assignment.service");

async function runTests() {
  assert.equal(
    RESCUE_ASSIGNMENTS_COLLECTION,
    "rescue_assignments",
  );

  assert.deepEqual(
    ALLOWED_ASSIGNMENT_STATUSES,
    [
      "assigned",
      "accepted",
      "in_progress",
      "completed",
      "cancelled",
    ],
  );

  const normalized = normalizeRescueAssignmentData({
    requestId: "  request-001  ",
    rescueStaffId: "  staff-001  ",
    note: "  first assignment  ",
  });

  assert.deepEqual(normalized, {
    requestId: "request-001",
    rescueStaffId: "staff-001",
    status: "assigned",
    note: "first assignment",
  });

  const nullNote = normalizeRescueAssignmentData({
    requestId: "request-002",
    rescueStaffId: "staff-002",
    note: "   ",
  });

  assert.equal(nullNote.note, null);

  const invalidCases = [
    {
      data: {
        rescueStaffId: "staff-001",
      },
      message: "request ID",
    },
    {
      data: {
        requestId: "request-001",
      },
      message: "rescue staff ID",
    },
    {
      data: {
        requestId: "request-001",
        rescueStaffId: "staff-001",
        status: "invalid",
      },
      message: "Invalid rescue assignment status",
    },
  ];

  for (const testCase of invalidCases) {
    assert.throws(
      () => normalizeRescueAssignmentData(testCase.data),
      (error) => error.message.includes(testCase.message),
    );
  }

  records.set(
    "rescue_requests/request-001",
    {
      id: "request-001",
      residentId: "resident-001",
      status: "submitted",
    },
  );

  const created = await createRescueAssignment({
    requestId: "request-001",
    rescueStaffId: "staff-001",
    status: "accepted",
    note: "  accepted by rescue staff  ",
  });

  assert.equal(created.id, "request-001");
  assert.equal(created.requestId, "request-001");
  assert.equal(created.rescueStaffId, "staff-001");
  assert.equal(created.status, "accepted");
  assert.equal(created.note, "accepted by rescue staff");
  assert.ok(created.assignedAt);
  assert.ok(created.updatedAt);

  assert.ok(
    records.has(
      `${RESCUE_ASSIGNMENTS_COLLECTION}/request-001`,
    ),
  );

  const byId = await getRescueAssignmentById(
    "request-001",
  );

  assert.equal(byId.id, "request-001");
  assert.equal(byId.rescueStaffId, "staff-001");

  const byRequest =
    await getRescueAssignmentByRequestId(
      "request-001",
    );

  assert.equal(byRequest.id, "request-001");

  await assert.rejects(
    () =>
      createRescueAssignment({
        requestId: "request-001",
        rescueStaffId: "staff-002",
      }),
    (error) =>
      error.code ===
      "RESCUE_ASSIGNMENT_ALREADY_EXISTS",
  );

  records.set(
    "rescue_requests/request-002",
    {
      id: "request-002",
      residentId: "resident-002",
      status: "submitted",
    },
  );

  const secondAssignment =
    await createRescueAssignment({
      requestId: "request-002",
      rescueStaffId: "staff-002",
    });

  assert.equal(secondAssignment.id, "request-002");
  assert.equal(secondAssignment.status, "assigned");

  const updated = await setRescueAssignmentById(
    "request-001",
    {
      requestId: "request-001",
      rescueStaffId: "staff-001",
      status: "in_progress",
      note: "  rescue team is processing  ",
    },
  );

  assert.equal(updated.status, "in_progress");
  assert.equal(updated.note, "rescue team is processing");
  assert.ok(updated.assignedAt);
  assert.ok(updated.updatedAt);

  await assert.rejects(
    () =>
      createRescueAssignment({
        requestId: "request-not-found",
        rescueStaffId: "staff-001",
      }),
    (error) =>
      error.code === "RESCUE_REQUEST_NOT_FOUND",
  );

  await assert.rejects(
    () =>
      setRescueAssignmentById(
        "request-not-found",
        {
          requestId: "request-not-found",
          rescueStaffId: "staff-001",
        },
      ),
    (error) =>
      error.code === "RESCUE_ASSIGNMENT_NOT_FOUND",
  );

  console.log(
    "Rescue assignment data tests passed",
  );
}

runTests().catch((error) => {
  console.error(
    "Rescue assignment data tests failed",
  );
  console.error(error);
  process.exitCode = 1;
});