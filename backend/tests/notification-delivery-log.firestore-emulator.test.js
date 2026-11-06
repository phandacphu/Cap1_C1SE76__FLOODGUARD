const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-floodguard-ccf148";

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const runId = randomUUID();
const app = initializeApp(
  { projectId: process.env.GCLOUD_PROJECT },
  `ccf152-logs-${runId}`,
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
  deliverNotification,
} = require("../src/services/notification-delivery.service");

const {
  NOTIFICATION_DELIVERY_LOGS_COLLECTION,
  buildNotificationCorrelationId,
} = require("../src/services/notification-delivery-log.service");

const notificationIds = new Set();

async function createSample() {
  const eventId = `ccf152:${runId}:${randomUUID()}`;
  const recipientId = `ccf152_resident_${runId}`;

  const input = {
    eventId,
    recipientId,
    type: "sos_status",
    title: "PRIVATE_TITLE_DO_NOT_LOG",
    body: "PRIVATE_BODY_DO_NOT_LOG",
    relatedEntity: {
      type: "rescue_request",
      id: `ccf152_request_${runId}`,
    },
  };

  const id = buildEventNotificationId(eventId, recipientId);
  notificationIds.add(id);

  const result = await triggerNotification(input);

  return {
    id,
    input,
    ref: db.collection("notifications").doc(id),
    result,
  };
}

async function readLogs(notificationId) {
  const snapshot = await db
    .collection(NOTIFICATION_DELIVERY_LOGS_COLLECTION)
    .where("notificationId", "==", notificationId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

async function runTests() {
  let passed = 0;

  function pass(name) {
    passed++;
    console.log(`PASS ${passed}: ${name}`);
  }

  const successProvider = {
    async send() {
      return "SECRET_PROVIDER_MESSAGE_ID_DO_NOT_LOG";
    },
  };

  try {
    const first = await createSample();

    let logs = await readLogs(first.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, "queued");
    assert.equal(logs[0].eventId, first.input.eventId);
    assert.equal(logs[0].retryCount, 0);
    assert.equal(logs[0].providerResponseCode, "LOCAL_QUEUED");
    assert.ok(logs[0].timestamp instanceof Timestamp);
    pass("Trigger persists queued log");

    await triggerNotification(first.input);
    assert.equal((await readLogs(first.id)).length, 1);
    pass("Duplicate trigger creates no extra queued log");

    const sent = await deliverNotification(first.id, successProvider);
    assert.equal(sent.accepted, true);
    assert.equal(sent.persisted, true);

    logs = await readLogs(first.id);
    assert.equal(logs.length, 2);

    const sentLog = logs.find((log) => log.status === "sent");
    assert.ok(sentLog);
    assert.equal(sentLog.providerResponseCode, "PROVIDER_ACCEPTED");
    assert.equal(sentLog.retryCount, 0);
    assert.equal(sentLog.outcomeUnknown, false);
    assert.equal(
      sentLog.correlationId,
      buildNotificationCorrelationId(first.id),
    );
    pass("Successful delivery persists sent log");

    await deliverNotification(first.id, successProvider);
    assert.equal((await readLogs(first.id)).length, 2);
    pass("Already-sent notification creates no extra outcome log");

    const failedItem = await createSample();

    const failure = await deliverNotification(failedItem.id, {
      async send() {
        throw new Error("SECRET_PROVIDER_ERROR_DO_NOT_LOG");
      },
    });

    assert.equal(failure.persisted, true);
    assert.equal(failure.accepted, false);

    let failureLogs = await readLogs(failedItem.id);
    const failedLog = failureLogs.find((log) => log.status === "failed");

    assert.ok(failedLog);
    assert.equal(failedLog.retryCount, 1);
    assert.equal(
      failedLog.providerResponseCode,
      "NOTIFICATION_TRANSPORT_SEND_FAILED",
    );
    assert.equal(failedLog.outcomeUnknown, false);
    pass("Known failure persists safe code and retry count");

    await failedItem.ref.update({
      nextRetryAt: Timestamp.fromMillis(Date.now() - 1000),
    });

    await deliverNotification(failedItem.id, successProvider);

    failureLogs = await readLogs(failedItem.id);
    assert.equal(failureLogs.length, 3);
    assert.deepEqual(failureLogs.map((log) => log.status).sort(), [
      "failed",
      "queued",
      "sent",
    ]);
    assert.equal(new Set(failureLogs.map((log) => log.correlationId)).size, 1);
    assert.ok(
      failureLogs.every((log) => log.eventId === failedItem.input.eventId),
    );
    assert.equal(
      failureLogs.find((log) => log.status === "sent").retryCount,
      1,
    );
    pass("Retry retains correlationId, eventId and failure count");

    const timeoutItem = await createSample();

    // Uses the real transport timeout: approximately 10 seconds.
    const timeoutResult = await deliverNotification(timeoutItem.id, {
      send() {
        return new Promise(() => {});
      },
    });

    assert.equal(timeoutResult.outcomeUnknown, true);
    assert.equal(timeoutResult.persisted, true);

    const timeoutLogs = await readLogs(timeoutItem.id);
    const timeoutLog = timeoutLogs.find((log) => log.status === "failed");

    assert.equal(
      timeoutLog.providerResponseCode,
      "NOTIFICATION_TRANSPORT_TIMEOUT",
    );
    assert.equal(timeoutLog.outcomeUnknown, true);
    assert.equal(timeoutLog.retryCount, 1);

    await deliverNotification(timeoutItem.id, successProvider);
    assert.equal((await readLogs(timeoutItem.id)).length, 2);
    pass("Timeout logged once and automatic resend blocked");

    const expired = await createSample();
    await expired.ref.update({
      deliveryLeaseId: randomUUID(),
      deliveryLeaseUntil: Timestamp.fromMillis(Date.now() - 1000),
    });

    let expiredSendCalls = 0;
    const expiredProvider = {
      async send() {
        expiredSendCalls++;
        return "should-not-send";
      },
    };

    await deliverNotification(expired.id, expiredProvider);
    await deliverNotification(expired.id, expiredProvider);

    const expiredLogs = await readLogs(expired.id);
    const expiredLog = expiredLogs.find((log) => log.status === "failed");

    assert.equal(expiredSendCalls, 0);
    assert.equal(expiredLogs.length, 2);
    assert.equal(
      expiredLog.providerResponseCode,
      "NOTIFICATION_OUTCOME_UNKNOWN",
    );
    assert.equal(expiredLog.outcomeUnknown, true);
    assert.equal(expiredLog.retryCount, 0);
    pass("Expired lease produces one unknown-outcome log without resend");

    const concurrent = await createSample();
    let sendCalls = 0;

    const concurrentProvider = {
      async send() {
        sendCalls++;
        return "accepted";
      },
    };

    await Promise.all([
      deliverNotification(concurrent.id, concurrentProvider),
      deliverNotification(concurrent.id, concurrentProvider),
    ]);

    assert.equal(sendCalls, 1);
    assert.equal((await readLogs(concurrent.id)).length, 2);
    pass("Concurrent delivery creates one outcome log");

    const allowedFields = [
      "id",
      "notificationId",
      "eventId",
      "correlationId",
      "status",
      "retryCount",
      "providerResponseCode",
      "outcomeUnknown",
      "timestamp",
    ].sort();

    for (const id of notificationIds) {
      const ownLogs = await readLogs(id);
      const serialized = JSON.stringify(ownLogs);

      assert.equal(serialized.includes("PRIVATE_TITLE_DO_NOT_LOG"), false);
      assert.equal(serialized.includes("PRIVATE_BODY_DO_NOT_LOG"), false);
      assert.equal(
        serialized.includes("SECRET_PROVIDER_MESSAGE_ID_DO_NOT_LOG"),
        false,
      );
      assert.equal(
        serialized.includes("SECRET_PROVIDER_ERROR_DO_NOT_LOG"),
        false,
      );

      for (const log of ownLogs) {
        assert.deepEqual(Object.keys(log).sort(), allowedFields);
        assert.ok(log.timestamp instanceof Timestamp);
      }
    }
    pass("Persisted logs exclude payload and raw provider secrets");

    console.log(`All ${passed} delivery log Emulator tests passed`);
  } finally {
    try {
      for (const id of notificationIds) {
        const snapshot = await db
          .collection(NOTIFICATION_DELIVERY_LOGS_COLLECTION)
          .where("notificationId", "==", id)
          .get();

        for (const doc of snapshot.docs) {
          await doc.ref.delete();
        }

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
