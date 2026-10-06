const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const RESCUE_REQUESTS_COLLECTION = "rescue_requests";

const ALLOWED_URGENCY_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
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
    typeof location.latitude !== "number" ||
    typeof location.longitude !== "number"
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

module.exports = {
  RESCUE_REQUESTS_COLLECTION,
  ALLOWED_URGENCY_LEVELS,
  createRescueRequest,
  setRescueRequestById,
  getRescueRequestById,
  normalizeRescueRequestData,
};