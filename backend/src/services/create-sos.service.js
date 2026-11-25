const { createHash } = require("node:crypto");
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
  ACTIVE_SOS_STATUSES,
  ACTIVE_SOS_COLLECTION,
  activeSosLockId,
  normalizeSosInput,
  sosError,
} = require("./sos-contract");

async function findActiveSosByResidentId(residentId) {
  const snapshot = await db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .where("residentId", "==", residentId)
    .get();
  const doc = snapshot.docs.find((item) =>
    ACTIVE_SOS_STATUSES.includes(item.data().status),
  );
  return doc ? { ...doc.data(), id: doc.id } : null;
}

async function createSosWithHistory(residentId, input, sms = null) {
  const data = normalizeSosInput(residentId, input);
  const requestRef = db.collection(RESCUE_REQUESTS_COLLECTION).doc();
  const historyRef = db
    .collection(RESCUE_REQUEST_STATUS_HISTORY_COLLECTION)
    .doc();
  const lockRef = db
    .collection(ACTIVE_SOS_COLLECTION)
    .doc(activeSosLockId(data.residentId));
  const userRef = db.collection("users").doc(data.residentId);

  const submissionRef = data.clientRequestId ? db.collection("sos_submissions").doc(
    createHash("sha256").update(`${data.residentId}:${data.clientRequestId}`).digest("hex"),
  ) : null;
  const { clientRequestId, ...payload } = data;
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  let resultId = requestRef.id;
  await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists)
      throw sosError(
        "SOS_USER_NOT_FOUND",
        "Authenticated user no longer exists",
        401,
      );
    if (
      userDoc.data().isActive !== true ||
      userDoc.data().role !== "resident"
    ) {
      throw sosError(
        "SOS_ROLE_FORBIDDEN",
        "Only active residents can create SOS requests",
        403,
      );
    }
    resultId = requestRef.id;
    // Every new writer reads/writes this per-Resident lock. The query also
    // catches pre-migration active requests which have no lock document.
    await transaction.get(lockRef);
    const existing = await transaction.get(
      db
        .collection(RESCUE_REQUESTS_COLLECTION)
        .where("residentId", "==", data.residentId),
    );
    if (submissionRef) {
      const prior = await transaction.get(submissionRef);
      if (prior.exists) {
        if (prior.data().payloadHash !== payloadHash)
          throw sosError("SOS_SUBMISSION_CONFLICT", "Same SOS reference has different content", 409);
        resultId = prior.data().requestId;
        return;
      }
    }
    const active = existing.docs.find((doc) =>
      ACTIVE_SOS_STATUSES.includes(doc.data().status),
    );
    if (active) {
      const error = sosError(
        "DUPLICATE_SOS_REQUEST",
        "An active SOS request already exists for this resident",
        409,
      );
      error.requestId = active.id;
      throw error;
    }
    const history = normalizeRescueRequestStatusHistoryData({
      requestId: requestRef.id,
      oldStatus: null,
      newStatus: "submitted",
      changedBy: data.residentId,
      note: "SOS request submitted",
    });
    transaction.create(requestRef, {
      ...data,
      schemaVersion: 2,
      source: sms ? "sms" : "api",
      ...(sms ? { smsSenderPhone: sms.senderPhone, smsReceivedAt: sms.receivedAt } : {}),
      status: "submitted",
      initialLocation: data.location,
      // The form does not provide a capture timestamp. Do not invent one.
      locationCapturedAt: sms?.capturedAt ?? null,
      locationReceivedAt: FieldValue.serverTimestamp(),
      completedBy: null,
      completedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(historyRef, {
      ...history,
      changedAt: FieldValue.serverTimestamp(),
    });
    if (submissionRef) transaction.create(submissionRef, { requestId: requestRef.id, payloadHash });
    transaction.set(lockRef, {
      requestId: requestRef.id,
      residentId: data.residentId,
    });
  });
  return getRescueRequestById(resultId);
}

module.exports = {
  ACTIVE_SOS_STATUSES,
  createSosWithHistory,
  findActiveSosByResidentId,
};
