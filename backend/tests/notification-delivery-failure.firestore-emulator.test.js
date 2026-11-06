const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const PROJECT_ID = "demo-floodguard-ccf148";
process.env.GCLOUD_PROJECT = PROJECT_ID;

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const app = initializeApp(
  { projectId: PROJECT_ID },
  `ccf153-delivery-${randomUUID()}`,
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
  deliverNotification,
  MAX_DELIVERY_ATTEMPTS,
  getRetryDelayMs,
} = require("../src/services/notification-delivery.service");

const collection = db.collection("notifications");
const logs = db.collection("notification_delivery_logs");
const createdIds = new Set();

async function createSample() {
  const id = `ccf153_${randomUUID()}`;
  createdIds.add(id);

  await collection.doc(id).create({
    recipientId: "ccf153_resident",
    eventId: `ccf153:${id}`,
    type: "sos_status",
    title: "SOS status updated",
    body: "Your SOS request has been received",
    relatedEntity: {
      type: "rescue_request",
      id: "ccf153_request",
    },
    createdAt: Timestamp.now(),
    readAt: null,
    deliveryStatus: "pending",
    retryCount: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
  });

  return id;
}

async function readNotification(id) {
  return (await collection.doc(id).get()).data();
}

async function readLogs(id) {
  const snapshot = await logs.where("notificationId", "==", id).get();

  return snapshot.docs.map((doc) => doc.data());
}

function rejectingProvider(properties) {
  let calls = 0;

  return {
    get calls() {
      return calls;
    },

    async send() {
      calls++;

      const error = new Error("SECRET_PROVIDER_PAYLOAD");
      Object.assign(error, properties);
      throw error;
    },
  };
}

async function runTests() {
  try {
    // TEST 1: HTTP 429 schedules a retry.
    const rateLimitedId = await createSample();
    const rateLimitedProvider = rejectingProvider({
      statusCode: 429,
    });

    const beforeRateLimit = Date.now();

    await deliverNotification(rateLimitedId, rateLimitedProvider);

    const afterRateLimit = Date.now();
    const rateLimited = await readNotification(rateLimitedId);

    assert.equal(rateLimited.deliveryStatus, "failed");
    assert.equal(rateLimited.deliveryFailureType, "transient");
    assert.equal(rateLimited.deliveryFinalFailure, false);
    assert.equal(rateLimited.retryCount, 1);
    assert.equal(rateLimited.lastDeliveryCode, "PROVIDER_RATE_LIMITED");

    assert.ok(
      rateLimited.nextRetryAt.toMillis() >=
        beforeRateLimit + getRetryDelayMs(1),
    );

    assert.ok(
      rateLimited.nextRetryAt.toMillis() <= afterRateLimit + getRetryDelayMs(1),
    );

    const notDue = await deliverNotification(
      rateLimitedId,
      rateLimitedProvider,
    );

    assert.equal(notDue.attempted, false);
    assert.equal(notDue.code, "NOTIFICATION_RETRY_NOT_DUE");
    assert.equal(rateLimitedProvider.calls, 1);

    console.log("PASS 1: 429 schedules retry and respects backoff");

    // TEST 2: HTTP 500 can retry successfully.
    const serverErrorId = await createSample();
    const serverErrorProvider = rejectingProvider({
      statusCode: 500,
    });

    await deliverNotification(serverErrorId, serverErrorProvider);

    const serverError = await readNotification(serverErrorId);

    assert.equal(serverError.deliveryFailureType, "transient");
    assert.equal(serverError.deliveryFinalFailure, false);
    assert.equal(serverError.lastDeliveryCode, "PROVIDER_SERVER_ERROR");

    await collection.doc(serverErrorId).update({
      nextRetryAt: Timestamp.fromMillis(Date.now() - 1000),
    });

    const recovered = await deliverNotification(serverErrorId, {
      async send() {
        return "ccf153_success";
      },
    });

    assert.equal(recovered.accepted, true);
    assert.equal(recovered.persisted, true);

    const recoveredData = await readNotification(serverErrorId);

    assert.equal(recoveredData.deliveryStatus, "sent");
    assert.equal(recoveredData.deliveryFinalFailure, false);
    assert.equal(recoveredData.deliveryFailureType, null);
    assert.equal(recoveredData.nextRetryAt, null);
    assert.equal(recoveredData.retryCount, 1);

    console.log("PASS 2: 500 can recover on a later retry");

    // TEST 3: Invalid device token is a permanent failure.
    const invalidTokenId = await createSample();
    const invalidTokenProvider = rejectingProvider({
      code: "INVALID_DEVICE_TOKEN",
    });

    await deliverNotification(invalidTokenId, invalidTokenProvider);

    const invalidToken = await readNotification(invalidTokenId);

    assert.equal(invalidToken.deliveryStatus, "failed");
    assert.equal(invalidToken.deliveryFailureType, "permanent");
    assert.equal(invalidToken.deliveryFinalFailure, true);
    assert.equal(invalidToken.deliveryFinalFailureReason, "permanent_error");
    assert.ok(invalidToken.deliveryFailedAt instanceof Timestamp);
    assert.equal(invalidToken.nextRetryAt, null);
    assert.equal(invalidToken.lastDeliveryCode, "PROVIDER_INVALID_TOKEN");

    const blockedToken = await deliverNotification(
      invalidTokenId,
      invalidTokenProvider,
    );

    assert.equal(blockedToken.attempted, false);
    assert.equal(blockedToken.code, "NOTIFICATION_FINAL_FAILURE");
    assert.equal(invalidTokenProvider.calls, 1);

    console.log("PASS 3: Invalid token stops automatic retries");

    // TEST 4: Repeated transient failures stop at the limit.
    const exhaustedId = await createSample();
    const exhaustedProvider = rejectingProvider({
      statusCode: 500,
    });

    for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
      const beforeAttempt = Date.now();

      await deliverNotification(exhaustedId, exhaustedProvider);

      const afterAttempt = Date.now();
      const saved = await readNotification(exhaustedId);

      assert.equal(saved.retryCount, attempt);

      if (attempt < MAX_DELIVERY_ATTEMPTS) {
        assert.equal(saved.deliveryFinalFailure, false);

        assert.ok(
          saved.nextRetryAt.toMillis() >=
            beforeAttempt + getRetryDelayMs(attempt),
        );

        assert.ok(
          saved.nextRetryAt.toMillis() <=
            afterAttempt + getRetryDelayMs(attempt),
        );

        // Make the scheduled retry due without waiting in real time.
        await collection.doc(exhaustedId).update({
          nextRetryAt: Timestamp.fromMillis(Date.now() - 1000),
        });
      } else {
        assert.equal(saved.deliveryFinalFailure, true);
        assert.equal(saved.deliveryFinalFailureReason, "attempts_exhausted");
        assert.ok(saved.deliveryFailedAt instanceof Timestamp);
        assert.equal(saved.nextRetryAt, null);
      }
    }

    const exhaustedResult = await deliverNotification(
      exhaustedId,
      exhaustedProvider,
    );

    assert.equal(exhaustedResult.attempted, false);
    assert.equal(exhaustedProvider.calls, MAX_DELIVERY_ATTEMPTS);

    assert.equal((await readLogs(exhaustedId)).length, MAX_DELIVERY_ATTEMPTS);

    console.log("PASS 4: Exponential backoff stops at maximum attempts");

    // TEST 5: Ambiguous network timeout requires reconciliation.
    const timeoutId = await createSample();
    const timeoutProvider = rejectingProvider({
      code: "ETIMEDOUT",
    });

    await deliverNotification(timeoutId, timeoutProvider);

    const timeout = await readNotification(timeoutId);

    assert.equal(timeout.deliveryStatus, "failed");
    assert.equal(timeout.deliveryFailureType, "unknown");
    assert.equal(timeout.deliveryOutcomeUnknown, true);
    assert.equal(timeout.deliveryRequiresReconciliation, true);
    assert.equal(timeout.deliveryFinalFailure, false);
    assert.equal(timeout.nextRetryAt, null);

    const timeoutAgain = await deliverNotification(timeoutId, timeoutProvider);

    assert.equal(timeoutAgain.attempted, false);
    assert.equal(timeoutAgain.code, "NOTIFICATION_OUTCOME_UNKNOWN");
    assert.equal(timeoutProvider.calls, 1);

    console.log("PASS 5: Unknown timeout outcome blocks automatic resend");

    // TEST 6: Logs retain safe codes without provider secrets.
    const expectations = [
      [rateLimitedId, "PROVIDER_RATE_LIMITED"],
      [serverErrorId, "PROVIDER_SERVER_ERROR"],
      [invalidTokenId, "PROVIDER_INVALID_TOKEN"],
      [timeoutId, "NOTIFICATION_OUTCOME_UNKNOWN"],
    ];

    for (const [id, expectedCode] of expectations) {
      const entries = await readLogs(id);

      assert.ok(
        entries.some((entry) => entry.providerResponseCode === expectedCode),
      );

      assert.equal(
        JSON.stringify(entries).includes("SECRET_PROVIDER_PAYLOAD"),
        false,
      );
    }

    console.log("PASS 6: Failure logs contain safe codes without secrets");

    console.log("All 6 delivery failure Emulator tests passed");
  } finally {
    try {
      for (const id of createdIds) {
        const snapshot = await logs.where("notificationId", "==", id).get();

        for (const doc of snapshot.docs) {
          await doc.ref.delete();
        }

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
