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

const STATUS_EVENTS = {
  received: {
    previousStatus: "submitted",
    sequence: 1,
    body: "Yêu cầu SOS của bạn đã được tiếp nhận.",
  },
  in_progress: {
    previousStatus: "received",
    sequence: 2,
    body: "Yêu cầu SOS của bạn đang được xử lý.",
  },
  assisted: {
    previousStatus: "in_progress",
    sequence: 3,
    body: "Yêu cầu SOS của bạn đã được đánh dấu hỗ trợ hoàn tất.",
  },
};

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

// Call before any writes in the transaction.
async function prepareSosStatusNotification(
  transaction,
  { requestId, request, historyId, newStatus },
) {
  if (
    !isValidDocumentId(requestId) ||
    !isValidDocumentId(historyId) ||
    !request ||
    typeof request !== "object"
  ) {
    throw new Error("Invalid SOS notification event");
  }

  if (request.status === newStatus) {
    return null;
  }

  const definition = Object.hasOwn(STATUS_EVENTS, newStatus)
    ? STATUS_EVENTS[newStatus]
    : null;

  if (!definition || request.status !== definition.previousStatus) {
    throw new Error("Invalid SOS notification transition");
  }

  // Ownership comes from the stored request, never from client input.
  const recipientId = request.residentId;

  // Do not prevent rescue work because the owner is unavailable.
  if (!isValidDocumentId(recipientId)) {
    return null;
  }

  const ownerDoc = await transaction.get(
    db.collection("users").doc(recipientId),
  );

  if (
    !ownerDoc.exists ||
    ownerDoc.data().role !== "resident" ||
    ownerDoc.data().isActive !== true
  ) {
    return null;
  }

  const eventId = `sos_status:${historyId}`;

  const notificationId = buildEventNotificationId(eventId, recipientId);

  const data = normalizeNotificationData({
    recipientId,
    type: "sos_status",
    title: "Cập nhật trạng thái SOS",
    body: definition.body,
    relatedEntity: {
      type: "rescue_request",
      id: requestId,
    },
  });

  return {
    notificationRef: db
      .collection(NOTIFICATIONS_COLLECTION)
      .doc(notificationId),
    data: {
      ...data,
      eventId,
      statusEvent: {
        requestId,
        historyId,
        oldStatus: request.status,
        newStatus,
        sequence: definition.sequence,
      },
    },
  };
}

// Call only after all transaction reads have finished.
function stageSosStatusNotification(transaction, prepared) {
  if (prepared === null) {
    return;
  }

  transaction.create(prepared.notificationRef, {
    ...prepared.data,
    statusEvent: {
      ...prepared.data.statusEvent,
      changedAt: FieldValue.serverTimestamp(),
    },
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
      notificationId: prepared.notificationRef.id,
      eventId: prepared.data.eventId,
      status: "queued",
      retryCount: 0,
      providerResponseCode: "LOCAL_QUEUED",
    },
    "queued",
  );
}

module.exports = {
  prepareSosStatusNotification,
  stageSosStatusNotification,
};
