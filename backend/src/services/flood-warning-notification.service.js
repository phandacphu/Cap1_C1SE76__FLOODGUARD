const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

const {
  NOTIFICATIONS_COLLECTION,
  normalizeNotificationData,
} = require("./notification.service");

const { buildEventNotificationId } = require("./notification-trigger.service");

const {
  stageNotificationDeliveryLog,
} = require("./notification-delivery-log.service");

const {
  SUBSCRIPTIONS_COLLECTION,
  buildSubscriptionId,
} = require("./flood-warning-subscription.service");

const {
  FLOOD_WARNING_EVENTS_COLLECTION,
} = require("./flood-warning-notification-event.service");

const {
  evaluateFloodWarningNotification,
} = require("./flood-warning-notification-rule.service");

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
    throw new Error("Invalid notification event or recipient ID");
  }

  return value.trim();
}

function skipped(code) {
  return { created: false, code };
}

async function createFloodWarningNotificationForRecipient(
  eventId,
  recipientId,
) {
  const normalizedEventId = normalizeDocumentId(eventId);
  const normalizedRecipientId = normalizeDocumentId(recipientId);

  const eventRef = db
    .collection(FLOOD_WARNING_EVENTS_COLLECTION)
    .doc(normalizedEventId);

  return db.runTransaction(async (transaction) => {
    const eventDoc = await transaction.get(eventRef);

    if (!eventDoc.exists) {
      return skipped("EVENT_NOT_FOUND");
    }

    const event = eventDoc.data();

    if (event.status !== "pending") {
      return skipped("EVENT_NOT_PENDING");
    }

    if (event.revision !== normalizedEventId) {
      return skipped("INVALID_EVENT_REVISION");
    }

    const alertRef = db
      .collection("flood_alerts")
      .doc(normalizeDocumentId(event.alertId));

    const alertDoc = await transaction.get(alertRef);

    if (!alertDoc.exists) {
      return skipped("ALERT_NOT_FOUND");
    }

    const alert = alertDoc.data();

    // Old events must not create notifications for a newer revision.
    if (alert.notificationRevision !== event.revision) {
      return skipped("EVENT_SUPERSEDED");
    }

    const areaId = normalizeDocumentId(alert.areaId);
    const areaRef = db.collection("flood_areas").doc(areaId);
    const areaDoc = await transaction.get(areaRef);

    const evaluation = evaluateFloodWarningNotification(
      null,
      alert,
      areaDoc.exists ? areaDoc.data() : null,
    );

    if (!evaluation.eligible) {
      return skipped(evaluation.reason);
    }

    const subscriptionRef = db
      .collection(SUBSCRIPTIONS_COLLECTION)
      .doc(buildSubscriptionId(normalizedRecipientId, areaId));

    const subscriptionDoc = await transaction.get(subscriptionRef);

    if (!subscriptionDoc.exists) {
      return skipped("NOT_SUBSCRIBED");
    }

    const subscription = subscriptionDoc.data();

    if (
      subscription.enabled !== true ||
      subscription.recipientId !== normalizedRecipientId ||
      subscription.areaId !== areaId
    ) {
      return skipped("NOT_SUBSCRIBED");
    }

    const userRef = db.collection("users").doc(normalizedRecipientId);

    const userDoc = await transaction.get(userRef);

    if (
      !userDoc.exists ||
      userDoc.data().isActive !== true ||
      !["resident", "rescue_staff", "admin"].includes(userDoc.data().role)
    ) {
      return skipped("RECIPIENT_NOT_ELIGIBLE");
    }

    // Same event + same recipient always produces the same document ID.
    const notificationEventId = `flood_warning:${event.revision}`;

    const notificationId = buildEventNotificationId(
      notificationEventId,
      normalizedRecipientId,
    );

    const notificationRef = db
      .collection(NOTIFICATIONS_COLLECTION)
      .doc(notificationId);

    const existingDoc = await transaction.get(notificationRef);

    const data = normalizeNotificationData({
      recipientId: normalizedRecipientId,
      type: "flood_warning",
      title: alert.title,
      body: alert.content,
      relatedEntity: {
        type: "flood_alert",
        id: alertDoc.id,
      },
    });

    if (existingDoc.exists) {
      const existing = existingDoc.data();

      const sameNotification =
        existing.eventId === notificationEventId &&
        existing.recipientId === data.recipientId &&
        existing.type === data.type &&
        existing.title === data.title &&
        existing.body === data.body &&
        existing.relatedEntity?.type === data.relatedEntity.type &&
        existing.relatedEntity?.id === data.relatedEntity.id;

      if (!sameNotification) {
        const error = new Error(
          "Flood warning notification conflicts with existing data",
        );
        error.code = "NOTIFICATION_EVENT_CONFLICT";
        throw error;
      }

      return {
        created: false,
        code: "ALREADY_CREATED",
        notificationId,
      };
    }

    // All reads are completed before writing.
    transaction.create(notificationRef, {
      ...data,
      eventId: notificationEventId,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
      deliveryStatus: "pending",
      retryCount: 0,
      lastAttemptAt: null,
      nextRetryAt: null,
    });

    stageNotificationDeliveryLog(
      transaction,
      {
        notificationId,
        eventId: notificationEventId,
        status: "queued",
        retryCount: 0,
        providerResponseCode: "LOCAL_QUEUED",
      },
      "queued",
    );

    return {
      created: true,
      code: "CREATED",
      notificationId,
    };
  });
}

module.exports = {
  createFloodWarningNotificationForRecipient,
};
