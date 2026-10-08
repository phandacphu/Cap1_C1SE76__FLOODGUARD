const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const RESCUE_REQUESTS_COLLECTION = "rescue_requests";

const ALLOWED_URGENCY_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
];

const ALLOWED_RESCUE_REQUEST_STATUSES = [
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

function normalizeLocation(location) {
  if (
    !location ||
    typeof location !== "object" ||
    Array.isArray(location) ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude)
  ) {
    throw new Error(
      "Rescue request location must contain numeric latitude and longitude",
    );
  }

  if (location.latitude < -90 || location.latitude > 90) {
    throw new Error(
      "Rescue request latitude must be between -90 and 90",
    );
  }

  if (
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    throw new Error(
      "Rescue request longitude must be between -180 and 180",
    );
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function normalizeRescueRequestData(requestData) {
  if (
    !requestData ||
    typeof requestData.residentId !== "string" ||
    !requestData.residentId.trim()
  ) {
    throw new Error("Rescue request resident ID is required");
  }

  if (!ALLOWED_URGENCY_LEVELS.includes(requestData.urgency)) {
    throw new Error("Invalid rescue request urgency");
  }

  if (
    !Number.isInteger(requestData.numberOfPeople) ||
    requestData.numberOfPeople < 1
  ) {
    throw new Error(
      "Rescue request numberOfPeople must be a positive integer",
    );
  }

  return {
    residentId: requestData.residentId.trim(),
    location: normalizeLocation(requestData.location),
    urgency: requestData.urgency,
    numberOfPeople: requestData.numberOfPeople,
    note: normalizeOptionalString(
      requestData.note,
      "Rescue request note",
    ),
  };
}

function createInvalidFilterError(message) {
  const error = new Error(message);
  error.code = "INVALID_RESCUE_REQUEST_FILTER";
  return error;
}

function normalizeFilterValue(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw createInvalidFilterError(
      `${fieldName} filter must be a string`,
    );
  }

  return value.trim() || null;
}

function normalizeRescueRequestFilters(filters) {
  if (filters === undefined || filters === null) {
    return {
      status: null,
      urgency: null,
    };
  }

  if (
    typeof filters !== "object" ||
    Array.isArray(filters)
  ) {
    throw createInvalidFilterError(
      "Rescue request filters must be an object",
    );
  }

  const status = normalizeFilterValue(
    filters.status,
    "Rescue request status",
  );

  const urgency = normalizeFilterValue(
    filters.urgency,
    "Rescue request urgency",
  );

  const severity = normalizeFilterValue(
    filters.severity,
    "Rescue request severity",
  );

  if (
    urgency &&
    severity &&
    urgency !== severity
  ) {
    throw createInvalidFilterError(
      "Rescue request urgency and severity filters must match",
    );
  }

  const normalizedUrgency = urgency || severity;

  if (
    status &&
    !ALLOWED_RESCUE_REQUEST_STATUSES.includes(status)
  ) {
    throw createInvalidFilterError(
      "Invalid rescue request status filter",
    );
  }

  if (
    normalizedUrgency &&
    !ALLOWED_URGENCY_LEVELS.includes(
      normalizedUrgency,
    )
  ) {
    throw createInvalidFilterError(
      "Invalid rescue request urgency filter",
    );
  }

  return {
    status,
    urgency: normalizedUrgency,
  };
}

async function getRescueRequestById(requestId) {
  const requestDoc = await db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc(requestId)
    .get();

  if (!requestDoc.exists) {
    return null;
  }

  return {
    id: requestDoc.id,
    ...requestDoc.data(),
  };
}

async function createRescueRequest(requestData) {
  const normalizedData =
    normalizeRescueRequestData(requestData);

  const requestRef = db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc();

  await requestRef.set({
    ...normalizedData,
    status: "submitted",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return getRescueRequestById(requestRef.id);
}

async function setRescueRequestById(
  requestId,
  requestData,
) {
  if (
    typeof requestId !== "string" ||
    !requestId.trim()
  ) {
    throw new Error("Rescue request ID is required");
  }

  const normalizedData =
    normalizeRescueRequestData(requestData);

  const requestRef = db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .doc(requestId.trim());

  const existingRequest = await requestRef.get();

  await requestRef.set(
    {
      ...normalizedData,
      status: existingRequest.exists
        ? existingRequest.data().status || "submitted"
        : "submitted",
      createdAt: existingRequest.exists
        ? existingRequest.data().createdAt
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {
      merge: false,
    },
  );

  return getRescueRequestById(requestRef.id);
}

function getTimestampMillis(value) {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  const millis = new Date(value).getTime();

  return Number.isFinite(millis) ? millis : 0;
}

async function getRescueRequestsForUser(
  user,
  filters,
) {
  if (
    !user ||
    typeof user.id !== "string" ||
    !user.id.trim()
  ) {
    throw new Error("Authenticated user ID is required");
  }

  const normalizedFilters =
    normalizeRescueRequestFilters(filters);

  const snapshot = await db
    .collection(RESCUE_REQUESTS_COLLECTION)
    .get();

  return snapshot.docs
    .map((requestDoc) => ({
      id: requestDoc.id,
      ...requestDoc.data(),
    }))
    .filter(
      (request) =>
        user.role !== "resident" ||
        request.residentId === user.id,
    )
    .filter(
      (request) =>
        !normalizedFilters.status ||
        request.status === normalizedFilters.status,
    )
    .filter(
      (request) =>
        !normalizedFilters.urgency ||
        request.urgency === normalizedFilters.urgency,
    )
    .sort(
      (firstRequest, secondRequest) =>
        getTimestampMillis(secondRequest.createdAt) -
          getTimestampMillis(firstRequest.createdAt) ||
        secondRequest.id.localeCompare(firstRequest.id),
    );
}

module.exports = {
  RESCUE_REQUESTS_COLLECTION,
  ALLOWED_URGENCY_LEVELS,
  ALLOWED_RESCUE_REQUEST_STATUSES,
  createRescueRequest,
  setRescueRequestById,
  getRescueRequestById,
  normalizeRescueRequestData,
  normalizeRescueRequestFilters,
  getRescueRequestsForUser,
  getTimestampMillis,
};