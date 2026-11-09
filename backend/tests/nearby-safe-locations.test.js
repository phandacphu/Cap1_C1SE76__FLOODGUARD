const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/safe-location-test-app");
const {
  calculateDistanceKm,
  normalizeSafeLocationQuery,
} = require("../src/services/safe-location-contract");
const {
  getNearbySafeLocations,
} = require("../src/services/safe-location.service");
beforeEach(h.reset);

test("Haversine handles zero, known distance, date line, poles and antipodes", () => {
  const zero = { latitude: 0, longitude: 0 };
  assert.equal(calculateDistanceKm(zero, zero), 0);
  assert.ok(
    Math.abs(
      calculateDistanceKm(zero, { latitude: 0, longitude: 1 }) - 111.195,
    ) < 0.01,
  );
  assert.ok(
    calculateDistanceKm(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    ) < 23,
  );
  assert.ok(
    calculateDistanceKm(
      { latitude: 90, longitude: 0 },
      { latitude: 90, longitude: 180 },
    ) < 0.001,
  );
  assert.ok(
    Number.isFinite(calculateDistanceKm(zero, { latitude: 0, longitude: 180 })),
  );
});

test("origin must be a complete numeric pair; radius/type/search/page are not supported", () => {
  assert.equal(normalizeSafeLocationQuery({}), null);
  assert.deepEqual(
    normalizeSafeLocationQuery({ latitude: "0", longitude: "0" }),
    { latitude: 0, longitude: 0 },
  );
  for (const query of [
    { latitude: "0" },
    { longitude: "0" },
    { latitude: "", longitude: "0" },
    { latitude: ["0", "1"], longitude: "0" },
    { latitude: "0x10", longitude: "0" },
    { latitude: "91", longitude: "0" },
    { latitude: "0", longitude: "Infinity" },
    ...["radiusKm", "type", "search", "page", "limit", "status"].map((key) => ({
      latitude: "0",
      longitude: "0",
      [key]: "1",
    })),
  ]) {
    assert.throws(() => normalizeSafeLocationQuery(query), {
      code: "INVALID_SAFE_LOCATION_QUERY",
    });
  }
});

test("all distances are unrounded, sorted nearest first with stable ID ties and no radius cap", async () => {
  for (const [id, longitude] of [
    ["far", 10],
    ["near-b", 0.001001],
    ["near-a", 0.001],
    ["tie-b", 0.1],
    ["tie-a", 0.1],
  ]) {
    h.seed(id, { location: { latitude: 0, longitude } });
  }
  h.seed("deleted", {
    location: { latitude: 0, longitude: 0 },
    isDeleted: true,
  });
  const points = await getNearbySafeLocations({ latitude: 0, longitude: 0 });
  assert.deepEqual(
    points.map((p) => p.id),
    ["near-a", "near-b", "tie-a", "tie-b", "far"],
  );
  assert.ok(points[4].distanceKm > 1000);
  assert.ok(points[0].distanceKm < points[1].distanceKm);
  assert.equal(
    points[0].distanceKm.toFixed(2),
    points[1].distanceKm.toFixed(2),
  );
});

test("HTTP nearby alias returns all points, requires GPS and rejects old radius arguments", async () => {
  h.seed("far", { location: { latitude: 0, longitude: 5 } });
  await h.withApi(async (api) => {
    const result = await api(
      "/api/safe-locations/nearby?latitude=0&longitude=0",
      { actor: null },
    );
    assert.equal(result.status, 200);
    assert.ok(result.body.data.safeLocations[0].distanceKm > 500);
    for (const path of [
      "/api/safe-locations/nearby",
      "/api/safe-locations/nearby?latitude=0&longitude=0&radiusKm=10",
    ]) {
      assert.equal((await api(path, { actor: null })).status, 400);
    }
  });
});
