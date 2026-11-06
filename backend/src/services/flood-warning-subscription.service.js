const { createHash } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("../config/firebase");

const SUBSCRIPTIONS_COLLECTION = "flood_warning_subscriptions";

function subscriptionError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeDocumentId(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim() === "." ||
    value.trim() === ".." ||
    value.trim().includes("/") ||
    /^__.*__$/.test(value.trim()) ||
    Buffer.byteLength(value.trim(), "utf8") > 1500
  ) {
    throw subscriptionError(
      "INVALID_SUBSCRIPTION_ID",
      "Invalid user or area ID",
      400,
    );
  }

  return value.trim();
}

function buildSubscriptionId(recipientId, areaId) {
  return createHash("sha256")
    .update(JSON.stringify([recipientId, areaId]))
    .digest("hex");
}

function ensureEligibleUser(userDoc) {
  if (!userDoc.exists) {
    throw subscriptionError(
      "SUBSCRIPTION_AUTH_REQUIRED",
      "Authenticated user no longer exists",
      401,
    );
  }

  const user = userDoc.data();

  if (
    user.isActive !== true ||
    !["resident", "rescue_staff", "admin"].includes(user.role)
  ) {
    throw subscriptionError(
      "SUBSCRIPTION_FORBIDDEN",
      "Account is not allowed to manage subscriptions",
      403,
    );
  }
}

async function getFloodWarningSubscription(recipientId, areaId) {
  const normalizedRecipientId = normalizeDocumentId(recipientId);
  const normalizedAreaId = normalizeDocumentId(areaId);

  const userRef = db.collection("users").doc(normalizedRecipientId);
  const subscriptionRef = db
    .collection(SUBSCRIPTIONS_COLLECTION)
    .doc(buildSubscriptionId(normalizedRecipientId, normalizedAreaId));

  return db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    ensureEligibleUser(userDoc);

    const subscriptionDoc = await transaction.get(subscriptionRef);

    return {
      areaId: normalizedAreaId,
      enabled:
        subscriptionDoc.exists && subscriptionDoc.data().enabled === true,
    };
  });
}

async function setFloodWarningSubscription(recipientId, areaId, enabled) {
  const normalizedRecipientId = normalizeDocumentId(recipientId);
  const normalizedAreaId = normalizeDocumentId(areaId);

  if (typeof enabled !== "boolean") {
    throw subscriptionError(
      "INVALID_SUBSCRIPTION_ENABLED",
      "enabled must be a boolean",
      400,
    );
  }

  const userRef = db.collection("users").doc(normalizedRecipientId);
  const areaRef = db.collection("flood_areas").doc(normalizedAreaId);
  const subscriptionRef = db
    .collection(SUBSCRIPTIONS_COLLECTION)
    .doc(buildSubscriptionId(normalizedRecipientId, normalizedAreaId));

  return db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    ensureEligibleUser(userDoc);

    const subscriptionDoc = await transaction.get(subscriptionRef);

    // Unsubscribing remains possible after the area was deleted.
    if (enabled) {
      const areaDoc = await transaction.get(areaRef);

      if (!areaDoc.exists) {
        throw subscriptionError(
          "SUBSCRIPTION_AREA_NOT_FOUND",
          "Flood area not found",
          404,
        );
      }
    }

    const existing = subscriptionDoc.exists ? subscriptionDoc.data() : null;

    // Repeating the same request must not change timestamps.
    const unchanged =
      existing !== null &&
      existing.recipientId === normalizedRecipientId &&
      existing.areaId === normalizedAreaId &&
      existing.enabled === enabled;

    if (!unchanged && (existing !== null || enabled)) {
      transaction.set(subscriptionRef, {
        recipientId: normalizedRecipientId,
        areaId: normalizedAreaId,
        enabled,
        createdAt: existing?.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      areaId: normalizedAreaId,
      enabled,
    };
  });
}

module.exports = {
  SUBSCRIPTIONS_COLLECTION,
  buildSubscriptionId,
  getFloodWarningSubscription,
  setFloodWarningSubscription,
};
