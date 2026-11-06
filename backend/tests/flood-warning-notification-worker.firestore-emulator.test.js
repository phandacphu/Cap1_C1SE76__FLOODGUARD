const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-floodguard-ccf148";

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const runId = randomUUID();
const app = initializeApp(
  { projectId: process.env.GCLOUD_PROJECT },
  `ccf150-worker-${runId}`,
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
  processFloodWarningEventBatch: processBatch,
} = require("../src/services/flood-warning-notification-worker.service");

const {
  SUBSCRIPTIONS_COLLECTION,
  buildSubscriptionId,
} = require("../src/services/flood-warning-subscription.service");

const {
  buildEventNotificationId,
} = require("../src/services/notification-trigger.service");

const {
  FLOOD_WARNING_EVENTS_COLLECTION,
} = require("../src/services/flood-warning-notification-event.service");

const cleanupRefs = new Map();

function trackedRef(collection, id) {
  const ref = db.collection(collection).doc(id);
  cleanupRefs.set(ref.path, ref);
  return ref;
}

async function fixture() {
  const suffix = `${runId}_${randomUUID()}`;
  const eventId = randomUUID();
  const areaId = `ccf150_area_${suffix}`;
  const alertId = `ccf150_alert_${suffix}`;
  const now = Date.now();

  const areaRef = trackedRef("flood_areas", areaId);
  const alertRef = trackedRef("flood_alerts", alertId);
  const eventRef = trackedRef(FLOOD_WARNING_EVENTS_COLLECTION, eventId);

  await Promise.all([
    areaRef.set({ name: "Monitored area" }),
    alertRef.set({
      title: "Flood warning",
      content: "Warning information",
      severity: "high",
      status: "active",
      areaId,
      notificationRevision: eventId,
      startAt: Timestamp.fromMillis(now - 60000),
      endAt: Timestamp.fromMillis(now + 3600000),
    }),
    eventRef.set({
      alertId,
      revision: eventId,
      status: "pending",
      availableAt: Timestamp.fromMillis(now - 60000),
    }),
  ]);

  const recipients = [];

  for (let index = 0; index < 3; index++) {
    const userId = `ccf150_user_${suffix}_${index}`;
    const userRef = trackedRef("users", userId);
    const subscriptionRef = trackedRef(
      SUBSCRIPTIONS_COLLECTION,
      buildSubscriptionId(userId, areaId),
    );
    const notificationRef = trackedRef(
      "notifications",
      buildEventNotificationId(`flood_warning:${eventId}`, userId),
    );

    await Promise.all([
      userRef.set({ role: "resident", isActive: true }),
      subscriptionRef.set({
        recipientId: userId,
        areaId,
        enabled: true,
      }),
    ]);

    recipients.push({
      userId,
      userRef,
      subscriptionRef,
      notificationRef,
    });
  }

  recipients.sort((first, second) =>
    first.subscriptionRef.id.localeCompare(second.subscriptionRef.id),
  );

  return {
    eventId,
    areaId,
    areaRef,
    alertRef,
    eventRef,
    recipients,
    async notificationCount() {
      const snapshot = await db
        .collection("notifications")
        .where("eventId", "==", `flood_warning:${eventId}`)
        .get();
      return snapshot.size;
    },
  };
}

async function runTests() {
  let passed = 0;

  function pass(name) {
    passed++;
    console.log(`PASS ${passed}: ${name}`);
  }

  try {
    const paged = await fixture();

    const first = await processBatch(paged.eventId, 2);
    assert.equal(first.scanned, 2);
    assert.equal(first.created, 2);
    assert.equal(first.completed, false);
    assert.equal(
      (await paged.eventRef.get()).data().recipientCursor,
      paged.recipients[1].subscriptionRef.id,
    );
    pass("First batch respects size and persists cursor");

    const second = await processBatch(paged.eventId, 2);
    assert.equal(second.scanned, 1);
    assert.equal(second.created, 1);
    assert.equal(second.completed, true);
    assert.equal(await paged.notificationCount(), 3);
    assert.equal((await paged.eventRef.get()).data().processingLeaseId, null);
    pass("Next batch resumes and completes event");

    const repeated = await processBatch(paged.eventId, 2);
    assert.equal(repeated.code, "EVENT_NOT_PENDING");
    assert.equal(await paged.notificationCount(), 3);
    pass("Completed event is not processed again");

    const concurrent = await fixture();
    const parallel = await Promise.all([
      processBatch(concurrent.eventId, 2),
      processBatch(concurrent.eventId, 2),
    ]);

    assert.equal(
      parallel.some((item) => item.code === "EVENT_PROCESSING_FAILED"),
      false,
    );

    for (let index = 0; index < 3; index++) {
      if ((await concurrent.eventRef.get()).data().status !== "pending") {
        break;
      }
      await processBatch(concurrent.eventId, 2);
    }

    assert.equal(await concurrent.notificationCount(), 3);
    assert.equal((await concurrent.eventRef.get()).data().status, "completed");
    pass("Concurrent workers produce no duplicate notifications");

    const locked = await fixture();
    await locked.eventRef.update({
      processingLeaseId: "another-worker",
      processingLeaseUntil: Timestamp.fromMillis(Date.now() + 60000),
    });

    const lockedResult = await processBatch(locked.eventId);
    assert.equal(lockedResult.code, "EVENT_IN_PROGRESS");
    assert.equal(await locked.notificationCount(), 0);
    pass("Active lease blocks another worker");

    await locked.eventRef.update({
      processingLeaseUntil: Timestamp.fromMillis(Date.now() - 1000),
    });

    const recovered = await processBatch(locked.eventId);
    assert.equal(recovered.created, 3);
    assert.equal(recovered.completed, true);
    pass("Expired lease can be recovered safely");

    const filtered = await fixture();
    await filtered.recipients[0].subscriptionRef.update({
      enabled: false,
    });
    await filtered.recipients[1].userRef.update({
      isActive: false,
    });

    const filteredResult = await processBatch(filtered.eventId);
    assert.equal(filteredResult.scanned, 3);
    assert.equal(filteredResult.created, 1);
    assert.equal(filteredResult.skipped, 2);
    assert.equal(filteredResult.completed, true);
    pass("Disabled subscription and inactive account skipped");

    const future = await fixture();
    const futureStart = Date.now() + 86400000;
    await future.alertRef.update({
      startAt: Timestamp.fromMillis(futureStart),
      endAt: Timestamp.fromMillis(futureStart + 3600000),
    });

    const futureResult = await processBatch(future.eventId);
    assert.equal(futureResult.code, "NOT_STARTED");
    assert.equal(await future.notificationCount(), 0);

    const futureEvent = (await future.eventRef.get()).data();
    assert.equal(futureEvent.status, "pending");
    assert.equal(futureEvent.availableAt.toMillis(), futureStart);
    pass("Future event remains pending until startAt");

    const stale = await fixture();
    await stale.alertRef.update({
      notificationRevision: randomUUID(),
    });

    const staleResult = await processBatch(stale.eventId);
    assert.equal(staleResult.code, "EVENT_SUPERSEDED");
    assert.equal(await stale.notificationCount(), 0);
    assert.equal((await stale.eventRef.get()).data().status, "cancelled");
    pass("Superseded event cancelled");

    const testData = await fixture();
    await testData.areaRef.update({
      name: "TEST ONLY - simulated area",
    });

    const testResult = await processBatch(testData.eventId);
    assert.equal(testResult.code, "TEST_DATA");
    assert.equal(await testData.notificationCount(), 0);
    assert.equal((await testData.eventRef.get()).data().status, "cancelled");
    pass("Test data event cancelled");

    const retry = await fixture();

    // Force failure after the first recipient has been processed.
    const conflictingRef = retry.recipients[1].notificationRef;
    await conflictingRef.set({ eventId: "conflicting-event" });

    const failed = await processBatch(retry.eventId);
    assert.equal(failed.code, "EVENT_PROCESSING_FAILED");
    assert.equal(failed.created, 1);

    const failedEvent = (await retry.eventRef.get()).data();
    assert.equal(failedEvent.status, "pending");
    assert.equal(failedEvent.recipientCursor ?? null, null);
    assert.equal(failedEvent.processingLeaseId, null);

    await conflictingRef.delete();

    const retried = await processBatch(retry.eventId);
    assert.equal(retried.created, 2);
    assert.equal(retried.skipped, 1);
    assert.equal(retried.completed, true);
    assert.equal(await retry.notificationCount(), 3);
    pass("Failed page retries without duplicating earlier notifications");

    const exact = await fixture();
    const exactFirst = await processBatch(exact.eventId, 3);
    assert.equal(exactFirst.completed, false);

    const exactLast = await processBatch(exact.eventId, 3);
    assert.equal(exactLast.scanned, 0);
    assert.equal(exactLast.completed, true);
    assert.equal(await exact.notificationCount(), 3);
    pass("Exact full page completes on next empty page");

    await assert.rejects(
      processBatch("../invalid"),
      /Invalid flood warning event ID/,
    );

    for (const size of [0, 101, 1.5]) {
      await assert.rejects(
        processBatch(randomUUID(), size),
        /Invalid flood warning batch size/,
      );
    }
    pass("Invalid arguments rejected");

    console.log(`All ${passed} notification worker tests passed`);
  } finally {
    try {
      for (const ref of cleanupRefs.values()) {
        await ref.delete();
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
