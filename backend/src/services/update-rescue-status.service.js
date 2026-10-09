const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const {
  RESCUE_REQUESTS_COLLECTION,
  getRescueRequestById,
} = require("./rescue-request.service");

const {
  RESCUE_ASSIGNMENTS_COLLECTION,
  getRescueAssignmentByRequestId,
} = require("./rescue-assignment.service");

const {
  RESCUE_REQUEST_STATUS_HISTORY_COLLECTION,
  normalizeRescueRequestStatusHistoryData,
} = require("./rescue-request-status-history.service");

function statusError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isValidDocumentId(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.trim().includes("/") &&
    value.trim() !== "." &&
    value.trim() !== ".." &&
    Buffer.byteLength(value.trim(), "utf8") <= 1500
  );
}

function normalizeStatusUpdate(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw statusError(
      "INVALID_STATUS_UPDATE",
      "Status update body must be an object",
    );
  }

  const unsupportedField = Object.keys(input).find(
    (field) => !["status", "note"].includes(field),
  );

  if (unsupportedField !== undefined) {
    throw statusError(
      "INVALID_STATUS_UPDATE",
      `Unsupported request field: ${unsupportedField}`,
    );
  }

  if (
    !["in_progress", "assisted"].includes(input.status)
  ) {
    throw statusError(
      "INVALID_STATUS_UPDATE",
      "Status must be in_progress or assisted",
    );
  }

  if (
    input.note !== undefined &&
    input.note !== null &&
    typeof input.note !== "string"
  ) {
    throw statusError(
      "INVALID_STATUS_UPDATE",
      "Status update note must be a string or null",
    );
  }

  return {
    status: input.status,
    note: typeof input.note === "string"
      ? input.note.trim() || null
      : null,
  };
}

async function updateRescueStatusWithHistory(
  requestId,
  rescueStaffId,
  input,
) {
  if (!isValidDocumentId(rescueStaffId)) {
    throw statusError(
      "STATUS_AUTH_REQUIRED",
      "Authentication is required",
    );
  }

  if (!isValidDocumentId(requestId)) {
    throw statusError(
      "INVALID_STATUS_REQUEST_ID",
      "Invalid rescue request ID",
    );
  }

  const data = normalizeStatusUpdate(input);
  const normalizedRequestId = requestId.trim();
  const normalizedStaffId = rescueStaffId.trim();

  const userRef = db.collection("users").doc(
    normalizedStaffId,
  );

  const requestRef = db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc(normalizedRequestId);

  const assignmentRef = db
    .collection(RESCUE_ASSIGNMENTS_COLLECTION)
    .doc(normalizedRequestId);

  // Allocate once so transaction retries reuse the same ID.
  const historyRef = db
    .collection(RESCUE_REQUEST_STATUS_HISTORY_COLLECTION)
    .doc();

  await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);

    if (!userDoc.exists) {
      throw statusError(
        "STATUS_USER_NOT_FOUND",
        "Authenticated user no longer exists",
      );
    }

    const user = userDoc.data();

    if (user.isActive !== true) {
      throw statusError(
        "STATUS_ACCOUNT_INACTIVE",
        "Account is inactive",
      );
    }

    if (user.role !== "rescue") {
      throw statusError(
        "STATUS_ROLE_FORBIDDEN",
        "Only rescue staff can update SOS status",
      );
    }

    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw statusError(
        "STATUS_REQUEST_NOT_FOUND",
        "Rescue request not found",
      );
    }

    const assignmentDoc =
      await transaction.get(assignmentRef);

    if (!assignmentDoc.exists) {
      throw statusError(
        "STATUS_ASSIGNMENT_CONFLICT",
        "Rescue request has no assignment",
      );
    }

    const assignment = assignmentDoc.data();

    if (assignment.requestId !== normalizedRequestId) {
      throw statusError(
        "STATUS_ASSIGNMENT_CONFLICT",
        "Assignment does not match this rescue request",
      );
    }

    if (assignment.rescueStaffId !== normalizedStaffId) {
      throw statusError(
        "STATUS_STAFF_FORBIDDEN",
        "Only the assigned rescue staff can update this SOS",
      );
    }

    const request = requestDoc.data();

    const expected = data.status === "in_progress"
      ? {
          requestStatus: "received",
          assignmentStatus: "accepted",
          nextAssignmentStatus: "in_progress",
        }
      : {
          requestStatus: "in_progress",
          assignmentStatus: "in_progress",
          nextAssignmentStatus: "completed",
        };

    if (
      request.status !== expected.requestStatus ||
      assignment.status !== expected.assignmentStatus
    ) {
      throw statusError(
        "STATUS_TRANSITION_CONFLICT",
        "Status transition is not allowed for the current SOS and assignment",
      );
    }

    const history =
      normalizeRescueRequestStatusHistoryData({
        requestId: normalizedRequestId,
        oldStatus: request.status,
        newStatus: data.status,
        changedBy: normalizedStaffId,
        note: data.note,
      });

    // All reads finish before writes.
    // Preserve assignment identities and original assignedAt.
    transaction.update(requestRef, {
      status: data.status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(assignmentRef, {
      status: expected.nextAssignmentStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.create(historyRef, {
      ...history,
      changedAt: FieldValue.serverTimestamp(),
    });
  });

  const rescueRequest = await getRescueRequestById(
    normalizedRequestId,
  );

  const assignment =
    await getRescueAssignmentByRequestId(
      normalizedRequestId,
    );

  return { rescueRequest, assignment };
}

module.exports = {
  normalizeStatusUpdate,
  updateRescueStatusWithHistory,
};