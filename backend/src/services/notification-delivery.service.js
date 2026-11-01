
const { randomUUID } = require("node:crypto");

const {
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");

const { db } = require("../config/firebase");

const {
  NOTIFICATIONS_COLLECTION,
} = require("./notification.service");

const {
  sendNotificationViaTransport,
  TRANSPORT_NOT_CONFIGURED,
} = require("./notification-transport.service");

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
    BASE_RETRY_DELAY_MS * (2 ** (failureCount - 1)),
    MAX_RETRY_DELAY_MS,
  );
}

async function deliverNotification(
  notificationId,
  provider = null,
) {
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

  if (
    typeof provider !== "object" ||
    typeof provider.send !== "function"
  ) {
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

    // TEST 3: A sent notification must not be sent again.
    if (data.deliveryStatus === "sent") {
      return {
        claimed: false,
        code: "NOTIFICATION_ALREADY_SENT",
      };
    }

    // TEST 11: Never resend if the previous outcome is unknown.
    if (data.deliveryOutcomeUnknown === true) {
      return {
        claimed: false,
        code: "NOTIFICATION_OUTCOME_UNKNOWN",
      };
    }

    // Only pending and failed notifications may be delivered.
    if (
      data.deliveryStatus !== "pending" &&
      data.deliveryStatus !== "failed"
    ) {
      return {
        claimed: false,
        code: "INVALID_DELIVERY_STATE",
      };
    }

    const failureCount =
      Number.isInteger(data.retryCount) &&
      data.retryCount >= 0
        ? data.retryCount
        : 0;

    // Stop after reaching the maximum retry attempts.
    if (failureCount >= MAX_DELIVERY_ATTEMPTS) {
      return {
        claimed: false,
        code: "NOTIFICATION_MAX_ATTEMPTS",
      };
    }

    // Prevent concurrent workers from delivering the same item.
    if (
      data.deliveryLeaseUntil?.toMillis?.() > nowMs
    ) {
      return {
        claimed: false,
        code: "NOTIFICATION_DELIVERY_IN_PROGRESS",
      };
    }

// An expired lease does not prove the previous send failed.
// The process may have stopped after provider acceptance.
if (data.deliveryLeaseId) {
  transaction.update(notificationRef, {
    deliveryStatus: "failed",
    deliveryOutcomeUnknown: true,
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
    if (
      data.nextRetryAt?.toMillis?.() > nowMs
    ) {
      return {
        claimed: false,
        code: "NOTIFICATION_RETRY_NOT_DUE",
      };
    }

    // Claim the notification for this worker.
    transaction.update(notificationRef, {
      deliveryLeaseId: leaseId,
      deliveryLeaseUntil: Timestamp.fromMillis(
        nowMs + DELIVERY_LEASE_MS,
      ),
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
  // The transport handles provider errors and timeouts.
  const sendResult = await sendNotificationViaTransport(
    claim.notification,
    provider,
  );

  // 6. Persist the outcome only if this worker still owns the lease.
  const savedOutcome = await db.runTransaction(
    async (transaction) => {
      const snapshot = await transaction.get(notificationRef);

      if (
        !snapshot.exists ||
        snapshot.data().deliveryLeaseId !== leaseId
      ) {
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
        changes.nextRetryAt = null;

      } else if (sendResult.outcomeUnknown === true) {
        // CASE B: Timeout - provider may have accepted the push.
        // Do not schedule an automatic retry.
        changes.deliveryStatus = "failed";
        changes.deliveryOutcomeUnknown = true;
        changes.retryCount = claim.failureCount + 1;
        changes.nextRetryAt = null;

      } else if (sendResult.attempted) {
        // CASE C: Known failure - schedule retry with backoff.
        const failureCount = claim.failureCount + 1;

        changes.deliveryStatus = "failed";
        changes.deliveryOutcomeUnknown = false;
        changes.retryCount = failureCount;

        changes.nextRetryAt =
          failureCount >= MAX_DELIVERY_ATTEMPTS
            ? null
            : Timestamp.fromMillis(
                Date.now() + getRetryDelayMs(failureCount),
              );
      }

      transaction.update(notificationRef, changes);

      return {
        persisted: true,
        deliveryStatus:
          changes.deliveryStatus ??
          snapshot.data().deliveryStatus,
        retryCount:
          changes.retryCount ??
          snapshot.data().retryCount,
      };
    },
  );

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
