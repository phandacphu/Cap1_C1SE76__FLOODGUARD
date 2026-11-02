const { FieldPath } = require("firebase-admin/firestore");
const { db } = require("../config/firebase");

const {
  NOTIFICATION_DELIVERY_LOGS_COLLECTION,
  normalizeNotificationDeliveryLog,
} = require("./notification-delivery-log.service");

function logLookupError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function invalidQuery() {
  return logLookupError(
    "INVALID_NOTIFICATION_LOG_QUERY",
    "Provide one lookup key and valid pagination parameters",
    400,
  );
}

function isValidDocumentId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !/^__.*__$/.test(value) &&
    Buffer.byteLength(value, "utf8") <= 1500
  );
}

async function authorizeAdmin(actorId) {
  if (!isValidDocumentId(actorId)) {
    throw logLookupError(
      "NOTIFICATION_LOG_AUTH_REQUIRED",
      "Authentication is required",
      401,
    );
  }

  const userDoc = await db.collection("users").doc(actorId).get();

  if (!userDoc.exists) {
    throw logLookupError(
      "NOTIFICATION_LOG_AUTH_REQUIRED",
      "Authenticated user no longer exists",
      401,
    );
  }

  const user = userDoc.data();

  if (user.role !== "admin" || user.isActive !== true) {
    throw logLookupError(
      "NOTIFICATION_LOG_FORBIDDEN",
      "Only active admins can view notification logs",
      403,
    );
  }
}

function normalizeLookupQuery(query) {
  const lookupKeys = ["notificationId", "correlationId", "eventId"];

  const allowedFields = [...lookupKeys, "limit", "cursor"];

  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query) ||
    Object.keys(query).some((field) => !allowedFields.includes(field))
  ) {
    throw invalidQuery();
  }

  const selectedKeys = lookupKeys.filter((field) =>
    Object.hasOwn(query, field),
  );

  if (selectedKeys.length !== 1) {
    throw invalidQuery();
  }

  const field = selectedKeys[0];
  const value = query[field];

  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw invalidQuery();
  }

  if (
    (field === "notificationId" && !isValidDocumentId(value)) ||
    (field === "correlationId" && !/^notification_[a-f0-9]{64}$/.test(value)) ||
    (field === "eventId" && Buffer.byteLength(value, "utf8") > 256)
  ) {
    throw invalidQuery();
  }

  let limit = 20;

  if (query.limit !== undefined) {
    if (
      typeof query.limit !== "string" ||
      !/^[1-9]\d{0,2}$/.test(query.limit)
    ) {
      throw invalidQuery();
    }

    limit = Number(query.limit);

    if (limit > 100) {
      throw invalidQuery();
    }
  }

  const cursor = query.cursor ?? null;

  if (
    cursor !== null &&
    (typeof cursor !== "string" || !/^[a-f0-9]{64}$/.test(cursor))
  ) {
    throw invalidQuery();
  }

  return { field, value, limit, cursor };
}

function toClientLog(doc) {
  const stored = doc.data();

  // Explicit field selection excludes any unrelated stored payload.
  const safe = normalizeNotificationDeliveryLog({
    notificationId: stored.notificationId,
    eventId: stored.eventId,
    status: stored.status,
    retryCount: stored.retryCount,
    providerResponseCode: stored.providerResponseCode,
    outcomeUnknown: stored.outcomeUnknown,
  });

  if (!stored.timestamp || typeof stored.timestamp.toDate !== "function") {
    throw new Error("Invalid stored notification log timestamp");
  }

  return {
    id: doc.id,
    ...safe,
    timestamp: stored.timestamp.toDate().toISOString(),
  };
}

async function getNotificationLogsForAdmin(actorId, query) {
  await authorizeAdmin(actorId);

  const filters = normalizeLookupQuery(query);

  let lookup = db
    .collection(NOTIFICATION_DELIVERY_LOGS_COLLECTION)
    .where(filters.field, "==", filters.value)
    .orderBy(FieldPath.documentId())
    .limit(filters.limit + 1);

  if (filters.cursor !== null) {
    lookup = lookup.startAfter(filters.cursor);
  }

  const snapshot = await lookup.get();
  const selected = snapshot.docs.slice(0, filters.limit);
  const hasMore = snapshot.size > filters.limit;

  return {
    logs: selected.map(toClientLog),
    nextCursor: hasMore ? selected[selected.length - 1].id : null,
  };
}

module.exports = {
  normalizeLookupQuery,
  getNotificationLogsForAdmin,
};
