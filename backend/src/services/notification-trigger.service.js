const { createHash } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");

const { db } = require("../config/firebase");

const {
  NOTIFICATIONS_COLLECTION,
  normalizeNotificationData,
} = require("./notification.service");

const {
  stageNotificationDeliveryLog,
} = require("./notification-delivery-log.service");

function normalizeEventId(eventId) {
  if (
    typeof eventId !== "string" ||
    !eventId.trim() ||
    Buffer.byteLength(eventId.trim(), "utf8") > 256
  ) {
    throw new Error("Invalid notification eventId");
  }

  return eventId.trim();
}

function buildEventNotificationId(eventId, recipientId) {
  const hash = createHash("sha256")
    .update(JSON.stringify([eventId, recipientId]))
    .digest("hex");

  return `event_${hash}`;
}

function isAlreadyExistsError(error) {
  return (
    error.code === 6 ||
    error.code === "ALREADY_EXISTS" ||
    error.code === "already-exists"
  );
}

async function triggerNotification(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Notification trigger input must be an object");
  }

  const eventId = normalizeEventId(input.eventId);
  const data = normalizeNotificationData(input);

  const notificationId = buildEventNotificationId(eventId, data.recipientId);

  const notificationRef = db
    .collection(NOTIFICATIONS_COLLECTION)
    .doc(notificationId);

  try {
    // Create notification and queued log atomically.
    const batch = db.batch();

    batch.create(notificationRef, {
      ...data,
      eventId,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
      deliveryStatus: "pending",
      retryCount: 0,
      lastAttemptAt: null,
      nextRetryAt: null,
    });

    stageNotificationDeliveryLog(
      batch,
      {
        notificationId,
        eventId,
        status: "queued",
        retryCount: 0,
        providerResponseCode: "LOCAL_QUEUED",
      },
      "queued",
    );

    await batch.commit();

    const savedDoc = await notificationRef.get();

    return {
      created: true,
      notification: {
        id: savedDoc.id,
        ...savedDoc.data(),
      },
    };
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    const existingDoc = await notificationRef.get();

    if (!existingDoc.exists) {
      throw error;
    }

    const existing = existingDoc.data();

    const isSameEvent =
      existing.eventId === eventId &&
      existing.recipientId === data.recipientId &&
      existing.type === data.type &&
      existing.title === data.title &&
      existing.body === data.body &&
      existing.relatedEntity?.type === data.relatedEntity.type &&
      existing.relatedEntity?.id === data.relatedEntity.id;

    if (!isSameEvent) {
      const conflict = new Error(
        "Notification eventId conflicts with existing data",
      );
      conflict.code = "NOTIFICATION_EVENT_CONFLICT";
      throw conflict;
    }

    return {
      created: false,
      notification: {
        id: existingDoc.id,
        ...existing,
      },
    };
  }
}

module.exports = {
  normalizeEventId,
  buildEventNotificationId,
  triggerNotification,
};
