const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const {
  RESCUE_REQUESTS_COLLECTION,
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

function assignmentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeDocumentId(value, fieldName) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(`${fieldName} is required`);
  }

  const normalized = value.trim();

  if (
    normalized.includes("/") ||
    normalized === "." ||
    normalized === ".." ||
    Buffer.byteLength(normalized, "utf8") > 1500
  ) {
    throw new Error(`${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
  }

  return value.trim() || null;
}

function normalizeRescueAssignmentData(assignmentData) {
  if (
    !assignmentData ||
    typeof assignmentData !== "object" ||
    Array.isArray(assignmentData)
  ) {
    throw new Error(
      "Rescue assignment data must be an object",
    );
  }

  const requestId = normalizeDocumentId(
    assignmentData.requestId,
    "Rescue assignment request ID",
  );

  const rescueStaffId = normalizeDocumentId(
    assignmentData.rescueStaffId,
    "Rescue assignment rescue staff ID",
  );

  const status = assignmentData.status === undefined
    ? "assigned"
    : assignmentData.status;

  if (!ALLOWED_ASSIGNMENT_STATUSES.includes(status)) {
    throw new Error("Invalid rescue assignment status");
  }

  return {
    requestId,
    rescueStaffId,
    status,
    note: normalizeOptionalString(
      assignmentData.note,
      "Rescue assignment note",
    ),
  };
}

function ensureActiveRescueStaff(userDoc) {
  if (!userDoc.exists) {
    throw assignmentError(
      "RESCUE_STAFF_NOT_FOUND",
      "Rescue staff account does not exist",
    );
  }

  const user = userDoc.data();

  if (user.role !== "rescue") {
    throw assignmentError(
      "INVALID_RESCUE_STAFF_ROLE",
      "Assignment recipient must be rescue staff",
    );
  }

  if (user.isActive !== true) {
    throw assignmentError(
      "RESCUE_STAFF_INACTIVE",
      "Rescue staff account is inactive",
    );
  }
}

async function getRescueAssignmentById(assignmentId) {
  const normalizedId = normalizeDocumentId(
    assignmentId,
    "Rescue assignment ID",
  );

  const assignmentDoc = await db
    .collection(RESCUE_ASSIGNMENTS_COLLECTION)
    .doc(normalizedId)
    .get();

  if (!assignmentDoc.exists) {
    return null;
  }

  return {
    ...assignmentDoc.data(),
    id: assignmentDoc.id,
  };
}

async function getRescueAssignmentByRequestId(requestId) {
  return getRescueAssignmentById(requestId);
}

// Internal data helper.
// The public accept API uses its own transaction to also
// update the SOS and create status history.
async function createRescueAssignment(assignmentData) {
  const data =
    normalizeRescueAssignmentData(assignmentData);

  const requestRef = db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc(data.requestId);

  const staffRef = db
    .collection("users")
    .doc(data.rescueStaffId);

  const assignmentRef = db
    .collection(RESCUE_ASSIGNMENTS_COLLECTION)
    .doc(data.requestId);

  await db.runTransaction(async (transaction) => {
    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw assignmentError(
        "RESCUE_REQUEST_NOT_FOUND",
        "Referenced rescue request does not exist",
      );
    }

    const assignmentDoc =
      await transaction.get(assignmentRef);

    if (assignmentDoc.exists) {
      throw assignmentError(
        "RESCUE_ASSIGNMENT_ALREADY_EXISTS",
        "Rescue request is already assigned",
      );
    }

    if (requestDoc.data().status !== "submitted") {
      throw assignmentError(
        "RESCUE_REQUEST_UNAVAILABLE",
        "Rescue request is no longer available",
      );
    }

    const staffDoc = await transaction.get(staffRef);
    ensureActiveRescueStaff(staffDoc);

    transaction.create(assignmentRef, {
      ...data,
      assignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return getRescueAssignmentById(data.requestId);
}

// Internal data helper, not an authorization boundary.
// Callers must authorize the acting user before calling it.
// Reassignment is deliberately not supported here.
async function setRescueAssignmentById(
  assignmentId,
  assignmentData,
) {
  const normalizedId = normalizeDocumentId(
    assignmentId,
    "Rescue assignment ID",
  );

  const data =
    normalizeRescueAssignmentData(assignmentData);

  if (data.requestId !== normalizedId) {
    throw assignmentError(
      "RESCUE_ASSIGNMENT_REQUEST_MISMATCH",
      "Rescue assignment request ID must match assignment ID",
    );
  }

  const assignmentRef = db
    .collection(RESCUE_ASSIGNMENTS_COLLECTION)
    .doc(normalizedId);

  const requestRef = db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc(normalizedId);

  const staffRef = db
    .collection("users")
    .doc(data.rescueStaffId);

  await db.runTransaction(async (transaction) => {
    const assignmentDoc =
      await transaction.get(assignmentRef);

    if (!assignmentDoc.exists) {
      throw assignmentError(
        "RESCUE_ASSIGNMENT_NOT_FOUND",
        "Rescue assignment does not exist",
      );
    }

    const existing = assignmentDoc.data();

    if (existing.requestId !== normalizedId) {
      throw assignmentError(
        "RESCUE_ASSIGNMENT_REQUEST_MISMATCH",
        "Stored assignment references a different rescue request",
      );
    }

    if (existing.rescueStaffId !== data.rescueStaffId) {
      throw assignmentError(
        "RESCUE_ASSIGNMENT_STAFF_MISMATCH",
        "Assignment recipient cannot be changed",
      );
    }

    if (!existing.assignedAt) {
      throw assignmentError(
        "RESCUE_ASSIGNMENT_TIMESTAMP_MISSING",
        "Stored assignment is missing its original assignedAt",
      );
    }

    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw assignmentError(
        "RESCUE_REQUEST_NOT_FOUND",
        "Referenced rescue request does not exist",
      );
    }

    const staffDoc = await transaction.get(staffRef);
    ensureActiveRescueStaff(staffDoc);

    // Preserve recipient, request ID, original assignedAt,
    // and any additional fields already stored.
    transaction.update(assignmentRef, {
      status: data.status,
      note: data.note,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return getRescueAssignmentById(normalizedId);
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