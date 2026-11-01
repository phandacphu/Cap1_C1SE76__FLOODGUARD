
const assert = require("node:assert/strict");

// Mock Firestore in memory. No real Firebase connection.
const store = new Map();
let failNextCreate = false;

const mockDb = {
  collection(name) {
    assert.equal(name, "notifications");

    return {
      doc(id) {
        return {
          id,

          async create(data) {
            if (failNextCreate) {
              failNextCreate = false;
              throw new Error("MOCK_FIRESTORE_UNAVAILABLE");
            }

            if (store.has(id)) {
              const error = new Error("Document already exists");
              error.code = 6;
              throw error;
            }

            store.set(id, { ...data });
          },

          async get() {
            const data = store.get(id);

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
  assert.notEqual(
    anotherRecipient.notification.id,
    first.notification.id,
  );
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

  assert.equal(
    results.filter((result) => result.created).length,
    1,
  );
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

  console.log("All 6 Notification Trigger mock tests passed");
}

runTests().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
