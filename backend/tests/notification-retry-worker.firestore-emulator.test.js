
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Use local Firestore Emulator only.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const PROJECT_ID = "demo-floodguard-ccf148";
process.env.GCLOUD_PROJECT = PROJECT_ID;

const { initializeApp, deleteApp } = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
} = require("firebase-admin/firestore");

const app = initializeApp(
  { projectId: PROJECT_ID },
  `ccf149-worker-${randomUUID()}`,
);

const db = getFirestore(app);

const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const {
  triggerNotification,
  buildEventNotificationId,
} = require("../src/services/notification-trigger.service");

const {
  runNotificationRetryBatch,
} = require("../src/services/notification-retry-worker.service");

async function runTests() {
  const runId = randomUUID();
  const collection = db.collection("notifications");
  const createdIds = new Set();

  async function makeNotification(suffix) {
    const input = {
      eventId: `ccf149:worker:${runId}:${suffix}`,
      recipientId: `resident_${runId}`,
      type: "sos_status",
      title: "SOS status updated",
      body: "Your SOS request was updated",
      relatedEntity: {
        type: "rescue_request",
        id: `sos_${runId}`,
      },
    };

    const id = buildEventNotificationId(
      input.eventId,
      input.recipientId,
    );

    createdIds.add(id);

    const result = await triggerNotification(input);

    return result.notification.id;
  }

  async function readNotification(id) {
    const snapshot = await collection.doc(id).get();

    assert.equal(snapshot.exists, true);

    return snapshot.data();
  }

  let sendCalls = 0;

  const successProvider = {
    async send() {
      sendCalls++;
      return `mock_message_${sendCalls}`;
    },
  };

  try {
    // ========================================
    // TEST 1: Provider not configured
    // ========================================

    const noProvider = await runNotificationRetryBatch();

    assert.equal(noProvider.processed, 0);

    assert.equal(
      noProvider.code,
      "NOTIFICATION_TRANSPORT_NOT_CONFIGURED",
    );

    console.log("PASS 1: Provider not configured");

    // ========================================
    // TEST 2: Pending notification delivered
    // ========================================

    const pendingId = await makeNotification("pending");

    const pendingResult = await runNotificationRetryBatch(
      successProvider,
      20,
    );

    assert.equal(pendingResult.sent, 1);
    assert.equal(sendCalls, 1);

    assert.equal(
      (await readNotification(pendingId)).deliveryStatus,
      "sent",
    );

    console.log("PASS 2: Pending notification delivered");

    // ========================================
    // TEST 3: Sent notification not repeated
    // ========================================

    const sentResult = await runNotificationRetryBatch(
      successProvider,
      20,
    );

    assert.equal(sentResult.processed, 0);
    assert.equal(sendCalls, 1);

    console.log("PASS 3: Sent notification not repeated");

    // ========================================
    // TEST 4: Due retry delivered
    // ========================================

    const dueId = await makeNotification("due");

    await collection.doc(dueId).update({
      deliveryStatus: "failed",
      retryCount: 1,
      nextRetryAt: Timestamp.fromMillis(
        Date.now() - 1000,
      ),
    });

    const dueResult = await runNotificationRetryBatch(
      successProvider,
      20,
    );

    assert.equal(dueResult.sent, 1);
    assert.equal(sendCalls, 2);

    const dueData = await readNotification(dueId);

    assert.equal(dueData.deliveryStatus, "sent");
    assert.equal(dueData.retryCount, 1);
    assert.equal(dueData.nextRetryAt, null);

    console.log("PASS 4: Due retry delivered");

    // ========================================
    // TEST 5: Future retry skipped
    // ========================================

    const futureId = await makeNotification("future");

    await collection.doc(futureId).update({
      deliveryStatus: "failed",
      retryCount: 1,
      nextRetryAt: Timestamp.fromMillis(
        Date.now() + 3600000,
      ),
    });

    const futureResult = await runNotificationRetryBatch(
      successProvider,
      20,
    );

    assert.equal(futureResult.processed, 0);
    assert.equal(sendCalls, 2);

    assert.equal(
      (await readNotification(futureId)).deliveryStatus,
      "failed",
    );

    console.log("PASS 5: Future retry skipped");

    // ========================================
    // TEST 6: Failure schedules retry
    // ========================================

    const failureId = await makeNotification("failure");

    const failedResult = await runNotificationRetryBatch({
      async send() {
        throw new Error("PRIVATE_PROVIDER_ERROR");
      },
    });

    assert.equal(failedResult.failed, 1);

    const failureData = await readNotification(failureId);

    assert.equal(failureData.deliveryStatus, "failed");
    assert.equal(failureData.retryCount, 1);

    assert.ok(
      failureData.nextRetryAt instanceof Timestamp,
    );

    console.log("PASS 6: Failure schedules retry");

    // ========================================
    // TEST 7: Concurrent workers
    // ========================================

    const concurrentId = await makeNotification("concurrent");

    let concurrentCalls = 0;

    const slowProvider = {
      async send() {
        concurrentCalls++;

        await new Promise((resolve) => {
          setTimeout(resolve, 150);
        });

        return "mock_concurrent_message";
      },
    };

    const concurrentResults = await Promise.all([
      runNotificationRetryBatch(slowProvider, 20),
      runNotificationRetryBatch(slowProvider, 20),
    ]);

    assert.equal(concurrentCalls, 1);

    assert.equal(
      concurrentResults.reduce(
        (sum, result) => sum + result.sent,
        0,
      ),
      1,
    );

    assert.equal(
      (await readNotification(concurrentId)).deliveryStatus,
      "sent",
    );

    console.log("PASS 7: Concurrent workers");

    // ========================================
    // TEST 8: Maximum attempts skipped
    // ========================================

    const maxId = await makeNotification("maximum");

    await collection.doc(maxId).update({
      deliveryStatus: "failed",
      retryCount: 5,
      nextRetryAt: Timestamp.fromMillis(
        Date.now() - 1000,
      ),
    });

    let maxCalls = 0;

    const maxResult = await runNotificationRetryBatch({
      async send() {
        maxCalls++;
        return "unexpected";
      },
    });

    assert.equal(maxCalls, 0);
    assert.equal(maxResult.processed, 0);

    const maxData = await readNotification(maxId);

    assert.equal(maxData.deliveryStatus, "failed");
    assert.equal(maxData.retryCount, 5);

    console.log("PASS 8: Maximum attempts skipped");

    // ========================================
    // TEST 9: Invalid batch size
    // ========================================

    await assert.rejects(
      runNotificationRetryBatch(successProvider, 0),
      /Invalid notification batch size/,
    );

    await assert.rejects(
      runNotificationRetryBatch(successProvider, 101),
      /Invalid notification batch size/,
    );

    console.log("PASS 9: Invalid batch size");

    // ========================================
    // TEST 10: Locked item does not starve ready work
    // ========================================

    const candidateA = await makeNotification("starvation_a");
    const candidateB = await makeNotification("starvation_b");

    const [blockedId, readyId] = [
      candidateA,
      candidateB,
    ].sort();

    await collection.doc(blockedId).update({
      deliveryLeaseId: "another_worker",
      deliveryLeaseUntil: Timestamp.fromMillis(
        Date.now() + 120000,
      ),
    });

    let starvationSendCalls = 0;

    const starvationResult = await runNotificationRetryBatch(
      {
        async send() {
          starvationSendCalls++;
          return "mock_starvation_message";
        },
      },
      1,
    );

    assert.equal(
      starvationResult.sent,
      1,
      "Worker must reach the ready notification",
    );

    assert.equal(starvationSendCalls, 1);

    assert.equal(
      (await readNotification(readyId)).deliveryStatus,
      "sent",
    );

    console.log(
      "PASS 10: Locked item does not starve ready work",
    );

    // ========================================
    // TEST 11: Max attempts do not starve due retries
    // ========================================

    const readyRetryId = await makeNotification(
      "ready_after_max",
    );

    await collection.doc(maxId).update({
      nextRetryAt: Timestamp.fromMillis(
        Date.now() - 600000,
      ),
    });

    await collection.doc(readyRetryId).update({
      deliveryStatus: "failed",
      retryCount: 1,
      nextRetryAt: Timestamp.fromMillis(
        Date.now() - 1000,
      ),
    });

    let retrySendCalls = 0;

    const retryResult = await runNotificationRetryBatch(
      {
        async send() {
          retrySendCalls++;
          return "mock_ready_retry";
        },
      },
      1,
    );

    assert.equal(
      retryResult.sent,
      1,
      "Max-attempt notification must not block a due retry",
    );

    assert.equal(retrySendCalls, 1);

    assert.equal(
      (await readNotification(readyRetryId)).deliveryStatus,
      "sent",
    );

    console.log(
      "PASS 11: Max attempts do not starve due retries",
    );

    // ========================================
    // TEST 12: Unknown outcome does not block ready retries
    // ========================================

    const unknownId = await makeNotification(
      "unknown_outcome",
    );

    // Fixed: use a unique variable name for Test 12.
    const readyAfterUnknownId = await makeNotification(
      "ready_after_unknown",
    );

    // Simulate an old timeout record with a stale retry date.
    await collection.doc(unknownId).update({
      deliveryStatus: "failed",
      deliveryOutcomeUnknown: true,
      retryCount: 1,
      nextRetryAt: Timestamp.fromMillis(
        Date.now() - 600000,
      ),
    });

    // Normal failed notification ready for retry.
    await collection.doc(readyAfterUnknownId).update({
      deliveryStatus: "failed",
      deliveryOutcomeUnknown: false,
      retryCount: 1,
      nextRetryAt: Timestamp.fromMillis(
        Date.now() - 1000,
      ),
    });

    let unknownTestSendCalls = 0;

    const unknownTestResult = await runNotificationRetryBatch(
      {
        async send() {
          unknownTestSendCalls++;
          return "mock_ready_after_unknown";
        },
      },
      1,
    );

    assert.equal(
      unknownTestResult.sent,
      1,
      "Unknown outcome must not block a ready retry",
    );

    assert.equal(unknownTestSendCalls, 1);

    const unknownData = await readNotification(unknownId);

    const readyData = await readNotification(
      readyAfterUnknownId,
    );

    assert.equal(unknownData.deliveryStatus, "failed");
    assert.equal(unknownData.deliveryOutcomeUnknown, true);
    assert.equal(readyData.deliveryStatus, "sent");

    console.log(
      "PASS 12: Unknown outcome does not block ready retries",
    );

// TEST 13: Bound scanning and continue in the next batch.
const scanPrefix = `000_ccf149_scan_${runId}_`;
const scanBatch = db.batch();

// These IDs sort before the existing event_* documents.
for (let i = 0; i < 201; i++) {
  const id = `${scanPrefix}${String(i).padStart(3, "0")}`;
  createdIds.add(id);

  scanBatch.create(collection.doc(id), {
    deliveryStatus: "pending",
    retryCount: 0,
    deliveryOutcomeUnknown: false,
    deliveryLeaseId: "busy_worker",
    deliveryLeaseUntil: Timestamp.fromMillis(
      Date.now() + 600000,
    ),
    nextRetryAt: null,
  });
}

const scanReadyId = `${scanPrefix}999`;
createdIds.add(scanReadyId);

scanBatch.create(collection.doc(scanReadyId), {
  recipientId: `resident_${runId}`,
  type: "sos_status",
  title: "Scan continuation test",
  body: "Ready after locked documents",
  deliveryStatus: "pending",
  retryCount: 0,
  deliveryOutcomeUnknown: false,
  deliveryLeaseId: null,
  deliveryLeaseUntil: null,
  nextRetryAt: null,
});

await scanBatch.commit();

let scanSendCalls = 0;

const scanProvider = {
  async send(notification) {
    assert.equal(notification.id, scanReadyId);
    scanSendCalls++;
    return "mock_scan_continuation";
  },
};

// The first batch must stop before reaching the ready item.
const firstScan = await runNotificationRetryBatch(
  scanProvider,
  1,
);

assert.equal(firstScan.processed, 0);
assert.equal(scanSendCalls, 0);
assert.equal(
  (await readNotification(scanReadyId)).deliveryStatus,
  "pending",
);

// The next batch must continue past the first 200 documents.
const secondScan = await runNotificationRetryBatch(
  scanProvider,
  1,
);

assert.equal(secondScan.sent, 1);
assert.equal(scanSendCalls, 1);
assert.equal(
  (await readNotification(scanReadyId)).deliveryStatus,
  "sent",
);

console.log(
  "PASS 13: Scan budget and next-batch continuation",
);

    // ========================================
    // FINAL RESULT
    // ========================================

console.log("All 13 Retry Worker Emulator tests passed");
  } finally {
    // Delete only documents created by this test run.
    try {
      for (const id of createdIds) {
        await collection.doc(id).delete();
      }
    } finally {
      await deleteApp(app);
    }
  }
}

runTests().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
