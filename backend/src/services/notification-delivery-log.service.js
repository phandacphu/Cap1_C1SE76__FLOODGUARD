const { createHash } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("../config/firebase");

const NOTIFICATION_DELIVERY_LOGS_COLLECTION = "notification_delivery_logs";

const ALLOWED_LOG_STATUSES = ["queued", "sent", "failed"];

// Only fixed, reviewed codes may be persisted.
// Never pass raw provider messages or error.code directly.
const ALLOWED_RESPONSE_CODES = [
  "LOCAL_QUEUED",
  "PROVIDER_ACCEPTED",
  "NOTIFICATION_TRANSPORT_SEND_FAILED",
  "NOTIFICATION_TRANSPORT_TIMEOUT",
  "NOTIFICATION_OUTCOME_UNKNOWN",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_SERVER_ERROR",
  "PROVIDER_INVALID_TOKEN",
  "PROVIDER_REJECTED",
];
const ALLOWED_INPUT_FIELDS = [
  "notificationId",
  "eventId",
  "status",
  "retryCount",
  "providerResponseCode",
  "outcomeUnknown",
];

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
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
    throw new Error("Invalid notification log document ID");
  }

  return value.trim();
}

function buildNotificationCorrelationId(notificationId) {
  const normalizedId = normalizeDocumentId(notificationId);
  return `notification_${hash(normalizedId)}`;
}

function normalizeNotificationDeliveryLog(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((field) => !ALLOWED_INPUT_FIELDS.includes(field))
  ) {
    throw new Error("Invalid notification delivery log input");
  }

  const notificationId = normalizeDocumentId(input.notificationId);

  let eventId = input.eventId;

  // Older notifications may not have a business event ID.
  if (eventId === undefined || eventId === null) {
    eventId = `legacy:${hash(notificationId)}`;
  }

  if (
    typeof eventId !== "string" ||
    !eventId.trim() ||
    Buffer.byteLength(eventId.trim(), "utf8") > 256
  ) {
    throw new Error("Invalid notification log event ID");
  }

  if (!ALLOWED_LOG_STATUSES.includes(input.status)) {
    throw new Error("Invalid notification log status");
  }

  if (!Number.isSafeInteger(input.retryCount) || input.retryCount < 0) {
    throw new Error("Invalid notification log retry count");
  }

  if (!ALLOWED_RESPONSE_CODES.includes(input.providerResponseCode)) {
    throw new Error("Invalid notification log response code");
  }

  const outcomeUnknown = input.outcomeUnknown ?? false;

  if (typeof outcomeUnknown !== "boolean") {
    throw new Error("Invalid notification log outcome");
  }

  if (
    (input.status === "queued" &&
      input.providerResponseCode !== "LOCAL_QUEUED") ||
    (input.status === "sent" &&
      input.providerResponseCode !== "PROVIDER_ACCEPTED") ||
    (input.status === "failed" &&
      ["LOCAL_QUEUED", "PROVIDER_ACCEPTED"].includes(
        input.providerResponseCode,
      )) ||
    (outcomeUnknown && input.status !== "failed")
  ) {
    throw new Error("Notification log status and outcome do not match");
  }

  return {
    notificationId,
    eventId: eventId.trim(),
    correlationId: buildNotificationCorrelationId(notificationId),
    status: input.status,
    retryCount: input.retryCount,
    providerResponseCode: input.providerResponseCode,
    outcomeUnknown,
  };
}

function buildNotificationDeliveryLogId(notificationId, entryKey) {
  const normalizedId = normalizeDocumentId(notificationId);

  if (
    typeof entryKey !== "string" ||
    !entryKey.trim() ||
    Buffer.byteLength(entryKey.trim(), "utf8") > 256
  ) {
    throw new Error("Invalid notification log entry key");
  }

  return hash(JSON.stringify([normalizedId, entryKey.trim()]));
}

// Use the caller's transaction/batch so the log and state commit together.
// entryKey must be stable across transaction retries:
// "queued" for creation, or a delivery lease ID for an attempt outcome.
function stageNotificationDeliveryLog(writer, input, entryKey) {
  const data = normalizeNotificationDeliveryLog(input);

  const logId = buildNotificationDeliveryLogId(data.notificationId, entryKey);

  const logRef = db
    .collection(NOTIFICATION_DELIVERY_LOGS_COLLECTION)
    .doc(logId);

  writer.create(logRef, {
    ...data,
    timestamp: FieldValue.serverTimestamp(),
  });

  return {
    logId,
    correlationId: data.correlationId,
  };
}

module.exports = {
  NOTIFICATION_DELIVERY_LOGS_COLLECTION,
  ALLOWED_LOG_STATUSES,
  ALLOWED_RESPONSE_CODES,
  buildNotificationCorrelationId,
  buildNotificationDeliveryLogId,
  normalizeNotificationDeliveryLog,
  stageNotificationDeliveryLog,
};
