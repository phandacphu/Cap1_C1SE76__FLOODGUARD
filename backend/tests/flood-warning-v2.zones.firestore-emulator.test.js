const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

test("canonical regions and GPS engine reflect real Emulator Admin edits/deletions", { timeout: 90000 }, async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { t.skip("Requires Firestore Emulator; never uses real credentials"); return; }
  assert.equal(process.env.GCLOUD_PROJECT, "demo-floodguard-warning-v2");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore, Timestamp } = require("firebase-admin/firestore");
  const { createWarningZonesService } = require("../src/services/warning-v2-zones.service");
  const { createFloodWarningV2Service } = require("../src/services/flood-warning-v2.service");
  const { evaluatePosition, gpsBody } = require("../src/services/warning-v2-evaluation");
  const h = require("./helpers/warning-v2-geography");
  const prefix = `warn-zones-test-${randomUUID()}`;
  const app = initializeApp({ projectId: "demo-floodguard-warning-v2" }, prefix), db = getFirestore(app);
  const actorRef = db.collection("users").doc(prefix), floodRef = db.collection("flood_areas").doc(prefix + "-flood"),
    lowRef = db.collection("flood_areas").doc(prefix + "-low"), historyId = prefix + "-HIST",
    historyRef = db.collection("historical_flood_area_overrides").doc(historyId);
  const points = h.collection([h.feature({ type: "Point", coordinates: [0, 0] }, { id: historyId, name: "TEST ONLY - history" })]);
  const radar = h.collection([h.feature(h.square(), { source: "TEST ONLY - radar" })]);
  try {
    await actorRef.set({ role: "admin", isActive: true });
    await floodRef.set({ areaType: "flood", name: "TEST ONLY - flood", geometry: h.adminGeometry(), recordedAt: Timestamp.now() });
    await lowRef.set({ areaType: "low_lying", name: "TEST ONLY - low", geometry: h.adminGeometry() });
    const zonesService = createWarningZonesService({ db, loadLayer: h.layerLoader({ points, radar }) });
    const service = createFloodWarningV2Service({ db, zonesService });
    const first = await service.zones(prefix);
    assert.equal(first.geojson.features.find((f) => f.properties.zoneId === `admin:${floodRef.id}`).properties.group, "current_flood");
    assert.equal(first.geojson.features.find((f) => f.properties.zoneId === `admin:${lowRef.id}`).properties.group, "low_lying");
    assert.ok(first.coverage.unassessableZones.some((d) => d.zoneId === `history:${historyId}` && d.reason === "missing_geometry"));
    const sample = gpsBody(h.sample(), h.NOW);
    assert.equal(evaluatePosition({ sample, zones: first, activeAlertIds: ["TEST ONLY"], now: h.NOW }).status, "inside");
    await historyRef.set({ geometry: h.adminGeometry(), updatedAt: Timestamp.now() });
    const second = await service.zones(prefix);
    assert.notEqual(second.zonesRevision, first.zonesRevision);
    assert.ok(second.geojson.features.some((f) => f.properties.zoneId === `history:${historyId}` && f.properties.geometryStatus === "valid"));
    await floodRef.update({ geometry: { type: "polygon", points: [] }, updatedAt: Timestamp.now() });
    const invalid = await service.zones(prefix);
    assert.ok(invalid.coverage.unassessableZones.some((d) => d.zoneId === `admin:${floodRef.id}` && d.reason === "invalid_geometry"));
    await lowRef.delete(); await historyRef.set({ deletedAt: Timestamp.now() }, { merge: true });
    const after = await service.zones(prefix);
    assert.equal(after.geojson.features.some((f) => [`admin:${lowRef.id}`, `history:${historyId}`].includes(f.properties.zoneId)), false);
    assert.notEqual(after.zonesRevision, invalid.zonesRevision);
    await actorRef.update({ isActive: false });
    await assert.rejects(service.zones(prefix), { code: "ACCOUNT_INACTIVE" });
  } finally {
    for (const ref of [actorRef, floodRef, lowRef, historyRef]) await ref.delete();
    await db.terminate(); await deleteApp(app);
  }
});
