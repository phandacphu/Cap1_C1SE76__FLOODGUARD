const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes, createHash } = require("node:crypto");

test("real Emulator device binding, CAS races, GPS sequencing and logout privacy", { timeout: 90000 }, async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { t.skip("Requires guarded demo Emulator; no production credentials"); return; }
  assert.equal(process.env.GCLOUD_PROJECT, "demo-floodguard-warning-v2");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const { createWarningDeviceService, DEVICE_COLLECTIONS: C } = require("../src/services/warning-v2-device.service");
  const { createWarningZonesService } = require("../src/services/warning-v2-zones.service");
  const h = require("./helpers/warning-v2-geography");
  const prefix = `warn-device-test-${randomUUID()}`, app = initializeApp({ projectId: "demo-floodguard-warning-v2" }, prefix), db = getFirestore(app);
  const actors = [prefix, prefix + "-other"], id = randomUUID(), secret = randomBytes(32).toString("base64url");
  const actorRefs = actors.map((actor) => db.collection("users").doc(actor)), alertRef = db.collection("flood_alerts").doc(prefix);
  const token = `TEST_ONLY_${randomUUID()}`, tokenRef = db.collection(C.tokens).doc(createHash("sha256").update(token).digest("hex"));
  try {
    for (const ref of actorRefs) await ref.set({ role: "resident", isActive: true });
    await alertRef.set({ schemaVersion: 2, status: "active" });
    const zonesService = createWarningZonesService({ db, loadLayer: h.layerLoader({ radar: h.collection([h.feature(h.square())]) }) });
    const svc = createWarningDeviceService({ db, zonesService });
    const body = { platform: "android", registrationId: randomUUID(), notificationPermission: "granted", fcmToken: token,
      expectedBindingId: null, expectedRevision: 0 };
    const first = await Promise.all(Array.from({ length: 4 }, () => svc.register(actors[0], id, secret, body)));
    const device = first[0].device;
    assert.equal(new Set(first.map((r) => r.device.bindingId)).size, 1);
    assert.equal(device.revision, 1); assert.equal(device.pushEligible, true);
    const unchanged = await svc.register(actors[0], id, secret, { ...body, expectedBindingId: device.bindingId, expectedRevision: 1 });
    assert.equal(unchanged.device.revision, 1);
    const headers = { installationId: id, bindingId: device.bindingId, secret };
    const gps = (sequence) => ({ sequence, availability: "available", reason: null, location: { latitude: 0, longitude: 0 },
      capturedAt: new Date().toISOString(), accuracyM: 20 });
    const sample = gps(1);
    const uploaded = await Promise.all(Array.from({ length: 3 }, () => svc.upload(actors[0], headers, sample)));
    assert.ok(uploaded.every((r) => r.evaluation.status === "inside" && r.evaluation.activeAlertIds.includes(prefix)));
    const pending = await db.collection(C.events).where("installationId", "==", id).get(); assert.equal(pending.size, 1);
    const raced = await Promise.allSettled([2, 4, 3].map((n) => svc.upload(actors[0], headers, gps(n))));
    for (const r of raced.filter((r) => r.status === "rejected")) assert.equal(r.reason.code, "LOCATION_SEQUENCE_CONFLICT");
    assert.equal((await svc.evaluation(actors[0], headers)).evaluation.sequence, 4);
    const state = (await svc.installation(actors[1], id, secret)).installation;
    assert.equal(state.boundToCurrentAccount, false);
    const changed = await svc.register(actors[1], id, secret, { ...body, registrationId: randomUUID(),
      expectedBindingId: state.bindingId, expectedRevision: state.revision });
    const newHeaders = { ...headers, bindingId: changed.device.bindingId };
    for (const action of [() => svc.upload(actors[0], headers, gps(5)), () => svc.evaluation(actors[0], headers),
      () => svc.unregister(actors[0], id, headers), () => svc.register(actors[0], id, secret, body)]) {
      await assert.rejects(action(), { code: "DEVICE_BINDING_CHANGED" });
    }
    assert.equal((await svc.evaluation(actors[1], newHeaders)).evaluation.location, null);
    await svc.upload(actors[1], newHeaders, gps(1));
    await alertRef.update({ status: "inactive" });
    assert.equal((await svc.evaluation(actors[1], newHeaders)).evaluation.reason, "no_active_alert");
    await svc.unregister(actors[1], id, newHeaders); await svc.unregister(actors[1], id, newHeaders);
    assert.equal((await db.collection(C.locations).doc(id).get()).data().location, null);
    assert.equal((await tokenRef.get()).data().active, false);
    await actorRefs[1].update({ isActive: false });
    await assert.rejects(svc.installation(actors[1], id, secret), { code: "ACCOUNT_INACTIVE" });
  } finally {
    // Only records with this randomly generated installation/actor are removed.
    for (const collection of [C.registrations, C.events]) {
      const saved = await db.collection(collection).where("installationId", "==", id).get();
      for (const doc of saved.docs) await doc.ref.delete();
    }
    for (const ref of [...actorRefs, alertRef, tokenRef, db.collection(C.devices).doc(id), db.collection(C.locations).doc(id)]) await ref.delete();
    await db.terminate(); await deleteApp(app);
  }
});
