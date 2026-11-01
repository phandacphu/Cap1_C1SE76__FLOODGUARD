const { db } = require("../config/firebase");
const { Timestamp } = require("firebase-admin/firestore");

const {
  NOTIFICATIONS_COLLECTION,
} = require("./notification.service");

const {
  deliverNotification,
  MAX_DELIVERY_ATTEMPTS,
} = require("./notification-delivery.service");

const DEFAULT_BATCH_SIZE = 20;
const MAX_SCAN_DOCUMENTS_PER_QUERY = 200;

// Remember the scan position separately for each query.
const scanCursors = {
  pending: null,
  retry: null,
};

async function findUnlockedCandidates(
  baseQuery,
  batchSize,
  nowMs,
  isRelevant,
  scanKey,
) {
  const candidates = [];
  const pageSize = Math.max(10, batchSize);
  let cursor = scanCursors[scanKey];
  let scanned = 0;

  while (
    candidates.length < batchSize &&
    scanned < MAX_SCAN_DOCUMENTS_PER_QUERY
  ) {
    const limit = Math.min(
      pageSize,
      MAX_SCAN_DOCUMENTS_PER_QUERY - scanned,
    );

    let query = baseQuery.limit(limit);

    if (cursor !== null) {
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      scanCursors[scanKey] = null;
      break;
    }

    // Count every fetched document toward the scan budget.
    scanned += snapshot.size;
    let examined = 0;

    for (const doc of snapshot.docs) {
      examined++;
      cursor = doc;
      scanCursors[scanKey] = doc;

      const data = doc.data();

      if (!isRelevant(data)) {
        continue;
      }

      // Do not retry notifications with an unknown
      // provider delivery outcome.
      if (data.deliveryOutcomeUnknown === true) {
        continue;
      }

      // Skip notifications that already reached the retry limit.
      const failureCount =
        Number.isInteger(data.retryCount) &&
        data.retryCount >= 0
          ? data.retryCount
          : 0;

      if (failureCount >= MAX_DELIVERY_ATTEMPTS) {
        continue;
      }

      const leaseUntil =
        data.deliveryLeaseUntil?.toMillis?.() ?? 0;

      if (leaseUntil > nowMs) {
        continue;
      }

      candidates.push(doc);

      if (candidates.length >= batchSize) {
        break;
      }
    }

    // Restart from the beginning after examining the final page.
    // Otherwise, the next batch continues from the saved cursor.
    if (
      examined === snapshot.size &&
      snapshot.size < limit
    ) {
      scanCursors[scanKey] = null;
      break;
    }
  }

  return candidates;
}

async function runNotificationRetryBatch(
  provider = null,
  batchSize = DEFAULT_BATCH_SIZE,
) {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 100
  ) {
    throw new Error("Invalid notification batch size");
  }

  // Never process notifications without a provider.
  if (provider === null) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      code: "NOTIFICATION_TRANSPORT_NOT_CONFIGURED",
    };
  }

  if (
    typeof provider !== "object" ||
    typeof provider.send !== "function"
  ) {
    throw new Error("Invalid notification transport provider");
  }

  const collection = db.collection(
    NOTIFICATIONS_COLLECTION,
  );

  const now = Timestamp.now();

  // Two single-field queries avoid needing a composite index.

  const [pending, due] = await Promise.all([
    findUnlockedCandidates(
      collection.where("deliveryStatus", "==", "pending"),
      batchSize,
      now.toMillis(),
      (data) => data.deliveryStatus === "pending",
      "pending",
    ),

    findUnlockedCandidates(
      collection.where("nextRetryAt", "<=", now),
      batchSize,
      now.toMillis(),
      (data) => data.deliveryStatus === "failed",
      "retry",
    ),
  ]);

  // Alternate pending and retry items for fairer processing.
  const selected = [];
  const seen = new Set();

  for (let i = 0; selected.length < batchSize; i++) {
    const candidates = [pending[i], due[i]];

    if (candidates.every((item) => item === undefined)) {
      break;
    }

    for (const doc of candidates) {
      if (
        doc &&
        !seen.has(doc.id) &&
        selected.length < batchSize
      ) {
        seen.add(doc.id);
        selected.push(doc);
      }
    }
  }

  const summary = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  // Process sequentially to limit outgoing requests.
  for (const doc of selected) {
    try {
      const result = await deliverNotification(
        doc.id,
        provider,
      );

      if (!result.attempted) {
        summary.skipped++;
        continue;
      }

      summary.processed++;

      if (result.accepted && result.persisted) {
        summary.sent++;
      } else {
        summary.failed++;
      }
    } catch {
      // Do not expose credentials or raw provider errors.
      summary.failed++;
      console.warn(
        "[NotificationRetryWorker] DELIVERY_PROCESSING_FAILED",
      );
    }
  }

  return summary;
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  runNotificationRetryBatch,
};