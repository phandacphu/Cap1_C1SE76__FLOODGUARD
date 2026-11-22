const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gpsBody, evaluatePosition } = require("../src/services/warning-v2-evaluation");
const h = require("./helpers/warning-v2-geography");
const evaluate = (sample, zones = h.zones(), options = {}) => evaluatePosition({ sample, zones, activeAlertIds: ["TEST-A", "TEST-B"], now: h.NOW, ...options });
test("GPS age60s and accuracy100m are inclusive; validity is capture-time based", () => {
  const sample = gpsBody(h.sample({ capturedAt: new Date(h.NOW - 60000).toISOString(), accuracyM: 100 }), h.NOW);
  const result = evaluate({ ...sample, receivedAt: new Date(h.NOW).toISOString() });
  assert.equal(result.status, "inside"); assert.equal(result.validUntil, new Date(h.NOW).toISOString());
  assert.equal(result.receivedAt, new Date(h.NOW).toISOString());
});
test("age over60s becomes unknown, even when the last point was inside", () => {
  const sample = gpsBody(h.sample({ capturedAt: new Date(h.NOW - 60001).toISOString() }), h.NOW);
  const result = evaluate(sample); assert.equal(result.status, "unknown"); assert.equal(result.reason, "stale_location"); assert.deepEqual(result.matches, []);
});
test("accuracy over100m or unavailable accuracy cannot produce inside/near", () => {
  for (const accuracyM of [100.001, null]) {
    const result = evaluate(gpsBody(h.sample({ accuracyM }), h.NOW));
    assert.equal(result.status, "unknown"); assert.equal(result.reason, "poor_accuracy");
  }
});
test("strict GPS payload rejects wrong coordinates/types/date, future timestamps and extra fields", () => {
  for (const patch of [{ sequence: 0 }, { sequence: "1" }, { accuracyM: -1 }, { accuracyM: "20" },
    { capturedAt: "2026-02-30T00:00:00Z" }, { capturedAt: new Date(h.NOW + 1).toISOString() },
    { location: { latitude: 91, longitude: 0 } }, { location: { latitude: 0, longitude: "0" } },
    { location: { latitude: 0, longitude: 0, zoneId: "fake" } }, { recipientId: "other" }]) {
    assert.throws(() => gpsBody(h.sample(patch), h.NOW), { code: "INVALID_LOCATION_DATA" });
  }
  assert.equal(gpsBody(h.sample({ capturedAt: "2026-11-22T01:00:20Z" }), h.NOW).capturedAt, "2026-11-22T01:00:20.000Z");
});
test("permission denial, services disabled and no fix clear the current position", () => {
  for (const reason of ["permission_denied", "location_disabled", "no_fix"]) {
    const sample = gpsBody({ sequence: 2, availability: "unavailable", reason, location: null, capturedAt: null, accuracyM: null }, h.NOW);
    const result = evaluate(sample); assert.equal(result.status, "unknown"); assert.equal(result.reason, reason);
    assert.equal(result.location, null); assert.equal(result.validUntil, null);
  }
});
test("no sample/no active alert produce explicit unknown without a personal warning", () => {
  assert.equal(evaluate(null).reason, "no_location");
  const result = evaluate(h.sample(), h.zones(), { activeAlertIds: [] });
  assert.equal(result.reason, "no_active_alert"); assert.deepEqual(result.matches, []);
});
test("the same sample expires without a new upload; device/account metadata remains identifiable", () => {
  const sample = gpsBody(h.sample(), h.NOW);
  const fresh = evaluate(sample, h.zones(), { installationId: "TEST-INSTALL", bindingId: "TEST-BIND" });
  assert.equal(fresh.status, "inside"); assert.equal(fresh.installationId, "TEST-INSTALL"); assert.equal(fresh.sequence, 1);
  const expired = evaluate(sample, h.zones(), { now: h.NOW + 50001 });
  assert.equal(expired.reason, "stale_location"); assert.deepEqual(expired.matches, []);
});
test("outside499/500/501m uses unrounded nearest-boundary distance", () => {
  for (const metres of [499, 500, 501]) {
    const result = evaluate(h.sample({ location: { latitude: metres / h.EARTH_RADIUS_M * 180 / Math.PI, longitude: 0.025 } }));
    assert.equal(result.status, metres <= 500 ? "near" : "far");
    if (metres <= 500) assert.ok(Math.abs(result.matches[0].distanceToBoundaryM - metres) < 1e-6);
  }
});
test("all overlapping matches are retained, inside first and near sorted by raw distance", () => {
  const zones = h.zones([h.square(0.026), h.square(), h.square(0.027)]);
  const result = evaluate(h.sample(), zones);
  assert.equal(result.status, "inside"); assert.equal(result.matches.length, 3);
  assert.equal(result.matches[0].zoneId, "test:1");
  assert.ok(result.matches[1].distanceToBoundaryM < result.matches[2].distanceToBoundaryM);
});
test("far is only returned for complete coverage; partial/unavailable remain unknown", () => {
  const sample = h.sample({ location: { latitude: 10, longitude: 10 } });
  assert.equal(evaluate(sample).status, "far");
  const partial = h.zones([h.square()], { status: "partial", unassessableZones: [{ zoneId: "HIST-missing", reason: "missing_geometry" }] });
  assert.equal(evaluate(sample, partial).reason, "incomplete_zone_data");
  assert.equal(evaluate(sample, h.zones([], { status: "unavailable" })).reason, "zone_data_unavailable");
  assert.equal(evaluate(sample, h.zones([])).reason, "no_zones");
});
test("a known match still warns under partial coverage, with incomplete-data metadata", () => {
  const zones = h.zones([h.square()], { status: "partial", unassessableZones: [{ zoneId: "bad", reason: "invalid_geometry" }] });
  const result = evaluate(h.sample(), zones);
  assert.equal(result.status, "inside"); assert.equal(result.coverage.status, "partial"); assert.equal(result.coverage.unassessableZones.length, 1);
});
test("region revision changes apply to the same fresh position; source objects are not mutated", () => {
  const oldZones = h.zones(), nextZones = h.zones([h.square(2, 2)]); nextZones.zonesRevision = "NEW";
  const before = JSON.stringify(oldZones), sample = h.sample();
  assert.equal(evaluate(sample, oldZones).status, "inside");
  const updated = evaluate(sample, nextZones); assert.equal(updated.status, "far"); assert.equal(updated.zonesRevision, "NEW");
  assert.equal(JSON.stringify(oldZones), before);
});
test("a geometry runtime failure degrades coverage, never false far", () => {
  const zones = h.zones([{ type: "Polygon", coordinates: [] }]);
  const result = evaluate(h.sample(), zones);
  assert.equal(result.status, "unknown"); assert.notEqual(result.coverage.status, "complete");
  assert.equal(zones.coverage.status, "complete");
});
