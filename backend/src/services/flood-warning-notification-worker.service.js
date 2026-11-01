const { randomUUID } = require("node:crypto");
const {
  FieldPath,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");
const { db } = require("../config/firebase");

const {
  FLOOD_WARNING_EVENTS_COLLECTION,
} = require("./flood-warning-notification-event.service");

const {
  SUBSCRIPTIONS_COLLECTION,
  buildSubscriptionId,
} = require("./flood-warning-subscription.service");

const {
  evaluateFloodWarningNotification,
} = require("./flood-warning-notification-rule.service");

const {
  createFloodWarningNotificationForRecipient,
} = require("./flood-warning-notification.service");

const EVENT_LEASE_MS = 120000;

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

// Called before any writes in the transaction.
async function inspectEvent(transaction, eventDoc) {
  const event = eventDoc.data();

  if (event.revision !== eventDoc.id || !isValidDocumentId(event.alertId)) {
    return { eligible: false, reason: "INVALID_EVENT" };
  }

  const alertDoc = await transaction.get(
    db.collection("flood_alerts").doc(event.alertId),
  );

  if (!alertDoc.exists) {
    return { eligible: false, reason: "ALERT_NOT_FOUND" };
  }

  const alert = alertDoc.data();

  if (alert.notificationRevision !== event.revision) {
    return { eligible: false, reason: "EVENT_SUPERSEDED" };
  }

  if (!isValidDocumentId(alert.areaId)) {
    return { eligible: false, reason: "INVALID_AREA_ID" };
  }

  const areaDoc = await transaction.get(
    db.collection("flood_areas").doc(alert.areaId),
  );

  return {
    ...evaluateFloodWarningNotification(
      null,
      alert,
      areaDoc.exists ? areaDoc.data() : null,
    ),
    areaId: alert.areaId,
    startAt: alert.startAt,
  };
}

async function processFloodWarningEventBatch(eventId, batchSize = 20) {
  if (!isValidDocumentId(eventId)) {
    throw new Error("Invalid flood warning event ID");
  }

  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("Invalid flood warning batch size");
  }

  const eventRef = db.collection(FLOOD_WARNING_EVENTS_COLLECTION).doc(eventId);

  const leaseId = randomUUID();

  const claim = await db.runTransaction(async (transaction) => {
    const eventDoc = await transaction.get(eventRef);

    if (!eventDoc.exists) {
      return { claimed: false, code: "EVENT_NOT_FOUND" };
    }

    const event = eventDoc.data();

    if (event.status !== "pending") {
      return { claimed: false, code: "EVENT_NOT_PENDING" };
    }

    if (event.processingLeaseUntil?.toMillis?.() > Date.now()) {
      return { claimed: false, code: "EVENT_IN_PROGRESS" };
    }

    const inspection = await inspectEvent(transaction, eventDoc);

    if (!inspection.eligible) {
      if (inspection.reason === "NOT_STARTED") {
        transaction.update(eventRef, {
          availableAt: inspection.startAt,
        });
      } else {
        transaction.update(eventRef, {
          status: "cancelled",
          completionReason: inspection.reason,
          completedAt: FieldValue.serverTimestamp(),
          processingLeaseId: null,
          processingLeaseUntil: null,
        });
      }

      return { claimed: false, code: inspection.reason };
    }

    const cursor = event.recipientCursor ?? null;

    if (cursor !== null && !isValidDocumentId(cursor)) {
      throw new Error("Invalid flood warning recipient cursor");
    }

    transaction.update(eventRef, {
      processingLeaseId: leaseId,
      processingLeaseUntil: Timestamp.fromMillis(Date.now() + EVENT_LEASE_MS),
    });

    return {
      claimed: true,
      areaId: inspection.areaId,
      cursor,
    };
  });

  const summary = {
    scanned: 0,
    created: 0,
    skipped: 0,
    completed: false,
  };

  if (!claim.claimed) {
    return { ...summary, code: claim.code };
  }

  try {
    let query = db
      .collection(SUBSCRIPTIONS_COLLECTION)
      .where("areaId", "==", claim.areaId)
      .orderBy(FieldPath.documentId())
      .limit(batchSize);

    if (claim.cursor !== null) {
      query = query.startAfter(claim.cursor);
    }

    const snapshot = await query.get();

    for (const subscriptionDoc of snapshot.docs) {
      summary.scanned++;

      const subscription = subscriptionDoc.data();
      const recipientId = subscription.recipientId;

      if (
        subscription.enabled !== true ||
        subscription.areaId !== claim.areaId ||
        !isValidDocumentId(recipientId) ||
        subscriptionDoc.id !== buildSubscriptionId(recipientId, claim.areaId)
      ) {
        summary.skipped++;
        continue;
      }

      // This service rechecks the current alert, account and subscription
      // atomically with creating the notification.
      const result = await createFloodWarningNotificationForRecipient(
        eventId,
        recipientId,
      );

      if (result.created) {
        summary.created++;
      } else {
        summary.skipped++;
      }
    }

    const checkpoint = await db.runTransaction(async (transaction) => {
      const eventDoc = await transaction.get(eventRef);

      if (
        !eventDoc.exists ||
        eventDoc.data().status !== "pending" ||
        eventDoc.data().processingLeaseId !== leaseId
      ) {
        return {
          completed: false,
          code: "EVENT_LEASE_LOST",
        };
      }

      const inspection = await inspectEvent(transaction, eventDoc);

      const changes = {
        processingLeaseId: null,
        processingLeaseUntil: null,
        lastProcessedAt: FieldValue.serverTimestamp(),
        lastErrorCode: null,
      };

      if (!inspection.eligible) {
        if (inspection.reason === "NOT_STARTED") {
          changes.availableAt = inspection.startAt;
        } else {
          changes.status = "cancelled";
          changes.completionReason = inspection.reason;
          changes.completedAt = FieldValue.serverTimestamp();
        }

        transaction.update(eventRef, changes);

        return {
          completed: false,
          code: inspection.reason,
        };
      }

      const completed = snapshot.size < batchSize;

      if (!snapshot.empty) {
        changes.recipientCursor = snapshot.docs[snapshot.docs.length - 1].id;
      }

      if (completed) {
        changes.status = "completed";
        changes.completedAt = FieldValue.serverTimestamp();
      }

      transaction.update(eventRef, changes);

      return {
        completed,
        code: completed ? "EVENT_COMPLETED" : "BATCH_PROCESSED",
      };
    });

    return { ...summary, ...checkpoint };
  } catch {
    // Keep the cursor unchanged so this page can be retried.
    // Notifications already created on the page remain idempotent.
    await db.runTransaction(async (transaction) => {
      const eventDoc = await transaction.get(eventRef);

      if (
        eventDoc.exists &&
        eventDoc.data().status === "pending" &&
        eventDoc.data().processingLeaseId === leaseId
      ) {
        transaction.update(eventRef, {
          processingLeaseId: null,
          processingLeaseUntil: null,
          lastErrorCode: "EVENT_PROCESSING_FAILED",
        });
      }
    });

    return {
      ...summary,
      code: "EVENT_PROCESSING_FAILED",
    };
  }
}

module.exports = {
  EVENT_LEASE_MS,
  processFloodWarningEventBatch,
};
