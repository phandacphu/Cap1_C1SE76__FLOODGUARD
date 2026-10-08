const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const {
  RESCUE_REQUESTS_COLLECTION,
  normalizeRescueRequestData,
  getRescueRequestById,
} = require("./rescue-request.service");

const {
  RESCUE_REQUEST_STATUS_HISTORY_COLLECTION,
  normalizeRescueRequestStatusHistoryData,
} = require("./rescue-request-status-history.service");

const ACTIVE_SOS_STATUSES = [
  "submitted",
  "received",
  "in_progress",
];

async function findActiveSosByResidentId(residentId) {
  const snapshot = await db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .where("residentId", "==", residentId)
    .get();

  const activeDoc = snapshot.docs.find((doc) =>
    ACTIVE_SOS_STATUSES.includes(doc.data().status),
  );

  if (!activeDoc) {
    return null;
  }

  return {
    id: activeDoc.id,
    ...activeDoc.data(),
  };
}

async function createSosWithHistory(residentId, input) {
  let normalizedData;

  // Only input validation errors should become HTTP 400.
  try {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      throw new Error("SOS request body must be an object");
    }

    const allowedFields = [
      "location",
      "urgency",
      "numberOfPeople",
      "note",
    ];

    const unsupportedField = Object.keys(input).find(
      (field) => !allowedFields.includes(field),
    );

    if (unsupportedField !== undefined) {
      throw new Error(
        `Unsupported request field: ${unsupportedField}`,
      );
    }

    if (
      !input.location ||
      !Number.isFinite(input.location.latitude) ||
      !Number.isFinite(input.location.longitude)
    ) {
      throw new Error(
        "Rescue request location must contain finite numeric latitude and longitude",
      );
    }

    normalizedData = normalizeRescueRequestData({
      residentId,
      location: input.location,
      urgency: input.urgency,
      numberOfPeople: input.numberOfPeople,
      note: input.note,
    });
  } catch (error) {
    error.code = "INVALID_SOS_INPUT";
    throw error;
  }

  const existingActiveSos =
    await findActiveSosByResidentId(
      normalizedData.residentId,
    );

  if (existingActiveSos) {
    const error = new Error(
      "An active SOS request already exists for this resident",
    );

    error.code = "DUPLICATE_SOS_REQUEST";
    throw error;
  }

  const requestRef = db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc();

  const historyRef = db
    .collection(RESCUE_REQUEST_STATUS_HISTORY_COLLECTION)
    .doc();

  const initialHistory =
    normalizeRescueRequestStatusHistoryData({
      requestId: requestRef.id,
      oldStatus: null,
      newStatus: "submitted",
      changedBy: normalizedData.residentId,
      note: "SOS request submitted",
    });

  const batch = db.batch();

  batch.create(requestRef, {
    ...normalizedData,
    status: "submitted",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.create(historyRef, {
    ...initialHistory,
    changedAt: FieldValue.serverTimestamp(),
  });

  // Both documents are saved together or neither is saved.
  await batch.commit();

  return getRescueRequestById(requestRef.id);
}

module.exports = {
  ACTIVE_SOS_STATUSES,
  createSosWithHistory,
  findActiveSosByResidentId,
};