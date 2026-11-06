const assert = require("node:assert/strict");

// Mock Firestore in memory. No real Firebase connection.
const store = new Map();
let failNextCreate = false;

const logStore = new Map();

function getCollectionStore(name) {
  assert.ok(name === "notifications" || name === "notification_delivery_logs");

  return name === "notifications" ? store : logStore;
}

const mockDb = {
  collection(name) {
    const collectionStore = getCollectionStore(name);

    return {
      doc(id) {
        return {
          id,
          collectionName: name,

          async create(data) {
            if (failNextCreate) {
              failNextCreate = false;
              throw new Error("MOCK_FIRESTORE_UNAVAILABLE");
            }

            if (collectionStore.has(id)) {
              const error = new Error("Document already exists");
              error.code = 6;
              throw error;
            }

            collectionStore.set(id, { ...data });
          },

          async get() {
            const data = collectionStore.get(id);

            return {
              id,
              exists: data !== undefined,
              data: () => data,
            };
          },
        };
      },
    };
  },

  batch() {
    const writes = [];

    return {
      create(ref, data) {
        writes.push({ ref, data });
        return this;
      },

      async commit() {
        if (failNextCreate) {
          failNextCreate = false;
          throw new Error("MOCK_FIRESTORE_UNAVAILABLE");
        }

        // Validate every write before changing either collection.
        const seen = new Set();

        for (const { ref } of writes) {
          const collectionStore = getCollectionStore(ref.collectionName);
          const key = `${ref.collectionName}/${ref.id}`;

          if (collectionStore.has(ref.id) || seen.has(key)) {
            const error = new Error("Document already exists");
            error.code = 6;
            throw error;
          }

          seen.add(key);
        }

        for (const { ref, data } of writes) {
          getCollectionStore(ref.collectionName).set(ref.id, { ...data });
        }
      },
    };
  },
};

// Replace Firebase config before loading the service.
const firebasePath = require.resolve("../src/config/firebase");

require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db: mockDb },
};

const {
  triggerNotification,
} = require("../src/services/notification-trigger.service");

const sample = {
  eventId: "sos:123:received",
  recipientId: "resident_001",
  type: "sos_status",
  title: "SOS status updated",
  body: "Your SOS request has been received",
  relatedEntity: {
    type: "rescue_request",
    id: "sos_123",
  },
};

async function runTests() {
  // TEST 1: Create a notification.
  const first = await triggerNotification(sample);

  assert.equal(first.created, true);
  assert.ok(first.notification.id);
  assert.equal(first.notification.eventId, sample.eventId);
  assert.equal(first.notification.deliveryStatus, "pending");
  assert.equal(store.size, 1);

  console.log("PASS 1: Create notification");

  // TEST 2: Same event and recipient must not duplicate.
  const second = await triggerNotification(sample);

  assert.equal(second.created, false);
  assert.equal(second.notification.id, first.notification.id);
  assert.equal(store.size, 1);

  console.log("PASS 2: Duplicate event is idempotent");

  // TEST 3: A different recipient gets a separate notification.
  const anotherRecipient = await triggerNotification({
    ...sample,
    recipientId: "resident_002",
  });

  assert.equal(anotherRecipient.created, true);
  assert.notEqual(anotherRecipient.notification.id, first.notification.id);
  assert.equal(store.size, 2);

  console.log("PASS 3: Different recipient");

  // TEST 4: Concurrent duplicate triggers.
  const concurrentInput = {
    ...sample,
    eventId: "sos:456:assisted",
  };

  const results = await Promise.all([
    triggerNotification(concurrentInput),
    triggerNotification(concurrentInput),
  ]);

  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(results[0].notification.id, results[1].notification.id);
  assert.equal(store.size, 3);

  console.log("PASS 4: Concurrent duplicate triggers");

  // TEST 5: Same event key with different payload is a conflict.
  await assert.rejects(
    triggerNotification({
      ...sample,
      title: "Different notification title",
    }),
    (error) => error.code === "NOTIFICATION_EVENT_CONFLICT",
  );

  assert.equal(store.size, 3);

  console.log("PASS 5: Conflicting event data");

  // TEST 6: Firestore write errors must propagate.
  failNextCreate = true;

  await assert.rejects(
    triggerNotification({
      ...sample,
      eventId: "sos:789:received",
    }),
    /MOCK_FIRESTORE_UNAVAILABLE/,
  );

  assert.equal(store.size, 3);

  console.log("PASS 6: Firestore failure handling");

  // TEST 7: Each created notification has exactly one queued log.
  assert.equal(logStore.size, store.size);

  for (const [notificationId, notification] of store) {
    const matchingLogs = [...logStore.values()].filter(
      (log) => log.notificationId === notificationId,
    );

    assert.equal(matchingLogs.length, 1);

    const log = matchingLogs[0];

    assert.equal(log.status, "queued");
    assert.equal(log.eventId, notification.eventId);
    assert.equal(log.retryCount, 0);
    assert.equal(log.providerResponseCode, "LOCAL_QUEUED");
    assert.ok(log.correlationId);
    assert.ok(log.timestamp);
    assert.equal(Object.hasOwn(log, "title"), false);
    assert.equal(Object.hasOwn(log, "body"), false);
    assert.equal(Object.hasOwn(log, "recipientId"), false);
  }

  console.log("PASS 7: One safe queued log per notification");

  // TEST 8: Log conflict must not leave a notification without its log.
  const {
    buildNotificationDeliveryLogId,
  } = require("../src/services/notification-delivery-log.service");

  const {
    buildEventNotificationId,
  } = require("../src/services/notification-trigger.service");

  const conflictInput = {
    ...sample,
    eventId: "sos:log-conflict:received",
  };

  const conflictNotificationId = buildEventNotificationId(
    conflictInput.eventId,
    conflictInput.recipientId,
  );

  const conflictLogId = buildNotificationDeliveryLogId(
    conflictNotificationId,
    "queued",
  );

  logStore.set(conflictLogId, { marker: "existing-log" });

  try {
    await assert.rejects(
      triggerNotification(conflictInput),
      (error) => error.code === 6,
    );

    assert.equal(store.has(conflictNotificationId), false);
    assert.deepEqual(logStore.get(conflictLogId), { marker: "existing-log" });
  } finally {
    logStore.delete(conflictLogId);
  }

  console.log("PASS 8: Log conflict prevents partial notification creation");

  console.log("All 8 Notification Trigger mock tests passed");
}

runTests().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
