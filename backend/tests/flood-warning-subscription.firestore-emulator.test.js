const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-floodguard-ccf148";
process.env.JWT_SECRET = "ccf150-local-emulator-test-secret";

const express = require("express");
const jwt = require("jsonwebtoken");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const runId = randomUUID();
const firebaseApp = initializeApp(
  { projectId: process.env.GCLOUD_PROJECT },
  `ccf150-subscriptions-${runId}`,
);
const db = getFirestore(firebaseApp);

const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: { db },
};

const {
  SUBSCRIPTIONS_COLLECTION,
  buildSubscriptionId,
} = require("../src/services/flood-warning-subscription.service");

const routes = require("../src/routes/flood-warning-subscription.routes");

async function runTests() {
  const userId = `ccf150_user_${runId}`;
  const otherId = `ccf150_other_${runId}`;
  const inactiveId = `ccf150_inactive_${runId}`;
  const missingUserId = `ccf150_missing_user_${runId}`;
  const areaId = `ccf150_area_${runId}`;
  const missingAreaId = `ccf150_missing_area_${runId}`;

  const userRefs = [userId, otherId, inactiveId].map((id) =>
    db.collection("users").doc(id),
  );
  const areaRef = db.collection("flood_areas").doc(areaId);

  const subscriptionRefs = [
    [userId, areaId],
    [otherId, areaId],
    [inactiveId, areaId],
    [missingUserId, areaId],
    [userId, missingAreaId],
  ].map(([recipientId, targetAreaId]) =>
    db
      .collection(SUBSCRIPTIONS_COLLECTION)
      .doc(buildSubscriptionId(recipientId, targetAreaId)),
  );

  const subscriptionRef = subscriptionRefs[0];
  let server;

  function token(id, role = "resident") {
    return jwt.sign({ role }, process.env.JWT_SECRET, {
      subject: id,
      algorithm: "HS256",
      expiresIn: "5m",
    });
  }

  try {
    await Promise.all([
      userRefs[0].set({ role: "resident", isActive: true }),
      userRefs[1].set({ role: "resident", isActive: true }),
      userRefs[2].set({ role: "resident", isActive: false }),
      areaRef.set({ name: "TEST ONLY - subscription area" }),
    ]);

    const app = express();
    app.use(express.json());
    app.use("/api/flood-warning-subscriptions", routes);

    server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, "127.0.0.1", () => {
        resolve(instance);
      });
      instance.once("error", reject);
    });

    const baseUrl =
      `http://127.0.0.1:${server.address().port}` +
      "/api/flood-warning-subscriptions";

    async function request({
      method = "GET",
      auth = token(userId),
      body,
      targetAreaId = areaId,
      query = "",
    } = {}) {
      const headers = {};
      if (auth !== null) {
        headers.Authorization = `Bearer ${auth}`;
      }
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(
        `${baseUrl}/${encodeURIComponent(targetAreaId)}${query}`,
        {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    let result = await request({ auth: null });
    assert.equal(result.status, 401);
    console.log("PASS 1: Missing JWT rejected");

    result = await request({ auth: "invalid-token" });
    assert.equal(result.status, 401);
    console.log("PASS 2: Invalid JWT rejected");

    result = await request({ auth: token(userId, "unknown") });
    assert.equal(result.status, 403);
    console.log("PASS 3: Unsupported role rejected");

    result = await request({
      method: "PUT",
      auth: token(inactiveId),
      body: { enabled: true },
    });
    assert.equal(result.status, 403);
    assert.equal((await subscriptionRefs[2].get()).exists, false);
    console.log("PASS 4: Inactive account cannot subscribe");

    result = await request({ auth: token(missingUserId) });
    assert.equal(result.status, 401);
    console.log("PASS 5: Deleted account rejected");

    result = await request();
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data.subscription, {
      areaId,
      enabled: false,
    });
    console.log("PASS 6: Unregistered area returns disabled");

    result = await request({
      method: "PUT",
      body: { enabled: true },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.subscription.enabled, true);

    const first = (await subscriptionRef.get()).data();
    assert.equal(first.recipientId, userId);
    assert.equal(first.areaId, areaId);
    assert.equal(first.enabled, true);
    assert.ok(first.createdAt instanceof Timestamp);
    assert.ok(first.updatedAt instanceof Timestamp);
    console.log("PASS 7: Subscription persisted in Emulator");

    result = await request({
      method: "PUT",
      body: { enabled: true },
    });
    assert.equal(result.status, 200);

    const repeated = (await subscriptionRef.get()).data();
    assert.ok(first.createdAt.isEqual(repeated.createdAt));
    assert.ok(first.updatedAt.isEqual(repeated.updatedAt));
    console.log("PASS 8: Repeated registration preserves timestamps");

    result = await request({ auth: token(otherId) });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.subscription.enabled, false);
    console.log("PASS 9: Other user has a separate subscription");

    result = await request({
      method: "PUT",
      body: { enabled: false, recipientId: otherId },
    });
    assert.equal(result.status, 400);
    assert.equal((await subscriptionRef.get()).data().enabled, true);
    assert.equal((await subscriptionRefs[1].get()).exists, false);
    console.log("PASS 10: Client cannot supply another recipient");

    for (const body of [{}, { enabled: "true" }, { enabled: null }, []]) {
      result = await request({ method: "PUT", body });
      assert.equal(result.status, 400);
    }
    console.log("PASS 11: Invalid bodies rejected");

    result = await request({
      method: "PUT",
      targetAreaId: missingAreaId,
      body: { enabled: true },
    });
    assert.equal(result.status, 404);
    assert.equal((await subscriptionRefs[4].get()).exists, false);
    console.log("PASS 12: Missing area cannot be subscribed");

    result = await request({ query: "?recipientId=someone-else" });
    assert.equal(result.status, 400);
    console.log("PASS 13: Unsupported query rejected");

    // Unsubscribing must still work if the area was deleted.
    await areaRef.delete();

    result = await request({
      method: "PUT",
      body: { enabled: false },
    });
    assert.equal(result.status, 200);

    const disabled = (await subscriptionRef.get()).data();
    assert.equal(disabled.enabled, false);
    assert.ok(first.createdAt.isEqual(disabled.createdAt));

    result = await request();
    assert.equal(result.body.data.subscription.enabled, false);
    console.log("PASS 14: Unsubscribe after area deletion");

    result = await request({
      method: "PUT",
      body: { enabled: false },
    });
    assert.equal(result.status, 200);

    const repeatedDisable = (await subscriptionRef.get()).data();
    assert.ok(disabled.updatedAt.isEqual(repeatedDisable.updatedAt));
    console.log("PASS 15: Repeated unsubscribe is idempotent");

    console.log("All 15 Subscription API Emulator tests passed");
  } finally {
    try {
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    } finally {
      try {
        // Delete only documents belonging to this test run.
        await Promise.all(
          [...subscriptionRefs, ...userRefs, areaRef].map((ref) =>
            ref.delete(),
          ),
        );
      } finally {
        await deleteApp(firebaseApp);
      }
    }
  }
}

runTests().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
