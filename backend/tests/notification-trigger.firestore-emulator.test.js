
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Force all Firestore requests to the local Emulator.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const PROJECT_ID = "demo-floodguard-ccf148";
process.env.GCLOUD_PROJECT = PROJECT_ID;

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const app = initializeApp(
  { projectId: PROJECT_ID },
  `ccf149-emulator-${randomUUID()}`,
);

const db = getFirestore(app);

// Replace production Firebase config with Emulator Firestore.
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

async function runTests() {
  const runId = randomUUID();
  const recipientId = `ccf149_resident_${runId}`;
  const otherRecipientId = `ccf149_other_${runId}`;
  const eventId = `ccf149:emulator:${runId}`;
  const createdIds = new Set();

  const sample = {
    eventId,
    recipientId,
    type: "sos_status",
    title: "SOS status updated",
    body: "Your SOS request has been received",
    relatedEntity: {
      type: "rescue_request",
      id: `ccf149_sos_${runId}`,
    },
  };

  function trackDocument(input) {
    createdIds.add(
      buildEventNotificationId(
        input.eventId,
        input.recipientId,
      ),
    );
  }

  try {
    // TEST 1: Create a real Emulator document.
    trackDocument(sample);
    const first = await triggerNotification(sample);

    assert.equal(first.created, true);
    assert.equal(first.notification.eventId, eventId);
    assert.ok(first.notification.createdAt instanceof Timestamp);

    const storedDoc = await db
      .collection("notifications")
      .doc(first.notification.id)
      .get();

    assert.equal(storedDoc.exists, true);
    assert.equal(storedDoc.data().recipientId, recipientId);

    console.log("PASS 1: Create notification in Emulator");

    // TEST 2: Duplicate event must reuse the same document.
    const second = await triggerNotification(sample);

    assert.equal(second.created, false);
    assert.equal(second.notification.id, first.notification.id);

    const duplicateQuery = await db
      .collection("notifications")
      .where("eventId", "==", eventId)
      .get();

    assert.equal(duplicateQuery.size, 1);

    console.log("PASS 2: Duplicate event is idempotent");

    // TEST 3: Different recipient can receive same event.
    const otherInput = {
      ...sample,
      recipientId: otherRecipientId,
    };

    trackDocument(otherInput);
    const other = await triggerNotification(otherInput);

    assert.equal(other.created, true);
    assert.notEqual(other.notification.id, first.notification.id);

    const twoRecipients = await db
      .collection("notifications")
      .where("eventId", "==", eventId)
      .get();

    assert.equal(twoRecipients.size, 2);

    console.log("PASS 3: Different recipient");

    // TEST 4: Concurrent triggers create only one document.
    const concurrentInput = {
      ...sample,
      eventId: `ccf149:concurrent:${runId}`,
    };

    trackDocument(concurrentInput);

    const results = await Promise.all(
      Array.from(
        { length: 10 },
        () => triggerNotification(concurrentInput),
      ),
    );

    assert.equal(
      results.filter((result) => result.created).length,
      1,
    );

    assert.equal(
      new Set(results.map((result) => result.notification.id)).size,
      1,
    );

    const concurrentDocs = await db
      .collection("notifications")
      .where("eventId", "==", concurrentInput.eventId)
      .get();

    assert.equal(concurrentDocs.size, 1);

    console.log("PASS 4: Concurrent duplicate triggers");

    // TEST 5: Conflicting payload must be rejected.
    await assert.rejects(
      triggerNotification({
        ...sample,
        title: "Different title",
      }),
      (error) =>
        error.code === "NOTIFICATION_EVENT_CONFLICT",
    );

    console.log("PASS 5: Conflicting event payload");

    // TEST 6: Check persisted delivery fields.
    const saved = storedDoc.data();

    assert.equal(saved.deliveryStatus, "pending");
    assert.equal(saved.retryCount, 0);
    assert.equal(saved.readAt, null);
    assert.equal(saved.lastAttemptAt, null);
    assert.equal(saved.nextRetryAt, null);

    console.log("PASS 6: Persisted delivery fields");

    // TEST 7: Invalid eventId is rejected.
    await assert.rejects(
      triggerNotification({
        ...sample,
        eventId: "   ",
      }),
      /Invalid notification eventId/,
    );

    console.log("PASS 7: Invalid eventId");

    console.log("All 7 Firestore Emulator trigger tests passed");
  } finally {
    // Delete only documents created by this test run.
    try {
      for (const id of createdIds) {
        await db.collection("notifications").doc(id).delete();
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
