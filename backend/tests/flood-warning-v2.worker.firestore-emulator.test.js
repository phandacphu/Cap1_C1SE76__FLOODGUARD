const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");

test("real Emulator fan-out cursors, per-user dedupe, GPS races and deactivate cancellation", { timeout: 120000 }, async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { t.skip("Requires guarded demo Emulator; never production"); return; }
  assert.equal(process.env.GCLOUD_PROJECT, "demo-floodguard-warning-v2");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const { createFloodWarningV2Service, COLLECTIONS: A } = require("../src/services/flood-warning-v2.service");
  const { createWarningDeviceService, DEVICE_COLLECTIONS: D } = require("../src/services/warning-v2-device.service");
  const { createWarningZonesService } = require("../src/services/warning-v2-zones.service");
  const { createWarningV2EventWorker, WORKER_COLLECTIONS: W, deliveryId } = require("../src/services/warning-v2-event-worker.service");
  const c = require("../src/services/flood-warning-v2-contract");
  const h = require("./helpers/warning-v2-geography");
  const prefix = `worker-test-${randomUUID()}`, app = initializeApp({ projectId: "demo-floodguard-warning-v2" }, prefix), db = getFirestore(app);
  const admin = prefix + "-admin", residents = [0, 1, 2].map((n) => prefix + `-resident${n}`), other = prefix + "-rescue", disabled = prefix + "-disabled";
  const actors = [admin, ...residents, other, disabled], alertIds = new Set(), installations = [];
  const unrelatedRegionRef = db.collection("flood_areas").doc(prefix + "-unrelated-region");
  let now = Date.now();
  const zonesService = createWarningZonesService({ db, loadLayer: h.layerLoader({ radar: h.collection([h.feature(h.square())]) }) });
  const api = createFloodWarningV2Service({ db, zonesService });
  const devices = createWarningDeviceService({ db, zonesService, clock: () => now });
  const worker = () => createWarningV2EventWorker({ db, zonesService, clock: () => now, batchSize: 2 });
  const job = async (alertId, kind, residentId = residents[0]) => (await db.collection(W.deliveries).doc(deliveryId(residentId, alertId, kind)).get()).data();
  const gps = (sequence, inside = true) => ({ sequence, availability: "available", reason: null, accuracyM: 20,
    capturedAt: new Date(now).toISOString(), location: inside ? { latitude: -0.025, longitude: 0.025 } :
      { latitude: 500 / h.EARTH_RADIUS_M * 180 / Math.PI, longitude: 0.025 } });
  async function generalPass(id) {
    const eventId = c.hash([id, "general"]), eventRef = db.collection(W.events).doc(eventId);
    const initial = (await eventRef.get()).data().fanout?.pass ?? 0;
    for (let n = 0; n < 50; n++) {
      await worker().processGeneralEvent(eventId, 2);
      if (((await eventRef.get()).data().fanout?.pass ?? 0) > initial) return;
    }
    throw new Error("TEST ONLY fan-out cursor did not finish");
  }
  try {
    for (const actor of actors) await db.collection("users").doc(actor).set({ role: actor === admin ? "admin" : actor === other ? "rescue" : "resident", isActive: actor !== disabled });
    const alert = (await api.create(admin, randomUUID(), { title: `TEST ONLY - ${prefix}`, content: "TEST ONLY - Not a real bulletin" })).floodAlert;
    alertIds.add(alert.id);
    await api.update(admin, alert.id, { expectedRevision: 1, title: "TEST ONLY - Edited before fan-out" });
    await worker().processGeneralEvent(c.hash([alert.id, "general"]), 2);
    assert.ok((await db.collection(W.events).doc(c.hash([alert.id, "general"])).get()).data().fanout.cursor);
    await generalPass(alert.id); // New factory each batch proves persisted cursor recovery.
    for (const resident of residents) assert.equal((await job(alert.id, "general", resident)).status, "pending");
    assert.equal(await job(alert.id, "general", admin), undefined); assert.equal(await job(alert.id, "general", other), undefined);
    assert.equal(await job(alert.id, "general", disabled), undefined);
    assert.equal((await job(alert.id, "general")).payload.title, alert.title);
    assert.equal((await job(alert.id, "general")).alertRevision, 1);
    await Promise.all(Array.from({ length: 3 }, () => worker().processGeneralEvent(c.hash([alert.id, "general"]), 20)));
    assert.equal((await db.collection(W.deliveries).where("alertId", "==", alert.id).get()).size, 3);
    for (let i = 0; i < 2; i++) {
      const installationId = randomUUID(), secret = randomBytes(32).toString("base64url");
      const d = (await devices.register(residents[0], installationId, secret, { platform: "android", fcmToken: null, notificationPermission: "denied",
        registrationId: randomUUID(), expectedBindingId: null, expectedRevision: 0 })).device;
      installations.push({ installationId, bindingId: d.bindingId, secret });
    }
    const [first, second] = installations;
    await devices.upload(residents[0], first, gps(1, false));
    await Promise.all(Array.from({ length: 3 }, () => worker().processDevice(first.installationId)));
    assert.equal((await job(alert.id, "near")).status, "pending");
    await devices.upload(residents[0], first, gps(2)); await devices.upload(residents[0], second, gps(1));
    await Promise.all([worker().processDevice(first.installationId), worker().processDevice(second.installationId), worker().processDevice(first.installationId)]);
    assert.equal((await job(alert.id, "inside")).status, "pending");
    assert.equal((await job(alert.id, "near")).cancellationReason, "inside_recorded");
    assert.equal((await db.collection(W.deliveries).where("alertId", "==", alert.id).get()).size, 5);
    const oldId = c.hash([first.installationId, first.bindingId, 1]); await worker().processLocationEvent(oldId);
    assert.equal((await db.collection(D.events).doc(oldId).get()).data().status, "superseded");
    const queued = await job(alert.id, "inside");
    const originBinding = installations.find((b) => b.installationId === queued.origin.installationId);
    await devices.upload(residents[0], originBinding, gps(queued.origin.sequence + 1));
    await unrelatedRegionRef.set({ areaType: "low_lying", geometry: h.adminGeometry(h.square(20, 20)) });
    assert.equal((await worker().cancelDelivery(deliveryId(residents[0], alert.id, "inside"))).canceled, 0);
    now += 60001;
    await worker().cancelDelivery(deliveryId(residents[0], alert.id, "inside"));
    assert.equal((await job(alert.id, "inside")).status, "canceled");
    const currentSequence = (await db.collection(D.locations).doc(first.installationId).get()).data().sequence;
    await devices.upload(residents[0], first, gps(currentSequence + 1)); await worker().processDevice(first.installationId);
    assert.equal((await db.collection(W.deliveries).where("alertId", "==", alert.id).get()).size, 5);
    await db.collection("users").doc(residents[1]).update({ isActive: false });
    await worker().cancelDelivery(deliveryId(residents[1], alert.id, "general"));
    assert.equal((await job(alert.id, "general", residents[1])).cancellationReason, "recipient_ineligible");
    await api.deactivate(admin, alert.id, {});
    const offId = c.hash([alert.id, "deactivated"]);
    for (let n = 0; n < 8; n++) await worker().processDeactivatedEvent(offId, { limit: 1 });
    const canceled = await db.collection(W.deliveries).where("alertId", "==", alert.id).get();
    assert.ok(canceled.docs.every((s) => s.data().status === "canceled"));
    const off = (await db.collection(W.events).doc(offId).get()).data(); assert.equal(off.status, "prepared"); assert.equal(off.cancellationComplete, true);
    await worker().processDevice(first.installationId);
    assert.equal((await db.collection(W.deliveries).where("alertId", "==", alert.id).get()).size, 5);
  } finally {
    // Only the random test alerts, actors, and installations owned by this test are cleaned.
    for (const id of alertIds) {
      for (const collection of [W.deliveries, W.ledger]) {
        for (const doc of (await db.collection(collection).where("alertId", "==", id).get()).docs) await doc.ref.delete();
      }
      for (const kind of ["general", "deactivated"]) await db.collection(W.events).doc(c.hash([id, kind])).delete();
      for (const doc of (await db.collection(A.audit).where("target.id", "==", id).get()).docs) await doc.ref.delete();
      await db.collection(A.alerts).doc(id).delete();
    }
    for (const doc of (await db.collection(A.requests).where("actorId", "==", admin).get()).docs) await doc.ref.delete();
    for (const { installationId } of installations) {
      for (const collection of [D.events, D.registrations, W.cursors]) {
        for (const doc of (await db.collection(collection).where("installationId", "==", installationId).get()).docs) await doc.ref.delete();
      }
      await db.collection(D.devices).doc(installationId).delete(); await db.collection(D.locations).doc(installationId).delete();
    }
    await unrelatedRegionRef.delete();
    for (const id of actors) await db.collection("users").doc(id).delete();
    await db.terminate(); await deleteApp(app);
  }
});
