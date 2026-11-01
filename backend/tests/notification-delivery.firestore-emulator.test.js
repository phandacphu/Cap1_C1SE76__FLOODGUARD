
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Use local Firestore Emulator only.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const PROJECT_ID = "demo-floodguard-ccf148";
process.env.GCLOUD_PROJECT = PROJECT_ID;

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const app = initializeApp(
  { projectId: PROJECT_ID },
  `ccf149-delivery-${randomUUID()}`,
);

const db = getFirestore(app);

// Replace Firebase config before loading services.
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
  deliverNotification,
  MAX_DELIVERY_ATTEMPTS,
} = require("../src/services/notification-delivery.service");

async function runTests() {
  const runId = randomUUID();
  const createdIds = new Set();

  const collection = db.collection("notifications");

  async function makeNotification(suffix) {
    const input = {
      eventId: `ccf149:delivery:${runId}:${suffix}`,
      recipientId: `resident_${runId}`,
      type: "sos_status",
      title: "SOS status updated",
      body: "Your SOS request was updated",
      relatedEntity: {
        type: "rescue_request",
        id: `sos_${runId}`,
      },
    };

    const documentId = buildEventNotificationId(
      input.eventId,
      input.recipientId,
    );

    createdIds.add(documentId);

    const result = await triggerNotification(input);
    return result.notification.id;
  }

  async function readNotification(id) {
    const snapshot = await collection.doc(id).get();
    assert.equal(snapshot.exists, true);
    return snapshot.data();
  }

  const successProvider = {
    async send() {
      return "mock_message_success";
    },
  };

  try {
    const successId = await makeNotification("success");

    // TEST 1: No provider.
    const notConfigured = await deliverNotification(successId);

    assert.equal(notConfigured.attempted, false);
    assert.equal(notConfigured.accepted, false);
    assert.equal(
      (await readNotification(successId)).deliveryStatus,
      "pending",
    );

    console.log("PASS 1: Provider not configured");

    // TEST 2: Successful delivery.
    const success = await deliverNotification(
      successId,
      successProvider,
    );

    assert.equal(success.accepted, true);
    assert.equal(success.persisted, true);

    const sentData = await readNotification(successId);

    assert.equal(sentData.deliveryStatus, "sent");
    assert.equal(sentData.retryCount, 0);
    assert.ok(sentData.lastAttemptAt instanceof Timestamp);
    assert.equal(sentData.deliveryLeaseId, null);
    assert.equal(sentData.deliveryLeaseUntil, null);

    console.log("PASS 2: Successful delivery");

    // TEST 3: Already sent cannot be resent.
    let resendCalls = 0;

    const resend = await deliverNotification(successId, {
      async send() {
        resendCalls++;
        return "unexpected";
      },
    });

    assert.equal(resend.attempted, false);
    assert.equal(resend.code, "NOTIFICATION_ALREADY_SENT");
    assert.equal(resendCalls, 0);

    console.log("PASS 3: Already sent");

    // TEST 4: Provider failure.
    const failedId = await makeNotification("failure");

    const failed = await deliverNotification(failedId, {
      async send() {
        throw new Error("PRIVATE_PROVIDER_ERROR");
      },
    });

    assert.equal(failed.attempted, true);
    assert.equal(failed.accepted, false);
    assert.equal(failed.persisted, true);

    const failedData = await readNotification(failedId);

    assert.equal(failedData.deliveryStatus, "failed");
    assert.equal(failedData.retryCount, 1);
    assert.ok(failedData.nextRetryAt instanceof Timestamp);
    assert.ok(failedData.nextRetryAt.toMillis() > Date.now());

    console.log("PASS 4: Provider failure");

    // TEST 5: Retry is not due.
    const early = await deliverNotification(
      failedId,
      successProvider,
    );

    assert.equal(early.attempted, false);
    assert.equal(early.code, "NOTIFICATION_RETRY_NOT_DUE");

    console.log("PASS 5: Retry not due");

    // TEST 6: Retry after it becomes due.
    // Modify only the local Emulator test document.
    await collection.doc(failedId).update({
      nextRetryAt: Timestamp.fromMillis(Date.now() - 1000),
    });

    const retried = await deliverNotification(
      failedId,
      successProvider,
    );

    assert.equal(retried.accepted, true);
    assert.equal(retried.persisted, true);

    const retriedData = await readNotification(failedId);

    assert.equal(retriedData.deliveryStatus, "sent");
    assert.equal(retriedData.nextRetryAt, null);
    assert.equal(retriedData.retryCount, 1);

    console.log("PASS 6: Retry successful");

    // TEST 7: Concurrent delivery workers.
    const concurrentId = await makeNotification("concurrent");

    let providerCalls = 0;

    const slowProvider = {
      async send() {
        providerCalls++;

        await new Promise((resolve) => {
          setTimeout(resolve, 150);
        });

        return "mock_concurrent_message";
      },
    };

    const concurrentResults = await Promise.all([
      deliverNotification(concurrentId, slowProvider),
      deliverNotification(concurrentId, slowProvider),
    ]);

    assert.equal(providerCalls, 1);

    assert.equal(
      concurrentResults.filter((result) => result.attempted).length,
      1,
    );

    assert.equal(
      (await readNotification(concurrentId)).deliveryStatus,
      "sent",
    );

    console.log("PASS 7: Concurrent delivery workers");

    // TEST 8: Maximum failed attempts.
    const maxId = await makeNotification("max");

    await collection.doc(maxId).update({
      deliveryStatus: "failed",
      retryCount: MAX_DELIVERY_ATTEMPTS,
      nextRetryAt: null,
    });

    const maxResult = await deliverNotification(
      maxId,
      successProvider,
    );

    assert.equal(maxResult.attempted, false);
    assert.equal(maxResult.code, "NOTIFICATION_MAX_ATTEMPTS");

    console.log("PASS 8: Maximum attempts");

    // TEST 9: Another worker holds the lease.
    const leasedId = await makeNotification("leased");

    await collection.doc(leasedId).update({
      deliveryLeaseId: "other_worker",
      deliveryLeaseUntil: Timestamp.fromMillis(
        Date.now() + 120000,
      ),
    });

    const leaseResult = await deliverNotification(
      leasedId,
      successProvider,
    );

    assert.equal(leaseResult.attempted, false);
    assert.equal(
      leaseResult.code,
      "NOTIFICATION_DELIVERY_IN_PROGRESS",
    );

    console.log("PASS 9: Active delivery lease");

    // TEST 10: Missing document.
    const missing = await deliverNotification(
      `missing_${runId}`,
      successProvider,
    );

    assert.equal(missing.attempted, false);
    assert.equal(missing.code, "NOTIFICATION_NOT_FOUND");

    console.log("PASS 10: Missing notification");


    // TEST 11: Unknown delivery outcome must not be resent.
    const unknownId = await makeNotification("unknown");

    // Simulate a previous transport timeout.
    // Only modify a document inside the local Emulator.
    await collection.doc(unknownId).update({
      deliveryStatus: "failed",
      deliveryOutcomeUnknown: true,
      retryCount: 1,
      nextRetryAt: null,
    });

    let unknownProviderCalls = 0;

    const unknownResult = await deliverNotification(
      unknownId,
      {
        async send() {
          unknownProviderCalls++;
          return "unexpected_duplicate_message";
        },
      },
    );

    assert.equal(
      unknownResult.attempted,
      false,
      "Unknown outcome must not trigger another send",
    );

    assert.equal(
      unknownResult.code,
      "NOTIFICATION_OUTCOME_UNKNOWN",
    );

    assert.equal(unknownProviderCalls, 0);

    const unknownData = await readNotification(unknownId);

    assert.equal(unknownData.deliveryStatus, "failed");
    assert.equal(unknownData.deliveryOutcomeUnknown, true);
    assert.equal(unknownData.nextRetryAt, null);

    console.log("PASS 11: Unknown outcome blocks resend");


    // TEST 12: Real transport timeout persists unknown outcome.
    const timeoutId = await makeNotification("real_timeout");

    let timeoutProviderCalls = 0;

    const timeoutResult = await deliverNotification(
      timeoutId,
      {
        send() {
          timeoutProviderCalls++;

          // Simulate a provider that never responds.
          return new Promise(() => {});
        },
      },
    );

    assert.equal(timeoutProviderCalls, 1);
    assert.equal(timeoutResult.attempted, true);
    assert.equal(timeoutResult.accepted, false);
    assert.equal(
      timeoutResult.code,
      "NOTIFICATION_TRANSPORT_TIMEOUT",
    );
    assert.equal(timeoutResult.outcomeUnknown, true);
    assert.equal(timeoutResult.persisted, true);

    const timeoutData = await readNotification(timeoutId);

    assert.equal(timeoutData.deliveryStatus, "failed");
    assert.equal(timeoutData.deliveryOutcomeUnknown, true);
    assert.equal(timeoutData.retryCount, 1);
    assert.equal(timeoutData.nextRetryAt, null);
    assert.equal(timeoutData.deliveryLeaseId, null);
    assert.equal(timeoutData.deliveryLeaseUntil, null);

    // Even a direct delivery call must not resend it.
    let duplicateCalls = 0;

    const secondAttempt = await deliverNotification(
      timeoutId,
      {
        async send() {
          duplicateCalls++;
          return "unexpected_duplicate";
        },
      },
    );

    assert.equal(secondAttempt.attempted, false);
    assert.equal(
      secondAttempt.code,
      "NOTIFICATION_OUTCOME_UNKNOWN",
    );
    assert.equal(duplicateCalls, 0);

    console.log("PASS 12: Timeout persisted and resend blocked");



    // TEST 13: Expired lease must not trigger an automatic resend.
const expiredLeaseId = await makeNotification("expired_lease");

await collection.doc(expiredLeaseId).update({
  deliveryLeaseId: "previous_worker",
  deliveryLeaseUntil: Timestamp.fromMillis(Date.now() - 1000),
});

let expiredLeaseCalls = 0;

const expiredLeaseResult = await deliverNotification(
  expiredLeaseId,
  {
    async send() {
      expiredLeaseCalls++;
      return "unexpected_resend";
    },
  },
);

assert.equal(expiredLeaseResult.attempted, false);
assert.equal(
  expiredLeaseResult.code,
  "NOTIFICATION_OUTCOME_UNKNOWN",
);
assert.equal(expiredLeaseCalls, 0);

const expiredLeaseData = await readNotification(expiredLeaseId);

assert.equal(expiredLeaseData.deliveryStatus, "failed");
assert.equal(expiredLeaseData.deliveryOutcomeUnknown, true);
assert.equal(expiredLeaseData.nextRetryAt, null);
assert.equal(expiredLeaseData.deliveryLeaseId, null);
assert.equal(expiredLeaseData.deliveryLeaseUntil, null);

// A subsequent call must also remain blocked.
const expiredLeaseAgain = await deliverNotification(
  expiredLeaseId,
  {
    async send() {
      expiredLeaseCalls++;
      return "unexpected_resend";
    },
  },
);

assert.equal(expiredLeaseAgain.attempted, false);
assert.equal(
  expiredLeaseAgain.code,
  "NOTIFICATION_OUTCOME_UNKNOWN",
);
assert.equal(expiredLeaseCalls, 0);

console.log("PASS 13: Expired lease blocks automatic resend");
console.log("All 13 Delivery Emulator tests passed");
  } finally {
    // Clean up this run's Emulator documents only.
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
