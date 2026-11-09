const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const {
  RESCUE_REQUESTS_COLLECTION,
  getRescueRequestById,
} = require("./rescue-request.service");
const {
  RESCUE_REQUEST_STATUS_HISTORY_COLLECTION,
  normalizeRescueRequestStatusHistoryData,
} = require("./rescue-request-status-history.service");
const {
  prepareSosStatusNotification,
  stageSosStatusNotification,
} = require("./sos-status-notification.service");
const {
  normalizeAuditLogData,
  AUDIT_LOGS_COLLECTION,
} = require("./audit-log.service");
const {
  ACTIVE_SOS_STATUSES,
  ACTIVE_SOS_COLLECTION,
  activeSosLockId,
  validDocumentId,
  sosError,
  ensureFields,
} = require("./sos-contract");

function normalizeStatusUpdate(input) {
  ensureFields(input, ["status", "note"], "INVALID_STATUS_UPDATE");
  if (input.status !== "assisted")
    throw sosError(
      "INVALID_STATUS_UPDATE",
      "Only assisted (Đã cứu) is supported",
    );
  if (input.note != null && typeof input.note !== "string")
    throw sosError("INVALID_STATUS_UPDATE", "note must be a string or null");
  const note = input.note?.trim() || null;
  if (note && note.length > 200)
    throw sosError(
      "INVALID_STATUS_UPDATE",
      "note must not exceed 200 characters",
    );
  return { status: "assisted", note };
}

async function updateRescueStatusWithHistory(requestId, rescueStaffId, input) {
  if (!validDocumentId(rescueStaffId))
    throw sosError("STATUS_AUTH_REQUIRED", "Authentication is required", 401);
  if (!validDocumentId(requestId))
    throw sosError("INVALID_STATUS_REQUEST_ID", "Invalid rescue request ID");
  const data = normalizeStatusUpdate(input);
  const normalizedStaffId = rescueStaffId.trim();
  const userRef = db.collection("users").doc(normalizedStaffId);
  const requestRef = db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc(requestId.trim());
  // Stable document IDs also survive transaction retries.
  const historyRef = db
    .collection(RESCUE_REQUEST_STATUS_HISTORY_COLLECTION)
    .doc();
  const auditRef = db.collection(AUDIT_LOGS_COLLECTION).doc();
  await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists)
      throw sosError(
        "STATUS_USER_NOT_FOUND",
        "Authenticated user no longer exists",
        401,
      );
    if (userDoc.data().isActive !== true)
      throw sosError("STATUS_ACCOUNT_INACTIVE", "Account is inactive", 403);
    if (userDoc.data().role !== "rescue")
      throw sosError(
        "STATUS_ROLE_FORBIDDEN",
        "Only rescue staff can confirm a rescue",
        403,
      );
    const requestDoc = await transaction.get(requestRef);
    if (!requestDoc.exists)
      throw sosError(
        "STATUS_REQUEST_NOT_FOUND",
        "Rescue request not found",
        404,
      );
    const request = requestDoc.data();
    if (!ACTIVE_SOS_STATUSES.includes(request.status)) {
      throw sosError(
        "STATUS_TRANSITION_CONFLICT",
        "SOS is already completed or is not active",
        409,
      );
    }
    let lockRef = null;
    let lock = null;
    if (validDocumentId(request.residentId)) {
      lockRef = db
        .collection(ACTIVE_SOS_COLLECTION)
        .doc(activeSosLockId(request.residentId));
      lock = await transaction.get(lockRef);
    }
    const history = normalizeRescueRequestStatusHistoryData({
      requestId: requestRef.id,
      oldStatus: request.status,
      newStatus: "assisted",
      changedBy: normalizedStaffId,
      note: data.note,
    });
    const prepared = await prepareSosStatusNotification(transaction, {
      requestId: requestRef.id,
      request,
      historyId: historyRef.id,
      newStatus: "assisted",
    });
    const audit = normalizeAuditLogData({
      actor: { id: normalizedStaffId, role: "rescue" },
      action: "rescue_request.complete",
      target: { type: "rescue_request", id: requestRef.id },
      metadata: {
        source: "api",
        outcome: "success",
        changedFields: ["status"],
      },
    });
    // Completion, history, audit, notification and lock release commit together.
    transaction.update(requestRef, {
      status: "assisted",
      completedBy: normalizedStaffId,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (lock?.exists && lock.data().requestId === requestRef.id)
      transaction.delete(lockRef);
    transaction.create(historyRef, {
      ...history,
      changedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      ...audit,
      timestamp: FieldValue.serverTimestamp(),
    });
    stageSosStatusNotification(transaction, prepared);
  });
  return {
    rescueRequest: await getRescueRequestById(requestRef.id),
    assignment: null,
  };
}

module.exports = { normalizeStatusUpdate, updateRescueStatusWithHistory };
