const { randomUUID } = require("node:crypto");

const { FieldValue, Timestamp } = require("firebase-admin/firestore");

const { db } = require("../config/firebase");

const { NOTIFICATIONS_COLLECTION } = require("./notification.service");

const {
  sendNotificationViaTransport,
  TRANSPORT_NOT_CONFIGURED,
  TRANSPORT_TIMEOUT,
} = require("./notification-transport.service");

const {
  stageNotificationDeliveryLog,
} = require("./notification-delivery-log.service");

const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_LEASE_MS = 120000;
const BASE_RETRY_DELAY_MS = 60000;
const MAX_RETRY_DELAY_MS = 3600000;

function isValidNotificationId(value) {
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

function getRetryDelayMs(failureCount) {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** (failureCount - 1),
    MAX_RETRY_DELAY_MS,
  );
}

async function deliverNotification(notificationId, provider = null) {
  // 1. Validate notification ID.
  if (!isValidNotificationId(notificationId)) {
    throw new Error("Invalid notification ID");
  }

  // 2. Never send without an explicitly configured provider.
  if (provider === null) {
    return {
      attempted: false,
      accepted: false,
      code: TRANSPORT_NOT_CONFIGURED,
    };
  }

  if (typeof provider !== "object" || typeof provider.send !== "function") {
    throw new Error("Invalid notification transport provider");
  }

  const notificationRef = db
    .collection(NOTIFICATIONS_COLLECTION)
    .doc(notificationId.trim());

  const leaseId = randomUUID();
  const nowMs = Date.now();

  // 3. Claim notification atomically using Firestore Transaction.
  const claim = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(notificationRef);

    if (!snapshot.exists) {
      return {
        claimed: false,
        code: "NOTIFICATION_NOT_FOUND",
      };
    }

    const data = snapshot.data();

    // A sent notification must not be sent again.
    if (data.deliveryStatus === "sent") {
      return {
        claimed: false,
        code: "NOTIFICATION_ALREADY_SENT",
      };
    }

    // Never resend if the previous outcome is unknown.
    if (
      data.deliveryOutcomeUnknown === true ||
      data.deliveryRequiresReconciliation === true
    ) {
      return {
        claimed: false,
        code: "NOTIFICATION_OUTCOME_UNKNOWN",
      };
    }

    // Only pending and failed notifications may be delivered.
    if (data.deliveryStatus !== "pending" && data.deliveryStatus !== "failed") {
      return {
        claimed: false,
        code: "INVALID_DELIVERY_STATE",
      };
    }

    const failureCount =
      Number.isInteger(data.retryCount) && data.retryCount >= 0
        ? data.retryCount
        : 0;

    // Stop after reaching the maximum attempts.
    // Also mark older exhausted notifications as final failures.
    if (failureCount >= MAX_DELIVERY_ATTEMPTS) {
      if (data.deliveryFinalFailure !== true) {
        transaction.update(notificationRef, {
          deliveryStatus: "failed",
          deliveryFinalFailure: true,
          deliveryFinalFailureReason: "attempts_exhausted",
          deliveryFailedAt: FieldValue.serverTimestamp(),
          nextRetryAt: null,
        });
      }

      return {
        claimed: false,
        code: "NOTIFICATION_MAX_ATTEMPTS",
      };
    }

    if (
      data.deliveryFinalFailure === true ||
      data.deliveryFailureType === "permanent"
    ) {
      return {
        claimed: false,
        code: "NOTIFICATION_FINAL_FAILURE",
      };
    }

    // Prevent concurrent workers from delivering the same item.
    if (data.deliveryLeaseUntil?.toMillis?.() > nowMs) {
      return {
        claimed: false,
        code: "NOTIFICATION_DELIVERY_IN_PROGRESS",
      };
    }

    // An expired lease does not prove the previous send failed.
    // The process may have stopped after provider acceptance.
    if (data.deliveryLeaseId) {
      stageNotificationDeliveryLog(
        transaction,
        {
          notificationId: snapshot.id,
          eventId: data.eventId,
          status: "failed",
          retryCount: failureCount,
          providerResponseCode: "NOTIFICATION_OUTCOME_UNKNOWN",
          outcomeUnknown: true,
        },
        data.deliveryLeaseId,
      );

      transaction.update(notificationRef, {
        deliveryStatus: "failed",
        deliveryOutcomeUnknown: true,
        deliveryRequiresReconciliation: true,
        deliveryFailureType: "unknown",
        deliveryFinalFailure: false,
        deliveryFinalFailureReason: null,
        lastDeliveryCode: "NOTIFICATION_OUTCOME_UNKNOWN",
        nextRetryAt: null,
        deliveryLeaseId: null,
        deliveryLeaseUntil: null,
      });

      return {
        claimed: false,
        code: "NOTIFICATION_OUTCOME_UNKNOWN",
      };
    }

    // Failed notification must wait until its scheduled retry time.
    if (data.nextRetryAt?.toMillis?.() > nowMs) {
      return {
        claimed: false,
        code: "NOTIFICATION_RETRY_NOT_DUE",
      };
    }

    // Claim the notification for this worker.
    transaction.update(notificationRef, {
      deliveryLeaseId: leaseId,
      deliveryLeaseUntil: Timestamp.fromMillis(nowMs + DELIVERY_LEASE_MS),
      lastAttemptAt: FieldValue.serverTimestamp(),
    });

    return {
      claimed: true,
      failureCount,
      notification: {
        id: snapshot.id,
        ...data,
      },
    };
  });

  // 4. Return immediately when the notification cannot be claimed.
  if (!claim.claimed) {
    return {
      attempted: false,
      accepted: false,
      code: claim.code,
    };
  }

  // 5. Send outside the Firestore Transaction.
  const sendResult = await sendNotificationViaTransport(
    claim.notification,
    provider,
  );

  // 6. Persist the outcome only if this worker still owns the lease.
  const savedOutcome = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(notificationRef);

    if (!snapshot.exists || snapshot.data().deliveryLeaseId !== leaseId) {
      return {
        persisted: false,
        code: "NOTIFICATION_LEASE_LOST",
      };
    }

    const changes = {
      deliveryLeaseId: null,
      deliveryLeaseUntil: null,
    };

    if (sendResult.accepted) {
      // CASE A: Provider confirmed acceptance.
      changes.deliveryStatus = "sent";
      changes.deliveryOutcomeUnknown = false;
      changes.deliveryRequiresReconciliation = false;
      changes.deliveryFailureType = null;
      changes.deliveryFinalFailure = false;
      changes.deliveryFinalFailureReason = null;
      changes.deliveryFailedAt = null;
      changes.lastDeliveryCode = "PROVIDER_ACCEPTED";
      changes.nextRetryAt = null;
    } else if (sendResult.outcomeUnknown === true) {
      // CASE B: Provider may have accepted the notification.
      // Stop automatic retries and require reconciliation.
      changes.deliveryStatus = "failed";
      changes.deliveryOutcomeUnknown = true;
      changes.deliveryRequiresReconciliation = true;
      changes.deliveryFailureType = "unknown";
      changes.deliveryFinalFailure = false;
      changes.deliveryFinalFailureReason = null;
      changes.retryCount = claim.failureCount + 1;
      changes.nextRetryAt = null;
    } else if (sendResult.attempted) {
      // CASE C: A definite failure.
      const failureCount = claim.failureCount + 1;
      const permanent = sendResult.failureType === "permanent";
      const exhausted = failureCount >= MAX_DELIVERY_ATTEMPTS;
      const finalFailure = permanent || exhausted;

      changes.deliveryStatus = "failed";
      changes.deliveryOutcomeUnknown = false;
      changes.deliveryRequiresReconciliation = false;
      changes.deliveryFailureType = permanent ? "permanent" : "transient";
      changes.deliveryFinalFailure = finalFailure;
      changes.deliveryFinalFailureReason = permanent
        ? "permanent_error"
        : exhausted
          ? "attempts_exhausted"
          : null;
      changes.deliveryFailedAt = finalFailure
        ? FieldValue.serverTimestamp()
        : null;
      changes.retryCount = failureCount;

      changes.nextRetryAt = finalFailure
        ? null
        : Timestamp.fromMillis(Date.now() + getRetryDelayMs(failureCount));
    }

    if (changes.deliveryStatus) {
      const providerResponseCode = sendResult.accepted
        ? "PROVIDER_ACCEPTED"
        : (sendResult.providerResponseCode ??
          (sendResult.code === TRANSPORT_TIMEOUT
            ? "NOTIFICATION_TRANSPORT_TIMEOUT"
            : "NOTIFICATION_TRANSPORT_SEND_FAILED"));

      changes.lastDeliveryCode = providerResponseCode;

      stageNotificationDeliveryLog(
        transaction,
        {
          notificationId: snapshot.id,
          eventId: snapshot.data().eventId,
          status: changes.deliveryStatus,
          retryCount: changes.retryCount ?? claim.failureCount,
          providerResponseCode,
          outcomeUnknown: changes.deliveryOutcomeUnknown === true,
        },
        leaseId,
      );
    }

    transaction.update(notificationRef, changes);

    return {
      persisted: true,
      deliveryStatus: changes.deliveryStatus ?? snapshot.data().deliveryStatus,
      retryCount: changes.retryCount ?? snapshot.data().retryCount,
      finalFailure:
        changes.deliveryFinalFailure ??
        snapshot.data().deliveryFinalFailure ??
        false,
      requiresReconciliation:
        changes.deliveryRequiresReconciliation ??
        snapshot.data().deliveryRequiresReconciliation ??
        false,
    };
  });

  // 7. Return both transport and persistence results.
  return {
    ...sendResult,
    ...savedOutcome,
  };
}

module.exports = {
  MAX_DELIVERY_ATTEMPTS,
  DELIVERY_LEASE_MS,
  getRetryDelayMs,
  deliverNotification,
};
