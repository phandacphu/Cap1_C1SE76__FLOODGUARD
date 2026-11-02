const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-floodguard-ccf148";
process.env.JWT_SECRET = "ccf152-local-api-test-secret";

const express = require("express");
const jwt = require("jsonwebtoken");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const runId = randomUUID();
const app = initializeApp(
  { projectId: process.env.GCLOUD_PROJECT },
  `ccf152-log-api-${runId}`,
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
  NOTIFICATION_DELIVERY_LOGS_COLLECTION,
  stageNotificationDeliveryLog,
  buildNotificationCorrelationId,
} = require("../src/services/notification-delivery-log.service");

const routes = require("../src/routes/admin-notification-log.routes");

async function runTests() {
  const adminId = `ccf152_admin_${runId}`;
  const residentId = `ccf152_resident_${runId}`;
  const inactiveId = `ccf152_inactive_${runId}`;
  const missingUserId = `ccf152_missing_${runId}`;
  const notificationId = `ccf152_notification_${runId}`;
  const otherNotificationId = `ccf152_other_${runId}`;
  const eventId = `ccf152:event:${runId}`;

  const userRefs = [adminId, residentId, inactiveId].map((id) =>
    db.collection("users").doc(id),
  );

  const logRefs = [];
  let server;
  let passed = 0;

  function pass(name) {
    passed++;
    console.log(`PASS ${passed}: ${name}`);
  }

  function token(id, role = "admin", expiresIn = "5m") {
    return jwt.sign({ role }, process.env.JWT_SECRET, {
      subject: id,
      algorithm: "HS256",
      expiresIn,
    });
  }

  try {
    await Promise.all([
      userRefs[0].set({ role: "admin", isActive: true }),
      userRefs[1].set({ role: "resident", isActive: true }),
      userRefs[2].set({ role: "admin", isActive: false }),
    ]);

    const batch = db.batch();

    for (const [entryKey, status, retryCount, providerResponseCode] of [
      ["queued", "queued", 0, "LOCAL_QUEUED"],
      ["attempt_1", "failed", 1, "NOTIFICATION_TRANSPORT_SEND_FAILED"],
      ["attempt_2", "sent", 1, "PROVIDER_ACCEPTED"],
    ]) {
      const staged = stageNotificationDeliveryLog(
        batch,
        {
          notificationId,
          eventId,
          status,
          retryCount,
          providerResponseCode,
        },
        entryKey,
      );

      logRefs.push(
        db.collection(NOTIFICATION_DELIVERY_LOGS_COLLECTION).doc(staged.logId),
      );
    }

    const other = stageNotificationDeliveryLog(
      batch,
      {
        notificationId: otherNotificationId,
        eventId: `ccf152:other-event:${runId}`,
        status: "queued",
        retryCount: 0,
        providerResponseCode: "LOCAL_QUEUED",
      },
      "queued",
    );

    logRefs.push(
      db.collection(NOTIFICATION_DELIVERY_LOGS_COLLECTION).doc(other.logId),
    );

    await batch.commit();

    // Verify explicit response field selection even with extra stored fields.
    await logRefs[0].update({
      accessToken: "SECRET_TOKEN_DO_NOT_RETURN",
      payload: { body: "PRIVATE_PAYLOAD_DO_NOT_RETURN" },
    });

    const httpApp = express();
    httpApp.use(express.json());
    httpApp.use("/api/admin/notification-logs", routes);

    server = await new Promise((resolve, reject) => {
      const instance = httpApp.listen(0, "127.0.0.1", () => {
        resolve(instance);
      });
      instance.once("error", reject);
    });

    const baseUrl =
      `http://127.0.0.1:${server.address().port}` +
      "/api/admin/notification-logs";

    async function request(query, auth = token(adminId)) {
      const headers = {};

      if (auth !== null) {
        headers.Authorization = `Bearer ${auth}`;
      }

      const response = await fetch(`${baseUrl}?${query}`, { headers });

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    const byNotification = new URLSearchParams({ notificationId }).toString();

    let result = await request(byNotification, null);
    assert.equal(result.status, 401);
    pass("Missing JWT rejected");

    result = await request(byNotification, "invalid-token");
    assert.equal(result.status, 401);

    result = await request(byNotification, token(adminId, "admin", -1));
    assert.equal(result.status, 401);
    pass("Invalid and expired JWT rejected");

    result = await request(byNotification, token(residentId, "resident"));
    assert.equal(result.status, 403);
    pass("Resident role rejected");

    result = await request(byNotification, token(residentId, "admin"));
    assert.equal(result.status, 403);
    pass("JWT admin claim cannot override stored resident role");

    result = await request(byNotification, token(inactiveId));
    assert.equal(result.status, 403);
    pass("Inactive admin rejected");

    result = await request(byNotification, token(missingUserId));
    assert.equal(result.status, 401);
    pass("Deleted admin rejected");

    result = await request(byNotification);
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.logs.length, 3);
    assert.equal(result.body.data.nextCursor, null);

    assert.ok(
      result.body.data.logs.every(
        (log) => log.notificationId === notificationId,
      ),
    );

    assert.deepEqual(result.body.data.logs.map((log) => log.status).sort(), [
      "failed",
      "queued",
      "sent",
    ]);
    pass("Lookup by notification ID returns only matching logs");

    const serialized = JSON.stringify(result.body);

    for (const forbidden of [
      "SECRET_TOKEN_DO_NOT_RETURN",
      "PRIVATE_PAYLOAD_DO_NOT_RETURN",
      "accessToken",
      "payload",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }

    for (const log of result.body.data.logs) {
      assert.deepEqual(
        Object.keys(log).sort(),
        [
          "id",
          "notificationId",
          "eventId",
          "correlationId",
          "status",
          "retryCount",
          "providerResponseCode",
          "outcomeUnknown",
          "timestamp",
        ].sort(),
      );

      assert.equal(typeof log.timestamp, "string");
      assert.equal(new Date(log.timestamp).toISOString(), log.timestamp);
    }
    pass("Response excludes sensitive stored fields and serializes timestamps");

    result = await request(
      new URLSearchParams({
        correlationId: buildNotificationCorrelationId(notificationId),
      }).toString(),
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.data.logs.length, 3);
    pass("Lookup by correlation ID");

    result = await request(new URLSearchParams({ eventId }).toString());
    assert.equal(result.status, 200);
    assert.equal(result.body.data.logs.length, 3);
    pass("Lookup by event ID");

    const firstPage = await request(
      new URLSearchParams({
        notificationId,
        limit: "2",
      }).toString(),
    );

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.data.logs.length, 2);
    assert.ok(firstPage.body.data.nextCursor);

    const secondPage = await request(
      new URLSearchParams({
        notificationId,
        limit: "2",
        cursor: firstPage.body.data.nextCursor,
      }).toString(),
    );

    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.data.logs.length, 1);
    assert.equal(secondPage.body.data.nextCursor, null);

    const pageIds = [
      ...firstPage.body.data.logs,
      ...secondPage.body.data.logs,
    ].map((log) => log.id);

    assert.equal(new Set(pageIds).size, 3);
    assert.deepEqual(pageIds, [...pageIds].sort());
    pass("Pagination returns all matching logs without duplicates");

    result = await request(
      new URLSearchParams({
        notificationId: `ccf152_not_found_${runId}`,
      }).toString(),
    );

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data, {
      logs: [],
      nextCursor: null,
    });
    pass("Missing lookup result returns empty list");

    for (const query of [
      "",
      byNotification + "&eventId=another",
      byNotification + "&unexpected=value",
      byNotification + "&limit=0",
      byNotification + "&limit=101",
      byNotification + "&limit=1.5",
      byNotification + "&cursor=invalid",
      byNotification + "&notificationId=duplicate",
      "notificationId=bad%2Fid",
      "correlationId=invalid",
      "eventId=" + "a".repeat(257),
    ]) {
      result = await request(query);
      assert.equal(result.status, 400, query);
      assert.equal(result.body.success, false);
    }
    pass("Invalid filters, repeated parameters and pagination rejected");

    // Simulate database failure after normal admin authorization.
    const originalCollection = db.collection;

    db.collection = function (name) {
      if (name === NOTIFICATION_DELIVERY_LOGS_COLLECTION) {
        throw new Error("SECRET_DATABASE_ERROR_DO_NOT_RETURN");
      }
      return originalCollection.call(this, name);
    };

    try {
      result = await request(byNotification);
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, {
        success: false,
        message: "Internal server error",
      });
    } finally {
      db.collection = originalCollection;
    }
    pass("Database failure returns generic 500");

    console.log(`All ${passed} admin notification log API tests passed`);
  } finally {
    try {
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    } finally {
      try {
        for (const ref of [...logRefs, ...userRefs]) {
          await ref.delete();
        }
      } finally {
        await deleteApp(app);
      }
    }
  }
}

runTests().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
