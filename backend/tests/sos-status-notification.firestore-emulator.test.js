// Explicit opt-in: this test must never use a service account or real Firebase.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const enabled =
  process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
  process.env.GCLOUD_PROJECT === "demo-floodguard-sos";

test(
  "Firestore Emulator: direct SOS create/location/completion concurrency and notifications",
  { skip: !enabled },
  async () => {
    const { initializeApp, deleteApp } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");
    const app = initializeApp(
      { projectId: "demo-floodguard-sos" },
      `sos-${randomUUID()}`,
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
      createSosWithHistory: create,
    } = require("../src/services/create-sos.service");
    const {
      updateSosLocation: update,
    } = require("../src/services/sos-location.service");
    const {
      updateRescueStatusWithHistory: complete,
    } = require("../src/services/update-rescue-status.service");
    const { activeSosLockId } = require("../src/services/sos-contract");
    const suffix = randomUUID();
    const owner = `owner-${suffix}`;
    const staff = `staff-${suffix}`;
    const other = `staff2-${suffix}`;
    const refs = [
      db.doc(`users/${owner}`),
      db.doc(`users/${staff}`),
      db.doc(`users/${other}`),
    ];
    let requestId;
    try {
      await Promise.all(
        refs.map((ref, i) =>
          ref.set({ role: i === 0 ? "resident" : "rescue", isActive: true }),
        ),
      );
      const input = {
        location: { latitude: 16, longitude: 108 },
        situations: ["trapped"],
        numberOfPeople: 1,
        waterLevel: "waist",
        note: "EMULATOR TEST ONLY",
      };
      const creates = await Promise.allSettled([
        create(owner, input),
        create(owner, input),
      ]);
      assert.equal(creates.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        creates.find((r) => r.status === "rejected").reason.code,
        "DUPLICATE_SOS_REQUEST",
      );
      const sos = creates.find((r) => r.status === "fulfilled").value;
      requestId = sos.id;
      await update(requestId, owner, {
        location: { latitude: 16.1, longitude: 108.1 },
        capturedAt: new Date(sos.createdAt.toMillis() + 1).toISOString(),
      });
      const results = await Promise.allSettled([
        complete(requestId, staff, { status: "assisted" }),
        complete(requestId, other, { status: "assisted" }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        results.find((r) => r.status === "rejected").reason.code,
        "STATUS_TRANSITION_CONFLICT",
      );
      const saved = (await db.doc(`rescue_requests/${requestId}`).get()).data();
      assert.equal(saved.status, "assisted");
      assert.ok([staff, other].includes(saved.completedBy));
      assert.deepEqual(saved.initialLocation, input.location);
      assert.deepEqual(saved.location, { latitude: 16.1, longitude: 108.1 });
      assert.equal(
        (await db.doc(`active_sos_requests/${activeSosLockId(owner)}`).get())
          .exists,
        false,
      );
      const histories = await db
        .collection("rescue_request_status_history")
        .where("requestId", "==", requestId)
        .get();
      assert.equal(histories.size, 2);
      const notes = await db
        .collection("notifications")
        .where("recipientId", "==", owner)
        .get();
      assert.equal(notes.size, 1);
      assert.equal(notes.docs[0].data().statusEvent.newStatus, "assisted");
      await assert.rejects(
        update(requestId, owner, {
          location: input.location,
          capturedAt: new Date().toISOString(),
        }),
        { code: "SOS_NOT_ACTIVE" },
      );
    } finally {
      // Delete only documents belonging to this unique test run.
      const related = [];
      if (requestId) {
        related.push(db.doc(`rescue_requests/${requestId}`));
        for (const [collection, field, value] of [
          ["rescue_request_status_history", "requestId", requestId],
          ["notifications", "recipientId", owner],
          ["audit_logs", "target.id", requestId],
        ]) {
          const snapshot = await db
            .collection(collection)
            .where(field, "==", value)
            .get();
          for (const doc of snapshot.docs) {
            if (collection === "notifications") {
              const logs = await db
                .collection("notification_delivery_logs")
                .where("notificationId", "==", doc.id)
                .get();
              related.push(...logs.docs.map((log) => log.ref));
            }
            related.push(doc.ref);
          }
        }
      }
      related.push(db.doc(`active_sos_requests/${activeSosLockId(owner)}`));
      await Promise.all([...refs, ...related].map((ref) => ref.delete()));
      await deleteApp(app);
    }
  },
);
