const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-floodguard-ccf148";

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const runId = randomUUID();
const app = initializeApp(
  { projectId: process.env.GCLOUD_PROJECT },
  `ccf151-${runId}`,
);
const db = getFirestore(app);

const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

// Audit is isolated; SOS, assignment, history and notification use Emulator.
const auditPath = require.resolve("../src/services/audit-logging.service");
require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: {
    async logAuditEvent() {
      return { success: true };
    },
  },
};

const {
  acceptRescueRequestWithHistory: accept,
} = require("../src/services/accept-rescue-request.service");

const {
  updateRescueStatusWithHistory: updateStatus,
} = require("../src/services/update-rescue-status.service");

const { getNotificationById } = require("../src/services/notification.service");

const requestIds = new Set();
const cleanupRefs = new Map();

function trackedRef(collection, id) {
  const ref = db.collection(collection).doc(id);
  cleanupRefs.set(ref.path, ref);
  return ref;
}

async function fixture() {
  const suffix = `${runId}_${randomUUID()}`;
  const requestId = `ccf151_request_${suffix}`;
  const ownerId = `ccf151_owner_${suffix}`;
  const staffId = `ccf151_staff_${suffix}`;
  const otherId = `ccf151_other_${suffix}`;

  requestIds.add(requestId);

  const requestRef = trackedRef("rescue_requests", requestId);
  const assignmentRef = trackedRef("rescue_assignments", requestId);
  const ownerRef = trackedRef("users", ownerId);
  const staffRef = trackedRef("users", staffId);
  const otherRef = trackedRef("users", otherId);

  await Promise.all([
    ownerRef.set({ role: "resident", isActive: true }),
    staffRef.set({ role: "rescue", isActive: true }),
    otherRef.set({ role: "resident", isActive: true }),
    requestRef.set({
      residentId: ownerId,
      status: "submitted",
      location: { latitude: 16.05, longitude: 108.2 },
      urgency: "high",
      numberOfPeople: 2,
      note: "PRIVATE_FIELD_NOTE_DO_NOT_COPY",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }),
  ]);

  return {
    requestId,
    ownerId,
    staffId,
    otherId,
    requestRef,
    assignmentRef,
    ownerRef,
    staffRef,
    otherRef,
  };
}

async function notificationsFor(requestId) {
  const snapshot = await db
    .collection("notifications")
    .where("relatedEntity.id", "==", requestId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

async function historyFor(requestId) {
  return db
    .collection("rescue_request_status_history")
    .where("requestId", "==", requestId)
    .get();
}

async function runTests() {
  let passed = 0;

  function pass(name) {
    passed++;
    console.log(`PASS ${passed}: ${name}`);
  }

  try {
    const item = await fixture();

    await accept(item.requestId, item.staffId);

    let notifications = await notificationsFor(item.requestId);
    assert.equal(notifications.length, 1);

    const received = notifications[0];
    assert.equal(received.recipientId, item.ownerId);
    assert.equal(received.type, "sos_status");
    assert.equal(received.statusEvent.requestId, item.requestId);
    assert.equal(received.statusEvent.oldStatus, "submitted");
    assert.equal(received.statusEvent.newStatus, "received");
    assert.equal(received.statusEvent.sequence, 1);
    assert.equal(received.deliveryStatus, "pending");

    const receivedHistory = await db
      .collection("rescue_request_status_history")
      .doc(received.statusEvent.historyId)
      .get();

    assert.equal(receivedHistory.exists, true);
    assert.ok(
      received.statusEvent.changedAt.isEqual(receivedHistory.data().changedAt),
    );
    pass("Acceptance creates owner notification with matching history time");

    await updateStatus(item.requestId, item.staffId, {
      status: "in_progress",
      note: "PRIVATE_PROGRESS_NOTE_DO_NOT_COPY",
    });

    await updateStatus(item.requestId, item.staffId, {
      status: "assisted",
    });

    notifications = await notificationsFor(item.requestId);
    notifications.sort(
      (first, second) =>
        first.statusEvent.sequence - second.statusEvent.sequence,
    );

    assert.equal(notifications.length, 3);
    assert.deepEqual(
      notifications.map((entry) => entry.statusEvent.newStatus),
      ["received", "in_progress", "assisted"],
    );
    assert.deepEqual(
      notifications.map((entry) => entry.statusEvent.sequence),
      [1, 2, 3],
    );

    for (let index = 0; index < notifications.length; index++) {
      const notification = notifications[index];
      assert.equal(notification.recipientId, item.ownerId);
      assert.equal(notification.relatedEntity.id, item.requestId);

      const history = await db
        .collection("rescue_request_status_history")
        .doc(notification.statusEvent.historyId)
        .get();

      assert.equal(
        history.data().newStatus,
        notification.statusEvent.newStatus,
      );
      assert.ok(
        history.data().changedAt.isEqual(notification.statusEvent.changedAt),
      );

      if (index > 0) {
        const previous = notifications[index - 1].statusEvent.changedAt;
        const current = notification.statusEvent.changedAt;

        assert.ok(
          current.seconds > previous.seconds ||
            (current.seconds === previous.seconds &&
              current.nanoseconds >= previous.nanoseconds),
        );
      }
    }
    pass("Status notifications retain event order and timestamps");

    await assert.rejects(
      updateStatus(item.requestId, item.staffId, {
        status: "assisted",
      }),
      (error) => error.code === "STATUS_TRANSITION_CONFLICT",
    );

    assert.equal((await notificationsFor(item.requestId)).length, 3);
    assert.equal((await historyFor(item.requestId)).size, 3);
    pass("Repeated PATCH creates no extra history or notification");

    const ownNotification = await getNotificationById(
      received.id,
      item.ownerId,
    );
    assert.equal(ownNotification.id, received.id);

    await assert.rejects(
      getNotificationById(received.id, item.otherId),
      /Not allowed to read this notification/,
    );
    await assert.rejects(
      getNotificationById(received.id, item.staffId),
      /Not allowed to read this notification/,
    );
    pass("Only owner can read notification through notification service");

    const serialized = JSON.stringify(notifications);
    assert.equal(serialized.includes("PRIVATE_FIELD_NOTE_DO_NOT_COPY"), false);
    assert.equal(
      serialized.includes("PRIVATE_PROGRESS_NOTE_DO_NOT_COPY"),
      false,
    );
    assert.equal(serialized.includes(item.staffId), false);
    assert.equal(serialized.includes(item.otherId), false);
    assert.equal(serialized.includes('"location"'), false);
    pass("Notifications exclude private notes and other users");

    const concurrent = await fixture();
    const accepts = await Promise.allSettled([
      accept(concurrent.requestId, concurrent.staffId),
      accept(concurrent.requestId, concurrent.staffId),
    ]);

    assert.equal(
      accepts.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      accepts.find((result) => result.status === "rejected").reason.code,
      "ACCEPT_REQUEST_UNAVAILABLE",
    );
    assert.equal((await notificationsFor(concurrent.requestId)).length, 1);
    assert.equal((await historyFor(concurrent.requestId)).size, 1);
    pass("Concurrent acceptance creates one notification");

    const updates = await Promise.allSettled([
      updateStatus(concurrent.requestId, concurrent.staffId, {
        status: "in_progress",
      }),
      updateStatus(concurrent.requestId, concurrent.staffId, {
        status: "in_progress",
      }),
    ]);

    assert.equal(
      updates.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      updates.find((result) => result.status === "rejected").reason.code,
      "STATUS_TRANSITION_CONFLICT",
    );
    assert.equal((await notificationsFor(concurrent.requestId)).length, 2);
    assert.equal((await historyFor(concurrent.requestId)).size, 2);
    pass("Concurrent status update creates one new notification");

    for (const mode of ["missing", "inactive", "wrong-role"]) {
      const unavailable = await fixture();

      if (mode === "missing") {
        await unavailable.ownerRef.delete();
      } else if (mode === "inactive") {
        await unavailable.ownerRef.update({ isActive: false });
      } else {
        await unavailable.ownerRef.update({ role: "admin" });
      }

      await accept(unavailable.requestId, unavailable.staffId);

      assert.equal(
        (await unavailable.requestRef.get()).data().status,
        "received",
      );
      assert.equal((await notificationsFor(unavailable.requestId)).length, 0);
    }
    pass("Unavailable owners do not block rescue work or receive notification");

    const forbidden = await fixture();
    await accept(forbidden.requestId, forbidden.staffId);

    await forbidden.otherRef.update({ role: "rescue" });

    await assert.rejects(
      updateStatus(forbidden.requestId, forbidden.otherId, {
        status: "in_progress",
      }),
      (error) => error.code === "STATUS_STAFF_FORBIDDEN",
    );

    assert.equal((await notificationsFor(forbidden.requestId)).length, 1);
    assert.equal((await historyFor(forbidden.requestId)).size, 1);
    pass("Unassigned staff cannot change status or create notification");

    // Inject a notification write failure inside a real transaction.
    const rollback = await fixture();
    const originalRunTransaction = db.runTransaction;
    let injected = false;

    db.runTransaction = function (callback, ...options) {
      return originalRunTransaction.call(
        this,
        async (transaction) => {
          const originalCreate = transaction.create.bind(transaction);

          transaction.create = function (ref, data) {
            if (ref.parent.id === "notifications") {
              injected = true;
              throw new Error("MOCK_NOTIFICATION_WRITE_FAILURE");
            }
            return originalCreate(ref, data);
          };

          return callback(transaction);
        },
        ...options,
      );
    };

    try {
      await assert.rejects(
        accept(rollback.requestId, rollback.staffId),
        /MOCK_NOTIFICATION_WRITE_FAILURE/,
      );
    } finally {
      db.runTransaction = originalRunTransaction;
    }

    assert.equal(injected, true);
    assert.equal((await rollback.requestRef.get()).data().status, "submitted");
    assert.equal((await rollback.assignmentRef.get()).exists, false);
    assert.equal((await historyFor(rollback.requestId)).size, 0);
    assert.equal((await notificationsFor(rollback.requestId)).length, 0);
    pass("Notification write failure rolls back SOS, assignment and history");

    console.log(`All ${passed} SOS notification Emulator tests passed`);
  } finally {
    try {
      for (const requestId of requestIds) {
        const notifications = await db
          .collection("notifications")
          .where("relatedEntity.id", "==", requestId)
          .get();

        const history = await historyFor(requestId);

        for (const doc of [...notifications.docs, ...history.docs]) {
          await doc.ref.delete();
        }
      }

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
