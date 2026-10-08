const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const {
  getRescueRequestById,
} = require("./rescue-request.service");

const RESCUE_ASSIGNMENTS_COLLECTION =
  "rescue_assignments";

const ALLOWED_ASSIGNMENT_STATUSES = [
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
];

function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
  }

  return value.trim() || null;
}

function normalizeRescueAssignmentData(
  assignmentData,
) {
  if (
    !assignmentData ||
    typeof assignmentData.requestId !== "string" ||
    !assignmentData.requestId.trim()
  ) {
    throw new Error(
      "Rescue assignment request ID is required",
    );
  }

  if (
    typeof assignmentData.rescueStaffId !== "string" ||
    !assignmentData.rescueStaffId.trim()
  ) {
    throw new Error(
      "Rescue assignment rescue staff ID is required",
    );
  }

  const status =
    assignmentData.status === undefined
      ? "assigned"
      : assignmentData.status;

  if (!ALLOWED_ASSIGNMENT_STATUSES.includes(status)) {
    throw new Error("Invalid rescue assignment status");
  }

  return {
    requestId: assignmentData.requestId.trim(),
    rescueStaffId: assignmentData.rescueStaffId.trim(),
    status,
    note: normalizeOptionalString(
      assignmentData.note,
      "Rescue assignment note",
    ),
  };
}

function normalizeAssignmentId(assignmentId) {
  if (
    typeof assignmentId !== "string" ||
    !assignmentId.trim()
  ) {
    throw new Error("Rescue assignment ID is required");
  }

  return assignmentId.trim();
}

async function getRescueAssignmentById(
  assignmentId,
) {
  const normalizedId =
    normalizeAssignmentId(assignmentId);

  const assignmentDoc = await db
    .collection(RESCUE_ASSIGNMENTS_COLLECTION)
    .doc(normalizedId)
    .get();

  if (!assignmentDoc.exists) {
    return null;
  }

  return {
    id: assignmentDoc.id,
    ...assignmentDoc.data(),
  };
}

async function getRescueAssignmentByRequestId(
  requestId,
) {
  return getRescueAssignmentById(requestId);
}

async function createRescueAssignment(
  assignmentData,
) {
  const normalizedData =
    normalizeRescueAssignmentData(assignmentData);

  const rescueRequest = await getRescueRequestById(
    normalizedData.requestId,
  );

  if (!rescueRequest) {
    const error = new Error(
      "Referenced rescue request does not exist",
    );

    error.code = "RESCUE_REQUEST_NOT_FOUND";
    throw error;
  }

  // The request ID is also the assignment document ID.
  // Firestore create() fails atomically if an assignment
  // already exists for this request.
  const assignmentRef = db
    .collection(RESCUE_ASSIGNMENTS_COLLECTION)
    .doc(normalizedData.requestId);

  try {
    await assignmentRef.create({
      ...normalizedData,
      assignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (
      error.code === 6 ||
      error.code === "already-exists" ||
      /already exists/i.test(error.message || "")
    ) {
      const conflictError = new Error(
        "Rescue request is already assigned",
      );

      conflictError.code =
        "RESCUE_ASSIGNMENT_ALREADY_EXISTS";

      throw conflictError;
    }

    throw error;
  }

  return getRescueAssignmentById(
    assignmentRef.id,
  );
}

async function setRescueAssignmentById(
  assignmentId,
  assignmentData,
) {
  const normalizedId =
    normalizeAssignmentId(assignmentId);

  const normalizedData =
    normalizeRescueAssignmentData(assignmentData);

  if (normalizedData.requestId !== normalizedId) {
    throw new Error(
      "Rescue assignment request ID must match assignment ID",
    );
  }

  const assignmentRef = db
    .collection(RESCUE_ASSIGNMENTS_COLLECTION)
    .doc(normalizedId);

  const existingAssignment =
    await assignmentRef.get();

  if (!existingAssignment.exists) {
    const error = new Error(
      "Rescue assignment does not exist",
    );

    error.code = "RESCUE_ASSIGNMENT_NOT_FOUND";
    throw error;
  }

  const existingData = existingAssignment.data();

  await assignmentRef.set(
    {
      ...normalizedData,
      assignedAt:
        existingData.assignedAt ||
        FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {
      merge: false,
    },
  );

  return getRescueAssignmentById(
    assignmentRef.id,
  );
}

module.exports = {
  RESCUE_ASSIGNMENTS_COLLECTION,
  ALLOWED_ASSIGNMENT_STATUSES,
  createRescueAssignment,
  setRescueAssignmentById,
  getRescueAssignmentById,
  getRescueAssignmentByRequestId,
  normalizeRescueAssignmentData,
};