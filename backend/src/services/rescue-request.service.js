const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const { normalizeSosFilters, matchesSosFilters } = require("./sos-contract");

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

const ALLOWED_RESCUE_REQUEST_SORTS = ["newest", "oldest"];

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

function normalizeRescueRequestFilters(filters) {
  return normalizeSosFilters(filters ?? {});
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
    ...requestDoc.data(),
    id: requestDoc.id,
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

function compareRescueRequests(
  firstRequest,
  secondRequest,
  sort,
) {
  const createdAtDifference =
    getTimestampMillis(secondRequest.createdAt) -
    getTimestampMillis(firstRequest.createdAt);

  if (createdAtDifference !== 0) {
    return sort === "oldest"
      ? -createdAtDifference
      : createdAtDifference;
  }

  return secondRequest.id.localeCompare(
    firstRequest.id,
  );
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
      ...requestDoc.data(),
      id: requestDoc.id,
    }))
    .filter(
      (request) =>
        user.role !== "resident" ||
        request.residentId === user.id,
    )
    .filter((request) => matchesSosFilters(request, normalizedFilters))
    .sort((firstRequest, secondRequest) =>
      compareRescueRequests(
        firstRequest,
        secondRequest,
        normalizedFilters.sort,
      ),
    );
}

module.exports = {
  RESCUE_REQUESTS_COLLECTION,
  ALLOWED_URGENCY_LEVELS,
  ALLOWED_RESCUE_REQUEST_STATUSES,
  ALLOWED_RESCUE_REQUEST_SORTS,
  createRescueRequest,
  setRescueRequestById,
  getRescueRequestById,
  normalizeRescueRequestData,
  normalizeRescueRequestFilters,
  getRescueRequestsForUser,
  getTimestampMillis,
  compareRescueRequests,
};