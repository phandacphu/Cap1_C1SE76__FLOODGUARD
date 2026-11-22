const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");

test("real Firestore push leases, multi-device dispatch, token rotation and deactivation control", { timeout: 120000 }, async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { t.skip("Requires guarded demo Emulator; no real provider"); return; }
  assert.equal(process.env.GCLOUD_PROJECT, "demo-floodguard-warning-v2");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const { createFloodWarningV2Service, COLLECTIONS: A } = require("../src/services/flood-warning-v2.service");
  const { createWarningDeviceService, DEVICE_COLLECTIONS: D } = require("../src/services/warning-v2-device.service");
  const { createWarningV2EventWorker, WORKER_COLLECTIONS: W, deliveryId } = require("../src/services/warning-v2-event-worker.service");
  const { createWarningV2PushSender, PUSH_COLLECTIONS: P, targetId } = require("../src/services/warning-v2-push-sender.service");
  const c = require("../src/services/flood-warning-v2-contract"), h = require("./helpers/warning-v2-geography");
  const prefix = `push-test-${randomUUID()}`, app = initializeApp({ projectId: "demo-floodguard-warning-v2" }, prefix), db = getFirestore(app);
  const admin = prefix + "-admin", resident = prefix + "-resident", bindings = [], alerts = [], jobs = new Set(), calls = [];
  const zonesService = { load: async () => h.zones() };
  const api = createFloodWarningV2Service({ db, zonesService }), devices = createWarningDeviceService({ db, zonesService });
  const worker = createWarningV2EventWorker({ db, zonesService });
  const factory = () => createWarningV2PushSender({ db, zonesService, provider: { async send(message) { calls.push(message); return "projects/TEST/messages/TEST"; } }, allows: (id) => id === resident });
  try {
    await db.collection("users").doc(admin).set({ role: "admin", isActive: true });
    await db.collection("users").doc(resident).set({ role: "resident", isActive: true });
    const alert = (await api.create(admin, randomUUID(), { title: `TEST ONLY - ${prefix}`, content: "TEST ONLY - No real FCM" })).floodAlert;
    alerts.push(alert.id);
    for (let i = 0; i < 2; i++) {
      const installationId = randomUUID(), secret = randomBytes(32).toString("base64url"), registrationId = randomUUID();
      const device = (await devices.register(resident, installationId, secret, { platform: "android", fcmToken: `TEST_TOKEN_${installationId}`,
        notificationPermission: "granted", registrationId, expectedBindingId: null, expectedRevision: 0 })).device;
      bindings.push({ installationId, secret, registrationId, bindingId: device.bindingId });
    }
    await worker.processGeneralEvent(c.hash([alert.id, "general"]));
    const id = deliveryId(resident, alert.id, "general"); jobs.add(id);
    await factory().prepareJob(id);
    const first = bindings[0], firstTarget = targetId(id, first.installationId, first.bindingId);
    await Promise.all(Array.from({ length: 4 }, () => factory().dispatch(firstTarget)));
    assert.equal(calls.length, 1);
    assert.equal((await db.collection(P.targets).doc(firstTarget).get()).data().status, "accepted");
    const second = bindings[1], secondTarget = targetId(id, second.installationId, second.bindingId);
    await devices.register(resident, second.installationId, second.secret, { platform: "android", fcmToken: "TEST_TOKEN_ROTATED",
      notificationPermission: "granted", registrationId: second.registrationId, expectedBindingId: second.bindingId, expectedRevision: 1 });
    await factory().dispatch(secondTarget); assert.equal(calls.length, 2); assert.equal(calls[1].token, "TEST_TOKEN_ROTATED");
    await api.deactivate(admin, alert.id, {}); const offId = c.hash([alert.id, "deactivated"]);
    await worker.processDeactivatedEvent(offId); await factory().prepareControl(offId);
    const controlId = c.hash([resident, alert.id, "deactivated"]); jobs.add(controlId);
    await factory().prepareJob(controlId, true);
    for (const b of bindings) await factory().dispatch(targetId(controlId, b.installationId, b.bindingId));
    assert.equal(calls.length, 4); assert.ok(calls.slice(2).every((m) => m.data.kind === "deactivated" && !m.notification));
    assert.equal((await db.collection(W.events).doc(offId).get()).data().status, "control_prepared");
    await factory().dispatch(firstTarget); assert.equal(calls.length, 4);
  } finally {
    // Cleanup is restricted to this test's random account/alert/installation identifiers.
    for (const id of jobs) for (const doc of (await db.collection(P.targets).where("jobId", "==", id).get()).docs) await doc.ref.delete();
    for (const alertId of alerts) {
      for (const name of [P.controls, W.deliveries, W.ledger, W.events]) {
        for (const doc of (await db.collection(name).where("alertId", "==", alertId).get()).docs) await doc.ref.delete();
      }
      for (const doc of (await db.collection(A.audit).where("target.id", "==", alertId).get()).docs) await doc.ref.delete();
      await db.collection(A.alerts).doc(alertId).delete();
    }
    for (const doc of (await db.collection(A.requests).where("actorId", "==", admin).get()).docs) await doc.ref.delete();
    for (const b of bindings) {
      for (const name of [D.tokens, D.registrations, D.events, W.cursors]) for (const doc of (await db.collection(name).where("installationId", "==", b.installationId).get()).docs) await doc.ref.delete();
      await db.collection(D.devices).doc(b.installationId).delete(); await db.collection(D.locations).doc(b.installationId).delete();
    }
    await db.collection("users").doc(admin).delete(); await db.collection("users").doc(resident).delete();
    await db.terminate(); await deleteApp(app);
  }
});
