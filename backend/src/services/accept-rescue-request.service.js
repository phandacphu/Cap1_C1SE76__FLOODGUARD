const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const {
  RESCUE_REQUESTS_COLLECTION,
  getRescueRequestById,
} = require("./rescue-request.service");

const {
  RESCUE_ASSIGNMENTS_COLLECTION,
  getRescueAssignmentByRequestId,
  normalizeRescueAssignmentData,
} = require("./rescue-assignment.service");

const {
  RESCUE_REQUEST_STATUS_HISTORY_COLLECTION,
  normalizeRescueRequestStatusHistoryData,
} = require("./rescue-request-status-history.service");

const {
  logAuditEvent,
} = require("./audit-logging.service");

function createAcceptError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
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

async function acceptRescueRequestWithHistory(
  requestId,
  rescueStaffId,
) {
  if (!isValidDocumentId(rescueStaffId)) {
    throw createAcceptError(
      "ACCEPT_AUTH_REQUIRED",
      "Authentication is required",
      401,
    );
  }

  if (!isValidDocumentId(requestId)) {
    throw createAcceptError(
      "INVALID_ACCEPT_REQUEST_ID",
      "Invalid rescue request ID",
      400,
    );
  }

  const normalizedRequestId = requestId.trim();
  const normalizedStaffId = rescueStaffId.trim();

  const userRef = db
    .collection("users")
    .doc(normalizedStaffId);

  const requestRef = db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc(normalizedRequestId);

  // One assignment document per SOS.
  const assignmentRef = db
    .collection(RESCUE_ASSIGNMENTS_COLLECTION)
    .doc(normalizedRequestId);

  // Allocate once, outside the retryable transaction callback.
  const historyRef = db
    .collection(RESCUE_REQUEST_STATUS_HISTORY_COLLECTION)
    .doc();

  await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);

    if (!userDoc.exists) {
      throw createAcceptError(
        "ACCEPT_USER_NOT_FOUND",
        "Authenticated user no longer exists",
        401,
      );
    }

    const user = userDoc.data();

    if (user.isActive !== true) {
      throw createAcceptError(
        "ACCEPT_ACCOUNT_INACTIVE",
        "Account is inactive",
        403,
      );
    }

    if (user.role !== "rescue") {
      throw createAcceptError(
        "ACCEPT_ROLE_FORBIDDEN",
        "Only rescue staff can accept SOS requests",
        403,
      );
    }

    const requestDoc = await transaction.get(requestRef);

    if (!requestDoc.exists) {
      throw createAcceptError(
        "ACCEPT_REQUEST_NOT_FOUND",
        "Rescue request not found",
        404,
      );
    }

    const assignmentDoc =
      await transaction.get(assignmentRef);

    const request = requestDoc.data();

    if (
      request.status !== "submitted" ||
      assignmentDoc.exists
    ) {
      throw createAcceptError(
        "ACCEPT_REQUEST_UNAVAILABLE",
        "Rescue request is no longer available",
        409,
      );
    }

    const assignment =
      normalizeRescueAssignmentData({
        requestId: normalizedRequestId,
        rescueStaffId: normalizedStaffId,
        status: "accepted",
        note: null,
      });

    const history =
      normalizeRescueRequestStatusHistoryData({
        requestId: normalizedRequestId,
        oldStatus: request.status,
        newStatus: "received",
        changedBy: normalizedStaffId,
        note: "SOS request accepted by rescue staff",
      });

    // All reads are completed before any writes.
    transaction.create(assignmentRef, {
      ...assignment,
      assignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(requestRef, {
      status: "received",
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.create(historyRef, {
      ...history,
      changedAt: FieldValue.serverTimestamp(),
    });
  });

  // Audit only after the transaction commits successfully.
  // Keep this outside the callback so transaction retries
  // do not create duplicate audit records.
  // The logging service contains write failures and timeouts.
  await logAuditEvent({
    actor: {
      id: normalizedStaffId,
      role: "rescue",
    },
    action: "rescue_request.accept",
    target: {
      type: "rescue_request",
      id: normalizedRequestId,
    },
    metadata: {
      source: "api",
      outcome: "success",
      changedFields: ["status"],
    },
  });

  const rescueRequest = await getRescueRequestById(
    normalizedRequestId,
  );

  const assignment =
    await getRescueAssignmentByRequestId(
      normalizedRequestId,
    );

  return {
    rescueRequest,
    assignment,
  };
}

module.exports = {
  acceptRescueRequestWithHistory,
};