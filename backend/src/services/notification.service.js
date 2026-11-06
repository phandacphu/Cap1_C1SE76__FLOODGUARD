const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const {
  stageNotificationDeliveryLog,
} = require("./notification-delivery-log.service");

const NOTIFICATIONS_COLLECTION = "notifications";
const ALLOWED_NOTIFICATION_TYPES = ["flood_warning", "sos_status"];
const RELATED_ENTITY_TYPES = {
  flood_warning: "flood_alert",
  sos_status: "rescue_request",
};

function isValidDocumentId(value) {
  if (typeof value !== "string") {
    return false;
  }

  const id = value.trim();

  return (
    id.length > 0 &&
    id !== "." &&
    id !== ".." &&
    !id.includes("/") &&
    !/^__.*__$/.test(id) &&
    Buffer.byteLength(id, "utf8") <= 1500
  );
}

function normalizeNotificationData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Notification data must be an object");
  }

  if (!isValidDocumentId(data.recipientId)) {
    throw new Error("Notification recipientId is required");
  }

  if (!ALLOWED_NOTIFICATION_TYPES.includes(data.type)) {
    throw new Error("Invalid notification type");
  }

  if (typeof data.title !== "string" || !data.title.trim()) {
    throw new Error("Notification title is required");
  }

  if (typeof data.body !== "string" || !data.body.trim()) {
    throw new Error("Notification body is required");
  }

  const relatedEntity = data.relatedEntity;

  if (
    !relatedEntity ||
    typeof relatedEntity !== "object" ||
    Array.isArray(relatedEntity) ||
    relatedEntity.type !== RELATED_ENTITY_TYPES[data.type] ||
    !isValidDocumentId(relatedEntity.id)
  ) {
    throw new Error("Invalid notification relatedEntity");
  }

  return {
    recipientId: data.recipientId.trim(),
    type: data.type,
    title: data.title.trim(),
    body: data.body.trim(),
    relatedEntity: {
      type: relatedEntity.type,
      id: relatedEntity.id.trim(),
    },
  };
}

async function createNotification(data) {
  const normalizedData = normalizeNotificationData(data);

  const notificationRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
  const batch = db.batch();

  batch.create(notificationRef, {
    ...normalizedData,
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
      notificationId: notificationRef.id,
      status: "queued",
      retryCount: 0,
      providerResponseCode: "LOCAL_QUEUED",
    },
    "queued",
  );

  await batch.commit();

  const savedDoc = await notificationRef.get();

  return {
    id: savedDoc.id,
    ...savedDoc.data(),
  };
}

async function getNotificationById(notificationId, recipientId) {
  if (!isValidDocumentId(notificationId) || !isValidDocumentId(recipientId)) {
    throw new Error("Invalid notification ID or recipient ID");
  }

  const notificationDoc = await db
    .collection(NOTIFICATIONS_COLLECTION)
    .doc(notificationId.trim())
    .get();

  if (!notificationDoc.exists) {
    return null;
  }

  const notification = notificationDoc.data();

  if (notification.recipientId !== recipientId.trim()) {
    throw new Error("Not allowed to read this notification");
  }

  return {
    id: notificationDoc.id,
    ...notification,
  };
}

async function getNotificationsByRecipient(recipientId) {
  if (!isValidDocumentId(recipientId)) {
    throw new Error("Invalid notification recipientId");
  }

  const snapshot = await db
    .collection(NOTIFICATIONS_COLLECTION)
    .where("recipientId", "==", recipientId.trim())
    .get();

  return snapshot.docs
    .map((notificationDoc) => ({
      id: notificationDoc.id,
      ...notificationDoc.data(),
    }))
    .sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() ?? 0;
      const timeB = b.createdAt?.toMillis?.() ?? 0;

      return timeB - timeA;
    });
}

async function markNotificationAsRead(notificationId, recipientId) {
  if (!isValidDocumentId(notificationId) || !isValidDocumentId(recipientId)) {
    throw new Error("Invalid notification ID or recipient ID");
  }

  const notificationRef = db
    .collection(NOTIFICATIONS_COLLECTION)
    .doc(notificationId.trim());

  const found = await db.runTransaction(async (transaction) => {
    const notificationDoc = await transaction.get(notificationRef);

    if (!notificationDoc.exists) {
      return false;
    }

    const notification = notificationDoc.data();

    if (notification.recipientId !== recipientId.trim()) {
      throw new Error("Not allowed to read this notification");
    }

    if (notification.readAt == null) {
      transaction.update(notificationRef, {
        readAt: FieldValue.serverTimestamp(),
      });
    }

    return true;
  });

  if (!found) {
    return null;
  }

  return getNotificationById(notificationId.trim(), recipientId.trim());
}

module.exports = {
  NOTIFICATIONS_COLLECTION,
  ALLOWED_NOTIFICATION_TYPES,
  RELATED_ENTITY_TYPES,
  normalizeNotificationData,
  createNotification,
  getNotificationById,
  getNotificationsByRecipient,
  markNotificationAsRead,
};
