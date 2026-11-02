const { FieldPath } = require("firebase-admin/firestore");
const { db } = require("../config/firebase");

const {
  FLOOD_WARNING_EVENTS_COLLECTION,
} = require("./flood-warning-notification-event.service");

const {
  processFloodWarningEventBatch,
} = require("./flood-warning-notification-worker.service");

const SCAN_LIMIT = 20;
const EVENTS_PER_TICK = 5;
const RECIPIENTS_PER_BATCH = 20;
const INTERVAL_MS = 60000;

// This cursor only controls scan fairness.
// Each event's recipient progress is persisted in Firestore.
let scanCursor = null;

async function runDueFloodWarningEvents() {
  let query = db
    .collection(FLOOD_WARNING_EVENTS_COLLECTION)
    .where("status", "==", "pending")
    .orderBy(FieldPath.documentId())
    .limit(SCAN_LIMIT);

  if (scanCursor !== null) {
    query = query.startAfter(scanCursor);
  }

  const snapshot = await query.get();

  const summary = {
    scanned: snapshot.size,
    processedEvents: 0,
    created: 0,
    failedEvents: 0,
  };

  if (snapshot.empty) {
    scanCursor = null;
    return summary;
  }

  let examined = 0;

  for (const eventDoc of snapshot.docs) {
    examined++;
    scanCursor = eventDoc.id;

    const event = eventDoc.data();
    const availableAt = event.availableAt?.toMillis?.();

    if (
      !Number.isFinite(availableAt) ||
      availableAt > Date.now() ||
      event.processingLeaseUntil?.toMillis?.() > Date.now()
    ) {
      continue;
    }

    summary.processedEvents++;

    try {
      const result = await processFloodWarningEventBatch(
        eventDoc.id,
        RECIPIENTS_PER_BATCH,
      );

      summary.created += result.created;

      if (result.code === "EVENT_PROCESSING_FAILED") {
        summary.failedEvents++;
      }
    } catch {
      summary.failedEvents++;
      console.warn("[FloodWarningScheduler] EVENT_PROCESSING_FAILED");
    }

    if (summary.processedEvents >= EVENTS_PER_TICK) {
      break;
    }
  }

  if (examined === snapshot.size && snapshot.size < SCAN_LIMIT) {
    scanCursor = null;
  }

  return summary;
}

function startFloodWarningNotificationScheduler() {
  if (process.env.FLOOD_WARNING_NOTIFICATION_WORKER_ENABLED !== "true") {
    return async function stopDisabledScheduler() {};
  }

  let stopped = false;
  let timer = null;
  let inFlight = null;

  function schedule(delay) {
    timer = setTimeout(() => {
      timer = null;

      if (stopped) {
        return;
      }

      inFlight = runDueFloodWarningEvents()
        .then((summary) => {
          if (summary.created > 0 || summary.failedEvents > 0) {
            console.log("[FloodWarningScheduler]", summary);
          }
        })
        .catch(() => {
          console.warn("[FloodWarningScheduler] SCAN_FAILED");
        })
        .finally(() => {
          inFlight = null;

          // Schedule after completion to avoid overlapping ticks.
          if (!stopped) {
            schedule(INTERVAL_MS);
          }
        });
    }, delay);

    timer.unref();
  }

  schedule(1000);

  return async function stopScheduler() {
    stopped = true;

    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    if (inFlight !== null) {
      await inFlight;
    }
  };
}

module.exports = {
  runDueFloodWarningEvents,
  startFloodWarningNotificationScheduler,
};
