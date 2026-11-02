const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-floodguard-ccf148";

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const runId = randomUUID();
const app = initializeApp(
  { projectId: process.env.GCLOUD_PROJECT },
  `ccf150-recipients-${runId}`,
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
  createFloodWarningNotificationForRecipient: createForRecipient,
} = require("../src/services/flood-warning-notification.service");

const {
  buildSubscriptionId,
  SUBSCRIPTIONS_COLLECTION,
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
  const userId = `ccf150_user_${suffix}`;
  const areaId = `ccf150_area_${suffix}`;
  const alertId = `ccf150_alert_${suffix}`;
  const now = Date.now();

  const userRef = trackedRef("users", userId);
  const areaRef = trackedRef("flood_areas", areaId);
  const alertRef = trackedRef("flood_alerts", alertId);
  const eventRef = trackedRef(FLOOD_WARNING_EVENTS_COLLECTION, eventId);
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
    subscriptionRef.set({
      recipientId: userId,
      areaId,
      enabled: true,
    }),
  ]);

  return {
    eventId,
    userId,
    areaId,
    alertId,
    userRef,
    areaRef,
    alertRef,
    eventRef,
    subscriptionRef,
    notificationRef,
    run() {
      return createForRecipient(eventId, userId);
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
    const first = await fixture();
    const result = await first.run();

    assert.equal(result.created, true);
    const saved = (await first.notificationRef.get()).data();
    assert.equal(saved.recipientId, first.userId);
    assert.equal(saved.type, "flood_warning");
    assert.equal(saved.relatedEntity.id, first.alertId);
    assert.equal(saved.deliveryStatus, "pending");
    assert.ok(saved.createdAt instanceof Timestamp);
    pass("Subscribed active recipient receives notification");

    const repeated = await first.run();
    assert.equal(repeated.created, false);
    assert.equal(repeated.code, "ALREADY_CREATED");
    assert.equal(repeated.notificationId, result.notificationId);
    assert.ok(
      saved.createdAt.isEqual(
        (await first.notificationRef.get()).data().createdAt,
      ),
    );
    pass("Repeated event does not overwrite notification");

    const concurrent = await fixture();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => concurrent.run()),
    );
    assert.equal(results.filter((item) => item.created).length, 1);
    assert.equal(new Set(results.map((item) => item.notificationId)).size, 1);
    pass("Concurrent workers create one notification");

    async function expectSkip(name, mutate, code) {
      const item = await fixture();
      await mutate(item);

      const outcome = await item.run();
      assert.equal(outcome.created, false);
      assert.equal(outcome.code, code);
      assert.equal((await item.notificationRef.get()).exists, false);
      pass(name);
    }

    await expectSkip(
      "No subscription",
      (item) => item.subscriptionRef.delete(),
      "NOT_SUBSCRIBED",
    );

    await expectSkip(
      "Unsubscribed recipient",
      (item) => item.subscriptionRef.update({ enabled: false }),
      "NOT_SUBSCRIBED",
    );

    await expectSkip(
      "Subscription for another area rejected",
      (item) => item.subscriptionRef.update({ areaId: "other_area" }),
      "NOT_SUBSCRIBED",
    );

    await expectSkip(
      "Subscription for another recipient rejected",
      (item) => item.subscriptionRef.update({ recipientId: "other_user" }),
      "NOT_SUBSCRIBED",
    );

    await expectSkip(
      "Inactive account",
      (item) => item.userRef.update({ isActive: false }),
      "RECIPIENT_NOT_ELIGIBLE",
    );

    await expectSkip(
      "Deleted account",
      (item) => item.userRef.delete(),
      "RECIPIENT_NOT_ELIGIBLE",
    );

    await expectSkip(
      "Unsupported account role",
      (item) => item.userRef.update({ role: "unknown" }),
      "RECIPIENT_NOT_ELIGIBLE",
    );

    await expectSkip(
      "Old revision superseded",
      (item) =>
        item.alertRef.update({
          notificationRevision: randomUUID(),
        }),
      "EVENT_SUPERSEDED",
    );

    await expectSkip(
      "Inactive warning",
      (item) => item.alertRef.update({ status: "inactive" }),
      "ALERT_INACTIVE",
    );

    await expectSkip(
      "Future warning",
      (item) =>
        item.alertRef.update({
          startAt: Timestamp.fromMillis(Date.now() + 60000),
        }),
      "NOT_STARTED",
    );

    await expectSkip(
      "Expired warning",
      (item) =>
        item.alertRef.update({
          startAt: Timestamp.fromMillis(Date.now() - 120000),
          endAt: Timestamp.fromMillis(Date.now() - 60000),
        }),
      "EXPIRED",
    );

    await expectSkip(
      "TEST ONLY warning",
      (item) =>
        item.alertRef.update({
          title: "TEST ONLY - simulated warning",
        }),
      "TEST_DATA",
    );

    await expectSkip(
      "TEST ONLY area",
      (item) =>
        item.areaRef.update({
          name: "TEST ONLY - simulated area",
        }),
      "TEST_DATA",
    );

    await expectSkip(
      "Deleted area",
      (item) => item.areaRef.delete(),
      "AREA_NOT_FOUND",
    );

    await expectSkip(
      "Deleted warning",
      (item) => item.alertRef.delete(),
      "ALERT_NOT_FOUND",
    );

    await expectSkip(
      "Completed event",
      (item) => item.eventRef.update({ status: "completed" }),
      "EVENT_NOT_PENDING",
    );

    await expectSkip(
      "Missing event",
      (item) => item.eventRef.delete(),
      "EVENT_NOT_FOUND",
    );

    const conflict = await fixture();
    await conflict.notificationRef.set({
      eventId: "conflicting-event",
      recipientId: conflict.userId,
    });

    await assert.rejects(
      conflict.run(),
      (error) => error.code === "NOTIFICATION_EVENT_CONFLICT",
    );

    assert.equal(
      (await conflict.notificationRef.get()).data().eventId,
      "conflicting-event",
    );
    pass("Conflicting notification is rejected without overwrite");

    await assert.rejects(
      createForRecipient("../invalid", "user"),
      /Invalid notification event or recipient ID/,
    );
    await assert.rejects(
      createForRecipient(randomUUID(), ""),
      /Invalid notification event or recipient ID/,
    );
    pass("Invalid IDs rejected");

    console.log(`All ${passed} recipient notification tests passed`);
  } finally {
    try {
      // Delete only documents registered by this test run.
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
