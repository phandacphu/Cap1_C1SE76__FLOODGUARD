const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createWarningZonesService } = require("../src/services/warning-v2-zones.service");
const { createFloodWarningV2Service } = require("../src/services/flood-warning-v2.service");
const { createTestDb } = require("./helpers/warning-v2-test-db");
const h = require("./helpers/warning-v2-geography");

function setup() {
  const env = createTestDb();
  const points = h.collection([h.feature({ type: "Point", coordinates: [0, 0] }, { id: "HIST-1", name: "History", source_url: "TEST ONLY" })]);
  const radar = h.collection([h.feature(h.square(1, 1), { display_only: true, current_flood_alert: false })]);
  return { env, points, radar, service: (options = {}) => createWarningZonesService({ db: env.db,
    loadLayer: h.layerLoader({ points, radar }), clock: () => h.NOW, ...options }) };
}
test("four sources map into three groups; radar and Admin low_lying are both low_lying", async () => {
  const s = setup();
  s.env.put("flood_areas/flood", { name: "Flood", areaType: "flood", geometry: h.adminGeometry(), source: "TEST" });
  s.env.put("flood_areas/low", { name: "Low", areaType: "low_lying", geometry: h.adminGeometry(), source: "TEST" });
  s.env.put("historical_flood_area_overrides/HIST-1", { geometry: h.adminGeometry(), areaType: "flood" });
  const result = await s.service().load(), features = result.geojson.features;
  assert.equal(result.coverage.status, "complete"); assert.equal(result.coverage.evaluableZones, 4);
  assert.equal(features.find((f) => f.properties.zoneId === "admin:flood").properties.group, "current_flood");
  assert.equal(features.find((f) => f.properties.zoneId === "admin:low").properties.group, "low_lying");
  assert.equal(features.find((f) => f.properties.sourceKind === "radar").properties.group, "low_lying");
  assert.equal(features.find((f) => f.properties.sourceKind === "historical_area").properties.group, "historical_flood");
  assert.equal(new Set(features.map((f) => f.properties.zoneId)).size, 4);
});
test("HIST point without polygon remains missing; reference buffers are never used as outlines", async () => {
  const s = setup(), result = await s.service().load();
  const history = result.geojson.features.find((f) => f.properties.sourceKind === "historical_area");
  assert.equal(history.geometry, null); assert.equal(history.properties.geometryStatus, "missing");
  assert.equal(result.coverage.status, "partial"); assert.equal(result.coverage.unassessableZones[0].reason, "missing_geometry");
});
test("historical overrides update the same ID; soft-deleted records do not reappear", async () => {
  const s = setup(), service = s.service();
  s.env.put("historical_flood_area_overrides/HIST-1", { name: "Edited", source: "New source", geometry: h.adminGeometry(), updatedAt: s.env.Timestamp.fromMillis(h.NOW) });
  const before = await service.load(), old = before.geojson.features.find((f) => f.properties.zoneId === "history:HIST-1");
  assert.equal(old.properties.name, "Edited"); assert.equal(old.properties.source, "New source");
  s.env.put("historical_flood_area_overrides/HIST-1", { deletedAt: s.env.Timestamp.fromMillis(h.NOW) });
  const after = await service.load();
  assert.equal(after.geojson.features.some((f) => f.properties.zoneId === old.properties.zoneId), false);
  assert.notEqual(after.zonesRevision, before.zonesRevision);
});
test("overrides source failure cannot revive an old point or imply full coverage", async () => {
  const s = setup();
  const db = { collection(name) { if (name === "historical_flood_area_overrides") return { get: async () => { throw new Error("private source error"); } }; return s.env.db.collection(name); } };
  const result = await s.service({ db }).load();
  assert.equal(result.coverage.status, "partial");
  assert.equal(result.geojson.features.some((f) => f.properties.sourceKind === "historical_area"), false);
  assert.ok(result.coverage.unassessableZones.some((d) => d.reason === "source_unavailable"));
  assert.equal(JSON.stringify(result).includes("private source error"), false);
});
test("unknown classification and malformed geometry are diagnosed instead of defaulting to flood", async () => {
  const s = setup();
  s.env.put("flood_areas/unknown", { name: "Unknown", geometry: h.adminGeometry() });
  s.env.put("flood_areas/broken", { name: "Broken", areaType: "flood", geometry: { type: "polygon", points: [] } });
  const result = await s.service().load();
  assert.equal(result.geojson.features.find((f) => f.properties.zoneId === "admin:unknown").properties.group, null);
  assert.equal(result.geojson.features.find((f) => f.properties.zoneId === "admin:broken").geometry, null);
  assert.ok(result.coverage.unassessableZones.some((d) => d.reason === "unclassified_area"));
  assert.ok(result.coverage.unassessableZones.some((d) => d.reason === "invalid_geometry"));
});
test("repeated GET has stable revision; metadata/geometry edits change it; no invented timestamps", async () => {
  const s = setup(); let now = h.NOW;
  const service = s.service({ clock: () => now });
  s.env.put("flood_areas/a", { name: "A", areaType: "low_lying", geometry: h.adminGeometry(), recordedAt: false, updatedAt: 0 });
  const a = await service.load(); now += 1000; const b = await service.load();
  assert.equal(a.zonesRevision, b.zonesRevision); assert.notEqual(a.generatedAt, b.generatedAt);
  const p = a.geojson.features.find((f) => f.properties.zoneId === "admin:a").properties;
  assert.equal(p.recordedAt, null); assert.equal(p.dataUpdatedAt, null); assert.equal(p.source, null);
  s.env.put("flood_areas/a", { name: "Edited", areaType: "low_lying", geometry: h.adminGeometry(h.square(2, 2)) });
  assert.notEqual((await service.load()).zonesRevision, a.zonesRevision);
});
test("radar IDs are stable across feature order, duplicate geometry is represented once", async () => {
  const s = setup();
  s.radar.features.push(h.feature(h.square(2, 2)), s.radar.features[0]);
  const a = await s.service().load(); s.radar.features.reverse(); const b = await s.service().load();
  const ids = (result) => result.geojson.features.filter((f) => f.properties.sourceKind === "radar").map((f) => f.properties.zoneId).sort();
  assert.equal(ids(a).length, 2); assert.deepEqual(ids(a), ids(b));
});
test("empty sources are complete/no-zones; failed sources are unavailable, never false empty", async () => {
  const env = createTestDb();
  const empty = await createWarningZonesService({ db: env.db, loadLayer: h.layerLoader() }).load();
  assert.equal(empty.coverage.status, "complete"); assert.equal(empty.geojson.features.length, 0);
  const db = { collection: () => ({ get: async () => { throw new Error("DB down"); } }) };
  const broken = createWarningZonesService({ db, loadLayer: async () => { throw new Error("Layer down"); } });
  const result = await broken.load(); assert.equal(result.coverage.status, "unavailable");
  const service = createFloodWarningV2Service({ db: env.db, zonesService: broken });
  await assert.rejects(service.zones("resident"), { code: "ZONE_DATA_UNAVAILABLE", statusCode: 503 });
});
test("checked-in radar dataset validates without mutating source; Point-only HIST is partial", async () => {
  const env = createTestDb(), { getFloodHistoryGeoJSON } = require("../src/services/flood-history.service");
  const radar = await getFloodHistoryGeoJSON("radar"), original = JSON.stringify(radar);
  const service = createWarningZonesService({ db: env.db });
  const first = await service.load(), second = await service.load();
  assert.equal(first.coverage.evaluableZones, 157); assert.equal(first.coverage.totalZones, 184);
  assert.equal(first.coverage.unassessableZones.length, 27); assert.equal(first.coverage.status, "partial");
  assert.equal(first.zonesRevision, second.zonesRevision); assert.equal(JSON.stringify(radar), original);
  const { evaluatePosition } = require("../src/services/warning-v2-evaluation");
  const firstGeometry = radar.features[0].geometry;
  const [longitude, latitude] = firstGeometry.type === "MultiPolygon" ? firstGeometry.coordinates[0][0][0] : firstGeometry.coordinates[0][0];
  const evaluation = evaluatePosition({ sample: h.sample({ location: { latitude, longitude } }), zones: first,
    activeAlertIds: ["TEST-ONLY"], now: h.NOW });
  assert.equal(evaluation.status, "inside"); assert.equal(evaluation.coverage.status, "partial");
  assert.ok(evaluation.matches.every((m) => m.group === "low_lying"));
});
test("known but invalid regions remain visible as diagnostics even with no evaluable geometry", async () => {
  const env = createTestDb();
  env.put("flood_areas/broken", { name: "TEST ONLY - outline missing", areaType: "flood" });
  const zonesService = createWarningZonesService({ db: env.db, loadLayer: h.layerLoader() });
  const service = createFloodWarningV2Service({ db: env.db, zonesService });
  const result = await service.zones("resident");
  assert.equal(result.coverage.status, "unavailable"); assert.equal(result.coverage.totalZones, 1);
  assert.equal(result.geojson.features[0].properties.name, "TEST ONLY - outline missing");
  assert.equal(result.geojson.features[0].geometry, null);
});
