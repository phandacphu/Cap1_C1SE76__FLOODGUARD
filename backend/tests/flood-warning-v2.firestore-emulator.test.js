const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

test("Warning V2 real Firestore transactions on a guarded demo Emulator", { timeout: 90000 }, async (t) => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) { t.skip("Requires Firestore Emulator; never uses real credentials"); return; }
  const projectId = process.env.GCLOUD_PROJECT;
  assert.equal(projectId, "demo-floodguard-warning-v2");
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const { createFloodWarningV2Service, COLLECTIONS: C } = require("../src/services/flood-warning-v2.service");
  const app = initializeApp({ projectId }, `warn-v2-${randomUUID()}`);
  const db = getFirestore(app), service = createFloodWarningV2Service({ db });
  const prefix = `warn-v2-test-${randomUUID()}`, actor = `${prefix}-admin`, resident = `${prefix}-resident`;
  const alertIds = new Set();
  try {
    await db.collection("users").doc(actor).set({ role: "admin", isActive: true });
    await db.collection("users").doc(resident).set({ role: "resident", isActive: true });
    const key = randomUUID(), body = { title: `TEST ONLY - ${prefix}`, content: "Emulator lifecycle only" };
    const results = await Promise.all(Array.from({ length: 6 }, () => service.create(actor, key, body)));
    for (const r of results) alertIds.add(r.floodAlert.id);
    assert.equal(alertIds.size, 1); assert.equal(results.filter((r) => !r.idempotency.replayed).length, 1);
    const a = results[0].floodAlert; assert.equal(a.endAt, null); assert.equal(a.startAt, a.createdAt);
    await assert.rejects(service.create(actor, key, { ...body, title: "Different" }), { code: "IDEMPOTENCY_CONFLICT" });
    const edits = await Promise.allSettled(["One", "Two"].map((content) => service.update(actor, a.id, { expectedRevision: 1, content })));
    assert.equal(edits.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(edits.find((r) => r.status === "rejected").reason.code, "ALERT_REVISION_CONFLICT");
    const off = await Promise.all(Array.from({ length: 4 }, () => service.deactivate(actor, a.id, {})));
    assert.equal(off.filter((r) => r.changed).length, 1);
    assert.equal(new Set(off.map((r) => r.floodAlert.endAt)).size, 1);
    const replay = await service.create(actor, key, body); assert.equal(replay.floodAlert.status, "inactive");
    assert.equal((await service.detail(resident, a.id)).floodAlert.revision, 3);
    const events = await db.collection(C.events).where("alertId", "==", a.id).get();
    assert.equal(events.size, 2);
    assert.equal(events.docs.find((s) => s.data().kind === "general").data().status, "canceled");
    await db.collection("users").doc(actor).update({ isActive: false });
    await assert.rejects(service.create(actor, key, body), { code: "ACCOUNT_INACTIVE" });
  } finally {
    // Only this test's users and referenced records; no broad collection deletion.
    for (const name of [C.alerts, C.requests, C.events, C.audit]) {
      const snapshot = await db.collection(name).get();
      for (const doc of snapshot.docs) {
        const d = doc.data();
        if ((name === C.alerts && alertIds.has(doc.id)) || d.actorId === actor ||
            (name === C.events && alertIds.has(d.alertId)) || d.actor?.id === actor) await doc.ref.delete();
      }
    }
    await db.collection("users").doc(actor).delete();
    await db.collection("users").doc(resident).delete();
    await db.terminate(); await deleteApp(app);
  }
});
