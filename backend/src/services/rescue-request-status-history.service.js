const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const {
  getRescueRequestById,
} = require("./rescue-request.service");

const RESCUE_REQUEST_STATUS_HISTORY_COLLECTION =
  "rescue_request_status_history";

const ALLOWED_SOS_STATUSES = [
  "submitted",
  "received",
  "in_progress",
  "assisted",
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

function normalizeStatus(value, fieldName) {
  if (
    typeof value !== "string" ||
    !ALLOWED_SOS_STATUSES.includes(value)
  ) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return value;
}

function normalizeRescueRequestStatusHistoryData(
  historyData,
) {
  if (
    !historyData ||
    typeof historyData.requestId !== "string" ||
    !historyData.requestId.trim()
  ) {
    throw new Error(
      "Rescue request status history request ID is required",
    );
  }

  if (
    typeof historyData.changedBy !== "string" ||
    !historyData.changedBy.trim()
  ) {
    throw new Error(
      "Rescue request status history changedBy is required",
    );
  }

  const oldStatus =
    historyData.oldStatus === undefined ||
    historyData.oldStatus === null
      ? null
      : normalizeStatus(
          historyData.oldStatus,
          "old rescue request status",
        );

  const newStatus = normalizeStatus(
    historyData.newStatus,
    "new rescue request status",
  );

  if (oldStatus === null && newStatus !== "submitted") {
    throw new Error(
      "Initial rescue request status must be submitted",
    );
  }

  if (oldStatus === newStatus) {
    throw new Error(
      "Rescue request status must change",
    );
  }

  return {
    requestId: historyData.requestId.trim(),
    oldStatus,
    newStatus,
    changedBy: historyData.changedBy.trim(),
    note: normalizeOptionalString(
      historyData.note,
      "Rescue request note",
    ),
  };
}

async function getRescueRequestStatusHistoryById(
  historyId,
) {
  const historyDoc = await db
    .collection(RESCUE_REQUEST_STATUS_HISTORY_COLLECTION)
    .doc(historyId)
    .get();

  if (!historyDoc.exists) {
    return null;
  }

  return {
    ...historyDoc.data(),
    id: historyDoc.id,
  };
}

async function ensureRescueRequestExists(requestId) {
  const rescueRequest =
    await getRescueRequestById(requestId);

  if (!rescueRequest) {
    throw new Error(
      "Referenced rescue request does not exist",
    );
  }
}

async function createRescueRequestStatusHistory(
  historyData,
) {
  const normalizedData =
    normalizeRescueRequestStatusHistoryData(historyData);

  await ensureRescueRequestExists(
    normalizedData.requestId,
  );

  const historyRef = db
    .collection(RESCUE_REQUEST_STATUS_HISTORY_COLLECTION)
    .doc();

  await historyRef.set({
    ...normalizedData,
    changedAt: FieldValue.serverTimestamp(),
  });

  return getRescueRequestStatusHistoryById(historyRef.id);
}

async function setRescueRequestStatusHistoryById(
  historyId,
  historyData,
) {
  if (
    typeof historyId !== "string" ||
    !historyId.trim()
  ) {
    throw new Error(
      "Rescue request status history ID is required",
    );
  }

  const normalizedData =
    normalizeRescueRequestStatusHistoryData(historyData);

  await ensureRescueRequestExists(
    normalizedData.requestId,
  );

  const historyRef = db
    .collection(RESCUE_REQUEST_STATUS_HISTORY_COLLECTION)
    .doc(historyId.trim());

  await historyRef.set(
    {
      ...normalizedData,
      changedAt: FieldValue.serverTimestamp(),
    },
    {
      merge: false,
    },
  );

  return getRescueRequestStatusHistoryById(historyRef.id);
}

async function getRescueRequestStatusHistoryByRequestId(
  requestId,
) {
  if (
    typeof requestId !== "string" ||
    !requestId.trim() ||
    requestId.trim().includes("/") ||
    requestId.trim() === "." ||
    requestId.trim() === ".." ||
    Buffer.byteLength(requestId.trim(), "utf8") > 1500
  ) {
    throw new Error("Invalid rescue request ID");
  }

  const snapshot = await db
    .collection(
      RESCUE_REQUEST_STATUS_HISTORY_COLLECTION,
    )
    .where("requestId", "==", requestId.trim())
    .get();

  return snapshot.docs
    .map((historyDoc) => ({
      ...historyDoc.data(),
      id: historyDoc.id,
    }))
    .sort((firstHistory, secondHistory) => {
      const firstTime = firstHistory.changedAt;
      const secondTime = secondHistory.changedAt;

      const secondsDifference =
        firstTime.seconds - secondTime.seconds;

      if (secondsDifference !== 0) {
        return secondsDifference;
      }

      const nanosDifference =
        firstTime.nanoseconds - secondTime.nanoseconds;

      if (nanosDifference !== 0) {
        return nanosDifference;
      }

      if (firstHistory.id < secondHistory.id) {
        return -1;
      }

      if (firstHistory.id > secondHistory.id) {
        return 1;
      }

      return 0;
    });
}

module.exports = {
  RESCUE_REQUEST_STATUS_HISTORY_COLLECTION,
  ALLOWED_SOS_STATUSES,
  createRescueRequestStatusHistory,
  setRescueRequestStatusHistoryById,
  getRescueRequestStatusHistoryById,
  normalizeRescueRequestStatusHistoryData,
  getRescueRequestStatusHistoryByRequestId,
};