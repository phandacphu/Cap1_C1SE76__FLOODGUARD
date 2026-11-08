const { db } = require("../config/firebase");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const {
  RESCUE_REQUESTS_COLLECTION,
  getRescueRequestById,
} = require("./rescue-request.service");
const {
  ACTIVE_SOS_STATUSES,
  sosError,
  validDocumentId,
  ensureFields,
  normalizeSosLocation,
  parseIsoDate,
  timestampMillis,
} = require("./sos-contract");

// Allow modest device clock skew; old offline samples cannot overwrite a
// later capture. No route/GPS track is stored, only initial + latest position.
const MAX_FUTURE_SKEW_MS = 120000;

async function updateSosLocation(requestId, residentId, input) {
  if (!validDocumentId(residentId))
    throw sosError("SOS_AUTH_REQUIRED", "Authentication is required", 401);
  if (!validDocumentId(requestId))
    throw sosError("INVALID_SOS_REQUEST_ID", "Invalid SOS ID");
  const code = "INVALID_SOS_LOCATION";
  ensureFields(input, ["location", "capturedAt"], code);
  const location = normalizeSosLocation(input.location, code);
  if (input.capturedAt === undefined)
    throw sosError(code, "capturedAt is required");
  const capturedMillis = parseIsoDate(input.capturedAt, "capturedAt", code);
  if (capturedMillis > Date.now() + MAX_FUTURE_SKEW_MS) {
    throw sosError(code, "capturedAt is too far in the future");
  }
  const userRef = db.collection("users").doc(residentId.trim());
  const ref = db.collection(RESCUE_REQUESTS_COLLECTION).doc(requestId.trim());
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
        "Only active residents can update their SOS location",
        403,
      );
    }
    const doc = await transaction.get(ref);
    if (!doc.exists)
      throw sosError("SOS_REQUEST_NOT_FOUND", "SOS not found", 404);
    const request = doc.data();
    if (request.residentId !== residentId.trim())
      throw sosError(
        "SOS_OWNER_FORBIDDEN",
        "SOS belongs to another resident",
        403,
      );
    if (!ACTIVE_SOS_STATUSES.includes(request.status))
      throw sosError("SOS_NOT_ACTIVE", "SOS is no longer active", 409);
    // First update must be captured after submission. Once device capture
    // time exists, order by it rather than network arrival time.
    const previous = timestampMillis(
      request.locationCapturedAt ?? request.createdAt,
    );
    if (!Number.isFinite(previous))
      throw sosError(
        "SOS_LOCATION_TIME_UNAVAILABLE",
        "Stored SOS has no usable position timestamp",
        409,
      );
    if (capturedMillis <= previous)
      throw sosError(
        "STALE_SOS_LOCATION",
        "Location is not newer than the stored position",
        409,
      );
    transaction.update(ref, {
      location,
      locationCapturedAt: Timestamp.fromMillis(capturedMillis),
      locationReceivedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return getRescueRequestById(ref.id);
}

module.exports = { MAX_FUTURE_SKEW_MS, updateSosLocation };
